import { createHash } from 'node:crypto';

import { ensureSizeBit } from '../ergo-settlement-core/ergo-encoding.js';
import {
  LEGACY_SPV_TRACKER_ERGO_TREE_SHA256_HEX,
  LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE,
  STORAGE_RENT_SURFACE_INVENTORY,
} from '../ergo-settlement-core/storage-rent-maintenance.js';

export interface StorageRentSurfaceTreeBinding {
  surfaceId: string;
  observedErgoTreeHex: unknown;
  configuredErgoTreeHex: unknown;
}

export function assertStorageRentSurfaceTree(
  input: StorageRentSurfaceTreeBinding,
): void {
  if (!STORAGE_RENT_SURFACE_INVENTORY.some(
    surface => surface.surfaceId === input.surfaceId,
  )) {
    throw new Error(`unknown storage-rent surface: ${input.surfaceId}`);
  }
  const observed = canonicalErgoTree(
    input.observedErgoTreeHex,
    'observed ErgoTree',
  );
  const configured = canonicalErgoTree(
    input.configuredErgoTreeHex,
    'configured ErgoTree',
  );
  const configuredOnChain = ensureSizeBit(configured).toLowerCase();
  if (observed !== configured && observed !== configuredOnChain) {
    throw new Error('observed storage-rent box does not match the configured ErgoTree');
  }
  if (input.surfaceId === LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE) {
    const configuredDigest = createHash('sha256')
      .update(Buffer.from(configured, 'hex'))
      .digest('hex');
    if (configuredDigest !== LEGACY_SPV_TRACKER_ERGO_TREE_SHA256_HEX) {
      throw new Error(
        'configured legacy SPV tracker does not match the reviewed no-ingest ErgoTree',
      );
    }
  }
}

function canonicalErgoTree(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  const normalized = value.trim().replace(/^0x/i, '').toLowerCase();
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return normalized;
}
