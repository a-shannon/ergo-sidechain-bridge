#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

#[cfg(feature = "application-v2")]
mod causal_profile;
mod node_codec;
#[cfg(feature = "pooled-reserve-burn-v4")]
mod pooled_reserve_burn_v4;
#[cfg(feature = "pooled-reserve-burn-v5")]
mod pooled_reserve_burn_v5;

#[cfg(feature = "application-v2")]
pub use causal_profile::{
    decode_causal_application_profile_state_v2, verify_active_causal_application_profile_state_v2,
    CausalApplicationBindingV2, CausalApplicationProfileV2, CausalProfileStateError,
    VerifiedActiveCausalApplicationProfileStateV2, CAUSAL_APPLICATION_PROFILE_V2_SCALE_BYTES,
    CAUSAL_ENFORCEMENT_STORAGE_KEY_V2, CURRENT_CAUSAL_PROFILE_STORAGE_KEY_V2,
};
#[cfg(feature = "pooled-reserve-burn-v4")]
pub use pooled_reserve_burn_v4::{
    verify_active_pooled_reserve_runtime_state_v4,
    verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v4,
    BridgePooledReserveRuntimeStateErrorV4, PooledReserveRuntimeStateErrorV4,
    VerifiedActivePooledReserveRuntimeStateV4, VerifiedBridgePooledReserveRuntimeStateV4,
    BRIDGE_ADDRESS_STORAGE_KEY, MAX_POOLED_RESERVE_STATE_PROOF_BYTES_V4,
    MAX_POOLED_RESERVE_STATE_PROOF_NODES_V4, MAX_POOLED_RESERVE_STATE_PROOF_NODE_BYTES_V4,
    MAX_SOURCE_RUNTIME_CODE_BYTES_V4, POOLED_RESERVE_ENFORCEMENT_STORAGE_KEY_V4,
    POOLED_RESERVE_RUNTIME_PROFILE_STORAGE_KEY_V4, RUNTIME_CODE_STORAGE_KEY,
};

#[cfg(feature = "pooled-reserve-burn-v5")]
pub use pooled_reserve_burn_v5::{
    verify_active_pooled_reserve_runtime_state_v5,
    verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v5,
    BridgePooledReserveRuntimeStateErrorV5, PooledReserveRuntimeStateErrorV5,
    VerifiedActivePooledReserveRuntimeStateV5, VerifiedBridgePooledReserveRuntimeStateV5,
    MAX_POOLED_RESERVE_STATE_PROOF_BYTES_V5, MAX_POOLED_RESERVE_STATE_PROOF_NODES_V5,
    MAX_POOLED_RESERVE_STATE_PROOF_NODE_BYTES_V5, MAX_SOURCE_RUNTIME_CODE_BYTES_V5,
    SUDO_KEY_STORAGE_KEY_V5,
};

use alloc::{collections::BTreeSet, vec::Vec};

use blake2::{digest::consts::U32, Blake2b, Digest};
use hash256_std_hasher::Hash256StdHasher;
use hash_db::{HashDB, Hasher, EMPTY_PREFIX};
use memory_db::{HashKey, MemoryDB};
use node_codec::SubstrateNodeCodec;
use thiserror::Error;
use trie_db::{Trie, TrieDBBuilder, TrieLayout};

/// Exact runtime storage key for `BridgeCommitment::CurrentCommitment`.
pub const BRIDGE_COMMITMENT_STORAGE_KEY: [u8; 32] = [
    0xaf, 0x86, 0xfe, 0xf4, 0x21, 0x6a, 0xc2, 0xbc, 0xd1, 0xc5, 0x92, 0xb2, 0x04, 0x01, 0x1a, 0xd0,
    0x0d, 0x2d, 0x4f, 0xb8, 0x25, 0xaf, 0x1f, 0xcd, 0x4c, 0x2b, 0xe9, 0xf9, 0x55, 0xa7, 0x80, 0xc5,
];

/// Exact SCALE byte length of the current runtime bridge commitment.
pub const BRIDGE_COMMITMENT_V1_SCALE_BYTES: usize = 109;
/// Maximum raw proof nodes accepted by the existing bridge profile.
pub const MAX_STATE_PROOF_NODES: usize = 256;
/// Maximum bytes accepted for any one raw trie node.
pub const MAX_STATE_PROOF_NODE_BYTES: usize = 64 * 1024;
/// Maximum aggregate bytes accepted across all raw trie nodes.
pub const MAX_STATE_PROOF_BYTES: usize = 256 * 1024;
/// Substrate V1 externalizes values whose encoded length is at least 33 bytes.
pub const SUBSTRATE_V1_MAX_INLINE_VALUE: u32 = 33;
/// Current bridge profile bound inherited from the checkpoint format.
pub const MAX_BURN_LEAF_COUNT: u32 = 256;

type Blake2b256 = Blake2b<U32>;
type ProofMemoryDb = MemoryDB<Blake2Hasher, HashKey<Blake2Hasher>, Vec<u8>>;

/// Local no-std Blake2b-256 hasher matching `sp_core::Blake2Hasher`.
#[derive(Debug)]
struct Blake2Hasher;

impl Hasher for Blake2Hasher {
    type Out = [u8; 32];
    type StdHasher = Hash256StdHasher;
    const LENGTH: usize = 32;

    fn hash(bytes: &[u8]) -> Self::Out {
        let digest = Blake2b256::digest(bytes);
        let mut output = [0u8; 32];
        output.copy_from_slice(&digest);
        output
    }
}

/// Read-only local equivalent of Substrate's `LayoutV1<Blake2Hasher>`.
struct SubstrateLayoutV1;

impl TrieLayout for SubstrateLayoutV1 {
    const USE_EXTENSION: bool = false;
    const ALLOW_EMPTY: bool = true;
    const MAX_INLINE_VALUE: Option<u32> = Some(SUBSTRATE_V1_MAX_INLINE_VALUE);

    type Hash = Blake2Hasher;
    type Codec = SubstrateNodeCodec<Self::Hash>;
}

/// Exact semantic value stored by the current Frontier bridge commitment pallet.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BridgeCommitmentV1 {
    pub sidechain_id: [u8; 32],
    pub sidechain_height: u64,
    pub execution_block_hash: [u8; 32],
    pub bridge_event_root: [u8; 32],
    pub burn_leaf_count: u32,
}

/// A successful bounded membership proof for the exact current commitment key.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerifiedBridgeCommitmentStateV1 {
    pub state_root: [u8; 32],
    pub storage_key: [u8; 32],
    pub encoded_value: [u8; BRIDGE_COMMITMENT_V1_SCALE_BYTES],
    pub commitment: BridgeCommitmentV1,
    pub proof_node_count: usize,
    pub proof_bytes: usize,
}

/// Successful shared-root verification of the bridge commitment and active causal application.
#[cfg(feature = "application-v2")]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerifiedBridgeCausalApplicationStateV2 {
    /// Exact current bridge commitment authenticated under the finalized state root.
    pub commitment: VerifiedBridgeCommitmentStateV1,
    /// Exact active causal profile and sticky enforcement authenticated under the same root.
    pub causal_application: VerifiedActiveCausalApplicationProfileStateV2,
}

#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum StateProofError {
    #[error("state proof node count exceeds {max}: {actual}")]
    NodeCount { actual: usize, max: usize },
    #[error("state proof node {index} exceeds {max} bytes: {actual}")]
    NodeSize {
        index: usize,
        actual: usize,
        max: usize,
    },
    #[error("state proof aggregate byte count overflow")]
    ProofSizeOverflow,
    #[error("state proof exceeds {max} aggregate bytes: {actual}")]
    ProofSize { actual: usize, max: usize },
    #[error("state proof contains duplicate raw node at index {index}")]
    DuplicateNode { index: usize },
    #[error("state proof does not contain the declared state root")]
    MissingRoot,
    #[error("state proof trie lookup failed")]
    TrieLookup,
    #[error("bridge commitment storage key is absent")]
    MissingCommitment,
    #[error("bridge commitment must be {expected} bytes, got {actual}")]
    CommitmentLength { expected: usize, actual: usize },
    #[error("unsupported bridge commitment version: {0}")]
    CommitmentVersion(u8),
    #[error("bridge commitment burn count must be in 1..={max}, got {actual}")]
    BurnCount { actual: u32, max: u32 },
    #[error("bridge commitment field mismatch: {0}")]
    CommitmentMismatch(&'static str),
}

/// A commitment or causal-application failure from one shared finalized state proof.
#[cfg(feature = "application-v2")]
#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum BridgeCausalApplicationStateError {
    /// The commitment membership or semantic equality check failed.
    #[error("bridge commitment verification failed: {0}")]
    Commitment(#[from] StateProofError),
    /// The causal profile or sticky enforcement check failed.
    #[error("causal application verification failed: {0}")]
    Causal(#[from] CausalProfileStateError),
}

/// Decode the exact 109-byte SCALE value used by the current commitment pallet.
pub fn decode_bridge_commitment_v1(bytes: &[u8]) -> Result<BridgeCommitmentV1, StateProofError> {
    if bytes.len() != BRIDGE_COMMITMENT_V1_SCALE_BYTES {
        return Err(StateProofError::CommitmentLength {
            expected: BRIDGE_COMMITMENT_V1_SCALE_BYTES,
            actual: bytes.len(),
        });
    }
    let version = bytes[0];
    if version != 1 {
        return Err(StateProofError::CommitmentVersion(version));
    }
    let burn_leaf_count = u32::from_le_bytes(exact_array(&bytes[105..109]));
    if !(1..=MAX_BURN_LEAF_COUNT).contains(&burn_leaf_count) {
        return Err(StateProofError::BurnCount {
            actual: burn_leaf_count,
            max: MAX_BURN_LEAF_COUNT,
        });
    }
    Ok(BridgeCommitmentV1 {
        sidechain_id: exact_array(&bytes[1..33]),
        sidechain_height: u64::from_le_bytes(exact_array(&bytes[33..41])),
        execution_block_hash: exact_array(&bytes[41..73]),
        bridge_event_root: exact_array(&bytes[73..105]),
        burn_leaf_count,
    })
}

/// Verify exact membership and semantic equality under one finality-bound state root.
pub fn verify_bridge_commitment_state_v1(
    state_root: [u8; 32],
    proof_nodes: &[Vec<u8>],
    expected: &BridgeCommitmentV1,
) -> Result<VerifiedBridgeCommitmentStateV1, StateProofError> {
    let (value, proof_bytes) =
        read_state_value_v1(state_root, &BRIDGE_COMMITMENT_STORAGE_KEY, proof_nodes)?;
    let value = value.ok_or(StateProofError::MissingCommitment)?;
    let encoded_value: [u8; BRIDGE_COMMITMENT_V1_SCALE_BYTES] = value
        .as_slice()
        .try_into()
        .map_err(|_| StateProofError::CommitmentLength {
            expected: BRIDGE_COMMITMENT_V1_SCALE_BYTES,
            actual: value.len(),
        })?;
    let commitment = decode_bridge_commitment_v1(&encoded_value)?;
    compare_commitments(&commitment, expected)?;
    Ok(VerifiedBridgeCommitmentStateV1 {
        state_root,
        storage_key: BRIDGE_COMMITMENT_STORAGE_KEY,
        encoded_value,
        commitment,
        proof_node_count: proof_nodes.len(),
        proof_bytes,
    })
}

/// Verify commitment, causal profile, and sticky activation with one bounded proof database.
///
/// This function guarantees that all three fixed-key lookups use the same caller-supplied node
/// set and exact state root. It does not establish finality or execute the authenticated runtime.
#[cfg(feature = "application-v2")]
pub fn verify_bridge_commitment_and_active_causal_application_state_v2(
    state_root: [u8; 32],
    proof_nodes: &[Vec<u8>],
    expected_commitment: &BridgeCommitmentV1,
    expected_application: &CausalApplicationBindingV2,
) -> Result<VerifiedBridgeCausalApplicationStateV2, BridgeCausalApplicationStateError> {
    let proof = StateProofReaderV1::new(state_root, proof_nodes)?;
    let commitment = verify_bridge_commitment_with_reader_v1(&proof, expected_commitment)?;
    let causal_application =
        causal_profile::verify_active_causal_application_profile_with_reader_v2(
            &proof,
            expected_application,
        )?;
    Ok(VerifiedBridgeCausalApplicationStateV2 {
        commitment,
        causal_application,
    })
}

#[cfg(feature = "application-v2")]
fn verify_bridge_commitment_with_reader_v1(
    proof: &StateProofReaderV1,
    expected: &BridgeCommitmentV1,
) -> Result<VerifiedBridgeCommitmentStateV1, StateProofError> {
    let value = proof.read(&BRIDGE_COMMITMENT_STORAGE_KEY)?;
    let value = value.ok_or(StateProofError::MissingCommitment)?;
    let encoded_value: [u8; BRIDGE_COMMITMENT_V1_SCALE_BYTES] = value
        .as_slice()
        .try_into()
        .map_err(|_| StateProofError::CommitmentLength {
            expected: BRIDGE_COMMITMENT_V1_SCALE_BYTES,
            actual: value.len(),
        })?;
    let commitment = decode_bridge_commitment_v1(&encoded_value)?;
    compare_commitments(&commitment, expected)?;
    Ok(VerifiedBridgeCommitmentStateV1 {
        state_root: proof.state_root,
        storage_key: BRIDGE_COMMITMENT_STORAGE_KEY,
        encoded_value,
        commitment,
        proof_node_count: proof.node_count,
        proof_bytes: proof.proof_bytes,
    })
}

#[cfg(feature = "application-v2")]
pub(crate) struct StateProofReaderV1 {
    db: ProofMemoryDb,
    state_root: [u8; 32],
    node_count: usize,
    proof_bytes: usize,
}

#[cfg(feature = "application-v2")]
impl StateProofReaderV1 {
    fn new(state_root: [u8; 32], proof_nodes: &[Vec<u8>]) -> Result<Self, StateProofError> {
        let (db, proof_bytes) = bounded_proof_db(proof_nodes)?;
        if !db.contains(&state_root, EMPTY_PREFIX) {
            return Err(StateProofError::MissingRoot);
        }
        Ok(Self {
            db,
            state_root,
            node_count: proof_nodes.len(),
            proof_bytes,
        })
    }

    pub(crate) fn read(&self, key: &[u8]) -> Result<Option<Vec<u8>>, StateProofError> {
        TrieDBBuilder::<SubstrateLayoutV1>::new(&self.db, &self.state_root)
            .build()
            .get(key)
            .map_err(|_| StateProofError::TrieLookup)
    }
}

fn read_state_value_v1(
    state_root: [u8; 32],
    key: &[u8],
    proof_nodes: &[Vec<u8>],
) -> Result<(Option<Vec<u8>>, usize), StateProofError> {
    let (db, proof_bytes) = bounded_proof_db(proof_nodes)?;
    if !db.contains(&state_root, EMPTY_PREFIX) {
        return Err(StateProofError::MissingRoot);
    }
    let value = TrieDBBuilder::<SubstrateLayoutV1>::new(&db, &state_root)
        .build()
        .get(key)
        .map_err(|_| StateProofError::TrieLookup)?;
    Ok((value, proof_bytes))
}

fn bounded_proof_db(proof_nodes: &[Vec<u8>]) -> Result<(ProofMemoryDb, usize), StateProofError> {
    if proof_nodes.len() > MAX_STATE_PROOF_NODES {
        return Err(StateProofError::NodeCount {
            actual: proof_nodes.len(),
            max: MAX_STATE_PROOF_NODES,
        });
    }
    let mut total = 0usize;
    let mut unique = BTreeSet::<&[u8]>::new();
    for (index, node) in proof_nodes.iter().enumerate() {
        if node.len() > MAX_STATE_PROOF_NODE_BYTES {
            return Err(StateProofError::NodeSize {
                index,
                actual: node.len(),
                max: MAX_STATE_PROOF_NODE_BYTES,
            });
        }
        total = total
            .checked_add(node.len())
            .ok_or(StateProofError::ProofSizeOverflow)?;
        if total > MAX_STATE_PROOF_BYTES {
            return Err(StateProofError::ProofSize {
                actual: total,
                max: MAX_STATE_PROOF_BYTES,
            });
        }
        if !unique.insert(node.as_slice()) {
            return Err(StateProofError::DuplicateNode { index });
        }
    }

    let mut db = ProofMemoryDb::default();
    for node in proof_nodes {
        db.insert(EMPTY_PREFIX, node);
    }
    Ok((db, total))
}

fn compare_commitments(
    actual: &BridgeCommitmentV1,
    expected: &BridgeCommitmentV1,
) -> Result<(), StateProofError> {
    if actual.sidechain_id != expected.sidechain_id {
        return Err(StateProofError::CommitmentMismatch("sidechain ID"));
    }
    if actual.sidechain_height != expected.sidechain_height {
        return Err(StateProofError::CommitmentMismatch("sidechain height"));
    }
    if actual.execution_block_hash != expected.execution_block_hash {
        return Err(StateProofError::CommitmentMismatch("execution block hash"));
    }
    if actual.bridge_event_root != expected.bridge_event_root {
        return Err(StateProofError::CommitmentMismatch("bridge event root"));
    }
    if actual.burn_leaf_count != expected.burn_leaf_count {
        return Err(StateProofError::CommitmentMismatch("burn leaf count"));
    }
    Ok(())
}

fn exact_array<const N: usize>(bytes: &[u8]) -> [u8; N] {
    bytes
        .try_into()
        .expect("all ranges are fixed within an exact length-checked value; qed")
}

#[cfg(test)]
mod tests {
    use super::*;

    use serde::Deserialize;
    use sp_core::{Blake2Hasher as OracleHasher, H256};
    use sp_runtime::traits::BlakeTwo256;
    use sp_state_machine::{prove_read_on_trie_backend, TrieBackendBuilder};
    use sp_trie::{LayoutV1, MemoryDB as OracleMemoryDb, StorageProof, TrieDBMutBuilder, TrieMut};

    const VECTOR_JSON: &str =
        include_str!("../../../relayer/test-vectors/native-finalized-bridge-checkpoint-v2.json");

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Vector {
        request: VectorRequest,
        expected: VectorExpected,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct VectorRequest {
        runtime_state_proof_nodes_hex: Vec<String>,
    }

    #[derive(Deserialize)]
    struct VectorExpected {
        target: VectorTarget,
        #[serde(rename = "runtimeState")]
        runtime_state: VectorRuntimeState,
        commitment: VectorCommitment,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct VectorTarget {
        state_root_hex: String,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct VectorRuntimeState {
        storage_key_hex: String,
        storage_value_scale_hex: String,
        proof_node_count: usize,
        proof_bytes: usize,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct VectorCommitment {
        sidechain_id_hex: String,
        sidechain_height: String,
        execution_block_hash_hex: String,
        bridge_event_root_hex: String,
        burn_leaf_count: u32,
    }

    struct Fixture {
        root: [u8; 32],
        nodes: Vec<Vec<u8>>,
        value: Vec<u8>,
        expected: BridgeCommitmentV1,
        proof_node_count: usize,
        proof_bytes: usize,
    }

    #[test]
    fn reproduces_existing_native_checkpoint_vector_and_pinned_oracle() {
        let fixture = fixture();
        let verified =
            verify_bridge_commitment_state_v1(fixture.root, &fixture.nodes, &fixture.expected)
                .unwrap();
        assert_eq!(verified.storage_key, BRIDGE_COMMITMENT_STORAGE_KEY);
        assert_eq!(verified.encoded_value.as_slice(), fixture.value);
        assert_eq!(verified.proof_node_count, fixture.proof_node_count);
        assert_eq!(verified.proof_bytes, fixture.proof_bytes);
        assert_eq!(verified.commitment, fixture.expected);
        assert_eq!(
            oracle_read(fixture.root, &fixture.nodes, &BRIDGE_COMMITMENT_STORAGE_KEY).unwrap(),
            Some(fixture.value),
        );
    }

    #[test]
    fn matches_pinned_oracle_for_generated_v1_trie() {
        let fixture = fixture();
        for variant in 0..16u8 {
            let (root, nodes) = generated_proof(&fixture.value, variant);
            let local = read_state_value_v1(root, &BRIDGE_COMMITMENT_STORAGE_KEY, &nodes)
                .unwrap()
                .0;
            let oracle = oracle_read(root, &nodes, &BRIDGE_COMMITMENT_STORAGE_KEY).unwrap();
            assert_eq!(local, oracle, "variant {variant}");
            assert_eq!(local, Some(fixture.value.clone()), "variant {variant}");
        }
    }

    #[test]
    fn rejects_authenticated_non_membership_for_the_fixed_commitment_key() {
        let fixture = fixture();
        let (root, nodes) = generated_absence_proof();

        assert_eq!(
            oracle_read(root, &nodes, &BRIDGE_COMMITMENT_STORAGE_KEY).unwrap(),
            None,
        );
        assert_eq!(
            verify_bridge_commitment_state_v1(root, &nodes, &fixture.expected),
            Err(StateProofError::MissingCommitment),
        );
    }

    #[test]
    fn accepts_reordered_and_unique_extra_nodes_but_rejects_duplicates() {
        let fixture = fixture();
        let mut reordered = fixture.nodes.clone();
        reordered.reverse();
        assert!(
            verify_bridge_commitment_state_v1(fixture.root, &reordered, &fixture.expected,).is_ok()
        );

        let mut with_extra = fixture.nodes.clone();
        with_extra.push(vec![0x7f, 0xaa, 0x55]);
        assert!(
            verify_bridge_commitment_state_v1(fixture.root, &with_extra, &fixture.expected,)
                .is_ok()
        );
        assert_eq!(
            oracle_read(fixture.root, &with_extra, &BRIDGE_COMMITMENT_STORAGE_KEY,).unwrap(),
            Some(fixture.value.clone()),
        );

        let mut duplicated = fixture.nodes.clone();
        duplicated.push(fixture.nodes[0].clone());
        assert!(matches!(
            verify_bridge_commitment_state_v1(fixture.root, &duplicated, &fixture.expected,),
            Err(StateProofError::DuplicateNode { .. })
        ));
        // The SDK's ordinary StorageProof constructor deduplicates; the bridge is intentionally
        // stricter to prevent private-witness malleability and guest resource amplification.
        assert_eq!(
            oracle_read(fixture.root, &duplicated, &BRIDGE_COMMITMENT_STORAGE_KEY,).unwrap(),
            Some(fixture.value),
        );
    }

    #[test]
    fn rejects_missing_external_value_wrong_root_key_and_malformed_root() {
        let fixture = fixture();
        let without_external_value = fixture
            .nodes
            .iter()
            .filter(|node| node.as_slice() != fixture.value.as_slice())
            .cloned()
            .collect::<Vec<_>>();
        assert!(matches!(
            verify_bridge_commitment_state_v1(
                fixture.root,
                &without_external_value,
                &fixture.expected,
            ),
            Err(StateProofError::TrieLookup)
        ));
        assert!(oracle_read(
            fixture.root,
            &without_external_value,
            &BRIDGE_COMMITMENT_STORAGE_KEY,
        )
        .is_err());

        assert!(matches!(
            verify_bridge_commitment_state_v1([0x99; 32], &fixture.nodes, &fixture.expected),
            Err(StateProofError::MissingRoot)
        ));
        let wrong_key = [0x44; 32];
        assert_eq!(
            read_state_value_v1(fixture.root, &wrong_key, &fixture.nodes)
                .unwrap()
                .0,
            None,
        );
        assert_eq!(
            oracle_read(fixture.root, &fixture.nodes, &wrong_key).unwrap(),
            None,
        );

        let malformed = vec![vec![0x01]];
        let malformed_root = Blake2Hasher::hash(&malformed[0]);
        assert!(matches!(
            read_state_value_v1(malformed_root, &BRIDGE_COMMITMENT_STORAGE_KEY, &malformed),
            Err(StateProofError::TrieLookup)
        ));
    }

    #[test]
    fn rejects_every_commitment_field_substitution() {
        let fixture = fixture();

        let mut changed = fixture.expected.clone();
        changed.sidechain_id[0] ^= 1;
        assert_mismatch(&fixture, changed, "sidechain ID");

        let mut changed = fixture.expected.clone();
        changed.sidechain_height += 1;
        assert_mismatch(&fixture, changed, "sidechain height");

        let mut changed = fixture.expected.clone();
        changed.execution_block_hash[0] ^= 1;
        assert_mismatch(&fixture, changed, "execution block hash");

        let mut changed = fixture.expected.clone();
        changed.bridge_event_root[0] ^= 1;
        assert_mismatch(&fixture, changed, "bridge event root");

        let mut changed = fixture.expected.clone();
        changed.burn_leaf_count += 1;
        assert_mismatch(&fixture, changed, "burn leaf count");
    }

    #[test]
    fn rejects_invalid_commitment_shape_version_and_burn_count() {
        let fixture = fixture();
        assert!(matches!(
            decode_bridge_commitment_v1(&fixture.value[..108]),
            Err(StateProofError::CommitmentLength { .. })
        ));
        let mut value = fixture.value.clone();
        value[0] = 2;
        assert_eq!(
            decode_bridge_commitment_v1(&value),
            Err(StateProofError::CommitmentVersion(2)),
        );
        for burn_count in [0u32, MAX_BURN_LEAF_COUNT + 1] {
            let mut value = fixture.value.clone();
            value[105..109].copy_from_slice(&burn_count.to_le_bytes());
            assert_eq!(
                decode_bridge_commitment_v1(&value),
                Err(StateProofError::BurnCount {
                    actual: burn_count,
                    max: MAX_BURN_LEAF_COUNT,
                }),
            );
        }
    }

    #[test]
    fn rejects_resource_limit_overruns_before_trie_lookup() {
        let too_many = vec![vec![0u8]; MAX_STATE_PROOF_NODES + 1];
        assert!(matches!(
            bounded_proof_db(&too_many),
            Err(StateProofError::NodeCount { .. })
        ));

        let oversized = vec![vec![0u8; MAX_STATE_PROOF_NODE_BYTES + 1]];
        assert!(matches!(
            bounded_proof_db(&oversized),
            Err(StateProofError::NodeSize { .. })
        ));

        let aggregate = (0..5)
            .map(|index| {
                let mut node = vec![index as u8; MAX_STATE_PROOF_NODE_BYTES];
                node[0] = index as u8;
                node
            })
            .collect::<Vec<_>>();
        assert!(matches!(
            bounded_proof_db(&aggregate),
            Err(StateProofError::ProofSize { .. })
        ));
    }

    #[test]
    fn truncated_node_headers_never_panic() {
        for header in 0u8..=u8::MAX {
            let node = vec![header];
            let root = Blake2Hasher::hash(&node);
            let result = read_state_value_v1(root, &BRIDGE_COMMITMENT_STORAGE_KEY, &[node]);
            if header == 0 {
                assert_eq!(result.unwrap().0, None);
            } else {
                assert_eq!(
                    result,
                    Err(StateProofError::TrieLookup),
                    "header {header:#04x}"
                );
            }
        }

        let mut large_malformed = vec![0xff; MAX_STATE_PROOF_NODE_BYTES];
        large_malformed[0] = 0x7f;
        let root = Blake2Hasher::hash(&large_malformed);
        assert_eq!(
            read_state_value_v1(root, &BRIDGE_COMMITMENT_STORAGE_KEY, &[large_malformed]),
            Err(StateProofError::TrieLookup),
        );
    }

    fn assert_mismatch(fixture: &Fixture, expected: BridgeCommitmentV1, field: &'static str) {
        assert_eq!(
            verify_bridge_commitment_state_v1(fixture.root, &fixture.nodes, &expected),
            Err(StateProofError::CommitmentMismatch(field)),
        );
    }

    fn fixture() -> Fixture {
        let vector: Vector = serde_json::from_str(VECTOR_JSON).unwrap();
        assert_eq!(
            decode_hex(&vector.expected.runtime_state.storage_key_hex),
            BRIDGE_COMMITMENT_STORAGE_KEY,
        );
        let value = decode_hex(&vector.expected.runtime_state.storage_value_scale_hex);
        Fixture {
            root: exact_array(&decode_hex(&vector.expected.target.state_root_hex)),
            nodes: vector
                .request
                .runtime_state_proof_nodes_hex
                .iter()
                .map(|node| decode_hex(node))
                .collect(),
            value,
            expected: BridgeCommitmentV1 {
                sidechain_id: exact_array(&decode_hex(
                    &vector.expected.commitment.sidechain_id_hex,
                )),
                sidechain_height: vector.expected.commitment.sidechain_height.parse().unwrap(),
                execution_block_hash: exact_array(&decode_hex(
                    &vector.expected.commitment.execution_block_hash_hex,
                )),
                bridge_event_root: exact_array(&decode_hex(
                    &vector.expected.commitment.bridge_event_root_hex,
                )),
                burn_leaf_count: vector.expected.commitment.burn_leaf_count,
            },
            proof_node_count: vector.expected.runtime_state.proof_node_count,
            proof_bytes: vector.expected.runtime_state.proof_bytes,
        }
    }

    fn oracle_read(
        root: [u8; 32],
        nodes: &[Vec<u8>],
        key: &[u8],
    ) -> Result<Option<Vec<u8>>, String> {
        let proof = StorageProof::new(nodes.iter().cloned());
        let mut result = sp_state_machine::read_proof_check::<BlakeTwo256, _>(
            H256::from(root),
            proof,
            core::iter::once(key),
        )
        .map_err(|error| error.to_string())?;
        result
            .remove(key)
            .ok_or_else(|| "oracle omitted requested key".to_owned())
    }

    fn generated_proof(value: &[u8], variant: u8) -> ([u8; 32], Vec<Vec<u8>>) {
        let mut db = OracleMemoryDb::<OracleHasher>::default();
        let mut root = H256::default();
        {
            let mut trie =
                TrieDBMutBuilder::<LayoutV1<OracleHasher>>::new(&mut db, &mut root).build();
            trie.insert(&BRIDGE_COMMITMENT_STORAGE_KEY, value).unwrap();
            for index in 0..(8 + variant as usize) {
                let mut key = [variant; 32];
                key[0] = 0x80 | index as u8;
                key[15] = (index as u8).wrapping_mul(17);
                key[31] = variant.wrapping_mul(29).wrapping_add(index as u8);
                let value_len = 1 + ((index * 17 + variant as usize * 13) % 96);
                let unrelated = vec![(index as u8) ^ variant; value_len];
                trie.insert(&key, &unrelated).unwrap();
            }
        }
        let backend = TrieBackendBuilder::new(db, root).build();
        let proof = prove_read_on_trie_backend(&backend, [BRIDGE_COMMITMENT_STORAGE_KEY]).unwrap();
        (root.into(), proof.into_iter_nodes().collect())
    }

    fn generated_absence_proof() -> ([u8; 32], Vec<Vec<u8>>) {
        let mut db = OracleMemoryDb::<OracleHasher>::default();
        let mut root = H256::default();
        {
            let mut trie =
                TrieDBMutBuilder::<LayoutV1<OracleHasher>>::new(&mut db, &mut root).build();
            for index in 0..16u8 {
                let mut key = [0x40 | index; 32];
                key[15] = index.wrapping_mul(17);
                key[31] = index.wrapping_mul(29);
                let value = vec![index ^ 0xa5; 40];
                trie.insert(&key, &value).unwrap();
            }
        }
        let backend = TrieBackendBuilder::new(db, root).build();
        let proof = prove_read_on_trie_backend(&backend, [BRIDGE_COMMITMENT_STORAGE_KEY]).unwrap();
        (root.into(), proof.into_iter_nodes().collect())
    }

    fn decode_hex(value: &str) -> Vec<u8> {
        hex::decode(value.strip_prefix("0x").unwrap_or(value)).unwrap()
    }
}
