import { describe, expect, it } from 'vitest';

import {
  OPERATOR_ALERT_ACKNOWLEDGEMENT_DOMAIN,
  OPERATOR_ALERT_ACKNOWLEDGEMENT_SCHEMA,
  OPERATOR_ALERT_ACKNOWLEDGEMENT_VERSION,
  OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_SCHEMA,
  OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_VERSION,
  canonicalOperatorAlertAcknowledgementBytes,
  parseOperatorAlertAcknowledgement,
  parseOperatorAlertAcknowledgementKeyRegistry,
} from './operator-alert-acknowledgement.js';

const HEX_32 = 'ab'.repeat(32);
const SIGNATURE = 'cd'.repeat(64);

function acknowledgement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: OPERATOR_ALERT_ACKNOWLEDGEMENT_SCHEMA,
    version: OPERATOR_ALERT_ACKNOWLEDGEMENT_VERSION,
    domain: OPERATOR_ALERT_ACKNOWLEDGEMENT_DOMAIN,
    alertIdHex: HEX_32,
    deliveryReceiptDigestHex: 'ef'.repeat(32),
    keyIdHex: '01'.repeat(32),
    acknowledgedAtMs: 1_725_000_000_000,
    nonceHex: '23'.repeat(32),
    signatureHex: SIGNATURE,
    ...overrides,
  };
}

describe('operator alert acknowledgement statement', () => {
  it('uses domain-separated canonical signing bytes without the signature', () => {
    const parsed = parseOperatorAlertAcknowledgement(acknowledgement());
    const bytes = new TextDecoder().decode(canonicalOperatorAlertAcknowledgementBytes(parsed));
    expect(bytes).toContain(`${OPERATOR_ALERT_ACKNOWLEDGEMENT_DOMAIN}\0`);
    expect(bytes).toContain('"alertIdHex"');
    expect(bytes).not.toContain(SIGNATURE);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    ['unsupported schema', acknowledgement({ schema: 'other.v1' })],
    ['unsupported version', acknowledgement({ version: 2 })],
    ['unsupported domain', acknowledgement({ domain: 'other-domain' })],
    ['uppercase alert ID', acknowledgement({ alertIdHex: HEX_32.toUpperCase() })],
    ['short receipt digest', acknowledgement({ deliveryReceiptDigestHex: 'ef'.repeat(31) })],
    ['negative acknowledgement time', acknowledgement({ acknowledgedAtMs: -1 })],
    ['unsafe acknowledgement time', acknowledgement({ acknowledgedAtMs: Number.MAX_SAFE_INTEGER + 1 })],
    ['short nonce', acknowledgement({ nonceHex: '23'.repeat(31) })],
    ['short signature', acknowledgement({ signatureHex: 'cd'.repeat(63) })],
    ['extra field', acknowledgement({ extra: true })],
  ])('rejects %s', (_label, value) => {
    expect(() => parseOperatorAlertAcknowledgement(value)).toThrow();
  });

  it('requires a versioned exact-field registry with unique lowercase IDs', () => {
    const registry = parseOperatorAlertAcknowledgementKeyRegistry({
      schema: OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_SCHEMA,
      version: OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_VERSION,
      keys: [{ keyIdHex: '10'.repeat(32), publicKeySpkiDerHex: '3000' }],
    });
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.keys)).toBe(true);
    expect(() => parseOperatorAlertAcknowledgementKeyRegistry({
      schema: OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_SCHEMA,
      version: OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_VERSION,
      keys: [
        { keyIdHex: '10'.repeat(32), publicKeySpkiDerHex: '3000' },
        { keyIdHex: '10'.repeat(32), publicKeySpkiDerHex: '3001' },
      ],
    })).toThrow(/duplicate key IDs/);
  });
});
