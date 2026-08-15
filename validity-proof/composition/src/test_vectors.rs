//! Deterministic construction of the checked-in native checkpoint witness.
//!
//! This module exists only for conformance tests and carries no proof or funds authority.

use super::*;

use bridge_validity_statement::{
    encode_eip0045_bridge_statement_v1, BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN,
};
use serde::{Deserialize, Serialize};

#[cfg(feature = "application-v2")]
pub use crate::application_test_vectors_v2::{
    native_bridge_application_validity_fixture_for_profile_and_contract_v2,
    native_bridge_application_validity_fixture_for_profile_contract_and_bridge_commitment_v2,
    native_bridge_application_validity_fixture_for_profile_contract_and_bridge_runtime_hash_v2,
    NativeBridgeApplicationFixtureErrorV2, NativeBridgeApplicationValidityFixtureV2,
};
#[cfg(feature = "pooled-reserve-burn-v4")]
pub use crate::pooled_reserve_burn_test_vectors_v4::{
    native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v4,
    NativePooledReserveBurnValidityFixtureV4,
};
#[cfg(feature = "pooled-reserve-burn-v5")]
pub use crate::pooled_reserve_burn_test_vectors_v5::{
    native_pooled_reserve_burn_validity_fixture_for_application_v5,
    native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v5,
    NativePooledReserveBurnValidityFixtureV5,
};

const COMPATIBILITY_STATEMENT_DOMAIN: &[u8] = b"E2S_BRIDGE_FINALITY_STATEMENT_V1";
const COMPATIBILITY_PROGRAM_DOMAIN: &[u8] = b"E2S_GRANDPA_STATE_AND_FINALITY_PROGRAM_V1";
const NATIVE_PAYLOAD_DOMAIN: &[u8] = b"E2S_NATIVE_GRANDPA_PROOF_PAYLOAD_V1";
const AGGREGATE_PROOF_DOMAIN: &[u8] = b"E2S_AGGREGATE_FINALITY_PROOF_V1";

/// Exact private input and expected public statement for one conformance run.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeBridgeValidityFixtureV1 {
    /// Canonical private guest witness bytes.
    pub encoded_witness: Vec<u8>,
    /// Exact public statement expected in the receipt journal.
    pub statement: [u8; EIP0045_BRIDGE_STATEMENT_V1_BYTES],
}

/// Build the checked-in native checkpoint fixture for one exact guest image identity.
///
/// The fixture is synthetic and non-authorizing. The caller must supply the canonical byte form
/// of the guest method image ID that the host will independently enforce.
pub fn native_bridge_validity_fixture_v1(
    guest_program_id: [u8; 32],
) -> NativeBridgeValidityFixtureV1 {
    native_bridge_validity_fixture_for_profile_v1([0xb2; 32], guest_program_id)
}

/// Build the checked-in native checkpoint fixture for one exact verifier profile and guest.
///
/// The profile remains a caller-supplied preactivation identity. This helper does not activate
/// that profile or make the synthetic checkpoint authoritative.
pub fn native_bridge_validity_fixture_for_profile_v1(
    profile_id: [u8; 32],
    guest_program_id: [u8; 32],
) -> NativeBridgeValidityFixtureV1 {
    native_bridge_validity_fixture_for_profile_and_contract_v1(
        profile_id,
        guest_program_id,
        [0xd4; 32],
    )
}

/// Build the checked-in native checkpoint fixture for an exact verifier profile, guest, and
/// consumer contract identity.
///
/// This is the only helper suitable for a consumer interoperability proof. The contract ID must
/// be derived independently from the exact consumer proposition bytes; supplying it here does not
/// authenticate or activate that contract.
pub fn native_bridge_validity_fixture_for_profile_and_contract_v1(
    profile_id: [u8; 32],
    guest_program_id: [u8; 32],
    contract_id: [u8; 32],
) -> NativeBridgeValidityFixtureV1 {
    let (witness, _, _) =
        fixture_for_profile_program_and_contract_id(profile_id, guest_program_id, contract_id);
    let encoded_witness = encode_bridge_validity_guest_witness_v1(&witness)
        .expect("checked-in native witness must encode");
    NativeBridgeValidityFixtureV1 {
        encoded_witness,
        statement: witness.statement,
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeVector {
    #[cfg(test)]
    pub(crate) trusted_anchor_digest_hex: String,
    pub(crate) request: NativeRequest,
    pub(crate) expected: Expected,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeRequest {
    schema: String,
    trust_anchor: TrustAnchor,
    target_native_block_hash_hex: String,
    target_header_scale_hex: String,
    linked_grandpa_proofs: Vec<LinkedProof>,
    checkpoint_tail_headers_scale_hex: Vec<String>,
    finality_proof_scale_hex: String,
    runtime_state_proof_nodes_hex: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrustAnchor {
    sidechain_id_hex: String,
    checkpoint_hash_hex: String,
    checkpoint_number: String,
    grandpa_set_id: String,
    authority_list_scale_hex: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LinkedProof {
    ancestry_headers_scale_hex: Vec<String>,
    proof_scale_hex: String,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct Expected {
    #[cfg(test)]
    #[serde(rename = "requestDigestHex")]
    pub(crate) request_digest_hex: String,
    authority: ExpectedAuthority,
    finality: ExpectedFinality,
    commitment: ExpectedCommitment,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedAuthority {
    finality_signing_set_id: String,
    finality_signing_authority_list_scale_hex: String,
    finality_signing_authority_set_hash_hex: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedFinality {
    horizon_hash_hex: String,
    horizon_height: String,
    canonical_justification_scale_hex: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedCommitment {
    sidechain_id_hex: String,
    sidechain_height: String,
    execution_block_hash_hex: String,
    bridge_event_root_hex: String,
    burn_leaf_count: u32,
}

#[derive(Clone)]
pub(crate) struct SealingContext {
    pub(crate) checkpoint: [u8; CHECKPOINT_BYTES],
    finality_horizon_height: u64,
    pub(crate) finality_horizon_hash: [u8; 32],
    tracker_nft_id: [u8; 32],
    verifier_profile_id: [u8; 32],
    chain_domain_id: [u8; 32],
    profile_id: [u8; 32],
    guest_program_id: [u8; 32],
    contract_id: [u8; 32],
}

fn vector() -> NativeVector {
    serde_json::from_str(include_str!(
        "../../../relayer/test-vectors/native-finalized-bridge-checkpoint-v2.json"
    ))
    .expect("checked-in native checkpoint vector must decode")
}

#[cfg(test)]
pub(crate) fn fixture() -> (BridgeValidityGuestWitnessV1, SealingContext, NativeVector) {
    fixture_for_profile_program_and_contract_id([0xb2; 32], [0xc3; 32], [0xd4; 32])
}

fn fixture_for_profile_program_and_contract_id(
    profile_id: [u8; 32],
    guest_program_id: [u8; 32],
    contract_id: [u8; 32],
) -> (BridgeValidityGuestWitnessV1, SealingContext, NativeVector) {
    let vector = vector();
    let request = &vector.request;
    let witness = BridgeValidityGuestWitnessV1 {
        statement: [0; EIP0045_BRIDGE_STATEMENT_V1_BYTES],
        compatibility_proof: Vec::new(),
        trust_anchor: GrandpaTrustAnchorV1 {
            sidechain_id: hex_array(&request.trust_anchor.sidechain_id_hex),
            checkpoint_hash: hex_array(&request.trust_anchor.checkpoint_hash_hex),
            checkpoint_number: decimal(&request.trust_anchor.checkpoint_number),
            grandpa_set_id: decimal(&request.trust_anchor.grandpa_set_id),
            authority_list_scale: hex_bytes(&request.trust_anchor.authority_list_scale_hex),
        },
        target_native_block_hash: hex_array(&request.target_native_block_hash_hex),
        target_header_scale: hex_bytes(&request.target_header_scale_hex),
        linked_grandpa_proofs: request
            .linked_grandpa_proofs
            .iter()
            .map(|proof| LinkedGrandpaProofV1 {
                ancestry_headers_scale: proof
                    .ancestry_headers_scale_hex
                    .iter()
                    .map(|header| hex_bytes(header))
                    .collect(),
                proof_scale: hex_bytes(&proof.proof_scale_hex),
            })
            .collect(),
        checkpoint_tail_headers_scale: request
            .checkpoint_tail_headers_scale_hex
            .iter()
            .map(|header| hex_bytes(header))
            .collect(),
        finality_proof_scale: hex_bytes(&request.finality_proof_scale_hex),
        runtime_state_proof_nodes: request
            .runtime_state_proof_nodes_hex
            .iter()
            .map(|node| hex_bytes(node))
            .collect(),
    };

    let authority_list = hex_bytes(
        &vector
            .expected
            .authority
            .finality_signing_authority_list_scale_hex,
    );
    let authority_set_hash = domain_hash(GRANDPA_AUTHORITY_SET_DOMAIN, &authority_list);
    assert_eq!(
        authority_set_hash,
        hex_array(
            &vector
                .expected
                .authority
                .finality_signing_authority_set_hash_hex
        )
    );
    let justification = hex_bytes(&vector.expected.finality.canonical_justification_scale_hex);
    let mut checkpoint = [0u8; CHECKPOINT_BYTES];
    checkpoint[..4].copy_from_slice(&[1, 1, 1, 0]);
    checkpoint[4..36].copy_from_slice(&hex_array::<32>(
        &vector.expected.commitment.sidechain_id_hex,
    ));
    checkpoint[36..44].copy_from_slice(
        &decimal::<u64>(&vector.expected.commitment.sidechain_height).to_be_bytes(),
    );
    checkpoint[44..76].copy_from_slice(&witness.target_native_block_hash);
    checkpoint[76..108].copy_from_slice(&hex_array::<32>(
        &vector.expected.commitment.execution_block_hash_hex,
    ));
    checkpoint[108..140].copy_from_slice(&hex_array::<32>(
        &vector.expected.commitment.bridge_event_root_hex,
    ));
    checkpoint[140..144].copy_from_slice(&vector.expected.commitment.burn_leaf_count.to_be_bytes());
    checkpoint[144..152].copy_from_slice(
        &decimal::<u64>(&vector.expected.authority.finality_signing_set_id).to_be_bytes(),
    );
    checkpoint[152..184].copy_from_slice(&authority_set_hash);
    checkpoint[184..216]
        .copy_from_slice(&domain_hash(GRANDPA_JUSTIFICATION_DOMAIN, &justification));

    let context = SealingContext {
        checkpoint,
        finality_horizon_height: decimal(&vector.expected.finality.horizon_height),
        finality_horizon_hash: hex_array(&vector.expected.finality.horizon_hash_hex),
        tracker_nft_id: [0x91; 32],
        verifier_profile_id: [0x82; 32],
        chain_domain_id: [0xa1; 32],
        profile_id,
        guest_program_id,
        contract_id,
    };
    (seal(witness, &context), context, vector)
}

pub(crate) fn seal(
    mut witness: BridgeValidityGuestWitnessV1,
    context: &SealingContext,
) -> BridgeValidityGuestWitnessV1 {
    let native_request = encode_canonical_native_request(&witness)
        .expect("fixture native request must be encodable");
    let checkpoint_commitment = domain_hash(CHECKPOINT_DOMAIN, &context.checkpoint);
    let trusted_anchor_digest = derive_trust_anchor_digest(
        &witness.trust_anchor,
        &witness.trust_anchor.authority_list_scale,
    );
    let semantic_program_id = blake2b256(COMPATIBILITY_PROGRAM_DOMAIN);

    let mut compatibility_statement = Vec::with_capacity(356);
    compatibility_statement.extend_from_slice(&[1, 1, 1, 0]);
    compatibility_statement.extend_from_slice(&context.checkpoint);
    compatibility_statement.extend_from_slice(&checkpoint_commitment);
    compatibility_statement.extend_from_slice(&trusted_anchor_digest);
    compatibility_statement.extend_from_slice(&context.finality_horizon_height.to_be_bytes());
    compatibility_statement.extend_from_slice(&context.finality_horizon_hash);
    compatibility_statement.extend_from_slice(&semantic_program_id);
    assert_eq!(compatibility_statement.len(), 356);

    let statement_digest = domain_hash(COMPATIBILITY_STATEMENT_DOMAIN, &compatibility_statement);
    let native_payload_digest = domain_hash(NATIVE_PAYLOAD_DOMAIN, &native_request);
    let mut compatibility_proof = Vec::with_capacity(464 + native_request.len());
    compatibility_proof.extend_from_slice(&[1, 1, 1, 0]);
    compatibility_proof.extend_from_slice(&(compatibility_statement.len() as u32).to_be_bytes());
    compatibility_proof.extend_from_slice(&(native_request.len() as u32).to_be_bytes());
    compatibility_proof.extend_from_slice(&context.verifier_profile_id);
    compatibility_proof.extend_from_slice(&statement_digest);
    compatibility_proof.extend_from_slice(&native_payload_digest);
    compatibility_proof.extend_from_slice(&compatibility_statement);
    compatibility_proof.extend_from_slice(&native_request);
    assert_eq!(compatibility_proof.len(), 464 + native_request.len());

    let aggregate_proof_digest = domain_hash(AGGREGATE_PROOF_DOMAIN, &compatibility_proof);
    let mut payload = Vec::with_capacity(654);
    payload.extend_from_slice(BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN);
    payload.push(0);
    payload.extend_from_slice(&[2, 1, 1, 0]);
    payload.extend_from_slice(&context.tracker_nft_id);
    payload.extend_from_slice(&context.checkpoint);
    payload.extend_from_slice(&checkpoint_commitment);
    payload.extend_from_slice(&statement_digest);
    payload.extend_from_slice(&semantic_program_id);
    payload.extend_from_slice(&context.verifier_profile_id);
    payload.extend_from_slice(&native_payload_digest);
    payload.extend_from_slice(&aggregate_proof_digest);
    payload.extend_from_slice(&blake2b256(&native_request));
    payload.extend_from_slice(&trusted_anchor_digest);
    payload.extend_from_slice(&context.finality_horizon_height.to_be_bytes());
    payload.extend_from_slice(&context.finality_horizon_hash);
    payload.extend_from_slice(&[0x04, 0x01]);
    payload.extend_from_slice(&context.checkpoint[108..140]);
    payload.extend_from_slice(&checkpoint_commitment);
    assert_eq!(payload.len(), 654);

    witness.compatibility_proof = compatibility_proof;
    witness.statement = encode_eip0045_bridge_statement_v1(
        context.chain_domain_id,
        context.profile_id,
        context.guest_program_id,
        context.contract_id,
        &payload,
    )
    .expect("fixture EIP-0045 statement must be canonical");
    witness
}

fn hex_bytes(value: &str) -> Vec<u8> {
    hex::decode(value.strip_prefix("0x").unwrap_or(value)).expect("fixture hex must decode")
}

pub(crate) fn hex_array<const N: usize>(value: &str) -> [u8; N] {
    hex_bytes(value)
        .try_into()
        .unwrap_or_else(|bytes: Vec<u8>| {
            panic!("fixture must contain {N} bytes, got {}", bytes.len())
        })
}

fn decimal<T>(value: &str) -> T
where
    T: core::str::FromStr,
    T::Err: core::fmt::Debug,
{
    value.parse().expect("fixture decimal must decode")
}
