/**
 * Bind one reconstructed authenticated-V2 payout to canonical signed
 * transaction bytes and the full transaction commitment of its claimed Ergo
 * block. This remains read-only evidence: it does not establish Ergo PoW,
 * canonical-chain membership, settlement authority, or any broadcast right.
 */

import {
  verifyErgoBlockTransactionCommitment,
} from './adapters/ergo-block-transaction-commitment.js';
import {
  assertAuthenticatedV2DupReconstructionProvenance,
  type AuthenticatedV2DupReconstruction,
  type ReconstructedAuthenticatedV2DupTransition,
} from './authenticated-v2-dup-reconstruction.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';

export const AUTHENTICATED_V2_HISTORICAL_PAYOUT_OBSERVATION_SCHEMA =
  'e2s.authenticated-v2-historical-payout-observation.v1' as const;
export const AUTHENTICATED_V2_HISTORICAL_PAYOUT_AGREEMENT_SCHEMA =
  'e2s.authenticated-v2-historical-payout-agreement.v1' as const;

const OBSERVATION_DIGEST_DOMAIN =
  'E2S_AUTHENTICATED_V2_HISTORICAL_PAYOUT_OBSERVATION_V1';
const AGREEMENT_DIGEST_DOMAIN =
  'E2S_AUTHENTICATED_V2_HISTORICAL_PAYOUT_AGREEMENT_V1';
const OBSERVATIONS = new WeakSet<object>();
const AGREEMENTS = new WeakMap<object, HistoricalPayoutProvenance>();
let ergoWasmPromise: Promise<any> | undefined;

export interface AuthenticatedV2HistoricalPayoutChainSource {
  beginAuthenticatedTrackerReconstruction?(): void;
  endAuthenticatedTrackerReconstruction?(): void;
  getTransaction(transactionIdHex: string): Promise<unknown | null>;
  getBlockByHeaderId(headerIdHex: string): Promise<unknown | null>;
}

export interface AuthenticatedV2HistoricalPayoutView {
  readonly authenticatedV2ReconstructionDigestHex: string;
  readonly legacyHistoryKeyHex: string;
  readonly historyIndex: number;
  readonly ergoSettlementTransactionIdHex: string;
  readonly ergoSettlementBlockIdHex: string;
  readonly ergoSettlementInclusionHeight: number;
  readonly payoutOutputIndex: 1;
  readonly payoutBoxIdHex: string;
  readonly payoutValueNanoErg: string;
  readonly payoutErgoTreeHex: string;
  readonly transactionSigmaDigestHex: string;
  readonly blockTransactionsRootHex: string;
  readonly transactionIndexInBlock: number;
  readonly transactionCountInBlock: number;
  readonly viewDigestHex: string;
}

export interface AuthenticatedV2HistoricalPayoutObservation {
  readonly schema:
    typeof AUTHENTICATED_V2_HISTORICAL_PAYOUT_OBSERVATION_SCHEMA;
  readonly status: 'non_authorizing_read_only_observation';
  readonly sourceIdHex: string;
  readonly view: Readonly<AuthenticatedV2HistoricalPayoutView>;
  readonly observationDigestHex: string;
  readonly boundary: Readonly<{
    canonicalSignedTransactionIdVerified: true;
    fullBlockTransactionCommitmentVerified: true;
    canonicalHeaderBytesVerified: true;
    ergoPowAuthenticated: false;
    canonicalChainMembershipEstablished: false;
    payoutAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    trustlessStatusEstablished: false;
    productionReadinessEstablished: false;
  }>;
}

export interface AuthenticatedV2HistoricalPayoutAgreement {
  readonly schema:
    typeof AUTHENTICATED_V2_HISTORICAL_PAYOUT_AGREEMENT_SCHEMA;
  readonly status: 'non_authorizing_distinct_source_agreement';
  readonly view: Readonly<AuthenticatedV2HistoricalPayoutView>;
  readonly sources: Readonly<{
    readonly sourceIdsHex: readonly [string, string];
    readonly observationDigestsHex: readonly [string, string];
    readonly agreementDigestHex: string;
  }>;
  readonly boundary: Readonly<{
    distinctSourceInstancesVerified: true;
    exactHistoricalPayoutAgreementVerified: true;
    operationalIndependenceEstablished: false;
    ergoPowAuthenticated: false;
    canonicalChainMembershipEstablished: false;
    payoutAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    trustlessStatusEstablished: false;
    productionReadinessEstablished: false;
  }>;
}

export interface ObserveAuthenticatedV2HistoricalPayoutInput {
  readonly source: AuthenticatedV2HistoricalPayoutChainSource;
  readonly sourceIdHex: string;
  readonly authenticatedV2Reconstruction: AuthenticatedV2DupReconstruction;
  readonly legacyHistoryKeyHex: string;
}

export interface CollectAuthenticatedV2HistoricalPayoutFromDistinctSourcesInput {
  readonly primarySource: AuthenticatedV2HistoricalPayoutChainSource;
  readonly primarySourceIdHex: string;
  readonly witnessSource: AuthenticatedV2HistoricalPayoutChainSource;
  readonly witnessSourceIdHex: string;
  readonly authenticatedV2Reconstruction: AuthenticatedV2DupReconstruction;
  readonly legacyHistoryKeyHex: string;
}

interface HistoricalPayoutSelection {
  readonly reconstruction: AuthenticatedV2DupReconstruction;
  readonly legacyHistoryKeyHex: string;
  readonly historyIndex: number;
  readonly transition: ReconstructedAuthenticatedV2DupTransition;
}

interface HistoricalPayoutProvenance {
  readonly reconstruction: AuthenticatedV2DupReconstruction;
  readonly legacyHistoryKeyHex: string;
}

export async function observeAuthenticatedV2HistoricalPayout(
  input: ObserveAuthenticatedV2HistoricalPayoutInput,
): Promise<Readonly<AuthenticatedV2HistoricalPayoutObservation>> {
  assertExactObjectKeys(
    input,
    [
      'source',
      'sourceIdHex',
      'authenticatedV2Reconstruction',
      'legacyHistoryKeyHex',
    ],
    'authenticated V2 historical payout observation input',
  );
  const sourceIdHex = fixedHex(
    input.sourceIdHex,
    32,
    'authenticated V2 historical payout source ID',
  );
  const selection = selectHistoricalPayout(
    input.authenticatedV2Reconstruction,
    input.legacyHistoryKeyHex,
  );
  const begin = input.source.beginAuthenticatedTrackerReconstruction;
  const end = input.source.endAuthenticatedTrackerReconstruction;
  if (Boolean(begin) !== Boolean(end)) {
    throw new Error(
      'authenticated V2 historical payout source budget hooks must be paired',
    );
  }
  let started = false;
  try {
    if (begin) {
      begin.call(input.source);
      started = true;
    }
    const transactionIdHex = fixedHex(
      selection.transition.spendingTransactionIdHex,
      32,
      'authenticated V2 historical settlement transaction ID',
    );
    const blockIdHex = fixedHex(
      selection.transition.spendingBlockIdHex,
      32,
      'authenticated V2 historical settlement block ID',
    );
    const inclusionHeight = nonnegativeSafeInteger(
      selection.transition.spendingInclusionHeight,
      'authenticated V2 historical settlement inclusion height',
    );
    const [transaction, block] = await Promise.all([
      input.source.getTransaction(transactionIdHex),
      input.source.getBlockByHeaderId(blockIdHex),
    ]);
    if (transaction === null) {
      throw new Error(
        'authenticated V2 historical settlement transaction is unavailable',
      );
    }
    if (block === null) {
      throw new Error(
        'authenticated V2 historical settlement block is unavailable',
      );
    }
    const commitment = await verifyErgoBlockTransactionCommitment({
      block,
      expectedHeaderIdHex: blockIdHex,
      expectedHeight: inclusionHeight,
      expectedTransactionIdHex: transactionIdHex,
      expectedTransaction: transaction,
    });
    const payout = await canonicalPayoutOutput(
      transaction,
      transactionIdHex,
    );
    if (
      payout.boxIdHex
        !== fixedHex(
          selection.transition.payoutBoxIdHex,
          32,
          'authenticated V2 reconstructed payout box ID',
        )
      || payout.valueNanoErg
        !== positiveLong(
          selection.transition.payoutValueNanoErg,
          'authenticated V2 reconstructed payout value',
        )
    ) {
      throw new Error(
        'canonical historical payout output does not match the authenticated V2 reconstruction',
      );
    }
    const viewWithoutDigest = {
      authenticatedV2ReconstructionDigestHex: fixedHex(
        selection.reconstruction.observationDigestHex,
        32,
        'authenticated V2 reconstruction digest',
      ),
      legacyHistoryKeyHex: selection.legacyHistoryKeyHex,
      historyIndex: selection.historyIndex,
      ergoSettlementTransactionIdHex: transactionIdHex,
      ergoSettlementBlockIdHex: blockIdHex,
      ergoSettlementInclusionHeight: inclusionHeight,
      payoutOutputIndex: 1 as const,
      payoutBoxIdHex: payout.boxIdHex,
      payoutValueNanoErg: payout.valueNanoErg,
      payoutErgoTreeHex: payout.ergoTreeHex,
      transactionSigmaDigestHex: fixedHex(
        commitment.transactionSigmaDigestHex,
        32,
        'historical settlement transaction sigma digest',
      ),
      blockTransactionsRootHex: fixedHex(
        commitment.transactionsRootHex,
        32,
        'historical settlement block transactions root',
      ),
      transactionIndexInBlock: nonnegativeSafeInteger(
        commitment.transactionIndex,
        'historical settlement transaction index',
      ),
      transactionCountInBlock: positiveSafeInteger(
        commitment.transactionCount,
        'historical settlement block transaction count',
      ),
    };
    const view = deepFreeze({
      ...viewWithoutDigest,
      viewDigestHex: sha256CanonicalJson(
        viewWithoutDigest,
        OBSERVATION_DIGEST_DOMAIN,
      ),
    });
    const binding = {
      schema: AUTHENTICATED_V2_HISTORICAL_PAYOUT_OBSERVATION_SCHEMA,
      status: 'non_authorizing_read_only_observation' as const,
      sourceIdHex,
      view,
      boundary: deepFreeze({
        canonicalSignedTransactionIdVerified: true as const,
        fullBlockTransactionCommitmentVerified: true as const,
        canonicalHeaderBytesVerified: true as const,
        ergoPowAuthenticated: false as const,
        canonicalChainMembershipEstablished: false as const,
        payoutAuthorized: false as const,
        signingAuthorized: false as const,
        submissionAuthorized: false as const,
        broadcastAuthorized: false as const,
        fundsAuthorityEstablished: false as const,
        gate5Closed: false as const,
        trustlessStatusEstablished: false as const,
        productionReadinessEstablished: false as const,
      }),
    };
    const observation = deepFreeze({
      ...binding,
      observationDigestHex: sha256CanonicalJson(
        binding,
        OBSERVATION_DIGEST_DOMAIN,
      ),
    });
    OBSERVATIONS.add(observation);
    return observation;
  } finally {
    if (started) end!.call(input.source);
  }
}

export async function collectAuthenticatedV2HistoricalPayoutFromDistinctSources(
  input: CollectAuthenticatedV2HistoricalPayoutFromDistinctSourcesInput,
): Promise<Readonly<AuthenticatedV2HistoricalPayoutAgreement>> {
  assertExactObjectKeys(
    input,
    [
      'primarySource',
      'primarySourceIdHex',
      'witnessSource',
      'witnessSourceIdHex',
      'authenticatedV2Reconstruction',
      'legacyHistoryKeyHex',
    ],
    'authenticated V2 historical payout agreement input',
  );
  const primarySourceIdHex = fixedHex(
    input.primarySourceIdHex,
    32,
    'primary authenticated V2 historical payout source ID',
  );
  const witnessSourceIdHex = fixedHex(
    input.witnessSourceIdHex,
    32,
    'witness authenticated V2 historical payout source ID',
  );
  if (
    input.primarySource === input.witnessSource
    || primarySourceIdHex === witnessSourceIdHex
  ) {
    throw new Error(
      'authenticated V2 historical payout agreement requires distinct source instances and identities',
    );
  }
  const common = {
    authenticatedV2Reconstruction: input.authenticatedV2Reconstruction,
    legacyHistoryKeyHex: input.legacyHistoryKeyHex,
  };
  const [primary, witness] = await Promise.all([
    observeAuthenticatedV2HistoricalPayout({
      source: input.primarySource,
      sourceIdHex: primarySourceIdHex,
      ...common,
    }),
    observeAuthenticatedV2HistoricalPayout({
      source: input.witnessSource,
      sourceIdHex: witnessSourceIdHex,
      ...common,
    }),
  ]);
  if (canonicalJson(primary.view) !== canonicalJson(witness.view)) {
    throw new Error(
      'distinct authenticated V2 historical payout sources disagree',
    );
  }
  const sourcePairs = [
    {
      sourceIdHex: primary.sourceIdHex,
      observationDigestHex: primary.observationDigestHex,
    },
    {
      sourceIdHex: witness.sourceIdHex,
      observationDigestHex: witness.observationDigestHex,
    },
  ].sort((left, right) => left.sourceIdHex.localeCompare(right.sourceIdHex));
  const sourceIdsHex = deepFreeze([
    sourcePairs[0].sourceIdHex,
    sourcePairs[1].sourceIdHex,
  ] as const);
  const observationDigestsHex = deepFreeze([
    sourcePairs[0].observationDigestHex,
    sourcePairs[1].observationDigestHex,
  ] as const);
  const sourceBinding = {
    sourceIdsHex,
    observationDigestsHex,
    viewDigestHex: primary.view.viewDigestHex,
  };
  const sources = deepFreeze({
    sourceIdsHex,
    observationDigestsHex,
    agreementDigestHex: sha256CanonicalJson(
      sourceBinding,
      AGREEMENT_DIGEST_DOMAIN,
    ),
  });
  const agreement = deepFreeze({
    schema: AUTHENTICATED_V2_HISTORICAL_PAYOUT_AGREEMENT_SCHEMA,
    status: 'non_authorizing_distinct_source_agreement' as const,
    view: primary.view,
    sources,
    boundary: {
      distinctSourceInstancesVerified: true as const,
      exactHistoricalPayoutAgreementVerified: true as const,
      operationalIndependenceEstablished: false as const,
      ergoPowAuthenticated: false as const,
      canonicalChainMembershipEstablished: false as const,
      payoutAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  });
  const selection = selectHistoricalPayout(
    input.authenticatedV2Reconstruction,
    input.legacyHistoryKeyHex,
  );
  AGREEMENTS.set(agreement, {
    reconstruction: selection.reconstruction,
    legacyHistoryKeyHex: selection.legacyHistoryKeyHex,
  });
  return agreement;
}

export function assertAuthenticatedV2HistoricalPayoutAgreementProvenance(
  value: unknown,
  expected?: Readonly<{
    authenticatedV2Reconstruction?: AuthenticatedV2DupReconstruction;
    legacyHistoryKeyHex?: string;
  }>,
): asserts value is Readonly<AuthenticatedV2HistoricalPayoutAgreement> {
  if (value === null || typeof value !== 'object') {
    throw new Error(
      'authenticated V2 historical payout agreement provenance is missing',
    );
  }
  const provenance = AGREEMENTS.get(value);
  if (provenance === undefined) {
    throw new Error(
      'authenticated V2 historical payout agreement provenance is missing',
    );
  }
  if (
    expected?.authenticatedV2Reconstruction !== undefined
    && provenance.reconstruction !== expected.authenticatedV2Reconstruction
  ) {
    throw new Error(
      'authenticated V2 historical payout agreement uses another reconstruction',
    );
  }
  if (
    expected?.legacyHistoryKeyHex !== undefined
    && provenance.legacyHistoryKeyHex
      !== fixedHex(
        expected.legacyHistoryKeyHex,
        32,
        'expected authenticated V2 historical payout history key',
      )
  ) {
    throw new Error(
      'authenticated V2 historical payout agreement uses another history key',
    );
  }
}

function selectHistoricalPayout(
  reconstruction: AuthenticatedV2DupReconstruction,
  legacyHistoryKeyHexInput: string,
): HistoricalPayoutSelection {
  assertAuthenticatedV2DupReconstructionProvenance(reconstruction);
  const legacyHistoryKeyHex = fixedHex(
    legacyHistoryKeyHexInput,
    32,
    'authenticated V2 historical payout history key',
  );
  const historyIndexes = reconstruction.historyKeys
    .map((value, index) => ({
      value: fixedHex(
        value,
        32,
        `authenticated V2 history key ${index}`,
      ),
      index,
    }))
    .filter(entry => entry.value === legacyHistoryKeyHex);
  if (historyIndexes.length !== 1) {
    throw new Error(
      'authenticated V2 historical payout requires exactly one history key',
    );
  }
  if (reconstruction.transitions.length !== reconstruction.historyKeys.length) {
    throw new Error(
      'authenticated V2 historical payout transition history is incomplete',
    );
  }
  const historyIndex = historyIndexes[0].index;
  const transition = reconstruction.transitions[historyIndex];
  if (
    fixedHex(
      transition?.burnIdHex,
      32,
      'authenticated V2 historical payout transition key',
    ) !== legacyHistoryKeyHex
  ) {
    throw new Error(
      'authenticated V2 historical payout transition does not match its history key',
    );
  }
  return {
    reconstruction,
    legacyHistoryKeyHex,
    historyIndex,
    transition,
  };
}

async function canonicalPayoutOutput(
  transaction: unknown,
  expectedTransactionIdHex: string,
): Promise<Readonly<{
  boxIdHex: string;
  valueNanoErg: string;
  ergoTreeHex: string;
}>> {
  const wasm = await getErgoWasm();
  let parsed: any;
  let parsedId: any;
  try {
    parsed = wasm.Transaction.from_json(JSON.stringify(transaction));
    parsedId = parsed.id();
    if (
      fixedHex(
        parsedId.to_str(),
        32,
        'canonical historical settlement transaction ID',
      ) !== expectedTransactionIdHex
    ) {
      throw new Error(
        'canonical historical settlement transaction ID does not match the reconstruction',
      );
    }
    const canonical = record(
      parsed.to_js_eip12(),
      'canonical historical settlement transaction',
    );
    const outputs = array(
      canonical.outputs,
      'canonical historical settlement outputs',
    );
    if (outputs.length !== 3 && outputs.length !== 4) {
      throw new Error(
        'canonical historical settlement transaction has an unsupported output shape',
      );
    }
    const payout = record(
      outputs[1],
      'canonical historical settlement payout output',
    );
    if (
      fixedHex(
        payout.transactionId,
        32,
        'canonical historical payout transaction ID',
      ) !== expectedTransactionIdHex
      || nonnegativeSafeInteger(
        payout.index,
        'canonical historical payout output index',
      ) !== 1
    ) {
      throw new Error(
        'canonical historical payout output is not transaction output 1',
      );
    }
    if (
      !Array.isArray(payout.assets)
      || payout.assets.length !== 0
    ) {
      throw new Error(
        'canonical historical payout output must contain pure ERG',
      );
    }
    return {
      boxIdHex: fixedHex(
        payout.boxId,
        32,
        'canonical historical payout box ID',
      ),
      valueNanoErg: positiveLong(
        payout.value,
        'canonical historical payout value',
      ),
      ergoTreeHex: variableHex(
        payout.ergoTree,
        'canonical historical payout ErgoTree',
      ),
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(String(error));
  } finally {
    parsedId?.free?.();
    parsed?.free?.();
  }
}

async function getErgoWasm(): Promise<any> {
  if (!ergoWasmPromise) {
    ergoWasmPromise = import('ergo-lib-wasm-nodejs')
      .then(module => module.default ?? module);
  }
  return ergoWasmPromise;
}

function assertExactObjectKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (
    actual.length !== allowed.length
    || actual.some((key, index) => key !== allowed[index])
  ) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function record(value: unknown, label: string): Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be ${bytes}-byte hex`);
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (
    normalized.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be ${bytes}-byte hex`);
  }
  return normalized;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return normalized;
}

function positiveLong(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    && typeof value !== 'number'
    && typeof value !== 'bigint'
  ) {
    throw new Error(`${label} must be a positive signed 64-bit integer`);
  }
  if (
    typeof value === 'number'
    && (!Number.isSafeInteger(value) || value <= 0)
  ) {
    throw new Error(`${label} must be a positive signed 64-bit integer`);
  }
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`${label} must be a positive signed 64-bit integer`);
  }
  if (parsed <= 0n || parsed > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`${label} must be a positive signed 64-bit integer`);
  }
  return parsed.toString();
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
  ) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  const parsed = nonnegativeSafeInteger(value, label);
  if (parsed === 0) {
    throw new Error(`${label} must be positive`);
  }
  return parsed;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === 'object' && !seen.has(value as object)) {
    seen.add(value as object);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child, seen);
    }
    Object.freeze(value);
  }
  return value;
}
