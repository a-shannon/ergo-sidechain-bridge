import { describe, expect, it } from 'vitest';

import {
  LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE,
} from '../ergo-settlement-core/storage-rent-maintenance.js';
import { assertStorageRentSurfaceTree } from './ergo-storage-rent-surface.js';

describe('storage-rent surface tree binding adapter', () => {
  it('accepts an exact configured tree and its canonical size-bit encoding', () => {
    expect(() => assertStorageRentSurfaceTree({
      surfaceId: 'side-chain-state-v1',
      observedErgoTreeHex: '01aa',
      configuredErgoTreeHex: '01aa',
    })).not.toThrow();
    expect(() => assertStorageRentSurfaceTree({
      surfaceId: 'side-chain-state-v1',
      observedErgoTreeHex: '0901aa',
      configuredErgoTreeHex: '01aa',
    })).not.toThrow();
  });

  it('rejects tree, role, format, and reviewed legacy-profile drift', () => {
    expect(() => assertStorageRentSurfaceTree({
      surfaceId: 'side-chain-state-v1',
      observedErgoTreeHex: '01aa',
      configuredErgoTreeHex: '01bb',
    })).toThrow(/does not match/i);
    expect(() => assertStorageRentSurfaceTree({
      surfaceId: 'unknown',
      observedErgoTreeHex: '01aa',
      configuredErgoTreeHex: '01aa',
    })).toThrow(/unknown storage-rent surface/i);
    expect(() => assertStorageRentSurfaceTree({
      surfaceId: 'side-chain-state-v1',
      observedErgoTreeHex: 'not-hex',
      configuredErgoTreeHex: '01aa',
    })).toThrow(/even-length hex/i);
    expect(() => assertStorageRentSurfaceTree({
      surfaceId: LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE,
      observedErgoTreeHex: '00',
      configuredErgoTreeHex: '00',
    })).toThrow(/reviewed no-ingest ErgoTree/i);
  });
});
