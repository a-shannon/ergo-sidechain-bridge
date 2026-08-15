import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildBridgeDaemonOperatorHealth,
  createBridgeDaemonOperatorHealthPolicy,
  operatorHealthStateFingerprint,
} from './operator-health.js';

const NOW = 3_000_000;
const SANITIZATION_SENTINEL = 'PRIVATE_ORIGIN_OR_AUTHORITY_SENTINEL';

function input() {
  return {
    observedAtMs: NOW,
    policy: createBridgeDaemonOperatorHealthPolicy({
      pollingIntervalMs: 10_000,
      ergoReadQuorumMaxAgeMs: 30_000,
      commitmentMaxLagBlocks: 2,
      finalityMaxLagBlocks: 50,
    }),
    state: {
      getOperatorHealthPersistenceState: () => ({
        solvencyDeficitIncidentPresent: false,
        reorgQuarantineConditionCount: 0,
        activeSettlementAttemptCount: 0,
        oldestActiveSettlementUpdatedAtMs: null,
      }),
    },
    signerAvailability: 'not_configured' as const,
    readQuorumSnapshot: {
      schema: 'e2s.ergo-read-quorum-snapshot.v1' as const,
      state: 'closed' as const,
      fundsReleaseHeld: false,
      activeGeneration: 42,
      consecutiveFailures: 0,
      reason: null,
      lastFailureCode: null,
      lastAcceptedObservation: {
        sourceIdsHex: [
          SANITIZATION_SENTINEL.padEnd(64, '0'),
          SANITIZATION_SENTINEL.padEnd(64, '1'),
        ] as readonly [string, string],
        tipHeight: 1_000,
        tipHeaderIdHex: SANITIZATION_SENTINEL,
        observationDigestHex: SANITIZATION_SENTINEL,
        completedAtMs: NOW - 1_000,
      },
    },
    processFundsReleaseHoldOpen: false,
    circuitBreaker: {
      open: false,
      incidentCount: 0,
      continuityStatus: 'established' as const,
      externalContinuityWitnessCurrent: true,
      retainedExecutionAuthority: false,
      stateDigestHex: SANITIZATION_SENTINEL,
    },
    solvency: {
      state: 'clear' as const,
      observedAtMs: NOW - 10_000,
    },
    commitment: {
      configured: true,
      ready: true,
      observedAtMs: NOW - 2_000,
      observedErgoHeight: 999,
      currentErgoHeight: 1_000,
    },
    finality: {
      observedAtMs: NOW - 2_000,
      finalizedSidechainHeight: 700,
      currentSidechainHeight: 701,
    },
    pegInReorgReconciliationPending: false,
  };
}

describe('bridge daemon operator health composition', () => {
  it('projects only sanitized bounded fields from richer runtime state', () => {
    const projection = buildBridgeDaemonOperatorHealth(input());
    const serialized = JSON.stringify(projection);

    expect(projection.overall).toBe('healthy');
    expect(projection.schema).toBe('e2s.operator-health-projection.v3');
    expect(projection.signals.signer).toEqual({
      status: 'not_applicable',
      availability: 'not_configured',
    });
    expect(serialized).not.toContain(SANITIZATION_SENTINEL);
    expect(serialized).not.toMatch(/sourceIdsHex|tipHeaderIdHex|stateDigestHex/);
    expect(serialized).not.toMatch(/origin|credential|apiKey|privateKey/i);
  });

  it('turns persistence exceptions into held status without raw error data', () => {
    const value = input();
    const projection = buildBridgeDaemonOperatorHealth({
      ...value,
      state: {
        getOperatorHealthPersistenceState: () => {
          throw new Error(SANITIZATION_SENTINEL);
        },
      },
    });

    expect(projection.overall).toBe('held');
    expect(projection.reasons).toContain('persistence_unavailable');
    expect(JSON.stringify(projection)).not.toContain(SANITIZATION_SENTINEL);
  });

  it('holds on unavailable signer state without exposing implementation detail', () => {
    const value = input();
    const projection = buildBridgeDaemonOperatorHealth({
      ...value,
      signerAvailability: 'unavailable',
    });

    expect(projection.overall).toBe('held');
    expect(projection.reasons).toContain('signer_unavailable');
    expect(projection.signals.signer).toEqual({
      status: 'held',
      availability: 'unavailable',
    });
    expect(JSON.stringify(projection)).not.toContain(SANITIZATION_SENTINEL);
  });

  it('derives bounded versioned freshness windows from polling policy', () => {
    expect(createBridgeDaemonOperatorHealthPolicy({
      pollingIntervalMs: 10_000,
      ergoReadQuorumMaxAgeMs: 30_000,
      commitmentMaxLagBlocks: 2,
      finalityMaxLagBlocks: 50,
    })).toEqual({
      schema: 'e2s.operator-health-policy.v1',
      readQuorumMaxAgeMs: 30_000,
      commitmentMaxAgeMs: 60_000,
      commitmentMaxLagBlocks: 2,
      finalityMaxAgeMs: 60_000,
      finalityMaxLagBlocks: 50,
      solvencyMaxAgeMs: 600_000,
      stalledSettlementAgeMs: 1_200_000,
    });
  });

  it('deduplicates age-only changes while retaining health state changes', () => {
    const first = buildBridgeDaemonOperatorHealth(input());
    const laterInput = input();
    const later = buildBridgeDaemonOperatorHealth({
      ...laterInput,
      observedAtMs: NOW + 1_000,
    });

    expect(first.signals.readQuorum.ageMs).not.toBe(
      later.signals.readQuorum.ageMs,
    );
    expect(operatorHealthStateFingerprint(first)).toBe(
      operatorHealthStateFingerprint(later),
    );

    const heldInput = input();
    const held = buildBridgeDaemonOperatorHealth({
      ...heldInput,
      processFundsReleaseHoldOpen: true,
    });
    expect(operatorHealthStateFingerprint(first)).not.toBe(
      operatorHealthStateFingerprint(held),
    );
  });

  it('keeps the composition root free of value-bearing capabilities', () => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'apps', 'bridge-daemon', 'operator-health.ts'),
      'utf8',
    );
    expect(source).not.toMatch(
      /\b(?:loadSigner|runSigner|checker|submit|broadcast|authorize|privateKey|mnemonic)\b/i,
    );
    expect(source).not.toContain("from '../../fleet-signer.js'");
    expect(source).not.toMatch(/\b(?:fetch|WebSocket|Database|process\.env)\b/);
  });
});
