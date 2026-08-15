import {
  createOperatorAlertDeliveryStateAdapter,
  type OperatorAlertDeliveryStateSource,
} from '../../adapters/operator-alert-delivery-state.js';
import {
  BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1,
  operatorAlertEventForState,
  runOperatorAlertDeliveryCycle,
  type OperatorAlertDeliveryCycleOutcome,
  type OperatorAlertEvent,
} from '../../relayer-core/operator-alert-delivery.js';
import {
  enqueueOperatorAlertExternalOutboxEvent,
  type OperatorAlertExternalOutboxPort,
} from '../../relayer-core/operator-alert-external-outbox.js';
import type {
  OperatorHealthProjection,
} from '../../relayer-core/operator-health-projection.js';

export function runBridgeDaemonOperatorAlerts(input: Readonly<{
  projection: OperatorHealthProjection;
  state: OperatorAlertDeliveryStateSource;
  externalOutbox?: OperatorAlertExternalOutboxPort;
  writeLocalAlert(event: OperatorAlertEvent): void;
  nowMs: number;
}>): OperatorAlertDeliveryCycleOutcome {
  const state = createOperatorAlertDeliveryStateAdapter(input.state);
  let retainedAlertReconstructionUnavailable = false;
  let retainedAlertReconstructionConflict = false;
  if (input.externalOutbox) {
    const current = state.read(BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1.profileId);
    if (current.status === 'unavailable') return 'persistence_unavailable';
    if (current.state?.deliveryStatus === 'delivered') {
      const enqueued = enqueueOperatorAlertExternalOutboxEvent({
        event: operatorAlertEventForState(
          current.state,
          BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1,
        ),
        outbox: input.externalOutbox,
      });
      retainedAlertReconstructionConflict =
        enqueued.status === 'state_conflict';
      retainedAlertReconstructionUnavailable =
        enqueued.status === 'persistence_unavailable';
    }
  }
  const outcome = runOperatorAlertDeliveryCycle({
    projection: input.projection,
    profile: BRIDGE_DAEMON_OPERATOR_ALERT_PROFILE_V1,
    state,
    delivery: {
      deliver(event) {
        let externalEnqueueUnavailable = false;
        let externalEnqueueConflict = false;
        if (input.externalOutbox) {
          const enqueued = enqueueOperatorAlertExternalOutboxEvent({
            event,
            outbox: input.externalOutbox,
          });
          externalEnqueueUnavailable =
            enqueued.status === 'persistence_unavailable';
          externalEnqueueConflict = enqueued.status === 'state_conflict';
        }
        input.writeLocalAlert(event);
        retainedAlertReconstructionUnavailable ||= externalEnqueueUnavailable;
        retainedAlertReconstructionConflict ||= externalEnqueueConflict;
        return Object.freeze({ status: 'delivered' as const });
      },
    },
    nowMs: input.nowMs,
  });
  if (
    outcome !== 'idle'
    && outcome !== 'deduplicated'
    && outcome !== 'delivered'
  ) return outcome;
  if (retainedAlertReconstructionConflict) return 'state_conflict';
  if (retainedAlertReconstructionUnavailable) {
    return 'persistence_unavailable';
  }
  return outcome;
}
