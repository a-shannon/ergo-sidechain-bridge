import { describe, expect, it } from 'vitest';

import {
  bridgeEventRootPlaceholder,
  bridgeEventRootsFromClaims,
  concreteBridgeEventRootsFromClaims,
  extractBridgeEventRootHexes,
  formatBridgeEventRootCsv,
  formatBridgeEventRootCsvOrPlaceholder,
  normalizeBridgeEventRootHex,
  sameOrderedBridgeEventRoots,
} from './bridge-event-root-evidence.js';

const ROOT_A = 'Aa'.repeat(32);
const ROOT_B = 'Bb'.repeat(32);

describe('bridge event root evidence helpers', () => {
  it('normalizes concrete 32-byte bridge event roots', () => {
    expect(normalizeBridgeEventRootHex(ROOT_A)).toBe('aa'.repeat(32));
    expect(normalizeBridgeEventRootHex(`0x${ROOT_B}`)).toBe('bb'.repeat(32));
    expect(normalizeBridgeEventRootHex('not-a-root')).toBeUndefined();
    expect(normalizeBridgeEventRootHex(undefined)).toBeUndefined();
  });

  it('extracts ordered bridge event roots from evidence text', () => {
    expect(
      extractBridgeEventRootHexes(
        `Bridge event roots: ${ROOT_A}, 0x${ROOT_B} artifact://dry-run/bridge-event-roots.log`,
      ),
    ).toEqual(['aa'.repeat(32), 'bb'.repeat(32)]);
  });

  it('formats ordered bridge event root lists canonically', () => {
    expect(formatBridgeEventRootCsv([ROOT_A, ROOT_B])).toBe(`${'aa'.repeat(32)},${'bb'.repeat(32)}`);
    expect(formatBridgeEventRootCsvOrPlaceholder([])).toBe(bridgeEventRootPlaceholder);
  });

  it('maps claim roots without losing positional placeholders', () => {
    expect(bridgeEventRootsFromClaims([
      { bridgeEventRootHex: ROOT_A },
      {},
      { bridgeEventRootHex: ROOT_B },
    ])).toEqual(['aa'.repeat(32), bridgeEventRootPlaceholder, 'bb'.repeat(32)]);
    expect(concreteBridgeEventRootsFromClaims([
      { bridgeEventRootHex: ROOT_A },
      {},
      { bridgeEventRootHex: ROOT_B },
    ])).toEqual(['aa'.repeat(32), 'bb'.repeat(32)]);
  });

  it('compares ordered roots after normalization', () => {
    expect(sameOrderedBridgeEventRoots([ROOT_A, ROOT_B], [`0x${ROOT_A}`, ROOT_B])).toBe(true);
    expect(sameOrderedBridgeEventRoots([ROOT_B, ROOT_A], [ROOT_A, ROOT_B])).toBe(false);
    expect(sameOrderedBridgeEventRoots([bridgeEventRootPlaceholder], [bridgeEventRootPlaceholder])).toBe(false);
    expect(sameOrderedBridgeEventRoots([ROOT_A], undefined)).toBe(false);
  });
});
