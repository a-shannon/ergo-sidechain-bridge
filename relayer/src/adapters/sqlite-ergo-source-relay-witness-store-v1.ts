import Database from 'better-sqlite3';

import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  assertErgoSourceRelayWitnessPacketTransitionV1,
  ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_GENERATIONS,
  ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_JSON_BYTES,
  normalizeErgoSourceRelayWitnessPacketV1,
  type ErgoSourceRelayWitnessPacketStoreV1,
  type ErgoSourceRelayWitnessPacketV1,
  type StoreErgoSourceRelayWitnessPacketV1Result,
} from '../relayer-core/ergo-source-relay-witness-packet-v1.js';

interface PacketRow {
  readonly generation: number;
  readonly previous_packet_digest_hex: string | null;
  readonly packet_digest_hex: string;
  readonly packet_json: string | null;
  readonly packet_json_bytes: number | null;
  readonly packet_json_type: string;
}

/**
 * Durable storage for replayable WP-01D inputs only.
 *
 * The table deliberately contains no verification result, selected status,
 * process brand, mint admission, or funds-authority column.
 */
export class SqliteErgoSourceRelayWitnessStoreV1
  implements ErgoSourceRelayWitnessPacketStoreV1 {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ergo_source_relay_witness_packets_v1 (
        relay_id_hex TEXT NOT NULL,
        generation INTEGER NOT NULL,
        previous_packet_digest_hex TEXT,
        packet_digest_hex TEXT NOT NULL UNIQUE,
        packet_json TEXT NOT NULL,
        PRIMARY KEY (relay_id_hex, generation),
        CHECK (length(relay_id_hex) = 64),
        CHECK (
          generation > 0
          AND generation <= ${ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_GENERATIONS}
        ),
        CHECK (
          previous_packet_digest_hex IS NULL
          OR length(previous_packet_digest_hex) = 64
        ),
        CHECK (length(packet_digest_hex) = 64),
        CHECK (
          (generation = 1 AND previous_packet_digest_hex IS NULL)
          OR (generation > 1 AND previous_packet_digest_hex IS NOT NULL)
        )
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  append(
    packetValue: Readonly<ErgoSourceRelayWitnessPacketV1>,
  ): StoreErgoSourceRelayWitnessPacketV1Result {
    const packet = normalizeErgoSourceRelayWitnessPacketV1(packetValue);
    try {
      return this.db.transaction(() => {
        const latest = this.readValidatedLineage(packet.relayIdHex);
        const sameGeneration = this.readGeneration(
          packet.relayIdHex,
          packet.generation,
        );
        if (sameGeneration !== null) {
          const existing = parsePacketRow(
            sameGeneration,
            packet.relayIdHex,
          );
          return existing.packetDigestHex === packet.packetDigestHex
            && canonicalJson(existing) === canonicalJson(packet)
            ? 'deduplicated' as const
            : 'conflict' as const;
        }
        if (
          (latest === null && packet.generation !== 1)
          || (
            latest !== null
            && (
              packet.generation !== latest.generation + 1
              || packet.previousPacketDigestHex !== latest.packetDigestHex
            )
          )
        ) {
          return 'conflict' as const;
        }
        if (latest !== null) {
          try {
            assertErgoSourceRelayWitnessPacketTransitionV1(latest, packet);
          } catch {
            return 'conflict' as const;
          }
        }
        const result = this.db.prepare(`
          INSERT INTO ergo_source_relay_witness_packets_v1 (
            relay_id_hex,
            generation,
            previous_packet_digest_hex,
            packet_digest_hex,
            packet_json
          ) VALUES (?, ?, ?, ?, ?)
        `).run(
          packet.relayIdHex,
          packet.generation,
          packet.previousPacketDigestHex,
          packet.packetDigestHex,
          canonicalJson(packet),
        );
        return result.changes === 1 ? 'stored' as const : 'unavailable' as const;
      })();
    } catch {
      return 'unavailable';
    }
  }

  readLatest(relayIdHexValue: string): ReturnType<
    ErgoSourceRelayWitnessPacketStoreV1['readLatest']
  > {
    try {
      const relayIdHex = fixedH256(relayIdHexValue, 'Ergo source relay ID');
      const latest = this.readValidatedLineage(relayIdHex);
      return Object.freeze({
        status: 'available' as const,
        packet: latest,
      });
    } catch {
      return Object.freeze({ status: 'unavailable' as const });
    }
  }

  private readGeneration(relayIdHex: string, generation: number): PacketRow | null {
    const row = this.db.prepare(`
      SELECT
        generation,
        previous_packet_digest_hex,
        packet_digest_hex,
        CASE
          WHEN typeof(packet_json) = 'text'
            AND length(CAST(packet_json AS BLOB)) <= ?
          THEN packet_json
          ELSE NULL
        END AS packet_json,
        length(CAST(packet_json AS BLOB)) AS packet_json_bytes,
        typeof(packet_json) AS packet_json_type
      FROM ergo_source_relay_witness_packets_v1
      WHERE relay_id_hex = ? AND generation = ?
    `).get(
      ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_JSON_BYTES,
      relayIdHex,
      generation,
    ) as PacketRow | undefined;
    return row ?? null;
  }

  private readValidatedLineage(
    relayIdHex: string,
  ): Readonly<ErgoSourceRelayWitnessPacketV1> | null {
    const rows = this.db.prepare(`
      SELECT
        generation,
        previous_packet_digest_hex,
        packet_digest_hex,
        CASE
          WHEN typeof(packet_json) = 'text'
            AND length(CAST(packet_json AS BLOB)) <= ?
          THEN packet_json
          ELSE NULL
        END AS packet_json,
        length(CAST(packet_json AS BLOB)) AS packet_json_bytes,
        typeof(packet_json) AS packet_json_type
      FROM ergo_source_relay_witness_packets_v1
      WHERE relay_id_hex = ?
      ORDER BY generation ASC
      LIMIT ?
    `).iterate(
      ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_JSON_BYTES,
      relayIdHex,
      ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_GENERATIONS + 1,
    ) as IterableIterator<PacketRow>;
    let previous: Readonly<ErgoSourceRelayWitnessPacketV1> | null = null;
    let count = 0;
    for (const row of rows) {
      count += 1;
      if (count > ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_GENERATIONS) {
        throw new Error('Ergo source relay lineage exceeds its generation bound');
      }
      if (
        row.generation !== count
        || row.previous_packet_digest_hex !== (previous?.packetDigestHex ?? null)
      ) {
        throw new Error('Ergo source relay stored lineage is not contiguous');
      }
      const packet = parsePacketRow(row, relayIdHex);
      if (previous !== null) {
        assertErgoSourceRelayWitnessPacketTransitionV1(previous, packet);
      }
      previous = packet;
    }
    return previous;
  }
}

function parsePacketRow(
  row: PacketRow,
  relayIdHex: string,
): Readonly<ErgoSourceRelayWitnessPacketV1> {
  if (
    row.packet_json_type !== 'text'
    || typeof row.packet_json_bytes !== 'number'
    || !Number.isSafeInteger(row.packet_json_bytes)
    || row.packet_json_bytes < 0
    || row.packet_json_bytes > ERGO_SOURCE_RELAY_WITNESS_PACKET_V1_MAX_JSON_BYTES
    || typeof row.packet_json !== 'string'
    || Buffer.byteLength(row.packet_json, 'utf8')
      !== row.packet_json_bytes
  ) {
    throw new Error('stored Ergo source relay witness packet JSON is invalid');
  }
  const parsed = JSON.parse(row.packet_json) as unknown;
  if (canonicalJson(parsed) !== row.packet_json) {
    throw new Error('stored Ergo source relay witness packet JSON is not canonical');
  }
  const packet = normalizeErgoSourceRelayWitnessPacketV1(parsed);
  if (
    packet.relayIdHex !== relayIdHex
    || packet.generation !== row.generation
    || packet.previousPacketDigestHex !== row.previous_packet_digest_hex
    || packet.packetDigestHex !== row.packet_digest_hex
  ) {
    throw new Error('stored Ergo source relay witness packet columns drifted');
  }
  return packet;
}

function fixedH256(value: string, label: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be 32 bytes of lowercase hex`);
  }
  return value;
}
