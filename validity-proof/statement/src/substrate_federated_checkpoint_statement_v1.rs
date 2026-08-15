//! Canonical non-authorizing bytes for the `substrate-federated-v1` checkpoint profile.
//!
//! This module freezes a compatibility statement and two distinct key roles. It does not verify
//! signatures, admit an Ergo tracker successor, activate a settlement profile, or authorize funds.

use alloc::vec::Vec;

use super::{array_at, domain_hash, exact_array, StatementError};

/// Domain used to identify one exact federated profile encoding.
pub const SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1_DOMAIN: &[u8] =
    b"E2S_SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1";
/// Domain used to identify the source-attestation Ed25519 key set.
pub const SUBSTRATE_FEDERATED_SOURCE_KEY_SET_V1_DOMAIN: &[u8] =
    b"E2S_SUBSTRATE_FEDERATED_SOURCE_KEY_SET_V1";
/// Domain used to identify the Ergo-admission SigmaProp key set.
pub const SUBSTRATE_FEDERATED_ERGO_KEY_SET_V1_DOMAIN: &[u8] =
    b"E2S_SUBSTRATE_FEDERATED_ERGO_KEY_SET_V1";
/// Domain used to identify one exact 512-byte checkpoint statement.
pub const SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_DOMAIN: &[u8] =
    b"E2S_SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1";
/// Domain signed by the source-attestation role over a statement identity.
pub const SUBSTRATE_FEDERATED_CHECKPOINT_ATTESTATION_V1_DOMAIN: &[u8] =
    b"E2S_SUBSTRATE_FEDERATED_CHECKPOINT_ATTESTATION_V1";

/// Supported federated profile version.
pub const SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1_VERSION: u8 = 1;
/// Source-attestation key algorithm identifier for Ed25519.
pub const SUBSTRATE_FEDERATED_SOURCE_KEY_ALGORITHM_ED25519: u8 = 1;
/// Ergo-admission key algorithm identifier for compressed SigmaProp group elements.
pub const SUBSTRATE_FEDERATED_ERGO_KEY_ALGORITHM_SIGMAPROP: u8 = 1;
/// Required profile flags for V1.
pub const SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_FLAGS_NONE: u8 = 0;
/// Maximum statically supported keys in either role.
pub const SUBSTRATE_FEDERATED_CHECKPOINT_MAX_KEYS_PER_ROLE: usize = 8;

/// Supported federated statement version.
pub const SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_VERSION: u8 = 1;
/// Statement hash algorithm identifier for Blake2b-256.
pub const SUBSTRATE_FEDERATED_CHECKPOINT_HASH_BLAKE2B256: u8 = 1;
/// Finality-rule identifier for threshold-attested compatibility finality.
pub const SUBSTRATE_FEDERATED_CHECKPOINT_FINALITY_THRESHOLD_ATTESTED: u8 = 1;
/// Required statement flags for V1.
pub const SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_FLAGS_NONE: u8 = 0;
/// Exact byte length of one V1 checkpoint statement.
pub const SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES: usize = 512;
/// Exact Ergo extension key reserved for `bridge_event_root || statement_id`.
pub const SUBSTRATE_FEDERATED_CHECKPOINT_EXTENSION_KEY: [u8; 2] = [0x04, 0x01];
/// Exact byte length of the V1 Ergo extension value.
pub const SUBSTRATE_FEDERATED_CHECKPOINT_EXTENSION_VALUE_BYTES: usize = 64;

const DIGEST_BYTES: usize = 32;
const EVM_ADDRESS_BYTES: usize = 20;
const SOURCE_PUBLIC_KEY_BYTES: usize = 32;
const ERGO_PUBLIC_KEY_BYTES: usize = 33;
const PROFILE_FIXED_PREFIX_BYTES: usize = 24;
const MAX_BURN_LEAVES: u32 = 256;

const SOURCE_NETWORK_ID_OFFSET: usize = 4;
const SIDECHAIN_ID_OFFSET: usize = 36;
const SOURCE_NATIVE_HEIGHT_OFFSET: usize = 68;
const SOURCE_NATIVE_HASH_OFFSET: usize = 76;
const EXECUTION_HASH_OFFSET: usize = 108;
const BRIDGE_EVENT_ROOT_OFFSET: usize = 140;
const BURN_LEAF_COUNT_OFFSET: usize = 172;
const BRIDGE_ADDRESS_OFFSET: usize = 176;
const TOKEN_ADDRESS_OFFSET: usize = 196;
const BRIDGE_CODE_HASH_OFFSET: usize = 216;
const BRIDGE_CODE_BYTES_OFFSET: usize = 248;
const TOKEN_CODE_HASH_OFFSET: usize = 252;
const TOKEN_CODE_BYTES_OFFSET: usize = 284;
const SOURCE_CODE_HASH_OFFSET: usize = 288;
const SOURCE_CODE_BYTES_OFFSET: usize = 320;
const RUNTIME_PROFILE_ID_OFFSET: usize = 324;
const SETTLEMENT_PROFILE_ID_OFFSET: usize = 356;
const FEDERATION_PROFILE_ID_OFFSET: usize = 388;
const SOURCE_KEY_SET_DIGEST_OFFSET: usize = 420;
const SOURCE_THRESHOLD_OFFSET: usize = 452;
const ERGO_KEY_SET_DIGEST_OFFSET: usize = 454;
const ERGO_THRESHOLD_OFFSET: usize = 486;
const FEDERATION_EPOCH_OFFSET: usize = 488;
const ADMISSION_VALID_FROM_ERGO_HEIGHT_OFFSET: usize = 496;
const ADMISSION_EXPIRES_AT_ERGO_HEIGHT_OFFSET: usize = 504;

const _: [(); 512] = [(); SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES];

/// Caller-owned fields used to construct a canonical federated profile.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SubstrateFederatedCheckpointProfileV1Input {
    /// Common epoch shared by the source-attestation and Ergo-admission roles.
    pub federation_epoch: u64,
    /// Maximum allowed exclusive tracker-admission span in Ergo blocks.
    pub max_admission_validity_blocks: u64,
    /// Exact source-attestation threshold.
    pub source_attestation_threshold: u16,
    /// Strictly ordered unique Ed25519 public keys.
    pub source_attestation_public_keys: Vec<[u8; SOURCE_PUBLIC_KEY_BYTES]>,
    /// Exact Ergo-admission threshold.
    pub ergo_admission_threshold: u16,
    /// Strictly ordered unique compressed SigmaProp group elements.
    pub ergo_admission_public_keys: Vec<[u8; ERGO_PUBLIC_KEY_BYTES]>,
}

/// Strictly decoded canonical federated profile and its derived identities.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SubstrateFederatedCheckpointProfileV1 {
    /// Exact profile version.
    pub version: u8,
    /// Exact source key algorithm identifier.
    pub source_key_algorithm_id: u8,
    /// Exact Ergo key algorithm identifier.
    pub ergo_key_algorithm_id: u8,
    /// Exact profile flags.
    pub flags: u8,
    /// Common federation epoch.
    pub federation_epoch: u64,
    /// Maximum allowed exclusive tracker-admission span in Ergo blocks.
    pub max_admission_validity_blocks: u64,
    /// Source-attestation signature threshold.
    pub source_attestation_threshold: u16,
    /// Canonically ordered source-attestation keys.
    pub source_attestation_public_keys: Vec<[u8; SOURCE_PUBLIC_KEY_BYTES]>,
    /// Domain-separated source-attestation key-set identity.
    pub source_attestation_key_set_digest: [u8; DIGEST_BYTES],
    /// Ergo-admission proposition threshold.
    pub ergo_admission_threshold: u16,
    /// Canonically ordered Ergo-admission keys.
    pub ergo_admission_public_keys: Vec<[u8; ERGO_PUBLIC_KEY_BYTES]>,
    /// Domain-separated Ergo-admission key-set identity.
    pub ergo_admission_key_set_digest: [u8; DIGEST_BYTES],
    /// Exact canonical profile bytes.
    pub encoded: Vec<u8>,
    /// Domain-separated identity of the exact profile bytes.
    pub profile_id: [u8; DIGEST_BYTES],
}

/// Caller-owned fields used to construct one exact federated checkpoint statement.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SubstrateFederatedCheckpointStatementV1Input {
    /// Canonical profile that controls both key roles and the validity horizon.
    pub profile: SubstrateFederatedCheckpointProfileV1,
    /// Source network identity.
    pub source_network_id: [u8; DIGEST_BYTES],
    /// Sidechain identity.
    pub sidechain_id: [u8; DIGEST_BYTES],
    /// Source native block height for this checkpoint.
    pub source_native_block_height: u64,
    /// Source native block hash.
    pub source_native_block_hash: [u8; DIGEST_BYTES],
    /// Execution-layer block hash bound to the same checkpoint.
    pub execution_block_hash: [u8; DIGEST_BYTES],
    /// Canonical bridge event or burn root.
    pub bridge_event_root: [u8; DIGEST_BYTES],
    /// Number of committed burn leaves.
    pub burn_leaf_count: u32,
    /// Exact reviewed bridge application address.
    pub bridge_address: [u8; EVM_ADDRESS_BYTES],
    /// Exact reviewed token application address.
    pub token_address: [u8; EVM_ADDRESS_BYTES],
    /// SHA-256 of the reviewed bridge runtime code.
    pub bridge_runtime_code_sha256: [u8; DIGEST_BYTES],
    /// Byte length of the reviewed bridge runtime code.
    pub bridge_runtime_code_bytes: u32,
    /// SHA-256 of the reviewed token runtime code.
    pub token_runtime_code_sha256: [u8; DIGEST_BYTES],
    /// Byte length of the reviewed token runtime code.
    pub token_runtime_code_bytes: u32,
    /// SHA-256 of the reviewed source runtime code.
    pub source_runtime_code_sha256: [u8; DIGEST_BYTES],
    /// Byte length of the reviewed source runtime code.
    pub source_runtime_code_bytes: u32,
    /// Exact runtime semantics profile identity.
    pub runtime_profile_id: [u8; DIGEST_BYTES],
    /// Exact Ergo settlement profile identity.
    pub settlement_profile_id: [u8; DIGEST_BYTES],
    /// Ergo height at which tracker admission becomes valid.
    pub admission_valid_from_ergo_height: u64,
    /// Exclusive Ergo height at which tracker admission expires.
    pub admission_expires_at_ergo_height: u64,
}

/// Strictly decoded canonical federated checkpoint statement and its identity.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SubstrateFederatedCheckpointStatementV1 {
    /// Exact statement version.
    pub version: u8,
    /// Exact statement hash algorithm identifier.
    pub hash_algorithm_id: u8,
    /// Exact threshold-attested finality-rule identifier.
    pub finality_rule_id: u8,
    /// Exact statement flags.
    pub flags: u8,
    /// Source network identity.
    pub source_network_id: [u8; DIGEST_BYTES],
    /// Sidechain identity.
    pub sidechain_id: [u8; DIGEST_BYTES],
    /// Source native block height.
    pub source_native_block_height: u64,
    /// Source native block hash.
    pub source_native_block_hash: [u8; DIGEST_BYTES],
    /// Execution-layer block hash.
    pub execution_block_hash: [u8; DIGEST_BYTES],
    /// Canonical bridge event or burn root.
    pub bridge_event_root: [u8; DIGEST_BYTES],
    /// Number of committed burn leaves.
    pub burn_leaf_count: u32,
    /// Exact reviewed bridge address.
    pub bridge_address: [u8; EVM_ADDRESS_BYTES],
    /// Exact reviewed token address.
    pub token_address: [u8; EVM_ADDRESS_BYTES],
    /// SHA-256 of the bridge runtime code.
    pub bridge_runtime_code_sha256: [u8; DIGEST_BYTES],
    /// Bridge runtime-code byte count.
    pub bridge_runtime_code_bytes: u32,
    /// SHA-256 of the token runtime code.
    pub token_runtime_code_sha256: [u8; DIGEST_BYTES],
    /// Token runtime-code byte count.
    pub token_runtime_code_bytes: u32,
    /// SHA-256 of the source runtime code.
    pub source_runtime_code_sha256: [u8; DIGEST_BYTES],
    /// Source runtime-code byte count.
    pub source_runtime_code_bytes: u32,
    /// Runtime semantics profile identity.
    pub runtime_profile_id: [u8; DIGEST_BYTES],
    /// Ergo settlement profile identity.
    pub settlement_profile_id: [u8; DIGEST_BYTES],
    /// Federation profile identity.
    pub federation_profile_id: [u8; DIGEST_BYTES],
    /// Source-attestation key-set identity.
    pub source_attestation_key_set_digest: [u8; DIGEST_BYTES],
    /// Source-attestation threshold.
    pub source_attestation_threshold: u16,
    /// Ergo-admission key-set identity.
    pub ergo_admission_key_set_digest: [u8; DIGEST_BYTES],
    /// Ergo-admission threshold.
    pub ergo_admission_threshold: u16,
    /// Common federation epoch.
    pub federation_epoch: u64,
    /// Inclusive Ergo admission height.
    pub admission_valid_from_ergo_height: u64,
    /// Exclusive Ergo admission expiry height.
    pub admission_expires_at_ergo_height: u64,
    /// Exact canonical statement bytes.
    pub encoded: [u8; SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES],
    /// Domain-separated identity of the exact statement bytes.
    pub statement_id: [u8; DIGEST_BYTES],
}

/// Build and strictly decode one canonical federated profile.
pub fn build_substrate_federated_checkpoint_profile_v1(
    input: &SubstrateFederatedCheckpointProfileV1Input,
) -> Result<SubstrateFederatedCheckpointProfileV1, StatementError> {
    decode_substrate_federated_checkpoint_profile_v1(
        &encode_substrate_federated_checkpoint_profile_v1(input)?,
    )
}

/// Encode one canonical federated profile with both exact key roles.
pub fn encode_substrate_federated_checkpoint_profile_v1(
    input: &SubstrateFederatedCheckpointProfileV1Input,
) -> Result<Vec<u8>, StatementError> {
    validate_profile_input(input)?;
    let mut encoded = Vec::with_capacity(
        PROFILE_FIXED_PREFIX_BYTES
            + input.source_attestation_public_keys.len() * SOURCE_PUBLIC_KEY_BYTES
            + 4
            + input.ergo_admission_public_keys.len() * ERGO_PUBLIC_KEY_BYTES,
    );
    encoded.extend_from_slice(&[
        SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1_VERSION,
        SUBSTRATE_FEDERATED_SOURCE_KEY_ALGORITHM_ED25519,
        SUBSTRATE_FEDERATED_ERGO_KEY_ALGORITHM_SIGMAPROP,
        SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_FLAGS_NONE,
    ]);
    encoded.extend_from_slice(&input.federation_epoch.to_be_bytes());
    encoded.extend_from_slice(&input.max_admission_validity_blocks.to_be_bytes());
    encoded.extend_from_slice(&input.source_attestation_threshold.to_be_bytes());
    encoded.extend_from_slice(&(input.source_attestation_public_keys.len() as u16).to_be_bytes());
    for key in &input.source_attestation_public_keys {
        encoded.extend_from_slice(key);
    }
    encoded.extend_from_slice(&input.ergo_admission_threshold.to_be_bytes());
    encoded.extend_from_slice(&(input.ergo_admission_public_keys.len() as u16).to_be_bytes());
    for key in &input.ergo_admission_public_keys {
        encoded.extend_from_slice(key);
    }
    Ok(encoded)
}

/// Decode one exact profile and reject non-canonical keys, thresholds, lengths, and roles.
pub fn decode_substrate_federated_checkpoint_profile_v1(
    bytes: &[u8],
) -> Result<SubstrateFederatedCheckpointProfileV1, StatementError> {
    if bytes.len() < PROFILE_FIXED_PREFIX_BYTES {
        return Err(StatementError::Length {
            object: "substrate federated checkpoint profile V1 prefix",
            expected: PROFILE_FIXED_PREFIX_BYTES,
            actual: bytes.len(),
        });
    }
    validate_profile_discriminators(bytes[0], bytes[1], bytes[2], bytes[3])?;
    let source_key_count = u16::from_be_bytes(array_at::<2>(bytes, 22)) as usize;
    validate_key_count(source_key_count, "source-attestation key count")?;
    let source_keys_end = PROFILE_FIXED_PREFIX_BYTES + source_key_count * SOURCE_PUBLIC_KEY_BYTES;
    if source_keys_end + 4 > bytes.len() {
        return Err(StatementError::Length {
            object: "substrate federated checkpoint source key set",
            expected: source_keys_end + 4,
            actual: bytes.len(),
        });
    }
    let ergo_key_count = u16::from_be_bytes(array_at::<2>(bytes, source_keys_end + 2)) as usize;
    validate_key_count(ergo_key_count, "Ergo-admission key count")?;
    let ergo_keys_offset = source_keys_end + 4;
    let expected_length = ergo_keys_offset + ergo_key_count * ERGO_PUBLIC_KEY_BYTES;
    if bytes.len() != expected_length {
        return Err(StatementError::Length {
            object: "substrate federated checkpoint profile V1",
            expected: expected_length,
            actual: bytes.len(),
        });
    }

    let mut source_attestation_public_keys = Vec::with_capacity(source_key_count);
    for index in 0..source_key_count {
        source_attestation_public_keys.push(array_at::<SOURCE_PUBLIC_KEY_BYTES>(
            bytes,
            PROFILE_FIXED_PREFIX_BYTES + index * SOURCE_PUBLIC_KEY_BYTES,
        ));
    }
    let mut ergo_admission_public_keys = Vec::with_capacity(ergo_key_count);
    for index in 0..ergo_key_count {
        ergo_admission_public_keys.push(array_at::<ERGO_PUBLIC_KEY_BYTES>(
            bytes,
            ergo_keys_offset + index * ERGO_PUBLIC_KEY_BYTES,
        ));
    }
    let input = SubstrateFederatedCheckpointProfileV1Input {
        federation_epoch: u64::from_be_bytes(array_at::<8>(bytes, 4)),
        max_admission_validity_blocks: u64::from_be_bytes(array_at::<8>(bytes, 12)),
        source_attestation_threshold: u16::from_be_bytes(array_at::<2>(bytes, 20)),
        source_attestation_public_keys,
        ergo_admission_threshold: u16::from_be_bytes(array_at::<2>(bytes, source_keys_end)),
        ergo_admission_public_keys,
    };
    let canonical = encode_substrate_federated_checkpoint_profile_v1(&input)?;
    if canonical.as_slice() != bytes {
        return Err(StatementError::PayloadBinding(
            "substrate federated checkpoint profile canonical bytes",
        ));
    }
    let source_attestation_key_set_digest =
        derive_source_attestation_key_set_digest(&input.source_attestation_public_keys);
    let ergo_admission_key_set_digest =
        derive_ergo_admission_key_set_digest(&input.ergo_admission_public_keys);
    Ok(SubstrateFederatedCheckpointProfileV1 {
        version: SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1_VERSION,
        source_key_algorithm_id: SUBSTRATE_FEDERATED_SOURCE_KEY_ALGORITHM_ED25519,
        ergo_key_algorithm_id: SUBSTRATE_FEDERATED_ERGO_KEY_ALGORITHM_SIGMAPROP,
        flags: SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_FLAGS_NONE,
        federation_epoch: input.federation_epoch,
        max_admission_validity_blocks: input.max_admission_validity_blocks,
        source_attestation_threshold: input.source_attestation_threshold,
        source_attestation_public_keys: input.source_attestation_public_keys,
        source_attestation_key_set_digest,
        ergo_admission_threshold: input.ergo_admission_threshold,
        ergo_admission_public_keys: input.ergo_admission_public_keys,
        ergo_admission_key_set_digest,
        profile_id: domain_hash(SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1_DOMAIN, bytes),
        encoded: canonical,
    })
}

/// Build, strictly decode, and profile-bind one canonical checkpoint statement.
pub fn build_substrate_federated_checkpoint_statement_v1(
    input: &SubstrateFederatedCheckpointStatementV1Input,
) -> Result<SubstrateFederatedCheckpointStatementV1, StatementError> {
    let statement = decode_substrate_federated_checkpoint_statement_v1(
        &encode_substrate_federated_checkpoint_statement_v1(input)?,
    )?;
    assert_substrate_federated_checkpoint_statement_v1_matches_profile(&statement, &input.profile)?;
    Ok(statement)
}

/// Encode one exact 512-byte federated checkpoint statement.
pub fn encode_substrate_federated_checkpoint_statement_v1(
    input: &SubstrateFederatedCheckpointStatementV1Input,
) -> Result<[u8; SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES], StatementError> {
    let profile = canonical_profile(&input.profile)?;
    validate_statement_input(input, &profile)?;
    let mut encoded = [0u8; SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES];
    encoded[..4].copy_from_slice(&[
        SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_VERSION,
        SUBSTRATE_FEDERATED_CHECKPOINT_HASH_BLAKE2B256,
        SUBSTRATE_FEDERATED_CHECKPOINT_FINALITY_THRESHOLD_ATTESTED,
        SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_FLAGS_NONE,
    ]);
    encoded[SOURCE_NETWORK_ID_OFFSET..SIDECHAIN_ID_OFFSET]
        .copy_from_slice(&input.source_network_id);
    encoded[SIDECHAIN_ID_OFFSET..SOURCE_NATIVE_HEIGHT_OFFSET].copy_from_slice(&input.sidechain_id);
    encoded[SOURCE_NATIVE_HEIGHT_OFFSET..SOURCE_NATIVE_HASH_OFFSET]
        .copy_from_slice(&input.source_native_block_height.to_be_bytes());
    encoded[SOURCE_NATIVE_HASH_OFFSET..EXECUTION_HASH_OFFSET]
        .copy_from_slice(&input.source_native_block_hash);
    encoded[EXECUTION_HASH_OFFSET..BRIDGE_EVENT_ROOT_OFFSET]
        .copy_from_slice(&input.execution_block_hash);
    encoded[BRIDGE_EVENT_ROOT_OFFSET..BURN_LEAF_COUNT_OFFSET]
        .copy_from_slice(&input.bridge_event_root);
    encoded[BURN_LEAF_COUNT_OFFSET..BRIDGE_ADDRESS_OFFSET]
        .copy_from_slice(&input.burn_leaf_count.to_be_bytes());
    encoded[BRIDGE_ADDRESS_OFFSET..TOKEN_ADDRESS_OFFSET].copy_from_slice(&input.bridge_address);
    encoded[TOKEN_ADDRESS_OFFSET..BRIDGE_CODE_HASH_OFFSET].copy_from_slice(&input.token_address);
    encoded[BRIDGE_CODE_HASH_OFFSET..BRIDGE_CODE_BYTES_OFFSET]
        .copy_from_slice(&input.bridge_runtime_code_sha256);
    encoded[BRIDGE_CODE_BYTES_OFFSET..TOKEN_CODE_HASH_OFFSET]
        .copy_from_slice(&input.bridge_runtime_code_bytes.to_be_bytes());
    encoded[TOKEN_CODE_HASH_OFFSET..TOKEN_CODE_BYTES_OFFSET]
        .copy_from_slice(&input.token_runtime_code_sha256);
    encoded[TOKEN_CODE_BYTES_OFFSET..SOURCE_CODE_HASH_OFFSET]
        .copy_from_slice(&input.token_runtime_code_bytes.to_be_bytes());
    encoded[SOURCE_CODE_HASH_OFFSET..SOURCE_CODE_BYTES_OFFSET]
        .copy_from_slice(&input.source_runtime_code_sha256);
    encoded[SOURCE_CODE_BYTES_OFFSET..RUNTIME_PROFILE_ID_OFFSET]
        .copy_from_slice(&input.source_runtime_code_bytes.to_be_bytes());
    encoded[RUNTIME_PROFILE_ID_OFFSET..SETTLEMENT_PROFILE_ID_OFFSET]
        .copy_from_slice(&input.runtime_profile_id);
    encoded[SETTLEMENT_PROFILE_ID_OFFSET..FEDERATION_PROFILE_ID_OFFSET]
        .copy_from_slice(&input.settlement_profile_id);
    encoded[FEDERATION_PROFILE_ID_OFFSET..SOURCE_KEY_SET_DIGEST_OFFSET]
        .copy_from_slice(&profile.profile_id);
    encoded[SOURCE_KEY_SET_DIGEST_OFFSET..SOURCE_THRESHOLD_OFFSET]
        .copy_from_slice(&profile.source_attestation_key_set_digest);
    encoded[SOURCE_THRESHOLD_OFFSET..ERGO_KEY_SET_DIGEST_OFFSET]
        .copy_from_slice(&profile.source_attestation_threshold.to_be_bytes());
    encoded[ERGO_KEY_SET_DIGEST_OFFSET..ERGO_THRESHOLD_OFFSET]
        .copy_from_slice(&profile.ergo_admission_key_set_digest);
    encoded[ERGO_THRESHOLD_OFFSET..FEDERATION_EPOCH_OFFSET]
        .copy_from_slice(&profile.ergo_admission_threshold.to_be_bytes());
    encoded[FEDERATION_EPOCH_OFFSET..ADMISSION_VALID_FROM_ERGO_HEIGHT_OFFSET]
        .copy_from_slice(&profile.federation_epoch.to_be_bytes());
    encoded[ADMISSION_VALID_FROM_ERGO_HEIGHT_OFFSET..ADMISSION_EXPIRES_AT_ERGO_HEIGHT_OFFSET]
        .copy_from_slice(&input.admission_valid_from_ergo_height.to_be_bytes());
    encoded[ADMISSION_EXPIRES_AT_ERGO_HEIGHT_OFFSET..]
        .copy_from_slice(&input.admission_expires_at_ergo_height.to_be_bytes());
    Ok(encoded)
}

/// Decode and structurally validate one exact 512-byte federated checkpoint statement.
pub fn decode_substrate_federated_checkpoint_statement_v1(
    bytes: &[u8],
) -> Result<SubstrateFederatedCheckpointStatementV1, StatementError> {
    let encoded = exact_array::<SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES>(
        bytes,
        "substrate federated checkpoint statement V1",
    )?;
    validate_statement_discriminators(encoded[0], encoded[1], encoded[2], encoded[3])?;
    let statement = SubstrateFederatedCheckpointStatementV1 {
        version: encoded[0],
        hash_algorithm_id: encoded[1],
        finality_rule_id: encoded[2],
        flags: encoded[3],
        source_network_id: array_at(&encoded, SOURCE_NETWORK_ID_OFFSET),
        sidechain_id: array_at(&encoded, SIDECHAIN_ID_OFFSET),
        source_native_block_height: u64::from_be_bytes(array_at(
            &encoded,
            SOURCE_NATIVE_HEIGHT_OFFSET,
        )),
        source_native_block_hash: array_at(&encoded, SOURCE_NATIVE_HASH_OFFSET),
        execution_block_hash: array_at(&encoded, EXECUTION_HASH_OFFSET),
        bridge_event_root: array_at(&encoded, BRIDGE_EVENT_ROOT_OFFSET),
        burn_leaf_count: u32::from_be_bytes(array_at(&encoded, BURN_LEAF_COUNT_OFFSET)),
        bridge_address: array_at(&encoded, BRIDGE_ADDRESS_OFFSET),
        token_address: array_at(&encoded, TOKEN_ADDRESS_OFFSET),
        bridge_runtime_code_sha256: array_at(&encoded, BRIDGE_CODE_HASH_OFFSET),
        bridge_runtime_code_bytes: u32::from_be_bytes(array_at(&encoded, BRIDGE_CODE_BYTES_OFFSET)),
        token_runtime_code_sha256: array_at(&encoded, TOKEN_CODE_HASH_OFFSET),
        token_runtime_code_bytes: u32::from_be_bytes(array_at(&encoded, TOKEN_CODE_BYTES_OFFSET)),
        source_runtime_code_sha256: array_at(&encoded, SOURCE_CODE_HASH_OFFSET),
        source_runtime_code_bytes: u32::from_be_bytes(array_at(&encoded, SOURCE_CODE_BYTES_OFFSET)),
        runtime_profile_id: array_at(&encoded, RUNTIME_PROFILE_ID_OFFSET),
        settlement_profile_id: array_at(&encoded, SETTLEMENT_PROFILE_ID_OFFSET),
        federation_profile_id: array_at(&encoded, FEDERATION_PROFILE_ID_OFFSET),
        source_attestation_key_set_digest: array_at(&encoded, SOURCE_KEY_SET_DIGEST_OFFSET),
        source_attestation_threshold: u16::from_be_bytes(array_at(
            &encoded,
            SOURCE_THRESHOLD_OFFSET,
        )),
        ergo_admission_key_set_digest: array_at(&encoded, ERGO_KEY_SET_DIGEST_OFFSET),
        ergo_admission_threshold: u16::from_be_bytes(array_at(&encoded, ERGO_THRESHOLD_OFFSET)),
        federation_epoch: u64::from_be_bytes(array_at(&encoded, FEDERATION_EPOCH_OFFSET)),
        admission_valid_from_ergo_height: u64::from_be_bytes(array_at(
            &encoded,
            ADMISSION_VALID_FROM_ERGO_HEIGHT_OFFSET,
        )),
        admission_expires_at_ergo_height: u64::from_be_bytes(array_at(
            &encoded,
            ADMISSION_EXPIRES_AT_ERGO_HEIGHT_OFFSET,
        )),
        statement_id: domain_hash(SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_DOMAIN, &encoded),
        encoded,
    };
    validate_decoded_statement(&statement)?;
    Ok(statement)
}

/// Validate that a decoded statement binds the exact expected federated profile.
pub fn assert_substrate_federated_checkpoint_statement_v1_matches_profile(
    statement: &SubstrateFederatedCheckpointStatementV1,
    expected_profile: &SubstrateFederatedCheckpointProfileV1,
) -> Result<(), StatementError> {
    let statement = decode_substrate_federated_checkpoint_statement_v1(&statement.encoded)?;
    let profile = canonical_profile(expected_profile)?;
    if statement.federation_profile_id != profile.profile_id
        || statement.source_attestation_key_set_digest != profile.source_attestation_key_set_digest
        || statement.source_attestation_threshold != profile.source_attestation_threshold
        || statement.ergo_admission_key_set_digest != profile.ergo_admission_key_set_digest
        || statement.ergo_admission_threshold != profile.ergo_admission_threshold
        || statement.federation_epoch != profile.federation_epoch
    {
        return Err(StatementError::PayloadBinding(
            "substrate federated checkpoint profile mismatch",
        ));
    }
    validate_admission_horizon(
        statement.admission_valid_from_ergo_height,
        statement.admission_expires_at_ergo_height,
        Some(profile.max_admission_validity_blocks),
    )
}

/// Validate that a decoded statement equals every expected application binding byte for byte.
pub fn assert_substrate_federated_checkpoint_statement_v1_matches(
    statement: &SubstrateFederatedCheckpointStatementV1,
    expected: &SubstrateFederatedCheckpointStatementV1Input,
) -> Result<(), StatementError> {
    if statement.encoded != encode_substrate_federated_checkpoint_statement_v1(expected)? {
        return Err(StatementError::PayloadBinding(
            "substrate federated checkpoint expected bindings",
        ));
    }
    Ok(())
}

/// Atomically decode, profile-bind, and enforce one statement's Ergo admission horizon.
pub fn decode_substrate_federated_checkpoint_statement_v1_for_admission(
    bytes: &[u8],
    expected_profile: &SubstrateFederatedCheckpointProfileV1,
    current_ergo_height: u64,
) -> Result<SubstrateFederatedCheckpointStatementV1, StatementError> {
    let statement = decode_substrate_federated_checkpoint_statement_v1(bytes)?;
    assert_substrate_federated_checkpoint_statement_v1_matches_profile(
        &statement,
        expected_profile,
    )?;
    if current_ergo_height < statement.admission_valid_from_ergo_height
        || current_ergo_height >= statement.admission_expires_at_ergo_height
    {
        return Err(StatementError::PayloadBinding(
            "substrate federated checkpoint Ergo admission horizon",
        ));
    }
    Ok(statement)
}

/// Derive the exact digest to be signed from canonical statement bytes.
pub fn derive_substrate_federated_checkpoint_attestation_digest_v1(
    bytes: &[u8],
) -> Result<[u8; DIGEST_BYTES], StatementError> {
    let statement = decode_substrate_federated_checkpoint_statement_v1(bytes)?;
    Ok(domain_hash(
        SUBSTRATE_FEDERATED_CHECKPOINT_ATTESTATION_V1_DOMAIN,
        &statement.statement_id,
    ))
}

/// Encode `bridge_event_root || statement_id` from canonical bytes for future `0x0401` anchoring.
pub fn encode_substrate_federated_checkpoint_extension_value_v1(
    bytes: &[u8],
) -> Result<[u8; SUBSTRATE_FEDERATED_CHECKPOINT_EXTENSION_VALUE_BYTES], StatementError> {
    let statement = decode_substrate_federated_checkpoint_statement_v1(bytes)?;
    let mut value = [0u8; SUBSTRATE_FEDERATED_CHECKPOINT_EXTENSION_VALUE_BYTES];
    value[..DIGEST_BYTES].copy_from_slice(&statement.bridge_event_root);
    value[DIGEST_BYTES..].copy_from_slice(&statement.statement_id);
    Ok(value)
}

fn validate_profile_input(
    input: &SubstrateFederatedCheckpointProfileV1Input,
) -> Result<(), StatementError> {
    if input.federation_epoch == 0 || input.max_admission_validity_blocks == 0 {
        return Err(StatementError::PayloadBinding(
            "positive federation epoch and maximum Ergo admission validity blocks",
        ));
    }
    validate_key_count(
        input.source_attestation_public_keys.len(),
        "source-attestation key count",
    )?;
    validate_key_count(
        input.ergo_admission_public_keys.len(),
        "Ergo-admission key count",
    )?;
    validate_strict_source_keys(&input.source_attestation_public_keys)?;
    validate_strict_ergo_keys(&input.ergo_admission_public_keys)?;
    validate_threshold(
        input.source_attestation_threshold,
        input.source_attestation_public_keys.len(),
        "source-attestation threshold",
    )?;
    validate_threshold(
        input.ergo_admission_threshold,
        input.ergo_admission_public_keys.len(),
        "Ergo-admission threshold",
    )
}

fn validate_statement_input(
    input: &SubstrateFederatedCheckpointStatementV1Input,
    profile: &SubstrateFederatedCheckpointProfileV1,
) -> Result<(), StatementError> {
    require_nonzero(&input.source_network_id, "source network ID")?;
    require_nonzero(&input.sidechain_id, "sidechain ID")?;
    require_nonzero(&input.source_native_block_hash, "source native block hash")?;
    require_nonzero(&input.execution_block_hash, "execution block hash")?;
    require_nonzero(&input.bridge_event_root, "bridge event root")?;
    require_nonzero(&input.bridge_address, "bridge address")?;
    require_nonzero(&input.token_address, "token address")?;
    if input.bridge_address == input.token_address {
        return Err(StatementError::PayloadBinding(
            "distinct bridge and token addresses",
        ));
    }
    require_nonzero(
        &input.bridge_runtime_code_sha256,
        "bridge runtime code hash",
    )?;
    require_nonzero(&input.token_runtime_code_sha256, "token runtime code hash")?;
    require_nonzero(
        &input.source_runtime_code_sha256,
        "source runtime code hash",
    )?;
    require_nonzero(&input.runtime_profile_id, "runtime profile ID")?;
    require_nonzero(&input.settlement_profile_id, "settlement profile ID")?;
    validate_positive_u32(input.burn_leaf_count, "burn leaf count")?;
    if input.burn_leaf_count > MAX_BURN_LEAVES {
        return Err(StatementError::PayloadBinding("burn leaf count bound"));
    }
    validate_positive_u32(input.bridge_runtime_code_bytes, "bridge runtime code bytes")?;
    validate_positive_u32(input.token_runtime_code_bytes, "token runtime code bytes")?;
    validate_positive_u32(input.source_runtime_code_bytes, "source runtime code bytes")?;
    validate_admission_horizon(
        input.admission_valid_from_ergo_height,
        input.admission_expires_at_ergo_height,
        Some(profile.max_admission_validity_blocks),
    )
}

fn validate_decoded_statement(
    statement: &SubstrateFederatedCheckpointStatementV1,
) -> Result<(), StatementError> {
    require_nonzero(&statement.source_network_id, "source network ID")?;
    require_nonzero(&statement.sidechain_id, "sidechain ID")?;
    require_nonzero(
        &statement.source_native_block_hash,
        "source native block hash",
    )?;
    require_nonzero(&statement.execution_block_hash, "execution block hash")?;
    require_nonzero(&statement.bridge_event_root, "bridge event root")?;
    require_nonzero(&statement.bridge_address, "bridge address")?;
    require_nonzero(&statement.token_address, "token address")?;
    if statement.bridge_address == statement.token_address {
        return Err(StatementError::PayloadBinding(
            "distinct bridge and token addresses",
        ));
    }
    require_nonzero(
        &statement.bridge_runtime_code_sha256,
        "bridge runtime code hash",
    )?;
    require_nonzero(
        &statement.token_runtime_code_sha256,
        "token runtime code hash",
    )?;
    require_nonzero(
        &statement.source_runtime_code_sha256,
        "source runtime code hash",
    )?;
    require_nonzero(&statement.runtime_profile_id, "runtime profile ID")?;
    require_nonzero(&statement.settlement_profile_id, "settlement profile ID")?;
    require_nonzero(&statement.federation_profile_id, "federation profile ID")?;
    require_nonzero(
        &statement.source_attestation_key_set_digest,
        "source-attestation key-set digest",
    )?;
    require_nonzero(
        &statement.ergo_admission_key_set_digest,
        "Ergo-admission key-set digest",
    )?;
    validate_threshold(
        statement.source_attestation_threshold,
        SUBSTRATE_FEDERATED_CHECKPOINT_MAX_KEYS_PER_ROLE,
        "source-attestation threshold",
    )?;
    validate_threshold(
        statement.ergo_admission_threshold,
        SUBSTRATE_FEDERATED_CHECKPOINT_MAX_KEYS_PER_ROLE,
        "Ergo-admission threshold",
    )?;
    validate_positive_u32(statement.burn_leaf_count, "burn leaf count")?;
    if statement.burn_leaf_count > MAX_BURN_LEAVES {
        return Err(StatementError::PayloadBinding("burn leaf count bound"));
    }
    validate_positive_u32(
        statement.bridge_runtime_code_bytes,
        "bridge runtime code bytes",
    )?;
    validate_positive_u32(
        statement.token_runtime_code_bytes,
        "token runtime code bytes",
    )?;
    validate_positive_u32(
        statement.source_runtime_code_bytes,
        "source runtime code bytes",
    )?;
    if statement.federation_epoch == 0 {
        return Err(StatementError::PayloadBinding("positive federation epoch"));
    }
    validate_admission_horizon(
        statement.admission_valid_from_ergo_height,
        statement.admission_expires_at_ergo_height,
        None,
    )
}

fn canonical_profile(
    profile: &SubstrateFederatedCheckpointProfileV1,
) -> Result<SubstrateFederatedCheckpointProfileV1, StatementError> {
    let canonical = decode_substrate_federated_checkpoint_profile_v1(&profile.encoded)?;
    if &canonical != profile {
        return Err(StatementError::PayloadBinding(
            "substrate federated checkpoint profile identity",
        ));
    }
    Ok(canonical)
}

fn derive_source_attestation_key_set_digest(
    keys: &[[u8; SOURCE_PUBLIC_KEY_BYTES]],
) -> [u8; DIGEST_BYTES] {
    let mut payload = Vec::with_capacity(2 + keys.len() * SOURCE_PUBLIC_KEY_BYTES);
    payload.extend_from_slice(&(keys.len() as u16).to_be_bytes());
    for key in keys {
        payload.extend_from_slice(key);
    }
    domain_hash(SUBSTRATE_FEDERATED_SOURCE_KEY_SET_V1_DOMAIN, &payload)
}

fn derive_ergo_admission_key_set_digest(
    keys: &[[u8; ERGO_PUBLIC_KEY_BYTES]],
) -> [u8; DIGEST_BYTES] {
    let mut payload = Vec::with_capacity(2 + keys.len() * ERGO_PUBLIC_KEY_BYTES);
    payload.extend_from_slice(&(keys.len() as u16).to_be_bytes());
    for key in keys {
        payload.extend_from_slice(key);
    }
    domain_hash(SUBSTRATE_FEDERATED_ERGO_KEY_SET_V1_DOMAIN, &payload)
}

fn validate_key_count(count: usize, label: &'static str) -> Result<(), StatementError> {
    if count == 0 || count > SUBSTRATE_FEDERATED_CHECKPOINT_MAX_KEYS_PER_ROLE {
        return Err(StatementError::PayloadBinding(label));
    }
    Ok(())
}

fn validate_threshold(
    threshold: u16,
    key_count: usize,
    label: &'static str,
) -> Result<(), StatementError> {
    if threshold == 0 || usize::from(threshold) > key_count {
        return Err(StatementError::PayloadBinding(label));
    }
    Ok(())
}

fn validate_strict_source_keys(
    keys: &[[u8; SOURCE_PUBLIC_KEY_BYTES]],
) -> Result<(), StatementError> {
    for key in keys {
        require_nonzero(key, "source-attestation public key")?;
    }
    if keys.windows(2).any(|pair| pair[0] >= pair[1]) {
        return Err(StatementError::PayloadBinding(
            "strictly ordered unique source-attestation public keys",
        ));
    }
    Ok(())
}

fn validate_strict_ergo_keys(keys: &[[u8; ERGO_PUBLIC_KEY_BYTES]]) -> Result<(), StatementError> {
    for key in keys {
        require_nonzero(key, "Ergo-admission public key")?;
        if key[0] != 0x02 && key[0] != 0x03 {
            return Err(StatementError::PayloadBinding(
                "compressed Ergo-admission public key",
            ));
        }
    }
    if keys.windows(2).any(|pair| pair[0] >= pair[1]) {
        return Err(StatementError::PayloadBinding(
            "strictly ordered unique Ergo-admission public keys",
        ));
    }
    Ok(())
}

fn validate_profile_discriminators(
    version: u8,
    source_key_algorithm_id: u8,
    ergo_key_algorithm_id: u8,
    flags: u8,
) -> Result<(), StatementError> {
    if version != SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1_VERSION
        || source_key_algorithm_id != SUBSTRATE_FEDERATED_SOURCE_KEY_ALGORITHM_ED25519
        || ergo_key_algorithm_id != SUBSTRATE_FEDERATED_ERGO_KEY_ALGORITHM_SIGMAPROP
        || flags != SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_FLAGS_NONE
    {
        return Err(StatementError::Discriminator(
            "substrate federated checkpoint profile",
        ));
    }
    Ok(())
}

fn validate_statement_discriminators(
    version: u8,
    hash_algorithm_id: u8,
    finality_rule_id: u8,
    flags: u8,
) -> Result<(), StatementError> {
    if version != SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_VERSION
        || hash_algorithm_id != SUBSTRATE_FEDERATED_CHECKPOINT_HASH_BLAKE2B256
        || finality_rule_id != SUBSTRATE_FEDERATED_CHECKPOINT_FINALITY_THRESHOLD_ATTESTED
        || flags != SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_FLAGS_NONE
    {
        return Err(StatementError::Discriminator(
            "substrate federated checkpoint statement",
        ));
    }
    Ok(())
}

fn validate_admission_horizon(
    valid_from_ergo_height: u64,
    expires_at_ergo_height: u64,
    max_admission_validity_blocks: Option<u64>,
) -> Result<(), StatementError> {
    if expires_at_ergo_height <= valid_from_ergo_height {
        return Err(StatementError::PayloadBinding(
            "checkpoint empty or inverted Ergo admission horizon",
        ));
    }
    if let Some(maximum) = max_admission_validity_blocks {
        if expires_at_ergo_height - valid_from_ergo_height > maximum {
            return Err(StatementError::PayloadBinding(
                "checkpoint Ergo admission horizon exceeds profile",
            ));
        }
    }
    Ok(())
}

fn validate_positive_u32(value: u32, label: &'static str) -> Result<(), StatementError> {
    if value == 0 {
        return Err(StatementError::PayloadBinding(label));
    }
    Ok(())
}

fn require_nonzero(value: &[u8], label: &'static str) -> Result<(), StatementError> {
    if value.iter().all(|byte| *byte == 0) {
        return Err(StatementError::PayloadBinding(label));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn matches_the_shared_typescript_golden_vector_byte_for_byte() {
        let vector = vector();
        assert_eq!(
            vector["schema"].as_str().unwrap(),
            "e2s.substrate-federated-v1-checkpoint-statement.golden-vector"
        );
        assert_eq!(
            vector["status"].as_str().unwrap(),
            "structural_non_authorizing"
        );
        assert!(vector["boundaries"]
            .as_object()
            .unwrap()
            .values()
            .all(|value| value.as_bool() == Some(false)));

        let expected = &vector["expected"];
        let profile_bytes = vector_hex(&expected["encodedProfileHex"]);
        let profile = decode_substrate_federated_checkpoint_profile_v1(&profile_bytes).unwrap();
        assert_eq!(
            encode_substrate_federated_checkpoint_profile_v1(&profile_input(&profile)).unwrap(),
            profile_bytes
        );
        assert_eq!(
            profile.profile_id,
            vector_hex_array(&expected["profileIdHex"])
        );
        assert_eq!(
            profile.source_attestation_key_set_digest,
            vector_hex_array(&expected["sourceAttestationKeySetDigestHex"])
        );
        assert_eq!(
            profile.ergo_admission_key_set_digest,
            vector_hex_array(&expected["ergoAdmissionKeySetDigestHex"])
        );

        let statement_bytes = vector_hex_array::<SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES>(
            &expected["encodedStatementHex"],
        );
        let statement =
            decode_substrate_federated_checkpoint_statement_v1(&statement_bytes).unwrap();
        let input = statement_input(&statement, profile.clone());
        assert_eq!(
            encode_substrate_federated_checkpoint_statement_v1(&input).unwrap(),
            statement_bytes
        );
        assert_substrate_federated_checkpoint_statement_v1_matches(&statement, &input).unwrap();
        assert_substrate_federated_checkpoint_statement_v1_matches_profile(&statement, &profile)
            .unwrap();
        assert_eq!(
            statement.statement_id,
            vector_hex_array(&expected["statementIdHex"])
        );
        assert_eq!(
            derive_substrate_federated_checkpoint_attestation_digest_v1(&statement.encoded)
                .unwrap(),
            vector_hex_array(&expected["attestationDigestHex"])
        );
        assert_eq!(
            SUBSTRATE_FEDERATED_CHECKPOINT_EXTENSION_KEY,
            vector_hex_array(&expected["extensionKeyHex"])
        );
        assert_eq!(
            encode_substrate_federated_checkpoint_extension_value_v1(&statement.encoded).unwrap(),
            vector_hex_array(&expected["extensionValueHex"])
        );
        assert!(derive_substrate_federated_checkpoint_attestation_digest_v1(
            &statement.encoded[..SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES - 1]
        )
        .is_err());
        assert!(encode_substrate_federated_checkpoint_extension_value_v1(
            &statement.encoded[..SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES - 1]
        )
        .is_err());
    }

    #[test]
    fn rejects_noncanonical_or_aliased_key_roles_and_profiles() {
        let profile = golden_profile();
        let canonical = profile_input(&profile);

        let mut reversed = canonical.clone();
        reversed.source_attestation_public_keys.reverse();
        assert!(encode_substrate_federated_checkpoint_profile_v1(&reversed).is_err());

        let mut duplicate = canonical.clone();
        duplicate.source_attestation_public_keys[1] = duplicate.source_attestation_public_keys[0];
        assert!(encode_substrate_federated_checkpoint_profile_v1(&duplicate).is_err());

        for source_threshold in [0, 4] {
            let mut changed = canonical.clone();
            changed.source_attestation_threshold = source_threshold;
            assert!(encode_substrate_federated_checkpoint_profile_v1(&changed).is_err());
        }
        for ergo_threshold in [0, 4] {
            let mut changed = canonical.clone();
            changed.ergo_admission_threshold = ergo_threshold;
            assert!(encode_substrate_federated_checkpoint_profile_v1(&changed).is_err());
        }

        let mut wrong_ergo_key = canonical.clone();
        wrong_ergo_key.ergo_admission_public_keys[0][0] = 0x04;
        assert!(encode_substrate_federated_checkpoint_profile_v1(&wrong_ergo_key).is_err());

        let mut too_many = canonical.clone();
        too_many.source_attestation_public_keys = (1u8..=9).map(|byte| [byte; 32]).collect();
        assert!(encode_substrate_federated_checkpoint_profile_v1(&too_many).is_err());

        let mut zero_epoch = canonical.clone();
        zero_epoch.federation_epoch = 0;
        assert!(encode_substrate_federated_checkpoint_profile_v1(&zero_epoch).is_err());
        let mut zero_validity = canonical.clone();
        zero_validity.max_admission_validity_blocks = 0;
        assert!(encode_substrate_federated_checkpoint_profile_v1(&zero_validity).is_err());

        let profile_bytes = profile.encoded.clone();
        for offset in 0..4 {
            let mut changed = profile_bytes.clone();
            changed[offset] ^= 0x80;
            assert!(decode_substrate_federated_checkpoint_profile_v1(&changed).is_err());
        }
        assert!(decode_substrate_federated_checkpoint_profile_v1(
            &profile_bytes[..profile_bytes.len() - 1]
        )
        .is_err());
        let mut extra = profile_bytes;
        extra.push(0);
        assert!(decode_substrate_federated_checkpoint_profile_v1(&extra).is_err());
    }

    #[test]
    fn rejects_malformed_statement_shape_and_each_required_binding_class() {
        let (profile, statement) = golden_statement();
        let canonical = statement.encoded;

        for offset in 0..4 {
            let mut changed = canonical;
            changed[offset] ^= 0x80;
            assert!(decode_substrate_federated_checkpoint_statement_v1(&changed).is_err());
        }
        for (start, end) in [
            (4usize, 36usize),
            (36, 68),
            (76, 108),
            (108, 140),
            (140, 172),
            (176, 196),
            (196, 216),
            (216, 248),
            (252, 284),
            (288, 320),
            (324, 356),
            (356, 388),
            (388, 420),
            (420, 452),
            (454, 486),
        ] {
            let mut changed = canonical;
            changed[start..end].fill(0);
            assert!(decode_substrate_federated_checkpoint_statement_v1(&changed).is_err());
        }
        assert!(decode_substrate_federated_checkpoint_statement_v1(&canonical[..511]).is_err());
        for offset in [SOURCE_THRESHOLD_OFFSET, ERGO_THRESHOLD_OFFSET] {
            let mut changed = canonical;
            changed[offset..offset + 2].copy_from_slice(&9u16.to_be_bytes());
            assert!(decode_substrate_federated_checkpoint_statement_v1(&changed).is_err());
        }

        let canonical_input = statement_input(&statement, profile);
        let mut zero_burn = canonical_input.clone();
        zero_burn.burn_leaf_count = 0;
        assert!(encode_substrate_federated_checkpoint_statement_v1(&zero_burn).is_err());
        let mut excessive_burn = canonical_input.clone();
        excessive_burn.burn_leaf_count = 257;
        assert!(encode_substrate_federated_checkpoint_statement_v1(&excessive_burn).is_err());
        let mut aliased_address = canonical_input.clone();
        aliased_address.token_address = aliased_address.bridge_address;
        assert!(encode_substrate_federated_checkpoint_statement_v1(&aliased_address).is_err());

        for code_field in 0..3 {
            let mut changed = canonical_input.clone();
            match code_field {
                0 => changed.bridge_runtime_code_bytes = 0,
                1 => changed.token_runtime_code_bytes = 0,
                2 => changed.source_runtime_code_bytes = 0,
                _ => unreachable!(),
            }
            assert!(encode_substrate_federated_checkpoint_statement_v1(&changed).is_err());
        }

        let mut empty_horizon = canonical_input.clone();
        empty_horizon.admission_expires_at_ergo_height =
            empty_horizon.admission_valid_from_ergo_height;
        assert!(encode_substrate_federated_checkpoint_statement_v1(&empty_horizon).is_err());
        let mut excessive_horizon = canonical_input;
        excessive_horizon.admission_expires_at_ergo_height = 1_075;
        assert!(encode_substrate_federated_checkpoint_statement_v1(&excessive_horizon).is_err());
    }

    #[test]
    fn profile_match_and_current_height_are_fail_closed() {
        let (profile, statement) = golden_statement();
        for offset in [388usize, 420, 453, 454, 487, 495] {
            let mut changed = statement.encoded;
            changed[offset] ^= 1;
            let decoded = decode_substrate_federated_checkpoint_statement_v1(&changed).unwrap();
            assert!(
                assert_substrate_federated_checkpoint_statement_v1_matches_profile(
                    &decoded, &profile
                )
                .is_err()
            );
        }
        let mut changed_profile_input = profile_input(&profile);
        changed_profile_input.federation_epoch += 1;
        let changed_profile =
            build_substrate_federated_checkpoint_profile_v1(&changed_profile_input).unwrap();
        let mut forged_profile_fields = statement.clone();
        forged_profile_fields.federation_profile_id = changed_profile.profile_id;
        forged_profile_fields.source_attestation_key_set_digest =
            changed_profile.source_attestation_key_set_digest;
        forged_profile_fields.source_attestation_threshold =
            changed_profile.source_attestation_threshold;
        forged_profile_fields.ergo_admission_key_set_digest =
            changed_profile.ergo_admission_key_set_digest;
        forged_profile_fields.ergo_admission_threshold = changed_profile.ergo_admission_threshold;
        forged_profile_fields.federation_epoch = changed_profile.federation_epoch;
        assert!(
            assert_substrate_federated_checkpoint_statement_v1_matches_profile(
                &forged_profile_fields,
                &changed_profile,
            )
            .is_err()
        );
        assert!(
            assert_substrate_federated_checkpoint_statement_v1_matches_profile(
                &forged_profile_fields,
                &profile,
            )
            .is_ok()
        );
        assert!(
            decode_substrate_federated_checkpoint_statement_v1_for_admission(
                &statement.encoded,
                &profile,
                1_009,
            )
            .is_err()
        );
        assert!(
            decode_substrate_federated_checkpoint_statement_v1_for_admission(
                &statement.encoded,
                &profile,
                1_010,
            )
            .is_ok()
        );
        assert!(
            decode_substrate_federated_checkpoint_statement_v1_for_admission(
                &statement.encoded,
                &profile,
                1_059,
            )
            .is_ok()
        );
        assert!(
            decode_substrate_federated_checkpoint_statement_v1_for_admission(
                &statement.encoded,
                &profile,
                1_060,
            )
            .is_err()
        );

        let mut overlong = statement.encoded;
        overlong[ADMISSION_EXPIRES_AT_ERGO_HEIGHT_OFFSET..]
            .copy_from_slice(&1_075u64.to_be_bytes());
        assert!(decode_substrate_federated_checkpoint_statement_v1(&overlong).is_ok());
        assert!(
            decode_substrate_federated_checkpoint_statement_v1_for_admission(
                &overlong, &profile, 1_010,
            )
            .is_err()
        );
    }

    #[test]
    fn rejects_every_valid_but_unexpected_application_binding() {
        let (profile, statement) = golden_statement();
        let expected = statement_input(&statement, profile);
        for mutation in 0..19 {
            let mut changed = expected.clone();
            match mutation {
                0 => changed.source_network_id = [0x0d; 32],
                1 => changed.sidechain_id = [0x0e; 32],
                2 => changed.source_native_block_height = 1_001,
                3 => changed.source_native_block_hash = [0x0f; 32],
                4 => changed.execution_block_hash = [0x10; 32],
                5 => changed.bridge_event_root = [0x11; 32],
                6 => changed.burn_leaf_count = 4,
                7 => changed.bridge_address = [0x12; 20],
                8 => changed.token_address = [0x13; 20],
                9 => changed.bridge_runtime_code_sha256 = [0x14; 32],
                10 => changed.bridge_runtime_code_bytes += 1,
                11 => changed.token_runtime_code_sha256 = [0x15; 32],
                12 => changed.token_runtime_code_bytes += 1,
                13 => changed.source_runtime_code_sha256 = [0x16; 32],
                14 => changed.source_runtime_code_bytes += 1,
                15 => changed.runtime_profile_id = [0x17; 32],
                16 => changed.settlement_profile_id = [0x18; 32],
                17 => changed.admission_valid_from_ergo_height += 1,
                18 => changed.admission_expires_at_ergo_height -= 1,
                _ => unreachable!(),
            }
            assert!(assert_substrate_federated_checkpoint_statement_v1_matches(
                &statement, &changed
            )
            .is_err());
        }

        let mut changed_profile = expected;
        let mut profile_input = profile_input(&changed_profile.profile);
        profile_input.federation_epoch += 1;
        changed_profile.profile =
            build_substrate_federated_checkpoint_profile_v1(&profile_input).unwrap();
        assert!(assert_substrate_federated_checkpoint_statement_v1_matches(
            &statement,
            &changed_profile,
        )
        .is_err());
    }

    #[test]
    fn old_statement_families_cannot_decode_the_federated_family() {
        let (_, statement) = golden_statement();
        assert!(crate::decode_bridge_validity_finality_payload_v2(&statement.encoded).is_err());
        #[cfg(feature = "application-v2")]
        assert!(crate::decode_bridge_validity_application_payload_v3(&statement.encoded).is_err());
        #[cfg(feature = "pooled-reserve-burn-v4")]
        assert!(crate::decode_pooled_reserve_burn_public_inputs_v4(&statement.encoded).is_err());
        #[cfg(feature = "pooled-reserve-burn-v5")]
        assert!(crate::decode_pooled_reserve_burn_public_inputs_v5(&statement.encoded).is_err());
    }

    fn vector() -> Value {
        serde_json::from_str(include_str!(
            "../../../relayer/test-vectors/substrate-federated-v1-checkpoint-statement.json"
        ))
        .unwrap()
    }

    fn golden_profile() -> SubstrateFederatedCheckpointProfileV1 {
        let vector = vector();
        decode_substrate_federated_checkpoint_profile_v1(&vector_hex(
            &vector["expected"]["encodedProfileHex"],
        ))
        .unwrap()
    }

    fn golden_statement() -> (
        SubstrateFederatedCheckpointProfileV1,
        SubstrateFederatedCheckpointStatementV1,
    ) {
        let vector = vector();
        let profile = decode_substrate_federated_checkpoint_profile_v1(&vector_hex(
            &vector["expected"]["encodedProfileHex"],
        ))
        .unwrap();
        let statement = decode_substrate_federated_checkpoint_statement_v1(&vector_hex(
            &vector["expected"]["encodedStatementHex"],
        ))
        .unwrap();
        (profile, statement)
    }

    fn profile_input(
        profile: &SubstrateFederatedCheckpointProfileV1,
    ) -> SubstrateFederatedCheckpointProfileV1Input {
        SubstrateFederatedCheckpointProfileV1Input {
            federation_epoch: profile.federation_epoch,
            max_admission_validity_blocks: profile.max_admission_validity_blocks,
            source_attestation_threshold: profile.source_attestation_threshold,
            source_attestation_public_keys: profile.source_attestation_public_keys.clone(),
            ergo_admission_threshold: profile.ergo_admission_threshold,
            ergo_admission_public_keys: profile.ergo_admission_public_keys.clone(),
        }
    }

    fn statement_input(
        statement: &SubstrateFederatedCheckpointStatementV1,
        profile: SubstrateFederatedCheckpointProfileV1,
    ) -> SubstrateFederatedCheckpointStatementV1Input {
        SubstrateFederatedCheckpointStatementV1Input {
            profile,
            source_network_id: statement.source_network_id,
            sidechain_id: statement.sidechain_id,
            source_native_block_height: statement.source_native_block_height,
            source_native_block_hash: statement.source_native_block_hash,
            execution_block_hash: statement.execution_block_hash,
            bridge_event_root: statement.bridge_event_root,
            burn_leaf_count: statement.burn_leaf_count,
            bridge_address: statement.bridge_address,
            token_address: statement.token_address,
            bridge_runtime_code_sha256: statement.bridge_runtime_code_sha256,
            bridge_runtime_code_bytes: statement.bridge_runtime_code_bytes,
            token_runtime_code_sha256: statement.token_runtime_code_sha256,
            token_runtime_code_bytes: statement.token_runtime_code_bytes,
            source_runtime_code_sha256: statement.source_runtime_code_sha256,
            source_runtime_code_bytes: statement.source_runtime_code_bytes,
            runtime_profile_id: statement.runtime_profile_id,
            settlement_profile_id: statement.settlement_profile_id,
            admission_valid_from_ergo_height: statement.admission_valid_from_ergo_height,
            admission_expires_at_ergo_height: statement.admission_expires_at_ergo_height,
        }
    }

    fn vector_hex(value: &Value) -> Vec<u8> {
        let encoded = value
            .as_str()
            .expect("golden vector field must be a string");
        let encoded = encoded.strip_prefix("0x").unwrap_or(encoded);
        assert_eq!(encoded.len() % 2, 0, "golden vector hex length drift");
        (0..encoded.len() / 2)
            .map(|index| {
                u8::from_str_radix(&encoded[index * 2..(index + 1) * 2], 16)
                    .expect("golden vector must contain hex")
            })
            .collect()
    }

    fn vector_hex_array<const N: usize>(value: &Value) -> [u8; N] {
        let bytes = vector_hex(value);
        assert_eq!(bytes.len(), N, "golden vector byte length drift");
        bytes.try_into().unwrap()
    }
}
