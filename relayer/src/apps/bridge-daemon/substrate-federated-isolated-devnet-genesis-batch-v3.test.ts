import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  SubstrateFederatedLocalDevnetGenesisConfirmation as Confirmation,
  SubstrateFederatedLocalDevnetGenesisExecutionPorts as Ports,
} from '../../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';

const factories = vi.hoisted(() => ({
  guard: vi.fn(),
  revalidatorV1: vi.fn(), revalidatorV2: vi.fn(),
  authorizerV1: vi.fn(), authorizerV2: vi.fn(),
  transportV1: vi.fn(), transportV2: vi.fn(),
  observerV1: vi.fn(), journalV1: vi.fn(),
  confirmedV1: vi.fn(), confirmedV2: vi.fn(),
  setupSession: vi.fn(),
}));

vi.mock('../../substrate-federated-isolated-devnet-setup-check-execution-v2.js', async importOriginal => ({
  ...(await importOriginal()),
  assertSubstrateFederatedIsolatedDevnetSetupExecutionBatchV3: factories.guard,
}));
vi.mock('../../substrate-federated-isolated-devnet-genesis-revalidator-v1.js', async importOriginal => ({
  ...(await importOriginal()),
  createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV1: factories.revalidatorV1,
  createSubstrateFederatedIsolatedDevnetGenesisRevalidatorV2: factories.revalidatorV2,
}));
vi.mock('../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js', async importOriginal => ({
  ...(await importOriginal()),
  createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV1: factories.authorizerV1,
  createSubstrateFederatedIsolatedDevnetGenesisBroadcastAuthorizerV2: factories.authorizerV2,
  assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV1: factories.confirmedV1,
  assertSubstrateFederatedIsolatedDevnetGenesisSetupConfirmedV2: factories.confirmedV2,
}));
vi.mock('../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', async importOriginal => ({
  ...(await importOriginal()),
  createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV1: factories.transportV1,
  createSubstrateFederatedIsolatedDevnetCheckedSubmissionTransportV2: factories.transportV2,
}));
vi.mock('../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js', async importOriginal => ({
  ...(await importOriginal()),
  createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1: factories.observerV1,
}));
vi.mock('../../substrate-federated-local-devnet-genesis-journal-v1.js', async importOriginal => ({
  ...(await importOriginal()),
  createSubstrateFederatedLocalDevnetGenesisJournalV1: factories.journalV1,
}));
vi.mock('../../substrate-federated-isolated-devnet-setup-check-runner-v2.js', async importOriginal => ({
  ...(await importOriginal()),
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2: factories.setupSession,
}));

import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V2_SCHEMA,
} from '../../substrate-federated-isolated-devnet-genesis-broadcast-authorizer-v1.js';
import {
  executeSubstrateFederatedIsolatedDevnetGenesisBatchV3 as execute,
} from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';

type Input = Parameters<typeof execute>[0];
const roles = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;
const issuanceRoles = ['tracker', 'duplicate-prevention', 'pooled-reserve'] as const;
const hex = (n: number) => n.toString(16).padStart(64, '0');
const identity = hex(90);
const provenance = 'V166 isolated orchestration test double; not genuine V3 provenance';

function confirmation(overrides: Partial<Confirmation> = {}): Confirmation {
  return {
    status: 'confirmed', confirmations: 10, observedAtHeight: 111,
    confirmationHeight: 101, confirmationHeaderIdHex: hex(81),
    observationDigestHex: hex(82), observerArtifact: { provenance },
    ...overrides,
  };
}

// Only the app composition and generic lifecycle are real here. The identity
// guard and fixed factories below are module doubles, not capability producers.
function fixture() {
  const events: string[] = [];
  const target = Object.freeze({ provenance }) as unknown as Input['target'];
  const state = Object.freeze({ provenance }) as unknown as Input['state'];
  const transactions = issuanceRoles.map((role, ordinal) => ({
    issuance: {
      role, ordinal, unsignedTransactionIdHex: hex(ordinal + 1),
      genesisInputBoxIdHex: hex(ordinal + 11),
      predictedStateOutput: { creationHeight: 101 },
      unsignedTransactionBody: { inputs: [{ boxId: hex(ordinal + 11) }] },
    },
    signedCandidate: Object.freeze({ provenance, signedTransactionDigestHex: hex(ordinal + 21) }),
    checkedAcceptance: {
      submissionHandle: Object.freeze({ provenance, checkResponseDigestHex: hex(ordinal + 31) }),
    },
  }));
  const batch = {
    request: {
      version: 3,
      requestDigestHex: hex(70),
      target: { genesisHeaderIdHex: hex(71), preSetupAnchor: { height: 100 } },
    },
    orderedTransactions: transactions,
  } as unknown as Input['batch'];
  const input: Input = { target, batch, state, markerDirectory: 'unused-test-double-markers' };
  factories.guard.mockImplementation((candidate, executionTarget) => {
    events.push('guard');
    if (candidate !== batch || executionTarget !== target) {
      throw new Error('test-double V3 batch/target provenance rejected');
    }
    return { executionTargetIdentityDigestHex: identity };
  });
  const revalidate = vi.fn<Ports['revalidator']['revalidate']>(async (checked, phase) => {
    const admission = checked.signed.admission;
    events.push(`${admission.role}:${phase}`);
    return {
      sourceBoxId: admission.sourceBoxId, sourceBoxUnspent: true,
      targetGenesisHeaderIdHex: admission.targetGenesisHeaderIdHex,
      observedAtHeight: 100, observedTipHeaderIdHex: hex(72),
      sourceBoxDigestHex: hex(73), sourceBoxSigmaSerializedSha256Hex: hex(74),
      observationDigestHex: hex(75), revalidationArtifact: { provenance },
    };
  });
  const authorize = vi.fn<Ports['broadcastAuthorizer']['authorize']>(revalidated => {
    events.push(`${revalidated.checked.signed.admission.role}:authorize`);
    return { authorizationDigestHex: hex(76), authorizationArtifact: { provenance } };
  });
  const acknowledgeCanonicalConfirmation = vi.fn((role: string, _value: Confirmation) => {
    events.push(`${role}:acknowledge`);
  });
  const observe = vi.fn<Ports['confirmationObserver']['observe']>(async id => {
    events.push(`observe:${id}`);
    return confirmation();
  });
  const reserve = vi.fn<Ports['journal']['reserve']>(candidate => {
    events.push(`${candidate.authorization.revalidated.checked.signed.admission.role}:reserve`);
    return {
      durableAttemptDigestHex: hex(77), reconciliationIdentityDigestHex: identity,
      durableArtifact: { provenance },
    };
  });
  const submit = vi.fn<Ports['transport']['submit']>(async attempt => {
    const admission = attempt.candidate.authorization.revalidated.checked.signed.admission;
    events.push(`${admission.role}:submit`);
    return { status: 'accepted', submittedTxId: admission.expectedTxId, responseDigestHex: hex(78) };
  });
  const finalize = vi.fn<Ports['journal']['finalize']>(({ submission }) => {
    events.push('finalize');
    return { status: submission.status, journalDigestHex: hex(79) };
  });
  const confirm = vi.fn<Ports['journal']['confirm']>(() => { events.push('confirm'); });
  const reconcileActive = vi.fn(async (_observer: object) => {
    events.push('reconcile');
    return 'none';
  });
  const revalidateConfirmed = vi.fn(async (_observer: object) => {
    events.push('revalidate-confirmed');
    return 3;
  });
  const observer = { observe, reconciliationIdentityDigestHex: identity };
  const revalidator = { revalidate };
  const authorizer = {
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_BROADCAST_AUTHORIZER_V2_SCHEMA,
    authorize, acknowledgeCanonicalConfirmation,
  };
  const transport = { submit };
  const journal = { journal: { reserve, finalize, confirm }, reconcileActive, revalidateConfirmed };
  factories.observerV1.mockReturnValue(observer);
  factories.revalidatorV2.mockReturnValue(revalidator);
  factories.authorizerV2.mockReturnValue(authorizer);
  factories.transportV2.mockReturnValue(transport);
  factories.journalV1.mockReturnValue(journal);
  return {
    input, transactions, events, observer, revalidator, authorizer, transport, journal,
    revalidate, authorize, acknowledgeCanonicalConfirmation, observe,
    reserve, submit, finalize, confirm, reconcileActive, revalidateConfirmed,
  };
}

function expectNoFactories() {
  for (const factory of [factories.observerV1, factories.revalidatorV2,
    factories.authorizerV2, factories.transportV2, factories.journalV1]) {
    expect(factory).not.toHaveBeenCalled();
  }
}

async function failureAfterFakeTime(execution: Promise<unknown>): Promise<Error> {
  const outcome = execution.then(() => null, (error: unknown) => error);
  await vi.runAllTimersAsync();
  const failure = await outcome;
  expect(failure).toBeInstanceOf(Error);
  return failure as Error;
}

describe('V166 bounded V3 genesis composition (module test-double provenance)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('network forbidden in direct tests'); }));
  });
  afterEach(() => {
    expect(factories.revalidatorV1).not.toHaveBeenCalled();
    expect(factories.authorizerV1).not.toHaveBeenCalled();
    expect(factories.transportV1).not.toHaveBeenCalled();
    expect(factories.confirmedV1).not.toHaveBeenCalled();
    expect(factories.setupSession).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('wires only fixed V2 security factories and the existing V1 observer/journal', async () => {
    const f = fixture();
    await execute(f.input);
    expect(factories.guard).toHaveBeenCalledExactlyOnceWith(f.input.batch, f.input.target);
    expect(factories.observerV1).toHaveBeenCalledExactlyOnceWith(f.input.target, hex(71));
    expect(factories.revalidatorV2).toHaveBeenCalledExactlyOnceWith(f.input.target, f.input.batch);
    expect(factories.authorizerV2).toHaveBeenCalledExactlyOnceWith(
      f.input.target, f.input.batch, f.revalidator, f.observer,
    );
    expect(factories.transportV2).toHaveBeenCalledExactlyOnceWith(f.input.target, f.authorizer);
    expect(factories.journalV1).toHaveBeenCalledExactlyOnceWith({
      state: f.input.state, markerDirectory: f.input.markerDirectory,
      reconciliationIdentityDigestHex: identity,
    });
    expect(factories.confirmedV2).toHaveBeenCalledExactlyOnceWith(f.authorizer, f.input.target);
  });

  it('retains each exact signed candidate and checked handle through one ordered attempt', async () => {
    const f = fixture();
    const result = await execute(f.input);
    expect(result.map(entry => entry.role)).toEqual(roles);
    expect(f.submit).toHaveBeenCalledTimes(3);
    expect(f.revalidate).toHaveBeenCalledTimes(6);
    expect(f.authorize).toHaveBeenCalledTimes(3);
    expect(f.reserve).toHaveBeenCalledTimes(3);
    expect(f.finalize).toHaveBeenCalledTimes(3);
    expect(f.confirm).toHaveBeenCalledTimes(3);
    for (const [ordinal, transaction] of f.transactions.entries()) {
      const checked = f.revalidate.mock.calls[ordinal * 2]![0];
      expect(f.revalidate.mock.calls[ordinal * 2]![1]).toBe('post-check');
      expect(f.revalidate.mock.calls[ordinal * 2 + 1]).toEqual([checked, 'pre-transport']);
      expect(f.revalidate.mock.calls[ordinal * 2 + 1]![0]).toBe(checked);
      expect(checked.signed.signerArtifact).toBe(transaction.signedCandidate);
      expect(checked.signed.signedTransactionDigestHex).toBe(transaction.signedCandidate.signedTransactionDigestHex);
      expect(checked.checkerArtifact).toBe(transaction.checkedAcceptance.submissionHandle);
      expect(checked.checkResponseDigestHex).toBe(transaction.checkedAcceptance.submissionHandle.checkResponseDigestHex);
      expect(checked.signed.admission.unsignedTransaction).toBe(transaction.issuance.unsignedTransactionBody);
      expect(checked.signed.admission.attemptedAtHeight).toBe(100);
      expect(transaction.issuance.predictedStateOutput.creationHeight).toBe(101);
      const attempt = f.submit.mock.calls[ordinal]![0];
      expect(attempt.candidate.authorization.revalidated.checked).toBe(checked);
      expect(attempt.candidate).toBe(f.reserve.mock.calls[ordinal]![0]);
      expect(f.finalize.mock.calls[ordinal]![0].attempt).toBe(attempt);
      expect(f.confirm.mock.calls[ordinal]![0].attempt).toBe(attempt);
    }
    expect(f.events).toEqual([
      'guard',
      ...roles.flatMap((role, ordinal) => [
        `${role}:post-check`, `${role}:pre-transport`, `${role}:authorize`,
        `${role}:reserve`, `${role}:submit`, 'finalize', `observe:${hex(ordinal + 1)}`,
        'confirm', `observe:${hex(ordinal + 1)}`, 'reconcile', `${role}:acknowledge`,
      ]),
      'revalidate-confirmed', ...roles.map((_, ordinal) => `observe:${hex(ordinal + 1)}`),
    ]);
  });

  it('does not begin the next role while canonical confirmation is unresolved', async () => {
    const f = fixture();
    let release!: (value: Confirmation) => void;
    f.observe.mockResolvedValueOnce(confirmation()).mockImplementationOnce(
      () => new Promise(resolve => { release = resolve; }),
    );
    const execution = execute(f.input);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.submit).toHaveBeenCalledTimes(1);
    expect(f.revalidate).toHaveBeenCalledTimes(2);
    expect(f.reconcileActive).not.toHaveBeenCalled();
    expect(f.acknowledgeCanonicalConfirmation).not.toHaveBeenCalled();
    release(confirmation());
    await expect(execution).resolves.toHaveLength(3);
  });

  it.each(['ambiguous', 'throw'] as const)('reconciles %s transport once without retry', async mode => {
    const f = fixture();
    if (mode === 'throw') f.submit.mockRejectedValueOnce(new Error('test-double uncertain response'));
    else f.submit.mockResolvedValueOnce({ status: 'ambiguous', submittedTxId: null, responseDigestHex: null });
    const result = await execute(f.input);
    expect(result[0]!.transportStatus).toBe('reconciled');
    expect(f.submit).toHaveBeenCalledTimes(3);
    expect(f.reserve).toHaveBeenCalledTimes(3);
    expect(f.finalize.mock.calls[0]![0].submission.status).toBe('ambiguous');
    expect(f.reconcileActive).toHaveBeenCalledTimes(3);
  });

  it('reconciles an initially unavailable ambiguous attempt before acknowledging its role', async () => {
    const f = fixture();
    f.submit.mockResolvedValueOnce({ status: 'ambiguous', submittedTxId: null, responseDigestHex: null });
    f.observe.mockResolvedValueOnce(null);
    f.reconcileActive.mockResolvedValueOnce('confirmed');
    const result = await execute(f.input);
    expect(result[0]!.transportStatus).toBe('ambiguous');
    expect(f.confirm).toHaveBeenCalledTimes(2);
    expect(f.reconcileActive).toHaveBeenNthCalledWith(1, f.observer);
    expect(f.acknowledgeCanonicalConfirmation).toHaveBeenCalledTimes(3);
    expect(f.submit).toHaveBeenCalledTimes(3);
  });

  it.each(['copied batch', 'wrong batch', 'copied target', 'wrong target'] as const)(
    'delegates %s rejection to the provenance guard before creating any port', async kind => {
      const f = fixture();
      const input = { ...f.input };
      if (kind === 'copied batch') input.batch = { ...f.input.batch };
      if (kind === 'wrong batch') input.batch = {} as Input['batch'];
      if (kind === 'copied target') input.target = { ...f.input.target };
      if (kind === 'wrong target') input.target = {} as Input['target'];
      await expect(execute(input)).rejects.toThrow('test-double V3 batch/target provenance rejected');
      expect(factories.guard).toHaveBeenCalledExactlyOnceWith(input.batch, input.target);
      expectNoFactories();
      expect(f.submit).not.toHaveBeenCalled();
    },
  );

  it.each(roles.flatMap((role, ordinal) => [100, 102].map(height => ({ role, ordinal, height }))))(
    'rejects $role creation height $height instead of the exact next-block height', async ({ ordinal, height }) => {
      const f = fixture();
      f.transactions[ordinal]!.issuance.predictedStateOutput.creationHeight = height;
      await expect(execute(f.input)).rejects.toThrow('batch order or anchor changed');
      expectNoFactories();
      expect(f.submit).not.toHaveBeenCalled();
    },
  );

  it.each(['role', 'ordinal', 'anchor', 'count'] as const)(
    'rejects a noncanonical %s before creating factories', async field => {
      const f = fixture();
      if (field === 'role') f.transactions[0]!.issuance.role = 'pooled-reserve';
      if (field === 'ordinal') f.transactions[0]!.issuance.ordinal = 1;
      if (field === 'anchor') f.transactions[0]!.issuance.predictedStateOutput.creationHeight = 99;
      if (field === 'count') f.transactions.pop();
      await expect(execute(f.input)).rejects.toThrow('batch order or anchor changed');
      expect(factories.guard).toHaveBeenCalledOnce();
      expectNoFactories();
    },
  );

  it.each(['post-check', 'pre-transport'] as const)('stops on %s failure before authorization or transport', async phase => {
    const f = fixture();
    const normal = f.revalidate.getMockImplementation()!;
    f.revalidate.mockImplementation((candidate, current) => {
      if (current === phase) throw new Error(`test-double ${phase} failed`);
      return normal(candidate, current);
    });
    await expect(execute(f.input)).rejects.toThrow(`test-double ${phase} failed`);
    expect(f.revalidate).toHaveBeenCalledTimes(phase === 'post-check' ? 1 : 2);
    expect(f.authorize).not.toHaveBeenCalled();
    expect(f.reserve).not.toHaveBeenCalled();
    expect(f.submit).not.toHaveBeenCalled();
    expect(f.observe).not.toHaveBeenCalled();
  });

  it.each(['reserve', 'finalize', 'confirm'] as const)('stops on %s persistence failure', async method => {
    const f = fixture();
    f[method].mockImplementationOnce(() => { throw new Error(`test-double ${method} failed`); });
    await expect(execute(f.input)).rejects.toThrow(`test-double ${method} failed`);
    expect(f.submit).toHaveBeenCalledTimes(method === 'reserve' ? 0 : 1);
    expect(f.revalidate).toHaveBeenCalledTimes(2);
    expect(f.acknowledgeCanonicalConfirmation).not.toHaveBeenCalled();
    expect(f.revalidateConfirmed).not.toHaveBeenCalled();
  });

  it.each(['missing', 'stale', 'late'] as const)('stops on %s canonical confirmation using local fake time', async kind => {
    const f = fixture();
    f.observe.mockResolvedValueOnce(null);
    if (kind === 'missing') f.observe.mockResolvedValue(confirmation({
      status: 'not_found', confirmations: 0, observedAtHeight: 100,
      confirmationHeight: null, confirmationHeaderIdHex: null,
    }));
    if (kind === 'stale') {
      f.observe.mockResolvedValue(confirmation({ confirmations: 9 }));
    }
    if (kind === 'late') {
      f.observe.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 90 * 60_000));
        return confirmation();
      });
    }
    const failure = await failureAfterFakeTime(execute(f.input));
    expect(failure.message).toContain(
      kind === 'stale' ? 'confirmation observation changed' : 'confirmation exceeded its deadline',
    );
    expect(f.submit).toHaveBeenCalledTimes(1);
    expect(f.revalidate).toHaveBeenCalledTimes(2);
    expect(f.acknowledgeCanonicalConfirmation).not.toHaveBeenCalled();
    expect(f.reconcileActive).not.toHaveBeenCalled();
  });

  it.each(['confirmed', 'pending'] as const)('stops when durable reconciliation disagrees with %s execution', async status => {
    const f = fixture();
    if (status === 'pending') f.observe.mockResolvedValueOnce(null);
    f.reconcileActive.mockResolvedValue(status === 'confirmed' ? 'confirmed' : 'none');
    await expect(execute(f.input)).rejects.toThrow('durable reconciliation changed');
    expect(f.reconcileActive).toHaveBeenCalledExactlyOnceWith(f.observer);
    expect(f.submit).toHaveBeenCalledTimes(1);
    expect(f.acknowledgeCanonicalConfirmation).not.toHaveBeenCalled();
  });

  it('propagates reconciliation failure without beginning a second role', async () => {
    const f = fixture();
    f.reconcileActive.mockRejectedValueOnce(new Error('test-double reconciliation failed'));
    await expect(execute(f.input)).rejects.toThrow('test-double reconciliation failed');
    expect(f.submit).toHaveBeenCalledTimes(1);
    expect(f.acknowledgeCanonicalConfirmation).not.toHaveBeenCalled();
  });

  it.each([0, 2, 4])('rejects confirmed journal count %i before refreshing summaries', async count => {
    const f = fixture();
    f.revalidateConfirmed.mockResolvedValue(count);
    await expect(execute(f.input)).rejects.toThrow('confirmed attempt count changed');
    expect(f.revalidateConfirmed).toHaveBeenCalledExactlyOnceWith(f.observer);
    expect(f.submit).toHaveBeenCalledTimes(3);
    expect(f.observe).toHaveBeenCalledTimes(6);
  });

  it('propagates the V2 final confirmation guard before journal refresh', async () => {
    const f = fixture();
    factories.confirmedV2.mockImplementationOnce(() => { throw new Error('test-double final confirmation failed'); });
    await expect(execute(f.input)).rejects.toThrow('test-double final confirmation failed');
    expect(f.submit).toHaveBeenCalledTimes(3);
    expect(f.revalidateConfirmed).not.toHaveBeenCalled();
    expect(f.observe).toHaveBeenCalledTimes(6);
  });

  it('blocks final return when a reorg removes a confirmation during final refresh', async () => {
    const f = fixture();
    f.observe.mockImplementation(async () => f.observe.mock.calls.length <= 6
      ? confirmation()
      : confirmation({ status: 'not_found', confirmations: 0,
        confirmationHeight: null, confirmationHeaderIdHex: null }));
    const failure = await failureAfterFakeTime(execute(f.input));
    expect(failure.message).toContain('setup-refresh:tracker transaction confirmation exceeded its deadline');
    expect(f.revalidateConfirmed).toHaveBeenCalledExactlyOnceWith(f.observer);
    expect(f.acknowledgeCanonicalConfirmation).toHaveBeenCalledTimes(3);
    expect(f.submit).toHaveBeenCalledTimes(3);
    expect(f.observe.mock.calls.slice(6).every(([id]) => id === hex(1))).toBe(true);
  });

  it('returns only frozen refreshed confirmation summaries, never retained capabilities', async () => {
    const f = fixture();
    f.observe.mockImplementation(async () => confirmation({
      observationDigestHex: hex(100 + f.observe.mock.calls.length),
    }));
    const result = await execute(f.input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result).toEqual(roles.map((role, ordinal) => ({
      ordinal, role, expectedTxId: hex(ordinal + 1), transportStatus: 'accepted',
      durableAttemptDigestHex: hex(77), journalDigestHex: hex(79),
      confirmationDigestHex: hex(107 + ordinal), confirmationHeight: 101,
      confirmationHeaderIdHex: hex(81),
    })));
    for (const summary of result) {
      expect(Object.isFrozen(summary)).toBe(true);
      expect(Reflect.ownKeys(summary)).toHaveLength(9);
      expect(Object.values(summary).every(value => ['number', 'string'].includes(typeof value))).toBe(true);
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(result)).not.toContain(provenance);
  });
});
