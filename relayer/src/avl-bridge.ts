/**
 * AVL+ Bridge — TypeScript wrapper for bridge_avl WASM crate
 *
 * Provides Scorex-compatible AVL tree operations for the
 * DoubleUnlockPrevention contract. Uses the rebuild-on-demand pattern:
 * rebuild tree from history keys, then generate dual proofs (lookup + insert).
 *
 * @see wasm-avl/src/lib.rs for the Rust implementation
 * @see phases/walkthrough002b.md for architecture decisions
 */

// WASM bindings — relative path from relayer/src/ to wasm-avl/pkg/
import {
  bridge_generate_batch_insert_proofs,
  empty_digest,
  pooled_reserve_empty_digest,
  pooled_reserve_get_proof,
  pooled_reserve_insert,
  pooled_reserve_verify_membership,
  pooled_reserve_verify_insert,
} from '../../wasm-avl/pkg/bridge_avl.js';
import {
  getDupTreeDigest as profileGetDupTreeDigest,
  insertLockRecord as profileInsertLockRecord,
  type BridgeProofResult,
} from './profiles/substrate-grandpa-v1/duplicate-prevention.js';

// ──────────────────────────────────────────────────────────────────────────

/**
 * Result from the WASM dual-proof generation.
 * Both proofs are Scorex-serialized and ready for Ergo context extensions.
 */
export type { BridgeProofResult };

export interface BridgeBatchProofResult {
  /** One non-membership proof per new TX ID, each against the original tree */
  lookup_proofs_hex: string[];
  /** Single batched insert proof for all new TX IDs */
  insert_proof_hex: string;
  /** New tree digest after the full batch insertion */
  new_digest_hex: string;
}

export interface PooledReserveInsertProof {
  insert_proof_hex: string;
  new_digest_hex: string;
}

export interface PooledReserveMembershipProof {
  get_proof_hex: string;
  value_hex: string;
  digest_hex: string;
}

/**
 * Get the empty AVL+ tree digest for initial deployment.
 * This is the value used in R5 of the DoubleUnlockPrevention box at genesis.
 */
export function getEmptyDigest(): string {
  return empty_digest();
}

/** Empty 32-byte-key/32-byte-value tree for pooled reserve deposit commitments. */
export function getPooledReserveEmptyDigest(): string {
  return pooled_reserve_empty_digest();
}

export function insertPooledReserveCommitment(
  history: ReadonlyArray<Readonly<{ key: string; value: string }>>,
  sourceLockBoxIdHex: string,
  depositCommitmentHex: string,
): PooledReserveInsertProof {
  return JSON.parse(pooled_reserve_insert(
    JSON.stringify(history),
    sourceLockBoxIdHex,
    depositCommitmentHex,
  )) as PooledReserveInsertProof;
}

export function verifyPooledReserveCommitmentInsert(
  currentDigestHex: string,
  sourceLockBoxIdHex: string,
  depositCommitmentHex: string,
  insertProofHex: string,
): string {
  const result = JSON.parse(pooled_reserve_verify_insert(
    currentDigestHex,
    sourceLockBoxIdHex,
    depositCommitmentHex,
    insertProofHex,
  )) as { new_digest_hex: string };
  return result.new_digest_hex;
}

export function getPooledReserveCommitmentProof(
  history: ReadonlyArray<Readonly<{ key: string; value: string }>>,
  sourceLockBoxIdHex: string,
): PooledReserveMembershipProof {
  return JSON.parse(pooled_reserve_get_proof(
    JSON.stringify(history),
    sourceLockBoxIdHex,
  )) as PooledReserveMembershipProof;
}

export function verifyPooledReserveCommitmentMembership(
  currentDigestHex: string,
  sourceLockBoxIdHex: string,
  depositCommitmentHex: string,
  getProofHex: string,
): PooledReserveMembershipProof {
  try {
    return JSON.parse(pooled_reserve_verify_membership(
      currentDigestHex,
      sourceLockBoxIdHex,
      depositCommitmentHex,
      getProofHex,
    )) as PooledReserveMembershipProof;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `pooled-reserve membership verification failed: ${detail}`,
    );
  }
}

export const getDupTreeDigest = profileGetDupTreeDigest;

/**
 * Generate dual proofs (lookup + insert) for the DoubleUnlockPrevention contract.
 *
 * Uses the rebuild-on-demand pattern:
 * 1. Reconstructs the AVL+ tree from all historical keys
 * 2. Proves the new TX ID is NOT yet in the tree (lookup → non-membership)
 * 3. Inserts the new TX ID and proves the insertion
 * 4. Returns both proofs + the new digest
 *
 * @param historyKeysHex - All previously inserted TX IDs (32-byte hex strings)
 * @param newTxIdHex     - The new TX ID to lookup+insert (32-byte hex string)
 * @returns Dual proofs + new digest, ready for context extension injection
 * @throws If newTxIdHex already exists in the tree (double-unlock attempt!)
 */
export const insertLockRecord = profileInsertLockRecord;

/**
 * Generate proofs for a batched DoubleUnlockPrevention update.
 *
 * Current production DUP contract still inserts one key, but Phase 011a's
 * aggregate settlement path needs this proof shape for the batched contract:
 * N non-membership lookups against the original tree plus one batched insert.
 */
export function insertLockRecordsBatch(
  historyKeysHex: string[],
  newTxIdsHex: string[],
): BridgeBatchProofResult {
  const resultJson = bridge_generate_batch_insert_proofs(
    JSON.stringify(historyKeysHex),
    JSON.stringify(newTxIdsHex),
  );
  return JSON.parse(resultJson) as BridgeBatchProofResult;
}
