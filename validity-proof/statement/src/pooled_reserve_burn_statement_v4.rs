//! Canonical preactivation public inputs for pooled-reserve burn settlement.
//!
//! This module freezes byte shape and internal bindings only. It does not verify source finality,
//! prove runtime execution, activate a verifier profile, or authorize reserve settlement.

use super::{
    array_at, domain_hash, exact_array, StatementError, CHECKPOINT_BYTES, CHECKPOINT_DOMAIN,
    EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES, EIP0045_STATEMENT_DOMAIN,
};

/// Domain prefix for pooled-reserve burn public inputs V4.
pub const POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN: &[u8] =
    b"E2S_POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4";
/// Domain used to derive the mint-reservation runtime-profile identity embedded by V4.
pub const POOLED_RESERVE_MINT_RESERVATION_PROFILE_V4_DOMAIN: &[u8] =
    b"E2S_POOLED_RESERVE_MINT_RESERVATION_PROFILE_V4";
/// Frozen application V2 guest identity that V4 must never reinterpret.
pub const POOLED_RESERVE_BURN_V4_REJECTED_APPLICATION_V2_PROGRAM_ID: [u8; 32] = [
    0x23, 0x0c, 0x26, 0x8e, 0xca, 0xc5, 0x22, 0xe1, 0x5b, 0xb2, 0x08, 0x09, 0x2a, 0x51, 0x46, 0x2e,
    0x28, 0x40, 0xba, 0x05, 0x40, 0x22, 0x14, 0xc6, 0xdf, 0xda, 0x23, 0x0b, 0x9f, 0xfe, 0x11, 0x2c,
];
/// Exact SCALE bytes of `PooledReserveMintReservationRuntimeProfileV4`.
pub const POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES: usize = 349;
/// Exact bytes of the pooled-reserve burn application binding V4.
pub const POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES: usize = 485;
/// Exact bytes of pooled-reserve burn public inputs V4.
pub const POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES: usize = 980;
/// Exact bytes of the standard EIP-0045 statement carrying burn public inputs V4.
pub const EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES: usize =
    EIP0045_ERGO_STATEMENT_V1_FIXED_BYTES + POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES;

/// Domain used to bind the exact pooled-reserve burn application identity.
pub const POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN: &[u8] =
    b"E2S_POOLED_RESERVE_BURN_APPLICATION_BINDING_V4";
const PUBLIC_INPUTS_PREFIX_BYTES: usize = 45;
const BINDING_OFFSET: usize = PUBLIC_INPUTS_PREFIX_BYTES;
const BINDING_DIGEST_OFFSET: usize = 530;
const CHECKPOINT_OFFSET: usize = 562;
const CHECKPOINT_COMMITMENT_OFFSET: usize = 778;
const TARGET_STATE_ROOT_OFFSET: usize = 810;
const TRUSTED_ANCHOR_OFFSET: usize = 842;
const FINALITY_HEIGHT_OFFSET: usize = 874;
const FINALITY_HASH_OFFSET: usize = 882;
const EXTENSION_KEY_OFFSET: usize = 914;
const EXTENSION_VALUE_OFFSET: usize = 916;

const PROFILE_ID_OFFSET: usize = 349;
const SOURCE_RUNTIME_CODE_HASH_OFFSET: usize = 381;
const SOURCE_RUNTIME_CODE_BYTES_OFFSET: usize = 413;
const TRACKER_NFT_OFFSET: usize = 417;
const TRACKER_CONTRACT_OFFSET: usize = 449;
const PREACTIVATION_STATE_OFFSET: usize = 481;
const AUTHORIZATION_FLAGS_OFFSET: usize = 482;
const RESERVED_OFFSET: usize = 483;

const _: [(); 40] = [(); POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN.len()];
const _: [(); 349] = [(); POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES];
const _: [(); 485] = [(); POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES];
const _: [(); 980] = [(); POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES];
const _: [(); 1_139] = [(); EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES];

/// Strict semantic view of the exact 349-byte source runtime profile.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PooledReserveMintReservationRuntimeProfileV4 {
    /// Exact 32-byte lineage identity.
    pub lineage_id: [u8; 32],
    /// Ergo source-network identity selected by the profile.
    pub source_network_id: [u8; 32],
    /// Exact source sidechain identity.
    pub sidechain_id: [u8; 32],
    /// Sole EVM bridge address selected by the profile.
    pub bridge_address: [u8; 20],
    /// Exact EVM token address controlled by the bridge.
    pub token_address: [u8; 20],
    /// Bridge runtime-code SHA-256.
    pub bridge_runtime_code_sha256: [u8; 32],
    /// Bridge runtime-code byte count.
    pub bridge_runtime_code_bytes: u32,
    /// Token runtime-code SHA-256.
    pub token_runtime_code_sha256: [u8; 32],
    /// Token runtime-code byte count.
    pub token_runtime_code_bytes: u32,
    /// Settlement profile identity.
    pub settlement_profile_id: [u8; 32],
    /// Ergo finality-policy identity.
    pub ergo_finality_policy_id: [u8; 32],
    /// Source proof-system identity.
    pub source_proof_system_id: [u8; 32],
    /// Source proof-profile identity.
    pub source_proof_profile_id: [u8; 32],
    /// Activation height, where zero is valid.
    pub activation_height: u64,
    /// Maximum pending-block interval admitted by the profile.
    pub max_pending_blocks: u32,
}

/// Exact public application binding for pooled-reserve burn settlement V4.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PooledReserveBurnApplicationBindingV4 {
    /// Exact decoded mint-reservation runtime profile.
    pub runtime_profile: PooledReserveMintReservationRuntimeProfileV4,
    /// Domain-separated identity of the exact 349-byte runtime profile.
    pub runtime_profile_id: [u8; 32],
    /// Source runtime-code SHA-256.
    pub source_runtime_code_sha256: [u8; 32],
    /// Source runtime-code byte count.
    pub source_runtime_code_bytes: u32,
    /// Tracker singleton token ID.
    pub tracker_nft_id: [u8; 32],
    /// Settlement tracker proposition identity.
    pub settlement_tracker_contract_id: [u8; 32],
    /// Preactivation state, fixed to zero in V4.
    pub preactivation_state: u8,
    /// Authorization flags, fixed to zero in V4.
    pub authorization_flags: u8,
    /// Reserved bytes, fixed to zero in V4.
    pub reserved: [u8; 2],
}

/// Canonical pooled-reserve burn public inputs V4.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PooledReserveBurnPublicInputsV4 {
    /// Strictly decoded application binding.
    pub application_binding: PooledReserveBurnApplicationBindingV4,
    /// Domain-separated digest of the exact application binding.
    pub application_binding_digest: [u8; 32],
    /// Exact unchanged bridge checkpoint V1 bytes.
    pub checkpoint: [u8; CHECKPOINT_BYTES],
    /// Domain-separated checkpoint commitment.
    pub checkpoint_commitment: [u8; 32],
    /// State root of the target native header.
    pub target_native_state_root: [u8; 32],
    /// Reviewed source-finality trust-anchor identity.
    pub trusted_anchor_digest: [u8; 32],
    /// Finality horizon height.
    pub finality_horizon_height: u64,
    /// Finality horizon hash.
    pub finality_horizon_hash: [u8; 32],
    /// Exact `bridgeEventRoot || checkpointCommitment` extension value.
    pub extension_value: [u8; 64],
    /// Exact canonical public-input bytes.
    pub encoded: [u8; POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES],
}

/// Decoded standard EIP-0045 statement carrying pooled-reserve burn public inputs V4.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Eip0045PooledReserveBurnStatementV4 {
    /// Settlement chain-domain identity.
    pub chain_domain_id: [u8; 32],
    /// Caller-supplied verifier-profile identity.
    pub profile_id: [u8; 32],
    /// Caller-supplied guest image/program identity.
    pub program_id: [u8; 32],
    /// Executing settlement tracker proposition identity.
    pub contract_id: [u8; 32],
    /// Strictly decoded pooled-reserve burn public inputs.
    pub public_inputs: PooledReserveBurnPublicInputsV4,
    /// Exact canonical statement bytes.
    pub encoded: [u8; EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES],
}

/// Encode the exact 349-byte mint-reservation runtime profile V4.
pub fn encode_pooled_reserve_mint_reservation_runtime_profile_v4(
    profile: &PooledReserveMintReservationRuntimeProfileV4,
) -> Result<[u8; POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES], StatementError> {
    validate_runtime_profile(profile)?;
    let mut encoded = [0u8; POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES];
    encoded[0] = 4;
    encoded[1..33].copy_from_slice(&profile.lineage_id);
    encoded[33..65].copy_from_slice(&profile.source_network_id);
    encoded[65..97].copy_from_slice(&profile.sidechain_id);
    encoded[97..117].copy_from_slice(&profile.bridge_address);
    encoded[117..137].copy_from_slice(&profile.token_address);
    encoded[137..169].copy_from_slice(&profile.bridge_runtime_code_sha256);
    encoded[169..173].copy_from_slice(&profile.bridge_runtime_code_bytes.to_le_bytes());
    encoded[173..205].copy_from_slice(&profile.token_runtime_code_sha256);
    encoded[205..209].copy_from_slice(&profile.token_runtime_code_bytes.to_le_bytes());
    encoded[209..241].copy_from_slice(&profile.settlement_profile_id);
    encoded[241..273].copy_from_slice(&profile.ergo_finality_policy_id);
    encoded[273..305].copy_from_slice(&profile.source_proof_system_id);
    encoded[305..337].copy_from_slice(&profile.source_proof_profile_id);
    encoded[337..345].copy_from_slice(&profile.activation_height.to_le_bytes());
    encoded[345..349].copy_from_slice(&profile.max_pending_blocks.to_le_bytes());
    Ok(encoded)
}

/// Decode and validate the exact 349-byte mint-reservation runtime profile V4.
pub fn decode_pooled_reserve_mint_reservation_runtime_profile_v4(
    bytes: &[u8],
) -> Result<PooledReserveMintReservationRuntimeProfileV4, StatementError> {
    let encoded = exact_array::<POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES>(
        bytes,
        "pooled-reserve mint-reservation runtime profile V4",
    )?;
    if encoded[0] != 4 {
        return Err(StatementError::Discriminator(
            "pooled-reserve mint-reservation runtime profile format",
        ));
    }
    let profile = PooledReserveMintReservationRuntimeProfileV4 {
        lineage_id: array_at(&encoded, 1),
        source_network_id: array_at(&encoded, 33),
        sidechain_id: array_at(&encoded, 65),
        bridge_address: array_at(&encoded, 97),
        token_address: array_at(&encoded, 117),
        bridge_runtime_code_sha256: array_at(&encoded, 137),
        bridge_runtime_code_bytes: u32::from_le_bytes(array_at(&encoded, 169)),
        token_runtime_code_sha256: array_at(&encoded, 173),
        token_runtime_code_bytes: u32::from_le_bytes(array_at(&encoded, 205)),
        settlement_profile_id: array_at(&encoded, 209),
        ergo_finality_policy_id: array_at(&encoded, 241),
        source_proof_system_id: array_at(&encoded, 273),
        source_proof_profile_id: array_at(&encoded, 305),
        activation_height: u64::from_le_bytes(array_at(&encoded, 337)),
        max_pending_blocks: u32::from_le_bytes(array_at(&encoded, 345)),
    };
    validate_runtime_profile(&profile)?;
    Ok(profile)
}

/// Derive the domain-separated identity of the exact runtime-profile bytes.
pub fn derive_pooled_reserve_mint_reservation_profile_v4_id(
    profile: &PooledReserveMintReservationRuntimeProfileV4,
) -> Result<[u8; 32], StatementError> {
    let encoded = encode_pooled_reserve_mint_reservation_runtime_profile_v4(profile)?;
    Ok(domain_hash(
        POOLED_RESERVE_MINT_RESERVATION_PROFILE_V4_DOMAIN,
        &encoded,
    ))
}

/// Encode one exact pooled-reserve burn application binding V4.
pub fn encode_pooled_reserve_burn_application_binding_v4(
    binding: &PooledReserveBurnApplicationBindingV4,
) -> Result<[u8; POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES], StatementError> {
    validate_application_binding(binding)?;
    let profile =
        encode_pooled_reserve_mint_reservation_runtime_profile_v4(&binding.runtime_profile)?;
    let mut encoded = [0u8; POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES];
    encoded[..PROFILE_ID_OFFSET].copy_from_slice(&profile);
    encoded[PROFILE_ID_OFFSET..SOURCE_RUNTIME_CODE_HASH_OFFSET]
        .copy_from_slice(&binding.runtime_profile_id);
    encoded[SOURCE_RUNTIME_CODE_HASH_OFFSET..SOURCE_RUNTIME_CODE_BYTES_OFFSET]
        .copy_from_slice(&binding.source_runtime_code_sha256);
    encoded[SOURCE_RUNTIME_CODE_BYTES_OFFSET..TRACKER_NFT_OFFSET]
        .copy_from_slice(&binding.source_runtime_code_bytes.to_be_bytes());
    encoded[TRACKER_NFT_OFFSET..TRACKER_CONTRACT_OFFSET].copy_from_slice(&binding.tracker_nft_id);
    encoded[TRACKER_CONTRACT_OFFSET..PREACTIVATION_STATE_OFFSET]
        .copy_from_slice(&binding.settlement_tracker_contract_id);
    encoded[PREACTIVATION_STATE_OFFSET] = binding.preactivation_state;
    encoded[AUTHORIZATION_FLAGS_OFFSET] = binding.authorization_flags;
    encoded[RESERVED_OFFSET..].copy_from_slice(&binding.reserved);
    Ok(encoded)
}

/// Decode and validate one exact pooled-reserve burn application binding V4.
pub fn decode_pooled_reserve_burn_application_binding_v4(
    bytes: &[u8],
) -> Result<PooledReserveBurnApplicationBindingV4, StatementError> {
    let encoded = exact_array::<POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES>(
        bytes,
        "pooled-reserve burn application binding V4",
    )?;
    let binding = PooledReserveBurnApplicationBindingV4 {
        runtime_profile: decode_pooled_reserve_mint_reservation_runtime_profile_v4(
            &encoded[..PROFILE_ID_OFFSET],
        )?,
        runtime_profile_id: array_at(&encoded, PROFILE_ID_OFFSET),
        source_runtime_code_sha256: array_at(&encoded, SOURCE_RUNTIME_CODE_HASH_OFFSET),
        source_runtime_code_bytes: u32::from_be_bytes(array_at(
            &encoded,
            SOURCE_RUNTIME_CODE_BYTES_OFFSET,
        )),
        tracker_nft_id: array_at(&encoded, TRACKER_NFT_OFFSET),
        settlement_tracker_contract_id: array_at(&encoded, TRACKER_CONTRACT_OFFSET),
        preactivation_state: encoded[PREACTIVATION_STATE_OFFSET],
        authorization_flags: encoded[AUTHORIZATION_FLAGS_OFFSET],
        reserved: array_at(&encoded, RESERVED_OFFSET),
    };
    validate_application_binding(&binding)?;
    Ok(binding)
}

/// Derive the domain-separated digest of one exact V4 application binding.
pub fn derive_pooled_reserve_burn_application_binding_v4_digest(
    binding: &PooledReserveBurnApplicationBindingV4,
) -> Result<[u8; 32], StatementError> {
    let encoded = encode_pooled_reserve_burn_application_binding_v4(binding)?;
    Ok(domain_hash(
        POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN,
        &encoded,
    ))
}

/// Encode the exact 980-byte pooled-reserve burn public inputs V4.
pub fn encode_pooled_reserve_burn_public_inputs_v4(
    binding: &PooledReserveBurnApplicationBindingV4,
    checkpoint: &[u8],
    target_native_state_root: [u8; 32],
    trusted_anchor_digest: [u8; 32],
    finality_horizon_height: u64,
    finality_horizon_hash: [u8; 32],
) -> Result<[u8; POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES], StatementError> {
    let binding = encode_pooled_reserve_burn_application_binding_v4(binding)?;
    let checkpoint = exact_array::<CHECKPOINT_BYTES>(checkpoint, "bridge checkpoint V1")?;
    validate_payload_fields(
        &decode_pooled_reserve_burn_application_binding_v4(&binding)?,
        &checkpoint,
        &target_native_state_root,
        &trusted_anchor_digest,
        finality_horizon_height,
        &finality_horizon_hash,
    )?;
    let binding_digest = domain_hash(POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN, &binding);
    let checkpoint_commitment = domain_hash(CHECKPOINT_DOMAIN, &checkpoint);

    let mut encoded = [0u8; POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES];
    encoded[..POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN.len()]
        .copy_from_slice(POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN);
    encoded[POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN.len()] = 0;
    encoded[41..PUBLIC_INPUTS_PREFIX_BYTES].copy_from_slice(&[4, 1, 1, 0]);
    encoded[BINDING_OFFSET..BINDING_DIGEST_OFFSET].copy_from_slice(&binding);
    encoded[BINDING_DIGEST_OFFSET..CHECKPOINT_OFFSET].copy_from_slice(&binding_digest);
    encoded[CHECKPOINT_OFFSET..CHECKPOINT_COMMITMENT_OFFSET].copy_from_slice(&checkpoint);
    encoded[CHECKPOINT_COMMITMENT_OFFSET..TARGET_STATE_ROOT_OFFSET]
        .copy_from_slice(&checkpoint_commitment);
    encoded[TARGET_STATE_ROOT_OFFSET..TRUSTED_ANCHOR_OFFSET]
        .copy_from_slice(&target_native_state_root);
    encoded[TRUSTED_ANCHOR_OFFSET..FINALITY_HEIGHT_OFFSET].copy_from_slice(&trusted_anchor_digest);
    encoded[FINALITY_HEIGHT_OFFSET..FINALITY_HASH_OFFSET]
        .copy_from_slice(&finality_horizon_height.to_be_bytes());
    encoded[FINALITY_HASH_OFFSET..EXTENSION_KEY_OFFSET].copy_from_slice(&finality_horizon_hash);
    encoded[EXTENSION_KEY_OFFSET..EXTENSION_VALUE_OFFSET].copy_from_slice(&[0x04, 0x01]);
    encoded[EXTENSION_VALUE_OFFSET..EXTENSION_VALUE_OFFSET + 32]
        .copy_from_slice(&checkpoint[108..140]);
    encoded[EXTENSION_VALUE_OFFSET + 32..].copy_from_slice(&checkpoint_commitment);
    Ok(encoded)
}

/// Decode and validate the exact 980-byte pooled-reserve burn public inputs V4.
pub fn decode_pooled_reserve_burn_public_inputs_v4(
    bytes: &[u8],
) -> Result<PooledReserveBurnPublicInputsV4, StatementError> {
    let encoded = exact_array::<POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES>(
        bytes,
        "pooled-reserve burn public inputs V4",
    )?;
    if &encoded[..POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN.len()]
        != POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN
        || encoded[POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN.len()] != 0
        || encoded[41..PUBLIC_INPUTS_PREFIX_BYTES] != [4, 1, 1, 0]
    {
        return Err(StatementError::Discriminator(
            "pooled-reserve burn public-input domain, version, hash, profile, or flags",
        ));
    }

    let application_binding = decode_pooled_reserve_burn_application_binding_v4(
        &encoded[BINDING_OFFSET..BINDING_DIGEST_OFFSET],
    )?;
    let application_binding_digest = array_at::<32>(&encoded, BINDING_DIGEST_OFFSET);
    if application_binding_digest
        != domain_hash(
            POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN,
            &encoded[BINDING_OFFSET..BINDING_DIGEST_OFFSET],
        )
    {
        return Err(StatementError::PayloadBinding(
            "pooled-reserve burn application binding digest",
        ));
    }
    let checkpoint = array_at::<CHECKPOINT_BYTES>(&encoded, CHECKPOINT_OFFSET);
    validate_checkpoint(&checkpoint)?;
    let checkpoint_commitment = array_at::<32>(&encoded, CHECKPOINT_COMMITMENT_OFFSET);
    if checkpoint_commitment != domain_hash(CHECKPOINT_DOMAIN, &checkpoint) {
        return Err(StatementError::PayloadBinding("checkpoint commitment"));
    }
    let target_native_state_root = array_at::<32>(&encoded, TARGET_STATE_ROOT_OFFSET);
    let trusted_anchor_digest = array_at::<32>(&encoded, TRUSTED_ANCHOR_OFFSET);
    let finality_horizon_height =
        u64::from_be_bytes(array_at::<8>(&encoded, FINALITY_HEIGHT_OFFSET));
    let finality_horizon_hash = array_at::<32>(&encoded, FINALITY_HASH_OFFSET);
    validate_payload_fields(
        &application_binding,
        &checkpoint,
        &target_native_state_root,
        &trusted_anchor_digest,
        finality_horizon_height,
        &finality_horizon_hash,
    )?;
    if encoded[EXTENSION_KEY_OFFSET..EXTENSION_VALUE_OFFSET] != [0x04, 0x01] {
        return Err(StatementError::Discriminator("Ergo extension key"));
    }
    let extension_value = array_at::<64>(&encoded, EXTENSION_VALUE_OFFSET);
    if extension_value[..32] != checkpoint[108..140]
        || extension_value[32..] != checkpoint_commitment
    {
        return Err(StatementError::PayloadBinding("Ergo extension value"));
    }

    Ok(PooledReserveBurnPublicInputsV4 {
        application_binding,
        application_binding_digest,
        checkpoint,
        checkpoint_commitment,
        target_native_state_root,
        trusted_anchor_digest,
        finality_horizon_height,
        finality_horizon_hash,
        extension_value,
        encoded,
    })
}

/// Encode the standard EIP-0045 StatementV1 envelope for burn public inputs V4.
pub fn encode_eip0045_pooled_reserve_burn_statement_v4(
    chain_domain_id: [u8; 32],
    profile_id: [u8; 32],
    program_id: [u8; 32],
    contract_id: [u8; 32],
    public_inputs: &[u8],
) -> Result<[u8; EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES], StatementError> {
    validate_outer_identities(&chain_domain_id, &profile_id, &program_id, &contract_id)?;
    let public_inputs = decode_pooled_reserve_burn_public_inputs_v4(public_inputs)?;
    validate_outer_bindings(&chain_domain_id, &contract_id, &public_inputs)?;
    let mut encoded = [0u8; EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES];
    encoded[..26].copy_from_slice(EIP0045_STATEMENT_DOMAIN);
    encoded[26] = 1;
    encoded[27..59].copy_from_slice(&chain_domain_id);
    encoded[59..91].copy_from_slice(&profile_id);
    encoded[91..123].copy_from_slice(&program_id);
    encoded[123..155].copy_from_slice(&contract_id);
    encoded[155..159]
        .copy_from_slice(&(POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES as u32).to_le_bytes());
    encoded[159..].copy_from_slice(&public_inputs.encoded);
    Ok(encoded)
}

/// Decode the standard EIP-0045 StatementV1 envelope for burn public inputs V4.
pub fn decode_eip0045_pooled_reserve_burn_statement_v4(
    bytes: &[u8],
) -> Result<Eip0045PooledReserveBurnStatementV4, StatementError> {
    let encoded = exact_array::<EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES>(
        bytes,
        "EIP-0045 pooled-reserve burn statement V4",
    )?;
    if &encoded[..26] != EIP0045_STATEMENT_DOMAIN || encoded[26] != 1 {
        return Err(StatementError::EipStatement("domain or standard version"));
    }
    if u32::from_le_bytes(array_at::<4>(&encoded, 155)) as usize
        != POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES
    {
        return Err(StatementError::EipStatement("application payload length"));
    }
    let chain_domain_id = array_at::<32>(&encoded, 27);
    let profile_id = array_at::<32>(&encoded, 59);
    let program_id = array_at::<32>(&encoded, 91);
    let contract_id = array_at::<32>(&encoded, 123);
    validate_outer_identities(&chain_domain_id, &profile_id, &program_id, &contract_id)?;
    let public_inputs = decode_pooled_reserve_burn_public_inputs_v4(&encoded[159..])?;
    validate_outer_bindings(&chain_domain_id, &contract_id, &public_inputs)?;
    Ok(Eip0045PooledReserveBurnStatementV4 {
        chain_domain_id,
        profile_id,
        program_id,
        contract_id,
        public_inputs,
        encoded,
    })
}

fn validate_runtime_profile(
    profile: &PooledReserveMintReservationRuntimeProfileV4,
) -> Result<(), StatementError> {
    for (value, field) in [
        (profile.lineage_id.as_slice(), "lineage ID"),
        (profile.source_network_id.as_slice(), "source network ID"),
        (profile.sidechain_id.as_slice(), "sidechain ID"),
        (profile.bridge_address.as_slice(), "bridge address"),
        (profile.token_address.as_slice(), "token address"),
        (
            profile.bridge_runtime_code_sha256.as_slice(),
            "bridge runtime-code hash",
        ),
        (
            profile.token_runtime_code_sha256.as_slice(),
            "token runtime-code hash",
        ),
        (
            profile.settlement_profile_id.as_slice(),
            "settlement profile ID",
        ),
        (
            profile.ergo_finality_policy_id.as_slice(),
            "Ergo finality policy ID",
        ),
        (
            profile.source_proof_system_id.as_slice(),
            "source proof-system ID",
        ),
        (
            profile.source_proof_profile_id.as_slice(),
            "source proof-profile ID",
        ),
    ] {
        require_nonzero(value, field)?;
    }
    if profile.bridge_address == profile.token_address {
        return Err(StatementError::PayloadBinding(
            "bridge and token addresses alias",
        ));
    }
    if profile.bridge_runtime_code_bytes == 0 {
        return Err(StatementError::PayloadBinding("bridge runtime-code size"));
    }
    if profile.token_runtime_code_bytes == 0 {
        return Err(StatementError::PayloadBinding("token runtime-code size"));
    }
    if profile.max_pending_blocks == 0 {
        return Err(StatementError::PayloadBinding("maximum pending blocks"));
    }
    Ok(())
}

fn validate_application_binding(
    binding: &PooledReserveBurnApplicationBindingV4,
) -> Result<(), StatementError> {
    validate_runtime_profile(&binding.runtime_profile)?;
    if binding.runtime_profile_id
        != derive_pooled_reserve_mint_reservation_profile_v4_id(&binding.runtime_profile)?
    {
        return Err(StatementError::PayloadBinding(
            "mint-reservation runtime profile ID",
        ));
    }
    require_nonzero(
        &binding.source_runtime_code_sha256,
        "source runtime-code hash",
    )?;
    if binding.source_runtime_code_bytes == 0 {
        return Err(StatementError::PayloadBinding("source runtime-code size"));
    }
    require_nonzero(&binding.tracker_nft_id, "tracker NFT ID")?;
    require_nonzero(
        &binding.settlement_tracker_contract_id,
        "settlement tracker contract ID",
    )?;
    if binding.preactivation_state != 0
        || binding.authorization_flags != 0
        || binding.reserved != [0, 0]
    {
        return Err(StatementError::Discriminator(
            "pooled-reserve burn preactivation, authorization, or reserved bytes",
        ));
    }
    Ok(())
}

fn validate_checkpoint(checkpoint: &[u8; CHECKPOINT_BYTES]) -> Result<(), StatementError> {
    if checkpoint[..4] != [1, 1, 1, 0] {
        return Err(StatementError::Checkpoint(
            "version/hash/finality-rule/flags",
        ));
    }
    let burn_count = u32::from_be_bytes(array_at::<4>(checkpoint, 140));
    if !(1..=256).contains(&burn_count) {
        return Err(StatementError::Checkpoint("burn count"));
    }
    Ok(())
}

fn validate_payload_fields(
    binding: &PooledReserveBurnApplicationBindingV4,
    checkpoint: &[u8; CHECKPOINT_BYTES],
    target_native_state_root: &[u8; 32],
    trusted_anchor_digest: &[u8; 32],
    finality_horizon_height: u64,
    finality_horizon_hash: &[u8; 32],
) -> Result<(), StatementError> {
    validate_checkpoint(checkpoint)?;
    if checkpoint[4..36] != binding.runtime_profile.sidechain_id {
        return Err(StatementError::PayloadBinding(
            "runtime profile/checkpoint sidechain ID",
        ));
    }
    let checkpoint_height = u64::from_be_bytes(array_at::<8>(checkpoint, 36));
    if checkpoint_height < binding.runtime_profile.activation_height {
        return Err(StatementError::PayloadBinding(
            "checkpoint precedes runtime profile activation",
        ));
    }
    if finality_horizon_height < checkpoint_height {
        return Err(StatementError::PayloadBinding(
            "finality horizon precedes checkpoint",
        ));
    }
    require_nonzero(target_native_state_root, "target native state root")?;
    require_nonzero(trusted_anchor_digest, "trusted anchor digest")?;
    require_nonzero(finality_horizon_hash, "finality horizon hash")?;
    Ok(())
}

fn validate_outer_identities(
    chain_domain_id: &[u8; 32],
    profile_id: &[u8; 32],
    program_id: &[u8; 32],
    contract_id: &[u8; 32],
) -> Result<(), StatementError> {
    for (value, field) in [
        (chain_domain_id.as_slice(), "zero chain domain ID"),
        (profile_id.as_slice(), "zero verifier profile ID"),
        (program_id.as_slice(), "zero program ID"),
        (contract_id.as_slice(), "zero contract ID"),
    ] {
        if value.iter().all(|byte| *byte == 0) {
            return Err(StatementError::EipStatement(field));
        }
    }
    if program_id == &POOLED_RESERVE_BURN_V4_REJECTED_APPLICATION_V2_PROGRAM_ID {
        return Err(StatementError::EipStatement(
            "application V2 program is invalid for V4",
        ));
    }
    Ok(())
}

fn validate_outer_bindings(
    chain_domain_id: &[u8; 32],
    contract_id: &[u8; 32],
    public_inputs: &PooledReserveBurnPublicInputsV4,
) -> Result<(), StatementError> {
    let binding = &public_inputs.application_binding;
    if chain_domain_id != &binding.runtime_profile.source_network_id {
        return Err(StatementError::PayloadBinding(
            "runtime profile/settlement chain domain",
        ));
    }
    if contract_id != &binding.settlement_tracker_contract_id {
        return Err(StatementError::PayloadBinding(
            "application binding/settlement tracker contract",
        ));
    }
    Ok(())
}

fn require_nonzero(value: &[u8], field: &'static str) -> Result<(), StatementError> {
    if value.iter().all(|byte| *byte == 0) {
        return Err(StatementError::PayloadBinding(field));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn deterministic_round_trip_freezes_offsets_and_endianness() {
        let (binding, checkpoint) = fixture();
        let public_inputs = encode_pooled_reserve_burn_public_inputs_v4(
            &binding,
            &checkpoint,
            [0x91; 32],
            [0x92; 32],
            1_100,
            [0x93; 32],
        )
        .unwrap();
        let statement = encode_eip0045_pooled_reserve_burn_statement_v4(
            binding.runtime_profile.source_network_id,
            [0xa1; 32],
            [0xa2; 32],
            binding.settlement_tracker_contract_id,
            &public_inputs,
        )
        .unwrap();

        assert_eq!(public_inputs.len(), 980);
        assert_eq!(statement.len(), 1_139);
        assert_eq!(
            &public_inputs[..40],
            POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN
        );
        assert_eq!(&public_inputs[40..45], &[0, 4, 1, 1, 0]);
        assert_eq!(&public_inputs[45 + 169..45 + 173], &4_104u32.to_le_bytes());
        assert_eq!(&public_inputs[45 + 205..45 + 209], &2_356u32.to_le_bytes());
        assert_eq!(&public_inputs[45 + 337..45 + 345], &0u64.to_le_bytes());
        assert_eq!(&public_inputs[45 + 345..45 + 349], &48u32.to_le_bytes());
        assert_eq!(&public_inputs[45 + 413..45 + 417], &9_999u32.to_be_bytes());
        assert_eq!(&public_inputs[874..882], &1_100u64.to_be_bytes());
        assert_eq!(&statement[155..159], &980u32.to_le_bytes());
        assert_eq!(
            &public_inputs[530..562],
            &domain_hash(
                POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN,
                &public_inputs[45..530],
            ),
        );
        assert_eq!(
            &public_inputs[778..810],
            &domain_hash(CHECKPOINT_DOMAIN, &checkpoint),
        );
        assert_eq!(
            decode_pooled_reserve_burn_public_inputs_v4(&public_inputs)
                .unwrap()
                .encoded,
            public_inputs,
        );
        assert_eq!(
            decode_eip0045_pooled_reserve_burn_statement_v4(&statement)
                .unwrap()
                .encoded,
            statement,
        );
    }

    #[test]
    fn matches_the_shared_typescript_golden_vector_byte_for_byte() {
        let vector: Value = serde_json::from_str(include_str!(
            "../../../relayer/test-vectors/pooled-reserve-burn-statement-v4.json"
        ))
        .unwrap();
        let expected = &vector["expected"];

        let binding_bytes = vector_hex::<POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES>(
            &expected["encodedBindingHex"],
        );
        let binding = decode_pooled_reserve_burn_application_binding_v4(&binding_bytes).unwrap();
        assert_eq!(
            encode_pooled_reserve_burn_application_binding_v4(&binding).unwrap(),
            binding_bytes
        );
        assert_eq!(
            derive_pooled_reserve_burn_application_binding_v4_digest(&binding).unwrap(),
            vector_hex::<32>(&expected["bindingDigestHex"]),
        );

        let public_input_bytes = vector_hex::<POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES>(
            &expected["encodedPublicInputsHex"],
        );
        let public_inputs =
            decode_pooled_reserve_burn_public_inputs_v4(&public_input_bytes).unwrap();
        assert_eq!(
            encode_pooled_reserve_burn_public_inputs_v4(
                &public_inputs.application_binding,
                &public_inputs.checkpoint,
                public_inputs.target_native_state_root,
                public_inputs.trusted_anchor_digest,
                public_inputs.finality_horizon_height,
                public_inputs.finality_horizon_hash,
            )
            .unwrap(),
            public_input_bytes
        );
        assert_eq!(
            super::super::blake2b256(&public_input_bytes),
            vector_hex::<32>(&expected["publicInputsDigestHex"]),
        );

        let statement_bytes = vector_hex::<EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES>(
            &expected["encodedStatementHex"],
        );
        let statement = decode_eip0045_pooled_reserve_burn_statement_v4(&statement_bytes).unwrap();
        assert_eq!(
            encode_eip0045_pooled_reserve_burn_statement_v4(
                statement.chain_domain_id,
                statement.profile_id,
                statement.program_id,
                statement.contract_id,
                &statement.public_inputs.encoded,
            )
            .unwrap(),
            statement_bytes
        );
        assert_eq!(
            super::super::blake2b256(&statement_bytes),
            vector_hex::<32>(&expected["statementDigestHex"]),
        );
    }

    fn vector_hex<const N: usize>(value: &Value) -> [u8; N] {
        let encoded = value
            .as_str()
            .expect("golden vector field must be a string");
        let encoded = encoded.strip_prefix("0x").unwrap_or(encoded);
        assert_eq!(encoded.len(), N * 2, "golden vector byte length drift");
        let mut bytes = [0u8; N];
        for (index, byte) in bytes.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&encoded[index * 2..(index + 1) * 2], 16)
                .expect("golden vector must contain hex");
        }
        bytes
    }

    #[test]
    fn rejects_profile_shape_identity_and_required_field_drift() {
        let (binding, _) = fixture();
        let profile = binding.runtime_profile.clone();
        let encoded = encode_pooled_reserve_mint_reservation_runtime_profile_v4(&profile).unwrap();
        assert_eq!(
            decode_pooled_reserve_mint_reservation_runtime_profile_v4(&encoded).unwrap(),
            profile
        );
        let mut wrong_format = encoded;
        wrong_format[0] = 3;
        assert!(decode_pooled_reserve_mint_reservation_runtime_profile_v4(&wrong_format).is_err());

        for mutation in 0..11 {
            let mut changed = profile.clone();
            match mutation {
                0 => changed.lineage_id.fill(0),
                1 => changed.source_network_id.fill(0),
                2 => changed.sidechain_id.fill(0),
                3 => changed.bridge_address.fill(0),
                4 => changed.token_address.fill(0),
                5 => changed.bridge_runtime_code_sha256.fill(0),
                6 => changed.token_runtime_code_sha256.fill(0),
                7 => changed.settlement_profile_id.fill(0),
                8 => changed.ergo_finality_policy_id.fill(0),
                9 => changed.source_proof_system_id.fill(0),
                10 => changed.source_proof_profile_id.fill(0),
                _ => unreachable!(),
            }
            assert!(encode_pooled_reserve_mint_reservation_runtime_profile_v4(&changed).is_err());
        }
        let mut aliased = profile.clone();
        aliased.token_address = aliased.bridge_address;
        assert!(encode_pooled_reserve_mint_reservation_runtime_profile_v4(&aliased).is_err());
        for mutation in 0..3 {
            let mut changed = profile.clone();
            match mutation {
                0 => changed.bridge_runtime_code_bytes = 0,
                1 => changed.token_runtime_code_bytes = 0,
                2 => changed.max_pending_blocks = 0,
                _ => unreachable!(),
            }
            assert!(encode_pooled_reserve_mint_reservation_runtime_profile_v4(&changed).is_err());
        }
        let mut wrong_id = binding;
        wrong_id.runtime_profile_id[0] ^= 1;
        assert!(encode_pooled_reserve_burn_application_binding_v4(&wrong_id).is_err());

        for mutation in 0..4 {
            let (mut changed, _) = fixture();
            match mutation {
                0 => changed.source_runtime_code_sha256.fill(0),
                1 => changed.source_runtime_code_bytes = 0,
                2 => changed.tracker_nft_id.fill(0),
                3 => changed.settlement_tracker_contract_id.fill(0),
                _ => unreachable!(),
            }
            assert!(encode_pooled_reserve_burn_application_binding_v4(&changed).is_err());
        }
    }

    #[test]
    fn rejects_preactivation_authorization_and_reserved_bytes() {
        let (binding, _) = fixture();
        for mutation in 0..4 {
            let mut changed = binding.clone();
            match mutation {
                0 => changed.preactivation_state = 1,
                1 => changed.authorization_flags = 1,
                2 => changed.reserved[0] = 1,
                3 => changed.reserved[1] = 1,
                _ => unreachable!(),
            }
            assert!(encode_pooled_reserve_burn_application_binding_v4(&changed).is_err());
        }

        let canonical = encode_pooled_reserve_burn_application_binding_v4(&binding).unwrap();
        for offset in [481usize, 482, 483, 484] {
            let mut changed = canonical;
            changed[offset] = 1;
            assert!(decode_pooled_reserve_burn_application_binding_v4(&changed).is_err());
        }
    }

    #[test]
    fn rejects_every_payload_cross_field_substitution() {
        let (binding, checkpoint) = fixture();
        let encode = |binding: &PooledReserveBurnApplicationBindingV4,
                      checkpoint: &[u8],
                      state_root: [u8; 32],
                      anchor: [u8; 32],
                      height: u64,
                      horizon_hash: [u8; 32]| {
            encode_pooled_reserve_burn_public_inputs_v4(
                binding,
                checkpoint,
                state_root,
                anchor,
                height,
                horizon_hash,
            )
        };

        let mut wrong_sidechain = checkpoint;
        wrong_sidechain[4] ^= 1;
        assert!(encode(&binding, &wrong_sidechain, [1; 32], [2; 32], 1_100, [3; 32]).is_err());
        assert!(encode(&binding, &checkpoint, [1; 32], [2; 32], 999, [3; 32]).is_err());
        assert!(encode(&binding, &checkpoint, [0; 32], [2; 32], 1_100, [3; 32]).is_err());
        assert!(encode(&binding, &checkpoint, [1; 32], [0; 32], 1_100, [3; 32]).is_err());
        assert!(encode(&binding, &checkpoint, [1; 32], [2; 32], 1_100, [0; 32]).is_err());

        let mut preactivation = binding.clone();
        preactivation.runtime_profile.activation_height = 1_001;
        preactivation.runtime_profile_id =
            derive_pooled_reserve_mint_reservation_profile_v4_id(&preactivation.runtime_profile)
                .unwrap();
        assert!(encode(
            &preactivation,
            &checkpoint,
            [1; 32],
            [2; 32],
            1_100,
            [3; 32],
        )
        .is_err());

        for burn_count in [0u32, 257] {
            let mut changed = checkpoint;
            changed[140..144].copy_from_slice(&burn_count.to_be_bytes());
            assert!(encode(&binding, &changed, [1; 32], [2; 32], 1_100, [3; 32]).is_err());
        }

        let canonical = encode(&binding, &checkpoint, [1; 32], [2; 32], 1_100, [3; 32]).unwrap();
        for offset in [0usize, 40, 41, 42, 43, 44] {
            let mut changed = canonical;
            changed[offset] ^= 1;
            assert!(decode_pooled_reserve_burn_public_inputs_v4(&changed).is_err());
        }
        for offset in [530usize, 778, 914, 916, 948] {
            let mut changed = canonical;
            changed[offset] ^= 1;
            assert!(decode_pooled_reserve_burn_public_inputs_v4(&changed).is_err());
        }
    }

    #[test]
    fn rejects_outer_identity_and_cross_binding_substitution() {
        let (binding, checkpoint) = fixture();
        let public_inputs = encode_pooled_reserve_burn_public_inputs_v4(
            &binding,
            &checkpoint,
            [1; 32],
            [2; 32],
            1_100,
            [3; 32],
        )
        .unwrap();
        let ids = [
            binding.runtime_profile.source_network_id,
            [0xa1; 32],
            [0xa2; 32],
            binding.settlement_tracker_contract_id,
        ];
        for identity in 0..4 {
            let mut changed = ids;
            changed[identity].fill(0);
            assert!(encode_eip0045_pooled_reserve_burn_statement_v4(
                changed[0],
                changed[1],
                changed[2],
                changed[3],
                &public_inputs,
            )
            .is_err());
        }
        let mut wrong_chain = ids[0];
        wrong_chain[0] ^= 1;
        assert!(encode_eip0045_pooled_reserve_burn_statement_v4(
            wrong_chain,
            ids[1],
            ids[2],
            ids[3],
            &public_inputs,
        )
        .is_err());
        let mut wrong_contract = ids[3];
        wrong_contract[0] ^= 1;
        assert!(encode_eip0045_pooled_reserve_burn_statement_v4(
            ids[0],
            ids[1],
            ids[2],
            wrong_contract,
            &public_inputs,
        )
        .is_err());
        let shared_verifier_profile = [
            0x23, 0xc4, 0xa1, 0x23, 0xff, 0xb3, 0x3a, 0x1c, 0x8d, 0xb8, 0x94, 0x36, 0xfe, 0x0e,
            0x79, 0x72, 0xbd, 0x8e, 0x4e, 0x28, 0x94, 0x59, 0xee, 0x5f, 0xd7, 0x1b, 0xe5, 0x44,
            0x06, 0x07, 0xd3, 0x83,
        ];
        assert!(encode_eip0045_pooled_reserve_burn_statement_v4(
            ids[0],
            shared_verifier_profile,
            ids[2],
            ids[3],
            &public_inputs,
        )
        .is_ok());
        assert!(encode_eip0045_pooled_reserve_burn_statement_v4(
            ids[0],
            ids[1],
            POOLED_RESERVE_BURN_V4_REJECTED_APPLICATION_V2_PROGRAM_ID,
            ids[3],
            &public_inputs,
        )
        .is_err());

        let statement = encode_eip0045_pooled_reserve_burn_statement_v4(
            ids[0],
            ids[1],
            ids[2],
            ids[3],
            &public_inputs,
        )
        .unwrap();
        let mut aliased_program = statement;
        aliased_program[91..123]
            .copy_from_slice(&POOLED_RESERVE_BURN_V4_REJECTED_APPLICATION_V2_PROGRAM_ID);
        assert!(decode_eip0045_pooled_reserve_burn_statement_v4(&aliased_program).is_err());
    }

    #[test]
    fn statement_families_are_not_cross_decodable() {
        let (binding, checkpoint) = fixture();
        let public_inputs = encode_pooled_reserve_burn_public_inputs_v4(
            &binding,
            &checkpoint,
            [1; 32],
            [2; 32],
            1_100,
            [3; 32],
        )
        .unwrap();
        let statement = encode_eip0045_pooled_reserve_burn_statement_v4(
            binding.runtime_profile.source_network_id,
            [4; 32],
            [5; 32],
            binding.settlement_tracker_contract_id,
            &public_inputs,
        )
        .unwrap();

        assert!(crate::decode_eip0045_bridge_statement_v1(&statement).is_err());
        #[cfg(feature = "application-v2")]
        {
            let (v2_binding, v2_payload, v2_statement) = actual_v2_family();
            assert!(crate::decode_bridge_causal_application_binding_v2(&v2_binding).is_ok());
            assert!(crate::decode_bridge_validity_application_payload_v3(&v2_payload).is_ok());
            assert!(crate::decode_eip0045_bridge_application_statement_v2(&v2_statement).is_ok());
            assert!(
                crate::decode_bridge_causal_application_binding_v2(&public_inputs[45..530])
                    .is_err()
            );
            assert!(crate::decode_bridge_validity_application_payload_v3(&public_inputs).is_err());
            assert!(crate::decode_eip0045_bridge_application_statement_v2(&statement).is_err());
            assert!(decode_pooled_reserve_burn_application_binding_v4(&v2_binding).is_err());
            assert!(decode_pooled_reserve_burn_public_inputs_v4(&v2_payload).is_err());
            assert!(decode_eip0045_pooled_reserve_burn_statement_v4(&v2_statement).is_err());
        }
    }

    #[cfg(feature = "application-v2")]
    fn actual_v2_family() -> (
        [u8; crate::BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES],
        [u8; crate::BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES],
        [u8; crate::EIP0045_BRIDGE_APPLICATION_STATEMENT_V2_BYTES],
    ) {
        let finality_vector: Value = serde_json::from_str(include_str!(
            "../../../relayer/test-vectors/bridge-validity-finality-statement-v2.json"
        ))
        .unwrap();
        let application = crate::BridgeCausalApplicationBindingV2 {
            source_network_id: [0xaa; 32],
            sidechain_id: [0x11; 32],
            bridge_address: [0x22; 20],
            token_address: [0x21; 20],
            settlement_profile_id: [0xbb; 32],
            causal_profile_id: literal_hex(
                "80fb647618a990b24084ecceaa810822c14d2649c998908043b21120b07e67ee",
            ),
            bridge_runtime_code_sha256: literal_hex(
                "ba3d364b0b10103032ebc8974a70e54e1c0aa69854212edfbc7daec81f3e3751",
            ),
            bridge_runtime_code_bytes: 4_104,
            token_runtime_code_sha256: literal_hex(
                "43b2edc69034b0e801fd13efc3b5d4bfb50dc255b17d49e058c4dcf79d872989",
            ),
            token_runtime_code_bytes: 2_356,
        };
        let binding = crate::encode_bridge_causal_application_binding_v2(&application).unwrap();
        let finality_payload = vector_hex::<{ crate::BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2_BYTES }>(
            &finality_vector["expected"]["encodedPayloadHex"],
        );
        let payload =
            crate::encode_bridge_validity_application_payload_v3(&finality_payload, &application)
                .unwrap();
        let statement = crate::encode_eip0045_bridge_application_statement_v2(
            application.source_network_id,
            vector_hex::<32>(&finality_vector["input"]["profileIdHex"]),
            vector_hex::<32>(&finality_vector["input"]["programIdHex"]),
            vector_hex::<32>(&finality_vector["expected"]["contractIdHex"]),
            &payload,
        )
        .unwrap();
        (binding, payload, statement)
    }

    fn literal_hex<const N: usize>(encoded: &str) -> [u8; N] {
        assert_eq!(encoded.len(), N * 2, "literal byte length drift");
        let mut bytes = [0u8; N];
        for (index, byte) in bytes.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&encoded[index * 2..(index + 1) * 2], 16)
                .expect("literal must contain hex");
        }
        bytes
    }

    fn fixture() -> (
        PooledReserveBurnApplicationBindingV4,
        [u8; CHECKPOINT_BYTES],
    ) {
        let profile = PooledReserveMintReservationRuntimeProfileV4 {
            lineage_id: [0x11; 32],
            source_network_id: [0x12; 32],
            sidechain_id: [0x13; 32],
            bridge_address: [0x21; 20],
            token_address: [0x22; 20],
            bridge_runtime_code_sha256: [0x31; 32],
            bridge_runtime_code_bytes: 4_104,
            token_runtime_code_sha256: [0x32; 32],
            token_runtime_code_bytes: 2_356,
            settlement_profile_id: [0x41; 32],
            ergo_finality_policy_id: [0x42; 32],
            source_proof_system_id: [0x43; 32],
            source_proof_profile_id: [0x44; 32],
            activation_height: 0,
            max_pending_blocks: 48,
        };
        let binding = PooledReserveBurnApplicationBindingV4 {
            runtime_profile_id: derive_pooled_reserve_mint_reservation_profile_v4_id(&profile)
                .unwrap(),
            runtime_profile: profile,
            source_runtime_code_sha256: [0x51; 32],
            source_runtime_code_bytes: 9_999,
            tracker_nft_id: [0x61; 32],
            settlement_tracker_contract_id: [0x62; 32],
            preactivation_state: 0,
            authorization_flags: 0,
            reserved: [0, 0],
        };
        let mut checkpoint = [0u8; CHECKPOINT_BYTES];
        checkpoint[..4].copy_from_slice(&[1, 1, 1, 0]);
        checkpoint[4..36].copy_from_slice(&binding.runtime_profile.sidechain_id);
        checkpoint[36..44].copy_from_slice(&1_000u64.to_be_bytes());
        checkpoint[44..76].copy_from_slice(&[0x71; 32]);
        checkpoint[76..108].copy_from_slice(&[0x72; 32]);
        checkpoint[108..140].copy_from_slice(&[0x73; 32]);
        checkpoint[140..144].copy_from_slice(&3u32.to_be_bytes());
        checkpoint[144..152].copy_from_slice(&9u64.to_be_bytes());
        checkpoint[152..184].copy_from_slice(&[0x74; 32]);
        checkpoint[184..216].copy_from_slice(&[0x75; 32]);
        (binding, checkpoint)
    }
}
