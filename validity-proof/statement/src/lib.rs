//! Preactivation bridge public-input codec for an EIP-0045 validity guest.
//!
//! This crate freezes bytes and compatibility identities only. It neither verifies GRANDPA/state
//! semantics nor activates an Ergo verifier profile or aggregate proof-system ID.

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

#[cfg(feature = "substrate-federated-v1")]
extern crate alloc;

use blake2::{digest::consts::U32, Blake2b, Digest};
use thiserror::Error;

#[cfg(feature = "application-v2")]
mod application_statement_v2;
#[cfg(feature = "pooled-reserve-burn-v4")]
mod pooled_reserve_burn_statement_v4;
#[cfg(feature = "pooled-reserve-burn-v5")]
mod pooled_reserve_burn_statement_v5;
#[cfg(feature = "substrate-federated-v1")]
mod substrate_federated_checkpoint_statement_v1;

#[cfg(feature = "application-v2")]
pub use application_statement_v2::{
    decode_bridge_causal_application_binding_v2, decode_bridge_validity_application_payload_v3,
    decode_eip0045_bridge_application_statement_v2,
    derive_bridge_causal_application_binding_v2_digest,
    encode_bridge_causal_application_binding_v2, encode_bridge_validity_application_payload_v3,
    encode_eip0045_bridge_application_statement_v2, BridgeCausalApplicationBindingV2,
    BridgeValidityApplicationPayloadV3, Eip0045BridgeApplicationStatementV2,
    BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES, BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES,
    BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN, EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES,
};

#[cfg(feature = "pooled-reserve-burn-v4")]
pub use pooled_reserve_burn_statement_v4::{
    decode_eip0045_pooled_reserve_burn_statement_v4,
    decode_pooled_reserve_burn_application_binding_v4, decode_pooled_reserve_burn_public_inputs_v4,
    decode_pooled_reserve_mint_reservation_runtime_profile_v4,
    derive_pooled_reserve_burn_application_binding_v4_digest,
    derive_pooled_reserve_mint_reservation_profile_v4_id,
    encode_eip0045_pooled_reserve_burn_statement_v4,
    encode_pooled_reserve_burn_application_binding_v4, encode_pooled_reserve_burn_public_inputs_v4,
    encode_pooled_reserve_mint_reservation_runtime_profile_v4, Eip0045PooledReserveBurnStatementV4,
    PooledReserveBurnApplicationBindingV4, PooledReserveBurnPublicInputsV4,
    PooledReserveMintReservationRuntimeProfileV4, EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES,
    POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES,
    POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN, POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES,
    POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN,
    POOLED_RESERVE_BURN_V4_REJECTED_APPLICATION_V2_PROGRAM_ID,
    POOLED_RESERVE_MINT_RESERVATION_PROFILE_V4_DOMAIN,
    POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES,
};

#[cfg(feature = "pooled-reserve-burn-v5")]
pub use pooled_reserve_burn_statement_v5::{
    decode_eip0045_pooled_reserve_burn_statement_v5,
    decode_pooled_reserve_burn_application_binding_v5, decode_pooled_reserve_burn_public_inputs_v5,
    derive_eip0045_pooled_reserve_burn_statement_v5_digest,
    derive_pooled_reserve_burn_application_binding_v5_digest,
    encode_eip0045_pooled_reserve_burn_statement_v5,
    encode_pooled_reserve_burn_application_binding_v5, encode_pooled_reserve_burn_public_inputs_v5,
    Eip0045PooledReserveBurnStatementV5, PooledReserveBurnApplicationBindingV5,
    PooledReserveBurnPublicInputsV5, EIP0045_POOLED_RESERVE_BURN_STATEMENT_V5_BYTES,
    POOLED_RESERVE_BURN_APPLICATION_BINDING_V5_BYTES,
    POOLED_RESERVE_BURN_APPLICATION_BINDING_V5_DOMAIN, POOLED_RESERVE_BURN_PUBLIC_INPUTS_V5_BYTES,
    POOLED_RESERVE_BURN_PUBLIC_INPUTS_V5_DOMAIN, POOLED_RESERVE_BURN_STATEMENT_V5_DOMAIN,
    POOLED_RESERVE_BURN_V5_REJECTED_APPLICATION_V2_PROGRAM_ID,
};

#[cfg(feature = "substrate-federated-v1")]
pub use substrate_federated_checkpoint_statement_v1::{
    assert_substrate_federated_checkpoint_statement_v1_matches,
    assert_substrate_federated_checkpoint_statement_v1_matches_profile,
    build_substrate_federated_checkpoint_profile_v1,
    build_substrate_federated_checkpoint_statement_v1,
    decode_substrate_federated_checkpoint_profile_v1,
    decode_substrate_federated_checkpoint_statement_v1,
    decode_substrate_federated_checkpoint_statement_v1_for_admission,
    derive_substrate_federated_checkpoint_attestation_digest_v1,
    encode_substrate_federated_checkpoint_extension_value_v1,
    encode_substrate_federated_checkpoint_profile_v1,
    encode_substrate_federated_checkpoint_statement_v1, SubstrateFederatedCheckpointProfileV1,
    SubstrateFederatedCheckpointProfileV1Input, SubstrateFederatedCheckpointStatementV1,
    SubstrateFederatedCheckpointStatementV1Input,
    SUBSTRATE_FEDERATED_CHECKPOINT_ATTESTATION_V1_DOMAIN,
    SUBSTRATE_FEDERATED_CHECKPOINT_EXTENSION_KEY,
    SUBSTRATE_FEDERATED_CHECKPOINT_EXTENSION_VALUE_BYTES,
    SUBSTRATE_FEDERATED_CHECKPOINT_FINALITY_THRESHOLD_ATTESTED,
    SUBSTRATE_FEDERATED_CHECKPOINT_HASH_BLAKE2B256,
    SUBSTRATE_FEDERATED_CHECKPOINT_MAX_KEYS_PER_ROLE,
    SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_FLAGS_NONE,
    SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1_DOMAIN,
    SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1_VERSION,
    SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_FLAGS_NONE,
    SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES,
    SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_DOMAIN,
    SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_VERSION,
    SUBSTRATE_FEDERATED_ERGO_KEY_ALGORITHM_SIGMAPROP, SUBSTRATE_FEDERATED_ERGO_KEY_SET_V1_DOMAIN,
    SUBSTRATE_FEDERATED_SOURCE_KEY_ALGORITHM_ED25519, SUBSTRATE_FEDERATED_SOURCE_KEY_SET_V1_DOMAIN,
};

/// Domain at the start of every bridge validity/finality application payload.
pub const BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN: &[u8] =
    b"E2S_BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2";
/// Exact application-payload size.
pub const BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES: usize = 654;
/// Exact fixed prefix of EIP-0045 `ErgoStatementV1`.
pub const EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES: usize = 159;
/// Exact size of this bridge's complete EIP-0045 statement.
pub const EIP0045_BRIDGE_STATEMENT_V1_BYTES: usize =
    EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES + BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES;

const EIP0045_STATEMENT_DOMAIN: &[u8] = b"Ergo.VerifyStark.Statement";
const CHECKPOINT_DOMAIN: &[u8] = b"E2S_BRIDGE_CHECKPOINT_V1";
const BRIDGE_FINALITY_PROGRAM_ID_DOMAIN: &[u8] = b"E2S_GRANDPA_STATE_AND_FINALITY_PROGRAM_V1";
const STATEMENT_V1_DOMAIN: &[u8] = b"E2S_BRIDGE_FINALITY_STATEMENT_V1";
const NATIVE_PAYLOAD_V1_DOMAIN: &[u8] = b"E2S_NATIVE_GRANDPA_PROOF_PAYLOAD_V1";
const AGGREGATE_PROOF_V1_DOMAIN: &[u8] = b"E2S_AGGREGATE_FINALITY_PROOF_V1";
const CHECKPOINT_BYTES: usize = 216;
const COMPATIBILITY_STATEMENT_BYTES: usize = 356;
const COMPATIBILITY_PROOF_PREFIX_BYTES: usize = 464;
/// Exact maximum native verifier request accepted by the V1 compatibility format.
pub const MAX_NATIVE_VERIFIER_REQUEST_BYTES: usize = 32 * 1024 * 1024;

const TRACKER_NFT_OFFSET: usize = 44;
const CHECKPOINT_OFFSET: usize = 76;
const CHECKPOINT_COMMITMENT_OFFSET: usize = 292;
const STATEMENT_DIGEST_OFFSET: usize = 324;
const SEMANTIC_PROGRAM_OFFSET: usize = 356;
const VERIFIER_PROFILE_OFFSET: usize = 388;
const PAYLOAD_DIGEST_OFFSET: usize = 420;
const AGGREGATE_PROOF_DIGEST_OFFSET: usize = 452;
const NATIVE_REQUEST_DIGEST_OFFSET: usize = 484;
const TRUSTED_ANCHOR_OFFSET: usize = 516;
const FINALITY_HEIGHT_OFFSET: usize = 548;
const FINALITY_HASH_OFFSET: usize = 556;
const EXTENSION_KEY_OFFSET: usize = 588;
const EXTENSION_VALUE_OFFSET: usize = 590;

type Blake2b256 = Blake2b<U32>;

/// A canonical, internally consistent V2 bridge application payload.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BridgeValidityFinalityPayloadV2 {
    /// Tracker singleton token ID.
    pub tracker_nft_id: [u8; 32],
    /// Canonical V1 checkpoint bytes.
    pub checkpoint: [u8; CHECKPOINT_BYTES],
    /// Domain-separated V1 checkpoint commitment.
    pub checkpoint_commitment: [u8; 32],
    /// Domain-separated compatibility statement digest.
    pub compatibility_statement_digest: [u8; 32],
    /// V1 semantic program identity already persisted by the tracker.
    pub compatibility_semantic_program_id: [u8; 32],
    /// V1 native-verifier profile identity already persisted by the tracker.
    pub compatibility_verifier_profile_id: [u8; 32],
    /// V1 domain-separated native payload digest.
    pub compatibility_payload_digest: [u8; 32],
    /// V1 domain-separated complete aggregate-proof digest.
    pub compatibility_aggregate_proof_digest: [u8; 32],
    /// Raw Blake2b-256 digest of the native verifier request.
    pub native_verifier_request_digest: [u8; 32],
    /// Reviewed GRANDPA trust-anchor identity.
    pub trusted_anchor_digest: [u8; 32],
    /// Finalized native horizon height.
    pub finality_horizon_height: u64,
    /// Finalized native horizon hash.
    pub finality_horizon_hash: [u8; 32],
    /// Exact `bridgeEventRoot || checkpointCommitment` value anchored at `0x0401`.
    pub extension_value: [u8; 64],
    /// Exact canonical bytes.
    pub encoded: [u8; BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES],
}

/// A decoded EIP-0045 `ErgoStatementV1` carrying the V2 bridge payload.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Eip0045BridgeStatementV1 {
    /// Settlement-chain domain supplied by the trusted Ergo host.
    pub chain_domain_id: [u8; 32],
    /// Exact activated verifier-profile identity.
    pub profile_id: [u8; 32],
    /// Exact guest image/program identity.
    pub program_id: [u8; 32],
    /// Blake2b-256 of the executing proposition bytes.
    pub contract_id: [u8; 32],
    /// Strictly decoded application payload.
    pub application_payload: BridgeValidityFinalityPayloadV2,
    /// Exact canonical statement bytes.
    pub encoded: [u8; EIP0045_BRIDGE_STATEMENT_V1_BYTES],
}

/// A canonical byte or compatibility-binding rejection.
#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum StatementError {
    /// An exact object has the wrong length.
    #[error("{object} length mismatch: expected {expected}, got {actual}")]
    Length {
        /// Object name.
        object: &'static str,
        /// Required bytes.
        expected: usize,
        /// Received bytes.
        actual: usize,
    },
    /// A domain, version, algorithm, profile, flags, or fixed key is unsupported.
    #[error("unsupported {0}")]
    Discriminator(&'static str),
    /// The embedded V1 checkpoint shape is not canonical for this profile.
    #[error("invalid V1 checkpoint: {0}")]
    Checkpoint(&'static str),
    /// A redundant digest or extension value does not match its source bytes.
    #[error("bridge payload binding mismatch: {0}")]
    PayloadBinding(&'static str),
    /// The complete V1 compatibility proof is malformed or inconsistent.
    #[error("invalid compatibility proof: {0}")]
    CompatibilityProof(&'static str),
    /// The outer EIP statement is malformed or carries another application payload.
    #[error("invalid EIP-0045 statement: {0}")]
    EipStatement(&'static str),
}

/// Decode and internally validate one exact 654-byte V2 application payload.
pub fn decode_bridge_validity_finality_payload_v2(
    bytes: &[u8],
) -> Result<BridgeValidityFinalityPayloadV2, StatementError> {
    let encoded = exact_array::<BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES>(
        bytes,
        "bridge validity/finality payload V2",
    )?;
    if &encoded[..BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN.len()]
        != BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN
        || encoded[BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN.len()] != 0
    {
        return Err(StatementError::Discriminator("bridge payload domain"));
    }
    if encoded[40..44] != [2, 1, 1, 0] {
        return Err(StatementError::Discriminator(
            "bridge payload version/hash/source-profile/flags",
        ));
    }

    let tracker_nft_id = array_at::<32>(&encoded, TRACKER_NFT_OFFSET);
    let checkpoint = array_at::<CHECKPOINT_BYTES>(&encoded, CHECKPOINT_OFFSET);
    validate_checkpoint(&checkpoint)?;
    let checkpoint_commitment = array_at::<32>(&encoded, CHECKPOINT_COMMITMENT_OFFSET);
    let expected_commitment = domain_hash(CHECKPOINT_DOMAIN, &checkpoint);
    if checkpoint_commitment != expected_commitment {
        return Err(StatementError::PayloadBinding("checkpoint commitment"));
    }
    if encoded[EXTENSION_KEY_OFFSET..EXTENSION_VALUE_OFFSET] != [0x04, 0x01] {
        return Err(StatementError::Discriminator("Ergo extension key"));
    }
    let extension_value = array_at::<64>(&encoded, EXTENSION_VALUE_OFFSET);
    if extension_value[..32] != checkpoint[108..140]
        || extension_value[32..] != checkpoint_commitment
    {
        return Err(StatementError::PayloadBinding("Ergo extension value"));
    }

    Ok(BridgeValidityFinalityPayloadV2 {
        tracker_nft_id,
        checkpoint,
        checkpoint_commitment,
        compatibility_statement_digest: array_at::<32>(&encoded, STATEMENT_DIGEST_OFFSET),
        compatibility_semantic_program_id: array_at::<32>(&encoded, SEMANTIC_PROGRAM_OFFSET),
        compatibility_verifier_profile_id: array_at::<32>(&encoded, VERIFIER_PROFILE_OFFSET),
        compatibility_payload_digest: array_at::<32>(&encoded, PAYLOAD_DIGEST_OFFSET),
        compatibility_aggregate_proof_digest: array_at::<32>(
            &encoded,
            AGGREGATE_PROOF_DIGEST_OFFSET,
        ),
        native_verifier_request_digest: array_at::<32>(&encoded, NATIVE_REQUEST_DIGEST_OFFSET),
        trusted_anchor_digest: array_at::<32>(&encoded, TRUSTED_ANCHOR_OFFSET),
        finality_horizon_height: u64::from_be_bytes(array_at::<8>(
            &encoded,
            FINALITY_HEIGHT_OFFSET,
        )),
        finality_horizon_hash: array_at::<32>(&encoded, FINALITY_HASH_OFFSET),
        extension_value,
        encoded,
    })
}

/// Validate that the exact V1 proof used as private witness matches every compatibility identity
/// exposed by the V2 public payload.
pub fn validate_compatibility_aggregate_proof_v1<'a>(
    payload: &BridgeValidityFinalityPayloadV2,
    proof: &'a [u8],
) -> Result<&'a [u8], StatementError> {
    if proof.len() < COMPATIBILITY_PROOF_PREFIX_BYTES {
        return Err(StatementError::CompatibilityProof("truncated envelope"));
    }
    if proof[..4] != [1, 1, 1, 0] {
        return Err(StatementError::CompatibilityProof(
            "version/proof-system/hash/flags",
        ));
    }
    let statement_length = u32::from_be_bytes(array_at::<4>(proof, 4)) as usize;
    let native_payload_length = u32::from_be_bytes(array_at::<4>(proof, 8)) as usize;
    if statement_length != COMPATIBILITY_STATEMENT_BYTES {
        return Err(StatementError::CompatibilityProof("statement length"));
    }
    if native_payload_length == 0 || native_payload_length > MAX_NATIVE_VERIFIER_REQUEST_BYTES {
        return Err(StatementError::CompatibilityProof("native payload length"));
    }
    let expected_proof_length = COMPATIBILITY_PROOF_PREFIX_BYTES
        .checked_add(native_payload_length)
        .ok_or(StatementError::CompatibilityProof("total length overflow"))?;
    if proof.len() != expected_proof_length {
        return Err(StatementError::CompatibilityProof(
            "payload or total length",
        ));
    }

    let statement = &proof[108..COMPATIBILITY_PROOF_PREFIX_BYTES];
    let native_request = &proof[COMPATIBILITY_PROOF_PREFIX_BYTES..];
    if statement[..4] != [1, 1, 1, 0] {
        return Err(StatementError::CompatibilityProof(
            "statement discriminators",
        ));
    }
    let expected_semantic_program_id = blake2b256(BRIDGE_FINALITY_PROGRAM_ID_DOMAIN);
    require_equal(
        expected_semantic_program_id.as_slice(),
        &statement[324..356],
        "fixed semantic program ID",
    )?;
    let supplied_statement_digest = array_at::<32>(proof, 44);
    let supplied_payload_digest = array_at::<32>(proof, 76);
    if supplied_statement_digest != domain_hash(STATEMENT_V1_DOMAIN, statement) {
        return Err(StatementError::CompatibilityProof("statement digest"));
    }
    if supplied_payload_digest != domain_hash(NATIVE_PAYLOAD_V1_DOMAIN, native_request) {
        return Err(StatementError::CompatibilityProof("payload digest"));
    }

    require_equal(
        payload.checkpoint.as_slice(),
        &statement[4..220],
        "checkpoint",
    )?;
    require_equal(
        payload.checkpoint_commitment.as_slice(),
        &statement[220..252],
        "checkpoint commitment",
    )?;
    require_equal(
        payload.trusted_anchor_digest.as_slice(),
        &statement[252..284],
        "trusted anchor",
    )?;
    require_equal(
        &payload.finality_horizon_height.to_be_bytes(),
        &statement[284..292],
        "finality horizon height",
    )?;
    require_equal(
        payload.finality_horizon_hash.as_slice(),
        &statement[292..324],
        "finality horizon hash",
    )?;
    require_equal(
        payload.compatibility_semantic_program_id.as_slice(),
        &statement[324..356],
        "semantic program ID",
    )?;
    require_equal(
        payload.compatibility_verifier_profile_id.as_slice(),
        &proof[12..44],
        "verifier profile ID",
    )?;
    require_equal(
        payload.compatibility_statement_digest.as_slice(),
        &supplied_statement_digest,
        "statement digest binding",
    )?;
    require_equal(
        payload.compatibility_payload_digest.as_slice(),
        &supplied_payload_digest,
        "payload digest binding",
    )?;
    require_equal(
        payload.compatibility_aggregate_proof_digest.as_slice(),
        &domain_hash(AGGREGATE_PROOF_V1_DOMAIN, proof),
        "aggregate proof digest",
    )?;
    require_equal(
        payload.native_verifier_request_digest.as_slice(),
        &blake2b256(native_request),
        "native request digest",
    )?;
    Ok(native_request)
}

/// Encode the exact EIP-0045 `ErgoStatementV1` committed by a future guest.
pub fn encode_eip0045_bridge_statement_v1(
    chain_domain_id: [u8; 32],
    profile_id: [u8; 32],
    program_id: [u8; 32],
    contract_id: [u8; 32],
    application_payload: &[u8],
) -> Result<[u8; EIP0045_BRIDGE_STATEMENT_V1_BYTES], StatementError> {
    let payload = decode_bridge_validity_finality_payload_v2(application_payload)?;
    let mut encoded = [0u8; EIP0045_BRIDGE_STATEMENT_V1_BYTES];
    encoded[..26].copy_from_slice(EIP0045_STATEMENT_DOMAIN);
    encoded[26] = 1;
    encoded[27..59].copy_from_slice(&chain_domain_id);
    encoded[59..91].copy_from_slice(&profile_id);
    encoded[91..123].copy_from_slice(&program_id);
    encoded[123..155].copy_from_slice(&contract_id);
    encoded[155..159]
        .copy_from_slice(&(BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES as u32).to_le_bytes());
    encoded[159..].copy_from_slice(&payload.encoded);
    Ok(encoded)
}

/// Strictly decode the exact bridge-shaped EIP-0045 statement.
pub fn decode_eip0045_bridge_statement_v1(
    bytes: &[u8],
) -> Result<Eip0045BridgeStatementV1, StatementError> {
    let encoded =
        exact_array::<EIP0045_BRIDGE_STATEMENT_V1_BYTES>(bytes, "EIP-0045 bridge statement V1")?;
    if &encoded[..26] != EIP0045_STATEMENT_DOMAIN || encoded[26] != 1 {
        return Err(StatementError::EipStatement("domain or version"));
    }
    let payload_length = u32::from_le_bytes(array_at::<4>(&encoded, 155)) as usize;
    if payload_length != BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES {
        return Err(StatementError::EipStatement("application payload length"));
    }
    let application_payload = decode_bridge_validity_finality_payload_v2(&encoded[159..])?;
    Ok(Eip0045BridgeStatementV1 {
        chain_domain_id: array_at::<32>(&encoded, 27),
        profile_id: array_at::<32>(&encoded, 59),
        program_id: array_at::<32>(&encoded, 91),
        contract_id: array_at::<32>(&encoded, 123),
        application_payload,
        encoded,
    })
}

/// Derive the EIP-0045 contract ID from exact proposition bytes.
pub fn derive_contract_id(proposition_bytes: &[u8]) -> Result<[u8; 32], StatementError> {
    if proposition_bytes.is_empty() {
        return Err(StatementError::EipStatement("empty proposition bytes"));
    }
    Ok(blake2b256(proposition_bytes))
}

fn validate_checkpoint(checkpoint: &[u8; CHECKPOINT_BYTES]) -> Result<(), StatementError> {
    if checkpoint[..4] != [1, 1, 1, 0] {
        return Err(StatementError::Checkpoint(
            "version/hash/finality-rule/flags",
        ));
    }
    let burn_count = u32::from_be_bytes(array_at::<4>(checkpoint, 140));
    if burn_count == 0 || burn_count > 256 {
        return Err(StatementError::Checkpoint("burn count"));
    }
    Ok(())
}

fn exact_array<const N: usize>(
    bytes: &[u8],
    object: &'static str,
) -> Result<[u8; N], StatementError> {
    bytes.try_into().map_err(|_| StatementError::Length {
        object,
        expected: N,
        actual: bytes.len(),
    })
}

fn array_at<const N: usize>(bytes: &[u8], offset: usize) -> [u8; N] {
    bytes[offset..offset + N]
        .try_into()
        .expect("all offsets are fixed within already length-checked objects; qed")
}

fn blake2b256(bytes: &[u8]) -> [u8; 32] {
    let digest = Blake2b256::digest(bytes);
    digest.into()
}

fn domain_hash(domain: &[u8], bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Blake2b256::new();
    hasher.update(domain);
    hasher.update(bytes);
    hasher.finalize().into()
}

fn require_equal(
    expected: &[u8],
    actual: &[u8],
    label: &'static str,
) -> Result<(), StatementError> {
    if expected != actual {
        return Err(StatementError::CompatibilityProof(label));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct V2Vector {
        input: V2Input,
        expected: V2Expected,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct V2Input {
        tracker_nft_id_hex: String,
        chain_domain_id_hex: String,
        profile_id_hex: String,
        program_id_hex: String,
        contract_proposition_bytes_hex: String,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct V2Expected {
        encoded_payload_hex: String,
        payload_digest_hex: String,
        statement_prefix_hex: String,
        statement_digest_hex: String,
        contract_id_hex: String,
    }

    #[derive(Deserialize)]
    struct CompatibilityVector {
        expected: CompatibilityExpected,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CompatibilityExpected {
        encoded_proof_hex: String,
    }

    fn vectors() -> (V2Vector, CompatibilityVector) {
        (
            serde_json::from_str(include_str!(
                "../../../relayer/test-vectors/bridge-validity-finality-statement-v2.json"
            ))
            .unwrap(),
            serde_json::from_str(include_str!(
                "../../../relayer/test-vectors/bridge-finality-proof-v1.json"
            ))
            .unwrap(),
        )
    }

    fn decode_hex(value: &str) -> Vec<u8> {
        hex::decode(value).unwrap()
    }

    #[test]
    fn reproduces_typescript_payload_and_eip_statement_bytes() {
        let (vector, compatibility) = vectors();
        let payload_bytes = decode_hex(&vector.expected.encoded_payload_hex);
        let payload = decode_bridge_validity_finality_payload_v2(&payload_bytes).unwrap();
        validate_compatibility_aggregate_proof_v1(
            &payload,
            &decode_hex(&compatibility.expected.encoded_proof_hex),
        )
        .unwrap();
        assert_eq!(
            payload.tracker_nft_id,
            decode_hex(&vector.input.tracker_nft_id_hex)[..]
        );
        assert_eq!(
            blake2b256(&payload.encoded),
            decode_hex(&vector.expected.payload_digest_hex)[..]
        );

        let contract_id =
            derive_contract_id(&decode_hex(&vector.input.contract_proposition_bytes_hex)).unwrap();
        assert_eq!(
            contract_id,
            decode_hex(&vector.expected.contract_id_hex)[..]
        );
        let statement = encode_eip0045_bridge_statement_v1(
            exact_array(&decode_hex(&vector.input.chain_domain_id_hex), "chain").unwrap(),
            exact_array(&decode_hex(&vector.input.profile_id_hex), "profile").unwrap(),
            exact_array(&decode_hex(&vector.input.program_id_hex), "program").unwrap(),
            contract_id,
            &payload.encoded,
        )
        .unwrap();
        assert_eq!(
            &statement[..EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES],
            decode_hex(&vector.expected.statement_prefix_hex)
        );
        assert_eq!(
            blake2b256(&statement),
            decode_hex(&vector.expected.statement_digest_hex)[..]
        );
        assert_eq!(
            decode_eip0045_bridge_statement_v1(&statement)
                .unwrap()
                .encoded,
            statement
        );
    }

    #[test]
    fn rejects_internal_payload_and_outer_statement_drift() {
        let (vector, _) = vectors();
        let payload = decode_hex(&vector.expected.encoded_payload_hex);
        for offset in [
            0,
            40,
            CHECKPOINT_COMMITMENT_OFFSET,
            EXTENSION_KEY_OFFSET,
            590,
        ] {
            let mut changed = payload.clone();
            changed[offset] ^= 0x80;
            assert!(decode_bridge_validity_finality_payload_v2(&changed).is_err());
        }
        assert!(decode_bridge_validity_finality_payload_v2(&payload[..payload.len() - 1]).is_err());

        let prefix = decode_hex(&vector.expected.statement_prefix_hex);
        let mut statement = prefix;
        statement.extend_from_slice(&payload);
        for offset in [0, 26, 155] {
            let mut changed = statement.clone();
            changed[offset] ^= 0x80;
            assert!(decode_eip0045_bridge_statement_v1(&changed).is_err());
        }
        statement.push(0);
        assert!(decode_eip0045_bridge_statement_v1(&statement).is_err());
    }

    #[test]
    fn rejects_each_compatibility_identity_mutation() {
        let (vector, compatibility) = vectors();
        let proof = decode_hex(&compatibility.expected.encoded_proof_hex);
        let payload = decode_hex(&vector.expected.encoded_payload_hex);
        for offset in [
            CHECKPOINT_OFFSET,
            STATEMENT_DIGEST_OFFSET,
            SEMANTIC_PROGRAM_OFFSET,
            VERIFIER_PROFILE_OFFSET,
            PAYLOAD_DIGEST_OFFSET,
            AGGREGATE_PROOF_DIGEST_OFFSET,
            NATIVE_REQUEST_DIGEST_OFFSET,
            TRUSTED_ANCHOR_OFFSET,
            FINALITY_HEIGHT_OFFSET,
            FINALITY_HASH_OFFSET,
        ] {
            let mut changed = payload.clone();
            changed[offset] ^= 0x80;
            if let Ok(decoded) = decode_bridge_validity_finality_payload_v2(&changed) {
                assert!(validate_compatibility_aggregate_proof_v1(&decoded, &proof).is_err());
            }
        }

        for offset in [12, 44, 76, 108, 464] {
            let mut changed = proof.clone();
            changed[offset] ^= 0x80;
            let decoded = decode_bridge_validity_finality_payload_v2(&payload).unwrap();
            assert!(validate_compatibility_aggregate_proof_v1(&decoded, &changed).is_err());
        }

        let mut coordinated_program_substitution = proof.clone();
        coordinated_program_substitution[432..464].fill(0x7a);
        let changed_statement_digest = domain_hash(
            STATEMENT_V1_DOMAIN,
            &coordinated_program_substitution[108..COMPATIBILITY_PROOF_PREFIX_BYTES],
        );
        coordinated_program_substitution[44..76].copy_from_slice(&changed_statement_digest);
        let mut changed_payload = payload.clone();
        changed_payload[SEMANTIC_PROGRAM_OFFSET..SEMANTIC_PROGRAM_OFFSET + 32].fill(0x7a);
        changed_payload[STATEMENT_DIGEST_OFFSET..STATEMENT_DIGEST_OFFSET + 32]
            .copy_from_slice(&changed_statement_digest);
        let changed_proof_digest =
            domain_hash(AGGREGATE_PROOF_V1_DOMAIN, &coordinated_program_substitution);
        changed_payload[AGGREGATE_PROOF_DIGEST_OFFSET..AGGREGATE_PROOF_DIGEST_OFFSET + 32]
            .copy_from_slice(&changed_proof_digest);
        let decoded = decode_bridge_validity_finality_payload_v2(&changed_payload).unwrap();
        assert_eq!(
            validate_compatibility_aggregate_proof_v1(&decoded, &coordinated_program_substitution,),
            Err(StatementError::CompatibilityProof(
                "fixed semantic program ID"
            ))
        );

        let mut oversized_length = proof.clone();
        oversized_length[8..12]
            .copy_from_slice(&((MAX_NATIVE_VERIFIER_REQUEST_BYTES as u32) + 1).to_be_bytes());
        let decoded = decode_bridge_validity_finality_payload_v2(&payload).unwrap();
        assert_eq!(
            validate_compatibility_aggregate_proof_v1(&decoded, &oversized_length),
            Err(StatementError::CompatibilityProof("native payload length"))
        );
    }
}
