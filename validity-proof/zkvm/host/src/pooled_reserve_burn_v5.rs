//! Portable host binding for the frozen Sudo-absent pooled-reserve burn V5 guest.
//!
//! This preactivation verifier requires the exact V5 method, statement family, reusable EIP-0045
//! profile, caller-supplied consumer identity, and canonical succinct-seal grammar. It does not
//! generate proofs, activate an Ergo consumer, admit a tracker transition, or authorize funds.

use bridge_validity_statement::{
    decode_eip0045_pooled_reserve_burn_statement_v5, Eip0045PooledReserveBurnStatementV5,
    StatementError, EIP0045_POOLED_RESERVE_BURN_STATEMENT_V5_BYTES,
};
use bridge_validity_zkvm_methods::BRIDGE_VALIDITY_GUEST_V5_ID;
use risc0_zkvm::{Digest, InnerReceipt, Receipt};
use thiserror::Error;

use super::{
    validate_eip0045_profile_view, HostError, SuccinctProfileView,
    EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
};

/// Sudo-absent V5 host rejection without changing any frozen V1/V2/V4 API.
#[derive(Debug, Error)]
pub enum PooledReserveBurnHostErrorV5 {
    /// Shared receipt, method, journal, or succinct-profile validation failed.
    #[error(transparent)]
    Host(#[from] HostError),
    /// The 1,140-byte Sudo-absent statement is not canonical.
    #[error("invalid pooled-reserve burn V5 public statement: {0}")]
    Statement(#[from] StatementError),
    /// The statement does not carry the exact reusable EIP-0045 verifier profile.
    #[error("public statement profile ID differs from the frozen EIP-0045 verifier profile")]
    VerifierProfileId,
    /// The statement is not bound to the exact consumer proposition expected by the caller.
    #[error("public statement contract ID differs from the expected V5 consumer")]
    ContractId,
}

/// Return the exact frozen V5 image identity as canonical digest bytes.
pub fn method_program_id_v5() -> [u8; 32] {
    let digest: Digest = BRIDGE_VALIDITY_GUEST_V5_ID.into();
    digest
        .as_bytes()
        .try_into()
        .expect("RISC Zero digest is 32 bytes")
}

/// Verify one receipt against the frozen V5 method and exact profile/consumer binding.
///
/// Success is portable preactivation engineering evidence only. It does not establish that the
/// expected consumer is reviewed, deployed, or activated, and grants no mint, payout,
/// tracker-admission, signing, submission, broadcast, or funds authority.
pub fn verify_pooled_reserve_burn_profile_receipt_v5(
    receipt: &Receipt,
    expected_statement: &[u8; EIP0045_POOLED_RESERVE_BURN_STATEMENT_V5_BYTES],
    expected_contract_id: [u8; 32],
) -> Result<[Vec<u8>; 4], PooledReserveBurnHostErrorV5> {
    receipt
        .verify(BRIDGE_VALIDITY_GUEST_V5_ID)
        .map_err(HostError::Receipt)?;
    let InnerReceipt::Succinct(succinct) = &receipt.inner else {
        return validate_candidate_v5(
            &receipt.journal.bytes,
            expected_statement,
            expected_contract_id,
            None,
        );
    };
    let raw_seal = succinct.get_seal_bytes();
    validate_candidate_v5(
        &receipt.journal.bytes,
        expected_statement,
        expected_contract_id,
        Some(SuccinctProfileView {
            hashfn: &succinct.hashfn,
            control_id: succinct.control_id.as_bytes(),
            seal_words: &succinct.seal,
            raw_seal: &raw_seal,
        }),
    )
}

fn validate_candidate_v5(
    journal: &[u8],
    expected_statement: &[u8; EIP0045_POOLED_RESERVE_BURN_STATEMENT_V5_BYTES],
    expected_contract_id: [u8; 32],
    profile_view: Option<SuccinctProfileView<'_>>,
) -> Result<[Vec<u8>; 4], PooledReserveBurnHostErrorV5> {
    let statement = validate_public_journal_v5(journal, expected_statement)?;
    validate_expected_binding_v5(&statement, expected_contract_id)?;
    validate_eip0045_profile_view(profile_view).map_err(Into::into)
}

fn validate_public_journal_v5(
    journal: &[u8],
    expected_statement: &[u8; EIP0045_POOLED_RESERVE_BURN_STATEMENT_V5_BYTES],
) -> Result<Eip0045PooledReserveBurnStatementV5, PooledReserveBurnHostErrorV5> {
    if journal.len() != EIP0045_POOLED_RESERVE_BURN_STATEMENT_V5_BYTES {
        return Err(HostError::JournalLength {
            expected: EIP0045_POOLED_RESERVE_BURN_STATEMENT_V5_BYTES,
            actual: journal.len(),
        }
        .into());
    }
    if journal != expected_statement {
        return Err(HostError::JournalMismatch.into());
    }
    let statement = decode_eip0045_pooled_reserve_burn_statement_v5(journal)?;
    if statement.program_id != method_program_id_v5() {
        return Err(HostError::ProgramId.into());
    }
    Ok(statement)
}

fn validate_expected_binding_v5(
    statement: &Eip0045PooledReserveBurnStatementV5,
    expected_contract_id: [u8; 32],
) -> Result<(), PooledReserveBurnHostErrorV5> {
    if statement.profile_id != EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID {
        return Err(PooledReserveBurnHostErrorV5::VerifierProfileId);
    }
    if statement.contract_id != expected_contract_id {
        return Err(PooledReserveBurnHostErrorV5::ContractId);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_validity_composition::test_vectors::{
        native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v4,
        native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v5,
    };

    const SYNTHETIC_CONSUMER_ID: [u8; 32] = [0xe5; 32];

    fn canonical_profile_parts() -> (Vec<u8>, Vec<u32>, Vec<u8>) {
        let terminal_control = super::super::EIP0045_RISC0_V3_JOIN_CONTROL_ID.to_vec();
        let mut seal_words = vec![0u32; 33];
        seal_words[32] = super::super::EIP0045_RISC0_V3_OUTER_PO2;
        let raw_seal = vec![0x5a; super::super::EIP0045_RISC0_V3_RAW_SEAL_BYTES];
        (terminal_control, seal_words, raw_seal)
    }

    fn profile_view<'a>(
        terminal_control: &'a [u8],
        seal_words: &'a [u32],
        raw_seal: &'a [u8],
    ) -> SuccinctProfileView<'a> {
        SuccinctProfileView {
            hashfn: "poseidon2",
            control_id: terminal_control,
            seal_words,
            raw_seal,
        }
    }

    #[test]
    fn accepts_exact_v5_statement_consumer_profile_and_succinct_grammar() {
        let expected_method_id: [u8; 32] =
            hex::decode("bd72f52090ed45f2803767f64cde4d4314b7735f27e8d4596c4db37f1dc52a31")
                .unwrap()
                .try_into()
                .unwrap();
        assert_eq!(method_program_id_v5(), expected_method_id);
        assert_ne!(method_program_id_v5(), super::super::method_program_id_v4());

        let fixture =
            native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v5(
                EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
                method_program_id_v5(),
                SYNTHETIC_CONSUMER_ID,
            );
        let (terminal_control, seal_words, raw_seal) = canonical_profile_parts();
        let chunks = validate_candidate_v5(
            &fixture.statement,
            &fixture.statement,
            SYNTHETIC_CONSUMER_ID,
            Some(profile_view(&terminal_control, &seal_words, &raw_seal)),
        )
        .unwrap();

        assert_eq!(
            chunks.each_ref().map(Vec::len),
            super::super::EIP0045_RISC0_V3_PROOF_CHUNK_BYTES
        );
        assert_eq!(chunks.concat(), raw_seal);
    }

    #[test]
    fn rejects_v4_statement_and_program_downgrades() {
        let v5 = native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v5(
            EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
            method_program_id_v5(),
            SYNTHETIC_CONSUMER_ID,
        );
        let v4 = native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v4(
            EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
            super::super::method_program_id_v4(),
            SYNTHETIC_CONSUMER_ID,
        );
        assert!(matches!(
            validate_public_journal_v5(&v4.statement, &v5.statement),
            Err(PooledReserveBurnHostErrorV5::Host(
                HostError::JournalLength { .. }
            ))
        ));

        let v5_with_v4_program =
            native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v5(
                EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
                super::super::method_program_id_v4(),
                SYNTHETIC_CONSUMER_ID,
            );
        assert!(matches!(
            validate_public_journal_v5(
                &v5_with_v4_program.statement,
                &v5_with_v4_program.statement
            ),
            Err(PooledReserveBurnHostErrorV5::Host(HostError::ProgramId))
        ));
    }

    #[test]
    fn rejects_journal_program_profile_and_consumer_mutations_independently() {
        let fixture =
            native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v5(
                EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
                method_program_id_v5(),
                SYNTHETIC_CONSUMER_ID,
            );

        let mut wrong_expected = fixture.statement;
        wrong_expected[0] ^= 1;
        assert!(matches!(
            validate_public_journal_v5(&fixture.statement, &wrong_expected),
            Err(PooledReserveBurnHostErrorV5::Host(
                HostError::JournalMismatch
            ))
        ));

        let mut wrong_program = fixture.statement;
        wrong_program[91] ^= 1;
        assert!(matches!(
            validate_public_journal_v5(&wrong_program, &wrong_program),
            Err(PooledReserveBurnHostErrorV5::Host(HostError::ProgramId))
        ));

        let wrong_profile =
            native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v5(
                [0xc5; 32],
                method_program_id_v5(),
                SYNTHETIC_CONSUMER_ID,
            );
        let wrong_profile_statement =
            validate_public_journal_v5(&wrong_profile.statement, &wrong_profile.statement).unwrap();
        assert!(matches!(
            validate_expected_binding_v5(&wrong_profile_statement, SYNTHETIC_CONSUMER_ID),
            Err(PooledReserveBurnHostErrorV5::VerifierProfileId)
        ));

        let statement = validate_public_journal_v5(&fixture.statement, &fixture.statement).unwrap();
        let mut wrong_consumer = SYNTHETIC_CONSUMER_ID;
        wrong_consumer[0] ^= 1;
        assert!(matches!(
            validate_expected_binding_v5(&statement, wrong_consumer),
            Err(PooledReserveBurnHostErrorV5::ContractId)
        ));
    }

    #[test]
    fn rejects_each_succinct_profile_and_seal_grammar_mutation() {
        let fixture =
            native_pooled_reserve_burn_validity_fixture_for_profile_program_and_contract_v5(
                EIP0045_RISC0_V3_SUCCINCT_PROFILE_ID,
                method_program_id_v5(),
                SYNTHETIC_CONSUMER_ID,
            );
        let (terminal_control, seal_words, raw_seal) = canonical_profile_parts();

        assert!(matches!(
            validate_candidate_v5(
                &fixture.statement,
                &fixture.statement,
                SYNTHETIC_CONSUMER_ID,
                None,
            ),
            Err(PooledReserveBurnHostErrorV5::Host(HostError::ReceiptKind))
        ));
        assert!(matches!(
            validate_candidate_v5(
                &fixture.statement,
                &fixture.statement,
                SYNTHETIC_CONSUMER_ID,
                Some(SuccinctProfileView {
                    hashfn: "sha-256",
                    control_id: &terminal_control,
                    seal_words: &seal_words,
                    raw_seal: &raw_seal,
                }),
            ),
            Err(PooledReserveBurnHostErrorV5::Host(HostError::HashSuite))
        ));

        let mut wrong_terminal = terminal_control.clone();
        wrong_terminal[0] ^= 1;
        assert!(matches!(
            validate_candidate_v5(
                &fixture.statement,
                &fixture.statement,
                SYNTHETIC_CONSUMER_ID,
                Some(profile_view(&wrong_terminal, &seal_words, &raw_seal)),
            ),
            Err(PooledReserveBurnHostErrorV5::Host(
                HostError::TerminalControl
            ))
        ));

        let mut wrong_outer = seal_words.clone();
        wrong_outer[32] -= 1;
        assert!(matches!(
            validate_candidate_v5(
                &fixture.statement,
                &fixture.statement,
                SYNTHETIC_CONSUMER_ID,
                Some(profile_view(&terminal_control, &wrong_outer, &raw_seal)),
            ),
            Err(PooledReserveBurnHostErrorV5::Host(
                HostError::OuterPo2 { .. }
            ))
        ));

        let short_seal = &raw_seal[..raw_seal.len() - 1];
        assert!(matches!(
            validate_candidate_v5(
                &fixture.statement,
                &fixture.statement,
                SYNTHETIC_CONSUMER_ID,
                Some(profile_view(&terminal_control, &seal_words, short_seal)),
            ),
            Err(PooledReserveBurnHostErrorV5::Host(
                HostError::RawSealLength { .. }
            ))
        ));
    }
}
