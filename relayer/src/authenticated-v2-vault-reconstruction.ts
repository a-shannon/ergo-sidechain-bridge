/**
 * Reconstruct the authenticated V2 settlement-vault forest from the complete
 * indexed address history and the current UTXO set. The result is diagnostic
 * process-local provenance only; it cannot authorize a settlement candidate.
 */

import { createHash } from 'crypto';

import {
  assertAuthenticatedV2DupReconstructionProvenance,
  type AuthenticatedV2DupReconstruction,
  type ReconstructedAuthenticatedV2DupTransition,
} from './authenticated-v2-dup-reconstruction.js';
import type { AuthenticatedSpvTrackerChainSource } from './authenticated-spv-tracker-reconstruction.js';
import {
  decodeBoundedCollByteRegister,
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  MINER_FEE_TREE,
} from './ergo-encoding.js';

export const AUTHENTICATED_V2_VAULT_RECONSTRUCTION_SCHEMA =
  'e2s.authenticated-v2-vault-reconstruction.v1';
export const AUTHENTICATED_V2_VAULT_MAX_BOXES = 4_096;

const MAX_ERGO_TREE_BYTES = 32 * 1024;
const MAX_REGISTER_BYTES = 32 * 1024;
const MAX_PROVENANCE_BYTES = 4 * 1024;
const MAX_SERIALIZED_BOX_BYTES = 1024 * 1024;
const ALLOWED_NETWORKS = new Set(['local', 'development', 'devnet', 'testnet']);

export interface AuthenticatedV2VaultChainSource extends AuthenticatedSpvTrackerChainSource {
  readonly observationSourceId: string;
  getInfo(): Promise<unknown>;
  getIndexedBoxesByAddress(address: string): Promise<unknown[]>;
  getUnspentBoxesByAddress(address: string): Promise<unknown[]>;
  getBoxBinaryByIdOrNull(boxId: string): Promise<unknown | null>;
}

export interface AuthenticatedV2SettlementVaultBox {
  readonly boxIdHex: string;
  readonly transactionIdHex: string;
  readonly outputIndex: number;
  readonly creationHeight: number;
  readonly valueNanoErg: string;
  readonly ergoTreeHex: string;
  readonly assets: readonly [];
  readonly additionalRegisters: Readonly<Record<'R4' | 'R5' | 'R6' | 'R7', string>>;
  readonly depositIdHex: string;
  readonly targetEvmAddressHex: string;
  readonly originalAmountNanoErg: string;
  readonly provenanceHex: string;
  readonly spentTransactionIdHex: string | null;
  readonly sigmaSerializedHex: string;
  readonly sigmaSerializedSha256Hex: string;
  readonly currentUtxoBinaryMatched: boolean;
}

export interface AuthenticatedV2SettlementVaultTransition {
  readonly burnIdHex: string;
  readonly spendingTransactionIdHex: string;
  readonly inputBoxIdHex: string;
  readonly successorBoxIdHex: string | null;
  readonly payoutBoxIdHex: string;
  readonly payoutValueNanoErg: string;
  readonly minerFeeNanoErg: string;
}

export interface AuthenticatedV2SettlementVaultSnapshot {
  readonly indexedHeight: number;
  readonly fullHeight: number;
  readonly bestHeader: Readonly<{
    idHex: string;
    parentIdHex: string;
    height: number;
    extensionRootHex: string;
  }>;
}

export interface AuthenticatedV2VaultReconstructionObservation {
  readonly schema: typeof AUTHENTICATED_V2_VAULT_RECONSTRUCTION_SCHEMA;
  readonly network: string;
  readonly vaultAddress: string;
  readonly vaultErgoTreeHex: string;
  readonly duplicatePreventionObservationDigestHex: string;
  readonly duplicatePreventionTipBoxIdHex: string;
  readonly stableSnapshot: AuthenticatedV2SettlementVaultSnapshot;
  readonly boxes: readonly AuthenticatedV2SettlementVaultBox[];
  readonly currentUnspentBoxIdsHex: readonly string[];
  readonly rootBoxIdsHex: readonly string[];
  readonly unresolvedRootProvenanceBoxIdsHex: readonly string[];
  readonly transitions: readonly AuthenticatedV2SettlementVaultTransition[];
  readonly observationDigestHex: string;
}

export interface AuthenticatedV2VaultReconstruction
  extends AuthenticatedV2VaultReconstructionObservation {
  readonly observedAt: string;
  readonly sources: Readonly<{ primary: string; witness: string }>;
  readonly distinctSourceAgreement: true;
  readonly boundary: Readonly<{
    completeIndexedAddressHistoryMatched: true;
    currentUtxoSetAndCanonicalBinaryMatched: true;
    duplicatePreventionLineageBoundEverySpend: true;
    sameErgoSnapshotAsDuplicatePreventionHistory: true;
    rootCreationProvenanceRequiresSeparateProof: true;
    localPersistenceIsNotAuthority: true;
    noCandidateCheckSignatureSubmissionOrBroadcastAuthority: true;
    distinctOriginsDoNotProveIndependentOperation: true;
  }>;
}

export interface ReconstructAuthenticatedV2VaultForestInput {
  readonly primarySource: AuthenticatedV2VaultChainSource;
  readonly witnessSource: AuthenticatedV2VaultChainSource;
  readonly expectedNetwork: string;
  readonly vaultAddress: string;
  readonly vaultErgoTreeHex: string;
  readonly duplicatePrevention: AuthenticatedV2DupReconstruction;
  readonly now?: () => Date;
}

interface NormalizedTransaction {
  readonly idHex: string;
  readonly inputs: readonly string[];
  readonly dataInputs: readonly string[];
  readonly outputs: readonly NormalizedOutput[];
}

interface NormalizedOutput {
  readonly boxIdHex: string;
  readonly valueNanoErg: bigint;
  readonly ergoTreeHex: string;
  readonly assets: readonly { tokenIdHex: string; amount: bigint }[];
}

const validatedVaultReconstructions = new WeakSet<object>();

export function assertAuthenticatedV2VaultReconstructionProvenance(
  value: AuthenticatedV2VaultReconstruction,
): void {
  if (
    !value
    || typeof value !== 'object'
    || value.distinctSourceAgreement !== true
    || !validatedVaultReconstructions.has(value)
  ) {
    throw new Error('distinct-source authenticated V2 vault reconstruction provenance is missing');
  }
}

export async function reconstructAuthenticatedV2VaultForestFromDistinctSources(
  input: ReconstructAuthenticatedV2VaultForestInput,
): Promise<AuthenticatedV2VaultReconstruction> {
  assertAuthenticatedV2DupReconstructionProvenance(input.duplicatePrevention);
  if (input.primarySource === input.witnessSource) {
    throw new Error('vault reconstruction requires distinct source instances');
  }
  const primarySourceId = normalizedSourceId(
    input.primarySource.observationSourceId,
    'primary vault source ID',
  );
  const witnessSourceId = normalizedSourceId(
    input.witnessSource.observationSourceId,
    'witness vault source ID',
  );
  if (primarySourceId === witnessSourceId) {
    throw new Error('vault reconstruction requires distinct configured source identities');
  }
  const expectedNetwork = normalizedNetwork(input.expectedNetwork, 'expected vault source');
  const vaultAddress = normalizedAddress(input.vaultAddress, 'settlement vault address');
  const vaultErgoTreeHex = variableHex(
    input.vaultErgoTreeHex,
    MAX_ERGO_TREE_BYTES,
    'settlement vault ErgoTree',
  );
  const sourceInputs = [input.primarySource, input.witnessSource] as const;
  for (const [index, source] of sourceInputs.entries()) {
    if (Boolean(source.beginAuthenticatedTrackerReconstruction)
      !== Boolean(source.endAuthenticatedTrackerReconstruction)) {
      throw new Error(`vault source ${index} reconstruction budget hooks must be paired`);
    }
  }

  const started: boolean[] = [false, false];
  let primary: AuthenticatedV2VaultReconstructionObservation;
  let witness: AuthenticatedV2VaultReconstructionObservation;
  try {
    for (const [index, source] of sourceInputs.entries()) {
      source.beginAuthenticatedTrackerReconstruction?.();
      started[index] = Boolean(source.beginAuthenticatedTrackerReconstruction);
    }
    const [primaryResult, witnessResult] = await Promise.allSettled([
      reconstructVaultObservation(
        input.primarySource,
        expectedNetwork,
        vaultAddress,
        vaultErgoTreeHex,
        input.duplicatePrevention,
      ),
      reconstructVaultObservation(
        input.witnessSource,
        expectedNetwork,
        vaultAddress,
        vaultErgoTreeHex,
        input.duplicatePrevention,
      ),
    ]);
    if (primaryResult.status === 'rejected') throw primaryResult.reason;
    if (witnessResult.status === 'rejected') throw witnessResult.reason;
    primary = primaryResult.value;
    witness = witnessResult.value;
  } finally {
    const endErrors: unknown[] = [];
    for (let index = sourceInputs.length - 1; index >= 0; index -= 1) {
      if (!started[index]) continue;
      try {
        sourceInputs[index].endAuthenticatedTrackerReconstruction!();
      } catch (error) {
        endErrors.push(error);
      }
    }
    if (endErrors.length > 0) throw endErrors[0];
  }

  if (canonicalJson(primary) !== canonicalJson(witness)) {
    throw new Error('distinct-source authenticated V2 vault reconstructions disagree');
  }
  const now = input.now ?? (() => new Date());
  const observedAtValue = now();
  if (!(observedAtValue instanceof Date) || Number.isNaN(observedAtValue.getTime())) {
    throw new Error('vault reconstruction clock must return a valid Date');
  }
  const reconstruction = deepFreeze({
    ...primary,
    observedAt: observedAtValue.toISOString(),
    sources: { primary: primarySourceId, witness: witnessSourceId },
    distinctSourceAgreement: true as const,
    boundary: {
      completeIndexedAddressHistoryMatched: true as const,
      currentUtxoSetAndCanonicalBinaryMatched: true as const,
      duplicatePreventionLineageBoundEverySpend: true as const,
      sameErgoSnapshotAsDuplicatePreventionHistory: true as const,
      rootCreationProvenanceRequiresSeparateProof: true as const,
      localPersistenceIsNotAuthority: true as const,
      noCandidateCheckSignatureSubmissionOrBroadcastAuthority: true as const,
      distinctOriginsDoNotProveIndependentOperation: true as const,
    },
  });
  validatedVaultReconstructions.add(reconstruction);
  return reconstruction;
}

async function reconstructVaultObservation(
  source: AuthenticatedV2VaultChainSource,
  expectedNetwork: string,
  vaultAddress: string,
  vaultErgoTreeHex: string,
  duplicatePrevention: AuthenticatedV2DupReconstruction,
): Promise<AuthenticatedV2VaultReconstructionObservation> {
  const networkBefore = await readNetwork(source, 'pre-reconstruction');
  if (networkBefore !== expectedNetwork) {
    throw new Error(`expected vault source network ${expectedNetwork} but observed ${networkBefore}`);
  }
  const snapshotBefore = await captureSnapshot(source, 'pre-reconstruction');
  const duplicatePreventionTip = duplicatePrevention.observedTip;
  if (canonicalJson(snapshotBefore.bestHeader) !== canonicalJson({
    idHex: fixedHex(duplicatePreventionTip.idHex, 32, 'DUP observed tip ID'),
    parentIdHex: fixedHex(duplicatePreventionTip.parentIdHex, 32, 'DUP observed parent ID'),
    height: nonnegativeSafeInteger(duplicatePreventionTip.height, 'DUP observed tip height'),
    extensionRootHex: fixedHex(
      duplicatePreventionTip.extensionRootHex,
      32,
      'DUP observed extension root',
    ),
  })) {
    throw new Error('vault reconstruction snapshot does not match authenticated DUP history');
  }
  const [indexedRaw, currentRaw] = await Promise.all([
    source.getIndexedBoxesByAddress(vaultAddress),
    source.getUnspentBoxesByAddress(vaultAddress),
  ]);
  if (!Array.isArray(indexedRaw) || !Array.isArray(currentRaw)) {
    throw new Error('vault address observations must be arrays');
  }
  if (indexedRaw.length > AUTHENTICATED_V2_VAULT_MAX_BOXES) {
    throw new Error('indexed vault history exceeds the operational box bound');
  }
  if (currentRaw.length > AUTHENTICATED_V2_VAULT_MAX_BOXES) {
    throw new Error('current vault set exceeds the operational box bound');
  }

  const boxes = await Promise.all(indexedRaw.map((value, index) => normalizeIndexedVaultBox(
    value,
    index,
    vaultErgoTreeHex,
    snapshotBefore.fullHeight,
  )));
  boxes.sort((left, right) => left.boxIdHex.localeCompare(right.boxIdHex));
  assertUniqueIds(boxes.map(box => box.boxIdHex), 'indexed vault box');
  const byId = new Map(boxes.map(box => [box.boxIdHex, box] as const));

  const currentObserved = await Promise.all(currentRaw.map(async (value, index) => {
    const preliminary = await normalizeCurrentVaultBox(
      value,
      null,
      index,
      vaultErgoTreeHex,
      snapshotBefore.fullHeight,
    );
    const binary = await source.getBoxBinaryByIdOrNull(preliminary.boxIdHex);
    return normalizeCurrentVaultBox(
      value,
      binary,
      index,
      vaultErgoTreeHex,
      snapshotBefore.fullHeight,
    );
  }));
  currentObserved.sort((left, right) => left.boxIdHex.localeCompare(right.boxIdHex));
  assertUniqueIds(currentObserved.map(box => box.boxIdHex), 'current vault box');

  const expectedCurrentIds = boxes
    .filter(box => box.spentTransactionIdHex === null)
    .map(box => box.boxIdHex)
    .sort();
  const observedCurrentIds = currentObserved.map(box => box.boxIdHex);
  if (canonicalJson(expectedCurrentIds) !== canonicalJson(observedCurrentIds)) {
    throw new Error('indexed vault tips and current UTXO set disagree');
  }
  for (const current of currentObserved) {
    const indexed = byId.get(current.boxIdHex);
    if (!indexed) throw new Error(`current vault ${current.boxIdHex} is absent from indexed history`);
    assertExactVaultBox(indexed, current, `current vault ${current.boxIdHex}`);
    byId.set(current.boxIdHex, current);
  }

  const transitions = await validateSettlementTransitions(
    source,
    boxes,
    byId,
    duplicatePrevention.transitions,
  );
  const successorIds = new Set(transitions
    .map(transition => transition.successorBoxIdHex)
    .filter((value): value is string => value !== null));
  const rootBoxIdsHex = boxes
    .map(box => box.boxIdHex)
    .filter(boxId => !successorIds.has(boxId))
    .sort();

  const snapshotAfter = await captureSnapshot(source, 'post-reconstruction');
  if (canonicalJson(snapshotBefore) !== canonicalJson(snapshotAfter)) {
    throw new Error('Ergo snapshot changed during settlement-vault reconstruction');
  }
  const networkAfter = await readNetwork(source, 'post-reconstruction');
  if (networkBefore !== networkAfter) {
    throw new Error('Ergo node network identity changed during vault reconstruction');
  }

  const withoutDigest: Omit<
    AuthenticatedV2VaultReconstructionObservation,
    'observationDigestHex'
  > = {
    schema: AUTHENTICATED_V2_VAULT_RECONSTRUCTION_SCHEMA,
    network: networkBefore,
    vaultAddress,
    vaultErgoTreeHex,
    duplicatePreventionObservationDigestHex: fixedHex(
      duplicatePrevention.observationDigestHex,
      32,
      'DUP observation digest',
    ),
    duplicatePreventionTipBoxIdHex: fixedHex(
      duplicatePrevention.tipBoxIdHex,
      32,
      'DUP tip box ID',
    ),
    stableSnapshot: snapshotBefore,
    boxes: [...byId.values()].sort((left, right) => left.boxIdHex.localeCompare(right.boxIdHex)),
    currentUnspentBoxIdsHex: observedCurrentIds,
    rootBoxIdsHex,
    unresolvedRootProvenanceBoxIdsHex: rootBoxIdsHex,
    transitions,
  };
  return deepFreeze({
    ...withoutDigest,
    observationDigestHex: sha256Hex(Buffer.from(canonicalJson(withoutDigest), 'utf8')),
  });
}

async function validateSettlementTransitions(
  source: AuthenticatedV2VaultChainSource,
  boxes: readonly AuthenticatedV2SettlementVaultBox[],
  byId: ReadonlyMap<string, AuthenticatedV2SettlementVaultBox>,
  dupTransitions: readonly ReconstructedAuthenticatedV2DupTransition[],
): Promise<readonly AuthenticatedV2SettlementVaultTransition[]> {
  const transitionByInput = new Map<string, ReconstructedAuthenticatedV2DupTransition>();
  const successorIds = new Set<string>();
  for (const transition of dupTransitions) {
    if (transitionByInput.has(transition.vaultInputBoxIdHex)) {
      throw new Error(`vault input ${transition.vaultInputBoxIdHex} is consumed more than once`);
    }
    transitionByInput.set(transition.vaultInputBoxIdHex, transition);
    if (transition.vaultSuccessorBoxIdHex !== null) {
      if (successorIds.has(transition.vaultSuccessorBoxIdHex)) {
        throw new Error(`vault successor ${transition.vaultSuccessorBoxIdHex} has multiple parents`);
      }
      successorIds.add(transition.vaultSuccessorBoxIdHex);
    }
  }
  const spent = boxes.filter(box => box.spentTransactionIdHex !== null);
  if (spent.length !== dupTransitions.length) {
    throw new Error('indexed spent-vault count does not match authenticated DUP settlement count');
  }

  const normalized: AuthenticatedV2SettlementVaultTransition[] = [];
  for (const [index, transition] of dupTransitions.entries()) {
    const inputBoxIdHex = fixedHex(
      transition.vaultInputBoxIdHex,
      32,
      `vault transition ${index} input ID`,
    );
    const inputBox = byId.get(inputBoxIdHex);
    if (!inputBox) throw new Error(`vault transition input ${inputBoxIdHex} is absent from history`);
    const spendingTransactionIdHex = fixedHex(
      transition.spendingTransactionIdHex,
      32,
      `vault transition ${index} transaction ID`,
    );
    if (inputBox.spentTransactionIdHex !== spendingTransactionIdHex) {
      throw new Error(`vault ${inputBoxIdHex} spending transaction does not match DUP history`);
    }
    const rawTransaction = await source.getTransaction(spendingTransactionIdHex);
    if (rawTransaction === null) {
      throw new Error(`vault spending transaction ${spendingTransactionIdHex} is unavailable`);
    }
    const transaction = await normalizeTransaction(rawTransaction, `vault transaction ${index}`);
    if (transaction.idHex !== spendingTransactionIdHex) {
      throw new Error('vault transaction ID does not match the DUP transition');
    }
    if (
      transaction.inputs.length !== 2
      || transaction.dataInputs.length !== 1
      || (transaction.outputs.length !== 3 && transaction.outputs.length !== 4)
      || transaction.inputs[1] !== inputBoxIdHex
    ) {
      throw new Error('vault settlement transaction has an unsupported topology');
    }
    const payout = transaction.outputs[1];
    const fee = transaction.outputs[transaction.outputs.length - 1];
    const payoutValue = positiveBigInt(
      transition.payoutValueNanoErg,
      `vault transition ${index} payout`,
    );
    const minerFee = positiveBigInt(
      transition.minerFeeNanoErg,
      `vault transition ${index} miner fee`,
    );
    if (
      payout.boxIdHex !== fixedHex(transition.payoutBoxIdHex, 32, 'DUP payout box ID')
      || payout.valueNanoErg !== payoutValue
      || payout.assets.length !== 0
    ) {
      throw new Error('vault transaction payout does not match authenticated DUP history');
    }
    if (
      fee.valueNanoErg !== minerFee
      || fee.ergoTreeHex !== MINER_FEE_TREE
      || fee.assets.length !== 0
    ) {
      throw new Error('vault transaction miner fee does not match authenticated DUP history');
    }
    const remaining = BigInt(inputBox.valueNanoErg) - payoutValue - minerFee;
    if (remaining < 0n) throw new Error('vault settlement spends more ERG than the input contains');

    const successorBoxIdHex = transition.vaultSuccessorBoxIdHex === null
      ? null
      : fixedHex(transition.vaultSuccessorBoxIdHex, 32, 'DUP vault successor ID');
    if (successorBoxIdHex === null) {
      if (remaining !== 0n || transaction.outputs.length !== 3) {
        throw new Error('exact vault spend must exhaust value and omit a successor');
      }
    } else {
      if (remaining <= 0n || transaction.outputs.length !== 4) {
        throw new Error('partial vault spend must retain positive successor value');
      }
      const successor = byId.get(successorBoxIdHex);
      if (!successor) throw new Error(`vault successor ${successorBoxIdHex} is absent from history`);
      if (
        transaction.outputs[2].boxIdHex !== successorBoxIdHex
        || successor.transactionIdHex !== transaction.idHex
        || successor.outputIndex !== 2
        || BigInt(successor.valueNanoErg) !== remaining
      ) {
        throw new Error('vault successor identity or residual value is invalid');
      }
      assertPreservedVaultProfile(inputBox, successor, 'vault successor');
    }
    normalized.push(deepFreeze({
      burnIdHex: fixedHex(transition.burnIdHex, 32, `vault transition ${index} burn ID`),
      spendingTransactionIdHex,
      inputBoxIdHex,
      successorBoxIdHex,
      payoutBoxIdHex: payout.boxIdHex,
      payoutValueNanoErg: payoutValue.toString(),
      minerFeeNanoErg: minerFee.toString(),
    }));
  }
  for (const box of spent) {
    if (!transitionByInput.has(box.boxIdHex)) {
      throw new Error(`spent vault ${box.boxIdHex} is not bound by authenticated DUP history`);
    }
  }
  return deepFreeze(normalized);
}

async function normalizeIndexedVaultBox(
  value: unknown,
  index: number,
  expectedTreeHex: string,
  snapshotHeight: number,
): Promise<AuthenticatedV2SettlementVaultBox> {
  const raw = record(value, `indexed vault ${index}`);
  const spentTransactionIdHex = raw.spentTransactionId === null
    || raw.spentTransactionId === undefined
    ? null
    : fixedHex(raw.spentTransactionId, 32, `indexed vault ${index} spending tx ID`);
  return normalizeVaultBox(raw, spentTransactionIdHex, null, expectedTreeHex, snapshotHeight,
    `indexed vault ${index}`);
}

async function normalizeCurrentVaultBox(
  value: unknown,
  binaryValue: unknown | null,
  index: number,
  expectedTreeHex: string,
  snapshotHeight: number,
): Promise<AuthenticatedV2SettlementVaultBox> {
  const raw = record(value, `current vault ${index}`);
  if (raw.spentTransactionId !== null && raw.spentTransactionId !== undefined) {
    throw new Error(`current vault ${index} must be unspent`);
  }
  return normalizeVaultBox(raw, null, binaryValue, expectedTreeHex, snapshotHeight,
    `current vault ${index}`);
}

async function normalizeVaultBox(
  raw: Record<string, any>,
  spentTransactionIdHex: string | null,
  binaryValue: unknown | null,
  expectedTreeHex: string,
  snapshotHeight: number,
  label: string,
): Promise<AuthenticatedV2SettlementVaultBox> {
  const boxIdHex = fixedHex(raw.boxId, 32, `${label} box ID`);
  const transactionIdHex = fixedHex(raw.transactionId, 32, `${label} transaction ID`);
  const outputIndex = nonnegativeSafeInteger(raw.index, `${label} output index`);
  const creationHeight = nonnegativeSafeInteger(raw.creationHeight, `${label} creation height`);
  if (creationHeight > snapshotHeight) throw new Error(`${label} was created after the snapshot`);
  const valueNanoErg = positiveBigInt(raw.value, `${label} value`);
  const ergoTreeHex = variableHex(raw.ergoTree, MAX_ERGO_TREE_BYTES, `${label} ErgoTree`);
  if (ergoTreeHex !== expectedTreeHex) throw new Error(`${label} uses an unexpected ErgoTree`);
  const assets = normalizeAssets(raw.assets, `${label} assets`);
  if (assets.length !== 0) throw new Error(`${label} must be pure ERG`);
  const registers = exactRegisters(raw.additionalRegisters, ['R4', 'R5', 'R6', 'R7'], label);
  const depositIdHex = decodeCollByteRegister(registers.R4, `${label} R4`);
  if (depositIdHex.length !== 64) throw new Error(`${label} R4 must contain exactly 32 bytes`);
  const targetEvmAddressHex = decodeCollByteRegister(registers.R5, `${label} R5`);
  if (targetEvmAddressHex.length !== 40) throw new Error(`${label} R5 must contain exactly 20 bytes`);
  const originalAmount = decodeCanonicalLongRegister(registers.R6, `${label} R6`);
  if (originalAmount <= 0n) throw new Error(`${label} R6 must contain a positive Long`);
  const provenanceHex = decodeBoundedCollByteRegister(
    registers.R7,
    `${label} R7`,
    MAX_PROVENANCE_BYTES,
  );
  if (provenanceHex.length === 0) throw new Error(`${label} R7 must contain nonempty bytes`);

  const eip12 = {
    boxId: boxIdHex,
    value: raw.value,
    ergoTree: ergoTreeHex,
    assets: raw.assets,
    additionalRegisters: raw.additionalRegisters,
    creationHeight,
    transactionId: transactionIdHex,
    index: outputIndex,
  };
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  let parsed: any;
  try {
    parsed = wasm.ErgoBox.from_json(JSON.stringify(eip12));
  } catch (error: any) {
    throw new Error(`${label} is not a canonical EIP-12 box: ${error?.message ?? String(error)}`);
  }
  let sigmaSerializedHex: string;
  try {
    sigmaSerializedHex = Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
    if (sigmaSerializedHex.length > MAX_SERIALIZED_BOX_BYTES * 2) {
      throw new Error(`${label} canonical binary exceeds the size bound`);
    }
    const canonical = record(parsed.to_js_eip12(), `${label} canonical EIP-12 box`);
    if (fixedHex(canonical.boxId, 32, `${label} canonical box ID`) !== boxIdHex) {
      throw new Error(`${label} box ID is not derived from its canonical payload`);
    }
  } finally {
    parsed.free?.();
  }
  let currentUtxoBinaryMatched = false;
  if (binaryValue !== null) {
    const binary = record(binaryValue, `${label} UTXO binary response`);
    const observedHex = variableHex(
      binary.bytes,
      MAX_SERIALIZED_BOX_BYTES,
      `${label} UTXO binary`,
    );
    if (observedHex !== sigmaSerializedHex) {
      throw new Error(`${label} indexed JSON and current canonical binary disagree`);
    }
    currentUtxoBinaryMatched = true;
  }
  return deepFreeze({
    boxIdHex,
    transactionIdHex,
    outputIndex,
    creationHeight,
    valueNanoErg: valueNanoErg.toString(),
    ergoTreeHex,
    assets: [] as const,
    additionalRegisters: registers,
    depositIdHex,
    targetEvmAddressHex,
    originalAmountNanoErg: originalAmount.toString(),
    provenanceHex,
    spentTransactionIdHex,
    sigmaSerializedHex,
    sigmaSerializedSha256Hex: sha256Hex(Buffer.from(sigmaSerializedHex, 'hex')),
    currentUtxoBinaryMatched,
  });
}

async function normalizeTransaction(value: unknown, label: string): Promise<NormalizedTransaction> {
  const raw = record(value, label);
  if (!Array.isArray(raw.inputs) || !Array.isArray(raw.dataInputs) || !Array.isArray(raw.outputs)) {
    throw new Error(`${label} must contain input, data-input, and output arrays`);
  }
  return {
    idHex: fixedHex(raw.id, 32, `${label} ID`),
    inputs: raw.inputs.map((entry: unknown, index: number) => fixedHex(
      record(entry, `${label} input ${index}`).boxId,
      32,
      `${label} input ${index} box ID`,
    )),
    dataInputs: raw.dataInputs.map((entry: unknown, index: number) => fixedHex(
      record(entry, `${label} data input ${index}`).boxId,
      32,
      `${label} data input ${index} box ID`,
    )),
    outputs: await Promise.all(raw.outputs.map((entry: unknown, index: number) => normalizeOutput(
      entry,
      `${label} output ${index}`,
    ))),
  };
}

async function normalizeOutput(value: unknown, label: string): Promise<NormalizedOutput> {
  const raw = record(value, label);
  const boxIdHex = fixedHex(raw.boxId, 32, `${label} box ID`);
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  let parsed: any;
  try {
    parsed = wasm.ErgoBox.from_json(JSON.stringify({
      boxId: boxIdHex,
      value: raw.value,
      ergoTree: raw.ergoTree,
      assets: raw.assets,
      additionalRegisters: raw.additionalRegisters,
      creationHeight: raw.creationHeight,
      transactionId: raw.transactionId,
      index: raw.index,
    }));
  } catch (error: any) {
    throw new Error(`${label} is not a canonical transaction output: ${error?.message ?? String(error)}`);
  }
  try {
    const canonical = record(parsed.to_js_eip12(), `${label} canonical output`);
    if (fixedHex(canonical.boxId, 32, `${label} canonical box ID`) !== boxIdHex) {
      throw new Error(`${label} box ID is not derived from its transaction payload`);
    }
  } finally {
    parsed.free?.();
  }
  return {
    boxIdHex,
    valueNanoErg: positiveBigInt(raw.value, `${label} value`),
    ergoTreeHex: variableHex(raw.ergoTree, MAX_ERGO_TREE_BYTES, `${label} ErgoTree`),
    assets: normalizeAssets(raw.assets, `${label} assets`),
  };
}

function assertExactVaultBox(
  indexed: AuthenticatedV2SettlementVaultBox,
  current: AuthenticatedV2SettlementVaultBox,
  label: string,
): void {
  const comparable = (box: AuthenticatedV2SettlementVaultBox) => ({
    boxIdHex: box.boxIdHex,
    transactionIdHex: box.transactionIdHex,
    outputIndex: box.outputIndex,
    creationHeight: box.creationHeight,
    valueNanoErg: box.valueNanoErg,
    ergoTreeHex: box.ergoTreeHex,
    assets: box.assets,
    additionalRegisters: box.additionalRegisters,
    depositIdHex: box.depositIdHex,
    targetEvmAddressHex: box.targetEvmAddressHex,
    originalAmountNanoErg: box.originalAmountNanoErg,
    provenanceHex: box.provenanceHex,
    sigmaSerializedHex: box.sigmaSerializedHex,
    sigmaSerializedSha256Hex: box.sigmaSerializedSha256Hex,
  });
  if (canonicalJson(comparable(indexed)) !== canonicalJson(comparable(current))) {
    throw new Error(`${label} indexed and current payloads disagree`);
  }
  if (!current.currentUtxoBinaryMatched) {
    throw new Error(`${label} lacks a matching current canonical binary`);
  }
}

function assertPreservedVaultProfile(
  input: AuthenticatedV2SettlementVaultBox,
  successor: AuthenticatedV2SettlementVaultBox,
  label: string,
): void {
  if (
    input.ergoTreeHex !== successor.ergoTreeHex
    || canonicalJson(input.assets) !== canonicalJson(successor.assets)
    || canonicalJson(input.additionalRegisters) !== canonicalJson(successor.additionalRegisters)
  ) {
    throw new Error(`${label} changes the settlement profile or provenance registers`);
  }
}

async function captureSnapshot(
  source: AuthenticatedV2VaultChainSource,
  label: string,
): Promise<AuthenticatedV2SettlementVaultSnapshot> {
  const progress = record(await source.getIndexedHeight(), `${label} index progress`);
  const indexedHeight = nonnegativeSafeInteger(progress.indexedHeight, `${label} indexed height`);
  const fullHeight = nonnegativeSafeInteger(progress.fullHeight, `${label} full height`);
  if (indexedHeight !== fullHeight) {
    throw new Error(`${label} extra index must be synchronized with full height`);
  }
  const rawHeader = record(await source.getBestHeader(), `${label} best header`);
  const extensionRoot = rawHeader.extensionRoot ?? rawHeader.extensionHash;
  const bestHeader = {
    idHex: fixedHex(rawHeader.id, 32, `${label} header ID`),
    parentIdHex: fixedHex(rawHeader.parentId, 32, `${label} parent ID`),
    height: nonnegativeSafeInteger(rawHeader.height, `${label} header height`),
    extensionRootHex: fixedHex(extensionRoot, 32, `${label} extension root`),
  };
  if (bestHeader.height !== fullHeight) {
    throw new Error(`${label} best header must identify full height`);
  }
  return deepFreeze({ indexedHeight, fullHeight, bestHeader });
}

async function readNetwork(source: AuthenticatedV2VaultChainSource, label: string): Promise<string> {
  const info = record(await source.getInfo(), `${label} node info`);
  return normalizedNetwork(info.network ?? info.networkType, `${label} node`);
}

function normalizedNetwork(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} network must be a non-empty string`);
  }
  const network = value.trim().toLowerCase();
  if (!ALLOWED_NETWORKS.has(network)) {
    throw new Error(`${label} network must be explicitly non-mainnet`);
  }
  return network;
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

function normalizedAddress(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 10
    || value.length > 256
    || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)
  ) {
    throw new Error(`${label} must be a canonical base58 string`);
  }
  return value;
}

function exactRegisters(
  value: unknown,
  names: readonly string[],
  label: string,
): Readonly<Record<'R4' | 'R5' | 'R6' | 'R7', string>> {
  const raw = record(value, `${label} registers`);
  if (canonicalJson(Object.keys(raw).sort()) !== canonicalJson([...names].sort())) {
    throw new Error(`${label} register fields do not match R4-R7 exactly`);
  }
  return deepFreeze(Object.fromEntries(names.map(name => [
    name,
    variableHex(raw[name], MAX_REGISTER_BYTES, `${label} ${name}`),
  ])) as Record<'R4' | 'R5' | 'R6' | 'R7', string>);
}

function normalizeAssets(
  value: unknown,
  label: string,
): readonly { tokenIdHex: string; amount: bigint }[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => {
    const raw = record(entry, `${label} ${index}`);
    return {
      tokenIdHex: fixedHex(raw.tokenId, 32, `${label} ${index} token ID`),
      amount: positiveBigInt(raw.amount, `${label} ${index} amount`),
    };
  });
}

function assertUniqueIds(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} IDs must be unique`);
}

function record(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || value.length !== bytes * 2 || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be ${bytes}-byte canonical lowercase hex`);
  }
  return value;
}

function variableHex(value: unknown, maxBytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || value.length > maxBytes * 2
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be canonical lowercase hex within ${maxBytes} bytes`);
  }
  return value;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function positiveBigInt(value: unknown, label: string): bigint {
  let normalized: bigint;
  try {
    if (typeof value === 'bigint') normalized = value;
    else if (typeof value === 'number' && Number.isSafeInteger(value)) normalized = BigInt(value);
    else if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) normalized = BigInt(value);
    else throw new Error('invalid');
  } catch {
    throw new Error(`${label} must be a canonical positive integer`);
  }
  if (normalized <= 0n || normalized > 9_223_372_036_854_775_807n) {
    throw new Error(`${label} must fit a positive signed 64-bit integer`);
  }
  return normalized;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  return JSON.stringify(value);
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}
