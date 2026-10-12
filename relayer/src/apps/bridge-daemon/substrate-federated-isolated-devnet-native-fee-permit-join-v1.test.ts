import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubstrateFederatedLocalDevnetGenesisConfirmation as Confirmation }
  from '../../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';

const ports = vi.hoisted(() => {
  const stages = () => ({ authorize: vi.fn(), reserve: vi.fn(), submit: vi.fn(),
    finalize: vi.fn(), confirm: vi.fn() });
  return { tracker: stages(), withdrawal: stages(), observer: vi.fn(),
    active: vi.fn(), complete: vi.fn() };
});

vi.mock('../../substrate-federated-isolated-devnet-tracker-fee-funding-authority-v1.js', async importOriginal => ({
  ...(await importOriginal()),
  assertSubstrateFederatedIsolatedDevnetFeeFundingTransportActiveV1: ports.active,
  authorizeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1: ports.tracker.authorize,
  reserveSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1: ports.tracker.reserve,
  confirmSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1: ports.tracker.confirm,
  authorizeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1: ports.withdrawal.authorize,
  reserveSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1: ports.withdrawal.reserve,
  confirmSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1: ports.withdrawal.confirm,
}));
vi.mock('../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', async importOriginal => ({
  ...(await importOriginal()),
  submitSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1: ports.tracker.submit,
  finalizeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1: ports.tracker.finalize,
  submitSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1: ports.withdrawal.submit,
  finalizeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1: ports.withdrawal.finalize,
}));
vi.mock('../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js', async importOriginal => ({
  ...(await importOriginal()),
  createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1: ports.observer,
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js', async importOriginal => ({
  ...(await importOriginal()),
  completeSubstrateFederatedIsolatedDevnetOwnedMiningTransactionV1: ports.complete,
}));

import {
  executeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1,
  executeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1,
} from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import { SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN as primaryOrigin }
  from '../../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';

type Input = Parameters<typeof executeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1>[0];
type Role = 'tracker' | 'withdrawal';
const hex = (n: number) => n.toString(16).padStart(2, '0').repeat(32);
const executions = {
  tracker: executeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1,
  withdrawal: executeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1,
};

function confirmation(patch: Partial<Confirmation> = {}): Confirmation {
  return { status: 'confirmed', confirmations: 10, observedAtHeight: 111,
    confirmationHeight: 101, confirmationHeaderIdHex: hex(7),
    observationDigestHex: hex(8), observerArtifact: Object.freeze({ synthetic: true }), ...patch };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

// Real wrappers, canonical wait and normalizer; synthetic authority, transport,
// observer and owner ports. These tests establish no signing or node acceptance.
function fixture(role: Role, status: 'accepted' | 'ambiguous' = 'accepted') {
  const stages = ports[role];
  const events: string[] = [];
  const target = Object.freeze({ synthetic: 'target', primaryNodeOrigin: primaryOrigin }) as unknown as Input['target'];
  const state = Object.freeze({ synthetic: 'journal' }) as unknown as Input['state'];
  const feeInputBox = Object.freeze({ boxId: hex(1), transactionId: hex(2), index: 0,
    value: '2000000', ergoTree: '0008cd03' + hex(3), creationHeight: 100,
    assets: [], additionalRegisters: {} });
  const checked = Object.freeze({ transaction: { outputs: [feeInputBox] } }) as unknown as Input['checked'];
  const authorization = Object.freeze({ genesisHeaderIdHex: hex(5), authorizationDigestHex: hex(6) });
  const attempt = Object.freeze({ expectedTxId: hex(2), durableAttemptDigestHex: hex(9) });
  const submission = Object.freeze({ status, submittedTxId: status === 'accepted' ? attempt.expectedTxId : null,
    responseDigestHex: hex(10) });
  const finalized = Object.freeze({ journalDigestHex: hex(11) });
  const observed = confirmation();
  const confirmed = Object.freeze({ confirmationHeight: 101, confirmationHeaderId: hex(7) });
  const observe = vi.fn<() => Promise<Confirmation | null>>(async () => { events.push('observe'); return observed; });
  const observer = Object.freeze({ observe, reconciliationIdentityDigestHex: hex(12) });
  stages.authorize.mockImplementation(async () => { events.push('authorize'); return authorization; });
  ports.observer.mockImplementation(() => { events.push('observer'); return observer; });
  stages.reserve.mockImplementation(() => { events.push('reserve'); return attempt; });
  stages.submit.mockImplementation(async () => { events.push('submit'); return submission; });
  stages.finalize.mockImplementation(() => { events.push('finalize'); return finalized; });
  ports.active.mockImplementation(() => { events.push('active'); });
  ports.complete.mockImplementation(async () => { events.push('complete'); });
  stages.confirm.mockImplementation(async () => { events.push('confirm'); return confirmed; });
  const input: Input = { target, checked, state, transactionPermitsEnabled: true };
  return { stages, events, input, feeInputBox, authorization, attempt, submission,
    finalized, observed, confirmed, observe, execute: executions[role] };
}

function expectOneSubmission(f: ReturnType<typeof fixture>) {
  expect(f.stages.authorize).toHaveBeenCalledTimes(1);
  expect(f.stages.reserve).toHaveBeenCalledTimes(1);
  expect(f.stages.submit).toHaveBeenCalledExactlyOnceWith(f.input.target, f.attempt, true);
  expect(f.stages.finalize).toHaveBeenCalledExactlyOnceWith(f.attempt, f.submission);
}

describe.each(['tracker', 'withdrawal'] as const)('%s fee permit join (synthetic ports)', role => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('network forbidden in direct tests'); }));
  });
  afterEach(() => {
    for (const unused of Object.values(ports[role === 'tracker' ? 'withdrawal' : 'tracker'])) {
      expect(unused).not.toHaveBeenCalled();
    }
    expect(fetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(['accepted', 'ambiguous'] as const)('joins %s transport to exact completion before confirmation', async status => {
    const f = fixture(role, status);
    const started = performance.now();
    const result = await f.execute(f.input);
    expect(f.events).toEqual(['authorize', 'observer', 'reserve', 'submit', 'finalize',
      'active', 'active', 'observe', 'active', 'complete', 'active', 'confirm']);
    expectOneSubmission(f);
    expect(ports.observer).toHaveBeenCalledExactlyOnceWith(f.input.target, f.authorization.genesisHeaderIdHex);
    expect(ports.active).toHaveBeenCalledTimes(4);
    for (const call of ports.active.mock.calls) expect(call).toEqual([f.attempt, f.input.target]);
    expect(f.observe).toHaveBeenCalledExactlyOnceWith(f.attempt.expectedTxId, primaryOrigin);
    expect(ports.complete).toHaveBeenCalledExactlyOnceWith(f.input.target, f.attempt.expectedTxId, started + 120_000);
    expect(f.stages.confirm).toHaveBeenCalledExactlyOnceWith(f.attempt, f.observed);
    expect(f.stages.confirm.mock.calls[0]![1].observerArtifact).toBe(f.observed.observerArtifact);
    expect(result.feeInputBox).toBe(f.feeInputBox);
    expect(result.transportStatus).toBe(status);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each(['omitted', 'false'] as const)('preserves the exact legacy two-argument submit when %s', async mode => {
    const f = fixture(role);
    const { transactionPermitsEnabled: _selection, ...legacy } = f.input;
    await f.execute(mode === 'omitted' ? legacy : { ...legacy, transactionPermitsEnabled: false });
    expect(f.stages.submit).toHaveBeenCalledExactlyOnceWith(f.input.target, f.attempt);
    expect(ports.active).not.toHaveBeenCalled();
    expect(ports.complete).not.toHaveBeenCalled();
    expect(f.events).toEqual(['authorize', 'observer', 'reserve', 'submit', 'finalize', 'observe', 'confirm']);
  });

  it.each([
    ['null', null], ['zero', 0], ['one', 1], ['string', 'true'],
    ['object', {}], ['array', []], ['function', () => true], ['boxed Boolean', new Boolean(true)],
  ])('refuses non-Boolean selection %s before every effect', async (_name, selection) => {
    const f = fixture(role);
    await expect(f.execute({ ...f.input, transactionPermitsEnabled: selection } as unknown as Input))
      .rejects.toThrow('transaction permit selection is invalid');
    expect(f.events).toEqual([]);
    for (const port of Object.values(f.stages)) expect(port).not.toHaveBeenCalled();
    expect(ports.observer).not.toHaveBeenCalled();
    expect(ports.complete).not.toHaveBeenCalled();
    expect(ports.active).not.toHaveBeenCalled();
  });

  it('does not confirm or resolve until deferred owner completion settles', async () => {
    const f = fixture(role);
    const gate = deferred<void>();
    ports.complete.mockImplementationOnce(() => { f.events.push('complete'); return gate.promise; });
    let settled = false;
    const execution = f.execute(f.input).then(
      () => { settled = true; return { ok: true }; },
      (error: unknown) => { settled = true; return { ok: false, error }; },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(ports.complete).toHaveBeenCalledTimes(1);
    expect(f.stages.confirm).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    gate.resolve();
    expect(await execution).toEqual({ ok: true });
    expect(f.stages.confirm).toHaveBeenCalledTimes(1);
    expectOneSubmission(f);
  });

  it('propagates the exact deferred completion failure without confirm or retry', async () => {
    const f = fixture(role, 'ambiguous');
    const gate = deferred<void>();
    const error = new Error('synthetic completion lost');
    ports.complete.mockReturnValueOnce(gate.promise);
    const outcome = f.execute(f.input).then(() => null, (failure: unknown) => failure);
    await vi.advanceTimersByTimeAsync(0);
    expect(ports.complete).toHaveBeenCalledTimes(1);
    gate.reject(error);
    expect(await outcome).toBe(error);
    expect(f.stages.confirm).not.toHaveBeenCalled();
    expect(f.observe).toHaveBeenCalledTimes(1);
    expectOneSubmission(f);
  });

  it.each(['observation', 'completion'] as const)('rechecks custody after deferred %s before confirming', async boundary => {
    const f = fixture(role);
    const observed = deferred<Confirmation>();
    const completed = deferred<void>();
    if (boundary === 'observation') f.observe.mockReturnValueOnce(observed.promise);
    else ports.complete.mockReturnValueOnce(completed.promise);
    const error = new Error('synthetic attempt custody revoked');
    const outcome = f.execute(f.input).then(() => null, (failure: unknown) => failure);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.observe).toHaveBeenCalledTimes(1);
    expect(ports.complete).toHaveBeenCalledTimes(boundary === 'completion' ? 1 : 0);
    ports.active.mockImplementation(() => { throw error; });
    if (boundary === 'observation') observed.resolve(f.observed);
    else completed.resolve();
    expect(await outcome).toBe(error);
    expect(f.stages.confirm).not.toHaveBeenCalled();
    expect(ports.complete).toHaveBeenCalledTimes(boundary === 'completion' ? 1 : 0);
    expectOneSubmission(f);
  });

  it('keeps the original deadline through a Pending poll without early completion', async () => {
    const f = fixture(role, 'ambiguous');
    const gate = deferred<Confirmation>();
    f.observe.mockResolvedValueOnce(confirmation({ status: 'pending', confirmations: 0,
      confirmationHeight: null, confirmationHeaderIdHex: null })).mockReturnValueOnce(gate.promise);
    const started = performance.now();
    const execution = f.execute(f.input).then(
      () => ({ ok: true }), (error: unknown) => ({ ok: false, error }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(ports.complete).not.toHaveBeenCalled();
    expect(f.stages.confirm).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.observe).toHaveBeenCalledTimes(2);
    expect(ports.complete).not.toHaveBeenCalled();
    gate.resolve(f.observed);
    expect(await execution).toEqual({ ok: true });
    expect(ports.complete).toHaveBeenCalledExactlyOnceWith(f.input.target, f.attempt.expectedTxId, started + 120_000);
    expectOneSubmission(f);
  });

  it('never completes or confirms when Pending exhausts the original confirmation deadline', async () => {
    const f = fixture(role);
    f.observe.mockResolvedValue(confirmation({ status: 'pending', confirmations: 0,
      confirmationHeight: null, confirmationHeaderIdHex: null }));
    const outcome = f.execute(f.input).then(() => null, (failure: unknown) => failure);
    await vi.runAllTimersAsync();
    expect(await outcome).toBeInstanceOf(Error);
    expect(performance.now()).toBe(120_000);
    expect(ports.complete).not.toHaveBeenCalled();
    expect(f.stages.confirm).not.toHaveBeenCalled();
    expectOneSubmission(f);
  });

  it('rejects a consistent depth below ten in the real normalizer before owner completion', async () => {
    const f = fixture(role);
    f.observe.mockResolvedValueOnce(confirmation({ confirmations: 9, observedAtHeight: 110 }));
    await expect(f.execute(f.input)).rejects.toThrow('confirmation observation changed');
    expect(ports.complete).not.toHaveBeenCalled();
    expect(f.stages.confirm).not.toHaveBeenCalled();
    expectOneSubmission(f);
  });

  it('refuses a completion that settles exactly at the original deadline', async () => {
    const f = fixture(role);
    const gate = deferred<void>();
    ports.complete.mockReturnValueOnce(gate.promise);
    const outcome = f.execute(f.input).then(() => null, (failure: unknown) => failure);
    await vi.advanceTimersByTimeAsync(0);
    expect(ports.complete).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    gate.resolve();
    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('completion exceeded its original deadline');
    expect(f.stages.confirm).not.toHaveBeenCalled();
    expectOneSubmission(f);
  });
});
