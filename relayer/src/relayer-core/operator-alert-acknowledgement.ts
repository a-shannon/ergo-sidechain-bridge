import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';

export const OPERATOR_ALERT_ACKNOWLEDGEMENT_SCHEMA =
  'e2s.operator-alert-acknowledgement.v1' as const;
export const OPERATOR_ALERT_ACKNOWLEDGEMENT_VERSION = 1 as const;
export const OPERATOR_ALERT_ACKNOWLEDGEMENT_DOMAIN =
  'ergo-sidechain-bridge:operator-alert-acknowledgement:v1' as const;
export const OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_SCHEMA =
  'e2s.operator-alert-acknowledgement-key-registry.v1' as const;
export const OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_VERSION = 1 as const;
export const OPERATOR_ALERT_ACKNOWLEDGEMENT_VERIFICATION_SCHEMA =
  'e2s.operator-alert-acknowledgement-verification.v1' as const;
export const OPERATOR_ALERT_ACKNOWLEDGEMENT_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:operator-alert-acknowledgement-digest:v1' as const;
export const OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:operator-alert-acknowledgement-key-registry:v1' as const;

const HEX_32_BYTES = 64;
const HEX_64_BYTES = 128;

export interface OperatorAlertAcknowledgement {
  readonly schema: typeof OPERATOR_ALERT_ACKNOWLEDGEMENT_SCHEMA;
  readonly version: typeof OPERATOR_ALERT_ACKNOWLEDGEMENT_VERSION;
  readonly domain: typeof OPERATOR_ALERT_ACKNOWLEDGEMENT_DOMAIN;
  readonly alertIdHex: string;
  readonly deliveryReceiptDigestHex: string;
  readonly keyIdHex: string;
  readonly acknowledgedAtMs: number;
  readonly nonceHex: string;
  readonly signatureHex: string;
}

export interface OperatorAlertAcknowledgementKey {
  readonly keyIdHex: string;
  readonly publicKeySpkiDerHex: string;
}

export interface OperatorAlertAcknowledgementKeyRegistry {
  readonly schema: typeof OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_SCHEMA;
  readonly version: typeof OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_VERSION;
  readonly keys: readonly OperatorAlertAcknowledgementKey[];
}

export interface OperatorAlertAcknowledgementExpectedBinding {
  readonly alertIdHex: string;
  readonly deliveryReceiptDigestHex: string;
}

export interface VerifiedOperatorAlertAcknowledgement {
  readonly schema: typeof OPERATOR_ALERT_ACKNOWLEDGEMENT_VERIFICATION_SCHEMA;
  readonly acknowledgement: OperatorAlertAcknowledgement;
  readonly registrySchema: typeof OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_SCHEMA;
  readonly registryVersion: typeof OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_VERSION;
  readonly registryDigestHex: string;
  readonly acknowledgementDigestHex: string;
  readonly auditMetadataOnly: true;
  readonly capabilities: Readonly<{
    mutation: false;
    holdClear: false;
    checking: false;
    signing: false;
    authorization: false;
    submission: false;
    broadcast: false;
    fundsAuthority: false;
  }>;
}

export interface OperatorAlertAcknowledgementVerifier {
  verify(input: Readonly<{
    acknowledgement: unknown;
    expected: OperatorAlertAcknowledgementExpectedBinding;
  }>): VerifiedOperatorAlertAcknowledgement;
}

const NO_ACKNOWLEDGEMENT_CAPABILITIES = Object.freeze({
  mutation: false,
  holdClear: false,
  checking: false,
  signing: false,
  authorization: false,
  submission: false,
  broadcast: false,
  fundsAuthority: false,
} as const);

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function assertExactFields(
  record: Record<string, unknown>,
  fields: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} must use exact fields`);
  }
}

function fixedLowerHex(value: unknown, length: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${length}}$`).test(value)) {
    throw new Error(`${label} must be ${length / 2}-byte lowercase hex`);
  }
  return value;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value as number;
}

export function parseOperatorAlertAcknowledgement(
  value: unknown,
): OperatorAlertAcknowledgement {
  const record = plainRecord(value, 'operator alert acknowledgement');
  assertExactFields(record, [
    'schema',
    'version',
    'domain',
    'alertIdHex',
    'deliveryReceiptDigestHex',
    'keyIdHex',
    'acknowledgedAtMs',
    'nonceHex',
    'signatureHex',
  ], 'operator alert acknowledgement');
  if (record.schema !== OPERATOR_ALERT_ACKNOWLEDGEMENT_SCHEMA) {
    throw new Error('unsupported operator alert acknowledgement schema');
  }
  if (record.version !== OPERATOR_ALERT_ACKNOWLEDGEMENT_VERSION) {
    throw new Error('unsupported operator alert acknowledgement version');
  }
  if (record.domain !== OPERATOR_ALERT_ACKNOWLEDGEMENT_DOMAIN) {
    throw new Error('unsupported operator alert acknowledgement domain');
  }
  return Object.freeze({
    schema: OPERATOR_ALERT_ACKNOWLEDGEMENT_SCHEMA,
    version: OPERATOR_ALERT_ACKNOWLEDGEMENT_VERSION,
    domain: OPERATOR_ALERT_ACKNOWLEDGEMENT_DOMAIN,
    alertIdHex: fixedLowerHex(record.alertIdHex, HEX_32_BYTES, 'operator alert ID'),
    deliveryReceiptDigestHex: fixedLowerHex(
      record.deliveryReceiptDigestHex,
      HEX_32_BYTES,
      'operator alert delivery receipt digest',
    ),
    keyIdHex: fixedLowerHex(record.keyIdHex, HEX_32_BYTES, 'operator alert acknowledgement key ID'),
    acknowledgedAtMs: nonnegativeSafeInteger(
      record.acknowledgedAtMs,
      'operator alert acknowledgement time',
    ),
    nonceHex: fixedLowerHex(record.nonceHex, HEX_32_BYTES, 'operator alert acknowledgement nonce'),
    signatureHex: fixedLowerHex(
      record.signatureHex,
      HEX_64_BYTES,
      'operator alert acknowledgement signature',
    ),
  });
}

export function parseOperatorAlertAcknowledgementKeyRegistry(
  value: unknown,
): OperatorAlertAcknowledgementKeyRegistry {
  const record = plainRecord(value, 'operator alert acknowledgement key registry');
  assertExactFields(record, ['schema', 'version', 'keys'], 'operator alert acknowledgement key registry');
  if (record.schema !== OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_SCHEMA) {
    throw new Error('unsupported operator alert acknowledgement key registry schema');
  }
  if (record.version !== OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_VERSION) {
    throw new Error('unsupported operator alert acknowledgement key registry version');
  }
  if (!Array.isArray(record.keys) || record.keys.length === 0) {
    throw new Error('operator alert acknowledgement key registry must contain keys');
  }
  const keyIds = new Set<string>();
  const keys = record.keys.map((value, index) => {
    const key = plainRecord(value, `operator alert acknowledgement key ${index}`);
    assertExactFields(
      key,
      ['keyIdHex', 'publicKeySpkiDerHex'],
      `operator alert acknowledgement key ${index}`,
    );
    const keyIdHex = fixedLowerHex(
      key.keyIdHex,
      HEX_32_BYTES,
      `operator alert acknowledgement key ${index} ID`,
    );
    if (keyIds.has(keyIdHex)) {
      throw new Error('operator alert acknowledgement key registry contains duplicate key IDs');
    }
    keyIds.add(keyIdHex);
    if (typeof key.publicKeySpkiDerHex !== 'string'
      || !/^[0-9a-f]+$/.test(key.publicKeySpkiDerHex)
      || key.publicKeySpkiDerHex.length % 2 !== 0) {
      throw new Error(`operator alert acknowledgement key ${index} SPKI must be lowercase hex`);
    }
    return Object.freeze({
      keyIdHex,
      publicKeySpkiDerHex: key.publicKeySpkiDerHex,
    });
  });
  return Object.freeze({
    schema: OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_SCHEMA,
    version: OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_VERSION,
    keys: Object.freeze(keys),
  });
}

export function canonicalOperatorAlertAcknowledgementBytes(
  acknowledgement: OperatorAlertAcknowledgement,
): Uint8Array {
  const normalized = parseOperatorAlertAcknowledgement(acknowledgement);
  const material = canonicalJson({
    schema: normalized.schema,
    version: normalized.version,
    domain: normalized.domain,
    alertIdHex: normalized.alertIdHex,
    deliveryReceiptDigestHex: normalized.deliveryReceiptDigestHex,
    keyIdHex: normalized.keyIdHex,
    acknowledgedAtMs: normalized.acknowledgedAtMs,
    nonceHex: normalized.nonceHex,
  });
  return new TextEncoder().encode(
    `${OPERATOR_ALERT_ACKNOWLEDGEMENT_DOMAIN}\0${material}`,
  );
}

export function digestOperatorAlertAcknowledgement(value: unknown): string {
  return sha256CanonicalJson(
    parseOperatorAlertAcknowledgement(value),
    OPERATOR_ALERT_ACKNOWLEDGEMENT_DIGEST_DOMAIN,
  );
}

export function digestOperatorAlertAcknowledgementKeyRegistry(
  value: unknown,
): string {
  return sha256CanonicalJson(
    parseOperatorAlertAcknowledgementKeyRegistry(value),
    OPERATOR_ALERT_ACKNOWLEDGEMENT_KEY_REGISTRY_DIGEST_DOMAIN,
  );
}

export function assertOperatorAlertAcknowledgementExpectedBinding(
  acknowledgement: OperatorAlertAcknowledgement,
  expected: OperatorAlertAcknowledgementExpectedBinding,
): void {
  const alertIdHex = fixedLowerHex(expected.alertIdHex, HEX_32_BYTES, 'expected operator alert ID');
  const deliveryReceiptDigestHex = fixedLowerHex(
    expected.deliveryReceiptDigestHex,
    HEX_32_BYTES,
    'expected operator alert delivery receipt digest',
  );
  if (acknowledgement.alertIdHex !== alertIdHex
    || acknowledgement.deliveryReceiptDigestHex !== deliveryReceiptDigestHex) {
    throw new Error('operator alert acknowledgement does not match expected alert delivery binding');
  }
}

export function verifiedOperatorAlertAcknowledgement(
  acknowledgement: OperatorAlertAcknowledgement,
  registry: OperatorAlertAcknowledgementKeyRegistry,
): VerifiedOperatorAlertAcknowledgement {
  return Object.freeze({
    schema: OPERATOR_ALERT_ACKNOWLEDGEMENT_VERIFICATION_SCHEMA,
    acknowledgement,
    registrySchema: registry.schema,
    registryVersion: registry.version,
    registryDigestHex: digestOperatorAlertAcknowledgementKeyRegistry(registry),
    acknowledgementDigestHex: digestOperatorAlertAcknowledgement(
      acknowledgement,
    ),
    auditMetadataOnly: true,
    capabilities: NO_ACKNOWLEDGEMENT_CAPABILITIES,
  });
}
