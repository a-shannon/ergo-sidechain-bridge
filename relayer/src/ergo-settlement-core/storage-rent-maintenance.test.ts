import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ERGO_STORAGE_PERIOD_BLOCKS,
  LEGACY_SPV_TRACKER_SOURCE_SHA256_HEX,
  LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE,
  STORAGE_RENT_SURFACE_INVENTORY,
  projectStorageRent,
  serializedBoxSizeBytesFromHex,
} from './storage-rent-maintenance.js';

const STORAGE_FEE_FACTOR = 1_250_000n;

describe('storage-rent surface inventory', () => {
  it('classifies every tracked ErgoScript contract exactly once', () => {
    const contractFiles = readdirSync(join(process.cwd(), '..', 'contracts'))
      .filter(file => file.endsWith('.es'))
      .sort();
    const inventoryFiles = STORAGE_RENT_SURFACE_INVENTORY
      .map(surface => surface.contractFile)
      .sort();

    expect(new Set(inventoryFiles).size).toBe(inventoryFiles.length);
    expect(inventoryFiles).toEqual(contractFiles);
  });

  it('allows a neutral successor only for the legacy SPV tracker profile', () => {
    const eligible = STORAGE_RENT_SURFACE_INVENTORY.filter(
      surface => surface.neutralMaintenanceEligible,
    );
    expect(eligible).toEqual([
      expect.objectContaining({
        surfaceId: LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE,
        contractFile: 'SPVTracker.es',
        refreshMode: 'neutral-successor',
      }),
    ]);
  });

  it('binds the neutral profile to the exact reviewed contract source', () => {
    const source = readFileSync(
      join(process.cwd(), '..', 'contracts', 'SPVTracker.es'),
    );
    expect(source.includes(0x0d)).toBe(false);
    expect(createHash('sha256').update(source).digest('hex'))
      .toBe(LEGACY_SPV_TRACKER_SOURCE_SHA256_HEX);
  });

  it('classifies replay, source-lock, vault, and proof trackers as semantic or value transitions', () => {
    expect(STORAGE_RENT_SURFACE_INVENTORY).toEqual(expect.arrayContaining([
      expect.objectContaining({
        contractFile: 'DoubleUnlockPrevention.es',
        refreshMode: 'semantic-transition-only',
      }),
      expect.objectContaining({
        contractFile: 'SideChainState.es',
        refreshMode: 'semantic-transition-only',
      }),
      expect.objectContaining({
        contractFile: 'MainChainLock.es',
        refreshMode: 'value-transition-only',
      }),
      expect.objectContaining({
        contractFile: 'MainChainPooledReserveValidityApplicationV4.es',
        refreshMode: 'value-transition-only',
      }),
      expect.objectContaining({
        contractFile: 'SPVTrackerPooledReserveBurnSettlementV5.es',
        refreshMode: 'semantic-transition-only',
      }),
      expect.objectContaining({
        contractFile: 'DoubleUnlockPreventionPooledReserveV5.es',
        refreshMode: 'semantic-transition-only',
      }),
      expect.objectContaining({
        contractFile: 'MainChainLockPooledReserveV5.es',
        refreshMode: 'value-transition-only',
      }),
      expect.objectContaining({
        contractFile: 'MainChainPooledReserveValidityApplicationV5.es',
        refreshMode: 'value-transition-only',
      }),
      expect.objectContaining({
        contractFile: 'SPVTrackerSubstrateFederatedV1.es',
        refreshMode: 'semantic-transition-only',
      }),
      expect.objectContaining({
        contractFile: 'DoubleUnlockPreventionSubstrateFederatedV1.es',
        refreshMode: 'semantic-transition-only',
      }),
      expect.objectContaining({
        contractFile: 'MainChainLockPooledReserveV6.es',
        refreshMode: 'value-transition-only',
      }),
      expect.objectContaining({
        contractFile: 'MainChainPooledReserveValidityApplicationV6.es',
        refreshMode: 'value-transition-only',
      }),
    ]));
  });
});

describe('storage-rent projection', () => {
  it('uses canonical serialized bytes and an explicitly observed fee factor', () => {
    const report = projectStorageRent({
      surfaceId: LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE,
      currentHeight: ERGO_STORAGE_PERIOD_BLOCKS - 1,
      creationHeight: 0,
      serializedSizeBytes: 105,
      valueNanoErg: 200_000_000,
      storageFeeFactorNanoErgPerByte: STORAGE_FEE_FACTOR,
      parameterObservedAtHeight: ERGO_STORAGE_PERIOD_BLOCKS - 1,
      parameterSourceId: 'fixture.parameters.v1',
    });

    expect(report).toMatchObject({
      ageBlocks: ERGO_STORAGE_PERIOD_BLOCKS - 1,
      blocksUntilRentEligible: 1,
      projectedStorageFeeNanoErg: '131250000',
      retainedValueAfterRentNanoErg: '68750000',
      feeCovered: true,
      ageRisk: 'refresh_due',
    });
    expect(serializedBoxSizeBytesFromHex(`0x${'ab'.repeat(105)}`)).toBe(105);
  });

  it('treats the eligibility boundary as inclusive', () => {
    const report = projectStorageRent({
      surfaceId: LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE,
      currentHeight: ERGO_STORAGE_PERIOD_BLOCKS,
      creationHeight: 0,
      serializedSizeBytes: 105,
      valueNanoErg: 200_000_000,
      storageFeeFactorNanoErgPerByte: STORAGE_FEE_FACTOR,
      parameterObservedAtHeight: ERGO_STORAGE_PERIOD_BLOCKS,
      parameterSourceId: 'fixture.parameters.v1',
    });
    expect(report.ageRisk).toBe('rent_eligible');
    expect(report.blocksUntilRentEligible).toBe(0);
  });

  it('treats value equal to the projected charge as not fee-covered', () => {
    const report = projectStorageRent({
      surfaceId: 'double-unlock-prevention-v1',
      currentHeight: 1,
      creationHeight: 0,
      serializedSizeBytes: 105,
      valueNanoErg: 131_250_000,
      storageFeeFactorNanoErgPerByte: STORAGE_FEE_FACTOR,
      parameterObservedAtHeight: 1,
      parameterSourceId: 'fixture.parameters.v1',
    });
    expect(report.feeCovered).toBe(false);
    expect(report.retainedValueAfterRentNanoErg).toBe('0');
    expect(report.ageRisk).toBe('refresh_due');
  });

  it('rejects unknown surfaces, future observations, and malformed serialized bytes', () => {
    const base = {
      currentHeight: 100,
      creationHeight: 0,
      serializedSizeBytes: 105,
      valueNanoErg: 200_000_000,
      storageFeeFactorNanoErgPerByte: STORAGE_FEE_FACTOR,
      parameterObservedAtHeight: 100,
      parameterSourceId: 'fixture.parameters.v1',
    };
    expect(() => projectStorageRent({ ...base, surfaceId: 'unknown' }))
      .toThrow(/unknown storage-rent surface/i);
    expect(() => projectStorageRent({
      ...base,
      surfaceId: LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE,
      parameterObservedAtHeight: 101,
    })).toThrow(/must not be in the future/i);
    expect(() => serializedBoxSizeBytesFromHex('abc')).toThrow(/even-length hex/i);
  });
});
