import { describe, expect, it } from 'vitest';

import {
  assertBroadcastAllowed,
  assertObservationOnlyDaemonBroadcastDisabled,
  assertSidechainBroadcastAllowed,
  classifyBroadcastReadiness,
} from './broadcast-policy.js';

describe('classifyBroadcastReadiness', () => {
  it('fails closed when broadcast is not explicitly enabled', () => {
    const result = classifyBroadcastReadiness({ broadcastEnabled: false });

    expect(result.status).toBe('FAIL');
    expect(result.message).toContain('disabled by default');
    expect(result.message).toContain('BRIDGE_BROADCAST_ENABLED=true');
  });

  it('passes when broadcast is explicitly enabled', () => {
    const result = classifyBroadcastReadiness({ broadcastEnabled: true });

    expect(result.status).toBe('PASS');
    expect(result.message).toContain('explicitly enabled');
  });
});

describe('assertBroadcastAllowed', () => {
  it('throws before signing or submission when broadcast is disabled', () => {
    expect(() =>
      assertBroadcastAllowed('Aggregate settlement V1', { broadcastEnabled: false }),
    ).toThrow(/refusing to broadcast Aggregate settlement V1/);
  });

  it('returns the passing check when broadcast is enabled', () => {
    const result = assertBroadcastAllowed('SCS oracle update', { broadcastEnabled: true });

    expect(result.status).toBe('PASS');
  });
});

describe('assertSidechainBroadcastAllowed', () => {
  it('throws before sidechain writes when broadcast is disabled', () => {
    expect(() =>
      assertSidechainBroadcastAllowed('Solidity deployment', { broadcastEnabled: false }),
    ).toThrow(/refusing to broadcast sidechain Solidity deployment/);
  });

  it('returns the passing check when sidechain broadcast is enabled', () => {
    const result = assertSidechainBroadcastAllowed('peg-out burn', { broadcastEnabled: true });

    expect(result.status).toBe('PASS');
  });
});

describe('assertObservationOnlyDaemonBroadcastDisabled', () => {
  it('passes when the observation-only daemon cannot broadcast', () => {
    const result = assertObservationOnlyDaemonBroadcastDisabled({
      broadcastEnabled: false,
    });

    expect(result.status).toBe('PASS');
    expect(result.message).toContain('false or unset');
    expect(result.message).toContain('no daemon broadcast route is active');
  });

  it('refuses daemon startup when the global broadcast opt-in is enabled', () => {
    expect(() =>
      assertObservationOnlyDaemonBroadcastDisabled({ broadcastEnabled: true }),
    ).toThrow(
      /observation-only daemon startup refused while BRIDGE_BROADCAST_ENABLED=true/,
    );
  });
});
