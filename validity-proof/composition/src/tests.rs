use super::*;

use crate::test_vectors::{fixture, hex_array, seal};
use alloc::vec;
use bridge_validity_finality_core::{
    FrontierDigest, FrontierDigestItem, FrontierHash, ScheduledChange,
};

#[test]
fn composes_the_exact_native_vector_into_the_public_statement() {
    let (witness, _, vector) = fixture();
    let canonical_request = encode_canonical_native_request(&witness).unwrap();
    assert_eq!(
        canonical_request,
        serde_json::to_vec(&vector.request).unwrap()
    );
    assert_eq!(
        blake2b256(&canonical_request),
        hex_array(&vector.expected.request_digest_hex)
    );
    assert_eq!(
        derive_trust_anchor_digest(
            &witness.trust_anchor,
            &witness.trust_anchor.authority_list_scale
        ),
        hex_array(&vector.trusted_anchor_digest_hex)
    );

    let encoded = encode_bridge_validity_guest_witness_v1(&witness).unwrap();
    assert_eq!(
        decode_bridge_validity_guest_witness_v1(&encoded).unwrap(),
        witness
    );
    assert_eq!(
        verify_bridge_validity_guest_witness_v1(&encoded).unwrap(),
        witness.statement
    );
}

#[test]
fn rejects_non_canonical_private_witness_bytes() {
    let (witness, _, _) = fixture();
    let mut encoded = encode_bridge_validity_guest_witness_v1(&witness).unwrap();
    encoded.push(0);
    assert_eq!(
        decode_bridge_validity_guest_witness_v1(&encoded),
        Err(CompositionError::WitnessEncoding("trailing bytes"))
    );

    let mut encoded = encode_bridge_validity_guest_witness_v1(&witness).unwrap();
    let reserved = BRIDGE_VALIDITY_GUEST_WITNESS_V1_DOMAIN.len() + 3;
    encoded[reserved] = 1;
    assert_eq!(
        decode_bridge_validity_guest_witness_v1(&encoded),
        Err(CompositionError::WitnessEncoding(
            "domain, version, flags, or reserved bytes"
        ))
    );

    let mut encoded = encode_bridge_validity_guest_witness_v1(&witness).unwrap();
    encoded.pop();
    assert_eq!(
        decode_bridge_validity_guest_witness_v1(&encoded),
        Err(CompositionError::WitnessEncoding("truncated field"))
    );
}

#[test]
fn rejects_a_typed_witness_that_differs_from_the_compatibility_payload() {
    let (mut witness, _, _) = fixture();
    witness.target_native_block_hash[0] ^= 1;
    let encoded = encode_bridge_validity_guest_witness_v1(&witness).unwrap();
    assert_eq!(
        verify_bridge_validity_guest_witness_v1(&encoded),
        Err(CompositionError::NativeRequestMismatch)
    );
}

#[test]
fn rejects_target_and_chain_bindings_after_resealing_the_private_request() {
    let (witness, context, _) = fixture();

    let mut wrong_target = witness.clone();
    wrong_target.target_native_block_hash[0] ^= 1;
    let wrong_target = seal(wrong_target, &context);
    let encoded = encode_bridge_validity_guest_witness_v1(&wrong_target).unwrap();
    assert_eq!(
        verify_bridge_validity_guest_witness_v1(&encoded),
        Err(CompositionError::Binding("target header hash"))
    );

    let mut absent_target = witness.clone();
    let mut absent_header = decode_header(&absent_target.target_header_scale).unwrap();
    absent_header.state_root.0[0] ^= 1;
    absent_target.target_native_block_hash = absent_header.hash().0;
    absent_target.target_header_scale = absent_header.encode();
    let absent_target = seal(absent_target, &context);
    let encoded = encode_bridge_validity_guest_witness_v1(&absent_target).unwrap();
    assert_eq!(
        verify_bridge_validity_guest_witness_v1(&encoded),
        Err(CompositionError::Binding(
            "target header is absent from authenticated chain"
        ))
    );

    let mut wrong_tail = witness;
    wrong_tail.checkpoint_tail_headers_scale[0] = wrong_tail.target_header_scale.clone();
    let wrong_tail = seal(wrong_tail, &context);
    let encoded = encode_bridge_validity_guest_witness_v1(&wrong_tail).unwrap();
    assert_eq!(
        verify_bridge_validity_guest_witness_v1(&encoded),
        Err(CompositionError::Binding("checkpoint-tail height"))
    );
}

#[test]
fn rejects_invalid_transition_finality_and_state_proofs_after_resealing() {
    let (witness, context, _) = fixture();

    let mut transition = witness.clone();
    transition.trust_anchor.authority_list_scale[1] ^= 1;
    let transition = seal(transition, &context);
    let encoded = encode_bridge_validity_guest_witness_v1(&transition).unwrap();
    let transition_result = verify_bridge_validity_guest_witness_v1(&encoded);
    assert!(
        matches!(
            transition_result,
            Err(CompositionError::AuthorityTransition { index: 0, .. })
        ),
        "unexpected transition result: {transition_result:?}"
    );

    let mut finality = witness.clone();
    finality.finality_proof_scale[100] ^= 1;
    let finality = seal(finality, &context);
    let encoded = encode_bridge_validity_guest_witness_v1(&finality).unwrap();
    let finality_result = verify_bridge_validity_guest_witness_v1(&encoded);
    assert!(
        matches!(finality_result, Err(CompositionError::Finality(_))),
        "unexpected finality result: {finality_result:?}"
    );

    let mut state = witness;
    state.runtime_state_proof_nodes[0][10] ^= 1;
    let state = seal(state, &context);
    let encoded = encode_bridge_validity_guest_witness_v1(&state).unwrap();
    let state_result = verify_bridge_validity_guest_witness_v1(&encoded);
    assert!(
        matches!(state_result, Err(CompositionError::State(_))),
        "unexpected state result: {state_result:?}"
    );
}

#[test]
fn rejects_each_checkpoint_identity_before_value_release_semantics() {
    let (witness, context, _) = fixture();
    let cases = [
        (4usize, "checkpoint sidechain ID"),
        (43, "checkpoint target height"),
        (44, "checkpoint target hash"),
        (151, "checkpoint authority set ID"),
        (152, "checkpoint authority set hash"),
        (184, "checkpoint finality proof hash"),
    ];

    for (offset, expected) in cases {
        let mut changed = context.clone();
        changed.checkpoint[offset] ^= 1;
        let changed = seal(witness.clone(), &changed);
        let encoded = encode_bridge_validity_guest_witness_v1(&changed).unwrap();
        assert_eq!(
            verify_bridge_validity_guest_witness_v1(&encoded),
            Err(CompositionError::Binding(expected)),
            "checkpoint offset {offset}"
        );
    }
}

#[test]
fn rejects_commitment_or_horizon_divergence() {
    let (witness, context, _) = fixture();

    for offset in [76usize, 108, 143] {
        let mut changed = context.clone();
        changed.checkpoint[offset] ^= 1;
        let changed = seal(witness.clone(), &changed);
        let encoded = encode_bridge_validity_guest_witness_v1(&changed).unwrap();
        assert!(
            matches!(
                verify_bridge_validity_guest_witness_v1(&encoded),
                Err(CompositionError::State(_))
            ),
            "checkpoint commitment field at offset {offset}"
        );
    }

    let mut horizon = context;
    horizon.finality_horizon_hash[0] ^= 1;
    let horizon = seal(witness, &horizon);
    let encoded = encode_bridge_validity_guest_witness_v1(&horizon).unwrap();
    assert_eq!(
        verify_bridge_validity_guest_witness_v1(&encoded),
        Err(CompositionError::Binding("finality horizon chain"))
    );
}

#[test]
fn rejects_a_finality_header_suffix_that_differs_from_the_authenticated_chain() {
    let (witness, _, _) = fixture();
    let proof = bridge_validity_finality_core::FinalityProof::<FrontierHeader>::decode_all(
        &mut witness.finality_proof_scale.as_slice(),
    )
    .unwrap();
    let target = decode_header(&witness.target_header_scale).unwrap();
    let mut authenticated: Vec<_> = witness
        .linked_grandpa_proofs
        .iter()
        .flat_map(|linked| linked.ancestry_headers_scale.iter())
        .map(|header| decode_header(header).unwrap())
        .collect();
    authenticated.extend(
        witness
            .checkpoint_tail_headers_scale
            .iter()
            .map(|header| decode_header(header).unwrap()),
    );
    let target_index = authenticated
        .iter()
        .position(|header| header.hash() == target.hash())
        .unwrap();
    let expected = authenticated[target_index + 1..].to_vec();
    assert_eq!(proof.unknown_headers, expected);
    validate_finality_header_suffix(&proof.unknown_headers, &expected).unwrap();

    let mut missing_horizon = expected;
    missing_horizon.pop();
    assert_eq!(
        validate_finality_header_suffix(&proof.unknown_headers, &missing_horizon),
        Err(CompositionError::Binding("finality proof header suffix"))
    );
}

#[test]
fn rejects_unmodelled_or_non_canonical_grandpa_logs() {
    let unsupported = [
        ConsensusLog::<u32>::OnDisabled(0),
        ConsensusLog::<u32>::Pause(0),
        ConsensusLog::<u32>::Resume(0),
    ];
    for log in unsupported {
        let header = header_with_grandpa_payloads(vec![log.encode()]);
        assert_eq!(
            validate_grandpa_logs(&header, GrandpaLogScope::TransitionAncestry),
            Err(CompositionError::GrandpaLog(
                "unsupported authority-disable, pause, or resume operation"
            ))
        );
    }

    let mut malformed = ConsensusLog::<u32>::OnDisabled(0).encode();
    malformed.push(0);
    let header = header_with_grandpa_payloads(vec![malformed]);
    assert_eq!(
        validate_grandpa_logs(&header, GrandpaLogScope::TransitionAncestry),
        Err(CompositionError::GrandpaLog("non-canonical consensus log"))
    );

    let (witness, _, _) = fixture();
    let next_authorities = decode_authority_list(&witness.trust_anchor.authority_list_scale)
        .expect("fixture authority list must decode");
    let scheduled = ConsensusLog::ScheduledChange(ScheduledChange {
        next_authorities: next_authorities.clone(),
        delay: 0,
    })
    .encode();
    let duplicate = header_with_grandpa_payloads(vec![scheduled.clone(), scheduled]);
    assert_eq!(
        validate_grandpa_logs(&duplicate, GrandpaLogScope::TransitionAncestry),
        Err(CompositionError::GrandpaLog(
            "multiple authority changes in one header"
        ))
    );

    let forced = header_with_grandpa_payloads(vec![ConsensusLog::ForcedChange(
        0,
        ScheduledChange {
            next_authorities: next_authorities.clone(),
            delay: 0,
        },
    )
    .encode()]);
    assert_eq!(
        validate_grandpa_logs(&forced, GrandpaLogScope::TransitionAncestry),
        Err(CompositionError::GrandpaLog("forced authority change"))
    );

    let delayed =
        header_with_grandpa_payloads(vec![ConsensusLog::ScheduledChange(ScheduledChange {
            next_authorities,
            delay: 1,
        })
        .encode()]);
    assert_eq!(
        validate_grandpa_logs(
            &delayed,
            GrandpaLogScope::CheckpointTail {
                finality_horizon_height: 1,
            },
        ),
        Err(CompositionError::GrandpaLog(
            "unsupported delayed or post-horizon authority change"
        ))
    );

    let at_horizon =
        header_with_grandpa_payloads(vec![ConsensusLog::ScheduledChange(ScheduledChange {
            next_authorities: decode_authority_list(&witness.trust_anchor.authority_list_scale)
                .unwrap(),
            delay: 0,
        })
        .encode()]);
    validate_grandpa_logs(
        &at_horizon,
        GrandpaLogScope::CheckpointTail {
            finality_horizon_height: 1,
        },
    )
    .unwrap();
}

fn header_with_grandpa_payloads(payloads: Vec<Vec<u8>>) -> FrontierHeader {
    FrontierHeader::new(
        1,
        FrontierHash([0x31; 32]),
        FrontierHash([0x32; 32]),
        FrontierHash([0x30; 32]),
        FrontierDigest {
            logs: payloads
                .into_iter()
                .map(|payload| FrontierDigestItem::Consensus(GRANDPA_ENGINE_ID, payload))
                .collect(),
        },
    )
}

#[test]
fn rejects_a_canonical_request_larger_than_the_compatibility_profile_before_writing_json() {
    let (mut witness, _, _) = fixture();
    let ancestry = witness.linked_grandpa_proofs[0]
        .ancestry_headers_scale
        .clone();
    witness.linked_grandpa_proofs = (0..2)
        .map(|_| LinkedGrandpaProofV1 {
            ancestry_headers_scale: ancestry.clone(),
            proof_scale: vec![0; MAX_AUTHORITY_TRANSITION_PROOF_BYTES],
        })
        .collect();

    assert!(matches!(
        encode_canonical_native_request(&witness),
        Err(CompositionError::FieldTooLarge {
            field: "canonical native request",
            actual,
            max: MAX_NATIVE_VERIFIER_REQUEST_BYTES,
        }) if actual > MAX_NATIVE_VERIFIER_REQUEST_BYTES
    ));
}

#[test]
fn enforces_private_abi_limits_at_the_exact_boundary() {
    validate_witness_size(MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V1_BYTES).unwrap();
    assert_eq!(
        validate_witness_size(MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V1_BYTES + 1),
        Err(CompositionError::WitnessTooLarge {
            actual: MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V1_BYTES + 1,
            max: MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V1_BYTES,
        })
    );

    let max_count = (MAX_LINKED_GRANDPA_PROOFS as u32).to_be_bytes();
    assert_eq!(
        Reader::new(&max_count)
            .count(MAX_LINKED_GRANDPA_PROOFS, "linked GRANDPA proofs")
            .unwrap(),
        MAX_LINKED_GRANDPA_PROOFS
    );
    let oversized_count = ((MAX_LINKED_GRANDPA_PROOFS + 1) as u32).to_be_bytes();
    assert_eq!(
        Reader::new(&oversized_count).count(MAX_LINKED_GRANDPA_PROOFS, "linked GRANDPA proofs"),
        Err(CompositionError::TooManyItems {
            field: "linked GRANDPA proofs",
            actual: MAX_LINKED_GRANDPA_PROOFS + 1,
            max: MAX_LINKED_GRANDPA_PROOFS,
        })
    );

    let max_blob = (MAX_HEADER_BYTES as u32).to_be_bytes();
    assert_eq!(
        Reader::new(&max_blob).blob(MAX_HEADER_BYTES, "header", false),
        Err(CompositionError::WitnessEncoding("truncated field"))
    );
    let oversized_blob = ((MAX_HEADER_BYTES + 1) as u32).to_be_bytes();
    assert_eq!(
        Reader::new(&oversized_blob).blob(MAX_HEADER_BYTES, "header", false),
        Err(CompositionError::FieldTooLarge {
            field: "header",
            actual: MAX_HEADER_BYTES + 1,
            max: MAX_HEADER_BYTES,
        })
    );

    assert_eq!(
        checked_total_headers(MAX_TOTAL_ANCESTRY_HEADERS, 0).unwrap(),
        MAX_TOTAL_ANCESTRY_HEADERS
    );
    assert!(matches!(
        checked_total_headers(MAX_TOTAL_ANCESTRY_HEADERS, 1),
        Err(CompositionError::TooManyItems {
            field: "total ancestry headers",
            actual,
            max: MAX_TOTAL_ANCESTRY_HEADERS,
        }) if actual == MAX_TOTAL_ANCESTRY_HEADERS + 1
    ));
    assert_eq!(
        checked_state_proof_bytes(MAX_STATE_PROOF_BYTES, 0).unwrap(),
        MAX_STATE_PROOF_BYTES
    );
    assert_eq!(
        checked_state_proof_bytes(MAX_STATE_PROOF_BYTES, 1),
        Err(CompositionError::FieldTooLarge {
            field: "state proof",
            actual: MAX_STATE_PROOF_BYTES + 1,
            max: MAX_STATE_PROOF_BYTES,
        })
    );
}
