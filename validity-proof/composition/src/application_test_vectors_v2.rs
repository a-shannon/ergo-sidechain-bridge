//! Deterministic synthetic fixture for application-bound validity composition.
//!
//! The fixture proves one GRANDPA-linked target whose state trie contains the exact bridge
//! commitment, active causal application profile, and sticky enforcement key. It is engineering
//! test material only and carries no source-chain, verifier-profile, or settlement authority.

use alloc::vec::Vec;

use bridge_validity_finality_core::{
    AuthorityList, FinalityProof, FrontierDigest, FrontierGrandpaBlock, FrontierHash,
    FrontierHeader, GrandpaMessage, PrimitiveGrandpaJustification,
};
use bridge_validity_state_proof::{
    BRIDGE_COMMITMENT_STORAGE_KEY, CAUSAL_APPLICATION_PROFILE_V2_SCALE_BYTES,
    CAUSAL_ENFORCEMENT_STORAGE_KEY_V2, CURRENT_CAUSAL_PROFILE_STORAGE_KEY_V2,
};
use bridge_validity_statement::{
    encode_bridge_validity_application_payload_v3, encode_eip0045_bridge_application_statement_v2,
    BridgeCausalApplicationBindingV2, BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN,
    EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES,
};
use finality_grandpa::{Commit, Message, Precommit, SignedPrecommit};
use scale_codec::Encode;
use sp_core::{ed25519, Blake2Hasher as OracleHasher, Pair, H256};
use sp_state_machine::{prove_read_on_trie_backend, TrieBackendBuilder};
use sp_trie::{LayoutV1, MemoryDB as OracleMemoryDb, TrieDBMutBuilder, TrieMut};

use crate::{
    application_composition_v2::encode_canonical_native_request_v2, blake2b256,
    derive_trust_anchor_digest, domain_hash, encode_bridge_validity_guest_witness_v2,
    BridgeValidityGuestWitnessV2, GrandpaTrustAnchorV1, CHECKPOINT_BYTES, CHECKPOINT_DOMAIN,
    GRANDPA_AUTHORITY_SET_DOMAIN, GRANDPA_JUSTIFICATION_DOMAIN,
};

const ROUND: u64 = 17;
const SET_ID: u64 = 9;
const COMPATIBILITY_STATEMENT_DOMAIN: &[u8] = b"E2S_BRIDGE_FINALITY_STATEMENT_V1";
const COMPATIBILITY_PROGRAM_DOMAIN: &[u8] = b"E2S_GRANDPA_STATE_AND_FINALITY_PROGRAM_V1";
const NATIVE_PAYLOAD_DOMAIN: &[u8] = b"E2S_NATIVE_GRANDPA_PROOF_PAYLOAD_V1";
const AGGREGATE_PROOF_DOMAIN: &[u8] = b"E2S_AGGREGATE_FINALITY_PROOF_V1";
const CAUSAL_PROFILE_DOMAIN: &[u8] = b"E2S_PEG_IN_CAUSAL_PROFILE_V2";
const LEGACY_BRIDGE_EVENT_ROOT: [u8; 32] = [0x77; 32];
const LEGACY_EXECUTION_BLOCK_HASH: [u8; 32] = [0x66; 32];
const LEGACY_BURN_COUNT: u32 = 1;
const MAX_BURN_COUNT: u32 = 256;

/// Invalid caller-selected bridge commitment for a synthetic application fixture.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeBridgeApplicationFixtureErrorV2 {
    /// The application statement only admits burn counts in the inclusive range `1..=256`.
    InvalidBurnCount(u32),
}

/// Exact private witness and public statement for one synthetic V2 conformance run.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeBridgeApplicationValidityFixtureV2 {
    /// Canonical private V2 guest witness bytes.
    pub encoded_witness: Vec<u8>,
    /// Exact application-bound statement expected in the receipt journal.
    pub statement: [u8; EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES],
}

/// Build the deterministic shared-root V2 fixture for exact outer identities.
///
/// Supplying identities does not authenticate or activate them. The host and Ergo consumer must
/// independently pin the profile, guest image, and executing proposition.
pub fn native_bridge_application_validity_fixture_for_profile_and_contract_v2(
    profile_id: [u8; 32],
    guest_program_id: [u8; 32],
    contract_id: [u8; 32],
) -> NativeBridgeApplicationValidityFixtureV2 {
    encode_native_application_fixture(application_fixture_v2(
        Some(&[1]),
        true,
        true,
        0x42,
        profile_id,
        guest_program_id,
        contract_id,
    ))
}

/// Build a synthetic V2 fixture with one caller-selected bridge runtime-code hash.
///
/// This test-vector-only helper rebuilds the authenticated runtime state, finality proof,
/// application payload, and public statement. It exists to isolate application-profile rejection;
/// it does not make a caller-selected runtime identity authoritative.
pub fn native_bridge_application_validity_fixture_for_profile_contract_and_bridge_runtime_hash_v2(
    profile_id: [u8; 32],
    guest_program_id: [u8; 32],
    contract_id: [u8; 32],
    bridge_runtime_code_sha256: [u8; 32],
) -> NativeBridgeApplicationValidityFixtureV2 {
    encode_native_application_fixture(
        application_fixture_for_bridge_runtime_hash_and_commitment_v2(
            Some(&[1]),
            true,
            true,
            0x42,
            profile_id,
            guest_program_id,
            contract_id,
            bridge_runtime_code_sha256,
            LEGACY_BRIDGE_EVENT_ROOT,
            LEGACY_EXECUTION_BLOCK_HASH,
            LEGACY_BURN_COUNT,
        ),
    )
}

/// Build a synthetic V2 fixture for one explicit bridge-event commitment.
///
/// This is a separate settlement-candidate path. It does not reinterpret or mutate the frozen
/// WP-06AD fixture, and the caller-selected root and count carry no authority outside the proof
/// and consumer checks that bind them.
pub fn native_bridge_application_validity_fixture_for_profile_contract_and_bridge_commitment_v2(
    profile_id: [u8; 32],
    guest_program_id: [u8; 32],
    contract_id: [u8; 32],
    bridge_event_root: [u8; 32],
    execution_block_hash: [u8; 32],
    burn_count: u32,
) -> Result<NativeBridgeApplicationValidityFixtureV2, NativeBridgeApplicationFixtureErrorV2> {
    validate_burn_count(burn_count)?;
    Ok(encode_native_application_fixture(
        application_fixture_for_bridge_runtime_hash_and_commitment_v2(
            Some(&[1]),
            true,
            true,
            0x42,
            profile_id,
            guest_program_id,
            contract_id,
            [0xbb; 32],
            bridge_event_root,
            execution_block_hash,
            burn_count,
        ),
    ))
}

fn encode_native_application_fixture(
    fixture: ApplicationFixtureV2,
) -> NativeBridgeApplicationValidityFixtureV2 {
    let ApplicationFixtureV2 {
        witness,
        context,
        application,
    } = fixture;
    let _ = (context, application);
    let encoded_witness = encode_bridge_validity_guest_witness_v2(&witness)
        .expect("deterministic application fixture must encode");
    NativeBridgeApplicationValidityFixtureV2 {
        encoded_witness,
        statement: witness.statement,
    }
}

#[derive(Clone)]
pub(crate) struct ApplicationFixtureContextV2 {
    pub(crate) checkpoint: [u8; CHECKPOINT_BYTES],
    finality_horizon_height: u64,
    finality_horizon_hash: [u8; 32],
    tracker_nft_id: [u8; 32],
    verifier_profile_id: [u8; 32],
    pub(crate) profile_id: [u8; 32],
    pub(crate) guest_program_id: [u8; 32],
    pub(crate) contract_id: [u8; 32],
}

pub(crate) struct ApplicationFixtureV2 {
    pub(crate) witness: BridgeValidityGuestWitnessV2,
    pub(crate) context: ApplicationFixtureContextV2,
    pub(crate) application: BridgeCausalApplicationBindingV2,
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn application_fixture_v2(
    enforcement: Option<&[u8]>,
    include_profile: bool,
    include_commitment: bool,
    decoy: u8,
    profile_id: [u8; 32],
    guest_program_id: [u8; 32],
    contract_id: [u8; 32],
) -> ApplicationFixtureV2 {
    application_fixture_for_bridge_runtime_hash_v2(
        enforcement,
        include_profile,
        include_commitment,
        decoy,
        profile_id,
        guest_program_id,
        contract_id,
        [0xbb; 32],
    )
}

#[allow(clippy::too_many_arguments)]
fn application_fixture_for_bridge_runtime_hash_v2(
    enforcement: Option<&[u8]>,
    include_profile: bool,
    include_commitment: bool,
    decoy: u8,
    profile_id: [u8; 32],
    guest_program_id: [u8; 32],
    contract_id: [u8; 32],
    bridge_runtime_code_sha256: [u8; 32],
) -> ApplicationFixtureV2 {
    application_fixture_for_bridge_runtime_hash_and_commitment_v2(
        enforcement,
        include_profile,
        include_commitment,
        decoy,
        profile_id,
        guest_program_id,
        contract_id,
        bridge_runtime_code_sha256,
        LEGACY_BRIDGE_EVENT_ROOT,
        LEGACY_EXECUTION_BLOCK_HASH,
        LEGACY_BURN_COUNT,
    )
}

#[allow(clippy::too_many_arguments)]
fn application_fixture_for_bridge_runtime_hash_and_commitment_v2(
    enforcement: Option<&[u8]>,
    include_profile: bool,
    include_commitment: bool,
    decoy: u8,
    profile_id: [u8; 32],
    guest_program_id: [u8; 32],
    contract_id: [u8; 32],
    bridge_runtime_code_sha256: [u8; 32],
    bridge_event_root: [u8; 32],
    execution_block_hash: [u8; 32],
    burn_count: u32,
) -> ApplicationFixtureV2 {
    debug_assert!(validate_burn_count(burn_count).is_ok());
    let (profile_value, application) =
        causal_profile_for_bridge_runtime_hash(bridge_runtime_code_sha256);
    let commitment_value = commitment_value(execution_block_hash, bridge_event_root, burn_count);
    let (state_root, runtime_state_proof_nodes) = state_proof(
        include_commitment.then_some(commitment_value.as_slice()),
        include_profile.then_some(profile_value.as_slice()),
        enforcement,
        decoy,
    );

    let pairs = (1u8..=3)
        .map(|seed| ed25519::Pair::from_seed(&[seed; 32]))
        .collect::<Vec<_>>();
    let authorities: AuthorityList = pairs
        .iter()
        .map(|pair| (pair.public().into(), 1u64))
        .collect();
    let trust_anchor_header = FrontierHeader::new(
        41,
        FrontierHash([0x97; 32]),
        FrontierHash([0x96; 32]),
        FrontierHash([0x95; 32]),
        FrontierDigest::default(),
    );
    let target_header = FrontierHeader::new(
        42,
        FrontierHash([0x99; 32]),
        FrontierHash(state_root),
        trust_anchor_header.hash(),
        FrontierDigest::default(),
    );
    let target_hash = target_header.hash();
    let precommit = Precommit {
        target_hash,
        target_number: target_header.number,
    };
    let message: GrandpaMessage<FrontierGrandpaBlock> = Message::Precommit(precommit.clone());
    let signing_payload = (message, ROUND, SET_ID).encode();
    let signed_precommits = pairs
        .iter()
        .map(|pair| SignedPrecommit {
            precommit: precommit.clone(),
            signature: pair.sign(&signing_payload).into(),
            id: pair.public().into(),
        })
        .collect();
    let justification = PrimitiveGrandpaJustification::<FrontierHeader> {
        round: ROUND,
        commit: Commit {
            target_hash,
            target_number: target_header.number,
            precommits: signed_precommits,
        },
        votes_ancestries: Vec::new(),
    }
    .encode();
    let finality_proof_scale = FinalityProof::<FrontierHeader> {
        block: target_hash,
        justification: justification.clone(),
        unknown_headers: Vec::new(),
    }
    .encode();

    let mut checkpoint = [0u8; CHECKPOINT_BYTES];
    checkpoint[..4].copy_from_slice(&[1, 1, 1, 0]);
    checkpoint[4..36].copy_from_slice(&application.sidechain_id);
    checkpoint[36..44].copy_from_slice(&42u64.to_be_bytes());
    checkpoint[44..76].copy_from_slice(&target_hash.0);
    checkpoint[76..108].copy_from_slice(&execution_block_hash);
    checkpoint[108..140].copy_from_slice(&bridge_event_root);
    checkpoint[140..144].copy_from_slice(&burn_count.to_be_bytes());
    checkpoint[144..152].copy_from_slice(&SET_ID.to_be_bytes());
    checkpoint[152..184].copy_from_slice(&domain_hash(
        GRANDPA_AUTHORITY_SET_DOMAIN,
        &authorities.encode(),
    ));
    checkpoint[184..216]
        .copy_from_slice(&domain_hash(GRANDPA_JUSTIFICATION_DOMAIN, &justification));

    let context = ApplicationFixtureContextV2 {
        checkpoint,
        finality_horizon_height: 42,
        finality_horizon_hash: target_hash.0,
        tracker_nft_id: [0xa1; 32],
        verifier_profile_id: [0xa2; 32],
        profile_id,
        guest_program_id,
        contract_id,
    };
    let witness = BridgeValidityGuestWitnessV2 {
        statement: [0; EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES],
        compatibility_proof: Vec::new(),
        trust_anchor: GrandpaTrustAnchorV1 {
            sidechain_id: application.sidechain_id,
            checkpoint_hash: trust_anchor_header.hash().0,
            checkpoint_number: 41,
            grandpa_set_id: SET_ID,
            authority_list_scale: authorities.encode(),
        },
        target_native_block_hash: target_hash.0,
        target_header_scale: target_header.encode(),
        linked_grandpa_proofs: Vec::new(),
        checkpoint_tail_headers_scale: vec![target_header.encode()],
        finality_proof_scale,
        runtime_state_proof_nodes,
    };

    ApplicationFixtureV2 {
        witness: seal_application_fixture_v2(witness, &context, &application),
        context,
        application,
    }
}

pub(crate) fn seal_application_fixture_v2(
    mut witness: BridgeValidityGuestWitnessV2,
    context: &ApplicationFixtureContextV2,
    application: &BridgeCausalApplicationBindingV2,
) -> BridgeValidityGuestWitnessV2 {
    let native_request = encode_canonical_native_request_v2(&witness)
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

    let aggregate_proof_digest = domain_hash(AGGREGATE_PROOF_DOMAIN, &compatibility_proof);
    let mut finality_payload = Vec::with_capacity(654);
    finality_payload.extend_from_slice(BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_DOMAIN);
    finality_payload.push(0);
    finality_payload.extend_from_slice(&[2, 1, 1, 0]);
    finality_payload.extend_from_slice(&context.tracker_nft_id);
    finality_payload.extend_from_slice(&context.checkpoint);
    finality_payload.extend_from_slice(&checkpoint_commitment);
    finality_payload.extend_from_slice(&statement_digest);
    finality_payload.extend_from_slice(&semantic_program_id);
    finality_payload.extend_from_slice(&context.verifier_profile_id);
    finality_payload.extend_from_slice(&native_payload_digest);
    finality_payload.extend_from_slice(&aggregate_proof_digest);
    finality_payload.extend_from_slice(&blake2b256(&native_request));
    finality_payload.extend_from_slice(&trusted_anchor_digest);
    finality_payload.extend_from_slice(&context.finality_horizon_height.to_be_bytes());
    finality_payload.extend_from_slice(&context.finality_horizon_hash);
    finality_payload.extend_from_slice(&[0x04, 0x01]);
    finality_payload.extend_from_slice(&context.checkpoint[108..140]);
    finality_payload.extend_from_slice(&checkpoint_commitment);
    assert_eq!(finality_payload.len(), 654);

    let application_payload =
        encode_bridge_validity_application_payload_v3(&finality_payload, application)
            .expect("fixture application payload must encode");
    witness.compatibility_proof = compatibility_proof;
    witness.statement = encode_eip0045_bridge_application_statement_v2(
        application.source_network_id,
        context.profile_id,
        context.guest_program_id,
        context.contract_id,
        &application_payload,
    )
    .expect("fixture application statement must encode");
    witness
}

#[cfg(test)]
pub(crate) fn replace_application_statement_v2(
    witness: &mut BridgeValidityGuestWitnessV2,
    context: &ApplicationFixtureContextV2,
    application: &BridgeCausalApplicationBindingV2,
) {
    let current = bridge_validity_statement::decode_eip0045_bridge_application_statement_v2(
        &witness.statement,
    )
    .expect("fixture application statement must decode");
    let payload = encode_bridge_validity_application_payload_v3(
        &current.application_payload.finality.encoded,
        application,
    )
    .expect("replacement application payload must encode");
    witness.statement = encode_eip0045_bridge_application_statement_v2(
        application.source_network_id,
        context.profile_id,
        context.guest_program_id,
        context.contract_id,
        &payload,
    )
    .expect("replacement application statement must encode");
}

fn causal_profile_for_bridge_runtime_hash(
    bridge_runtime_code_sha256: [u8; 32],
) -> (Vec<u8>, BridgeCausalApplicationBindingV2) {
    let mut profile = Vec::with_capacity(313);
    profile.push(2);
    profile.extend_from_slice(&[0x11; 32]);
    profile.extend_from_slice(&[0x22; 32]);
    profile.extend_from_slice(&[0x33; 20]);
    profile.extend_from_slice(&[0x44; 20]);
    profile.extend_from_slice(&[0x55; 32]);
    profile.extend_from_slice(&[0x56; 32]);
    profile.extend_from_slice(&[0x57; 32]);
    profile.extend_from_slice(&[0x58; 32]);
    profile.extend_from_slice(&[0x59; 32]);
    profile.extend_from_slice(&[0x5a; 32]);
    profile.extend_from_slice(&7u64.to_be_bytes());
    profile.extend_from_slice(&1_024u64.to_be_bytes());
    assert_eq!(profile.len(), 313);
    let causal_profile_id = domain_hash(CAUSAL_PROFILE_DOMAIN, &profile);

    let mut value = Vec::with_capacity(CAUSAL_APPLICATION_PROFILE_V2_SCALE_BYTES);
    value.extend_from_slice(&[0xe5, 0x04]);
    value.extend_from_slice(&profile);
    value.extend_from_slice(&causal_profile_id);
    value.extend_from_slice(&bridge_runtime_code_sha256);
    value.extend_from_slice(&4_096u32.to_le_bytes());
    value.extend_from_slice(&[0xcc; 32]);
    value.extend_from_slice(&2_048u32.to_le_bytes());
    assert_eq!(value.len(), CAUSAL_APPLICATION_PROFILE_V2_SCALE_BYTES);

    (
        value,
        BridgeCausalApplicationBindingV2 {
            source_network_id: [0x11; 32],
            sidechain_id: [0x22; 32],
            bridge_address: [0x33; 20],
            token_address: [0x44; 20],
            settlement_profile_id: [0x55; 32],
            causal_profile_id,
            bridge_runtime_code_sha256,
            bridge_runtime_code_bytes: 4_096,
            token_runtime_code_sha256: [0xcc; 32],
            token_runtime_code_bytes: 2_048,
        },
    )
}

fn validate_burn_count(burn_count: u32) -> Result<(), NativeBridgeApplicationFixtureErrorV2> {
    if burn_count == 0 || burn_count > MAX_BURN_COUNT {
        return Err(NativeBridgeApplicationFixtureErrorV2::InvalidBurnCount(
            burn_count,
        ));
    }
    Ok(())
}

fn commitment_value(
    execution_block_hash: [u8; 32],
    bridge_event_root: [u8; 32],
    burn_count: u32,
) -> Vec<u8> {
    let mut value = Vec::with_capacity(109);
    value.push(1);
    value.extend_from_slice(&[0x22; 32]);
    value.extend_from_slice(&42u64.to_le_bytes());
    value.extend_from_slice(&execution_block_hash);
    value.extend_from_slice(&bridge_event_root);
    value.extend_from_slice(&burn_count.to_le_bytes());
    assert_eq!(value.len(), 109);
    value
}

fn state_proof(
    commitment: Option<&[u8]>,
    profile: Option<&[u8]>,
    enforcement: Option<&[u8]>,
    decoy: u8,
) -> ([u8; 32], Vec<Vec<u8>>) {
    let mut db = OracleMemoryDb::<OracleHasher>::default();
    let mut root = H256::default();
    {
        let mut trie = TrieDBMutBuilder::<LayoutV1<OracleHasher>>::new(&mut db, &mut root).build();
        trie.insert(&[0x10; 32], &[decoy; 48])
            .expect("synthetic decoy must insert");
        if let Some(value) = commitment {
            trie.insert(&BRIDGE_COMMITMENT_STORAGE_KEY, value)
                .expect("synthetic commitment must insert");
        }
        if let Some(value) = profile {
            trie.insert(&CURRENT_CAUSAL_PROFILE_STORAGE_KEY_V2, value)
                .expect("synthetic causal profile must insert");
        }
        if let Some(value) = enforcement {
            trie.insert(&CAUSAL_ENFORCEMENT_STORAGE_KEY_V2, value)
                .expect("synthetic enforcement must insert");
        }
    }
    let backend = TrieBackendBuilder::new(db, root).build();
    let proof = prove_read_on_trie_backend(
        &backend,
        [
            BRIDGE_COMMITMENT_STORAGE_KEY,
            CURRENT_CAUSAL_PROFILE_STORAGE_KEY_V2,
            CAUSAL_ENFORCEMENT_STORAGE_KEY_V2,
        ],
    )
    .expect("synthetic shared state proof must build");
    (root.into(), proof.into_iter_nodes().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::application_composition_v2::verify_bridge_validity_guest_witness_v2;
    use bridge_validity_statement::decode_eip0045_bridge_application_statement_v2;

    const PROFILE_ID: [u8; 32] = [0xa3; 32];
    const PROGRAM_ID: [u8; 32] = [0xa4; 32];
    const CONTRACT_ID: [u8; 32] = [0xa5; 32];
    const FRONTIER_BRIDGE_EVENT_ROOT: [u8; 32] = [
        0xd5, 0xf2, 0x6f, 0x1d, 0xdc, 0x31, 0x9a, 0x96, 0x9c, 0x8c, 0x3a, 0xea, 0x47, 0xfe, 0xdd,
        0x7d, 0x8e, 0x61, 0x5c, 0x07, 0x46, 0xfd, 0xae, 0x84, 0xac, 0x99, 0x84, 0x20, 0x2a, 0xef,
        0xe3, 0xb7,
    ];
    const FRONTIER_EXECUTION_BLOCK_HASH: [u8; 32] = [0x22; 32];

    #[test]
    fn preserves_the_frozen_wp06ad_fixture_bytes() {
        let fixture = native_bridge_application_validity_fixture_for_profile_and_contract_v2(
            PROFILE_ID,
            PROGRAM_ID,
            CONTRACT_ID,
        );

        assert_eq!(
            hex::encode(blake2b256(&fixture.statement)),
            "f7fd76ce549d7a53ba732df58cb908ac3deec79ea45e816d1a0365bba6f53acd"
        );
        assert_eq!(
            hex::encode(blake2b256(&fixture.encoded_witness)),
            "0c445b45293bb14ed2a58d8e4696610a00847fae6382893f180bcc09ad115935"
        );
    }

    #[test]
    fn binds_the_frontier_root_and_count_in_checkpoint_and_commitment_value() {
        let fixture =
            native_bridge_application_validity_fixture_for_profile_contract_and_bridge_commitment_v2(
                PROFILE_ID,
                PROGRAM_ID,
                CONTRACT_ID,
                FRONTIER_BRIDGE_EVENT_ROOT,
                FRONTIER_EXECUTION_BLOCK_HASH,
                3,
            )
            .unwrap();
        assert_eq!(
            verify_bridge_validity_guest_witness_v2(&fixture.encoded_witness).unwrap(),
            fixture.statement
        );
        let decoded = decode_eip0045_bridge_application_statement_v2(&fixture.statement).unwrap();
        assert_eq!(
            decoded.application_payload.finality.tracker_nft_id,
            [0xa1; 32]
        );
        let checkpoint = decoded.application_payload.finality.checkpoint;
        assert_eq!(checkpoint[76..108], FRONTIER_EXECUTION_BLOCK_HASH);
        assert_eq!(checkpoint[108..140], FRONTIER_BRIDGE_EVENT_ROOT);
        assert_eq!(
            u32::from_be_bytes(checkpoint[140..144].try_into().unwrap()),
            3
        );

        let commitment =
            commitment_value(FRONTIER_EXECUTION_BLOCK_HASH, FRONTIER_BRIDGE_EVENT_ROOT, 3);
        assert_eq!(commitment[41..73], FRONTIER_EXECUTION_BLOCK_HASH);
        assert_eq!(commitment[73..105], FRONTIER_BRIDGE_EVENT_ROOT);
        assert_eq!(
            u32::from_le_bytes(commitment[105..109].try_into().unwrap()),
            3
        );
    }

    #[test]
    fn commitment_mutations_change_the_application_statement() {
        let canonical =
            native_bridge_application_validity_fixture_for_profile_contract_and_bridge_commitment_v2(
                PROFILE_ID,
                PROGRAM_ID,
                CONTRACT_ID,
                FRONTIER_BRIDGE_EVENT_ROOT,
                FRONTIER_EXECUTION_BLOCK_HASH,
                3,
            )
            .unwrap();
        let mut changed_root = FRONTIER_BRIDGE_EVENT_ROOT;
        changed_root[0] ^= 1;
        let root_mutation =
            native_bridge_application_validity_fixture_for_profile_contract_and_bridge_commitment_v2(
                PROFILE_ID,
                PROGRAM_ID,
                CONTRACT_ID,
                changed_root,
                FRONTIER_EXECUTION_BLOCK_HASH,
                3,
            )
            .unwrap();
        let count_mutation =
            native_bridge_application_validity_fixture_for_profile_contract_and_bridge_commitment_v2(
                PROFILE_ID,
                PROGRAM_ID,
                CONTRACT_ID,
                FRONTIER_BRIDGE_EVENT_ROOT,
                FRONTIER_EXECUTION_BLOCK_HASH,
                4,
            )
            .unwrap();
        let mut changed_execution_block = FRONTIER_EXECUTION_BLOCK_HASH;
        changed_execution_block[0] ^= 1;
        let execution_block_mutation =
            native_bridge_application_validity_fixture_for_profile_contract_and_bridge_commitment_v2(
                PROFILE_ID,
                PROGRAM_ID,
                CONTRACT_ID,
                FRONTIER_BRIDGE_EVENT_ROOT,
                changed_execution_block,
                3,
            )
            .unwrap();

        assert_ne!(root_mutation.statement, canonical.statement);
        assert_ne!(count_mutation.statement, canonical.statement);
        assert_ne!(execution_block_mutation.statement, canonical.statement);
    }

    #[test]
    fn rejects_burn_counts_outside_the_statement_bounds() {
        for invalid in [0, MAX_BURN_COUNT + 1, u32::MAX] {
            assert_eq!(
                native_bridge_application_validity_fixture_for_profile_contract_and_bridge_commitment_v2(
                    PROFILE_ID,
                    PROGRAM_ID,
                    CONTRACT_ID,
                    FRONTIER_BRIDGE_EVENT_ROOT,
                    FRONTIER_EXECUTION_BLOCK_HASH,
                    invalid,
                ),
                Err(NativeBridgeApplicationFixtureErrorV2::InvalidBurnCount(
                    invalid
                ))
            );
        }
    }
}
