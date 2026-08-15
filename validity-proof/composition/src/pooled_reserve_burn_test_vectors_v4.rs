//! Deterministic synthetic fixture for pooled-reserve burn V4 composition.
//!
//! This module is test material only. Its caller-selected identities and state carry no source,
//! verifier-profile, consumer, activation, or funds authority.

use alloc::{vec, vec::Vec};

use bridge_validity_finality_core::{
    AuthorityList, FinalityProof, FrontierDigest, FrontierGrandpaBlock, FrontierHash,
    FrontierHeader, GrandpaMessage, PrimitiveGrandpaJustification,
};
use bridge_validity_state_proof::{
    BRIDGE_ADDRESS_STORAGE_KEY, BRIDGE_COMMITMENT_STORAGE_KEY,
    POOLED_RESERVE_ENFORCEMENT_STORAGE_KEY_V4, POOLED_RESERVE_RUNTIME_PROFILE_STORAGE_KEY_V4,
    RUNTIME_CODE_STORAGE_KEY,
};
use bridge_validity_statement::{
    derive_pooled_reserve_mint_reservation_profile_v4_id,
    encode_eip0045_pooled_reserve_burn_statement_v4, encode_pooled_reserve_burn_public_inputs_v4,
    encode_pooled_reserve_mint_reservation_runtime_profile_v4,
    PooledReserveBurnApplicationBindingV4, PooledReserveMintReservationRuntimeProfileV4,
    EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES,
};
use finality_grandpa::{Commit, Message, Precommit, SignedPrecommit};
use scale_codec::Encode;
use sp_core::{ed25519, hashing::sha2_256, Blake2Hasher as OracleHasher, Pair, H256};
use sp_state_machine::{prove_read_on_trie_backend, TrieBackendBuilder};
use sp_trie::{LayoutV1, MemoryDB as OracleMemoryDb, TrieDBMutBuilder, TrieMut};

use crate::{
    derive_trust_anchor_digest, domain_hash, GrandpaTrustAnchorV1, PooledReserveBurnGuestWitnessV4,
    CHECKPOINT_BYTES, CHECKPOINT_DOMAIN, GRANDPA_AUTHORITY_SET_DOMAIN,
    GRANDPA_JUSTIFICATION_DOMAIN,
};

const ROUND: u64 = 17;
const SET_ID: u64 = 9;

/// One isolated authenticated-state mutation for V4 negative composition tests.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum PooledReserveBurnStateMutationV4 {
    /// Exact positive state.
    None,
    /// Current bridge commitment absent.
    MissingCommitment,
    /// Current V4 profile absent.
    MissingProfile,
    /// Sticky V4 enforcement absent.
    MissingEnforcement,
    /// Sticky V4 enforcement is canonical false.
    InactiveEnforcement,
    /// Commitment-producing bridge address absent.
    MissingBridgeAddress,
    /// Native runtime code absent.
    MissingRuntimeCode,
    /// Stored V4 profile differs from the public statement.
    ChangedProfile,
    /// Independent commitment-producing address differs from the profile.
    ChangedBridgeAddress,
    /// Authenticated runtime bytes differ at unchanged length.
    ChangedRuntimeCode,
    /// Stored commitment differs from the checkpoint.
    ChangedCommitment,
}

/// Typed deterministic V4 fixture with its exact state root and public application binding.
pub(crate) struct PooledReserveBurnFixtureV4 {
    pub(crate) witness: PooledReserveBurnGuestWitnessV4,
    pub(crate) state_root: [u8; 32],
    pub(crate) application: PooledReserveBurnApplicationBindingV4,
}

/// Exact encoded private witness and public statement for host/guest conformance tests.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativePooledReserveBurnValidityFixtureV4 {
    /// Canonical private V4 guest witness bytes.
    pub encoded_witness: Vec<u8>,
    /// Exact V4 statement expected in the receipt journal.
    pub statement: [u8; EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES],
}

/// Build one non-authorizing V4 fixture for exact outer identities.
pub fn native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v4(
    profile_id: [u8; 32],
    guest_program_id: [u8; 32],
    contract_id: [u8; 32],
) -> NativePooledReserveBurnValidityFixtureV4 {
    let fixture = pooled_reserve_burn_fixture_v4(
        PooledReserveBurnStateMutationV4::None,
        0x42,
        profile_id,
        guest_program_id,
        contract_id,
    );
    NativePooledReserveBurnValidityFixtureV4 {
        encoded_witness: crate::encode_pooled_reserve_burn_guest_witness_v4(&fixture.witness)
            .expect("deterministic V4 witness must encode"),
        statement: fixture.witness.statement,
    }
}

pub(crate) fn pooled_reserve_burn_fixture_v4(
    mutation: PooledReserveBurnStateMutationV4,
    decoy: u8,
    profile_id: [u8; 32],
    guest_program_id: [u8; 32],
    contract_id: [u8; 32],
) -> PooledReserveBurnFixtureV4 {
    let runtime_code = vec![0x61; 4_096];
    let runtime_profile = PooledReserveMintReservationRuntimeProfileV4 {
        lineage_id: [0x10; 32],
        source_network_id: [0x11; 32],
        sidechain_id: [0x22; 32],
        bridge_address: [0x33; 20],
        token_address: [0x44; 20],
        bridge_runtime_code_sha256: [0x55; 32],
        bridge_runtime_code_bytes: 4_104,
        token_runtime_code_sha256: [0x66; 32],
        token_runtime_code_bytes: 2_356,
        settlement_profile_id: [0x77; 32],
        ergo_finality_policy_id: [0x88; 32],
        source_proof_system_id: [0x99; 32],
        source_proof_profile_id: [0xab; 32],
        activation_height: 42,
        max_pending_blocks: 256,
    };
    let runtime_profile_id =
        derive_pooled_reserve_mint_reservation_profile_v4_id(&runtime_profile).unwrap();
    let application = PooledReserveBurnApplicationBindingV4 {
        runtime_profile,
        runtime_profile_id,
        source_runtime_code_sha256: sha2_256(&runtime_code),
        source_runtime_code_bytes: u32::try_from(runtime_code.len()).unwrap(),
        tracker_nft_id: [0xa1; 32],
        settlement_tracker_contract_id: contract_id,
        preactivation_state: 0,
        authorization_flags: 0,
        reserved: [0, 0],
    };

    let mut commitment = Vec::with_capacity(109);
    commitment.push(1);
    commitment.extend_from_slice(&application.runtime_profile.sidechain_id);
    commitment.extend_from_slice(&42u64.to_le_bytes());
    commitment.extend_from_slice(&[0x66; 32]);
    commitment.extend_from_slice(&[0x77; 32]);
    commitment.extend_from_slice(&3u32.to_le_bytes());
    let mut stored_commitment = commitment.clone();
    if mutation == PooledReserveBurnStateMutationV4::ChangedCommitment {
        stored_commitment[73] ^= 1;
    }

    let mut stored_profile = application.runtime_profile.clone();
    if mutation == PooledReserveBurnStateMutationV4::ChangedProfile {
        stored_profile.max_pending_blocks += 1;
    }
    let stored_profile =
        encode_pooled_reserve_mint_reservation_runtime_profile_v4(&stored_profile).unwrap();
    let mut stored_bridge_address = application.runtime_profile.bridge_address;
    if mutation == PooledReserveBurnStateMutationV4::ChangedBridgeAddress {
        stored_bridge_address[0] ^= 1;
    }
    let changed_runtime_code = vec![0x62; runtime_code.len()];
    let stored_runtime_code = if mutation == PooledReserveBurnStateMutationV4::ChangedRuntimeCode {
        changed_runtime_code.as_slice()
    } else {
        runtime_code.as_slice()
    };
    let enforcement = if mutation == PooledReserveBurnStateMutationV4::InactiveEnforcement {
        Some(&[0][..])
    } else if mutation == PooledReserveBurnStateMutationV4::MissingEnforcement {
        None
    } else {
        Some(&[1][..])
    };

    let (state_root, runtime_state_proof_nodes) = state_proof(
        (mutation != PooledReserveBurnStateMutationV4::MissingCommitment)
            .then_some(stored_commitment.as_slice()),
        (mutation != PooledReserveBurnStateMutationV4::MissingProfile)
            .then_some(stored_profile.as_slice()),
        enforcement,
        (mutation != PooledReserveBurnStateMutationV4::MissingBridgeAddress)
            .then_some(stored_bridge_address.as_slice()),
        (mutation != PooledReserveBurnStateMutationV4::MissingRuntimeCode)
            .then_some(stored_runtime_code),
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
    checkpoint[4..36].copy_from_slice(&application.runtime_profile.sidechain_id);
    checkpoint[36..44].copy_from_slice(&42u64.to_be_bytes());
    checkpoint[44..76].copy_from_slice(&target_hash.0);
    checkpoint[76..108].copy_from_slice(&commitment[41..73]);
    checkpoint[108..140].copy_from_slice(&commitment[73..105]);
    checkpoint[140..144].copy_from_slice(&3u32.to_be_bytes());
    checkpoint[144..152].copy_from_slice(&SET_ID.to_be_bytes());
    checkpoint[152..184].copy_from_slice(&domain_hash(
        GRANDPA_AUTHORITY_SET_DOMAIN,
        &authorities.encode(),
    ));
    checkpoint[184..216]
        .copy_from_slice(&domain_hash(GRANDPA_JUSTIFICATION_DOMAIN, &justification));

    let trust_anchor = GrandpaTrustAnchorV1 {
        sidechain_id: application.runtime_profile.sidechain_id,
        checkpoint_hash: trust_anchor_header.hash().0,
        checkpoint_number: 41,
        grandpa_set_id: SET_ID,
        authority_list_scale: authorities.encode(),
    };
    let trusted_anchor_digest =
        derive_trust_anchor_digest(&trust_anchor, &trust_anchor.authority_list_scale);
    let checkpoint_commitment = domain_hash(CHECKPOINT_DOMAIN, &checkpoint);
    let public_inputs = encode_pooled_reserve_burn_public_inputs_v4(
        &application,
        &checkpoint,
        state_root,
        trusted_anchor_digest,
        42,
        target_hash.0,
    )
    .unwrap();
    let encoded_checkpoint_commitment: [u8; 32] = public_inputs[778..810].try_into().unwrap();
    debug_assert_eq!(checkpoint_commitment, encoded_checkpoint_commitment);
    let statement = encode_eip0045_pooled_reserve_burn_statement_v4(
        application.runtime_profile.source_network_id,
        profile_id,
        guest_program_id,
        contract_id,
        &public_inputs,
    )
    .unwrap();
    let witness = PooledReserveBurnGuestWitnessV4 {
        statement,
        trust_anchor,
        target_native_block_hash: target_hash.0,
        target_header_scale: target_header.encode(),
        linked_grandpa_proofs: Vec::new(),
        checkpoint_tail_headers_scale: vec![target_header.encode()],
        finality_proof_scale,
        runtime_state_proof_nodes,
    };
    PooledReserveBurnFixtureV4 {
        witness,
        state_root,
        application,
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
        let mut trie = TrieDBMutBuilder::<LayoutV1<OracleHasher>>::new(&mut db, &mut root).build();
        trie.insert(&[0x10; 32], &[decoy; 48]).unwrap();
        if let Some(value) = commitment {
            trie.insert(&BRIDGE_COMMITMENT_STORAGE_KEY, value).unwrap();
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
        BRIDGE_COMMITMENT_STORAGE_KEY.to_vec(),
        POOLED_RESERVE_RUNTIME_PROFILE_STORAGE_KEY_V4.to_vec(),
        POOLED_RESERVE_ENFORCEMENT_STORAGE_KEY_V4.to_vec(),
        BRIDGE_ADDRESS_STORAGE_KEY.to_vec(),
        RUNTIME_CODE_STORAGE_KEY.to_vec(),
    ];
    let proof = prove_read_on_trie_backend(&backend, keys.iter().map(Vec::as_slice)).unwrap();
    (root.into(), proof.into_iter_nodes().collect())
}
