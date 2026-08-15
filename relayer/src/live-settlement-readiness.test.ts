import { describe, expect, it } from 'vitest';

import {
  assertLiveSettlementStartupReadiness,
  classifyLiveSettlementStartupReadiness,
  type LiveSettlementStartupConfig,
} from './live-settlement-readiness.js';

const config = (overrides: Partial<LiveSettlementStartupConfig> = {}): LiveSettlementStartupConfig => ({
  aggregateSettlementEnabled: false,
  aggregateBatchEnabled: false,
  aggregateBatchMaxClaims: 10,
  ...overrides,
});

describe('classifyLiveSettlementStartupReadiness', () => {
  it('warns that no automated peg-out settlement path is active when compatibility is disabled', () => {
    const result = classifyLiveSettlementStartupReadiness(config(), 4);

    expect(result.status).toBe('WARN');
    expect(result.message).toContain('no automated daemon peg-out settlement path is active');
    expect(result.message).toContain('New legacy MCU creation and daemon spend remain fail-closed');
    expect(result.message).toContain('immutable v1 UTXOs');
  });

  it('limits the enabled compatibility mode to historical confirmation and recovery', () => {
    const result = classifyLiveSettlementStartupReadiness(config({
      aggregateSettlementEnabled: true,
      aggregateBatchEnabled: true,
      aggregateBatchMaxClaims: 100,
    }), 128);

    expect(result.status).toBe('WARN');
    expect(result.message).toContain('historical confirmation and recovery only');
    expect(result.message).toContain(
      'candidate admission, signing, authorization, submission, and broadcast are absent',
    );
    expect(result.message).toContain('new burns remain held');
  });

  it('does not reinterpret a signing threshold or batch setting as submission authority', () => {
    const lowThreshold = classifyLiveSettlementStartupReadiness(config({
      aggregateSettlementEnabled: true,
      aggregateBatchEnabled: true,
      aggregateBatchMaxClaims: 1,
    }), 1);
    const highThreshold = classifyLiveSettlementStartupReadiness(config({
      aggregateSettlementEnabled: true,
      aggregateBatchEnabled: true,
      aggregateBatchMaxClaims: 10,
    }), 10_000);

    expect(lowThreshold).toEqual(highThreshold);
    expect(lowThreshold.status).toBe('WARN');
  });
});

describe('assertLiveSettlementStartupReadiness', () => {
  it.each([false, true])('returns a warning for aggregate compatibility enabled=%s', (enabled) => {
    const result = assertLiveSettlementStartupReadiness(config({
      aggregateSettlementEnabled: enabled,
    }), 4);

    expect(result.status).toBe('WARN');
  });
});
