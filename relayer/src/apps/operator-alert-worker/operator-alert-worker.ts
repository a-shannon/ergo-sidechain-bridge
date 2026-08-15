import type {
  OperatorAlertAcknowledgementAuditStore,
} from '../../adapters/operator-alert-acknowledgement-state.js';
import {
  parseOperatorAlertAcknowledgement,
  type OperatorAlertAcknowledgementVerifier,
} from '../../relayer-core/operator-alert-acknowledgement.js';
import {
  runOperatorAlertExternalOutboxWorkerCycle,
  type OperatorAlertExternalOutboxPort,
  type OperatorAlertExternalOutboxWorkerOutcome,
  type OperatorAlertExternalTransport,
} from '../../relayer-core/operator-alert-external-outbox.js';

export function runOperatorAlertExternalWorker(input: Readonly<{
  outbox: OperatorAlertExternalOutboxPort;
  transport: OperatorAlertExternalTransport;
  nowMs: number;
}>): Promise<OperatorAlertExternalOutboxWorkerOutcome> {
  return runOperatorAlertExternalOutboxWorkerCycle({
    outbox: input.outbox,
    transport: input.transport,
    nowMs: input.nowMs,
  });
}

export type OperatorAlertAcknowledgementOutcome =
  | 'stored'
  | 'deduplicated'
  | 'conflict';

export function recordOperatorAlertAcknowledgement(input: Readonly<{
  acknowledgement: unknown;
  verifier: OperatorAlertAcknowledgementVerifier;
  store: OperatorAlertAcknowledgementAuditStore;
  verifiedAtMs: number;
}>): OperatorAlertAcknowledgementOutcome {
  const acknowledgement = parseOperatorAlertAcknowledgement(
    input.acknowledgement,
  );
  const outbox = input.store.get(acknowledgement.alertIdHex);
  if (
    outbox === null
    || outbox.status !== 'delivered'
    || outbox.deliveryReceiptDigestHex === null
  ) {
    return 'conflict';
  }
  const verification = input.verifier.verify({
    acknowledgement,
    expected: {
      alertIdHex: outbox.alertIdHex,
      deliveryReceiptDigestHex: outbox.deliveryReceiptDigestHex,
    },
  });
  return input.store.recordVerifiedAcknowledgement({
    verification,
    verifiedAtMs: input.verifiedAtMs,
  });
}
