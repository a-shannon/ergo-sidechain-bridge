//! Same-root source-state verification for pooled-reserve burn settlement V5.
//!
//! This module authenticates one finalized-state snapshot, including exact absence of
//! `pallet_sudo::Key`. It does not establish GRANDPA finality, prove activation provenance or the
//! absence of other privileged origins, activate an Ergo verifier, or authorize settlement.

use alloc::{collections::BTreeSet, vec::Vec};

use bridge_validity_statement::{
    decode_pooled_reserve_mint_reservation_runtime_profile_v4,
    derive_pooled_reserve_mint_reservation_profile_v4_id,
    encode_pooled_reserve_burn_application_binding_v5,
    encode_pooled_reserve_mint_reservation_runtime_profile_v4,
    PooledReserveBurnApplicationBindingV5, PooledReserveMintReservationRuntimeProfileV4,
    StatementError, POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES,
};
use hash_db::{HashDB, EMPTY_PREFIX};
use sha2::{Digest, Sha256};
use thiserror::Error;
use trie_db::{Trie, TrieDBBuilder};

use super::pooled_reserve_burn_v4::{
    BRIDGE_ADDRESS_STORAGE_KEY, POOLED_RESERVE_ENFORCEMENT_STORAGE_KEY_V4,
    POOLED_RESERVE_RUNTIME_PROFILE_STORAGE_KEY_V4, RUNTIME_CODE_STORAGE_KEY,
};
use super::{
    compare_commitments, decode_bridge_commitment_v1, BridgeCommitmentV1, ProofMemoryDb,
    StateProofError, SubstrateLayoutV1, VerifiedBridgeCommitmentStateV1,
    BRIDGE_COMMITMENT_STORAGE_KEY, BRIDGE_COMMITMENT_V1_SCALE_BYTES,
};

/// Exact top-trie key for `pallet_sudo::Key`, which V5 requires to be absent.
pub const SUDO_KEY_STORAGE_KEY_V5: [u8; 32] = [
    0x5c, 0x0d, 0x11, 0x76, 0xa5, 0x68, 0xc1, 0xf9, 0x29, 0x44, 0x34, 0x0d, 0xbf, 0xed, 0x9e, 0x9c,
    0x53, 0x0e, 0xbc, 0xa7, 0x03, 0xc8, 0x59, 0x10, 0xe7, 0x16, 0x4c, 0xb7, 0xd1, 0xc9, 0xe4, 0x7b,
];

/// Maximum raw trie nodes accepted by the V5 source-state profile.
pub const MAX_POOLED_RESERVE_STATE_PROOF_NODES_V5: usize = 512;
/// Maximum bytes accepted for one raw V5 trie node.
pub const MAX_POOLED_RESERVE_STATE_PROOF_NODE_BYTES_V5: usize = 8 * 1024 * 1024;
/// Maximum aggregate bytes accepted across all raw V5 trie nodes.
pub const MAX_POOLED_RESERVE_STATE_PROOF_BYTES_V5: usize = 12 * 1024 * 1024;
/// Maximum native runtime artifact accepted by this V5 proof profile.
pub const MAX_SOURCE_RUNTIME_CODE_BYTES_V5: usize = 8 * 1024 * 1024;

/// Authenticated active V5 runtime state under one caller-supplied source state root.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerifiedActivePooledReserveRuntimeStateV5 {
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
    /// Exact legacy Sudo key authenticated as absent under the deciding root.
    pub absent_sudo_key_storage_key: [u8; 32],
    /// SHA-256 of the authenticated raw native runtime Wasm.
    pub source_runtime_code_sha256: [u8; 32],
    /// Exact authenticated native runtime Wasm byte count.
    pub source_runtime_code_bytes: usize,
    /// Number of bounded raw proof nodes.
    pub proof_node_count: usize,
    /// Aggregate raw proof bytes.
    pub proof_bytes: usize,
}

/// Bridge commitment and V5 runtime state authenticated under one exact root and proof database.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerifiedBridgePooledReserveRuntimeStateV5 {
    /// Exact current bridge commitment.
    pub commitment: VerifiedBridgeCommitmentStateV1,
    /// Exact active pooled-reserve runtime profile, enforcement, producer, and native code.
    pub runtime: VerifiedActivePooledReserveRuntimeStateV5,
}

/// A V5-family V4-profile, producer, enforcement, Sudo, or runtime-code rejection.
#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum PooledReserveRuntimeStateErrorV5 {
    /// The bounded shared-root proof failed.
    #[error("pooled-reserve V5 state proof failed: {0}")]
    Proof(#[from] StateProofError),
    /// The caller-supplied application binding is structurally invalid.
    #[error("invalid pooled-reserve V5 application binding: {0}")]
    ApplicationBinding(#[from] StatementError),
    /// The fixed current-profile key is absent.
    #[error("pooled-reserve V4 runtime profile required by V5 is absent")]
    MissingProfile,
    /// The stored profile has the wrong exact width.
    #[error(
        "pooled-reserve V4 runtime profile required by V5 must be {expected} bytes, got {actual}"
    )]
    ProfileLength {
        /// Exact required width.
        expected: usize,
        /// Authenticated width.
        actual: usize,
    },
    /// The authenticated profile bytes differ from the statement binding.
    #[error("authenticated pooled-reserve V4 runtime profile differs from the V5 statement")]
    ProfileMismatch,
    /// The authenticated profile identity differs from the statement binding.
    #[error("authenticated pooled-reserve V4 runtime profile ID differs from the V5 statement")]
    ProfileIdMismatch,
    /// The fixed sticky-enforcement key is absent.
    #[error("pooled-reserve V5 sticky enforcement is absent")]
    MissingEnforcement,
    /// Sticky enforcement is not canonical SCALE `true`.
    #[error("pooled-reserve V5 sticky enforcement is not active")]
    InactiveEnforcement,
    /// The fixed commitment-producer address key is absent.
    #[error("pooled-reserve V5 commitment-producing bridge address is absent")]
    MissingBridgeAddress,
    /// The authenticated bridge address has the wrong exact width.
    #[error("pooled-reserve V5 bridge address must be 20 bytes, got {0}")]
    BridgeAddressLength(usize),
    /// The independent commitment-producing address differs from the active profile.
    #[error("pooled-reserve V5 commitment-producing bridge address differs from the profile")]
    BridgeAddressMismatch,
    /// The legacy Sudo authority remains present in the deciding state.
    #[error("pooled-reserve V5 Sudo key remains present")]
    SudoKeyPresent,
    /// The statement requests a runtime artifact larger than this proof profile permits.
    #[error("pooled-reserve V5 source runtime exceeds {max} bytes: {actual}")]
    ExpectedRuntimeCodeTooLarge {
        /// Statement-bound byte count.
        actual: usize,
        /// Profile maximum.
        max: usize,
    },
    /// The direct native runtime-code key is absent.
    #[error("pooled-reserve V5 source runtime code is absent")]
    MissingRuntimeCode,
    /// The authenticated native runtime is empty.
    #[error("pooled-reserve V5 source runtime code is empty")]
    EmptyRuntimeCode,
    /// The authenticated native runtime width differs from the statement.
    #[error("pooled-reserve V5 source runtime code size differs from the statement")]
    RuntimeCodeSizeMismatch,
    /// The authenticated native runtime SHA-256 differs from the statement.
    #[error("pooled-reserve V5 source runtime code SHA-256 differs from the statement")]
    RuntimeCodeDigestMismatch,
}

/// A same-root commitment/runtime rejection preserving the deciding layer.
#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum BridgePooledReserveRuntimeStateErrorV5 {
    /// The commitment membership or semantic equality check failed.
    #[error("bridge commitment verification failed: {0}")]
    Commitment(#[from] StateProofError),
    /// The pooled-reserve runtime-state check failed.
    #[error("pooled-reserve runtime-state verification failed: {0}")]
    Runtime(#[from] PooledReserveRuntimeStateErrorV5),
    /// The authenticated commitment is not valid under the active profile.
    #[error("pooled-reserve V5 commitment/profile binding mismatch: {0}")]
    Binding(&'static str),
}

// Keep this reader separate from the frozen V2 path. Generalizing the V2 reader changes the
// compiled V2 guest identity even when its accepted statements remain unchanged.
struct StateProofReaderV5 {
    db: ProofMemoryDb,
    state_root: [u8; 32],
    node_count: usize,
    proof_bytes: usize,
}

impl StateProofReaderV5 {
    fn new(state_root: [u8; 32], proof_nodes: &[Vec<u8>]) -> Result<Self, StateProofError> {
        if proof_nodes.len() > MAX_POOLED_RESERVE_STATE_PROOF_NODES_V5 {
            return Err(StateProofError::NodeCount {
                actual: proof_nodes.len(),
                max: MAX_POOLED_RESERVE_STATE_PROOF_NODES_V5,
            });
        }
        let mut proof_bytes = 0usize;
        let mut unique = BTreeSet::<&[u8]>::new();
        for (index, node) in proof_nodes.iter().enumerate() {
            if node.len() > MAX_POOLED_RESERVE_STATE_PROOF_NODE_BYTES_V5 {
                return Err(StateProofError::NodeSize {
                    index,
                    actual: node.len(),
                    max: MAX_POOLED_RESERVE_STATE_PROOF_NODE_BYTES_V5,
                });
            }
            proof_bytes = proof_bytes
                .checked_add(node.len())
                .ok_or(StateProofError::ProofSizeOverflow)?;
            if proof_bytes > MAX_POOLED_RESERVE_STATE_PROOF_BYTES_V5 {
                return Err(StateProofError::ProofSize {
                    actual: proof_bytes,
                    max: MAX_POOLED_RESERVE_STATE_PROOF_BYTES_V5,
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

fn verify_bridge_commitment_with_reader_v5(
    proof: &StateProofReaderV5,
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

/// Verify the exact V4 runtime profile, sticky marker, producer, Sudo absence, and runtime code.
pub fn verify_active_pooled_reserve_runtime_state_v5(
    state_root: [u8; 32],
    proof_nodes: &[Vec<u8>],
    expected: &PooledReserveBurnApplicationBindingV5,
) -> Result<VerifiedActivePooledReserveRuntimeStateV5, PooledReserveRuntimeStateErrorV5> {
    let proof = StateProofReaderV5::new(state_root, proof_nodes)?;
    verify_active_pooled_reserve_runtime_with_reader_v5(&proof, expected)
}

/// Verify commitment and all V5 runtime-authority reads from one proof database and root.
pub fn verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v5(
    state_root: [u8; 32],
    proof_nodes: &[Vec<u8>],
    expected_commitment: &BridgeCommitmentV1,
    expected_application: &PooledReserveBurnApplicationBindingV5,
) -> Result<VerifiedBridgePooledReserveRuntimeStateV5, BridgePooledReserveRuntimeStateErrorV5> {
    let proof = StateProofReaderV5::new(state_root, proof_nodes)?;
    let commitment = verify_bridge_commitment_with_reader_v5(&proof, expected_commitment)?;
    let runtime =
        verify_active_pooled_reserve_runtime_with_reader_v5(&proof, expected_application)?;
    if commitment.commitment.sidechain_id != runtime.profile.sidechain_id {
        return Err(BridgePooledReserveRuntimeStateErrorV5::Binding(
            "commitment sidechain ID",
        ));
    }
    if commitment.commitment.sidechain_height < runtime.profile.activation_height {
        return Err(BridgePooledReserveRuntimeStateErrorV5::Binding(
            "commitment precedes profile activation",
        ));
    }
    Ok(VerifiedBridgePooledReserveRuntimeStateV5 {
        commitment,
        runtime,
    })
}

fn verify_active_pooled_reserve_runtime_with_reader_v5(
    proof: &StateProofReaderV5,
    expected: &PooledReserveBurnApplicationBindingV5,
) -> Result<VerifiedActivePooledReserveRuntimeStateV5, PooledReserveRuntimeStateErrorV5> {
    encode_pooled_reserve_burn_application_binding_v5(expected)?;
    let expected_runtime_bytes = usize::try_from(expected.source_runtime_code_bytes)
        .expect("u32 always fits usize on supported targets");
    if expected_runtime_bytes > MAX_SOURCE_RUNTIME_CODE_BYTES_V5 {
        return Err(
            PooledReserveRuntimeStateErrorV5::ExpectedRuntimeCodeTooLarge {
                actual: expected_runtime_bytes,
                max: MAX_SOURCE_RUNTIME_CODE_BYTES_V5,
            },
        );
    }

    let profile_value = proof
        .read(&POOLED_RESERVE_RUNTIME_PROFILE_STORAGE_KEY_V4)?
        .ok_or(PooledReserveRuntimeStateErrorV5::MissingProfile)?;
    let encoded_profile: [u8; POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES] =
        profile_value.as_slice().try_into().map_err(|_| {
            PooledReserveRuntimeStateErrorV5::ProfileLength {
                expected: POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES,
                actual: profile_value.len(),
            }
        })?;
    let profile = decode_pooled_reserve_mint_reservation_runtime_profile_v4(&encoded_profile)?;
    let expected_profile =
        encode_pooled_reserve_mint_reservation_runtime_profile_v4(&expected.runtime_profile)?;
    if encoded_profile != expected_profile {
        return Err(PooledReserveRuntimeStateErrorV5::ProfileMismatch);
    }
    let runtime_profile_id = derive_pooled_reserve_mint_reservation_profile_v4_id(&profile)?;
    if runtime_profile_id != expected.runtime_profile_id {
        return Err(PooledReserveRuntimeStateErrorV5::ProfileIdMismatch);
    }

    let enforcement = proof
        .read(&POOLED_RESERVE_ENFORCEMENT_STORAGE_KEY_V4)?
        .ok_or(PooledReserveRuntimeStateErrorV5::MissingEnforcement)?;
    if enforcement.as_slice() != [1] {
        return Err(PooledReserveRuntimeStateErrorV5::InactiveEnforcement);
    }

    let bridge_address = proof
        .read(&BRIDGE_ADDRESS_STORAGE_KEY)?
        .ok_or(PooledReserveRuntimeStateErrorV5::MissingBridgeAddress)?;
    let bridge_address: [u8; 20] = bridge_address
        .as_slice()
        .try_into()
        .map_err(|_| PooledReserveRuntimeStateErrorV5::BridgeAddressLength(bridge_address.len()))?;
    if bridge_address != profile.bridge_address {
        return Err(PooledReserveRuntimeStateErrorV5::BridgeAddressMismatch);
    }

    if proof.read(&SUDO_KEY_STORAGE_KEY_V5)?.is_some() {
        return Err(PooledReserveRuntimeStateErrorV5::SudoKeyPresent);
    }

    let runtime_code = proof
        .read(&RUNTIME_CODE_STORAGE_KEY)?
        .ok_or(PooledReserveRuntimeStateErrorV5::MissingRuntimeCode)?;
    if runtime_code.is_empty() {
        return Err(PooledReserveRuntimeStateErrorV5::EmptyRuntimeCode);
    }
    if runtime_code.len() != expected_runtime_bytes {
        return Err(PooledReserveRuntimeStateErrorV5::RuntimeCodeSizeMismatch);
    }
    let source_runtime_code_sha256: [u8; 32] = Sha256::digest(&runtime_code).into();
    if source_runtime_code_sha256 != expected.source_runtime_code_sha256 {
        return Err(PooledReserveRuntimeStateErrorV5::RuntimeCodeDigestMismatch);
    }

    Ok(VerifiedActivePooledReserveRuntimeStateV5 {
        state_root: proof.state_root,
        profile_storage_key: POOLED_RESERVE_RUNTIME_PROFILE_STORAGE_KEY_V4,
        enforcement_storage_key: POOLED_RESERVE_ENFORCEMENT_STORAGE_KEY_V4,
        bridge_address_storage_key: BRIDGE_ADDRESS_STORAGE_KEY,
        runtime_code_storage_key: RUNTIME_CODE_STORAGE_KEY,
        encoded_profile,
        profile,
        runtime_profile_id,
        bridge_address,
        absent_sudo_key_storage_key: SUDO_KEY_STORAGE_KEY_V5,
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
        application: PooledReserveBurnApplicationBindingV5,
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
        assert_eq!(pallet_storage_key(b"Sudo", b"Key"), SUDO_KEY_STORAGE_KEY_V5);
        assert_eq!(RUNTIME_CODE_STORAGE_KEY, *b":code");
    }

    #[test]
    fn verifies_all_six_reads_under_one_root_with_runtime_code_above_v2_node_limit() {
        let fixture = build_fixture(0x42);
        assert!(fixture.runtime_code.len() > super::super::MAX_STATE_PROOF_NODE_BYTES);
        let verified = verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v5(
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
            verified.runtime.absent_sudo_key_storage_key,
            SUDO_KEY_STORAGE_KEY_V5
        );
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
    fn rejects_present_sudo_key_under_the_deciding_root() {
        let fixture = build_fixture(0x42);
        let commitment = encode_commitment(&fixture.commitment);
        let profile = encode_pooled_reserve_mint_reservation_runtime_profile_v4(
            &fixture.application.runtime_profile,
        )
        .unwrap();
        let (root, nodes) = state_proof_with_sudo(
            Some(&commitment),
            Some(&profile),
            Some(&[1]),
            Some(&fixture.application.runtime_profile.bridge_address),
            Some(&[0x51; 20]),
            Some(&fixture.runtime_code),
            0x5a,
            true,
        );

        assert_eq!(
            verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v5(
                root,
                &nodes,
                &fixture.commitment,
                &fixture.application,
            ),
            Err(BridgePooledReserveRuntimeStateErrorV5::Runtime(
                PooledReserveRuntimeStateErrorV5::SudoKeyPresent
            ))
        );
    }

    #[test]
    fn rejects_a_proof_that_omits_the_sudo_non_membership_path() {
        let fixture = build_fixture(0x42);
        let commitment = encode_commitment(&fixture.commitment);
        let profile = encode_pooled_reserve_mint_reservation_runtime_profile_v4(
            &fixture.application.runtime_profile,
        )
        .unwrap();
        let (root, nodes) = state_proof_with_sudo(
            Some(&commitment),
            Some(&profile),
            Some(&[1]),
            Some(&fixture.application.runtime_profile.bridge_address),
            None,
            Some(&fixture.runtime_code),
            0x5b,
            false,
        );

        assert_eq!(
            verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v5(
                root,
                &nodes,
                &fixture.commitment,
                &fixture.application,
            ),
            Err(BridgePooledReserveRuntimeStateErrorV5::Runtime(
                PooledReserveRuntimeStateErrorV5::Proof(StateProofError::TrieLookup)
            ))
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
                BridgePooledReserveRuntimeStateErrorV5::Commitment(
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
                BridgePooledReserveRuntimeStateErrorV5::Runtime(
                    PooledReserveRuntimeStateErrorV5::MissingProfile,
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
                BridgePooledReserveRuntimeStateErrorV5::Runtime(
                    PooledReserveRuntimeStateErrorV5::MissingEnforcement,
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
                BridgePooledReserveRuntimeStateErrorV5::Runtime(
                    PooledReserveRuntimeStateErrorV5::InactiveEnforcement,
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
                BridgePooledReserveRuntimeStateErrorV5::Runtime(
                    PooledReserveRuntimeStateErrorV5::MissingBridgeAddress,
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
                BridgePooledReserveRuntimeStateErrorV5::Runtime(
                    PooledReserveRuntimeStateErrorV5::MissingRuntimeCode,
                ),
            ),
        ];

        for ((root, nodes), expected) in cases {
            assert_eq!(
                verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v5(
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
                verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v5(
                    root,
                    &nodes,
                    &fixture.commitment,
                    &fixture.application,
                ),
                Err(BridgePooledReserveRuntimeStateErrorV5::Runtime(
                    PooledReserveRuntimeStateErrorV5::InactiveEnforcement
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
            verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v5(
                root,
                &nodes,
                &fixture.commitment,
                &fixture.application,
            ),
            Err(BridgePooledReserveRuntimeStateErrorV5::Runtime(
                PooledReserveRuntimeStateErrorV5::ProfileMismatch
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
            verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v5(
                root,
                &nodes,
                &fixture.commitment,
                &fixture.application,
            ),
            Err(BridgePooledReserveRuntimeStateErrorV5::Runtime(
                PooledReserveRuntimeStateErrorV5::BridgeAddressMismatch
            ))
        );

        let mut wrong_size = fixture.application.clone();
        wrong_size.source_runtime_code_bytes += 1;
        assert_eq!(
            verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v5(
                fixture.root,
                &fixture.nodes,
                &fixture.commitment,
                &wrong_size,
            ),
            Err(BridgePooledReserveRuntimeStateErrorV5::Runtime(
                PooledReserveRuntimeStateErrorV5::RuntimeCodeSizeMismatch
            ))
        );
        let mut wrong_hash = fixture.application.clone();
        wrong_hash.source_runtime_code_sha256[0] ^= 1;
        assert_eq!(
            verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v5(
                fixture.root,
                &fixture.nodes,
                &fixture.commitment,
                &wrong_hash,
            ),
            Err(BridgePooledReserveRuntimeStateErrorV5::Runtime(
                PooledReserveRuntimeStateErrorV5::RuntimeCodeDigestMismatch
            ))
        );

        let mut wrong_commitment = fixture.commitment.clone();
        wrong_commitment.bridge_event_root[0] ^= 1;
        assert_eq!(
            verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v5(
                fixture.root,
                &fixture.nodes,
                &wrong_commitment,
                &fixture.application,
            ),
            Err(BridgePooledReserveRuntimeStateErrorV5::Commitment(
                StateProofError::CommitmentMismatch("bridge event root")
            ))
        );

        let other = build_fixture(0x43);
        assert_eq!(
            verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v5(
                fixture.root,
                &other.nodes,
                &fixture.commitment,
                &fixture.application,
            ),
            Err(BridgePooledReserveRuntimeStateErrorV5::Commitment(
                StateProofError::MissingRoot
            ))
        );
    }

    #[test]
    fn rejects_an_expected_runtime_larger_than_the_v5_profile() {
        let fixture = build_fixture(0x42);
        let mut too_large = fixture.application.clone();
        too_large.source_runtime_code_bytes =
            u32::try_from(MAX_SOURCE_RUNTIME_CODE_BYTES_V5 + 1).unwrap();
        assert_eq!(
            verify_active_pooled_reserve_runtime_state_v5(fixture.root, &fixture.nodes, &too_large,),
            Err(
                PooledReserveRuntimeStateErrorV5::ExpectedRuntimeCodeTooLarge {
                    actual: MAX_SOURCE_RUNTIME_CODE_BYTES_V5 + 1,
                    max: MAX_SOURCE_RUNTIME_CODE_BYTES_V5,
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
        let application = PooledReserveBurnApplicationBindingV5 {
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
        state_proof_with_sudo(
            commitment,
            profile,
            enforcement,
            bridge_address,
            None,
            runtime_code,
            decoy,
            true,
        )
    }

    fn state_proof_with_sudo(
        commitment: Option<&[u8]>,
        profile: Option<&[u8]>,
        enforcement: Option<&[u8]>,
        bridge_address: Option<&[u8]>,
        sudo_key: Option<&[u8]>,
        runtime_code: Option<&[u8]>,
        decoy: u8,
        include_sudo_key_in_proof: bool,
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
            if let Some(value) = sudo_key {
                trie.insert(&SUDO_KEY_STORAGE_KEY_V5, value).unwrap();
            }
            let mut sudo_neighbor_key = SUDO_KEY_STORAGE_KEY_V5;
            sudo_neighbor_key[31] ^= 1;
            trie.insert(&sudo_neighbor_key, &[decoy; 32]).unwrap();
            if let Some(value) = runtime_code {
                trie.insert(&RUNTIME_CODE_STORAGE_KEY, value).unwrap();
            }
        }
        let backend = TrieBackendBuilder::new(db, root).build();
        let mut keys = vec![
            super::super::BRIDGE_COMMITMENT_STORAGE_KEY.to_vec(),
            POOLED_RESERVE_RUNTIME_PROFILE_STORAGE_KEY_V4.to_vec(),
            POOLED_RESERVE_ENFORCEMENT_STORAGE_KEY_V4.to_vec(),
            BRIDGE_ADDRESS_STORAGE_KEY.to_vec(),
            RUNTIME_CODE_STORAGE_KEY.to_vec(),
        ];
        if include_sudo_key_in_proof {
            keys.push(SUDO_KEY_STORAGE_KEY_V5.to_vec());
        }
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
        pallet_storage_key(b"BridgeCommitment", item)
    }

    fn pallet_storage_key(pallet: &[u8], item: &[u8]) -> [u8; 32] {
        let mut key = [0u8; 32];
        key[..16].copy_from_slice(&twox_128(pallet));
        key[16..].copy_from_slice(&twox_128(item));
        key
    }
}
