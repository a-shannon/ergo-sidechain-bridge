//! Same-root source-state verification for pooled-reserve burn settlement V4.
//!
//! This module authenticates one finalized-state snapshot only. It does not establish GRANDPA
//! finality, prove activation provenance, contain Root/Sudo, activate an Ergo verifier, or
//! authorize settlement.

use alloc::{collections::BTreeSet, vec::Vec};

use bridge_validity_statement::{
    decode_pooled_reserve_mint_reservation_runtime_profile_v4,
    derive_pooled_reserve_mint_reservation_profile_v4_id,
    encode_pooled_reserve_burn_application_binding_v4,
    encode_pooled_reserve_mint_reservation_runtime_profile_v4,
    PooledReserveBurnApplicationBindingV4, PooledReserveMintReservationRuntimeProfileV4,
    StatementError, POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES,
};
use hash_db::{HashDB, EMPTY_PREFIX};
use sha2::{Digest, Sha256};
use thiserror::Error;
use trie_db::{Trie, TrieDBBuilder};

use super::{
    compare_commitments, decode_bridge_commitment_v1, BridgeCommitmentV1, ProofMemoryDb,
    StateProofError, SubstrateLayoutV1, VerifiedBridgeCommitmentStateV1,
    BRIDGE_COMMITMENT_STORAGE_KEY, BRIDGE_COMMITMENT_V1_SCALE_BYTES,
};

/// Exact top-trie key for the active pooled-reserve mint-reservation profile V4.
pub const POOLED_RESERVE_RUNTIME_PROFILE_STORAGE_KEY_V4: [u8; 32] = [
    0xaf, 0x86, 0xfe, 0xf4, 0x21, 0x6a, 0xc2, 0xbc, 0xd1, 0xc5, 0x92, 0xb2, 0x04, 0x01, 0x1a, 0xd0,
    0x71, 0x0f, 0x90, 0x13, 0x42, 0xde, 0xf5, 0x94, 0x53, 0x98, 0xfc, 0x0e, 0x02, 0x47, 0x3b, 0xde,
];
/// Exact top-trie key for sticky pooled-reserve V4 enforcement.
pub const POOLED_RESERVE_ENFORCEMENT_STORAGE_KEY_V4: [u8; 32] = [
    0xaf, 0x86, 0xfe, 0xf4, 0x21, 0x6a, 0xc2, 0xbc, 0xd1, 0xc5, 0x92, 0xb2, 0x04, 0x01, 0x1a, 0xd0,
    0x4e, 0x00, 0x0f, 0x8b, 0xae, 0xaa, 0x13, 0x7c, 0xf9, 0x01, 0xa9, 0x23, 0x5d, 0x7d, 0xe9, 0xa1,
];
/// Exact top-trie key for the address selected by the bridge commitment producer.
pub const BRIDGE_ADDRESS_STORAGE_KEY: [u8; 32] = [
    0xaf, 0x86, 0xfe, 0xf4, 0x21, 0x6a, 0xc2, 0xbc, 0xd1, 0xc5, 0x92, 0xb2, 0x04, 0x01, 0x1a, 0xd0,
    0xc1, 0x58, 0x6b, 0xde, 0x54, 0xb2, 0x49, 0xfb, 0x7f, 0x52, 0x1f, 0xaf, 0x83, 0x1a, 0xde, 0x45,
];
/// Exact direct top-trie key for the native runtime Wasm.
pub const RUNTIME_CODE_STORAGE_KEY: [u8; 5] = *b":code";

/// Maximum raw trie nodes accepted by the V4 source-state profile.
pub const MAX_POOLED_RESERVE_STATE_PROOF_NODES_V4: usize = 512;
/// Maximum bytes accepted for one raw V4 trie node.
pub const MAX_POOLED_RESERVE_STATE_PROOF_NODE_BYTES_V4: usize = 8 * 1024 * 1024;
/// Maximum aggregate bytes accepted across all raw V4 trie nodes.
pub const MAX_POOLED_RESERVE_STATE_PROOF_BYTES_V4: usize = 12 * 1024 * 1024;
/// Maximum native runtime artifact accepted by this V4 proof profile.
pub const MAX_SOURCE_RUNTIME_CODE_BYTES_V4: usize = 8 * 1024 * 1024;

/// Authenticated active V4 runtime state under one caller-supplied source state root.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerifiedActivePooledReserveRuntimeStateV4 {
    /// State root shared by every authenticated read.
    pub state_root: [u8; 32],
    /// Exact fixed profile key.
    pub profile_storage_key: [u8; 32],
    /// Exact fixed sticky-enforcement key.
    pub enforcement_storage_key: [u8; 32],
    /// Exact fixed commitment-producer address key.
    pub bridge_address_storage_key: [u8; 32],
    /// Exact direct native runtime-code key.
    pub runtime_code_storage_key: [u8; 5],
    /// Exact authenticated profile bytes.
    pub encoded_profile: [u8; POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES],
    /// Strict semantic profile decoded from authenticated state.
    pub profile: PooledReserveMintReservationRuntimeProfileV4,
    /// Recomputed identity of the authenticated profile bytes.
    pub runtime_profile_id: [u8; 32],
    /// Authenticated commitment-producing bridge address.
    pub bridge_address: [u8; 20],
    /// SHA-256 of the authenticated raw native runtime Wasm.
    pub source_runtime_code_sha256: [u8; 32],
    /// Exact authenticated native runtime Wasm byte count.
    pub source_runtime_code_bytes: usize,
    /// Number of bounded raw proof nodes.
    pub proof_node_count: usize,
    /// Aggregate raw proof bytes.
    pub proof_bytes: usize,
}

/// Bridge commitment and V4 runtime state authenticated under one exact root and proof database.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerifiedBridgePooledReserveRuntimeStateV4 {
    /// Exact current bridge commitment.
    pub commitment: VerifiedBridgeCommitmentStateV1,
    /// Exact active pooled-reserve runtime profile, enforcement, producer, and native code.
    pub runtime: VerifiedActivePooledReserveRuntimeStateV4,
}

/// A V4 profile, producer, enforcement, or native runtime-code rejection.
#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum PooledReserveRuntimeStateErrorV4 {
    /// The bounded shared-root proof failed.
    #[error("pooled-reserve V4 state proof failed: {0}")]
    Proof(#[from] StateProofError),
    /// The caller-supplied application binding is structurally invalid.
    #[error("invalid pooled-reserve V4 application binding: {0}")]
    ApplicationBinding(#[from] StatementError),
    /// The fixed current-profile key is absent.
    #[error("current pooled-reserve V4 runtime profile is absent")]
    MissingProfile,
    /// The stored profile has the wrong exact width.
    #[error("pooled-reserve V4 runtime profile must be {expected} bytes, got {actual}")]
    ProfileLength {
        /// Exact required width.
        expected: usize,
        /// Authenticated width.
        actual: usize,
    },
    /// The authenticated profile bytes differ from the statement binding.
    #[error("authenticated pooled-reserve V4 runtime profile differs from the statement")]
    ProfileMismatch,
    /// The authenticated profile identity differs from the statement binding.
    #[error("authenticated pooled-reserve V4 runtime profile ID differs from the statement")]
    ProfileIdMismatch,
    /// The fixed sticky-enforcement key is absent.
    #[error("pooled-reserve V4 sticky enforcement is absent")]
    MissingEnforcement,
    /// Sticky enforcement is not canonical SCALE `true`.
    #[error("pooled-reserve V4 sticky enforcement is not active")]
    InactiveEnforcement,
    /// The fixed commitment-producer address key is absent.
    #[error("pooled-reserve V4 commitment-producing bridge address is absent")]
    MissingBridgeAddress,
    /// The authenticated bridge address has the wrong exact width.
    #[error("pooled-reserve V4 bridge address must be 20 bytes, got {0}")]
    BridgeAddressLength(usize),
    /// The independent commitment-producing address differs from the active profile.
    #[error("pooled-reserve V4 commitment-producing bridge address differs from the profile")]
    BridgeAddressMismatch,
    /// The statement requests a runtime artifact larger than this proof profile permits.
    #[error("pooled-reserve V4 source runtime exceeds {max} bytes: {actual}")]
    ExpectedRuntimeCodeTooLarge {
        /// Statement-bound byte count.
        actual: usize,
        /// Profile maximum.
        max: usize,
    },
    /// The direct native runtime-code key is absent.
    #[error("pooled-reserve V4 source runtime code is absent")]
    MissingRuntimeCode,
    /// The authenticated native runtime is empty.
    #[error("pooled-reserve V4 source runtime code is empty")]
    EmptyRuntimeCode,
    /// The authenticated native runtime width differs from the statement.
    #[error("pooled-reserve V4 source runtime code size differs from the statement")]
    RuntimeCodeSizeMismatch,
    /// The authenticated native runtime SHA-256 differs from the statement.
    #[error("pooled-reserve V4 source runtime code SHA-256 differs from the statement")]
    RuntimeCodeDigestMismatch,
}

/// A same-root commitment/runtime rejection preserving the deciding layer.
#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum BridgePooledReserveRuntimeStateErrorV4 {
    /// The commitment membership or semantic equality check failed.
    #[error("bridge commitment verification failed: {0}")]
    Commitment(#[from] StateProofError),
    /// The pooled-reserve runtime-state check failed.
    #[error("pooled-reserve runtime-state verification failed: {0}")]
    Runtime(#[from] PooledReserveRuntimeStateErrorV4),
    /// The authenticated commitment is not valid under the active profile.
    #[error("pooled-reserve V4 commitment/profile binding mismatch: {0}")]
    Binding(&'static str),
}

// Keep this reader separate from the frozen V2 path. Generalizing the V2 reader changes the
// compiled V2 guest identity even when its accepted statements remain unchanged.
struct StateProofReaderV4 {
    db: ProofMemoryDb,
    state_root: [u8; 32],
    node_count: usize,
    proof_bytes: usize,
}

impl StateProofReaderV4 {
    fn new(state_root: [u8; 32], proof_nodes: &[Vec<u8>]) -> Result<Self, StateProofError> {
        if proof_nodes.len() > MAX_POOLED_RESERVE_STATE_PROOF_NODES_V4 {
            return Err(StateProofError::NodeCount {
                actual: proof_nodes.len(),
                max: MAX_POOLED_RESERVE_STATE_PROOF_NODES_V4,
            });
        }
        let mut proof_bytes = 0usize;
        let mut unique = BTreeSet::<&[u8]>::new();
        for (index, node) in proof_nodes.iter().enumerate() {
            if node.len() > MAX_POOLED_RESERVE_STATE_PROOF_NODE_BYTES_V4 {
                return Err(StateProofError::NodeSize {
                    index,
                    actual: node.len(),
                    max: MAX_POOLED_RESERVE_STATE_PROOF_NODE_BYTES_V4,
                });
            }
            proof_bytes = proof_bytes
                .checked_add(node.len())
                .ok_or(StateProofError::ProofSizeOverflow)?;
            if proof_bytes > MAX_POOLED_RESERVE_STATE_PROOF_BYTES_V4 {
                return Err(StateProofError::ProofSize {
                    actual: proof_bytes,
                    max: MAX_POOLED_RESERVE_STATE_PROOF_BYTES_V4,
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

    fn read(&self, key: &[u8]) -> Result<Option<Vec<u8>>, StateProofError> {
        TrieDBBuilder::<SubstrateLayoutV1>::new(&self.db, &self.state_root)
            .build()
            .get(key)
            .map_err(|_| StateProofError::TrieLookup)
    }
}

fn verify_bridge_commitment_with_reader_v4(
    proof: &StateProofReaderV4,
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

/// Verify the active V4 profile, sticky marker, producer address, and native runtime code.
pub fn verify_active_pooled_reserve_runtime_state_v4(
    state_root: [u8; 32],
    proof_nodes: &[Vec<u8>],
    expected: &PooledReserveBurnApplicationBindingV4,
) -> Result<VerifiedActivePooledReserveRuntimeStateV4, PooledReserveRuntimeStateErrorV4> {
    let proof = StateProofReaderV4::new(state_root, proof_nodes)?;
    verify_active_pooled_reserve_runtime_with_reader_v4(&proof, expected)
}

/// Verify commitment and all four V4 runtime-authority reads from one proof database and root.
pub fn verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v4(
    state_root: [u8; 32],
    proof_nodes: &[Vec<u8>],
    expected_commitment: &BridgeCommitmentV1,
    expected_application: &PooledReserveBurnApplicationBindingV4,
) -> Result<VerifiedBridgePooledReserveRuntimeStateV4, BridgePooledReserveRuntimeStateErrorV4> {
    let proof = StateProofReaderV4::new(state_root, proof_nodes)?;
    let commitment = verify_bridge_commitment_with_reader_v4(&proof, expected_commitment)?;
    let runtime =
        verify_active_pooled_reserve_runtime_with_reader_v4(&proof, expected_application)?;
    if commitment.commitment.sidechain_id != runtime.profile.sidechain_id {
        return Err(BridgePooledReserveRuntimeStateErrorV4::Binding(
            "commitment sidechain ID",
        ));
    }
    if commitment.commitment.sidechain_height < runtime.profile.activation_height {
        return Err(BridgePooledReserveRuntimeStateErrorV4::Binding(
            "commitment precedes profile activation",
        ));
    }
    Ok(VerifiedBridgePooledReserveRuntimeStateV4 {
        commitment,
        runtime,
    })
}

fn verify_active_pooled_reserve_runtime_with_reader_v4(
    proof: &StateProofReaderV4,
    expected: &PooledReserveBurnApplicationBindingV4,
) -> Result<VerifiedActivePooledReserveRuntimeStateV4, PooledReserveRuntimeStateErrorV4> {
    encode_pooled_reserve_burn_application_binding_v4(expected)?;
    let expected_runtime_bytes = usize::try_from(expected.source_runtime_code_bytes)
        .expect("u32 always fits usize on supported targets");
    if expected_runtime_bytes > MAX_SOURCE_RUNTIME_CODE_BYTES_V4 {
        return Err(
            PooledReserveRuntimeStateErrorV4::ExpectedRuntimeCodeTooLarge {
                actual: expected_runtime_bytes,
                max: MAX_SOURCE_RUNTIME_CODE_BYTES_V4,
            },
        );
    }

    let profile_value = proof
        .read(&POOLED_RESERVE_RUNTIME_PROFILE_STORAGE_KEY_V4)?
        .ok_or(PooledReserveRuntimeStateErrorV4::MissingProfile)?;
    let encoded_profile: [u8; POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES] =
        profile_value.as_slice().try_into().map_err(|_| {
            PooledReserveRuntimeStateErrorV4::ProfileLength {
                expected: POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES,
                actual: profile_value.len(),
            }
        })?;
    let profile = decode_pooled_reserve_mint_reservation_runtime_profile_v4(&encoded_profile)?;
    let expected_profile =
        encode_pooled_reserve_mint_reservation_runtime_profile_v4(&expected.runtime_profile)?;
    if encoded_profile != expected_profile {
        return Err(PooledReserveRuntimeStateErrorV4::ProfileMismatch);
    }
    let runtime_profile_id = derive_pooled_reserve_mint_reservation_profile_v4_id(&profile)?;
    if runtime_profile_id != expected.runtime_profile_id {
        return Err(PooledReserveRuntimeStateErrorV4::ProfileIdMismatch);
    }

    let enforcement = proof
        .read(&POOLED_RESERVE_ENFORCEMENT_STORAGE_KEY_V4)?
        .ok_or(PooledReserveRuntimeStateErrorV4::MissingEnforcement)?;
    if enforcement.as_slice() != [1] {
        return Err(PooledReserveRuntimeStateErrorV4::InactiveEnforcement);
    }

    let bridge_address = proof
        .read(&BRIDGE_ADDRESS_STORAGE_KEY)?
        .ok_or(PooledReserveRuntimeStateErrorV4::MissingBridgeAddress)?;
    let bridge_address: [u8; 20] = bridge_address
        .as_slice()
        .try_into()
        .map_err(|_| PooledReserveRuntimeStateErrorV4::BridgeAddressLength(bridge_address.len()))?;
    if bridge_address != profile.bridge_address {
        return Err(PooledReserveRuntimeStateErrorV4::BridgeAddressMismatch);
    }

    let runtime_code = proof
        .read(&RUNTIME_CODE_STORAGE_KEY)?
        .ok_or(PooledReserveRuntimeStateErrorV4::MissingRuntimeCode)?;
    if runtime_code.is_empty() {
        return Err(PooledReserveRuntimeStateErrorV4::EmptyRuntimeCode);
    }
    if runtime_code.len() != expected_runtime_bytes {
        return Err(PooledReserveRuntimeStateErrorV4::RuntimeCodeSizeMismatch);
    }
    let source_runtime_code_sha256: [u8; 32] = Sha256::digest(&runtime_code).into();
    if source_runtime_code_sha256 != expected.source_runtime_code_sha256 {
        return Err(PooledReserveRuntimeStateErrorV4::RuntimeCodeDigestMismatch);
    }

    Ok(VerifiedActivePooledReserveRuntimeStateV4 {
        state_root: proof.state_root,
        profile_storage_key: POOLED_RESERVE_RUNTIME_PROFILE_STORAGE_KEY_V4,
        enforcement_storage_key: POOLED_RESERVE_ENFORCEMENT_STORAGE_KEY_V4,
        bridge_address_storage_key: BRIDGE_ADDRESS_STORAGE_KEY,
        runtime_code_storage_key: RUNTIME_CODE_STORAGE_KEY,
        encoded_profile,
        profile,
        runtime_profile_id,
        bridge_address,
        source_runtime_code_sha256,
        source_runtime_code_bytes: runtime_code.len(),
        proof_node_count: proof.node_count,
        proof_bytes: proof.proof_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    use bridge_validity_statement::{
        derive_pooled_reserve_mint_reservation_profile_v4_id,
        encode_pooled_reserve_mint_reservation_runtime_profile_v4,
    };
    use sp_core::{twox_128, Blake2Hasher as OracleHasher, H256};
    use sp_state_machine::{prove_read_on_trie_backend, TrieBackendBuilder};
    use sp_trie::{LayoutV1, MemoryDB as OracleMemoryDb, TrieDBMutBuilder, TrieMut};

    #[derive(Clone)]
    struct Fixture {
        root: [u8; 32],
        nodes: Vec<Vec<u8>>,
        commitment: BridgeCommitmentV1,
        application: PooledReserveBurnApplicationBindingV4,
        runtime_code: Vec<u8>,
    }

    #[test]
    fn fixed_storage_keys_match_frame_derivation() {
        assert_eq!(
            storage_key(b"CurrentCommitment"),
            super::super::BRIDGE_COMMITMENT_STORAGE_KEY
        );
        assert_eq!(
            storage_key(b"CurrentPooledReserveMintReservationProfileV4"),
            POOLED_RESERVE_RUNTIME_PROFILE_STORAGE_KEY_V4
        );
        assert_eq!(
            storage_key(b"PooledReserveMintReservationEnforcementActivatedV4"),
            POOLED_RESERVE_ENFORCEMENT_STORAGE_KEY_V4
        );
        assert_eq!(storage_key(b"BridgeAddress"), BRIDGE_ADDRESS_STORAGE_KEY);
        assert_eq!(RUNTIME_CODE_STORAGE_KEY, *b":code");
    }

    #[test]
    fn verifies_all_five_reads_under_one_root_with_runtime_code_above_v2_node_limit() {
        let fixture = build_fixture(0x42);
        assert!(fixture.runtime_code.len() > super::super::MAX_STATE_PROOF_NODE_BYTES);
        let verified = verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v4(
            fixture.root,
            &fixture.nodes,
            &fixture.commitment,
            &fixture.application,
        )
        .unwrap();

        assert_eq!(verified.commitment.state_root, fixture.root);
        assert_eq!(verified.runtime.state_root, fixture.root);
        assert_eq!(verified.commitment.commitment, fixture.commitment);
        assert_eq!(
            verified.runtime.profile,
            fixture.application.runtime_profile
        );
        assert_eq!(
            verified.runtime.runtime_profile_id,
            fixture.application.runtime_profile_id
        );
        assert_eq!(
            verified.runtime.source_runtime_code_sha256,
            fixture.application.source_runtime_code_sha256
        );
        assert_eq!(
            verified.runtime.source_runtime_code_bytes,
            fixture.runtime_code.len()
        );
        assert_eq!(
            verified.commitment.proof_node_count,
            verified.runtime.proof_node_count
        );
        assert_eq!(
            verified.commitment.proof_bytes,
            verified.runtime.proof_bytes
        );
    }

    #[test]
    fn rejects_absent_or_noncanonical_authority_state() {
        let fixture = build_fixture(0x42);
        let profile = encode_pooled_reserve_mint_reservation_runtime_profile_v4(
            &fixture.application.runtime_profile,
        )
        .unwrap();
        let commitment = encode_commitment(&fixture.commitment);

        let cases = [
            (
                state_proof(
                    None,
                    Some(&profile),
                    Some(&[1]),
                    Some(&fixture.application.runtime_profile.bridge_address),
                    Some(&fixture.runtime_code),
                    1,
                ),
                BridgePooledReserveRuntimeStateErrorV4::Commitment(
                    StateProofError::MissingCommitment,
                ),
            ),
            (
                state_proof(
                    Some(&commitment),
                    None,
                    Some(&[1]),
                    Some(&fixture.application.runtime_profile.bridge_address),
                    Some(&fixture.runtime_code),
                    2,
                ),
                BridgePooledReserveRuntimeStateErrorV4::Runtime(
                    PooledReserveRuntimeStateErrorV4::MissingProfile,
                ),
            ),
            (
                state_proof(
                    Some(&commitment),
                    Some(&profile),
                    None,
                    Some(&fixture.application.runtime_profile.bridge_address),
                    Some(&fixture.runtime_code),
                    3,
                ),
                BridgePooledReserveRuntimeStateErrorV4::Runtime(
                    PooledReserveRuntimeStateErrorV4::MissingEnforcement,
                ),
            ),
            (
                state_proof(
                    Some(&commitment),
                    Some(&profile),
                    Some(&[0]),
                    Some(&fixture.application.runtime_profile.bridge_address),
                    Some(&fixture.runtime_code),
                    4,
                ),
                BridgePooledReserveRuntimeStateErrorV4::Runtime(
                    PooledReserveRuntimeStateErrorV4::InactiveEnforcement,
                ),
            ),
            (
                state_proof(
                    Some(&commitment),
                    Some(&profile),
                    Some(&[1]),
                    None,
                    Some(&fixture.runtime_code),
                    5,
                ),
                BridgePooledReserveRuntimeStateErrorV4::Runtime(
                    PooledReserveRuntimeStateErrorV4::MissingBridgeAddress,
                ),
            ),
            (
                state_proof(
                    Some(&commitment),
                    Some(&profile),
                    Some(&[1]),
                    Some(&fixture.application.runtime_profile.bridge_address),
                    None,
                    6,
                ),
                BridgePooledReserveRuntimeStateErrorV4::Runtime(
                    PooledReserveRuntimeStateErrorV4::MissingRuntimeCode,
                ),
            ),
        ];

        for ((root, nodes), expected) in cases {
            assert_eq!(
                verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v4(
                    root,
                    &nodes,
                    &fixture.commitment,
                    &fixture.application,
                ),
                Err(expected)
            );
        }

        for enforcement in [&[2][..], &[1, 0][..]] {
            let (root, nodes) = state_proof(
                Some(&commitment),
                Some(&profile),
                Some(enforcement),
                Some(&fixture.application.runtime_profile.bridge_address),
                Some(&fixture.runtime_code),
                enforcement.len() as u8,
            );
            assert_eq!(
                verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v4(
                    root,
                    &nodes,
                    &fixture.commitment,
                    &fixture.application,
                ),
                Err(BridgePooledReserveRuntimeStateErrorV4::Runtime(
                    PooledReserveRuntimeStateErrorV4::InactiveEnforcement
                ))
            );
        }
    }

    #[test]
    fn rejects_profile_producer_code_commitment_and_root_substitution() {
        let fixture = build_fixture(0x42);
        let commitment = encode_commitment(&fixture.commitment);
        let profile = encode_pooled_reserve_mint_reservation_runtime_profile_v4(
            &fixture.application.runtime_profile,
        )
        .unwrap();

        let mut changed_profile = fixture.application.runtime_profile.clone();
        changed_profile.max_pending_blocks += 1;
        let changed_profile =
            encode_pooled_reserve_mint_reservation_runtime_profile_v4(&changed_profile).unwrap();
        let (root, nodes) = state_proof(
            Some(&commitment),
            Some(&changed_profile),
            Some(&[1]),
            Some(&fixture.application.runtime_profile.bridge_address),
            Some(&fixture.runtime_code),
            7,
        );
        assert_eq!(
            verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v4(
                root,
                &nodes,
                &fixture.commitment,
                &fixture.application,
            ),
            Err(BridgePooledReserveRuntimeStateErrorV4::Runtime(
                PooledReserveRuntimeStateErrorV4::ProfileMismatch
            ))
        );

        let mut changed_address = fixture.application.runtime_profile.bridge_address;
        changed_address[0] ^= 1;
        let (root, nodes) = state_proof(
            Some(&commitment),
            Some(&profile),
            Some(&[1]),
            Some(&changed_address),
            Some(&fixture.runtime_code),
            8,
        );
        assert_eq!(
            verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v4(
                root,
                &nodes,
                &fixture.commitment,
                &fixture.application,
            ),
            Err(BridgePooledReserveRuntimeStateErrorV4::Runtime(
                PooledReserveRuntimeStateErrorV4::BridgeAddressMismatch
            ))
        );

        let mut wrong_size = fixture.application.clone();
        wrong_size.source_runtime_code_bytes += 1;
        assert_eq!(
            verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v4(
                fixture.root,
                &fixture.nodes,
                &fixture.commitment,
                &wrong_size,
            ),
            Err(BridgePooledReserveRuntimeStateErrorV4::Runtime(
                PooledReserveRuntimeStateErrorV4::RuntimeCodeSizeMismatch
            ))
        );
        let mut wrong_hash = fixture.application.clone();
        wrong_hash.source_runtime_code_sha256[0] ^= 1;
        assert_eq!(
            verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v4(
                fixture.root,
                &fixture.nodes,
                &fixture.commitment,
                &wrong_hash,
            ),
            Err(BridgePooledReserveRuntimeStateErrorV4::Runtime(
                PooledReserveRuntimeStateErrorV4::RuntimeCodeDigestMismatch
            ))
        );

        let mut wrong_commitment = fixture.commitment.clone();
        wrong_commitment.bridge_event_root[0] ^= 1;
        assert_eq!(
            verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v4(
                fixture.root,
                &fixture.nodes,
                &wrong_commitment,
                &fixture.application,
            ),
            Err(BridgePooledReserveRuntimeStateErrorV4::Commitment(
                StateProofError::CommitmentMismatch("bridge event root")
            ))
        );

        let other = build_fixture(0x43);
        assert_eq!(
            verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v4(
                fixture.root,
                &other.nodes,
                &fixture.commitment,
                &fixture.application,
            ),
            Err(BridgePooledReserveRuntimeStateErrorV4::Commitment(
                StateProofError::MissingRoot
            ))
        );
    }

    #[test]
    fn rejects_an_expected_runtime_larger_than_the_v4_profile() {
        let fixture = build_fixture(0x42);
        let mut too_large = fixture.application.clone();
        too_large.source_runtime_code_bytes =
            u32::try_from(MAX_SOURCE_RUNTIME_CODE_BYTES_V4 + 1).unwrap();
        assert_eq!(
            verify_active_pooled_reserve_runtime_state_v4(fixture.root, &fixture.nodes, &too_large,),
            Err(
                PooledReserveRuntimeStateErrorV4::ExpectedRuntimeCodeTooLarge {
                    actual: MAX_SOURCE_RUNTIME_CODE_BYTES_V4 + 1,
                    max: MAX_SOURCE_RUNTIME_CODE_BYTES_V4,
                }
            )
        );
    }

    fn build_fixture(decoy: u8) -> Fixture {
        let runtime_code = vec![0x61; 96 * 1024];
        let source_runtime_code_sha256: [u8; 32] = Sha256::digest(&runtime_code).into();
        let runtime_profile = PooledReserveMintReservationRuntimeProfileV4 {
            lineage_id: [0x11; 32],
            source_network_id: [0x12; 32],
            sidechain_id: [0x13; 32],
            bridge_address: [0x14; 20],
            token_address: [0x15; 20],
            bridge_runtime_code_sha256: [0x16; 32],
            bridge_runtime_code_bytes: 4_104,
            token_runtime_code_sha256: [0x17; 32],
            token_runtime_code_bytes: 2_356,
            settlement_profile_id: [0x18; 32],
            ergo_finality_policy_id: [0x19; 32],
            source_proof_system_id: [0x1a; 32],
            source_proof_profile_id: [0x1b; 32],
            activation_height: 41,
            max_pending_blocks: 256,
        };
        let runtime_profile_id =
            derive_pooled_reserve_mint_reservation_profile_v4_id(&runtime_profile).unwrap();
        let application = PooledReserveBurnApplicationBindingV4 {
            runtime_profile,
            runtime_profile_id,
            source_runtime_code_sha256,
            source_runtime_code_bytes: u32::try_from(runtime_code.len()).unwrap(),
            tracker_nft_id: [0x1c; 32],
            settlement_tracker_contract_id: [0x1d; 32],
            preactivation_state: 0,
            authorization_flags: 0,
            reserved: [0, 0],
        };
        let commitment = BridgeCommitmentV1 {
            sidechain_id: application.runtime_profile.sidechain_id,
            sidechain_height: 42,
            execution_block_hash: [0x21; 32],
            bridge_event_root: [0x22; 32],
            burn_leaf_count: 3,
        };
        let profile =
            encode_pooled_reserve_mint_reservation_runtime_profile_v4(&application.runtime_profile)
                .unwrap();
        let commitment_value = encode_commitment(&commitment);
        let (root, nodes) = state_proof(
            Some(&commitment_value),
            Some(&profile),
            Some(&[1]),
            Some(&application.runtime_profile.bridge_address),
            Some(&runtime_code),
            decoy,
        );
        Fixture {
            root,
            nodes,
            commitment,
            application,
            runtime_code,
        }
    }

    fn state_proof(
        commitment: Option<&[u8]>,
        profile: Option<&[u8]>,
        enforcement: Option<&[u8]>,
        bridge_address: Option<&[u8]>,
        runtime_code: Option<&[u8]>,
        decoy: u8,
    ) -> ([u8; 32], Vec<Vec<u8>>) {
        let mut db = OracleMemoryDb::<OracleHasher>::default();
        let mut root = H256::default();
        {
            let mut trie =
                TrieDBMutBuilder::<LayoutV1<OracleHasher>>::new(&mut db, &mut root).build();
            trie.insert(&[0x10; 32], &[decoy; 48]).unwrap();
            if let Some(value) = commitment {
                trie.insert(&super::super::BRIDGE_COMMITMENT_STORAGE_KEY, value)
                    .unwrap();
            }
            if let Some(value) = profile {
                trie.insert(&POOLED_RESERVE_RUNTIME_PROFILE_STORAGE_KEY_V4, value)
                    .unwrap();
            }
            if let Some(value) = enforcement {
                trie.insert(&POOLED_RESERVE_ENFORCEMENT_STORAGE_KEY_V4, value)
                    .unwrap();
            }
            if let Some(value) = bridge_address {
                trie.insert(&BRIDGE_ADDRESS_STORAGE_KEY, value).unwrap();
            }
            if let Some(value) = runtime_code {
                trie.insert(&RUNTIME_CODE_STORAGE_KEY, value).unwrap();
            }
        }
        let backend = TrieBackendBuilder::new(db, root).build();
        let keys = [
            super::super::BRIDGE_COMMITMENT_STORAGE_KEY.to_vec(),
            POOLED_RESERVE_RUNTIME_PROFILE_STORAGE_KEY_V4.to_vec(),
            POOLED_RESERVE_ENFORCEMENT_STORAGE_KEY_V4.to_vec(),
            BRIDGE_ADDRESS_STORAGE_KEY.to_vec(),
            RUNTIME_CODE_STORAGE_KEY.to_vec(),
        ];
        let proof = prove_read_on_trie_backend(&backend, keys.iter().map(Vec::as_slice)).unwrap();
        (root.into(), proof.into_iter_nodes().collect())
    }

    fn encode_commitment(commitment: &BridgeCommitmentV1) -> Vec<u8> {
        let mut encoded = Vec::with_capacity(super::super::BRIDGE_COMMITMENT_V1_SCALE_BYTES);
        encoded.push(1);
        encoded.extend_from_slice(&commitment.sidechain_id);
        encoded.extend_from_slice(&commitment.sidechain_height.to_le_bytes());
        encoded.extend_from_slice(&commitment.execution_block_hash);
        encoded.extend_from_slice(&commitment.bridge_event_root);
        encoded.extend_from_slice(&commitment.burn_leaf_count.to_le_bytes());
        encoded
    }

    fn storage_key(item: &[u8]) -> [u8; 32] {
        let mut key = [0u8; 32];
        key[..16].copy_from_slice(&twox_128(b"BridgeCommitment"));
        key[16..].copy_from_slice(&twox_128(item));
        key
    }
}
