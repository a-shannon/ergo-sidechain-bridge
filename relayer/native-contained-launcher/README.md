# Native Contained Launcher

`bridge-contained-launcher.exe` is a Windows-only broker that verifies a local
executable, copies the retained bytes to an isolated staging directory, and
launches that staged executable inside a kill-on-close Job Object.

This helper is part of the **trusted relayer installation boundary**. An
ordinary Node.js hash/spawn/hash check of the helper itself is not an atomic trust bootstrap.
The V2 authority profile instead binds a content-addressed installation image,
its file identity, and the exact policy record while retaining the executing
image handle. This closes the managed-path substitution window within the
declared Windows administrator TCB; it does not make launcher installation a
universal atomic execution primitive.

This crate is strict local implementation work only. Its tests are not bridge
admission, Gate 5, trustless, deployment, or production evidence.

The crate is pinned to Rust 1.82, Cargo 1.82, edition 2021, and the Windows MSVC
target. It uses only `std` and direct Win32/CNG FFI.

## CLI

```text
bridge-contained-launcher.exe
  --target <absolute-local-exe-path>
  --sha256 <lowercase-0x-prefixed-sha256>
  --not-before-unix-ms <non-negative-unix-epoch-ms>
  --expires-at-unix-ms <exclusive-unix-epoch-ms>
  --timeout-ms <1..300000>
  --request-limit <positive-bounded-bytes>
  --stdout-limit <positive-bounded-bytes>
  --stderr-limit <positive-bounded-bytes>
  [--authority-profile-digest <64-lowercase-sha256-hex>
   --authority-policy-digest <64-lowercase-sha256-hex>
   --authority-policy-epoch <positive-u64>
   --authority-record-version <v1|v2>
   --allowed-system-dll <sorted-unique-lowercase-dll-basename> ...]
  -- <child arguments...>
```

The target executable becomes child `argv[0]`; values after `--` become
`argv[1..]`. The broker buffers output until the child tree has exited and
staging cleanup has been verified. Child stderr is always discarded.

The protocol limits are fixed to the bridge's current native surfaces:

- request: at most 32 MiB;
- stdout: at most 16 MiB;
- stderr: at most 64 KiB and never reflected;
- timeout: 1-300,000 ms;
- child arguments: at most 64 and 8 KiB of UTF-8 payload.
- execution starts only while broker system time is in the supplied
  `[not-before, expires-at)` window.

Authority arguments are all-or-none. Generic mode remains available for
non-authoritative fixtures and preserves the existing behavior. Authority mode
requires at least one `--allowed-system-dll`; repeated values must already be
strictly sorted and unique. The authority-record version defaults to V1 when
the version argument is omitted.

Stable nonzero process codes are `20` validation, `21` process creation, `22`
timeout, `23` stdout overflow, `24` stderr overflow, `25` child rejection, and
`26` containment/inspection/cleanup failure, and `27` policy-window rejection.
Every authority-specific argument, registry-floor, PE/import, debugger, module,
or descendant-process rejection uses fixed token `BROKER_AUTHORITY_POLICY` and
exit code `28`. Child stderr remains discarded and is never reflected.
Error text is a fixed broker token and never contains child diagnostics.

## Boundary

This implementation closes target-EXE pathname replacement within the declared
same-token relayer TCB. It hashes a retained source handle, creates the random
stage and file relative to retained directory handles, uses the final
volume-GUID paths for launch, retains every namespace ancestor without delete
sharing, and rechecks path/file identity immediately before `CreateProcessW`.
The stage directory and file are created with protected DACLs limited to the
object owner, SYSTEM, and Administrators. Staged identity, size, and digest are
rechecked before execution.

Authority mode additionally:

- in V1 compatibility mode, reads one exact 80-byte `REG_BINARY`
  `AuthorityRecordV1` from the 64-bit HKLM key
  `SOFTWARE\E2SBridge\NativeExecution\v1\Profiles\<profileDigest>`. The record
  binds the `E2SAUTH1` format tag, profile digest, policy SHA-256, and
  little-endian minimum policy epoch. It rejects a missing, malformed,
  mismatched, zero, or rollback record before staging, then validates the
  complete record again under the V1 installer mutex and releases that mutex
  after `ResumeThread`;
- in V2 mode, opens and retains its own content-addressed installation image,
  requires the exact canonical V2 digest path, one hard link, and no pending
  deletion, then binds its SHA-256, size, volume serial, and 128-bit file ID to
  the exact 144-byte `AuthorityRecordV2`. It validates the complete record
  before and after acquiring the V2 installer mutex, and holds both the image
  handle and mutex through child exit, staging cleanup, and the complete
  buffered stdout write and flush;
- parses the retained target bytes as PE32+ AMD64, rejects overlapping or
  out-of-range headers/sections/RVAs, requires every case-normalized direct
  import to be present in the sorted runtime DLL allowlist, and rejects any
  non-empty delay-import descriptor set; the allowlist may additionally name transitive
  System32 modules observed by the loader;
- creates the suspended target with `DEBUG_ONLY_THIS_PROCESS`, observes loader
  debug events through the initial loader breakpoint and root exit, and permits
  only case-normalized allowlisted DLL basenames whose opened file handle resolves directly under canonical
  `SystemRoot\System32`;
- sets the Job Object's kernel-enforced active-process limit to one, retaining
  process-count polling as defense in depth;
- terminates the job while a rejected loader event remains stopped, then
  continues only for teardown; debugger failure and any descendant attempt also
  fail closed, and buffered stdout is released only after clean process exit.

## Installation profiles

`scripts\install.ps1` defaults to the immutable V2 installation profile. V2 is
separate from V1: it does not reinterpret, migrate, or replace
`AuthorityRecordV1`. The broker consumes `AuthorityRecordV2` only when the
caller explicitly selects authority-record version `v2`.

### Immutable V2 installation profile (default; activation campaign pending)

V2 requires a 64-bit PowerShell host, resolves the 64-bit Program Files known
folder, and installs the exact reviewed launcher at the content-addressed path:

```text
Program Files\E2SBridge\NativeExecution\v2\Images\
  <lowercase-flat-launcher-sha256>\bridge-contained-launcher.exe
```

The installer uses a distinct
`Global\E2SBridge-NativeExecution-v2-Installer` mutex. It creates a random
sibling staging directory below `Images`, copies and hashes the launcher,
flushes the file, applies a protected DACL and SYSTEM ownership, and renames the
directory to the digest path without replacement. SYSTEM and Administrators
receive full control; Users receive read and execute access only. Managed V2
directories, V2 registry keys, and the launcher use protected ACLs with SYSTEM
ownership; Users receive registry read access only. Managed filesystem paths
must not be reparse points. The final launcher must have exactly one hard link
and must not be delete-pending.

An existing digest directory is never overwritten or repaired. The installer
accepts it only after checking its owner, protected DACL, hash, size, volume
serial, 128-bit file ID, link count, delete-pending state, and non-reparse
namespace. A failed check aborts installation.

Only after the immutable image passes all checks does the installer write and
flush one exact 144-byte `REG_BINARY` `AuthorityRecordV2` under the 64-bit HKLM
key `SOFTWARE\E2SBridge\NativeExecution\v2\Profiles\<profileDigest>`:

```text
E2SAUTH2                    8 bytes
profile digest             32 bytes
policy digest              32 bytes
launcher SHA-256           32 bytes
launcher size LE u64        8 bytes
volume serial LE u64        8 bytes
file ID                    16 bytes
minimum policy epoch LE u64 8 bytes
```

V2 rejects epoch rollback, a same-epoch policy change, a same-epoch launcher
change, ambiguous registry values, and any mismatch between an existing record
and the immutable image. A crash before the record flush leaves an inert image;
updates create a new digest directory instead of mutating an existing image.

The broker resolves `FOLDERID_ProgramFilesX64` independently, compares the final
path of its retained executable handle with that exact known-folder path, and
revalidates the image and record. The bounded WP-06 caller requires the
canonical digest-addressed V2 suffix; it cannot override the broker's
known-folder decision. The broker explicitly flushes buffered stdout before
releasing the V2 rotation mutex. Abandoned ownership is released before the
installer or broker rejects the inconsistent predecessor state. Output remains
quarantined and is not bridge admission or funds authority. Operational
acceptance remains blocked until an elevated disposable-host campaign covers
ACL enforcement, replacement and hard-link rejection, V1-to-V2 coexistence,
every installer crash point, concurrent rotation, race attempts, and
abandoned-mutex behavior. This local implementation does not close Gate 5.

The same script exposes an elevated, read-only inspection mode that reuses the
installer's exact known-folder, ACL, reparse, digest, size, file-identity,
hard-link, delete-pending, registry-ACL and `AuthorityRecordV2` checks while
holding the V2 installer mutex:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\install.ps1 `
  -InspectOnly -AsJson `
  -BrokerPath <reviewed-bridge-contained-launcher.exe> `
  -BrokerSha256 <64-lowercase-hex> `
  -ProfileDigest <64-lowercase-hex> `
  -PolicyDigestSha256 <64-lowercase-hex> `
  -MinimumPolicyEpoch <positive-u64>
```

Inspection opens the managed filesystem and 64-bit HKLM keys without creating,
repairing, replacing or writing them. A successful result establishes that the
installed broker image and exact V2 authority record agree at inspection time
within the declared administrator/kernel TCB. It does not execute the broker or
target, complete the activation campaign, authenticate proof output, grant
funds authority, or close Gate 5.
`LauncherInstallationActivationCampaignCompleted` remains false until the
separately reviewed disposable-host campaign exists.

The relayer's bridge-config-free
`peg-in:causal-f2d:campaign -- --mode describe` command can derive the exact
role-distinct `BrokerPath`, `BrokerSha256`, `ProfileDigest`,
`PolicyDigestSha256` and `MinimumPolicyEpoch` arguments consumed by this
profile for the F1 verifier and F2b result producer. In that V1 declaration,
`BrokerPath` is the immutable installed launcher path required by execution; it
must not be passed to a fresh installation as though it were the source image.
The separate `peg-in:causal-f2e:handoff -- --mode host-preflight` command binds
the reviewed source image for installation and the managed installed image for
inspection, verifies the shared launcher digest, and emits separate structured
parameter objects. The canonical installer must match its tracked HEAD bytes
when the handoff is created and must be rehashed before elevation. Neither
command invokes this installer or inspector, installs
either profile, authenticates an execution, or completes the activation
campaign. Execute mode remains blocked until the reviewed V2 records exist on
an approved isolated host, and its dual-origin report still cannot change
`LauncherInstallationActivationCampaignCompleted`.

### V1 compatibility profile (explicit)

Pass `-UseV1CompatibilityProfile` to preserve the current authority-mode
installation under `Program Files\E2SBridge\NativeExecution\v1`. V1 retains
its existing mutable fixed launcher path, exact 80-byte `AuthorityRecordV1`,
64-bit HKLM v1 profile key, and
`Global\E2SBridge-NativeExecution-v1-Installer` serialization boundary. Its
abandoned-owner path now releases ownership before fail-closed rejection; its
record bytes, authority ordering, and execution behavior remain unchanged. The installer
verifies the reviewed broker and policy digests, refuses epoch decreases and
same-epoch policy changes, and writes and flushes the V1 authority record before
broker replacement. These compatibility bytes and ordering are unchanged.

An installation created by an older V1 installer without `AuthorityRecordV1`
is rejected until explicitly migrated with both
`-UseV1CompatibilityProfile` and `-MigrateLegacyEpochOnlyRecord`. Migration
removes and flushes the legacy epoch-only value before writing the V1 record,
so interruption cannot leave the old broker authorized. The broker uses the
same V1 mutex for its final complete record read/resume critical section;
inaccessible, contended, or abandoned mutex access fails closed on both broker
and installer paths.

Repository tests cover V1/V2 parsing, exact record bindings, compatibility
ordering, V2 publication-before-record ordering, and path rejection. They do
not execute the elevated installation campaign. Before accepting any V1
authority profile operationally, a disposable-host campaign must inject
interruption after legacy deletion, record flush, broker copy, and
pre-replacement staging, then confirm every residual state rejects stale
policy/broker combinations. V2 requires the separate campaign described above.

The broker does not validate the signed policy object, recompute a policy
digest from policy contents, authenticate system time, or validate a complete
sidecar bundle. The TypeScript caller owns signed-policy validation. Both
profiles require the supplied policy digest to equal the installer-owned
record and separately enforce the supplied interval, profile rollback floor,
image/import shape, and observed module policy. V2 additionally proves only
that the running broker matches the installed image identity in its exact
record; it does not authenticate the native target's output or promote that
output into bridge admission.

Loaded-module enforcement is observation-based, not a cryptographic exclusion
proof. It assumes Windows loader debug events are complete for normal root
process image loads, API-set contracts forward only to physical modules whose
loader events are checked, and the installed/serviced System32 directory is a
trusted OS boundary. Administrator or kernel compromise can replace or inject
code, and manual mapping or executable memory that does not produce a loader
event is outside this observer. Authority mode rejects ordinary child processes
instead of claiming their modules were observed. The staged process retains the
broker's user token and is not an AppContainer or separate security principal.
The global update mutex is a safety serialization primitive, not a liveness or
denial-of-service boundary; a principal able to hold it can block new authority
launches until the broker timeout.
These boundaries must remain explicit in any bridge-admission or readiness
claim.

## Local verification

```powershell
cargo fmt --check
cargo test --all-targets
```

From `relayer/`, run the focused native check or the complete Windows aggregate:

```powershell
npm run native:contained:check
npm run check:windows
```
