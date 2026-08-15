#![cfg(windows)]

#[allow(dead_code)]
#[path = "../src/win32.rs"]
mod win32;

use std::ffi::{OsStr, OsString};
use std::fs;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const MOVEFILE_REPLACE_EXISTING: u32 = 1;

#[link(name = "kernel32")]
unsafe extern "system" {
    fn MoveFileExW(existing: *const u16, replacement: *const u16, flags: u32) -> i32;
}

struct Case {
    root: PathBuf,
    temp: PathBuf,
}

impl Case {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::current_exe()
            .unwrap()
            .parent()
            .unwrap()
            .join(format!("namespace-test-{}-{nonce}", std::process::id()));
        let temp = root.join("retained-parent").join("controlled-temp");
        fs::create_dir_all(&temp).unwrap();
        Self { root, temp }
    }
}

impl Drop for Case {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn canonical_stage_paths_acls_and_retained_chain_are_bound() {
    let case = Case::new();
    let source_path = std::env::current_exe().unwrap();
    let source = match win32::open_verified_source(&source_path, 512 * 1024 * 1024) {
        Ok(source) => source,
        Err(_) => panic!("test executable should be a valid source"),
    };
    let mut stage = match win32::stage_verified_copy_in_root(&source, &case.temp) {
        Ok(stage) => stage,
        Err(_) => panic!("controlled stage creation should succeed"),
    };

    assert!(is_volume_guid_path(&stage.directory_path));
    assert!(is_volume_guid_path(&stage.file_path));
    assert_eq!(
        stage.file_path.parent(),
        Some(stage.directory_path.as_path())
    );
    assert!(win32::test_stage_has_restricted_acls(&stage));

    let moved_file = stage.directory_path.join("moved-target.exe");
    assert!(!move_path(&stage.file_path, &moved_file, true));
    let moved_stage = stage.directory_path.with_extension("moved");
    assert!(!move_path(&stage.directory_path, &moved_stage, false));
    let moved_temp = case.temp.with_extension("moved");
    assert!(!move_path(&case.temp, &moved_temp, false));
    let retained_parent = case.temp.parent().unwrap();
    let moved_parent = retained_parent.with_extension("moved");
    assert!(!move_path(retained_parent, &moved_parent, false));

    stage.cleanup().unwrap();
    drop(stage);
    drop(source);

    assert!(move_path(&case.temp, &moved_temp, false));
    assert!(move_path(&moved_temp, &case.temp, true));
    assert!(move_path(retained_parent, &moved_parent, false));
    assert!(move_path(&moved_parent, retained_parent, true));
}

#[test]
fn rejected_loader_module_is_terminated_before_fixture_code_runs() {
    let case = Case::new();
    let source = win32::open_verified_source(Path::new(fixture()), 512 * 1024 * 1024).unwrap();
    let mut stage = win32::stage_verified_copy(&source).unwrap();
    let marker = case.root.join("rejected-loader.marker");
    let command = fixture_command(&stage.file_path, "hold-marker", &marker);
    let environment = minimal_environment(&stage.directory_path);
    let mut process = win32::create_contained_process(&stage, &command, &environment, true)
        .unwrap_or_else(|error| panic!("authority-mode fixture creation failed: {error:?}"));
    let policy = win32::ModulePolicy::new(&["not-loaded.dll".to_owned()]).unwrap();
    process.resume().unwrap();

    let started = Instant::now();
    loop {
        match process.drain_debug_events(&policy) {
            Err(win32::DebugError::Policy) => break,
            Err(win32::DebugError::Inspection) => panic!("debug inspection failed"),
            Ok(()) if started.elapsed() < Duration::from_secs(2) => {
                thread::sleep(Duration::from_millis(5));
            }
            Ok(()) => panic!("no rejected loader event was observed"),
        }
    }
    process.terminate_and_verify().unwrap();
    thread::sleep(Duration::from_millis(600));
    assert!(!marker.exists());

    drop(process);
    stage.cleanup().unwrap();
}

#[test]
fn authority_job_active_process_limit_blocks_descendant_before_it_runs() {
    let case = Case::new();
    let source = win32::open_verified_source(Path::new(fixture()), 512 * 1024 * 1024).unwrap();
    let mut stage = win32::stage_verified_copy(&source).unwrap();
    let marker = case.root.join("blocked-descendant.marker");
    let command = fixture_command(&stage.file_path, "timeout-descendant", &marker);
    let environment = minimal_environment(&stage.directory_path);
    let mut process =
        win32::create_process_with_active_limit_for_testing(&stage, &command, &environment)
            .unwrap_or_else(|error| panic!("active-limit fixture creation failed: {error:?}"));
    process.resume().unwrap();

    let started = Instant::now();
    while matches!(process.root_wait_status(), Ok(win32::WaitStatus::Running)) {
        assert!(started.elapsed() < Duration::from_secs(2));
        thread::sleep(Duration::from_millis(5));
    }
    thread::sleep(Duration::from_millis(900));
    assert_ne!(process.exit_code().unwrap(), 0);
    assert_eq!(process.active_processes().unwrap(), 0);
    assert!(!marker.exists());
    process.terminate_and_verify().unwrap();

    drop(process);
    stage.cleanup().unwrap();
}

fn fixture() -> &'static str {
    env!("CARGO_BIN_EXE_launcher-fixture")
}

fn fixture_command(executable: &Path, mode: &str, marker: &Path) -> Vec<u16> {
    let command = format!(
        "\"{}\" {} \"{}\"",
        executable.display(),
        mode,
        marker.display()
    );
    wide_nul(OsStr::new(&command))
}

fn minimal_environment(temp: &Path) -> Vec<u16> {
    let system_root = std::env::var_os("SystemRoot").unwrap();
    let mut entries = [
        ("SystemRoot", system_root),
        ("TEMP", temp.as_os_str().to_os_string()),
        ("TMP", temp.as_os_str().to_os_string()),
    ];
    entries.sort_by_key(|entry| entry.0.to_ascii_lowercase());
    let mut block = Vec::new();
    for (name, value) in entries {
        let mut entry = OsString::from(name);
        entry.push("=");
        entry.push(value);
        block.extend(entry.encode_wide());
        block.push(0);
    }
    block.push(0);
    block
}

fn is_volume_guid_path(path: &Path) -> bool {
    path.to_string_lossy()
        .to_ascii_lowercase()
        .starts_with(r"\\?\volume{")
}

fn move_path(existing: &Path, replacement: &Path, replace: bool) -> bool {
    let existing = wide_nul(existing.as_os_str());
    let replacement = wide_nul(replacement.as_os_str());
    // SAFETY: both buffers are NUL-terminated and remain alive for the call.
    unsafe {
        MoveFileExW(
            existing.as_ptr(),
            replacement.as_ptr(),
            if replace {
                MOVEFILE_REPLACE_EXISTING
            } else {
                0
            },
        ) != 0
    }
}

fn wide_nul(value: &OsStr) -> Vec<u16> {
    let mut units: Vec<u16> = value.encode_wide().collect();
    units.push(0);
    units
}
