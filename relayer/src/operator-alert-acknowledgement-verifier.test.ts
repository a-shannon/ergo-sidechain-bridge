import {
  createHash,
  generateKeyPairSync,
  sign,
} from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  OPERATOR_ALERT_ACKNOWLEDGEMENT_DOMAIN,
  OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_SCHEMA,
  OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_VERSION,
  OPERATOR_ALERT_ACKNOWLEDGEMENT_SCHEMA,
  OPERATOR_ALERT_ACKNOWLEDGEMENT_VERSION,
  canonicalOperatorAlertAcknowledgementBytes,
} from './relayer-core/operator-alert-acknowledgement.js';
import { Ed25519OperatorAlertAcknowledgementVerifier } from './adapters/operator-alert-acknowledgement-verifier.js';

const ALERT_ID_HEX = '10'.repeat(32);
const RECEIPT_DIGEST_HEX = '20'.repeat(32);

function fixture() {
  const keys = generateKeyPairSync('ed25519');
  const publicKeySpkiDerHex = keys.publicKey
    .export({ format: 'der', type: 'spki' })
    .toString('hex');
  const keyIdHex = createHash('sha256')
    .update(Buffer.from(publicKeySpkiDerHex, 'hex'))
    .digest('hex');
  const acknowledgement = {
    schema: OPERATOR_ALERT_ACKNOWLEDGEMENT_SCHEMA,
    version: OPERATOR_ALERT_ACKNOWLEDGEMENT_VERSION,
    domain: OPERATOR_ALERT_ACKNOWLEDGEMENT_DOMAIN,
    alertIdHex: ALERT_ID_HEX,
    deliveryReceiptDigestHex: RECEIPT_DIGEST_HEX,
    keyIdHex,
    acknowledgedAtMs: 1_725_000_000_000,
    nonceHex: '30'.repeat(32),
    signatureHex: '00'.repeat(64),
  };
  acknowledgement.signatureHex = sign(
    null,
    canonicalOperatorAlertAcknowledgementBytes(acknowledgement),
    keys.privateKey,
  ).toString('hex');
  const registry = {
    schema: OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_SCHEMA,
    version: OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_VERSION,
    keys: [{ keyIdHex, publicKeySpkiDerHex }],
  };
  return { acknowledgement, registry };
}

function verifyFixture(input = fixture()) {
  return new Ed25519OperatorAlertAcknowledgementVerifier(input.registry).verify({
    acknowledgement: input.acknowledgement,
    expected: {
      alertIdHex: ALERT_ID_HEX,
      deliveryReceiptDigestHex: RECEIPT_DIGEST_HEX,
    },
  });
}

describe('Ed25519 operator alert acknowledgement verifier', () => {
  it('verifies a registered acknowledgement as immutable audit metadata only', () => {
    const verified = verifyFixture();
    expect(verified.auditMetadataOnly).toBe(true);
    expect(verified.capabilities).toEqual({
      mutation: false,
      holdClear: false,
      checking: false,
      signing: false,
      authorization: false,
      submission: false,
      broadcast: false,
      fundsAuthority: false,
    });
    expect(Object.isFrozen(verified)).toBe(true);
    expect(Object.isFrozen(verified.capabilities)).toBe(true);
  });

  it('rejects wrong alert or receipt bindings', () => {
    const input = fixture();
    const verifier = new Ed25519OperatorAlertAcknowledgementVerifier(input.registry);
    expect(() => verifier.verify({
      acknowledgement: input.acknowledgement,
      expected: { alertIdHex: '11'.repeat(32), deliveryReceiptDigestHex: RECEIPT_DIGEST_HEX },
    })).toThrow(/expected alert delivery binding/);
    expect(() => verifier.verify({
      acknowledgement: input.acknowledgement,
      expected: { alertIdHex: ALERT_ID_HEX, deliveryReceiptDigestHex: '21'.repeat(32) },
    })).toThrow(/expected alert delivery binding/);
  });

  it.each([
    ['alert ID', { alertIdHex: '11'.repeat(32) }],
    ['receipt digest', { deliveryReceiptDigestHex: '21'.repeat(32) }],
    ['key ID', { keyIdHex: '31'.repeat(32) }],
    ['acknowledgement time', { acknowledgedAtMs: 1_725_000_000_001 }],
    ['nonce', { nonceHex: '32'.repeat(32) }],
    ['signature', { signatureHex: 'ff'.repeat(64) }],
  ])('rejects a modified signed %s', (_label, mutation) => {
    const input = fixture();
    expect(() => new Ed25519OperatorAlertAcknowledgementVerifier(input.registry).verify({
      acknowledgement: { ...input.acknowledgement, ...mutation },
      expected: { alertIdHex: ALERT_ID_HEX, deliveryReceiptDigestHex: RECEIPT_DIGEST_HEX },
    })).toThrow();
  });

  it('fails closed for unknown keys, duplicate IDs, and non-Ed25519 registry material', () => {
    const input = fixture();
    expect(() => new Ed25519OperatorAlertAcknowledgementVerifier(input.registry).verify({
      acknowledgement: { ...input.acknowledgement, keyIdHex: '40'.repeat(32) },
      expected: { alertIdHex: ALERT_ID_HEX, deliveryReceiptDigestHex: RECEIPT_DIGEST_HEX },
    })).toThrow(/not registered/);
    expect(() => new Ed25519OperatorAlertAcknowledgementVerifier({
      ...input.registry,
      keys: [{ ...input.registry.keys[0], keyIdHex: '40'.repeat(32) }],
    })).toThrow(/does not match its public key/);
    expect(() => new Ed25519OperatorAlertAcknowledgementVerifier({
      ...input.registry,
      keys: [input.registry.keys[0], input.registry.keys[0]],
    })).toThrow(/duplicate key IDs/);
    expect(() => new Ed25519OperatorAlertAcknowledgementVerifier({
      ...input.registry,
      keys: [{ ...input.registry.keys[0], publicKeySpkiDerHex: '3000' }],
    })).toThrow(/SPKI DER/);
  });
});
