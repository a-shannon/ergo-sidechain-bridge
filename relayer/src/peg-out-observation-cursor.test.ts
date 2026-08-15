import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  persistPegOutObservationCursor,
} from './relayer-core/peg-out-observation-cursor.js';
import { StateTracker } from './state-tracker.js';

describe('peg-out observation cursor persistence', () => {
  it('advances only after a complete scan and survives restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-peg-out-cursor-'));
    const dbPath = join(dir, 'state.sqlite');
    try {
      const state = new StateTracker(dbPath);
      state.updateSyncState({ ergoHeight: 100, sidechainHeight: 200 });

      for (const [label, observedSidechainHeight] of [
        ['RPC failure', 210],
        ['ambiguous event', 211],
        ['rollback skip', 190],
        ['operational quarantine', 212],
      ] as const) {
        expect(
          persistPegOutObservationCursor(state, {
            ergoHeight: 101,
            observedSidechainHeight,
            observationComplete: false,
          }),
          label,
        ).toBe(200);
        expect(state.getSyncState().latestSidechainHeight, label).toBe(200);
      }

      expect(persistPegOutObservationCursor(state, {
        ergoHeight: 102,
        observedSidechainHeight: 215,
        observationComplete: true,
      })).toBe(215);
      expect(persistPegOutObservationCursor(state, {
        ergoHeight: 103,
        observedSidechainHeight: 205,
        observationComplete: true,
      })).toBe(215);
      state.close();

      const reopened = new StateTracker(dbPath);
      expect(reopened.getSyncState()).toMatchObject({
        latestErgoHeight: 103,
        latestSidechainHeight: 215,
      });
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects invalid heights before mutating persistence', () => {
    const state = new StateTracker(':memory:');
    state.updateSyncState({ ergoHeight: 10, sidechainHeight: 20 });
    expect(() => persistPegOutObservationCursor(state, {
      ergoHeight: 11,
      observedSidechainHeight: Number.NaN,
      observationComplete: true,
    })).toThrow(/observed sidechain height/);
    expect(state.getSyncState()).toMatchObject({
      latestErgoHeight: 10,
      latestSidechainHeight: 20,
    });
    state.close();
  });
});
