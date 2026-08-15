import Database from 'better-sqlite3';

import {
  assertVerifiedOperatorAlertAcknowledgementProvenance,
} from './operator-alert-acknowledgement-verifier.js';
import type {
  SqliteOperatorAlertExternalOutbox,
} from './operator-alert-external-outbox.js';
import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  normalizeNonnegativeSafeInteger,
} from '../relayer-core/operator-alert-delivery-state.js';
import type {
  OperatorAlertExternalOutboxItem,
} from '../relayer-core/operator-alert-external-outbox.js';
import type {
  VerifiedOperatorAlertAcknowledgement,
} from '../relayer-core/operator-alert-acknowledgement.js';

export const OPERATOR_ALERT_ACKNOWLEDGEMENT_AUDIT_RECORD_SCHEMA =
  'e2s.operator-alert-acknowledgement-audit-record.v1' as const;

export interface OperatorAlertAcknowledgementAuditRecord {
  readonly schema: typeof OPERATOR_ALERT_ACKNOWLEDGEMENT_AUDIT_RECORD_SCHEMA;
  readonly alertIdHex: string;
  readonly deliveryReceiptDigestHex: string;
  readonly acknowledgementDigestHex: string;
  readonly keyIdHex: string;
  readonly registryDigestHex: string;
  readonly acknowledgedAtMs: number;
  readonly nonceHex: string;
  readonly verifiedAtMs: number;
  readonly auditMetadataOnly: true;
}

export type OperatorAlertAcknowledgementStoreResult =
  | 'stored'
  | 'deduplicated'
  | 'conflict';

export interface OperatorAlertAcknowledgementAuditStore {
  get(alertIdHex: string): OperatorAlertExternalOutboxItem | null;
  recordVerifiedAcknowledgement(input: Readonly<{
    verification: VerifiedOperatorAlertAcknowledgement;
    verifiedAtMs: number;
  }>): OperatorAlertAcknowledgementStoreResult;
}

export class SqliteOperatorAlertAcknowledgementState
  implements OperatorAlertAcknowledgementAuditStore {
  private readonly db: Database.Database;

  constructor(
    databasePath: string,
    private readonly outbox: Pick<
      SqliteOperatorAlertExternalOutbox,
      'get'
    >,
  ) {
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operator_alert_acknowledgements (
        acknowledgement_digest_hex TEXT PRIMARY KEY,
        alert_id_hex TEXT NOT NULL UNIQUE,
        delivery_receipt_digest_hex TEXT NOT NULL,
        key_id_hex TEXT NOT NULL,
        registry_digest_hex TEXT NOT NULL,
        acknowledged_at_ms INTEGER NOT NULL,
        nonce_hex TEXT NOT NULL,
        acknowledgement_json TEXT NOT NULL,
        verified_at_ms INTEGER NOT NULL,
        UNIQUE (key_id_hex, nonce_hex),
        FOREIGN KEY (alert_id_hex)
          REFERENCES operator_alert_external_outbox(alert_id_hex),
        CHECK (length(acknowledgement_digest_hex) = 64),
        CHECK (length(alert_id_hex) = 64),
        CHECK (length(delivery_receipt_digest_hex) = 64),
        CHECK (length(key_id_hex) = 64),
        CHECK (length(registry_digest_hex) = 64),
        CHECK (length(nonce_hex) = 64),
        CHECK (acknowledged_at_ms >= 0),
        CHECK (verified_at_ms >= acknowledged_at_ms)
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  get(alertIdHex: string): OperatorAlertExternalOutboxItem | null {
    return this.outbox.get(alertIdHex);
  }

  recordVerifiedAcknowledgement(input: Readonly<{
    verification: VerifiedOperatorAlertAcknowledgement;
    verifiedAtMs: number;
  }>): OperatorAlertAcknowledgementStoreResult {
    assertVerifiedOperatorAlertAcknowledgementProvenance(input.verification);
    const verifiedAtMs = normalizeNonnegativeSafeInteger(
      input.verifiedAtMs,
      'operator alert acknowledgement verification time',
    );
    const verification = input.verification;
    const acknowledgement = verification.acknowledgement;
    return this.db.transaction(() => {
      const outbox = this.outbox.get(acknowledgement.alertIdHex);
      if (
        outbox === null
        || outbox.status !== 'delivered'
        || outbox.deliveryReceiptDigestHex
          !== acknowledgement.deliveryReceiptDigestHex
        || outbox.deliveredAtMs === null
        || acknowledgement.acknowledgedAtMs < outbox.deliveredAtMs
        || verifiedAtMs < acknowledgement.acknowledgedAtMs
      ) {
        return 'conflict' as const;
      }
      const existing = this.db.prepare(`
        SELECT acknowledgement_digest_hex
        FROM operator_alert_acknowledgements
        WHERE alert_id_hex = ?
      `).get(acknowledgement.alertIdHex) as {
        acknowledgement_digest_hex: string;
      } | undefined;
      if (existing) {
        return existing.acknowledgement_digest_hex
          === verification.acknowledgementDigestHex
          ? 'deduplicated' as const
          : 'conflict' as const;
      }
      const result = this.db.prepare(`
        INSERT OR IGNORE INTO operator_alert_acknowledgements (
          acknowledgement_digest_hex,
          alert_id_hex,
          delivery_receipt_digest_hex,
          key_id_hex,
          registry_digest_hex,
          acknowledged_at_ms,
          nonce_hex,
          acknowledgement_json,
          verified_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        verification.acknowledgementDigestHex,
        acknowledgement.alertIdHex,
        acknowledgement.deliveryReceiptDigestHex,
        acknowledgement.keyIdHex,
        verification.registryDigestHex,
        acknowledgement.acknowledgedAtMs,
        acknowledgement.nonceHex,
        canonicalJson(acknowledgement),
        verifiedAtMs,
      );
      return result.changes === 1 ? 'stored' as const : 'conflict' as const;
    })();
  }

  getAcknowledgement(
    alertIdHex: string,
  ): Readonly<OperatorAlertAcknowledgementAuditRecord> | null {
    const row = this.db.prepare(`
      SELECT
        alert_id_hex,
        delivery_receipt_digest_hex,
        acknowledgement_digest_hex,
        key_id_hex,
        registry_digest_hex,
        acknowledged_at_ms,
        nonce_hex,
        verified_at_ms
      FROM operator_alert_acknowledgements
      WHERE alert_id_hex = ?
    `).get(alertIdHex) as {
      alert_id_hex: string;
      delivery_receipt_digest_hex: string;
      acknowledgement_digest_hex: string;
      key_id_hex: string;
      registry_digest_hex: string;
      acknowledged_at_ms: number;
      nonce_hex: string;
      verified_at_ms: number;
    } | undefined;
    if (!row) return null;
    return Object.freeze({
      schema: OPERATOR_ALERT_ACKNOWLEDGEMENT_AUDIT_RECORD_SCHEMA,
      alertIdHex: row.alert_id_hex,
      deliveryReceiptDigestHex: row.delivery_receipt_digest_hex,
      acknowledgementDigestHex: row.acknowledgement_digest_hex,
      keyIdHex: row.key_id_hex,
      registryDigestHex: row.registry_digest_hex,
      acknowledgedAtMs: row.acknowledged_at_ms,
      nonceHex: row.nonce_hex,
      verifiedAtMs: row.verified_at_ms,
      auditMetadataOnly: true,
    });
  }
}
