#![cfg(windows)]

use std::env;
use std::ffi::{OsStr, OsString};
use std::fs;
use std::io::{Read, Write};
use std::os::windows::ffi::OsStringExt;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

type Handle = *mut std::ffi::c_void;

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetCurrentProcess() -> Handle;
    fn GetProcessHandleCount(process: Handle, count: *mut u32) -> i32;
    fn GetHandleInformation(object: Handle, flags: *mut u32) -> i32;
    fn GetFinalPathNameByHandleW(file: Handle, path: *mut u16, path_len: u32, flags: u32) -> u32;
}

fn main() {
    let mut args = env::args_os();
    let _program = args.next();
    let mode = args.next().unwrap_or_default();
    let mode = mode.to_string_lossy();

    match mode.as_ref() {
        "echo" => {
            let mut bytes = Vec::new();
            std::io::stdin().read_to_end(&mut bytes).unwrap();
            std::io::stdout().write_all(&bytes).unwrap();
        }
        "argv" => {
            use std::os::windows::ffi::OsStrExt;
            let mut stdout = std::io::stdout().lock();
            for arg in args {
                let units: Vec<u16> = arg.as_os_str().encode_wide().collect();
                stdout
                    .write_all(&(units.len() as u32).to_le_bytes())
                    .unwrap();
                for unit in units {
                    stdout.write_all(&unit.to_le_bytes()).unwrap();
                }
            }
        }
        "stdout" => {
            let count: usize = args.next().unwrap().to_string_lossy().parse().unwrap();
            std::io::stdout().write_all(&vec![b'O'; count]).unwrap();
        }
        "stderr" => {
            let count: usize = args.next().unwrap().to_string_lossy().parse().unwrap();
            std::io::stderr()
                .write_all(b"CHILD_PRIVATE_STDERR:")
                .unwrap();
            std::io::stderr().write_all(&vec![b'E'; count]).unwrap();
        }
        "nonzero" => {
            std::io::stderr()
                .write_all(b"CHILD_NONZERO_PRIVATE")
                .unwrap();
            std::process::exit(23);
        }
        "file-handle-absent" => {
            let expected_path = args.next().unwrap();
            match process_has_file(&expected_path) {
                Ok(true) => std::process::exit(31),
                Err(()) => std::process::exit(32),
                Ok(false) => {}
            }
            std::io::stdout().write_all(b"absent").unwrap();
        }
        "cwd" => {
            let cwd = env::current_dir().unwrap();
            std::io::stdout()
                .write_all(cwd.to_string_lossy().as_bytes())
                .unwrap();
        }
        "record-cwd-stdout" => {
            let marker = args.next().unwrap();
            let count: usize = args.next().unwrap().to_string_lossy().parse().unwrap();
            fs::write(
                marker,
                env::current_dir().unwrap().to_string_lossy().as_bytes(),
            )
            .unwrap();
            std::io::stdout().write_all(&vec![b'O'; count]).unwrap();
        }
        "hold-marker" => {
            let marker = args.next().unwrap();
            fs::write(marker, b"started").unwrap();
            thread::sleep(Duration::from_millis(500));
            std::io::stdout().write_all(b"held").unwrap();
        }
        "timeout-descendant" => {
            let marker = args.next().unwrap();
            spawn_descendant(marker, 800);
            thread::sleep(Duration::from_secs(5));
        }
        "root-exit-descendant" => {
            let marker = args.next().unwrap();
            spawn_descendant(marker, 800);
        }
        "descendant" => {
            let marker = args.next().unwrap();
            let delay: u64 = args.next().unwrap().to_string_lossy().parse().unwrap();
            thread::sleep(Duration::from_millis(delay));
            fs::write(marker, b"survived").unwrap();
        }
        _ => std::process::exit(64),
    }
}

fn process_has_file(expected_path: &OsStr) -> Result<bool, ()> {
    let expected_path = normalize_path(expected_path);
    let mut handle_count = 0_u32;
    // SAFETY: GetCurrentProcess returns a process-local pseudo-handle and count is writable.
    if unsafe { GetProcessHandleCount(GetCurrentProcess(), &mut handle_count) } == 0 {
        return Err(());
    }

    let mut observed = 0_u32;
    let mut value = 4_usize;
    while observed < handle_count {
        if value > 0x00ff_fffc {
            return Err(());
        }
        let mut flags = 0_u32;
        // SAFETY: this only probes a numeric handle value in the current process.
        if unsafe { GetHandleInformation(value as Handle, &mut flags) } != 0 {
            observed += 1;
            if final_path(value as Handle)
                .is_some_and(|path| normalize_path(&path) == expected_path)
            {
                return Ok(true);
            }
        }
        value += 4;
    }
    Ok(false)
}

fn final_path(handle: Handle) -> Option<OsString> {
    let mut buffer = vec![0_u16; 32_768];
    // SAFETY: buffer is writable for its declared length; an invalid or non-file handle fails.
    let length =
        unsafe { GetFinalPathNameByHandleW(handle, buffer.as_mut_ptr(), buffer.len() as u32, 0) }
            as usize;
    if length == 0 || length >= buffer.len() {
        return None;
    }
    Some(OsString::from_wide(&buffer[..length]))
}

fn normalize_path(path: &OsStr) -> String {
    let path = path.to_string_lossy().replace('/', "\\");
    let path = path.strip_prefix(r"\\?\").unwrap_or(&path);
    path.to_lowercase()
}

fn spawn_descendant(marker: std::ffi::OsString, delay_ms: u64) {
    let child = Command::new(env::current_exe().unwrap())
        .arg("descendant")
        .arg(marker)
        .arg(delay_ms.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    drop(child);
}
