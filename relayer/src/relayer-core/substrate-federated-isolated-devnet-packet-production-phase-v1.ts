export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_PRODUCTION_PHASES_V1 =
  Object.freeze([
    'packet input and contract binding',
    'packet tracker compilation',
    'packet settlement compilation',
    'packet relayer artifact production',
    'packet launch and portable replay',
  ] as const);

export type SubstrateFederatedIsolatedDevnetPacketProductionPhaseV1 =
  typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_PRODUCTION_PHASES_V1[number];

const PACKET_PRODUCTION_FAILURES = new WeakMap<
  Error,
  SubstrateFederatedIsolatedDevnetPacketProductionPhaseV1
>();

export function createSubstrateFederatedIsolatedDevnetPacketProductionFailureV1(
  phase: SubstrateFederatedIsolatedDevnetPacketProductionPhaseV1,
  cause: unknown,
): Error {
  if (
    !SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_PRODUCTION_PHASES_V1.includes(
      phase,
    )
  ) {
    throw new Error('isolated devnet packet production phase is invalid');
  }
  const failure = cause instanceof Error
    ? cause
    : new Error('isolated devnet packet production phase failed');
  PACKET_PRODUCTION_FAILURES.set(failure, phase);
  return failure;
}

export function projectSubstrateFederatedIsolatedDevnetPacketProductionFailureV1(
  value: unknown,
): SubstrateFederatedIsolatedDevnetPacketProductionPhaseV1 | null {
  if (typeof value !== 'object' || value === null) return null;
  return PACKET_PRODUCTION_FAILURES.get(value as Error) ?? null;
}
