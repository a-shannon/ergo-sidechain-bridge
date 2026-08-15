import { createHash } from 'crypto';

import type {
  AuthenticatedV2JvmVmFixture,
} from './authenticated-v2-jvm-vm-conformance.js';
import type {
  PinnedAuthenticatedV2VmTrees,
} from './authenticated-v2-offline-vm-fixture.js';
import type {
  AuthenticatedV2JvmVmConformanceReport,
} from './authenticated-v2-source-tree-conformance.js';

export interface Wp06JvmReplayBinding {
  signedTransactionSha256Hex: string;
  fixtureSha256Hex: string;
  contextSha256Hex: string;
  preHeaderParentIdHex: string;
  preHeaderHeight: number;
  headerIdsSha256Hex: string;
  inputCount: number;
  dataInputCount: number;
  headerCount: number;
}

export function deriveWp06JvmReplayBinding(
  fixture: AuthenticatedV2JvmVmFixture,
): Wp06JvmReplayBinding {
  const preHeader = JSON.parse(fixture.preHeaderJson) as Record<string, unknown>;
  return Object.freeze({
    signedTransactionSha256Hex: fixedHex(
      fixture.signedTransactionSha256Hex,
      'signed transaction SHA-256',
    ),
    fixtureSha256Hex: sha256Text(`${JSON.stringify(fixture)}\n`),
    contextSha256Hex: fixedHex(fixture.contextSha256Hex, 'context SHA-256'),
    preHeaderParentIdHex: fixedHex(preHeader.parentId, 'preheader parent ID'),
    preHeaderHeight: safeInteger(preHeader.height, 'preheader height'),
    headerIdsSha256Hex: sha256Text(
      fixture.headers.map(header => fixedHex(header.expectedIdHex, 'header ID')).join('\n'),
    ),
    inputCount: fixture.inputBoxesHex.length,
    dataInputCount: fixture.dataInputBoxesHex.length,
    headerCount: fixture.headers.length,
  });
}

export function assertWp06TrackerJvmReplayReport(input: {
  report: AuthenticatedV2JvmVmConformanceReport;
  binding: Wp06JvmReplayBinding;
  signedTransactionIdHex: string;
  trackerNftId: string;
  duplicatePreventionNftId: string;
  trackerTreeSha256Hex: string;
}): void {
  const { report, binding } = input;
  requireExact(report.mode, 'tracker', 'tracker JVM mode');
  assertCommonReplayReport(report, binding, input.signedTransactionIdHex, 'tracker');
  requireExact(report.inputCount, 1, 'tracker JVM input count');
  requireExact(report.dataInputCount, 0, 'tracker JVM data-input count');
  requireExact(report.inputs.length, 1, 'tracker JVM input result count');
  requireExact(report.dataInputs.length, 0, 'tracker JVM data-input result count');
  requireExact(report.inputs[0]?.inputIndex, 0, 'tracker JVM input index');
  requireExact(report.inputs[0]?.role, 'tracker', 'tracker JVM input role');
  requireExact(
    report.inputs[0]?.ergoTreeSha256Hex,
    input.trackerTreeSha256Hex,
    'tracker JVM input tree',
  );
  requireExact(report.inputs[0]?.accepted, true, 'tracker JVM input acceptance');
  assertCanonicalCompilation(report, binding, {
    trackerNftId: input.trackerNftId,
    duplicatePreventionNftId: input.duplicatePreventionNftId,
  });
}

export function assertWp06SettlementJvmReplayReport(input: {
  report: AuthenticatedV2JvmVmConformanceReport;
  binding: Wp06JvmReplayBinding;
  signedTransactionIdHex: string;
  trackerNftId: string;
  duplicatePreventionNftId: string;
  compiledTrees: PinnedAuthenticatedV2VmTrees;
  trackerReport: AuthenticatedV2JvmVmConformanceReport;
}): void {
  const { report, binding, compiledTrees, trackerReport } = input;
  requireExact(report.mode, 'settlement', 'settlement JVM mode');
  assertCommonReplayReport(report, binding, input.signedTransactionIdHex, 'settlement');
  requireExact(report.inputCount, 2, 'settlement JVM input count');
  requireExact(report.dataInputCount, 1, 'settlement JVM data-input count');
  requireExact(report.inputs.length, 2, 'settlement JVM input result count');
  requireExact(report.dataInputs.length, 1, 'settlement JVM data-input result count');
  const expectedInputs = [
    ['duplicatePrevention', compiledTrees.treeSha256.duplicatePrevention],
    ['unlock', compiledTrees.treeSha256.unlock],
  ] as const;
  expectedInputs.forEach(([role, treeSha256Hex], index) => {
    requireExact(report.inputs[index]?.inputIndex, index, `settlement JVM input ${index} index`);
    requireExact(report.inputs[index]?.role, role, `settlement JVM input ${index} role`);
    requireExact(
      report.inputs[index]?.ergoTreeSha256Hex,
      treeSha256Hex,
      `settlement JVM input ${index} tree`,
    );
    requireExact(report.inputs[index]?.accepted, true, `settlement JVM input ${index} acceptance`);
  });
  requireExact(report.dataInputs[0]?.dataInputIndex, 0, 'settlement JVM data-input index');
  requireExact(report.dataInputs[0]?.role, 'tracker', 'settlement JVM data-input role');
  requireExact(
    report.dataInputs[0]?.ergoTreeSha256Hex,
    compiledTrees.treeSha256.tracker,
    'settlement JVM data-input tree',
  );
  assertCanonicalCompilation(report, binding, {
    trackerNftId: input.trackerNftId,
    duplicatePreventionNftId: input.duplicatePreventionNftId,
    compiledTrees,
  });
  requireExact(trackerReport.mode, 'tracker', 'retained tracker JVM mode');
  requireExact(
    trackerReport.canonicalCompilation.trackerNftId,
    input.trackerNftId,
    'retained tracker JVM tracker NFT',
  );
  requireExact(
    trackerReport.canonicalCompilation.duplicatePreventionNftId,
    input.duplicatePreventionNftId,
    'retained tracker JVM duplicate-prevention NFT',
  );
  requireExact(
    report.canonicalCompilation.compilerIdentityDigestHex,
    trackerReport.canonicalCompilation.compilerIdentityDigestHex,
    'T1/T2 compiler identity',
  );
  requireExact(
    report.canonicalCompilation.sourceBaselineDigestHex,
    trackerReport.canonicalCompilation.sourceBaselineDigestHex,
    'T1/T2 source baseline',
  );
  for (const role of ['tracker', 'unlock', 'duplicatePrevention'] as const) {
    requireExact(
      report.canonicalCompilation.treeSha256[role],
      trackerReport.canonicalCompilation.treeSha256[role],
      `T1/T2 ${role} tree`,
    );
  }
}

export function assertWp06SourceToSettlementJvmContinuity(input: {
  handoff: {
    admittedTrackerSuccessor: { boxId?: unknown };
    sourceBindings: { burnIdHex: string };
    targetBurn: { recipientErgoTreeHex: string; amountNanoErg: string };
    boundary: { sourceBoundPinnedJvmTrackerReplayVerified: boolean };
    trackerAdmissionJvmConformanceReport: AuthenticatedV2JvmVmConformanceReport;
  };
  settlement: {
    sourceToTrackerHandoff: unknown;
    trackerDataInputBoxId: string;
    duplicatePreventionKeyHex: string;
    recipientErgoTreeHex: string;
    payoutAmountNanoErg: string;
    boundary: { sourceBoundPinnedJvmReplayVerified: boolean };
    jvmConformanceReport: AuthenticatedV2JvmVmConformanceReport;
  };
}): void {
  const { handoff, settlement } = input;
  requireExact(settlement.sourceToTrackerHandoff, handoff, 'T1/T2 process-local handoff object');
  requireExact(
    settlement.trackerDataInputBoxId,
    handoff.admittedTrackerSuccessor.boxId,
    'T1/T2 tracker successor box',
  );
  requireExact(
    settlement.duplicatePreventionKeyHex,
    handoff.sourceBindings.burnIdHex,
    'T1/T2 duplicate-prevention key',
  );
  requireExact(
    settlement.recipientErgoTreeHex,
    handoff.targetBurn.recipientErgoTreeHex,
    'T1/T2 payout recipient',
  );
  requireExact(
    settlement.payoutAmountNanoErg,
    handoff.targetBurn.amountNanoErg,
    'T1/T2 payout amount',
  );
  requireExact(
    handoff.boundary.sourceBoundPinnedJvmTrackerReplayVerified,
    true,
    'T1 JVM replay boundary',
  );
  requireExact(
    settlement.boundary.sourceBoundPinnedJvmReplayVerified,
    true,
    'T2 JVM replay boundary',
  );
  requireExact(
    handoff.trackerAdmissionJvmConformanceReport.mode,
    'tracker',
    'T1 JVM report mode',
  );
  requireExact(settlement.jvmConformanceReport.mode, 'settlement', 'T2 JVM report mode');
  requireExact(
    handoff.trackerAdmissionJvmConformanceReport.allInputsAccepted,
    true,
    'T1 JVM input acceptance',
  );
  requireExact(
    settlement.jvmConformanceReport.allInputsAccepted,
    true,
    'T2 JVM input acceptance',
  );
  for (const [label, report] of [
    ['T1', handoff.trackerAdmissionJvmConformanceReport],
    ['T2', settlement.jvmConformanceReport],
  ] as const) {
    requireExact(report.serializationRoundTrip, true, `${label} JVM serialization round trip`);
    requireExact(report.nodeStatefulAcceptance, false, `${label} node stateful boundary`);
    requireExact(report.broadcastPerformed, false, `${label} broadcast boundary`);
    requireExact(report.gate5Closed, false, `${label} Gate 5 boundary`);
  }
  requireExact(
    settlement.jvmConformanceReport.canonicalCompilation.compilerIdentityDigestHex,
    handoff.trackerAdmissionJvmConformanceReport.canonicalCompilation.compilerIdentityDigestHex,
    'T1/T2 compiler identity',
  );
  requireExact(
    settlement.jvmConformanceReport.canonicalCompilation.sourceBaselineDigestHex,
    handoff.trackerAdmissionJvmConformanceReport.canonicalCompilation.sourceBaselineDigestHex,
    'T1/T2 source baseline',
  );
  for (const role of ['tracker', 'unlock', 'duplicatePrevention'] as const) {
    requireExact(
      settlement.jvmConformanceReport.canonicalCompilation.treeSha256[role],
      handoff.trackerAdmissionJvmConformanceReport.canonicalCompilation.treeSha256[role],
      `T1/T2 ${role} tree`,
    );
  }
}

export function assertWp06SignedSuccessorBinding(input: {
  signedTransactionIdHex: unknown;
  successorTransactionIdHex: unknown;
  successorIndex: unknown;
}): void {
  const signedTransactionIdHex = fixedHex(
    input.signedTransactionIdHex,
    'signed tracker transaction ID',
  );
  requireExact(
    fixedHex(input.successorTransactionIdHex, 'tracker successor transaction ID'),
    signedTransactionIdHex,
    'signed tracker successor transaction ID',
  );
  requireExact(input.successorIndex, 0, 'signed tracker successor output index');
}

export function assertExactExecutableErgoTree(
  wasm: any,
  ergoTreeHex: string,
  label: string,
): string {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(ergoTreeHex)) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  let tree: any;
  try {
    tree = wasm.ErgoTree.from_base16_bytes(ergoTreeHex);
    tree.constants_len();
    const roundTrip = String(tree.to_base16_bytes()).toLowerCase();
    if (roundTrip !== ergoTreeHex.toLowerCase()) {
      throw new Error(`${label} is not an exact executable ErgoTree`);
    }
    return roundTrip;
  } catch (error) {
    if (error instanceof Error && /exact executable ErgoTree/.test(error.message)) throw error;
    throw new Error(`${label} is not an exact executable ErgoTree: ${String(error)}`);
  } finally {
    tree?.free();
  }
}

function assertCommonReplayReport(
  report: AuthenticatedV2JvmVmConformanceReport,
  binding: Wp06JvmReplayBinding,
  signedTransactionIdHex: string,
  label: string,
): void {
  const transactionIdHex = fixedHex(signedTransactionIdHex, `${label} signed transaction ID`);
  requireExact(report.transactionIdHex, transactionIdHex, `${label} JVM transaction ID`);
  requireExact(report.bytesToSignDigestHex, transactionIdHex, `${label} JVM bytes-to-sign`);
  requireExact(
    report.signedTransactionSha256Hex,
    binding.signedTransactionSha256Hex,
    `${label} JVM signed bytes`,
  );
  requireExact(report.fixtureSha256Hex, binding.fixtureSha256Hex, `${label} JVM fixture`);
  requireExact(report.contextSha256Hex, binding.contextSha256Hex, `${label} JVM context`);
  requireExact(
    report.preHeaderParentIdHex,
    binding.preHeaderParentIdHex,
    `${label} JVM preheader parent`,
  );
  requireExact(report.preHeaderHeight, binding.preHeaderHeight, `${label} JVM preheader height`);
  requireExact(
    report.headerIdsSha256Hex,
    binding.headerIdsSha256Hex,
    `${label} JVM header IDs`,
  );
  requireExact(report.inputCount, binding.inputCount, `${label} JVM bound input count`);
  requireExact(
    report.dataInputCount,
    binding.dataInputCount,
    `${label} JVM bound data-input count`,
  );
  requireExact(report.headerCount, binding.headerCount, `${label} JVM bound header count`);
  requireExact(report.headerCount, 10, `${label} JVM header count`);
  requireExact(report.serializationRoundTrip, true, `${label} JVM serialization round trip`);
  requireExact(report.allInputsAccepted, true, `${label} JVM all-input acceptance`);
  requireExact(report.nodeStatefulAcceptance, false, `${label} node stateful boundary`);
  requireExact(report.broadcastPerformed, false, `${label} broadcast boundary`);
  requireExact(report.gate5Closed, false, `${label} Gate 5 boundary`);
}

function assertCanonicalCompilation(
  report: AuthenticatedV2JvmVmConformanceReport,
  binding: Wp06JvmReplayBinding,
  expected: {
    trackerNftId: string;
    duplicatePreventionNftId: string;
    compiledTrees?: PinnedAuthenticatedV2VmTrees;
  },
): void {
  const canonical = report.canonicalCompilation;
  requireExact(canonical.fixtureSha256Hex, binding.fixtureSha256Hex, 'canonical fixture binding');
  requireExact(canonical.contextSha256Hex, binding.contextSha256Hex, 'canonical context binding');
  requireExact(canonical.trackerNftId, expected.trackerNftId, 'canonical tracker NFT');
  requireExact(
    canonical.duplicatePreventionNftId,
    expected.duplicatePreventionNftId,
    'canonical duplicate-prevention NFT',
  );
  requireExact(canonical.compilerPasses, 3, 'canonical compiler pass count');
  requireExact(canonical.fixedPointVerified, true, 'canonical compiler fixed point');
  fixedHex(canonical.compilerIdentityDigestHex, 'canonical compiler identity');
  fixedHex(canonical.sourceBaselineDigestHex, 'canonical source baseline');
  fixedHex(canonical.bindingDigestHex, 'canonical compilation binding');
  if (expected.compiledTrees) {
    requireExact(
      canonical.compilerIdentityDigestHex,
      expected.compiledTrees.compilerIdentityDigestHex,
      'compiled compiler identity',
    );
    requireExact(
      canonical.sourceBaselineDigestHex,
      expected.compiledTrees.sourceBaselineDigestHex,
      'compiled source baseline',
    );
    for (const role of ['tracker', 'unlock', 'duplicatePrevention'] as const) {
      requireExact(
        canonical.treeSha256[role],
        expected.compiledTrees.treeSha256[role],
        `compiled ${role} tree`,
      );
    }
  }
}

function requireExact(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label} mismatch`);
}

function fixedHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(`${label} must be exactly 32 bytes of hex`);
  }
  return value.toLowerCase();
}

function safeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
