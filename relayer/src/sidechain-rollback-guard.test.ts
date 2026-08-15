import { describe, expect, it } from 'vitest';

import { evaluateSidechainRollback } from './sidechain-rollback-guard.js';

describe('sidechain rollback high-water guard', () => {
  it('holds peg-outs until the sidechain recovers its previous high-water height', () => {
    let highWaterHeight = 0;
    const decisions = [200, 198, 199, 200, 201].map(currentHeight => {
      const decision = evaluateSidechainRollback(highWaterHeight, currentHeight);
      highWaterHeight = decision.highWaterHeight;
      return decision;
    });

    expect(decisions.map(decision => decision.rollbackDetected)).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
    expect(decisions.map(decision => decision.pegOutProcessingAllowed)).toEqual([
      true,
      false,
      false,
      true,
      true,
    ]);
    expect(decisions.map(decision => decision.highWaterHeight)).toEqual([
      200,
      200,
      200,
      200,
      201,
    ]);
  });

  it('rejects invalid height inputs', () => {
    expect(() => evaluateSidechainRollback(-1, 0)).toThrow(/nonnegative safe integer/);
    expect(() => evaluateSidechainRollback(0, Number.MAX_SAFE_INTEGER + 1)).toThrow(
      /nonnegative safe integer/,
    );
  });
});
