import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as operational from './ergo-operational-transaction.js';
import { SUBSTRATE_FEDERATED_NATIVE_COMMITTED_RESERVE_FAILURE_STAGES_V1,
  projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1,
  projectOwnSubstrateFederatedNativeCommittedReserveKindV1,
  projectSubstrateFederatedNativeCommittedReserveFailureStageV1 }
  from '../../substrate-federated-native-committed-reserve-failure-v1.js';
import { projectNativeCommittedReserveRevalidationOriginV1 }
  from '../../substrate-federated-native-committed-reserve-revalidation-v1.js';
import { projectNativeCommittedReserveConfirmationOriginV1 }
  from '../../substrate-federated-native-committed-reserve-confirmation-v1.js';
import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2 }
  from '../../substrate-federated-native-two-cycle-root-phase-v2.js';
import { tagNativeTwoCycleCycleStepFailureV1 }
  from '../../substrate-federated-native-two-cycle-cycle-step-v1.js';

const mocked = vi.hoisted(() => ({
  assertOwnedTarget: vi.fn(),
  assertPacket: vi.fn(),
  discoverFunding: vi.fn(),
  promoteSource: vi.fn(),
  promoteVault: vi.fn(),
  createObserver: vi.fn(),
  createSourceAuthorizer: vi.fn(),
  createVaultAuthorization: vi.fn(),
  createSourceJournal: vi.fn(),
  createVaultJournal: vi.fn(),
  createSourceTransport: vi.fn(),
  createVaultTransport: vi.fn(),
  observeSourceOutputs: vi.fn(),
  assertSourceOutputs: vi.fn(),
  observeVaultOutputs: vi.fn(),
  assertVaultOutputs: vi.fn(),
}));

vi.mock('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js')>()),
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1: mocked.assertOwnedTarget,
}));

vi.mock('../../substrate-federated-isolated-devnet-peg-in-candidate-v2.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../substrate-federated-isolated-devnet-peg-in-candidate-v2.js')>()),
  assertSubstrateFederatedNativeGenesisPegInPacketV1: mocked.assertPacket,
}));

vi.mock('../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js', () => ({
  discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1: mocked.discoverFunding,
}));

vi.mock('../../substrate-federated-isolated-devnet-setup-check-execution-v2.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../substrate-federated-isolated-devnet-setup-check-execution-v2.js')>()),
  promoteSubstrateFederatedIsolatedDevnetPegInSourceLockCheckV1: mocked.promoteSource,
  promoteSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckV1: mocked.promoteVault,
}));

vi.mock('../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js')>()),
  createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1: mocked.createObserver,
}));

vi.mock('../../substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js')>()),
  createSubstrateFederatedNativeGenesisPegInSourceLockBroadcastAuthorizerV1: mocked.createSourceAuthorizer,
}));

vi.mock('../../substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js')>()),
  createSubstrateFederatedNativeGenesisPegInCommittedVaultAuthorizationSessionV1: mocked.createVaultAuthorization,
}));

vi.mock('../../substrate-federated-local-devnet-peg-in-source-lock-journal-v1.js', () => ({
  createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1: mocked.createSourceJournal,
}));

vi.mock('../../substrate-federated-local-devnet-peg-in-committed-vault-journal-v1.js', () => ({
  createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1: mocked.createVaultJournal,
}));

vi.mock('../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../substrate-federated-isolated-devnet-checked-submission-transport-v1.js')>()),
  createSubstrateFederatedIsolatedDevnetPegInSourceLockCheckedSubmissionTransportV1: mocked.createSourceTransport,
  createSubstrateFederatedIsolatedDevnetPegInCommittedVaultCheckedSubmissionTransportV1: mocked.createVaultTransport,
}));

vi.mock('../../substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js')>()),
  observeSubstrateFederatedNativeGenesisPegInSourceLockOutputsV1: mocked.observeSourceOutputs,
  assertSubstrateFederatedNativeGenesisPegInSourceLockOutputObservationV1: mocked.assertSourceOutputs,
}));

vi.mock('../../substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js')>()),
  observeSubstrateFederatedNativeGenesisPegInCommittedVaultOutputsV1: mocked.observeVaultOutputs,
  assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV1: mocked.assertVaultOutputs,
}));

import {
  executeSubstrateFederatedNativeContinuationPegInCommittedVaultV1,
  executeSubstrateFederatedNativeContinuationPegInSourceLockV1,
  executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1,
  executeSubstrateFederatedNativeGenesisPegInSourceLockV1,
} from './substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';

const hex = (value: string) => value.repeat(64).slice(0, 64);
const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const CURRENT_TARGET_BINDING = Object.freeze({
  processBindingDigestHex: hex('c'),
  executionTargetIdentityDigestHex: hex('d'),
});
const ORIGINAL_SETUP_BINDING = Object.freeze({
  processBindingDigestHex: hex('a'),
  executionTargetIdentityDigestHex: hex('b'),
});

describe('native continuation peg-in execution transport', () => {
  let sourcePrior: 'none' | 'confirmed';
  let vaultPrior: 'none' | 'confirmed';
  let sourceSubmitFailure: Error | undefined;
  let sourceOutput: Readonly<Record<string, unknown>>;
  let vaultOutput: Readonly<Record<string, unknown>>;
  let preTransport: Readonly<Record<string, unknown>>;
  let confirmation: Readonly<Record<string, unknown>>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    sourcePrior = 'none';
    vaultPrior = 'none';
    sourceSubmitFailure = undefined;
    sourceOutput = Object.freeze({ kind: 'original-source-observation' });
    vaultOutput = Object.freeze({ kind: 'original-vault-observation' });
    preTransport = Object.freeze({ kind: 'original-pre-transport-observation' });
    confirmation = Object.freeze({
      status: 'confirmed', confirmations: 10, observedAtHeight: 20,
      confirmationHeight: 10, confirmationHeaderIdHex: hex('9'),
      observationDigestHex: hex('8'), observerArtifact: {},
    });

    mocked.assertOwnedTarget.mockReturnValue(CURRENT_TARGET_BINDING);
    mocked.assertPacket.mockImplementation(packet => packet);
    mocked.discoverFunding.mockImplementation(async (_signer, _target) => ({ observation: fundingObservation() }));
    mocked.promoteSource.mockImplementation(receipt => sourceExecutionCheck(receipt));
    mocked.promoteVault.mockImplementation(receipt => vaultExecutionCheck(receipt));
    mocked.createObserver.mockReturnValue({
      schema: 'test-observer', reconciliationIdentityDigestHex: CURRENT_TARGET_BINDING.executionTargetIdentityDigestHex,
      observe: vi.fn(async () => confirmation),
    });
    mocked.createSourceAuthorizer.mockReturnValue({
      revalidationDigestHex: hex('1'),
      authorize: vi.fn(revalidated => ({ authorizationDigestHex: hex('2'), authorizationArtifact: { revalidated } })),
    });
    mocked.createVaultAuthorization.mockReturnValue({
      revalidator: { revalidate: vi.fn(async () => ({ revalidationDigestHex: hex('3') })) },
      broadcastAuthorizer: {
        authorize: vi.fn(revalidated => ({ authorizationDigestHex: hex('4'), authorizationArtifact: { revalidated } })),
      },
      takePreTransportObservation: vi.fn(() => preTransport),
    });
    mocked.createSourceJournal.mockImplementation(() => sourceJournal());
    mocked.createVaultJournal.mockImplementation(() => vaultJournal());
    mocked.createSourceTransport.mockReturnValue({
      submit: vi.fn(async attempt => {
        if (sourceSubmitFailure !== undefined) throw sourceSubmitFailure;
        return { status: 'accepted', submittedTxId: packet().transactions.sourceLockCreation.txId,
          responseDigestHex: hex('5'), attempt };
      }),
    });
    mocked.createVaultTransport.mockReturnValue({
      submit: vi.fn(async attempt => ({ status: 'accepted',
        submittedTxId: packet().transactions.reserveTransition.txId, responseDigestHex: hex('6'), attempt })),
    });
    mocked.observeSourceOutputs.mockImplementation(async () => sourceOutput);
    mocked.assertSourceOutputs.mockImplementation((value, target, batch, retainedPacket) => {
      expect(value).toBeDefined();
      mocked.assertPacket(retainedPacket, batch, target);
    });
    mocked.observeVaultOutputs.mockImplementation(async () => vaultOutput);
    mocked.assertVaultOutputs.mockImplementation((value, target, batch, retainedPacket) => {
      expect(value).toBe(vaultOutput);
      mocked.assertPacket(retainedPacket, batch, target);
    });
  });

  it('uses the continuation source-lock check and journals the exact current confirmation target', async () => {
    const fixture = executionFixture();
    const input = fixture.sourceInput;
    const resultPromise = executeSubstrateFederatedNativeContinuationPegInSourceLockV1(input as never);
    (input as { setupSession: unknown }).setupSession = Object.freeze({});
    const result = await resultPromise;

    expect(fixture.session.checkNativeContinuationPegInSourceLockRetainingSignerV1)
      .toHaveBeenCalledWith(fixture.packet, fixture.target);
    expect(fixture.session.checkNativePegInSourceLockRetainingSignerV1).not.toHaveBeenCalled();
    expect(mocked.createSourceJournal).toHaveBeenCalledWith(expect.objectContaining({
      reconciliationIdentityDigestHex: CURRENT_TARGET_BINDING.executionTargetIdentityDigestHex,
    }));
    expect(mocked.createSourceJournal.mock.calls[0]?.[0].reconciliationIdentityDigestHex)
      .not.toBe(ORIGINAL_SETUP_BINDING.executionTargetIdentityDigestHex);
    expect(result.outputObservation).toBe(sourceOutput);
    expect(mocked.createSourceJournal.mock.results[0]?.value.revalidateConfirmed)
      .toHaveBeenCalledWith(mocked.createObserver.mock.results[0]?.value,
        fixture.packet.transactions.sourceLockCreation.txId);
  });

  it('uses the continuation committed-vault check and forwards the original source observation', async () => {
    const fixture = executionFixture();
    const result = await executeSubstrateFederatedNativeContinuationPegInCommittedVaultV1(fixture.vaultInput as never);

    expect(fixture.session.checkNativeContinuationPegInCommittedVaultRetainingSignerV1)
      .toHaveBeenCalledWith(fixture.packet, fixture.target);
    expect(fixture.session.checkNativePegInCommittedVaultRetainingSignerV1).not.toHaveBeenCalled();
    expect(mocked.createVaultAuthorization).toHaveBeenCalledWith(expect.objectContaining({
      sourceLockObservation: fixture.sourceObservation,
    }));
    expect(mocked.createVaultJournal).toHaveBeenCalledWith(expect.objectContaining({
      executionTargetIdentityDigestHex: CURRENT_TARGET_BINDING.executionTargetIdentityDigestHex,
    }));
    expect(result.preTransportObservation).toBe(preTransport);
    expect(result.outputObservation).toBe(vaultOutput);
    expect(mocked.createVaultJournal.mock.results[0]?.value.revalidateConfirmed)
      .toHaveBeenCalledWith(mocked.createObserver.mock.results[0]?.value,
        fixture.packet.transactions.reserveTransition.txId);
  });

  it('retains an ambiguous source-lock attempt and never submits its prior journal again', async () => {
    const fixture = executionFixture();
    sourceSubmitFailure = new Error('response lost after submit');
    const first = await executeSubstrateFederatedNativeContinuationPegInSourceLockV1(fixture.sourceInput as never);
    expect(first.transportStatus).toBe('reconciled');
    expect(mocked.createSourceTransport.mock.results[0]?.value.submit).toHaveBeenCalledTimes(1);

    sourcePrior = 'confirmed';
    await expect(executeSubstrateFederatedNativeContinuationPegInSourceLockV1(fixture.sourceInput as never))
      .rejects.toThrow(/prior native source-lock attempt/);
    expect(mocked.createSourceTransport).toHaveBeenCalledTimes(1);
    expect(mocked.createSourceTransport.mock.results[0]?.value.submit).toHaveBeenCalledTimes(1);
  });

  it('preserves both first-genesis dispatch paths while binding their journals to the owned target', async () => {
    const fixture = executionFixture();
    const source = await executeSubstrateFederatedNativeGenesisPegInSourceLockV1(fixture.sourceInput as never);
    const vault = await executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1(fixture.vaultInput as never);

    expect(fixture.session.checkNativePegInSourceLockRetainingSignerV1).toHaveBeenCalledTimes(1);
    expect(fixture.session.checkNativePegInCommittedVaultRetainingSignerV1).toHaveBeenCalledTimes(1);
    expect(fixture.session.checkNativeContinuationPegInSourceLockRetainingSignerV1).not.toHaveBeenCalled();
    expect(fixture.session.checkNativeContinuationPegInCommittedVaultRetainingSignerV1).not.toHaveBeenCalled();
    expect(source.outputObservation).toBe(sourceOutput);
    expect(vault.outputObservation).toBe(vaultOutput);
    expect(mocked.createSourceJournal.mock.calls[0]?.[0].reconciliationIdentityDigestHex)
      .toBe(CURRENT_TARGET_BINDING.executionTargetIdentityDigestHex);
    expect(mocked.createVaultJournal.mock.calls[0]?.[0].executionTargetIdentityDigestHex)
      .toBe(CURRENT_TARGET_BINDING.executionTargetIdentityDigestHex);
  });

  it('stops after async continuation custody loss before reservation or submission', async () => {
    const fixture = executionFixture();
    let assertions = 0;
    mocked.assertPacket.mockImplementation(retained => {
      assertions += 1;
      if (assertions >= 2) throw new Error('continuation custody dropped');
      return retained;
    });

    await expect(executeSubstrateFederatedNativeContinuationPegInSourceLockV1(fixture.sourceInput as never))
      .rejects.toThrow('continuation custody dropped');
    expect(mocked.promoteSource).not.toHaveBeenCalled();
    expect(mocked.createSourceJournal).not.toHaveBeenCalled();
    expect(mocked.createSourceTransport).not.toHaveBeenCalled();
  });

  it.each((['genesis', 'continuation'] as const).flatMap(kind =>
    SUBSTRATE_FEDERATED_NATIVE_COMMITTED_RESERVE_FAILURE_STAGES_V1.map(stage => ({ kind, stage }))))(
    'preserves the actual native $kind committed-reserve thrown value at $stage', async ({ kind, stage }) => {
      const fixture = executionFixture();
      const primary = Object.freeze(new Error('private native reserve cause'));
      const fail = () => { throw primary; };
      const authorization = mocked.createVaultAuthorization.getMockImplementation()!();
      const journal = vaultJournal();
      if (stage === 'ingress') mocked.assertOwnedTarget.mockImplementationOnce(fail);
      if (stage === 'native-check') {
        const check = kind === 'genesis' ? fixture.session.checkNativePegInCommittedVaultRetainingSignerV1
          : fixture.session.checkNativeContinuationPegInCommittedVaultRetainingSignerV1;
        check.mockImplementationOnce(fail);
      }
      if (stage === 'check-promotion') mocked.promoteVault.mockImplementationOnce(fail);
      if (stage === 'authorization') mocked.createVaultAuthorization.mockImplementationOnce(fail);
      if (stage === 'journal-reconciliation') journal.reconcileActive.mockImplementationOnce(fail);
      if (stage === 'operational-execution') vi.spyOn(operational, 'runErgoOperationalTransaction').mockImplementationOnce(fail);
      if (stage === 'operational-sign' || stage === 'operational-check' || stage === 'operational-submit') {
        // Exercise the actual native callback; the generic runner is a control-flow double here.
        vi.spyOn(operational, 'runErgoOperationalTransaction').mockImplementationOnce(async (_input, ports) => {
          mocked.assertSourceOutputs.mockImplementationOnce(fail);
          const callback = stage === 'operational-sign' ? ports.sign
            : stage === 'operational-check' ? ports.check : ports.submit;
          await callback({} as never);
          throw new Error('expected native callback refusal');
        });
      }
      if (stage === 'operational-revalidate') authorization.revalidator.revalidate.mockImplementationOnce(fail);
      if (stage === 'operational-authorize') authorization.broadcastAuthorizer.authorize.mockImplementationOnce(fail);
      if (stage === 'operational-reserve') journal.journal.reserve.mockImplementationOnce(fail);
      if (stage === 'operational-finalize') journal.journal.finalize.mockImplementationOnce(fail);
      if (stage === 'transport-validation') authorization.takePreTransportObservation.mockImplementationOnce(fail);
      if (stage === 'confirmation') {
        mocked.createObserver.mockReturnValueOnce({ reconciliationIdentityDigestHex: CURRENT_TARGET_BINDING.executionTargetIdentityDigestHex,
          observe: vi.fn(async () => {
            mocked.assertSourceOutputs.mockImplementationOnce(fail);
            return confirmation;
          }) });
      }
      if (stage === 'confirmed-journal') journal.reconcileActive.mockResolvedValueOnce('none').mockImplementationOnce(fail);
      if (stage === 'output-observation') mocked.observeVaultOutputs.mockImplementationOnce(fail);
      if (stage !== 'authorization') mocked.createVaultAuthorization.mockReturnValueOnce(authorization);
      mocked.createVaultJournal.mockReturnValueOnce(journal);
      const execute = kind === 'genesis' ? executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1
        : executeSubstrateFederatedNativeContinuationPegInCommittedVaultV1;
      await expect(execute(fixture.vaultInput as never)).rejects.toBe(primary);
      expect(projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1(primary)).toBe(stage);
      expect(projectOwnSubstrateFederatedNativeCommittedReserveKindV1(primary)).toBe(kind);
      // Both actual operation kinds occur within cycle-1; kind is never inferred from cycle.
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'committed-reserve');
      expect(projectSubstrateFederatedNativeCommittedReserveFailureStageV1(primary))
        .toEqual({ committedReserveStage: stage, committedReserveKind: kind });
      expect(mocked.createVaultTransport.mock.results[0]?.value.submit.mock.calls.length ?? 0).toBeLessThanOrEqual(1);
    });

  it.each((['genesis', 'continuation'] as const).flatMap(kind =>
    [undefined, 'opaque primitive', Object.freeze({ opaque: true })].map(value => ({ kind, value }))))(
    'preserves unbranded native $kind check failures without inventing detail', async ({ kind, value }) => {
      const fixture = executionFixture();
      const check = kind === 'genesis' ? fixture.session.checkNativePegInCommittedVaultRetainingSignerV1
        : fixture.session.checkNativeContinuationPegInCommittedVaultRetainingSignerV1;
      check.mockImplementationOnce(() => { throw value; });
      const execute = kind === 'genesis' ? executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1
        : executeSubstrateFederatedNativeContinuationPegInCommittedVaultV1;
      await expect(execute(fixture.vaultInput as never)).rejects.toBe(value);
      expect(projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1(value)).toBeNull();
      expect(mocked.promoteVault).not.toHaveBeenCalled();
      expect(mocked.createVaultTransport).not.toHaveBeenCalled();
    });

  it.each(['genesis', 'continuation'] as const)(
    'refuses a prior $kind committed-reserve attempt before any transport', async kind => {
      const fixture = executionFixture(); vaultPrior = 'confirmed';
      const execute = kind === 'genesis' ? executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1
        : executeSubstrateFederatedNativeContinuationPegInCommittedVaultV1;
      const thrown = await execute(fixture.vaultInput as never).catch(error => error);
      expect(thrown.message).toMatch(/prior native committed-vault attempt/);
      expect(projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1(thrown)).toBe('journal-reconciliation');
      expect(mocked.createVaultTransport).not.toHaveBeenCalled();
      expect(mocked.observeVaultOutputs).not.toHaveBeenCalled();
    });

  it.each((['genesis', 'continuation'] as const).flatMap(kind => [0, 2].map(count => ({ kind, count }))))(
    'refuses $count confirmed $kind committed-reserve attempts without a second submission', async ({ kind, count }) => {
      const fixture = executionFixture(); const journal = vaultJournal();
      journal.revalidateConfirmed.mockResolvedValueOnce(Array.from({ length: count }, () => confirmation));
      mocked.createVaultJournal.mockReturnValueOnce(journal);
      const execute = kind === 'genesis' ? executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1
        : executeSubstrateFederatedNativeContinuationPegInCommittedVaultV1;
      const thrown = await execute(fixture.vaultInput as never).catch(error => error);
      expect(thrown.message).toMatch(/confirmed attempt count changed/);
      expect(projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1(thrown)).toBe('confirmed-journal');
      expect(mocked.createVaultTransport.mock.results[0]!.value.submit).toHaveBeenCalledOnce();
      expect(mocked.observeVaultOutputs).not.toHaveBeenCalled();
    });

  it.each((['genesis', 'continuation'] as const).flatMap(kind =>
    (['callback-observation-guard', 'revalidator-sync', 'revalidator-async'] as const)
      .map(branch => ({ kind, branch }))))(
    'binds genuine $kind revalidation $branch refusal before downstream authority', async ({ kind, branch }) => {
      const fixture = executionFixture();
      const primary = new Error('synthetic native revalidation refusal');
      const authorization = mocked.createVaultAuthorization.getMockImplementation()!();
      if (branch === 'revalidator-sync') {
        authorization.revalidator.revalidate.mockImplementationOnce(() => { throw primary; });
      } else if (branch === 'revalidator-async') {
        authorization.revalidator.revalidate.mockRejectedValueOnce(primary);
      }
      mocked.createVaultAuthorization.mockReturnValueOnce(authorization);
      vi.spyOn(operational, 'runErgoOperationalTransaction').mockImplementationOnce(async (_input, ports) => {
        if (branch === 'callback-observation-guard') {
          mocked.assertSourceOutputs.mockImplementationOnce(() => { throw primary; });
        }
        await ports.revalidate({} as never);
        throw new Error('expected native revalidation refusal');
      });
      const execute = kind === 'genesis' ? executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1
        : executeSubstrateFederatedNativeContinuationPegInCommittedVaultV1;
      await expect(execute(fixture.vaultInput as never)).rejects.toBe(primary);
      expect(projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1(primary)).toBe('operational-revalidate');
      expect(projectOwnSubstrateFederatedNativeCommittedReserveKindV1(primary)).toBe(kind);
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(primary, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(primary, 'cycle-1', 'committed-reserve');
      expect(projectNativeCommittedReserveRevalidationOriginV1(primary))
        .toBe(branch === 'callback-observation-guard' ? branch : 'revalidator-call');
      expect(authorization.revalidator.revalidate).toHaveBeenCalledTimes(branch === 'callback-observation-guard' ? 0 : 1);
      expect(authorization.broadcastAuthorizer.authorize).not.toHaveBeenCalled();
      const journal = mocked.createVaultJournal.mock.results[0]!.value;
      expect(journal.journal.reserve).not.toHaveBeenCalled();
      expect(journal.journal.finalize).not.toHaveBeenCalled();
      expect(mocked.createVaultTransport.mock.results[0]!.value.submit).not.toHaveBeenCalled();
    });

  it.each((['callback-observation-guard', 'revalidator-call'] as const).flatMap(origin =>
    [undefined, 'opaque primitive', Object.freeze({ opaque: true })].map(value => ({ origin, value }))))(
    'preserves unbranded genuine continuation $origin failures without diagnostic origin', async ({ origin, value }) => {
      const fixture = executionFixture();
      const authorization = mocked.createVaultAuthorization.getMockImplementation()!();
      if (origin === 'revalidator-call') authorization.revalidator.revalidate.mockRejectedValueOnce(value);
      mocked.createVaultAuthorization.mockReturnValueOnce(authorization);
      vi.spyOn(operational, 'runErgoOperationalTransaction').mockImplementationOnce(async (_input, ports) => {
        if (origin === 'callback-observation-guard') mocked.assertSourceOutputs.mockImplementationOnce(() => { throw value; });
        await ports.revalidate({} as never);
        throw new Error('expected unbranded revalidation refusal');
      });
      await expect(executeSubstrateFederatedNativeContinuationPegInCommittedVaultV1(fixture.vaultInput as never))
        .rejects.toBe(value);
      expect(projectNativeCommittedReserveRevalidationOriginV1(value)).toBeNull();
      expect(authorization.broadcastAuthorizer.authorize).not.toHaveBeenCalled();
      const journal = mocked.createVaultJournal.mock.results[0]!.value;
      expect(journal.journal.reserve).not.toHaveBeenCalled();
      expect(journal.journal.finalize).not.toHaveBeenCalled();
      expect(mocked.createVaultTransport.mock.results[0]!.value.submit).not.toHaveBeenCalled();
    });

  it.each((['genesis', 'continuation'] as const).flatMap(kind =>
    (['post-observation guard', 'return guard', 'pending', 'not_found',
      'observer_failure', 'late confirmation', 'invalid observation'] as const)
      .map(branch => ({ kind, branch }))))(
    'binds genuine $kind confirmation $branch without completing the journal', async ({ kind, branch }) => {
      const fixture = executionFixture();
      const primary = new Error('synthetic private confirmation guard');
      let now = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      const observe = vi.fn(async () => {
        if (branch === 'post-observation guard') {
          mocked.assertSourceOutputs.mockImplementationOnce(() => { throw primary; });
        } else if (branch === 'return guard') {
          mocked.assertSourceOutputs.mockImplementationOnce(() => {});
          mocked.assertSourceOutputs.mockImplementationOnce(() => { throw primary; });
        } else {
          now = 120_001;
          if (branch === 'observer_failure') throw new Error('synthetic private observer cause');
          if (branch === 'invalid observation') return { ...confirmation, confirmations: -1 };
          if (branch === 'pending' || branch === 'not_found') return {
            ...confirmation, status: branch, confirmations: 0,
            confirmationHeight: null, confirmationHeaderIdHex: null,
          };
        }
        return confirmation;
      });
      mocked.createObserver.mockReturnValueOnce({
        reconciliationIdentityDigestHex: CURRENT_TARGET_BINDING.executionTargetIdentityDigestHex,
        observe,
      });
      const execute = kind === 'genesis' ? executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1
        : executeSubstrateFederatedNativeContinuationPegInCommittedVaultV1;
      const thrown = await execute(fixture.vaultInput as never).catch(error => error);
      const guard = branch === 'post-observation guard' || branch === 'return guard';
      if (guard) expect(thrown).toBe(primary);
      expect(projectOwnSubstrateFederatedNativeCommittedReserveFailureStageV1(thrown)).toBe('confirmation');
      expect(projectOwnSubstrateFederatedNativeCommittedReserveKindV1(thrown)).toBe(kind);
      tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(thrown, 'cycle-1');
      tagNativeTwoCycleCycleStepFailureV1(thrown, 'cycle-1', 'committed-reserve');
      expect(projectNativeCommittedReserveConfirmationOriginV1(thrown)).toEqual({
        confirmationOrigin: guard ? 'active-guard' : 'confirmation-observation',
        confirmationCategory: guard ? null : branch === 'late confirmation'
          ? 'observation_completed_after_deadline' : branch === 'invalid observation'
          ? 'observer_failure' : branch === 'observer_failure' ? branch : `${branch}_at_deadline`,
      });
      expect(observe).toHaveBeenCalledOnce();
      const journal = mocked.createVaultJournal.mock.results[0]!.value;
      expect(journal.reconcileActive).toHaveBeenCalledOnce();
      expect(journal.revalidateConfirmed).not.toHaveBeenCalled();
      expect(mocked.observeVaultOutputs).not.toHaveBeenCalled();
      expect(mocked.createVaultTransport.mock.results[0]!.value.submit).toHaveBeenCalledOnce();
    });

  function sourceJournal() {
    let reconciliations = 0;
    return {
      journal: {
        reserve: vi.fn(authorization => ({ durableAttemptDigestHex: hex('7'), durableArtifact: { authorization } })),
        finalize: vi.fn(({ submission }) => ({ status: submission.status, journalDigestHex: hex('8') })),
      },
      reconcileActive: vi.fn(async () => ++reconciliations === 1 ? sourcePrior : 'confirmed'),
      revalidateConfirmed: vi.fn(async () => 1),
    };
  }

  function vaultJournal() {
    let reconciliations = 0;
    return {
      journal: {
        reserve: vi.fn(authorization => ({ durableAttemptDigestHex: hex('9'), durableArtifact: { authorization } })),
        finalize: vi.fn(({ submission }) => ({ status: submission.status, journalDigestHex: hex('a') })),
      },
      reconcileActive: vi.fn(async () => ++reconciliations === 1 ? vaultPrior : 'confirmed'),
      revalidateConfirmed: vi.fn(async () => [confirmation]),
    };
  }
});

function executionFixture() {
  const currentPacket = packet();
  const target = Object.freeze({
    primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS,
    primaryMining: true, witnessReadOnly: true,
  });
  const batch = Object.freeze({
    targetBinding: ORIGINAL_SETUP_BINDING,
    request: { target: { genesisHeaderIdHex: hex('e') } },
    orderedTransactions: ['1', '2', '3'].map(value => ({ issuance: {
      genesisInputBoxIdHex: hex(value), predictedStateOutput: { boxIdHex: hex(`${value}f`) },
      unsignedTransactionIdHex: hex(`${value}e`),
    } })),
  });
  const signer = Object.freeze({ publicKeyHex: `02${'1'.repeat(64)}`, p2pkErgoTreeHex: `0008cd02${'1'.repeat(64)}` });
  const genesisSource = vi.fn(async () => sourceReceipt(currentPacket));
  const continuationSource = vi.fn(async () => sourceReceipt(currentPacket));
  const genesisVault = vi.fn(async () => vaultReceipt(currentPacket));
  const continuationVault = vi.fn(async () => vaultReceipt(currentPacket));
  const session = {
    signer,
    checkNativePegInSourceLockRetainingSignerV1: genesisSource,
    checkNativeContinuationPegInSourceLockRetainingSignerV1: continuationSource,
    checkNativePegInCommittedVaultRetainingSignerV1: genesisVault,
    checkNativeContinuationPegInCommittedVaultRetainingSignerV1: continuationVault,
  };
  const sourceObservation = Object.freeze({ kind: 'retained-source-observation' });
  return {
    target, batch, packet: currentPacket, session, sourceObservation,
    sourceInput: { target, batch, packet: currentPacket, setupSession: session, state: {} },
    vaultInput: { target, batch, packet: currentPacket, sourceLockObservation: sourceObservation,
      setupSession: session, state: {} },
  };
}

function packet() {
  const box = (id: string, transactionId = hex('f')) => ({
    boxId: id, transactionId, value: '1000000', ergoTree: '00', assets: [],
    additionalRegisters: {}, creationHeight: 100, index: 0,
  });
  const sourceFundingInput = box(hex('4'), hex('5'));
  const reservePredecessor = box(hex('6'), hex('7'));
  const sourceLock = box(hex('8'), hex('9'));
  const transitionFeeFunding = box(hex('a'), hex('9'));
  const reserveSuccessor = box(hex('b'), hex('c'));
  const sourceLockTx = Object.freeze({
    txId: hex('9'), eip12Tx: { inputs: [{ ...sourceFundingInput, extension: {} }], dataInputs: [],
      outputs: [{ creationHeight: 101 }] },
  });
  const vaultTx = Object.freeze({
    txId: hex('c'), eip12Tx: { inputs: [reservePredecessor, sourceLock, transitionFeeFunding],
      dataInputs: [], outputs: [{ creationHeight: 102 }] },
  });
  return Object.freeze({ boxes: { sourceFundingInput, reservePredecessor, sourceLock,
    transitionFeeFunding, reserveSuccessor }, transactions: {
    sourceLockCreation: sourceLockTx, reserveTransition: vaultTx,
  } });
}

function fundingObservation() {
  const current = packet();
  const other = (id: string) => ({ boxId: id, transactionId: hex(`${id[0]}d`) });
  return {
    sources: { primaryNodeOrigin: PRIMARY, witnessNodeOrigin: WITNESS },
    target: { genesisHeaderIdHex: hex('e'), tipHeight: 150 },
    signer: { publicKeyHex: `02${'1'.repeat(64)}`, p2pkErgoTreeHex: `0008cd02${'1'.repeat(64)}` },
    genesisBoxIds: { tracker: current.boxes.sourceFundingInput.boxId,
      duplicatePrevention: hex('d'), pooledReserve: hex('f') },
    genesisInputs: { tracker: current.boxes.sourceFundingInput,
      duplicatePrevention: other(hex('d')), pooledReserve: other(hex('f')) },
  };
}

function sourceReceipt(current: ReturnType<typeof packet>) {
  return Object.freeze({
    unsignedTransactionIdHex: current.transactions.sourceLockCreation.txId,
    signedTransactionCanonicalJsonSha256Hex: hex('1'), checkResponseSha256Hex: hex('2'),
    signer: { stateContextTipHeight: 140 },
  });
}

function vaultReceipt(current: ReturnType<typeof packet>) {
  return Object.freeze({
    unsignedTransactionIdHex: current.transactions.reserveTransition.txId,
    signedTransactionCanonicalJsonSha256Hex: hex('3'), checkResponseSha256Hex: hex('4'),
    signer: { stateContextTipHeight: 145 },
  });
}

function sourceExecutionCheck(receipt: ReturnType<typeof sourceReceipt>) {
  return Object.freeze({ receipt, signedCandidate: {}, checkedAcceptance: {
    submissionHandle: { checkResponseDigestHex: receipt.checkResponseSha256Hex },
  } });
}

function vaultExecutionCheck(receipt: ReturnType<typeof vaultReceipt>) {
  return Object.freeze({ receipt, signedCandidate: {}, checkedAcceptance: {
    submissionHandle: { checkResponseDigestHex: receipt.checkResponseSha256Hex },
  } });
}
