import { createHash } from 'crypto';

import { canonicalNodeOrigin } from './ergo-node-endpoint-alignment.js';
import {
  createAggregateSettlementErgoObservationRecord,
  DEFAULT_AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY,
  normalizeAggregateSettlementErgoFinalityPolicy,
  normalizeAggregateSettlementErgoObservationRecord,
  type AggregateSettlementErgoFinalityPolicyV1,
  type AggregateSettlementErgoObservationRecord,
} from './aggregate-settlement-ergo-finality-policy.js';

export interface AggregateSettlementErgoObservationClient {
  getCurrentHeight(): Promise<number>;
  getBlockHeaderHash(height: number): Promise<string>;
  getTransaction(transactionId: string): Promise<unknown>;
  hasUnconfirmedTransaction(transactionId: string): Promise<boolean>;
}

const STABLE_AGGREGATE_SETTLEMENT_ERGO_OBSERVATIONS = new WeakSet<object>();
const STABLE_AGGREGATE_SETTLEMENT_ERGO_TRANSACTION_DIGESTS = new WeakMap<object, string | null>();
const MATCHING_AGGREGATE_SETTLEMENT_ERGO_CONSENSUS = new WeakSet<object>();
const AGGREGATE_SETTLEMENT_ERGO_OBSERVATION_SOURCES = new WeakSet<object>();
const SOURCE_IDS_BY_CLIENT = new WeakMap<object, string>();
const SOURCE_ORIGINS_BY_SOURCE = new WeakMap<object, string>();
const SOURCE_NODE_IDENTITIES_BY_SOURCE = new WeakMap<object, string>();
const SOURCE_ADMINISTRATION_IDENTITIES_BY_SOURCE = new WeakMap<object, string>();
const SOURCE_PAIRS_BY_SOURCE = new WeakMap<object, object>();

export const AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE =
  'e2s.aggregate-settlement-ergo-source-authority.v2' as const;

export interface AggregateSettlementErgoObservationSource {
  ergo: AggregateSettlementErgoObservationClient;
  sourceIdHex: string;
  nodeIdentityDigestHex: string;
  administrationIdentityDigestHex: string;
}

export interface AggregateSettlementErgoObservationSourcePair {
  primarySource: AggregateSettlementErgoObservationSource;
  witnessSource: AggregateSettlementErgoObservationSource;
}

export interface StableAggregateSettlementErgoObservation {
  record: AggregateSettlementErgoObservationRecord;
  transaction: Readonly<Record<string, unknown>> | null;
}

export interface MatchingAggregateSettlementErgoObservationConsensus {
  sourceAuthorityProfile: typeof AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE;
  record: AggregateSettlementErgoObservationRecord;
  sourceIdsHex: readonly string[];
  sourceCount: number;
  consensusDigestHex: string;
}

export interface MatchingAggregateSettlementErgoObservationResult {
  primaryObservation: StableAggregateSettlementErgoObservation;
  witnessObservation: StableAggregateSettlementErgoObservation;
  consensus: MatchingAggregateSettlementErgoObservationConsensus;
}

export function createMatchingAggregateSettlementErgoObservationSources(input: {
  primaryErgo: AggregateSettlementErgoObservationClient;
  primaryNodeUrl: string;
  primaryNodeIdentityDigestHex: string;
  primaryAdministrationIdentityDigestHex: string;
  witnessErgo: AggregateSettlementErgoObservationClient;
  witnessNodeUrl: string;
  witnessNodeIdentityDigestHex: string;
  witnessAdministrationIdentityDigestHex: string;
}): AggregateSettlementErgoObservationSourcePair {
  if (input.primaryErgo === input.witnessErgo) {
    throw new Error('aggregate settlement primary and witness require distinct Ergo client instances');
  }
  const primaryOrigin = canonicalNodeOrigin(
    input.primaryNodeUrl,
    'aggregate settlement primary Ergo node URL',
  );
  const witnessOrigin = canonicalNodeOrigin(
    input.witnessNodeUrl,
    'aggregate settlement witness Ergo node URL',
  );
  if (primaryOrigin === witnessOrigin) {
    throw new Error('aggregate settlement primary and witness require distinct Ergo node origins');
  }
  const primaryNodeIdentityDigestHex = fixedHex(
    input.primaryNodeIdentityDigestHex,
    'aggregate settlement primary pinned node identity digest',
  );
  const witnessNodeIdentityDigestHex = fixedHex(
    input.witnessNodeIdentityDigestHex,
    'aggregate settlement witness pinned node identity digest',
  );
  if (primaryNodeIdentityDigestHex === witnessNodeIdentityDigestHex) {
    throw new Error(
      'aggregate settlement primary and witness require distinct pinned node identities',
    );
  }
  const primaryAdministrationIdentityDigestHex = fixedHex(
    input.primaryAdministrationIdentityDigestHex,
    'aggregate settlement primary administration identity digest',
  );
  const witnessAdministrationIdentityDigestHex = fixedHex(
    input.witnessAdministrationIdentityDigestHex,
    'aggregate settlement witness administration identity digest',
  );
  if (primaryAdministrationIdentityDigestHex === witnessAdministrationIdentityDigestHex) {
    throw new Error(
      'aggregate settlement primary and witness require distinct administration identities',
    );
  }
  const primarySource = createAggregateSettlementErgoObservationSource({
    ergo: input.primaryErgo,
    nodeOrigin: primaryOrigin,
    nodeIdentityDigestHex: primaryNodeIdentityDigestHex,
    administrationIdentityDigestHex: primaryAdministrationIdentityDigestHex,
  });
  const witnessSource = createAggregateSettlementErgoObservationSource({
    ergo: input.witnessErgo,
    nodeOrigin: witnessOrigin,
    nodeIdentityDigestHex: witnessNodeIdentityDigestHex,
    administrationIdentityDigestHex: witnessAdministrationIdentityDigestHex,
  });
  const pair = Object.freeze({ primarySource, witnessSource });
  SOURCE_PAIRS_BY_SOURCE.set(primarySource, pair);
  SOURCE_PAIRS_BY_SOURCE.set(witnessSource, pair);
  return pair;
}

function createAggregateSettlementErgoObservationSource(input: {
  ergo: AggregateSettlementErgoObservationClient;
  nodeOrigin: string;
  nodeIdentityDigestHex: string;
  administrationIdentityDigestHex: string;
}): AggregateSettlementErgoObservationSource {
  if (typeof input.ergo !== 'object' || input.ergo === null) {
    throw new Error('aggregate settlement Ergo observation source requires a client object');
  }
  const sourceIdHex = deriveObservationSourceId({
    nodeOrigin: input.nodeOrigin,
    nodeIdentityDigestHex: input.nodeIdentityDigestHex,
    administrationIdentityDigestHex: input.administrationIdentityDigestHex,
  });
  const existingSourceId = SOURCE_IDS_BY_CLIENT.get(input.ergo);
  if (existingSourceId !== undefined && existingSourceId !== sourceIdHex) {
    throw new Error('aggregate settlement Ergo observation client cannot be rebound to another source ID');
  }
  SOURCE_IDS_BY_CLIENT.set(input.ergo, sourceIdHex);
  const source = Object.freeze({
    ergo: input.ergo,
    sourceIdHex,
    nodeIdentityDigestHex: input.nodeIdentityDigestHex,
    administrationIdentityDigestHex: input.administrationIdentityDigestHex,
  });
  AGGREGATE_SETTLEMENT_ERGO_OBSERVATION_SOURCES.add(source);
  SOURCE_ORIGINS_BY_SOURCE.set(source, input.nodeOrigin);
  SOURCE_NODE_IDENTITIES_BY_SOURCE.set(source, input.nodeIdentityDigestHex);
  SOURCE_ADMINISTRATION_IDENTITIES_BY_SOURCE.set(
    source,
    input.administrationIdentityDigestHex,
  );
  return source;
}

export async function observeStableAggregateSettlementErgoTransaction(input: {
  ergo: AggregateSettlementErgoObservationClient;
  transactionId: string;
  policy?: AggregateSettlementErgoFinalityPolicyV1;
}): Promise<StableAggregateSettlementErgoObservation> {
  const transactionIdHex = fixedHex(input.transactionId, 'settlement transaction ID');
  const policy = normalizeAggregateSettlementErgoFinalityPolicy(
    input.policy ?? DEFAULT_AGGREGATE_SETTLEMENT_ERGO_FINALITY_POLICY,
  );
  const tipBefore = await readTip(input.ergo, 'initial');
  const transactionBefore = await input.ergo.getTransaction(transactionIdHex);

  let record: AggregateSettlementErgoObservationRecord;
  let transaction: Readonly<Record<string, unknown>> | null = null;
  if (transactionBefore) {
    const normalizedBefore = await normalizeTransaction(transactionBefore, transactionIdHex);
    const inclusionHeaderIdHex = fixedHex(
      await input.ergo.getBlockHeaderHash(normalizedBefore.inclusionHeight),
      'canonical settlement inclusion header ID',
    );
    if (inclusionHeaderIdHex !== normalizedBefore.inclusionHeaderIdHex) {
      throw new Error('settlement transaction inclusion block is not canonical');
    }
    const transactionAfter = await input.ergo.getTransaction(transactionIdHex);
    if (!transactionAfter) {
      throw new Error('settlement transaction disappeared while its Ergo view was observed');
    }
    const normalizedAfter = await normalizeTransaction(transactionAfter, transactionIdHex);
    if (
      normalizedAfter.transactionDigestHex !== normalizedBefore.transactionDigestHex
      || normalizedAfter.inclusionHeight !== normalizedBefore.inclusionHeight
      || normalizedAfter.inclusionHeaderIdHex !== normalizedBefore.inclusionHeaderIdHex
    ) {
      throw new Error('settlement transaction changed while its Ergo view was observed');
    }
    const tipAfter = await readTip(input.ergo, 'rechecked');
    assertSameTip(tipBefore, tipAfter);
    if (tipAfter.height < normalizedAfter.inclusionHeight) {
      throw new Error('observed Ergo tip precedes settlement transaction inclusion');
    }
    const confirmations = tipAfter.height - normalizedAfter.inclusionHeight + 1;
    const status = confirmations >= policy.requiredConfirmations
      ? 'confirmed_final'
      : 'confirmed_pre_finality';
    record = createAggregateSettlementErgoObservationRecord({
      policyVersion: policy.version,
      requiredConfirmations: policy.requiredConfirmations,
      status,
      transactionIdHex,
      transactionDigestHex: normalizedAfter.transactionDigestHex,
      inclusionHeight: normalizedAfter.inclusionHeight,
      inclusionHeaderIdHex: normalizedAfter.inclusionHeaderIdHex,
      observedTipHeight: tipAfter.height,
      observedTipHeaderIdHex: tipAfter.headerIdHex,
      confirmations,
    });
    transaction = normalizedAfter.transaction;
  } else {
    const mempoolBefore = await input.ergo.hasUnconfirmedTransaction(transactionIdHex);
    const transactionAfter = await input.ergo.getTransaction(transactionIdHex);
    if (transactionAfter) {
      throw new Error('settlement transaction confirmed while absence was observed');
    }
    const mempoolAfter = await input.ergo.hasUnconfirmedTransaction(transactionIdHex);
    if (mempoolAfter !== mempoolBefore) {
      throw new Error('settlement transaction mempool presence changed while observed');
    }
    const tipAfter = await readTip(input.ergo, 'rechecked');
    assertSameTip(tipBefore, tipAfter);
    record = createAggregateSettlementErgoObservationRecord({
      policyVersion: policy.version,
      requiredConfirmations: policy.requiredConfirmations,
      status: mempoolAfter ? 'mempool' : 'absent',
      transactionIdHex,
      transactionDigestHex: null,
      inclusionHeight: null,
      inclusionHeaderIdHex: null,
      observedTipHeight: tipAfter.height,
      observedTipHeaderIdHex: tipAfter.headerIdHex,
      confirmations: 0,
    });
  }

  const observation = Object.freeze({ record, transaction });
  STABLE_AGGREGATE_SETTLEMENT_ERGO_OBSERVATIONS.add(observation);
  STABLE_AGGREGATE_SETTLEMENT_ERGO_TRANSACTION_DIGESTS.set(
    observation,
    record.transactionDigestHex,
  );
  return observation;
}

export function assertStableAggregateSettlementErgoObservationProvenance(
  observation: unknown,
): asserts observation is StableAggregateSettlementErgoObservation {
  if (
    typeof observation !== 'object'
    || observation === null
    || !STABLE_AGGREGATE_SETTLEMENT_ERGO_OBSERVATIONS.has(observation)
  ) {
    throw new Error('stable aggregate settlement Ergo observation provenance is missing');
  }
  const stable = observation as StableAggregateSettlementErgoObservation;
  const record = normalizeAggregateSettlementErgoObservationRecord(stable.record);
  const confirmed = record.status === 'confirmed_pre_finality' || record.status === 'confirmed_final';
  if (!confirmed && stable.transaction !== null) {
    throw new Error('non-confirmed Ergo observation cannot carry a transaction');
  }
  if (confirmed) {
    if (!stable.transaction) throw new Error('confirmed Ergo observation is missing its transaction');
    if (
      STABLE_AGGREGATE_SETTLEMENT_ERGO_TRANSACTION_DIGESTS.get(stable)
      !== record.transactionDigestHex
    ) {
      throw new Error('stable aggregate settlement transaction changed after observation');
    }
  }
}

export async function observeMatchingAggregateSettlementErgoTransaction(input: {
  primary: AggregateSettlementErgoObservationSource;
  witness: AggregateSettlementErgoObservationSource;
  transactionId: string;
  policy?: AggregateSettlementErgoFinalityPolicyV1;
}): Promise<MatchingAggregateSettlementErgoObservationResult> {
  assertAggregateSettlementErgoObservationSourceProvenance(input.primary);
  assertAggregateSettlementErgoObservationSourceProvenance(input.witness);
  if (input.primary === input.witness || input.primary.ergo === input.witness.ergo) {
    throw new Error('aggregate settlement destructive recovery requires distinct Ergo clients');
  }
  if (
    SOURCE_PAIRS_BY_SOURCE.get(input.primary) === undefined
    || SOURCE_PAIRS_BY_SOURCE.get(input.primary) !== SOURCE_PAIRS_BY_SOURCE.get(input.witness)
  ) {
    throw new Error('aggregate settlement destructive recovery requires one bound source pair');
  }
  if (
    SOURCE_ORIGINS_BY_SOURCE.get(input.primary)
    === SOURCE_ORIGINS_BY_SOURCE.get(input.witness)
  ) {
    throw new Error('aggregate settlement destructive recovery requires distinct Ergo node origins');
  }
  const [primaryObservation, witnessObservation] = await Promise.all([
    observeStableAggregateSettlementErgoTransaction({
      ergo: input.primary.ergo,
      transactionId: input.transactionId,
      policy: input.policy,
    }),
    observeStableAggregateSettlementErgoTransaction({
      ergo: input.witness.ergo,
      transactionId: input.transactionId,
      policy: input.policy,
    }),
  ]);
  const normalized = [
    { sourceIdHex: input.primary.sourceIdHex, observation: primaryObservation },
    { sourceIdHex: input.witness.sourceIdHex, observation: witnessObservation },
  ];
  const sourceIdsHex = normalized.map(item => item.sourceIdHex).sort();
  if (new Set(sourceIdsHex).size !== sourceIdsHex.length) {
    throw new Error('aggregate settlement Ergo observation sources must be distinct');
  }
  const observationDigestHex = normalized[0].observation.record.observationDigestHex;
  if (
    normalized.some(
      item => item.observation.record.observationDigestHex !== observationDigestHex,
    )
  ) {
    throw new Error('aggregate settlement Ergo sources disagree on the stable transaction view');
  }
  const binding = {
    sourceAuthorityProfile: AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE,
    observationDigestHex,
    sourceIdsHex,
  };
  const consensus = Object.freeze({
    sourceAuthorityProfile: AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE,
    record: normalized[0].observation.record,
    sourceIdsHex: Object.freeze(sourceIdsHex),
    sourceCount: sourceIdsHex.length,
    consensusDigestHex: sha256Canonical(binding),
  });
  MATCHING_AGGREGATE_SETTLEMENT_ERGO_CONSENSUS.add(consensus);
  return Object.freeze({ primaryObservation, witnessObservation, consensus });
}

export function assertMatchingAggregateSettlementErgoObservationConsensusProvenance(
  consensus: unknown,
): asserts consensus is MatchingAggregateSettlementErgoObservationConsensus {
  if (
    typeof consensus !== 'object'
    || consensus === null
    || !MATCHING_AGGREGATE_SETTLEMENT_ERGO_CONSENSUS.has(consensus)
  ) {
    throw new Error('matching aggregate settlement Ergo observation consensus provenance is missing');
  }
  const matching = consensus as MatchingAggregateSettlementErgoObservationConsensus;
  if (matching.sourceAuthorityProfile !== AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE) {
    throw new Error('matching aggregate settlement Ergo observation source authority is unsupported');
  }
  if (matching.sourceCount < 2 || matching.sourceIdsHex.length !== matching.sourceCount) {
    throw new Error('matching aggregate settlement Ergo observation consensus is incomplete');
  }
  const sourceIdsHex = matching.sourceIdsHex.map(
    sourceId => fixedHex(sourceId, 'Ergo observation source ID'),
  ).sort();
  if (new Set(sourceIdsHex).size !== sourceIdsHex.length) {
    throw new Error('matching aggregate settlement Ergo observation sources are not distinct');
  }
  const record = normalizeAggregateSettlementErgoObservationRecord(matching.record);
  const expectedDigest = sha256Canonical({
    sourceAuthorityProfile: matching.sourceAuthorityProfile,
    observationDigestHex: record.observationDigestHex,
    sourceIdsHex,
  });
  if (fixedHex(matching.consensusDigestHex, 'Ergo observation consensus digest') !== expectedDigest) {
    throw new Error('matching aggregate settlement Ergo observation consensus digest is invalid');
  }
}

function assertAggregateSettlementErgoObservationSourceProvenance(
  source: unknown,
): asserts source is AggregateSettlementErgoObservationSource {
  if (
    typeof source !== 'object'
    || source === null
    || !AGGREGATE_SETTLEMENT_ERGO_OBSERVATION_SOURCES.has(source)
  ) {
    throw new Error('aggregate settlement Ergo observation source provenance is missing');
  }
  const branded = source as AggregateSettlementErgoObservationSource;
  const expectedSourceId = SOURCE_IDS_BY_CLIENT.get(branded.ergo);
  if (expectedSourceId !== branded.sourceIdHex) {
    throw new Error('aggregate settlement Ergo observation source binding changed');
  }
  const sourceOrigin = SOURCE_ORIGINS_BY_SOURCE.get(branded);
  const nodeIdentityDigestHex = SOURCE_NODE_IDENTITIES_BY_SOURCE.get(branded);
  const administrationIdentityDigestHex =
    SOURCE_ADMINISTRATION_IDENTITIES_BY_SOURCE.get(branded);
  if (
    !sourceOrigin
    || !nodeIdentityDigestHex
    || !administrationIdentityDigestHex
    || branded.nodeIdentityDigestHex !== nodeIdentityDigestHex
    || branded.administrationIdentityDigestHex !== administrationIdentityDigestHex
    || deriveObservationSourceId({
      nodeOrigin: sourceOrigin,
      nodeIdentityDigestHex,
      administrationIdentityDigestHex,
    }) !== branded.sourceIdHex
  ) {
    throw new Error('aggregate settlement Ergo observation source origin binding changed');
  }
}

function deriveObservationSourceId(input: {
  nodeOrigin: string;
  nodeIdentityDigestHex: string;
  administrationIdentityDigestHex: string;
}): string {
  return createHash('sha256')
    .update('ergo.aggregate-settlement-observation-source.v2\0', 'ascii')
    .update(input.nodeOrigin, 'utf8')
    .update('\0', 'ascii')
    .update(input.nodeIdentityDigestHex, 'ascii')
    .update('\0', 'ascii')
    .update(input.administrationIdentityDigestHex, 'ascii')
    .digest('hex');
}

let ergoWasmPromise: Promise<any> | undefined;

async function getErgoWasm(): Promise<any> {
  if (!ergoWasmPromise) {
    ergoWasmPromise = import('ergo-lib-wasm-nodejs').then(module => module.default ?? module);
  }
  return ergoWasmPromise;
}

async function normalizeTransaction(
  value: unknown,
  expectedTransactionIdHex: string,
): Promise<{
  transaction: Readonly<Record<string, unknown>>;
  transactionDigestHex: string;
  inclusionHeight: number;
  inclusionHeaderIdHex: string;
}> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('settlement transaction response must be an object');
  }
  const raw = value as Record<string, unknown>;
  const claimedTransactionIdHex = fixedHex(
    String(raw.id ?? raw.txId ?? ''),
    'observed settlement transaction ID',
  );
  if (claimedTransactionIdHex !== expectedTransactionIdHex) {
    throw new Error('observed settlement transaction ID does not match the journal');
  }
  const inclusionHeight = Number(raw.inclusionHeight ?? raw.blockHeight);
  if (!Number.isSafeInteger(inclusionHeight) || inclusionHeight < 0) {
    throw new Error('settlement transaction is missing a valid inclusion height');
  }
  const inclusionHeaderIdHex = fixedHex(
    String(raw.headerId ?? raw.blockId ?? raw.inclusionBlockId ?? ''),
    'settlement transaction inclusion header ID',
  );

  const wasm = await getErgoWasm();
  let parsed: any;
  try {
    parsed = wasm.Transaction.from_json(JSON.stringify(raw));
  } catch (error: any) {
    throw new Error(
      `settlement transaction is not canonical Ergo transaction JSON: ${error?.message ?? String(error)}`,
    );
  }
  let parsedId: any;
  try {
    parsedId = parsed.id();
    const computedTransactionIdHex = fixedHex(
      parsedId.to_str(),
      'computed settlement transaction ID',
    );
    if (computedTransactionIdHex !== expectedTransactionIdHex) {
      throw new Error('settlement transaction canonical bytes do not match the journaled ID');
    }
    const transaction = deepFreeze(parsed.to_js_eip12()) as Readonly<Record<string, unknown>>;
    const transactionDigestHex = createHash('sha256')
      .update(Buffer.from(parsed.sigma_serialize_bytes()))
      .digest('hex');
    return {
      transaction,
      transactionDigestHex,
      inclusionHeight,
      inclusionHeaderIdHex,
    };
  } finally {
    parsedId?.free?.();
    parsed?.free?.();
  }
}

async function readTip(
  ergo: AggregateSettlementErgoObservationClient,
  label: string,
): Promise<{ height: number; headerIdHex: string }> {
  const height = await ergo.getCurrentHeight();
  if (!Number.isSafeInteger(height) || height < 0) {
    throw new Error(`${label} Ergo tip height must be a nonnegative safe integer`);
  }
  return {
    height,
    headerIdHex: fixedHex(
      await ergo.getBlockHeaderHash(height),
      `${label} Ergo tip header ID`,
    ),
  };
}

function assertSameTip(
  before: { height: number; headerIdHex: string },
  after: { height: number; headerIdHex: string },
): void {
  if (before.height !== after.height || before.headerIdHex !== after.headerIdHex) {
    throw new Error('Ergo canonical tip changed while settlement transaction state was observed');
  }
}

function fixedHex(value: string, label: string): string {
  const clean = value?.startsWith('0x') ? value.slice(2) : value;
  if (!clean || !/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`${label} must be 32 bytes of hex`);
  }
  return clean.toLowerCase();
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('settlement transaction cannot contain non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`settlement transaction cannot serialize ${typeof value}`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
