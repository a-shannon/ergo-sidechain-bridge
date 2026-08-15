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
//! 1. Lookup proof (proves key is NOT in tree) -> Var(0) in ErgoScript
//! 2. Insert proof (adds key to tree) -> Var(2) in ErgoScript

extern crate alloc;

use blake2::digest::Digest;
use bytes::Bytes;
use ergo_avltree_rust::authenticated_tree_ops::AuthenticatedTreeOps;
use ergo_avltree_rust::batch_avl_prover::BatchAVLProver;
use ergo_avltree_rust::batch_avl_verifier::BatchAVLVerifier;
use ergo_avltree_rust::batch_node::{AVLTree, Blake2b256, Node, NodeHeader};
use ergo_avltree_rust::operation::{Digest32, KeyValue, Operation};
use serde::Serialize;
use std::panic::{catch_unwind, AssertUnwindSafe};
use wasm_bindgen::prelude::*;

/// Result of proof generation -- returned as JSON string to TypeScript
#[derive(Serialize, serde::Deserialize)]
pub struct BridgeProofResult {
    /// Hex-encoded lookup proof (proves key NOT in tree)
    pub lookup_proof_hex: String,
    /// Hex-encoded insert proof (proves key was inserted)
    pub insert_proof_hex: String,
    /// Hex-encoded new tree digest after insertion
    pub new_digest_hex: String,
}

/// Result for a batched DUP insert spike.
#[derive(Serialize, serde::Deserialize)]
pub struct BridgeBatchProofResult {
    /// One non-membership lookup proof per new key, each against the original tree.
    pub lookup_proofs_hex: Vec<String>,
    /// Single batched insert proof for all new keys.
    pub insert_proof_hex: String,
    /// Hex-encoded new tree digest after all insertions.
    pub new_digest_hex: String,
}

fn label_only_resolver(digest: &Digest32) -> Node {
    Node::LabelOnly(NodeHeader::new(Some(*digest), None))
}

/// Create a fresh AVLTree with 32-byte keys and 1-byte values
fn make_empty_tree() -> AVLTree {
    AVLTree::new(
        label_only_resolver,
        32,      // key length = 32 bytes (TX ID hash)
        Some(1), // value length = 1 byte (0x01 marker)
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

    // --- Step 1: Rebuild from history (Rebuild-on-Demand pattern) ---
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

    // Flush the accumulated proof from replay -- we don't need it
    let _ = prover.generate_proof();

    // --- Step 2: Generate LOOKUP proof for Var(0) ---
    // This proves the key does NOT exist in the tree yet
    let lookup_op = Operation::Lookup(Bytes::from(new_txid_bytes.clone()));
    let lookup_result = prover
        .perform_one_operation(&lookup_op)
        .expect("Lookup operation failed");

    // Verify the key is truly not in the tree
    assert!(
        lookup_result.is_none(),
        "TX ID already exists in the tree -- double-spend attempt!"
    );

    let lookup_proof = prover.generate_proof();

    // --- Step 3: Generate INSERT proof for Var(2) ---
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

/// Generate N non-membership lookup proofs and one batched insert proof.
///
/// This is a Spike 4 helper for evaluating DUP batch scalability. The contract
/// model is:
/// - verify each new key is absent using one independent lookup proof per key
/// - insert all keys with one `AvlTree.insert(Coll[(key,value)], insertProof)`
///
/// ## Arguments
/// - `history_keys_json`: JSON array of 32-byte hex keys already in the DUP tree
/// - `new_keys_json`: JSON array of distinct 32-byte hex keys to insert
///
/// ## Panics
/// - If any key is malformed
/// - If any new key already exists in history
/// - If the batch contains duplicate keys
#[wasm_bindgen]
pub fn bridge_generate_batch_insert_proofs(history_keys_json: &str, new_keys_json: &str) -> String {
    let history_keys: Vec<String> =
        serde_json::from_str(history_keys_json).expect("Invalid JSON array of history keys");
    let new_keys: Vec<String> =
        serde_json::from_str(new_keys_json).expect("Invalid JSON array of new keys");

    assert!(!new_keys.is_empty(), "Batch must contain at least one key");

    let mut new_keys_bytes: Vec<Vec<u8>> = Vec::with_capacity(new_keys.len());
    for key_hex in &new_keys {
        let key_bytes = hex::decode(key_hex).expect("Invalid hex key in new keys");
        assert_eq!(key_bytes.len(), 32, "New key must be exactly 32 bytes");
        assert!(
            !new_keys_bytes.iter().any(|existing| existing == &key_bytes),
            "Duplicate key in batch"
        );
        new_keys_bytes.push(key_bytes);
    }

    // Generate independent non-membership proofs, each against the same original tree.
    let mut lookup_proofs_hex: Vec<String> = Vec::with_capacity(new_keys_bytes.len());
    for new_key in &new_keys_bytes {
        let tree = make_empty_tree();
        let mut prover = BatchAVLProver::new(tree, true);

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
        let _ = prover.generate_proof(); // flush replay proof

        let lookup_op = Operation::Lookup(Bytes::from(new_key.clone()));
        let lookup_result = prover
            .perform_one_operation(&lookup_op)
            .expect("Lookup operation failed");
        assert!(
            lookup_result.is_none(),
            "Batch key already exists in the tree"
        );

        lookup_proofs_hex.push(hex::encode(prover.generate_proof()));
    }

    // Generate one batched insert proof for all new keys.
    let tree = make_empty_tree();
    let mut prover = BatchAVLProver::new(tree, true);

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
    let _ = prover.generate_proof(); // flush replay proof

    for new_key in new_keys_bytes {
        let insert_op = Operation::Insert(KeyValue {
            key: Bytes::from(new_key),
            value: Bytes::from_static(&[0x01]),
        });
        prover
            .perform_one_operation(&insert_op)
            .expect("Batch insert operation failed");
    }

    let insert_proof = prover.generate_proof();
    let new_digest = prover
        .digest()
        .expect("Failed to get digest after batch insert");

    let result = BridgeBatchProofResult {
        lookup_proofs_hex,
        insert_proof_hex: hex::encode(&insert_proof),
        new_digest_hex: hex::encode(&new_digest),
    };

    serde_json::to_string(&result).expect("Failed to serialize batch result")
}

// ======================================================================
// SPIKE 3: SPV Tracker functions
// ======================================================================

/// Schema A: Membership lookup — proves key EXISTS in tree (value_length=1)
///
/// Unlike `bridge_generate_proofs` which proves non-membership + insert,
/// this function proves that a key IS in the tree (membership proof).
/// Used for peg-out claims where the claimant proves their commitment
/// was previously ingested into the tracker.
#[wasm_bindgen]
pub fn bridge_lookup_membership(history_keys_json: &str, lookup_key_hex: &str) -> String {
    let history_keys: Vec<String> =
        serde_json::from_str(history_keys_json).expect("Invalid JSON array of hex keys");
    let lookup_bytes = hex::decode(lookup_key_hex).expect("Invalid hex for lookup_key");
    assert_eq!(
        lookup_bytes.len(),
        32,
        "Lookup key must be exactly 32 bytes"
    );

    let tree = make_empty_tree();
    let mut prover = BatchAVLProver::new(tree, true);

    // Rebuild from history
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
    let _ = prover.generate_proof(); // flush replay proof

    // Generate membership lookup proof
    let lookup_op = Operation::Lookup(Bytes::from(lookup_bytes));
    let lookup_result = prover
        .perform_one_operation(&lookup_op)
        .expect("Lookup operation failed");

    assert!(
        lookup_result.is_some(),
        "Key NOT found in tree — cannot generate membership proof"
    );

    let lookup_proof = prover.generate_proof();
    let digest = prover.digest().expect("Failed to get digest");

    let result = serde_json::json!({
        "lookup_proof_hex": hex::encode(&lookup_proof),
        "digest_hex": hex::encode(&digest),
    });
    serde_json::to_string(&result).expect("Failed to serialize")
}

// ── Schema B: SPV Tracker tree (key=32, value=36) ────────────────────

/// Fixed-width SPV tracker schemas. V1 stores the event root and anchor height;
/// V2 stores the authenticated checkpoint, Ergo-header binding, and exact
/// finality statement/proof identity.
const TRACKER_V1_VALUE_LENGTH: usize = 36;
const TRACKER_V2_VALUE_LENGTH: usize = 264;
const TRACKER_APPLICATION_V2_VALUE_LENGTH: usize = 370;
const POOLED_RESERVE_VALUE_LENGTH: usize = 32;
const TRACKER_KEY_LENGTH: usize = 32;
const AVL_DIGEST_LENGTH: usize = 33;
const LEAF_IN_PACKAGED_PROOF: u8 = 2;
const LABEL_IN_PACKAGED_PROOF: u8 = 3;
const END_OF_TREE_IN_PACKAGED_PROOF: u8 = 4;

#[derive(Serialize, serde::Deserialize)]
pub struct TrackerVerifyInsertResult {
    /// Hex-encoded digest after replaying the observed insertion.
    pub new_digest_hex: String,
}

#[derive(Serialize, serde::Deserialize)]
pub struct TrackerVerifyMembershipResult {
    /// Hex-encoded digest against which membership was verified.
    pub digest_hex: String,
    /// Exact fixed-width value returned by the authenticated lookup.
    pub value_hex: String,
}

enum ProofNodeShape {
    Label,
    Leaf {
        key: [u8; TRACKER_KEY_LENGTH],
        next_key: [u8; TRACKER_KEY_LENGTH],
    },
    Internal {
        left: usize,
        right: usize,
        balance: i8,
    },
}

fn make_tracker_tree(value_length: usize) -> AVLTree {
    AVLTree::new(label_only_resolver, 32, Some(value_length))
}

/// Get the empty SPV tracker digest (for initial deployment)
#[wasm_bindgen]
pub fn tracker_empty_digest() -> String {
    tracker_empty_digest_impl(TRACKER_V1_VALUE_LENGTH)
}

/// Get the empty authenticated V2 tracker digest (value length 264).
#[wasm_bindgen]
pub fn tracker_v2_empty_digest() -> String {
    tracker_empty_digest_impl(TRACKER_V2_VALUE_LENGTH)
}

/// Get the empty application-bound V2 tracker digest (value length 370).
#[wasm_bindgen]
pub fn tracker_application_v2_empty_digest() -> String {
    tracker_empty_digest_impl(TRACKER_APPLICATION_V2_VALUE_LENGTH)
}

/// Get the empty pooled-reserve deposit tree digest (32-byte commitment values).
#[wasm_bindgen]
pub fn pooled_reserve_empty_digest() -> String {
    tracker_empty_digest_impl(POOLED_RESERVE_VALUE_LENGTH)
}

fn tracker_empty_digest_impl(value_length: usize) -> String {
    let prover = BatchAVLProver::new(make_tracker_tree(value_length), true);
    hex::encode(prover.digest().unwrap())
}

/// Insert a new entry into the SPV tracker and generate the insert proof.
///
/// ## Arguments
/// - `history_json`: JSON array of `{"key":"hex","value":"hex"}` objects
/// - `new_key_hex`: 32-byte hex key to insert
/// - `new_value_hex`: 36-byte hex value (bridge_event_root || ergoAnchorHeight_BE)
///
/// ## Returns
/// JSON: `{ insert_proof_hex, new_digest_hex }`
///
/// ## Panics
/// - If `new_key` already exists in the tree (first-anchor-wins enforcement)
#[wasm_bindgen]
pub fn tracker_insert(history_json: &str, new_key_hex: &str, new_value_hex: &str) -> String {
    tracker_insert_impl(
        history_json,
        new_key_hex,
        new_value_hex,
        TRACKER_V1_VALUE_LENGTH,
    )
}

/// Insert an authenticated V2 tracker entry with a 264-byte fixed value.
#[wasm_bindgen]
pub fn tracker_v2_insert(history_json: &str, new_key_hex: &str, new_value_hex: &str) -> String {
    tracker_insert_impl(
        history_json,
        new_key_hex,
        new_value_hex,
        TRACKER_V2_VALUE_LENGTH,
    )
}

/// Insert an application-bound V2 tracker entry with a 370-byte fixed value.
#[wasm_bindgen]
pub fn tracker_application_v2_insert(
    history_json: &str,
    new_key_hex: &str,
    new_value_hex: &str,
) -> String {
    tracker_insert_impl(
        history_json,
        new_key_hex,
        new_value_hex,
        TRACKER_APPLICATION_V2_VALUE_LENGTH,
    )
}

/// Insert one 32-byte pooled-reserve deposit commitment.
#[wasm_bindgen]
pub fn pooled_reserve_insert(history_json: &str, new_key_hex: &str, new_value_hex: &str) -> String {
    tracker_insert_impl(
        history_json,
        new_key_hex,
        new_value_hex,
        POOLED_RESERVE_VALUE_LENGTH,
    )
}

/// Verify and replay one observed V2 tracker insertion from its exact current digest.
///
/// Returns JSON: `{ "new_digest_hex": "..." }`. Malformed input, a proof for a
/// different tree/path, an existing key, or any verifier failure is returned to
/// JavaScript as an error. The caller must compare the returned digest with the
/// observed successor digest to bind the supplied key and value to that transition.
#[wasm_bindgen]
pub fn tracker_v2_verify_insert(
    current_digest_hex: &str,
    key_hex: &str,
    value_hex: &str,
    insert_proof_hex: &str,
) -> Result<String, JsValue> {
    tracker_v2_verify_insert_impl(current_digest_hex, key_hex, value_hex, insert_proof_hex)
        .map_err(|message| JsValue::from_str(&message))
}

/// Verify and replay one observed application-bound V2 tracker insertion.
#[wasm_bindgen]
pub fn tracker_application_v2_verify_insert(
    current_digest_hex: &str,
    key_hex: &str,
    value_hex: &str,
    insert_proof_hex: &str,
) -> Result<String, JsValue> {
    tracker_application_v2_verify_insert_impl(
        current_digest_hex,
        key_hex,
        value_hex,
        insert_proof_hex,
    )
    .map_err(|message| JsValue::from_str(&message))
}

/// Verify and replay one pooled-reserve deposit commitment insertion.
#[wasm_bindgen]
pub fn pooled_reserve_verify_insert(
    current_digest_hex: &str,
    key_hex: &str,
    value_hex: &str,
    insert_proof_hex: &str,
) -> Result<String, JsValue> {
    tracker_verify_insert_impl(
        current_digest_hex,
        key_hex,
        value_hex,
        insert_proof_hex,
        POOLED_RESERVE_VALUE_LENGTH,
    )
    .map_err(|message| JsValue::from_str(&message))
}

/// Verify that one pooled-reserve deposit commitment remains present in an
/// observed descendant reserve digest.
#[wasm_bindgen]
pub fn pooled_reserve_verify_membership(
    current_digest_hex: &str,
    key_hex: &str,
    expected_value_hex: &str,
    get_proof_hex: &str,
) -> Result<String, JsValue> {
    tracker_verify_membership_impl(
        current_digest_hex,
        key_hex,
        expected_value_hex,
        get_proof_hex,
        POOLED_RESERVE_VALUE_LENGTH,
    )
    .map_err(|message| JsValue::from_str(&message))
}

fn tracker_v2_verify_insert_impl(
    current_digest_hex: &str,
    key_hex: &str,
    value_hex: &str,
    insert_proof_hex: &str,
) -> Result<String, String> {
    tracker_verify_insert_impl(
        current_digest_hex,
        key_hex,
        value_hex,
        insert_proof_hex,
        TRACKER_V2_VALUE_LENGTH,
    )
}

fn tracker_application_v2_verify_insert_impl(
    current_digest_hex: &str,
    key_hex: &str,
    value_hex: &str,
    insert_proof_hex: &str,
) -> Result<String, String> {
    tracker_verify_insert_impl(
        current_digest_hex,
        key_hex,
        value_hex,
        insert_proof_hex,
        TRACKER_APPLICATION_V2_VALUE_LENGTH,
    )
}

fn tracker_verify_insert_impl(
    current_digest_hex: &str,
    key_hex: &str,
    value_hex: &str,
    insert_proof_hex: &str,
    value_length: usize,
) -> Result<String, String> {
    let current_digest = decode_exact_hex(
        current_digest_hex,
        AVL_DIGEST_LENGTH,
        "current tracker digest",
    )?;
    let key = decode_exact_hex(key_hex, TRACKER_KEY_LENGTH, "tracker key")?;
    let value = decode_exact_hex(value_hex, value_length, "tracker value")?;

    if current_digest[AVL_DIGEST_LENGTH - 1] == u8::MAX {
        return Err("current tracker digest height 255 cannot be safely incremented".to_owned());
    }

    let max_proof_bytes = max_single_insert_proof_bytes_for_value(
        current_digest[AVL_DIGEST_LENGTH - 1],
        value_length,
    );
    if insert_proof_hex.len() > max_proof_bytes.saturating_mul(2) {
        return Err(format!(
            "AVL insert proof exceeds the one-operation bound of {max_proof_bytes} bytes"
        ));
    }
    let insert_proof = hex::decode(insert_proof_hex)
        .map_err(|error| format!("invalid AVL insert proof hex: {error}"))?;
    validate_single_insert_proof_shape_for_value(
        &insert_proof,
        &key,
        current_digest[AVL_DIGEST_LENGTH - 1],
        value_length,
    )?;

    let replay = catch_unwind(AssertUnwindSafe(|| -> Result<Vec<u8>, String> {
        let mut verifier = BatchAVLVerifier::new(
            &Bytes::from(current_digest),
            &Bytes::from(insert_proof),
            make_tracker_tree(value_length),
            Some(1),
            Some(0),
        )
        .map_err(|error| format!("AVL insert proof verification failed: {error}"))?;

        let operation = Operation::Insert(KeyValue {
            key: Bytes::from(key),
            value: Bytes::from(value),
        });
        let previous_value = verifier
            .perform_one_operation(&operation)
            .map_err(|error| format!("AVL insert replay failed: {error}"))?;
        if previous_value.is_some() {
            return Err("AVL insert replay rejected an existing tracker key".to_owned());
        }

        verifier
            .digest()
            .map(|digest| digest.to_vec())
            .ok_or_else(|| "AVL verifier produced no successor digest".to_owned())
    }))
    .map_err(|payload| {
        let detail = if let Some(message) = payload.downcast_ref::<&str>() {
            *message
        } else if let Some(message) = payload.downcast_ref::<String>() {
            message.as_str()
        } else {
            "unknown panic"
        };
        format!("AVL verifier panicked while parsing or replaying the insert proof: {detail}")
    })??;

    let result = TrackerVerifyInsertResult {
        new_digest_hex: hex::encode(replay),
    };
    serde_json::to_string(&result)
        .map_err(|error| format!("failed to serialize verified successor digest: {error}"))
}

fn tracker_verify_membership_impl(
    current_digest_hex: &str,
    key_hex: &str,
    expected_value_hex: &str,
    get_proof_hex: &str,
    value_length: usize,
) -> Result<String, String> {
    let current_digest = decode_exact_hex(
        current_digest_hex,
        AVL_DIGEST_LENGTH,
        "current tracker digest",
    )?;
    let key = decode_exact_hex(key_hex, TRACKER_KEY_LENGTH, "tracker key")?;
    let expected_value = decode_exact_hex(expected_value_hex, value_length, "tracker value")?;

    let max_proof_bytes = max_single_insert_proof_bytes_for_value(
        current_digest[AVL_DIGEST_LENGTH - 1],
        value_length,
    );
    if get_proof_hex.len() > max_proof_bytes.saturating_mul(2) {
        return Err(format!(
            "AVL membership proof exceeds the one-operation bound of {max_proof_bytes} bytes"
        ));
    }
    let get_proof = hex::decode(get_proof_hex)
        .map_err(|error| format!("invalid AVL membership proof hex: {error}"))?;
    if get_proof.is_empty() {
        return Err("AVL membership proof cannot be empty".to_owned());
    }

    let expected_digest = current_digest.clone();
    let verified = catch_unwind(AssertUnwindSafe(
        || -> Result<(Vec<u8>, Vec<u8>), String> {
            let mut verifier = BatchAVLVerifier::new(
                &Bytes::from(current_digest),
                &Bytes::from(get_proof),
                make_tracker_tree(value_length),
                Some(1),
                Some(0),
            )
            .map_err(|error| format!("AVL membership proof verification failed: {error}"))?;

            let observed_value = verifier
                .perform_one_operation(&Operation::Lookup(Bytes::from(key)))
                .map_err(|error| format!("AVL membership lookup failed: {error}"))?
                .ok_or_else(|| "AVL membership proof does not contain the tracker key".to_owned())?
                .to_vec();
            let digest_after_lookup = verifier
                .digest()
                .map(|digest| digest.to_vec())
                .ok_or_else(|| "AVL verifier produced no digest after lookup".to_owned())?;
            Ok((observed_value, digest_after_lookup))
        },
    ))
    .map_err(|payload| {
        let detail = if let Some(message) = payload.downcast_ref::<&str>() {
            *message
        } else if let Some(message) = payload.downcast_ref::<String>() {
            message.as_str()
        } else {
            "unknown panic"
        };
        format!("AVL verifier panicked while parsing the membership proof: {detail}")
    })??;

    if verified.0 != expected_value {
        return Err("AVL membership proof returned a different tracker value".to_owned());
    }
    if verified.1 != expected_digest {
        return Err("AVL membership lookup changed the tracker digest".to_owned());
    }

    serde_json::to_string(&TrackerVerifyMembershipResult {
        digest_hex: hex::encode(verified.1),
        value_hex: hex::encode(verified.0),
    })
    .map_err(|error| format!("failed to serialize verified membership: {error}"))
}

const ERGO_UTXO_KEY_LENGTH: usize = 32;
const ERGO_UTXO_DIGEST_LENGTH: usize = 33;
const ERGO_UTXO_MAX_BOX_BYTES: usize = 4096;
const ERGO_UTXO_MAX_LOOKUP_PROOF_BYTES: usize = 16 * 1024;

#[derive(Debug, PartialEq, Eq, Serialize, serde::Deserialize)]
pub struct ErgoUtxoStateLookupResultV1 {
    pub status: String,
    pub state_root_hex: String,
    pub vault_box_id_hex: String,
    pub refundable_source_box_id_hex: String,
}

fn make_ergo_utxo_tree() -> AVLTree {
    AVLTree::new(label_only_resolver, ERGO_UTXO_KEY_LENGTH, None)
}

/// Replays the ordered UTXO lookups `(vault membership, refundable-source
/// non-membership)` against one caller-supplied Ergo header state root.
///
/// This verifies only the supplied AVL state commitment. It does not establish
/// header consensus, canonicality, finality, mint authority, or funds authority.
/// The proof authenticates the 32-byte root label. The trailing AVL height byte
/// is preserved verbatim and must be bound to the exact authenticated header by
/// the statement consumer; the upstream verifier does not recompute it.
pub fn verify_ergo_utxo_state_lookups_v1(
    state_root_hex: &str,
    proof_hex: &str,
    vault_box_id_hex: &str,
    expected_vault_box_hex: &str,
    refundable_source_box_id_hex: &str,
) -> Result<ErgoUtxoStateLookupResultV1, String> {
    let state_root = decode_exact_hex(
        state_root_hex,
        ERGO_UTXO_DIGEST_LENGTH,
        "Ergo UTXO state root",
    )?;
    let vault_box_id = decode_exact_hex(vault_box_id_hex, ERGO_UTXO_KEY_LENGTH, "vault box ID")?;
    let refundable_source_box_id = decode_exact_hex(
        refundable_source_box_id_hex,
        ERGO_UTXO_KEY_LENGTH,
        "refundable source box ID",
    )?;
    if vault_box_id == refundable_source_box_id {
        return Err("vault and refundable source box IDs must be distinct".to_owned());
    }

    let expected_vault_box = hex::decode(expected_vault_box_hex)
        .map_err(|error| format!("invalid expected vault box hex: {error}"))?;
    if expected_vault_box.is_empty() || expected_vault_box.len() > ERGO_UTXO_MAX_BOX_BYTES {
        return Err(format!(
            "expected vault box must contain 1..={ERGO_UTXO_MAX_BOX_BYTES} bytes"
        ));
    }
    let derived_vault_box_id = Blake2b256::digest(&expected_vault_box);
    if derived_vault_box_id.as_slice() != vault_box_id.as_slice() {
        return Err("expected vault box bytes do not derive the supplied vault box ID".to_owned());
    }

    let proof = hex::decode(proof_hex)
        .map_err(|error| format!("invalid Ergo UTXO lookup proof hex: {error}"))?;
    if proof.is_empty() || proof.len() > ERGO_UTXO_MAX_LOOKUP_PROOF_BYTES {
        return Err(format!(
            "Ergo UTXO lookup proof must contain 1..={ERGO_UTXO_MAX_LOOKUP_PROOF_BYTES} bytes"
        ));
    }

    let expected_root = state_root.clone();
    let replay = catch_unwind(AssertUnwindSafe(|| -> Result<Vec<u8>, String> {
        let mut verifier = BatchAVLVerifier::new(
            &Bytes::from(state_root),
            &Bytes::from(proof),
            make_ergo_utxo_tree(),
            Some(2),
            Some(0),
        )
        .map_err(|error| format!("Ergo UTXO lookup proof verification failed: {error}"))?;

        let observed_vault_box = verifier
            .perform_one_operation(&Operation::Lookup(Bytes::from(vault_box_id.clone())))
            .map_err(|error| format!("vault membership lookup failed: {error}"))?
            .ok_or_else(|| "vault membership lookup returned non-membership".to_owned())?;
        if observed_vault_box.as_ref() != expected_vault_box.as_slice() {
            return Err("vault membership lookup returned different box bytes".to_owned());
        }

        let observed_source = verifier
            .perform_one_operation(&Operation::Lookup(Bytes::from(
                refundable_source_box_id.clone(),
            )))
            .map_err(|error| format!("refundable source non-membership lookup failed: {error}"))?;
        if observed_source.is_some() {
            return Err("refundable source lookup returned membership".to_owned());
        }

        verifier
            .digest()
            .map(|digest| digest.to_vec())
            .ok_or_else(|| "Ergo UTXO verifier produced no digest after lookup replay".to_owned())
    }))
    .map_err(|payload| {
        let detail = if let Some(message) = payload.downcast_ref::<&str>() {
            *message
        } else if let Some(message) = payload.downcast_ref::<String>() {
            message.as_str()
        } else {
            "unknown panic"
        };
        format!("Ergo UTXO verifier panicked while replaying the lookup proof: {detail}")
    })??;

    if replay != expected_root {
        return Err("Ergo UTXO lookups changed the supplied state root".to_owned());
    }

    Ok(ErgoUtxoStateLookupResultV1 {
        status: "NON_AUTHORIZING_ERGO_UTXO_STATE_LOOKUPS_ACCEPTED".to_owned(),
        state_root_hex: hex::encode(expected_root),
        vault_box_id_hex: hex::encode(vault_box_id),
        refundable_source_box_id_hex: hex::encode(refundable_source_box_id),
    })
}

fn decode_exact_hex(input: &str, expected_length: usize, label: &str) -> Result<Vec<u8>, String> {
    let decoded = hex::decode(input).map_err(|error| format!("invalid {label} hex: {error}"))?;
    if decoded.len() != expected_length {
        return Err(format!(
            "{label} must be exactly {expected_length} bytes, got {}",
            decoded.len()
        ));
    }
    Ok(decoded)
}

fn max_single_insert_proof_bytes_for_value(height: u8, value_length: usize) -> usize {
    let max_nodes = 2 * usize::from(height) + 2;
    let max_leaf_bytes = 1 + TRACKER_KEY_LENGTH * 2 + value_length;
    max_nodes * max_leaf_bytes + 1 + usize::from(height).div_ceil(8)
}

fn validate_single_insert_proof_shape_for_value(
    proof: &[u8],
    operation_key: &[u8],
    starting_height: u8,
    value_length: usize,
) -> Result<(), String> {
    if proof.is_empty() {
        return Err("AVL insert proof must not be empty".to_owned());
    }

    let max_nodes = 2 * usize::from(starting_height) + 2;
    let mut cursor = 0usize;
    let mut nodes = Vec::<ProofNodeShape>::new();
    let mut stack = Vec::<usize>::new();
    let mut previous_leaf_next_key: Option<[u8; TRACKER_KEY_LENGTH]> = None;

    loop {
        let tag = *proof
            .get(cursor)
            .ok_or_else(|| "truncated AVL insert proof before tree terminator".to_owned())?;
        cursor += 1;
        if tag == END_OF_TREE_IN_PACKAGED_PROOF {
            break;
        }
        if nodes.len() >= max_nodes {
            return Err(format!(
                "AVL insert proof exceeds the one-operation node bound of {max_nodes}"
            ));
        }

        let node = match tag {
            LABEL_IN_PACKAGED_PROOF => {
                take_proof_bytes(proof, &mut cursor, 32, "subtree label")?;
                previous_leaf_next_key = None;
                ProofNodeShape::Label
            }
            LEAF_IN_PACKAGED_PROOF => {
                let key = match previous_leaf_next_key {
                    Some(key) => key,
                    None => take_proof_array::<TRACKER_KEY_LENGTH>(proof, &mut cursor, "leaf key")?,
                };
                let next_key =
                    take_proof_array::<TRACKER_KEY_LENGTH>(proof, &mut cursor, "leaf next key")?;
                take_proof_bytes(proof, &mut cursor, value_length, "leaf value")?;
                previous_leaf_next_key = Some(next_key);
                ProofNodeShape::Leaf { key, next_key }
            }
            0 | 1 | 255 => {
                let right = stack.pop().ok_or_else(|| {
                    "malformed AVL insert proof: internal node has no right child".to_owned()
                })?;
                let left = stack.pop().ok_or_else(|| {
                    "malformed AVL insert proof: internal node has no left child".to_owned()
                })?;
                ProofNodeShape::Internal {
                    left,
                    right,
                    balance: tag as i8,
                }
            }
            _ => {
                return Err(format!(
                    "AVL insert proof uses non-canonical internal balance byte {tag}"
                ));
            }
        };
        nodes.push(node);
        stack.push(nodes.len() - 1);
    }

    if stack.len() != 1 {
        return Err(format!(
            "malformed AVL insert proof: packaged tree has {} roots",
            stack.len()
        ));
    }

    let directions = &proof[cursor..];
    let mut direction_index = 0usize;
    let mut remaining_height = usize::from(starting_height);
    let mut node_index = stack[0];

    loop {
        match &nodes[node_index] {
            ProofNodeShape::Label => {
                return Err(
                    "malformed AVL insert proof: operation path ends at an unresolved subtree"
                        .to_owned(),
                );
            }
            ProofNodeShape::Leaf { key, next_key } => {
                if remaining_height != 0 {
                    return Err(format!(
                        "current tracker digest height does not match the proof path: leaf reached with {remaining_height} levels remaining"
                    ));
                }
                if operation_key == key {
                    return Err("AVL insert replay rejected an existing tracker key".to_owned());
                }
                if operation_key <= key.as_slice() || operation_key >= next_key.as_slice() {
                    return Err(
                        "AVL insert proof directions do not match the supplied tracker key"
                            .to_owned(),
                    );
                }
                break;
            }
            ProofNodeShape::Internal {
                left,
                right,
                balance,
            } => {
                if remaining_height == 0 {
                    return Err(
                        "current tracker digest height does not match the internal proof path"
                            .to_owned(),
                    );
                }
                let direction_byte = directions.get(direction_index >> 3).ok_or_else(|| {
                    "truncated AVL insert proof in operation directions".to_owned()
                })?;
                let go_left = direction_byte & (1 << (direction_index & 7)) != 0;
                direction_index += 1;

                let shorter_child = (go_left && *balance == 1) || (!go_left && *balance == -1);
                let height_drop = if shorter_child { 2 } else { 1 };
                remaining_height = remaining_height.checked_sub(height_drop).ok_or_else(|| {
                    "current tracker digest height is inconsistent with proof balances".to_owned()
                })?;
                node_index = if go_left { *left } else { *right };
            }
        }
    }

    // The pinned verifier consumes only the direction bits reached by the
    // operation. Trailing direction bytes therefore remain verifier-defined.
    // Internal balances are deliberately restricted above to the canonical
    // AVL prover set {-1, 0, +1}; this prevents malformed balances from
    // reaching unchecked rotation paths in the WASM build.

    Ok(())
}

fn take_proof_bytes<'a>(
    proof: &'a [u8],
    cursor: &mut usize,
    length: usize,
    label: &str,
) -> Result<&'a [u8], String> {
    let end = cursor
        .checked_add(length)
        .ok_or_else(|| format!("AVL insert proof {label} length overflow"))?;
    let bytes = proof
        .get(*cursor..end)
        .ok_or_else(|| format!("truncated AVL insert proof in {label}"))?;
    *cursor = end;
    Ok(bytes)
}

fn take_proof_array<const N: usize>(
    proof: &[u8],
    cursor: &mut usize,
    label: &str,
) -> Result<[u8; N], String> {
    take_proof_bytes(proof, cursor, N, label)?
        .try_into()
        .map_err(|_| format!("invalid AVL insert proof {label} length"))
}

fn tracker_insert_impl(
    history_json: &str,
    new_key_hex: &str,
    new_value_hex: &str,
    value_length: usize,
) -> String {
    let history: Vec<KVEntry> =
        serde_json::from_str(history_json).expect("Invalid JSON array of KV entries");
    let new_key = hex::decode(new_key_hex).expect("Invalid hex for new_key");
    let new_value = hex::decode(new_value_hex).expect("Invalid hex for new_value");
    assert_eq!(new_key.len(), 32, "Key must be exactly 32 bytes");
    assert_eq!(
        new_value.len(),
        value_length,
        "Value has wrong fixed length"
    );

    let tree = make_tracker_tree(value_length);
    let mut prover = BatchAVLProver::new(tree, true);

    // Rebuild from history
    for entry in &history {
        let k = hex::decode(&entry.key).expect("Invalid hex key in history");
        let v = hex::decode(&entry.value).expect("Invalid hex value in history");
        assert_eq!(k.len(), 32, "History key must be 32 bytes");
        assert_eq!(
            v.len(),
            value_length,
            "History value has wrong fixed length"
        );
        let op = Operation::Insert(KeyValue {
            key: Bytes::from(k),
            value: Bytes::from(v),
        });
        prover
            .perform_one_operation(&op)
            .expect("Failed to insert history entry");
    }
    let _ = prover.generate_proof(); // flush

    // Lookup first to enforce first-anchor-wins
    let lookup_op = Operation::Lookup(Bytes::from(new_key.clone()));
    let lookup_result = prover
        .perform_one_operation(&lookup_op)
        .expect("Lookup failed");
    assert!(
        lookup_result.is_none(),
        "Key already exists in tracker — first-anchor-wins policy rejects re-insertion"
    );
    let _ = prover.generate_proof(); // flush lookup proof

    // Insert
    let insert_op = Operation::Insert(KeyValue {
        key: Bytes::from(new_key),
        value: Bytes::from(new_value),
    });
    prover
        .perform_one_operation(&insert_op)
        .expect("Insert failed");
    let insert_proof = prover.generate_proof();
    let new_digest = prover.digest().expect("Failed to get digest after insert");

    let result = serde_json::json!({
        "insert_proof_hex": hex::encode(&insert_proof),
        "new_digest_hex": hex::encode(&new_digest),
    });
    serde_json::to_string(&result).expect("Failed to serialize")
}

/// Generate a get proof for an existing key in the SPV tracker.
/// Returns the proof AND the stored value (36 bytes).
///
/// ## Returns
/// JSON: `{ get_proof_hex, value_hex, digest_hex }`
#[wasm_bindgen]
pub fn tracker_get_proof(history_json: &str, lookup_key_hex: &str) -> String {
    tracker_get_proof_impl(history_json, lookup_key_hex, TRACKER_V1_VALUE_LENGTH)
}

/// Generate a get proof for an authenticated V2 tracker entry.
#[wasm_bindgen]
pub fn tracker_v2_get_proof(history_json: &str, lookup_key_hex: &str) -> String {
    tracker_get_proof_impl(history_json, lookup_key_hex, TRACKER_V2_VALUE_LENGTH)
}

/// Generate a get proof for an application-bound V2 tracker entry.
#[wasm_bindgen]
pub fn tracker_application_v2_get_proof(history_json: &str, lookup_key_hex: &str) -> String {
    tracker_get_proof_impl(
        history_json,
        lookup_key_hex,
        TRACKER_APPLICATION_V2_VALUE_LENGTH,
    )
}

/// Generate a membership proof for one pooled-reserve deposit commitment.
#[wasm_bindgen]
pub fn pooled_reserve_get_proof(history_json: &str, lookup_key_hex: &str) -> String {
    tracker_get_proof_impl(history_json, lookup_key_hex, POOLED_RESERVE_VALUE_LENGTH)
}

fn tracker_get_proof_impl(history_json: &str, lookup_key_hex: &str, value_length: usize) -> String {
    let history: Vec<KVEntry> =
        serde_json::from_str(history_json).expect("Invalid JSON array of KV entries");
    let lookup_key = hex::decode(lookup_key_hex).expect("Invalid hex for lookup_key");
    assert_eq!(lookup_key.len(), 32, "Key must be exactly 32 bytes");

    let tree = make_tracker_tree(value_length);
    let mut prover = BatchAVLProver::new(tree, true);

    // Rebuild from history
    for entry in &history {
        let k = hex::decode(&entry.key).expect("Invalid hex key in history");
        let v = hex::decode(&entry.value).expect("Invalid hex value in history");
        assert_eq!(k.len(), 32, "History key must be 32 bytes");
        assert_eq!(
            v.len(),
            value_length,
            "History value has wrong fixed length"
        );
        let op = Operation::Insert(KeyValue {
            key: Bytes::from(k),
            value: Bytes::from(v),
        });
        prover
            .perform_one_operation(&op)
            .expect("Failed to insert history entry");
    }
    let _ = prover.generate_proof(); // flush

    // Lookup to get value
    let lookup_op = Operation::Lookup(Bytes::from(lookup_key));
    let lookup_result = prover
        .perform_one_operation(&lookup_op)
        .expect("Lookup failed");
    let value = lookup_result.expect("Key NOT found — cannot generate get proof");
    let get_proof = prover.generate_proof();
    let digest = prover.digest().expect("Failed to get digest");

    let result = serde_json::json!({
        "get_proof_hex": hex::encode(&get_proof),
        "value_hex": hex::encode(&value),
        "digest_hex": hex::encode(&digest),
    });
    serde_json::to_string(&result).expect("Failed to serialize")
}

/// Generate a non-membership proof (key NOT in tracker).
/// For negative tests.
#[wasm_bindgen]
pub fn tracker_nonmembership_proof(history_json: &str, lookup_key_hex: &str) -> String {
    let history: Vec<KVEntry> =
        serde_json::from_str(history_json).expect("Invalid JSON array of KV entries");
    let lookup_key = hex::decode(lookup_key_hex).expect("Invalid hex for lookup_key");
    assert_eq!(lookup_key.len(), 32, "Key must be exactly 32 bytes");

    let tree = make_tracker_tree(TRACKER_V1_VALUE_LENGTH);
    let mut prover = BatchAVLProver::new(tree, true);

    for entry in &history {
        let k = hex::decode(&entry.key).expect("Invalid hex key");
        let v = hex::decode(&entry.value).expect("Invalid hex value");
        let op = Operation::Insert(KeyValue {
            key: Bytes::from(k),
            value: Bytes::from(v),
        });
        prover.perform_one_operation(&op).expect("Failed to insert");
    }
    let _ = prover.generate_proof();

    let lookup_op = Operation::Lookup(Bytes::from(lookup_key));
    let lookup_result = prover
        .perform_one_operation(&lookup_op)
        .expect("Lookup failed");
    assert!(
        lookup_result.is_none(),
        "Key exists — expected non-membership"
    );
    let proof = prover.generate_proof();
    let digest = prover.digest().expect("Failed to get digest");

    let result = serde_json::json!({
        "nonmembership_proof_hex": hex::encode(&proof),
        "digest_hex": hex::encode(&digest),
    });
    serde_json::to_string(&result).expect("Failed to serialize")
}

/// JSON-deserializable key-value entry for tracker history
#[derive(serde::Deserialize)]
struct KVEntry {
    key: String,
    value: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ErgoUtxoStateLookupVectorV1 {
        schema: String,
        pre_transition_root_hex: String,
        post_transition_root_hex: String,
        proof_hex: String,
        lookups: Vec<ErgoUtxoLookupVectorEntryV1>,
        claim_boundary: String,
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ErgoUtxoLookupVectorEntryV1 {
        kind: String,
        key_hex: String,
        expected_value_hex: Option<String>,
        historical_value_hex: Option<String>,
    }

    fn ergo_utxo_state_lookup_vector_v1() -> ErgoUtxoStateLookupVectorV1 {
        serde_json::from_str(include_str!(
            "../test-vectors/ergo-utxo-state-lookup-v1.json"
        ))
        .unwrap()
    }

    fn verify_ergo_utxo_vector_v1(
        root_hex: &str,
        proof_hex: &str,
        vault_key_hex: &str,
        vault_value_hex: &str,
        source_key_hex: &str,
    ) -> Result<ErgoUtxoStateLookupResultV1, String> {
        verify_ergo_utxo_state_lookups_v1(
            root_hex,
            proof_hex,
            vault_key_hex,
            vault_value_hex,
            source_key_hex,
        )
    }

    fn mutate_hex_byte(value: &str, index: usize) -> String {
        let mut bytes = hex::decode(value).unwrap();
        bytes[index] ^= 0x01;
        hex::encode(bytes)
    }

    fn assert_ergo_utxo_vector_shape(vector: &ErgoUtxoStateLookupVectorV1) {
        assert_eq!(vector.schema, "ergo-utxo-state-lookup-vector-v1");
        assert_eq!(vector.lookups.len(), 2);
        assert_eq!(vector.lookups[0].kind, "membership");
        assert_eq!(vector.lookups[1].kind, "non-membership");
        assert!(vector.lookups[0].expected_value_hex.is_some());
        assert!(vector.lookups[1].expected_value_hex.is_none());
        assert!(vector.lookups[0].historical_value_hex.is_none());
        assert!(vector.lookups[1].historical_value_hex.is_some());
        assert!(vector
            .claim_boundary
            .contains("grants no mint or funds authority"));
    }

    #[test]
    fn ergo_utxo_state_lookup_vector_v1_matches_pinned_jvm() {
        let vector = ergo_utxo_state_lookup_vector_v1();
        assert_ergo_utxo_vector_shape(&vector);
        let vault = &vector.lookups[0];
        let source = &vector.lookups[1];
        let vault_value = vault.expected_value_hex.as_ref().unwrap();

        assert_eq!(
            hex::decode(&vector.post_transition_root_hex).unwrap().len(),
            33
        );
        assert_eq!(hex::decode(&vector.proof_hex).unwrap().len(), 280);
        assert_eq!(hex::decode(vault_value).unwrap().len(), 175);

        let result = verify_ergo_utxo_vector_v1(
            &vector.post_transition_root_hex,
            &vector.proof_hex,
            &vault.key_hex,
            vault_value,
            &source.key_hex,
        )
        .unwrap();

        assert_eq!(
            result.status,
            "NON_AUTHORIZING_ERGO_UTXO_STATE_LOOKUPS_ACCEPTED"
        );
        assert_eq!(result.state_root_hex, vector.post_transition_root_hex);
        assert_eq!(result.vault_box_id_hex, vault.key_hex);
        assert_eq!(result.refundable_source_box_id_hex, source.key_hex);
    }

    #[test]
    fn ergo_utxo_state_lookup_rejects_wrong_root_hash() {
        let vector = ergo_utxo_state_lookup_vector_v1();
        let vault = &vector.lookups[0];
        let source = &vector.lookups[1];

        assert!(verify_ergo_utxo_vector_v1(
            &mutate_hex_byte(&vector.post_transition_root_hex, 0),
            &vector.proof_hex,
            &vault.key_hex,
            vault.expected_value_hex.as_ref().unwrap(),
            &source.key_hex,
        )
        .is_err());
    }

    #[test]
    fn ergo_utxo_state_lookup_result_preserves_root_height_for_header_binding() {
        let vector = ergo_utxo_state_lookup_vector_v1();
        let vault = &vector.lookups[0];
        let source = &vector.lookups[1];
        let alternate_height_root = mutate_hex_byte(&vector.post_transition_root_hex, 32);

        let result = verify_ergo_utxo_vector_v1(
            &alternate_height_root,
            &vector.proof_hex,
            &vault.key_hex,
            vault.expected_value_hex.as_ref().unwrap(),
            &source.key_hex,
        )
        .unwrap();

        assert_eq!(result.state_root_hex, alternate_height_root);
        assert_ne!(result.state_root_hex, vector.post_transition_root_hex);
    }

    #[test]
    fn ergo_utxo_state_lookup_rejects_root_proof_mismatch() {
        let vector = ergo_utxo_state_lookup_vector_v1();
        let vault = &vector.lookups[0];
        let source = &vector.lookups[1];

        assert!(verify_ergo_utxo_vector_v1(
            &vector.pre_transition_root_hex,
            &vector.proof_hex,
            &vault.key_hex,
            vault.expected_value_hex.as_ref().unwrap(),
            &source.key_hex,
        )
        .is_err());
    }

    #[test]
    fn ergo_utxo_state_lookup_reaches_vault_nonmembership_rejection() {
        let vector = ergo_utxo_state_lookup_vector_v1();
        let source = &vector.lookups[1];
        let alternate_absent_key = mutate_hex_byte(&source.key_hex, 31);

        let error = verify_ergo_utxo_vector_v1(
            &vector.post_transition_root_hex,
            &vector.proof_hex,
            &source.key_hex,
            source.historical_value_hex.as_ref().unwrap(),
            &alternate_absent_key,
        )
        .unwrap_err();
        assert!(error.contains("vault membership lookup returned non-membership"));
    }

    #[test]
    fn ergo_utxo_state_lookup_reaches_source_membership_rejection() {
        let vector = ergo_utxo_state_lookup_vector_v1();
        let vault = &vector.lookups[0];
        let source = &vector.lookups[1];
        let vault_value = hex::decode(vault.expected_value_hex.as_ref().unwrap()).unwrap();
        let source_value = hex::decode(source.historical_value_hex.as_ref().unwrap()).unwrap();
        let vault_key = hex::decode(&vault.key_hex).unwrap();
        let source_key = hex::decode(&source.key_hex).unwrap();

        assert_eq!(Blake2b256::digest(&source_value).as_slice(), source_key);

        let mut prover = BatchAVLProver::new(make_ergo_utxo_tree(), true);
        for (key, value) in [
            (vault_key.clone(), vault_value.clone()),
            (source_key.clone(), source_value),
        ] {
            prover
                .perform_one_operation(&Operation::Insert(KeyValue {
                    key: Bytes::from(key),
                    value: Bytes::from(value),
                }))
                .unwrap();
        }
        let _ = prover.generate_proof();
        let root = prover.digest().unwrap().to_vec();
        prover
            .perform_one_operation(&Operation::Lookup(Bytes::from(vault_key)))
            .unwrap();
        prover
            .perform_one_operation(&Operation::Lookup(Bytes::from(source_key)))
            .unwrap();
        let proof = prover.generate_proof().to_vec();

        let error = verify_ergo_utxo_vector_v1(
            &hex::encode(root),
            &hex::encode(proof),
            &vault.key_hex,
            vault.expected_value_hex.as_ref().unwrap(),
            &source.key_hex,
        )
        .unwrap_err();
        assert!(error.contains("refundable source lookup returned membership"));
    }

    #[test]
    fn ergo_utxo_state_lookup_rejects_swapped_lookup_roles() {
        let vector = ergo_utxo_state_lookup_vector_v1();
        let vault = &vector.lookups[0];
        let source = &vector.lookups[1];

        let error = verify_ergo_utxo_vector_v1(
            &vector.post_transition_root_hex,
            &vector.proof_hex,
            &source.key_hex,
            vault.expected_value_hex.as_ref().unwrap(),
            &vault.key_hex,
        )
        .unwrap_err();
        assert!(error.contains("do not derive the supplied vault box ID"));
    }

    #[test]
    fn ergo_utxo_state_lookup_rejects_mutated_vault_box_bytes() {
        let vector = ergo_utxo_state_lookup_vector_v1();
        let vault = &vector.lookups[0];
        let source = &vector.lookups[1];
        let mutated_value = mutate_hex_byte(vault.expected_value_hex.as_ref().unwrap(), 16);

        let error = verify_ergo_utxo_vector_v1(
            &vector.post_transition_root_hex,
            &vector.proof_hex,
            &vault.key_hex,
            &mutated_value,
            &source.key_hex,
        )
        .unwrap_err();
        assert!(error.contains("do not derive the supplied vault box ID"));
    }

    #[test]
    fn ergo_utxo_state_lookup_rejects_member_reused_as_absent_source() {
        let vector = ergo_utxo_state_lookup_vector_v1();
        let vault = &vector.lookups[0];

        let error = verify_ergo_utxo_vector_v1(
            &vector.post_transition_root_hex,
            &vector.proof_hex,
            &vault.key_hex,
            vault.expected_value_hex.as_ref().unwrap(),
            &vault.key_hex,
        )
        .unwrap_err();
        assert!(error.contains("must be distinct"));
    }

    #[test]
    fn ergo_utxo_state_lookup_rejects_truncated_proof() {
        let vector = ergo_utxo_state_lookup_vector_v1();
        let vault = &vector.lookups[0];
        let source = &vector.lookups[1];
        let mut proof = hex::decode(&vector.proof_hex).unwrap();
        proof.pop();

        assert!(verify_ergo_utxo_vector_v1(
            &vector.post_transition_root_hex,
            &hex::encode(proof),
            &vault.key_hex,
            vault.expected_value_hex.as_ref().unwrap(),
            &source.key_hex,
        )
        .is_err());
    }

    #[test]
    fn ergo_utxo_state_lookup_rejects_mutated_proof() {
        let vector = ergo_utxo_state_lookup_vector_v1();
        let vault = &vector.lookups[0];
        let source = &vector.lookups[1];

        assert!(verify_ergo_utxo_vector_v1(
            &vector.post_transition_root_hex,
            &mutate_hex_byte(&vector.proof_hex, 16),
            &vault.key_hex,
            vault.expected_value_hex.as_ref().unwrap(),
            &source.key_hex,
        )
        .is_err());
    }

    #[test]
    fn ergo_utxo_state_lookup_result_preserves_requested_absence_key() {
        let vector = ergo_utxo_state_lookup_vector_v1();
        let vault = &vector.lookups[0];
        let source = &vector.lookups[1];
        let alternate_absent_key = mutate_hex_byte(&source.key_hex, 31);

        let result = verify_ergo_utxo_vector_v1(
            &vector.post_transition_root_hex,
            &vector.proof_hex,
            &vault.key_hex,
            vault.expected_value_hex.as_ref().unwrap(),
            &alternate_absent_key,
        )
        .unwrap();

        assert_eq!(result.refundable_source_box_id_hex, alternate_absent_key);
        assert_ne!(result.refundable_source_box_id_hex, source.key_hex);
    }

    struct TrackerV2InsertFixture {
        current_digest: Vec<u8>,
        key: Vec<u8>,
        value: Vec<u8>,
        proof: Vec<u8>,
        successor_digest: Vec<u8>,
    }

    fn tracker_v2_insert_fixture(
        history: &[(Vec<u8>, Vec<u8>)],
        key: Vec<u8>,
        value: Vec<u8>,
    ) -> TrackerV2InsertFixture {
        let mut prover = BatchAVLProver::new(make_tracker_tree(TRACKER_V2_VALUE_LENGTH), true);
        for (history_key, history_value) in history {
            prover
                .perform_one_operation(&Operation::Insert(KeyValue {
                    key: Bytes::copy_from_slice(history_key),
                    value: Bytes::copy_from_slice(history_value),
                }))
                .unwrap();
        }
        if !history.is_empty() {
            let _ = prover.generate_proof();
        }

        let current_digest = prover.digest().unwrap().to_vec();
        prover
            .perform_one_operation(&Operation::Insert(KeyValue {
                key: Bytes::copy_from_slice(&key),
                value: Bytes::copy_from_slice(&value),
            }))
            .unwrap();
        let proof = prover.generate_proof().to_vec();
        let successor_digest = prover.digest().unwrap().to_vec();

        TrackerV2InsertFixture {
            current_digest,
            key,
            value,
            proof,
            successor_digest,
        }
    }

    fn verify_tracker_v2_fixture(
        fixture: &TrackerV2InsertFixture,
    ) -> Result<TrackerVerifyInsertResult, String> {
        let json = tracker_v2_verify_insert_impl(
            &hex::encode(&fixture.current_digest),
            &hex::encode(&fixture.key),
            &hex::encode(&fixture.value),
            &hex::encode(&fixture.proof),
        )?;
        serde_json::from_str(&json).map_err(|error| error.to_string())
    }

    fn non_empty_tracker_v2_fixture() -> TrackerV2InsertFixture {
        let history = vec![
            (
                vec![0x20; TRACKER_KEY_LENGTH],
                vec![0x21; TRACKER_V2_VALUE_LENGTH],
            ),
            (
                vec![0x80; TRACKER_KEY_LENGTH],
                vec![0x81; TRACKER_V2_VALUE_LENGTH],
            ),
            (
                vec![0xc0; TRACKER_KEY_LENGTH],
                vec![0xc1; TRACKER_V2_VALUE_LENGTH],
            ),
        ];
        tracker_v2_insert_fixture(
            &history,
            vec![0x40; TRACKER_KEY_LENGTH],
            vec![0x41; TRACKER_V2_VALUE_LENGTH],
        )
    }

    #[test]
    fn test_empty_digest() {
        let digest = empty_digest();
        // Known empty digest with key_length=32, value_length=Some(1)
        assert!(!digest.is_empty());
        assert!(digest.ends_with("00")); // Trailing height byte
        println!("Empty digest: {}", digest);
    }

    #[test]
    fn test_lookup_and_insert_empty_tree() {
        let fake_txid = "aa".repeat(32); // 32-byte fake TX ID
        let result_json = bridge_generate_proofs("[]", &fake_txid);
        let result: BridgeProofResult = serde_json::from_str(&result_json).unwrap();

        assert!(!result.lookup_proof_hex.is_empty());
        assert!(!result.insert_proof_hex.is_empty());
        assert!(!result.new_digest_hex.is_empty());
        // Digest should have changed from empty
        assert_ne!(result.new_digest_hex, empty_digest());
        println!("Lookup proof: {} bytes", result.lookup_proof_hex.len() / 2);
        println!("Insert proof: {} bytes", result.insert_proof_hex.len() / 2);
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
    fn test_batch_insert_proofs() {
        let history =
            serde_json::to_string(&vec!["11".repeat(32), "22".repeat(32), "33".repeat(32)])
                .unwrap();
        let batch = serde_json::to_string(&vec![
            "44".repeat(32),
            "55".repeat(32),
            "66".repeat(32),
            "77".repeat(32),
            "88".repeat(32),
        ])
        .unwrap();

        let result_json = bridge_generate_batch_insert_proofs(&history, &batch);
        let result: BridgeBatchProofResult = serde_json::from_str(&result_json).unwrap();

        assert_eq!(result.lookup_proofs_hex.len(), 5);
        assert!(!result.insert_proof_hex.is_empty());
        assert!(!result.new_digest_hex.is_empty());
        for proof in &result.lookup_proofs_hex {
            assert!(!proof.is_empty());
        }
        println!(
            "Batch lookup proofs: {} items",
            result.lookup_proofs_hex.len()
        );
        println!(
            "Batch insert proof: {} bytes",
            result.insert_proof_hex.len() / 2
        );
    }

    #[test]
    fn test_batch_insert_proof_is_not_last_or_concatenated_single_proofs() {
        let history_keys = vec!["11".repeat(32), "22".repeat(32), "33".repeat(32)];
        let new_keys = vec!["44".repeat(32), "55".repeat(32), "66".repeat(32)];

        let history = serde_json::to_string(&history_keys).unwrap();
        let batch = serde_json::to_string(&new_keys).unwrap();
        let result_json = bridge_generate_batch_insert_proofs(&history, &batch);
        let result: BridgeBatchProofResult = serde_json::from_str(&result_json).unwrap();

        let tree = make_empty_tree();
        let mut prover = BatchAVLProver::new(tree, true);
        for key_hex in &history_keys {
            let op = Operation::Insert(KeyValue {
                key: Bytes::from(hex::decode(key_hex).unwrap()),
                value: Bytes::from_static(&[0x01]),
            });
            prover.perform_one_operation(&op).unwrap();
        }
        let _ = prover.generate_proof();

        let mut sequential_single_proofs = Vec::new();
        for key_hex in &new_keys {
            let op = Operation::Insert(KeyValue {
                key: Bytes::from(hex::decode(key_hex).unwrap()),
                value: Bytes::from_static(&[0x01]),
            });
            prover.perform_one_operation(&op).unwrap();
            sequential_single_proofs.push(prover.generate_proof());
        }

        let sequential_digest = hex::encode(prover.digest().unwrap());
        let last_single_proof = hex::encode(sequential_single_proofs.last().unwrap());
        let concatenated_single_proofs = hex::encode(
            sequential_single_proofs
                .iter()
                .flat_map(|proof| proof.iter().copied())
                .collect::<Vec<_>>(),
        );

        assert_eq!(
            result.new_digest_hex, sequential_digest,
            "The wrong proof strategies still reach the same final tree digest",
        );
        assert_ne!(
            result.insert_proof_hex, last_single_proof,
            "Batch insert proof must not be the last sequential single-key proof",
        );
        assert_ne!(
            result.insert_proof_hex, concatenated_single_proofs,
            "Batch insert proof must not be concatenated sequential single-key proofs",
        );
    }

    #[test]
    #[should_panic(expected = "Duplicate key in batch")]
    fn test_batch_duplicate_key_panics() {
        let batch = serde_json::to_string(&vec!["44".repeat(32), "44".repeat(32)]).unwrap();
        bridge_generate_batch_insert_proofs("[]", &batch);
    }

    #[test]
    #[should_panic(expected = "already exists")]
    fn test_double_insert_panics() {
        let key1 = "ee".repeat(32);
        let history = serde_json::to_string(&vec![&key1]).unwrap();
        // Trying to insert a key that's already in history should panic
        bridge_generate_proofs(&history, &key1);
    }

    // ── Spike 3: SPV Tracker tests ──────────────────────────────────

    #[test]
    fn test_tracker_empty_digest() {
        let digest = tracker_empty_digest();
        assert!(!digest.is_empty());
        assert!(digest.ends_with("00"));
        // Must differ from DUP empty digest (different value length)
        assert_ne!(digest, empty_digest());
        println!("Tracker empty digest: {}", digest);
        println!("DUP empty digest:     {}", empty_digest());
    }

    #[test]
    fn test_pooled_reserve_empty_digest_accepts_first_commitment_insert() {
        let genesis_digest = pooled_reserve_empty_digest();
        assert_ne!(genesis_digest, empty_digest());

        let key = "ab".repeat(TRACKER_KEY_LENGTH);
        let value = "cd".repeat(POOLED_RESERVE_VALUE_LENGTH);
        let insert_result = pooled_reserve_insert("[]", &key, &value);
        let insert: serde_json::Value = serde_json::from_str(&insert_result).unwrap();
        let proof = insert["insert_proof_hex"].as_str().unwrap();
        let successor_digest = insert["new_digest_hex"].as_str().unwrap();

        let verified = pooled_reserve_verify_insert(&genesis_digest, &key, &value, proof).unwrap();
        let verified: TrackerVerifyInsertResult = serde_json::from_str(&verified).unwrap();
        assert_eq!(verified.new_digest_hex, successor_digest);
    }

    #[test]
    fn test_pooled_reserve_non_empty_insert_replay_and_rejection_matrix() {
        let first_key = "ab".repeat(TRACKER_KEY_LENGTH);
        let first_value = "cd".repeat(POOLED_RESERVE_VALUE_LENGTH);
        let second_key = "ac".repeat(TRACKER_KEY_LENGTH);
        let second_value = "ce".repeat(POOLED_RESERVE_VALUE_LENGTH);

        let first_insert = pooled_reserve_insert("[]", &first_key, &first_value);
        let first_insert: serde_json::Value = serde_json::from_str(&first_insert).unwrap();
        let current_digest = first_insert["new_digest_hex"].as_str().unwrap();
        let history = serde_json::to_string(&vec![serde_json::json!({
            "key": first_key,
            "value": first_value,
        })])
        .unwrap();

        let second_insert = pooled_reserve_insert(&history, &second_key, &second_value);
        let second_insert: serde_json::Value = serde_json::from_str(&second_insert).unwrap();
        let proof = second_insert["insert_proof_hex"].as_str().unwrap();
        let successor_digest = second_insert["new_digest_hex"].as_str().unwrap();
        let verified =
            pooled_reserve_verify_insert(current_digest, &second_key, &second_value, proof)
                .unwrap();
        let verified: TrackerVerifyInsertResult = serde_json::from_str(&verified).unwrap();
        assert_eq!(verified.new_digest_hex, successor_digest);

        let wrong_start = format!("00{}", &current_digest[2..]);
        assert!(tracker_verify_insert_impl(
            &wrong_start,
            &second_key,
            &second_value,
            proof,
            POOLED_RESERVE_VALUE_LENGTH,
        )
        .is_err());
        let wrong_key = tracker_verify_insert_impl(
            current_digest,
            &"ad".repeat(TRACKER_KEY_LENGTH),
            &second_value,
            proof,
            POOLED_RESERVE_VALUE_LENGTH,
        );
        if let Ok(wrong_key) = wrong_key {
            let wrong_key: TrackerVerifyInsertResult = serde_json::from_str(&wrong_key).unwrap();
            assert_ne!(
                wrong_key.new_digest_hex, successor_digest,
                "A different key must not reproduce the observed successor digest",
            );
        }

        let wrong_value = tracker_verify_insert_impl(
            current_digest,
            &second_key,
            &"cf".repeat(POOLED_RESERVE_VALUE_LENGTH),
            proof,
            POOLED_RESERVE_VALUE_LENGTH,
        )
        .unwrap();
        let wrong_value: TrackerVerifyInsertResult = serde_json::from_str(&wrong_value).unwrap();
        assert_ne!(wrong_value.new_digest_hex, successor_digest);

        let mut mutated_proof = hex::decode(proof).unwrap();
        mutated_proof[1] ^= 0x01;
        assert!(tracker_verify_insert_impl(
            current_digest,
            &second_key,
            &second_value,
            &hex::encode(mutated_proof),
            POOLED_RESERVE_VALUE_LENGTH,
        )
        .is_err());
        assert!(std::panic::catch_unwind(|| {
            tracker_insert_impl(
                &history,
                &first_key,
                &second_value,
                POOLED_RESERVE_VALUE_LENGTH,
            )
        })
        .is_err());
        assert!(std::panic::catch_unwind(|| {
            tracker_insert_impl(
                "[]",
                &second_key,
                &"ce".repeat(POOLED_RESERVE_VALUE_LENGTH - 1),
                POOLED_RESERVE_VALUE_LENGTH,
            )
        })
        .is_err());
    }

    #[test]
    fn test_pooled_reserve_descendant_membership_and_rejection_matrix() {
        let first_key = "ab".repeat(TRACKER_KEY_LENGTH);
        let first_value = "cd".repeat(POOLED_RESERVE_VALUE_LENGTH);
        let second_key = "ac".repeat(TRACKER_KEY_LENGTH);
        let second_value = "ce".repeat(POOLED_RESERVE_VALUE_LENGTH);
        let history = serde_json::to_string(&vec![
            serde_json::json!({"key": first_key, "value": first_value}),
            serde_json::json!({"key": second_key, "value": second_value}),
        ])
        .unwrap();

        let proof_packet = pooled_reserve_get_proof(&history, &first_key);
        let proof_packet: serde_json::Value = serde_json::from_str(&proof_packet).unwrap();
        let digest = proof_packet["digest_hex"].as_str().unwrap();
        let proof = proof_packet["get_proof_hex"].as_str().unwrap();

        let verified =
            pooled_reserve_verify_membership(digest, &first_key, &first_value, proof).unwrap();
        let verified: TrackerVerifyMembershipResult = serde_json::from_str(&verified).unwrap();
        assert_eq!(verified.digest_hex, digest);
        assert_eq!(verified.value_hex, first_value);

        let wrong_digest = format!("00{}", &digest[2..]);
        assert!(tracker_verify_membership_impl(
            &wrong_digest,
            &first_key,
            &first_value,
            proof,
            POOLED_RESERVE_VALUE_LENGTH,
        )
        .is_err());
        assert!(tracker_verify_membership_impl(
            digest,
            &second_key,
            &first_value,
            proof,
            POOLED_RESERVE_VALUE_LENGTH,
        )
        .is_err());
        assert!(tracker_verify_membership_impl(
            digest,
            &first_key,
            &"cf".repeat(POOLED_RESERVE_VALUE_LENGTH),
            proof,
            POOLED_RESERVE_VALUE_LENGTH,
        )
        .is_err());

        let mut mutated_proof = hex::decode(proof).unwrap();
        mutated_proof[1] ^= 0x01;
        assert!(tracker_verify_membership_impl(
            digest,
            &first_key,
            &first_value,
            &hex::encode(mutated_proof),
            POOLED_RESERVE_VALUE_LENGTH,
        )
        .is_err());
        assert!(tracker_verify_membership_impl(
            digest,
            &first_key,
            &first_value,
            "",
            POOLED_RESERVE_VALUE_LENGTH,
        )
        .is_err());
    }

    #[test]
    fn test_tracker_insert_and_get() {
        let key = "ab".repeat(32); // 32-byte key (64 hex chars)
        let event_root = "cd".repeat(32); // 32-byte event root
        let anchor_height = "000003e8"; // 1000 in BE
        let value = format!("{}{}", event_root, anchor_height); // 36 bytes

        // Insert into empty tracker
        let insert_result = tracker_insert("[]", &key, &value);
        let parsed: serde_json::Value = serde_json::from_str(&insert_result).unwrap();
        let new_digest = parsed["new_digest_hex"].as_str().unwrap();
        assert!(!new_digest.is_empty());
        println!(
            "Insert proof: {} bytes",
            parsed["insert_proof_hex"].as_str().unwrap().len() / 2
        );

        // Get the value back
        let history =
            serde_json::to_string(&vec![serde_json::json!({"key": key, "value": value})]).unwrap();
        let get_result = tracker_get_proof(&history, &key);
        let get_parsed: serde_json::Value = serde_json::from_str(&get_result).unwrap();
        let retrieved_value = get_parsed["value_hex"].as_str().unwrap();
        assert_eq!(
            retrieved_value, value,
            "Retrieved value must match inserted value"
        );
        println!(
            "Get proof: {} bytes",
            get_parsed["get_proof_hex"].as_str().unwrap().len() / 2
        );
        println!("Retrieved value: {}", retrieved_value);
    }

    #[test]
    fn test_authenticated_tracker_v2_insert_and_get() {
        let key = "ac".repeat(32);
        let value = "de".repeat(TRACKER_V2_VALUE_LENGTH);

        let insert_result = tracker_v2_insert("[]", &key, &value);
        let parsed: serde_json::Value = serde_json::from_str(&insert_result).unwrap();
        let new_digest = parsed["new_digest_hex"].as_str().unwrap();
        assert!(!new_digest.is_empty());
        assert_ne!(new_digest, tracker_v2_empty_digest());

        let history =
            serde_json::to_string(&vec![serde_json::json!({"key": key, "value": value})]).unwrap();
        let get_result = tracker_v2_get_proof(&history, &key);
        let get_parsed: serde_json::Value = serde_json::from_str(&get_result).unwrap();
        assert_eq!(get_parsed["value_hex"].as_str().unwrap(), value);
        assert_eq!(get_parsed["digest_hex"].as_str().unwrap(), new_digest);
    }

    #[test]
    fn test_application_tracker_v2_insert_get_and_verify_are_schema_isolated() {
        let key = "ad".repeat(TRACKER_KEY_LENGTH);
        let v1_value = "de".repeat(TRACKER_V2_VALUE_LENGTH);
        let application_value = "df".repeat(TRACKER_APPLICATION_V2_VALUE_LENGTH);
        let v1_empty_digest = tracker_v2_empty_digest();
        let application_empty_digest = tracker_application_v2_empty_digest();
        assert_ne!(application_empty_digest, v1_empty_digest);

        let v1_insert = tracker_v2_insert("[]", &key, &v1_value);
        let v1_parsed: serde_json::Value = serde_json::from_str(&v1_insert).unwrap();
        let v1_proof = v1_parsed["insert_proof_hex"].as_str().unwrap();
        let v1_successor = v1_parsed["new_digest_hex"].as_str().unwrap();

        let application_insert = tracker_application_v2_insert("[]", &key, &application_value);
        let application_parsed: serde_json::Value =
            serde_json::from_str(&application_insert).unwrap();
        let application_proof = application_parsed["insert_proof_hex"].as_str().unwrap();
        let application_successor = application_parsed["new_digest_hex"].as_str().unwrap();

        let v1_verified =
            tracker_v2_verify_insert_impl(&v1_empty_digest, &key, &v1_value, v1_proof).unwrap();
        let v1_verified: TrackerVerifyInsertResult = serde_json::from_str(&v1_verified).unwrap();
        assert_eq!(v1_verified.new_digest_hex, v1_successor);

        let application_verified = tracker_application_v2_verify_insert_impl(
            &application_empty_digest,
            &key,
            &application_value,
            application_proof,
        )
        .unwrap();
        let application_verified: TrackerVerifyInsertResult =
            serde_json::from_str(&application_verified).unwrap();
        assert_eq!(application_verified.new_digest_hex, application_successor);

        let v1_history = serde_json::to_string(&vec![serde_json::json!({
            "key": key.clone(),
            "value": v1_value.clone(),
        })])
        .unwrap();
        let application_history = serde_json::to_string(&vec![serde_json::json!({
            "key": key.clone(),
            "value": application_value.clone(),
        })])
        .unwrap();
        let v1_get: serde_json::Value =
            serde_json::from_str(&tracker_v2_get_proof(&v1_history, &key)).unwrap();
        assert_eq!(v1_get["value_hex"].as_str().unwrap(), v1_value);
        assert_eq!(v1_get["digest_hex"].as_str().unwrap(), v1_successor);
        let application_get: serde_json::Value = serde_json::from_str(
            &tracker_application_v2_get_proof(&application_history, &key),
        )
        .unwrap();
        assert_eq!(
            application_get["value_hex"].as_str().unwrap(),
            application_value
        );
        assert_eq!(
            application_get["digest_hex"].as_str().unwrap(),
            application_successor
        );

        assert!(tracker_application_v2_verify_insert_impl(
            &application_empty_digest,
            &key,
            &application_value,
            v1_proof,
        )
        .is_err());
        assert!(tracker_v2_verify_insert_impl(
            &v1_empty_digest,
            &key,
            &v1_value,
            application_proof,
        )
        .is_err());
        assert!(tracker_application_v2_verify_insert_impl(
            &v1_empty_digest,
            &key,
            &application_value,
            application_proof,
        )
        .is_err());
        assert!(tracker_v2_verify_insert_impl(
            &application_empty_digest,
            &key,
            &v1_value,
            v1_proof,
        )
        .is_err());
        assert!(tracker_v2_verify_insert_impl(
            &v1_empty_digest,
            &key,
            &application_value,
            v1_proof,
        )
        .is_err());
        assert!(tracker_application_v2_verify_insert_impl(
            &application_empty_digest,
            &key,
            &v1_value,
            application_proof,
        )
        .is_err());
        assert!(std::panic::catch_unwind(|| {
            tracker_application_v2_get_proof(&v1_history, &key)
        })
        .is_err());
        assert!(
            std::panic::catch_unwind(|| tracker_v2_get_proof(&application_history, &key)).is_err()
        );
    }

    #[test]
    fn test_tracker_v2_verify_insert_from_empty_history_matches_successor_digest() {
        let fixture = tracker_v2_insert_fixture(
            &[],
            vec![0x40; TRACKER_KEY_LENGTH],
            vec![0x41; TRACKER_V2_VALUE_LENGTH],
        );

        let verified = verify_tracker_v2_fixture(&fixture).unwrap();
        assert_eq!(
            verified.new_digest_hex,
            hex::encode(fixture.successor_digest)
        );
    }

    #[test]
    fn test_tracker_v2_verify_insert_from_non_empty_history_matches_successor_digest() {
        let fixture = non_empty_tracker_v2_fixture();

        let verified = verify_tracker_v2_fixture(&fixture).unwrap();
        assert_eq!(
            verified.new_digest_hex,
            hex::encode(fixture.successor_digest)
        );
    }

    #[test]
    fn test_tracker_v2_verify_insert_rejects_wrong_starting_digest_and_key() {
        let fixture = non_empty_tracker_v2_fixture();
        let mut wrong_digest = fixture.current_digest.clone();
        wrong_digest[0] ^= 0x01;
        let wrong_digest_result = tracker_v2_verify_insert_impl(
            &hex::encode(wrong_digest),
            &hex::encode(&fixture.key),
            &hex::encode(&fixture.value),
            &hex::encode(&fixture.proof),
        );
        assert!(wrong_digest_result.is_err());

        let mut wrong_height_digest = fixture.current_digest.clone();
        wrong_height_digest[AVL_DIGEST_LENGTH - 1] += 1;
        let wrong_height_result = tracker_v2_verify_insert_impl(
            &hex::encode(wrong_height_digest),
            &hex::encode(&fixture.key),
            &hex::encode(&fixture.value),
            &hex::encode(&fixture.proof),
        );
        assert!(wrong_height_result.is_err());

        let wrong_key_result = tracker_v2_verify_insert_impl(
            &hex::encode(&fixture.current_digest),
            &hex::encode(vec![0xe0; TRACKER_KEY_LENGTH]),
            &hex::encode(&fixture.value),
            &hex::encode(&fixture.proof),
        );
        assert!(wrong_key_result.is_err());
    }

    #[test]
    fn test_tracker_v2_verify_insert_wrong_value_changes_successor_digest() {
        let fixture = non_empty_tracker_v2_fixture();
        let wrong_value_json = tracker_v2_verify_insert_impl(
            &hex::encode(&fixture.current_digest),
            &hex::encode(&fixture.key),
            &hex::encode(vec![0x42; TRACKER_V2_VALUE_LENGTH]),
            &hex::encode(&fixture.proof),
        )
        .unwrap();
        let wrong_value: TrackerVerifyInsertResult =
            serde_json::from_str(&wrong_value_json).unwrap();

        assert_ne!(
            wrong_value.new_digest_hex,
            hex::encode(fixture.successor_digest),
            "A different fixed-width value must not reproduce the observed successor digest",
        );
    }

    #[test]
    fn test_tracker_v2_verify_insert_rejects_mutated_and_truncated_proofs() {
        let fixture = non_empty_tracker_v2_fixture();
        let mut mutated_proof = fixture.proof.clone();
        mutated_proof[1] ^= 0x01;
        let mutated_result = tracker_v2_verify_insert_impl(
            &hex::encode(&fixture.current_digest),
            &hex::encode(&fixture.key),
            &hex::encode(&fixture.value),
            &hex::encode(mutated_proof),
        );
        assert!(mutated_result.is_err());

        let mut truncated_proof = fixture.proof.clone();
        truncated_proof.pop();
        let truncated_result = tracker_v2_verify_insert_impl(
            &hex::encode(&fixture.current_digest),
            &hex::encode(&fixture.key),
            &hex::encode(&fixture.value),
            &hex::encode(truncated_proof),
        );
        assert!(truncated_result.is_err());
    }

    #[test]
    fn test_tracker_v2_verify_insert_rejects_invalid_input_and_existing_key() {
        let fixture = non_empty_tracker_v2_fixture();
        let digest_hex = hex::encode(&fixture.current_digest);
        let key_hex = hex::encode(&fixture.key);
        let value_hex = hex::encode(&fixture.value);
        let proof_hex = hex::encode(&fixture.proof);

        assert!(tracker_v2_verify_insert_impl("00", &key_hex, &value_hex, &proof_hex).is_err());
        assert!(tracker_v2_verify_insert_impl(&digest_hex, "00", &value_hex, &proof_hex).is_err());
        assert!(tracker_v2_verify_insert_impl(&digest_hex, &key_hex, "00", &proof_hex).is_err());
        assert!(tracker_v2_verify_insert_impl(&digest_hex, &key_hex, &value_hex, "zz").is_err());

        let existing_key = vec![0x40; TRACKER_KEY_LENGTH];
        let existing_value = vec![0x41; TRACKER_V2_VALUE_LENGTH];
        let mut prover = BatchAVLProver::new(make_tracker_tree(TRACKER_V2_VALUE_LENGTH), true);
        prover
            .perform_one_operation(&Operation::Insert(KeyValue {
                key: Bytes::copy_from_slice(&existing_key),
                value: Bytes::copy_from_slice(&existing_value),
            }))
            .unwrap();
        let _ = prover.generate_proof();
        let digest = prover.digest().unwrap();
        let lookup = Operation::Lookup(Bytes::copy_from_slice(&existing_key));
        assert!(prover.perform_one_operation(&lookup).unwrap().is_some());
        let existing_key_proof = prover.generate_proof();

        let existing_result = tracker_v2_verify_insert_impl(
            &hex::encode(digest),
            &hex::encode(existing_key),
            &hex::encode(vec![0x42; TRACKER_V2_VALUE_LENGTH]),
            &hex::encode(existing_key_proof),
        );
        assert!(existing_result.is_err());
        assert!(existing_result
            .unwrap_err()
            .contains("existing tracker key"));
    }

    #[test]
    fn test_tracker_v2_preflight_rejects_noncanonical_internal_balance() {
        let mut proof = vec![LABEL_IN_PACKAGED_PROOF];
        proof.extend_from_slice(&[0x11; 32]);
        proof.push(LABEL_IN_PACKAGED_PROOF);
        proof.extend_from_slice(&[0x22; 32]);
        proof.push(0x7f);
        proof.push(END_OF_TREE_IN_PACKAGED_PROOF);
        proof.push(0);

        let error = validate_single_insert_proof_shape_for_value(
            &proof,
            &[0x40; TRACKER_KEY_LENGTH],
            1,
            TRACKER_V2_VALUE_LENGTH,
        )
        .unwrap_err();
        assert!(error.contains("non-canonical internal balance"));
    }

    #[test]
    #[should_panic(expected = "wrong fixed length")]
    fn test_authenticated_tracker_v2_rejects_legacy_value_length() {
        tracker_v2_insert(
            "[]",
            &"ad".repeat(32),
            &"ef".repeat(TRACKER_V1_VALUE_LENGTH),
        );
    }

    #[test]
    #[should_panic(expected = "first-anchor-wins")]
    fn test_tracker_first_anchor_wins() {
        let key = "ee".repeat(32); // 32-byte key (avoid 0xff — positive infinity sentinel)
        let value1 = format!("{}{}", "aa".repeat(32), "000003e8"); // anchor at 1000
        let value2 = format!("{}{}", "aa".repeat(32), "000007d0"); // anchor at 2000

        // First insert succeeds
        let _ = tracker_insert("[]", &key, &value1);

        // Second insert with same key but different anchor MUST fail
        let history =
            serde_json::to_string(&vec![serde_json::json!({"key": key, "value": value1})]).unwrap();
        tracker_insert(&history, &key, &value2); // should panic
    }

    #[test]
    fn test_tracker_nonmembership() {
        let key1 = "ab".repeat(32);
        let value1 = format!("{}{}", "cd".repeat(32), "000003e8");
        let unknown_key = "99".repeat(32);

        let history =
            serde_json::to_string(&vec![serde_json::json!({"key": key1, "value": value1})])
                .unwrap();

        let result = tracker_nonmembership_proof(&history, &unknown_key);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert!(!parsed["nonmembership_proof_hex"]
            .as_str()
            .unwrap()
            .is_empty());
        println!(
            "Non-membership proof: {} bytes",
            parsed["nonmembership_proof_hex"].as_str().unwrap().len() / 2
        );
    }

    #[test]
    fn test_membership_lookup_schema_a() {
        // Insert some keys, then prove membership for one
        let key1 = "11".repeat(32);
        let key2 = "22".repeat(32);
        let key3 = "33".repeat(32);

        let history = serde_json::to_string(&vec![&key1, &key2, &key3]).unwrap();
        let result = bridge_lookup_membership(&history, &key2);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert!(!parsed["lookup_proof_hex"].as_str().unwrap().is_empty());
        println!(
            "Membership proof: {} bytes",
            parsed["lookup_proof_hex"].as_str().unwrap().len() / 2
        );
    }

    #[test]
    #[should_panic(expected = "NOT found")]
    fn test_membership_lookup_nonexistent_panics() {
        let key1 = "11".repeat(32);
        let unknown = "99".repeat(32);
        let history = serde_json::to_string(&vec![&key1]).unwrap();
        bridge_lookup_membership(&history, &unknown); // should panic
    }
}
