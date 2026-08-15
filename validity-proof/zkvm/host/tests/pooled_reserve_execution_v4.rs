#![cfg(feature = "local-prove")]

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

use blake2::{digest::consts::U32, Blake2b, Digest};
use bridge_validity_composition::test_vectors::native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v4;
use bridge_validity_statement::decode_eip0045_pooled_reserve_burn_statement_v4;
use bridge_validity_zkvm_host::{
    method_program_id_v4, prove_and_verify_pooled_reserve_burn_witness_v4,
    verify_pooled_reserve_burn_profile_receipt_v4, HostError, PooledReserveBurnHostErrorV4,
    EIP0045_RISC0_V3_PROOF_CHUNK_BYTES, EIP0045_RISC0_V3_RAW_SEAL_BYTES,
    EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
};
use bridge_validity_zkvm_methods::{BRIDGE_VALIDITY_GUEST_V4_ELF, BRIDGE_VALIDITY_GUEST_V4_ID};
use risc0_zkvm::{default_executor, ExecutorEnv, InnerReceipt};

type Blake2b256 = Blake2b<U32>;
const SYNTHETIC_CONSUMER_ID: [u8; 32] = [0xd8; 32];
const POOLED_RESERVE_BURN_V4_CONSUMER_ID_HEX: &str =
    "bfba2ed2dabca6a843b3acf996029cb3ed5578eda512043cb5e1a7217624e594";
const STANDALONE_POOLED_RESERVE_BURN_V4_CONSUMER_ID_HEX: &str =
    "dff42d1bb808fc30e87011c493b5eef0bb257acc9c35940b112b14bf455e92cd";
const POOLED_RESERVE_BURN_V4_EXPORT_DIR_ENV: &str =
    "BRIDGE_EIP0045_POOLED_RESERVE_BURN_V4_EXPORT_DIR";
const POOLED_RESERVE_BURN_V4_MANIFEST: &str = "pooled-reserve-burn-candidate-manifest-v4.txt";

#[test]
fn executes_the_corrected_v4_program_under_the_reusable_profile() {
    let fixture = native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v4(
        EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
        method_program_id_v4(),
        SYNTHETIC_CONSUMER_ID,
    );
    let witness_len = u32::try_from(fixture.encoded_witness.len())
        .expect("fixture length must fit the guest ABI");
    let env = ExecutorEnv::builder()
        .write_slice(&[witness_len])
        .write_slice(&fixture.encoded_witness)
        .build()
        .expect("executor input must build");
    let session = default_executor()
        .execute(env, BRIDGE_VALIDITY_GUEST_V4_ELF)
        .expect("corrected pooled-reserve V4 guest must execute");

    assert_eq!(session.journal.bytes, fixture.statement);
    let statement = decode_eip0045_pooled_reserve_burn_statement_v4(&session.journal.bytes)
        .expect("V4 journal must decode canonically");
    assert_eq!(statement.program_id, method_program_id_v4());
    assert_eq!(statement.profile_id, EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID);
    assert_eq!(statement.contract_id, SYNTHETIC_CONSUMER_ID);
    assert!(session.cycles() > 0);
    assert!(session.segments.len() > 1);
}

#[test]
fn binds_the_receipt_candidate_to_the_integrated_tracker_identity() {
    let consumer_contract_id = pooled_reserve_burn_v4_consumer_id();
    assert_eq!(
        hex::encode(consumer_contract_id),
        POOLED_RESERVE_BURN_V4_CONSUMER_ID_HEX
    );
    assert_ne!(
        POOLED_RESERVE_BURN_V4_CONSUMER_ID_HEX,
        STANDALONE_POOLED_RESERVE_BURN_V4_CONSUMER_ID_HEX
    );

    let fixture = native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v4(
        EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
        method_program_id_v4(),
        consumer_contract_id,
    );
    let statement = decode_eip0045_pooled_reserve_burn_statement_v4(&fixture.statement)
        .expect("integrated tracker statement must decode canonically");
    assert_eq!(statement.contract_id, consumer_contract_id);
}

#[test]
#[ignore = "generates a real local RISC Zero succinct V4 receipt"]
fn proves_and_rejects_mutated_pooled_reserve_burn_v4_receipt_bindings() {
    let consumer_contract_id = pooled_reserve_burn_v4_consumer_id();
    let fixture = native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v4(
        EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
        method_program_id_v4(),
        consumer_contract_id,
    );
    let run = prove_and_verify_pooled_reserve_burn_witness_v4(
        &fixture.encoded_witness,
        &fixture.statement,
        consumer_contract_id,
    )
    .unwrap();

    assert_eq!(run.receipt.journal.bytes, fixture.statement);
    assert_eq!(
        run.proof_chunks.each_ref().map(Vec::len),
        EIP0045_RISC0_V3_PROOF_CHUNK_BYTES
    );
    assert_eq!(
        run.proof_chunks.concat().len(),
        EIP0045_RISC0_V3_RAW_SEAL_BYTES
    );
    let InnerReceipt::Succinct(succinct) = &run.receipt.inner else {
        panic!("pooled-reserve burn V4 candidate must be a succinct receipt");
    };
    assert_eq!(run.proof_chunks.concat(), succinct.get_seal_bytes());
    let terminal_control_id: [u8; 32] = succinct
        .control_id
        .as_bytes()
        .try_into()
        .expect("terminal control ID must be 32 bytes");
    assert!(run.stats.total_cycles > 0);

    let mut wrong_id = BRIDGE_VALIDITY_GUEST_V4_ID;
    wrong_id[0] ^= 1;
    assert!(run.receipt.verify(wrong_id).is_err());

    let mut wrong_expected = fixture.statement;
    wrong_expected[0] ^= 1;
    assert!(matches!(
        verify_pooled_reserve_burn_profile_receipt_v4(
            &run.receipt,
            &wrong_expected,
            consumer_contract_id,
        ),
        Err(PooledReserveBurnHostErrorV4::Host(
            HostError::JournalMismatch
        ))
    ));

    let mut wrong_contract_id = consumer_contract_id;
    wrong_contract_id[0] ^= 1;
    assert!(matches!(
        verify_pooled_reserve_burn_profile_receipt_v4(
            &run.receipt,
            &fixture.statement,
            wrong_contract_id,
        ),
        Err(PooledReserveBurnHostErrorV4::ContractId)
    ));

    let mut coordinated_receipt = run.receipt.clone();
    coordinated_receipt.journal.bytes[0] ^= 1;
    let mut coordinated_expected = fixture.statement;
    coordinated_expected[0] ^= 1;
    assert!(verify_pooled_reserve_burn_profile_receipt_v4(
        &coordinated_receipt,
        &coordinated_expected,
        consumer_contract_id,
    )
    .is_err());

    let mut altered_receipt = run.receipt.clone();
    altered_receipt.journal.bytes[0] ^= 1;
    assert!(verify_pooled_reserve_burn_profile_receipt_v4(
        &altered_receipt,
        &fixture.statement,
        consumer_contract_id,
    )
    .is_err());

    let mut altered_seal = run.receipt.clone();
    {
        let InnerReceipt::Succinct(succinct) = &mut altered_seal.inner else {
            panic!("pooled-reserve burn V4 candidate must be a succinct receipt");
        };
        succinct.seal[1_000] ^= 1;
    }
    assert!(verify_pooled_reserve_burn_profile_receipt_v4(
        &altered_seal,
        &fixture.statement,
        consumer_contract_id,
    )
    .is_err());

    export_pooled_reserve_burn_v4_candidate_if_requested(
        &run.proof_chunks,
        &fixture.statement,
        &terminal_control_id,
        consumer_contract_id,
    );
}

fn pooled_reserve_burn_v4_consumer_id() -> [u8; 32] {
    hex::decode(POOLED_RESERVE_BURN_V4_CONSUMER_ID_HEX)
        .expect("frozen pooled-reserve burn V4 consumer ID must decode")
        .try_into()
        .expect("frozen pooled-reserve burn V4 consumer ID must contain exactly 32 bytes")
}

fn export_pooled_reserve_burn_v4_candidate_if_requested(
    proof_chunks: &[Vec<u8>; 4],
    statement: &[u8],
    terminal_control_id: &[u8; 32],
    consumer_contract_id: [u8; 32],
) {
    let Some(root) = std::env::var_os(POOLED_RESERVE_BURN_V4_EXPORT_DIR_ENV) else {
        return;
    };
    let root = Path::new(&root);
    assert!(
        root.is_absolute(),
        "pooled-reserve burn V4 export directory must be absolute"
    );
    let metadata =
        fs::symlink_metadata(root).expect("pooled-reserve burn V4 export directory must exist");
    assert!(
        metadata.is_dir() && !metadata.file_type().is_symlink(),
        "pooled-reserve burn V4 export root must be a real directory"
    );
    assert!(
        fs::read_dir(root)
            .expect("pooled-reserve burn V4 export directory must be readable")
            .next()
            .is_none(),
        "pooled-reserve burn V4 export directory must be empty"
    );

    let mut manifest = vec![
        "schema=e2s.bridge-validity-eip0045-pooled-reserve-burn-candidate.v4".to_owned(),
        "version=4".to_owned(),
        format!("consumer-contract-id={}", hex::encode(consumer_contract_id)),
    ];
    write_candidate(root, "statement.bin", statement, &mut manifest);
    write_candidate(
        root,
        "program-id.bin",
        &method_program_id_v4(),
        &mut manifest,
    );
    write_candidate(
        root,
        "profile-id.bin",
        &EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
        &mut manifest,
    );
    write_candidate(
        root,
        "consumer-contract-id.bin",
        &consumer_contract_id,
        &mut manifest,
    );
    write_candidate(
        root,
        "terminal-control-id.bin",
        terminal_control_id,
        &mut manifest,
    );
    for (index, chunk) in proof_chunks.iter().enumerate() {
        write_candidate(
            root,
            &format!("proof-chunk-{index}.bin"),
            chunk,
            &mut manifest,
        );
    }
    manifest.push("complete=true".to_owned());
    write_new(
        &root.join(POOLED_RESERVE_BURN_V4_MANIFEST),
        format!("{}\n", manifest.join("\n")).as_bytes(),
    );
}

fn write_candidate(root: &Path, name: &str, bytes: &[u8], manifest: &mut Vec<String>) {
    write_new(&root.join(name), bytes);
    manifest.push(format!(
        "file={name}:{}:{}",
        bytes.len(),
        hex::encode(Blake2b256::digest(bytes))
    ));
}

fn write_new(path: &Path, bytes: &[u8]) {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .expect("pooled-reserve burn V4 export path must not exist");
    file.write_all(bytes)
        .expect("pooled-reserve burn V4 export bytes must be written completely");
    file.sync_all()
        .expect("pooled-reserve burn V4 export bytes must be flushed");
}
