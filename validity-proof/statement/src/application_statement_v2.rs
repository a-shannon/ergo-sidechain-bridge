//! Versioned public application binding layered over the frozen finality payload.
//!
//! Payload V3 is `domain || 0x00 || [3, 1, 2, 0] || finality_payload_v2 ||
//! application_binding_v2 || binding_digest`. The application binding uses fixed-width
//! fields in declaration order; both runtime-code sizes are unsigned big-endian `u32`.
//!
//! This codec proves only canonical byte shape and internal consistency. A guest must still
//! authenticate the binding and the nested commitment under one finalized state root, and a
//! settlement consumer must compare the resulting identities before authorizing value release.

use super::{
    array_at, decode_bridge_validity_finality_payload_v2, domain_hash, exact_array,
    BridgeValidityFinalityPayloadV2, StatementError, BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES,
    EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES, EIP0045_STATEMENT_DOMAIN,
};

/// Domain at the start of the application-bound bridge payload.
pub const BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN: &[u8] =
    b"E2S_BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3";
/// Exact semantic bytes of the causal application binding.
pub const BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES: usize = 240;
/// Exact application-bound bridge payload bytes.
pub const BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES: usize =
    BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN.len()
        + 1
        + 4
        + BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES
        + BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES
        + 32;
/// Exact standard EIP-0045 StatementV1 bytes for the bridge application family V2.
pub const EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES: usize =
    EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES + BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES;

const _: [(); 240] = [(); BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES];
const _: [(); 973] = [(); BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES];
const _: [(); 1_132] = [(); EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES];

const APPLICATION_BINDING_DOMAIN_V2: &[u8] = b"E2S_CAUSAL_APPLICATION_BINDING_V2";
const APPLICATION_PAYLOAD_PREFIX_BYTES: usize =
    BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN.len() + 1 + 4;
const FINALITY_PAYLOAD_OFFSET: usize = APPLICATION_PAYLOAD_PREFIX_BYTES;
const APPLICATION_BINDING_OFFSET: usize =
    FINALITY_PAYLOAD_OFFSET + BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES;
const APPLICATION_BINDING_DIGEST_OFFSET: usize =
    APPLICATION_BINDING_OFFSET + BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES;

const SOURCE_NETWORK_OFFSET: usize = 0;
const SIDECHAIN_OFFSET: usize = 32;
const BRIDGE_ADDRESS_OFFSET: usize = 64;
const TOKEN_ADDRESS_OFFSET: usize = 84;
const SETTLEMENT_PROFILE_OFFSET: usize = 104;
const CAUSAL_PROFILE_OFFSET: usize = 136;
const BRIDGE_CODE_HASH_OFFSET: usize = 168;
const BRIDGE_CODE_SIZE_OFFSET: usize = 200;
const TOKEN_CODE_HASH_OFFSET: usize = 204;
const TOKEN_CODE_SIZE_OFFSET: usize = 236;

/// Public identity of the frozen source application that produced a bridge event root.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BridgeCausalApplicationBindingV2 {
    /// Source Ergo network identity used by causal peg-in intents.
    pub source_network_id: [u8; 32],
    /// Exact source sidechain identity.
    pub sidechain_id: [u8; 32],
    /// Sole EVM bridge emitter frozen by causal activation.
    pub bridge_address: [u8; 20],
    /// Exact wrapped-asset token controlled by the bridge.
    pub token_address: [u8; 20],
    /// Exact Ergo settlement profile selected by source deposits.
    pub settlement_profile_id: [u8; 32],
    /// Domain-separated identity of the complete causal admission profile.
    pub causal_profile_id: [u8; 32],
    /// Exact bridge runtime-code SHA-256 frozen at activation.
    pub bridge_runtime_code_sha256: [u8; 32],
    /// Exact bridge runtime-code byte count frozen at activation.
    pub bridge_runtime_code_bytes: u32,
    /// Exact token runtime-code SHA-256 frozen at activation.
    pub token_runtime_code_sha256: [u8; 32],
    /// Exact token runtime-code byte count frozen at activation.
    pub token_runtime_code_bytes: u32,
}

/// Canonical application-bound payload for the bridge statement family V2.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BridgeValidityApplicationPayloadV3 {
    /// Frozen V2 finality payload, preserved byte-for-byte.
    pub finality: BridgeValidityFinalityPayloadV2,
    /// Exact source application whose runtime state contains the event root.
    pub application: BridgeCausalApplicationBindingV2,
    /// Domain-separated digest of the exact 240-byte application binding.
    pub application_binding_digest: [u8; 32],
    /// Exact canonical payload bytes.
    pub encoded: [u8; BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES],
}

/// Decoded bridge application statement carried by standard EIP-0045 StatementV1.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Eip0045BridgeApplicationStatementV2 {
    /// Settlement-chain domain supplied by the trusted Ergo host and equal to the source network.
    pub chain_domain_id: [u8; 32],
    /// Caller-supplied verifier-profile identity; activation remains an Ergo-host check.
    pub profile_id: [u8; 32],
    /// Caller-supplied guest image/program identity; a consumer must pin the expected guest.
    pub program_id: [u8; 32],
    /// Caller-supplied contract identity; the Ergo host derives it from the executing proposition.
    pub contract_id: [u8; 32],
    /// Strictly decoded application-bound payload.
    pub application_payload: BridgeValidityApplicationPayloadV3,
    /// Exact canonical statement bytes.
    pub encoded: [u8; EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES],
}

/// Encode one exact causal application binding.
pub fn encode_bridge_causal_application_binding_v2(
    binding: &BridgeCausalApplicationBindingV2,
) -> Result<[u8; BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES], StatementError> {
    validate_application_binding(binding)?;
    let mut encoded = [0u8; BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES];
    encoded[SOURCE_NETWORK_OFFSET..SIDECHAIN_OFFSET].copy_from_slice(&binding.source_network_id);
    encoded[SIDECHAIN_OFFSET..BRIDGE_ADDRESS_OFFSET].copy_from_slice(&binding.sidechain_id);
    encoded[BRIDGE_ADDRESS_OFFSET..TOKEN_ADDRESS_OFFSET].copy_from_slice(&binding.bridge_address);
    encoded[TOKEN_ADDRESS_OFFSET..SETTLEMENT_PROFILE_OFFSET]
        .copy_from_slice(&binding.token_address);
    encoded[SETTLEMENT_PROFILE_OFFSET..CAUSAL_PROFILE_OFFSET]
        .copy_from_slice(&binding.settlement_profile_id);
    encoded[CAUSAL_PROFILE_OFFSET..BRIDGE_CODE_HASH_OFFSET]
        .copy_from_slice(&binding.causal_profile_id);
    encoded[BRIDGE_CODE_HASH_OFFSET..BRIDGE_CODE_SIZE_OFFSET]
        .copy_from_slice(&binding.bridge_runtime_code_sha256);
    encoded[BRIDGE_CODE_SIZE_OFFSET..TOKEN_CODE_HASH_OFFSET]
        .copy_from_slice(&binding.bridge_runtime_code_bytes.to_be_bytes());
    encoded[TOKEN_CODE_HASH_OFFSET..TOKEN_CODE_SIZE_OFFSET]
        .copy_from_slice(&binding.token_runtime_code_sha256);
    encoded[TOKEN_CODE_SIZE_OFFSET..]
        .copy_from_slice(&binding.token_runtime_code_bytes.to_be_bytes());
    Ok(encoded)
}

/// Decode one exact causal application binding.
pub fn decode_bridge_causal_application_binding_v2(
    bytes: &[u8],
) -> Result<BridgeCausalApplicationBindingV2, StatementError> {
    let encoded = exact_array::<BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES>(
        bytes,
        "bridge causal application binding V2",
    )?;
    let binding = BridgeCausalApplicationBindingV2 {
        source_network_id: array_at(&encoded, SOURCE_NETWORK_OFFSET),
        sidechain_id: array_at(&encoded, SIDECHAIN_OFFSET),
        bridge_address: array_at(&encoded, BRIDGE_ADDRESS_OFFSET),
        token_address: array_at(&encoded, TOKEN_ADDRESS_OFFSET),
        settlement_profile_id: array_at(&encoded, SETTLEMENT_PROFILE_OFFSET),
        causal_profile_id: array_at(&encoded, CAUSAL_PROFILE_OFFSET),
        bridge_runtime_code_sha256: array_at(&encoded, BRIDGE_CODE_HASH_OFFSET),
        bridge_runtime_code_bytes: u32::from_be_bytes(array_at(&encoded, BRIDGE_CODE_SIZE_OFFSET)),
        token_runtime_code_sha256: array_at(&encoded, TOKEN_CODE_HASH_OFFSET),
        token_runtime_code_bytes: u32::from_be_bytes(array_at(&encoded, TOKEN_CODE_SIZE_OFFSET)),
    };
    validate_application_binding(&binding)?;
    Ok(binding)
}

/// Derive the domain-separated digest of one exact causal application binding.
pub fn derive_bridge_causal_application_binding_v2_digest(
    binding: &BridgeCausalApplicationBindingV2,
) -> Result<[u8; 32], StatementError> {
    let encoded = encode_bridge_causal_application_binding_v2(binding)?;
    Ok(domain_hash(APPLICATION_BINDING_DOMAIN_V2, &encoded))
}

/// Encode the application-bound V3 payload without altering the nested V2 finality bytes.
pub fn encode_bridge_validity_application_payload_v3(
    finality_payload: &[u8],
    application: &BridgeCausalApplicationBindingV2,
) -> Result<[u8; BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES], StatementError> {
    let finality = decode_bridge_validity_finality_payload_v2(finality_payload)?;
    let application_bytes = encode_bridge_causal_application_binding_v2(application)?;
    require_matching_sidechain(&finality, application)?;
    let application_binding_digest = domain_hash(APPLICATION_BINDING_DOMAIN_V2, &application_bytes);

    let mut encoded = [0u8; BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES];
    encoded[..BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN.len()]
        .copy_from_slice(BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN);
    encoded[BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN.len()] = 0;
    encoded
        [BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN.len() + 1..APPLICATION_PAYLOAD_PREFIX_BYTES]
        .copy_from_slice(&[3, 1, 2, 0]);
    encoded[FINALITY_PAYLOAD_OFFSET..APPLICATION_BINDING_OFFSET].copy_from_slice(&finality.encoded);
    encoded[APPLICATION_BINDING_OFFSET..APPLICATION_BINDING_DIGEST_OFFSET]
        .copy_from_slice(&application_bytes);
    encoded[APPLICATION_BINDING_DIGEST_OFFSET..].copy_from_slice(&application_binding_digest);
    Ok(encoded)
}

/// Decode and validate one exact application-bound V3 payload.
pub fn decode_bridge_validity_application_payload_v3(
    bytes: &[u8],
) -> Result<BridgeValidityApplicationPayloadV3, StatementError> {
    let encoded = exact_array::<BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES>(
        bytes,
        "bridge validity application payload V3",
    )?;
    if &encoded[..BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN.len()]
        != BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN
        || encoded[BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN.len()] != 0
        || encoded[BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN.len() + 1
            ..APPLICATION_PAYLOAD_PREFIX_BYTES]
            != [3, 1, 2, 0]
    {
        return Err(StatementError::Discriminator(
            "bridge application payload domain, version, hash, profile, or flags",
        ));
    }

    let finality = decode_bridge_validity_finality_payload_v2(
        &encoded[FINALITY_PAYLOAD_OFFSET..APPLICATION_BINDING_OFFSET],
    )?;
    let application = decode_bridge_causal_application_binding_v2(
        &encoded[APPLICATION_BINDING_OFFSET..APPLICATION_BINDING_DIGEST_OFFSET],
    )?;
    require_matching_sidechain(&finality, &application)?;
    let application_binding_digest = array_at::<32>(&encoded, APPLICATION_BINDING_DIGEST_OFFSET);
    let expected_digest = domain_hash(
        APPLICATION_BINDING_DOMAIN_V2,
        &encoded[APPLICATION_BINDING_OFFSET..APPLICATION_BINDING_DIGEST_OFFSET],
    );
    if application_binding_digest != expected_digest {
        return Err(StatementError::PayloadBinding(
            "causal application binding digest",
        ));
    }

    Ok(BridgeValidityApplicationPayloadV3 {
        finality,
        application,
        application_binding_digest,
        encoded,
    })
}

/// Encode bridge statement family V2 inside the standard EIP-0045 StatementV1 envelope.
pub fn encode_eip0045_bridge_application_statement_v2(
    chain_domain_id: [u8; 32],
    profile_id: [u8; 32],
    program_id: [u8; 32],
    contract_id: [u8; 32],
    application_payload: &[u8],
) -> Result<[u8; EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES], StatementError> {
    validate_outer_identities(&chain_domain_id, &profile_id, &program_id, &contract_id)?;
    let payload = decode_bridge_validity_application_payload_v3(application_payload)?;
    require_matching_settlement_network(&chain_domain_id, &payload.application)?;
    let mut encoded = [0u8; EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES];
    encoded[..26].copy_from_slice(EIP0045_STATEMENT_DOMAIN);
    encoded[26] = 1;
    encoded[27..59].copy_from_slice(&chain_domain_id);
    encoded[59..91].copy_from_slice(&profile_id);
    encoded[91..123].copy_from_slice(&program_id);
    encoded[123..155].copy_from_slice(&contract_id);
    encoded[155..159]
        .copy_from_slice(&(BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES as u32).to_le_bytes());
    encoded[159..].copy_from_slice(&payload.encoded);
    Ok(encoded)
}

/// Decode bridge statement family V2 from the standard EIP-0045 StatementV1 envelope.
pub fn decode_eip0045_bridge_application_statement_v2(
    bytes: &[u8],
) -> Result<Eip0045BridgeApplicationStatementV2, StatementError> {
    let encoded = exact_array::<EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES>(
        bytes,
        "EIP-0045 bridge application statement V2",
    )?;
    if &encoded[..26] != EIP0045_STATEMENT_DOMAIN || encoded[26] != 1 {
        return Err(StatementError::EipStatement("domain or standard version"));
    }
    let payload_length = u32::from_le_bytes(array_at::<4>(&encoded, 155)) as usize;
    if payload_length != BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES {
        return Err(StatementError::EipStatement("application payload length"));
    }
    let chain_domain_id = array_at::<32>(&encoded, 27);
    let profile_id = array_at::<32>(&encoded, 59);
    let program_id = array_at::<32>(&encoded, 91);
    let contract_id = array_at::<32>(&encoded, 123);
    validate_outer_identities(&chain_domain_id, &profile_id, &program_id, &contract_id)?;
    let application_payload = decode_bridge_validity_application_payload_v3(&encoded[159..])?;
    require_matching_settlement_network(&chain_domain_id, &application_payload.application)?;
    Ok(Eip0045BridgeApplicationStatementV2 {
        chain_domain_id,
        profile_id,
        program_id,
        contract_id,
        application_payload,
        encoded,
    })
}

fn validate_application_binding(
    binding: &BridgeCausalApplicationBindingV2,
) -> Result<(), StatementError> {
    for (value, field) in [
        (binding.source_network_id.as_slice(), "source network ID"),
        (binding.sidechain_id.as_slice(), "sidechain ID"),
        (binding.bridge_address.as_slice(), "bridge address"),
        (binding.token_address.as_slice(), "token address"),
        (
            binding.settlement_profile_id.as_slice(),
            "settlement profile ID",
        ),
        (binding.causal_profile_id.as_slice(), "causal profile ID"),
        (
            binding.bridge_runtime_code_sha256.as_slice(),
            "bridge runtime-code hash",
        ),
        (
            binding.token_runtime_code_sha256.as_slice(),
            "token runtime-code hash",
        ),
    ] {
        if value.iter().all(|byte| *byte == 0) {
            return Err(StatementError::PayloadBinding(field));
        }
    }
    if binding.bridge_address == binding.token_address {
        return Err(StatementError::PayloadBinding(
            "bridge and token addresses alias",
        ));
    }
    if binding.bridge_runtime_code_bytes == 0 {
        return Err(StatementError::PayloadBinding("bridge runtime-code size"));
    }
    if binding.token_runtime_code_bytes == 0 {
        return Err(StatementError::PayloadBinding("token runtime-code size"));
    }
    Ok(())
}

fn require_matching_sidechain(
    finality: &BridgeValidityFinalityPayloadV2,
    application: &BridgeCausalApplicationBindingV2,
) -> Result<(), StatementError> {
    if finality.checkpoint[4..36] != application.sidechain_id {
        return Err(StatementError::PayloadBinding(
            "application/checkpoint sidechain ID",
        ));
    }
    Ok(())
}

fn require_matching_settlement_network(
    chain_domain_id: &[u8; 32],
    application: &BridgeCausalApplicationBindingV2,
) -> Result<(), StatementError> {
    if chain_domain_id != &application.source_network_id {
        return Err(StatementError::PayloadBinding(
            "application/settlement chain domain",
        ));
    }
    Ok(())
}

fn validate_outer_identities(
    chain_domain_id: &[u8; 32],
    profile_id: &[u8; 32],
    program_id: &[u8; 32],
    contract_id: &[u8; 32],
) -> Result<(), StatementError> {
    for (value, field) in [
        (chain_domain_id, "zero chain domain ID"),
        (profile_id, "zero verifier profile ID"),
        (program_id, "zero program ID"),
        (contract_id, "zero contract ID"),
    ] {
        if value.iter().all(|byte| *byte == 0) {
            return Err(StatementError::EipStatement(field));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct FinalityVector {
        input: FinalityInput,
        expected: FinalityExpected,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FinalityInput {
        profile_id_hex: String,
        program_id_hex: String,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FinalityExpected {
        encoded_payload_hex: String,
        contract_id_hex: String,
    }

    #[test]
    fn round_trips_application_binding_payload_and_standard_statement() {
        let vector = finality_vector();
        let finality = hex_bytes(&vector.expected.encoded_payload_hex);
        let application = application_binding();
        let binding_bytes = encode_bridge_causal_application_binding_v2(&application).unwrap();
        assert_eq!(
            decode_bridge_causal_application_binding_v2(&binding_bytes).unwrap(),
            application,
        );
        assert_eq!(&binding_bytes[200..204], &4_104u32.to_be_bytes());
        assert_eq!(&binding_bytes[236..240], &2_356u32.to_be_bytes());

        let payload =
            encode_bridge_validity_application_payload_v3(&finality, &application).unwrap();
        let decoded = decode_bridge_validity_application_payload_v3(&payload).unwrap();
        assert_eq!(decoded.finality.encoded.as_slice(), finality);
        assert_eq!(decoded.application, application);
        assert_eq!(
            decoded.application_binding_digest,
            derive_bridge_causal_application_binding_v2_digest(&application).unwrap(),
        );
        assert_eq!(
            decoded.application_binding_digest,
            hex_array("57575455a76c1e7b081d79fab7144f1b6218da89bc4687d7130880a7908ea39a"),
        );
        assert_eq!(
            crate::blake2b256(&payload),
            hex_array("56af0855131d7c4282d98169ade642b5a3c66b0964b062904190644a75a140df"),
        );

        let statement = encode_eip0045_bridge_application_statement_v2(
            application.source_network_id,
            hex_array(&vector.input.profile_id_hex),
            hex_array(&vector.input.program_id_hex),
            hex_array(&vector.expected.contract_id_hex),
            &payload,
        )
        .unwrap();
        let decoded = decode_eip0045_bridge_application_statement_v2(&statement).unwrap();
        assert_eq!(decoded.application_payload.encoded, payload);
        assert_eq!(decoded.encoded, statement);
        assert_eq!(
            crate::blake2b256(&statement),
            hex_array("5c84430f77d40e56de4aa577e36c88a847d7e34bb4365cbc53d097d46ea71e14"),
        );
    }

    #[test]
    fn rejects_zero_alias_and_empty_runtime_binding_fields() {
        let canonical = application_binding();
        for mutate in 0..10 {
            let mut changed = canonical.clone();
            match mutate {
                0 => changed.source_network_id.fill(0),
                1 => changed.sidechain_id.fill(0),
                2 => changed.bridge_address.fill(0),
                3 => changed.token_address.fill(0),
                4 => changed.settlement_profile_id.fill(0),
                5 => changed.causal_profile_id.fill(0),
                6 => changed.bridge_runtime_code_sha256.fill(0),
                7 => changed.bridge_runtime_code_bytes = 0,
                8 => changed.token_runtime_code_sha256.fill(0),
                9 => changed.token_runtime_code_bytes = 0,
                _ => unreachable!(),
            }
            assert!(
                encode_bridge_causal_application_binding_v2(&changed).is_err(),
                "mutation {mutate}",
            );
        }

        let mut aliased = canonical;
        aliased.token_address = aliased.bridge_address;
        assert_eq!(
            encode_bridge_causal_application_binding_v2(&aliased),
            Err(StatementError::PayloadBinding(
                "bridge and token addresses alias"
            )),
        );
    }

    #[test]
    fn rejects_each_uncoordinated_payload_binding_substitution() {
        let vector = finality_vector();
        let finality = hex_bytes(&vector.expected.encoded_payload_hex);
        let application = application_binding();
        let payload =
            encode_bridge_validity_application_payload_v3(&finality, &application).unwrap();

        for binding_offset in [0usize, 32, 64, 84, 104, 136, 168, 200, 204, 236] {
            let mut changed = payload;
            changed[APPLICATION_BINDING_OFFSET + binding_offset] ^= 1;
            let expected = if binding_offset == 32 {
                StatementError::PayloadBinding("application/checkpoint sidechain ID")
            } else {
                StatementError::PayloadBinding("causal application binding digest")
            };
            assert_eq!(
                decode_bridge_validity_application_payload_v3(&changed),
                Err(expected),
                "binding offset {binding_offset}"
            );
        }
    }

    #[test]
    fn keeps_self_consistent_application_reencoding_structural_only() {
        let vector = finality_vector();
        let finality = hex_bytes(&vector.expected.encoded_payload_hex);
        let mut application = application_binding();
        application.bridge_address[0] ^= 1;

        let payload =
            encode_bridge_validity_application_payload_v3(&finality, &application).unwrap();
        let decoded = decode_bridge_validity_application_payload_v3(&payload).unwrap();
        assert_eq!(decoded.application, application);
        assert_eq!(
            decoded.application_binding_digest,
            derive_bridge_causal_application_binding_v2_digest(&application).unwrap(),
        );
    }

    #[test]
    fn rejects_payload_sidechain_discriminator_digest_and_outer_drift() {
        let vector = finality_vector();
        let finality = hex_bytes(&vector.expected.encoded_payload_hex);
        let application = application_binding();
        let payload =
            encode_bridge_validity_application_payload_v3(&finality, &application).unwrap();

        let discriminator_offset = BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_DOMAIN.len() + 1;
        for offset in 0..4 {
            let mut changed = payload;
            changed[discriminator_offset + offset] ^= 0x80;
            assert_eq!(
                decode_bridge_validity_application_payload_v3(&changed),
                Err(StatementError::Discriminator(
                    "bridge application payload domain, version, hash, profile, or flags"
                )),
                "discriminator offset {offset}",
            );
        }
        let mut changed = payload;
        changed[0] ^= 0x80;
        assert!(matches!(
            decode_bridge_validity_application_payload_v3(&changed),
            Err(StatementError::Discriminator(_))
        ));
        let mut changed = payload;
        changed[FINALITY_PAYLOAD_OFFSET] ^= 0x80;
        assert!(decode_bridge_validity_application_payload_v3(&changed).is_err());
        let mut changed = payload;
        changed[APPLICATION_BINDING_DIGEST_OFFSET] ^= 0x80;
        assert_eq!(
            decode_bridge_validity_application_payload_v3(&changed),
            Err(StatementError::PayloadBinding(
                "causal application binding digest"
            )),
        );

        let mut wrong_sidechain = application.clone();
        wrong_sidechain.sidechain_id[0] ^= 1;
        assert_eq!(
            encode_bridge_validity_application_payload_v3(&finality, &wrong_sidechain),
            Err(StatementError::PayloadBinding(
                "application/checkpoint sidechain ID"
            )),
        );

        let chain_domain_id = application.source_network_id;
        let profile_id = hex_array(&vector.input.profile_id_hex);
        let program_id = hex_array(&vector.input.program_id_hex);
        let contract_id = hex_array(&vector.expected.contract_id_hex);
        let statement = encode_eip0045_bridge_application_statement_v2(
            chain_domain_id,
            profile_id,
            program_id,
            contract_id,
            &payload,
        )
        .unwrap();
        let mut wrong_chain_domain = chain_domain_id;
        wrong_chain_domain[0] ^= 1;
        assert_eq!(
            encode_eip0045_bridge_application_statement_v2(
                wrong_chain_domain,
                profile_id,
                program_id,
                contract_id,
                &payload,
            ),
            Err(StatementError::PayloadBinding(
                "application/settlement chain domain"
            )),
        );
        let mut changed = statement;
        changed[27] ^= 1;
        assert_eq!(
            decode_eip0045_bridge_application_statement_v2(&changed),
            Err(StatementError::PayloadBinding(
                "application/settlement chain domain"
            )),
        );
        for offset in [0usize, 26, 155] {
            let mut changed = statement;
            changed[offset] ^= 0x80;
            assert!(
                decode_eip0045_bridge_application_statement_v2(&changed).is_err(),
                "statement offset {offset}",
            );
        }
        for identity in 0..4 {
            let mut ids = [chain_domain_id, profile_id, program_id, contract_id];
            ids[identity].fill(0);
            assert!(
                encode_eip0045_bridge_application_statement_v2(
                    ids[0], ids[1], ids[2], ids[3], &payload,
                )
                .is_err(),
                "outer identity {identity}",
            );
        }
    }

    fn finality_vector() -> FinalityVector {
        serde_json::from_str(include_str!(
            "../../../relayer/test-vectors/bridge-validity-finality-statement-v2.json"
        ))
        .unwrap()
    }

    fn application_binding() -> BridgeCausalApplicationBindingV2 {
        BridgeCausalApplicationBindingV2 {
            source_network_id: [0xaa; 32],
            sidechain_id: [0x11; 32],
            bridge_address: [0x22; 20],
            token_address: [0x21; 20],
            settlement_profile_id: [0xbb; 32],
            causal_profile_id: hex_array(
                "80fb647618a990b24084ecceaa810822c14d2649c998908043b21120b07e67ee",
            ),
            bridge_runtime_code_sha256: hex_array(
                "ba3d364b0b10103032ebc8974a70e54e1c0aa69854212edfbc7daec81f3e3751",
            ),
            bridge_runtime_code_bytes: 4_104,
            token_runtime_code_sha256: hex_array(
                "43b2edc69034b0e801fd13efc3b5d4bfb50dc255b17d49e058c4dcf79d872989",
            ),
            token_runtime_code_bytes: 2_356,
        }
    }

    fn hex_bytes(value: &str) -> Vec<u8> {
        hex::decode(value.strip_prefix("0x").unwrap_or(value)).unwrap()
    }

    fn hex_array<const N: usize>(value: &str) -> [u8; N] {
        hex_bytes(value)
            .try_into()
            .unwrap_or_else(|bytes: Vec<u8>| panic!("expected {N} bytes, got {}", bytes.len()))
    }
}
