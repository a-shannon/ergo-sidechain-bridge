import { describe, expect, it } from 'vitest';

import {
  ERGO_SIGNER_AVAILABILITY_SCHEMA,
  ERGO_SIGNER_UNAVAILABLE_MESSAGE,
  ErgoSignerAvailabilitySupervisor,
  ErgoSignerUnavailableError,
} from './ergo-signer-availability.js';

describe('Ergo signer availability supervisor', () => {
  it('starts fail-closed and becomes available only after preparation', () => {
    const supervisor = new ErgoSignerAvailabilitySupervisor();

    expect(supervisor.snapshot()).toEqual({
      schema: ERGO_SIGNER_AVAILABILITY_SCHEMA,
      availability: 'unavailable',
    });
    expect(() => supervisor.assertAvailable()).toThrow(
      ERGO_SIGNER_UNAVAILABLE_MESSAGE,
    );

    expect(supervisor.recordAvailable()).toEqual({
      schema: ERGO_SIGNER_AVAILABILITY_SCHEMA,
      availability: 'available',
    });
    expect(() => supervisor.assertAvailable()).not.toThrow();
  });

  it('latches terminal unavailability and rejects implicit recovery', () => {
    const supervisor = new ErgoSignerAvailabilitySupervisor();
    supervisor.recordAvailable();

    expect(supervisor.recordUnavailable()).toBe(true);
    expect(supervisor.recordUnavailable()).toBe(false);
    expect(supervisor.isTerminallyUnavailable()).toBe(true);
    expect(supervisor.snapshot().availability).toBe('unavailable');
    expect(() => supervisor.recordAvailable()).toThrow(
      ErgoSignerUnavailableError,
    );
    expect(() => supervisor.assertAvailable()).toThrow(
      ERGO_SIGNER_UNAVAILABLE_MESSAGE,
    );
  });

  it('returns frozen snapshots that cannot forge availability', () => {
    const supervisor = new ErgoSignerAvailabilitySupervisor();
    const snapshot = supervisor.snapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => {
      (snapshot as { availability: string }).availability = 'available';
    }).toThrow();
    expect(supervisor.snapshot().availability).toBe('unavailable');
  });
});
