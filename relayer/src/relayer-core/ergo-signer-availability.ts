export const ERGO_SIGNER_AVAILABILITY_SCHEMA =
  'e2s.ergo-signer-availability.v1' as const;
export const ERGO_SIGNER_UNAVAILABLE_MESSAGE =
  'local Ergo signer is unavailable; funds release remains held' as const;

export type ErgoSignerAvailability = 'available' | 'unavailable';

export interface ErgoSignerAvailabilitySnapshot {
  readonly schema: typeof ERGO_SIGNER_AVAILABILITY_SCHEMA;
  readonly availability: ErgoSignerAvailability;
}

export interface ErgoSignerContainmentPort {
  readonly assertAvailable: (boundary: string) => void;
  readonly containUnavailable: (boundary: string) => never;
  readonly snapshot: () => ErgoSignerAvailabilitySnapshot;
}

export class ErgoSignerUnavailableError extends Error {
  constructor() {
    super(ERGO_SIGNER_UNAVAILABLE_MESSAGE);
    this.name = 'ErgoSignerUnavailableError';
  }
}

export class ErgoSignerAvailabilitySupervisor {
  private availability: ErgoSignerAvailability = 'unavailable';
  private terminalUnavailable = false;

  snapshot(): ErgoSignerAvailabilitySnapshot {
    return Object.freeze({
      schema: ERGO_SIGNER_AVAILABILITY_SCHEMA,
      availability: this.availability,
    });
  }

  recordAvailable(): ErgoSignerAvailabilitySnapshot {
    if (this.terminalUnavailable) {
      throw new ErgoSignerUnavailableError();
    }
    this.availability = 'available';
    return this.snapshot();
  }

  recordUnavailable(): boolean {
    const firstTerminalTransition = !this.terminalUnavailable;
    this.terminalUnavailable = true;
    this.availability = 'unavailable';
    return firstTerminalTransition;
  }

  assertAvailable(): void {
    if (
      this.terminalUnavailable
      || this.availability !== 'available'
    ) {
      throw new ErgoSignerUnavailableError();
    }
  }

  isTerminallyUnavailable(): boolean {
    return this.terminalUnavailable;
  }
}
