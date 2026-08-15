//! Host binding for the corrected pooled-reserve burn V4 guest.
//!
//! This preactivation surface binds the corrected method to the exact reusable EIP-0045 verifier
//! profile and one caller-selected consumer identity. It does not export proof transport, activate
//! an Ergo consumer, or authorize settlement.

#[cfg(feature = "local-prove")]
use bridge_validity_composition::MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V4_BYTES;
use bridge_validity_statement::{
    decode_eip0045_pooled_reserve_burn_statement_v4, Eip0045PooledReserveBurnStatementV4,
    StatementError, EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES,
};
#[cfg(feature = "local-prove")]
use bridge_validity_zkvm_methods::BRIDGE_VALIDITY_GUEST_V4_ELF;
use bridge_validity_zkvm_methods::BRIDGE_VALIDITY_GUEST_V4_ID;
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

/// Pooled-reserve V4 host rejection without changing the frozen V1/V2 host APIs.
#[derive(Debug, Error)]
pub enum PooledReserveBurnHostErrorV4 {
    /// Shared receipt, method, or journal validation failed.
    #[error(transparent)]
    Host(#[from] HostError),
    /// The 1,139-byte pooled-reserve burn statement is not canonical.
    #[error("invalid pooled-reserve burn V4 public statement: {0}")]
    Statement(#[from] StatementError),
    /// The statement does not carry the exact reusable EIP-0045 verifier profile.
    #[error("public statement profile ID differs from the frozen EIP-0045 verifier profile")]
    VerifierProfileId,
    /// The statement is not bound to the exact consumer proposition expected by the caller.
    #[error("public statement contract ID differs from the expected V4 consumer")]
    ContractId,
}

/// Return the exact corrected V4 image identity as canonical digest bytes.
pub fn method_program_id_v4() -> [u8; 32] {
    let digest: Digest = BRIDGE_VALIDITY_GUEST_V4_ID.into();
    digest
        .as_bytes()
        .try_into()
        .expect("RISC Zero digest is 32 bytes")
}

/// Build and verify one real local non-dev succinct V4 proof candidate.
///
/// The candidate remains preactivation conformance evidence. Producing it does not activate the
/// verifier profile, admit a tracker transition, or authorize settlement.
#[cfg(feature = "local-prove")]
pub fn prove_and_verify_pooled_reserve_burn_witness_v4(
    encoded_witness: &[u8],
    expected_statement: &[u8; EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES],
    expected_contract_id: [u8; 32],
) -> Result<VerifiedProofRun, PooledReserveBurnHostErrorV4> {
    if encoded_witness.len() > MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V4_BYTES {
        return Err(HostError::WitnessTooLarge {
            actual: encoded_witness.len(),
            max: MAX_POOLED_RESERVE_BURN_GUEST_WITNESS_V4_BYTES,
        }
        .into());
    }
    let statement = validate_public_journal_v4(expected_statement, expected_statement)?;
    validate_expected_binding_v4(&statement, expected_contract_id)?;

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
    let prover = LocalProver::new("bridge-eip0045-risc0-v3-pooled-reserve-burn-v4");
    let ProveInfo {
        receipt,
        stats,
        work_receipt,
        ..
    } = prover
        .prove_with_ctx(env, &verifier_context, BRIDGE_VALIDITY_GUEST_V4_ELF, &opts)
        .map_err(HostError::Zkvm)?;
    if work_receipt.is_some() {
        return Err(HostError::WorkReceipt.into());
    }
    receipt
        .verify_with_context(&verifier_context, BRIDGE_VALIDITY_GUEST_V4_ID)
        .map_err(HostError::Receipt)?;
    let proof_chunks = verify_pooled_reserve_burn_profile_receipt_v4(
        &receipt,
        expected_statement,
        expected_contract_id,
    )?;
    Ok(VerifiedProofRun {
        receipt,
        proof_chunks,
        stats,
    })
}

/// Verify one receipt against the corrected V4 method and exact profile/consumer binding.
///
/// Success is method-level engineering evidence only. It does not establish that the supplied
/// consumer is reviewed or activated, and it grants no mint, payout, tracker-admission, signing,
/// submission, or broadcast authority.
pub fn verify_pooled_reserve_burn_profile_receipt_v4(
    receipt: &Receipt,
    expected_statement: &[u8; EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES],
    expected_contract_id: [u8; 32],
) -> Result<[Vec<u8>; 4], PooledReserveBurnHostErrorV4> {
    receipt
        .verify(BRIDGE_VALIDITY_GUEST_V4_ID)
        .map_err(HostError::Receipt)?;
    let statement = validate_public_journal_v4(&receipt.journal.bytes, expected_statement)?;
    validate_expected_binding_v4(&statement, expected_contract_id)?;
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

fn validate_public_journal_v4(
    journal: &[u8],
    expected_statement: &[u8; EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES],
) -> Result<Eip0045PooledReserveBurnStatementV4, PooledReserveBurnHostErrorV4> {
    if journal.len() != EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES {
        return Err(HostError::JournalLength {
            expected: EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES,
            actual: journal.len(),
        }
        .into());
    }
    if journal != expected_statement {
        return Err(HostError::JournalMismatch.into());
    }
    let statement = decode_eip0045_pooled_reserve_burn_statement_v4(journal)?;
    if statement.program_id != method_program_id_v4() {
        return Err(HostError::ProgramId.into());
    }
    Ok(statement)
}

fn validate_expected_binding_v4(
    statement: &Eip0045PooledReserveBurnStatementV4,
    expected_contract_id: [u8; 32],
) -> Result<(), PooledReserveBurnHostErrorV4> {
    if statement.profile_id != EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID {
        return Err(PooledReserveBurnHostErrorV4::VerifierProfileId);
    }
    if statement.contract_id != expected_contract_id {
        return Err(PooledReserveBurnHostErrorV4::ContractId);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_validity_composition::test_vectors::{
        native_bridge_application_validity_fixture_for_profile_and_contract_v2,
        native_bridge_validity_fixture_for_profile_and_contract_v1,
        native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v4,
    };
    use bridge_validity_statement::POOLED_RESERVE_BURN_V4_REJECTED_APPLICATION_V2_PROGRAM_ID;

    const SYNTHETIC_CONSUMER_ID: [u8; 32] = [0xd8; 32];

    #[test]
    fn binds_the_v4_statement_to_the_corrected_program_and_exact_profile() {
        let expected_method_id: [u8; 32] =
            hex::decode("ad8ad97a4a060059e70e793fc10a311d1e16fbe05b7cdcbeb58aa597a60b3fe4")
                .unwrap()
                .try_into()
                .unwrap();
        assert_eq!(method_program_id_v4(), expected_method_id);
        assert_ne!(method_program_id_v4(), super::super::method_program_id());
        assert_ne!(method_program_id_v4(), super::super::method_program_id_v2());

        let fixture =
            native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v4(
                super::super::EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
                method_program_id_v4(),
                SYNTHETIC_CONSUMER_ID,
            );
        let statement = validate_public_journal_v4(&fixture.statement, &fixture.statement).unwrap();
        validate_expected_binding_v4(&statement, SYNTHETIC_CONSUMER_ID).unwrap();
    }

    #[test]
    fn rejects_program_profile_contract_and_statement_family_substitution() {
        let fixture =
            native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v4(
                super::super::EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
                method_program_id_v4(),
                SYNTHETIC_CONSUMER_ID,
            );

        let mut wrong_program = fixture.statement;
        wrong_program[91] ^= 1;
        assert!(matches!(
            validate_public_journal_v4(&wrong_program, &wrong_program),
            Err(PooledReserveBurnHostErrorV4::Host(HostError::ProgramId))
        ));

        let wrong_profile_fixture =
            native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v4(
                [0xc4; 32],
                method_program_id_v4(),
                SYNTHETIC_CONSUMER_ID,
            );
        let wrong_profile_statement = validate_public_journal_v4(
            &wrong_profile_fixture.statement,
            &wrong_profile_fixture.statement,
        )
        .unwrap();
        assert!(matches!(
            validate_expected_binding_v4(&wrong_profile_statement, SYNTHETIC_CONSUMER_ID),
            Err(PooledReserveBurnHostErrorV4::VerifierProfileId)
        ));
        let statement = validate_public_journal_v4(&fixture.statement, &fixture.statement).unwrap();
        let mut wrong_contract = SYNTHETIC_CONSUMER_ID;
        wrong_contract[0] ^= 1;
        assert!(matches!(
            validate_expected_binding_v4(&statement, wrong_contract),
            Err(PooledReserveBurnHostErrorV4::ContractId)
        ));

        let mut wrong_expected = fixture.statement;
        wrong_expected[0] ^= 1;
        assert!(matches!(
            validate_public_journal_v4(&fixture.statement, &wrong_expected),
            Err(PooledReserveBurnHostErrorV4::Host(
                HostError::JournalMismatch
            ))
        ));

        let v1 = native_bridge_validity_fixture_for_profile_and_contract_v1(
            super::super::EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
            super::super::method_program_id(),
            [0xd4; 32],
        );
        assert!(matches!(
            validate_public_journal_v4(&v1.statement, &fixture.statement),
            Err(PooledReserveBurnHostErrorV4::Host(
                HostError::JournalLength { .. }
            ))
        ));

        let v2 = native_bridge_application_validity_fixture_for_profile_and_contract_v2(
            super::super::EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
            super::super::method_program_id_v2(),
            [0xd6; 32],
        );
        assert!(matches!(
            validate_public_journal_v4(&v2.statement, &fixture.statement),
            Err(PooledReserveBurnHostErrorV4::Host(
                HostError::JournalLength { .. }
            ))
        ));

        let mut aliased_program = fixture.statement;
        aliased_program[91..123]
            .copy_from_slice(&POOLED_RESERVE_BURN_V4_REJECTED_APPLICATION_V2_PROGRAM_ID);
        assert!(matches!(
            validate_public_journal_v4(&aliased_program, &aliased_program),
            Err(PooledReserveBurnHostErrorV4::Statement(_))
        ));
    }
}
