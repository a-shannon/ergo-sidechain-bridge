#![cfg(feature = "local-prove")]

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

use blake2::{digest::consts::U32, Blake2b, Digest};
use bridge_validity_composition::test_vectors::native_bridge_validity_fixture_for_profile_and_contract_v1;
use bridge_validity_zkvm_host::{
    method_program_id, prove_and_verify_native_witness, verify_bridge_validity_receipt,
    verify_eip0045_profile_receipt, HostError, EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID,
    EIP0045_RISC0_V3_PROOF_CHUNK_BYTES, EIP0045_RISC0_V3_RAW_SEAL_BYTES,
    EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
};
use bridge_validity_zkvm_methods::{BRIDGE_VALIDITY_GUEST_ELF, BRIDGE_VALIDITY_GUEST_ID};
use risc0_zkvm::{InnerReceipt, ProverOpts};

type Blake2b256 = Blake2b<U32>;
const CONTRACT_ID_ENV: &str = "BRIDGE_EIP0045_CONSUMER_CONTRACT_ID_HEX";

#[test]
#[ignore = "generates a real local RISC Zero receipt"]
fn proves_and_rejects_mutated_receipt_bindings() {
    let opts = ProverOpts::succinct()
        .with_dev_mode(false)
        .with_prove_guest_errors(false);
    assert_eq!(opts.hashfn, "poseidon2");
    assert!(!opts.dev_mode());
    assert!(!opts.prove_guest_errors);
    let consumer_contract_id = requested_consumer_contract_id();
    let fixture = native_bridge_validity_fixture_for_profile_and_contract_v1(
        EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
        method_program_id(),
        consumer_contract_id,
    );
    let run =
        prove_and_verify_native_witness(&fixture.encoded_witness, &fixture.statement).unwrap();

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
        panic!("profile candidate must be a succinct receipt");
    };
    assert_eq!(run.proof_chunks.concat(), succinct.get_seal_bytes());
    let terminal_control_id: [u8; 32] = succinct
        .control_id
        .as_bytes()
        .try_into()
        .expect("terminal control ID must be 32 bytes");
    let terminal_control_id_hex = hex::encode(terminal_control_id);
    assert!(run.stats.total_cycles > 0);
    assert!(run.stats.user_cycles > 0);
    assert!(run.stats.segments > 1);
    let mut wrong_id = BRIDGE_VALIDITY_GUEST_ID;
    wrong_id[0] ^= 1;
    assert!(run.receipt.verify(wrong_id).is_err());

    let mut altered_receipt = run.receipt.clone();
    altered_receipt.journal.bytes[0] ^= 1;
    assert!(altered_receipt.verify(BRIDGE_VALIDITY_GUEST_ID).is_err());

    let mut wrong_expected = fixture.statement;
    wrong_expected[0] ^= 1;
    assert!(matches!(
        verify_bridge_validity_receipt(&run.receipt, &wrong_expected),
        Err(HostError::JournalMismatch)
    ));

    let mut coordinated_receipt = run.receipt.clone();
    coordinated_receipt.journal.bytes[0] ^= 1;
    let mut coordinated_expected = fixture.statement;
    coordinated_expected[0] ^= 1;
    assert!(matches!(
        verify_bridge_validity_receipt(&coordinated_receipt, &coordinated_expected),
        Err(HostError::Receipt(_))
    ));

    let mut altered_seal = run.receipt.clone();
    {
        let InnerReceipt::Succinct(succinct) = &mut altered_seal.inner else {
            panic!("profile candidate must be a succinct receipt");
        };
        succinct.seal[1_000] ^= 1;
    }
    assert!(verify_eip0045_profile_receipt(&altered_seal, &fixture.statement).is_err());

    export_candidate_if_requested(&run.proof_chunks, &fixture.statement, &terminal_control_id);

    println!("method_id_hex=0x{}", hex::encode(method_program_id()));
    println!(
        "profile_id_hex=0x{}",
        hex::encode(EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID)
    );
    println!(
        "consumer_contract_id_hex=0x{}",
        hex::encode(consumer_contract_id)
    );
    println!("elf_bytes={}", BRIDGE_VALIDITY_GUEST_ELF.len());
    println!("witness_bytes={}", fixture.encoded_witness.len());
    println!("journal_bytes={}", run.receipt.journal.bytes.len());
    println!("raw_seal_bytes={}", run.proof_chunks.concat().len());
    println!(
        "proof_chunk_bytes={:?}",
        run.proof_chunks.each_ref().map(Vec::len)
    );
    println!("terminal_control_id_hex=0x{terminal_control_id_hex}");
    println!("segments={}", run.stats.segments);
    println!("user_cycles={}", run.stats.user_cycles);
    println!("total_cycles={}", run.stats.total_cycles);
    println!("paging_cycles={}", run.stats.paging_cycles);
    println!("reserved_cycles={}", run.stats.reserved_cycles);
}

fn requested_consumer_contract_id() -> [u8; 32] {
    let Some(raw) = std::env::var_os(CONTRACT_ID_ENV) else {
        return EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID;
    };
    let raw = raw
        .into_string()
        .unwrap_or_else(|_| panic!("{CONTRACT_ID_ENV} must be UTF-8"));
    assert!(
        raw.len() == 64 && raw.bytes().all(|byte| byte.is_ascii_hexdigit()),
        "{CONTRACT_ID_ENV} must be exactly 32 bytes of hex"
    );
    let decoded = hex::decode(raw).expect("consumer contract ID hex must decode");
    decoded
        .try_into()
        .expect("consumer contract ID must contain exactly 32 bytes")
}

fn export_candidate_if_requested(
    proof_chunks: &[Vec<u8>; 4],
    statement: &[u8],
    terminal_control_id: &[u8; 32],
) {
    let Some(root) = std::env::var_os("BRIDGE_EIP0045_EXPORT_DIR") else {
        return;
    };
    let root = Path::new(&root);
    assert!(
        root.is_absolute(),
        "candidate export directory must be absolute"
    );
    let metadata = fs::symlink_metadata(root).expect("candidate export directory must exist");
    assert!(
        metadata.is_dir() && !metadata.file_type().is_symlink(),
        "candidate export root must be a real directory"
    );
    assert!(
        fs::read_dir(root)
            .expect("candidate export directory must be readable")
            .next()
            .is_none(),
        "candidate export directory must be empty"
    );

    let mut manifest = vec![
        "schema=e2s.bridge-validity-eip0045-candidate.v1".to_owned(),
        "version=1".to_owned(),
    ];
    write_candidate(root, "statement.bin", statement, &mut manifest);
    write_candidate(root, "program-id.bin", &method_program_id(), &mut manifest);
    write_candidate(
        root,
        "profile-id.bin",
        &EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
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
        &root.join("candidate-manifest-v1.txt"),
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
        .expect("candidate export path must not exist");
    file.write_all(bytes)
        .expect("candidate export bytes must be written completely");
    file.sync_all()
        .expect("candidate export bytes must be flushed");
}
