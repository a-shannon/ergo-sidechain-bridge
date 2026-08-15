import {
  ErgoSignerAvailabilitySupervisor,
  ErgoSignerUnavailableError,
  type ErgoSignerAvailabilitySnapshot,
  type ErgoSignerContainmentPort,
} from '../../relayer-core/ergo-signer-availability.js';

export interface BridgeDaemonErgoSignerContainmentOutcome {
  readonly processHoldOpen: true;
  readonly valueCycleCapabilityRetained: false;
  readonly fundsExecutionAuthorityReleaseAttempted: boolean;
}

export interface BridgeDaemonErgoSignerBoundary<TSigner>
  extends ErgoSignerContainmentPort {
  readonly loadSigner: (boundary: string) => Promise<TSigner>;
  readonly runSigner: <TResult>(
    boundary: string,
    action: () => Promise<TResult | null | undefined>,
  ) => Promise<TResult>;
}

export function createBridgeDaemonErgoSignerBoundary<TSigner>(input: Readonly<{
  loadSigner: () => Promise<TSigner | null | undefined>;
  containUnavailable: () => BridgeDaemonErgoSignerContainmentOutcome;
}>): BridgeDaemonErgoSignerBoundary<TSigner> {
  const supervisor = new ErgoSignerAvailabilitySupervisor();

  const containUnavailable = (_boundary: string): never => {
    const firstTerminalTransition = supervisor.recordUnavailable();
    if (firstTerminalTransition) {
      try {
        const outcome = input.containUnavailable();
        if (
          outcome.processHoldOpen !== true
          || outcome.valueCycleCapabilityRetained !== false
          || typeof outcome.fundsExecutionAuthorityReleaseAttempted !== 'boolean'
        ) {
          throw new Error('invalid local Ergo signer containment outcome');
        }
      } catch {
        // The terminal signer state remains fail-closed. The composition root
        // owns any durable recovery marker and emits only a bounded condition.
      }
    }
    throw new ErgoSignerUnavailableError();
  };

  const boundary: BridgeDaemonErgoSignerBoundary<TSigner> = {
    snapshot: (): ErgoSignerAvailabilitySnapshot => supervisor.snapshot(),
    assertAvailable: (_boundary: string): void => supervisor.assertAvailable(),
    containUnavailable,
    loadSigner: async (boundaryName: string): Promise<TSigner> => {
      if (supervisor.isTerminallyUnavailable()) {
        throw new ErgoSignerUnavailableError();
      }
      let signer: TSigner | null | undefined;
      try {
        signer = await input.loadSigner();
      } catch {
        return containUnavailable(boundaryName);
      }
      if (signer === null || signer === undefined) {
        return containUnavailable(boundaryName);
      }
      supervisor.recordAvailable();
      return signer;
    },
    runSigner: async <TResult>(
      boundaryName: string,
      action: () => Promise<TResult | null | undefined>,
    ): Promise<TResult> => {
      supervisor.assertAvailable();
      let result: TResult | null | undefined;
      try {
        result = await action();
      } catch {
        return containUnavailable(boundaryName);
      }
      if (result === null || result === undefined) {
        return containUnavailable(boundaryName);
      }
      return result;
    },
  };
  return Object.freeze(boundary);
}
