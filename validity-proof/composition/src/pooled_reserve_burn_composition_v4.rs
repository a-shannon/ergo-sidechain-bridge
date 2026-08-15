//! Pooled-reserve burn V4 composition over the frozen GRANDPA compatibility semantics.
//!
//! V4 has a distinct private witness ABI and directly verifies its typed finality inputs. It does
//! not reinterpret the V2 compatibility envelope, activate a verifier profile, or authorize an
//! Ergo settlement consumer.

use super::*;

use bridge_validity_state_proof::{
    verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v4,
    BridgePooledReserveRuntimeStateErrorV4, PooledReserveRuntimeStateErrorV4,
    MAX_POOLED_RESERVE_STATE_PROOF_BYTES_V4, MAX_POOLED_RESERVE_STATE_PROOF_NODES_V4,
    MAX_POOLED_RESERVE_STATE_PROOF_NODE_BYTES_V4,
};
use bridge_validity_statement::{
    decode_eip0045_pooled_reserve_burn_statement_v4, EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES,
};
use thiserror::Error;

/// Domain prefix for the private pooled-reserve burn guest witness ABI.
pub const POOLED_RESERVE_BURN_GUEST_WITNESS_V4_DOMAIN: &[u8] =
    b"E2S_POOLED_RESERVE_BURN_GUEST_WITNESS_V4";
/// Maximum encoded private witness accepted by the pooled-reserve burn guest ABI.
pub const MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V4_BYTES: usize = 32 * 1024 * 1024;

const WITNESS_VERSION_V4: u8 = 4;
const _: [(); 40] = [(); POOLED_RESERVE_BURN_GUEST_WITNESS_V4_DOMAIN.len()];

/// Complete private witness for pooled-reserve burn V4 finality and source-state verification.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PooledReserveBurnGuestWitnessV4 {
    /// Exact 1,139-byte V4 statement exposed as the public journal.
    pub statement: [u8; EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES],
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
    /// One raw proof-node set covering commitment, profile, enforcement, producer, and `:code`.
    pub runtime_state_proof_nodes: Vec<Vec<u8>>,
}

/// A V4 composition rejection preserving finality versus runtime-state ownership.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum PooledReserveBurnCompositionErrorV4 {
    /// Statement, witness, GRANDPA, checkpoint, commitment, or root composition failed.
    #[error("pooled-reserve burn finality composition failed: {0}")]
    Composition(#[from] CompositionError),
    /// The active profile, sticky marker, producer address, or native runtime code failed.
    #[error("pooled-reserve burn runtime-state verification failed: {0}")]
    RuntimeState(#[from] PooledReserveRuntimeStateErrorV4),
}

/// Encode one typed V4 witness into its canonical private ABI.
pub fn encode_pooled_reserve_burn_guest_witness_v4(
    witness: &PooledReserveBurnGuestWitnessV4,
) -> Result<Vec<u8>, CompositionError> {
    let mut encoded = Vec::new();
    encoded.extend_from_slice(POOLED_RESERVE_BURN_GUEST_WITNESS_V4_DOMAIN);
    encoded.push(0);
    encoded.push(WITNESS_VERSION_V4);
    encoded.push(WITNESS_FLAGS_NONE);
    encoded.extend_from_slice(&[0, 0]);
    encoded.extend_from_slice(&witness.statement);
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
    validate_v4_witness_size(encoded.len())?;
    decode_pooled_reserve_burn_guest_witness_v4(&encoded)?;
    Ok(encoded)
}

/// Strictly decode one canonical V4 private witness and reject trailing bytes.
pub fn decode_pooled_reserve_burn_guest_witness_v4(
    encoded: &[u8],
) -> Result<PooledReserveBurnGuestWitnessV4, CompositionError> {
    validate_v4_witness_size(encoded.len())?;
    let mut reader = Reader::new(encoded);
    if reader.take(POOLED_RESERVE_BURN_GUEST_WITNESS_V4_DOMAIN.len())?
        != POOLED_RESERVE_BURN_GUEST_WITNESS_V4_DOMAIN
        || reader.byte()? != 0
        || reader.byte()? != WITNESS_VERSION_V4
        || reader.byte()? != WITNESS_FLAGS_NONE
        || reader.take(2)? != [0, 0]
    {
        return Err(CompositionError::WitnessEncoding(
            "domain, version, flags, or reserved bytes",
        ));
    }
    let statement = reader.array::<EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES>()?;
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
    let node_count = reader.count(MAX_POOLED_RESERVE_STATE_PROOF_NODES_V4, "state proof nodes")?;
    if node_count == 0 {
        return Err(CompositionError::WitnessEncoding(
            "state proof must contain at least one node",
        ));
    }
    let mut runtime_state_proof_nodes = Vec::with_capacity(node_count);
    let mut state_proof_bytes = 0usize;
    for _ in 0..node_count {
        let node = reader.blob(
            MAX_POOLED_RESERVE_STATE_PROOF_NODE_BYTES_V4,
            "state proof node",
            false,
        )?;
        state_proof_bytes = checked_v4_state_proof_bytes(state_proof_bytes, node.len())?;
        runtime_state_proof_nodes.push(node);
    }
    if !reader.is_empty() {
        return Err(CompositionError::WitnessEncoding("trailing bytes"));
    }
    Ok(PooledReserveBurnGuestWitnessV4 {
        statement,
        trust_anchor,
        target_native_block_hash,
        target_header_scale,
        linked_grandpa_proofs,
        checkpoint_tail_headers_scale,
        finality_proof_scale,
        runtime_state_proof_nodes,
    })
}

/// Verify the complete V4 witness and return exactly its public statement bytes.
pub fn verify_pooled_reserve_burn_guest_witness_v4(
    encoded_witness: &[u8],
) -> Result<[u8; EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES], PooledReserveBurnCompositionErrorV4>
{
    let witness = decode_pooled_reserve_burn_guest_witness_v4(encoded_witness)?;
    let statement = decode_eip0045_pooled_reserve_burn_statement_v4(&witness.statement)
        .map_err(CompositionError::from)?;
    let public = &statement.public_inputs;
    let verified = verify_finality_composition_fields_v4(
        FinalityPayloadViewV4 {
            checkpoint: &public.checkpoint,
            checkpoint_commitment: &public.checkpoint_commitment,
            target_native_state_root: &public.target_native_state_root,
            trusted_anchor_digest: &public.trusted_anchor_digest,
            finality_horizon_height: public.finality_horizon_height,
            finality_horizon_hash: &public.finality_horizon_hash,
        },
        FinalityWitnessViewV4 {
            trust_anchor: &witness.trust_anchor,
            target_native_block_hash: &witness.target_native_block_hash,
            target_header_scale: &witness.target_header_scale,
            linked_grandpa_proofs: &witness.linked_grandpa_proofs,
            checkpoint_tail_headers_scale: &witness.checkpoint_tail_headers_scale,
            finality_proof_scale: &witness.finality_proof_scale,
        },
    )?;
    verify_bridge_commitment_and_active_pooled_reserve_runtime_state_v4(
        verified.target_state_root,
        &witness.runtime_state_proof_nodes,
        &verified.expected_commitment,
        &public.application_binding,
    )
    .map_err(|source| match source {
        BridgePooledReserveRuntimeStateErrorV4::Commitment(source) => {
            PooledReserveBurnCompositionErrorV4::Composition(CompositionError::State(source))
        }
        BridgePooledReserveRuntimeStateErrorV4::Runtime(source) => {
            PooledReserveBurnCompositionErrorV4::RuntimeState(source)
        }
        BridgePooledReserveRuntimeStateErrorV4::Binding(field) => {
            PooledReserveBurnCompositionErrorV4::Composition(CompositionError::Binding(field))
        }
    })?;
    Ok(statement.encoded)
}

fn validate_v4_witness_size(actual: usize) -> Result<(), CompositionError> {
    if actual > MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V4_BYTES {
        return Err(CompositionError::WitnessTooLarge {
            actual,
            max: MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V4_BYTES,
        });
    }
    Ok(())
}

fn checked_v4_state_proof_bytes(current: usize, added: usize) -> Result<usize, CompositionError> {
    let total = current
        .checked_add(added)
        .ok_or(CompositionError::WitnessEncoding(
            "state proof byte count overflow",
        ))?;
    if total > MAX_POOLED_RESERVE_STATE_PROOF_BYTES_V4 {
        return Err(CompositionError::FieldTooLarge {
            field: "state proof",
            actual: total,
            max: MAX_POOLED_RESERVE_STATE_PROOF_BYTES_V4,
        });
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::pooled_reserve_burn_test_vectors_v4::{
        pooled_reserve_burn_fixture_v4, PooledReserveBurnStateMutationV4,
    };
    use bridge_validity_state_proof::{PooledReserveRuntimeStateErrorV4, StateProofError};

    const PROFILE_ID: [u8; 32] = [0xa3; 32];
    const PROGRAM_ID: [u8; 32] = [0xa4; 32];
    const CONTRACT_ID: [u8; 32] = [0xa5; 32];

    #[test]
    fn composes_one_finalized_root_into_the_exact_v4_statement() {
        let fixture = pooled_reserve_burn_fixture_v4(
            PooledReserveBurnStateMutationV4::None,
            0x42,
            PROFILE_ID,
            PROGRAM_ID,
            CONTRACT_ID,
        );
        let encoded = encode_pooled_reserve_burn_guest_witness_v4(&fixture.witness).unwrap();
        assert_eq!(
            decode_pooled_reserve_burn_guest_witness_v4(&encoded).unwrap(),
            fixture.witness
        );
        assert_eq!(
            verify_pooled_reserve_burn_guest_witness_v4(&encoded).unwrap(),
            fixture.witness.statement
        );
        let statement =
            decode_eip0045_pooled_reserve_burn_statement_v4(&fixture.witness.statement).unwrap();
        assert_eq!(
            statement.public_inputs.target_native_state_root,
            fixture.state_root
        );
        assert_eq!(
            statement.public_inputs.application_binding,
            fixture.application
        );
    }

    #[test]
    fn rejects_v1_v2_downgrades_and_noncanonical_private_bytes() {
        let fixture = pooled_reserve_burn_fixture_v4(
            PooledReserveBurnStateMutationV4::None,
            0x42,
            PROFILE_ID,
            PROGRAM_ID,
            CONTRACT_ID,
        );
        let encoded = encode_pooled_reserve_burn_guest_witness_v4(&fixture.witness).unwrap();
        let mut wrong_version = encoded.clone();
        wrong_version[POOLED_RESERVE_BURN_GUEST_WITNESS_V4_DOMAIN.len() + 1] = 2;
        assert_eq!(
            decode_pooled_reserve_burn_guest_witness_v4(&wrong_version),
            Err(CompositionError::WitnessEncoding(
                "domain, version, flags, or reserved bytes"
            ))
        );
        let mut trailing = encoded;
        trailing.push(0);
        assert_eq!(
            decode_pooled_reserve_burn_guest_witness_v4(&trailing),
            Err(CompositionError::WitnessEncoding("trailing bytes"))
        );

        #[cfg(feature = "application-v2")]
        {
            let v2 = crate::application_test_vectors_v2::application_fixture_v2(
                Some(&[1]),
                true,
                true,
                0x42,
                [0xb1; 32],
                [0xb2; 32],
                [0xb3; 32],
            );
            let v2 = encode_bridge_validity_guest_witness_v2(&v2.witness).unwrap();
            assert_eq!(
                decode_pooled_reserve_burn_guest_witness_v4(&v2),
                Err(CompositionError::WitnessEncoding(
                    "domain, version, flags, or reserved bytes"
                ))
            );
            assert_eq!(
                decode_bridge_validity_guest_witness_v2(&trailing),
                Err(CompositionError::WitnessEncoding(
                    "domain, version, flags, or reserved bytes"
                ))
            );
        }

        let (v1, _, _) = crate::test_vectors::fixture();
        let v1 = encode_bridge_validity_guest_witness_v1(&v1).unwrap();
        assert_eq!(
            decode_pooled_reserve_burn_guest_witness_v4(&v1),
            Err(CompositionError::WitnessEncoding(
                "domain, version, flags, or reserved bytes"
            ))
        );
    }

    #[test]
    fn rejects_missing_or_substituted_profile_enforcement_producer_code_and_commitment() {
        let cases = [
            (
                PooledReserveBurnStateMutationV4::MissingCommitment,
                PooledReserveBurnCompositionErrorV4::Composition(CompositionError::State(
                    StateProofError::MissingCommitment,
                )),
            ),
            (
                PooledReserveBurnStateMutationV4::MissingProfile,
                PooledReserveBurnCompositionErrorV4::RuntimeState(
                    PooledReserveRuntimeStateErrorV4::MissingProfile,
                ),
            ),
            (
                PooledReserveBurnStateMutationV4::MissingEnforcement,
                PooledReserveBurnCompositionErrorV4::RuntimeState(
                    PooledReserveRuntimeStateErrorV4::MissingEnforcement,
                ),
            ),
            (
                PooledReserveBurnStateMutationV4::InactiveEnforcement,
                PooledReserveBurnCompositionErrorV4::RuntimeState(
                    PooledReserveRuntimeStateErrorV4::InactiveEnforcement,
                ),
            ),
            (
                PooledReserveBurnStateMutationV4::MissingBridgeAddress,
                PooledReserveBurnCompositionErrorV4::RuntimeState(
                    PooledReserveRuntimeStateErrorV4::MissingBridgeAddress,
                ),
            ),
            (
                PooledReserveBurnStateMutationV4::MissingRuntimeCode,
                PooledReserveBurnCompositionErrorV4::RuntimeState(
                    PooledReserveRuntimeStateErrorV4::MissingRuntimeCode,
                ),
            ),
            (
                PooledReserveBurnStateMutationV4::ChangedProfile,
                PooledReserveBurnCompositionErrorV4::RuntimeState(
                    PooledReserveRuntimeStateErrorV4::ProfileMismatch,
                ),
            ),
            (
                PooledReserveBurnStateMutationV4::ChangedBridgeAddress,
                PooledReserveBurnCompositionErrorV4::RuntimeState(
                    PooledReserveRuntimeStateErrorV4::BridgeAddressMismatch,
                ),
            ),
            (
                PooledReserveBurnStateMutationV4::ChangedRuntimeCode,
                PooledReserveBurnCompositionErrorV4::RuntimeState(
                    PooledReserveRuntimeStateErrorV4::RuntimeCodeDigestMismatch,
                ),
            ),
            (
                PooledReserveBurnStateMutationV4::ChangedCommitment,
                PooledReserveBurnCompositionErrorV4::Composition(CompositionError::State(
                    StateProofError::CommitmentMismatch("bridge event root"),
                )),
            ),
        ];
        for (mutation, expected) in cases {
            let fixture =
                pooled_reserve_burn_fixture_v4(mutation, 0x42, PROFILE_ID, PROGRAM_ID, CONTRACT_ID);
            let encoded = encode_pooled_reserve_burn_guest_witness_v4(&fixture.witness).unwrap();
            assert_eq!(
                verify_pooled_reserve_burn_guest_witness_v4(&encoded),
                Err(expected),
                "mutation {mutation:?}"
            );
        }
    }

    #[test]
    fn rejects_public_target_root_substitution_before_state_interpretation() {
        let mut fixture = pooled_reserve_burn_fixture_v4(
            PooledReserveBurnStateMutationV4::None,
            0x42,
            PROFILE_ID,
            PROGRAM_ID,
            CONTRACT_ID,
        );
        let statement =
            decode_eip0045_pooled_reserve_burn_statement_v4(&fixture.witness.statement).unwrap();
        let public = bridge_validity_statement::encode_pooled_reserve_burn_public_inputs_v4(
            &statement.public_inputs.application_binding,
            &statement.public_inputs.checkpoint,
            [0xee; 32],
            statement.public_inputs.trusted_anchor_digest,
            statement.public_inputs.finality_horizon_height,
            statement.public_inputs.finality_horizon_hash,
        )
        .unwrap();
        fixture.witness.statement =
            bridge_validity_statement::encode_eip0045_pooled_reserve_burn_statement_v4(
                statement.chain_domain_id,
                statement.profile_id,
                statement.program_id,
                statement.contract_id,
                &public,
            )
            .unwrap();
        let encoded = encode_pooled_reserve_burn_guest_witness_v4(&fixture.witness).unwrap();
        assert_eq!(
            verify_pooled_reserve_burn_guest_witness_v4(&encoded),
            Err(PooledReserveBurnCompositionErrorV4::Composition(
                CompositionError::Binding("target native state root")
            ))
        );
    }

    #[test]
    fn enforces_distinct_v4_witness_and_state_proof_limits() {
        validate_v4_witness_size(MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V4_BYTES).unwrap();
        assert_eq!(
            validate_v4_witness_size(MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V4_BYTES + 1),
            Err(CompositionError::WitnessTooLarge {
                actual: MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V4_BYTES + 1,
                max: MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V4_BYTES,
            })
        );
        assert_eq!(
            checked_v4_state_proof_bytes(MAX_POOLED_RESERVE_STATE_PROOF_BYTES_V4, 1,),
            Err(CompositionError::FieldTooLarge {
                field: "state proof",
                actual: MAX_POOLED_RESERVE_STATE_PROOF_BYTES_V4 + 1,
                max: MAX_POOLED_RESERVE_STATE_PROOF_BYTES_V4,
            })
        );
    }
}
