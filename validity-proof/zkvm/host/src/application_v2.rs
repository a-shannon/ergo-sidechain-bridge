//! Host bindings for the application-bound V2 bridge validity guest.
//!
//! This module is additive. It does not reinterpret the V1 statement family, activate an
//! EIP-0045 profile, or provide an Ergo settlement consumer.

#[cfg(feature = "local-prove")]
use bridge_validity_composition::MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V2_BYTES;
use bridge_validity_statement::{
    decode_eip0045_bridge_application_statement_v2, StatementError,
    EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES,
};
#[cfg(feature = "local-prove")]
use bridge_validity_zkvm_methods::BRIDGE_VALIDITY_GUEST_V2_ELF;
use bridge_validity_zkvm_methods::BRIDGE_VALIDITY_GUEST_V2_ID;
use risc0_zkvm::{Digest, InnerReceipt, Receipt};
#[cfg(feature = "local-prove")]
use risc0_zkvm::{ExecutorEnv, LocalProver, ProveInfo, Prover, ProverOpts, VerifierContext};
use thiserror::Error;

#[cfg(feature = "local-prove")]
use super::VerifiedProofRun;
use super::{
    validate_eip0045_profile_view, HostError, SuccinctProfileView,
    EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
};

/// Application-bound host rejection without changing the frozen V1 host error API.
#[derive(Debug, Error)]
pub enum ApplicationHostErrorV2 {
    /// Shared receipt, method, profile, or transport validation failed.
    #[error(transparent)]
    Host(#[from] HostError),
    /// The 1,132-byte application statement is not canonical.
    #[error("invalid application-bound public bridge statement: {0}")]
    Statement(#[from] StatementError),
    /// The statement is not bound to the exact consumer proposition expected by the caller.
    #[error("public statement contract ID differs from the expected application consumer")]
    ContractId,
}

/// Return the exact application-bound V2 method image identity as canonical digest bytes.
pub fn method_program_id_v2() -> [u8; 32] {
    let digest: Digest = BRIDGE_VALIDITY_GUEST_V2_ID.into();
    digest
        .as_bytes()
        .try_into()
        .expect("RISC Zero digest is 32 bytes")
}

/// Build a real local non-dev succinct proof candidate for the application-bound V2 guest.
#[cfg(feature = "local-prove")]
pub fn prove_and_verify_application_witness_v2(
    encoded_witness: &[u8],
    expected_statement: &[u8; EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES],
    expected_contract_id: [u8; 32],
) -> Result<VerifiedProofRun, ApplicationHostErrorV2> {
    if encoded_witness.len() > MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V2_BYTES {
        return Err(HostError::WitnessTooLarge {
            actual: encoded_witness.len(),
            max: MAX_BRIDGE_VALIDITY_GUEST_WITNESS_V2_BYTES,
        }
        .into());
    }
    validate_public_journal_for_profile_v2(expected_statement, expected_contract_id)?;
    let witness_len = u32::try_from(encoded_witness.len()).map_err(|_| HostError::WitnessLength)?;
    let env = ExecutorEnv::builder()
        .write_slice(&[witness_len])
        .write_slice(encoded_witness)
        .build()
        .map_err(HostError::Zkvm)?;
    let opts = ProverOpts::succinct()
        .with_dev_mode(false)
        .with_prove_guest_errors(false);
    debug_assert!(!opts.dev_mode());
    debug_assert_eq!(opts.hashfn, "poseidon2");
    debug_assert!(!opts.prove_guest_errors);
    let verifier_context = VerifierContext::default().with_dev_mode(false);
    debug_assert!(!verifier_context.dev_mode());
    let prover = LocalProver::new("bridge-eip0045-risc0-v3-application-v2");
    let ProveInfo {
        receipt,
        stats,
        work_receipt,
        ..
    } = prover
        .prove_with_ctx(env, &verifier_context, BRIDGE_VALIDITY_GUEST_V2_ELF, &opts)
        .map_err(HostError::Zkvm)?;
    if work_receipt.is_some() {
        return Err(HostError::WorkReceipt.into());
    }
    receipt
        .verify_with_context(&verifier_context, BRIDGE_VALIDITY_GUEST_V2_ID)
        .map_err(HostError::Receipt)?;
    let proof_chunks =
        verify_eip0045_profile_receipt_v2(&receipt, expected_statement, expected_contract_id)?;
    Ok(VerifiedProofRun {
        receipt,
        proof_chunks,
        stats,
    })
}

fn verify_method_receipt_v2(
    receipt: &Receipt,
    expected_statement: &[u8; EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES],
) -> Result<(), ApplicationHostErrorV2> {
    receipt
        .verify(BRIDGE_VALIDITY_GUEST_V2_ID)
        .map_err(HostError::Receipt)?;
    validate_public_journal_v2(&receipt.journal.bytes, expected_statement)
}

/// Verify the frozen proof profile plus explicit V2 consumer proposition binding.
pub fn verify_eip0045_profile_receipt_v2(
    receipt: &Receipt,
    expected_statement: &[u8; EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES],
    expected_contract_id: [u8; 32],
) -> Result<[Vec<u8>; 4], ApplicationHostErrorV2> {
    verify_method_receipt_v2(receipt, expected_statement)?;
    validate_public_journal_for_profile_v2(expected_statement, expected_contract_id)?;
    let InnerReceipt::Succinct(succinct) = &receipt.inner else {
        return validate_eip0045_profile_view(None).map_err(Into::into);
    };
    let raw_seal = succinct.get_seal_bytes();
    validate_eip0045_profile_view(Some(SuccinctProfileView {
        hashfn: &succinct.hashfn,
        control_id: succinct.control_id.as_bytes(),
        seal_words: &succinct.seal,
        raw_seal: &raw_seal,
    }))
    .map_err(Into::into)
}

fn validate_public_journal_v2(
    journal: &[u8],
    expected_statement: &[u8; EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES],
) -> Result<(), ApplicationHostErrorV2> {
    if journal.len() != EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES {
        return Err(HostError::JournalLength {
            expected: EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES,
            actual: journal.len(),
        }
        .into());
    }
    if journal != expected_statement {
        return Err(HostError::JournalMismatch.into());
    }
    let statement = decode_eip0045_bridge_application_statement_v2(journal)?;
    if statement.program_id != method_program_id_v2() {
        return Err(HostError::ProgramId.into());
    }
    Ok(())
}

fn validate_public_journal_for_profile_v2(
    expected_statement: &[u8; EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES],
    expected_contract_id: [u8; 32],
) -> Result<(), ApplicationHostErrorV2> {
    validate_public_journal_v2(expected_statement, expected_statement)?;
    let statement = decode_eip0045_bridge_application_statement_v2(expected_statement)?;
    if statement.profile_id != EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID {
        return Err(HostError::ProfileId.into());
    }
    if statement.contract_id != expected_contract_id {
        return Err(ApplicationHostErrorV2::ContractId);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_validity_composition::test_vectors::{
        native_bridge_application_validity_fixture_for_profile_and_contract_v2,
        native_bridge_validity_fixture_for_profile_and_contract_v1,
    };

    const SYNTHETIC_APPLICATION_CONSUMER_ID: [u8; 32] = [0xd6; 32];

    #[test]
    fn binds_the_application_statement_to_a_distinct_method_and_consumer() {
        let expected_method_id: [u8; 32] =
            hex::decode("230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c")
                .unwrap()
                .try_into()
                .unwrap();
        assert_eq!(method_program_id_v2(), expected_method_id);
        assert_ne!(method_program_id_v2(), super::super::method_program_id());

        let fixture = native_bridge_application_validity_fixture_for_profile_and_contract_v2(
            EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
            method_program_id_v2(),
            SYNTHETIC_APPLICATION_CONSUMER_ID,
        );
        validate_public_journal_for_profile_v2(
            &fixture.statement,
            SYNTHETIC_APPLICATION_CONSUMER_ID,
        )
        .unwrap();

        let mut wrong_program = fixture.statement;
        wrong_program[91] ^= 1;
        assert!(matches!(
            validate_public_journal_v2(&wrong_program, &wrong_program),
            Err(ApplicationHostErrorV2::Host(HostError::ProgramId))
        ));

        let v1 = native_bridge_validity_fixture_for_profile_and_contract_v1(
            EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
            super::super::method_program_id(),
            [0xd4; 32],
        );
        assert!(matches!(
            validate_public_journal_v2(&v1.statement, &fixture.statement),
            Err(ApplicationHostErrorV2::Host(
                HostError::JournalLength { .. }
            ))
        ));
        assert!(matches!(
            super::super::validate_public_journal(&fixture.statement, &v1.statement),
            Err(HostError::JournalLength { .. })
        ));
    }

    #[test]
    fn rejects_profile_and_consumer_substitution_independently() {
        let fixture = native_bridge_application_validity_fixture_for_profile_and_contract_v2(
            EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
            method_program_id_v2(),
            SYNTHETIC_APPLICATION_CONSUMER_ID,
        );

        let mut wrong_profile = fixture.statement;
        wrong_profile[59] ^= 1;
        assert!(matches!(
            validate_public_journal_for_profile_v2(
                &wrong_profile,
                SYNTHETIC_APPLICATION_CONSUMER_ID
            ),
            Err(ApplicationHostErrorV2::Host(HostError::ProfileId))
        ));

        assert!(matches!(
            validate_public_journal_for_profile_v2(&fixture.statement, [0xd7; 32]),
            Err(ApplicationHostErrorV2::ContractId)
        ));
    }
}
