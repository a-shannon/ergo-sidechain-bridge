//! Preactivation composition of the bridge GRANDPA, state-proof, and statement cores.
//!
//! The witness format is a private guest ABI. A successful verification returns exactly the
//! public EIP-0045 statement bytes; it does not activate a verifier profile, authorize settlement,
//! or close Gate 5.

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

extern crate alloc;

#[cfg(feature = "application-v2")]
mod application_composition_v2;
#[cfg(all(feature = "application-v2", any(test, feature = "test-vectors")))]
mod application_test_vectors_v2;
#[cfg(feature = "pooled-reserve-burn-v4")]
mod pooled_reserve_burn_composition_v4;
#[cfg(feature = "pooled-reserve-burn-v5")]
mod pooled_reserve_burn_composition_v5;
#[cfg(all(
    feature = "pooled-reserve-burn-v4",
    any(test, feature = "test-vectors")
))]
mod pooled_reserve_burn_test_vectors_v4;
#[cfg(all(
    feature = "pooled-reserve-burn-v5",
    any(test, feature = "test-vectors")
))]
mod pooled_reserve_burn_test_vectors_v5;

#[cfg(feature = "application-v2")]
pub use application_composition_v2::{
    decode_bridge_validity_guest_witness_v2, encode_bridge_validity_guest_witness_v2,
    verify_bridge_validity_guest_witness_v2, ApplicationCompositionErrorV2,
    BridgeValidityGuestWitnessV2, BRIDGE_VALIDITY_GUEST_WITNESS_V2_DOMAIN,
    MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V2_BYTES,
};
#[cfg(feature = "pooled-reserve-burn-v4")]
pub use pooled_reserve_burn_composition_v4::{
    decode_pooled_reserve_burn_guest_witness_v4, encode_pooled_reserve_burn_guest_witness_v4,
    verify_pooled_reserve_burn_guest_witness_v4, PooledReserveBurnCompositionErrorV4,
    PooledReserveBurnGuestWitnessV4, MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V4_BYTES,
    POOLED_RESERVE_BURN_GUEST_WITNESS_V4_DOMAIN,
};
#[cfg(feature = "pooled-reserve-burn-v5")]
pub use pooled_reserve_burn_composition_v5::{
    decode_pooled_reserve_burn_guest_witness_v5, encode_pooled_reserve_burn_guest_witness_v5,
    verify_pooled_reserve_burn_guest_witness_v5, PooledReserveBurnCompositionErrorV5,
    PooledReserveBurnGuestWitnessV5, MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V5_BYTES,
    POOLED_RESERVE_BURN_GUEST_WITNESS_V5_DOMAIN,
};

use alloc::{string::String, vec::Vec};
use blake2::{digest::consts::U32, Blake2b, Digest};
use bridge_validity_finality_core::{
    verify_grandpa_finality_proof, verify_linked_grandpa_authority_transition_proof, AuthorityList,
    BridgeAuthorityTransitionError, BridgeFinalityProofError, ConsensusLog, FrontierDigestItem,
    FrontierGrandpaBlock, FrontierHash, FrontierHeader, HeaderT, GRANDPA_ENGINE_ID,
    MAX_AUTHORITY_TRANSITION_ANCESTRY_HEADERS, MAX_AUTHORITY_TRANSITION_PROOF_BYTES,
    MAX_FINALITY_PROOF_BYTES, MAX_GRANDPA_AUTHORITIES,
};
use bridge_validity_state_proof::{
    verify_bridge_commitment_state_v1, BridgeCommitmentV1, StateProofError, MAX_STATE_PROOF_BYTES,
    MAX_STATE_PROOF_NODES, MAX_STATE_PROOF_NODE_BYTES,
};
use bridge_validity_statement::{
    decode_eip0045_bridge_statement_v1, validate_compatibility_aggregate_proof_v1, StatementError,
    EIP0045_BRIDGE_STATEMENT_V1_BYTES, MAX_NATIVE_VERIFIER_REQUEST_BYTES,
};
use scale_codec::{DecodeAll, Encode};
use thiserror::Error;

/// Domain prefix for the private guest witness ABI.
pub const BRIDGE_VALIDITY_GUEST_WITNESS_V1_DOMAIN: &[u8] = b"E2S_BRIDGE_VALIDITY_GUEST_WITNESS_V1";
/// Maximum encoded private witness accepted by the first guest ABI.
///
/// This is not a protocol-proof limit. It accommodates the existing 32 MiB canonical JSON
/// request plus its binary decomposition and fixed compatibility envelope.
pub const MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V1_BYTES: usize = 64 * 1024 * 1024;
/// Maximum SCALE bytes accepted for one canonical GRANDPA authority list.
pub const MAX_AUTHORITY_LIST_BYTES: usize = 4 * 1024;
/// Maximum SCALE bytes accepted for one Frontier header.
pub const MAX_HEADER_BYTES: usize = 64 * 1024;
/// Maximum linked authority-transition chunks in the existing native request profile.
pub const MAX_LINKED_GRANDPA_PROOFS: usize = 16;
/// Maximum checkpoint-tail headers in the existing native request profile.
pub const MAX_CHECKPOINT_TAIL_HEADERS: usize = 4_096;
/// Maximum total linked-ancestry and checkpoint-tail headers.
pub const MAX_TOTAL_ANCESTRY_HEADERS: usize = MAX_LINKED_GRANDPA_PROOFS
    * MAX_AUTHORITY_TRANSITION_ANCESTRY_HEADERS
    + MAX_CHECKPOINT_TAIL_HEADERS;

const WITNESS_VERSION: u8 = 1;
const WITNESS_FLAGS_NONE: u8 = 0;
const COMPATIBILITY_PROOF_PREFIX_BYTES: usize = 464;
const CHECKPOINT_BYTES: usize = 216;
const CHECKPOINT_DOMAIN: &[u8] = b"E2S_BRIDGE_CHECKPOINT_V1";
const GRANDPA_AUTHORITY_SET_DOMAIN: &[u8] = b"E2S_GRANDPA_AUTHORITY_SET_V1";
const GRANDPA_TRUST_ANCHOR_DOMAIN: &[u8] = b"E2S_GRANDPA_TRUST_ANCHOR_V1";
const GRANDPA_JUSTIFICATION_DOMAIN: &[u8] = b"E2S_GRANDPA_JUSTIFICATION_V1";
const NATIVE_REQUEST_SCHEMA: &str = "e2s.native-finalized-bridge-checkpoint-request.v2";

type Blake2b256 = Blake2b<U32>;

/// Deterministic checked-in witness fixtures for host/guest conformance tests.
#[cfg(any(test, feature = "test-vectors"))]
pub mod test_vectors;

/// Reviewed source-consensus trust anchor carried by the private witness.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GrandpaTrustAnchorV1 {
    /// Source-chain domain identifier.
    pub sidechain_id: [u8; 32],
    /// Reviewed checkpoint block hash.
    pub checkpoint_hash: [u8; 32],
    /// Reviewed checkpoint block number.
    pub checkpoint_number: u64,
    /// GRANDPA authority-set identifier active at the checkpoint.
    pub grandpa_set_id: u64,
    /// Canonical SCALE authority list active at the checkpoint.
    pub authority_list_scale: Vec<u8>,
}

/// One linked GRANDPA authority-transition proof and its complete ancestry.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LinkedGrandpaProofV1 {
    /// Canonical SCALE headers descending from the prior authenticated target.
    pub ancestry_headers_scale: Vec<Vec<u8>>,
    /// Canonical SCALE warp-proof chunk.
    pub proof_scale: Vec<u8>,
}

/// Complete private witness for the Substrate/GRANDPA V1 compatibility guest.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BridgeValidityGuestWitnessV1 {
    /// Exact 813-byte EIP-0045 bridge statement to expose as the public journal.
    pub statement: [u8; EIP0045_BRIDGE_STATEMENT_V1_BYTES],
    /// Exact V1 compatibility proof whose payload is the canonical native request JSON.
    pub compatibility_proof: Vec<u8>,
    /// Reviewed GRANDPA trust anchor.
    pub trust_anchor: GrandpaTrustAnchorV1,
    /// Requested native target block hash.
    pub target_native_block_hash: [u8; 32],
    /// Exact canonical SCALE target header.
    pub target_header_scale: Vec<u8>,
    /// Bounded linked authority-transition chunks.
    pub linked_grandpa_proofs: Vec<LinkedGrandpaProofV1>,
    /// Canonical headers after the last transition chunk through the finality horizon.
    pub checkpoint_tail_headers_scale: Vec<Vec<u8>>,
    /// Exact `grandpa_proveFinality` response for the requested target.
    pub finality_proof_scale: Vec<u8>,
    /// Raw `state_getReadProof` nodes for the bridge commitment key.
    pub runtime_state_proof_nodes: Vec<Vec<u8>>,
}

/// A strict witness, composition, or cross-component binding rejection.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum CompositionError {
    /// The complete witness exceeds the private ABI bound.
    #[error("guest witness exceeds {max} bytes: {actual}")]
    WitnessTooLarge {
        /// Received bytes.
        actual: usize,
        /// Maximum bytes.
        max: usize,
    },
    /// A fixed discriminator, length, count, or EOF rule failed.
    #[error("invalid guest witness encoding: {0}")]
    WitnessEncoding(&'static str),
    /// A bounded byte field exceeds its profile limit.
    #[error("guest witness {field} exceeds {max} bytes: {actual}")]
    FieldTooLarge {
        /// Field name.
        field: &'static str,
        /// Received bytes.
        actual: usize,
        /// Maximum bytes.
        max: usize,
    },
    /// A bounded collection exceeds its profile limit.
    #[error("guest witness {field} exceeds {max} items: {actual}")]
    TooManyItems {
        /// Field name.
        field: &'static str,
        /// Received items.
        actual: usize,
        /// Maximum items.
        max: usize,
    },
    /// The V2/EIP statement or compatibility envelope is invalid.
    #[error("statement verification failed: {0}")]
    Statement(#[from] StatementError),
    /// The canonical native request bytes differ from the typed witness.
    #[error("compatibility proof payload is not the canonical native request for this witness")]
    NativeRequestMismatch,
    /// A SCALE authority list or header is malformed or non-canonical.
    #[error("invalid canonical SCALE object: {0}")]
    Scale(&'static str),
    /// A linked authority-transition chunk failed verification.
    #[error("linked GRANDPA transition {index} failed: {source}")]
    AuthorityTransition {
        /// Zero-based transition chunk.
        index: usize,
        /// Underlying strict verifier error.
        source: BridgeAuthorityTransitionError,
    },
    /// The finality proof failed verification.
    #[error("GRANDPA finality verification failed: {0}")]
    Finality(#[from] BridgeFinalityProofError),
    /// The target state proof failed verification.
    #[error("Substrate state proof verification failed: {0}")]
    State(#[from] StateProofError),
    /// A producer-to-consumer identity or semantic field is inconsistent.
    #[error("bridge validity composition binding mismatch: {0}")]
    Binding(&'static str),
    /// A GRANDPA digest log is malformed, unsupported, or invalid for its chain position.
    #[error("invalid GRANDPA authenticated-chain log: {0}")]
    GrandpaLog(&'static str),
}

/// Encode one typed private witness into the canonical guest ABI.
pub fn encode_bridge_validity_guest_witness_v1(
    witness: &BridgeValidityGuestWitnessV1,
) -> Result<Vec<u8>, CompositionError> {
    let mut encoded = Vec::new();
    encoded.extend_from_slice(BRIDGE_VALIDITY_GUEST_WITNESS_V1_DOMAIN);
    encoded.push(0);
    encoded.push(WITNESS_VERSION);
    encoded.push(WITNESS_FLAGS_NONE);
    encoded.extend_from_slice(&[0, 0]);
    encoded.extend_from_slice(&witness.statement);
    push_blob(&mut encoded, &witness.compatibility_proof)?;
    encoded.extend_from_slice(&witness.trust_anchor.sidechain_id);
    encoded.extend_from_slice(&witness.trust_anchor.checkpoint_hash);
    encoded.extend_from_slice(&witness.trust_anchor.checkpoint_number.to_be_bytes());
    encoded.extend_from_slice(&witness.trust_anchor.grandpa_set_id.to_be_bytes());
    push_blob(&mut encoded, &witness.trust_anchor.authority_list_scale)?;
    encoded.extend_from_slice(&witness.target_native_block_hash);
    push_blob(&mut encoded, &witness.target_header_scale)?;
    push_count(&mut encoded, witness.linked_grandpa_proofs.len())?;
    for proof in &witness.linked_grandpa_proofs {
        push_count(&mut encoded, proof.ancestry_headers_scale.len())?;
        for header in &proof.ancestry_headers_scale {
            push_blob(&mut encoded, header)?;
        }
        push_blob(&mut encoded, &proof.proof_scale)?;
    }
    push_count(&mut encoded, witness.checkpoint_tail_headers_scale.len())?;
    for header in &witness.checkpoint_tail_headers_scale {
        push_blob(&mut encoded, header)?;
    }
    push_blob(&mut encoded, &witness.finality_proof_scale)?;
    push_count(&mut encoded, witness.runtime_state_proof_nodes.len())?;
    for node in &witness.runtime_state_proof_nodes {
        push_blob(&mut encoded, node)?;
    }
    validate_witness_size(encoded.len())?;
    decode_bridge_validity_guest_witness_v1(&encoded)?;
    Ok(encoded)
}

/// Strictly decode one canonical private guest witness and reject trailing bytes.
pub fn decode_bridge_validity_guest_witness_v1(
    encoded: &[u8],
) -> Result<BridgeValidityGuestWitnessV1, CompositionError> {
    validate_witness_size(encoded.len())?;
    let mut reader = Reader::new(encoded);
    if reader.take(BRIDGE_VALIDITY_GUEST_WITNESS_V1_DOMAIN.len())?
        != BRIDGE_VALIDITY_GUEST_WITNESS_V1_DOMAIN
        || reader.byte()? != 0
        || reader.byte()? != WITNESS_VERSION
        || reader.byte()? != WITNESS_FLAGS_NONE
        || reader.take(2)? != [0, 0]
    {
        return Err(CompositionError::WitnessEncoding(
            "domain, version, flags, or reserved bytes",
        ));
    }
    let statement = reader.array::<EIP0045_BRIDGE_STATEMENT_V1_BYTES>()?;
    let compatibility_proof = reader.blob(
        COMPATIBILITY_PROOF_PREFIX_BYTES + MAX_NATIVE_VERIFIER_REQUEST_BYTES,
        "compatibility proof",
        false,
    )?;
    let trust_anchor = GrandpaTrustAnchorV1 {
        sidechain_id: reader.array()?,
        checkpoint_hash: reader.array()?,
        checkpoint_number: reader.u64_be()?,
        grandpa_set_id: reader.u64_be()?,
        authority_list_scale: reader.blob(MAX_AUTHORITY_LIST_BYTES, "authority list", false)?,
    };
    let target_native_block_hash = reader.array()?;
    let target_header_scale = reader.blob(MAX_HEADER_BYTES, "target header", false)?;
    let linked_count = reader.count(MAX_LINKED_GRANDPA_PROOFS, "linked GRANDPA proofs")?;
    let mut linked_grandpa_proofs = Vec::with_capacity(linked_count);
    let mut total_headers = 0usize;
    for _ in 0..linked_count {
        let header_count = reader.count(
            MAX_AUTHORITY_TRANSITION_ANCESTRY_HEADERS,
            "linked GRANDPA ancestry headers",
        )?;
        if header_count == 0 {
            return Err(CompositionError::WitnessEncoding(
                "linked GRANDPA ancestry must be non-empty",
            ));
        }
        total_headers = checked_total_headers(total_headers, header_count)?;
        let mut ancestry_headers_scale = Vec::with_capacity(header_count);
        for _ in 0..header_count {
            ancestry_headers_scale.push(reader.blob(MAX_HEADER_BYTES, "ancestry header", false)?);
        }
        let proof_scale = reader.blob(
            MAX_AUTHORITY_TRANSITION_PROOF_BYTES,
            "authority-transition proof",
            false,
        )?;
        linked_grandpa_proofs.push(LinkedGrandpaProofV1 {
            ancestry_headers_scale,
            proof_scale,
        });
    }
    let tail_count = reader.count(MAX_CHECKPOINT_TAIL_HEADERS, "checkpoint-tail headers")?;
    checked_total_headers(total_headers, tail_count)?;
    let mut checkpoint_tail_headers_scale = Vec::with_capacity(tail_count);
    for _ in 0..tail_count {
        checkpoint_tail_headers_scale.push(reader.blob(
            MAX_HEADER_BYTES,
            "checkpoint-tail header",
            false,
        )?);
    }
    let finality_proof_scale = reader.blob(MAX_FINALITY_PROOF_BYTES, "finality proof", false)?;
    let node_count = reader.count(MAX_STATE_PROOF_NODES, "state proof nodes")?;
    if node_count == 0 {
        return Err(CompositionError::WitnessEncoding(
            "state proof must contain at least one node",
        ));
    }
    let mut runtime_state_proof_nodes = Vec::with_capacity(node_count);
    let mut state_proof_bytes = 0usize;
    for _ in 0..node_count {
        let node = reader.blob(MAX_STATE_PROOF_NODE_BYTES, "state proof node", false)?;
        state_proof_bytes = checked_state_proof_bytes(state_proof_bytes, node.len())?;
        runtime_state_proof_nodes.push(node);
    }
    if !reader.is_empty() {
        return Err(CompositionError::WitnessEncoding("trailing bytes"));
    }
    Ok(BridgeValidityGuestWitnessV1 {
        statement,
        compatibility_proof,
        trust_anchor,
        target_native_block_hash,
        target_header_scale,
        linked_grandpa_proofs,
        checkpoint_tail_headers_scale,
        finality_proof_scale,
        runtime_state_proof_nodes,
    })
}

/// Verify the complete private witness and return exactly the public 813-byte statement.
pub fn verify_bridge_validity_guest_witness_v1(
    encoded_witness: &[u8],
) -> Result<[u8; EIP0045_BRIDGE_STATEMENT_V1_BYTES], CompositionError> {
    let witness = decode_bridge_validity_guest_witness_v1(encoded_witness)?;
    verify_decoded_witness(&witness)
}

fn verify_decoded_witness(
    witness: &BridgeValidityGuestWitnessV1,
) -> Result<[u8; EIP0045_BRIDGE_STATEMENT_V1_BYTES], CompositionError> {
    let statement = decode_eip0045_bridge_statement_v1(&witness.statement)?;
    let payload = &statement.application_payload;
    let native_request =
        validate_compatibility_aggregate_proof_v1(payload, &witness.compatibility_proof)?;
    let rebuilt_request = encode_canonical_native_request(witness)?;
    if native_request != rebuilt_request {
        return Err(CompositionError::NativeRequestMismatch);
    }

    let trusted_authorities = decode_authority_list(&witness.trust_anchor.authority_list_scale)?;
    let trust_anchor_digest = derive_trust_anchor_digest(
        &witness.trust_anchor,
        &witness.trust_anchor.authority_list_scale,
    );
    if payload.trusted_anchor_digest != trust_anchor_digest {
        return Err(CompositionError::Binding("trusted anchor digest"));
    }

    let target_header = decode_header(&witness.target_header_scale)?;
    if target_header.hash() != FrontierHash(witness.target_native_block_hash) {
        return Err(CompositionError::Binding("target header hash"));
    }
    let target_number = target_header.number;
    if u64::from(target_number) < witness.trust_anchor.checkpoint_number {
        return Err(CompositionError::Binding(
            "target precedes reviewed checkpoint",
        ));
    }

    let mut current_hash = FrontierHash(witness.trust_anchor.checkpoint_hash);
    let mut current_number = u32::try_from(witness.trust_anchor.checkpoint_number)
        .map_err(|_| CompositionError::Binding("checkpoint number exceeds Frontier u32"))?;
    let mut current_set_id = witness.trust_anchor.grandpa_set_id;
    let mut current_authorities = trusted_authorities;
    let mut authenticated_headers = Vec::new();

    for (index, linked) in witness.linked_grandpa_proofs.iter().enumerate() {
        let ancestry = decode_headers(&linked.ancestry_headers_scale)?;
        for header in &ancestry {
            validate_grandpa_logs(header, GrandpaLogScope::TransitionAncestry)?;
        }
        let verified = verify_linked_grandpa_authority_transition_proof::<FrontierGrandpaBlock>(
            current_set_id,
            &current_authorities,
            current_hash,
            current_number,
            &ancestry,
            &linked.proof_scale,
        )
        .map_err(|source| CompositionError::AuthorityTransition { index, source })?;
        if u64::from(verified.target_number) >= payload.finality_horizon_height {
            return Err(CompositionError::Binding(
                "authority transition is not strictly before finality horizon",
            ));
        }
        current_hash = verified.target_hash;
        current_number = verified.target_number;
        current_set_id = verified.current_set_id;
        current_authorities = verified.current_authorities;
        authenticated_headers.extend(ancestry);
    }

    let tail = decode_headers(&witness.checkpoint_tail_headers_scale)?;
    for header in &tail {
        let expected_number = current_number
            .checked_add(1)
            .ok_or(CompositionError::Binding("checkpoint-tail height overflow"))?;
        if header.number != expected_number {
            return Err(CompositionError::Binding("checkpoint-tail height"));
        }
        if header.parent_hash != current_hash {
            return Err(CompositionError::Binding("checkpoint-tail parent"));
        }
        validate_grandpa_logs(
            header,
            GrandpaLogScope::CheckpointTail {
                finality_horizon_height: payload.finality_horizon_height,
            },
        )?;
        current_hash = header.hash();
        current_number = header.number;
    }
    authenticated_headers.extend(tail);

    if u64::from(current_number) != payload.finality_horizon_height
        || current_hash != FrontierHash(payload.finality_horizon_hash)
    {
        return Err(CompositionError::Binding("finality horizon chain"));
    }

    let target_position = if target_number
        == u32::try_from(witness.trust_anchor.checkpoint_number)
            .map_err(|_| CompositionError::Binding("checkpoint number exceeds Frontier u32"))?
        && witness.target_native_block_hash == witness.trust_anchor.checkpoint_hash
    {
        None
    } else {
        let mut position = None;
        for (index, header) in authenticated_headers.iter().enumerate() {
            if header.number == target_number && header.hash() == target_header.hash() {
                if position.replace(index).is_some() {
                    return Err(CompositionError::Binding("duplicate target header"));
                }
                if header != &target_header {
                    return Err(CompositionError::Binding("target header bytes"));
                }
            }
        }
        Some(position.ok_or(CompositionError::Binding(
            "target header is absent from authenticated chain",
        ))?)
    };

    let verified_finality = verify_grandpa_finality_proof::<FrontierGrandpaBlock>(
        target_header.hash(),
        target_number,
        current_set_id,
        &current_authorities,
        &witness.finality_proof_scale,
    )?;
    if verified_finality.target_number != current_number
        || verified_finality.target_hash != current_hash
    {
        return Err(CompositionError::Binding("finality proof horizon"));
    }
    let suffix = target_position.map_or(authenticated_headers.as_slice(), |index| {
        &authenticated_headers[index + 1..]
    });
    validate_finality_header_suffix(&verified_finality.proof.unknown_headers, suffix)?;

    let checkpoint = &payload.checkpoint;
    if checkpoint.len() != CHECKPOINT_BYTES {
        return Err(CompositionError::Binding("checkpoint byte length"));
    }
    let checkpoint_sidechain_id = array_at::<32>(checkpoint, 4);
    let checkpoint_height = u64::from_be_bytes(array_at::<8>(checkpoint, 36));
    let checkpoint_native_hash = array_at::<32>(checkpoint, 44);
    let checkpoint_execution_hash = array_at::<32>(checkpoint, 76);
    let checkpoint_event_root = array_at::<32>(checkpoint, 108);
    let checkpoint_burn_count = u32::from_be_bytes(array_at::<4>(checkpoint, 140));
    let checkpoint_set_id = u64::from_be_bytes(array_at::<8>(checkpoint, 144));
    let checkpoint_set_hash = array_at::<32>(checkpoint, 152);
    let checkpoint_finality_hash = array_at::<32>(checkpoint, 184);

    if checkpoint_sidechain_id != witness.trust_anchor.sidechain_id {
        return Err(CompositionError::Binding("checkpoint sidechain ID"));
    }
    if checkpoint_height != u64::from(target_number) {
        return Err(CompositionError::Binding("checkpoint target height"));
    }
    if checkpoint_native_hash != witness.target_native_block_hash {
        return Err(CompositionError::Binding("checkpoint target hash"));
    }
    if checkpoint_set_id != current_set_id {
        return Err(CompositionError::Binding("checkpoint authority set ID"));
    }
    let canonical_authorities = current_authorities.encode();
    if checkpoint_set_hash != domain_hash(GRANDPA_AUTHORITY_SET_DOMAIN, &canonical_authorities) {
        return Err(CompositionError::Binding("checkpoint authority set hash"));
    }
    if checkpoint_finality_hash
        != domain_hash(
            GRANDPA_JUSTIFICATION_DOMAIN,
            &verified_finality.proof.justification,
        )
    {
        return Err(CompositionError::Binding("checkpoint finality proof hash"));
    }
    if payload.checkpoint_commitment != domain_hash(CHECKPOINT_DOMAIN, checkpoint) {
        return Err(CompositionError::Binding("checkpoint commitment"));
    }

    let expected_commitment = BridgeCommitmentV1 {
        sidechain_id: checkpoint_sidechain_id,
        sidechain_height: checkpoint_height,
        execution_block_hash: checkpoint_execution_hash,
        bridge_event_root: checkpoint_event_root,
        burn_leaf_count: checkpoint_burn_count,
    };
    verify_bridge_commitment_state_v1(
        target_header.state_root.0,
        &witness.runtime_state_proof_nodes,
        &expected_commitment,
    )?;

    Ok(statement.encoded)
}

#[cfg(feature = "application-v2")]
struct VerifiedFinalityComposition {
    target_state_root: [u8; 32],
    expected_commitment: BridgeCommitmentV1,
}

#[cfg(feature = "pooled-reserve-burn-v4")]
pub(crate) struct VerifiedFinalityCompositionV4 {
    pub(crate) target_state_root: [u8; 32],
    pub(crate) expected_commitment: BridgeCommitmentV1,
}

#[cfg(feature = "pooled-reserve-burn-v4")]
pub(crate) struct FinalityPayloadViewV4<'a> {
    pub(crate) checkpoint: &'a [u8; CHECKPOINT_BYTES],
    pub(crate) checkpoint_commitment: &'a [u8; 32],
    pub(crate) target_native_state_root: &'a [u8; 32],
    pub(crate) trusted_anchor_digest: &'a [u8; 32],
    pub(crate) finality_horizon_height: u64,
    pub(crate) finality_horizon_hash: &'a [u8; 32],
}

#[cfg(feature = "pooled-reserve-burn-v4")]
pub(crate) struct FinalityWitnessViewV4<'a> {
    pub(crate) trust_anchor: &'a GrandpaTrustAnchorV1,
    pub(crate) target_native_block_hash: &'a [u8; 32],
    pub(crate) target_header_scale: &'a [u8],
    pub(crate) linked_grandpa_proofs: &'a [LinkedGrandpaProofV1],
    pub(crate) checkpoint_tail_headers_scale: &'a [Vec<u8>],
    pub(crate) finality_proof_scale: &'a [u8],
}

#[cfg(feature = "application-v2")]
fn verify_finality_composition_v2(
    payload: &bridge_validity_statement::BridgeValidityFinalityPayloadV2,
    witness: &BridgeValidityGuestWitnessV2,
) -> Result<VerifiedFinalityComposition, CompositionError> {
    let native_request =
        validate_compatibility_aggregate_proof_v1(payload, &witness.compatibility_proof)?;
    let rebuilt_request = application_composition_v2::encode_canonical_native_request_v2(witness)?;
    if native_request != rebuilt_request {
        return Err(CompositionError::NativeRequestMismatch);
    }

    let trust_anchor = &witness.trust_anchor;
    let trusted_authorities = decode_authority_list(&trust_anchor.authority_list_scale)?;
    let trust_anchor_digest =
        derive_trust_anchor_digest(trust_anchor, &trust_anchor.authority_list_scale);
    if payload.trusted_anchor_digest != trust_anchor_digest {
        return Err(CompositionError::Binding("trusted anchor digest"));
    }

    let target_header = decode_header(&witness.target_header_scale)?;
    if target_header.hash() != FrontierHash(witness.target_native_block_hash) {
        return Err(CompositionError::Binding("target header hash"));
    }
    let target_number = target_header.number;
    if u64::from(target_number) < trust_anchor.checkpoint_number {
        return Err(CompositionError::Binding(
            "target precedes reviewed checkpoint",
        ));
    }

    let mut current_hash = FrontierHash(trust_anchor.checkpoint_hash);
    let mut current_number = u32::try_from(trust_anchor.checkpoint_number)
        .map_err(|_| CompositionError::Binding("checkpoint number exceeds Frontier u32"))?;
    let mut current_set_id = trust_anchor.grandpa_set_id;
    let mut current_authorities = trusted_authorities;
    let mut authenticated_headers = Vec::new();

    for (index, linked) in witness.linked_grandpa_proofs.iter().enumerate() {
        let ancestry = decode_headers(&linked.ancestry_headers_scale)?;
        for header in &ancestry {
            validate_grandpa_logs(header, GrandpaLogScope::TransitionAncestry)?;
        }
        let verified = verify_linked_grandpa_authority_transition_proof::<FrontierGrandpaBlock>(
            current_set_id,
            &current_authorities,
            current_hash,
            current_number,
            &ancestry,
            &linked.proof_scale,
        )
        .map_err(|source| CompositionError::AuthorityTransition { index, source })?;
        if u64::from(verified.target_number) >= payload.finality_horizon_height {
            return Err(CompositionError::Binding(
                "authority transition is not strictly before finality horizon",
            ));
        }
        current_hash = verified.target_hash;
        current_number = verified.target_number;
        current_set_id = verified.current_set_id;
        current_authorities = verified.current_authorities;
        authenticated_headers.extend(ancestry);
    }

    let tail = decode_headers(&witness.checkpoint_tail_headers_scale)?;
    for header in &tail {
        let expected_number = current_number
            .checked_add(1)
            .ok_or(CompositionError::Binding("checkpoint-tail height overflow"))?;
        if header.number != expected_number {
            return Err(CompositionError::Binding("checkpoint-tail height"));
        }
        if header.parent_hash != current_hash {
            return Err(CompositionError::Binding("checkpoint-tail parent"));
        }
        validate_grandpa_logs(
            header,
            GrandpaLogScope::CheckpointTail {
                finality_horizon_height: payload.finality_horizon_height,
            },
        )?;
        current_hash = header.hash();
        current_number = header.number;
    }
    authenticated_headers.extend(tail);

    if u64::from(current_number) != payload.finality_horizon_height
        || current_hash != FrontierHash(payload.finality_horizon_hash)
    {
        return Err(CompositionError::Binding("finality horizon chain"));
    }

    let target_position = if target_number
        == u32::try_from(trust_anchor.checkpoint_number)
            .map_err(|_| CompositionError::Binding("checkpoint number exceeds Frontier u32"))?
        && witness.target_native_block_hash == trust_anchor.checkpoint_hash
    {
        None
    } else {
        let mut position = None;
        for (index, header) in authenticated_headers.iter().enumerate() {
            if header.number == target_number && header.hash() == target_header.hash() {
                if position.replace(index).is_some() {
                    return Err(CompositionError::Binding("duplicate target header"));
                }
                if header != &target_header {
                    return Err(CompositionError::Binding("target header bytes"));
                }
            }
        }
        Some(position.ok_or(CompositionError::Binding(
            "target header is absent from authenticated chain",
        ))?)
    };

    let verified_finality = verify_grandpa_finality_proof::<FrontierGrandpaBlock>(
        target_header.hash(),
        target_number,
        current_set_id,
        &current_authorities,
        &witness.finality_proof_scale,
    )?;
    if verified_finality.target_number != current_number
        || verified_finality.target_hash != current_hash
    {
        return Err(CompositionError::Binding("finality proof horizon"));
    }
    let suffix = target_position.map_or(authenticated_headers.as_slice(), |index| {
        &authenticated_headers[index + 1..]
    });
    validate_finality_header_suffix(&verified_finality.proof.unknown_headers, suffix)?;

    let checkpoint = &payload.checkpoint;
    if checkpoint.len() != CHECKPOINT_BYTES {
        return Err(CompositionError::Binding("checkpoint byte length"));
    }
    let checkpoint_sidechain_id = array_at::<32>(checkpoint, 4);
    let checkpoint_height = u64::from_be_bytes(array_at::<8>(checkpoint, 36));
    let checkpoint_native_hash = array_at::<32>(checkpoint, 44);
    let checkpoint_execution_hash = array_at::<32>(checkpoint, 76);
    let checkpoint_event_root = array_at::<32>(checkpoint, 108);
    let checkpoint_burn_count = u32::from_be_bytes(array_at::<4>(checkpoint, 140));
    let checkpoint_set_id = u64::from_be_bytes(array_at::<8>(checkpoint, 144));
    let checkpoint_set_hash = array_at::<32>(checkpoint, 152);
    let checkpoint_finality_hash = array_at::<32>(checkpoint, 184);

    if checkpoint_sidechain_id != trust_anchor.sidechain_id {
        return Err(CompositionError::Binding("checkpoint sidechain ID"));
    }
    if checkpoint_height != u64::from(target_number) {
        return Err(CompositionError::Binding("checkpoint target height"));
    }
    if checkpoint_native_hash != witness.target_native_block_hash {
        return Err(CompositionError::Binding("checkpoint target hash"));
    }
    if checkpoint_set_id != current_set_id {
        return Err(CompositionError::Binding("checkpoint authority set ID"));
    }
    let canonical_authorities = current_authorities.encode();
    if checkpoint_set_hash != domain_hash(GRANDPA_AUTHORITY_SET_DOMAIN, &canonical_authorities) {
        return Err(CompositionError::Binding("checkpoint authority set hash"));
    }
    if checkpoint_finality_hash
        != domain_hash(
            GRANDPA_JUSTIFICATION_DOMAIN,
            &verified_finality.proof.justification,
        )
    {
        return Err(CompositionError::Binding("checkpoint finality proof hash"));
    }
    if payload.checkpoint_commitment != domain_hash(CHECKPOINT_DOMAIN, checkpoint) {
        return Err(CompositionError::Binding("checkpoint commitment"));
    }

    let expected_commitment = BridgeCommitmentV1 {
        sidechain_id: checkpoint_sidechain_id,
        sidechain_height: checkpoint_height,
        execution_block_hash: checkpoint_execution_hash,
        bridge_event_root: checkpoint_event_root,
        burn_leaf_count: checkpoint_burn_count,
    };
    Ok(VerifiedFinalityComposition {
        target_state_root: target_header.state_root.0,
        expected_commitment,
    })
}

#[cfg(feature = "pooled-reserve-burn-v4")]
pub(crate) fn verify_finality_composition_fields_v4(
    payload: FinalityPayloadViewV4<'_>,
    witness: FinalityWitnessViewV4<'_>,
) -> Result<VerifiedFinalityCompositionV4, CompositionError> {
    let trust_anchor = witness.trust_anchor;
    let trusted_authorities = decode_authority_list(&trust_anchor.authority_list_scale)?;
    let trust_anchor_digest =
        derive_trust_anchor_digest(trust_anchor, &trust_anchor.authority_list_scale);
    if *payload.trusted_anchor_digest != trust_anchor_digest {
        return Err(CompositionError::Binding("trusted anchor digest"));
    }

    let target_header = decode_header(witness.target_header_scale)?;
    if target_header.hash() != FrontierHash(*witness.target_native_block_hash) {
        return Err(CompositionError::Binding("target header hash"));
    }
    if target_header.state_root.0 != *payload.target_native_state_root {
        return Err(CompositionError::Binding("target native state root"));
    }
    let target_number = target_header.number;
    if u64::from(target_number) < trust_anchor.checkpoint_number {
        return Err(CompositionError::Binding(
            "target precedes reviewed checkpoint",
        ));
    }

    let mut current_hash = FrontierHash(trust_anchor.checkpoint_hash);
    let mut current_number = u32::try_from(trust_anchor.checkpoint_number)
        .map_err(|_| CompositionError::Binding("checkpoint number exceeds Frontier u32"))?;
    let mut current_set_id = trust_anchor.grandpa_set_id;
    let mut current_authorities = trusted_authorities;
    let mut authenticated_headers = Vec::new();

    for (index, linked) in witness.linked_grandpa_proofs.iter().enumerate() {
        let ancestry = decode_headers(&linked.ancestry_headers_scale)?;
        for header in &ancestry {
            validate_grandpa_logs(header, GrandpaLogScope::TransitionAncestry)?;
        }
        let verified = verify_linked_grandpa_authority_transition_proof::<FrontierGrandpaBlock>(
            current_set_id,
            &current_authorities,
            current_hash,
            current_number,
            &ancestry,
            &linked.proof_scale,
        )
        .map_err(|source| CompositionError::AuthorityTransition { index, source })?;
        if u64::from(verified.target_number) >= payload.finality_horizon_height {
            return Err(CompositionError::Binding(
                "authority transition is not strictly before finality horizon",
            ));
        }
        current_hash = verified.target_hash;
        current_number = verified.target_number;
        current_set_id = verified.current_set_id;
        current_authorities = verified.current_authorities;
        authenticated_headers.extend(ancestry);
    }

    let tail = decode_headers(witness.checkpoint_tail_headers_scale)?;
    for header in &tail {
        let expected_number = current_number
            .checked_add(1)
            .ok_or(CompositionError::Binding("checkpoint-tail height overflow"))?;
        if header.number != expected_number {
            return Err(CompositionError::Binding("checkpoint-tail height"));
        }
        if header.parent_hash != current_hash {
            return Err(CompositionError::Binding("checkpoint-tail parent"));
        }
        validate_grandpa_logs(
            header,
            GrandpaLogScope::CheckpointTail {
                finality_horizon_height: payload.finality_horizon_height,
            },
        )?;
        current_hash = header.hash();
        current_number = header.number;
    }
    authenticated_headers.extend(tail);

    if u64::from(current_number) != payload.finality_horizon_height
        || current_hash != FrontierHash(*payload.finality_horizon_hash)
    {
        return Err(CompositionError::Binding("finality horizon chain"));
    }

    let target_position = if target_number
        == u32::try_from(trust_anchor.checkpoint_number)
            .map_err(|_| CompositionError::Binding("checkpoint number exceeds Frontier u32"))?
        && *witness.target_native_block_hash == trust_anchor.checkpoint_hash
    {
        None
    } else {
        let mut position = None;
        for (index, header) in authenticated_headers.iter().enumerate() {
            if header.number == target_number && header.hash() == target_header.hash() {
                if position.replace(index).is_some() {
                    return Err(CompositionError::Binding("duplicate target header"));
                }
                if header != &target_header {
                    return Err(CompositionError::Binding("target header bytes"));
                }
            }
        }
        Some(position.ok_or(CompositionError::Binding(
            "target header is absent from authenticated chain",
        ))?)
    };

    let verified_finality = verify_grandpa_finality_proof::<FrontierGrandpaBlock>(
        target_header.hash(),
        target_number,
        current_set_id,
        &current_authorities,
        witness.finality_proof_scale,
    )?;
    if verified_finality.target_number != current_number
        || verified_finality.target_hash != current_hash
    {
        return Err(CompositionError::Binding("finality proof horizon"));
    }
    let suffix = target_position.map_or(authenticated_headers.as_slice(), |index| {
        &authenticated_headers[index + 1..]
    });
    validate_finality_header_suffix(&verified_finality.proof.unknown_headers, suffix)?;

    let checkpoint = payload.checkpoint;
    if checkpoint.len() != CHECKPOINT_BYTES {
        return Err(CompositionError::Binding("checkpoint byte length"));
    }
    let checkpoint_sidechain_id = array_at::<32>(checkpoint, 4);
    let checkpoint_height = u64::from_be_bytes(array_at::<8>(checkpoint, 36));
    let checkpoint_native_hash = array_at::<32>(checkpoint, 44);
    let checkpoint_execution_hash = array_at::<32>(checkpoint, 76);
    let checkpoint_event_root = array_at::<32>(checkpoint, 108);
    let checkpoint_burn_count = u32::from_be_bytes(array_at::<4>(checkpoint, 140));
    let checkpoint_set_id = u64::from_be_bytes(array_at::<8>(checkpoint, 144));
    let checkpoint_set_hash = array_at::<32>(checkpoint, 152);
    let checkpoint_finality_hash = array_at::<32>(checkpoint, 184);

    if checkpoint_sidechain_id != trust_anchor.sidechain_id {
        return Err(CompositionError::Binding("checkpoint sidechain ID"));
    }
    if checkpoint_height != u64::from(target_number) {
        return Err(CompositionError::Binding("checkpoint target height"));
    }
    if checkpoint_native_hash != *witness.target_native_block_hash {
        return Err(CompositionError::Binding("checkpoint target hash"));
    }
    if checkpoint_set_id != current_set_id {
        return Err(CompositionError::Binding("checkpoint authority set ID"));
    }
    let canonical_authorities = current_authorities.encode();
    if checkpoint_set_hash != domain_hash(GRANDPA_AUTHORITY_SET_DOMAIN, &canonical_authorities) {
        return Err(CompositionError::Binding("checkpoint authority set hash"));
    }
    if checkpoint_finality_hash
        != domain_hash(
            GRANDPA_JUSTIFICATION_DOMAIN,
            &verified_finality.proof.justification,
        )
    {
        return Err(CompositionError::Binding("checkpoint finality proof hash"));
    }
    if *payload.checkpoint_commitment != domain_hash(CHECKPOINT_DOMAIN, checkpoint) {
        return Err(CompositionError::Binding("checkpoint commitment"));
    }

    let expected_commitment = BridgeCommitmentV1 {
        sidechain_id: checkpoint_sidechain_id,
        sidechain_height: checkpoint_height,
        execution_block_hash: checkpoint_execution_hash,
        bridge_event_root: checkpoint_event_root,
        burn_leaf_count: checkpoint_burn_count,
    };
    Ok(VerifiedFinalityCompositionV4 {
        target_state_root: target_header.state_root.0,
        expected_commitment,
    })
}

#[derive(Clone, Copy)]
enum GrandpaLogScope {
    TransitionAncestry,
    CheckpointTail { finality_horizon_height: u64 },
}

fn validate_grandpa_logs(
    header: &FrontierHeader,
    scope: GrandpaLogScope,
) -> Result<(), CompositionError> {
    let mut authority_change_count = 0usize;
    for item in header.digest().logs() {
        let FrontierDigestItem::Consensus(engine, payload) = item else {
            continue;
        };
        if *engine != GRANDPA_ENGINE_ID {
            continue;
        }
        let log = ConsensusLog::<u32>::decode_all(&mut payload.as_slice())
            .map_err(|_| CompositionError::GrandpaLog("non-canonical consensus log"))?;
        match log {
            ConsensusLog::ForcedChange(_, _) => {
                return Err(CompositionError::GrandpaLog("forced authority change"));
            }
            ConsensusLog::ScheduledChange(change) => {
                authority_change_count += 1;
                if authority_change_count > 1 {
                    return Err(CompositionError::GrandpaLog(
                        "multiple authority changes in one header",
                    ));
                }
                validate_authorities(&change.next_authorities)?;
                if let GrandpaLogScope::CheckpointTail {
                    finality_horizon_height,
                } = scope
                {
                    if u64::from(header.number) < finality_horizon_height {
                        return Err(CompositionError::GrandpaLog(
                            "unproved authority change before finality horizon",
                        ));
                    }
                    if u64::from(header.number) != finality_horizon_height || change.delay != 0 {
                        return Err(CompositionError::GrandpaLog(
                            "unsupported delayed or post-horizon authority change",
                        ));
                    }
                }
            }
            ConsensusLog::OnDisabled(_) | ConsensusLog::Pause(_) | ConsensusLog::Resume(_) => {
                return Err(CompositionError::GrandpaLog(
                    "unsupported authority-disable, pause, or resume operation",
                ));
            }
        }
    }
    Ok(())
}

fn decode_authority_list(bytes: &[u8]) -> Result<AuthorityList, CompositionError> {
    let authorities = AuthorityList::decode_all(&mut &*bytes)
        .map_err(|_| CompositionError::Scale("GRANDPA authority list"))?;
    if authorities.encode() != bytes {
        return Err(CompositionError::Scale(
            "non-canonical GRANDPA authority list",
        ));
    }
    validate_authorities(&authorities)?;
    Ok(authorities)
}

fn validate_authorities(authorities: &AuthorityList) -> Result<(), CompositionError> {
    if authorities.is_empty() || authorities.len() > MAX_GRANDPA_AUTHORITIES {
        return Err(CompositionError::Scale("invalid GRANDPA authority count"));
    }
    let mut total = 0u64;
    for (index, (authority, weight)) in authorities.iter().enumerate() {
        if *weight == 0
            || authorities[..index]
                .iter()
                .any(|(seen, _)| seen == authority)
        {
            return Err(CompositionError::Scale("invalid GRANDPA authority entry"));
        }
        total = total
            .checked_add(*weight)
            .ok_or(CompositionError::Scale("GRANDPA authority weight overflow"))?;
    }
    Ok(())
}

fn decode_header(bytes: &[u8]) -> Result<FrontierHeader, CompositionError> {
    let header = FrontierHeader::decode_all(&mut &*bytes)
        .map_err(|_| CompositionError::Scale("Frontier header"))?;
    if header.encode() != bytes {
        return Err(CompositionError::Scale("non-canonical Frontier header"));
    }
    Ok(header)
}

fn decode_headers(encoded: &[Vec<u8>]) -> Result<Vec<FrontierHeader>, CompositionError> {
    encoded.iter().map(|bytes| decode_header(bytes)).collect()
}

fn derive_trust_anchor_digest(
    anchor: &GrandpaTrustAnchorV1,
    authority_list_scale: &[u8],
) -> [u8; 32] {
    let authority_hash = domain_hash(GRANDPA_AUTHORITY_SET_DOMAIN, authority_list_scale);
    let mut preimage = Vec::with_capacity(GRANDPA_TRUST_ANCHOR_DOMAIN.len() + 112);
    preimage.extend_from_slice(GRANDPA_TRUST_ANCHOR_DOMAIN);
    preimage.extend_from_slice(&anchor.sidechain_id);
    preimage.extend_from_slice(&anchor.checkpoint_hash);
    preimage.extend_from_slice(&anchor.checkpoint_number.to_be_bytes());
    preimage.extend_from_slice(&anchor.grandpa_set_id.to_be_bytes());
    preimage.extend_from_slice(&authority_hash);
    blake2b256(&preimage)
}

fn encode_canonical_native_request(
    witness: &BridgeValidityGuestWitnessV1,
) -> Result<Vec<u8>, CompositionError> {
    let mut counter = CountingWriter::default();
    write_canonical_native_request(&mut counter, witness)
        .map_err(|_| CompositionError::WitnessEncoding("canonical native request length"))?;
    if counter.len > MAX_NATIVE_VERIFIER_REQUEST_BYTES {
        return Err(CompositionError::FieldTooLarge {
            field: "canonical native request",
            actual: counter.len,
            max: MAX_NATIVE_VERIFIER_REQUEST_BYTES,
        });
    }

    let mut json = String::with_capacity(counter.len);
    write_canonical_native_request(&mut json, witness)
        .map_err(|_| CompositionError::WitnessEncoding("canonical native request write"))?;
    debug_assert_eq!(json.len(), counter.len);
    Ok(json.into_bytes())
}

fn write_canonical_native_request<W: core::fmt::Write>(
    json: &mut W,
    witness: &BridgeValidityGuestWitnessV1,
) -> core::fmt::Result {
    json.write_str("{\"schema\":\"")?;
    json.write_str(NATIVE_REQUEST_SCHEMA)?;
    json.write_str("\",\"trustAnchor\":{\"sidechainIdHex\":\"")?;
    push_prefixed_hex(json, &witness.trust_anchor.sidechain_id)?;
    json.write_str("\",\"checkpointHashHex\":\"")?;
    push_prefixed_hex(json, &witness.trust_anchor.checkpoint_hash)?;
    json.write_str("\",\"checkpointNumber\":\"")?;
    write!(json, "{}", witness.trust_anchor.checkpoint_number)?;
    json.write_str("\",\"grandpaSetId\":\"")?;
    write!(json, "{}", witness.trust_anchor.grandpa_set_id)?;
    json.write_str("\",\"authorityListScaleHex\":\"")?;
    push_prefixed_hex(json, &witness.trust_anchor.authority_list_scale)?;
    json.write_str("\"},\"targetNativeBlockHashHex\":\"")?;
    push_prefixed_hex(json, &witness.target_native_block_hash)?;
    json.write_str("\",\"targetHeaderScaleHex\":\"")?;
    push_prefixed_hex(json, &witness.target_header_scale)?;
    json.write_str("\",\"linkedGrandpaProofs\":[")?;
    for (index, proof) in witness.linked_grandpa_proofs.iter().enumerate() {
        if index != 0 {
            json.write_char(',')?;
        }
        json.write_str("{\"ancestryHeadersScaleHex\":[")?;
        for (header_index, header) in proof.ancestry_headers_scale.iter().enumerate() {
            if header_index != 0 {
                json.write_char(',')?;
            }
            json.write_char('"')?;
            push_prefixed_hex(json, header)?;
            json.write_char('"')?;
        }
        json.write_str("],\"proofScaleHex\":\"")?;
        push_prefixed_hex(json, &proof.proof_scale)?;
        json.write_str("\"}")?;
    }
    json.write_str("],\"checkpointTailHeadersScaleHex\":[")?;
    for (index, header) in witness.checkpoint_tail_headers_scale.iter().enumerate() {
        if index != 0 {
            json.write_char(',')?;
        }
        json.write_char('"')?;
        push_prefixed_hex(json, header)?;
        json.write_char('"')?;
    }
    json.write_str("],\"finalityProofScaleHex\":\"")?;
    push_prefixed_hex(json, &witness.finality_proof_scale)?;
    json.write_str("\",\"runtimeStateProofNodesHex\":[")?;
    for (index, node) in witness.runtime_state_proof_nodes.iter().enumerate() {
        if index != 0 {
            json.write_char(',')?;
        }
        json.write_char('"')?;
        push_prefixed_hex(json, node)?;
        json.write_char('"')?;
    }
    json.write_str("]}")
}

fn push_prefixed_hex<W: core::fmt::Write>(output: &mut W, bytes: &[u8]) -> core::fmt::Result {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    output.write_str("0x")?;
    for byte in bytes {
        output.write_char(HEX[(byte >> 4) as usize] as char)?;
        output.write_char(HEX[(byte & 0x0f) as usize] as char)?;
    }
    Ok(())
}

#[derive(Default)]
struct CountingWriter {
    len: usize,
}

impl core::fmt::Write for CountingWriter {
    fn write_str(&mut self, value: &str) -> core::fmt::Result {
        self.len = self.len.saturating_add(value.len());
        Ok(())
    }
}

fn blake2b256(bytes: &[u8]) -> [u8; 32] {
    Blake2b256::digest(bytes).into()
}

fn domain_hash(domain: &[u8], bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Blake2b256::new();
    hasher.update(domain);
    hasher.update(bytes);
    hasher.finalize().into()
}

fn array_at<const N: usize>(bytes: &[u8], offset: usize) -> [u8; N] {
    bytes[offset..offset + N]
        .try_into()
        .expect("fixed checkpoint offsets are inside the already checked object; qed")
}

fn checked_total_headers(current: usize, added: usize) -> Result<usize, CompositionError> {
    let total = current
        .checked_add(added)
        .ok_or(CompositionError::WitnessEncoding("header count overflow"))?;
    if total > MAX_TOTAL_ANCESTRY_HEADERS {
        return Err(CompositionError::TooManyItems {
            field: "total ancestry headers",
            actual: total,
            max: MAX_TOTAL_ANCESTRY_HEADERS,
        });
    }
    Ok(total)
}

fn checked_state_proof_bytes(current: usize, added: usize) -> Result<usize, CompositionError> {
    let total = current
        .checked_add(added)
        .ok_or(CompositionError::WitnessEncoding(
            "state proof aggregate length overflow",
        ))?;
    if total > MAX_STATE_PROOF_BYTES {
        return Err(CompositionError::FieldTooLarge {
            field: "state proof",
            actual: total,
            max: MAX_STATE_PROOF_BYTES,
        });
    }
    Ok(total)
}

fn validate_witness_size(actual: usize) -> Result<(), CompositionError> {
    if actual > MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V1_BYTES {
        return Err(CompositionError::WitnessTooLarge {
            actual,
            max: MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V1_BYTES,
        });
    }
    Ok(())
}

fn validate_finality_header_suffix(
    actual: &[FrontierHeader],
    expected: &[FrontierHeader],
) -> Result<(), CompositionError> {
    if actual != expected {
        return Err(CompositionError::Binding("finality proof header suffix"));
    }
    Ok(())
}

fn push_count(output: &mut Vec<u8>, count: usize) -> Result<(), CompositionError> {
    let count = u32::try_from(count)
        .map_err(|_| CompositionError::WitnessEncoding("collection count exceeds u32"))?;
    output.extend_from_slice(&count.to_be_bytes());
    Ok(())
}

fn push_blob(output: &mut Vec<u8>, bytes: &[u8]) -> Result<(), CompositionError> {
    push_count(output, bytes.len())?;
    output.extend_from_slice(bytes);
    Ok(())
}

struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> Reader<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }

    fn take(&mut self, length: usize) -> Result<&'a [u8], CompositionError> {
        let end = self
            .offset
            .checked_add(length)
            .ok_or(CompositionError::WitnessEncoding("length overflow"))?;
        let value = self
            .bytes
            .get(self.offset..end)
            .ok_or(CompositionError::WitnessEncoding("truncated field"))?;
        self.offset = end;
        Ok(value)
    }

    fn byte(&mut self) -> Result<u8, CompositionError> {
        Ok(self.take(1)?[0])
    }

    fn array<const N: usize>(&mut self) -> Result<[u8; N], CompositionError> {
        self.take(N)?
            .try_into()
            .map_err(|_| CompositionError::WitnessEncoding("fixed array"))
    }

    fn u32_be(&mut self) -> Result<u32, CompositionError> {
        Ok(u32::from_be_bytes(self.array()?))
    }

    fn u64_be(&mut self) -> Result<u64, CompositionError> {
        Ok(u64::from_be_bytes(self.array()?))
    }

    fn count(&mut self, max: usize, field: &'static str) -> Result<usize, CompositionError> {
        let count = self.u32_be()? as usize;
        if count > max {
            return Err(CompositionError::TooManyItems {
                field,
                actual: count,
                max,
            });
        }
        Ok(count)
    }

    fn blob(
        &mut self,
        max: usize,
        field: &'static str,
        allow_empty: bool,
    ) -> Result<Vec<u8>, CompositionError> {
        let length = self.u32_be()? as usize;
        if !allow_empty && length == 0 {
            return Err(CompositionError::WitnessEncoding("empty byte field"));
        }
        if length > max {
            return Err(CompositionError::FieldTooLarge {
                field,
                actual: length,
                max,
            });
        }
        Ok(self.take(length)?.to_vec())
    }

    fn is_empty(&self) -> bool {
        self.offset == self.bytes.len()
    }
}

#[cfg(test)]
mod tests;
