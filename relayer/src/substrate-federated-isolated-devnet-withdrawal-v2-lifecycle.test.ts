import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateTracker } from './state-tracker.js';
import type { SubstrateFederatedIsolatedDevnetWithdrawalV2Check as Check }
  from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';

const mocks = vi.hoisted(() => ({ claim: vi.fn(), assert: vi.fn(), read: vi.fn(), observe: vi.fn(),
  artifact: vi.fn(), check: vi.fn(), promote: vi.fn(), binding: vi.fn(), consume: vi.fn(), get: vi.fn(), post: vi.fn() }));
vi.mock('axios', () => ({ default: { get: mocks.get, post: mocks.post,
  isAxiosError: (error: any) => error?.isAxiosError === true } }));
vi.mock('./ergo-helpers.js', () => ({ ngetDirect: mocks.read }));
vi.mock('./unsigned-ergo-transaction.js', () => ({ normalizeEip12Box: async (box: unknown) => box }));
vi.mock('./substrate-federated-isolated-devnet-setup-check-execution-v2.js', () => ({
  claimSubstrateFederatedIsolatedDevnetWithdrawalV2Check: mocks.claim,
  assertSubstrateFederatedIsolatedDevnetWithdrawalV2Check: mocks.assert,
}));
vi.mock('./substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js', () => ({
  createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1: () => ({ observe: mocks.observe }),
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1: mocks.artifact,
}));
vi.mock('./fleet-signer.js', () => ({
  checkSignedTransaction: mocks.check, promoteLocalWasmCheckedTransactionForSubmissionV1: mocks.promote,
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding: mocks.binding,
  assertLocalWasmCheckedSubmissionHandleV1Provenance: vi.fn(), assertLocalWasmSignedCheckCandidateProvenance: vi.fn(),
  consumeLocalWasmCheckedSubmissionHandleV1: mocks.consume,
}));

import { authorizeSubstrateFederatedIsolatedDevnetWithdrawalV2 as authorize,
  reserveSubstrateFederatedIsolatedDevnetWithdrawalV2 as reserve,
  confirmSubstrateFederatedIsolatedDevnetWithdrawalV2 as confirm,
  reobserveSubstrateFederatedIsolatedDevnetConfirmedWithdrawalV2 as reobserveConfirmed }
  from './substrate-federated-isolated-devnet-withdrawal-v2-lifecycle.js';
import { submitSubstrateFederatedIsolatedDevnetWithdrawalV2 as submit,
  finalizeSubstrateFederatedIsolatedDevnetWithdrawalV2 as finalize }
  from './substrate-federated-isolated-devnet-checked-submission-transport-v1.js';

const hex = (n: number) => n.toString(16).padStart(2, '0').repeat(32);
function fixture() {
  const target = Object.freeze({ primaryNodeOrigin: 'http://127.0.0.1:9051', witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMining: true as const, witnessReadOnly: true as const });
  const box = (n: number) => Object.freeze({ boxId: hex(n), value: '10000000', ergoTree: '0008', creationHeight: 100,
    assets: [], additionalRegisters: {}, transactionId: hex(n + 40), index: 0 });
  const inputs = [box(1), box(2), box(3)];
  const outputs = [box(5), box(6), box(7)];
  const tracker = box(4);
  const packet = { transaction: { txId: hex(10), eip12Tx: { inputs, dataInputs: [tracker], outputs }, outputs },
    boxes: { reservePredecessor: inputs[0], duplicatePreventionPredecessor: inputs[1], feeFundingInput: inputs[2],
      trackerDataInput: tracker, reserveSuccessor: outputs[0], duplicatePreventionSuccessor: outputs[1], payout: outputs[2] } };
  const signedCandidate = Object.freeze({ txId: hex(10), nodeOrigin: target.primaryNodeOrigin,
    signedTransactionDigestHex: hex(11), signedTransactionBytesSha256Hex: hex(12), signedTransactionBytesLength: 2000 });
  const checked = Object.freeze({ signedTransactionBytesSha256Hex: hex(12), signedTransactionBytesLength: 2000,
    checkerIdentity: { nodeOrigin: target.primaryNodeOrigin }, txId: hex(10) });
  const check = Object.freeze({ packet, signedCandidate, checkedResult: checked }) as unknown as Readonly<Check>;
  const predecessors = [...inputs, tracker].map((value, index) => Object.freeze({ transactionIdHex: value.transactionId,
    confirmationHeight: 70 + index, confirmationHeaderIdHex: hex(70 + index), confirmations: 20, observedAtHeight: 99 }));
  const lineage = Object.freeze({ target, binding: Object.freeze({ processBindingDigestHex: hex(20), executionTargetIdentityDigestHex: hex(21) }),
    genesisHeaderIdHex: hex(22), setupRequestDigestHex: hex(23), checkDigestHex: hex(24), predecessors });
  const confirmation = Object.freeze({ status: 'confirmed' as const, confirmationHeight: 105, confirmationHeaderIdHex: hex(25),
    confirmations: 10, observedAtHeight: 115, observationDigestHex: hex(26), observerArtifact: Object.freeze({ synthetic: true }) });
  let claimed = false;
  let transported = false;
  mocks.assert.mockImplementation((value, selected) => {
    if (value !== check || selected !== target) throw new Error('synthetic exact check provenance missing');
    return lineage;
  });
  mocks.claim.mockImplementation((...args) => {
    const result = mocks.assert(...args);
    if (claimed) throw new Error('synthetic check already claimed');
    claimed = true; return result;
  });
  mocks.read.mockImplementation(async (path: string) => [...inputs, tracker, ...outputs].find(value => path === `/utxo/byId/${value.boxId}`));
  mocks.observe.mockImplementation(async (txId: string) => {
    const previous = predecessors.find(item => item.transactionIdHex === txId);
    return previous ? { ...confirmation, ...previous, observationDigestHex: hex(27) } : confirmation;
  });
  mocks.check.mockResolvedValue(checked);
  const handle = Object.freeze({ ...signedCandidate, checkResponseDigestHex: hex(28) });
  mocks.promote.mockReturnValue(Object.freeze({ checked, submissionHandle: handle }));
  mocks.consume.mockImplementation(async (selected, candidate, callback) => {
    expect(selected).toBe(handle); expect(candidate).toBe(signedCandidate);
    return callback({ synthetic: 'exact signed transaction', id: signedCandidate.txId });
  });
  mocks.post.mockImplementation(async () => { transported = true; return { status: 200, data: signedCandidate.txId }; });
  mocks.get.mockImplementation(async (url: string) => {
    if (transported && inputs.some(input => url.endsWith(`/utxo/byId/${input.boxId}`))) {
      throw { isAxiosError: true, response: { status: 404 } };
    }
    return { data: inputs[0] };
  });
  return { target, inputs, outputs, tracker, check, lineage, confirmation, handle };
}

// Lifecycle/journal and fixed transport are real; provenance, chain state and
// signer capabilities are doubles. Composed provisioning tests bind real custody.
describe('withdrawal V2 durable lifecycle with bounded capability doubles', () => {
  let root: string;
  let state: StateTracker;
  let f: ReturnType<typeof fixture>;
  beforeEach(() => { vi.resetAllMocks(); root = mkdtempSync(join(tmpdir(), 'bridge-withdrawal-v2-')); state = new StateTracker(join(root, 'state.db')); f = fixture(); });
  afterEach(() => { vi.restoreAllMocks(); state?.close(); rmSync(root, { recursive: true, force: true }); });
  const attempt = async () => reserve(await authorize(f.check, f.target), state);
  const confirmed = async () => {
    const a = await attempt();
    const submission = await submit(f.target, a);
    finalize(a, submission);
    await confirm(a, f.target, f.confirmation);
    return a;
  };

  it.each(['accepted', 'ambiguous'] as const)('completes %s transport once, retaining all three input holds', async status => {
    if (status === 'ambiguous') mocks.post.mockImplementationOnce(async () => { throw { isAxiosError: true, response: { status: 503 } }; });
    const a = await attempt();
    expect(state.getErgoOperationalTransactionAttempt(a.expectedTxId)?.inputBoxIds).toEqual(f.inputs.map(box => box.boxId));
    const submission = await submit(f.target, a);
    expect(submission.status).toBe(status);
    expect(() => finalize(a, { ...submission })).toThrow(/provenance/);
    finalize(a, submission);
    await expect(submit(f.target, a)).rejects.toThrow(/consumed/);
    mocks.get.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    await expect(confirm(a, f.target, f.confirmation)).resolves.toMatchObject({ status: 'confirmed', expectedTxId: a.expectedTxId });
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledTimes(6);
    expect(mocks.check).toHaveBeenCalledExactlyOnceWith(f.check.signedCandidate, 'isolated withdrawal V2 pretransport', f.target.primaryNodeOrigin);
    expect(mocks.promote).toHaveBeenCalledExactlyOnceWith(f.check.signedCandidate, f.check.checkedResult, f.lineage.binding);
    expect(() => finalize(a, submission)).toThrow(/provenance/);
    await expect(confirm(a, f.target, f.confirmation)).rejects.toThrow(/consumed/);
  });

  it('rejects copied check, authorization, target and attempt without transport', async () => {
    await expect(authorize({ ...f.check }, f.target)).rejects.toThrow(/provenance/);
    await expect(authorize(f.check, { ...f.target })).rejects.toThrow(/provenance/);
    const auth = await authorize(f.check, f.target);
    await expect(authorize(f.check, f.target)).rejects.toThrow(/claimed/);
    expect(() => reserve({ ...auth }, state)).toThrow(/absent/);
    const a = reserve(auth, state);
    expect(() => reserve(auth, state)).toThrow(/consumed/);
    await expect(submit(f.target, { ...a })).rejects.toThrow(/provenance/);
    await expect(submit({ ...f.target }, a)).rejects.toThrow(/provenance/);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2, 3])('rejects changed witness input/data input %i at authorization', async index => {
    const read = mocks.read.getMockImplementation()!;
    mocks.read.mockImplementation(async (path, origin) => {
      const result = await read(path, origin);
      return origin === f.target.witnessNodeOrigin && path.endsWith([...f.inputs, f.tracker][index]!.boxId)
        ? { ...result, value: '10000001' } : result;
    });
    await expect(authorize(f.check, f.target)).rejects.toThrow(/revalidated input changed/);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2, 3])('rejects re-included predecessor %i immediately before transport', async index => {
    const a = await attempt(); const observe = mocks.observe.getMockImplementation()!;
    mocks.observe.mockImplementation(async id => {
      const result = await observe(id);
      return id === f.lineage.predecessors[index]!.transactionIdHex ? { ...result, confirmationHeaderIdHex: hex(99) } : result;
    });
    await expect(submit(f.target, a)).rejects.toThrow(`canonical predecessor ${index} changed`);
    await expect(submit(f.target, a)).rejects.toThrow(/consumed/);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it.each(['node', 'post-check-input', 'post-check-journal', 'expired-target'])('blocks %s after reservation', async fault => {
    const a = await attempt();
    if (fault === 'node') mocks.check.mockResolvedValue(null);
    else if (fault === 'expired-target') mocks.assert.mockImplementation(() => { throw new Error('synthetic target expired'); });
    else mocks.check.mockImplementation(async () => {
      if (fault === 'post-check-input') mocks.read.mockResolvedValue({ ...f.inputs[0], value: '0' });
      else vi.spyOn(state, 'getErgoOperationalTransactionAttempt').mockReturnValue(null);
      return f.check.checkedResult;
    });
    await expect(submit(f.target, a)).rejects.toThrow(/node check failed|input changed|journal|expired/);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('latches a concurrent transport before its first await', async () => {
    const a = await attempt(); let release!: (value: unknown) => void;
    mocks.read.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const first = submit(f.target, a);
    await expect(submit(f.target, a)).rejects.toThrow(/consumed/);
    release(f.inputs[0]); await first;
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it('does not reconstruct live authority from a persisted pending row after restart', async () => {
    const a = await attempt(); state.close(); state = new StateTracker(join(root, 'state.db'));
    const row = state.getErgoOperationalTransactionAttempt(a.expectedTxId)!;
    expect(row.status).toBe('pending');
    await expect(submit(f.target, { expectedTxId: row.expectedTxId, durableAttemptDigestHex: row.durableAttemptDigestHex })).rejects.toThrow(/provenance/);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it.each(['reserve', 'finalize'] as const)('fails closed on %s persistence failure', async stage => {
    const auth = await authorize(f.check, f.target);
    if (stage === 'reserve') {
      vi.spyOn(state, 'reserveErgoOperationalTransactionAttempt').mockImplementation(() => { throw new Error('synthetic persistence failure'); });
      expect(() => reserve(auth, state)).toThrow(/persistence/); expect(() => reserve(auth, state)).toThrow(/consumed/);
    } else {
      const a = reserve(auth, state); const submission = await submit(f.target, a);
      vi.spyOn(state, 'finalizeErgoOperationalTransactionAttempt').mockImplementation(() => { throw new Error('synthetic persistence failure'); });
      expect(() => finalize(a, submission)).toThrow(/persistence/);
      expect(() => finalize(a, submission)).toThrow(/provenance/);
      await expect(confirm(a, f.target, f.confirmation)).rejects.toThrow(/journal/);
    }
  });

  it.each([0, 1, 2, 3])('rejects changed canonical successor/data input %i without confirming', async index => {
    const a = await attempt(); const submission = await submit(f.target, a); finalize(a, submission);
    const selected = [...f.outputs, f.tracker][index]!; const read = mocks.read.getMockImplementation()!;
    mocks.read.mockImplementation(async (path, origin) => {
      const result = await read(path, origin);
      return origin === f.target.witnessNodeOrigin && path.endsWith(selected.boxId) ? { ...result, value: '0' } : result;
    });
    await expect(confirm(a, f.target, f.confirmation)).rejects.toThrow(/output differs/);
    expect(state.getErgoOperationalTransactionAttempt(a.expectedTxId)?.status).toBe('accepted');
  });

  it.each(['unspent-0', 'unspent-1', 'unspent-2', 'unavailable', 'reorg', 'depth', 'forged-observer', 'row-drift'])(
    'rejects %s after transport without resubmitting or confirming', async fault => {
      const a = await attempt(); const submission = await submit(f.target, a); finalize(a, submission);
      if (fault.startsWith('unspent-')) {
        const original = mocks.get.getMockImplementation()!;
        mocks.get.mockImplementation(async url => url.startsWith(f.target.witnessNodeOrigin)
          && url.endsWith(f.inputs[Number(fault.at(-1))]!.boxId) ? { data: f.inputs[0] } : original(url));
      } else if (fault === 'unavailable') mocks.get.mockRejectedValue({ isAxiosError: true, response: { status: 503 } });
      else if (fault === 'reorg') mocks.observe.mockResolvedValue({ ...f.confirmation, confirmationHeaderIdHex: hex(99) });
      else if (fault === 'depth') mocks.observe.mockResolvedValue({ ...f.confirmation, status: 'pending' });
      else if (fault === 'forged-observer') mocks.artifact.mockImplementation(() => { throw new Error('synthetic observer provenance'); });
      else {
        const stored = state.getErgoOperationalTransactionAttempt(a.expectedTxId)!;
        vi.spyOn(state, 'getErgoOperationalTransactionAttempt').mockReturnValue({ ...stored, responseDigestHex: hex(99) });
      }
      await expect(confirm(a, f.target, f.confirmation)).rejects.toThrow(/unspent|unavailable|canonical payout changed|provenance|retained transport/);
      await expect(submit(f.target, a)).rejects.toThrow(/consumed/);
      expect(mocks.post).toHaveBeenCalledTimes(1);
    },
  );

  it('reobserves the exact retained reserve, DUP and tracker successors without requiring the spent payout', async () => {
    const a = await confirmed();
    const read = mocks.read.getMockImplementation()!;
    mocks.read.mockImplementation(async (path, origin) => {
      if (path === `/utxo/byId/${f.outputs[2].boxId}`) throw new Error('spent payout must not be reobserved');
      return read(path, origin);
    });
    mocks.read.mockClear(); mocks.get.mockClear(); mocks.observe.mockClear();
    await expect(reobserveConfirmed(a, f.target, f.check)).resolves.toBe(f.check.packet);
    expect(mocks.read).toHaveBeenCalledTimes(6);
    expect(mocks.read.mock.calls.some(([path]) => path === `/utxo/byId/${f.outputs[2].boxId}`)).toBe(false);
    expect(mocks.get).toHaveBeenCalledTimes(6);
    expect(mocks.observe).toHaveBeenCalledExactlyOnceWith(a.expectedTxId, f.target.primaryNodeOrigin);
  });

  it.each([
    ['cloned attempt', (a: Awaited<ReturnType<typeof confirmed>>) => [{ ...a }, f.target, f.check]],
    ['foreign attempt', () => [Object.freeze({ expectedTxId: hex(90), durableAttemptDigestHex: hex(91) }), f.target, f.check]],
    ['cloned check', (a: Awaited<ReturnType<typeof confirmed>>) => [a, f.target, { ...f.check }]],
    ['forged check', (a: Awaited<ReturnType<typeof confirmed>>) => [a, f.target,
      Object.freeze({ packet: f.check.packet, signedCandidate: f.check.signedCandidate, checkedResult: f.check.checkedResult })]],
    ['cloned target', (a: Awaited<ReturnType<typeof confirmed>>) => [a, { ...f.target }, f.check]],
    ['foreign target', (a: Awaited<ReturnType<typeof confirmed>>) => [a,
      Object.freeze({ ...f.target, primaryNodeOrigin: 'http://127.0.0.1:9991' }), f.check]],
  ] as const)('rejects %s provenance during confirmed reobservation', async (_name, build) => {
    const a = await confirmed();
    const [selectedAttempt, selectedTarget, selectedCheck] = build(a);
    await expect(reobserveConfirmed(selectedAttempt as typeof a, selectedTarget as typeof f.target,
      selectedCheck as Readonly<Check>)).rejects.toThrow(/provenance/);
  });

  it('does not treat a confirmed journal row as in-process confirmation authority', async () => {
    const a = await attempt(); const submission = await submit(f.target, a); finalize(a, submission);
    state.confirmErgoOperationalTransactionAttempt({ expectedTxId: a.expectedTxId,
      confirmationHeight: f.confirmation.confirmationHeight!, confirmationHeaderId: f.confirmation.confirmationHeaderIdHex! });
    await expect(reobserveConfirmed(a, f.target, f.check)).rejects.toThrow(/in-process provenance/);
  });

  it('does not retain reobservation authority when the original confirmation fails', async () => {
    const a = await attempt(); const submission = await submit(f.target, a); finalize(a, submission);
    mocks.read.mockResolvedValue({ ...f.outputs[0], value: '0' });
    await expect(confirm(a, f.target, f.confirmation)).rejects.toThrow(/output differs/);
    await expect(reobserveConfirmed(a, f.target, f.check)).rejects.toThrow(/in-process provenance/);
  });

  it('rejects changed reservation fields returned while persisting confirmation', async () => {
    const a = await attempt(); const submission = await submit(f.target, a); finalize(a, submission);
    const persist = state.confirmErgoOperationalTransactionAttempt.bind(state);
    vi.spyOn(state, 'confirmErgoOperationalTransactionAttempt').mockImplementation(input => {
      const changed = { ...persist(input), authorizationDigestHex: hex(84) };
      vi.spyOn(state, 'getErgoOperationalTransactionAttempt').mockReturnValue(changed);
      return changed;
    });
    await expect(confirm(a, f.target, f.confirmation)).rejects.toThrow(/confirmed journal differs/);
    await expect(reobserveConfirmed(a, f.target, f.check)).rejects.toThrow(/in-process provenance/);
  });

  it.each([
    ['reservation', { authorizationDigestHex: hex(80) }],
    ['submission', { submittedTxId: hex(81) }],
    ['confirmation height', { confirmationHeight: 106 }],
    ['confirmation header', { confirmationHeaderId: hex(82) }],
    ['journal timestamp', { updatedAt: '2099-01-01 00:00:00' }],
  ] as const)('rejects changed confirmed %s journal state', async (_name, patch) => {
    const a = await confirmed(); const stored = state.getErgoOperationalTransactionAttempt(a.expectedTxId)!;
    vi.spyOn(state, 'getErgoOperationalTransactionAttempt').mockReturnValue({ ...stored, ...patch });
    await expect(reobserveConfirmed(a, f.target, f.check)).rejects.toThrow(/confirmed journal differs/);
  });

  it('rechecks retained lineage and journal immediately after an output await', async () => {
    const a = await confirmed(); const stored = state.getErgoOperationalTransactionAttempt(a.expectedTxId)!;
    const read = mocks.read.getMockImplementation()!; let restore: (() => void) | undefined;
    mocks.read.mockImplementationOnce(async (...args) => {
      const value = await read(...args);
      const drift = vi.spyOn(state, 'getErgoOperationalTransactionAttempt').mockReturnValue({ ...stored, responseDigestHex: hex(83) });
      restore = () => drift.mockRestore();
      return value;
    });
    await expect(reobserveConfirmed(a, f.target, f.check)).rejects.toThrow(/confirmed journal differs/);
    restore?.();
  });

  it.each([
    ['missing primary reserve', 'primary' as const, 0, 'missing' as const],
    ['changed primary tracker', 'primary' as const, 3, 'changed' as const],
    ['missing witness DUP', 'witness' as const, 1, 'missing' as const],
    ['changed witness reserve', 'witness' as const, 0, 'changed' as const],
  ])('rejects %s during confirmed output reobservation', async (_name, node, index, fault) => {
    const a = await confirmed(); const read = mocks.read.getMockImplementation()!;
    const selected = [...f.outputs, f.tracker][index as number]!;
    const origin = node === 'primary' ? f.target.primaryNodeOrigin : f.target.witnessNodeOrigin;
    mocks.read.mockImplementation(async (path, selectedOrigin) => {
      if (selectedOrigin === origin && path === `/utxo/byId/${selected.boxId}`) {
        if (fault === 'missing') throw new Error('synthetic confirmed output missing');
        return { ...selected, value: '0' };
      }
      return read(path, selectedOrigin);
    });
    await expect(reobserveConfirmed(a, f.target, f.check)).rejects.toThrow(/output missing|output differs/);
  });

  it.each(['primary', 'witness'] as const)('rejects an unspent withdrawal input on the %s node', async node => {
    const a = await confirmed(); const get = mocks.get.getMockImplementation()!;
    const origin = node === 'primary' ? f.target.primaryNodeOrigin : f.target.witnessNodeOrigin;
    mocks.get.mockImplementation(async url => url === `${origin}/utxo/byId/${f.inputs[1].boxId}`
      ? { data: f.inputs[1] } : get(url));
    await expect(reobserveConfirmed(a, f.target, f.check)).rejects.toThrow(/predecessor remains unspent/);
  });

  it.each([
    ['reorg', { confirmationHeaderIdHex: hex(84) }],
    ['height change', { confirmationHeight: 106 }],
    ['confirmation regression', { confirmations: 9 }],
    ['observation regression', { observedAtHeight: 114 }],
    ['loss of confirmation', { status: 'pending' as const, confirmationHeight: null, confirmationHeaderIdHex: null }],
  ])('rejects canonical confirmation %s', async (_name, patch) => {
    const a = await confirmed();
    mocks.observe.mockResolvedValue({ ...f.confirmation, ...patch });
    await expect(reobserveConfirmed(a, f.target, f.check)).rejects.toThrow(/canonical payout changed/);
  });
});
