import type { SettlementIdentity } from './aggregate-settlement-builder.js';
import {
  extractFrontierBridgeEventRoot,
  type CanonicalFrontierPegOutBurn,
  type FrontierBlockReceiptLike,
} from './frontier-bridge-event-root.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
} from './profiles/substrate-grandpa-v1/asset-profile.js';
import type { ParsedPegOut } from './sidechain-client.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  buildTrustlessBurnInclusionProof,
  type TrustlessBurnInclusionProof,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';

const ERGO_P2PK_TREE_PREFIX_HEX = '0008cd';
const FRONTIER_RETURNED_RECEIPT_BURN_SET_VIEW_DIGEST_DOMAIN =
  'E2S_FRONTIER_RETURNED_RECEIPT_BURN_SET_VIEW_V1';
const FRONTIER_RETURNED_RECEIPT_BURN_SET_OBSERVATION_DIGEST_DOMAIN =
  'E2S_FRONTIER_RETURNED_RECEIPT_BURN_SET_OBSERVATION_V1';
const FRONTIER_RETURNED_RECEIPT_BURN_SET_AGREEMENT_DIGEST_DOMAIN =
  'E2S_FRONTIER_RETURNED_RECEIPT_BURN_SET_AGREEMENT_V1';
const BURN_SET_OBSERVATIONS = new WeakSet<object>();
const BURN_SET_AGREEMENTS = new WeakSet<object>();

export const FRONTIER_RETURNED_RECEIPT_BURN_SET_OBSERVATION_SCHEMA =
  'e2s.frontier-returned-receipt-burn-set-observation.v1' as const;
export const FRONTIER_RETURNED_RECEIPT_BURN_SET_AGREEMENT_SCHEMA =
  'e2s.frontier-returned-receipt-burn-set-agreement.v1' as const;

export interface FrontierBurnProofBlock {
  number?: number | string | bigint;
  hash?: string | null;
}

export interface FrontierBurnProofProvider {
  getBlock(number: number): Promise<FrontierBurnProofBlock | null>;
  getBlockReceipts(blockNumber: number): Promise<unknown>;
}

export interface CollectFrontierBurnProofForPegOutInput {
  provider: FrontierBurnProofProvider;
  pegOut: ParsedPegOut;
  sidechainIdHex: string;
  bridgeAddress: string;
  maxBurns: number;
}

export interface CollectFrontierBurnProofForPegOutResult {
  proof: TrustlessBurnInclusionProof;
  settlementIdentity: SettlementIdentity;
}

export interface FrontierReturnedReceiptBurnSetView {
  readonly sidechainIdHex: string;
  readonly executionBlockNumber: number;
  readonly executionBlockHashHex: string;
  readonly bridgeAddress: string;
  readonly bridgeEventRootHex: string;
  readonly burnLeafCount: number;
  readonly burns: readonly CanonicalFrontierPegOutBurn[];
  readonly viewDigestHex: string;
}

export interface FrontierReturnedReceiptBurnSetObservation {
  readonly schema:
    typeof FRONTIER_RETURNED_RECEIPT_BURN_SET_OBSERVATION_SCHEMA;
  readonly status: 'non_authorizing_read_only_observation';
  readonly sourceIdHex: string;
  readonly view: FrontierReturnedReceiptBurnSetView;
  readonly observationDigestHex: string;
  readonly boundary: Readonly<{
    stableBlockHashRechecked: true;
    returnedRpcReceiptArrayParsed: true;
    receiptArrayCompletenessAuthenticated: false;
    bridgeEventRootReconstructed: true;
    sourceConsensusEstablished: false;
    sidechainFinalityEstablished: false;
    mintAuthorized: false;
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

export interface FrontierReturnedReceiptBurnSetAgreement {
  readonly schema:
    typeof FRONTIER_RETURNED_RECEIPT_BURN_SET_AGREEMENT_SCHEMA;
  readonly status: 'non_authorizing_distinct_source_agreement';
  readonly view: FrontierReturnedReceiptBurnSetView;
  readonly sources: Readonly<{
    sourceIdsHex: readonly [string, string];
    observationDigestsHex: readonly [string, string];
    agreementDigestHex: string;
  }>;
  readonly boundary: Readonly<{
    distinctSourceInstancesVerified: true;
    exactReturnedBurnSetAgreementVerified: true;
    receiptArrayCompletenessAuthenticated: false;
    operationalIndependenceEstablished: false;
    sourceConsensusEstablished: false;
    sidechainFinalityEstablished: false;
    mintAuthorized: false;
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

export interface CollectFrontierReturnedReceiptBurnSetObservationInput {
  readonly provider: FrontierBurnProofProvider;
  readonly sourceIdHex: string;
  readonly sidechainIdHex: string;
  readonly executionBlockNumber: number;
  readonly executionBlockHashHex: string;
  readonly bridgeAddress: string;
  readonly maxBurns: number;
}

export interface CollectFrontierReturnedReceiptBurnSetAgreementInput {
  readonly primary: CollectFrontierReturnedReceiptBurnSetObservationInput;
  readonly witness: CollectFrontierReturnedReceiptBurnSetObservationInput;
}

interface BoundFrontierReceipt extends FrontierBlockReceiptLike {
  blockHash?: string | null;
  blockNumber?: number | string | bigint | null;
}

interface CanonicalBlockIdentity {
  number: number;
  hashHex: string;
}

export async function collectFrontierBurnProofForPegOut(
  input: CollectFrontierBurnProofForPegOutInput,
): Promise<CollectFrontierBurnProofForPegOutResult> {
  const blockNumber = normalizeSafeInteger(
    input.pegOut.sidechainBlockNumber,
    'persisted peg-out block number',
  );
  const persistedBlockHashHex = normalizeFixedHex(
    input.pegOut.sidechainBlockHash,
    32,
    'persisted peg-out block hash',
  );
  const targetTxHashHex = normalizeFixedHex(
    input.pegOut.sidechainTxHash,
    32,
    'persisted peg-out transaction hash',
  );
  const targetLogIndex = normalizeSafeInteger(
    input.pegOut.sidechainLogIndex,
    'persisted peg-out global log index',
  );

  const collected = await collectReturnedFrontierBurnSet({
    provider: input.provider,
    executionBlockNumber: blockNumber,
    executionBlockHashHex: persistedBlockHashHex,
    expectedBlockHashLabel: 'persisted peg-out',
    sidechainIdHex: input.sidechainIdHex,
    bridgeAddress: input.bridgeAddress,
    maxBurns: input.maxBurns,
  });
  const before = collected.block;
  const extracted = collected.extracted;
  const target = extracted.burns.find(burn =>
    burn.sidechainTxHashHex === targetTxHashHex && burn.logIndex === targetLogIndex
  );
  if (!target) {
    throw new Error(
      'persisted peg-out target is absent from the returned Frontier burn set',
    );
  }
  bindPersistedTarget(input.pegOut, target, before);
  const leaves = extracted.burns.map<TrustlessBurnLeafInput>(burn => ({
    sidechainIdHex: input.sidechainIdHex,
    sidechainBlockHashHex: before.hashHex,
    burnIdHex: burn.burnIdHex,
    sidechainTxHashHex: burn.sidechainTxHashHex,
    eventIndex: burn.eventIndex,
    recipientErgoTreeHashHex: burn.recipientErgoTreeHashHex,
    amountNanoErg: burn.amountNanoErg,
    assetIdHex:
      SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex,
  }));
  const proof = buildTrustlessBurnInclusionProof(leaves, target.burnIdHex);
  if (!extracted.commitment || proof.bridgeEventRootHex !== extracted.commitment.bridgeEventRootHex) {
    throw new Error('reconstructed burn proof root does not match the canonical Frontier event root');
  }

  const settlementIdentity: SettlementIdentity = {
    source: 'trustless-burn-leaf',
    duplicatePreventionKeyHex: proof.leaf.burnIdHex,
    bridgeEventRootHex: proof.bridgeEventRootHex,
    recipientErgoTreeHashHex: proof.leaf.recipientErgoTreeHashHex,
    amountNanoErg: proof.leaf.amountNanoErg,
    assetIdHex: proof.leaf.assetIdHex,
    trustlessBurnProof: proof.proof,
  };
  return { proof, settlementIdentity };
}

export async function collectFrontierReturnedReceiptBurnSetObservation(
  input: CollectFrontierReturnedReceiptBurnSetObservationInput,
): Promise<Readonly<FrontierReturnedReceiptBurnSetObservation>> {
  const sourceIdHex = normalizeFixedHex(
    input.sourceIdHex,
    32,
    'Frontier burn-set source ID',
  );
  const collected = await collectReturnedFrontierBurnSet(input);
  if (collected.extracted.commitment === null) {
    throw new Error(
      'Frontier returned receipt burn-set observation requires at least one valid bridge burn',
    );
  }
  const viewWithoutDigest = {
    sidechainIdHex: normalizeFixedHex(
      input.sidechainIdHex,
      32,
      'Frontier burn-set sidechain ID',
    ),
    executionBlockNumber: collected.block.number,
    executionBlockHashHex: collected.block.hashHex,
    bridgeAddress: normalizeAddress(
      input.bridgeAddress,
      'Frontier burn-set bridge address',
    ),
    bridgeEventRootHex:
      collected.extracted.commitment.bridgeEventRootHex,
    burnLeafCount: collected.extracted.commitment.leaves.length,
    burns: deepFreeze(collected.extracted.burns.map(burn => ({ ...burn }))),
  } as const;
  const view = deepFreeze({
    ...viewWithoutDigest,
    viewDigestHex: sha256CanonicalJson(
      viewWithoutDigest,
      FRONTIER_RETURNED_RECEIPT_BURN_SET_VIEW_DIGEST_DOMAIN,
    ),
  });
  const boundary = deepFreeze({
    stableBlockHashRechecked: true as const,
    returnedRpcReceiptArrayParsed: true as const,
    receiptArrayCompletenessAuthenticated: false as const,
    bridgeEventRootReconstructed: true as const,
    sourceConsensusEstablished: false as const,
    sidechainFinalityEstablished: false as const,
    mintAuthorized: false as const,
    payoutAuthorized: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
  const binding = {
    schema: FRONTIER_RETURNED_RECEIPT_BURN_SET_OBSERVATION_SCHEMA,
    status: 'non_authorizing_read_only_observation' as const,
    sourceIdHex,
    view,
    boundary,
  };
  const observation = deepFreeze({
    ...binding,
    observationDigestHex: sha256CanonicalJson(
      binding,
      FRONTIER_RETURNED_RECEIPT_BURN_SET_OBSERVATION_DIGEST_DOMAIN,
    ),
  });
  BURN_SET_OBSERVATIONS.add(observation);
  return observation;
}

export async function collectFrontierReturnedReceiptBurnSetFromDistinctSources(
  input: CollectFrontierReturnedReceiptBurnSetAgreementInput,
): Promise<Readonly<FrontierReturnedReceiptBurnSetAgreement>> {
  if (
    input.primary.provider === input.witness.provider
    || normalizeFixedHex(
      input.primary.sourceIdHex,
      32,
      'primary Frontier burn-set source ID',
    ) === normalizeFixedHex(
      input.witness.sourceIdHex,
      32,
      'witness Frontier burn-set source ID',
    )
  ) {
    throw new Error(
      'Frontier returned receipt burn-set agreement requires distinct source instances and identities',
    );
  }
  const [primary, witness] = await Promise.all([
    collectFrontierReturnedReceiptBurnSetObservation(input.primary),
    collectFrontierReturnedReceiptBurnSetObservation(input.witness),
  ]);
  if (canonicalJson(primary.view) !== canonicalJson(witness.view)) {
    throw new Error(
      'distinct Frontier sources disagree on the exact returned receipt-derived burn set',
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
      FRONTIER_RETURNED_RECEIPT_BURN_SET_AGREEMENT_DIGEST_DOMAIN,
    ),
  });
  const agreement = deepFreeze({
    schema: FRONTIER_RETURNED_RECEIPT_BURN_SET_AGREEMENT_SCHEMA,
    status: 'non_authorizing_distinct_source_agreement' as const,
    view: primary.view,
    sources,
    boundary: {
      distinctSourceInstancesVerified: true as const,
      exactReturnedBurnSetAgreementVerified: true as const,
      receiptArrayCompletenessAuthenticated: false as const,
      operationalIndependenceEstablished: false as const,
      sourceConsensusEstablished: false as const,
      sidechainFinalityEstablished: false as const,
      mintAuthorized: false as const,
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
  BURN_SET_AGREEMENTS.add(agreement);
  return agreement;
}

export function assertFrontierReturnedReceiptBurnSetAgreementProvenance(
  value: unknown,
): asserts value is Readonly<FrontierReturnedReceiptBurnSetAgreement> {
  if (
    typeof value !== 'object'
    || value === null
    || !BURN_SET_AGREEMENTS.has(value)
  ) {
    throw new Error(
      'distinct-source Frontier returned receipt burn-set agreement provenance is missing',
    );
  }
}

async function collectReturnedFrontierBurnSet(input: {
  readonly provider: FrontierBurnProofProvider;
  readonly sidechainIdHex: string;
  readonly executionBlockNumber: number;
  readonly executionBlockHashHex: string;
  readonly expectedBlockHashLabel?: string;
  readonly bridgeAddress: string;
  readonly maxBurns: number;
}): Promise<Readonly<{
  block: CanonicalBlockIdentity;
  extracted: ReturnType<typeof extractFrontierBridgeEventRoot>;
}>> {
  const blockNumber = normalizeSafeInteger(
    input.executionBlockNumber,
    'Frontier burn-set block number',
  );
  const expectedBlockHashHex = normalizeFixedHex(
    input.executionBlockHashHex,
    32,
    'Frontier burn-set block hash',
  );
  const before = await fetchCanonicalBlock(input.provider, blockNumber);
  if (before.hashHex !== expectedBlockHashHex) {
    const expectedBlockHashLabel =
      input.expectedBlockHashLabel ?? 'expected Frontier burn-set';
    throw new Error(
      `${expectedBlockHashLabel} block hash does not match canonical block ${blockNumber}`,
    );
  }
  const rpcResult = await input.provider.getBlockReceipts(blockNumber);
  const after = await fetchCanonicalBlock(input.provider, blockNumber);
  if (after.hashHex !== before.hashHex) {
    throw new Error(
      `canonical block hash drift detected for block ${blockNumber}; possible reorg`,
    );
  }
  const receipts = requireBoundReceipts(rpcResult, before);
  const extracted = extractFrontierBridgeEventRoot({
    sidechainIdHex: input.sidechainIdHex,
    executionBlockHashHex: before.hashHex,
    bridgeAddress: input.bridgeAddress,
    maxBurns: input.maxBurns,
    receipts,
  });
  return deepFreeze({ block: before, extracted });
}

async function fetchCanonicalBlock(
  provider: FrontierBurnProofProvider,
  blockNumber: number,
): Promise<CanonicalBlockIdentity> {
  const block = await provider.getBlock(blockNumber);
  if (!block) {
    throw new Error(`cannot resolve canonical Frontier block ${blockNumber}`);
  }
  const returnedNumber = normalizeSafeInteger(block.number, 'canonical block number');
  if (returnedNumber !== blockNumber) {
    throw new Error(
      `persisted peg-out block number ${blockNumber} does not match canonical block number ${returnedNumber}`,
    );
  }
  return {
    number: returnedNumber,
    hashHex: normalizeFixedHex(block.hash, 32, 'canonical block hash'),
  };
}

function requireBoundReceipts(
  value: unknown,
  block: CanonicalBlockIdentity,
): BoundFrontierReceipt[] {
  if (!Array.isArray(value)) {
    throw new Error('eth_getBlockReceipts result must be an array');
  }
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`receipt ${index} must be an object`);
    }
    const receipt = candidate as BoundFrontierReceipt;
    const receiptBlockHashHex = normalizeFixedHex(
      receipt.blockHash,
      32,
      `receipt ${index} block hash`,
    );
    const receiptBlockNumber = normalizeSafeInteger(
      receipt.blockNumber,
      `receipt ${index} block number`,
    );
    if (receiptBlockHashHex !== block.hashHex) {
      throw new Error(`receipt ${index} block hash does not match canonical block`);
    }
    if (receiptBlockNumber !== block.number) {
      throw new Error(`receipt ${index} block number does not match canonical block`);
    }
    return receipt;
  });
}

function bindPersistedTarget(
  pegOut: ParsedPegOut,
  target: ReturnType<typeof extractFrontierBridgeEventRoot>['burns'][number],
  block: CanonicalBlockIdentity,
): void {
  const user = normalizeAddress(pegOut.user, 'persisted peg-out user');
  if (user !== target.userAddress) {
    throw new Error('persisted peg-out user does not match the canonical target burn');
  }
  if (pegOut.amount.toString() !== target.amountNanoErg) {
    throw new Error('persisted peg-out amount does not match the canonical target burn');
  }
  const recipientErgoTreeHex = canonicalRecipientErgoTree(pegOut.ergoRecipientAddress);
  if (recipientErgoTreeHex !== target.recipientErgoTreeHex) {
    throw new Error('persisted peg-out recipient does not match the canonical target burn');
  }
  if (pegOut.sidechainBlockNumber !== block.number) {
    throw new Error('persisted peg-out block number does not match the canonical target burn');
  }
  const persistedBlockHashHex = normalizeFixedHex(
    pegOut.sidechainBlockHash,
    32,
    'persisted peg-out block hash',
  );
  if (persistedBlockHashHex !== block.hashHex) {
    throw new Error('persisted peg-out block hash does not match the canonical target burn');
  }
}

function canonicalRecipientErgoTree(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('persisted peg-out recipient must be hex');
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error('persisted peg-out recipient must be hex');
  }
  const normalized = clean.toLowerCase();
  if (normalized.length === 33 * 2 && /^(02|03)/.test(normalized)) {
    return `${ERGO_P2PK_TREE_PREFIX_HEX}${normalized}`;
  }
  if (
    normalized.length === 36 * 2 &&
    /^(0008cd02|0008cd03)/.test(normalized)
  ) {
    return normalized;
  }
  throw new Error('persisted peg-out recipient must be a compressed key or canonical P2PK ErgoTree');
}

function normalizeAddress(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be an exact 20-byte address`);
  }
  return value.toLowerCase();
}

function normalizeFixedHex(
  value: unknown,
  expectedBytes: number,
  label: string,
): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes of hex`);
  }
  return clean.toLowerCase();
}

function normalizeSafeInteger(value: unknown, label: string): number {
  let parsed: bigint;
  if (typeof value === 'bigint') {
    parsed = value;
  } else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a non-negative safe integer`);
    parsed = BigInt(value);
  } else if (typeof value === 'string' && (/^(0|[1-9]\d*)$/.test(value) || /^0x[0-9a-f]+$/i.test(value))) {
    parsed = BigInt(value);
  } else {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(parsed);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
