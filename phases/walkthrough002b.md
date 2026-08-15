# Walkthrough 002b â€” WASM AVL+ Crate (Phase 003)

> **Crate**: `bridge-avl` â€” Scorex-compatible AVL+ proof generator for `DoubleUnlockPrevention.es`
> **Tests**: 4/4 passed | **WASM build**: 132 KB
> **Pattern**: Rebuild-on-Demand (from production protocol)

---

## Architecture

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  TypeScript Relayer                                          â”‚
â”‚                                                              â”‚
â”‚  1. Load history keys from SQLite (avl_tree_history table)  â”‚
â”‚  2. Call WASM: bridge_generate_proofs(history, newTxId)     â”‚
â”‚  3. Parse JSON result â†’ lookup_proof + insert_proof         â”‚
â”‚  4. Build Fleet SDK TX with context extensions:             â”‚
â”‚     Var(0) = lookup_proof                                    â”‚
â”‚     Var(1) = newTxId                                         â”‚
â”‚     Var(2) = insert_proof                                    â”‚
â”‚  5. Submit TX â†’ Ergo node                                    â”‚
â”‚  6. On success: INSERT newTxId into avl_tree_history        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚
                    â”Œâ”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”
                    â”‚ bridge-avl  â”‚
                    â”‚ (WASM)      â”‚
                    â”‚             â”‚
                    â”‚ Step A:     â”‚
                    â”‚  Rebuild    â”‚
                    â”‚  from keys  â”‚
                    â”‚             â”‚
                    â”‚ Step B:     â”‚
                    â”‚  Lookup()   â”‚
                    â”‚  â†’ proof #1 â”‚
                    â”‚             â”‚
                    â”‚ Step C:     â”‚
                    â”‚  Insert()   â”‚
                    â”‚  â†’ proof #2 â”‚
                    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## Cargo.toml

```toml
[package]
name = "bridge-avl"
version = "0.1.0"
edition = "2021"
description = "WASM AVL+ proof generator for the Ergo-Substrate sidechain bridge"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen = "0.2"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
hex = "0.4"
bytes = "1.0"

# Use the canonical ergo_avltree_rust (includes our Bounty #7 persistence layer)
ergo_avltree_rust = { path = "../../ergo_avltree_rust" }

[profile.release]
opt-level = "s"
lto = true
```

**Key decision**: Uses local path to `ergo_avltree_rust` (not crates.io) because:
1. Our Bounty #7 persistence layer is only in the fork
2. Byte-identical hashing with Scorex JVM is guaranteed by this specific version
3. We control the exact API surface

---

## src/lib.rs â€” Full Source

### Deep Think note on API corrections

The initial audit proposed code using `Operation::Insert(key_bytes, vec![0x01])` â€” this was incorrect. The real `ergo_avltree_rust` API uses:
- `Operation::Insert(KeyValue { key: Bytes, value: Bytes })` â€” `KeyValue` is a named struct
- `Operation::Lookup(ADKey)` where `ADKey = Bytes` (not `Vec<u8>`)
- `AuthenticatedTreeOps` trait must be imported for `digest()` method
- `AVLTree::new()` takes `Arc<dyn Fn(&Digest32) -> Node>` (not a bare closure)

```rust
//! Bridge AVL+ Proof Generator
//!
//! Generates lookup and insert proofs for the DoubleUnlockPrevention contract.
//! Uses the Rebuild-on-Demand pattern from prior art: no persistent WASM state,
//! the full tree is rebuilt from the key history on each invocation.
//!
//! ## CRITICAL: Batch Proof Mandate
//!
//! Each call to `generate_proof()` resets the prover's proof buffer.
//! We generate TWO sequential proofs from the SAME tree snapshot:
//! 1. Lookup proof (proves key is NOT in tree) â†’ Var(0) in ErgoScript
//! 2. Insert proof (adds key to tree) â†’ Var(2) in ErgoScript

extern crate alloc;

use alloc::sync::Arc;
use bytes::Bytes;
use ergo_avltree_rust::authenticated_tree_ops::AuthenticatedTreeOps;
use ergo_avltree_rust::batch_avl_prover::BatchAVLProver;
use ergo_avltree_rust::batch_node::{AVLTree, Node, NodeHeader};
use ergo_avltree_rust::operation::{Digest32, KeyValue, Operation};
use serde::Serialize;
use wasm_bindgen::prelude::*;

/// Result of proof generation â€” returned as JSON string to TypeScript
#[derive(Serialize, serde::Deserialize)]
pub struct BridgeProofResult {
    /// Hex-encoded lookup proof (proves key NOT in tree)
    pub lookup_proof_hex: String,
    /// Hex-encoded insert proof (proves key was inserted)
    pub insert_proof_hex: String,
    /// Hex-encoded new tree digest after insertion
    pub new_digest_hex: String,
}

/// Create a fresh AVLTree with 32-byte keys and 1-byte values
fn make_empty_tree() -> AVLTree {
    AVLTree::new(
        Arc::new(|digest: &Digest32| Node::LabelOnly(NodeHeader::new(Some(*digest), None))),
        32,       // key length = 32 bytes (TX ID hash)
        Some(1),  // value length = 1 byte (0x01 marker)
    )
}

/// Get the empty tree digest (for initial deployment)
#[wasm_bindgen]
pub fn empty_digest() -> String {
    let prover = BatchAVLProver::new(make_empty_tree(), true);
    hex::encode(prover.digest().unwrap())
}

/// Generate both lookup and insert proofs for the DoubleUnlockPrevention contract.
///
/// ## Arguments
/// - `history_keys_json`: JSON array of hex-encoded 32-byte keys already in the tree
/// - `new_txid_hex`: hex-encoded 32-byte TX ID to lookup and insert
///
/// ## Returns
/// JSON string containing `BridgeProofResult` with:
/// - `lookup_proof_hex`: proof that `new_txid` is NOT yet in the tree
/// - `insert_proof_hex`: proof that `new_txid` was inserted
/// - `new_digest_hex`: the tree digest after insertion
///
/// ## Panics
/// - If any key is not exactly 32 bytes
/// - If `new_txid` already exists in the tree (lookup will find it)
#[wasm_bindgen]
pub fn bridge_generate_proofs(history_keys_json: &str, new_txid_hex: &str) -> String {
    let history_keys: Vec<String> =
        serde_json::from_str(history_keys_json).expect("Invalid JSON array of hex keys");
    let new_txid_bytes = hex::decode(new_txid_hex).expect("Invalid hex for new_txid");
    assert_eq!(new_txid_bytes.len(), 32, "TX ID must be exactly 32 bytes");

    let tree = make_empty_tree();
    let mut prover = BatchAVLProver::new(tree, true);

    // â”€â”€â”€ Step 1: Rebuild from history (Rebuild-on-Demand pattern) â”€â”€â”€
    for key_hex in &history_keys {
        let key_bytes = hex::decode(key_hex).expect("Invalid hex key in history");
        assert_eq!(key_bytes.len(), 32, "History key must be 32 bytes");

        let op = Operation::Insert(KeyValue {
            key: Bytes::from(key_bytes),
            value: Bytes::from_static(&[0x01]),
        });
        prover
            .perform_one_operation(&op)
            .expect("Failed to insert history key");
    }

    // Flush the accumulated proof from replay â€” we don't need it
    let _ = prover.generate_proof();

    // â”€â”€â”€ Step 2: Generate LOOKUP proof for Var(0) â”€â”€â”€
    // This proves the key does NOT exist in the tree yet
    let lookup_op = Operation::Lookup(Bytes::from(new_txid_bytes.clone()));
    let lookup_result = prover
        .perform_one_operation(&lookup_op)
        .expect("Lookup operation failed");

    // Verify the key is truly not in the tree
    assert!(
        lookup_result.is_none(),
        "TX ID already exists in the tree â€” double-spend attempt!"
    );

    let lookup_proof = prover.generate_proof();

    // â”€â”€â”€ Step 3: Generate INSERT proof for Var(2) â”€â”€â”€
    // This inserts the key and generates the proof for the update
    let insert_op = Operation::Insert(KeyValue {
        key: Bytes::from(new_txid_bytes),
        value: Bytes::from_static(&[0x01]),
    });
    prover
        .perform_one_operation(&insert_op)
        .expect("Insert operation failed");

    let insert_proof = prover.generate_proof();

    // Get the new digest after insertion
    let new_digest = prover.digest().expect("Failed to get digest after insert");

    let result = BridgeProofResult {
        lookup_proof_hex: hex::encode(&lookup_proof),
        insert_proof_hex: hex::encode(&insert_proof),
        new_digest_hex: hex::encode(&new_digest),
    };

    serde_json::to_string(&result).expect("Failed to serialize result")
}
```

---

## Tests â€” 4/4 Passing

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_digest() {
        let digest = empty_digest();
        assert!(!digest.is_empty());
        assert!(digest.ends_with("00")); // Trailing height byte
    }

    #[test]
    fn test_lookup_and_insert_empty_tree() {
        let fake_txid = "aa".repeat(32); // 32-byte fake TX ID
        let result_json = bridge_generate_proofs("[]", &fake_txid);
        let result: BridgeProofResult = serde_json::from_str(&result_json).unwrap();

        assert!(!result.lookup_proof_hex.is_empty());
        assert!(!result.insert_proof_hex.is_empty());
        assert!(!result.new_digest_hex.is_empty());
        assert_ne!(result.new_digest_hex, empty_digest());
    }

    #[test]
    fn test_lookup_with_existing_history() {
        let key1 = "bb".repeat(32);
        let key2 = "cc".repeat(32);
        let new_key = "dd".repeat(32);

        let history = serde_json::to_string(&vec![&key1, &key2]).unwrap();
        let result_json = bridge_generate_proofs(&history, &new_key);
        let result: BridgeProofResult = serde_json::from_str(&result_json).unwrap();

        assert!(!result.lookup_proof_hex.is_empty());
        assert!(!result.insert_proof_hex.is_empty());
    }

    #[test]
    #[should_panic(expected = "already exists")]
    fn test_double_insert_panics() {
        let key1 = "ee".repeat(32);
        let history = serde_json::to_string(&vec![&key1]).unwrap();
        bridge_generate_proofs(&history, &key1); // Should panic!
    }
}
```

---

## WASM Build Output

```
pkg/
â”œâ”€â”€ bridge_avl.d.ts        (884 bytes)  â€” TypeScript type declarations
â”œâ”€â”€ bridge_avl.js          (4.7 KB)     â€” Node.js bindings
â”œâ”€â”€ bridge_avl_bg.wasm     (132 KB)     â€” Compiled WASM binary
â”œâ”€â”€ bridge_avl_bg.wasm.d.ts (563 bytes) â€” WASM type declarations
â””â”€â”€ package.json           (278 bytes)  â€” npm package metadata
```

### TypeScript usage (from relayer):

```typescript
import { bridge_generate_proofs, empty_digest } from '../wasm-avl/pkg/bridge_avl.js';

// Get empty digest for initial deployment
const initialDigest = empty_digest();
// â†’ "4ec61f485b98eb87153f7c57db4f5ecd75556fddbc403b41acf8441fde8e160900"

// Generate proofs for a peg-out
const historyKeys = stateTracker.getAllAvlKeys(); // from SQLite
const resultJson = bridge_generate_proofs(
  JSON.stringify(historyKeys),
  sidechainBurnTxIdHex
);
const { lookup_proof_hex, insert_proof_hex, new_digest_hex } = JSON.parse(resultJson);

// Use in Fleet SDK context extensions:
// Var(0) = Buffer.from(lookup_proof_hex, 'hex')
// Var(1) = Buffer.from(sidechainBurnTxIdHex, 'hex')
// Var(2) = Buffer.from(insert_proof_hex, 'hex')
```

---

## Audit Questions for Deep Think

1. **Rebuild-on-Demand scaling**: With N keys in history, each `bridge_generate_proofs` call re-inserts all N keys before generating the new proof. At 1000 peg-outs, this means 1000 insertions per call. Should we cap the rebuild or use persistent WASM state (at the cost of crash-safety)?

2. **Proof ordering**: We generate lookup proof FIRST, then insert proof. The ErgoScript contract verifies `spentIdsTree.get(newTxId, lookupProof).isEmpty` using the ORIGINAL tree, then `spentIdsTree.insert(toInsert, insertProof).get` also against the ORIGINAL tree. Is this correct? Or does `generate_proof()` internally advance the tree state such that the insert proof is against the post-lookup tree?

3. **Determinism**: Is `BatchAVLProver` fully deterministic? If the relayer crashes and rebuilds from the same history, will it produce byte-identical proofs for the same operation? This is critical for replay safety.

4. **Value length constraint**: We use `Some(1)` for `value_length` in `make_empty_tree()`. This must match the ErgoScript contract's `AvlTree` metadata exactly. The contract uses `Coll(1.toByte)` as the value (1 byte, value `0x01`). If there's a mismatch, the JIT verifier will reject the proof. How do we ensure the `AvlTree` object in the initial deployment box has `valueLengthOpt = Some(1)` encoded correctly?
