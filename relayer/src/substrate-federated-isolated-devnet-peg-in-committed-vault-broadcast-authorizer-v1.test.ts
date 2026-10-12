import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCandidate: vi.fn(),
  assertCandidateV2: vi.fn(),
  assertNativePacket: vi.fn(),
  assertReadCustody: vi.fn(),
  assertNativeSource: vi.fn(),
  assertExecutionCheck: vi.fn(),
  assertHandleBinding: vi.fn(),
  assertHandle: vi.fn(),
  assertSigned: vi.fn(),
  assertSourceLockObservation: vi.fn(),
  assertSourceLockObservationV2: vi.fn(),
  assertTarget: vi.fn(),
  checkSignedTransaction: vi.fn(),
  normalizeEip12Box: vi.fn(),
  readBox: vi.fn(),
  readHeader: vi.fn(),
  boxes: new Map<string, unknown>(),
  tipCalls: new Map<string, number>(),
  tipResponses: new Map<
    string,
    Array<Readonly<{ height: number; id: string }>>
  >(),
  tipHeight: 101,
  tipIdHex: '',
}));

vi.mock('./authenticated-spv-tracker-read-only-node-client.js', () => ({
  AuthenticatedSpvTrackerReadOnlyNodeClient: class {
    readonly origin: string;

    constructor(origin: string) {
      this.origin = origin;
    }

    async getBestHeader() {
      const calls = (mocks.tipCalls.get(this.origin) ?? 0) + 1;
      mocks.tipCalls.set(this.origin, calls);
      const responses = mocks.tipResponses.get(this.origin);
      const configured = responses?.[calls - 1] ?? responses?.at(-1);
      if (configured !== undefined) return configured;
      return {
        id: mocks.tipIdHex,
        height: mocks.tipHeight,
      };
    }

    async getBoxByIdOrNull(boxId: string) {
      return mocks.readBox(this.origin, boxId);
    }

    async getBlockHeaderById(id: string) {
      return mocks.readHeader(this.origin, id);
    }
  },
}));
vi.mock('./fleet-signer.js', () => ({
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding:
    mocks.assertHandleBinding,
  assertLocalWasmCheckedSubmissionHandleV1Provenance: mocks.assertHandle,
  assertLocalWasmSignedCheckCandidateProvenance: mocks.assertSigned,
  checkSignedTransaction: mocks.checkSignedTransaction,
}));
vi.mock('./substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1:
    mocks.assertTarget,
}));
vi.mock('./substrate-federated-isolated-devnet-peg-in-candidate-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV1:
    mocks.assertCandidate,
}));
vi.mock('./substrate-federated-isolated-devnet-peg-in-candidate-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV2: mocks.assertCandidateV2,
  assertSubstrateFederatedNativeGenesisPegInPacketV1: mocks.assertNativePacket,
  assertSubstrateFederatedNativeGenesisPegInReadCustodyV1: mocks.assertReadCustody,
}));
vi.mock(
  './substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1:
      mocks.assertSourceLockObservation,
    assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationForCandidateV2:
      mocks.assertSourceLockObservationV2,
    assertSubstrateFederatedNativeGenesisPegInSourceLockOutputObservationV1: mocks.assertNativeSource,
  }),
);
vi.mock(
  './substrate-federated-isolated-devnet-reward-input-discovery-v1.js',
  () => ({
    SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN:
      'http://127.0.0.1:9051',
    SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN:
      'http://127.0.0.1:9052',
  }),
);
vi.mock('./substrate-federated-isolated-devnet-setup-check-execution-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionCheckV1:
    mocks.assertExecutionCheck,
}));
vi.mock('./unsigned-ergo-transaction.js', () => ({
  normalizeEip12Box: mocks.normalizeEip12Box,
}));

import {
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1,
  createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1,
  createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV2,
  createSubstrateFederatedNativeGenesisPegInCommittedVaultAuthorizationSessionV1,
} from './substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js';
import {
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import * as operations from './substrate-federated-native-committed-reserve-revalidation-operation-v1.js';
import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 as rootTag }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';
import { tagNativeTwoCycleCycleStepFailureV1 as stepTag }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { tagSubstrateFederatedNativeCommittedReserveFailureStageV1 as stageTag }
  from './substrate-federated-native-committed-reserve-failure-v1.js';
import { tagNativeCommittedReserveRevalidationOriginV1 as originTag }
  from './substrate-federated-native-committed-reserve-revalidation-v1.js';

const hex = (byte: string): string => byte.repeat(32);
const PRIMARY = 'http://127.0.0.1:9051' as const;
const WITNESS = 'http://127.0.0.1:9052' as const;
const BINDING = Object.freeze({
  processBindingDigestHex: hex('11'),
  executionTargetIdentityDigestHex: hex('12'),
});
const TARGET = Object.freeze({
  primaryNodeOrigin: PRIMARY,
  witnessNodeOrigin: WITNESS,
  primaryMining: true as const,
  witnessReadOnly: true as const,
});

function box(boxId: string) {
  return Object.freeze({
    boxId,
    value: '1000000',
    ergoTree: '00',
    assets: Object.freeze([]),
    additionalRegisters: Object.freeze({}),
    creationHeight: 90,
    transactionId: hex('90'),
    index: 0,
  });
}

function fixture(heights: { source?: number; successor?: number } = {}) {
  const sourceFunding = box(hex('21'));
  const reservePredecessor = box(hex('22'));
  const sourceLock = Object.freeze({ ...box(hex('23')), creationHeight: heights.source ?? 90 });
  const transitionFeeFunding = box(hex('24'));
  const reserveTransitionTxId = hex('25');
  const sourceLockTxId = hex('26');
  const eip12Tx = Object.freeze({
    inputs: Object.freeze([
      Object.freeze({ boxId: reservePredecessor.boxId }),
      Object.freeze({ boxId: sourceLock.boxId }),
      Object.freeze({ boxId: transitionFeeFunding.boxId }),
    ]),
  });
  const packet = Object.freeze({
    boxes: Object.freeze({
      sourceFundingInput: sourceFunding,
      reservePredecessor,
      sourceLock,
      transitionFeeFunding,
      reserveSuccessor: Object.freeze({ ...box(hex('82')), creationHeight: heights.successor ?? 90 }),
    }),
    transactions: Object.freeze({
      sourceLockCreation: Object.freeze({ txId: sourceLockTxId }),
      reserveTransition: Object.freeze({
        txId: reserveTransitionTxId,
        eip12Tx,
      }),
    }),
  });
  const batch = Object.freeze({
    request: Object.freeze({ requestDigestHex: hex('27') }),
  });
  const candidate = Object.freeze({
    candidateDigestHex: hex('28'),
    depositPacket: packet,
  });
  const signerContext = Object.freeze({
    profile: 'e2s.local-wasm-check-signer.v1',
    pubKeyHex: hex('29'),
    ergoTreeHex: `0008cd${hex('29')}`,
    networkPrefix: 16,
    stateContextTipHeight: 99,
    stateContextTipIdHex: hex('30'),
  });
  const signedCandidate = Object.freeze({
    profile: 'e2s.local-wasm-signed-check-candidate.v1',
    txId: reserveTransitionTxId,
    signedTransactionDigestHex: hex('31'),
    signedTransactionBytesSha256Hex: hex('32'),
    signedTransactionBytesLength: 456,
    nodeOrigin: PRIMARY,
    signerContext,
  });
  const checkerIdentity = Object.freeze({
    profile: 'e2s.ergo-node-checker.v1',
    sourceAdapterProfile: 'e2s.ergo-node-json-source.v1',
    nodeOrigin: PRIMARY,
    path: '/transactions/check' as const,
    method: 'POST' as const,
    transportPolicy: 'no-redirect-no-proxy' as const,
  });
  const handle = Object.freeze({
    profile: 'e2s.local-wasm-checked-submission-handle.v1',
    txId: reserveTransitionTxId,
    nodeOrigin: PRIMARY,
    signedTransactionDigestHex: signedCandidate.signedTransactionDigestHex,
    signedTransactionBytesSha256Hex:
      signedCandidate.signedTransactionBytesSha256Hex,
    signedTransactionBytesLength: signedCandidate.signedTransactionBytesLength,
    checkResponseDigestHex: hex('33'),
    checkerIdentity,
  });
  const executionCheck = Object.freeze({
    receipt: Object.freeze({
      unsignedTransactionIdHex: reserveTransitionTxId,
      signedTransactionIdHex: reserveTransitionTxId,
      reservePredecessorBoxIdHex: reservePredecessor.boxId,
      sourceLockBoxIdHex: sourceLock.boxId,
      transitionFeeFundingBoxIdHex: transitionFeeFunding.boxId,
      unsignedTransactionDigestHex: hex('34'),
      signedTransactionCanonicalJsonSha256Hex:
        signedCandidate.signedTransactionDigestHex,
      receiptDigestHex: hex('35'),
    }),
    signedCandidate,
    checkedAcceptance: Object.freeze({ submissionHandle: handle }),
  });
  const sourceLockObservation = Object.freeze({
    expectedTxId: sourceLockTxId,
    sourceFundingBoxIdHex: sourceFunding.boxId,
    sourceLockBoxIdHex: sourceLock.boxId,
    transitionFeeFundingBoxIdHex: transitionFeeFunding.boxId,
    processBindingDigestHex: BINDING.processBindingDigestHex,
    executionTargetIdentityDigestHex: BINDING.executionTargetIdentityDigestHex,
    confirmationHeight: 100,
    confirmationObservationDigestHex: hex('36'),
    observationDigestHex: hex('37'),
    boundaries: Object.freeze({
      sourceFundingSpent: true as const,
      sourceLockUnspentAndExact: true as const,
      transitionFeeFundingUnspentAndExact: true as const,
    }),
  });
  const admission = Object.freeze({
    operationProfile: PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    expectedTxId: reserveTransitionTxId,
    sourceBoxId: reservePredecessor.boxId,
    inputBoxIds: Object.freeze([
      reservePredecessor.boxId,
      sourceLock.boxId,
      transitionFeeFunding.boxId,
    ]),
    targetSidechainHeight: null,
    targetSidechainBlockHashHex: null,
    heartbeatKeyHex: null,
    unsignedTransaction: eip12Tx,
    bindingDigestHex: hex('38'),
  });
  const checked = Object.freeze({
    signed: Object.freeze({
      admission,
      nodeOrigin: PRIMARY,
      signedTransactionDigestHex: signedCandidate.signedTransactionDigestHex,
      signerArtifact: signedCandidate,
    }),
    checkResponseDigestHex: handle.checkResponseDigestHex,
    checkerArtifact: handle,
  });
  const input = Object.freeze({
    target: TARGET,
    batch,
    candidate,
    executionCheck,
    sourceLockObservation,
  });
  const freshCheck = Object.freeze({
    txId: reserveTransitionTxId,
    checkResult: Object.freeze({ accepted: true }),
    signedTransactionDigestHex: signedCandidate.signedTransactionDigestHex,
    signedTransactionBytesSha256Hex:
      signedCandidate.signedTransactionBytesSha256Hex,
    signedTransactionBytesLength: signedCandidate.signedTransactionBytesLength,
    signerContext,
    checkerIdentity,
  });

  mocks.assertCandidate.mockImplementation((value, valueBatch, valueTarget) => {
    if (value !== candidate || valueBatch !== batch || valueTarget !== TARGET) {
      throw new Error('candidate provenance missing');
    }
    return packet;
  });
  mocks.assertExecutionCheck.mockImplementation((value, valueTarget) => {
    if (value !== executionCheck || valueTarget !== TARGET) {
      throw new Error('execution-check provenance missing');
    }
    return BINDING;
  });
  mocks.assertSourceLockObservation.mockImplementation((value, valueTarget) => {
    if (value !== sourceLockObservation || valueTarget !== TARGET) {
      throw new Error('source-lock observation provenance missing');
    }
  });
  mocks.checkSignedTransaction.mockResolvedValue(freshCheck);
  mocks.boxes.set(reservePredecessor.boxId, reservePredecessor);
  mocks.boxes.set(sourceLock.boxId, sourceLock);
  mocks.boxes.set(transitionFeeFunding.boxId, transitionFeeFunding);

  return { checked, executionCheck, freshCheck, input, signedCandidate };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.boxes.clear();
  mocks.tipCalls.clear();
  mocks.tipResponses.clear();
  mocks.tipHeight = 101;
  mocks.tipIdHex = hex('40');
  mocks.assertTarget.mockImplementation(value => {
    if (value !== TARGET) throw new Error('target provenance missing');
    return BINDING;
  });
  mocks.assertHandleBinding.mockImplementation((_handle, binding) => {
    if (binding !== BINDING) throw new Error('execution binding changed');
  });
  mocks.normalizeEip12Box.mockImplementation(async value => value);
  mocks.readBox.mockImplementation(async (_origin, id) => mocks.boxes.get(id) ?? null);
  mocks.readHeader.mockImplementation(async (_origin, id) => {
    const height = Number.parseInt(id, 16);
    return { id, height, parentId: (height - 1).toString(16).padStart(64, '0') };
  });
});

describe('native committed-vault observation scheduling (mocked provenance and node fields)', () => {
  const create = createSubstrateFederatedNativeGenesisPegInCommittedVaultAuthorizationSessionV1;
  const tipId = (height: number) => height.toString(16).padStart(64, '0');
  function nativeFixture(heights: { source?: number; successor?: number } = {}) {
    const f = fixture(heights);
    const packet = f.input.candidate.depositPacket;
    const batch = { ...f.input.batch, receipt: { receiptDigestHex: hex('81') }, targetBinding: BINDING };
    const input = { ...f.input, packet, batch };
    const assertPacket = (value: unknown, valueBatch: unknown, target: unknown) => {
      if (value !== packet || valueBatch !== batch || target !== TARGET) throw new Error('native custody lost');
      return packet;
    };
    mocks.assertNativePacket.mockImplementation(assertPacket);
    mocks.assertReadCustody.mockImplementation(assertPacket);
    mocks.assertNativeSource.mockImplementation((value, target, valueBatch, valuePacket) => {
      if (value !== input.sourceLockObservation) throw new Error('native source observation lost');
      assertPacket(valuePacket, valueBatch, target);
    });
    mocks.tipIdHex = tipId(mocks.tipHeight);
    return { ...f, input };
  }

  function projectEscapingOperation(error: unknown) {
    // These are the unchanged enclosing helper/root tags, not operation inputs.
    originTag(stepTag(rootTag(stageTag(error, 'operational-revalidate', 'continuation'),
      'cycle-1'), 'cycle-1', 'committed-reserve'), 'revalidator-call');
    return operations.projectNativeCommittedReserveRevalidationOperationV1(error);
  }

  function projectEscapingRefusal(error: unknown) {
    projectEscapingOperation(error);
    return operations.projectNativeCommittedReserveInputRefusalV1(error);
  }
  function captureRefusals() {
    const captured: Array<{ value: unknown; detail: Readonly<operations.NativeCommittedReserveInputRefusalV1> }> = [];
    const factory = operations.createNativeCommittedReserveInputRefusalTaggerV1;
    const spy = vi.spyOn(operations, 'createNativeCommittedReserveInputRefusalTaggerV1').mockImplementation(() => {
      const tag = factory();
      return <T>(value: T, detail: Readonly<operations.NativeCommittedReserveInputRefusalV1>): T => {
        captured.push({ value, detail }); return tag(value, detail);
      };
    });
    return { captured, spy };
  }

  describe('actual explicit native input refusal predicates', () => {
    const phases = ['before', 'after'] as const;
    const roles = ['primary', 'witness'] as const;
    const boxCodes = ['source-funding-present', 'transition-input-unavailable', 'transition-input-bytes-changed'] as const;
    it.each(boxCodes.flatMap(code => roles.flatMap(role => phases.map(phase => ({ code, role, phase }))))) (
      'projects $code/$role/$phase from the exact escaping Error', async ({ code, role, phase }) => {
        const f = nativeFixture(); const origin = role === 'primary' ? PRIMARY : WITNESS;
        let active = phase === 'before';
        mocks.checkSignedTransaction.mockImplementation(async () => { active = true; return f.freshCheck; });
        mocks.readBox.mockImplementation(async (node, id) => {
          if (active && node === origin) {
            if (code === 'source-funding-present' && id === f.input.packet.boxes.sourceFundingInput.boxId) return f.input.packet.boxes.sourceFundingInput;
            if (id === f.input.packet.boxes.sourceLock.boxId) {
              if (code === 'transition-input-unavailable') return null;
              if (code === 'transition-input-bytes-changed') return { ...f.input.packet.boxes.sourceLock, value: '1' };
            }
          }
          return mocks.boxes.get(id) ?? null;
        });
        const capture = captureRefusals(); const session = create(f.input as never);
        try {
          const error = await session.revalidator.revalidate(f.checked as never).then(() => undefined, error => error);
          expect(error).toBeInstanceOf(Error); expect(capture.captured).toHaveLength(1);
          expect(error).toBe(capture.captured[0]!.value);
          expect(projectEscapingRefusal(error)).toEqual({ refusalCode: code, nodeRole: role });
          expect(projectEscapingOperation(error)).toBe(`input-observation-${phase}-check`);
          expect(mocks.checkSignedTransaction).toHaveBeenCalledTimes(phase === 'before' ? 0 : 1);
          expect(mocks.readBox).toHaveBeenCalledTimes(phase === 'before' ? 8 : 16);
          expect(() => session.takePreTransportObservation()).toThrow(/unavailable or consumed/);
          expect(() => session.broadcastAuthorizer.authorize({ checked: f.checked, revalidationDigestHex: hex('99') } as never)).toThrow();
        } finally { capture.spy.mockRestore(); }
      });

    it.each(['source-refund-timeout', 'successor-creation-height-window'].flatMap(code => roles.flatMap(role =>
      phases.map(phase => ({ code, role, phase })))))('projects height $code/$role/$phase', async ({ code, role, phase }) => {
      const refund = code === 'source-refund-timeout';
      const f = nativeFixture({ source: 90, successor: refund ? 10_000 : 100 });
      const base = refund ? 10_080 : 150; const invalid = refund ? 10_089 : 200;
      mocks.tipHeight = base; mocks.tipIdHex = tipId(base);
      const configure = () => mocks.tipResponses.set(role === 'primary' ? PRIMARY : WITNESS,
        (phase === 'before' ? [invalid, invalid] : [base, base, invalid, invalid]).map(height => ({ height, id: tipId(height) })));
      if (phase === 'before') configure();
      else mocks.checkSignedTransaction.mockImplementation(async () => { configure(); return f.freshCheck; });
      const capture = captureRefusals();
      try {
        const error = await create(f.input as never).revalidator.revalidate(f.checked as never).then(() => undefined, error => error);
        expect(capture.captured).toHaveLength(1); expect(error).toBe(capture.captured[0]!.value);
        expect(projectEscapingRefusal(error)).toEqual({ refusalCode: code, nodeRole: role });
        expect(projectEscapingOperation(error)).toBe(`input-observation-${phase}-check`);
        expect(mocks.checkSignedTransaction).toHaveBeenCalledTimes(phase === 'before' ? 0 : 1);
      } finally { capture.spy.mockRestore(); }
    });

    it.each(roles)('projects after-check ancestry bound for %s before ancestry HTTP reads', async role => {
      const f = nativeFixture(); mocks.checkSignedTransaction.mockImplementation(async () => {
        mocks.tipResponses.set(role === 'primary' ? PRIMARY : WITNESS,
          [101, 101, 166, 166].map(height => ({ height, id: tipId(height) })));
        return f.freshCheck;
      });
      const capture = captureRefusals();
      try {
        const error = await create(f.input as never).revalidator.revalidate(f.checked as never).then(() => undefined, error => error);
        expect(capture.captured).toHaveLength(1); expect(error).toBe(capture.captured[0]!.value);
        expect(projectEscapingRefusal(error)).toEqual({ refusalCode: 'check-ancestry-window-exceeded', nodeRole: role });
        expect(projectEscapingOperation(error)).toBe('input-observation-after-check');
        expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce(); expect(mocks.readHeader).not.toHaveBeenCalled();
      } finally { capture.spy.mockRestore(); }
    });

    it.each(phases)('projects exactly one pair exhaustion in %s-check', async phase => {
      const f = nativeFixture(); const configure = () => {
        for (const origin of [PRIMARY, WITNESS]) mocks.tipResponses.set(origin,
          (phase === 'before' ? [101, 102, 103, 104, 105, 106] : [101, 101, 102, 103, 104, 105, 106, 107])
            .map(height => ({ height, id: tipId(height) })));
      };
      if (phase === 'before') configure(); else mocks.checkSignedTransaction.mockImplementation(async () => { configure(); return f.freshCheck; });
      const capture = captureRefusals();
      try {
        const error = await create(f.input as never).revalidator.revalidate(f.checked as never).then(() => undefined, error => error);
        expect(capture.captured).toHaveLength(1); expect(error).toBe(capture.captured[0]!.value);
        expect(projectEscapingRefusal(error)).toEqual({ refusalCode: 'input-observation-convergence-exhausted', nodeRole: 'pair' });
        expect(projectEscapingOperation(error)).toBe(`input-observation-${phase}-check`);
        expect(mocks.readBox).toHaveBeenCalledTimes(phase === 'before' ? 24 : 32);
        expect(mocks.checkSignedTransaction).toHaveBeenCalledTimes(phase === 'before' ? 0 : 1);
      } finally { capture.spy.mockRestore(); }
    });

    it('does not tag a transient paired lag followed by convergence', async () => {
      const f = nativeFixture();
      mocks.tipResponses.set(PRIMARY, [102, 102, 102, 102].map(height => ({ height, id: tipId(height) })));
      mocks.tipResponses.set(WITNESS, [101, 101, 102, 102].map(height => ({ height, id: tipId(height) })));
      const capture = captureRefusals();
      try {
        await expect(create(f.input as never).revalidator.revalidate(f.checked as never)).resolves.toBeDefined();
        expect(capture.captured).toEqual([]); expect(mocks.readBox).toHaveBeenCalledTimes(24);
        expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
      } finally { capture.spy.mockRestore(); }
    });

    it.each([PRIMARY, WITNESS])('selects primary explicit Error after both read groups settle, %s finishes first', async first => {
      const f = nativeFixture(); const releases = new Map<string, () => void>(); const started: string[] = [];
      mocks.readBox.mockImplementation(async (origin, id) => {
        if (id === f.input.packet.boxes.sourceFundingInput.boxId) {
          await new Promise<void>(resolve => { releases.set(origin, resolve); started.push(origin); });
          return origin === PRIMARY ? f.input.packet.boxes.sourceFundingInput : null;
        }
        if (origin === WITNESS && id === f.input.packet.boxes.sourceLock.boxId) return null;
        return mocks.boxes.get(id) ?? null;
      });
      const capture = captureRefusals(); let settled = false;
      try {
        const result = create(f.input as never).revalidator.revalidate(f.checked as never)
          .then(() => { settled = true; return undefined; }, error => { settled = true; return error; });
        await new Promise(resolve => setImmediate(resolve)); expect(started.sort()).toEqual([PRIMARY, WITNESS]);
        releases.get(first)!(); await new Promise(resolve => setImmediate(resolve)); expect(settled).toBe(false);
        releases.get(first === PRIMARY ? WITNESS : PRIMARY)!(); const error = await result;
        expect(capture.captured).toHaveLength(2);
        const primary = capture.captured.find(entry => entry.detail.nodeRole === 'primary')!;
        const witness = capture.captured.find(entry => entry.detail.nodeRole === 'witness')!;
        expect(error).toBe(primary.value); expect(projectEscapingRefusal(error)).toEqual({ refusalCode: 'source-funding-present', nodeRole: 'primary' });
        expect(projectEscapingRefusal(witness.value)).toBeNull(); expect(mocks.readBox).toHaveBeenCalledTimes(8);
        expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
      } finally { for (const release of releases.values()) release(); capture.spy.mockRestore(); }
    });

    it.each([new Error('native committed-vault observation reached the source refund timeout'), 'source-funding-present', null])(
      'does not classify dependency lookalike %#', async dependency => {
        const f = nativeFixture(); mocks.readBox.mockImplementation(async () => { throw dependency; });
        const capture = captureRefusals();
        try {
          await expect(create(f.input as never).revalidator.revalidate(f.checked as never)).rejects.toBe(dependency);
          expect(capture.captured).toEqual([]); expect(projectEscapingRefusal(dependency)).toBeNull();
          expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
        } finally { capture.spy.mockRestore(); }
      });

    it.each(['factory', 'tag'] as const)('preserves the existing predicate error when optional refusal %s throws', async fault => {
      const f = nativeFixture(); mocks.boxes.set(f.input.packet.boxes.sourceFundingInput.boxId, f.input.packet.boxes.sourceFundingInput);
      const seen: unknown[] = []; const factory = operations.createNativeCommittedReserveRevalidationOperationTaggerV1;
      const operationSpy = vi.spyOn(operations, 'createNativeCommittedReserveRevalidationOperationTaggerV1').mockImplementation(() => {
        const tag = factory(); return <T>(value: T, operation: operations.NativeCommittedReserveRevalidationOperationV1): T => {
          seen.push(value); return tag(value, operation);
        };
      });
      const tagInputs: unknown[] = [];
      const refusalSpy = vi.spyOn(operations, 'createNativeCommittedReserveInputRefusalTaggerV1').mockImplementation(() => {
        if (fault === 'factory') throw new Error('optional factory');
        return <T>(value: T): T => { tagInputs.push(value); throw new Error('optional tag'); };
      });
      try {
        const error = await create(f.input as never).revalidator.revalidate(f.checked as never).then(() => undefined, error => error);
        expect(error).toBeInstanceOf(Error); expect(error.message).toBe('isolated committed-vault primary reports original source funding');
        expect(seen).toEqual([error]); if (fault === 'tag') expect(tagInputs).toContain(error);
        expect(projectEscapingRefusal(error)).toBeNull(); expect(projectEscapingOperation(error)).toBe('input-observation-before-check');
        expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
      } finally { refusalSpy.mockRestore(); operationSpy.mockRestore(); }
    });

    it('does not project a tagged predicate masked by the final custody guard', async () => {
      const f = nativeFixture();
      const custody = new Error('fixture final target custody refusal');
      mocks.readBox.mockImplementation(async (origin, id) => {
        if (origin === PRIMARY && id === f.input.packet.boxes.sourceFundingInput.boxId) {
          return f.input.packet.boxes.sourceFundingInput;
        }
        return mocks.boxes.get(id) ?? null;
      });
      const capture = captureRefusals();
      const session = create(f.input as never);
      const assertTarget = mocks.assertTarget.getMockImplementation()!;
      mocks.assertTarget.mockImplementation(value => {
        if (capture.captured.length > 0) throw custody;
        return assertTarget(value);
      });
      try {
        await expect(session.revalidator.revalidate(f.checked as never)).rejects.toBe(custody);
        expect(capture.captured).toHaveLength(1);
        expect(capture.captured[0]!.value).not.toBe(custody);
        expect(capture.captured[0]!.detail).toEqual({ refusalCode: 'source-funding-present', nodeRole: 'primary' });
        expect(projectEscapingOperation(custody)).toBe('input-observation-before-check');
        expect(projectEscapingRefusal(custody)).toBeNull();
        expect(projectEscapingRefusal(capture.captured[0]!.value)).toBeNull();
        expect(mocks.readBox).toHaveBeenCalledTimes(8);
        expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
      } finally { mocks.assertTarget.mockImplementation(assertTarget); capture.spy.mockRestore(); }
    });

    it('exercises pair disagreement only with a deliberately unstable mocked normalizer result', async () => {
      const f = nativeFixture();
      mocks.normalizeEip12Box.mockImplementation(async (value, label) => {
        if (!String(label).includes('primary reserve predecessor')) return value;
        let reads = 0;
        // The real WASM normalizer returns ordinary canonical data. This getter
        // violates that port contract to reach a defensive pair predicate; it
        // is not evidence of reachability with valid native observations.
        return { ...value, get value() { return ++reads <= 2 ? value.value : '1'; } };
      });
      const capture = captureRefusals();
      try {
        const error = await create(f.input as never).revalidator.revalidate(f.checked as never).then(() => undefined, error => error);
        expect(capture.captured).toHaveLength(1); expect(error).toBe(capture.captured[0]!.value);
        expect(projectEscapingRefusal(error)).toEqual({ refusalCode: 'paired-observations-disagree', nodeRole: 'pair' });
        expect(projectEscapingOperation(error)).toBe('input-observation-before-check');
        expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
      } finally { capture.spy.mockRestore(); }
    });
  });

  it.each(operations.NATIVE_COMMITTED_RESERVE_REVALIDATION_OPERATIONS_V1)
    ('attributes the actual native escaping %s operation without changing its error', async operation => {
      const f = nativeFixture();
      const session = create(f.input as never);
      const error = new Error('opaque unchanged operation failure');
      let freezeSpy: ReturnType<typeof vi.spyOn> | undefined;
      if (operation === 'ingress-binding') mocks.assertTarget.mockImplementationOnce(() => { throw error; });
      if (operation === 'input-observation-before-check') mocks.readBox.mockImplementation(async () => { throw error; });
      if (operation === 'fresh-signed-check') mocks.checkSignedTransaction.mockRejectedValueOnce(error);
      if (operation === 'input-observation-after-check') mocks.checkSignedTransaction.mockImplementationOnce(async () => {
        mocks.readBox.mockImplementation(async () => { throw error; });
        return f.freshCheck;
      });
      if (operation === 'post-check-observation-join' || operation === 'final-authorizer-binding') {
        const freeze = Object.freeze;
        freezeSpy = vi.spyOn(Object, 'freeze').mockImplementation(value => {
          // A join-return escape or the next binding check: no claim that the
          // post-check regression predicate can be reached with valid reads.
          if (value !== null && typeof value === 'object'
            && Object.keys(value).length === 2
            && Object.hasOwn(value, 'observation')
            && Object.hasOwn(value, 'freshJvmCheckResponseDigestHex')) {
            if (operation === 'post-check-observation-join') throw error;
            mocks.assertTarget.mockImplementationOnce(() => { throw error; });
          }
          return freeze(value);
        });
      }
      try {
        await expect(session.revalidator.revalidate(f.checked as never)).rejects.toBe(error);
        expect(error.message).toBe('opaque unchanged operation failure');
        expect(projectEscapingOperation(error)).toBe(operation);
        expect(mocks.checkSignedTransaction).toHaveBeenCalledTimes(
          operation === 'ingress-binding' || operation === 'input-observation-before-check' ? 0 : 1);
      } finally { freezeSpy?.mockRestore(); }
    });

  it('keeps an ingress refusal outside the original failed-state transition', async () => {
    const f = nativeFixture();
    const session = create(f.input as never);
    const error = new Error('temporary ingress refusal');
    mocks.assertTarget.mockImplementationOnce(() => { throw error; });
    await expect(session.revalidator.revalidate(f.checked as never)).rejects.toBe(error);
    expect(projectEscapingOperation(error)).toBe('ingress-binding');
    await expect(session.revalidator.revalidate(f.checked as never)).resolves.toBeDefined();
    expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
  });

  it('keeps an entered check failure terminal for the original one-shot state', async () => {
    const f = nativeFixture();
    const session = create(f.input as never);
    const error = new Error('fresh check refusal');
    mocks.checkSignedTransaction.mockRejectedValueOnce(error);
    await expect(session.revalidator.revalidate(f.checked as never)).rejects.toBe(error);
    expect(projectEscapingOperation(error)).toBe('fresh-signed-check');
    await expect(session.revalidator.revalidate(f.checked as never)).rejects.toThrow(/one-shot/);
    expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
    expect(() => session.takePreTransportObservation()).toThrow();
  });

  it('retains successful revalidation after the later one-shot ingress refusal', async () => {
    const f = nativeFixture();
    const session = create(f.input as never);
    const result = await session.revalidator.revalidate(f.checked as never);
    const error = await session.revalidator.revalidate(f.checked as never).catch(value => value);
    expect(error).toBeInstanceOf(Error);
    expect(projectEscapingOperation(error)).toBe('ingress-binding');
    expect(session.broadcastAuthorizer.authorize({ checked: f.checked,
      revalidationDigestHex: result.revalidationDigestHex } as never)).toBeDefined();
    expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
  });

  it('invalidates one Error reused across two actual native revalidation invocations', async () => {
    const error = new Error('same opaque value');
    for (let invocation = 0; invocation < 2; invocation += 1) {
      const f = nativeFixture();
      mocks.checkSignedTransaction.mockRejectedValueOnce(error);
      await expect(create(f.input as never).revalidator.revalidate(f.checked as never)).rejects.toBe(error);
      expect(projectEscapingOperation(error)).toBe(invocation === 0 ? 'fresh-signed-check' : null);
    }
  });

  it.each(['factory', 'tag'] as const)('preserves failure when optional operation %s fails', async fault => {
    const f = nativeFixture();
    const session = create(f.input as never);
    const error = new Error('original check failure');
    mocks.checkSignedTransaction.mockRejectedValueOnce(error);
    const spy = vi.spyOn(operations, 'createNativeCommittedReserveRevalidationOperationTaggerV1')
      .mockImplementation(() => {
        if (fault === 'factory') throw new Error('optional factory');
        return () => { throw new Error('optional tag'); };
      });
    try {
      await expect(session.revalidator.revalidate(f.checked as never)).rejects.toBe(error);
      expect(projectEscapingOperation(error)).toBeNull();
      await expect(session.revalidator.revalidate(f.checked as never)).rejects.toThrow(/one-shot/);
      expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
    } finally { spy.mockRestore(); }
  });

  it('preserves success when the optional operation factory fails', async () => {
    const f = nativeFixture();
    const session = create(f.input as never);
    const spy = vi.spyOn(operations, 'createNativeCommittedReserveRevalidationOperationTaggerV1')
      .mockImplementation(() => { throw new Error('optional factory'); });
    try {
      const result = await session.revalidator.revalidate(f.checked as never);
      expect(session.broadcastAuthorizer.authorize({ checked: f.checked,
        revalidationDigestHex: result.revalidationDigestHex } as never)).toBeDefined();
      expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
    } finally { spy.mockRestore(); }
  });

  it('leaves legacy revalidation errors without native operation attribution', async () => {
    const f = fixture();
    const error = new Error('legacy check failure');
    mocks.checkSignedTransaction.mockRejectedValueOnce(error);
    await expect(createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
      f.input as never).revalidator.revalidate(f.checked as never)).rejects.toBe(error);
    expect(projectEscapingOperation(error)).toBeNull();
  });

  it('preserves a primitive thrown by the actual native fresh checker', async () => {
    const f = nativeFixture();
    mocks.checkSignedTransaction.mockRejectedValueOnce('opaque primitive');
    await expect(create(f.input as never).revalidator.revalidate(f.checked as never))
      .rejects.toBe('opaque primitive');
    expect(operations.projectNativeCommittedReserveRevalidationOperationV1('opaque primitive')).toBeNull();
  });

  it('keeps full provenance checks outside the native equal-tip read window', async () => {
    const f = nativeFixture();
    mocks.assertTarget.mockImplementation(() => {
      mocks.tipIdHex = tipId(++mocks.tipHeight);
      return BINDING;
    });
    const session = create(f.input as never);
    await expect(session.revalidator.revalidate(f.checked as never)).resolves.toBeDefined();
    expect(mocks.assertReadCustody).toHaveBeenCalled();
    expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
  });

  it('accepts a bounded descendant across one fresh JVM check with exact input rereads', async () => {
    const f = nativeFixture();
    mocks.checkSignedTransaction.mockImplementation(async () => {
      mocks.tipHeight += 2;
      mocks.tipIdHex = tipId(mocks.tipHeight);
      return f.freshCheck;
    });
    const session = create(f.input as never);
    await expect(session.revalidator.revalidate(f.checked as never)).resolves.toBeDefined();
    expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
    for (const origin of [PRIMARY, WITNESS]) {
      expect(mocks.readHeader).toHaveBeenCalledWith(origin, tipId(103));
      expect(mocks.readHeader).toHaveBeenCalledWith(origin, tipId(102));
      expect(mocks.readHeader).toHaveBeenCalledWith(origin, tipId(101));
      expect(mocks.readBox.mock.calls.filter(([node]) => node === origin)).toHaveLength(8);
    }
  });

  it.each([PRIMARY, WITNESS])('drains pending sibling reads on %s before reporting a native failure', async delayed => {
    const f = nativeFixture();
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    let drained = false;
    mocks.readBox.mockImplementation(async (origin, id) => {
      if (origin === PRIMARY && id === f.input.packet.boxes.sourceFundingInput.boxId) throw new Error('fixture read failure');
      if (origin === delayed && id === f.input.packet.boxes.sourceLock.boxId) {
        started();
        await pending;
        drained = true;
      }
      return mocks.boxes.get(id) ?? null;
    });
    let settled = false;
    const result = create(f.input as never).revalidator.revalidate(f.checked as never)
      .then(() => undefined, error => { settled = true; return error; });
    await entered;
    await new Promise(resolve => setImmediate(resolve));
    const settledWhilePending = settled;
    release();
    const error = await result;
    expect(settledWhilePending).toBe(false);
    expect(drained).toBe(true);
    expect(error.message).toBe('fixture read failure');
    expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
  });

  it.each([false, true])('selects the exact paired precheck refusal with final custody replacement %s', async replaceAtFinalGuard => {
    const f = nativeFixture();
    const permanent = new Error('fixture permanent witness read refusal');
    const custody = new Error('fixture final target custody refusal');
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    let completedReads = 0;
    mocks.tipResponses.set(PRIMARY, [
      { height: 101, id: tipId(101) },
      { height: 102, id: tipId(102) },
    ]);
    mocks.readBox.mockImplementation(async (origin, id) => {
      try {
        if (origin === WITNESS && id === f.input.packet.boxes.sourceFundingInput.boxId) {
          throw permanent;
        }
        if (origin === WITNESS && id === f.input.packet.boxes.sourceLock.boxId) {
          started();
          await pending;
        }
        return mocks.boxes.get(id) ?? null;
      } finally { completedReads += 1; }
    });
    const session = create(f.input as never);
    const assertTarget = mocks.assertTarget.getMockImplementation()!;
    mocks.assertTarget.mockImplementation(value => {
      // Only the outer finally runs after all eight box reads have settled.
      if (replaceAtFinalGuard && completedReads === 8) throw custody;
      return assertTarget(value);
    });
    let settled = false;
    const result = session.revalidator.revalidate(f.checked as never)
      .then(() => { settled = true; return undefined; }, error => { settled = true; return error; });
    let pendingState;
    try {
      await entered;
      await new Promise(resolve => setImmediate(resolve));
      pendingState = {
        settled, completedReads,
        primaryTipReads: mocks.tipCalls.get(PRIMARY),
        witnessTipReads: mocks.tipCalls.get(WITNESS),
      };
    } finally { release(); }
    const error = await result;
    expect(pendingState).toEqual({
      settled: false, completedReads: 7, primaryTipReads: 2, witnessTipReads: 1,
    });
    expect(completedReads).toBe(8);
    expect(error).toBe(replaceAtFinalGuard ? custody : permanent);
    expect(projectEscapingOperation(error)).toBe('input-observation-before-check');
    if (replaceAtFinalGuard) expect(projectEscapingOperation(permanent)).toBeNull();
    expect(mocks.readBox).toHaveBeenCalledTimes(8);
    expect(mocks.normalizeEip12Box).toHaveBeenCalledTimes(3);
    expect(mocks.tipCalls.get(PRIMARY)).toBe(2);
    expect(mocks.tipCalls.get(WITNESS)).toBe(1);
    expect(mocks.readHeader).not.toHaveBeenCalled();
    expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
    // Restore only the fixture guard so the failed one-shot state, rather than
    // the injected custody error, decides both capability refusals below.
    mocks.assertTarget.mockImplementation(assertTarget);
    expect(() => session.takePreTransportObservation()).toThrow(/unavailable or consumed/);
    expect(() => session.broadcastAuthorizer.authorize({ checked: f.checked,
      revalidationDigestHex: hex('99') } as never)).toThrow();
    await expect(session.revalidator.revalidate(f.checked as never)).rejects.toThrow(/one-shot/);
    expect(mocks.readBox).toHaveBeenCalledTimes(8);
    expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
  });

  it.each([64, 65])('enforces the %i-block post-check ancestry boundary', async advance => {
    const f = nativeFixture();
    mocks.checkSignedTransaction.mockImplementation(async () => {
      mocks.tipHeight += advance;
      mocks.tipIdHex = tipId(mocks.tipHeight);
      return f.freshCheck;
    });
    const session = create(f.input as never);
    const result = session.revalidator.revalidate(f.checked as never);
    if (advance === 64) {
      await expect(result).resolves.toBeDefined();
      expect(mocks.readHeader).toHaveBeenCalledTimes(2 * 65);
    } else {
      await expect(result).rejects.toThrow(/bounded tip window/);
      expect(mocks.readHeader).not.toHaveBeenCalled();
      expect(() => session.takePreTransportObservation()).toThrow();
    }
    expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
  });

  it.each([
    { boundary: 'refund last valid', source: 90, successor: 10000, before: 10087, after: 10088, accepted: true },
    { boundary: 'refund first invalid', source: 90, successor: 10000, before: 10088, after: 10089, accepted: false },
    { boundary: 'successor last valid', source: 90, successor: 90, before: 188, after: 189, accepted: true },
    { boundary: 'successor first invalid', source: 90, successor: 90, before: 189, after: 190, accepted: false },
  ])('enforces native $boundary across the fresh JVM check', async test => {
    const f = nativeFixture(test);
    mocks.tipHeight = test.before; mocks.tipIdHex = tipId(test.before);
    mocks.checkSignedTransaction.mockImplementation(async () => {
      mocks.tipHeight = test.after; mocks.tipIdHex = tipId(test.after); return f.freshCheck;
    });
    const session = create(f.input as never);
    const result = session.revalidator.revalidate(f.checked as never);
    if (test.accepted) await expect(result).resolves.toBeDefined();
    else {
      await expect(result).rejects.toThrow(test.boundary.startsWith('refund') ? /refund timeout/ : /successor creation-height/);
      expect(() => session.takePreTransportObservation()).toThrow();
    }
    expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
  });

  it.each([PRIMARY, WITNESS].flatMap(origin => [
    ['missing', /must be an object/], ['height', /identity changed/], ['id', /identity changed/],
    ['parent encoding', /parent must be/], ['fork', /previously observed height/],
    ['historical ID', /historical header ID/], ['parent disagreement', /parent changed/],
  ].filter(([fault]) => origin === PRIMARY || (fault !== 'fork' && fault !== 'historical ID'))
    .map(([fault, expected]) => ({ origin, fault: fault as string, expected: expected as RegExp }))))
    ('rejects $origin ancestry $fault without an authorization', async ({ origin, fault, expected }) => {
      const f = nativeFixture();
      mocks.checkSignedTransaction.mockImplementation(async () => {
        mocks.tipHeight = 103; mocks.tipIdHex = tipId(103); return f.freshCheck;
      });
      mocks.readHeader.mockImplementation(async (node, id) => {
        const height = Number.parseInt(id, 16);
        const header = { id, height, parentId: tipId(height - 1) };
        if ((node === origin || fault === 'fork' || fault === 'historical ID')
          && height === (fault === 'parent disagreement' ? 101 : 102)) {
          if (fault === 'missing') return null;
          if (fault === 'height') header.height += 1;
          if (fault === 'id') header.id = hex('ff');
          if (fault === 'parent encoding') header.parentId = 'bad';
          if (fault === 'fork') header.parentId = hex('ff');
          if (fault === 'historical ID') header.parentId = tipId(103);
          if (fault === 'parent disagreement') header.parentId = hex('ab');
        }
        // A competing history is self-consistent locally but conflicts with the prior tip.
        if (id === hex('ff')) return { id, height: 101, parentId: tipId(100) };
        if (fault === 'historical ID' && id === tipId(103)
          && mocks.readHeader.mock.calls.filter(([n, h]) => n === node && h === id).length === 2) {
          return { id, height: 101, parentId: tipId(100) };
        }
        return header;
      });
      const session = create(f.input as never);
      await expect(session.revalidator.revalidate(f.checked as never)).rejects.toThrow(expected);
      expect(() => session.takePreTransportObservation()).toThrow();
      expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
    });

  it.each([102, 103])('checks the native successor minimum creation height %i', async successor => {
    const f = nativeFixture({ successor });
    const result = create(f.input as never).revalidator.revalidate(f.checked as never);
    if (successor === 102) await expect(result).resolves.toBeDefined();
    else await expect(result).rejects.toThrow(/successor creation-height/);
    expect(mocks.checkSignedTransaction).toHaveBeenCalledTimes(successor === 102 ? 1 : 0);
  });

  it.each([0x7fff_ffff, Number.MAX_SAFE_INTEGER])('rejects an unrepresentable upcoming height after tip %i', async height => {
    const f = nativeFixture();
    mocks.tipHeight = height; mocks.tipIdHex = tipId(height);
    await expect(create(f.input as never).revalidator.revalidate(f.checked as never))
      .rejects.toThrow(/upcoming evaluation height/);
    expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
  });

  it.each(['regression', 'replacement', 'reused ID'])('rejects post-JVM tip %s', async fault => {
    const f = nativeFixture();
    mocks.checkSignedTransaction.mockImplementation(async () => {
      if (fault === 'regression') { mocks.tipHeight = 100; mocks.tipIdHex = tipId(100); }
      if (fault === 'replacement') mocks.tipIdHex = hex('fe');
      if (fault === 'reused ID') mocks.tipHeight = 102;
      return f.freshCheck;
    });
    await expect(create(f.input as never).revalidator.revalidate(f.checked as never))
      .rejects.toThrow(/regressed, replaced or reused/);
    expect(mocks.readHeader).not.toHaveBeenCalled();
  });

  it.each(['sourceFundingInput', 'reservePredecessor', 'sourceLock', 'transitionFeeFunding'] as const)
    ('rejects changed %s after JVM checking', async field => {
      const f = nativeFixture();
      mocks.checkSignedTransaction.mockImplementation(async () => {
        const box = f.input.packet.boxes[field];
        mocks.boxes.set(box.boxId, field === 'sourceFundingInput' ? box : { ...box, value: '1' });
        return f.freshCheck;
      });
      await expect(create(f.input as never).revalidator.revalidate(f.checked as never))
        .rejects.toThrow(/original source funding|input bytes changed/);
    });

  it.each(['box', 'normalization', 'ancestry'])('rejects lost read custody during %s awaits', async stage => {
    const f = nativeFixture();
    let active = true;
    const assert = mocks.assertReadCustody.getMockImplementation()!;
    mocks.assertReadCustody.mockImplementation((...args) => {
      if (!active) throw new Error('fixture custody disposed');
      return assert(...args);
    });
    const callback = stage === 'box' ? mocks.readBox : stage === 'normalization' ? mocks.normalizeEip12Box : mocks.readHeader;
    const read = callback.getMockImplementation()!;
    callback.mockImplementation(async (...args) => { const value = await read(...args); active = false; return value; });
    if (stage === 'ancestry') mocks.checkSignedTransaction.mockImplementation(async () => {
      mocks.tipHeight = 102; mocks.tipIdHex = tipId(102); return f.freshCheck;
    });
    await expect(create(f.input as never).revalidator.revalidate(f.checked as never))
      .rejects.toThrow('fixture custody disposed');
    expect(mocks.checkSignedTransaction).toHaveBeenCalledTimes(stage === 'ancestry' ? 1 : 0);
  });

  it('retains the closing full source assertion after a short native read group', async () => {
    const f = nativeFixture();
    let observed = false;
    const read = mocks.readBox.getMockImplementation()!;
    mocks.readBox.mockImplementation(async (...args) => { const value = await read(...args); observed = true; return value; });
    mocks.assertNativeSource.mockImplementation(() => { if (observed) throw new Error('fixture source provenance changed'); });
    await expect(create(f.input as never).revalidator.revalidate(f.checked as never))
      .rejects.toThrow('fixture source provenance changed');
    expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
  });

  it.each([PRIMARY, WITNESS])('retries a stable lagging %s observation as one paired window', async lagging => {
    const f = nativeFixture();
    for (const origin of [PRIMARY, WITNESS]) {
      mocks.tipResponses.set(origin, (origin === lagging ? [101, 101, 102, 102] : [102, 102, 102, 102])
        .map(height => ({ height, id: tipId(height) })));
    }
    await expect(create(f.input as never).revalidator.revalidate(f.checked as never)).resolves.toBeDefined();
    expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
    expect(mocks.readBox).toHaveBeenCalledTimes(24);
  });

  it('bounds native paired retries without nested per-node attempts', async () => {
    const f = nativeFixture();
    for (const origin of [PRIMARY, WITNESS]) mocks.tipResponses.set(origin,
      [101, 102, 103, 104, 105, 106].map(height => ({ height, id: tipId(height) })));
    await expect(create(f.input as never).revalidator.revalidate(f.checked as never)).rejects.toThrow(/did not stabilize/);
    expect(mocks.readBox).toHaveBeenCalledTimes(24);
    expect(mocks.tipCalls.get(PRIMARY)).toBe(6);
    expect(mocks.tipCalls.get(WITNESS)).toBe(6);
    expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
  });

  it.each([PRIMARY, WITNESS])('does not hide %s invalid input behind a peer tip advance', async invalid => {
    const f = nativeFixture();
    const peer = invalid === PRIMARY ? WITNESS : PRIMARY;
    mocks.tipResponses.set(peer, [101, 102].map(height => ({ height, id: tipId(height) })));
    mocks.readBox.mockImplementation(async (origin, id) => origin === invalid && id === f.input.packet.boxes.sourceLock.boxId
      ? { ...f.input.packet.boxes.sourceLock, value: '1' } : mocks.boxes.get(id) ?? null);
    await expect(create(f.input as never).revalidator.revalidate(f.checked as never)).rejects.toThrow(/input bytes changed/);
    expect(mocks.readBox).toHaveBeenCalledTimes(8);
    expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
  });
});

describe('isolated committed-vault V2 authorization boundary (mocked provenance and node fields)', () => {
  const create = createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV2;
  function fixtureV2() {
    const f = fixture();
    const candidate = Object.freeze({ ...f.input.candidate, version: 2 });
    const batch = Object.freeze({ ...f.input.batch, version: 3 });
    const input = { ...f.input, candidate, batch };
    mocks.assertCandidateV2.mockImplementation((value, valueBatch, target) => {
      if (value !== candidate || valueBatch !== batch || target !== TARGET) {
        throw new Error('V2 candidate provenance missing');
      }
      return candidate.depositPacket;
    });
    mocks.assertSourceLockObservationV2.mockImplementation((value, valueBatch, valueCandidate, target) => {
      if (value !== input.sourceLockObservation || valueBatch !== batch
        || valueCandidate !== candidate || target !== TARGET) {
        throw new Error('V2 source observation candidate binding missing');
      }
    });
    return { ...f, input };
  }

  it('binds V2 source evidence to one fresh recheck and one generic V1 authorization', async () => {
    const f = fixtureV2();
    const session = create(f.input as never);
    const revalidation = await session.revalidator.revalidate(f.checked as never);
    const revalidated = { checked: f.checked, revalidationDigestHex: revalidation.revalidationDigestHex };
    const evidence = session.broadcastAuthorizer.authorize(revalidated as never);
    expect(evidence.authorizationArtifact).toMatchObject({ version: 1 });
    expect(() => assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1(
      session.broadcastAuthorizer, { revalidated, ...evidence } as never,
    )).not.toThrow();
    expect(session.takePreTransportObservation()).toMatchObject({ observedTipHeight: 101 });
    expect(() => session.takePreTransportObservation()).toThrow(/consumed/);
    expect(mocks.assertCandidate).not.toHaveBeenCalled();
    expect(mocks.assertSourceLockObservation).not.toHaveBeenCalled();
    expect(mocks.assertSourceLockObservationV2).toHaveBeenCalledWith(
      f.input.sourceLockObservation, f.input.batch, f.input.candidate, TARGET,
    );
    expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
  });

  it.each(['V1 candidate', 'copied candidate', 'V1 setup', 'copied target', 'copied observation'] as const)(
    'rejects %s before async revalidation', fault => {
      const f = fixtureV2();
      const supplied = { ...f.input };
      if (fault === 'V1 candidate') supplied.candidate = { ...f.input.candidate, version: 1 } as never;
      if (fault === 'copied candidate') supplied.candidate = { ...f.input.candidate };
      if (fault === 'V1 setup') supplied.batch = { ...f.input.batch, version: 2 } as never;
      if (fault === 'copied target') supplied.target = { ...TARGET };
      if (fault === 'copied observation') supplied.sourceLockObservation = { ...f.input.sourceLockObservation };
      expect(() => create(supplied as never)).toThrow(/provenance|binding/);
      expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
    },
  );

  it.each(['candidate', 'batch'] as const)(
    'rejects another valid %s with identical source-output bytes', field => {
      const f = fixtureV2();
      // Only the upstream candidate guard accepts the separate identity. The
      // source-observation guard must still receive the exact retained tuple.
      mocks.assertCandidateV2.mockReturnValue(f.input.candidate.depositPacket);
      const supplied = { ...f.input, [field]: { ...f.input[field] } };
      expect(() => create(supplied as never)).toThrow(/source observation candidate binding/);
      expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
    },
  );

  it('keeps the old entrypoint strictly V1', () => {
    const f = fixtureV2();
    expect(() => createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(f.input as never))
      .toThrow(/candidate provenance/);
    expect(mocks.assertCandidateV2).not.toHaveBeenCalled();
  });

  it('reads getter-backed candidate and target slots once through async revalidation', async () => {
    const f = fixtureV2();
    let candidateReads = 0;
    let targetReads = 0;
    const supplied = {
      ...f.input,
      get candidate() { return ++candidateReads === 1 ? f.input.candidate : { ...f.input.candidate }; },
      get target() { return ++targetReads === 1 ? TARGET : { ...TARGET }; },
    };
    const session = create(supplied as never);
    const revalidation = await session.revalidator.revalidate(f.checked as never);
    expect(() => session.broadcastAuthorizer.authorize({
      checked: f.checked, revalidationDigestHex: revalidation.revalidationDigestHex,
    } as never)).not.toThrow();
    expect(candidateReads).toBe(1);
    expect(targetReads).toBe(1);
  });

  it.each(['processBindingDigestHex', 'executionTargetIdentityDigestHex'] as const)(
    'rejects %s drift after the asynchronous signed-byte recheck', async field => {
      const f = fixtureV2();
      const session = create(f.input as never);
      mocks.checkSignedTransaction.mockImplementationOnce(async () => {
        mocks.assertTarget.mockReturnValue({ ...BINDING, [field]: hex('ee') });
        return f.freshCheck;
      });
      await expect(session.revalidator.revalidate(f.checked as never)).rejects.toThrow(/binding changed|target changed/);
      expect(() => session.takePreTransportObservation()).toThrow();
    },
  );

  it.each(['candidate', 'source observation'] as const)(
    'rechecks retained %s provenance after the asynchronous signed-byte recheck', async boundary => {
      const f = fixtureV2();
      const session = create(f.input as never);
      mocks.checkSignedTransaction.mockImplementationOnce(async () => {
        const guard = boundary === 'candidate' ? mocks.assertCandidateV2 : mocks.assertSourceLockObservationV2;
        guard.mockImplementation(() => { throw new Error('V2 retained provenance revoked'); });
        return f.freshCheck;
      });
      await expect(session.revalidator.revalidate(f.checked as never)).rejects.toThrow(/V2 retained provenance revoked/);
      expect(() => session.takePreTransportObservation()).toThrow();
    },
  );

  it('rejects an input disappearing after the fresh check on the V2 route', async () => {
    const f = fixtureV2();
    const session = create(f.input as never);
    mocks.checkSignedTransaction.mockImplementationOnce(async () => {
      mocks.boxes.delete(f.input.candidate.depositPacket.boxes.sourceLock.boxId);
      return f.freshCheck;
    });
    await expect(session.revalidator.revalidate(f.checked as never)).rejects.toThrow(/input is unavailable/);
  });
});

describe('isolated committed-vault broadcast authorizer V1', () => {
  it('rechecks exact signed bytes and authorizes one current transition', async () => {
    const f = fixture();
    const session =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      );
    const revalidation = await session.revalidator.revalidate(f.checked as never);
    const revalidated = Object.freeze({
      checked: f.checked,
      revalidationDigestHex: revalidation.revalidationDigestHex,
    });
    const evidence = session.broadcastAuthorizer.authorize(revalidated as never);
    const authorization = Object.freeze({
      revalidated,
      authorizationDigestHex: evidence.authorizationDigestHex,
      authorizationArtifact: evidence.authorizationArtifact,
    });

    expect(mocks.checkSignedTransaction).toHaveBeenCalledWith(
      f.signedCandidate,
      'isolated local committed-vault pre-transport recheck',
      PRIMARY,
    );
    expect(session.takePreTransportObservation()).toMatchObject({
      observedTipHeight: 101,
      observedTipHeaderIdHex: hex('40'),
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1(
        session.broadcastAuthorizer,
        authorization as never,
      )
    ).not.toThrow();
    expect(() => session.takePreTransportObservation()).toThrow(/consumed/);
  });

  it('fails closed when the exact transaction expires before transport', async () => {
    const f = fixture();
    const session =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      );
    mocks.tipHeight = 10_000;
    mocks.checkSignedTransaction.mockResolvedValue(null);

    await expect(session.revalidator.revalidate(f.checked as never))
      .rejects.toThrow(/fresh JVM check rejected/);
    expect(mocks.checkSignedTransaction).toHaveBeenCalledOnce();
  });

  it('rejects a second authorization session for one promoted execution check', () => {
    const f = fixture();
    createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
      f.input as never,
    );
    expect(() =>
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      )
    ).toThrow(/already claimed/);
  });

  it('rejects concurrent revalidation while the first attempt is active', async () => {
    const f = fixture();
    const session =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      );

    const first = session.revalidator.revalidate(f.checked as never);
    await expect(session.revalidator.revalidate(f.checked as never))
      .rejects.toThrow(/one-shot/);
    await expect(first).resolves.toMatchObject({
      revalidationDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('reruns the fresh JVM check after the tip advances', async () => {
    const f = fixture();
    const advancedTip = { height: 102, id: hex('41') };
    for (const origin of [PRIMARY, WITNESS]) {
      mocks.tipResponses.set(origin, [
        { height: 101, id: hex('40') },
        { height: 101, id: hex('40') },
        advancedTip,
        advancedTip,
      ]);
    }
    const session =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      );

    const revalidation = await session.revalidator.revalidate(f.checked as never);
    const revalidated = Object.freeze({
      checked: f.checked,
      revalidationDigestHex: revalidation.revalidationDigestHex,
    });
    session.broadcastAuthorizer.authorize(revalidated as never);

    expect(session.takePreTransportObservation()).toMatchObject({
      observedTipHeight: 102,
      observedTipHeaderIdHex: hex('41'),
    });
    expect(mocks.tipCalls.get(PRIMARY)).toBe(6);
    expect(mocks.tipCalls.get(WITNESS)).toBe(6);
    expect(mocks.checkSignedTransaction).toHaveBeenCalledTimes(2);
  });

  it('fails closed when a tip advance makes the transaction expire', async () => {
    const f = fixture();
    const advancedTip = { height: 10_000, id: hex('41') };
    for (const origin of [PRIMARY, WITNESS]) {
      mocks.tipResponses.set(origin, [
        { height: 101, id: hex('40') },
        { height: 101, id: hex('40') },
        advancedTip,
        advancedTip,
      ]);
    }
    mocks.checkSignedTransaction
      .mockResolvedValueOnce(f.freshCheck)
      .mockResolvedValueOnce(null);
    const session =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      );

    await expect(session.revalidator.revalidate(f.checked as never))
      .rejects.toThrow(/fresh JVM check rejected/);
    expect(mocks.checkSignedTransaction).toHaveBeenCalledTimes(2);
  });

  it('retries an advancing input snapshot and returns only the stable view', async () => {
    const f = fixture();
    const advancedTip = { height: 102, id: hex('41') };
    for (const origin of [PRIMARY, WITNESS]) {
      mocks.tipResponses.set(origin, [
        { height: 101, id: hex('40') },
        advancedTip,
        advancedTip,
        advancedTip,
        advancedTip,
        advancedTip,
      ]);
    }
    const session =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      );
    const revalidation = await session.revalidator.revalidate(f.checked as never);
    session.broadcastAuthorizer.authorize(Object.freeze({
      checked: f.checked,
      revalidationDigestHex: revalidation.revalidationDigestHex,
    }) as never);

    expect(session.takePreTransportObservation()).toMatchObject({
      observedTipHeight: 102,
      observedTipHeaderIdHex: hex('41'),
    });
    expect(mocks.tipCalls.get(PRIMARY)).toBe(6);
    expect(mocks.tipCalls.get(WITNESS)).toBe(6);
  });

  it.each([
    ['regression', { height: 100, id: hex('42') }, /tip regressed/],
    ['same-height replacement', { height: 101, id: hex('43') }, /tip replaced or reused/],
    ['height-changing ID reuse', { height: 102, id: hex('40') }, /tip replaced or reused/],
  ] as const)('rejects a %s inside an input snapshot', async (_label, changedTip, error) => {
    const f = fixture();
    mocks.tipResponses.set(PRIMARY, [
      { height: 101, id: hex('40') },
      changedTip,
    ]);
    const session =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      );

    await expect(session.revalidator.revalidate(f.checked as never))
      .rejects.toThrow(error);
    expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
  });

  it('fails closed when one input disappears after the fresh JVM check', async () => {
    const f = fixture();
    mocks.checkSignedTransaction.mockImplementationOnce(async () => {
      mocks.boxes.delete(hex('23'));
      return f.freshCheck;
    });
    const session =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      );

    await expect(session.revalidator.revalidate(f.checked as never))
      .rejects.toThrow(/transition input is unavailable/);
  });

  it('bounds retries when an input snapshot never stabilizes', async () => {
    const f = fixture();
    mocks.tipResponses.set(PRIMARY, Array.from({ length: 6 }, (_, index) => ({
      height: 101 + index,
      id: (41 + index).toString(16).padStart(2, '0').repeat(32),
    })));
    const session =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      );

    await expect(session.revalidator.revalidate(f.checked as never))
      .rejects.toThrow(/tip did not stabilize during input observation/);
    expect(mocks.tipCalls.get(PRIMARY)).toBe(6);
    expect(mocks.checkSignedTransaction).not.toHaveBeenCalled();
  });

  it('bounds retries when the tip never stabilizes around the fresh JVM check', async () => {
    const f = fixture();
    const tips = [
      { height: 101, id: hex('40') },
      { height: 101, id: hex('40') },
      { height: 102, id: hex('41') },
      { height: 102, id: hex('41') },
      { height: 103, id: hex('42') },
      { height: 103, id: hex('42') },
      { height: 104, id: hex('43') },
      { height: 104, id: hex('43') },
    ];
    for (const origin of [PRIMARY, WITNESS]) {
      mocks.tipResponses.set(origin, tips);
    }
    const session =
      createSubstrateFederatedIsolatedDevnetPegInCommittedVaultAuthorizationSessionV1(
        f.input as never,
      );

    await expect(session.revalidator.revalidate(f.checked as never))
      .rejects.toThrow(/tip did not stabilize around fresh JVM check/);
    expect(mocks.checkSignedTransaction).toHaveBeenCalledTimes(3);
  });
});
