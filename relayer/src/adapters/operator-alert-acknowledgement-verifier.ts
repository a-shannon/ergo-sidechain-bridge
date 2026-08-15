import {
  createHash,
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from 'node:crypto';

import {
  assertOperatorAlertAcknowledgementExpectedBinding,
  canonicalOperatorAlertAcknowledgementBytes,
  parseOperatorAlertAcknowledgement,
  parseOperatorAlertAcknowledgementKeyRegistry,
  verifiedOperatorAlertAcknowledgement,
  type OperatorAlertAcknowledgementKeyRegistry,
  type OperatorAlertAcknowledgementVerifier,
  type VerifiedOperatorAlertAcknowledgement,
} from '../relayer-core/operator-alert-acknowledgement.js';

interface RegisteredOperatorAlertAcknowledgementKey {
  readonly key: KeyObject;
}

const verifiedAcknowledgements = new WeakSet<object>();

export function assertVerifiedOperatorAlertAcknowledgementProvenance(
  value: unknown,
): asserts value is VerifiedOperatorAlertAcknowledgement {
  if (
    value === null
    || typeof value !== 'object'
    || !verifiedAcknowledgements.has(value)
  ) {
    throw new Error(
      'operator alert acknowledgement lacks live Ed25519 verification provenance',
    );
  }
}

export class Ed25519OperatorAlertAcknowledgementVerifier
  implements OperatorAlertAcknowledgementVerifier {
  private readonly registry: OperatorAlertAcknowledgementKeyRegistry;
  private readonly keysById: ReadonlyMap<string, RegisteredOperatorAlertAcknowledgementKey>;

  constructor(registryValue: unknown) {
    this.registry = parseOperatorAlertAcknowledgementKeyRegistry(registryValue);
    const keysById = new Map<string, RegisteredOperatorAlertAcknowledgementKey>();
    for (const registered of this.registry.keys) {
      const der = Buffer.from(registered.publicKeySpkiDerHex, 'hex');
      let key: KeyObject;
      try {
        key = createPublicKey({ key: der, format: 'der', type: 'spki' });
      } catch {
        throw new Error('operator alert acknowledgement registry key is not valid SPKI DER');
      }
      if (key.asymmetricKeyType !== 'ed25519') {
        throw new Error('operator alert acknowledgement registry key must be Ed25519');
      }
      const canonicalDer = key.export({ format: 'der', type: 'spki' }) as Buffer;
      if (!der.equals(canonicalDer)) {
        throw new Error('operator alert acknowledgement registry key must use canonical SPKI DER');
      }
      const keyIdHex = createHash('sha256').update(canonicalDer).digest('hex');
      if (keyIdHex !== registered.keyIdHex) {
        throw new Error('operator alert acknowledgement registry key ID does not match its public key');
      }
      if (keysById.has(registered.keyIdHex)) {
        throw new Error('operator alert acknowledgement key registry contains duplicate key IDs');
      }
      keysById.set(registered.keyIdHex, Object.freeze({ key }));
    }
    this.keysById = keysById;
  }

  verify(input: Readonly<{
    acknowledgement: unknown;
    expected: Readonly<{
      alertIdHex: string;
      deliveryReceiptDigestHex: string;
    }>;
  }>): VerifiedOperatorAlertAcknowledgement {
    const acknowledgement = parseOperatorAlertAcknowledgement(input.acknowledgement);
    assertOperatorAlertAcknowledgementExpectedBinding(acknowledgement, input.expected);
    const registered = this.keysById.get(acknowledgement.keyIdHex);
    if (!registered) {
      throw new Error('operator alert acknowledgement key is not registered');
    }
    const signature = Buffer.from(acknowledgement.signatureHex, 'hex');
    if (!verifySignature(
      null,
      canonicalOperatorAlertAcknowledgementBytes(acknowledgement),
      registered.key,
      signature,
    )) {
      throw new Error('operator alert acknowledgement signature is invalid');
    }
    const verified = verifiedOperatorAlertAcknowledgement(
      acknowledgement,
      this.registry,
    );
    verifiedAcknowledgements.add(verified);
    return verified;
  }
}
