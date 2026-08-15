#![cfg(feature = "local-prove")]

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

use blake2::{digest::consts::U32, Blake2b, Digest};
use bridge_validity_composition::test_vectors::{
    native_bridge_application_validity_fixture_for_profile_contract_and_bridge_commitment_v2,
    native_bridge_application_validity_fixture_for_profile_contract_and_bridge_runtime_hash_v2,
    native_bridge_application_validity_fixture_for_profile_and_contract_v2,
    native_bridge_validity_fixture_for_profile_and_contract_v1,
};
use bridge_validity_statement::decode_eip0045_bridge_application_statement_v2;
use bridge_validity_zkvm_host::{
    method_program_id, method_program_id_v2, prove_and_verify_application_witness_v2,
    verify_eip0045_profile_receipt_v2, ApplicationHostErrorV2, HostError,
    EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID, EIP0045_RISC0_V3_PROOF_CHUNK_BYTES,
    EIP0045_RISC0_V3_RAW_SEAL_BYTES, EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
};
use bridge_validity_zkvm_methods::{
    BRIDGE_VALIDITY_GUEST_ELF, BRIDGE_VALIDITY_GUEST_V2_ELF, BRIDGE_VALIDITY_GUEST_V2_ID,
};
use risc0_zkvm::{default_executor, ExecutorEnv, InnerReceipt};

type Blake2b256 = Blake2b<U32>;
const SYNTHETIC_APPLICATION_CONSUMER_ID: [u8; 32] = [0xd6; 32];
const APPLICATION_CONTRACT_ID_ENV: &str = "BRIDGE_EIP0045_APPLICATION_CONSUMER_CONTRACT_ID_HEX";
const APPLICATION_EXPORT_DIR_ENV: &str = "BRIDGE_EIP0045_APPLICATION_EXPORT_DIR";
const APPLICATION_SETTLEMENT_EXPORT_DIR_ENV: &str =
    "BRIDGE_EIP0045_APPLICATION_SETTLEMENT_EXPORT_DIR";
const APPLICATION_REJECTION_EXPORT_DIR_ENV: &str =
    "BRIDGE_EIP0045_APPLICATION_BINDING_REJECTION_EXPORT_DIR";
const APPLICATION_TRACKER_CONTRACT_ID_HEX: &str =
    "adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b";
const FRONTIER_BRIDGE_EVENT_ROOT: [u8; 32] = [
    0xd5, 0xf2, 0x6f, 0x1d, 0xdc, 0x31, 0x9a, 0x96, 0x9c, 0x8c, 0x3a, 0xea, 0x47, 0xfe, 0xdd,
    0x7d, 0x8e, 0x61, 0x5c, 0x07, 0x46, 0xfd, 0xae, 0x84, 0xac, 0x99, 0x84, 0x20, 0x2a, 0xef,
    0xe3, 0xb7,
];
const FRONTIER_EXECUTION_BLOCK_HASH: [u8; 32] = [0x22; 32];

#[test]
fn executes_the_frozen_v1_program_binary_and_commits_the_compatibility_statement() {
    let fixture = native_bridge_validity_fixture_for_profile_and_contract_v1(
        EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
        method_program_id(),
        EIP0045_BRIDGE_VALIDITY_CONSUMER_CONTRACT_ID,
    );
    let witness_len = u32::try_from(fixture.encoded_witness.len())
        .expect("fixture length must fit the guest ABI");
    let env = ExecutorEnv::builder()
        .write_slice(&[witness_len])
        .write_slice(&fixture.encoded_witness)
        .build()
        .expect("executor input must build");
    let session = default_executor()
        .execute(env, BRIDGE_VALIDITY_GUEST_ELF)
        .expect("frozen V1 compatibility guest must execute");

    assert_eq!(session.journal.bytes, fixture.statement);
    assert!(session.cycles() > 0);
    assert!(session.segments.len() > 1);
}

#[test]
fn executes_the_application_bound_guest_and_commits_only_the_v2_statement() {
    let fixture = native_bridge_application_validity_fixture_for_profile_and_contract_v2(
        EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
        method_program_id_v2(),
        SYNTHETIC_APPLICATION_CONSUMER_ID,
    );
    let witness_len = u32::try_from(fixture.encoded_witness.len())
        .expect("fixture length must fit the guest ABI");
    let env = ExecutorEnv::builder()
        .write_slice(&[witness_len])
        .write_slice(&fixture.encoded_witness)
        .build()
        .expect("executor input must build");
    let session = default_executor()
        .execute(env, BRIDGE_VALIDITY_GUEST_V2_ELF)
        .expect("application-bound guest must execute");

    assert_eq!(session.journal.bytes, fixture.statement);
    assert!(session.cycles() > 0);
    assert!(session.segments.len() > 1);
}

#[test]
#[ignore = "generates a real local RISC Zero succinct receipt"]
fn proves_and_rejects_mutated_application_receipt_bindings() {
    let consumer_contract_id = requested_application_consumer_contract_id();
    let fixture = native_bridge_application_validity_fixture_for_profile_and_contract_v2(
        EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
        method_program_id_v2(),
        consumer_contract_id,
    );
    let run = prove_and_verify_application_witness_v2(
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
        panic!("profile candidate must be a succinct receipt");
    };
    assert_eq!(run.proof_chunks.concat(), succinct.get_seal_bytes());
    let terminal_control_id: [u8; 32] = succinct
        .control_id
        .as_bytes()
        .try_into()
        .expect("terminal control ID must be 32 bytes");
    assert!(run.stats.total_cycles > 0);

    let mut wrong_id = BRIDGE_VALIDITY_GUEST_V2_ID;
    wrong_id[0] ^= 1;
    assert!(run.receipt.verify(wrong_id).is_err());

    let mut wrong_expected = fixture.statement;
    wrong_expected[0] ^= 1;
    assert!(matches!(
        verify_eip0045_profile_receipt_v2(&run.receipt, &wrong_expected, consumer_contract_id),
        Err(ApplicationHostErrorV2::Host(HostError::JournalMismatch))
    ));
    let mut wrong_contract_id = consumer_contract_id;
    wrong_contract_id[0] ^= 1;
    assert!(matches!(
        verify_eip0045_profile_receipt_v2(&run.receipt, &fixture.statement, wrong_contract_id),
        Err(ApplicationHostErrorV2::ContractId)
    ));

    let mut coordinated_receipt = run.receipt.clone();
    coordinated_receipt.journal.bytes[0] ^= 1;
    let mut coordinated_expected = fixture.statement;
    coordinated_expected[0] ^= 1;
    assert!(verify_eip0045_profile_receipt_v2(
        &coordinated_receipt,
        &coordinated_expected,
        consumer_contract_id
    )
    .is_err());

    let mut altered_receipt = run.receipt.clone();
    altered_receipt.journal.bytes[0] ^= 1;
    assert!(verify_eip0045_profile_receipt_v2(
        &altered_receipt,
        &fixture.statement,
        consumer_contract_id
    )
    .is_err());

    let mut altered_seal = run.receipt.clone();
    {
        let InnerReceipt::Succinct(succinct) = &mut altered_seal.inner else {
            panic!("profile candidate must be a succinct receipt");
        };
        succinct.seal[1_000] ^= 1;
    }
    assert!(verify_eip0045_profile_receipt_v2(
        &altered_seal,
        &fixture.statement,
        consumer_contract_id
    )
    .is_err());

    export_application_candidate_if_requested(
        &run.proof_chunks,
        &fixture.statement,
        &terminal_control_id,
    );
}

#[test]
#[ignore = "generates a real local RISC Zero receipt for the Frontier-bound settlement fixture"]
fn proves_and_exports_the_frontier_bound_application_settlement_candidate() {
    let consumer_contract_id: [u8; 32] = hex::decode(APPLICATION_TRACKER_CONTRACT_ID_HEX)
        .expect("frozen application tracker contract ID must decode")
        .try_into()
        .expect("frozen application tracker contract ID must contain exactly 32 bytes");
    let fixture =
        native_bridge_application_validity_fixture_for_profile_contract_and_bridge_commitment_v2(
            EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
            method_program_id_v2(),
            consumer_contract_id,
            FRONTIER_BRIDGE_EVENT_ROOT,
            FRONTIER_EXECUTION_BLOCK_HASH,
            3,
        )
        .unwrap();
    let decoded =
        decode_eip0045_bridge_application_statement_v2(&fixture.statement).unwrap();
    assert_eq!(
        decoded.application_payload.finality.checkpoint[76..108],
        FRONTIER_EXECUTION_BLOCK_HASH
    );
    assert_eq!(
        decoded.application_payload.finality.checkpoint[108..140],
        FRONTIER_BRIDGE_EVENT_ROOT
    );
    assert_eq!(
        u32::from_be_bytes(
            decoded.application_payload.finality.checkpoint[140..144]
                .try_into()
                .unwrap()
        ),
        3
    );

    let run = prove_and_verify_application_witness_v2(
        &fixture.encoded_witness,
        &fixture.statement,
        consumer_contract_id,
    )
    .unwrap();
    assert_eq!(run.receipt.journal.bytes, fixture.statement);
    let InnerReceipt::Succinct(succinct) = &run.receipt.inner else {
        panic!("settlement candidate must be a succinct receipt");
    };
    let terminal_control_id: [u8; 32] = succinct
        .control_id
        .as_bytes()
        .try_into()
        .expect("terminal control ID must be 32 bytes");
    export_application_settlement_candidate_if_requested(
        &run.proof_chunks,
        &fixture.statement,
        &terminal_control_id,
    );
}

#[test]
#[ignore = "generates a real local RISC Zero receipt for an alternate application profile"]
fn proves_valid_alternate_bridge_runtime_profile_for_contract_rejection() {
    let consumer_contract_id = requested_application_consumer_contract_id();
    assert_eq!(
        hex::encode(consumer_contract_id),
        APPLICATION_TRACKER_CONTRACT_ID_HEX,
        "alternate-profile proof must target the frozen application tracker"
    );
    let canonical = native_bridge_application_validity_fixture_for_profile_and_contract_v2(
        EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
        method_program_id_v2(),
        consumer_contract_id,
    );
    let mut alternate_bridge_runtime_hash = [0xbb; 32];
    alternate_bridge_runtime_hash[0] = 0xba;
    let alternate =
        native_bridge_application_validity_fixture_for_profile_contract_and_bridge_runtime_hash_v2(
            EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
            method_program_id_v2(),
            consumer_contract_id,
            alternate_bridge_runtime_hash,
        );
    let canonical_statement =
        decode_eip0045_bridge_application_statement_v2(&canonical.statement).unwrap();
    let alternate_statement =
        decode_eip0045_bridge_application_statement_v2(&alternate.statement).unwrap();
    assert_eq!(
        alternate_statement.contract_id, canonical_statement.contract_id,
        "outer contract identity must remain unchanged"
    );
    let canonical_application = canonical_statement.application_payload.application;
    let alternate_application = alternate_statement.application_payload.application;
    assert_eq!(
        alternate_application.bridge_runtime_code_sha256,
        alternate_bridge_runtime_hash
    );
    let mut normalized_alternate = alternate_application.clone();
    normalized_alternate.bridge_runtime_code_sha256 =
        canonical_application.bridge_runtime_code_sha256;
    assert_eq!(
        normalized_alternate, canonical_application,
        "bridge runtime hash must be the only independent application-binding mutation"
    );

    let run = prove_and_verify_application_witness_v2(
        &alternate.encoded_witness,
        &alternate.statement,
        consumer_contract_id,
    )
    .unwrap();
    assert_eq!(run.receipt.journal.bytes, alternate.statement);
    assert_ne!(run.receipt.journal.bytes, canonical.statement);
    let InnerReceipt::Succinct(succinct) = &run.receipt.inner else {
        panic!("alternate-profile candidate must be a succinct receipt");
    };
    let terminal_control_id: [u8; 32] = succinct
        .control_id
        .as_bytes()
        .try_into()
        .expect("terminal control ID must be 32 bytes");
    export_application_binding_rejection_candidate_if_requested(
        &run.proof_chunks,
        &alternate.statement,
        &terminal_control_id,
        consumer_contract_id,
    );
}

fn requested_application_consumer_contract_id() -> [u8; 32] {
    let Some(raw) = std::env::var_os(APPLICATION_CONTRACT_ID_ENV) else {
        return SYNTHETIC_APPLICATION_CONSUMER_ID;
    };
    let raw = raw
        .into_string()
        .unwrap_or_else(|_| panic!("{APPLICATION_CONTRACT_ID_ENV} must be UTF-8"));
    assert!(
        raw.len() == 64 && raw.bytes().all(|byte| byte.is_ascii_hexdigit()),
        "{APPLICATION_CONTRACT_ID_ENV} must be exactly 32 bytes of hex"
    );
    hex::decode(raw)
        .expect("application consumer contract ID hex must decode")
        .try_into()
        .expect("application consumer contract ID must contain exactly 32 bytes")
}

fn export_application_candidate_if_requested(
    proof_chunks: &[Vec<u8>; 4],
    statement: &[u8],
    terminal_control_id: &[u8; 32],
) {
    export_application_candidate_if_requested_with_manifest(
        APPLICATION_EXPORT_DIR_ENV,
        "e2s.bridge-validity-eip0045-application-candidate.v2",
        "candidate-manifest-v2.txt",
        &[],
        proof_chunks,
        statement,
        terminal_control_id,
    );
}

fn export_application_settlement_candidate_if_requested(
    proof_chunks: &[Vec<u8>; 4],
    statement: &[u8],
    terminal_control_id: &[u8; 32],
) {
    export_application_candidate_if_requested_with_manifest(
        APPLICATION_SETTLEMENT_EXPORT_DIR_ENV,
        "e2s.bridge-validity-eip0045-application-candidate.v2",
        "candidate-manifest-v2.txt",
        &[],
        proof_chunks,
        statement,
        terminal_control_id,
    );
}

fn export_application_binding_rejection_candidate_if_requested(
    proof_chunks: &[Vec<u8>; 4],
    statement: &[u8],
    terminal_control_id: &[u8; 32],
    contract_id: [u8; 32],
) {
    export_application_candidate_if_requested_with_manifest(
        APPLICATION_REJECTION_EXPORT_DIR_ENV,
        "e2s.bridge-validity-eip0045-application-binding-rejection-candidate.v2",
        "application-binding-rejection-manifest-v2.txt",
        &[
            "mutation-field=bridge-runtime-code-sha256".to_owned(),
            format!("contract-id={}", hex::encode(contract_id)),
        ],
        proof_chunks,
        statement,
        terminal_control_id,
    );
}

#[allow(clippy::too_many_arguments)]
fn export_application_candidate_if_requested_with_manifest(
    export_dir_env: &str,
    schema: &str,
    manifest_name: &str,
    manifest_metadata: &[String],
    proof_chunks: &[Vec<u8>; 4],
    statement: &[u8],
    terminal_control_id: &[u8; 32],
) {
    let Some(root) = std::env::var_os(export_dir_env) else {
        return;
    };
    let root = Path::new(&root);
    assert!(
        root.is_absolute(),
        "application candidate export directory must be absolute"
    );
    let metadata =
        fs::symlink_metadata(root).expect("application candidate export directory must exist");
    assert!(
        metadata.is_dir() && !metadata.file_type().is_symlink(),
        "application candidate export root must be a real directory"
    );
    assert!(
        fs::read_dir(root)
            .expect("application candidate export directory must be readable")
            .next()
            .is_none(),
        "application candidate export directory must be empty"
    );

    let mut manifest = vec![format!("schema={schema}"), "version=2".to_owned()];
    manifest.extend_from_slice(manifest_metadata);
    write_application_candidate(root, "statement.bin", statement, &mut manifest);
    write_application_candidate(
        root,
        "program-id.bin",
        &method_program_id_v2(),
        &mut manifest,
    );
    write_application_candidate(
        root,
        "profile-id.bin",
        &EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
        &mut manifest,
    );
    write_application_candidate(
        root,
        "terminal-control-id.bin",
        terminal_control_id,
        &mut manifest,
    );
    for (index, chunk) in proof_chunks.iter().enumerate() {
        write_application_candidate(
            root,
            &format!("proof-chunk-{index}.bin"),
            chunk,
            &mut manifest,
        );
    }
    manifest.push("complete=true".to_owned());
    write_new(
        &root.join(manifest_name),
        format!("{}\n", manifest.join("\n")).as_bytes(),
    );
}

fn write_application_candidate(root: &Path, name: &str, bytes: &[u8], manifest: &mut Vec<String>) {
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
        .expect("application candidate export path must not exist");
    file.write_all(bytes)
        .expect("application candidate export bytes must be written completely");
    file.sync_all()
        .expect("application candidate export bytes must be flushed");
}
