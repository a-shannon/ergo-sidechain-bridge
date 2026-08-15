#![cfg(feature = "local-prove")]

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

use blake2::{digest::consts::U32, Blake2b, Digest};
use bridge_validity_composition::{
    test_vectors::native_pooled_reserve_burn_validity_fixture_for_application_v5,
    MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V5_BYTES,
};
use bridge_validity_statement::{
    decode_eip0045_pooled_reserve_burn_statement_v5, PooledReserveMintReservationRuntimeProfileV4,
};
use bridge_validity_zkvm_host::{
    method_program_id_v5, verify_pooled_reserve_burn_profile_receipt_v5, HostError,
    PooledReserveBurnHostErrorV5, EIP0045_RISC0_V3_PROOF_CHUNK_BYTES,
    EIP0045_RISC0_V3_RAW_SEAL_BYTES, EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
};
use bridge_validity_zkvm_methods::{BRIDGE_VALIDITY_GUEST_V5_ELF, BRIDGE_VALIDITY_GUEST_V5_ID};
use risc0_zkvm::{
    default_executor, ExecutorEnv, InnerReceipt, LocalProver, ProveInfo, Prover, ProverOpts,
    VerifierContext,
};

type Blake2b256 = Blake2b<U32>;

const POOLED_RESERVE_BURN_V5_CONSUMER_ID_HEX: &str =
    "c9f54f6e60bcad8a135df23e92c69a5134144c2cebc7091566f6da490b7cff08";
const STANDALONE_POOLED_RESERVE_BURN_V5_CONSUMER_ID_HEX: &str =
    "008a6dfbcadae28b4383ff35b0d333a163dfe54b925e565844ae128331abb7a0";
const TRACKER_NFT_ID_HEX: &str = "00e4ed6ac28c8ccd2a3476a39cb8ac33f7fdefefd0b88978841ed9bb9045a7e9";
const POOLED_RESERVE_BURN_V5_EXPORT_DIR_ENV: &str =
    "BRIDGE_EIP0045_POOLED_RESERVE_BURN_V5_EXPORT_DIR";
const POOLED_RESERVE_BURN_V5_MANIFEST: &str = "pooled-reserve-burn-candidate-manifest-v5.txt";

#[test]
fn executes_the_exact_application_bound_v5_program() {
    let consumer_contract_id = pooled_reserve_burn_v5_consumer_id();
    let fixture = exact_application_fixture(consumer_contract_id);
    let witness_len = u32::try_from(fixture.encoded_witness.len())
        .expect("fixture length must fit the guest ABI");
    let env = ExecutorEnv::builder()
        .write_slice(&[witness_len])
        .write_slice(&fixture.encoded_witness)
        .build()
        .expect("executor input must build");
    let session = default_executor()
        .execute(env, BRIDGE_VALIDITY_GUEST_V5_ELF)
        .expect("application-bound pooled-reserve V5 guest must execute");

    assert_eq!(session.journal.bytes, fixture.statement);
    let statement = decode_eip0045_pooled_reserve_burn_statement_v5(&session.journal.bytes)
        .expect("V5 journal must decode canonically");
    assert_eq!(statement.program_id, method_program_id_v5());
    assert_eq!(statement.profile_id, EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID);
    assert_eq!(statement.contract_id, consumer_contract_id);
    assert_eq!(
        statement.public_inputs.application_binding.runtime_profile,
        exact_runtime_profile()
    );
    assert_eq!(
        statement
            .public_inputs
            .application_binding
            .source_runtime_code_sha256,
        hex32("c93eee2d0db02f10acc7460d9576e122dcf8cd53c4bf8dfcae1b3e74ebcfff5a")
    );
    assert_eq!(
        statement
            .public_inputs
            .application_binding
            .source_runtime_code_bytes,
        4_096
    );
    assert_eq!(
        statement.public_inputs.application_binding.tracker_nft_id,
        tracker_nft_id()
    );
    assert!(session.cycles() > 0);
    assert!(session.segments.len() > 1);
}

#[test]
fn binds_the_v5_candidate_to_the_rederived_integrated_tracker() {
    let consumer_contract_id = pooled_reserve_burn_v5_consumer_id();
    assert_eq!(
        hex::encode(consumer_contract_id),
        POOLED_RESERVE_BURN_V5_CONSUMER_ID_HEX
    );
    assert_ne!(
        POOLED_RESERVE_BURN_V5_CONSUMER_ID_HEX,
        STANDALONE_POOLED_RESERVE_BURN_V5_CONSUMER_ID_HEX
    );

    let fixture = exact_application_fixture(consumer_contract_id);
    let statement = decode_eip0045_pooled_reserve_burn_statement_v5(&fixture.statement)
        .expect("integrated tracker statement must decode canonically");
    assert_eq!(statement.contract_id, consumer_contract_id);
    assert_eq!(
        statement
            .public_inputs
            .application_binding
            .settlement_tracker_contract_id,
        consumer_contract_id
    );
}

#[test]
#[ignore = "generates a real local RISC Zero succinct V5 receipt"]
fn proves_and_rejects_mutated_pooled_reserve_burn_v5_receipt_bindings() {
    let consumer_contract_id = pooled_reserve_burn_v5_consumer_id();
    let fixture = exact_application_fixture(consumer_contract_id);
    assert!(fixture.encoded_witness.len() <= MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V5_BYTES);

    let witness_len = u32::try_from(fixture.encoded_witness.len())
        .expect("fixture length must fit the guest ABI");
    let env = ExecutorEnv::builder()
        .write_slice(&[witness_len])
        .write_slice(&fixture.encoded_witness)
        .build()
        .expect("prover input must build");
    let opts = ProverOpts::succinct()
        .with_dev_mode(false)
        .with_prove_guest_errors(false);
    assert!(!opts.dev_mode());
    assert_eq!(opts.hashfn, "poseidon2");
    let verifier_context = VerifierContext::default().with_dev_mode(false);
    let prover = LocalProver::new("bridge-eip0045-risc0-v3-pooled-reserve-burn-v5");
    let ProveInfo {
        receipt,
        stats,
        work_receipt,
        ..
    } = prover
        .prove_with_ctx(env, &verifier_context, BRIDGE_VALIDITY_GUEST_V5_ELF, &opts)
        .expect("non-dev V5 succinct proof must be produced");
    assert!(work_receipt.is_none());
    receipt
        .verify_with_context(&verifier_context, BRIDGE_VALIDITY_GUEST_V5_ID)
        .expect("receipt must verify against the frozen V5 method");
    let proof_chunks = verify_pooled_reserve_burn_profile_receipt_v5(
        &receipt,
        &fixture.statement,
        consumer_contract_id,
    )
    .expect("portable V5 host must accept the exact receipt");

    assert_eq!(receipt.journal.bytes, fixture.statement);
    assert_eq!(
        proof_chunks.each_ref().map(Vec::len),
        EIP0045_RISC0_V3_PROOF_CHUNK_BYTES
    );
    assert_eq!(proof_chunks.concat().len(), EIP0045_RISC0_V3_RAW_SEAL_BYTES);
    let InnerReceipt::Succinct(succinct) = &receipt.inner else {
        panic!("pooled-reserve burn V5 candidate must be a succinct receipt");
    };
    assert_eq!(proof_chunks.concat(), succinct.get_seal_bytes());
    let terminal_control_id: [u8; 32] = succinct
        .control_id
        .as_bytes()
        .try_into()
        .expect("terminal control ID must be 32 bytes");
    assert!(stats.total_cycles > 0);

    let mut wrong_id = BRIDGE_VALIDITY_GUEST_V5_ID;
    wrong_id[0] ^= 1;
    assert!(receipt.verify(wrong_id).is_err());

    let mut wrong_expected = fixture.statement;
    wrong_expected[0] ^= 1;
    assert!(matches!(
        verify_pooled_reserve_burn_profile_receipt_v5(
            &receipt,
            &wrong_expected,
            consumer_contract_id,
        ),
        Err(PooledReserveBurnHostErrorV5::Host(
            HostError::JournalMismatch
        ))
    ));

    let mut wrong_contract_id = consumer_contract_id;
    wrong_contract_id[0] ^= 1;
    assert!(matches!(
        verify_pooled_reserve_burn_profile_receipt_v5(
            &receipt,
            &fixture.statement,
            wrong_contract_id,
        ),
        Err(PooledReserveBurnHostErrorV5::ContractId)
    ));

    let mut coordinated_receipt = receipt.clone();
    coordinated_receipt.journal.bytes[0] ^= 1;
    let mut coordinated_expected = fixture.statement;
    coordinated_expected[0] ^= 1;
    assert!(verify_pooled_reserve_burn_profile_receipt_v5(
        &coordinated_receipt,
        &coordinated_expected,
        consumer_contract_id,
    )
    .is_err());

    let mut altered_seal = receipt.clone();
    {
        let InnerReceipt::Succinct(succinct) = &mut altered_seal.inner else {
            panic!("pooled-reserve burn V5 candidate must be a succinct receipt");
        };
        succinct.seal[1_000] ^= 1;
    }
    assert!(verify_pooled_reserve_burn_profile_receipt_v5(
        &altered_seal,
        &fixture.statement,
        consumer_contract_id,
    )
    .is_err());

    println!("v5_witness_bytes={}", fixture.encoded_witness.len());
    println!("v5_total_cycles={}", stats.total_cycles);
    println!(
        "v5_statement_blake2b256={}",
        hex::encode(Blake2b256::digest(fixture.statement))
    );
    export_pooled_reserve_burn_v5_candidate_if_requested(
        &proof_chunks,
        &fixture.statement,
        &terminal_control_id,
        consumer_contract_id,
    );
}

fn exact_application_fixture(
    consumer_contract_id: [u8; 32],
) -> bridge_validity_composition::test_vectors::NativePooledReserveBurnValidityFixtureV5 {
    let source_runtime_code = vec![0x61; 4_096];
    native_pooled_reserve_burn_validity_fixture_for_application_v5(
        EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
        method_program_id_v5(),
        consumer_contract_id,
        exact_runtime_profile(),
        &source_runtime_code,
        tracker_nft_id(),
    )
}

fn exact_runtime_profile() -> PooledReserveMintReservationRuntimeProfileV4 {
    PooledReserveMintReservationRuntimeProfileV4 {
        lineage_id: hex32("f0cd15e335996211353a2eb895b5bbdeaf7a5de4f10ec0f547a8f6e505a522f9"),
        source_network_id: [0x11; 32],
        sidechain_id: [0x22; 32],
        bridge_address: [0x33; 20],
        token_address: [0x44; 20],
        bridge_runtime_code_sha256: [0xbb; 32],
        bridge_runtime_code_bytes: 4_096,
        token_runtime_code_sha256: [0xcc; 32],
        token_runtime_code_bytes: 2_048,
        settlement_profile_id: [0x55; 32],
        ergo_finality_policy_id: hex32(
            "4322c3e83dd656d497b10cb2d5a3eb83c0e542e540b534cadefd113110c75af4",
        ),
        source_proof_system_id: hex32(
            "115d7970045dfc71a0591583bee1bf4e9291a81ccf426dc56d948742836dc0d7",
        ),
        source_proof_profile_id: hex32(
            "31797a6450bcb7121df06dfb16829727401f831c7b6f23fc53ad100630956c67",
        ),
        activation_height: 0,
        max_pending_blocks: 20,
    }
}

fn pooled_reserve_burn_v5_consumer_id() -> [u8; 32] {
    hex32(POOLED_RESERVE_BURN_V5_CONSUMER_ID_HEX)
}

fn tracker_nft_id() -> [u8; 32] {
    hex32(TRACKER_NFT_ID_HEX)
}

fn hex32(value: &str) -> [u8; 32] {
    hex::decode(value)
        .expect("frozen 32-byte identity must decode")
        .try_into()
        .expect("frozen identity must contain exactly 32 bytes")
}

fn export_pooled_reserve_burn_v5_candidate_if_requested(
    proof_chunks: &[Vec<u8>; 4],
    statement: &[u8],
    terminal_control_id: &[u8; 32],
    consumer_contract_id: [u8; 32],
) {
    let Some(root) = std::env::var_os(POOLED_RESERVE_BURN_V5_EXPORT_DIR_ENV) else {
        return;
    };
    let root = Path::new(&root);
    assert!(
        root.is_absolute(),
        "pooled-reserve burn V5 export directory must be absolute"
    );
    let metadata =
        fs::symlink_metadata(root).expect("pooled-reserve burn V5 export directory must exist");
    assert!(
        metadata.is_dir() && !metadata.file_type().is_symlink(),
        "pooled-reserve burn V5 export root must be a real directory"
    );
    assert!(
        fs::read_dir(root)
            .expect("pooled-reserve burn V5 export directory must be readable")
            .next()
            .is_none(),
        "pooled-reserve burn V5 export directory must be empty"
    );

    let mut manifest = vec![
        "schema=e2s.bridge-validity-eip0045-pooled-reserve-burn-candidate.v5".to_owned(),
        "version=5".to_owned(),
        format!("consumer-contract-id={}", hex::encode(consumer_contract_id)),
    ];
    write_candidate(root, "statement.bin", statement, &mut manifest);
    write_candidate(
        root,
        "program-id.bin",
        &method_program_id_v5(),
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
        &root.join(POOLED_RESERVE_BURN_V5_MANIFEST),
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
        .expect("pooled-reserve burn V5 export path must not exist");
    file.write_all(bytes)
        .expect("pooled-reserve burn V5 export bytes must be written completely");
    file.sync_all()
        .expect("pooled-reserve burn V5 export bytes must be flushed");
}
