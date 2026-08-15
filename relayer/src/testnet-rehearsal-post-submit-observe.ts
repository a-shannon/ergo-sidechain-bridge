import {
  buildTestnetRehearsalPostSubmitEvidence,
  type TestnetRehearsalPostSubmitInput,
  type TestnetRehearsalPostSubmitReport,
  type TestnetRehearsalPostSubmitSourceBindings,
  type TestnetRehearsalPostSubmitStateSourceTargetClass,
} from './testnet-rehearsal-post-submit.js';
import { MINER_FEE_TREE } from './ergo-helpers.js';

export interface ObservedErgoAsset {
  tokenId: string;
  amount: string | number;
}

export interface ObservedErgoOutput {
  boxId: string;
  value: string | number | bigint;
  ergoTree?: string;
  creationHeight?: number;
  assets?: ObservedErgoAsset[];
}

export interface ObservedErgoTransaction {
  id?: string;
  outputs: ObservedErgoOutput[];
  inclusionHeight?: number;
  numConfirmations?: string | number;
}

export interface ObservedPegOutRow {
  burnTxId: string;
  status: string;
  phase2UnlockTxId?: string | null;
  pendingAvlKey?: string | null;
  amountNanoErg: string | number | bigint;
  recipientErgoTreeHex: string;
}

export interface TestnetRehearsalPostSubmitObserveInput {
  expectedTxId: string;
  submittedTxId: string;
  tx: ObservedErgoTransaction | null;
  pegOutRows: ObservedPegOutRow[];
  currentErgoHeight: string | number;
  firstObservedMempoolHeight: string | number;
  confirmationsRequired: string | number;
  nodeUrl?: string;
  observedAt?: string;
  nodeNetwork?: string;
  stateTargetClass: TestnetRehearsalPostSubmitStateSourceTargetClass;
  submissionArtifact: string;
  confirmationArtifact: string;
  finalityEvidenceArtifact: string;
  reconciliationArtifact: string;
  submissionTimestamp: string;
  spvTrackerNftId: string;
  aggregateDupNftId: string;
  aggregateUnlockErgoTreeHex?: string;
  feeNanoErg: string | number | bigint;
  failedEventQueue: string;
  manualRepairPerformed: 'yes' | 'no';
  livePreflightReport?: unknown;
  livePreflightReportTarget?: string;
}

interface ObservedFacts {
  submittedTxId: string;
  burnTxIds: string[];
  confirmationHeight: number;
  confirmationCount: number;
  settlementOutputBoxIds: string[];
  dupSuccessorBoxId: string;
  spvTrackerSuccessorBoxId: string;
  recipientPayoutBoxIds: string[];
  aggregateUnlockChange?: {
    outputIndex: number;
    boxId: string;
    ergoTreeHex: string;
    valueNanoErg: string;
    tokenless: true;
  };
}

export function observeTestnetRehearsalPostSubmitEvidence(
  input: TestnetRehearsalPostSubmitObserveInput,
): TestnetRehearsalPostSubmitReport {
  const errors: string[] = [];
  const expectedTxId = normalizeFixedHex(errors, input.expectedTxId, 32, 'Expected transaction ID');
  const submittedTxId = normalizeFixedHex(errors, input.submittedTxId, 32, 'Submitted transaction ID');
  const currentErgoHeight = normalizeNonNegativeInteger(errors, input.currentErgoHeight, 'Current Ergo height');
  const confirmationsRequired =
    normalizeNonNegativeInteger(errors, input.confirmationsRequired, 'Required confirmation count');
  const spvTrackerNftId = normalizeFixedHex(errors, input.spvTrackerNftId, 32, 'SPV tracker NFT ID');
  const aggregateDupNftId = normalizeFixedHex(errors, input.aggregateDupNftId, 32, 'Aggregate DUP NFT ID');
  const aggregateUnlockErgoTreeHex = input.aggregateUnlockErgoTreeHex
    ? normalizeHex(errors, input.aggregateUnlockErgoTreeHex, 'Aggregate unlock ErgoTree')
    : undefined;
  const feeNanoErg = normalizePositiveBigInt(errors, input.feeNanoErg, 'Miner fee output feeNanoErg');

  if (expectedTxId && submittedTxId && expectedTxId !== submittedTxId) {
    errors.push('Submitted transaction ID must match Expected transaction ID');
  }
  if (!input.tx) {
    errors.push('Submitted transaction must be confirmed and readable before observation');
  }
  if (input.pegOutRows.length === 0) {
    errors.push('At least one peg-out row is required for post-submit observation');
  }
  if (input.pegOutRows.length > 10) {
    errors.push('Post-submit observe supports at most 10 peg-out rows per aggregate settlement batch');
  }
  if (input.stateTargetClass !== 'operator-provided-state-db') {
    errors.push('Post-submit observe state source target class must be operator-provided-state-db');
  }

  if (errors.length === 0) {
    const observed = observePegOuts(input, {
      errors,
      expectedTxId,
      submittedTxId,
      currentErgoHeight,
      confirmationsRequired,
      spvTrackerNftId,
      aggregateDupNftId,
      aggregateUnlockErgoTreeHex,
      feeNanoErg,
    });
    if (observed) {
      return buildTestnetRehearsalPostSubmitEvidence({
        expectedTxId,
        submittedTxId,
        burnTxIds: observed.burnTxIds,
        submissionArtifact: input.submissionArtifact,
        confirmationArtifact: input.confirmationArtifact,
        finalityEvidenceArtifact: input.finalityEvidenceArtifact,
        reconciliationArtifact: input.reconciliationArtifact,
        submissionTimestamp: input.submissionTimestamp,
        firstObservedMempoolHeight: input.firstObservedMempoolHeight,
        confirmationHeight: observed.confirmationHeight,
        confirmationCount: observed.confirmationCount,
        confirmationsRequired,
        settlementOutputBoxIds: observed.settlementOutputBoxIds,
        dupSuccessorBoxId: observed.dupSuccessorBoxId,
        spvTrackerSuccessorBoxId: observed.spvTrackerSuccessorBoxId,
        recipientPayoutBoxId: observed.recipientPayoutBoxIds[0],
        recipientPayoutBoxIds: observed.recipientPayoutBoxIds,
        aggregateUnlockChange: observed.aggregateUnlockChange,
        feeNanoErg,
        pegOutStatus: 'settled',
        failedEventQueue: input.failedEventQueue,
        manualRepairPerformed: input.manualRepairPerformed,
        livePreflightReport: input.livePreflightReport,
        livePreflightReportTarget: input.livePreflightReportTarget,
        sourceBindings: buildPostSubmitSourceBindings(input, {
          expectedTxId,
          submittedTxId,
          currentErgoHeight,
          observed,
        }),
      });
    }
  }

  return {
    status: 'BLOCKED',
    message: `testnet rehearsal post-submit observe BLOCKED: ${errors.length} issue(s)`,
    errors,
    lines: [
      `testnet rehearsal post-submit observe BLOCKED: ${errors.length} issue(s)`,
      '- Next safe step: fix read-only observation blockers before assembling post-submit evidence.',
      ...errors.map(error => `  - ${error}`),
    ],
  };
}

function buildPostSubmitSourceBindings(
  input: TestnetRehearsalPostSubmitObserveInput,
  normalized: {
    expectedTxId: string;
    submittedTxId: string;
    currentErgoHeight: number;
    observed: ObservedFacts;
  },
): TestnetRehearsalPostSubmitSourceBindings {
  return {
    node: {
      sourceType: 'live-read-only-node',
      readOnly: true,
      noAuthHeader: true,
      ergoNodeUrl: input.nodeUrl ?? '',
      observedAt: input.observedAt ?? new Date().toISOString(),
      nodeHeight: normalized.currentErgoHeight,
      nodeNetwork: input.nodeNetwork ?? '',
      expectedTxId: normalized.expectedTxId,
      submittedTxId: normalized.submittedTxId,
      operations: ['read-only /info', 'read-only transaction lookup'],
    },
    state: {
      sourceType: 'read-only-state-tracker',
      readOnly: true,
      runtimePathSerialized: false,
      targetClass: 'operator-provided-state-db',
      burnOrder: normalized.observed.burnTxIds,
      operations: ['read-only peg-out state lookup'],
    },
  };
}

function observePegOuts(
  input: TestnetRehearsalPostSubmitObserveInput,
  normalized: {
    errors: string[];
    expectedTxId: string;
    submittedTxId: string;
    currentErgoHeight: number;
    confirmationsRequired: number;
    spvTrackerNftId: string;
    aggregateDupNftId: string;
    aggregateUnlockErgoTreeHex?: string;
    feeNanoErg: bigint;
  },
): ObservedFacts | undefined {
  const { errors, submittedTxId } = normalized;
  const tx = input.tx!;
  const txId = normalizeOptionalFixedHex(errors, tx.id ?? submittedTxId, 32, 'Observed transaction ID');
  if (txId && txId !== submittedTxId) {
    errors.push('Observed transaction ID must match submitted transaction ID');
  }

  const observedRows = input.pegOutRows.map((row, index) => normalizeObservedPegOutRow(
    row,
    index,
    submittedTxId,
    errors,
  ));
  const burnTxIds = observedRows.map(row => row.burnTxId).filter(value => value.length > 0);
  if (new Set(burnTxIds).size !== burnTxIds.length) {
    errors.push('Peg-out burn TX IDs must be unique within a post-submit observation');
  }

  const outputs = Array.isArray(tx.outputs) ? tx.outputs : [];
  const spvOutput = outputs[0];
  const dupOutput = outputs[1];
  const payoutOutputs = observedRows.map((row, index) => {
    const payoutIndex = 2 + index;
    const output = outputs[payoutIndex];
    if (!output) {
      errors.push(`Payout output at position ${payoutIndex} is missing for burn TX ID ${row.burnTxId || `<claim-${index + 1}>`}`);
      return undefined;
    }
    const treeMatches = normalizeOutputTree(output.ergoTree) === row.recipientErgoTreeHex;
    const valueMatches = outputValueAtLeast(output, row.amountNanoErg);
    const tokenless = isTokenlessOutput(output);
    if (!treeMatches || !valueMatches || !tokenless) {
      errors.push(`Payout output at position ${payoutIndex} must match burn TX ID ${row.burnTxId || `<claim-${index + 1}>`} recipient and amount`);
      return undefined;
    }
    return output;
  });
  const recipientPayoutBoxIds = payoutOutputs.map((output, index) => output
    ? normalizeOptionalFixedHex(errors, output.boxId, 32, `recipient payout output box ID ${index + 1}`)
    : '',
  ).filter(value => value.length > 0);
  const feeOutput = outputs[outputs.length - 1];
  const expectedChangeIndex = 2 + observedRows.length;
  const changeOutputs = outputs.length > expectedChangeIndex
    ? outputs.slice(expectedChangeIndex, outputs.length - 1)
    : [];
  const settlementOutputBoxIds = outputs.map(output => normalizeOptionalFixedHex(
    errors,
    output.boxId,
    32,
    'settlement output box ID',
  )).filter(value => value.length > 0);
  const confirmationHeight = normalizeConfirmationHeight(errors, tx, outputs);
  const confirmationCount = normalizeConfirmationCount(errors, tx, normalized.currentErgoHeight, confirmationHeight);

  if (!spvOutput || !hasExactlyOneToken(spvOutput, normalized.spvTrackerNftId)) {
    errors.push('SPV tracker successor output must be OUTPUTS(0) with the expected NFT amount 1');
  }
  if (!dupOutput || !hasExactlyOneToken(dupOutput, normalized.aggregateDupNftId)) {
    errors.push('Aggregate DUP successor output must be OUTPUTS(1) with the expected NFT amount 1');
  }
  if (countOutputsWithToken(outputs, normalized.spvTrackerNftId) !== 1) {
    errors.push('Observed transaction must contain exactly one SPV tracker successor NFT');
  }
  if (countOutputsWithToken(outputs, normalized.aggregateDupNftId) !== 1) {
    errors.push('Observed transaction must contain exactly one aggregate DUP successor NFT');
  }
  if (payoutOutputs.some(output => output === undefined)) {
    errors.push('Observed transaction must contain every recipient payout output at its positional batch index');
  }
  if (new Set(recipientPayoutBoxIds).size !== recipientPayoutBoxIds.length) {
    errors.push('Recipient payout output box IDs must be unique within a post-submit observation');
  }
  if (changeOutputs.length > 1) {
    errors.push('Observed transaction must contain at most one aggregate unlock change output before the miner fee');
  }
  if (changeOutputs.length === 1) {
    const changeOutput = changeOutputs[0];
    if (!normalized.aggregateUnlockErgoTreeHex) {
      errors.push('Aggregate unlock ErgoTree is required when an aggregate unlock change output is present');
    } else if (normalizeOutputTree(changeOutput.ergoTree) !== normalized.aggregateUnlockErgoTreeHex) {
      errors.push('Aggregate unlock change output must use the expected aggregate unlock ErgoTree');
    }
    if (!isTokenlessOutput(changeOutput)) {
      errors.push('Aggregate unlock change output must be tokenless');
    }
    if (!outputValueAtLeast(changeOutput, 1n)) {
      errors.push('Aggregate unlock change output value must be positive');
    }
  }
  if (!feeOutput) {
    errors.push('Observed transaction must contain a final miner fee output');
  } else {
    if (normalizeOutputTree(feeOutput.ergoTree) !== MINER_FEE_TREE.toLowerCase()) {
      errors.push('Final miner fee output must use the canonical miner fee ErgoTree');
    }
    if (!outputValueEquals(feeOutput, normalized.feeNanoErg)) {
      errors.push('Final miner fee output value must match feeNanoErg');
    }
    if (!isTokenlessOutput(feeOutput)) {
      errors.push('Final miner fee output must be tokenless');
    }
  }

  if (errors.length > 0 || !spvOutput || !dupOutput || payoutOutputs.some(output => output === undefined)) {
    return undefined;
  }

  return {
    submittedTxId,
    burnTxIds,
    confirmationHeight,
    confirmationCount,
    settlementOutputBoxIds,
    dupSuccessorBoxId: dupOutput.boxId,
    spvTrackerSuccessorBoxId: spvOutput.boxId,
    recipientPayoutBoxIds,
    aggregateUnlockChange: changeOutputs.length === 1 ? {
      outputIndex: expectedChangeIndex,
      boxId: changeOutputs[0].boxId,
      ergoTreeHex: normalizeOutputTree(changeOutputs[0].ergoTree),
      valueNanoErg: outputValueToPositiveString(changeOutputs[0]),
      tokenless: true,
    } : undefined,
  };
}

function normalizeObservedPegOutRow(
  row: ObservedPegOutRow,
  index: number,
  submittedTxId: string,
  errors: string[],
): { burnTxId: string; recipientErgoTreeHex: string; amountNanoErg: bigint } {
  const label = `Peg-out row ${index + 1}`;
  const burnTxId = normalizeFixedHex(errors, row.burnTxId, 32, `${label} burn TX ID`);
  const phase2UnlockTxId = normalizeOptionalFixedHex(
    errors,
    row.phase2UnlockTxId ?? '',
    32,
    `${label} phase2 unlock transaction ID`,
  );
  const pendingAvlKey = normalizeOptionalFixedHex(errors, row.pendingAvlKey ?? '', 32, `${label} pending AVL key`);
  const recipientErgoTreeHex = normalizeHex(errors, row.recipientErgoTreeHex, `${label} recipient ErgoTree`);
  const amountNanoErg = normalizePositiveBigInt(errors, row.amountNanoErg, `${label} amountNanoErg`);

  if (row.status !== 'phase2_unlocked') {
    errors.push(`${label} must already be reconciled to phase2_unlocked`);
  }
  if (phase2UnlockTxId && phase2UnlockTxId !== submittedTxId) {
    errors.push(`${label} phase2 unlock transaction ID must match submitted transaction ID`);
  }
  if (pendingAvlKey && burnTxId && pendingAvlKey !== burnTxId) {
    errors.push(`${label} pending AVL key must match burn TX ID`);
  }

  return { burnTxId, recipientErgoTreeHex, amountNanoErg };
}

function hasExactlyOneToken(output: ObservedErgoOutput, tokenId: string): boolean {
  const assets = output.assets ?? [];
  return assets.length === 1 && normalizeAssetTokenId(assets[0].tokenId) === tokenId && assetAmountEquals(assets[0], 1n);
}

function countOutputsWithToken(outputs: ObservedErgoOutput[], tokenId: string): number {
  return outputs.filter(output =>
    (output.assets ?? []).some(asset => normalizeAssetTokenId(asset.tokenId) === tokenId && assetAmountEquals(asset, 1n)),
  ).length;
}

function assetAmountEquals(asset: ObservedErgoAsset, expected: bigint): boolean {
  try {
    return BigInt(asset.amount) === expected;
  } catch {
    return false;
  }
}

function isTokenlessOutput(output: ObservedErgoOutput): boolean {
  return (output.assets ?? []).length === 0;
}

function outputValueAtLeast(output: ObservedErgoOutput, minimum: bigint): boolean {
  try {
    return BigInt(output.value) >= minimum;
  } catch {
    return false;
  }
}

function outputValueEquals(output: ObservedErgoOutput, expected: bigint): boolean {
  try {
    return BigInt(output.value) === expected;
  } catch {
    return false;
  }
}

function outputValueToPositiveString(output: ObservedErgoOutput): string {
  try {
    const value = BigInt(output.value);
    return value > 0n ? value.toString() : '';
  } catch {
    return '';
  }
}

function normalizeConfirmationHeight(
  errors: string[],
  tx: ObservedErgoTransaction,
  outputs: ObservedErgoOutput[],
): number {
  const txHeight = tx.inclusionHeight;
  if (txHeight !== undefined) {
    return normalizeNonNegativeInteger(errors, txHeight, 'Transaction inclusion height');
  }
  const outputHeights = outputs
    .map(output => output.creationHeight)
    .filter((height): height is number => height !== undefined);
  if (outputHeights.length === 0) {
    errors.push('Observed transaction must include inclusionHeight or output creationHeight values');
    return 0;
  }
  const firstHeight = outputHeights[0];
  if (!outputHeights.every(height => height === firstHeight)) {
    errors.push('Observed transaction output creationHeight values must match');
  }
  return normalizeNonNegativeInteger(errors, firstHeight, 'Transaction output creation height');
}

function normalizeConfirmationCount(
  errors: string[],
  tx: ObservedErgoTransaction,
  currentErgoHeight: number,
  confirmationHeight: number,
): number {
  if (tx.numConfirmations !== undefined) {
    return normalizeNonNegativeInteger(errors, tx.numConfirmations, 'Observed confirmation count');
  }
  return currentErgoHeight - confirmationHeight;
}

function normalizeOutputTree(value: string | undefined): string {
  if (!value) return '';
  return value.startsWith('0x') ? value.slice(2).toLowerCase() : value.toLowerCase();
}

function normalizeAssetTokenId(value: string): string {
  return value.startsWith('0x') ? value.slice(2).toLowerCase() : value.toLowerCase();
}

function normalizeFixedHex(
  errors: string[],
  value: string,
  expectedBytes: number,
  label: string,
): string {
  const clean = normalizeHex(errors, value, label);
  if (!clean) return '';
  if (clean.length !== expectedBytes * 2) {
    errors.push(`${label} must be ${expectedBytes} bytes`);
    return '';
  }
  return clean;
}

function normalizeOptionalFixedHex(
  errors: string[],
  value: string,
  expectedBytes: number,
  label: string,
): string {
  if (!value) return '';
  return normalizeFixedHex(errors, value, expectedBytes, label);
}

function normalizeHex(errors: string[], value: string, label: string): string {
  const clean = value?.startsWith('0x') ? value.slice(2) : value;
  if (!clean || !/^[0-9a-fA-F]+$/.test(clean)) {
    errors.push(`${label} must be hex`);
    return '';
  }
  return clean.toLowerCase();
}

function normalizeNonNegativeInteger(
  errors: string[],
  value: string | number,
  label: string,
): number {
  const raw = String(value);
  if (!/^\d+$/.test(raw)) {
    errors.push(`${label} must be a non-negative integer`);
    return 0;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    errors.push(`${label} must be a safe integer`);
    return 0;
  }
  return parsed;
}

function normalizePositiveBigInt(
  errors: string[],
  value: string | number | bigint,
  label: string,
): bigint {
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) {
      errors.push(`${label} must be positive`);
      return 0n;
    }
    return parsed;
  } catch {
    errors.push(`${label} must be an integer`);
    return 0n;
  }
}
