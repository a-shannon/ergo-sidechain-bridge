#![cfg(windows)]

mod pe;
mod win32;

use std::env;
use std::ffi::{OsStr, OsString};
use std::fs::File;
use std::io::{Read, Write};
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use win32::{
    AuthorityUpdateGuard, Handle, InstallationImageIdentity, Process, Stage,
    VerifiedInstallationImage,
};

const MAX_REQUEST_BYTES: usize = 32 * 1024 * 1024;
const MAX_STDOUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_STDERR_BYTES: usize = 64 * 1024;
const MAX_TARGET_BYTES: u64 = 512 * 1024 * 1024;
const MAX_CHILD_ARGUMENTS: usize = 64;
const MAX_CHILD_ARGUMENT_BYTES: usize = 8 * 1024;
const MAX_AUTHORITY_SYSTEM_DLLS: usize = 128;
const MAX_COMMAND_UNITS: usize = 30_000;
const ROOT_EXIT_DRAIN_GRACE: Duration = Duration::from_millis(100);
const AUTHORITY_RECORD_V1_TAG: &[u8; 8] = b"E2SAUTH1";
const AUTHORITY_RECORD_V1_LEN: usize = 80;
const AUTHORITY_RECORD_V2_TAG: &[u8; 8] = b"E2SAUTH2";
const AUTHORITY_RECORD_V2_LEN: usize = 144;

#[derive(Clone, Copy, Debug)]
enum BrokerError {
    Usage,
    Target,
    Integrity,
    PolicyWindow,
    AuthorityPolicy,
    InputLimit,
    Create,
    Containment,
    Timeout,
    StdoutLimit,
    StderrLimit,
    Child,
    Inspection,
    Cleanup,
    Internal,
}

impl BrokerError {
    fn token(self) -> &'static str {
        match self {
            Self::Usage => "BROKER_USAGE",
            Self::Target => "BROKER_TARGET",
            Self::Integrity => "BROKER_INTEGRITY",
            Self::PolicyWindow => "BROKER_POLICY_WINDOW",
            Self::AuthorityPolicy => "BROKER_AUTHORITY_POLICY",
            Self::InputLimit => "BROKER_INPUT_LIMIT",
            Self::Create => "BROKER_CREATE",
            Self::Containment => "BROKER_CONTAINMENT",
            Self::Timeout => "BROKER_TIMEOUT",
            Self::StdoutLimit => "BROKER_STDOUT_LIMIT",
            Self::StderrLimit => "BROKER_STDERR_LIMIT",
            Self::Child => "BROKER_CHILD",
            Self::Inspection => "BROKER_INSPECTION",
            Self::Cleanup => "BROKER_CLEANUP",
            Self::Internal => "BROKER_INTERNAL",
        }
    }

    fn exit_code(self) -> i32 {
        match self {
            Self::Usage | Self::Target | Self::Integrity | Self::InputLimit => 20,
            Self::Create => 21,
            Self::Timeout => 22,
            Self::StdoutLimit => 23,
            Self::StderrLimit => 24,
            Self::Child => 25,
            Self::Containment | Self::Inspection | Self::Cleanup | Self::Internal => 26,
            Self::PolicyWindow => 27,
            Self::AuthorityPolicy => 28,
        }
    }
}

struct Config {
    target: PathBuf,
    digest: [u8; 32],
    not_before_unix_ms: u64,
    expires_at_unix_ms: u64,
    timeout: Duration,
    request_limit: usize,
    stdout_limit: usize,
    stderr_limit: usize,
    child_args: Vec<OsString>,
    authority: Option<AuthorityConfig>,
}

struct AuthorityConfig {
    profile_digest: String,
    policy_digest: [u8; 32],
    policy_epoch: u64,
    record_version: AuthorityRecordVersion,
    allowed_system_dlls: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AuthorityRecordVersion {
    V1,
    V2,
}

struct AuthorityRecordV1 {
    profile_digest: [u8; 32],
    policy_digest: [u8; 32],
    minimum_policy_epoch: u64,
}

struct AuthorityRecordV2 {
    profile_digest: [u8; 32],
    policy_digest: [u8; 32],
    launcher_digest: [u8; 32],
    launcher_size: u64,
    launcher_identity: InstallationImageIdentity,
    minimum_policy_epoch: u64,
}

struct BrokerSuccess {
    stdout: Vec<u8>,
    authority_update_guard: Option<AuthorityUpdateGuard>,
    _installation_image: Option<VerifiedInstallationImage>,
}

fn main() {
    std::panic::set_hook(Box::new(|_| {}));
    let result = std::panic::catch_unwind(run);
    match result {
        Ok(Ok(mut success)) => {
            let stdout = std::io::stdout();
            let mut stdout = stdout.lock();
            let publish_result = publish_stdout_and_release(
                &mut stdout,
                &success.stdout,
                success.authority_update_guard.take(),
            );
            drop(stdout);
            drop(success);
            if let Err(error) = publish_result {
                emit_error(error);
            }
        }
        Ok(Err(error)) => emit_error(error),
        Err(_) => emit_error(BrokerError::Internal),
    }
}

fn publish_stdout_and_release<W: Write>(
    writer: &mut W,
    output: &[u8],
    authority_update_guard: Option<AuthorityUpdateGuard>,
) -> Result<(), BrokerError> {
    let publish_result = writer.write_all(output).and_then(|_| writer.flush());
    let release_result = authority_update_guard.map_or(Ok(()), AuthorityUpdateGuard::release);
    if publish_result.is_err() {
        Err(BrokerError::Inspection)
    } else if release_result.is_err() {
        Err(BrokerError::AuthorityPolicy)
    } else {
        Ok(())
    }
}

fn emit_error(error: BrokerError) -> ! {
    let _ = writeln!(std::io::stderr(), "{}", error.token());
    std::process::exit(error.exit_code());
}

fn run() -> Result<BrokerSuccess, BrokerError> {
    let config = parse_args(env::args_os().skip(1).collect())?;
    assert_policy_window(&config)?;
    let request = read_request(config.request_limit)?;
    let installation_image = match config.authority.as_ref() {
        Some(authority) if authority.record_version == AuthorityRecordVersion::V2 => Some(
            win32::open_current_executable_image(MAX_TARGET_BYTES)
                .map_err(|_| BrokerError::AuthorityPolicy)?,
        ),
        _ => None,
    };

    let target = win32::open_verified_source(&config.target, MAX_TARGET_BYTES).map_err(
        |error| match error {
            win32::SourceError::Target => BrokerError::Target,
            win32::SourceError::Integrity => BrokerError::Integrity,
            win32::SourceError::Inspection => BrokerError::Inspection,
        },
    )?;
    if !constant_time_eq(&target.digest, &config.digest) {
        return Err(BrokerError::Integrity);
    }

    assert_current_authority_record(config.authority.as_ref(), installation_image.as_ref())?;
    if let Some(authority) = &config.authority {
        let image =
            win32::read_verified_source(&target).map_err(|_| BrokerError::AuthorityPolicy)?;
        pe::validate_authoritative_image(&image, &authority.allowed_system_dlls)
            .map_err(|_| BrokerError::AuthorityPolicy)?;
    }

    assert_policy_window(&config)?;
    let mut stage = win32::stage_verified_copy(&target).map_err(|error| match error {
        win32::StageError::Integrity => BrokerError::Integrity,
        win32::StageError::Create => BrokerError::Create,
        win32::StageError::Inspection => BrokerError::Inspection,
    })?;

    let mut authority_update_guard = acquire_authority_update_guard(config.authority.as_ref())?;
    assert_current_authority_record(config.authority.as_ref(), installation_image.as_ref())?;
    assert_policy_window(&config)?;
    let child_result = launch_and_monitor(
        &config,
        &request,
        &stage,
        config
            .authority
            .as_ref()
            .map(|authority| authority.record_version),
        &mut authority_update_guard,
    );
    let cleanup_result = stage.cleanup();
    drop(target);

    if cleanup_result.is_err() {
        return Err(BrokerError::Cleanup);
    }
    Ok(BrokerSuccess {
        stdout: child_result?,
        authority_update_guard,
        _installation_image: installation_image,
    })
}

fn parse_args(args: Vec<OsString>) -> Result<Config, BrokerError> {
    if args.len() < 17
        || args[0] != "--target"
        || args[2] != "--sha256"
        || args[4] != "--not-before-unix-ms"
        || args[6] != "--expires-at-unix-ms"
        || args[8] != "--timeout-ms"
        || args[10] != "--request-limit"
        || args[12] != "--stdout-limit"
        || args[14] != "--stderr-limit"
    {
        return Err(BrokerError::Usage);
    }

    let separator = args[16..]
        .iter()
        .position(|arg| arg == "--")
        .map(|index| index + 16)
        .ok_or(BrokerError::Usage)?;
    let authority = parse_authority_args(&args[16..separator])?;

    let child_args = args[separator + 1..].to_vec();
    if child_args.len() > MAX_CHILD_ARGUMENTS
        || child_args.iter().any(|arg| contains_nul(arg))
        || child_args
            .iter()
            .map(|arg| arg.to_str().map(str::len).ok_or(BrokerError::Usage))
            .try_fold(0usize, |total, length| {
                total.checked_add(length?).ok_or(BrokerError::Usage)
            })?
            > MAX_CHILD_ARGUMENT_BYTES
        || child_args
            .iter()
            .map(|arg| arg.encode_wide().count().saturating_add(1))
            .sum::<usize>()
            > MAX_COMMAND_UNITS
    {
        return Err(BrokerError::Usage);
    }

    let target = PathBuf::from(&args[1]);
    if contains_nul(args[1].as_os_str()) {
        return Err(BrokerError::Target);
    }

    let not_before_unix_ms = parse_u64(&args[5])?;
    let expires_at_unix_ms = parse_u64(&args[7])?;
    if not_before_unix_ms >= expires_at_unix_ms {
        return Err(BrokerError::Usage);
    }

    Ok(Config {
        target,
        digest: parse_digest(&args[3])?,
        not_before_unix_ms,
        expires_at_unix_ms,
        timeout: Duration::from_millis(parse_bounded(&args[9], 300_000)? as u64),
        request_limit: parse_bounded(&args[11], MAX_REQUEST_BYTES)?,
        stdout_limit: parse_bounded(&args[13], MAX_STDOUT_BYTES)?,
        stderr_limit: parse_bounded(&args[15], MAX_STDERR_BYTES)?,
        child_args,
        authority,
    })
}

fn parse_authority_args(args: &[OsString]) -> Result<Option<AuthorityConfig>, BrokerError> {
    if args.is_empty() {
        return Ok(None);
    }
    if args.len() % 2 != 0 {
        return Err(BrokerError::AuthorityPolicy);
    }

    let mut profile_digest = None;
    let mut policy_digest = None;
    let mut policy_epoch = None;
    let mut record_version = None;
    let mut allowed_system_dlls = Vec::new();
    for pair in args.chunks_exact(2) {
        let value = pair[1].to_str().ok_or(BrokerError::AuthorityPolicy)?;
        match pair[0].to_str() {
            Some("--authority-profile-digest") if profile_digest.is_none() => {
                parse_plain_digest(value)?;
                profile_digest = Some(value.to_owned());
            }
            Some("--authority-policy-digest") if policy_digest.is_none() => {
                policy_digest = Some(parse_plain_digest(value)?);
            }
            Some("--authority-policy-epoch") if policy_epoch.is_none() => {
                let epoch = parse_authority_u64(value)?;
                if epoch == 0 {
                    return Err(BrokerError::AuthorityPolicy);
                }
                policy_epoch = Some(epoch);
            }
            Some("--authority-record-version") if record_version.is_none() => {
                record_version = Some(match value {
                    "v1" => AuthorityRecordVersion::V1,
                    "v2" => AuthorityRecordVersion::V2,
                    _ => return Err(BrokerError::AuthorityPolicy),
                });
            }
            Some("--allowed-system-dll") => {
                if !pe::is_allowed_dll_name(value) {
                    return Err(BrokerError::AuthorityPolicy);
                }
                allowed_system_dlls.push(value.to_owned());
            }
            _ => return Err(BrokerError::AuthorityPolicy),
        }
    }
    if profile_digest.is_none()
        || policy_digest.is_none()
        || policy_epoch.is_none()
        || allowed_system_dlls.is_empty()
        || allowed_system_dlls.len() > MAX_AUTHORITY_SYSTEM_DLLS
        || allowed_system_dlls
            .windows(2)
            .any(|pair| pair[0] >= pair[1])
    {
        return Err(BrokerError::AuthorityPolicy);
    }
    Ok(Some(AuthorityConfig {
        profile_digest: profile_digest.ok_or(BrokerError::AuthorityPolicy)?,
        policy_digest: policy_digest.ok_or(BrokerError::AuthorityPolicy)?,
        policy_epoch: policy_epoch.ok_or(BrokerError::AuthorityPolicy)?,
        record_version: record_version.unwrap_or(AuthorityRecordVersion::V1),
        allowed_system_dlls,
    }))
}

fn parse_authority_u64(value: &str) -> Result<u64, BrokerError> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(BrokerError::AuthorityPolicy);
    }
    value
        .parse::<u64>()
        .map_err(|_| BrokerError::AuthorityPolicy)
}

fn parse_plain_digest(value: &str) -> Result<[u8; 32], BrokerError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(BrokerError::AuthorityPolicy);
    }
    let mut digest = [0u8; 32];
    for (index, output) in digest.iter_mut().enumerate() {
        let offset = index * 2;
        *output = u8::from_str_radix(&value[offset..offset + 2], 16)
            .map_err(|_| BrokerError::AuthorityPolicy)?;
    }
    Ok(digest)
}

fn validate_policy_epoch(epoch: u64, floor: u64) -> Result<(), BrokerError> {
    if floor == 0 || epoch < floor {
        Err(BrokerError::AuthorityPolicy)
    } else {
        Ok(())
    }
}

fn parse_authority_record_v1(bytes: &[u8]) -> Result<AuthorityRecordV1, BrokerError> {
    if bytes.len() != AUTHORITY_RECORD_V1_LEN || &bytes[..8] != AUTHORITY_RECORD_V1_TAG {
        return Err(BrokerError::AuthorityPolicy);
    }
    let mut profile_digest = [0u8; 32];
    profile_digest.copy_from_slice(&bytes[8..40]);
    let mut policy_digest = [0u8; 32];
    policy_digest.copy_from_slice(&bytes[40..72]);
    let mut epoch_bytes = [0u8; 8];
    epoch_bytes.copy_from_slice(&bytes[72..80]);
    let minimum_policy_epoch = u64::from_le_bytes(epoch_bytes);
    if minimum_policy_epoch == 0 {
        return Err(BrokerError::AuthorityPolicy);
    }
    Ok(AuthorityRecordV1 {
        profile_digest,
        policy_digest,
        minimum_policy_epoch,
    })
}

fn parse_authority_record_v2(bytes: &[u8]) -> Result<AuthorityRecordV2, BrokerError> {
    if bytes.len() != AUTHORITY_RECORD_V2_LEN || &bytes[..8] != AUTHORITY_RECORD_V2_TAG {
        return Err(BrokerError::AuthorityPolicy);
    }
    let mut profile_digest = [0u8; 32];
    profile_digest.copy_from_slice(&bytes[8..40]);
    let mut policy_digest = [0u8; 32];
    policy_digest.copy_from_slice(&bytes[40..72]);
    let mut launcher_digest = [0u8; 32];
    launcher_digest.copy_from_slice(&bytes[72..104]);
    let launcher_size = parse_record_u64(&bytes[104..112])?;
    let volume_serial_number = parse_record_u64(&bytes[112..120])?;
    let mut file_id = [0u8; 16];
    file_id.copy_from_slice(&bytes[120..136]);
    let minimum_policy_epoch = parse_record_u64(&bytes[136..144])?;
    if launcher_size == 0 || minimum_policy_epoch == 0 {
        return Err(BrokerError::AuthorityPolicy);
    }
    Ok(AuthorityRecordV2 {
        profile_digest,
        policy_digest,
        launcher_digest,
        launcher_size,
        launcher_identity: InstallationImageIdentity {
            volume_serial_number,
            file_id,
        },
        minimum_policy_epoch,
    })
}

fn parse_record_u64(bytes: &[u8]) -> Result<u64, BrokerError> {
    let value: [u8; 8] = bytes.try_into().map_err(|_| BrokerError::AuthorityPolicy)?;
    Ok(u64::from_le_bytes(value))
}

fn assert_authority_record_v1(
    authority: &AuthorityConfig,
    bytes: &[u8],
) -> Result<(), BrokerError> {
    let record = parse_authority_record_v1(bytes)?;
    let expected_profile_digest = parse_plain_digest(&authority.profile_digest)?;
    if !constant_time_eq(&expected_profile_digest, &record.profile_digest)
        || !constant_time_eq(&authority.policy_digest, &record.policy_digest)
    {
        return Err(BrokerError::AuthorityPolicy);
    }
    validate_policy_epoch(authority.policy_epoch, record.minimum_policy_epoch)
}

fn assert_authority_record_v2(
    authority: &AuthorityConfig,
    image_digest: &[u8; 32],
    image_size: u64,
    image_identity: InstallationImageIdentity,
    bytes: &[u8],
) -> Result<(), BrokerError> {
    let record = parse_authority_record_v2(bytes)?;
    let expected_profile_digest = parse_plain_digest(&authority.profile_digest)?;
    if !constant_time_eq(&expected_profile_digest, &record.profile_digest)
        || !constant_time_eq(&authority.policy_digest, &record.policy_digest)
        || !constant_time_eq(image_digest, &record.launcher_digest)
        || image_size != record.launcher_size
        || image_identity != record.launcher_identity
    {
        return Err(BrokerError::AuthorityPolicy);
    }
    validate_policy_epoch(authority.policy_epoch, record.minimum_policy_epoch)
}

fn assert_current_authority_record(
    authority: Option<&AuthorityConfig>,
    installation_image: Option<&VerifiedInstallationImage>,
) -> Result<(), BrokerError> {
    let Some(authority) = authority else {
        return Ok(());
    };
    match authority.record_version {
        AuthorityRecordVersion::V1 => {
            let bytes = win32::read_authority_record_v1(&authority.profile_digest)
                .map_err(|_| BrokerError::AuthorityPolicy)?;
            assert_authority_record_v1(authority, &bytes)
        }
        AuthorityRecordVersion::V2 => {
            let image = installation_image.ok_or(BrokerError::AuthorityPolicy)?;
            let bytes = win32::read_authority_record_v2(&authority.profile_digest)
                .map_err(|_| BrokerError::AuthorityPolicy)?;
            assert_authority_record_v2(authority, &image.digest, image.size, image.identity, &bytes)
        }
    }
}

fn acquire_authority_update_guard(
    authority: Option<&AuthorityConfig>,
) -> Result<Option<AuthorityUpdateGuard>, BrokerError> {
    let Some(authority) = authority else {
        return Ok(None);
    };
    let guard = match authority.record_version {
        AuthorityRecordVersion::V1 => win32::acquire_authority_update_guard(),
        AuthorityRecordVersion::V2 => win32::acquire_authority_update_guard_v2(),
    }
    .map_err(|_| BrokerError::AuthorityPolicy)?;
    Ok(Some(guard))
}

fn parse_u64(value: &OsStr) -> Result<u64, BrokerError> {
    let text = value.to_str().ok_or(BrokerError::Usage)?;
    if text.is_empty() || !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(BrokerError::Usage);
    }
    text.parse::<u64>().map_err(|_| BrokerError::Usage)
}

fn assert_policy_window(config: &Config) -> Result<(), BrokerError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| BrokerError::Inspection)?
        .as_millis();
    if now < u128::from(config.not_before_unix_ms) || now >= u128::from(config.expires_at_unix_ms) {
        return Err(BrokerError::PolicyWindow);
    }
    Ok(())
}

fn parse_bounded(value: &OsStr, max: usize) -> Result<usize, BrokerError> {
    let text = value.to_str().ok_or(BrokerError::Usage)?;
    if text.is_empty() || !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(BrokerError::Usage);
    }
    let parsed = text.parse::<usize>().map_err(|_| BrokerError::Usage)?;
    if parsed == 0 || parsed > max {
        return Err(BrokerError::Usage);
    }
    Ok(parsed)
}

fn parse_digest(value: &OsStr) -> Result<[u8; 32], BrokerError> {
    let text = value.to_str().ok_or(BrokerError::Usage)?;
    if text.len() != 66
        || !text.starts_with("0x")
        || !text[2..]
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(BrokerError::Usage);
    }
    let mut digest = [0u8; 32];
    for (index, output) in digest.iter_mut().enumerate() {
        let offset = 2 + index * 2;
        *output =
            u8::from_str_radix(&text[offset..offset + 2], 16).map_err(|_| BrokerError::Usage)?;
    }
    Ok(digest)
}

fn contains_nul(value: &OsStr) -> bool {
    value.encode_wide().any(|unit| unit == 0)
}

fn read_request(limit: usize) -> Result<Vec<u8>, BrokerError> {
    let mut bytes = Vec::with_capacity(limit.min(64 * 1024));
    std::io::stdin()
        .take(limit.saturating_add(1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| BrokerError::Inspection)?;
    if bytes.len() > limit {
        return Err(BrokerError::InputLimit);
    }
    Ok(bytes)
}

fn launch_and_monitor(
    config: &Config,
    request: &[u8],
    stage: &Stage,
    authority_record_version: Option<AuthorityRecordVersion>,
    authority_update_guard: &mut Option<AuthorityUpdateGuard>,
) -> Result<Vec<u8>, BrokerError> {
    assert_policy_window(config)?;
    let command_line = build_command_line(&stage.file_path, &config.child_args)?;
    let environment = minimal_environment(&stage.directory_path)?;
    let module_policy = config
        .authority
        .as_ref()
        .map(|authority| win32::ModulePolicy::new(&authority.allowed_system_dlls))
        .transpose()
        .map_err(|_| BrokerError::AuthorityPolicy)?;
    let mut process = win32::create_contained_process(
        stage,
        &command_line,
        &environment,
        module_policy.is_some(),
    )
    .map_err(|error| match error {
        win32::ProcessError::Create => BrokerError::Create,
        win32::ProcessError::Containment => BrokerError::Containment,
        win32::ProcessError::Inspection => BrokerError::Inspection,
    })?;

    let stdout_overflow = Arc::new(AtomicBool::new(false));
    let stderr_overflow = Arc::new(AtomicBool::new(false));
    let stdin_thread = spawn_stdin_writer(
        process.stdin.take().ok_or(BrokerError::Internal)?,
        request.to_vec(),
    );
    let stdout_thread = spawn_drain(
        process.stdout.take().ok_or(BrokerError::Internal)?,
        config.stdout_limit,
        Arc::clone(&stdout_overflow),
    );
    let stderr_thread = spawn_drain(
        process.stderr.take().ok_or(BrokerError::Internal)?,
        config.stderr_limit,
        Arc::clone(&stderr_overflow),
    );

    if assert_policy_window(config).is_err() {
        let _ = process.terminate_and_verify();
        drop(process);
        join_io(stdin_thread, stdout_thread, stderr_thread);
        return Err(BrokerError::PolicyWindow);
    }
    if assert_policy_window(config).is_err() {
        let _ = process.terminate_and_verify();
        drop(process);
        join_io(stdin_thread, stdout_thread, stderr_thread);
        return Err(BrokerError::PolicyWindow);
    }
    if process.resume().is_err() {
        let _ = process.terminate_and_verify();
        drop(process);
        join_io(stdin_thread, stdout_thread, stderr_thread);
        return Err(BrokerError::Containment);
    }
    if authority_record_version != Some(AuthorityRecordVersion::V2) {
        if let Some(guard) = authority_update_guard.take() {
            if guard.release().is_err() {
                let _ = process.terminate_and_verify();
                drop(process);
                join_io(stdin_thread, stdout_thread, stderr_thread);
                return Err(BrokerError::AuthorityPolicy);
            }
        }
    }

    let root_exit = match monitor_process(
        &mut process,
        config.timeout,
        &stdout_overflow,
        &stderr_overflow,
        module_policy.as_ref(),
    ) {
        Ok(root_exit) => root_exit,
        Err(error) => {
            let termination_failed = process.terminate_and_verify().is_err();
            drop(process);
            join_io(stdin_thread, stdout_thread, stderr_thread);
            return if termination_failed {
                Err(if module_policy.is_some() {
                    BrokerError::AuthorityPolicy
                } else {
                    BrokerError::Containment
                })
            } else {
                Err(error)
            };
        }
    };

    let (stdin_ok, stdout, stderr) = join_io(stdin_thread, stdout_thread, stderr_thread);
    if !stdin_ok || stdout.io_error || stderr.io_error {
        return Err(BrokerError::Inspection);
    }
    if stdout.overflow {
        return Err(BrokerError::StdoutLimit);
    }
    if stderr.overflow {
        return Err(BrokerError::StderrLimit);
    }
    if root_exit != 0 {
        return Err(BrokerError::Child);
    }
    Ok(stdout.bytes)
}

fn monitor_process(
    process: &mut Process,
    timeout: Duration,
    stdout_overflow: &AtomicBool,
    stderr_overflow: &AtomicBool,
    module_policy: Option<&win32::ModulePolicy>,
) -> Result<u32, BrokerError> {
    let started = Instant::now();
    let mut root_exit_observed_at: Option<Instant> = None;
    loop {
        if let Some(policy) = module_policy {
            process
                .drain_debug_events(policy)
                .map_err(|_| BrokerError::AuthorityPolicy)?;
            if process
                .total_processes()
                .map_err(|_| BrokerError::AuthorityPolicy)?
                > 1
            {
                return Err(BrokerError::AuthorityPolicy);
            }
        }
        if stdout_overflow.load(Ordering::Acquire) {
            return Err(BrokerError::StdoutLimit);
        }
        if stderr_overflow.load(Ordering::Acquire) {
            return Err(BrokerError::StderrLimit);
        }
        match process
            .root_wait_status()
            .map_err(|_| BrokerError::Inspection)?
        {
            win32::WaitStatus::Running => {}
            win32::WaitStatus::Exited => {
                let active = process
                    .active_processes()
                    .map_err(|_| BrokerError::Inspection)?;
                if active == 0 {
                    validate_module_observation_completion(
                        module_policy.is_some(),
                        process.initial_loader_breakpoint_seen(),
                    )?;
                    return process.exit_code().map_err(|_| BrokerError::Inspection);
                }
                let observed_at = root_exit_observed_at.get_or_insert_with(Instant::now);
                if observed_at.elapsed() >= ROOT_EXIT_DRAIN_GRACE {
                    return Err(BrokerError::Containment);
                }
            }
        }
        if started.elapsed() >= timeout {
            return Err(BrokerError::Timeout);
        }
        thread::sleep(Duration::from_millis(5));
    }
}

fn validate_module_observation_completion(
    authority_mode: bool,
    initial_loader_breakpoint_seen: bool,
) -> Result<(), BrokerError> {
    if authority_mode && !initial_loader_breakpoint_seen {
        Err(BrokerError::AuthorityPolicy)
    } else {
        Ok(())
    }
}

struct DrainResult {
    bytes: Vec<u8>,
    overflow: bool,
    io_error: bool,
}

fn spawn_stdin_writer(handle: Handle, bytes: Vec<u8>) -> thread::JoinHandle<bool> {
    thread::spawn(move || {
        let mut file: File = handle.into_file();
        file.write_all(&bytes).is_ok() && file.flush().is_ok()
    })
}

fn spawn_drain(
    handle: Handle,
    limit: usize,
    overflow_signal: Arc<AtomicBool>,
) -> thread::JoinHandle<DrainResult> {
    thread::spawn(move || {
        let mut file: File = handle.into_file();
        let mut bytes = Vec::with_capacity(limit.min(64 * 1024));
        let mut buffer = [0u8; 8192];
        let mut overflow = false;
        loop {
            match file.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    if !overflow && bytes.len().saturating_add(count) <= limit {
                        bytes.extend_from_slice(&buffer[..count]);
                    } else {
                        overflow = true;
                        overflow_signal.store(true, Ordering::Release);
                    }
                }
                Err(_) => {
                    return DrainResult {
                        bytes,
                        overflow,
                        io_error: true,
                    };
                }
            }
        }
        DrainResult {
            bytes,
            overflow,
            io_error: false,
        }
    })
}

fn join_io(
    stdin: thread::JoinHandle<bool>,
    stdout: thread::JoinHandle<DrainResult>,
    stderr: thread::JoinHandle<DrainResult>,
) -> (bool, DrainResult, DrainResult) {
    let stdin_ok = stdin.join().unwrap_or(false);
    let stdout = stdout.join().unwrap_or(DrainResult {
        bytes: Vec::new(),
        overflow: false,
        io_error: true,
    });
    let stderr = stderr.join().unwrap_or(DrainResult {
        bytes: Vec::new(),
        overflow: false,
        io_error: true,
    });
    (stdin_ok, stdout, stderr)
}

fn build_command_line(application: &Path, args: &[OsString]) -> Result<Vec<u16>, BrokerError> {
    let mut command = quote_windows_arg(application.as_os_str());
    for arg in args {
        command.push(' ' as u16);
        command.extend(quote_windows_arg(arg));
    }
    if command.len() >= 32_767 {
        return Err(BrokerError::Usage);
    }
    command.push(0);
    Ok(command)
}

fn quote_windows_arg(arg: &OsStr) -> Vec<u16> {
    let units: Vec<u16> = arg.encode_wide().collect();
    let needs_quotes = units.is_empty()
        || units
            .iter()
            .any(|unit| *unit == b' ' as u16 || *unit == b'\t' as u16);
    if !needs_quotes && !units.contains(&(b'"' as u16)) {
        return units;
    }

    let mut output = Vec::with_capacity(units.len() + 2);
    output.push(b'"' as u16);
    let mut backslashes = 0usize;
    for unit in units {
        if unit == b'\\' as u16 {
            backslashes += 1;
        } else if unit == b'"' as u16 {
            output.extend(std::iter::repeat_n(b'\\' as u16, backslashes * 2 + 1));
            output.push(unit);
            backslashes = 0;
        } else {
            output.extend(std::iter::repeat_n(b'\\' as u16, backslashes));
            output.push(unit);
            backslashes = 0;
        }
    }
    output.extend(std::iter::repeat_n(b'\\' as u16, backslashes * 2));
    output.push(b'"' as u16);
    output
}

fn minimal_environment(stage_directory: &Path) -> Result<Vec<u16>, BrokerError> {
    let windows = win32::windows_directory().map_err(|_| BrokerError::Inspection)?;
    let mut entries = [
        ("SystemRoot", windows.into_os_string()),
        ("TEMP", stage_directory.as_os_str().to_os_string()),
        ("TMP", stage_directory.as_os_str().to_os_string()),
    ];
    entries.sort_by(|left, right| {
        left.0
            .to_ascii_lowercase()
            .cmp(&right.0.to_ascii_lowercase())
    });

    let mut block = Vec::new();
    for (name, value) in entries {
        block.extend(OsStr::new(name).encode_wide());
        block.push(b'=' as u16);
        block.extend(value.encode_wide());
        block.push(0);
    }
    block.push(0);
    Ok(block)
}

fn constant_time_eq(left: &[u8; 32], right: &[u8; 32]) -> bool {
    left.iter()
        .zip(right)
        .fold(0u8, |difference, (left, right)| difference | (left ^ right))
        == 0
}

#[cfg(test)]
mod authority_tests {
    use super::*;
    use std::io;
    use std::sync::mpsc;
    use std::thread;

    struct BlockingFlushWriter {
        written: usize,
        flush_started: mpsc::Sender<()>,
        allow_flush: mpsc::Receiver<()>,
    }

    impl Write for BlockingFlushWriter {
        fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
            self.written += buffer.len();
            Ok(buffer.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            self.flush_started
                .send(())
                .map_err(|_| io::Error::other("flush observer closed"))?;
            self.allow_flush
                .recv_timeout(Duration::from_secs(2))
                .map_err(|_| io::Error::other("flush release timed out"))?;
            Ok(())
        }
    }

    fn authority_args(extra: &[&str]) -> Vec<OsString> {
        let mut args: Vec<OsString> = [
            "--authority-profile-digest",
            &"1".repeat(64),
            "--authority-policy-digest",
            &"2".repeat(64),
            "--authority-policy-epoch",
            "7",
            "--allowed-system-dll",
            "kernel32.dll",
        ]
        .into_iter()
        .map(OsString::from)
        .collect();
        args.extend(extra.iter().map(OsString::from));
        args
    }

    fn authority_record_v1(profile_byte: u8, policy_byte: u8, epoch: u64) -> [u8; 80] {
        let mut record = [0u8; 80];
        record[..8].copy_from_slice(AUTHORITY_RECORD_V1_TAG);
        record[8..40].fill(profile_byte);
        record[40..72].fill(policy_byte);
        record[72..].copy_from_slice(&epoch.to_le_bytes());
        record
    }

    fn authority_record_v2(
        profile_byte: u8,
        policy_byte: u8,
        launcher_byte: u8,
        launcher_size: u64,
        identity: InstallationImageIdentity,
        epoch: u64,
    ) -> [u8; 144] {
        let mut record = [0u8; 144];
        record[..8].copy_from_slice(AUTHORITY_RECORD_V2_TAG);
        record[8..40].fill(profile_byte);
        record[40..72].fill(policy_byte);
        record[72..104].fill(launcher_byte);
        record[104..112].copy_from_slice(&launcher_size.to_le_bytes());
        record[112..120].copy_from_slice(&identity.volume_serial_number.to_le_bytes());
        record[120..136].copy_from_slice(&identity.file_id);
        record[136..144].copy_from_slice(&epoch.to_le_bytes());
        record
    }

    #[test]
    fn authority_arguments_are_all_or_none_and_sorted_unique() {
        assert!(parse_authority_args(&[]).unwrap().is_none());
        assert!(parse_authority_args(&authority_args(&[]))
            .unwrap()
            .is_some());
        assert_eq!(
            parse_authority_args(&authority_args(&["--authority-record-version", "v2",]))
                .unwrap()
                .unwrap()
                .record_version,
            AuthorityRecordVersion::V2,
        );
        assert!(
            parse_authority_args(&authority_args(&["--authority-record-version", "v3",])).is_err()
        );
        assert!(parse_authority_args(&[OsString::from("--authority-policy-epoch")]).is_err());
        assert!(
            parse_authority_args(&authority_args(&["--allowed-system-dll", "advapi32.dll"]))
                .is_err()
        );
        assert!(
            parse_authority_args(&authority_args(&["--allowed-system-dll", "kernel32.dll"]))
                .is_err()
        );
        let oversized_values: Vec<String> = (0..MAX_AUTHORITY_SYSTEM_DLLS)
            .flat_map(|index| {
                [
                    "--allowed-system-dll".to_owned(),
                    format!("library-{index:03}.dll"),
                ]
            })
            .collect();
        let oversized_refs: Vec<&str> = oversized_values.iter().map(String::as_str).collect();
        assert!(parse_authority_args(&authority_args(&oversized_refs)).is_err());
    }

    #[test]
    fn authority_digest_epoch_and_floor_validation_fail_closed() {
        assert!(parse_plain_digest(&"a".repeat(64)).is_ok());
        assert!(parse_plain_digest(&format!("0x{}", "a".repeat(64))).is_err());
        assert!(parse_plain_digest(&"A".repeat(64)).is_err());
        assert!(parse_authority_u64("0").is_ok());
        assert!(validate_policy_epoch(7, 7).is_ok());
        assert!(validate_policy_epoch(6, 7).is_err());
        assert!(validate_policy_epoch(7, 0).is_err());
        let authority = parse_authority_args(&authority_args(&[])).unwrap().unwrap();
        assert!(
            assert_authority_record_v1(&authority, &authority_record_v1(0x11, 0x22, 7),).is_ok()
        );
        assert!(
            assert_authority_record_v1(&authority, &authority_record_v1(0x12, 0x22, 7),).is_err()
        );
        assert!(
            assert_authority_record_v1(&authority, &authority_record_v1(0x11, 0x23, 7),).is_err()
        );
        assert!(
            assert_authority_record_v1(&authority, &authority_record_v1(0x11, 0x22, 8),).is_err()
        );
        assert!(assert_current_authority_record(None, None).is_ok());
        assert!(parse_authority_record_v1(&[0u8; 79]).is_err());
        let mut wrong_version = authority_record_v1(0x11, 0x22, 7);
        wrong_version[7] = b'2';
        assert!(parse_authority_record_v1(&wrong_version).is_err());
        assert!(parse_authority_record_v1(&authority_record_v1(0x11, 0x22, 0)).is_err());
        assert!(validate_module_observation_completion(true, false).is_err());
        assert!(validate_module_observation_completion(true, true).is_ok());
        assert!(validate_module_observation_completion(false, false).is_ok());
    }

    #[test]
    fn authority_v2_binds_launcher_digest_size_and_file_identity() {
        let authority =
            parse_authority_args(&authority_args(&["--authority-record-version", "v2"]))
                .unwrap()
                .unwrap();
        let digest = [0x33; 32];
        let identity = InstallationImageIdentity {
            volume_serial_number: 0x1122_3344_5566_7788,
            file_id: [0x44; 16],
        };
        let record = authority_record_v2(0x11, 0x22, 0x33, 12_345, identity, 7);
        assert!(
            assert_authority_record_v2(&authority, &digest, 12_345, identity, &record,).is_ok()
        );
        assert!(assert_authority_record_v2(
            &authority,
            &digest,
            12_345,
            identity,
            &authority_record_v2(0x12, 0x22, 0x33, 12_345, identity, 7),
        )
        .is_err());
        assert!(assert_authority_record_v2(
            &authority,
            &digest,
            12_345,
            identity,
            &authority_record_v2(0x11, 0x23, 0x33, 12_345, identity, 7),
        )
        .is_err());
        assert!(
            assert_authority_record_v2(&authority, &[0x34; 32], 12_345, identity, &record,)
                .is_err()
        );
        assert!(
            assert_authority_record_v2(&authority, &digest, 12_346, identity, &record,).is_err()
        );
        assert!(assert_authority_record_v2(
            &authority,
            &digest,
            12_345,
            InstallationImageIdentity {
                file_id: [0x45; 16],
                ..identity
            },
            &record,
        )
        .is_err());
        assert!(assert_authority_record_v2(
            &authority,
            &digest,
            12_345,
            InstallationImageIdentity {
                volume_serial_number: identity.volume_serial_number + 1,
                ..identity
            },
            &record,
        )
        .is_err());
        assert!(assert_authority_record_v2(
            &authority,
            &digest,
            12_345,
            identity,
            &authority_record_v2(0x11, 0x22, 0x33, 12_345, identity, 8),
        )
        .is_err());
        assert!(parse_authority_record_v2(&[0u8; AUTHORITY_RECORD_V2_LEN - 1]).is_err());
        let mut wrong_version = record;
        wrong_version[7] = b'1';
        assert!(parse_authority_record_v2(&wrong_version).is_err());
        assert!(
            parse_authority_record_v2(&authority_record_v2(0x11, 0x22, 0x33, 0, identity, 7,))
                .is_err()
        );
        assert!(parse_authority_record_v2(&authority_record_v2(
            0x11, 0x22, 0x33, 12_345, identity, 0,
        ))
        .is_err());
    }

    #[test]
    fn v2_authority_mutex_stays_held_until_large_stdout_is_flushed() {
        let name = format!(
            "Global\\E2SBridge-NativeExecution-v2-Test-publish-{}",
            std::process::id()
        );
        let output = vec![b'O'; 1024 * 1024];
        assert!(!output.contains(&b'\n'));

        let (guard_acquired_tx, guard_acquired_rx) = mpsc::channel();
        let (flush_started_tx, flush_started_rx) = mpsc::channel();
        let (allow_flush_tx, allow_flush_rx) = mpsc::channel();
        let publisher_name = name.clone();
        let publisher = thread::spawn(move || {
            let guard = win32::acquire_named_mutex(&publisher_name, 1_000).unwrap();
            guard_acquired_tx.send(()).unwrap();
            let mut writer = BlockingFlushWriter {
                written: 0,
                flush_started: flush_started_tx,
                allow_flush: allow_flush_rx,
            };
            publish_stdout_and_release(&mut writer, &output, Some(guard)).unwrap();
            writer.written
        });

        guard_acquired_rx
            .recv_timeout(Duration::from_secs(1))
            .unwrap();
        flush_started_rx
            .recv_timeout(Duration::from_secs(1))
            .unwrap();

        let (timed_out_tx, timed_out_rx) = mpsc::channel();
        let (contender_acquired_tx, contender_acquired_rx) = mpsc::channel();
        let contender_name = name.clone();
        let contender = thread::spawn(move || {
            assert!(win32::acquire_named_mutex(&contender_name, 50).is_err());
            timed_out_tx.send(()).unwrap();
            let guard = win32::acquire_named_mutex(&contender_name, 2_000).unwrap();
            contender_acquired_tx.send(()).unwrap();
            guard.release().unwrap();
        });

        timed_out_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(contender_acquired_rx
            .recv_timeout(Duration::from_millis(100))
            .is_err());
        allow_flush_tx.send(()).unwrap();
        assert_eq!(publisher.join().unwrap(), 1024 * 1024);
        contender_acquired_rx
            .recv_timeout(Duration::from_secs(2))
            .unwrap();
        contender.join().unwrap();
    }

    #[test]
    fn debugger_rejects_a_real_unallowlisted_module_before_success() {
        let source_path = std::env::current_exe().unwrap();
        let source = win32::open_verified_source(&source_path, MAX_TARGET_BYTES).unwrap();
        let mut stage = win32::stage_verified_copy(&source).unwrap();
        let command = build_command_line(&stage.file_path, &[OsString::from("--help")]).unwrap();
        let environment = minimal_environment(&stage.directory_path).unwrap();
        let policy = win32::ModulePolicy::new(&["not-loaded.dll".to_owned()]).unwrap();
        let mut process =
            win32::create_contained_process(&stage, &command, &environment, true).unwrap();
        process.resume().unwrap();

        let started = Instant::now();
        loop {
            match process.drain_debug_events(&policy) {
                Ok(()) if started.elapsed() < Duration::from_secs(2) => {
                    thread::sleep(Duration::from_millis(5));
                }
                Err(win32::DebugError::Policy) => break,
                Err(win32::DebugError::Inspection) => panic!("debug event inspection failed"),
                Ok(()) => panic!("no module policy rejection was observed"),
            }
        }
        process.terminate_and_verify().unwrap();
        drop(process);
        stage.cleanup().unwrap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::windows::ffi::OsStringExt;

    #[test]
    fn quoting_matches_windows_crt_rules() {
        let cases = [
            ("", "\"\""),
            ("plain", "plain"),
            ("two words", "\"two words\""),
            (r#"a\"b"#, r#""a\\\"b""#),
            (r"folder\space here\", r#""folder\space here\\""#),
        ];
        for (input, expected) in cases {
            assert_eq!(
                OsString::from_wide(&quote_windows_arg(OsStr::new(input))),
                expected
            );
        }
    }
}
