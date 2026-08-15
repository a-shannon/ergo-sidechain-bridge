import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scriptSource = readFileSync(
  new URL('./scripts/retry-failed.ts', import.meta.url),
  'utf8',
);

describe('retry-failed operator boundary', () => {
  it('does not reclassify legacy-unclassified peg-out liabilities', () => {
    expect(scriptSource).not.toMatch(/UPDATE\s+peg_out_events/i);
    expect(scriptSource).toContain("mode === '--peg-out'");
    expect(scriptSource).toMatch(
      /cannot be reset without external settlement reconstruction/i,
    );
  });
});
