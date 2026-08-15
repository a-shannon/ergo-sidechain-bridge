import {
  resolveAggregateRecipientErgoTree,
} from './aggregate-settlement-service.js';
import { deriveAggregateBurnEventRoot } from './aggregate-settlement-tx.js';
import type { ErgoExtensionField } from './ergo-client.js';
import type { ParsedPegOut } from './sidechain-client.js';
import { findSidechainAnchorFields } from './spv-anchor.js';
import type { SpvTrackerEntry } from './spv-tracker.js';

export interface AggregateAnchorDeps {
  addressToTree(address: string): Promise<string>;
  getSidechainBlockHash(blockNumber: number): Promise<string>;
  getSidechainExtensionFieldsAtHeight(height: number): Promise<ErgoExtensionField[]>;
}

export interface DeriveAnchoredTrackerIngestInput {
  pegOut: ParsedPegOut;
  sidechainIdHex: string;
  ergoAnchorHeight: number;
  deps: AggregateAnchorDeps;
}

export interface FindStableAnchorHeightInput {
  pegOut: ParsedPegOut;
  sidechainIdHex: string;
  /** Lowest height in the search window (inclusive). */
  minHeight: number;
  /** Highest height in the search window (inclusive). */
  maxHeight: number;
  deps: AggregateAnchorDeps;
}

function normalizeHex(hex: string, expectedBytes: number, label: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be hex`);
  }
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${clean.length / 2}`);
  }
  return clean.toLowerCase();
}

function isValidAnchorHeight(height: number): boolean {
  return Number.isSafeInteger(height) && height >= 0;
}

function validateAnchorHeight(height: number, label = 'ergoAnchorHeight'): void {
  if (!isValidAnchorHeight(height)) {
    throw new Error(`${label} must be a non-negative safe integer, got ${height}`);
  }
}

export async function deriveAnchoredTrackerIngest(
  input: DeriveAnchoredTrackerIngestInput,
): Promise<SpvTrackerEntry> {
  validateAnchorHeight(input.ergoAnchorHeight);

  const sidechainHeaderHashHex = normalizeHex(
    await input.deps.getSidechainBlockHash(input.pegOut.sidechainBlockNumber),
    32,
    'sidechain block hash',
  );
  const recipientErgoTree = await resolveAggregateRecipientErgoTree(
    input.pegOut.ergoRecipientAddress,
    address => input.deps.addressToTree(address),
  );
  const bridgeEventRootHex = deriveAggregateBurnEventRoot(
    input.pegOut.sidechainTxHash,
    recipientErgoTree,
    BigInt(input.pegOut.amount),
  );

  const anchorFields = findSidechainAnchorFields(
    await input.deps.getSidechainExtensionFieldsAtHeight(input.ergoAnchorHeight),
  );
  if (!anchorFields.some(field => field.bridgeEventRootHex === bridgeEventRootHex)) {
    throw new Error(
      `Ergo height ${input.ergoAnchorHeight} has no 0x0401 field matching bridgeEventRoot ${bridgeEventRootHex}`,
    );
  }

  return {
    sidechainIdHex: normalizeHex(input.sidechainIdHex, 32, 'sidechainId'),
    sidechainHeight: BigInt(input.pegOut.sidechainBlockNumber),
    sidechainHeaderHashHex,
    bridgeEventRootHex,
    ergoAnchorHeight: input.ergoAnchorHeight,
  };
}

/**
 * Find the FIRST (lowest) Ergo block height within [minHeight, maxHeight]
 * whose extension fields contain a 0x0401 entry matching the bridge event root
 * derived from the given peg-out.
 *
 * Returns null if no matching anchor is found in the window.
 *
 * ANCHOR STABILITY INVARIANT:
 * The anchor height determines the ergoAnchorHeight_4BE value embedded in the
 * SPV Tracker AVL tree value. If a different anchor height is used between
 * TX build and TX check/broadcast, the AVL proof and output digest will not
 * match, causing "Script reduced to false" at the SPV Tracker input.
 *
 * By always selecting the FIRST (lowest) matching block, the anchor is
 * deterministic: it will not change as new blocks are mined (assuming the
 * search window includes the original anchor block).
 */
export async function findStableAnchorHeight(
  input: FindStableAnchorHeightInput,
): Promise<number | null> {
  validateAnchorHeight(input.minHeight, 'minHeight');
  validateAnchorHeight(input.maxHeight, 'maxHeight');

  if (input.minHeight > input.maxHeight) return null;

  // Derive the expected bridge event root for this peg-out
  const recipientErgoTree = await resolveAggregateRecipientErgoTree(
    input.pegOut.ergoRecipientAddress,
    address => input.deps.addressToTree(address),
  );
  const expectedRoot = deriveAggregateBurnEventRoot(
    input.pegOut.sidechainTxHash,
    recipientErgoTree,
    BigInt(input.pegOut.amount),
  );

  // Scan FORWARD (lowest height first) to find the first matching block.
  // This guarantees a deterministic anchor that does not change as new
  // blocks are mined with the same extension field value.
  for (let h = input.minHeight; h <= input.maxHeight; h++) {
    try {
      const fields = findSidechainAnchorFields(
        await input.deps.getSidechainExtensionFieldsAtHeight(h),
      );
      if (fields.some(f => f.bridgeEventRootHex === expectedRoot)) {
        return h;
      }
    } catch {
      // Height may not exist or may lack extension fields -- skip.
    }
  }

  return null;
}

/**
 * Result of validating a persisted anchor height against the Ergo chain.
 *
 * - 'valid':       Extension fields were read and the expected 0x0401 root
 *                  is present at the persisted height. Safe to reuse.
 * - 'invalid':     Extension fields were read successfully but the expected
 *                  root is absent. The persisted anchor must be cleared
 *                  (likely a reorg removed the 0x0401 field).
 * - 'unavailable': Could not read extension fields due to a transient RPC
 *                  or provider failure. The persisted anchor must NOT be
 *                  cleared -- retry on the next cycle.
 */
export type AnchorValidationResult = 'valid' | 'invalid' | 'unavailable';

/**
 * Validate that a persisted anchor height still contains the expected
 * 0x0401 bridge event root.
 *
 * IMPORTANT: This function only queries the Ergo node (extension fields).
 * It does NOT call getSidechainBlockHash. A sidechain provider failure
 * must never cause anchor erasure.
 *
 * If addressToTree fails (needed to derive the expected root), the result
 * is 'unavailable' -- the anchor is preserved.
 */
export async function validatePersistedAnchor(input: {
  pegOut: ParsedPegOut;
  ergoAnchorHeight: number;
  deps: Pick<AggregateAnchorDeps, 'addressToTree' | 'getSidechainExtensionFieldsAtHeight'>;
}): Promise<AnchorValidationResult> {
  if (!isValidAnchorHeight(input.ergoAnchorHeight)) return 'invalid';

  try {
    // Step 1: Derive the expected bridge event root
    const recipientErgoTree = await resolveAggregateRecipientErgoTree(
      input.pegOut.ergoRecipientAddress,
      address => input.deps.addressToTree(address),
    );
    const expectedRoot = deriveAggregateBurnEventRoot(
      input.pegOut.sidechainTxHash,
      recipientErgoTree,
      BigInt(input.pegOut.amount),
    );

    // Step 2: Read the extension fields at the persisted height
    let anchorFields;
    try {
      anchorFields = findSidechainAnchorFields(
        await input.deps.getSidechainExtensionFieldsAtHeight(input.ergoAnchorHeight),
      );
    } catch {
      // Ergo node RPC failure (timeout, restart, etc.) -- transient.
      // Do NOT clear the persisted anchor.
      return 'unavailable';
    }

    // Step 3: Check if the expected root is present
    if (anchorFields.some(field => field.bridgeEventRootHex === expectedRoot)) {
      return 'valid';
    }

    // Extension fields were read successfully but root is absent.
    // This is a genuine invalidation (reorg removed the 0x0401 field).
    return 'invalid';
  } catch {
    // addressToTree or root derivation failed -- transient.
    return 'unavailable';
  }
}
