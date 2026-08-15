use std::ffi::{c_void, OsStr, OsString};
use std::fs::File;
use std::mem::{size_of, zeroed};
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::os::windows::io::FromRawHandle;
use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};
use std::thread;
use std::time::{Duration, Instant};

type Bool = i32;
type Dword = u32;
type NtStatus = i32;
type RawHandle = *mut c_void;

const INVALID_HANDLE_VALUE: RawHandle = -1isize as RawHandle;
const GENERIC_READ: Dword = 0x8000_0000;
const GENERIC_WRITE: Dword = 0x4000_0000;
const GENERIC_ALL: Dword = 0x1000_0000;
const READ_CONTROL: Dword = 0x0002_0000;
const SYNCHRONIZE: Dword = 0x0010_0000;
const FILE_ADD_FILE: Dword = 0x2;
const FILE_ADD_SUBDIRECTORY: Dword = 0x4;
const FILE_TRAVERSE: Dword = 0x20;
const FILE_READ_ATTRIBUTES: Dword = 0x80;
const FILE_SHARE_READ: Dword = 0x1;
const FILE_SHARE_WRITE: Dword = 0x2;
const OPEN_EXISTING: Dword = 3;
const FILE_ATTRIBUTE_DIRECTORY: Dword = 0x10;
const FILE_ATTRIBUTE_NORMAL: Dword = 0x80;
const FILE_ATTRIBUTE_REPARSE_POINT: Dword = 0x400;
const FILE_FLAG_OPEN_REPARSE_POINT: Dword = 0x0020_0000;
const FILE_FLAG_BACKUP_SEMANTICS: Dword = 0x0200_0000;
const FILE_TYPE_DISK: Dword = 1;
const FILE_BEGIN: Dword = 0;
const INVALID_FILE_ATTRIBUTES: Dword = 0xffff_ffff;
const ERROR_FILE_NOT_FOUND: Dword = 2;
const ERROR_PATH_NOT_FOUND: Dword = 3;
const DRIVE_REMOTE: Dword = 4;
const DRIVE_UNKNOWN: Dword = 0;
const DRIVE_NO_ROOT_DIR: Dword = 1;
const HANDLE_FLAG_INHERIT: Dword = 1;
const STARTF_USESTDHANDLES: Dword = 0x100;
const CREATE_SUSPENDED: Dword = 0x4;
const CREATE_UNICODE_ENVIRONMENT: Dword = 0x400;
const EXTENDED_STARTUPINFO_PRESENT: Dword = 0x0008_0000;
const CREATE_NO_WINDOW: Dword = 0x0800_0000;
const DEBUG_ONLY_THIS_PROCESS: Dword = 0x2;
const PROC_THREAD_ATTRIBUTE_HANDLE_LIST: usize = 0x0002_0002;
const JOB_OBJECT_LIMIT_ACTIVE_PROCESS: Dword = 0x8;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: Dword = 0x2000;
const WAIT_OBJECT_0: Dword = 0;
const WAIT_ABANDONED: Dword = 0x80;
const WAIT_TIMEOUT: Dword = 258;
const ERROR_SEM_TIMEOUT: Dword = 121;
const EXCEPTION_DEBUG_EVENT: Dword = 1;
const CREATE_PROCESS_DEBUG_EVENT: Dword = 3;
const LOAD_DLL_DEBUG_EVENT: Dword = 6;
const RIP_EVENT: Dword = 9;
const EXCEPTION_BREAKPOINT: Dword = 0x8000_0003;
const DBG_CONTINUE: Dword = 0x0001_0002;
const DBG_EXCEPTION_NOT_HANDLED: Dword = 0x8001_0001;
const BCRYPT_USE_SYSTEM_PREFERRED_RNG: Dword = 2;
const FILE_STANDARD_INFO_CLASS: Dword = 1;
const FILE_ATTRIBUTE_TAG_INFO_CLASS: Dword = 9;
const FILE_ID_INFO_CLASS: Dword = 18;
const JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION_CLASS: Dword = 1;
const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: Dword = 9;
const VOLUME_NAME_GUID: Dword = 0x1;
const KEY_QUERY_VALUE: Dword = 0x1;
const KEY_WOW64_64KEY: Dword = 0x100;
const REG_BINARY: Dword = 3;
const AUTHORITY_RECORD_V1_LEN: usize = 80;
const AUTHORITY_RECORD_V2_LEN: usize = 144;
const AUTHORITY_UPDATE_MUTEX_NAME: &str = "Global\\E2SBridge-NativeExecution-v1-Installer";
const AUTHORITY_UPDATE_MUTEX_V2_NAME: &str = "Global\\E2SBridge-NativeExecution-v2-Installer";
const AUTHORITY_UPDATE_MUTEX_WAIT_MS: Dword = 30_000;
const FOLDERID_PROGRAM_FILES_X64: Guid = Guid {
    data1: 0x6d80_9377,
    data2: 0x6af0,
    data3: 0x444b,
    data4: [0x89, 0x57, 0xa3, 0x77, 0x3f, 0x02, 0x20, 0x0e],
};

const FILE_OPEN: Dword = 1;
const FILE_CREATE: Dword = 2;
const FILE_DIRECTORY_FILE: Dword = 0x1;
const FILE_SYNCHRONOUS_IO_NONALERT: Dword = 0x20;
const FILE_NON_DIRECTORY_FILE: Dword = 0x40;
const NT_FILE_OPEN_REPARSE_POINT: Dword = 0x0020_0000;
const OBJ_CASE_INSENSITIVE: Dword = 0x40;
const STATUS_OBJECT_NAME_COLLISION: NtStatus = 0xC000_0035_u32 as NtStatus;

const SDDL_REVISION_1: Dword = 1;
const SE_FILE_OBJECT: Dword = 1;
const DACL_SECURITY_INFORMATION: Dword = 0x4;
const SE_DACL_PROTECTED: u16 = 0x1000;
const ACCESS_ALLOWED_ACE_TYPE: u8 = 0;
const OBJECT_INHERIT_ACE: u8 = 0x1;
const CONTAINER_INHERIT_ACE: u8 = 0x2;
const INHERITED_ACE: u8 = 0x10;
const FILE_ALL_ACCESS: Dword = 0x001f_01ff;
const WIN_LOCAL_SYSTEM_SID: i32 = 22;
const WIN_BUILTIN_ADMINISTRATORS_SID: i32 = 26;
const WIN_CREATOR_OWNER_RIGHTS_SID: i32 = 71;

const SHA256_ALGORITHM: &[u16] = &[83, 72, 65, 50, 53, 54, 0];
const OBJECT_LENGTH: &[u16] = &[79, 98, 106, 101, 99, 116, 76, 101, 110, 103, 116, 104, 0];

const DIRECTORY_SDDL: &str = "D:P(A;OICI;GA;;;OW)(A;OICI;GA;;;SY)(A;OICI;GA;;;BA)";
const FILE_SDDL: &str = "D:P(A;;GA;;;OW)(A;;GA;;;SY)(A;;GA;;;BA)";

#[repr(C)]
struct Guid {
    data1: u32,
    data2: u16,
    data3: u16,
    data4: [u8; 8],
}

#[repr(C)]
struct SecurityAttributes {
    length: Dword,
    security_descriptor: *mut c_void,
    inherit_handle: Bool,
}

#[repr(C)]
struct UnicodeString {
    length: u16,
    maximum_length: u16,
    buffer: *mut u16,
}

#[repr(C)]
struct ObjectAttributes {
    length: Dword,
    root_directory: RawHandle,
    object_name: *mut UnicodeString,
    attributes: Dword,
    security_descriptor: *mut c_void,
    security_quality_of_service: *mut c_void,
}

#[repr(C)]
struct IoStatusBlock {
    status_or_pointer: usize,
    information: usize,
}

#[repr(C)]
struct Acl {
    revision: u8,
    reserved1: u8,
    size: u16,
    ace_count: u16,
    reserved2: u16,
}

#[repr(C)]
struct AceHeader {
    ace_type: u8,
    ace_flags: u8,
    ace_size: u16,
}

#[repr(C)]
struct AccessAllowedAce {
    header: AceHeader,
    mask: Dword,
    sid_start: Dword,
}

#[repr(C)]
#[derive(Clone, Copy, PartialEq, Eq)]
struct FileIdInfo {
    volume_serial_number: u64,
    file_id: [u8; 16],
}

#[repr(C)]
struct FileAttributeTagInfo {
    file_attributes: Dword,
    reparse_tag: Dword,
}

#[repr(C)]
struct FileStandardInfo {
    allocation_size: i64,
    end_of_file: i64,
    number_of_links: Dword,
    delete_pending: u8,
    directory: u8,
    padding: [u8; 2],
}

#[repr(C)]
#[derive(Default)]
struct IoCounters {
    read_operation_count: u64,
    write_operation_count: u64,
    other_operation_count: u64,
    read_transfer_count: u64,
    write_transfer_count: u64,
    other_transfer_count: u64,
}

#[repr(C)]
#[derive(Default)]
struct JobObjectBasicLimitInformation {
    per_process_user_time_limit: i64,
    per_job_user_time_limit: i64,
    limit_flags: Dword,
    minimum_working_set_size: usize,
    maximum_working_set_size: usize,
    active_process_limit: Dword,
    affinity: usize,
    priority_class: Dword,
    scheduling_class: Dword,
}

#[repr(C)]
#[derive(Default)]
struct JobObjectExtendedLimitInformation {
    basic_limit_information: JobObjectBasicLimitInformation,
    io_info: IoCounters,
    process_memory_limit: usize,
    job_memory_limit: usize,
    peak_process_memory_used: usize,
    peak_job_memory_used: usize,
}

#[repr(C)]
struct JobObjectBasicAccountingInformation {
    total_user_time: i64,
    total_kernel_time: i64,
    this_period_total_user_time: i64,
    this_period_total_kernel_time: i64,
    total_page_fault_count: Dword,
    total_processes: Dword,
    active_processes: Dword,
    total_terminated_processes: Dword,
}

#[repr(C)]
struct StartupInfoW {
    cb: Dword,
    reserved: *mut u16,
    desktop: *mut u16,
    title: *mut u16,
    x: Dword,
    y: Dword,
    x_size: Dword,
    y_size: Dword,
    x_count_chars: Dword,
    y_count_chars: Dword,
    fill_attribute: Dword,
    flags: Dword,
    show_window: u16,
    reserved2_len: u16,
    reserved2: *mut u8,
    stdin: RawHandle,
    stdout: RawHandle,
    stderr: RawHandle,
}

#[repr(C)]
struct StartupInfoExW {
    startup_info: StartupInfoW,
    attribute_list: *mut c_void,
}

#[repr(C)]
struct ProcessInformation {
    process: RawHandle,
    thread: RawHandle,
    process_id: Dword,
    thread_id: Dword,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct ExceptionRecordPrefix {
    code: Dword,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct ExceptionDebugInfoPrefix {
    record: ExceptionRecordPrefix,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct CreateProcessDebugInfoPrefix {
    file: RawHandle,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct LoadDllDebugInfoPrefix {
    file: RawHandle,
}

#[repr(C)]
union DebugInfo {
    exception: ExceptionDebugInfoPrefix,
    create_process: CreateProcessDebugInfoPrefix,
    load_dll: LoadDllDebugInfoPrefix,
    padding: [usize; 32],
}

#[repr(C)]
struct DebugEvent {
    code: Dword,
    process_id: Dword,
    thread_id: Dword,
    info: DebugInfo,
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateFileW(
        file_name: *const u16,
        desired_access: Dword,
        share_mode: Dword,
        security_attributes: *const SecurityAttributes,
        creation_disposition: Dword,
        flags_and_attributes: Dword,
        template: RawHandle,
    ) -> RawHandle;
    fn CloseHandle(object: RawHandle) -> Bool;
    fn ReadFile(
        file: RawHandle,
        buffer: *mut c_void,
        bytes_to_read: Dword,
        bytes_read: *mut Dword,
        overlapped: *mut c_void,
    ) -> Bool;
    fn WriteFile(
        file: RawHandle,
        buffer: *const c_void,
        bytes_to_write: Dword,
        bytes_written: *mut Dword,
        overlapped: *mut c_void,
    ) -> Bool;
    fn FlushFileBuffers(file: RawHandle) -> Bool;
    fn SetFilePointerEx(
        file: RawHandle,
        distance: i64,
        new_position: *mut i64,
        method: Dword,
    ) -> Bool;
    fn GetFileSizeEx(file: RawHandle, size: *mut i64) -> Bool;
    fn GetFileType(file: RawHandle) -> Dword;
    fn GetFinalPathNameByHandleW(
        file: RawHandle,
        path: *mut u16,
        path_len: Dword,
        flags: Dword,
    ) -> Dword;
    fn GetFileInformationByHandleEx(
        file: RawHandle,
        information_class: Dword,
        information: *mut c_void,
        buffer_size: Dword,
    ) -> Bool;
    fn RemoveDirectoryW(path: *const u16) -> Bool;
    fn DeleteFileW(path: *const u16) -> Bool;
    fn GetFileAttributesW(path: *const u16) -> Dword;
    fn GetLastError() -> Dword;
    fn GetTempPathW(buffer_len: Dword, buffer: *mut u16) -> Dword;
    fn GetWindowsDirectoryW(buffer: *mut u16, size: Dword) -> Dword;
    fn GetSystemDirectoryW(buffer: *mut u16, size: Dword) -> Dword;
    fn GetDriveTypeW(root_path: *const u16) -> Dword;
    fn CreatePipe(
        read_pipe: *mut RawHandle,
        write_pipe: *mut RawHandle,
        attributes: *const SecurityAttributes,
        size: Dword,
    ) -> Bool;
    fn SetHandleInformation(object: RawHandle, mask: Dword, flags: Dword) -> Bool;
    fn InitializeProcThreadAttributeList(
        list: *mut c_void,
        attribute_count: Dword,
        flags: Dword,
        size: *mut usize,
    ) -> Bool;
    fn UpdateProcThreadAttribute(
        list: *mut c_void,
        flags: Dword,
        attribute: usize,
        value: *mut c_void,
        size: usize,
        previous_value: *mut c_void,
        return_size: *mut usize,
    ) -> Bool;
    fn DeleteProcThreadAttributeList(list: *mut c_void);
    fn CreateProcessW(
        application_name: *const u16,
        command_line: *mut u16,
        process_attributes: *const SecurityAttributes,
        thread_attributes: *const SecurityAttributes,
        inherit_handles: Bool,
        creation_flags: Dword,
        environment: *const c_void,
        current_directory: *const u16,
        startup_info: *mut StartupInfoW,
        process_information: *mut ProcessInformation,
    ) -> Bool;
    fn ResumeThread(thread: RawHandle) -> Dword;
    fn CreateMutexW(
        attributes: *const SecurityAttributes,
        initial_owner: Bool,
        name: *const u16,
    ) -> RawHandle;
    fn ReleaseMutex(mutex: RawHandle) -> Bool;
    fn WaitForSingleObject(object: RawHandle, milliseconds: Dword) -> Dword;
    fn GetExitCodeProcess(process: RawHandle, exit_code: *mut Dword) -> Bool;
    fn TerminateProcess(process: RawHandle, exit_code: Dword) -> Bool;
    fn CreateJobObjectW(attributes: *const SecurityAttributes, name: *const u16) -> RawHandle;
    fn SetInformationJobObject(
        job: RawHandle,
        information_class: Dword,
        information: *const c_void,
        information_len: Dword,
    ) -> Bool;
    fn AssignProcessToJobObject(job: RawHandle, process: RawHandle) -> Bool;
    fn IsProcessInJob(process: RawHandle, job: RawHandle, result: *mut Bool) -> Bool;
    fn QueryInformationJobObject(
        job: RawHandle,
        information_class: Dword,
        information: *mut c_void,
        information_len: Dword,
        return_len: *mut Dword,
    ) -> Bool;
    fn TerminateJobObject(job: RawHandle, exit_code: Dword) -> Bool;
    fn WaitForDebugEventEx(event: *mut DebugEvent, milliseconds: Dword) -> Bool;
    fn ContinueDebugEvent(process_id: Dword, thread_id: Dword, status: Dword) -> Bool;
    fn DebugActiveProcessStop(process_id: Dword) -> Bool;
    fn LocalFree(memory: *mut c_void) -> *mut c_void;
}

#[link(name = "shell32")]
unsafe extern "system" {
    fn SHGetKnownFolderPath(
        known_folder_id: *const Guid,
        flags: Dword,
        token: RawHandle,
        path: *mut *mut u16,
    ) -> i32;
}

#[link(name = "ole32")]
unsafe extern "system" {
    fn CoTaskMemFree(memory: *mut c_void);
}

#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtCreateFile(
        file_handle: *mut RawHandle,
        desired_access: Dword,
        object_attributes: *mut ObjectAttributes,
        io_status_block: *mut IoStatusBlock,
        allocation_size: *mut i64,
        file_attributes: Dword,
        share_access: Dword,
        create_disposition: Dword,
        create_options: Dword,
        ea_buffer: *mut c_void,
        ea_length: Dword,
    ) -> NtStatus;
}

#[link(name = "advapi32")]
unsafe extern "system" {
    fn ConvertStringSecurityDescriptorToSecurityDescriptorW(
        string_security_descriptor: *const u16,
        string_sd_revision: Dword,
        security_descriptor: *mut *mut c_void,
        security_descriptor_size: *mut Dword,
    ) -> Bool;
    fn GetSecurityInfo(
        handle: RawHandle,
        object_type: Dword,
        security_info: Dword,
        owner: *mut *mut c_void,
        group: *mut *mut c_void,
        dacl: *mut *mut Acl,
        sacl: *mut *mut Acl,
        security_descriptor: *mut *mut c_void,
    ) -> Dword;
    fn GetSecurityDescriptorControl(
        security_descriptor: *const c_void,
        control: *mut u16,
        revision: *mut Dword,
    ) -> Bool;
    fn GetAce(acl: *const Acl, ace_index: Dword, ace: *mut *mut c_void) -> Bool;
    fn IsWellKnownSid(sid: *const c_void, well_known_sid_type: i32) -> Bool;
    fn RegOpenKeyExW(
        key: RawHandle,
        sub_key: *const u16,
        options: Dword,
        desired_access: Dword,
        result: *mut RawHandle,
    ) -> i32;
    fn RegQueryValueExW(
        key: RawHandle,
        value_name: *const u16,
        reserved: *mut Dword,
        value_type: *mut Dword,
        data: *mut u8,
        data_len: *mut Dword,
    ) -> i32;
    fn RegCloseKey(key: RawHandle) -> i32;
}

#[link(name = "bcrypt")]
unsafe extern "system" {
    fn BCryptOpenAlgorithmProvider(
        algorithm: *mut RawHandle,
        algorithm_id: *const u16,
        implementation: *const u16,
        flags: Dword,
    ) -> NtStatus;
    fn BCryptGetProperty(
        object: RawHandle,
        property: *const u16,
        output: *mut u8,
        output_len: Dword,
        result_len: *mut Dword,
        flags: Dword,
    ) -> NtStatus;
    fn BCryptCreateHash(
        algorithm: RawHandle,
        hash: *mut RawHandle,
        object: *mut u8,
        object_len: Dword,
        secret: *const u8,
        secret_len: Dword,
        flags: Dword,
    ) -> NtStatus;
    fn BCryptHashData(
        hash: RawHandle,
        input: *const u8,
        input_len: Dword,
        flags: Dword,
    ) -> NtStatus;
    fn BCryptFinishHash(
        hash: RawHandle,
        output: *mut u8,
        output_len: Dword,
        flags: Dword,
    ) -> NtStatus;
    fn BCryptDestroyHash(hash: RawHandle) -> NtStatus;
    fn BCryptCloseAlgorithmProvider(algorithm: RawHandle, flags: Dword) -> NtStatus;
    fn BCryptGenRandom(
        algorithm: RawHandle,
        buffer: *mut u8,
        buffer_len: Dword,
        flags: Dword,
    ) -> NtStatus;
}

pub struct Handle(RawHandle);

// SAFETY: Handle owns one kernel handle and is moved, never aliased, when sent to an I/O thread.
unsafe impl Send for Handle {}

impl Handle {
    fn new(raw: RawHandle) -> Result<Self, ()> {
        if raw.is_null() || raw == INVALID_HANDLE_VALUE {
            Err(())
        } else {
            Ok(Self(raw))
        }
    }

    fn raw(&self) -> RawHandle {
        self.0
    }

    pub fn into_file(mut self) -> File {
        let raw = self.0;
        self.0 = null_mut();
        // SAFETY: ownership of the valid kernel handle transfers from Handle to File exactly once.
        unsafe { File::from_raw_handle(raw) }
    }
}

impl Drop for Handle {
    fn drop(&mut self) {
        if !self.0.is_null() && self.0 != INVALID_HANDLE_VALUE {
            // SAFETY: this object exclusively owns the valid handle until this drop.
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

pub struct AuthorityUpdateGuard {
    handle: Handle,
    owned: bool,
}

impl AuthorityUpdateGuard {
    pub fn release(mut self) -> Result<(), ()> {
        if self.owned && unsafe { ReleaseMutex(self.handle.raw()) } == 0 {
            return Err(());
        }
        self.owned = false;
        Ok(())
    }
}

impl Drop for AuthorityUpdateGuard {
    fn drop(&mut self) {
        if self.owned {
            // SAFETY: a successful wait granted this thread ownership of the mutex.
            unsafe {
                ReleaseMutex(self.handle.raw());
            }
        }
    }
}

pub fn acquire_authority_update_guard() -> Result<AuthorityUpdateGuard, ()> {
    acquire_named_mutex(AUTHORITY_UPDATE_MUTEX_NAME, AUTHORITY_UPDATE_MUTEX_WAIT_MS)
}

pub fn acquire_authority_update_guard_v2() -> Result<AuthorityUpdateGuard, ()> {
    acquire_named_mutex(
        AUTHORITY_UPDATE_MUTEX_V2_NAME,
        AUTHORITY_UPDATE_MUTEX_WAIT_MS,
    )
}

pub(crate) fn acquire_named_mutex(
    name: &str,
    timeout_ms: Dword,
) -> Result<AuthorityUpdateGuard, ()> {
    let name = wide_nul(OsStr::new(name))?;
    // SAFETY: the name is NUL-terminated and the returned handle is owned here.
    let handle = Handle::new(unsafe { CreateMutexW(null(), 0, name.as_ptr()) })?;
    // SAFETY: handle owns a valid mutex handle for the duration of the wait.
    match unsafe { WaitForSingleObject(handle.raw(), timeout_ms) } {
        WAIT_OBJECT_0 => Ok(AuthorityUpdateGuard {
            handle,
            owned: true,
        }),
        WAIT_ABANDONED => {
            // WAIT_ABANDONED grants ownership. Release that ownership before
            // rejecting the inconsistent predecessor state.
            unsafe {
                ReleaseMutex(handle.raw());
            }
            Err(())
        }
        _ => Err(()),
    }
}

struct SecurityDescriptor(*mut c_void);

impl SecurityDescriptor {
    fn from_sddl(sddl: &str) -> Result<Self, ()> {
        let wide = wide_nul(OsStr::new(sddl))?;
        let mut descriptor = null_mut();
        // SAFETY: the SDDL buffer is NUL-terminated and the output receives LocalAlloc storage.
        if unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                wide.as_ptr(),
                SDDL_REVISION_1,
                &mut descriptor,
                null_mut(),
            )
        } == 0
            || descriptor.is_null()
        {
            Err(())
        } else {
            Ok(Self(descriptor))
        }
    }

    fn raw(&self) -> *mut c_void {
        self.0
    }
}

impl Drop for SecurityDescriptor {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // SAFETY: the descriptor is the LocalAlloc buffer returned by the SDDL converter.
            unsafe {
                LocalFree(self.0);
            }
        }
    }
}

struct CoTaskMemWide(*mut u16);

impl Drop for CoTaskMemWide {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // SAFETY: this is the allocation returned by SHGetKnownFolderPath.
            unsafe {
                CoTaskMemFree(self.0.cast());
            }
        }
    }
}

pub struct VerifiedSource {
    handle: Handle,
    pub size: u64,
    pub digest: [u8; 32],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InstallationImageIdentity {
    pub volume_serial_number: u64,
    pub file_id: [u8; 16],
}

pub struct VerifiedInstallationImage {
    _source: VerifiedSource,
    pub size: u64,
    pub digest: [u8; 32],
    pub identity: InstallationImageIdentity,
}

#[derive(Debug)]
pub enum SourceError {
    Target,
    Integrity,
    Inspection,
}

#[derive(Debug)]
pub enum StageError {
    Integrity,
    Create,
    Inspection,
}

#[derive(Debug)]
pub enum ProcessError {
    Create,
    Containment,
    Inspection,
}

pub struct Stage {
    pub directory_path: PathBuf,
    pub file_path: PathBuf,
    ancestor_handles: Vec<Handle>,
    directory_handle: Option<Handle>,
    file_handle: Option<Handle>,
    directory_id: FileIdInfo,
    file_id: FileIdInfo,
    cleaned: bool,
}

impl Stage {
    pub fn cleanup(&mut self) -> Result<(), ()> {
        self.file_handle.take();
        let file = wide_nul(self.file_path.as_os_str()).map_err(|_| ())?;
        let directory = wide_nul(self.directory_path.as_os_str()).map_err(|_| ())?;
        if retry_delete(&file, DeleteFileW).is_err() {
            return Err(());
        }
        self.directory_handle.take();
        if retry_delete(&directory, RemoveDirectoryW).is_err() {
            return Err(());
        }
        // SAFETY: both pointers remain valid NUL-terminated paths through the checks.
        unsafe {
            if !path_is_absent(&file) || !path_is_absent(&directory) {
                return Err(());
            }
        }
        self.cleaned = true;
        Ok(())
    }
}

impl Drop for Stage {
    fn drop(&mut self) {
        if !self.cleaned {
            self.file_handle.take();
            if let Ok(path) = wide_nul(self.file_path.as_os_str()) {
                let _ = retry_delete(&path, DeleteFileW);
            }
            self.directory_handle.take();
            if let Ok(path) = wide_nul(self.directory_path.as_os_str()) {
                let _ = retry_delete(&path, RemoveDirectoryW);
            }
        }
    }
}

pub fn open_verified_source(path: &Path, max_size: u64) -> Result<VerifiedSource, SourceError> {
    validate_local_absolute_exe(path).map_err(|_| SourceError::Target)?;
    let wide = wide_nul(path.as_os_str()).map_err(|_| SourceError::Target)?;
    // SAFETY: path is a valid NUL-terminated UTF-16 buffer; null security attributes make the handle non-inheritable.
    let raw = unsafe {
        CreateFileW(
            wide.as_ptr(),
            GENERIC_READ,
            FILE_SHARE_READ,
            null(),
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT,
            null_mut(),
        )
    };
    let handle = Handle::new(raw).map_err(|_| SourceError::Target)?;
    inspect_regular_file(&handle).map_err(|_| SourceError::Target)?;
    inspect_local_final_path(&handle).map_err(|_| SourceError::Target)?;
    let size = file_size(&handle).map_err(|_| SourceError::Inspection)?;
    if size == 0 || size > max_size {
        return Err(SourceError::Target);
    }
    let digest = hash_handle(&handle).map_err(|_| SourceError::Inspection)?;
    if file_size(&handle).map_err(|_| SourceError::Inspection)? != size {
        return Err(SourceError::Integrity);
    }
    Ok(VerifiedSource {
        handle,
        size,
        digest,
    })
}

pub fn read_verified_source(source: &VerifiedSource) -> Result<Vec<u8>, ()> {
    let expected_len = usize::try_from(source.size).map_err(|_| ())?;
    let mut bytes = Vec::new();
    bytes.try_reserve_exact(expected_len).map_err(|_| ())?;
    reset_file(&source.handle)?;
    let mut buffer = [0u8; 64 * 1024];
    while bytes.len() < expected_len {
        let remaining = expected_len - bytes.len();
        let chunk_len = remaining.min(buffer.len());
        let count = read_chunk(&source.handle, &mut buffer[..chunk_len])?;
        if count == 0 {
            return Err(());
        }
        bytes.extend_from_slice(&buffer[..count]);
    }
    let mut extra = [0u8; 1];
    if read_chunk(&source.handle, &mut extra)? != 0
        || file_size(&source.handle)? != source.size
        || !constant_time_eq(&hash_handle(&source.handle)?, &source.digest)
    {
        return Err(());
    }
    Ok(bytes)
}

pub fn open_current_executable_image(max_size: u64) -> Result<VerifiedInstallationImage, ()> {
    let path = std::env::current_exe().map_err(|_| ())?;
    let source = open_verified_source(&path, max_size).map_err(|_| ())?;
    let final_path = local_final_path(&source.handle)?;
    let program_files = program_files_x64_path()?;
    validate_immutable_installation_path(&final_path, &program_files, &source.digest)?;
    let standard = file_standard_info(&source.handle)?;
    if standard.number_of_links != 1
        || standard.delete_pending != 0
        || standard.directory != 0
        || standard.end_of_file < 0
        || standard.end_of_file as u64 != source.size
    {
        return Err(());
    }
    let identity = file_identity(&source.handle)?;
    Ok(VerifiedInstallationImage {
        size: source.size,
        digest: source.digest,
        identity: InstallationImageIdentity {
            volume_serial_number: identity.volume_serial_number,
            file_id: identity.file_id,
        },
        _source: source,
    })
}

pub fn read_authority_record_v1(profile_digest: &str) -> Result<[u8; AUTHORITY_RECORD_V1_LEN], ()> {
    read_authority_record::<AUTHORITY_RECORD_V1_LEN>(profile_digest, "v1", "AuthorityRecordV1")
}

pub fn read_authority_record_v2(profile_digest: &str) -> Result<[u8; AUTHORITY_RECORD_V2_LEN], ()> {
    read_authority_record::<AUTHORITY_RECORD_V2_LEN>(profile_digest, "v2", "AuthorityRecordV2")
}

fn read_authority_record<const RECORD_LEN: usize>(
    profile_digest: &str,
    registry_version: &str,
    value_name: &str,
) -> Result<[u8; RECORD_LEN], ()> {
    if profile_digest.len() != 64
        || !profile_digest
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(());
    }
    let path = format!(
        "SOFTWARE\\E2SBridge\\NativeExecution\\{registry_version}\\Profiles\\{profile_digest}"
    );
    let path = wide_nul(OsStr::new(&path))?;
    let value = wide_nul(OsStr::new(value_name))?;
    let mut key = null_mut();
    // SAFETY: the predefined HKLM pseudo-handle is stable, path is NUL-terminated, and result is writable.
    if unsafe {
        RegOpenKeyExW(
            0x8000_0002usize as RawHandle,
            path.as_ptr(),
            0,
            KEY_QUERY_VALUE | KEY_WOW64_64KEY,
            &mut key,
        )
    } != 0
        || key.is_null()
    {
        return Err(());
    }

    let result = {
        let mut value_type = 0;
        let mut data_len = RECORD_LEN as Dword;
        let mut record = [0u8; RECORD_LEN];
        // SAFETY: value name is NUL-terminated and the data buffer is the exact record size.
        if unsafe {
            RegQueryValueExW(
                key,
                value.as_ptr(),
                null_mut(),
                &mut value_type,
                record.as_mut_ptr(),
                &mut data_len,
            )
        } != 0
            || value_type != REG_BINARY
            || data_len as usize != RECORD_LEN
        {
            Err(())
        } else {
            Ok(record)
        }
    };
    // SAFETY: key is the handle returned by the successful RegOpenKeyExW call.
    if unsafe { RegCloseKey(key) } != 0 {
        return Err(());
    }
    result
}

pub fn stage_verified_copy(source: &VerifiedSource) -> Result<Stage, StageError> {
    let root = temp_directory().map_err(|_| StageError::Create)?;
    stage_verified_copy_in_root_impl(source, &root)
}

#[cfg(test)]
#[allow(dead_code)]
pub fn stage_verified_copy_in_root(
    source: &VerifiedSource,
    root: &Path,
) -> Result<Stage, StageError> {
    stage_verified_copy_in_root_impl(source, root)
}

fn stage_verified_copy_in_root_impl(
    source: &VerifiedSource,
    root: &Path,
) -> Result<Stage, StageError> {
    let (root_path, ancestor_handles) =
        retain_canonical_root(root).map_err(|_| StageError::Create)?;
    let directory_security =
        SecurityDescriptor::from_sddl(DIRECTORY_SDDL).map_err(|_| StageError::Create)?;
    let file_security = SecurityDescriptor::from_sddl(FILE_SDDL).map_err(|_| StageError::Create)?;

    let root_handle = ancestor_handles.last().ok_or(StageError::Inspection)?;
    let (directory_name, directory_creator) =
        create_random_directory(root_handle, &directory_security)?;
    let expected_directory = root_path.join(&directory_name);
    let expected_file = expected_directory.join("target.exe");

    let result = (|| {
        inspect_directory(&directory_creator).map_err(|_| StageError::Inspection)?;
        inspect_restricted_acl(&directory_creator, true).map_err(|_| StageError::Inspection)?;
        let directory_id = file_identity(&directory_creator).map_err(|_| StageError::Inspection)?;
        let directory_path =
            canonical_volume_path(&directory_creator).map_err(|_| StageError::Inspection)?;
        if !paths_equal(&directory_path, &expected_directory) {
            return Err(StageError::Inspection);
        }
        bind_path_to_identity(&directory_path, directory_id, true)
            .map_err(|_| StageError::Inspection)?;

        let writer = nt_create_relative(
            &directory_creator,
            OsStr::new("target.exe"),
            GENERIC_READ | GENERIC_WRITE | READ_CONTROL | SYNCHRONIZE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            FILE_CREATE,
            FILE_ATTRIBUTE_NORMAL,
            FILE_NON_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT | NT_FILE_OPEN_REPARSE_POINT,
            Some(&file_security),
        )
        .map_err(|_| StageError::Create)?;
        inspect_regular_file(&writer).map_err(|_| StageError::Inspection)?;
        inspect_restricted_acl(&writer, false).map_err(|_| StageError::Inspection)?;
        copy_exact(&source.handle, &writer, source.size).map_err(|_| StageError::Integrity)?;
        // SAFETY: writer is a valid file handle held exclusively by this scope.
        if unsafe { FlushFileBuffers(writer.raw()) } == 0 {
            return Err(StageError::Inspection);
        }
        let initial_id = file_identity(&writer).map_err(|_| StageError::Inspection)?;
        if file_size(&writer).map_err(|_| StageError::Inspection)? != source.size {
            return Err(StageError::Integrity);
        }
        drop(writer);

        let locked = nt_create_relative(
            &directory_creator,
            OsStr::new("target.exe"),
            GENERIC_READ | READ_CONTROL | SYNCHRONIZE,
            FILE_SHARE_READ,
            FILE_OPEN,
            FILE_ATTRIBUTE_NORMAL,
            FILE_NON_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT | NT_FILE_OPEN_REPARSE_POINT,
            None,
        )
        .map_err(|_| StageError::Inspection)?;
        inspect_regular_file(&locked).map_err(|_| StageError::Inspection)?;
        inspect_restricted_acl(&locked, false).map_err(|_| StageError::Inspection)?;
        let reopened_id = file_identity(&locked).map_err(|_| StageError::Inspection)?;
        let file_path = canonical_volume_path(&locked).map_err(|_| StageError::Inspection)?;
        let staged_size = file_size(&locked).map_err(|_| StageError::Inspection)?;
        let staged_digest = hash_handle(&locked).map_err(|_| StageError::Inspection)?;
        if initial_id != reopened_id
            || !paths_equal(&file_path, &expected_file)
            || staged_size != source.size
            || !constant_time_eq(&staged_digest, &source.digest)
        {
            return Err(StageError::Integrity);
        }
        bind_path_to_identity(&file_path, reopened_id, false)
            .map_err(|_| StageError::Inspection)?;

        let retained_directory = open_canonical_directory(&directory_path, READ_CONTROL)
            .map_err(|_| StageError::Inspection)?;
        if file_identity(&retained_directory).map_err(|_| StageError::Inspection)? != directory_id {
            return Err(StageError::Inspection);
        }
        Ok((
            directory_path,
            file_path,
            retained_directory,
            locked,
            directory_id,
            reopened_id,
        ))
    })();
    drop(directory_creator);

    match result {
        Ok((directory_path, file_path, directory_handle, file_handle, directory_id, file_id)) => {
            Ok(Stage {
                directory_path,
                file_path,
                ancestor_handles,
                directory_handle: Some(directory_handle),
                file_handle: Some(file_handle),
                directory_id,
                file_id,
                cleaned: false,
            })
        }
        Err(error) => {
            if cleanup_unfinished_directory(&expected_directory, Some(&expected_file)).is_ok() {
                Err(error)
            } else {
                Err(StageError::Inspection)
            }
        }
    }
}

fn create_random_directory(
    root: &Handle,
    security: &SecurityDescriptor,
) -> Result<(String, Handle), StageError> {
    for _ in 0..8 {
        let mut random = [0u8; 32];
        // SAFETY: the output buffer is valid for its exact length and the system RNG needs no provider handle.
        if unsafe {
            BCryptGenRandom(
                null_mut(),
                random.as_mut_ptr(),
                random.len() as Dword,
                BCRYPT_USE_SYSTEM_PREFERRED_RNG,
            )
        } != 0
        {
            return Err(StageError::Create);
        }
        let mut name = String::with_capacity("bridge-contained-launcher-".len() + 64);
        name.push_str("bridge-contained-launcher-");
        const HEX: &[u8; 16] = b"0123456789abcdef";
        for byte in random {
            name.push(HEX[(byte >> 4) as usize] as char);
            name.push(HEX[(byte & 0x0f) as usize] as char);
        }
        match nt_create_relative(
            root,
            OsStr::new(&name),
            FILE_READ_ATTRIBUTES
                | FILE_TRAVERSE
                | FILE_ADD_FILE
                | FILE_ADD_SUBDIRECTORY
                | READ_CONTROL
                | SYNCHRONIZE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            FILE_CREATE,
            FILE_ATTRIBUTE_DIRECTORY,
            FILE_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT | NT_FILE_OPEN_REPARSE_POINT,
            Some(security),
        ) {
            Ok(handle) => return Ok((name, handle)),
            Err(status) if status == STATUS_OBJECT_NAME_COLLISION => {
                continue;
            }
            Err(_) => return Err(StageError::Create),
        }
    }
    Err(StageError::Create)
}

#[allow(clippy::too_many_arguments)]
fn nt_create_relative(
    root: &Handle,
    name: &OsStr,
    desired_access: Dword,
    share_access: Dword,
    create_disposition: Dword,
    file_attributes: Dword,
    create_options: Dword,
    security: Option<&SecurityDescriptor>,
) -> Result<Handle, NtStatus> {
    let mut name_units: Vec<u16> = name.encode_wide().collect();
    if name_units.is_empty()
        || name_units
            .iter()
            .any(|unit| matches!(*unit, 0 | 47 | 58 | 92))
        || name_units.len().saturating_mul(2) > u16::MAX as usize
    {
        return Err(-1);
    }
    let length = (name_units.len() * 2) as u16;
    let mut unicode = UnicodeString {
        length,
        maximum_length: length,
        buffer: name_units.as_mut_ptr(),
    };
    let mut attributes = ObjectAttributes {
        length: size_of::<ObjectAttributes>() as Dword,
        root_directory: root.raw(),
        object_name: &mut unicode,
        attributes: OBJ_CASE_INSENSITIVE,
        security_descriptor: security.map_or(null_mut(), SecurityDescriptor::raw),
        security_quality_of_service: null_mut(),
    };
    let mut io_status = IoStatusBlock {
        status_or_pointer: 0,
        information: 0,
    };
    let mut raw = null_mut();
    // SAFETY: all native structures match their C layouts, the name and descriptor remain live,
    // and root is a retained directory handle for the entire relative create/open operation.
    let status = unsafe {
        NtCreateFile(
            &mut raw,
            desired_access,
            &mut attributes,
            &mut io_status,
            null_mut(),
            file_attributes,
            share_access,
            create_disposition,
            create_options,
            null_mut(),
            0,
        )
    };
    if status < 0 {
        return Err(status);
    }
    Handle::new(raw).map_err(|_| -1)
}

fn retain_canonical_root(root: &Path) -> Result<(PathBuf, Vec<Handle>), ()> {
    let wide = wide_nul(root.as_os_str())?;
    // SAFETY: this initial open resolves the caller spelling once; all later operations use the
    // final volume-GUID path and handles retained without delete sharing.
    let initial = Handle::new(unsafe {
        CreateFileW(
            wide.as_ptr(),
            FILE_READ_ATTRIBUTES,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            null_mut(),
        )
    })?;
    inspect_directory(&initial)?;
    let canonical = canonical_volume_path(&initial)?;
    let paths = canonical_directory_paths(&canonical)?;
    let mut handles = Vec::with_capacity(paths.len());
    for (index, path) in paths.iter().enumerate() {
        let extra_access = if index + 1 == paths.len() {
            FILE_ADD_FILE | FILE_ADD_SUBDIRECTORY
        } else {
            0
        };
        handles.push(open_canonical_directory(path, extra_access)?);
    }
    let retained = handles.last().ok_or(())?;
    if file_identity(&initial)? != file_identity(retained)?
        || !paths_equal(&canonical_volume_path(retained)?, &canonical)
    {
        return Err(());
    }
    Ok((canonical, handles))
}

fn open_canonical_directory(path: &Path, extra_access: Dword) -> Result<Handle, ()> {
    let wide = wide_nul(path.as_os_str())?;
    // SAFETY: the canonical volume path is NUL-terminated; OPEN_REPARSE_POINT prevents the final
    // component from being followed, and omitting FILE_SHARE_DELETE pins its namespace entry.
    let handle = Handle::new(unsafe {
        CreateFileW(
            wide.as_ptr(),
            FILE_READ_ATTRIBUTES | FILE_TRAVERSE | extra_access,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
            null_mut(),
        )
    })?;
    inspect_directory(&handle)?;
    Ok(handle)
}

fn canonical_volume_path(handle: &Handle) -> Result<PathBuf, ()> {
    let mut path = vec![0u16; 32_768];
    // SAFETY: output is writable for path.len() UTF-16 units and handle is a valid disk handle.
    let length = unsafe {
        GetFinalPathNameByHandleW(
            handle.raw(),
            path.as_mut_ptr(),
            path.len() as Dword,
            VOLUME_NAME_GUID,
        )
    } as usize;
    if length == 0 || length >= path.len() {
        return Err(());
    }
    path.truncate(length);
    let result = PathBuf::from(OsString::from_wide(&path));
    canonical_directory_paths(&result)?;
    Ok(result)
}

fn canonical_directory_paths(path: &Path) -> Result<Vec<PathBuf>, ()> {
    let units: Vec<u16> = path.as_os_str().encode_wide().collect();
    const PREFIX: &[u16] = &[92, 92, 63, 92, 86, 111, 108, 117, 109, 101, 123];
    const GUID_HYPHENS: [usize; 4] = [8, 13, 18, 23];
    const ROOT_LENGTH: usize = 49;
    if units.len() < ROOT_LENGTH
        || !starts_with_ascii_case_insensitive(&units, PREFIX)
        || units[47] != b'}' as u16
        || units[48] != b'\\' as u16
    {
        return Err(());
    }
    for (index, unit) in units[11..47].iter().enumerate() {
        if GUID_HYPHENS.contains(&index) {
            if *unit != b'-' as u16 {
                return Err(());
            }
        } else if !(*unit as u8).is_ascii_hexdigit() || *unit > u8::MAX as u16 {
            return Err(());
        }
    }

    let mut paths = vec![PathBuf::from(OsString::from_wide(&units[..ROOT_LENGTH]))];
    if units.len() == ROOT_LENGTH {
        return Ok(paths);
    }
    if units.last() == Some(&(b'\\' as u16)) {
        return Err(());
    }
    let mut current = units[..ROOT_LENGTH].to_vec();
    for component in units[ROOT_LENGTH..].split(|unit| *unit == b'\\' as u16) {
        if component.is_empty()
            || component == [b'.' as u16]
            || component == [b'.' as u16, b'.' as u16]
            || component.iter().any(|unit| matches!(*unit, 0 | 47 | 58))
        {
            return Err(());
        }
        if current.last() != Some(&(b'\\' as u16)) {
            current.push(b'\\' as u16);
        }
        current.extend_from_slice(component);
        paths.push(PathBuf::from(OsString::from_wide(&current)));
    }
    Ok(paths)
}

fn paths_equal(left: &Path, right: &Path) -> bool {
    let left: Vec<u16> = left.as_os_str().encode_wide().collect();
    let right: Vec<u16> = right.as_os_str().encode_wide().collect();
    left.len() == right.len()
        && left.iter().zip(right).all(|(left, right)| {
            let lower = |unit: u16| {
                if (b'A' as u16..=b'Z' as u16).contains(&unit) {
                    unit + 32
                } else {
                    unit
                }
            };
            lower(*left) == lower(right)
        })
}

fn bind_path_to_identity(path: &Path, expected: FileIdInfo, directory: bool) -> Result<(), ()> {
    let handle = if directory {
        open_canonical_directory(path, 0)?
    } else {
        let wide = wide_nul(path.as_os_str())?;
        // SAFETY: the canonical path is NUL-terminated and the retained file/ancestor handles
        // prevent replacement while this no-reparse identity check opens the named entry.
        let handle = Handle::new(unsafe {
            CreateFileW(
                wide.as_ptr(),
                FILE_READ_ATTRIBUTES,
                FILE_SHARE_READ,
                null(),
                OPEN_EXISTING,
                FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT,
                null_mut(),
            )
        })?;
        inspect_regular_file(&handle)?;
        handle
    };
    if file_identity(&handle)? != expected || !paths_equal(&canonical_volume_path(&handle)?, path) {
        Err(())
    } else {
        Ok(())
    }
}

fn inspect_restricted_acl(handle: &Handle, directory: bool) -> Result<(), ()> {
    let mut dacl = null_mut();
    let mut raw_descriptor = null_mut();
    // SAFETY: output pointers receive borrowed DACL storage and the owning LocalAlloc descriptor.
    if unsafe {
        GetSecurityInfo(
            handle.raw(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            null_mut(),
            null_mut(),
            &mut dacl,
            null_mut(),
            &mut raw_descriptor,
        )
    } != 0
        || raw_descriptor.is_null()
        || dacl.is_null()
    {
        if !raw_descriptor.is_null() {
            // SAFETY: a non-null descriptor output is LocalAlloc storage even on later validation failure.
            unsafe {
                LocalFree(raw_descriptor);
            }
        }
        return Err(());
    }
    let descriptor = SecurityDescriptor(raw_descriptor);
    let mut control = 0u16;
    let mut revision = 0u32;
    // SAFETY: descriptor owns the live security descriptor for the duration of this inspection.
    if unsafe { GetSecurityDescriptorControl(descriptor.raw(), &mut control, &mut revision) } == 0
        || control & SE_DACL_PROTECTED == 0
        || unsafe { (*dacl).ace_count } != 3
    {
        return Err(());
    }

    let expected_flags = if directory {
        OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE
    } else {
        0
    };
    let mut found = [false; 3];
    for index in 0..3 {
        let mut raw_ace = null_mut();
        // SAFETY: index is below the validated ACE count and output receives an ACL-owned pointer.
        if unsafe { GetAce(dacl, index, &mut raw_ace) } == 0 || raw_ace.is_null() {
            return Err(());
        }
        // SAFETY: GetAce returned a pointer to an ACE whose header is always present.
        let ace = unsafe { &*(raw_ace as *const AccessAllowedAce) };
        if ace.header.ace_type != ACCESS_ALLOWED_ACE_TYPE
            || (ace.header.ace_size as usize) < size_of::<AccessAllowedAce>()
            || ace.header.ace_flags & INHERITED_ACE != 0
            || ace.header.ace_flags != expected_flags
            || !matches!(ace.mask, GENERIC_ALL | FILE_ALL_ACCESS)
        {
            return Err(());
        }
        let sid = (&ace.sid_start as *const Dword).cast();
        let slot = if unsafe { IsWellKnownSid(sid, WIN_CREATOR_OWNER_RIGHTS_SID) } != 0 {
            0
        } else if unsafe { IsWellKnownSid(sid, WIN_LOCAL_SYSTEM_SID) } != 0 {
            1
        } else if unsafe { IsWellKnownSid(sid, WIN_BUILTIN_ADMINISTRATORS_SID) } != 0 {
            2
        } else {
            return Err(());
        };
        if found[slot] {
            return Err(());
        }
        found[slot] = true;
    }
    if found.into_iter().all(|present| present) {
        Ok(())
    } else {
        Err(())
    }
}

#[cfg(test)]
#[allow(dead_code)]
pub fn test_stage_has_restricted_acls(stage: &Stage) -> bool {
    stage
        .directory_handle
        .as_ref()
        .is_some_and(|handle| inspect_restricted_acl(handle, true).is_ok())
        && stage
            .file_handle
            .as_ref()
            .is_some_and(|handle| inspect_restricted_acl(handle, false).is_ok())
}

fn cleanup_unfinished_directory(directory: &Path, file: Option<&Path>) -> Result<(), ()> {
    if let Some(file) = file.and_then(|path| wide_nul(path.as_os_str()).ok()) {
        retry_delete(&file, DeleteFileW)?;
    }
    let directory = wide_nul(directory.as_os_str())?;
    retry_delete(&directory, RemoveDirectoryW)
}

pub struct ModulePolicy {
    system32_path: PathBuf,
    _system32_handle: Handle,
    allowed: Vec<String>,
}

impl ModulePolicy {
    pub fn new(allowed: &[String]) -> Result<Self, ()> {
        let system32 = system_directory()?;
        let handle = open_canonical_directory(&system32, 0)?;
        let system32_path = canonical_volume_path(&handle)?;
        Ok(Self {
            system32_path,
            _system32_handle: handle,
            allowed: allowed.to_vec(),
        })
    }

    fn permits(&self, file: RawHandle) -> Result<bool, ()> {
        let file = Handle::new(file)?;
        inspect_regular_file(&file)?;
        let path = canonical_volume_path(&file)?;
        Ok(module_path_permitted(
            &self.system32_path,
            &path,
            &self.allowed,
        ))
    }
}

fn module_path_permitted(system32: &Path, loaded: &Path, allowed: &[String]) -> bool {
    let Some(parent) = loaded.parent() else {
        return false;
    };
    let Some(name) = loaded.file_name().and_then(OsStr::to_str) else {
        return false;
    };
    if !name.is_ascii() || !paths_equal(parent, system32) {
        return false;
    }
    let normalized = name.to_ascii_lowercase();
    allowed.binary_search(&normalized).is_ok()
}

#[derive(Debug)]
pub enum DebugError {
    Policy,
    Inspection,
}

pub struct Process {
    process: Handle,
    thread: Option<Handle>,
    job: Handle,
    process_id: Dword,
    debug_enabled: bool,
    initial_breakpoint_seen: bool,
    pub stdin: Option<Handle>,
    pub stdout: Option<Handle>,
    pub stderr: Option<Handle>,
}

pub enum WaitStatus {
    Running,
    Exited,
}

impl Process {
    pub fn resume(&mut self) -> Result<(), ()> {
        let thread = self.thread.take().ok_or(())?;
        // SAFETY: thread is the suspended primary thread returned by CreateProcessW.
        let result = unsafe { ResumeThread(thread.raw()) };
        if result == Dword::MAX {
            Err(())
        } else {
            Ok(())
        }
    }

    pub fn root_wait_status(&self) -> Result<WaitStatus, ()> {
        // SAFETY: process is a live process handle and a zero timeout is a nonblocking inspection.
        match unsafe { WaitForSingleObject(self.process.raw(), 0) } {
            WAIT_OBJECT_0 => Ok(WaitStatus::Exited),
            WAIT_TIMEOUT => Ok(WaitStatus::Running),
            _ => Err(()),
        }
    }

    pub fn exit_code(&self) -> Result<Dword, ()> {
        let mut code = 0;
        // SAFETY: output points to a writable DWORD and process is a valid process handle.
        if unsafe { GetExitCodeProcess(self.process.raw(), &mut code) } == 0 {
            Err(())
        } else {
            Ok(code)
        }
    }

    pub fn active_processes(&self) -> Result<Dword, ()> {
        query_active_processes(&self.job)
    }

    pub fn total_processes(&self) -> Result<Dword, ()> {
        query_total_processes(&self.job)
    }

    pub fn initial_loader_breakpoint_seen(&self) -> bool {
        self.debug_enabled && self.initial_breakpoint_seen
    }

    pub fn drain_debug_events(&mut self, policy: &ModulePolicy) -> Result<(), DebugError> {
        if !self.debug_enabled {
            return Err(DebugError::Inspection);
        }
        loop {
            // SAFETY: DEBUG_EVENT is an FFI output structure and the oversized union storage is zeroed.
            let mut event: DebugEvent = unsafe { zeroed() };
            // SAFETY: event is writable for the complete DEBUG_EVENT layout and timeout zero is nonblocking.
            if unsafe { WaitForDebugEventEx(&mut event, 0) } == 0 {
                return if unsafe { GetLastError() } == ERROR_SEM_TIMEOUT {
                    Ok(())
                } else {
                    Err(DebugError::Inspection)
                };
            }
            let mut policy_failure = false;
            let status = match event.code {
                CREATE_PROCESS_DEBUG_EVENT => {
                    // SAFETY: the active union member is selected by CREATE_PROCESS_DEBUG_EVENT.
                    let file = unsafe { event.info.create_process.file };
                    if !file.is_null() && file != INVALID_HANDLE_VALUE {
                        drop(Handle::new(file).map_err(|_| DebugError::Inspection)?);
                    }
                    DBG_CONTINUE
                }
                LOAD_DLL_DEBUG_EVENT => {
                    // SAFETY: the active union member is selected by LOAD_DLL_DEBUG_EVENT.
                    let file = unsafe { event.info.load_dll.file };
                    policy_failure = !policy.permits(file).unwrap_or(false);
                    DBG_CONTINUE
                }
                EXCEPTION_DEBUG_EVENT => {
                    // SAFETY: the active union member is selected by EXCEPTION_DEBUG_EVENT.
                    let code = unsafe { event.info.exception.record.code };
                    if code == EXCEPTION_BREAKPOINT && !self.initial_breakpoint_seen {
                        self.initial_breakpoint_seen = true;
                        DBG_CONTINUE
                    } else {
                        DBG_EXCEPTION_NOT_HANDLED
                    }
                }
                RIP_EVENT => {
                    policy_failure = true;
                    DBG_CONTINUE
                }
                _ => DBG_CONTINUE,
            };
            if policy_failure {
                // Keep the rejected event stopped until the entire private job
                // has received a kernel termination request. Continuing first
                // would allow rejected DLL initialization or RIP handling to
                // run before the caller begins teardown.
                if unsafe { TerminateJobObject(self.job.raw(), 0xC000_013A) } == 0 {
                    return Err(DebugError::Inspection);
                }
            }
            // SAFETY: ids come from the pending event and status is a documented continuation value.
            if unsafe { ContinueDebugEvent(event.process_id, event.thread_id, status) } == 0 {
                return Err(DebugError::Inspection);
            }
            if policy_failure {
                return Err(DebugError::Policy);
            }
        }
    }

    pub fn terminate_and_verify(&mut self) -> Result<(), ()> {
        // SAFETY: job is the private unnamed job owned by this Process.
        if unsafe { TerminateJobObject(self.job.raw(), 0xC000_013A) } == 0 {
            // Do not detach or continue a pending debug event unless the
            // kernel has accepted termination for the complete job.
            return Err(());
        }
        if self.debug_enabled {
            // SAFETY: this broker is the debugger for process_id; the job has already been terminated.
            if unsafe { DebugActiveProcessStop(self.process_id) } != 0 {
                self.debug_enabled = false;
            }
        }
        let started = Instant::now();
        loop {
            if query_active_processes(&self.job)? == 0 {
                // SAFETY: the root process handle remains valid and must be signaled before teardown is verified.
                return if unsafe { WaitForSingleObject(self.process.raw(), 5_000) } == WAIT_OBJECT_0
                {
                    Ok(())
                } else {
                    Err(())
                };
            }
            if self.debug_enabled {
                self.continue_debug_events_for_termination()?;
            }
            if started.elapsed() >= Duration::from_secs(5) {
                return Err(());
            }
            thread::sleep(Duration::from_millis(5));
        }
    }

    fn continue_debug_events_for_termination(&mut self) -> Result<(), ()> {
        loop {
            // SAFETY: DEBUG_EVENT is an FFI output structure and the oversized union storage is zeroed.
            let mut event: DebugEvent = unsafe { zeroed() };
            // SAFETY: event is writable and a zero timeout only polls the debugger queue.
            if unsafe { WaitForDebugEventEx(&mut event, 0) } == 0 {
                return if unsafe { GetLastError() } == ERROR_SEM_TIMEOUT {
                    Ok(())
                } else {
                    Err(())
                };
            }
            let file = match event.code {
                CREATE_PROCESS_DEBUG_EVENT => {
                    // SAFETY: the event code selects this union member.
                    unsafe { event.info.create_process.file }
                }
                LOAD_DLL_DEBUG_EVENT => {
                    // SAFETY: the event code selects this union member.
                    unsafe { event.info.load_dll.file }
                }
                _ => null_mut(),
            };
            if !file.is_null() && file != INVALID_HANDLE_VALUE {
                drop(Handle::new(file)?);
            }
            // SAFETY: the pending event is continued so termination can complete.
            if unsafe { ContinueDebugEvent(event.process_id, event.thread_id, DBG_CONTINUE) } == 0 {
                return Err(());
            }
        }
    }
}

pub fn create_contained_process(
    stage: &Stage,
    command_line: &[u16],
    environment: &[u16],
    authority_mode: bool,
) -> Result<Process, ProcessError> {
    create_contained_process_with_options(
        stage,
        command_line,
        environment,
        authority_mode,
        authority_mode,
    )
}

#[cfg(test)]
#[allow(dead_code)]
pub fn create_process_with_active_limit_for_testing(
    stage: &Stage,
    command_line: &[u16],
    environment: &[u16],
) -> Result<Process, ProcessError> {
    create_contained_process_with_options(stage, command_line, environment, false, true)
}

fn create_contained_process_with_options(
    stage: &Stage,
    command_line: &[u16],
    environment: &[u16],
    debug_modules: bool,
    restrict_descendants: bool,
) -> Result<Process, ProcessError> {
    verify_stage_binding(stage).map_err(|_| ProcessError::Inspection)?;
    let stdin_pipe = create_pipe_pair(true).map_err(|_| ProcessError::Create)?;
    let stdout_pipe = create_pipe_pair(false).map_err(|_| ProcessError::Create)?;
    let stderr_pipe = create_pipe_pair(false).map_err(|_| ProcessError::Create)?;
    let (stdin_broker, stdin_child) = stdin_pipe;
    let (stdout_broker, stdout_child) = stdout_pipe;
    let (stderr_broker, stderr_child) = stderr_pipe;

    // SAFETY: unnamed job creation has no pointer inputs and returns an exclusively owned handle.
    let job = Handle::new(unsafe { CreateJobObjectW(null(), null()) })
        .map_err(|_| ProcessError::Containment)?;
    let mut limits = JobObjectExtendedLimitInformation::default();
    limits.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if restrict_descendants {
        limits.basic_limit_information.limit_flags |= JOB_OBJECT_LIMIT_ACTIVE_PROCESS;
        limits.basic_limit_information.active_process_limit = 1;
    }
    // SAFETY: the information pointer and byte count exactly match the repr(C) structure.
    if unsafe {
        SetInformationJobObject(
            job.raw(),
            JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
            (&limits as *const JobObjectExtendedLimitInformation).cast(),
            size_of::<JobObjectExtendedLimitInformation>() as Dword,
        )
    } == 0
    {
        return Err(ProcessError::Containment);
    }

    let inherited = [stdin_child.raw(), stdout_child.raw(), stderr_child.raw()];
    let mut attributes = AttributeList::new(&inherited).map_err(|_| ProcessError::Create)?;
    // SAFETY: this FFI POD structure permits an all-zero initial state before documented fields are assigned.
    let mut startup: StartupInfoExW = unsafe { zeroed() };
    startup.startup_info.cb = size_of::<StartupInfoExW>() as Dword;
    startup.startup_info.flags = STARTF_USESTDHANDLES;
    startup.startup_info.stdin = stdin_child.raw();
    startup.startup_info.stdout = stdout_child.raw();
    startup.startup_info.stderr = stderr_child.raw();
    startup.attribute_list = attributes.pointer();

    let application = wide_nul(stage.file_path.as_os_str()).map_err(|_| ProcessError::Create)?;
    let directory = wide_nul(stage.directory_path.as_os_str()).map_err(|_| ProcessError::Create)?;
    let mut mutable_command = command_line.to_vec();
    // SAFETY: CreateProcessW requires zero-initialized output storage and initializes it on success.
    let mut information: ProcessInformation = unsafe { zeroed() };
    // SAFETY: all UTF-16 buffers are NUL-terminated and live for the call; the handle list contains
    // exactly the three inheritable child pipe ends named in STARTUPINFOEX.
    let created = unsafe {
        CreateProcessW(
            application.as_ptr(),
            mutable_command.as_mut_ptr(),
            null(),
            null(),
            1,
            CREATE_SUSPENDED
                | CREATE_NO_WINDOW
                | CREATE_UNICODE_ENVIRONMENT
                | EXTENDED_STARTUPINFO_PRESENT
                | if debug_modules {
                    DEBUG_ONLY_THIS_PROCESS
                } else {
                    0
                },
            environment.as_ptr().cast(),
            directory.as_ptr(),
            (&mut startup as *mut StartupInfoExW).cast(),
            &mut information,
        )
    };
    if created == 0 {
        return Err(ProcessError::Create);
    }
    let process = Handle::new(information.process).map_err(|_| ProcessError::Inspection)?;
    let thread = Handle::new(information.thread).map_err(|_| ProcessError::Inspection)?;

    // SAFETY: process is still suspended, so assignment precedes all target code execution.
    if unsafe { AssignProcessToJobObject(job.raw(), process.raw()) } == 0 {
        // SAFETY: terminating the still-suspended private child prevents execution outside containment.
        unsafe {
            TerminateProcess(process.raw(), 0xC000_013A);
            WaitForSingleObject(process.raw(), 5_000);
        }
        return Err(ProcessError::Containment);
    }
    let mut in_job = 0;
    // SAFETY: result points to writable BOOL storage and both handles are valid.
    if unsafe { IsProcessInJob(process.raw(), job.raw(), &mut in_job) } == 0 || in_job == 0 {
        // SAFETY: target is suspended and is terminated before this scope releases its job.
        unsafe {
            TerminateProcess(process.raw(), 0xC000_013A);
            WaitForSingleObject(process.raw(), 5_000);
        }
        return Err(ProcessError::Inspection);
    }

    drop(stdin_child);
    drop(stdout_child);
    drop(stderr_child);
    drop(attributes);
    Ok(Process {
        process,
        thread: Some(thread),
        job,
        process_id: information.process_id,
        debug_enabled: debug_modules,
        initial_breakpoint_seen: false,
        stdin: Some(stdin_broker),
        stdout: Some(stdout_broker),
        stderr: Some(stderr_broker),
    })
}

fn verify_stage_binding(stage: &Stage) -> Result<(), ()> {
    let expected_root = stage.directory_path.parent().ok_or(())?;
    let expected_chain = canonical_directory_paths(expected_root)?;
    if stage.ancestor_handles.len() != expected_chain.len()
        || stage
            .file_path
            .parent()
            .is_none_or(|path| !paths_equal(path, &stage.directory_path))
    {
        return Err(());
    }
    for (handle, path) in stage.ancestor_handles.iter().zip(expected_chain) {
        inspect_directory(handle)?;
        if !paths_equal(&canonical_volume_path(handle)?, &path) {
            return Err(());
        }
    }

    let directory = stage.directory_handle.as_ref().ok_or(())?;
    let file = stage.file_handle.as_ref().ok_or(())?;
    inspect_directory(directory)?;
    inspect_regular_file(file)?;
    inspect_restricted_acl(directory, true)?;
    inspect_restricted_acl(file, false)?;
    if file_identity(directory)? != stage.directory_id
        || file_identity(file)? != stage.file_id
        || !paths_equal(&canonical_volume_path(directory)?, &stage.directory_path)
        || !paths_equal(&canonical_volume_path(file)?, &stage.file_path)
    {
        return Err(());
    }
    bind_path_to_identity(&stage.directory_path, stage.directory_id, true)?;
    bind_path_to_identity(&stage.file_path, stage.file_id, false)?;

    // Generic mode binds only this namespace. Authority mode separately validates retained PE
    // bytes before staging and observes root-process loader events through exit.
    Ok(())
}

fn create_pipe_pair(stdin_direction: bool) -> Result<(Handle, Handle), ()> {
    let attributes = SecurityAttributes {
        length: size_of::<SecurityAttributes>() as Dword,
        security_descriptor: null_mut(),
        inherit_handle: 1,
    };
    let mut read = null_mut();
    let mut write = null_mut();
    // SAFETY: output pointers are writable and attributes requests inheritable handles.
    if unsafe { CreatePipe(&mut read, &mut write, &attributes, 0) } == 0 {
        return Err(());
    }
    let read = Handle::new(read)?;
    let write = Handle::new(write)?;
    let broker = if stdin_direction { &write } else { &read };
    // SAFETY: broker is a valid pipe handle; clearing inheritance cannot broaden access.
    if unsafe { SetHandleInformation(broker.raw(), HANDLE_FLAG_INHERIT, 0) } == 0 {
        return Err(());
    }
    if stdin_direction {
        Ok((write, read))
    } else {
        Ok((read, write))
    }
}

struct AttributeList {
    storage: Vec<usize>,
}

impl AttributeList {
    fn new(handles: &[RawHandle; 3]) -> Result<Self, ()> {
        let mut bytes = 0usize;
        // SAFETY: the documented sizing call writes only the required byte count.
        unsafe {
            InitializeProcThreadAttributeList(null_mut(), 1, 0, &mut bytes);
        }
        if bytes == 0 {
            return Err(());
        }
        let words = bytes.div_ceil(size_of::<usize>());
        let mut list = Self {
            storage: vec![0usize; words],
        };
        // SAFETY: storage is pointer-aligned and at least the byte count returned by the sizing call.
        if unsafe { InitializeProcThreadAttributeList(list.pointer(), 1, 0, &mut bytes) } == 0 {
            list.storage.clear();
            return Err(());
        }
        // SAFETY: handles points to exactly three live inheritable handles for the duration of CreateProcessW.
        if unsafe {
            UpdateProcThreadAttribute(
                list.pointer(),
                0,
                PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
                handles.as_ptr().cast_mut().cast(),
                size_of_val(handles),
                null_mut(),
                null_mut(),
            )
        } == 0
        {
            return Err(());
        }
        Ok(list)
    }

    fn pointer(&mut self) -> *mut c_void {
        self.storage.as_mut_ptr().cast()
    }
}

impl Drop for AttributeList {
    fn drop(&mut self) {
        if !self.storage.is_empty() {
            // SAFETY: storage contains a successfully initialized attribute list until this drop.
            unsafe {
                DeleteProcThreadAttributeList(self.pointer());
            }
        }
    }
}

fn query_active_processes(job: &Handle) -> Result<Dword, ()> {
    Ok(query_job_accounting(job)?.active_processes)
}

fn query_total_processes(job: &Handle) -> Result<Dword, ()> {
    Ok(query_job_accounting(job)?.total_processes)
}

fn query_job_accounting(job: &Handle) -> Result<JobObjectBasicAccountingInformation, ()> {
    // SAFETY: the accounting FFI POD permits an all-zero initial state before the query fills it.
    let mut accounting: JobObjectBasicAccountingInformation = unsafe { zeroed() };
    // SAFETY: output pointer and size exactly match the repr(C) accounting structure.
    if unsafe {
        QueryInformationJobObject(
            job.raw(),
            JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION_CLASS,
            (&mut accounting as *mut JobObjectBasicAccountingInformation).cast(),
            size_of::<JobObjectBasicAccountingInformation>() as Dword,
            null_mut(),
        )
    } == 0
    {
        Err(())
    } else {
        Ok(accounting)
    }
}

fn inspect_regular_file(handle: &Handle) -> Result<(), ()> {
    let info = file_attribute_info(handle)?;
    if info.file_attributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT) != 0
        || file_type(handle) != FILE_TYPE_DISK
    {
        Err(())
    } else {
        Ok(())
    }
}

fn inspect_directory(handle: &Handle) -> Result<(), ()> {
    let info = file_attribute_info(handle)?;
    if info.file_attributes & FILE_ATTRIBUTE_DIRECTORY == 0
        || info.file_attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || file_type(handle) != FILE_TYPE_DISK
    {
        Err(())
    } else {
        Ok(())
    }
}

fn file_attribute_info(handle: &Handle) -> Result<FileAttributeTagInfo, ()> {
    // SAFETY: FILE_ATTRIBUTE_TAG_INFO is a plain output structure with a valid all-zero state.
    let mut info: FileAttributeTagInfo = unsafe { zeroed() };
    // SAFETY: output pointer and size exactly match the requested FILE_ATTRIBUTE_TAG_INFO class.
    if unsafe {
        GetFileInformationByHandleEx(
            handle.raw(),
            FILE_ATTRIBUTE_TAG_INFO_CLASS,
            (&mut info as *mut FileAttributeTagInfo).cast(),
            size_of::<FileAttributeTagInfo>() as Dword,
        )
    } == 0
    {
        Err(())
    } else {
        Ok(info)
    }
}

fn file_standard_info(handle: &Handle) -> Result<FileStandardInfo, ()> {
    // SAFETY: FILE_STANDARD_INFO is a plain output structure with a valid all-zero state.
    let mut info: FileStandardInfo = unsafe { zeroed() };
    // SAFETY: output pointer and size exactly match the requested FILE_STANDARD_INFO class.
    if unsafe {
        GetFileInformationByHandleEx(
            handle.raw(),
            FILE_STANDARD_INFO_CLASS,
            (&mut info as *mut FileStandardInfo).cast(),
            size_of::<FileStandardInfo>() as Dword,
        )
    } == 0
    {
        Err(())
    } else {
        Ok(info)
    }
}

fn file_identity(handle: &Handle) -> Result<FileIdInfo, ()> {
    // SAFETY: FILE_ID_INFO is a plain output structure with a valid all-zero state.
    let mut info: FileIdInfo = unsafe { zeroed() };
    // SAFETY: output pointer and size exactly match the requested FILE_ID_INFO class.
    if unsafe {
        GetFileInformationByHandleEx(
            handle.raw(),
            FILE_ID_INFO_CLASS,
            (&mut info as *mut FileIdInfo).cast(),
            size_of::<FileIdInfo>() as Dword,
        )
    } == 0
    {
        Err(())
    } else {
        Ok(info)
    }
}

fn file_type(handle: &Handle) -> Dword {
    // SAFETY: handle is valid for the duration of this call.
    unsafe { GetFileType(handle.raw()) }
}

fn file_size(handle: &Handle) -> Result<u64, ()> {
    let mut size = 0i64;
    // SAFETY: output points to a writable signed 64-bit size.
    if unsafe { GetFileSizeEx(handle.raw(), &mut size) } == 0 || size < 0 {
        Err(())
    } else {
        Ok(size as u64)
    }
}

fn inspect_local_final_path(handle: &Handle) -> Result<(), ()> {
    local_final_path(handle).map(|_| ())
}

fn local_final_path(handle: &Handle) -> Result<PathBuf, ()> {
    let mut path = vec![0u16; 32_768];
    // SAFETY: output is writable for path.len() UTF-16 units and handle is a valid disk handle.
    let length = unsafe {
        GetFinalPathNameByHandleW(handle.raw(), path.as_mut_ptr(), path.len() as Dword, 0)
    } as usize;
    if length == 0 || length >= path.len() {
        return Err(());
    }
    path.truncate(length);
    let unc_prefix = [
        b'\\' as u16,
        b'\\' as u16,
        b'?' as u16,
        b'\\' as u16,
        b'U' as u16,
        b'N' as u16,
        b'C' as u16,
        b'\\' as u16,
    ];
    let device_prefix = [b'\\' as u16, b'\\' as u16, b'?' as u16, b'\\' as u16];
    if !starts_with_ascii_case_insensitive(&path, &device_prefix)
        || starts_with_ascii_case_insensitive(&path, &unc_prefix)
    {
        return Err(());
    }
    let path = PathBuf::from(OsString::from_wide(&path[device_prefix.len()..]));
    let units: Vec<u16> = path.as_os_str().encode_wide().collect();
    if units.len() < 3
        || !is_ascii_letter(units[0])
        || units[1] != b':' as u16
        || units[2] != b'\\' as u16
        || units[3..].contains(&(b':' as u16))
    {
        return Err(());
    }
    validate_local_drive_root(&path)?;
    Ok(path)
}

fn starts_with_ascii_case_insensitive(value: &[u16], prefix: &[u16]) -> bool {
    value.len() >= prefix.len()
        && value.iter().zip(prefix).all(|(left, right)| {
            let left = if (b'a' as u16..=b'z' as u16).contains(left) {
                *left - 32
            } else {
                *left
            };
            let right = if (b'a' as u16..=b'z' as u16).contains(right) {
                *right - 32
            } else {
                *right
            };
            left == right
        })
}

fn reset_file(handle: &Handle) -> Result<(), ()> {
    // SAFETY: handle is a synchronous disk file and null output is permitted.
    if unsafe { SetFilePointerEx(handle.raw(), 0, null_mut(), FILE_BEGIN) } == 0 {
        Err(())
    } else {
        Ok(())
    }
}

fn copy_exact(source: &Handle, destination: &Handle, expected_size: u64) -> Result<(), ()> {
    reset_file(source)?;
    let mut copied = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = read_chunk(source, &mut buffer)?;
        if count == 0 {
            break;
        }
        write_all_handle(destination, &buffer[..count])?;
        copied = copied.checked_add(count as u64).ok_or(())?;
        if copied > expected_size {
            return Err(());
        }
    }
    if copied != expected_size {
        return Err(());
    }
    Ok(())
}

fn read_chunk(handle: &Handle, buffer: &mut [u8]) -> Result<usize, ()> {
    let mut read = 0;
    // SAFETY: buffer is writable for the requested byte count and the handle is synchronous.
    if unsafe {
        ReadFile(
            handle.raw(),
            buffer.as_mut_ptr().cast(),
            buffer.len() as Dword,
            &mut read,
            null_mut(),
        )
    } == 0
    {
        Err(())
    } else {
        Ok(read as usize)
    }
}

fn write_all_handle(handle: &Handle, mut bytes: &[u8]) -> Result<(), ()> {
    while !bytes.is_empty() {
        let mut written = 0;
        // SAFETY: bytes remains valid for the requested byte count and the handle is synchronous.
        if unsafe {
            WriteFile(
                handle.raw(),
                bytes.as_ptr().cast(),
                bytes.len() as Dword,
                &mut written,
                null_mut(),
            )
        } == 0
            || written == 0
        {
            return Err(());
        }
        bytes = &bytes[written as usize..];
    }
    Ok(())
}

fn hash_handle(handle: &Handle) -> Result<[u8; 32], ()> {
    reset_file(handle)?;
    let mut algorithm = null_mut();
    // SAFETY: output receives a CNG provider handle and both string constants are NUL-terminated.
    if unsafe { BCryptOpenAlgorithmProvider(&mut algorithm, SHA256_ALGORITHM.as_ptr(), null(), 0) }
        != 0
    {
        return Err(());
    }
    let result = hash_with_algorithm(handle, algorithm);
    // SAFETY: algorithm is the provider handle returned by the successful open call.
    if unsafe { BCryptCloseAlgorithmProvider(algorithm, 0) } != 0 {
        return Err(());
    }
    result
}

fn hash_with_algorithm(handle: &Handle, algorithm: RawHandle) -> Result<[u8; 32], ()> {
    let mut object_len = 0u32;
    let mut written = 0u32;
    // SAFETY: output buffer is exactly one DWORD and property name is NUL-terminated.
    if unsafe {
        BCryptGetProperty(
            algorithm,
            OBJECT_LENGTH.as_ptr(),
            (&mut object_len as *mut u32).cast(),
            size_of::<u32>() as Dword,
            &mut written,
            0,
        )
    } != 0
        || written as usize != size_of::<u32>()
        || object_len == 0
    {
        return Err(());
    }
    let mut object = vec![0u8; object_len as usize];
    let mut hash = null_mut();
    // SAFETY: object is writable for object_len bytes and output receives the hash handle.
    if unsafe {
        BCryptCreateHash(
            algorithm,
            &mut hash,
            object.as_mut_ptr(),
            object_len,
            null(),
            0,
            0,
        )
    } != 0
    {
        return Err(());
    }

    let result = (|| {
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let count = read_chunk(handle, &mut buffer)?;
            if count == 0 {
                break;
            }
            // SAFETY: input buffer is live for count bytes and hash is a valid CNG hash handle.
            if unsafe { BCryptHashData(hash, buffer.as_ptr(), count as Dword, 0) } != 0 {
                return Err(());
            }
        }
        let mut digest = [0u8; 32];
        // SAFETY: digest is writable for the SHA-256 output size and hash is valid.
        if unsafe { BCryptFinishHash(hash, digest.as_mut_ptr(), digest.len() as Dword, 0) } != 0 {
            return Err(());
        }
        Ok(digest)
    })();
    // SAFETY: hash is the handle returned by the successful create call.
    if unsafe { BCryptDestroyHash(hash) } != 0 {
        return Err(());
    }
    result
}

fn validate_local_absolute_exe(path: &Path) -> Result<(), ()> {
    let units: Vec<u16> = path.as_os_str().encode_wide().collect();
    if units.len() < 4
        || units.len() >= 32_000
        || units.contains(&0)
        || !is_ascii_letter(units[0])
        || units[1] != b':' as u16
        || !matches!(units[2], 47 | 92)
        || units[3..].contains(&(b':' as u16))
        || units.starts_with(&[92, 92])
    {
        return Err(());
    }
    if path
        .extension()
        .and_then(OsStr::to_str)
        .is_none_or(|ext| !ext.eq_ignore_ascii_case("exe"))
    {
        return Err(());
    }
    validate_local_drive_root(path)
}

fn program_files_x64_path() -> Result<PathBuf, ()> {
    let mut raw_path = null_mut();
    // SAFETY: the known-folder ID is a valid GUID and the output receives
    // CoTaskMem storage owned by this function.
    let result =
        unsafe { SHGetKnownFolderPath(&FOLDERID_PROGRAM_FILES_X64, 0, null_mut(), &mut raw_path) };
    let allocation = CoTaskMemWide(raw_path);
    if result < 0 || allocation.0.is_null() {
        return Err(());
    }
    let raw_path = allocation.0;
    let parsed = (|| {
        let mut length = 0usize;
        // SAFETY: SHGetKnownFolderPath returns a NUL-terminated UTF-16 string.
        while length < 32_768 && unsafe { *raw_path.add(length) } != 0 {
            length += 1;
        }
        if length == 0 || length == 32_768 {
            return Err(());
        }
        // SAFETY: the preceding scan proved that these UTF-16 units precede
        // the terminating NUL in the live CoTaskMem buffer.
        let units = unsafe { std::slice::from_raw_parts(raw_path, length) };
        let path = PathBuf::from(OsString::from_wide(units));
        let path_units: Vec<u16> = path.as_os_str().encode_wide().collect();
        if path_units.len() < 3
            || !is_ascii_letter(path_units[0])
            || path_units[1] != b':' as u16
            || path_units[2] != b'\\' as u16
            || path_units[3..].contains(&(b':' as u16))
        {
            return Err(());
        }
        validate_local_drive_root(&path)?;
        Ok(path)
    })();
    parsed
}

fn validate_immutable_installation_path(
    path: &Path,
    program_files: &Path,
    digest: &[u8; 32],
) -> Result<(), ()> {
    let mut digest_hex = String::with_capacity(64);
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for byte in digest {
        digest_hex.push(HEX[(byte >> 4) as usize] as char);
        digest_hex.push(HEX[(byte & 0x0f) as usize] as char);
    }
    let expected = program_files
        .join("E2SBridge")
        .join("NativeExecution")
        .join("v2")
        .join("Images")
        .join(digest_hex)
        .join("bridge-contained-launcher.exe");
    if paths_equal(path, &expected) {
        Ok(())
    } else {
        Err(())
    }
}

fn validate_local_drive_root(path: &Path) -> Result<(), ()> {
    let units: Vec<u16> = path.as_os_str().encode_wide().collect();
    if units.len() < 3
        || !is_ascii_letter(units[0])
        || units[1] != 58
        || !matches!(units[2], 47 | 92)
    {
        return Err(());
    }
    let root = [units[0], b':' as u16, b'\\' as u16, 0];
    // SAFETY: root is an exact NUL-terminated drive-root string.
    let drive_type = unsafe { GetDriveTypeW(root.as_ptr()) };
    if drive_type == DRIVE_REMOTE || drive_type == DRIVE_UNKNOWN || drive_type == DRIVE_NO_ROOT_DIR
    {
        Err(())
    } else {
        Ok(())
    }
}

fn is_ascii_letter(unit: u16) -> bool {
    (b'A' as u16..=b'Z' as u16).contains(&unit) || (b'a' as u16..=b'z' as u16).contains(&unit)
}

fn temp_directory() -> Result<PathBuf, ()> {
    let mut buffer = vec![0u16; 32_768];
    // SAFETY: output buffer is writable for the supplied element count.
    let length = unsafe { GetTempPathW(buffer.len() as Dword, buffer.as_mut_ptr()) } as usize;
    if length == 0 || length >= buffer.len() {
        return Err(());
    }
    buffer.truncate(length);
    Ok(PathBuf::from(std::ffi::OsString::from_wide(&buffer)))
}

fn system_directory() -> Result<PathBuf, ()> {
    let mut buffer = vec![0u16; 32_768];
    // SAFETY: buffer is writable for the supplied UTF-16 unit count.
    let length =
        unsafe { GetSystemDirectoryW(buffer.as_mut_ptr(), buffer.len() as Dword) } as usize;
    if length == 0 || length >= buffer.len() {
        return Err(());
    }
    buffer.truncate(length);
    Ok(PathBuf::from(OsString::from_wide(&buffer)))
}

pub fn windows_directory() -> Result<PathBuf, ()> {
    let mut buffer = vec![0u16; 32_768];
    // SAFETY: output buffer is writable for the supplied element count.
    let length =
        unsafe { GetWindowsDirectoryW(buffer.as_mut_ptr(), buffer.len() as Dword) } as usize;
    if length == 0 || length >= buffer.len() {
        return Err(());
    }
    buffer.truncate(length);
    Ok(PathBuf::from(std::ffi::OsString::from_wide(&buffer)))
}

fn wide_nul(value: &OsStr) -> Result<Vec<u16>, ()> {
    let mut units: Vec<u16> = value.encode_wide().collect();
    if units.contains(&0) {
        return Err(());
    }
    units.push(0);
    Ok(units)
}

unsafe fn path_is_absent(path: &[u16]) -> bool {
    // SAFETY: caller guarantees path is NUL-terminated and valid for this call.
    if unsafe { GetFileAttributesW(path.as_ptr()) } != INVALID_FILE_ATTRIBUTES {
        return false;
    }
    // SAFETY: this immediately reads the thread-local error from GetFileAttributesW.
    matches!(
        unsafe { GetLastError() },
        ERROR_FILE_NOT_FOUND | ERROR_PATH_NOT_FOUND
    )
}

fn retry_delete(
    path: &[u16],
    operation: unsafe extern "system" fn(*const u16) -> Bool,
) -> Result<(), ()> {
    let started = Instant::now();
    loop {
        // SAFETY: path is NUL-terminated and operation is a matching Win32 path deletion API.
        if unsafe { operation(path.as_ptr()) } != 0 {
            return Ok(());
        }
        // SAFETY: path remains valid and absence is an acceptable cleanup end state.
        if unsafe { path_is_absent(path) } {
            return Ok(());
        }
        if started.elapsed() >= Duration::from_secs(5) {
            return Err(());
        }
        thread::sleep(Duration::from_millis(10));
    }
}

fn constant_time_eq(left: &[u8; 32], right: &[u8; 32]) -> bool {
    left.iter()
        .zip(right)
        .fold(0u8, |difference, (left, right)| difference | (left ^ right))
        == 0
}

#[cfg(test)]
mod module_policy_tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn module_policy_requires_case_normalized_allowlisted_system32_basename() {
        let drive_root = format!("{}:\\", 'C');
        let windows = PathBuf::from(&drive_root).join("Windows");
        let system32 = windows.join("System32");
        let allowed = vec!["kernel32.dll".to_owned(), "ntdll.dll".to_owned()];
        assert!(module_path_permitted(
            &system32,
            &system32.join("kernel32.dll"),
            &allowed
        ));
        assert!(module_path_permitted(
            &system32,
            &system32.join("KERNEL32.dll"),
            &allowed
        ));
        for rejected in [
            windows.join("SysWOW64").join("kernel32.dll"),
            system32.join("user32.dll"),
            PathBuf::from(&drive_root)
                .join("staged")
                .join("kernel32.dll"),
        ] {
            assert!(!module_path_permitted(&system32, &rejected, &allowed));
        }
    }

    #[test]
    fn immutable_installation_path_binds_known_folder_and_flat_launcher_digest() {
        let digest = [0xab; 32];
        let drive_root = |drive| PathBuf::from(format!("{drive}:{}", std::path::MAIN_SEPARATOR));
        let program_files = drive_root('D').join("Relocated Programs");
        let launcher_path = |root: &Path, version: &str, digest_hex: String| {
            root.join("E2SBridge")
                .join("NativeExecution")
                .join(version)
                .join("Images")
                .join(digest_hex)
                .join("bridge-contained-launcher.exe")
        };
        let expected = launcher_path(&program_files, "v2", "ab".repeat(32));
        assert!(validate_immutable_installation_path(&expected, &program_files, &digest).is_ok());
        for rejected in [
            launcher_path(&program_files, "v2", "ac".repeat(32)),
            launcher_path(
                &drive_root('C').join("Program Files"),
                "v2",
                "ab".repeat(32),
            ),
            launcher_path(&program_files, "v1", "ab".repeat(32)),
        ] {
            assert!(
                validate_immutable_installation_path(&rejected, &program_files, &digest).is_err()
            );
        }
    }

    #[test]
    fn program_files_x64_known_folder_is_a_local_absolute_path() {
        let path = program_files_x64_path().unwrap();
        let units: Vec<u16> = path.as_os_str().encode_wide().collect();
        assert!(units.len() >= 3);
        assert!(is_ascii_letter(units[0]));
        assert_eq!(units[1], b':' as u16);
        assert_eq!(units[2], b'\\' as u16);
    }

    #[test]
    fn authority_update_mutex_serializes_floor_change_and_resume() {
        let name = format!(
            "Global\\E2SBridge-NativeExecution-v1-Test-serialize-{}",
            std::process::id()
        );
        let first = acquire_named_mutex(&name, 1_000).unwrap();
        let (attempt_tx, attempt_rx) = mpsc::channel();
        let (timeout_tx, timeout_rx) = mpsc::channel();
        let (acquired_tx, acquired_rx) = mpsc::channel();
        let other_name = name.clone();
        let contender = thread::spawn(move || {
            attempt_tx.send(()).unwrap();
            assert!(acquire_named_mutex(&other_name, 50).is_err());
            timeout_tx.send(()).unwrap();
            let second = acquire_named_mutex(&other_name, 2_000).unwrap();
            acquired_tx.send(()).unwrap();
            second.release().unwrap();
        });

        attempt_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        timeout_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(acquired_rx
            .recv_timeout(Duration::from_millis(100))
            .is_err());
        first.release().unwrap();
        acquired_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        contender.join().unwrap();
    }

    #[test]
    fn authority_update_mutex_rejects_abandoned_ownership() {
        let name = format!(
            "Global\\E2SBridge-NativeExecution-v1-Test-abandon-{}",
            std::process::id()
        );
        let other_name = name.clone();
        thread::spawn(move || {
            let guard = acquire_named_mutex(&other_name, 1_000).unwrap();
            std::mem::forget(guard);
        })
        .join()
        .unwrap();

        assert!(acquire_named_mutex(&name, 1_000).is_err());
        let retry = acquire_named_mutex(&name, 1_000).unwrap();
        retry.release().unwrap();

        let other_name = name.clone();
        let contender = thread::spawn(move || {
            let guard = acquire_named_mutex(&other_name, 1_000).unwrap();
            guard.release().unwrap();
        });
        contender.join().unwrap();
    }

    #[test]
    fn authority_update_mutex_fails_closed_on_invalid_name_and_wrong_thread_release() {
        assert!(acquire_named_mutex("invalid\0name", 1).is_err());

        let name = format!(
            "Global\\E2SBridge-NativeExecution-v1-Test-release-{}",
            std::process::id()
        );
        let (guard_tx, guard_rx) = mpsc::channel();
        let (exit_tx, exit_rx) = mpsc::channel();
        let owner = thread::spawn(move || {
            let guard = acquire_named_mutex(&name, 1_000).unwrap();
            assert!(guard_tx.send(guard).is_ok());
            exit_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        });

        let wrong_thread_guard = guard_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(wrong_thread_guard.release().is_err());
        exit_tx.send(()).unwrap();
        owner.join().unwrap();
    }
}
