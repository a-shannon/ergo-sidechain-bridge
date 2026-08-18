import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertObservation: vi.fn(),
  assertTarget: vi.fn(),
  discover: vi.fn(),
}));

vi.mock('./substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1:
    mocks.assertTarget,
}));
vi.mock('./substrate-federated-isolated-devnet-reward-input-discovery-v1.js', () => ({
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance:
    mocks.assertObservation,
  discoverSubstrateFederatedRewardInputsV2: mocks.discover,
}));

import {
  assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1,
  discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1,
} from './substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js';

const hex = (byte: string): string => byte.repeat(32);
const TARGET = Object.freeze({ role: 'owned-target' });
const SIGNER = Object.freeze({ role: 'signer' });
const OBSERVATION = Object.freeze({ role: 'reward-observation' });
const BINDING = Object.freeze({
  processBindingDigestHex: hex('1'),
  executionTargetIdentityDigestHex: hex('2'),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertTarget.mockImplementation(value => {
    if (value !== TARGET) throw new Error('target provenance missing');
    return BINDING;
  });
  mocks.discover.mockImplementation(async signer => {
    if (signer !== SIGNER) throw new Error('signer changed');
    return OBSERVATION;
  });
  mocks.assertObservation.mockImplementation(value => {
    if (value !== OBSERVATION) throw new Error('observation provenance missing');
  });
});

describe('owned reward-input discovery V1', () => {
  it('binds an observation produced while the exact target stays active', async () => {
    const owned =
      await discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(
        SIGNER as never,
        TARGET as never,
      );
    expect(owned).toMatchObject({
      observation: OBSERVATION,
      processBindingDigestHex: BINDING.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        BINDING.executionTargetIdentityDigestHex,
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1(
        owned as never,
        TARGET as never,
      )
    ).not.toThrow();
    expect(mocks.assertTarget).toHaveBeenCalledTimes(3);
  });

  it('rejects a target replacement during discovery', async () => {
    mocks.assertTarget
      .mockReturnValueOnce(BINDING)
      .mockReturnValueOnce(Object.freeze({
        processBindingDigestHex: hex('3'),
        executionTargetIdentityDigestHex: hex('4'),
      }));
    await expect(
      discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(
        SIGNER as never,
        TARGET as never,
      ),
    ).rejects.toThrow(/changed during discovery/);
  });

  it('rejects copied evidence and later target replacement', async () => {
    const owned =
      await discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(
        SIGNER as never,
        TARGET as never,
      );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1(
        { ...owned } as never,
        TARGET as never,
      )
    ).toThrow(/target provenance/);
    mocks.assertTarget.mockReturnValue(Object.freeze({
      processBindingDigestHex: hex('5'),
      executionTargetIdentityDigestHex: hex('6'),
    }));
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1(
        owned as never,
        TARGET as never,
      )
    ).toThrow(/target provenance/);
  });
});
