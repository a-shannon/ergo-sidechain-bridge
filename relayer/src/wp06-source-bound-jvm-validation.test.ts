import { describe, expect, it } from 'vitest';

import type {
  AuthenticatedV2JvmVmFixture,
} from './authenticated-v2-jvm-vm-conformance.js';
import type {
  PinnedAuthenticatedV2VmTrees,
} from './authenticated-v2-offline-vm-fixture.js';
import type {
  AuthenticatedV2JvmVmConformanceReport,
} from './authenticated-v2-source-tree-conformance.js';
import {
  assertExactExecutableErgoTree,
  assertWp06SettlementJvmReplayReport,
  assertWp06SignedSuccessorBinding,
  assertWp06SourceToSettlementJvmContinuity,
  assertWp06TrackerJvmReplayReport,
  deriveWp06JvmReplayBinding,
  type Wp06JvmReplayBinding,
} from './wp06-source-bound-jvm-validation.js';

const TRACKER_NFT = 'a1'.repeat(32);
const DUP_NFT = 'b2'.repeat(32);
const TX_ID = '11'.repeat(32);
const SIGNED_SHA = '12'.repeat(32);
const FIXTURE_SHA = '13'.repeat(32);
const CONTEXT_SHA = '14'.repeat(32);
const PREHEADER_PARENT = '15'.repeat(32);
const HEADER_IDS_SHA = '16'.repeat(32);
const COMPILER_ID = '17'.repeat(32);
const SOURCE_ID = '18'.repeat(32);
const BINDING_ID = '19'.repeat(32);
const TREE_SHA = {
  tracker: '21'.repeat(32),
  unlock: '22'.repeat(32),
  duplicatePrevention: '23'.repeat(32),
};

function replayBinding(inputCount: number, dataInputCount: number): Wp06JvmReplayBinding {
  return {
    signedTransactionSha256Hex: SIGNED_SHA,
    fixtureSha256Hex: FIXTURE_SHA,
    contextSha256Hex: CONTEXT_SHA,
    preHeaderParentIdHex: PREHEADER_PARENT,
    preHeaderHeight: 100_000,
    headerIdsSha256Hex: HEADER_IDS_SHA,
    inputCount,
    dataInputCount,
    headerCount: 10,
  };
}

function report(mode: 'tracker' | 'settlement'): AuthenticatedV2JvmVmConformanceReport {
  const tracker = mode === 'tracker';
  return {
    schemaVersion: 2,
    mode,
    transactionIdHex: TX_ID,
    bytesToSignDigestHex: TX_ID,
    signedTransactionSha256Hex: SIGNED_SHA,
    fixtureSha256Hex: FIXTURE_SHA,
    contextSha256Hex: CONTEXT_SHA,
    preHeaderParentIdHex: PREHEADER_PARENT,
    preHeaderHeight: 100_000,
    headerIdsSha256Hex: HEADER_IDS_SHA,
    inputCount: tracker ? 1 : 2,
    dataInputCount: tracker ? 0 : 1,
    headerCount: 10,
    inputs: tracker ? [{
      inputIndex: 0,
      role: 'tracker',
      ergoTreeSha256Hex: TREE_SHA.tracker,
      accepted: true,
      cost: 1,
      proofBytes: 1,
    }] : [{
      inputIndex: 0,
      role: 'duplicatePrevention',
      ergoTreeSha256Hex: TREE_SHA.duplicatePrevention,
      accepted: true,
      cost: 1,
      proofBytes: 0,
    }, {
      inputIndex: 1,
      role: 'unlock',
      ergoTreeSha256Hex: TREE_SHA.unlock,
      accepted: true,
      cost: 1,
      proofBytes: 1,
    }],
    dataInputs: tracker ? [] : [{
      dataInputIndex: 0,
      role: 'tracker',
      ergoTreeSha256Hex: TREE_SHA.tracker,
    }],
    serializationRoundTrip: true,
    allInputsAccepted: true,
    nodeStatefulAcceptance: false,
    broadcastPerformed: false,
    gate5Closed: false,
    canonicalCompilation: {
      fixtureSha256Hex: FIXTURE_SHA,
      contextSha256Hex: CONTEXT_SHA,
      trackerNftId: TRACKER_NFT,
      duplicatePreventionNftId: DUP_NFT,
      compilerIdentityDigestHex: COMPILER_ID,
      sourceBaselineDigestHex: SOURCE_ID,
      treeSha256: { ...TREE_SHA },
      compilerPasses: 3,
      fixedPointVerified: true,
      bindingDigestHex: BINDING_ID,
    },
  };
}

const COMPILED_TREES: PinnedAuthenticatedV2VmTrees = {
  trees: {
    tracker: '1001',
    unlock: '1002',
    duplicatePrevention: '1003',
  },
  treeSha256: TREE_SHA,
  compilerIdentityDigestHex: COMPILER_ID,
  sourceBaselineDigestHex: SOURCE_ID,
  compilerPasses: 3,
  fixedPointVerified: true,
};

describe('WP-06 source-bound JVM validation', () => {
  it('isolates every tracker-report binding and boundary', () => {
    const validate = (candidate: AuthenticatedV2JvmVmConformanceReport) => (
      assertWp06TrackerJvmReplayReport({
        report: candidate,
        binding: replayBinding(1, 0),
        signedTransactionIdHex: TX_ID,
        trackerNftId: TRACKER_NFT,
        duplicatePreventionNftId: DUP_NFT,
        trackerTreeSha256Hex: TREE_SHA.tracker,
      })
    );
    expect(() => validate(report('tracker'))).not.toThrow();

    const cases: Array<[string, (candidate: any) => void]> = [
      ['mode', value => { value.mode = 'settlement'; }],
      ['transaction ID', value => { value.transactionIdHex = '31'.repeat(32); }],
      ['bytes-to-sign', value => { value.bytesToSignDigestHex = '32'.repeat(32); }],
      ['signed bytes', value => { value.signedTransactionSha256Hex = '33'.repeat(32); }],
      ['fixture', value => { value.fixtureSha256Hex = '34'.repeat(32); }],
      ['context', value => { value.contextSha256Hex = '35'.repeat(32); }],
      ['preheader parent', value => { value.preHeaderParentIdHex = '36'.repeat(32); }],
      ['preheader height', value => { value.preHeaderHeight += 1; }],
      ['header IDs', value => { value.headerIdsSha256Hex = '37'.repeat(32); }],
      ['input count', value => { value.inputCount = 2; }],
      ['data-input count', value => { value.dataInputCount = 1; }],
      ['header count', value => { value.headerCount = 9; }],
      ['input role', value => { value.inputs[0].role = 'unlock'; }],
      ['input tree', value => { value.inputs[0].ergoTreeSha256Hex = '38'.repeat(32); }],
      ['input acceptance', value => { value.inputs[0].accepted = false; }],
      ['round trip', value => { value.serializationRoundTrip = false; }],
      ['all-input acceptance', value => { value.allInputsAccepted = false; }],
      ['stateful boundary', value => { value.nodeStatefulAcceptance = true; }],
      ['broadcast boundary', value => { value.broadcastPerformed = true; }],
      ['Gate 5 boundary', value => { value.gate5Closed = true; }],
      ['canonical fixture', value => { value.canonicalCompilation.fixtureSha256Hex = '39'.repeat(32); }],
      ['canonical context', value => { value.canonicalCompilation.contextSha256Hex = '3a'.repeat(32); }],
      ['tracker NFT', value => { value.canonicalCompilation.trackerNftId = '3b'.repeat(32); }],
      ['DUP NFT', value => { value.canonicalCompilation.duplicatePreventionNftId = '3c'.repeat(32); }],
      ['compiler passes', value => { value.canonicalCompilation.compilerPasses = 2; }],
      ['compiler fixed point', value => { value.canonicalCompilation.fixedPointVerified = false; }],
    ];
    for (const [label, mutate] of cases) {
      const candidate: any = structuredClone(report('tracker'));
      mutate(candidate);
      expect(() => validate(candidate), label).toThrow();
    }
  });

  it('isolates settlement replay and every T1/T2 compiler/tree continuity field', () => {
    const trackerReport = report('tracker');
    const validate = (candidate: AuthenticatedV2JvmVmConformanceReport) => (
      assertWp06SettlementJvmReplayReport({
        report: candidate,
        binding: replayBinding(2, 1),
        signedTransactionIdHex: TX_ID,
        trackerNftId: TRACKER_NFT,
        duplicatePreventionNftId: DUP_NFT,
        compiledTrees: COMPILED_TREES,
        trackerReport,
      })
    );
    expect(() => validate(report('settlement'))).not.toThrow();

    const cases: Array<[string, (candidate: any) => void]> = [
      ['mode', value => { value.mode = 'tracker'; }],
      ['transaction ID', value => { value.transactionIdHex = '41'.repeat(32); }],
      ['signed bytes', value => { value.signedTransactionSha256Hex = '42'.repeat(32); }],
      ['fixture', value => { value.fixtureSha256Hex = '43'.repeat(32); }],
      ['context', value => { value.contextSha256Hex = '44'.repeat(32); }],
      ['preheader', value => { value.preHeaderParentIdHex = '45'.repeat(32); }],
      ['headers', value => { value.headerIdsSha256Hex = '46'.repeat(32); }],
      ['input count', value => { value.inputCount = 1; }],
      ['data-input count', value => { value.dataInputCount = 0; }],
      ['DUP role', value => { value.inputs[0].role = 'unlock'; }],
      ['unlock tree', value => { value.inputs[1].ergoTreeSha256Hex = '47'.repeat(32); }],
      ['tracker data tree', value => { value.dataInputs[0].ergoTreeSha256Hex = '48'.repeat(32); }],
      ['round trip', value => { value.serializationRoundTrip = false; }],
      ['acceptance', value => { value.allInputsAccepted = false; }],
      ['stateful boundary', value => { value.nodeStatefulAcceptance = true; }],
      ['broadcast boundary', value => { value.broadcastPerformed = true; }],
      ['Gate 5 boundary', value => { value.gate5Closed = true; }],
      ['compiler identity', value => { value.canonicalCompilation.compilerIdentityDigestHex = '49'.repeat(32); }],
      ['source baseline', value => { value.canonicalCompilation.sourceBaselineDigestHex = '4a'.repeat(32); }],
      ['tracker tree', value => { value.canonicalCompilation.treeSha256.tracker = '4b'.repeat(32); }],
      ['unlock tree continuity', value => { value.canonicalCompilation.treeSha256.unlock = '4c'.repeat(32); }],
      ['DUP tree continuity', value => { value.canonicalCompilation.treeSha256.duplicatePrevention = '4d'.repeat(32); }],
      ['tracker NFT', value => { value.canonicalCompilation.trackerNftId = '4e'.repeat(32); }],
      ['DUP NFT', value => { value.canonicalCompilation.duplicatePreventionNftId = '4f'.repeat(32); }],
    ];
    for (const [label, mutate] of cases) {
      const candidate: any = structuredClone(report('settlement'));
      mutate(candidate);
      expect(() => validate(candidate), label).toThrow();
    }
  });

  it('isolates every source-to-settlement stage handoff field', () => {
    const build = () => {
      const trackerReport = report('tracker');
      const handoff = {
        admittedTrackerSuccessor: { boxId: '51'.repeat(32) },
        sourceBindings: { burnIdHex: '52'.repeat(32) },
        targetBurn: { recipientErgoTreeHex: '1001', amountNanoErg: '1000000' },
        boundary: { sourceBoundPinnedJvmTrackerReplayVerified: true },
        trackerAdmissionJvmConformanceReport: trackerReport,
      };
      const settlement = {
        sourceToTrackerHandoff: handoff,
        trackerDataInputBoxId: handoff.admittedTrackerSuccessor.boxId,
        duplicatePreventionKeyHex: handoff.sourceBindings.burnIdHex,
        recipientErgoTreeHex: handoff.targetBurn.recipientErgoTreeHex,
        payoutAmountNanoErg: handoff.targetBurn.amountNanoErg,
        boundary: { sourceBoundPinnedJvmReplayVerified: true },
        jvmConformanceReport: report('settlement'),
      };
      return { handoff, settlement };
    };
    expect(() => assertWp06SourceToSettlementJvmContinuity(build())).not.toThrow();
    const cases: Array<[string, (value: any) => void]> = [
      ['handoff identity', value => { value.settlement.sourceToTrackerHandoff = {}; }],
      ['tracker box', value => { value.settlement.trackerDataInputBoxId = '61'.repeat(32); }],
      ['DUP key', value => { value.settlement.duplicatePreventionKeyHex = '62'.repeat(32); }],
      ['recipient', value => { value.settlement.recipientErgoTreeHex = '1002'; }],
      ['amount', value => { value.settlement.payoutAmountNanoErg = '2'; }],
      ['T1 boundary', value => { value.handoff.boundary.sourceBoundPinnedJvmTrackerReplayVerified = false; }],
      ['T2 boundary', value => { value.settlement.boundary.sourceBoundPinnedJvmReplayVerified = false; }],
      ['T1 mode', value => { value.handoff.trackerAdmissionJvmConformanceReport.mode = 'settlement'; }],
      ['T2 mode', value => { value.settlement.jvmConformanceReport.mode = 'tracker'; }],
      ['T1 acceptance', value => { value.handoff.trackerAdmissionJvmConformanceReport.allInputsAccepted = false; }],
      ['T2 acceptance', value => { value.settlement.jvmConformanceReport.allInputsAccepted = false; }],
      ['T1 round trip', value => { value.handoff.trackerAdmissionJvmConformanceReport.serializationRoundTrip = false; }],
      ['T2 stateful boundary', value => { value.settlement.jvmConformanceReport.nodeStatefulAcceptance = true; }],
      ['T1 broadcast boundary', value => { value.handoff.trackerAdmissionJvmConformanceReport.broadcastPerformed = true; }],
      ['T2 Gate 5 boundary', value => { value.settlement.jvmConformanceReport.gate5Closed = true; }],
      ['compiler identity', value => { value.settlement.jvmConformanceReport.canonicalCompilation.compilerIdentityDigestHex = '63'.repeat(32); }],
      ['source baseline', value => { value.settlement.jvmConformanceReport.canonicalCompilation.sourceBaselineDigestHex = '64'.repeat(32); }],
      ['tracker tree', value => { value.settlement.jvmConformanceReport.canonicalCompilation.treeSha256.tracker = '65'.repeat(32); }],
      ['unlock tree', value => { value.settlement.jvmConformanceReport.canonicalCompilation.treeSha256.unlock = '66'.repeat(32); }],
      ['DUP tree', value => { value.settlement.jvmConformanceReport.canonicalCompilation.treeSha256.duplicatePrevention = '67'.repeat(32); }],
    ];
    for (const [label, mutate] of cases) {
      const value: any = build();
      mutate(value);
      expect(() => assertWp06SourceToSettlementJvmContinuity(value), label).toThrow();
    }
  });

  it('binds the signed tracker transaction to output zero', () => {
    expect(() => assertWp06SignedSuccessorBinding({
      signedTransactionIdHex: TX_ID,
      successorTransactionIdHex: TX_ID,
      successorIndex: 0,
    })).not.toThrow();
    expect(() => assertWp06SignedSuccessorBinding({
      signedTransactionIdHex: TX_ID,
      successorTransactionIdHex: '71'.repeat(32),
      successorIndex: 0,
    })).toThrow(/transaction ID mismatch/i);
    expect(() => assertWp06SignedSuccessorBinding({
      signedTransactionIdHex: TX_ID,
      successorTransactionIdHex: TX_ID,
      successorIndex: 1,
    })).toThrow(/output index mismatch/i);
  });

  it('derives fixture bindings and rejects non-executable recipient points', async () => {
    const fixture = {
      preHeaderJson: JSON.stringify({ parentId: PREHEADER_PARENT, height: 100_000 }),
      signedTransactionSha256Hex: SIGNED_SHA,
      contextSha256Hex: CONTEXT_SHA,
      inputBoxesHex: ['01'],
      dataInputBoxesHex: [],
      headers: Array.from({ length: 10 }, (_, index) => ({
        expectedIdHex: (80 + index).toString(16).repeat(64).slice(0, 64),
        headerJson: '{}',
      })),
    } as unknown as AuthenticatedV2JvmVmFixture;
    expect(deriveWp06JvmReplayBinding(fixture)).toMatchObject({
      signedTransactionSha256Hex: SIGNED_SHA,
      contextSha256Hex: CONTEXT_SHA,
      preHeaderParentIdHex: PREHEADER_PARENT,
      preHeaderHeight: 100_000,
      inputCount: 1,
      dataInputCount: 0,
      headerCount: 10,
    });

    const imported = await import('ergo-lib-wasm-nodejs');
    const wasm: any = (imported as any).default ?? imported;
    expect(() => assertExactExecutableErgoTree(
      wasm,
      `0008cd02${'41'.repeat(32)}`,
      'first burn recipient',
    )).toThrow(/not an exact executable ErgoTree/i);
    expect(() => assertExactExecutableErgoTree(
      wasm,
      `0008cd03${'42'.repeat(32)}`,
      'second burn recipient',
    )).toThrow(/not an exact executable ErgoTree/i);
    expect(assertExactExecutableErgoTree(
      wasm,
      `0008cd02${'43'.repeat(32)}`,
      'third burn recipient',
    )).toBe(`0008cd02${'43'.repeat(32)}`);
  });
});
