import { describe, expect, it, vi } from 'vitest';

import {
  createHttpsOperatorAlertExternalDelivery,
  digestOperatorAlertExternalEndpoint,
} from './adapters/operator-alert-external-delivery.js';
import {
  digestOperatorAlertEvent,
  resolveOperatorRecoveryAction,
  type OperatorAlertEvent,
} from './relayer-core/operator-alert-delivery.js';

const ALERT_ID = '11'.repeat(32);
const ENDPOINT = 'https://alerts.example.test/bridge';
const ENDPOINT_DIGEST = digestOperatorAlertExternalEndpoint(ENDPOINT);
const event = Object.freeze({
  schema: 'e2s.operator-alert-event.v1',
  profileId: 'bridge-daemon-health-v1',
  profileVersion: 1,
  alertIdHex: ALERT_ID,
  openedAtMs: 1,
  transition: 'raised',
  conditionDigestHex: '33'.repeat(32),
  previousAlertIdHex: null,
  overall: 'held',
  reasons: Object.freeze(['signer_unavailable'] as const),
  recoveryActions: Object.freeze([
    resolveOperatorRecoveryAction('triage-settlement'),
    resolveOperatorRecoveryAction('classify-operator-incident'),
  ]),
  capabilities: Object.freeze({
    mutation: false,
    holdClear: false,
    checking: false,
    signing: false,
    authorization: false,
    submission: false,
    broadcast: false,
    fundsAuthority: false,
  }),
}) satisfies OperatorAlertEvent;
const EVENT_DIGEST = digestOperatorAlertEvent(event);

function response(status: number, chunks: readonly string[] = []) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return { ok: status >= 200 && status <= 299, status, body };
}

describe('HTTPS operator alert delivery adapter', () => {
  it('uses exact idempotency and returns only a local receipt digest', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe('POST');
      expect(init.redirect).toBe('error');
      expect(init.headers).toMatchObject({
        'idempotency-key': ALERT_ID,
        authorization: 'Bearer opaque-runtime-value',
      });
      expect(String(init.body)).not.toContain('opaque-runtime-value');
      return response(202, ['accepted']);
    });
    const transport = createHttpsOperatorAlertExternalDelivery({
      endpoint: ENDPOINT,
      authorizationHeader: 'Bearer opaque-runtime-value',
      authorizationEndpointIdentityDigestHex: ENDPOINT_DIGEST,
      fetchImpl,
    });
    const result = await transport.deliver({
      alertIdHex: ALERT_ID,
      idempotencyKey: ALERT_ID,
      eventDigestHex: EVENT_DIGEST,
      event,
    });
    expect(result).toMatchObject({ status: 'delivered' });
    expect(result).not.toHaveProperty('responseBody');
    expect(result).not.toHaveProperty('endpoint');
  });

  it('binds authorization and the receipt to the exact endpoint identity', async () => {
    expect(() => createHttpsOperatorAlertExternalDelivery({
      endpoint: ENDPOINT,
      authorizationHeader: 'Bearer opaque-runtime-value',
    })).toThrow(/exact endpoint identity/i);
    expect(() => createHttpsOperatorAlertExternalDelivery({
      endpoint: ENDPOINT,
      authorizationHeader: 'Bearer opaque-runtime-value',
      authorizationEndpointIdentityDigestHex:
        digestOperatorAlertExternalEndpoint('https://other.example.test/bridge'),
    })).toThrow(/exact endpoint identity/i);

    const first = createHttpsOperatorAlertExternalDelivery({
      endpoint: ENDPOINT,
      fetchImpl: async () => response(202, ['accepted']),
    });
    const second = createHttpsOperatorAlertExternalDelivery({
      endpoint: 'https://other.example.test/bridge',
      fetchImpl: async () => response(202, ['accepted']),
    });
    const input = {
      alertIdHex: ALERT_ID,
      idempotencyKey: ALERT_ID,
      eventDigestHex: EVENT_DIGEST,
      event,
    } as const;
    const firstResult = await first.deliver(input);
    const secondResult = await second.deliver(input);
    expect(firstResult).toMatchObject({ status: 'delivered' });
    expect(secondResult).toMatchObject({ status: 'delivered' });
    expect(firstResult).not.toEqual(secondResult);
  });

  it.each([
    'http://alerts.example.test/bridge',
    'https://user:pass@alerts.example.test/bridge',
    'https://alerts.example.test/bridge?token=value',
    'https://alerts.example.test/bridge#fragment',
  ])('rejects unsafe endpoint shape %s', endpoint => {
    expect(() => createHttpsOperatorAlertExternalDelivery({ endpoint }))
      .toThrow(/credential-free HTTPS/i);
  });

  it('maps bounded remote and response failures without leaking details', async () => {
    const status = createHttpsOperatorAlertExternalDelivery({
      endpoint: 'https://alerts.example.test/bridge',
      fetchImpl: async () => response(429),
    });
    expect(await status.deliver({
      alertIdHex: ALERT_ID,
      idempotencyKey: ALERT_ID,
      eventDigestHex: EVENT_DIGEST,
      event,
    })).toEqual({
      status: 'retryable_failure',
      code: 'transport_unavailable',
    });

    const oversized = createHttpsOperatorAlertExternalDelivery({
      endpoint: 'https://alerts.example.test/bridge',
      maxResponseBytes: 4,
      fetchImpl: async () => response(200, ['12345']),
    });
    expect(await oversized.deliver({
      alertIdHex: ALERT_ID,
      idempotencyKey: ALERT_ID,
      eventDigestHex: EVENT_DIGEST,
      event,
    })).toEqual({
      status: 'retryable_failure',
      code: 'transport_unavailable',
    });
  });

  it('fails closed when the caller changes the idempotency key', async () => {
    const fetchImpl = vi.fn(async () => response(200));
    const transport = createHttpsOperatorAlertExternalDelivery({
      endpoint: 'https://alerts.example.test/bridge',
      fetchImpl,
    });
    expect(await transport.deliver({
      alertIdHex: ALERT_ID,
      idempotencyKey: '44'.repeat(32),
      eventDigestHex: EVENT_DIGEST,
      event,
    })).toEqual({
      status: 'retryable_failure',
      code: 'transport_unavailable',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed when the event or digest binding changes', async () => {
    const fetchImpl = vi.fn(async () => response(200));
    const transport = createHttpsOperatorAlertExternalDelivery({
      endpoint: 'https://alerts.example.test/bridge',
      fetchImpl,
    });
    expect(await transport.deliver({
      alertIdHex: ALERT_ID,
      idempotencyKey: ALERT_ID,
      eventDigestHex: '44'.repeat(32),
      event,
    })).toEqual({
      status: 'retryable_failure',
      code: 'transport_unavailable',
    });
    expect(await transport.deliver({
      alertIdHex: ALERT_ID,
      idempotencyKey: ALERT_ID,
      eventDigestHex: EVENT_DIGEST,
      event: Object.freeze({
        ...event,
        alertIdHex: '55'.repeat(32),
      }),
    })).toEqual({
      status: 'retryable_failure',
      code: 'transport_unavailable',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
