import Database from 'better-sqlite3';

import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  normalizeNonnegativeSafeInteger,
} from '../relayer-core/operator-alert-delivery-state.js';
import {
  normalizeOperatorAlertExternalOutboxItem,
  type OperatorAlertExternalOutboxItem,
  type OperatorAlertExternalOutboxPort,
} from '../relayer-core/operator-alert-external-outbox.js';
interface OutboxRow {
  readonly item_json: string;
}

export class SqliteOperatorAlertExternalOutbox
  implements OperatorAlertExternalOutboxPort {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operator_alert_external_outbox (
        alert_id_hex TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        profile_version INTEGER NOT NULL,
        event_digest_hex TEXT NOT NULL,
        item_json TEXT NOT NULL,
        status TEXT NOT NULL,
        revision INTEGER NOT NULL,
        attempt_count INTEGER NOT NULL,
        claimed_at_ms INTEGER,
        lease_expires_at_ms INTEGER,
        next_attempt_at_ms INTEGER,
        delivered_at_ms INTEGER,
        delivery_receipt_digest_hex TEXT,
        last_failure_code TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        CHECK (length(alert_id_hex) = 64),
        CHECK (length(event_digest_hex) = 64),
        CHECK (profile_version = 1),
        CHECK (status IN ('pending', 'delivering', 'retry_wait', 'delivered')),
        CHECK (revision > 0),
        CHECK (attempt_count >= 0),
        CHECK (created_at_ms >= 0),
        CHECK (updated_at_ms >= created_at_ms),
        CHECK (
          delivery_receipt_digest_hex IS NULL
          OR length(delivery_receipt_digest_hex) = 64
        )
      );

      CREATE INDEX IF NOT EXISTS operator_alert_external_outbox_due
      ON operator_alert_external_outbox (
        status,
        next_attempt_at_ms,
        lease_expires_at_ms,
        created_at_ms,
        alert_id_hex
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  enqueue(itemValue: OperatorAlertExternalOutboxItem):
    | 'stored'
    | 'deduplicated'
    | 'conflict'
    | 'unavailable' {
    try {
      const item = normalizeOperatorAlertExternalOutboxItem(itemValue);
      const result = this.db.prepare(`
        INSERT OR IGNORE INTO operator_alert_external_outbox (
          alert_id_hex,
          profile_id,
          profile_version,
          event_digest_hex,
          item_json,
          status,
          revision,
          attempt_count,
          claimed_at_ms,
          lease_expires_at_ms,
          next_attempt_at_ms,
          delivered_at_ms,
          delivery_receipt_digest_hex,
          last_failure_code,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...itemValues(item));
      if (result.changes === 1) return 'stored';
      const existing = this.readByAlertId(item.alertIdHex);
      return existing !== null
        && existing.alertIdHex === item.alertIdHex
        && existing.eventDigestHex === item.eventDigestHex
        && canonicalJson(existing.event) === canonicalJson(item.event)
        ? 'deduplicated'
        : 'conflict';
    } catch {
      return 'unavailable';
    }
  }

  readNext(nowMsValue: number): ReturnType<
    OperatorAlertExternalOutboxPort['readNext']
  > {
    try {
      normalizeNonnegativeSafeInteger(
        nowMsValue,
        'operator alert external outbox read time',
      );
      const rows = this.db.prepare(`
        SELECT item_json
        FROM operator_alert_external_outbox
        WHERE status != 'delivered'
        ORDER BY created_at_ms ASC, alert_id_hex ASC
      `).all() as OutboxRow[];
      const items = rows.map(row => parseOutboxItem(row.item_json));
      const outstandingIds = new Set(items.map(item => item.alertIdHex));
      const next = items.find(item =>
        item.event.previousAlertIdHex === null
        || !outstandingIds.has(item.event.previousAlertIdHex));
      if (items.length > 0 && next === undefined) {
        throw new Error('operator alert external outbox dependency cycle');
      }
      return Object.freeze({
        status: 'available' as const,
        item: next ?? null,
      });
    } catch {
      return Object.freeze({ status: 'unavailable' as const });
    }
  }

  compareAndSet(input: Readonly<{
    expectedRevision: number;
    next: OperatorAlertExternalOutboxItem;
  }>): 'stored' | 'conflict' | 'unavailable' {
    try {
      const expectedRevision = normalizeNonnegativeSafeInteger(
        input.expectedRevision,
        'operator alert external outbox expected revision',
      );
      const next = normalizeOperatorAlertExternalOutboxItem(input.next);
      if (expectedRevision === 0 || next.revision !== expectedRevision + 1) {
        throw new Error('operator alert external outbox revision is not monotonic');
      }
      const current = this.readByAlertId(next.alertIdHex);
      if (current === null || !sameImmutableEvent(current, next)) {
        return 'conflict';
      }
      const result = this.db.prepare(`
        UPDATE operator_alert_external_outbox SET
          item_json = ?,
          status = ?,
          revision = ?,
          attempt_count = ?,
          claimed_at_ms = ?,
          lease_expires_at_ms = ?,
          next_attempt_at_ms = ?,
          delivered_at_ms = ?,
          delivery_receipt_digest_hex = ?,
          last_failure_code = ?,
          updated_at_ms = ?
        WHERE alert_id_hex = ? AND revision = ?
      `).run(
        canonicalJson(next),
        next.status,
        next.revision,
        next.attemptCount,
        next.claimedAtMs,
        next.leaseExpiresAtMs,
        next.nextAttemptAtMs,
        next.deliveredAtMs,
        next.deliveryReceiptDigestHex,
        next.lastFailureCode,
        next.updatedAtMs,
        next.alertIdHex,
        expectedRevision,
      );
      return result.changes === 1 ? 'stored' : 'conflict';
    } catch {
      return 'unavailable';
    }
  }

  get(alertIdHex: string): OperatorAlertExternalOutboxItem | null {
    return this.readByAlertId(alertIdHex);
  }

  private readByAlertId(
    alertIdHex: string,
  ): OperatorAlertExternalOutboxItem | null {
    if (!/^[0-9a-f]{64}$/.test(alertIdHex)) {
      throw new Error('operator alert external outbox id is invalid');
    }
    const row = this.db.prepare(`
      SELECT item_json
      FROM operator_alert_external_outbox
      WHERE alert_id_hex = ?
    `).get(alertIdHex) as OutboxRow | undefined;
    return row === undefined ? null : parseOutboxItem(row.item_json);
  }
}

function itemValues(item: OperatorAlertExternalOutboxItem): readonly unknown[] {
  return [
    item.alertIdHex,
    item.profileId,
    item.profileVersion,
    item.eventDigestHex,
    canonicalJson(item),
    item.status,
    item.revision,
    item.attemptCount,
    item.claimedAtMs,
    item.leaseExpiresAtMs,
    item.nextAttemptAtMs,
    item.deliveredAtMs,
    item.deliveryReceiptDigestHex,
    item.lastFailureCode,
    item.createdAtMs,
    item.updatedAtMs,
  ] as const;
}

function parseOutboxItem(value: string): OperatorAlertExternalOutboxItem {
  const parsed = JSON.parse(value) as OperatorAlertExternalOutboxItem;
  if (canonicalJson(parsed) !== value) {
    throw new Error('operator alert external outbox JSON is not canonical');
  }
  return normalizeOperatorAlertExternalOutboxItem(parsed);
}

function sameImmutableEvent(
  current: OperatorAlertExternalOutboxItem,
  next: OperatorAlertExternalOutboxItem,
): boolean {
  return current.alertIdHex === next.alertIdHex
    && current.profileId === next.profileId
    && current.profileVersion === next.profileVersion
    && current.eventDigestHex === next.eventDigestHex
    && current.createdAtMs === next.createdAtMs
    && canonicalJson(current.event) === canonicalJson(next.event);
}
