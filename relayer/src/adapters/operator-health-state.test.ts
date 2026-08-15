import { describe, expect, it } from 'vitest';

import { StateTracker } from '../state-tracker.js';
import { createOperatorHealthPersistenceAdapter } from './operator-health-state.js';

describe('operator health persistence adapter', () => {
  it('returns only bounded aggregate state from the tracker snapshot', () => {
    const state = new StateTracker(':memory:');
    try {
      const adapter = createOperatorHealthPersistenceAdapter(state);
      expect(adapter.read()).toEqual({
        status: 'available',
        solvencyDeficitIncidentPresent: false,
        reorgQuarantineConditionCount: 0,
        activeSettlementAttemptCount: 0,
        oldestActiveSettlementUpdatedAtMs: null,
      });

      expect(state.recordPegInSolvencyDeficitIncident({
        ergoHeight: 1,
        totalSupplyNanoErg: 2n,
        totalLockedNanoErg: 1n,
      })).toBe(true);
      expect(adapter.read()).toMatchObject({
        status: 'available',
        solvencyDeficitIncidentPresent: true,
      });
    } finally {
      state.close();
    }
  });

  it('maps storage failure to a frozen bounded unavailable result', () => {
    const adapter = createOperatorHealthPersistenceAdapter({
      getOperatorHealthPersistenceState: () => {
        throw new Error('SENSITIVE_PATH_AND_DATABASE_DETAIL');
      },
    });

    const result = adapter.read();
    expect(result).toEqual({ status: 'unavailable' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(
      'SENSITIVE_PATH_AND_DATABASE_DETAIL',
    );
  });

  it('counts active settlement and quarantine conditions without exposing rows', () => {
    const state = new StateTracker(':memory:');
    try {
      const db = (state as any).db;
      db.prepare(`
        INSERT INTO aggregate_settlement_attempts (
          mode,
          expected_tx_id,
          burn_tx_hashes_json,
          status,
          updated_at
        ) VALUES ('single', ?, '[]', 'pending', ?)
      `).run('11'.repeat(32), '2026-07-31 01:02:03');
      db.prepare(`
        INSERT INTO authenticated_settlement_candidates (
          candidate_id,
          burn_id,
          burn_tx_hash,
          sidechain_id,
          sidechain_height,
          sidechain_block_hash,
          sidechain_log_index,
          tracker_key,
          tracker_value,
          tracker_box_id,
          anchor_header_id,
          anchor_header_height,
          dup_input_box_id,
          dup_input_digest,
          vault_box_id,
          unsigned_tx_digest,
          creation_height,
          observed_sidechain_tip,
          observed_ergo_tip,
          status,
          updated_at
        ) VALUES (
          ?, ?, ?, ?, '1', ?, 0, ?, ?, ?, ?, 1, ?, ?, ?, ?, 1, '1', 1,
          'prepared', ?
        )
      `).run(
        '31'.repeat(32),
        '32'.repeat(32),
        '33'.repeat(32),
        '34'.repeat(32),
        '35'.repeat(32),
        '36'.repeat(32),
        '37'.repeat(32),
        '38'.repeat(32),
        '39'.repeat(32),
        '3a'.repeat(32),
        '3b'.repeat(32),
        '3c'.repeat(32),
        '3d'.repeat(32),
        '2026-07-31 01:03:03',
      );
      db.prepare(`
        INSERT INTO authenticated_settlement_execution_reservations (
          schema,
          reservation_digest,
          candidate_id,
          candidate_authority_digest,
          burn_id,
          burn_tx_hash,
          amount_nanoerg,
          recipient_ergo_tree,
          dup_input_box_id,
          vault_box_id,
          expected_tx_id,
          unsigned_tx_digest,
          unsigned_package_digest,
          signed_transaction_digest,
          check_response_digest,
          signer_context_digest,
          checker_identity_digest,
          revalidation_digest,
          stable_ergo_view_digest,
          stable_sidechain_view_digest,
          finality_proof_digest,
          check_admission_digest,
          authorization_digest,
          status,
          updated_at
        ) VALUES (
          'operator-health-test', ?, ?, ?, ?, ?, '1', ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?
        )
      `).run(
        '41'.repeat(32),
        '31'.repeat(32),
        '42'.repeat(32),
        '32'.repeat(32),
        '33'.repeat(32),
        '43'.repeat(32),
        '3a'.repeat(32),
        '3b'.repeat(32),
        '44'.repeat(32),
        '3c'.repeat(32),
        '45'.repeat(32),
        '46'.repeat(32),
        '47'.repeat(32),
        '48'.repeat(32),
        '49'.repeat(32),
        '4a'.repeat(32),
        '4b'.repeat(32),
        '4c'.repeat(32),
        '4d'.repeat(32),
        '4e'.repeat(32),
        '4f'.repeat(32),
        '2026-07-31 01:04:03',
      );
      db.prepare(`
        INSERT INTO peg_out_events (
          sidechain_burn_tx_hash,
          burn_id,
          ergo_recipient_address,
          amount_nanoerg,
          sidechain_burn_height,
          status,
          updated_at
        ) VALUES (?, ?, 'operator-health-test', '1', 1, 'phase1_created', ?)
      `).run(
        '21'.repeat(32),
        '32'.repeat(32),
        '2026-07-31 01:05:03',
      );
      db.prepare(`
        INSERT INTO peg_out_events (
          sidechain_burn_tx_hash,
          ergo_recipient_address,
          amount_nanoerg,
          sidechain_burn_height,
          status
        ) VALUES (?, 'operator-health-test', '1', 1, 'burn_reverted')
      `).run('22'.repeat(32));

      const snapshot = createOperatorHealthPersistenceAdapter(state).read();
      expect(snapshot).toEqual({
        status: 'available',
        solvencyDeficitIncidentPresent: false,
        reorgQuarantineConditionCount: 1,
        activeSettlementAttemptCount: 2,
        oldestActiveSettlementUpdatedAtMs:
          Date.parse('2026-07-31T01:02:03.000Z'),
      });

      db.prepare(`
        UPDATE aggregate_settlement_attempts
        SET status = 'confirmed', updated_at = '2026-07-31 01:06:03'
      `).run();
      expect(createOperatorHealthPersistenceAdapter(state).read()).toMatchObject({
        status: 'available',
        activeSettlementAttemptCount: 1,
        oldestActiveSettlementUpdatedAtMs:
          Date.parse('2026-07-31T01:05:03.000Z'),
      });

      db.prepare(`
        UPDATE peg_out_events
        SET updated_at = 'not-a-timestamp'
        WHERE status = 'phase1_created'
      `).run();
      expect(createOperatorHealthPersistenceAdapter(state).read()).toEqual({
        status: 'unavailable',
      });
      db.prepare(`
        UPDATE peg_out_events
        SET updated_at = '2026-07-31 01:05:03'
        WHERE status = 'phase1_created'
      `).run();

      db.prepare(`
        INSERT INTO authenticated_settlement_submission_attempts (
          schema,
          lifecycle_version,
          execution_reservation_digest,
          transport_reservation_digest,
          durable_attempt_digest,
          candidate_id,
          expected_tx_id,
          unsigned_tx_digest,
          unsigned_package_digest,
          payout_digest,
          tracker_box_id,
          dup_input_box_id,
          signed_transaction_digest,
          pre_submit_revalidation_digest,
          broadcast_authorization_digest,
          status,
          submission_disposition,
          submitted_tx_id,
          ergo_observation_policy_version,
          ergo_observation_required_confirmations,
          ergo_observation_status,
          ergo_observation_transaction_digest,
          ergo_observation_inclusion_height,
          ergo_observation_inclusion_header_id,
          ergo_observation_tip_height,
          ergo_observation_tip_header_id,
          ergo_observation_confirmations,
          ergo_observation_digest,
          ergo_observation_source_count,
          ergo_observation_consensus_digest,
          confirmed_at,
          updated_at
        ) VALUES (
          @schema,
          1,
          @reservation,
          @transport,
          @durable,
          @candidate,
          @expectedTx,
          @unsignedTx,
          @unsignedPackage,
          @payout,
          @trackerBox,
          @dupBox,
          @signedTx,
          @revalidation,
          @authorization,
          'confirmed',
          'accepted',
          @expectedTx,
          1,
          10,
          'confirmed_final',
          @observationTx,
          1,
          @inclusionHeader,
          10,
          @tipHeader,
          10,
          @observation,
          2,
          @consensus,
          @confirmedAt,
          @confirmedAt
        )
      `).run({
        schema: 'operator-health-test',
        reservation: '41'.repeat(32),
        transport: '51'.repeat(32),
        durable: '52'.repeat(32),
        candidate: '31'.repeat(32),
        expectedTx: '44'.repeat(32),
        unsignedTx: '3c'.repeat(32),
        unsignedPackage: '45'.repeat(32),
        payout: '53'.repeat(32),
        trackerBox: '39'.repeat(32),
        dupBox: '3a'.repeat(32),
        signedTx: '46'.repeat(32),
        revalidation: '54'.repeat(32),
        authorization: '55'.repeat(32),
        observationTx: '56'.repeat(32),
        inclusionHeader: '57'.repeat(32),
        tipHeader: '58'.repeat(32),
        observation: '59'.repeat(32),
        consensus: '5a'.repeat(32),
        confirmedAt: '2026-07-31 01:06:03',
      });
      expect(createOperatorHealthPersistenceAdapter(state).read()).toEqual({
        status: 'available',
        solvencyDeficitIncidentPresent: false,
        reorgQuarantineConditionCount: 1,
        activeSettlementAttemptCount: 0,
        oldestActiveSettlementUpdatedAtMs: null,
      });
      db.prepare(`
        UPDATE authenticated_settlement_submission_attempts
        SET updated_at = '2026-07-31T01:06:03.500Z'
      `).run();
      expect(createOperatorHealthPersistenceAdapter(state).read()).toMatchObject({
        status: 'available',
        activeSettlementAttemptCount: 0,
        oldestActiveSettlementUpdatedAtMs: null,
      });
      db.prepare(`
        UPDATE authenticated_settlement_submission_attempts
        SET updated_at = 'not-a-timestamp'
      `).run();
      expect(createOperatorHealthPersistenceAdapter(state).read()).toEqual({
        status: 'unavailable',
      });
      db.prepare(`
        UPDATE authenticated_settlement_submission_attempts
        SET updated_at = '2026-07-31T01:06:03.500Z'
      `).run();

      db.prepare(`
        UPDATE authenticated_settlement_candidates
        SET status = 'invalidated',
            invalidation_reason = 'operator-health-test',
            updated_at = '2026-07-31 01:06:03'
        WHERE candidate_id = ?
      `).run('31'.repeat(32));
      db.prepare(`
        INSERT INTO authenticated_settlement_candidates (
          candidate_id,
          burn_id,
          burn_tx_hash,
          sidechain_id,
          sidechain_height,
          sidechain_block_hash,
          sidechain_log_index,
          tracker_key,
          tracker_value,
          tracker_box_id,
          anchor_header_id,
          anchor_header_height,
          dup_input_box_id,
          dup_input_digest,
          vault_box_id,
          unsigned_tx_digest,
          creation_height,
          observed_sidechain_tip,
          observed_ergo_tip,
          status,
          updated_at
        )
        SELECT
          ?,
          burn_id,
          burn_tx_hash,
          sidechain_id,
          sidechain_height,
          sidechain_block_hash,
          sidechain_log_index,
          tracker_key,
          tracker_value,
          tracker_box_id,
          anchor_header_id,
          anchor_header_height,
          ?,
          ?,
          ?,
          ?,
          creation_height,
          observed_sidechain_tip,
          observed_ergo_tip,
          'prepared',
          datetime('now', '+1 second')
        FROM authenticated_settlement_candidates
        WHERE candidate_id = ?
      `).run(
        '61'.repeat(32),
        '62'.repeat(32),
        '63'.repeat(32),
        '64'.repeat(32),
        '65'.repeat(32),
        '31'.repeat(32),
      );
      const replacementUpdatedAt = db.prepare(`
        SELECT updated_at
        FROM authenticated_settlement_candidates
        WHERE candidate_id = ?
      `).get('61'.repeat(32)).updated_at;
      expect(createOperatorHealthPersistenceAdapter(state).read()).toMatchObject({
        status: 'available',
        activeSettlementAttemptCount: 1,
        oldestActiveSettlementUpdatedAtMs:
          Date.parse(`${replacementUpdatedAt.replace(' ', 'T')}.000Z`),
      });
      db.prepare(`
        UPDATE authenticated_settlement_submission_attempts
        SET updated_at = 'not-a-timestamp'
      `).run();
      expect(createOperatorHealthPersistenceAdapter(state).read()).toEqual({
        status: 'unavailable',
      });
      db.prepare(`
        UPDATE authenticated_settlement_submission_attempts
        SET updated_at = datetime('now')
      `).run();
      expect(createOperatorHealthPersistenceAdapter(state).read()).toMatchObject({
        status: 'available',
        activeSettlementAttemptCount: 1,
        oldestActiveSettlementUpdatedAtMs:
          Date.parse(`${replacementUpdatedAt.replace(' ', 'T')}.000Z`),
      });
    } finally {
      state.close();
    }
  });

  it('fails malformed aggregate state closed without leaking its value', () => {
    const adapter = createOperatorHealthPersistenceAdapter({
      getOperatorHealthPersistenceState: () => ({
        solvencyDeficitIncidentPresent: false,
        reorgQuarantineConditionCount: -1,
        activeSettlementAttemptCount: 1,
        oldestActiveSettlementUpdatedAtMs: null,
      }),
    });

    expect(adapter.read()).toEqual({ status: 'unavailable' });
  });
});
