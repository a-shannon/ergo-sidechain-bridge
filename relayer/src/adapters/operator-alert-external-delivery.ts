import { createHash } from 'node:crypto';

import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import type {
  OperatorAlertExternalTransport,
  OperatorAlertExternalTransportResult,
} from '../relayer-core/operator-alert-external-outbox.js';
import {
  digestOperatorAlertEvent,
  normalizeOperatorAlertEvent,
} from '../relayer-core/operator-alert-delivery.js';

export const OPERATOR_ALERT_EXTERNAL_DELIVERY_REQUEST_SCHEMA =
  'e2s.operator-alert-external-delivery-request.v1' as const;
export const OPERATOR_ALERT_EXTERNAL_DELIVERY_RECEIPT_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:operator-alert-external-delivery-receipt:v1' as const;
export const OPERATOR_ALERT_EXTERNAL_ENDPOINT_IDENTITY_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:operator-alert-external-endpoint-identity:v1' as const;

interface BoundedFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly body: ReadableStream<Uint8Array> | null;
}

type BoundedFetch = (
  input: string,
  init: RequestInit,
) => Promise<BoundedFetchResponse>;

export interface HttpsOperatorAlertExternalDeliveryOptions {
  readonly endpoint: string;
  readonly authorizationHeader?: string;
  readonly authorizationEndpointIdentityDigestHex?: string;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly fetchImpl?: BoundedFetch;
}

export function createHttpsOperatorAlertExternalDelivery(
  options: HttpsOperatorAlertExternalDeliveryOptions,
): OperatorAlertExternalTransport {
  const endpoint = normalizeEndpoint(options.endpoint);
  const endpointIdentityDigestHex = digestOperatorAlertExternalEndpoint(endpoint);
  const authorizationHeader = normalizeAuthorizationHeader(
    options.authorizationHeader,
  );
  assertAuthorizationEndpointBinding({
    authorizationHeader,
    configuredDigestHex: options.authorizationEndpointIdentityDigestHex,
    endpointIdentityDigestHex,
  });
  const timeoutMs = boundedPositiveInteger(
    options.timeoutMs ?? 10_000,
    30_000,
    'operator alert delivery timeout',
  );
  const maxResponseBytes = boundedPositiveInteger(
    options.maxResponseBytes ?? 65_536,
    65_536,
    'operator alert delivery response limit',
  );
  const fetchImpl = options.fetchImpl
    ?? (fetch as unknown as BoundedFetch);

  return Object.freeze({
    async deliver(
      input: Parameters<OperatorAlertExternalTransport['deliver']>[0],
    ) {
      let event;
      try {
        event = normalizeOperatorAlertEvent(input.event);
      } catch {
        return unavailable();
      }
      if (
        input.idempotencyKey !== input.alertIdHex
        || !/^[0-9a-f]{64}$/.test(input.alertIdHex)
        || !/^[0-9a-f]{64}$/.test(input.eventDigestHex)
        || event.alertIdHex !== input.alertIdHex
        || digestOperatorAlertEvent(event) !== input.eventDigestHex
      ) return unavailable();
      const body = canonicalJson({
        schema: OPERATOR_ALERT_EXTERNAL_DELIVERY_REQUEST_SCHEMA,
        version: 1,
        alertIdHex: input.alertIdHex,
        idempotencyKey: input.idempotencyKey,
        eventDigestHex: input.eventDigestHex,
        event,
      });
      const requestDigestHex = createHash('sha256')
        .update(body, 'utf8')
        .digest('hex');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers: Record<string, string> = {
          accept: 'application/json',
          'content-type': 'application/json',
          'idempotency-key': input.idempotencyKey,
        };
        if (authorizationHeader !== undefined) {
          headers.authorization = authorizationHeader;
        }
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers,
          body,
          redirect: 'error',
          signal: controller.signal,
        });
        if (
          !Number.isInteger(response.status)
          || response.status < 100
          || response.status > 599
        ) {
          return unavailable();
        }
        const responseBytes = await readBoundedResponse(
          response.body,
          maxResponseBytes,
        );
        if (!response.ok || response.status < 200 || response.status > 299) {
          return response.status === 408
            || response.status === 425
            || response.status === 429
            || response.status >= 500
            ? unavailable()
            : rejected();
        }
        const responseBodySha256Hex = createHash('sha256')
          .update(responseBytes)
          .digest('hex');
        return Object.freeze({
          status: 'delivered' as const,
          receiptDigestHex: sha256CanonicalJson({
            schema: OPERATOR_ALERT_EXTERNAL_DELIVERY_REQUEST_SCHEMA,
            alertIdHex: input.alertIdHex,
            eventDigestHex: input.eventDigestHex,
            endpointIdentityDigestHex,
            requestDigestHex,
            responseStatus: response.status,
            responseBodySha256Hex,
          }, OPERATOR_ALERT_EXTERNAL_DELIVERY_RECEIPT_DIGEST_DOMAIN),
        });
      } catch {
        return unavailable();
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}

export function digestOperatorAlertExternalEndpoint(value: string): string {
  return sha256CanonicalJson({
    endpoint: normalizeEndpoint(value),
  }, OPERATOR_ALERT_EXTERNAL_ENDPOINT_IDENTITY_DIGEST_DOMAIN);
}

function normalizeEndpoint(value: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('operator alert delivery endpoint must be an absolute URL');
  }
  if (
    endpoint.protocol !== 'https:'
    || endpoint.username !== ''
    || endpoint.password !== ''
    || endpoint.hash !== ''
    || endpoint.search !== ''
  ) {
    throw new Error(
      'operator alert delivery endpoint must be credential-free HTTPS without query or fragment',
    );
  }
  return endpoint.toString();
}

function normalizeAuthorizationHeader(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  if (
    value.length === 0
    || value.length > 4_096
    || /[\r\n]/.test(value)
  ) {
    throw new Error('operator alert authorization header is invalid');
  }
  return value;
}

function assertAuthorizationEndpointBinding(input: Readonly<{
  authorizationHeader: string | undefined;
  configuredDigestHex: string | undefined;
  endpointIdentityDigestHex: string;
}>): void {
  if (input.authorizationHeader === undefined) {
    if (input.configuredDigestHex !== undefined) {
      throw new Error(
        'operator alert authorization endpoint binding requires authorization',
      );
    }
    return;
  }
  if (
    input.configuredDigestHex === undefined
    || !/^[0-9a-f]{64}$/.test(input.configuredDigestHex)
    || input.configuredDigestHex !== input.endpointIdentityDigestHex
  ) {
    throw new Error(
      'operator alert authorization is not bound to the exact endpoint identity',
    );
  }
}

function boundedPositiveInteger(
  value: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${label} must be a positive bounded integer`);
  }
  return value;
}

async function readBoundedResponse(
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (body === null) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (!(result.value instanceof Uint8Array)) {
        throw new Error('operator alert response body is not raw bytes');
      }
      total += result.value.byteLength;
      if (total > maximumBytes) {
        throw new Error('operator alert response exceeds its byte limit');
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function unavailable(): OperatorAlertExternalTransportResult {
  return Object.freeze({
    status: 'retryable_failure',
    code: 'transport_unavailable',
  });
}

function rejected(): OperatorAlertExternalTransportResult {
  return Object.freeze({
    status: 'retryable_failure',
    code: 'transport_rejected',
  });
}
