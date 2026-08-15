import { createHash } from 'crypto';
import { ethers } from 'ethers';

import { canonicalNodeOrigin } from './ergo-node-endpoint-alignment.js';
import {
  classifyPegOutBurnForSettlement,
  verifyPegOutBurnReceipt,
} from './peg-out-burn-verifier.js';
import type { ParsedPegOut } from './sidechain-client.js';
import {
  assertRevalidatedAuthenticatedSettlementCandidateProvenance,
  type RevalidatedAuthenticatedSettlementCandidate,
} from './authenticated-settlement-jvm-check.js';
import type { AuthenticatedSettlementCandidate } from './state-tracker.js';

export type StableSidechainSource = {
  getBlockNumber(): Promise<number>;
  getTransactionReceipt(txHash: string): Promise<unknown>;
  getBlock(blockNumber: number): Promise<{ hash?: string | null } | null>;
};

type StableSidechainCandidate = Pick<
  AuthenticatedSettlementCandidate,
  | 'candidateId'
  | 'burnId'
  | 'burnTxHash'
  | 'sidechainId'
  | 'sidechainHeight'
  | 'sidechainBlockHash'
  | 'sidechainLogIndex'
>;

const STABLE_SIDECHAIN_VIEWS = new WeakSet<object>();
const MATCHING_SIDECHAIN_VIEW_CONSENSUS = new WeakSet<object>();
const SIDECHAIN_OBSERVATION_SOURCE_PAIR_BINDINGS = new WeakMap<
  object,
  Readonly<{
    primarySource: StableSidechainSource;
    witnessSource: StableSidechainSource;
    sourceIdsHex: readonly string[];
  }>
>();
const CLOSED_SIDECHAIN_OBSERVATION_SOURCE_PAIRS = new WeakSet<object>();

export interface AuthenticatedSettlementSidechainObservationSourcePair {
  readonly sourceIdsHex: readonly string[];
}

export interface AuthenticatedSettlementStableSidechainView {
  candidateId: string;
  burnIdHex: string;
  sidechainIdHex: string;
  sidechainTxHashHex: string;
  sidechainHeight: bigint;
  executionBlockHashHex: string;
  eventIndex: number;
  amountNanoErg: bigint;
  recipientErgoTreeHex: string;
  observedTipHeight: bigint;
  observedTipHashHex: string;
  confirmations: bigint;
  requiredConfirmations: bigint;
  viewDigestHex: string;
}

export interface MatchingAuthenticatedSettlementSidechainViewConsensus {
  readonly view: AuthenticatedSettlementStableSidechainView;
  readonly sourceIdsHex: readonly string[];
  readonly sourceCount: number;
  readonly consensusDigestHex: string;
}

export interface MatchingAuthenticatedSettlementSidechainViewResult {
  readonly primaryView: AuthenticatedSettlementStableSidechainView;
  readonly witnessView: AuthenticatedSettlementStableSidechainView;
  readonly consensus: MatchingAuthenticatedSettlementSidechainViewConsensus;
}

export function createAuthenticatedSettlementSidechainObservationSourcePair(input: {
  primaryRpcUrl: string;
  witnessRpcUrl: string;
}): AuthenticatedSettlementSidechainObservationSourcePair {
  const primary = normalizeSidechainRpcEndpoint(
    input.primaryRpcUrl,
    'authenticated settlement primary sidechain RPC URL',
  );
  const witness = normalizeSidechainRpcEndpoint(
    input.witnessRpcUrl,
    'authenticated settlement witness sidechain RPC URL',
  );
  if (primary.canonicalOrigin === witness.canonicalOrigin) {
    throw new Error('authenticated settlement sidechain recovery requires distinct RPC origins');
  }
  const primarySource = new ethers.JsonRpcProvider(primary.rpcUrl);
  const witnessSource = new ethers.JsonRpcProvider(witness.rpcUrl);
  const sourceIdsHex = Object.freeze([
    sidechainObservationSourceId(primary.canonicalOrigin),
    sidechainObservationSourceId(witness.canonicalOrigin),
  ].sort());
  const pair = Object.freeze({ sourceIdsHex });
  SIDECHAIN_OBSERVATION_SOURCE_PAIR_BINDINGS.set(pair, Object.freeze({
    primarySource,
    witnessSource,
    sourceIdsHex,
  }));
  return pair;
}

export function destroyAuthenticatedSettlementSidechainObservationSourcePair(
  pair: AuthenticatedSettlementSidechainObservationSourcePair,
): void {
  if (CLOSED_SIDECHAIN_OBSERVATION_SOURCE_PAIRS.has(pair)) return;
  const binding = sidechainObservationSourcePairBinding(pair);
  CLOSED_SIDECHAIN_OBSERVATION_SOURCE_PAIRS.add(pair);
  destroyStableSidechainSource(binding.primarySource);
  destroyStableSidechainSource(binding.witnessSource);
}

function normalizeSidechainRpcEndpoint(
  raw: string,
  label: string,
): { rpcUrl: string; canonicalOrigin: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must use http or https`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} must not contain credentials, query parameters, or fragments`);
  }
  const rpcUrl = parsed.toString();
  return {
    rpcUrl,
    canonicalOrigin: canonicalNodeOrigin(rpcUrl, label),
  };
}

function sidechainObservationSourceId(canonicalOrigin: string): string {
  return sha256Canonical({
    schema: 'e2s.authenticated-settlement-sidechain-source.v1',
    canonicalOrigin,
  });
}

function destroyStableSidechainSource(source: StableSidechainSource): void {
  const destroy = (source as StableSidechainSource & { destroy?: () => void }).destroy;
  if (typeof destroy === 'function') destroy.call(source);
}

export async function observeAuthenticatedSettlementStableSidechainView(input: {
  source: StableSidechainSource;
  bridgeAddress: string;
  sidechainIdHex: string;
  requiredConfirmations: number;
  candidate: StableSidechainCandidate;
  pegOut: ParsedPegOut;
}): Promise<AuthenticatedSettlementStableSidechainView> {
  if (!Number.isSafeInteger(input.requiredConfirmations) || input.requiredConfirmations <= 0) {
    throw new Error('authenticated settlement sidechain confirmations must be positive');
  }
  const observedTipBefore = await input.source.getBlockNumber();
  if (!Number.isSafeInteger(observedTipBefore) || observedTipBefore < 0) {
    throw new Error('observed sidechain tip must be a nonnegative safe integer');
  }
  const observedTipBlockBefore = await input.source.getBlock(observedTipBefore);
  const observedTipHashBefore = observedTipBlockBefore?.hash;
  if (!observedTipHashBefore) {
    throw new Error('observed sidechain tip block is unavailable before burn observation');
  }
  const requestedTxHashHex = fixedHex(
    input.pegOut.sidechainTxHash,
    'requested burn transaction hash',
  );
  const receipt = await input.source.getTransactionReceipt(`0x${requestedTxHashHex}`);
  if (!receipt || typeof receipt !== 'object') {
    throw new Error('candidate sidechain burn receipt is unavailable after JVM check');
  }
  const receiptBlockNumber = Number((receipt as { blockNumber?: unknown }).blockNumber);
  if (!Number.isSafeInteger(receiptBlockNumber) || receiptBlockNumber < 0) {
    throw new Error('candidate sidechain burn receipt has no valid block number');
  }
  const canonicalBlock = await input.source.getBlock(receiptBlockNumber);
  const canonicalBlockHash = canonicalBlock?.hash;
  if (!canonicalBlockHash) {
    throw new Error('candidate sidechain burn block is unavailable from the canonical chain');
  }
  const observedTipAfter = await input.source.getBlockNumber();
  if (observedTipBefore !== observedTipAfter) {
    throw new Error('sidechain canonical view changed while the burn was observed');
  }
  const observedTipBlockAfter = await input.source.getBlock(observedTipAfter);
  const observedTipHashAfter = observedTipBlockAfter?.hash;
  if (!observedTipHashAfter) {
    throw new Error('observed sidechain tip block is unavailable after burn observation');
  }
  const observedTipHashHex = fixedHex(observedTipHashAfter, 'observed sidechain tip hash');
  if (
    fixedHex(observedTipHashBefore, 'initial sidechain tip hash')
    !== observedTipHashHex
  ) {
    throw new Error('sidechain canonical tip changed at the same height while the burn was observed');
  }

  const verification = verifyPegOutBurnReceipt({
    pegOut: input.pegOut,
    receipt: receipt as any,
    bridgeAddress: input.bridgeAddress,
    canonicalBlockHash,
    sidechainIdHex: input.sidechainIdHex,
    currentSidechainHeight: observedTipAfter,
    requiredSidechainConfirmations: input.requiredConfirmations,
  });
  if (classifyPegOutBurnForSettlement(verification) !== 'confirmed' || !verification.burn) {
    throw new Error(
      `candidate sidechain burn is not confirmed after JVM check: ${verification.errors.join('; ')}`,
    );
  }
  const burn = verification.burn;
  const candidateId = fixedHex(input.candidate.candidateId, 'candidate ID');
  const burnIdHex = fixedHex(input.candidate.burnId, 'candidate burn ID');
  const sidechainIdHex = fixedHex(input.sidechainIdHex, 'sidechain ID');
  const sidechainTxHashHex = fixedHex(burn.sidechainTxHash, 'verified burn transaction hash');
  const executionBlockHashHex = fixedHex(
    burn.sidechainBlockHash,
    'verified burn execution block hash',
  );
  const sidechainHeight = BigInt(burn.sidechainBlockNumber);
  const observedTipHeight = BigInt(observedTipAfter);
  const confirmations = BigInt(burn.sidechainConfirmations ?? -1);
  const requiredConfirmations = BigInt(burn.requiredSidechainConfirmations ?? -1);
  if (
    fixedHex(input.candidate.sidechainId, 'candidate sidechain ID') !== sidechainIdHex
    || fixedHex(input.candidate.burnTxHash, 'candidate burn transaction hash') !== sidechainTxHashHex
    || BigInt(input.candidate.sidechainHeight) !== sidechainHeight
    || fixedHex(input.candidate.sidechainBlockHash, 'candidate execution block hash')
      !== executionBlockHashHex
    || input.candidate.sidechainLogIndex !== burn.sidechainLogIndex
    || burnIdHex !== fixedHex(burn.burnId, 'verified burn ID')
  ) {
    throw new Error('post-check sidechain burn does not match the current candidate');
  }
  if (
    confirmations < requiredConfirmations
    || requiredConfirmations !== BigInt(input.requiredConfirmations)
  ) {
    throw new Error('post-check sidechain burn does not satisfy the required confirmation policy');
  }

  const binding = {
    candidateId,
    burnIdHex,
    sidechainIdHex,
    sidechainTxHashHex,
    sidechainHeight,
    executionBlockHashHex,
    eventIndex: burn.sidechainLogIndex,
    amountNanoErg: BigInt(burn.amount),
    recipientErgoTreeHex: canonicalRecipientTree(burn.ergoRecipientAddress),
    observedTipHeight,
    observedTipHashHex,
    confirmations,
    requiredConfirmations,
  };
  const view = Object.freeze({
    ...binding,
    viewDigestHex: sha256Canonical(binding),
  });
  STABLE_SIDECHAIN_VIEWS.add(view);
  return view;
}

export async function observeMatchingAuthenticatedSettlementStableSidechainViews(input: {
  sources: AuthenticatedSettlementSidechainObservationSourcePair;
  bridgeAddress: string;
  sidechainIdHex: string;
  requiredConfirmations: number;
  candidate: StableSidechainCandidate;
  pegOut: ParsedPegOut;
}): Promise<MatchingAuthenticatedSettlementSidechainViewResult> {
  const binding = sidechainObservationSourcePairBinding(input.sources);
  const [primaryView, witnessView] = await Promise.all([
    observeAuthenticatedSettlementStableSidechainView({
      source: binding.primarySource,
      bridgeAddress: input.bridgeAddress,
      sidechainIdHex: input.sidechainIdHex,
      requiredConfirmations: input.requiredConfirmations,
      candidate: input.candidate,
      pegOut: input.pegOut,
    }),
    observeAuthenticatedSettlementStableSidechainView({
      source: binding.witnessSource,
      bridgeAddress: input.bridgeAddress,
      sidechainIdHex: input.sidechainIdHex,
      requiredConfirmations: input.requiredConfirmations,
      candidate: input.candidate,
      pegOut: input.pegOut,
    }),
  ]);
  if (primaryView.viewDigestHex !== witnessView.viewDigestHex) {
    throw new Error('authenticated settlement sidechain sources disagree on the stable burn view');
  }
  const sourceIdsHex = [...binding.sourceIdsHex].sort();
  if (new Set(sourceIdsHex).size !== sourceIdsHex.length) {
    throw new Error('authenticated settlement sidechain observation sources are not distinct');
  }
  const consensusBinding = {
    viewDigestHex: primaryView.viewDigestHex,
    sourceIdsHex,
  };
  const consensus = Object.freeze({
    view: primaryView,
    sourceIdsHex: Object.freeze(sourceIdsHex),
    sourceCount: sourceIdsHex.length,
    consensusDigestHex: sha256Canonical(consensusBinding),
  });
  MATCHING_SIDECHAIN_VIEW_CONSENSUS.add(consensus);
  return Object.freeze({ primaryView, witnessView, consensus });
}

function sidechainObservationSourcePairBinding(
  pair: unknown,
): Readonly<{
  primarySource: StableSidechainSource;
  witnessSource: StableSidechainSource;
  sourceIdsHex: readonly string[];
}> {
  if (
    typeof pair !== 'object'
    || pair === null
  ) {
    throw new Error('authenticated settlement sidechain source-pair provenance is missing');
  }
  const binding = SIDECHAIN_OBSERVATION_SOURCE_PAIR_BINDINGS.get(pair);
  if (binding === undefined) {
    throw new Error('authenticated settlement sidechain source-pair provenance is missing');
  }
  if (CLOSED_SIDECHAIN_OBSERVATION_SOURCE_PAIRS.has(pair)) {
    throw new Error('authenticated settlement sidechain source pair is closed');
  }
  return binding;
}

export function assertMatchingAuthenticatedSettlementSidechainViewConsensusProvenance(
  consensus: unknown,
): asserts consensus is MatchingAuthenticatedSettlementSidechainViewConsensus {
  if (
    typeof consensus !== 'object'
    || consensus === null
    || !MATCHING_SIDECHAIN_VIEW_CONSENSUS.has(consensus)
  ) {
    throw new Error('matching authenticated settlement sidechain view provenance is missing');
  }
  const matching = consensus as MatchingAuthenticatedSettlementSidechainViewConsensus;
  assertAuthenticatedSettlementStableSidechainViewProvenance(matching.view);
  if (matching.sourceCount < 2 || matching.sourceIdsHex.length !== matching.sourceCount) {
    throw new Error('matching authenticated settlement sidechain view is incomplete');
  }
  const sourceIdsHex = matching.sourceIdsHex.map(
    sourceId => fixedHex(sourceId, 'sidechain observation source ID'),
  ).sort();
  if (new Set(sourceIdsHex).size !== sourceIdsHex.length) {
    throw new Error('matching authenticated settlement sidechain sources are not distinct');
  }
  const expectedDigestHex = sha256Canonical({
    viewDigestHex: fixedHex(matching.view.viewDigestHex, 'stable sidechain view digest'),
    sourceIdsHex,
  });
  if (
    fixedHex(matching.consensusDigestHex, 'sidechain view consensus digest')
    !== expectedDigestHex
  ) {
    throw new Error('matching authenticated settlement sidechain view digest is invalid');
  }
}

function canonicalRecipientTree(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('verified burn recipient must be hex');
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized)) {
    throw new Error('verified burn recipient must be hex');
  }
  if (normalized.length === 66 && /^(02|03)/.test(normalized)) {
    return `0008cd${normalized}`;
  }
  if (normalized.length === 72 && /^(0008cd02|0008cd03)/.test(normalized)) {
    return normalized;
  }
  throw new Error('verified burn recipient must be a compressed key or canonical P2PK ErgoTree');
}

export function assertAuthenticatedSettlementStableSidechainViewProvenance(
  view: unknown,
): asserts view is AuthenticatedSettlementStableSidechainView {
  if (typeof view !== 'object' || view === null || !STABLE_SIDECHAIN_VIEWS.has(view)) {
    throw new Error('authenticated settlement stable sidechain view provenance is missing');
  }
}

export function assertAuthenticatedSettlementStableSidechainViewMatchesRevalidation(
  view: AuthenticatedSettlementStableSidechainView,
  revalidated: RevalidatedAuthenticatedSettlementCandidate,
): void {
  assertAuthenticatedSettlementStableSidechainViewProvenance(view);
  assertRevalidatedAuthenticatedSettlementCandidateProvenance(revalidated);
  if (
    fixedHex(view.candidateId, 'stable sidechain candidate ID')
      !== fixedHex(revalidated.candidateId, 'revalidated candidate ID')
    || view.amountNanoErg !== revalidated.amountNanoErg
    || view.recipientErgoTreeHex !== revalidated.recipientErgoTreeHex
  ) {
    throw new Error('stable sidechain burn semantics do not match the revalidated settlement');
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
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('sidechain view cannot contain non-finite numbers');
    }
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
  throw new Error(`sidechain view cannot serialize ${typeof value}`);
}
