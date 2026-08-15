/**
 * Shard Router — deterministic claim-to-lane routing for parallel eUTXO settlement.
 *
 * This module provides pure functions to assign claims to settlement lanes.
 * The routing is deterministic and offline — no node calls.
 *
 * Minimal spike model:
 *   settlementLane = dupShard = liquidityLane = blake2b256(burnTxId)[0..4] % shardCount
 *
 * Future policy layer (not used in the minimal spike):
 *   assignLiquidityLane() provides amount-bucketed routing (≤ threshold = lane 0,
 *   > threshold = lane 1). This would create composite lanes (shard × bucket) that
 *   share either the DUP or liquidity input, breaking the "only SPVTracker shared"
 *   independence guarantee. It is exported for future use but not wired into
 *   buildShardedPlans().
 */

import { blake2b } from '@noble/hashes/blake2b';

/** Default threshold for liquidity lane bucketing: 50 ERG in nanoERG */
export const DEFAULT_LIQUIDITY_THRESHOLD_NANO_ERG = 50_000_000_000n;

/**
 * Assign a burn TX to a DUP shard based on the first 4 bytes of its blake2b hash.
 *
 * @param burnTxIdHex — 32-byte burn TX ID as hex (with or without 0x prefix)
 * @param shardCount  — number of DUP shards (must be ≥ 1)
 * @returns shard index [0, shardCount)
 */
export function assignDupShard(burnTxIdHex: string, shardCount: number): number {
  if (shardCount < 1 || !Number.isInteger(shardCount)) {
    throw new Error(`shardCount must be a positive integer, got ${shardCount}`);
  }
  const clean = burnTxIdHex.startsWith('0x') ? burnTxIdHex.slice(2) : burnTxIdHex;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`Invalid burn TX ID hex: expected 64 hex chars, got '${clean}'`);
  }
  const hash = blake2b(Buffer.from(clean, 'hex'), { dkLen: 32 });
  // Read first 4 bytes as big-endian unsigned 32-bit integer
  const selector = (hash[0] << 24 | hash[1] << 16 | hash[2] << 8 | hash[3]) >>> 0;
  return selector % shardCount;
}

/**
 * Assign a payout amount to a liquidity lane (FUTURE POLICY LAYER).
 *
 * NOT used in the minimal spike — buildShardedPlans() uses settlementLane = dupShard
 * for both DUP and liquidity routing. This function is exported for future use when
 * composite lane policies are implemented.
 *
 * Lane 0: small payouts (≤ threshold)
 * Lane 1: large payouts (> threshold)
 *
 * @param payoutNanoErg — payout amount in nanoERG
 * @param thresholdNanoErg — lane boundary (default: 50 ERG)
 * @returns lane index (0 or 1)
 */
export function assignLiquidityLane(
  payoutNanoErg: bigint,
  thresholdNanoErg: bigint = DEFAULT_LIQUIDITY_THRESHOLD_NANO_ERG,
): number {
  return payoutNanoErg <= thresholdNanoErg ? 0 : 1;
}
