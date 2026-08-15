/**
 * Reconstruct the authenticated V2 duplicate-prevention history from the
 * chain-visible singleton NFT lineage. The result is process-local provenance:
 * it may repopulate a replaceable cache, but it cannot authorize settlement.
 */

import { createHash } from 'crypto';

import { getDupTreeDigest, insertLockRecord } from './avl-bridge.js';
import {
  decodeBoundedCollByteRegister,
  decodeCanonicalDlogSigmaPropRegister,
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  EMPTY_AVL_DIGEST,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES,
  type AuthenticatedSpvTrackerChainSource,
} from './authenticated-spv-tracker-reconstruction.js';

const MAX_DUP_PROOF_BYTES = 1024 * 1024;
const MAX_CANONICAL_BOX_BYTES = 1024 * 1024;
const MIN_MINER_FEE = 1_000_000n;
const MAX_MINER_FEE = 2_100_000n;

export interface AuthenticatedV2DupChainSource extends AuthenticatedSpvTrackerChainSource {
  readonly observationSourceId: string;
  getBoxBinaryByIdOrNull(boxId: string): Promise<unknown | null>;
}

export interface ReconstructedAuthenticatedV2DupTransition {
  readonly burnIdHex: string;
  readonly spendingTransactionIdHex: string;
  readonly spendingBlockIdHex: string;
  readonly spendingInclusionHeight: number;
  readonly dupInputBoxIdHex: string;
  readonly dupSuccessorBoxIdHex: string;
  readonly vaultInputBoxIdHex: string;
  readonly vaultSuccessorBoxIdHex: string | null;
  readonly payoutBoxIdHex: string;
  readonly payoutValueNanoErg: string;
  readonly minerFeeNanoErg: string;
  readonly successorDigestHex: string;
}

export interface AuthenticatedV2DupObservation {
  readonly duplicatePreventionNftIdHex: string;
  readonly duplicatePreventionErgoTreeHex: string;
  readonly genesisBoxIdHex: string;
  readonly tipBoxIdHex: string;
  readonly tipDigestHex: string;
  readonly tipCounter: string;
  readonly authoritySigmaPropRegisterHex: string;
  readonly historyKeys: readonly string[];
  readonly transitions: readonly ReconstructedAuthenticatedV2DupTransition[];
  readonly tipSigmaSerializedHex: string;
  readonly tipSigmaSerializedSha256Hex: string;
  readonly observedTip: Readonly<{
    idHex: string;
    parentIdHex: string;
    height: number;
    extensionRootHex: string;
  }>;
  readonly indexedHeight: number;
  readonly fullHeight: number;
  readonly observationDigestHex: string;
}

export interface AuthenticatedV2DupReconstruction extends AuthenticatedV2DupObservation {
  readonly distinctSourceAgreement: true;
}

export interface ReconstructAuthenticatedV2DupInput {
  source: AuthenticatedV2DupChainSource;
  duplicatePreventionNftIdHex: string;
  duplicatePreventionErgoTreeHex: string;
}

export interface ReconstructAuthenticatedV2DupFromDistinctSourcesInput {
  primarySource: AuthenticatedV2DupChainSource;
  witnessSource: AuthenticatedV2DupChainSource;
  duplicatePreventionNftIdHex: string;
  duplicatePreventionErgoTreeHex: string;
}

interface NormalizedHeader {
  idHex: string;
  parentIdHex: string;
  height: number;
  extensionRootHex: string;
}

interface SyncedSnapshot {
  bestHeader: NormalizedHeader;
  indexedHeight: number;
  fullHeight: number;
}

interface NormalizedAsset {
  tokenIdHex: string;
  amount: bigint;
}

interface NormalizedDupBox {
  raw: Record<string, any>;
  boxIdHex: string;
  transactionIdHex: string;
  outputIndex: number;
  inclusionHeight: number;
  valueNanoErg: bigint;
  ergoTreeHex: string;
  assets: readonly NormalizedAsset[];
  registers: Readonly<Record<'R4' | 'R5' | 'R6', string>>;
  spentTransactionIdHex: string | null;
  spendingContext: Readonly<Record<string, string>> | null;
}

interface NormalizedIndexedTransaction {
  idHex: string;
  blockIdHex: string;
  inclusionHeight: number;
  inputs: unknown[];
  dataInputs: unknown[];
  outputs: unknown[];
}

const distinctSourceValidatedReconstructions = new WeakSet<object>();

export function assertAuthenticatedV2DupReconstructionProvenance(
  value: AuthenticatedV2DupReconstruction,
): void {
  if (
    !value
    || typeof value !== 'object'
    || value.distinctSourceAgreement !== true
    || !distinctSourceValidatedReconstructions.has(value)
  ) {
    throw new Error('distinct-source authenticated V2 DUP reconstruction provenance is missing');
  }
}

export async function reconstructAuthenticatedV2DupHistory(
  input: ReconstructAuthenticatedV2DupInput,
): Promise<AuthenticatedV2DupObservation> {
  const begin = input.source.beginAuthenticatedTrackerReconstruction;
  const end = input.source.endAuthenticatedTrackerReconstruction;
  if (Boolean(begin) !== Boolean(end)) {
    throw new Error('authenticated DUP reconstruction source budget hooks must be paired');
  }
  let started = false;
  try {
    if (begin) {
      begin.call(input.source);
      started = true;
    }
    return await reconstructAuthenticatedV2DupHistoryWithinBudget(input);
  } finally {
    if (started) end!.call(input.source);
  }
}

async function reconstructAuthenticatedV2DupHistoryWithinBudget(
  input: ReconstructAuthenticatedV2DupInput,
): Promise<AuthenticatedV2DupObservation> {
  const nftIdHex = fixedHex(input.duplicatePreventionNftIdHex, 32, 'DUP NFT id');
  const ergoTreeHex = variableHex(input.duplicatePreventionErgoTreeHex, 'DUP ErgoTree');
  const snapshotBefore = await captureSyncedSnapshot(input.source, 'initial');
  const rawBoxes = await input.source.getIndexedBoxesByTokenId(nftIdHex);
  if (!Array.isArray(rawBoxes) || rawBoxes.length === 0) {
    throw new Error('authenticated DUP singleton lineage is empty');
  }
  if (rawBoxes.length > AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES) {
    throw new Error(
      `authenticated DUP singleton lineage exceeds the `
      + `${AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES}-box operational bound`,
    );
  }
  const boxes = rawBoxes.map((value, index) => normalizeDupBox(
    value,
    index,
    nftIdHex,
    ergoTreeHex,
  ));
  const lineage = orderSingletonLineage(boxes);
  const genesis = lineage[0];
  const setup = normalizeIndexedTransaction(
    await input.source.getTransaction(genesis.transactionIdHex),
    genesis.transactionIdHex,
    'DUP setup transaction',
  );
  if (setup.inclusionHeight !== genesis.inclusionHeight) {
    throw new Error('DUP genesis inclusion height does not match its setup transaction');
  }
  if (setup.inputs.length !== 1 || setup.dataInputs.length !== 0 || setup.outputs.length < 2) {
    throw new Error('DUP setup transaction must have one input, no data inputs, and paired outputs');
  }
  if (normalizedBoxId(setup.inputs[0]) !== nftIdHex) {
    throw new Error('DUP NFT id must equal the setup transaction first input box id');
  }
  assertTransactionOutputMatches(setup.outputs[0], genesis, 0, 'DUP setup output');
  if (decodeCanonicalLongRegister(genesis.registers.R4, 'DUP genesis R4') !== 0n) {
    throw new Error('DUP genesis counter must be zero');
  }
  const genesisAvl = decodeCanonicalInsertAvl(genesis.registers.R5, 'DUP genesis R5');
  if (genesisAvl.digestHex !== EMPTY_AVL_DIGEST) {
    throw new Error('DUP genesis must use the canonical empty digest');
  }
  const authoritySigmaPropRegisterHex = genesis.registers.R6;
  decodeCanonicalDlogSigmaPropRegister(authoritySigmaPropRegisterHex, 'DUP genesis R6');

  const historyKeys: string[] = [];
  const transitions: ReconstructedAuthenticatedV2DupTransition[] = [];
  for (let index = 0; index < lineage.length - 1; index++) {
    const current = lineage[index];
    const successor = lineage[index + 1];
    if (!current.spentTransactionIdHex || !current.spendingContext) {
      throw new Error(`DUP lineage box ${current.boxIdHex} is missing its spending proof`);
    }
    if (current.spentTransactionIdHex !== successor.transactionIdHex) {
      throw new Error(`DUP lineage successor transaction mismatch after ${current.boxIdHex}`);
    }
    const expectedInputDigest = getDupTreeDigest(historyKeys);
    if (decodeCanonicalInsertAvl(current.registers.R5, 'DUP input R5').digestHex !== expectedInputDigest) {
      throw new Error('DUP input digest does not match the reconstructed history');
    }
    const transaction = normalizeIndexedTransaction(
      await input.source.getTransaction(current.spentTransactionIdHex),
      current.spentTransactionIdHex,
      'DUP settlement transaction',
    );
    if (transaction.inclusionHeight !== successor.inclusionHeight) {
      throw new Error('DUP successor inclusion height does not match its spending transaction');
    }
    const spendingHeaderRaw = await input.source.getBlockHeaderById(transaction.blockIdHex);
    if (spendingHeaderRaw === null) {
      throw new Error('DUP settlement transaction block header is unavailable');
    }
    const spendingHeader = normalizeHeader(spendingHeaderRaw, 'DUP settlement block header');
    if (
      spendingHeader.idHex !== transaction.blockIdHex
      || spendingHeader.height !== transaction.inclusionHeight
    ) {
      throw new Error('DUP settlement transaction does not match its observed block header');
    }
    if (
      transaction.inputs.length !== 2
      || transaction.dataInputs.length !== 1
      || (transaction.outputs.length !== 3 && transaction.outputs.length !== 4)
    ) {
      throw new Error('authenticated settlement transaction has an unsupported input/output shape');
    }
    if (normalizedBoxId(transaction.inputs[0]) !== current.boxIdHex) {
      throw new Error('DUP singleton must be settlement input 0');
    }
    const vaultInputBoxIdHex = requiredBoxId(transaction.inputs[1], 'settlement vault input');
    assertTransactionOutputMatches(transaction.outputs[0], successor, 0, 'DUP successor output');
    const txContext = normalizeContextExtension(
      record(transaction.inputs[0], 'DUP transaction input').spendingProof?.extension,
      'DUP transaction input context extension',
    );
    assertCanonicalEqual(current.spendingContext, txContext, 'DUP indexed and transaction contexts');
    exactKeys(current.spendingContext, ['0', '1', '2'], 'DUP spending context');
    const lookupProofHex = decodeBoundedCollByteRegister(
      current.spendingContext['0'],
      'DUP Var(0)',
      MAX_DUP_PROOF_BYTES,
    );
    const burnIdHex = fixedHex(
      decodeCollByteRegister(current.spendingContext['1'], 'DUP Var(1)'),
      32,
      'DUP burn id',
    );
    const insertProofHex = decodeBoundedCollByteRegister(
      current.spendingContext['2'],
      'DUP Var(2)',
      MAX_DUP_PROOF_BYTES,
    );
    if (historyKeys.includes(burnIdHex)) {
      throw new Error(`DUP lineage inserts duplicate burn id ${burnIdHex}`);
    }
    const expectedProof = insertLockRecord(historyKeys, burnIdHex);
    if (
      expectedProof.lookup_proof_hex !== lookupProofHex
      || expectedProof.insert_proof_hex !== insertProofHex
    ) {
      throw new Error('DUP observed proofs do not replay deterministically from reconstructed history');
    }
    historyKeys.push(burnIdHex);
    const successorDigestHex = getDupTreeDigest(historyKeys);
    if (
      expectedProof.new_digest_hex !== successorDigestHex
      || decodeCanonicalInsertAvl(successor.registers.R5, 'DUP successor R5').digestHex
        !== successorDigestHex
    ) {
      throw new Error('DUP successor digest does not match the reconstructed insertion');
    }
    const currentCounter = decodeCanonicalLongRegister(current.registers.R4, 'DUP input R4');
    const successorCounter = decodeCanonicalLongRegister(successor.registers.R4, 'DUP successor R4');
    if (successorCounter !== currentCounter + 1n) {
      throw new Error('DUP successor counter does not advance exactly once');
    }
    if (successor.registers.R6 !== authoritySigmaPropRegisterHex) {
      throw new Error('DUP successor changes the authorization metadata');
    }
    if (successor.valueNanoErg < current.valueNanoErg) {
      throw new Error('DUP successor reduces singleton value');
    }
    const payout = normalizeTransactionOutput(transaction.outputs[1], 'settlement payout output');
    if (payout.assets.length !== 0 || payout.valueNanoErg <= 0n) {
      throw new Error('settlement payout output must contain positive pure ERG');
    }
    const fee = normalizeTransactionOutput(
      transaction.outputs[transaction.outputs.length - 1],
      'settlement miner-fee output',
    );
    if (
      fee.assets.length !== 0
      || fee.ergoTreeHex !== MINER_FEE_TREE
      || fee.valueNanoErg < MIN_MINER_FEE
      || fee.valueNanoErg > MAX_MINER_FEE
    ) {
      throw new Error('settlement miner-fee output is outside the contract bounds');
    }
    transitions.push(Object.freeze({
      burnIdHex,
      spendingTransactionIdHex: transaction.idHex,
      spendingBlockIdHex: transaction.blockIdHex,
      spendingInclusionHeight: transaction.inclusionHeight,
      dupInputBoxIdHex: current.boxIdHex,
      dupSuccessorBoxIdHex: successor.boxIdHex,
      vaultInputBoxIdHex,
      vaultSuccessorBoxIdHex: transaction.outputs.length === 4
        ? requiredBoxId(transaction.outputs[2], 'settlement vault successor')
        : null,
      payoutBoxIdHex: payout.boxIdHex,
      payoutValueNanoErg: payout.valueNanoErg.toString(),
      minerFeeNanoErg: fee.valueNanoErg.toString(),
      successorDigestHex,
    }));
  }

  const tip = lineage[lineage.length - 1];
  const tipDigestHex = getDupTreeDigest(historyKeys);
  if (decodeCanonicalInsertAvl(tip.registers.R5, 'DUP tip R5').digestHex !== tipDigestHex) {
    throw new Error('DUP tip digest does not match the reconstructed history');
  }
  const tipCounter = decodeCanonicalLongRegister(tip.registers.R4, 'DUP tip R4');
  if (tipCounter !== BigInt(historyKeys.length)) {
    throw new Error('DUP tip counter does not equal reconstructed insertion count');
  }
  if (tip.registers.R6 !== authoritySigmaPropRegisterHex) {
    throw new Error('DUP tip changes the authorization metadata');
  }
  const canonicalTipRaw = await input.source.getBoxByIdOrNull(tip.boxIdHex);
  if (canonicalTipRaw === null) {
    throw new Error('authenticated DUP tip is not present in the canonical UTXO set');
  }
  const canonicalTip = normalizeCurrentDupBox(
    canonicalTipRaw,
    nftIdHex,
    ergoTreeHex,
    'canonical DUP tip',
  );
  assertDupPayloadEqual(tip, canonicalTip, 'indexed and canonical DUP tip');
  const binaryRaw = await input.source.getBoxBinaryByIdOrNull(tip.boxIdHex);
  const tipSigmaSerializedHex = await validateCanonicalBinary(
    canonicalTipRaw,
    binaryRaw,
    tip,
    'canonical DUP tip',
  );
  const snapshotAfter = await captureSyncedSnapshot(input.source, 'final');
  assertSameSnapshot(snapshotBefore, snapshotAfter);

  const withoutDigest = {
    duplicatePreventionNftIdHex: nftIdHex,
    duplicatePreventionErgoTreeHex: ergoTreeHex,
    genesisBoxIdHex: genesis.boxIdHex,
    tipBoxIdHex: tip.boxIdHex,
    tipDigestHex,
    tipCounter: tipCounter.toString(),
    authoritySigmaPropRegisterHex,
    historyKeys: Object.freeze([...historyKeys]),
    transitions: Object.freeze(transitions),
    tipSigmaSerializedHex,
    tipSigmaSerializedSha256Hex: sha256Hex(Buffer.from(tipSigmaSerializedHex, 'hex')),
    observedTip: Object.freeze({ ...snapshotAfter.bestHeader }),
    indexedHeight: snapshotAfter.indexedHeight,
    fullHeight: snapshotAfter.fullHeight,
  };
  return Object.freeze({
    ...withoutDigest,
    observationDigestHex: sha256Hex(Buffer.from(canonicalJson(withoutDigest), 'utf8')),
  });
}

export async function reconstructAuthenticatedV2DupHistoryFromDistinctSources(
  input: ReconstructAuthenticatedV2DupFromDistinctSourcesInput,
): Promise<AuthenticatedV2DupReconstruction> {
  const primarySourceId = normalizedSourceId(
    input.primarySource.observationSourceId,
    'primary authenticated DUP source identity',
  );
  const witnessSourceId = normalizedSourceId(
    input.witnessSource.observationSourceId,
    'witness authenticated DUP source identity',
  );
  if (input.primarySource === input.witnessSource || primarySourceId === witnessSourceId) {
    throw new Error('authenticated DUP reconstruction requires two distinct source identities');
  }
  const common = {
    duplicatePreventionNftIdHex: input.duplicatePreventionNftIdHex,
    duplicatePreventionErgoTreeHex: input.duplicatePreventionErgoTreeHex,
  };
  const [primaryResult, witnessResult] = await Promise.allSettled([
    reconstructAuthenticatedV2DupHistory({ source: input.primarySource, ...common }),
    reconstructAuthenticatedV2DupHistory({ source: input.witnessSource, ...common }),
  ]);
  if (primaryResult.status === 'rejected') throw primaryResult.reason;
  if (witnessResult.status === 'rejected') throw witnessResult.reason;
  const primary = primaryResult.value;
  const witness = witnessResult.value;
  if (canonicalJson(primary) !== canonicalJson(witness)) {
    throw new Error('distinct-source authenticated DUP reconstructions disagree');
  }
  const reconstruction = Object.freeze({
    ...primary,
    distinctSourceAgreement: true as const,
  });
  distinctSourceValidatedReconstructions.add(reconstruction);
  return reconstruction;
}

function normalizeDupBox(
  value: unknown,
  index: number,
  nftIdHex: string,
  ergoTreeHex: string,
): NormalizedDupBox {
  const raw = record(value, `indexed DUP box ${index}`);
  const boxIdHex = fixedHex(raw.boxId, 32, `indexed DUP box ${index} id`);
  const transactionIdHex = fixedHex(
    raw.transactionId,
    32,
    `indexed DUP box ${index} transaction id`,
  );
  const outputIndex = nonnegativeSafeInteger(raw.index, `indexed DUP box ${index} output index`);
  if (outputIndex !== 0) throw new Error(`indexed DUP box ${boxIdHex} must be output 0`);
  const inclusionHeight = nonnegativeSafeInteger(
    raw.inclusionHeight,
    `indexed DUP box ${index} inclusion height`,
  );
  const normalized = normalizeDupPayload(raw, nftIdHex, ergoTreeHex, `indexed DUP box ${boxIdHex}`);
  const spentTransactionIdHex = raw.spentTransactionId === null || raw.spentTransactionId === undefined
    ? null
    : fixedHex(raw.spentTransactionId, 32, `indexed DUP box ${boxIdHex} spending tx id`);
  const spendingContext = spentTransactionIdHex === null
    ? null
    : normalizeContextExtension(
      record(raw.spendingProof, `indexed DUP box ${boxIdHex} spending proof`).extension,
      `indexed DUP box ${boxIdHex} context extension`,
    );
  if (spentTransactionIdHex === null && raw.spendingProof !== null && raw.spendingProof !== undefined) {
    throw new Error(`unspent DUP box ${boxIdHex} must not contain a spending proof`);
  }
  return {
    raw,
    boxIdHex,
    transactionIdHex,
    outputIndex,
    inclusionHeight,
    ...normalized,
    spentTransactionIdHex,
    spendingContext,
  };
}

function normalizeCurrentDupBox(
  value: unknown,
  nftIdHex: string,
  ergoTreeHex: string,
  label: string,
): NormalizedDupBox {
  const raw = record(value, label);
  if (raw.spentTransactionId !== null && raw.spentTransactionId !== undefined) {
    throw new Error(`${label} must be unspent`);
  }
  if (raw.spendingProof !== null && raw.spendingProof !== undefined) {
    throw new Error(`${label} must not expose a spending proof`);
  }
  return {
    raw,
    boxIdHex: fixedHex(raw.boxId, 32, `${label} id`),
    transactionIdHex: fixedHex(raw.transactionId, 32, `${label} transaction id`),
    outputIndex: nonnegativeSafeInteger(raw.index, `${label} output index`),
    inclusionHeight: nonnegativeSafeInteger(raw.creationHeight, `${label} creation height`),
    ...normalizeDupPayload(raw, nftIdHex, ergoTreeHex, label),
    spentTransactionIdHex: null,
    spendingContext: null,
  };
}

function normalizeDupPayload(
  raw: Record<string, any>,
  nftIdHex: string,
  ergoTreeHex: string,
  label: string,
) {
  const actualTree = variableHex(raw.ergoTree, `${label} ErgoTree`);
  if (actualTree !== ergoTreeHex) throw new Error(`${label} uses an unexpected ErgoTree`);
  const assets = normalizeAssets(raw.assets, `${label} assets`);
  if (
    assets.length !== 1
    || assets[0].tokenIdHex !== nftIdHex
    || assets[0].amount !== 1n
  ) {
    throw new Error(`${label} must preserve exactly one configured DUP NFT`);
  }
  const registersRaw = record(raw.additionalRegisters, `${label} registers`);
  exactKeys(registersRaw, ['R4', 'R5', 'R6'], `${label} registers`);
  const registers = Object.freeze({
    R4: variableHex(registersRaw.R4, `${label} R4`),
    R5: variableHex(registersRaw.R5, `${label} R5`),
    R6: variableHex(registersRaw.R6, `${label} R6`),
  });
  decodeCanonicalLongRegister(registers.R4, `${label} R4`);
  decodeCanonicalInsertAvl(registers.R5, `${label} R5`);
  decodeCanonicalDlogSigmaPropRegister(registers.R6, `${label} R6`);
  return {
    valueNanoErg: positiveBigInt(raw.value, `${label} value`),
    ergoTreeHex: actualTree,
    assets,
    registers,
  };
}

function orderSingletonLineage(boxes: NormalizedDupBox[]): NormalizedDupBox[] {
  const byBoxId = new Map<string, NormalizedDupBox>();
  const byCreationTx = new Map<string, NormalizedDupBox>();
  for (const box of boxes) {
    if (byBoxId.has(box.boxIdHex)) throw new Error(`duplicate DUP box ${box.boxIdHex}`);
    if (byCreationTx.has(box.transactionIdHex)) {
      throw new Error(`multiple DUP NFT outputs were created by transaction ${box.transactionIdHex}`);
    }
    byBoxId.set(box.boxIdHex, box);
    byCreationTx.set(box.transactionIdHex, box);
  }
  const tips = boxes.filter(box => box.spentTransactionIdHex === null);
  if (tips.length !== 1) {
    throw new Error(`authenticated DUP lineage must have exactly one unspent tip, got ${tips.length}`);
  }
  const predecessorCount = new Map<string, number>();
  for (const box of boxes) {
    if (!box.spentTransactionIdHex) continue;
    const successor = byCreationTx.get(box.spentTransactionIdHex);
    if (!successor) {
      throw new Error(`DUP successor for transaction ${box.spentTransactionIdHex} is missing`);
    }
    predecessorCount.set(successor.boxIdHex, (predecessorCount.get(successor.boxIdHex) ?? 0) + 1);
  }
  const roots = boxes.filter(box => (predecessorCount.get(box.boxIdHex) ?? 0) === 0);
  if (roots.length !== 1) {
    throw new Error(`authenticated DUP lineage must have exactly one root, got ${roots.length}`);
  }
  const ordered: NormalizedDupBox[] = [];
  const visited = new Set<string>();
  let cursor: NormalizedDupBox | undefined = roots[0];
  while (cursor) {
    if (visited.has(cursor.boxIdHex)) throw new Error('authenticated DUP lineage contains a cycle');
    visited.add(cursor.boxIdHex);
    ordered.push(cursor);
    cursor = cursor.spentTransactionIdHex
      ? byCreationTx.get(cursor.spentTransactionIdHex)
      : undefined;
  }
  if (ordered.length !== boxes.length || ordered[ordered.length - 1].boxIdHex !== tips[0].boxIdHex) {
    throw new Error('authenticated DUP lineage is disconnected');
  }
  return ordered;
}

function normalizeIndexedTransaction(
  value: unknown,
  expectedTxIdHex: string,
  label: string,
): NormalizedIndexedTransaction {
  const raw = record(value, label);
  const idHex = fixedHex(raw.id, 32, `${label} id`);
  if (idHex !== expectedTxIdHex) throw new Error(`${label} id mismatch`);
  if (!Array.isArray(raw.inputs) || !Array.isArray(raw.outputs) || !Array.isArray(raw.dataInputs)) {
    throw new Error(`${label} must expose input, data-input, and output arrays`);
  }
  return {
    idHex,
    blockIdHex: fixedHex(raw.blockId, 32, `${label} block id`),
    inclusionHeight: nonnegativeSafeInteger(raw.inclusionHeight, `${label} inclusion height`),
    inputs: raw.inputs,
    dataInputs: raw.dataInputs,
    outputs: raw.outputs,
  };
}

function assertTransactionOutputMatches(
  value: unknown,
  expected: NormalizedDupBox,
  expectedIndex: number,
  label: string,
): void {
  const raw = record(value, label);
  if (requiredBoxId(raw, label) !== expected.boxIdHex) throw new Error(`${label} box id mismatch`);
  if (fixedHex(raw.transactionId, 32, `${label} transaction id`) !== expected.transactionIdHex) {
    throw new Error(`${label} transaction id mismatch`);
  }
  if (nonnegativeSafeInteger(raw.index, `${label} index`) !== expectedIndex) {
    throw new Error(`${label} index mismatch`);
  }
  const payload = normalizeDupPayload(
    raw,
    expected.assets[0].tokenIdHex,
    expected.ergoTreeHex,
    label,
  );
  assertCanonicalEqual(
    comparableDupPayload(payload),
    comparableDupPayload(expected),
    `${label} payload`,
  );
}

function normalizeTransactionOutput(value: unknown, label: string) {
  const raw = record(value, label);
  return {
    boxIdHex: requiredBoxId(raw, label),
    valueNanoErg: positiveBigInt(raw.value, `${label} value`),
    ergoTreeHex: variableHex(raw.ergoTree, `${label} ErgoTree`),
    assets: normalizeAssets(raw.assets, `${label} assets`),
  };
}

function normalizeAssets(value: unknown, label: string): readonly NormalizedAsset[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const assets = value.map((entry, index) => {
    const raw = record(entry, `${label} item ${index}`);
    return Object.freeze({
      tokenIdHex: fixedHex(raw.tokenId, 32, `${label} item ${index} token id`),
      amount: positiveBigInt(raw.amount, `${label} item ${index} amount`),
    });
  });
  if (new Set(assets.map(asset => asset.tokenIdHex)).size !== assets.length) {
    throw new Error(`${label} contains duplicate token IDs`);
  }
  return Object.freeze(assets);
}

function decodeCanonicalInsertAvl(registerHex: string, label: string) {
  const clean = variableHex(registerHex, label);
  if (clean.length !== 76 || !clean.startsWith('64')) {
    throw new Error(`${label} must be a canonical AvlTree register`);
  }
  if (clean.slice(70, 72) !== '20' || clean.slice(72) !== '0101') {
    throw new Error(`${label} must use 32-byte keys and one-byte values`);
  }
  const flags = Number.parseInt(clean.slice(68, 70), 16);
  if ((flags & 0x01) === 0) throw new Error(`${label} must permit inserts`);
  return { digestHex: clean.slice(2, 68), flags };
}

async function validateCanonicalBinary(
  jsonValue: unknown,
  binaryValue: unknown,
  expected: NormalizedDupBox,
  label: string,
): Promise<string> {
  if (binaryValue === null) throw new Error(`${label} canonical binary is unavailable`);
  const binary = record(binaryValue, `${label} binary response`);
  const sigmaSerializedHex = boundedVariableHex(
    binary.bytes,
    `${label} binary bytes`,
    MAX_CANONICAL_BOX_BYTES,
  );
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  let parsed: any;
  try {
    parsed = wasm.ErgoBox.from_json(JSON.stringify(jsonValue));
  } catch (error: any) {
    throw new Error(`${label} JSON is not a canonical EIP-12 box: ${error?.message ?? String(error)}`);
  }
  try {
    const serialized = Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
    if (serialized !== sigmaSerializedHex) {
      throw new Error(`${label} JSON and canonical binary observations do not match`);
    }
    const canonical = normalizeCurrentDupBox(
      parsed.to_js_eip12(),
      expected.assets[0].tokenIdHex,
      expected.ergoTreeHex,
      `${label} canonical JSON`,
    );
    assertDupPayloadEqual(expected, canonical, `${label} canonical payload`);
  } finally {
    parsed.free?.();
  }
  return sigmaSerializedHex;
}

async function captureSyncedSnapshot(
  source: AuthenticatedSpvTrackerChainSource,
  label: string,
): Promise<SyncedSnapshot> {
  const progress = record(await source.getIndexedHeight(), `${label} index progress`);
  const indexedHeight = nonnegativeSafeInteger(progress.indexedHeight, `${label} indexed height`);
  const fullHeight = nonnegativeSafeInteger(progress.fullHeight, `${label} full height`);
  if (indexedHeight !== fullHeight) {
    throw new Error(`Ergo extra index is not synchronized: ${indexedHeight} != ${fullHeight}`);
  }
  const bestHeader = normalizeHeader(await source.getBestHeader(), `${label} best header`);
  if (bestHeader.height !== fullHeight) {
    throw new Error('Ergo best header does not identify the indexed full height');
  }
  return { bestHeader, indexedHeight, fullHeight };
}

function normalizeHeader(value: unknown, label: string): NormalizedHeader {
  const raw = record(value, label);
  return {
    idHex: fixedHex(raw.id, 32, `${label} id`),
    parentIdHex: fixedHex(raw.parentId, 32, `${label} parent id`),
    height: nonnegativeSafeInteger(raw.height, `${label} height`),
    extensionRootHex: fixedHex(raw.extensionRoot, 32, `${label} extension root`),
  };
}

function assertSameSnapshot(before: SyncedSnapshot, after: SyncedSnapshot): void {
  if (canonicalJson(before) !== canonicalJson(after)) {
    throw new Error('Ergo full-block and extra-index snapshot changed during DUP reconstruction');
  }
}

function normalizeContextExtension(value: unknown, label: string): Readonly<Record<string, string>> {
  const raw = record(value, label);
  if (Object.keys(raw).length > 3) {
    throw new Error(`${label} exceeds the three-variable DUP schema`);
  }
  const entries = Object.entries(raw).sort(([left], [right]) => left.localeCompare(right));
  return Object.freeze(Object.fromEntries(entries.map(([key, entry]) => [
    key,
    boundedVariableHex(entry, `${label} Var(${key})`, MAX_DUP_PROOF_BYTES + 16),
  ])));
}

function normalizedSourceId(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const normalized = value.trim();
  if (
    normalized.length === 0
    || normalized.length > 2_048
    || /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

function assertDupPayloadEqual(left: NormalizedDupBox, right: NormalizedDupBox, label: string): void {
  if (
    left.boxIdHex !== right.boxIdHex
    || left.transactionIdHex !== right.transactionIdHex
    || left.outputIndex !== right.outputIndex
    || canonicalJson(comparableDupPayload(left)) !== canonicalJson(comparableDupPayload(right))
  ) {
    throw new Error(`${label} does not match`);
  }
}

function comparableDupPayload(value: Pick<NormalizedDupBox, 'valueNanoErg' | 'ergoTreeHex' | 'assets' | 'registers'>) {
  return {
    valueNanoErg: value.valueNanoErg.toString(),
    ergoTreeHex: value.ergoTreeHex,
    assets: value.assets.map(asset => ({
      tokenIdHex: asset.tokenIdHex,
      amount: asset.amount.toString(),
    })),
    registers: value.registers,
  };
}

function assertCanonicalEqual(left: unknown, right: unknown, label: string): void {
  if (canonicalJson(left) !== canonicalJson(right)) throw new Error(`${label} do not match`);
}

function requiredBoxId(value: unknown, label: string): string {
  const id = normalizedBoxId(value);
  if (id === null) throw new Error(`${label} is missing a canonical box id`);
  return id;
}

function normalizedBoxId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  try {
    return fixedHex((value as any).boxId, 32, 'transaction box id');
  } catch {
    return null;
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) {
    throw new Error(`${label} fields do not match the canonical schema`);
  }
}

function record(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const clean = variableHex(value, label);
  if (clean.length !== bytes * 2) throw new Error(`${label} must be ${bytes} bytes`);
  return clean;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error(`${label} must be nonempty even-length hex`);
  }
  return clean.toLowerCase();
}

function boundedVariableHex(value: unknown, label: string, maxBytes: number): string {
  const clean = variableHex(value, label);
  if (clean.length / 2 > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`);
  return clean;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return parsed;
}

function positiveBigInt(value: unknown, label: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(String(value));
  } catch {
    throw new Error(`${label} must be a positive integer`);
  }
  if (parsed <= 0n) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortCanonical(value));
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortCanonical(entry)]),
    );
  }
  return value;
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
