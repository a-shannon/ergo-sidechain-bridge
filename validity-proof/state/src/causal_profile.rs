use alloc::vec::Vec;

use blake2::{digest::consts::U32, Blake2b, Digest};
use thiserror::Error;

use super::{StateProofError, StateProofReaderV1};

/// Exact runtime storage key for `BridgeCommitment::CurrentCausalPegInProfileV2`.
pub const CURRENT_CAUSAL_PROFILE_STORAGE_KEY_V2: [u8; 32] = [
    0xaf, 0x86, 0xfe, 0xf4, 0x21, 0x6a, 0xc2, 0xbc, 0xd1, 0xc5, 0x92, 0xb2, 0x04, 0x01, 0x1a, 0xd0,
    0xa4, 0x29, 0xaf, 0x19, 0x44, 0x16, 0x08, 0x2f, 0x50, 0x09, 0xfd, 0xf7, 0x1f, 0x22, 0x76, 0x1e,
];

/// Exact runtime storage key for `BridgeCommitment::CausalPegInEnforcementActivatedV2`.
pub const CAUSAL_ENFORCEMENT_STORAGE_KEY_V2: [u8; 32] = [
    0xaf, 0x86, 0xfe, 0xf4, 0x21, 0x6a, 0xc2, 0xbc, 0xd1, 0xc5, 0x92, 0xb2, 0x04, 0x01, 0x1a, 0xd0,
    0xa9, 0x13, 0xa5, 0x59, 0xbe, 0x36, 0x5c, 0xac, 0xd6, 0x8b, 0x07, 0xeb, 0xf9, 0xb9, 0x2d, 0x3a,
];

/// Exact wire bytes of `AdmissionProfileV2`.
pub const CAUSAL_ADMISSION_PROFILE_V2_BYTES: usize = 313;
/// Exact SCALE bytes of `CausalPegInRuntimeProfileV2`.
pub const CAUSAL_APPLICATION_PROFILE_V2_SCALE_BYTES: usize = 419;

const ADMISSION_PROFILE_DOMAIN_V2: &[u8] = b"E2S_PEG_IN_CAUSAL_PROFILE_V2";
const ADMISSION_PROFILE_SCALE_PREFIX: [u8; 2] = [0xe5, 0x04];

type Blake2b256 = Blake2b<U32>;

/// Exact source-application fields exposed by the future validity statement.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CausalApplicationBindingV2 {
    /// Source Ergo network identity.
    pub source_network_id: [u8; 32],
    /// Frontier chain identity.
    pub sidechain_id: [u8; 32],
    /// Sole EVM bridge emitter accepted by the frozen causal profile.
    pub bridge_address: [u8; 20],
    /// Exact sERG token controlled by that bridge.
    pub token_address: [u8; 20],
    /// Settlement profile selected by source deposits.
    pub settlement_profile_id: [u8; 32],
    /// Domain-separated identity of the complete 313-byte admission profile.
    pub causal_profile_id: [u8; 32],
    /// Exact bridge runtime-code SHA-256 frozen at causal activation.
    pub bridge_runtime_code_sha256: [u8; 32],
    /// Exact bridge runtime-code byte count frozen at causal activation.
    pub bridge_runtime_code_bytes: u32,
    /// Exact token runtime-code SHA-256 frozen at causal activation.
    pub token_runtime_code_sha256: [u8; 32],
    /// Exact token runtime-code byte count frozen at causal activation.
    pub token_runtime_code_bytes: u32,
}

/// Strictly decoded `CausalPegInRuntimeProfileV2` state.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CausalApplicationProfileV2 {
    /// Public application binding.
    pub binding: CausalApplicationBindingV2,
    /// Source-lock ErgoTree digest.
    pub source_lock_ergo_tree_hash: [u8; 32],
    /// Non-refundable vault ErgoTree digest.
    pub vault_ergo_tree_hash: [u8; 32],
    /// Source finality policy identity.
    pub finality_policy_id: [u8; 32],
    /// Peg-in proof-system identity.
    pub proof_system_id: [u8; 32],
    /// Peg-in proof-profile identity.
    pub proof_profile_id: [u8; 32],
    /// Monotonic causal profile revision.
    pub profile_revision: u64,
    /// Native activation height.
    pub activation_height: u64,
    /// Exact bridge runtime-code SHA-256.
    pub bridge_runtime_code_sha256: [u8; 32],
    /// Exact bridge runtime-code byte count.
    pub bridge_runtime_code_bytes: u32,
    /// Exact token runtime-code SHA-256.
    pub token_runtime_code_sha256: [u8; 32],
    /// Exact token runtime-code byte count.
    pub token_runtime_code_bytes: u32,
    /// Canonical 313-byte admission profile.
    pub encoded_admission_profile: [u8; CAUSAL_ADMISSION_PROFILE_V2_BYTES],
}

/// Successful bounded membership proof for the active frozen causal application profile.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VerifiedActiveCausalApplicationProfileStateV2 {
    /// Caller-supplied state root; finality is established by the outer proof profile.
    pub state_root: [u8; 32],
    /// Fixed runtime storage key.
    pub storage_key: [u8; 32],
    /// Fixed sticky-enforcement storage key.
    pub enforcement_storage_key: [u8; 32],
    /// Exact authenticated SCALE value.
    pub encoded_value: [u8; CAUSAL_APPLICATION_PROFILE_V2_SCALE_BYTES],
    /// Strict semantic profile.
    pub profile: CausalApplicationProfileV2,
    /// Number of raw proof nodes.
    pub proof_node_count: usize,
    /// Aggregate raw proof bytes.
    pub proof_bytes: usize,
}

/// A causal application-profile state or binding rejection.
#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum CausalProfileStateError {
    /// The bounded Substrate proof failed.
    #[error("causal application state proof failed: {0}")]
    Proof(#[from] StateProofError),
    /// The fixed current-profile key is absent.
    #[error("current causal application profile is absent")]
    MissingProfile,
    /// The sticky causal-enforcement key is absent.
    #[error("causal application enforcement is absent")]
    MissingEnforcement,
    /// The sticky causal-enforcement value is not canonical SCALE `true`.
    #[error("causal application enforcement is not active")]
    InactiveEnforcement,
    /// The authenticated SCALE value has the wrong length.
    #[error("causal application profile must be {expected} bytes, got {actual}")]
    ProfileLength {
        /// Exact required bytes.
        expected: usize,
        /// Received bytes.
        actual: usize,
    },
    /// The bounded-vector SCALE prefix is not canonical.
    #[error("causal application profile has a noncanonical SCALE length")]
    ProfileScaleLength,
    /// The embedded admission profile has an unsupported format version.
    #[error("unsupported causal admission profile version: {0}")]
    ProfileVersion(u8),
    /// A required profile identity is zero.
    #[error("causal application profile contains a zero {0}")]
    ZeroField(&'static str),
    /// The bridge and token identities alias.
    #[error("causal application bridge and token addresses must differ")]
    AliasedAddresses,
    /// The stored profile ID does not match the canonical profile bytes.
    #[error("causal application profile ID does not match its canonical bytes")]
    ProfileId,
    /// A runtime-code byte count is zero.
    #[error("causal application profile contains an empty {0} runtime")]
    EmptyRuntime(&'static str),
    /// A public application field differs from the expected binding.
    #[error("causal application binding mismatch: {0}")]
    BindingMismatch(&'static str),
}

/// Decode one exact authenticated `CausalPegInRuntimeProfileV2` SCALE value.
pub fn decode_causal_application_profile_state_v2(
    bytes: &[u8],
) -> Result<CausalApplicationProfileV2, CausalProfileStateError> {
    if bytes.len() != CAUSAL_APPLICATION_PROFILE_V2_SCALE_BYTES {
        return Err(CausalProfileStateError::ProfileLength {
            expected: CAUSAL_APPLICATION_PROFILE_V2_SCALE_BYTES,
            actual: bytes.len(),
        });
    }
    if bytes[..2] != ADMISSION_PROFILE_SCALE_PREFIX {
        return Err(CausalProfileStateError::ProfileScaleLength);
    }

    let encoded_admission_profile = exact_array(&bytes[2..315]);
    if encoded_admission_profile[0] != 2 {
        return Err(CausalProfileStateError::ProfileVersion(
            encoded_admission_profile[0],
        ));
    }
    let source_network_id = exact_array(&encoded_admission_profile[1..33]);
    let sidechain_id = exact_array(&encoded_admission_profile[33..65]);
    let bridge_address = exact_array(&encoded_admission_profile[65..85]);
    let token_address = exact_array(&encoded_admission_profile[85..105]);
    let settlement_profile_id = exact_array(&encoded_admission_profile[105..137]);
    let source_lock_ergo_tree_hash = exact_array(&encoded_admission_profile[137..169]);
    let vault_ergo_tree_hash = exact_array(&encoded_admission_profile[169..201]);
    let finality_policy_id = exact_array(&encoded_admission_profile[201..233]);
    let proof_system_id = exact_array(&encoded_admission_profile[233..265]);
    let proof_profile_id = exact_array(&encoded_admission_profile[265..297]);
    let profile_revision = u64::from_be_bytes(exact_array(&encoded_admission_profile[297..305]));
    let activation_height = u64::from_be_bytes(exact_array(&encoded_admission_profile[305..313]));

    require_nonzero(&source_network_id, "source network ID")?;
    require_nonzero(&sidechain_id, "sidechain ID")?;
    require_nonzero(&bridge_address, "bridge address")?;
    require_nonzero(&token_address, "token address")?;
    if bridge_address == token_address {
        return Err(CausalProfileStateError::AliasedAddresses);
    }
    require_nonzero(&settlement_profile_id, "settlement profile ID")?;
    require_nonzero(&source_lock_ergo_tree_hash, "source-lock ErgoTree hash")?;
    require_nonzero(&vault_ergo_tree_hash, "vault ErgoTree hash")?;
    require_nonzero(&finality_policy_id, "finality policy ID")?;
    require_nonzero(&proof_system_id, "proof-system ID")?;
    require_nonzero(&proof_profile_id, "proof-profile ID")?;
    if profile_revision == 0 {
        return Err(CausalProfileStateError::ZeroField("profile revision"));
    }

    let causal_profile_id = exact_array(&bytes[315..347]);
    let expected_profile_id = domain_hash(ADMISSION_PROFILE_DOMAIN_V2, &encoded_admission_profile);
    if causal_profile_id != expected_profile_id {
        return Err(CausalProfileStateError::ProfileId);
    }
    let bridge_runtime_code_sha256 = exact_array(&bytes[347..379]);
    let bridge_runtime_code_bytes = u32::from_le_bytes(exact_array(&bytes[379..383]));
    let token_runtime_code_sha256 = exact_array(&bytes[383..415]);
    let token_runtime_code_bytes = u32::from_le_bytes(exact_array(&bytes[415..419]));
    require_nonzero(&bridge_runtime_code_sha256, "bridge runtime-code hash")?;
    require_nonzero(&token_runtime_code_sha256, "token runtime-code hash")?;
    if bridge_runtime_code_bytes == 0 {
        return Err(CausalProfileStateError::EmptyRuntime("bridge"));
    }
    if token_runtime_code_bytes == 0 {
        return Err(CausalProfileStateError::EmptyRuntime("token"));
    }

    Ok(CausalApplicationProfileV2 {
        binding: CausalApplicationBindingV2 {
            source_network_id,
            sidechain_id,
            bridge_address,
            token_address,
            settlement_profile_id,
            causal_profile_id,
            bridge_runtime_code_sha256,
            bridge_runtime_code_bytes,
            token_runtime_code_sha256,
            token_runtime_code_bytes,
        },
        source_lock_ergo_tree_hash,
        vault_ergo_tree_hash,
        finality_policy_id,
        proof_system_id,
        proof_profile_id,
        profile_revision,
        activation_height,
        bridge_runtime_code_sha256,
        bridge_runtime_code_bytes,
        token_runtime_code_sha256,
        token_runtime_code_bytes,
        encoded_admission_profile,
    })
}

/// Verify active fixed-key membership and exact application binding under one state root.
///
/// This function does not establish sidechain finality, execute the authenticated
/// runtime transition, or authorize a payout. Those remain obligations of the
/// outer versioned proof profile and the settlement contract.
pub fn verify_active_causal_application_profile_state_v2(
    state_root: [u8; 32],
    proof_nodes: &[Vec<u8>],
    expected: &CausalApplicationBindingV2,
) -> Result<VerifiedActiveCausalApplicationProfileStateV2, CausalProfileStateError> {
    let proof = StateProofReaderV1::new(state_root, proof_nodes)?;
    verify_active_causal_application_profile_with_reader_v2(&proof, expected)
}

pub(crate) fn verify_active_causal_application_profile_with_reader_v2(
    proof: &StateProofReaderV1,
    expected: &CausalApplicationBindingV2,
) -> Result<VerifiedActiveCausalApplicationProfileStateV2, CausalProfileStateError> {
    let value = proof.read(&CURRENT_CAUSAL_PROFILE_STORAGE_KEY_V2)?;
    let value = value.ok_or(CausalProfileStateError::MissingProfile)?;
    let encoded_value: [u8; CAUSAL_APPLICATION_PROFILE_V2_SCALE_BYTES] = value
        .as_slice()
        .try_into()
        .map_err(|_| CausalProfileStateError::ProfileLength {
            expected: CAUSAL_APPLICATION_PROFILE_V2_SCALE_BYTES,
            actual: value.len(),
        })?;
    let profile = decode_causal_application_profile_state_v2(&encoded_value)?;
    compare_binding(&profile, expected)?;
    let enforcement = proof.read(&CAUSAL_ENFORCEMENT_STORAGE_KEY_V2)?;
    let enforcement = enforcement.ok_or(CausalProfileStateError::MissingEnforcement)?;
    if enforcement.as_slice() != [1] {
        return Err(CausalProfileStateError::InactiveEnforcement);
    }
    Ok(VerifiedActiveCausalApplicationProfileStateV2 {
        state_root: proof.state_root,
        storage_key: CURRENT_CAUSAL_PROFILE_STORAGE_KEY_V2,
        enforcement_storage_key: CAUSAL_ENFORCEMENT_STORAGE_KEY_V2,
        encoded_value,
        profile,
        proof_node_count: proof.node_count,
        proof_bytes: proof.proof_bytes,
    })
}

fn compare_binding(
    profile: &CausalApplicationProfileV2,
    expected: &CausalApplicationBindingV2,
) -> Result<(), CausalProfileStateError> {
    let actual = &profile.binding;
    if actual.source_network_id != expected.source_network_id {
        return Err(CausalProfileStateError::BindingMismatch(
            "source network ID",
        ));
    }
    if actual.sidechain_id != expected.sidechain_id {
        return Err(CausalProfileStateError::BindingMismatch("sidechain ID"));
    }
    if actual.bridge_address != expected.bridge_address {
        return Err(CausalProfileStateError::BindingMismatch("bridge address"));
    }
    if actual.token_address != expected.token_address {
        return Err(CausalProfileStateError::BindingMismatch("token address"));
    }
    if actual.settlement_profile_id != expected.settlement_profile_id {
        return Err(CausalProfileStateError::BindingMismatch(
            "settlement profile ID",
        ));
    }
    if actual.causal_profile_id != expected.causal_profile_id {
        return Err(CausalProfileStateError::BindingMismatch(
            "causal profile ID",
        ));
    }
    if profile.bridge_runtime_code_sha256 != expected.bridge_runtime_code_sha256 {
        return Err(CausalProfileStateError::BindingMismatch(
            "bridge runtime-code hash",
        ));
    }
    if profile.bridge_runtime_code_bytes != expected.bridge_runtime_code_bytes {
        return Err(CausalProfileStateError::BindingMismatch(
            "bridge runtime-code size",
        ));
    }
    if profile.token_runtime_code_sha256 != expected.token_runtime_code_sha256 {
        return Err(CausalProfileStateError::BindingMismatch(
            "token runtime-code hash",
        ));
    }
    if profile.token_runtime_code_bytes != expected.token_runtime_code_bytes {
        return Err(CausalProfileStateError::BindingMismatch(
            "token runtime-code size",
        ));
    }
    Ok(())
}

fn require_nonzero<const N: usize>(
    value: &[u8; N],
    field: &'static str,
) -> Result<(), CausalProfileStateError> {
    if value.iter().all(|byte| *byte == 0) {
        return Err(CausalProfileStateError::ZeroField(field));
    }
    Ok(())
}

fn domain_hash(domain: &[u8], bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Blake2b256::new();
    hasher.update(domain);
    hasher.update(bytes);
    hasher.finalize().into()
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
    use sp_state_machine::{prove_read_on_trie_backend, TrieBackendBuilder};
    use sp_trie::{LayoutV1, MemoryDB as OracleMemoryDb, TrieDBMutBuilder, TrieMut};

    const CAUSAL_VECTOR_JSON: &str = include_str!(
        "../../../relayer/test-vectors/native-finalized-peg-in-causal-mint-transition-v3.json"
    );

    #[derive(Deserialize)]
    struct CausalVector {
        request: CausalVectorRequest,
        expected: CausalVectorExpected,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CausalVectorRequest {
        mint_transition_request: CausalMintTransitionRequest,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CausalMintTransitionRequest {
        parent_state_proof_nodes_hex: Vec<String>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CausalVectorExpected {
        header_binding: CausalHeaderBinding,
        causal_transition: CausalTransition,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CausalHeaderBinding {
        parent_state_root_hex: String,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CausalTransition {
        causal_profile_id_hex: String,
    }

    #[test]
    fn reproduces_existing_causal_transition_vector() {
        let vector: CausalVector = serde_json::from_str(CAUSAL_VECTOR_JSON).unwrap();
        let root = fixed_hex::<32>(&vector.expected.header_binding.parent_state_root_hex);
        let nodes = vector
            .request
            .mint_transition_request
            .parent_state_proof_nodes_hex
            .iter()
            .map(|value| prefixed_hex(value))
            .collect::<Vec<_>>();
        let expected = CausalApplicationBindingV2 {
            source_network_id: [0xaa; 32],
            sidechain_id: [0x11; 32],
            bridge_address: [0x22; 20],
            token_address: [0x21; 20],
            settlement_profile_id: [0xbb; 32],
            causal_profile_id: fixed_hex(&vector.expected.causal_transition.causal_profile_id_hex),
            bridge_runtime_code_sha256: fixed_hex(
                "0xba3d364b0b10103032ebc8974a70e54e1c0aa69854212edfbc7daec81f3e3751",
            ),
            bridge_runtime_code_bytes: 4_104,
            token_runtime_code_sha256: fixed_hex(
                "0x43b2edc69034b0e801fd13efc3b5d4bfb50dc255b17d49e058c4dcf79d872989",
            ),
            token_runtime_code_bytes: 2_356,
        };

        let verified =
            verify_active_causal_application_profile_state_v2(root, &nodes, &expected).unwrap();
        assert_eq!(verified.state_root, root);
        assert_eq!(verified.profile.binding, expected);
        assert_eq!(verified.profile.profile_revision, 3);
        assert_eq!(verified.profile.activation_height, 1_000);
        assert_eq!(verified.profile.bridge_runtime_code_bytes, 4_104);
        assert_eq!(verified.profile.token_runtime_code_bytes, 2_356);
        assert_eq!(verified.proof_node_count, nodes.len());
        assert!(verified.proof_bytes > 0);
    }

    #[test]
    fn verifies_exact_profile_membership_and_public_binding() {
        let (value, expected) = fixture();
        let (root, nodes) = generated_proof(Some(&value), Some(&[1]));
        let verified =
            verify_active_causal_application_profile_state_v2(root, &nodes, &expected).unwrap();

        assert_eq!(verified.storage_key, CURRENT_CAUSAL_PROFILE_STORAGE_KEY_V2);
        assert_eq!(
            verified.enforcement_storage_key,
            CAUSAL_ENFORCEMENT_STORAGE_KEY_V2,
        );
        assert_eq!(verified.encoded_value.as_slice(), value);
        assert_eq!(verified.profile.binding, expected);
        assert_eq!(verified.proof_node_count, nodes.len());
        assert!(verified.proof_bytes > 0);
    }

    #[test]
    fn verifies_commitment_profile_and_enforcement_from_one_proof_database() {
        let (profile_value, expected_application) = fixture();
        let expected_commitment = crate::BridgeCommitmentV1 {
            sidechain_id: expected_application.sidechain_id,
            sidechain_height: 42,
            execution_block_hash: [0x31; 32],
            bridge_event_root: [0x32; 32],
            burn_leaf_count: 1,
        };
        let mut commitment_value = Vec::with_capacity(crate::BRIDGE_COMMITMENT_V1_SCALE_BYTES);
        commitment_value.push(1);
        commitment_value.extend_from_slice(&expected_commitment.sidechain_id);
        commitment_value.extend_from_slice(&expected_commitment.sidechain_height.to_le_bytes());
        commitment_value.extend_from_slice(&expected_commitment.execution_block_hash);
        commitment_value.extend_from_slice(&expected_commitment.bridge_event_root);
        commitment_value.extend_from_slice(&expected_commitment.burn_leaf_count.to_le_bytes());

        let (root, nodes) = generated_combined_proof(&commitment_value, &profile_value);
        let verified = crate::verify_bridge_commitment_and_active_causal_application_state_v2(
            root,
            &nodes,
            &expected_commitment,
            &expected_application,
        )
        .unwrap();

        assert_eq!(verified.commitment.state_root, root);
        assert_eq!(verified.causal_application.state_root, root);
        assert_eq!(
            verified.commitment.proof_node_count,
            verified.causal_application.proof_node_count
        );
        assert_eq!(
            verified.commitment.proof_bytes,
            verified.causal_application.proof_bytes
        );
        assert_eq!(verified.commitment.commitment, expected_commitment);
        assert_eq!(
            verified.causal_application.profile.binding,
            expected_application
        );
    }

    #[test]
    fn rejects_absence_shape_version_profile_id_runtime_and_alias_drift() {
        let (value, expected) = fixture();
        let (root, nodes) = generated_proof(None, None);
        assert_eq!(
            verify_active_causal_application_profile_state_v2(root, &nodes, &expected),
            Err(CausalProfileStateError::MissingProfile),
        );

        assert!(matches!(
            decode_causal_application_profile_state_v2(&value[..418]),
            Err(CausalProfileStateError::ProfileLength { .. })
        ));
        let mut changed = value.clone();
        changed[0] ^= 1;
        assert_eq!(
            decode_causal_application_profile_state_v2(&changed),
            Err(CausalProfileStateError::ProfileScaleLength),
        );
        let mut changed = value.clone();
        changed[2] = 1;
        assert_eq!(
            decode_causal_application_profile_state_v2(&changed),
            Err(CausalProfileStateError::ProfileVersion(1)),
        );
        let mut changed = value.clone();
        changed[315] ^= 1;
        assert_eq!(
            decode_causal_application_profile_state_v2(&changed),
            Err(CausalProfileStateError::ProfileId),
        );
        let mut changed = value.clone();
        changed[379..383].fill(0);
        assert_eq!(
            decode_causal_application_profile_state_v2(&changed),
            Err(CausalProfileStateError::EmptyRuntime("bridge")),
        );
        let mut changed = value.clone();
        changed[87..107].copy_from_slice(&value[67..87]);
        rewrite_profile_id(&mut changed);
        assert_eq!(
            decode_causal_application_profile_state_v2(&changed),
            Err(CausalProfileStateError::AliasedAddresses),
        );
    }

    #[test]
    fn rejects_missing_false_and_noncanonical_enforcement() {
        let (value, expected) = fixture();
        let (root, nodes) = generated_proof(Some(&value), None);
        assert_eq!(
            verify_active_causal_application_profile_state_v2(root, &nodes, &expected),
            Err(CausalProfileStateError::MissingEnforcement),
        );

        for encoded in [&[0][..], &[2][..], &[1, 0][..]] {
            let (root, nodes) = generated_proof(Some(&value), Some(encoded));
            assert_eq!(
                verify_active_causal_application_profile_state_v2(root, &nodes, &expected),
                Err(CausalProfileStateError::InactiveEnforcement),
            );
        }
    }

    #[test]
    fn rejects_zero_identity_runtime_and_revision_fields() {
        let (value, _) = fixture();
        for (range, field) in [
            (3..35, "source network ID"),
            (35..67, "sidechain ID"),
            (67..87, "bridge address"),
            (87..107, "token address"),
            (107..139, "settlement profile ID"),
            (139..171, "source-lock ErgoTree hash"),
            (171..203, "vault ErgoTree hash"),
            (203..235, "finality policy ID"),
            (235..267, "proof-system ID"),
            (267..299, "proof-profile ID"),
            (299..307, "profile revision"),
        ] {
            let mut changed = value.clone();
            changed[range].fill(0);
            rewrite_profile_id(&mut changed);
            assert_eq!(
                decode_causal_application_profile_state_v2(&changed),
                Err(CausalProfileStateError::ZeroField(field)),
            );
        }

        for (range, field) in [
            (347..379, "bridge runtime-code hash"),
            (383..415, "token runtime-code hash"),
        ] {
            let mut changed = value.clone();
            changed[range].fill(0);
            assert_eq!(
                decode_causal_application_profile_state_v2(&changed),
                Err(CausalProfileStateError::ZeroField(field)),
            );
        }

        for (range, runtime) in [(379..383, "bridge"), (415..419, "token")] {
            let mut changed = value.clone();
            changed[range].fill(0);
            assert_eq!(
                decode_causal_application_profile_state_v2(&changed),
                Err(CausalProfileStateError::EmptyRuntime(runtime)),
            );
        }
    }

    #[test]
    fn rejects_every_public_application_binding_substitution() {
        let (value, expected) = fixture();
        for (field, mutate) in [
            ("source network ID", 0usize),
            ("sidechain ID", 1),
            ("bridge address", 2),
            ("token address", 3),
            ("settlement profile ID", 4),
            ("causal profile ID", 5),
            ("bridge runtime-code hash", 6),
            ("bridge runtime-code size", 7),
            ("token runtime-code hash", 8),
            ("token runtime-code size", 9),
        ] {
            let (root, nodes) = generated_proof(Some(&value), Some(&[1]));
            let mut changed = expected.clone();
            match mutate {
                0 => changed.source_network_id[0] ^= 1,
                1 => changed.sidechain_id[0] ^= 1,
                2 => changed.bridge_address[0] ^= 1,
                3 => changed.token_address[0] ^= 1,
                4 => changed.settlement_profile_id[0] ^= 1,
                5 => changed.causal_profile_id[0] ^= 1,
                6 => changed.bridge_runtime_code_sha256[0] ^= 1,
                7 => changed.bridge_runtime_code_bytes += 1,
                8 => changed.token_runtime_code_sha256[0] ^= 1,
                9 => changed.token_runtime_code_bytes += 1,
                _ => unreachable!(),
            }
            assert_eq!(
                verify_active_causal_application_profile_state_v2(root, &nodes, &changed),
                Err(CausalProfileStateError::BindingMismatch(field)),
            );
        }
    }

    fn fixture() -> (Vec<u8>, CausalApplicationBindingV2) {
        let mut profile = Vec::with_capacity(CAUSAL_ADMISSION_PROFILE_V2_BYTES);
        profile.push(2);
        profile.extend_from_slice(&[0x11; 32]);
        profile.extend_from_slice(&[0x22; 32]);
        profile.extend_from_slice(&[0x33; 20]);
        profile.extend_from_slice(&[0x44; 20]);
        profile.extend_from_slice(&[0x55; 32]);
        profile.extend_from_slice(&[0x66; 32]);
        profile.extend_from_slice(&[0x77; 32]);
        profile.extend_from_slice(&[0x88; 32]);
        profile.extend_from_slice(&[0x99; 32]);
        profile.extend_from_slice(&[0xaa; 32]);
        profile.extend_from_slice(&7u64.to_be_bytes());
        profile.extend_from_slice(&1_024u64.to_be_bytes());
        assert_eq!(profile.len(), CAUSAL_ADMISSION_PROFILE_V2_BYTES);
        let causal_profile_id = domain_hash(ADMISSION_PROFILE_DOMAIN_V2, &profile);

        let mut value = Vec::with_capacity(CAUSAL_APPLICATION_PROFILE_V2_SCALE_BYTES);
        value.extend_from_slice(&ADMISSION_PROFILE_SCALE_PREFIX);
        value.extend_from_slice(&profile);
        value.extend_from_slice(&causal_profile_id);
        value.extend_from_slice(&[0xbb; 32]);
        value.extend_from_slice(&4_096u32.to_le_bytes());
        value.extend_from_slice(&[0xcc; 32]);
        value.extend_from_slice(&2_048u32.to_le_bytes());
        assert_eq!(value.len(), CAUSAL_APPLICATION_PROFILE_V2_SCALE_BYTES);

        (
            value,
            CausalApplicationBindingV2 {
                source_network_id: [0x11; 32],
                sidechain_id: [0x22; 32],
                bridge_address: [0x33; 20],
                token_address: [0x44; 20],
                settlement_profile_id: [0x55; 32],
                causal_profile_id,
                bridge_runtime_code_sha256: [0xbb; 32],
                bridge_runtime_code_bytes: 4_096,
                token_runtime_code_sha256: [0xcc; 32],
                token_runtime_code_bytes: 2_048,
            },
        )
    }

    fn generated_proof(
        profile: Option<&[u8]>,
        enforcement: Option<&[u8]>,
    ) -> ([u8; 32], Vec<Vec<u8>>) {
        let mut db = OracleMemoryDb::<OracleHasher>::default();
        let mut root = H256::default();
        {
            let mut trie =
                TrieDBMutBuilder::<LayoutV1<OracleHasher>>::new(&mut db, &mut root).build();
            trie.insert(&[0x10; 32], &[0x20; 48]).unwrap();
            if let Some(value) = profile {
                trie.insert(&CURRENT_CAUSAL_PROFILE_STORAGE_KEY_V2, value)
                    .unwrap();
            }
            if let Some(value) = enforcement {
                trie.insert(&CAUSAL_ENFORCEMENT_STORAGE_KEY_V2, value)
                    .unwrap();
            }
        }
        let backend = TrieBackendBuilder::new(db, root).build();
        let proof = prove_read_on_trie_backend(
            &backend,
            [
                CURRENT_CAUSAL_PROFILE_STORAGE_KEY_V2,
                CAUSAL_ENFORCEMENT_STORAGE_KEY_V2,
            ],
        )
        .unwrap();
        (root.into(), proof.into_iter_nodes().collect())
    }

    fn generated_combined_proof(commitment: &[u8], profile: &[u8]) -> ([u8; 32], Vec<Vec<u8>>) {
        let mut db = OracleMemoryDb::<OracleHasher>::default();
        let mut root = H256::default();
        {
            let mut trie =
                TrieDBMutBuilder::<LayoutV1<OracleHasher>>::new(&mut db, &mut root).build();
            trie.insert(&crate::BRIDGE_COMMITMENT_STORAGE_KEY, commitment)
                .unwrap();
            trie.insert(&CURRENT_CAUSAL_PROFILE_STORAGE_KEY_V2, profile)
                .unwrap();
            trie.insert(&CAUSAL_ENFORCEMENT_STORAGE_KEY_V2, &[1])
                .unwrap();
        }
        let backend = TrieBackendBuilder::new(db, root).build();
        let proof = prove_read_on_trie_backend(
            &backend,
            [
                crate::BRIDGE_COMMITMENT_STORAGE_KEY,
                CURRENT_CAUSAL_PROFILE_STORAGE_KEY_V2,
                CAUSAL_ENFORCEMENT_STORAGE_KEY_V2,
            ],
        )
        .unwrap();
        (root.into(), proof.into_iter_nodes().collect())
    }

    fn rewrite_profile_id(value: &mut [u8]) {
        let profile_id = domain_hash(ADMISSION_PROFILE_DOMAIN_V2, &value[2..315]);
        value[315..347].copy_from_slice(&profile_id);
    }

    fn fixed_hex<const N: usize>(value: &str) -> [u8; N] {
        prefixed_hex(value)
            .try_into()
            .unwrap_or_else(|bytes: Vec<u8>| {
                panic!("expected {N} bytes, got {}", bytes.len());
            })
    }

    fn prefixed_hex(value: &str) -> Vec<u8> {
        hex::decode(
            value
                .strip_prefix("0x")
                .expect("fixture values are 0x-prefixed"),
        )
        .expect("fixture values are valid hex")
    }
}
