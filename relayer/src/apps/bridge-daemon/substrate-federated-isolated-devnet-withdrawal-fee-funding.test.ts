import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubstrateFederatedLocalDevnetGenesisConfirmation as Confirmation }
  from '../../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';

const stages = vi.hoisted(() => ({
  authorize: vi.fn(), observer: vi.fn(), reserve: vi.fn(),
  submit: vi.fn(), finalize: vi.fn(), confirm: vi.fn(),
  trackerAuthorize: vi.fn(), trackerReserve: vi.fn(), trackerSubmit: vi.fn(),
  trackerFinalize: vi.fn(), trackerConfirm: vi.fn(),
}));

vi.mock('../../substrate-federated-isolated-devnet-tracker-fee-funding-authority-v1.js', async importOriginal => ({
  ...(await importOriginal()),
  authorizeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1: stages.authorize,
  reserveSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1: stages.reserve,
  confirmSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1: stages.confirm,
  authorizeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1: stages.trackerAuthorize,
  reserveSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1: stages.trackerReserve,
  confirmSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1: stages.trackerConfirm,
}));
vi.mock('../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', async importOriginal => ({
  ...(await importOriginal()),
  submitSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1: stages.submit,
  finalizeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1: stages.finalize,
  submitSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1: stages.trackerSubmit,
  finalizeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1: stages.trackerFinalize,
}));
vi.mock('../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js', async importOriginal => ({
  ...(await importOriginal()),
  createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1: stages.observer,
}));

import { executeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1 as execute }
  from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import { SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN as primaryOrigin }
  from '../../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';

type Input = Parameters<typeof execute>[0];
const hex = (n: number) => n.toString(16).padStart(2, '0').repeat(32);

function confirmation(patch: Partial<Confirmation> = {}): Confirmation {
  return {
    status: 'confirmed', confirmations: 10, observedAtHeight: 111,
    confirmationHeight: 101, confirmationHeaderIdHex: hex(7),
    observationDigestHex: hex(8), observerArtifact: { synthetic: true }, ...patch,
  };
}

// Only orchestration and the canonical wait/normalizer are real here. Existing
// provisioning tests own fee authority, durable holds and after-box reobservation.
function fixture(status: 'accepted' | 'ambiguous' = 'accepted') {
  const events: string[] = [];
  const target = Object.freeze({ synthetic: 'target', primaryNodeOrigin: primaryOrigin }) as unknown as Input['target'];
  const state = Object.freeze({ synthetic: 'journal' }) as unknown as Input['state'];
  const feeInputBox = Object.freeze({
    boxId: hex(1), transactionId: hex(2), index: 0, value: '2000000',
    ergoTree: '0008cd' + '03' + hex(3), creationHeight: 100,
    assets: [], additionalRegisters: {},
  });
  const checked = Object.freeze({ transaction: {
    outputs: [feeInputBox, { ...feeInputBox, boxId: hex(4), index: 1 }],
  } }) as unknown as Input['checked'];
  const authorization = Object.freeze({ genesisHeaderIdHex: hex(5), authorizationDigestHex: hex(6) });
  const attempt = Object.freeze({ expectedTxId: hex(2), durableAttemptDigestHex: hex(9) });
  const submission = Object.freeze({ status, submittedTxId: status === 'accepted' ? attempt.expectedTxId : null,
    responseDigestHex: hex(10) });
  const finalized = Object.freeze({ journalDigestHex: hex(11) });
  const observed = confirmation();
  const confirmed = Object.freeze({ confirmationHeight: 101, confirmationHeaderId: hex(7) });
  const observe = vi.fn(async () => { events.push('observe'); return observed as Confirmation | null; });
  const observer = Object.freeze({ observe, reconciliationIdentityDigestHex: hex(12) });
  stages.authorize.mockImplementation(async () => { events.push('authorize'); return authorization; });
  stages.observer.mockImplementation(() => { events.push('observer'); return observer; });
  stages.reserve.mockImplementation(() => { events.push('reserve'); return attempt; });
  stages.submit.mockImplementation(async () => { events.push('submit'); return submission; });
  stages.finalize.mockImplementation(() => { events.push('finalize'); return finalized; });
  stages.confirm.mockImplementation(async () => { events.push('confirm'); return confirmed; });
  return { input: { target, checked, state }, feeInputBox, authorization, attempt,
    submission, finalized, observed, confirmed, observe, events };
}

async function failureAfterFakeTime(execution: Promise<unknown>): Promise<Error> {
  const outcome = execution.then(() => null, (error: unknown) => error);
  await vi.runAllTimersAsync();
  const failure = await outcome;
  expect(failure).toBeInstanceOf(Error);
  return failure as Error;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('bounded withdrawal fee funding composition (module test doubles)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('network forbidden in direct tests'); }));
  });
  afterEach(() => {
    for (const legacy of [stages.trackerAuthorize, stages.trackerReserve, stages.trackerSubmit,
      stages.trackerFinalize, stages.trackerConfirm]) expect(legacy).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(['accepted', 'ambiguous'] as const)(
    'returns the exact fee output only after canonical confirmation of %s transport', async status => {
      const f = fixture(status);
      const result = await execute(f.input);
      expect(f.events).toEqual(['authorize', 'observer', 'reserve', 'submit', 'finalize', 'observe', 'confirm']);
      expect(stages.authorize).toHaveBeenCalledExactlyOnceWith(f.input.checked, f.input.target);
      expect(stages.observer).toHaveBeenCalledExactlyOnceWith(f.input.target, f.authorization.genesisHeaderIdHex);
      expect(stages.reserve).toHaveBeenCalledExactlyOnceWith(f.authorization, f.input.state);
      expect(stages.submit).toHaveBeenCalledExactlyOnceWith(f.input.target, f.attempt);
      expect(stages.finalize).toHaveBeenCalledExactlyOnceWith(f.attempt, f.submission);
      expect(f.observe).toHaveBeenCalledExactlyOnceWith(f.attempt.expectedTxId, primaryOrigin);
      expect(stages.confirm).toHaveBeenCalledExactlyOnceWith(f.attempt, f.observed);
      expect(stages.confirm.mock.calls[0]![1].observerArtifact).toBe(f.observed.observerArtifact);
      expect(Object.isFrozen(result)).toBe(true);
      expect(result).toEqual({
        expectedTxId: f.attempt.expectedTxId, durableAttemptDigestHex: f.attempt.durableAttemptDigestHex,
        transportStatus: status, journalDigestHex: f.finalized.journalDigestHex,
        confirmationDigestHex: f.observed.observationDigestHex,
        confirmationHeight: f.confirmed.confirmationHeight, confirmationHeaderIdHex: f.confirmed.confirmationHeaderId,
        feeInputBox: f.feeInputBox,
      });
      expect(result.feeInputBox).toBe(f.feeInputBox);
    },
  );

  it.each(['authorize', 'observer', 'reserve', 'submit', 'finalize', 'confirm'] as const)(
    'propagates %s failure without executing a later stage or retrying', async stage => {
      const f = fixture();
      const error = new Error(`synthetic ${stage} failure`);
      stages[stage].mockImplementationOnce(() => { f.events.push(stage); throw error; });
      await expect(execute(f.input)).rejects.toBe(error);
      const order = ['authorize', 'observer', 'reserve', 'submit', 'finalize', 'observe', 'confirm'];
      expect(f.events).toEqual(order.slice(0, order.indexOf(stage) + 1));
      expect(stages[stage]).toHaveBeenCalledTimes(1);
    },
  );

  it('awaits authorization before creating the observer or reserving', async () => {
    const f = fixture();
    const gate = deferred<typeof f.authorization>();
    stages.authorize.mockReturnValueOnce(gate.promise);
    const execution = execute(f.input);
    expect(stages.observer).not.toHaveBeenCalled();
    expect(stages.reserve).not.toHaveBeenCalled();
    gate.resolve(f.authorization);
    await execution;
  });

  it('awaits transport before finalization and any confirmation reads', async () => {
    const f = fixture();
    const gate = deferred<typeof f.submission>();
    stages.submit.mockReturnValueOnce(gate.promise);
    const execution = execute(f.input);
    await vi.advanceTimersByTimeAsync(0);
    expect(stages.submit).toHaveBeenCalledTimes(1);
    expect(stages.finalize).not.toHaveBeenCalled();
    expect(f.observe).not.toHaveBeenCalled();
    gate.resolve(f.submission);
    await execution;
  });

  it('does not return a fee box before the confirmer finishes fresh after-box validation', async () => {
    const f = fixture();
    const gate = deferred<typeof f.confirmed>();
    stages.confirm.mockReturnValueOnce(gate.promise);
    let settled = false;
    const execution = execute(f.input).finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(stages.confirm).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    const error = new Error('fee funding canonical confirmation changed before persistence');
    const rejection = expect(execution).rejects.toBe(error);
    gate.reject(error);
    await rejection;
    expect(stages.submit).toHaveBeenCalledTimes(1);
    expect(stages.reserve).toHaveBeenCalledTimes(1);
  });

  it('polls confirmation after ambiguous transport without resubmission', async () => {
    const f = fixture('ambiguous');
    f.observe.mockResolvedValueOnce(confirmation({ status: 'pending', confirmations: 1,
      confirmationHeight: null, confirmationHeaderIdHex: null }));
    const execution = execute(f.input);
    await vi.runAllTimersAsync();
    expect((await execution).transportStatus).toBe('ambiguous');
    expect(f.observe).toHaveBeenCalledTimes(2);
    expect(stages.submit).toHaveBeenCalledTimes(1);
    expect(stages.reserve).toHaveBeenCalledTimes(1);
    expect(stages.finalize).toHaveBeenCalledExactlyOnceWith(f.attempt, f.submission);
    expect(stages.confirm).toHaveBeenCalledExactlyOnceWith(f.attempt, f.observed);
  });

  it.each(['not_found', 'observer-error'] as const)(
    'holds ambiguous transport nonretryable when confirmation remains %s', async fault => {
      const f = fixture('ambiguous');
      if (fault === 'observer-error') f.observe.mockRejectedValue(new Error('synthetic observer unavailable'));
      else f.observe.mockResolvedValue(confirmation({ status: 'not_found', confirmations: 0,
        confirmationHeight: null, confirmationHeaderIdHex: null }));
      const failure = await failureAfterFakeTime(execute(f.input));
      expect(failure.message).toContain('withdrawal-fee-funding transaction');
      expect(stages.authorize).toHaveBeenCalledTimes(1);
      expect(stages.reserve).toHaveBeenCalledTimes(1);
      expect(stages.submit).toHaveBeenCalledTimes(1);
      expect(stages.finalize).toHaveBeenCalledExactlyOnceWith(f.attempt, f.submission);
      expect(stages.confirm).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed confirmation before the final confirmer', async () => {
    const f = fixture();
    f.observe.mockResolvedValueOnce(confirmation({ confirmations: 9 }));
    await expect(execute(f.input)).rejects.toThrow('confirmation observation changed');
    expect(stages.finalize).toHaveBeenCalledTimes(1);
    expect(stages.confirm).not.toHaveBeenCalled();
    expect(stages.submit).toHaveBeenCalledTimes(1);
  });
});
