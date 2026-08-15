import {
  bridge_generate_proofs,
  bridge_lookup_membership,
  empty_digest,
} from '../../../../wasm-avl/pkg/bridge_avl.js';

export interface BridgeProofResult {
  lookup_proof_hex: string;
  insert_proof_hex: string;
  new_digest_hex: string;
}

export function getDupTreeDigest(historyKeysHex: string[]): string {
  if (historyKeysHex.length === 0) return empty_digest();
  const resultJson = bridge_lookup_membership(
    JSON.stringify(historyKeysHex),
    historyKeysHex[0],
  );
  return JSON.parse(resultJson).digest_hex;
}

export function insertLockRecord(
  historyKeysHex: string[],
  newTxIdHex: string,
): BridgeProofResult {
  const resultJson = bridge_generate_proofs(
    JSON.stringify(historyKeysHex),
    newTxIdHex,
  );
  return JSON.parse(resultJson) as BridgeProofResult;
}
