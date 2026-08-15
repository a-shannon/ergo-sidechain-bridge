import { describe, expect, it, vi } from 'vitest';

import {
  ERGO_SIGNER_UNAVAILABLE_MESSAGE,
  ErgoSignerUnavailableError,
} from '../../relayer-core/ergo-signer-availability.js';
import { createBridgeDaemonErgoSignerBoundary } from './ergo-signer-containment.js';

describe('bridge daemon Ergo signer containment', () => {
  it('contains a startup loader failure once and never retries the loader', async () => {
    const loadSigner = vi.fn(async () => {
      throw new Error('SANITIZATION_SENTINEL');
    });
    const containUnavailable = vi.fn(() => ({
      processHoldOpen: true as const,
      valueCycleCapabilityRetained: false as const,
      fundsExecutionAuthorityReleaseAttempted: false,
    }));
    const boundary = createBridgeDaemonErgoSignerBoundary({
      loadSigner,
      containUnavailable,
    });

    await expect(boundary.loadSigner('startup')).rejects.toThrow(
      ERGO_SIGNER_UNAVAILABLE_MESSAGE,
    );
    await expect(boundary.loadSigner('retry')).rejects.toThrow(
      ErgoSignerUnavailableError,
    );

    expect(loadSigner).toHaveBeenCalledTimes(1);
    expect(containUnavailable).toHaveBeenCalledTimes(1);
    expect(boundary.snapshot().availability).toBe('unavailable');
  });

  it('latches an in-cycle null or thrown signing result without raw details', async () => {
    const containUnavailable = vi.fn(() => ({
      processHoldOpen: true as const,
      valueCycleCapabilityRetained: false as const,
      fundsExecutionAuthorityReleaseAttempted: true,
    }));
    const boundary = createBridgeDaemonErgoSignerBoundary({
      loadSigner: async () => ({ address: 'synthetic' }),
      containUnavailable,
    });
    await boundary.loadSigner('startup');

    const nullAction = vi.fn(async () => null);
    await expect(boundary.runSigner('settlement', nullAction)).rejects.toThrow(
      ERGO_SIGNER_UNAVAILABLE_MESSAGE,
    );
    expect(containUnavailable).toHaveBeenCalledTimes(1);

    const laterAction = vi.fn(async () => {
      throw new Error('SANITIZATION_SENTINEL');
    });
    await expect(boundary.runSigner('later', laterAction)).rejects.toThrow(
      ERGO_SIGNER_UNAVAILABLE_MESSAGE,
    );
    expect(laterAction).not.toHaveBeenCalled();
    expect(containUnavailable).toHaveBeenCalledTimes(1);
  });

  it('remains terminal when the containment callback itself fails', async () => {
    const boundary = createBridgeDaemonErgoSignerBoundary({
      loadSigner: async () => ({ address: 'synthetic' }),
      containUnavailable: () => {
        throw new Error('SANITIZATION_SENTINEL');
      },
    });
    await boundary.loadSigner('startup');

    await expect(boundary.runSigner('settlement', async () => {
      throw new Error('SANITIZATION_SENTINEL');
    })).rejects.toMatchObject({
      name: 'ErgoSignerUnavailableError',
      message: ERGO_SIGNER_UNAVAILABLE_MESSAGE,
    });
    expect(boundary.snapshot().availability).toBe('unavailable');
    expect(() => boundary.assertAvailable('later')).toThrow(
      ERGO_SIGNER_UNAVAILABLE_MESSAGE,
    );
  });
});
