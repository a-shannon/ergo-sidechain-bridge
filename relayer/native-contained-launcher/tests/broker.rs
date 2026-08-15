#![cfg(windows)]

use std::ffi::c_void;
use std::fs::{self, File};
use std::io::Write;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

static SERIAL: Mutex<()> = Mutex::new(());

type Handle = *mut c_void;
type NtStatus = i32;

const BCRYPT_SHA256_ALGORITHM: &[u16] = &[83, 72, 65, 50, 53, 54, 0];
const BCRYPT_OBJECT_LENGTH: &[u16] = &[79, 98, 106, 101, 99, 116, 76, 101, 110, 103, 116, 104, 0];
const MOVEFILE_REPLACE_EXISTING: u32 = 1;

#[link(name = "kernel32")]
unsafe extern "system" {
    fn MoveFileExW(existing: *const u16, replacement: *const u16, flags: u32) -> i32;
}

#[link(name = "bcrypt")]
unsafe extern "system" {
    fn BCryptOpenAlgorithmProvider(
        algorithm: *mut Handle,
        algorithm_id: *const u16,
        implementation: *const u16,
        flags: u32,
    ) -> NtStatus;
    fn BCryptGetProperty(
        object: Handle,
        property: *const u16,
        output: *mut u8,
        output_len: u32,
        result_len: *mut u32,
        flags: u32,
    ) -> NtStatus;
    fn BCryptCreateHash(
        algorithm: Handle,
        hash: *mut Handle,
        object: *mut u8,
        object_len: u32,
        secret: *const u8,
        secret_len: u32,
        flags: u32,
    ) -> NtStatus;
    fn BCryptHashData(hash: Handle, input: *const u8, input_len: u32, flags: u32) -> NtStatus;
    fn BCryptFinishHash(hash: Handle, output: *mut u8, output_len: u32, flags: u32) -> NtStatus;
    fn BCryptDestroyHash(hash: Handle) -> NtStatus;
    fn BCryptCloseAlgorithmProvider(algorithm: Handle, flags: u32) -> NtStatus;
}

fn launcher() -> &'static str {
    env!("CARGO_BIN_EXE_bridge-contained-launcher")
}

fn fixture() -> &'static str {
    env!("CARGO_BIN_EXE_launcher-fixture")
}

struct Case {
    root: PathBuf,
    target: PathBuf,
}

impl Case {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test-temp")
            .join(format!("{}-{nonce}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let target = root.join("fixture.exe");
        fs::copy(fixture(), &target).unwrap();
        Self { root, target }
    }

    fn command(&self, timeout_ms: u32, stdout_limit: usize, stderr_limit: usize) -> Command {
        let mut command = Command::new(launcher());
        command
            .arg("--target")
            .arg(&self.target)
            .arg("--sha256")
            .arg(sha256_arg(&self.target));
        add_active_policy_window(&mut command);
        command
            .arg("--timeout-ms")
            .arg(timeout_ms.to_string())
            .arg("--request-limit")
            .arg("1048576")
            .arg("--stdout-limit")
            .arg(stdout_limit.to_string())
            .arg("--stderr-limit")
            .arg(stderr_limit.to_string())
            .arg("--");
        command
    }
}

impl Drop for Case {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn run(mut command: Command, input: &[u8]) -> Output {
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(input).unwrap();
    child.wait_with_output().unwrap()
}

fn assert_generic_error(output: &Output, token: &str) {
    assert!(!output.status.success());
    let expected_exit_code = match token {
        "BROKER_USAGE" | "BROKER_TARGET" | "BROKER_INTEGRITY" | "BROKER_INPUT_LIMIT" => 20,
        "BROKER_CREATE" => 21,
        "BROKER_TIMEOUT" => 22,
        "BROKER_STDOUT_LIMIT" => 23,
        "BROKER_STDERR_LIMIT" => 24,
        "BROKER_CHILD" => 25,
        "BROKER_CONTAINMENT" | "BROKER_INSPECTION" | "BROKER_CLEANUP" | "BROKER_INTERNAL" => 26,
        "BROKER_POLICY_WINDOW" => 27,
        "BROKER_AUTHORITY_POLICY" => 28,
        other => panic!("unmapped broker error token: {other}"),
    };
    assert_eq!(output.status.code(), Some(expected_exit_code));
    assert!(output.stdout.is_empty());
    assert_eq!(
        String::from_utf8_lossy(&output.stderr),
        format!("{token}\n")
    );
    assert!(!output.stderr.windows(6).any(|part| part == b"CHILD_"));
}

#[test]
fn authority_arguments_are_all_or_none_and_use_exit_28() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let mut command = authority_command_prefix(&case);
    command
        .args(["--authority-profile-digest", &"1".repeat(64)])
        .arg("--")
        .arg("echo");
    assert_generic_error(&run(command, b""), "BROKER_AUTHORITY_POLICY");
}

#[test]
fn authority_missing_monotonic_floor_fails_before_launch() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let marker = case.root.join("authority-missing-floor.marker");
    let profile = format!("{:064x}", unix_time_ms());
    let mut command = authority_command_prefix(&case);
    command
        .args(["--authority-profile-digest", &profile])
        .args(["--authority-policy-digest", &"2".repeat(64)])
        .args(["--authority-policy-epoch", "1"])
        .args(["--allowed-system-dll", "kernel32.dll"])
        .arg("--")
        .arg("hold-marker")
        .arg(&marker);
    assert_generic_error(&run(command, b""), "BROKER_AUTHORITY_POLICY");
    assert!(!marker.exists());
}

#[test]
fn success_preserves_exact_stdin_and_stdout() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let mut command = case.command(2_000, 1_048_576, 65_536);
    command.arg("echo");
    let input = b"\0binary request\r\nwith exact bytes\xff";
    let output = run(command, input);
    assert!(output.status.success(), "{:?}", output.stderr);
    assert_eq!(output.stdout, input);
    assert!(output.stderr.is_empty());
}

#[test]
fn rejects_not_yet_active_and_expired_policy_windows_before_launch() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let now = unix_time_ms();
    for (not_before, expires_at) in [
        (now.saturating_add(60_000), now.saturating_add(120_000)),
        (now.saturating_sub(120_000), now.saturating_sub(60_000)),
    ] {
        let mut command = Command::new(launcher());
        command
            .arg("--target")
            .arg(&case.target)
            .arg("--sha256")
            .arg(sha256_arg(&case.target))
            .arg("--not-before-unix-ms")
            .arg(not_before.to_string())
            .arg("--expires-at-unix-ms")
            .arg(expires_at.to_string())
            .args([
                "--timeout-ms",
                "2000",
                "--request-limit",
                "1024",
                "--stdout-limit",
                "1024",
                "--stderr-limit",
                "1024",
                "--",
                "echo",
            ]);
        assert_generic_error(&run(command, b""), "BROKER_POLICY_WINDOW");
    }
}

#[test]
fn expiry_while_waiting_for_stdin_rejects_before_target_launch() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let marker = case.root.join("expired-before-stage.marker");
    let now = unix_time_ms();
    let mut command = Command::new(launcher());
    command
        .arg("--target")
        .arg(&case.target)
        .arg("--sha256")
        .arg(sha256_arg(&case.target))
        .arg("--not-before-unix-ms")
        .arg(now.saturating_sub(60_000).to_string())
        .arg("--expires-at-unix-ms")
        .arg(now.saturating_add(1_000).to_string())
        .args([
            "--timeout-ms",
            "2000",
            "--request-limit",
            "1024",
            "--stdout-limit",
            "1024",
            "--stderr-limit",
            "1024",
            "--",
            "hold-marker",
        ])
        .arg(&marker)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().unwrap();
    thread::sleep(Duration::from_millis(1_200));
    drop(child.stdin.take());
    let output = child.wait_with_output().unwrap();
    assert_generic_error(&output, "BROKER_POLICY_WINDOW");
    assert!(!marker.exists());
}

#[test]
fn wrong_digest_fails_before_launch() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let mut command = Command::new(launcher());
    command
        .arg("--target")
        .arg(&case.target)
        .arg("--sha256")
        .arg(format!("0x{}", "00".repeat(32)));
    add_active_policy_window(&mut command);
    command.args([
        "--timeout-ms",
        "2000",
        "--request-limit",
        "1024",
        "--stdout-limit",
        "1024",
        "--stderr-limit",
        "1024",
        "--",
        "echo",
    ]);
    assert_generic_error(&run(command, b""), "BROKER_INTEGRITY");
}

#[test]
fn source_replacement_is_denied_while_child_runs() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let marker = case.root.join("started.marker");
    let replacement = case.root.join("replacement.exe");
    let mut replacement_bytes = fs::read(&case.target).unwrap();
    let index = replacement_bytes.len() / 2;
    replacement_bytes[index] ^= 1;
    fs::write(&replacement, replacement_bytes).unwrap();

    let mut command = case.command(2_000, 1024, 1024);
    command.arg("hold-marker").arg(&marker);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let child = command.spawn().unwrap();
    wait_for(&marker, Duration::from_secs(1));
    let replacement_wide = wide_nul(&replacement);
    let target_wide = wide_nul(&case.target);
    // SAFETY: both path buffers are NUL-terminated and remain alive for the call.
    assert_eq!(
        unsafe {
            MoveFileExW(
                replacement_wide.as_ptr(),
                target_wide.as_ptr(),
                MOVEFILE_REPLACE_EXISTING,
            )
        },
        0
    );
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success(), "{:?}", output.stderr);
}

#[test]
fn final_reparse_point_is_rejected_when_symlinks_are_available() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let link = case.root.join("fixture-link.exe");
    if std::os::windows::fs::symlink_file(&case.target, &link).is_err() {
        return;
    }
    let mut command = Command::new(launcher());
    command
        .arg("--target")
        .arg(link)
        .arg("--sha256")
        .arg(sha256_arg(&case.target));
    add_active_policy_window(&mut command);
    command.args([
        "--timeout-ms",
        "2000",
        "--request-limit",
        "1024",
        "--stdout-limit",
        "1024",
        "--stderr-limit",
        "1024",
        "--",
        "echo",
    ]);
    assert_generic_error(&run(command, b""), "BROKER_TARGET");
}

#[test]
fn timeout_kills_descendants() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let marker = case.root.join("timeout-descendant.marker");
    let mut command = case.command(150, 1024, 1024);
    command.arg("timeout-descendant").arg(&marker);
    assert_generic_error(&run(command, b""), "BROKER_TIMEOUT");
    thread::sleep(Duration::from_millis(1_000));
    assert!(!marker.exists());
}

#[test]
fn stdout_overflow_fails_without_partial_output() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let mut command = case.command(2_000, 1024, 1024);
    command.args(["stdout", "1025"]);
    assert_generic_error(&run(command, b""), "BROKER_STDOUT_LIMIT");
}

#[test]
fn stderr_overflow_is_not_reflected() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let mut command = case.command(2_000, 1024, 1024);
    command.args(["stderr", "2048"]);
    assert_generic_error(&run(command, b""), "BROKER_STDERR_LIMIT");
}

#[test]
fn child_nonzero_is_generic_and_stderr_is_not_reflected() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let mut command = case.command(2_000, 1024, 1024);
    command.arg("nonzero");
    assert_generic_error(&run(command, b""), "BROKER_CHILD");
}

#[test]
fn windows_argv_round_trips_spaces_quotes_and_backslashes() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let expected = [
        "",
        "plain",
        "two words",
        "quote\"inside",
        r"folder\path with space\tail\",
        r#"slashes\\\"quote"#,
    ];
    let mut command = case.command(2_000, 4096, 1024);
    command.arg("argv").args(expected);
    let output = run(command, b"");
    assert!(output.status.success(), "{:?}", output.stderr);
    assert_eq!(decode_argv(&output.stdout), expected);
}

#[test]
fn broker_stdin_sentinel_control_is_visible_to_direct_child() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let sentinel_path = case.root.join("direct-child-stdin-sentinel");
    fs::write(&sentinel_path, []).unwrap();
    let sentinel_file = File::open(&sentinel_path).unwrap();
    let sentinel_path = fs::canonicalize(sentinel_path).unwrap();

    let output = Command::new(fixture())
        .arg("file-handle-absent")
        .arg(sentinel_path)
        .stdin(Stdio::from(sentinel_file))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(31));
    assert!(output.stdout.is_empty());
    assert!(output.stderr.is_empty());
}

#[test]
fn explicit_handle_allowlist_excludes_broker_stdin_sentinel() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let sentinel_path = case.root.join("broker-stdin-sentinel");
    fs::write(&sentinel_path, []).unwrap();
    let sentinel_file = File::open(&sentinel_path).unwrap();
    let sentinel_path = fs::canonicalize(sentinel_path).unwrap();

    let mut command = case.command(2_000, 1024, 1024);
    command
        .arg("file-handle-absent")
        .arg(sentinel_path)
        .stdin(Stdio::from(sentinel_file));
    let output = command.output().unwrap();
    assert!(output.status.success(), "{:?}", output.stderr);
    assert_eq!(output.stdout, b"absent");
    assert!(output.stderr.is_empty());
}

#[test]
fn root_exit_with_live_descendant_is_failure_and_tree_is_killed() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let marker = case.root.join("early-exit-descendant.marker");
    let mut command = case.command(2_000, 1024, 1024);
    command.arg("root-exit-descendant").arg(&marker);
    assert_generic_error(&run(command, b""), "BROKER_CONTAINMENT");
    thread::sleep(Duration::from_millis(1_000));
    assert!(!marker.exists());
}

#[test]
fn staging_is_removed_after_success_and_failure() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let mut success = case.command(2_000, 1024, 1024);
    success.arg("cwd");
    let output = run(success, b"");
    assert!(output.status.success());
    let success_stage = PathBuf::from(String::from_utf8(output.stdout).unwrap());
    assert!(!success_stage.exists());

    let marker = case.root.join("failed-stage-path.txt");
    let mut failure = case.command(2_000, 8, 1024);
    failure.arg("record-cwd-stdout").arg(&marker).arg("9");
    assert!(!run(failure, b"").status.success());
    let failure_stage = PathBuf::from(fs::read_to_string(marker).unwrap());
    assert!(!failure_stage.exists());
}

#[test]
fn request_overflow_is_rejected_before_launch() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let mut command = Command::new(launcher());
    command
        .arg("--target")
        .arg(&case.target)
        .arg("--sha256")
        .arg(sha256_arg(&case.target));
    add_active_policy_window(&mut command);
    command.args([
        "--timeout-ms",
        "2000",
        "--request-limit",
        "4",
        "--stdout-limit",
        "1024",
        "--stderr-limit",
        "1024",
        "--",
        "echo",
    ]);
    assert_generic_error(&run(command, b"12345"), "BROKER_INPUT_LIMIT");
}

#[test]
fn rejects_relative_unc_device_ads_and_unbounded_arguments() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    for target in [
        r"relative.exe".to_owned(),
        r"\\server\share\target.exe".to_owned(),
        format!(r"\\?\{}:\target.exe", "C"),
        format!(r"\\.\{}:\target.exe", "C"),
        format!(r"{}:\target.exe:stream", "C"),
    ] {
        let mut command = Command::new(launcher());
        command
            .args(["--target", &target, "--sha256"])
            .arg(format!("0x{}", "00".repeat(32)));
        add_active_policy_window(&mut command);
        command.args([
            "--timeout-ms",
            "2000",
            "--request-limit",
            "1024",
            "--stdout-limit",
            "1024",
            "--stderr-limit",
            "1024",
            "--",
            "echo",
        ]);
        assert_generic_error(&run(command, b""), "BROKER_TARGET");
    }

    let case = Case::new();
    let mut command = case.command(2_000, 1024, 1024);
    for _ in 0..200 {
        command.arg("x");
    }
    assert_generic_error(&run(command, b""), "BROKER_USAGE");
}

#[test]
fn rejects_directories_and_unsupported_target_extensions() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();
    let unsupported = case.root.join("fixture.bin");
    for target in [&case.root, &unsupported] {
        if target.extension().is_some() {
            fs::copy(&case.target, target).unwrap();
        }
        let mut command = Command::new(launcher());
        command
            .arg("--target")
            .arg(target)
            .arg("--sha256")
            .arg(sha256_arg(&case.target));
        add_active_policy_window(&mut command);
        command.args([
            "--timeout-ms",
            "2000",
            "--request-limit",
            "1024",
            "--stdout-limit",
            "1024",
            "--stderr-limit",
            "1024",
            "--",
            "echo",
        ]);
        assert_generic_error(&run(command, b""), "BROKER_TARGET");
    }
}

#[test]
fn protocol_limits_match_the_typescript_adapter() {
    let _serial = SERIAL.lock().unwrap_or_else(|error| error.into_inner());
    let case = Case::new();

    let mut maxima = Command::new(launcher());
    maxima
        .arg("--target")
        .arg(&case.target)
        .arg("--sha256")
        .arg(sha256_arg(&case.target));
    add_active_policy_window(&mut maxima);
    maxima.args([
        "--timeout-ms",
        "300000",
        "--request-limit",
        "33554432",
        "--stdout-limit",
        "16777216",
        "--stderr-limit",
        "65536",
        "--",
        "echo",
    ]);
    let output = run(maxima, b"");
    assert!(output.status.success(), "{:?}", output.stderr);

    let mut excess_stderr = Command::new(launcher());
    excess_stderr
        .arg("--target")
        .arg(&case.target)
        .arg("--sha256")
        .arg(sha256_arg(&case.target));
    add_active_policy_window(&mut excess_stderr);
    excess_stderr.args([
        "--timeout-ms",
        "2000",
        "--request-limit",
        "1024",
        "--stdout-limit",
        "1024",
        "--stderr-limit",
        "65537",
        "--",
        "echo",
    ]);
    assert_generic_error(&run(excess_stderr, b""), "BROKER_USAGE");

    let mut excess_count = case.command(2_000, 1024, 1024);
    excess_count.arg("echo");
    for _ in 0..64 {
        excess_count.arg("x");
    }
    assert_generic_error(&run(excess_count, b""), "BROKER_USAGE");

    let mut excess_bytes = case.command(2_000, 1024, 1024);
    excess_bytes.arg("echo").arg("x".repeat(8193));
    assert_generic_error(&run(excess_bytes, b""), "BROKER_USAGE");
}

#[test]
fn readme_states_the_immutable_v2_and_activation_boundaries() {
    let readme =
        fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("README.md")).unwrap();
    assert!(readme.contains("trusted relayer installation boundary"));
    assert!(readme.contains("AuthorityRecordV2"));
    assert!(readme.contains("does not make launcher installation a"));
    assert!(readme.contains("universal atomic execution primitive"));
    assert!(readme.contains("elevated disposable-host campaign"));
    assert!(readme.contains("does not close Gate 5"));
}

#[test]
fn v1_compatibility_installer_preserves_record_before_replacement_ordering() {
    let script =
        fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("scripts/install.ps1"))
            .unwrap();
    let broker_source =
        fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("src/win32.rs")).unwrap();
    let v1_start = script.find("if (-not $UseV1CompatibilityProfile)").unwrap();
    let v1 = &script[v1_start..];
    let installer_mutex = v1.find("[Threading.Mutex]::new").unwrap();
    let source_digest = v1.find("$observedBrokerSha256").unwrap();
    let authority_record = v1
        .find("# Bind profile, exact reviewed policy, and rollback floor")
        .unwrap();
    let record_write =
        v1[authority_record..].find("'AuthorityRecordV1'").unwrap() + authority_record;
    let record_flush = v1[record_write..].find("$profileKey.Flush()").unwrap() + record_write;
    let legacy_delete = v1
        .find("$profileKey.DeleteValue('MinimumPolicyEpoch'")
        .unwrap();
    let legacy_flush = v1[legacy_delete..].find("$profileKey.Flush()").unwrap() + legacy_delete;
    let copy = v1.find("[IO.File]::Copy").unwrap();
    let copied_digest = v1.find("$copiedBrokerSha256").unwrap();
    let replace = v1.find("Move-Item -LiteralPath $temporary").unwrap();
    let abandoned = v1
        .find("catch [Threading.AbandonedMutexException]")
        .unwrap();
    let abandoned_release = v1[abandoned..].find("$mutex.ReleaseMutex()").unwrap() + abandoned;
    let abandoned_reject = v1[abandoned_release..]
        .find("authoritative broker update mutex was abandoned")
        .unwrap()
        + abandoned_release;

    assert!(installer_mutex < source_digest);
    assert!(source_digest < authority_record);
    assert!(legacy_delete < authority_record);
    assert!(legacy_delete < legacy_flush);
    assert!(legacy_flush < authority_record);
    assert!(authority_record < record_write);
    assert!(record_write < record_flush);
    assert!(record_flush < copy);
    assert!(copy < copied_digest);
    assert!(copied_digest < replace);
    assert!(abandoned < abandoned_release);
    assert!(abandoned_release < abandoned_reject);
    assert_eq!(v1.matches("$mutex.ReleaseMutex()").count(), 2);
    assert_eq!(v1.matches("$profileKey.SetValue(").count(), 1);
    assert!(v1.contains("Refusing a policy digest change without an epoch increase."));
    assert!(v1.contains("$MigrateLegacyEpochOnlyRecord"));
    assert!(v1.contains("'Global\\E2SBridge-NativeExecution-v1-Installer'"));
    assert!(v1.contains("catch [Threading.AbandonedMutexException]"));
    assert!(broker_source.contains(r#""Global\\E2SBridge-NativeExecution-v1-Installer""#));
    assert!(broker_source.contains(r#""AuthorityRecordV1""#));
    assert!(broker_source.contains("value_type != REG_BINARY"));
}

#[test]
fn v2_installer_publishes_a_verified_image_before_the_authority_record() {
    let script =
        fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("scripts/install.ps1"))
            .unwrap();
    let broker_source =
        fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("src/win32.rs")).unwrap();
    let main_source =
        fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("src/main.rs")).unwrap();
    let v2_start = script.find("function Install-ImmutableV2Profile").unwrap();
    let v2_end = script.find("if (-not $UseV1CompatibilityProfile)").unwrap();
    let v2 = &script[v2_start..v2_end];

    let source_digest = v2.find("$observedV2BrokerSha256").unwrap();
    let staging = v2.find("'.stage-{0}'").unwrap();
    let copy = v2.find(".CopyTo($stagedBroker, $false)").unwrap();
    let copied_digest = v2.find("$copiedHash").unwrap();
    let file_flush = v2.find("$flushStream.Flush($true)").unwrap();
    let publish = v2
        .find("[IO.Directory]::Move($stagingDirectory, $imageDirectory)")
        .unwrap();
    let final_verification = v2.find("$imageIdentity = Assert-ImmutableV2Image").unwrap();
    let record = v2.find("[byte[]] $authorityRecord").unwrap();
    let registry_security = v2.find("$key.SetAccessControl($registrySecurity)").unwrap();
    let record_write = v2
        .find("$profileKey.SetValue(\n                    'AuthorityRecordV2'")
        .unwrap();
    let record_flush = v2[record_write..].find("$profileKey.Flush()").unwrap() + record_write;

    assert!(source_digest < staging);
    assert!(staging < copy);
    assert!(copy < copied_digest);
    assert!(copied_digest < file_flush);
    assert!(file_flush < publish);
    assert!(publish < final_verification);
    assert!(final_verification < record);
    assert!(record < registry_security);
    assert!(registry_security < record_write);
    assert!(record_write < record_flush);
    assert_eq!(v2.matches("$profileKey.SetValue(").count(), 1);
    assert!(script.contains("[Environment]::GetFolderPath("));
    assert!(!v2.contains("$env:ProgramFiles"));
    assert!(script
        .contains("$security.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-18'))"));
    assert!(script.contains("$security.SetAccessRuleProtection($true, $false)"));
    assert!(script.contains("[Security.AccessControl.RegistryRights]::ReadKey"));
    assert!(script.contains("$standard.NumberOfLinks -ne 1"));
    assert!(script.contains("$standard.DeletePending -ne 0"));
    assert!(v2.contains("if ($authorityRecord.Length -ne 144)"));
    assert!(v2.contains("'Global\\E2SBridge-NativeExecution-v2-Installer'"));
    assert!(script.contains("[Environment]::Is64BitProcess"));
    assert!(v2.contains("$mutex.ReleaseMutex()"));
    assert!(broker_source.contains(r#""Global\\E2SBridge-NativeExecution-v2-Installer""#));
    assert!(broker_source.contains(r#""AuthorityRecordV2""#));
    assert!(broker_source.contains("program_files_x64_path()"));
    assert!(broker_source.contains(
        "validate_immutable_installation_path(&final_path, &program_files, &source.digest)"
    ));
    assert!(broker_source.contains("CoTaskMemFree(self.0.cast())"));
    assert!(main_source.contains("writer.write_all(output).and_then(|_| writer.flush())"));
    assert!(main_source.contains(r#""--authority-record-version""#));
    assert!(main_source.contains("open_current_executable_image"));
}

#[test]
fn v2_inspection_reuses_exact_installer_checks_without_direct_persistent_mutation_calls() {
    let script =
        fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("scripts/install.ps1"))
            .unwrap();
    let inspection_start = script.find("function Inspect-ImmutableV2Profile").unwrap();
    let inspection_end = script[inspection_start..]
        .find("function Install-ImmutableV2Profile")
        .unwrap()
        + inspection_start;
    let inspection = &script[inspection_start..inspection_end];
    let dispatch = script.find("if ($InspectOnly)").unwrap();
    let install_dispatch = script.find("if (-not $UseV1CompatibilityProfile)").unwrap();

    assert!(script.contains("[switch] $InspectOnly"));
    assert!(script.contains("[switch] $AsJson"));
    assert!(dispatch < install_dispatch);
    assert!(inspection.contains("Assert-ImmutableV2Image"));
    assert!(inspection.contains("Assert-ImmutableRegistrySecurity"));
    assert!(inspection.contains("OpenSubKey"));
    assert!(inspection.contains("InstalledBrokerImageBoundToAuthorityRecordV2 = $true"));
    assert!(inspection.contains("LauncherInstallationActivationCampaignCompleted = $false"));
    assert!(inspection.contains("BrokerExecutionObserved = $false"));
    assert!(inspection.contains("TargetExecutionObserved = $false"));
    assert!(inspection.contains("ProofAuthorityGranted = $false"));
    assert!(inspection.contains("FundsAuthorityGranted = $false"));
    assert!(inspection.contains("Gate5Closed = $false"));
    assert!(!inspection.contains("CreateDirectory"));
    assert!(!inspection.contains("CreateSubKey"));
    assert!(!inspection.contains("SetAccessControl"));
    assert!(!inspection.contains("SetValue"));
    assert!(!inspection.contains("Remove-Item"));
    assert!(!inspection.contains("Move("));
    assert!(!inspection.contains("CopyTo"));
}

fn add_active_policy_window(command: &mut Command) {
    let now = unix_time_ms();
    command
        .arg("--not-before-unix-ms")
        .arg(now.saturating_sub(60_000).to_string())
        .arg("--expires-at-unix-ms")
        .arg(now.saturating_add(10 * 60_000).to_string());
}

fn authority_command_prefix(case: &Case) -> Command {
    let mut command = Command::new(launcher());
    command
        .arg("--target")
        .arg(&case.target)
        .arg("--sha256")
        .arg(sha256_arg(&case.target));
    add_active_policy_window(&mut command);
    command.args([
        "--timeout-ms",
        "2000",
        "--request-limit",
        "1024",
        "--stdout-limit",
        "1024",
        "--stderr-limit",
        "1024",
    ]);
    command
}

fn unix_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis()
        .try_into()
        .unwrap()
}

fn wait_for(path: &Path, timeout: Duration) {
    let start = Instant::now();
    while !path.exists() {
        assert!(start.elapsed() < timeout, "fixture did not start");
        thread::sleep(Duration::from_millis(10));
    }
}

fn wide_nul(path: &Path) -> Vec<u16> {
    let mut units: Vec<u16> = path.as_os_str().encode_wide().collect();
    units.push(0);
    units
}

fn decode_argv(bytes: &[u8]) -> Vec<String> {
    let mut cursor = 0;
    let mut result = Vec::new();
    while cursor < bytes.len() {
        let len = u32::from_le_bytes(bytes[cursor..cursor + 4].try_into().unwrap()) as usize;
        cursor += 4;
        let mut units = Vec::with_capacity(len);
        for _ in 0..len {
            units.push(u16::from_le_bytes(
                bytes[cursor..cursor + 2].try_into().unwrap(),
            ));
            cursor += 2;
        }
        result.push(String::from_utf16(&units).unwrap());
    }
    result
}

fn sha256_arg(path: &Path) -> String {
    let bytes = fs::read(path).unwrap();
    let digest = cng_sha256(&bytes);
    let mut encoded = String::with_capacity(66);
    encoded.push_str("0x");
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for byte in digest {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    encoded
}

fn cng_sha256(bytes: &[u8]) -> [u8; 32] {
    // SAFETY: Every CNG handle is checked before use, buffers remain alive for each call,
    // and the cleanup calls consume only handles returned by CNG.
    unsafe {
        let mut algorithm = std::ptr::null_mut();
        assert_eq!(
            BCryptOpenAlgorithmProvider(
                &mut algorithm,
                BCRYPT_SHA256_ALGORITHM.as_ptr(),
                std::ptr::null(),
                0
            ),
            0
        );
        let mut object_len = 0u32;
        let mut written = 0u32;
        assert_eq!(
            BCryptGetProperty(
                algorithm,
                BCRYPT_OBJECT_LENGTH.as_ptr(),
                (&mut object_len as *mut u32).cast(),
                4,
                &mut written,
                0
            ),
            0
        );
        assert_eq!(written, 4);
        let mut object = vec![0u8; object_len as usize];
        let mut hash = std::ptr::null_mut();
        assert_eq!(
            BCryptCreateHash(
                algorithm,
                &mut hash,
                object.as_mut_ptr(),
                object_len,
                std::ptr::null(),
                0,
                0
            ),
            0
        );
        for chunk in bytes.chunks(u32::MAX as usize) {
            assert_eq!(
                BCryptHashData(hash, chunk.as_ptr(), chunk.len() as u32, 0),
                0
            );
        }
        let mut digest = [0u8; 32];
        assert_eq!(
            BCryptFinishHash(hash, digest.as_mut_ptr(), digest.len() as u32, 0),
            0
        );
        assert_eq!(BCryptDestroyHash(hash), 0);
        assert_eq!(BCryptCloseAlgorithmProvider(algorithm, 0), 0);
        digest
    }
}
