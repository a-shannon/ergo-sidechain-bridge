import {
  BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1,
  normalizeOperatorAlertCacheGenerationHex,
  normalizeOperatorAlertDeliveryState,
  type OperatorAlertDeliveryState,
  type OperatorAlertDeliveryStatePort,
} from '../relayer-core/operator-alert-delivery-state.js';

export interface OperatorAlertDeliveryStateSource {
  getOperatorAlertDeliveryCacheGenerationHex(): unknown;
  getOperatorAlertDeliveryState(profileId: string): unknown | null;
  compareAndSetOperatorAlertDeliveryState(input: Readonly<{
    expectedRevision: number | null;
    next: OperatorAlertDeliveryState;
  }>): boolean;
}

export function createOperatorAlertDeliveryStateAdapter(
  source: OperatorAlertDeliveryStateSource,
): OperatorAlertDeliveryStatePort {
  return Object.freeze({
    read(profileId: string) {
      try {
        if (profileId !== BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1.profileId) {
          return Object.freeze({ status: 'unavailable' as const });
        }
        const cacheGenerationHex = normalizeOperatorAlertCacheGenerationHex(
          source.getOperatorAlertDeliveryCacheGenerationHex(),
        );
        const raw = source.getOperatorAlertDeliveryState(profileId);
        const state = raw === null
          ? null
          : normalizeOperatorAlertDeliveryState(
            raw as OperatorAlertDeliveryState,
          );
        if (state !== null && state.cacheGenerationHex !== cacheGenerationHex) {
          throw new Error('operator alert state cache generation mismatch');
        }
        return Object.freeze({
          status: 'available' as const,
          cacheGenerationHex,
          state,
        });
      } catch {
        return Object.freeze({ status: 'unavailable' as const });
      }
    },
    compareAndSet(input: Readonly<{
      expectedRevision: number | null;
      next: OperatorAlertDeliveryState;
    }>) {
      try {
        const next = normalizeOperatorAlertDeliveryState(input.next);
        const stored = source.compareAndSetOperatorAlertDeliveryState({
          expectedRevision: input.expectedRevision,
          next,
        });
        return stored ? 'stored' : 'conflict';
      } catch {
        return 'unavailable';
      }
    },
  });
}
