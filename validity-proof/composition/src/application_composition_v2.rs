//! Application-bound validity composition over the frozen GRANDPA compatibility profile.
//!
//! V2 is additive: it preserves the V1 finality payload and authenticates the current bridge
//! commitment, causal application profile, and sticky causal enforcement under one finalized
//! source state root. It does not activate an Ergo verifier profile or authorize settlement.

use super::*;

use bridge_validity_state_proof::{
    verify_bridge_commitment_and_active_causal_application_state_v2,
    BridgeCausalApplicationStateError, CausalApplicationBindingV2, CausalProfileStateError,
};
use bridge_validity_statement::{
    decode_eip0045_bridge_application_statement_v2, EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES,
};
use thiserror::Error;

/// Domain prefix for the private application-bound guest witness ABI.
pub const BRIDGE_VALIDITY_GUEST_WITNESS_V2_DOMAIN: &[u8] = b"E2S_BRIDGE_VALIDITY_GUEST_WITNESS_V2";
/// Maximum encoded private witness accepted by the application-bound guest ABI.
pub const MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V2_BYTES: usize = 64 * 1024 * 1024;

const WITNESS_VERSION_V2: u8 = 2;

/// Complete private witness for application-bound GRANDPA validity composition.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BridgeValidityGuestWitnessV2 {
    /// Exact 1,132-byte application-bound EIP-0045 statement exposed as the public journal.
    pub statement: [u8; EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES],
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
    /// One raw proof-node set covering commitment, causal profile, and sticky enforcement.
    pub runtime_state_proof_nodes: Vec<Vec<u8>>,
}

/// An application-bound V2 composition rejection without changing the frozen V1 error API.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum ApplicationCompositionErrorV2 {
    /// The shared V1 finality, witness, statement, or commitment composition failed.
    #[error("bridge finality composition failed: {0}")]
    Composition(#[from] CompositionError),
    /// The authenticated causal profile or sticky enforcement check failed.
    #[error("causal application state verification failed: {0}")]
    CausalState(#[from] CausalProfileStateError),
}

/// Encode one typed application-bound witness into its canonical private ABI.
pub fn encode_bridge_validity_guest_witness_v2(
    witness: &BridgeValidityGuestWitnessV2,
) -> Result<Vec<u8>, CompositionError> {
    let mut encoded = Vec::new();
    encoded.extend_from_slice(BRIDGE_VALIDITY_GUEST_WITNESS_V2_DOMAIN);
    encoded.push(0);
    encoded.push(WITNESS_VERSION_V2);
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
    validate_v2_witness_size(encoded.len())?;
    decode_bridge_validity_guest_witness_v2(&encoded)?;
    Ok(encoded)
}

/// Strictly decode one canonical application-bound private witness.
pub fn decode_bridge_validity_guest_witness_v2(
    encoded: &[u8],
) -> Result<BridgeValidityGuestWitnessV2, CompositionError> {
    validate_v2_witness_size(encoded.len())?;
    let mut reader = Reader::new(encoded);
    if reader.take(BRIDGE_VALIDITY_GUEST_WITNESS_V2_DOMAIN.len())?
        != BRIDGE_VALIDITY_GUEST_WITNESS_V2_DOMAIN
        || reader.byte()? != 0
        || reader.byte()? != WITNESS_VERSION_V2
        || reader.byte()? != WITNESS_FLAGS_NONE
        || reader.take(2)? != [0, 0]
    {
        return Err(CompositionError::WitnessEncoding(
            "domain, version, flags, or reserved bytes",
        ));
    }
    let statement = reader.array::<EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES>()?;
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
    Ok(BridgeValidityGuestWitnessV2 {
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

/// Verify the complete application-bound witness and return its exact public statement.
///
/// The authenticated causal profile freezes declared bridge/token runtime-code identities. This
/// profile does not by itself prove membership of those bytecodes in Frontier's EVM account state.
/// The outer profile, exact guest program, and settlement consumer identities also remain
/// authoritative host/Ergo-consumer checks.
pub fn verify_bridge_validity_guest_witness_v2(
    encoded_witness: &[u8],
) -> Result<[u8; EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES], ApplicationCompositionErrorV2> {
    let witness = decode_bridge_validity_guest_witness_v2(encoded_witness)?;
    let statement = decode_eip0045_bridge_application_statement_v2(&witness.statement)
        .map_err(CompositionError::from)?;
    let verified =
        verify_finality_composition_v2(&statement.application_payload.finality, &witness)?;
    let application = &statement.application_payload.application;
    let expected_application = CausalApplicationBindingV2 {
        source_network_id: application.source_network_id,
        sidechain_id: application.sidechain_id,
        bridge_address: application.bridge_address,
        token_address: application.token_address,
        settlement_profile_id: application.settlement_profile_id,
        causal_profile_id: application.causal_profile_id,
        bridge_runtime_code_sha256: application.bridge_runtime_code_sha256,
        bridge_runtime_code_bytes: application.bridge_runtime_code_bytes,
        token_runtime_code_sha256: application.token_runtime_code_sha256,
        token_runtime_code_bytes: application.token_runtime_code_bytes,
    };
    verify_bridge_commitment_and_active_causal_application_state_v2(
        verified.target_state_root,
        &witness.runtime_state_proof_nodes,
        &verified.expected_commitment,
        &expected_application,
    )
    .map_err(|source| match source {
        BridgeCausalApplicationStateError::Commitment(source) => {
            ApplicationCompositionErrorV2::Composition(CompositionError::State(source))
        }
        BridgeCausalApplicationStateError::Causal(source) => {
            ApplicationCompositionErrorV2::CausalState(source)
        }
    })?;
    Ok(statement.encoded)
}

pub(super) fn encode_canonical_native_request_v2(
    witness: &BridgeValidityGuestWitnessV2,
) -> Result<Vec<u8>, CompositionError> {
    let mut counter = CountingWriter::default();
    write_canonical_native_request_v2(&mut counter, witness)
        .map_err(|_| CompositionError::WitnessEncoding("canonical native request length"))?;
    if counter.len > MAX_NATIVE_VERIFIER_REQUEST_BYTES {
        return Err(CompositionError::FieldTooLarge {
            field: "canonical native request",
            actual: counter.len,
            max: MAX_NATIVE_VERIFIER_REQUEST_BYTES,
        });
    }

    let mut json = String::with_capacity(counter.len);
    write_canonical_native_request_v2(&mut json, witness)
        .map_err(|_| CompositionError::WitnessEncoding("canonical native request write"))?;
    debug_assert_eq!(json.len(), counter.len);
    Ok(json.into_bytes())
}

fn write_canonical_native_request_v2<W: core::fmt::Write>(
    json: &mut W,
    witness: &BridgeValidityGuestWitnessV2,
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

fn validate_v2_witness_size(actual: usize) -> Result<(), CompositionError> {
    if actual > MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V2_BYTES {
        return Err(CompositionError::WitnessTooLarge {
            actual,
            max: MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V2_BYTES,
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::application_test_vectors_v2::{
        application_fixture_v2, replace_application_statement_v2, seal_application_fixture_v2,
        ApplicationFixtureV2,
    };

    #[test]
    fn composes_one_finalized_root_into_the_exact_application_statement() {
        let fixture = fixture(Some(&[1]), true, true, 0x42);
        let encoded = encode_bridge_validity_guest_witness_v2(&fixture.witness).unwrap();
        assert_eq!(
            decode_bridge_validity_guest_witness_v2(&encoded).unwrap(),
            fixture.witness
        );
        assert_eq!(
            verify_bridge_validity_guest_witness_v2(&encoded).unwrap(),
            fixture.witness.statement
        );

        let statement =
            decode_eip0045_bridge_application_statement_v2(&fixture.witness.statement).unwrap();
        let target = decode_header(&fixture.witness.target_header_scale).unwrap();
        assert_eq!(
            hex::encode(target.state_root.0),
            "98c8378d0e5640cb5fc8aa94f5192296147654611b4cd7fc337f805b461eedf6"
        );
        assert_eq!(
            hex::encode(target.hash().0),
            "dc40b6eb73a31b03e44e6a49de0488b2b21535ec87bd25321ed3890123794095"
        );
        assert_eq!(
            hex::encode(blake2b256(&fixture.witness.statement)),
            "f7fd76ce549d7a53ba732df58cb908ac3deec79ea45e816d1a0365bba6f53acd"
        );
        assert_eq!(
            hex::encode(blake2b256(&encoded)),
            "0c445b45293bb14ed2a58d8e4696610a00847fae6382893f180bcc09ad115935"
        );
        assert_eq!(
            statement.application_payload.finality.checkpoint[108..140],
            [0x77; 32]
        );
        assert_eq!(
            statement.application_payload.application,
            fixture.application
        );
        assert_ne!(target.state_root.0, [0; 32]);
    }

    #[test]
    fn rejects_v1_downgrades_and_noncanonical_private_witness_bytes() {
        let fixture = fixture(Some(&[1]), true, true, 0x42);
        let encoded = encode_bridge_validity_guest_witness_v2(&fixture.witness).unwrap();

        let mut wrong_domain = encoded.clone();
        wrong_domain[0] ^= 1;
        assert_eq!(
            decode_bridge_validity_guest_witness_v2(&wrong_domain),
            Err(CompositionError::WitnessEncoding(
                "domain, version, flags, or reserved bytes"
            ))
        );

        let mut wrong_version = encoded.clone();
        wrong_version[BRIDGE_VALIDITY_GUEST_WITNESS_V2_DOMAIN.len() + 1] = 1;
        assert_eq!(
            decode_bridge_validity_guest_witness_v2(&wrong_version),
            Err(CompositionError::WitnessEncoding(
                "domain, version, flags, or reserved bytes"
            ))
        );

        let mut trailing = encoded;
        trailing.push(0);
        assert_eq!(
            decode_bridge_validity_guest_witness_v2(&trailing),
            Err(CompositionError::WitnessEncoding("trailing bytes"))
        );

        let (v1, _, _) = crate::test_vectors::fixture();
        let v1 = encode_bridge_validity_guest_witness_v1(&v1).unwrap();
        assert_eq!(
            decode_bridge_validity_guest_witness_v2(&v1),
            Err(CompositionError::WitnessEncoding(
                "domain, version, flags, or reserved bytes"
            ))
        );
    }

    #[test]
    fn enforces_v2_private_abi_collection_and_proof_limits() {
        validate_v2_witness_size(MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V2_BYTES).unwrap();
        assert_eq!(
            validate_v2_witness_size(MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V2_BYTES + 1),
            Err(CompositionError::WitnessTooLarge {
                actual: MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V2_BYTES + 1,
                max: MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V2_BYTES,
            })
        );

        let mut exact_counts = fixture(Some(&[1]), true, true, 0x42).witness;
        exact_counts.linked_grandpa_proofs = (0..MAX_LINKED_GRANDPA_PROOFS)
            .map(|_| LinkedGrandpaProofV1 {
                ancestry_headers_scale: vec![vec![1]],
                proof_scale: vec![1],
            })
            .collect();
        exact_counts.checkpoint_tail_headers_scale = vec![vec![1]; MAX_CHECKPOINT_TAIL_HEADERS];
        exact_counts.runtime_state_proof_nodes = vec![vec![1]; MAX_STATE_PROOF_NODES];
        let encoded = encode_bridge_validity_guest_witness_v2(&exact_counts).unwrap();
        let decoded = decode_bridge_validity_guest_witness_v2(&encoded).unwrap();
        assert_eq!(
            decoded.linked_grandpa_proofs.len(),
            MAX_LINKED_GRANDPA_PROOFS
        );
        assert_eq!(
            decoded.checkpoint_tail_headers_scale.len(),
            MAX_CHECKPOINT_TAIL_HEADERS
        );
        assert_eq!(
            decoded.runtime_state_proof_nodes.len(),
            MAX_STATE_PROOF_NODES
        );

        let mut exact_headers = fixture(Some(&[1]), true, true, 0x42).witness;
        exact_headers.linked_grandpa_proofs = (0..MAX_LINKED_GRANDPA_PROOFS)
            .map(|_| LinkedGrandpaProofV1 {
                ancestry_headers_scale: vec![vec![1]; MAX_AUTHORITY_TRANSITION_ANCESTRY_HEADERS],
                proof_scale: vec![1],
            })
            .collect();
        exact_headers.checkpoint_tail_headers_scale = vec![vec![1]; MAX_CHECKPOINT_TAIL_HEADERS];
        let encoded = encode_bridge_validity_guest_witness_v2(&exact_headers).unwrap();
        decode_bridge_validity_guest_witness_v2(&encoded).unwrap();

        let mut too_many_linked = fixture(Some(&[1]), true, true, 0x42).witness;
        too_many_linked.linked_grandpa_proofs = (0..=MAX_LINKED_GRANDPA_PROOFS)
            .map(|_| LinkedGrandpaProofV1 {
                ancestry_headers_scale: vec![vec![1]],
                proof_scale: vec![1],
            })
            .collect();
        assert_eq!(
            encode_bridge_validity_guest_witness_v2(&too_many_linked),
            Err(CompositionError::TooManyItems {
                field: "linked GRANDPA proofs",
                actual: MAX_LINKED_GRANDPA_PROOFS + 1,
                max: MAX_LINKED_GRANDPA_PROOFS,
            })
        );

        let mut too_many_tail = fixture(Some(&[1]), true, true, 0x42).witness;
        too_many_tail.checkpoint_tail_headers_scale =
            vec![vec![1]; MAX_CHECKPOINT_TAIL_HEADERS + 1];
        assert_eq!(
            encode_bridge_validity_guest_witness_v2(&too_many_tail),
            Err(CompositionError::TooManyItems {
                field: "checkpoint-tail headers",
                actual: MAX_CHECKPOINT_TAIL_HEADERS + 1,
                max: MAX_CHECKPOINT_TAIL_HEADERS,
            })
        );

        let mut too_many_nodes = fixture(Some(&[1]), true, true, 0x42).witness;
        too_many_nodes.runtime_state_proof_nodes = vec![vec![1]; MAX_STATE_PROOF_NODES + 1];
        assert_eq!(
            encode_bridge_validity_guest_witness_v2(&too_many_nodes),
            Err(CompositionError::TooManyItems {
                field: "state proof nodes",
                actual: MAX_STATE_PROOF_NODES + 1,
                max: MAX_STATE_PROOF_NODES,
            })
        );

        let mut oversized_node = fixture(Some(&[1]), true, true, 0x42).witness;
        oversized_node.runtime_state_proof_nodes = vec![vec![1; MAX_STATE_PROOF_NODE_BYTES + 1]];
        assert_eq!(
            encode_bridge_validity_guest_witness_v2(&oversized_node),
            Err(CompositionError::FieldTooLarge {
                field: "state proof node",
                actual: MAX_STATE_PROOF_NODE_BYTES + 1,
                max: MAX_STATE_PROOF_NODE_BYTES,
            })
        );

        let mut oversized_proof = fixture(Some(&[1]), true, true, 0x42).witness;
        oversized_proof.runtime_state_proof_nodes = vec![
            vec![1; MAX_STATE_PROOF_NODE_BYTES],
            vec![2; MAX_STATE_PROOF_NODE_BYTES],
            vec![3; MAX_STATE_PROOF_NODE_BYTES],
            vec![4; MAX_STATE_PROOF_NODE_BYTES],
            vec![5],
        ];
        assert_eq!(
            encode_bridge_validity_guest_witness_v2(&oversized_proof),
            Err(CompositionError::FieldTooLarge {
                field: "state proof",
                actual: MAX_STATE_PROOF_BYTES + 1,
                max: MAX_STATE_PROOF_BYTES,
            })
        );
    }

    #[test]
    fn rejects_absent_commitment_profile_or_sticky_enforcement() {
        let missing_commitment = fixture(Some(&[1]), true, false, 0x42);
        let encoded = encode_bridge_validity_guest_witness_v2(&missing_commitment.witness).unwrap();
        assert_eq!(
            verify_bridge_validity_guest_witness_v2(&encoded),
            Err(ApplicationCompositionErrorV2::Composition(
                CompositionError::State(StateProofError::MissingCommitment)
            ))
        );

        let missing_profile = fixture(Some(&[1]), false, true, 0x42);
        let encoded = encode_bridge_validity_guest_witness_v2(&missing_profile.witness).unwrap();
        assert_eq!(
            verify_bridge_validity_guest_witness_v2(&encoded),
            Err(ApplicationCompositionErrorV2::CausalState(
                CausalProfileStateError::MissingProfile
            ))
        );

        let missing_enforcement = fixture(None, true, true, 0x42);
        let encoded =
            encode_bridge_validity_guest_witness_v2(&missing_enforcement.witness).unwrap();
        assert_eq!(
            verify_bridge_validity_guest_witness_v2(&encoded),
            Err(ApplicationCompositionErrorV2::CausalState(
                CausalProfileStateError::MissingEnforcement
            ))
        );

        for enforcement in [&[0][..], &[2][..], &[1, 0][..]] {
            let inactive = fixture(Some(enforcement), true, true, 0x42);
            let encoded = encode_bridge_validity_guest_witness_v2(&inactive.witness).unwrap();
            assert_eq!(
                verify_bridge_validity_guest_witness_v2(&encoded),
                Err(ApplicationCompositionErrorV2::CausalState(
                    CausalProfileStateError::InactiveEnforcement
                )),
                "enforcement bytes {enforcement:?}"
            );
        }
    }

    #[test]
    fn rejects_a_mixed_root_proof_even_after_resealing_the_private_request() {
        let mut first = fixture(Some(&[1]), true, true, 0x42);
        let second = fixture(Some(&[1]), true, true, 0x43);
        first.witness.runtime_state_proof_nodes = second.witness.runtime_state_proof_nodes;
        first.witness =
            seal_application_fixture_v2(first.witness, &first.context, &first.application);
        let encoded = encode_bridge_validity_guest_witness_v2(&first.witness).unwrap();
        assert_eq!(
            verify_bridge_validity_guest_witness_v2(&encoded),
            Err(ApplicationCompositionErrorV2::Composition(
                CompositionError::State(StateProofError::MissingRoot)
            ))
        );
    }

    #[test]
    fn rejects_each_coordinated_application_binding_substitution() {
        let cases = [
            ("source network ID", 0usize),
            ("bridge address", 1),
            ("token address", 2),
            ("settlement profile ID", 3),
            ("causal profile ID", 4),
            ("bridge runtime-code hash", 5),
            ("bridge runtime-code size", 6),
            ("token runtime-code hash", 7),
            ("token runtime-code size", 8),
        ];
        for (field, mutation) in cases {
            let mut fixture = fixture(Some(&[1]), true, true, 0x42);
            match mutation {
                0 => fixture.application.source_network_id[0] ^= 1,
                1 => fixture.application.bridge_address[0] ^= 1,
                2 => fixture.application.token_address[0] ^= 1,
                3 => fixture.application.settlement_profile_id[0] ^= 1,
                4 => fixture.application.causal_profile_id[0] ^= 1,
                5 => fixture.application.bridge_runtime_code_sha256[0] ^= 1,
                6 => fixture.application.bridge_runtime_code_bytes += 1,
                7 => fixture.application.token_runtime_code_sha256[0] ^= 1,
                8 => fixture.application.token_runtime_code_bytes += 1,
                _ => unreachable!(),
            }
            replace_application_statement_v2(
                &mut fixture.witness,
                &fixture.context,
                &fixture.application,
            );
            let encoded = encode_bridge_validity_guest_witness_v2(&fixture.witness).unwrap();
            assert_eq!(
                verify_bridge_validity_guest_witness_v2(&encoded),
                Err(ApplicationCompositionErrorV2::CausalState(
                    CausalProfileStateError::BindingMismatch(field)
                )),
                "application field {field}"
            );
        }
    }

    #[test]
    fn rejects_a_coordinated_sidechain_identity_substitution() {
        let mut fixture = fixture(Some(&[1]), true, true, 0x42);
        fixture.application.sidechain_id[0] ^= 1;
        fixture.context.checkpoint[4] ^= 1;
        fixture.witness.trust_anchor.sidechain_id = fixture.application.sidechain_id;
        fixture.witness =
            seal_application_fixture_v2(fixture.witness, &fixture.context, &fixture.application);
        let encoded = encode_bridge_validity_guest_witness_v2(&fixture.witness).unwrap();
        assert_eq!(
            verify_bridge_validity_guest_witness_v2(&encoded),
            Err(ApplicationCompositionErrorV2::Composition(
                CompositionError::State(StateProofError::CommitmentMismatch("sidechain ID"))
            ))
        );
    }

    #[test]
    fn rejects_unsealed_private_witness_divergence_before_consensus_work() {
        let mut fixture = fixture(Some(&[1]), true, true, 0x42);
        fixture.witness.runtime_state_proof_nodes[0][0] ^= 1;
        let encoded = encode_bridge_validity_guest_witness_v2(&fixture.witness).unwrap();
        assert_eq!(
            verify_bridge_validity_guest_witness_v2(&encoded),
            Err(ApplicationCompositionErrorV2::Composition(
                CompositionError::NativeRequestMismatch
            ))
        );
    }

    fn fixture(
        enforcement: Option<&[u8]>,
        include_profile: bool,
        include_commitment: bool,
        decoy: u8,
    ) -> ApplicationFixtureV2 {
        application_fixture_v2(
            enforcement,
            include_profile,
            include_commitment,
            decoy,
            [0xa3; 32],
            [0xa4; 32],
            [0xa5; 32],
        )
    }
}
