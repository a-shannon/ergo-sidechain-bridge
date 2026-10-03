# Local Native FED Two-Cycle Campaign

This campaign exercises two deposit-to-payout cycles on the same fresh local
Ergo and Frontier chains. It creates disposable signing custody, consumes the
first cycle's successors in the second cycle, and closes the owned processes
before reporting success. Funds are synthetic. The profile is explicitly
federated and does not depend on EIP-0045.

The command is a local lifecycle experiment. It does not establish public-network
compatibility, independent operator custody, recovery readiness or a supported
release. The [execution plan](../phases/bridge-execution-plan.md) tracks those
separate obligations.

## Prerequisites

Use the selected Windows x64 environment and a clean checkout of the exact
commit being tested. Install the relayer dependencies from its locked package
set and prepare the source checkouts, toolchains and dependency caches required
by the existing builders. The campaign does not install missing prerequisites.

Install the relayer dependencies with `npm ci` in this exact checkout and keep
the pinned Rust dependencies available locally. Before creating an attempt, the
two-cycle runner rebuilds the WASM AVL package from the clean checkout. The
reviewed build-tool hashes currently cover Windows x64 only: wasm-pack 0.14.0,
wasm-bindgen 0.2.120, and the Rust 1.97.1 `rustc` and Cargo executables. The
generator must match the version in `wasm-avl/Cargo.lock`, and the builder
checks all four executable hashes and versions around the build. The hosted
Windows workflow also checks the official generator release archive before
extracting it; a local build verifies the selected executable's version and
hash, but does not attest its download archive. Other host architectures have
no reviewed build-tool pins yet.

The build uses the crate's release profile and disables a separate `wasm-opt`
pass. `wasm-pack` runs with `--mode no-install`, Cargo runs offline, and rustup
automatic toolchain installation is disabled. A missing generator or dependency
therefore fails the preflight instead of installing it during the build. The
Windows CI provisions the pinned generator and runs `cargo fetch --locked`
before invoking that offline build. These controls constrain the reviewed tool
and Cargo dependency paths; they are not a general network sandbox for arbitrary
compiler or build-script subprocesses. The build writes ignored runtime files
under `wasm-avl/pkg/`; do not copy them from another checkout.

The runner fingerprints every crate input, checks the exact generated file set,
and matches all `#[wasm_bindgen]` functions across the Rust source, TypeScript
declarations, JavaScript bindings and WASM exports. It also requires the
production bridge AVL functions used by the tracker and duplicate-prevention
consumers. The attempt retains the crate and package digests plus the exact
wasm-pack, wasm-bindgen, rustc and Cargo executable hashes. The worker verifies
the reviewed tool pins before loading the root, then checks source and package
digests before root execution, after loading it and after root cleanup; the
parent rechecks the evidence and bytes before publishing success. These checks
do not change the existing terminal receipt schema or digest domains. A
preflight build or ABI failure creates no attempt. A mismatch after the start
marker follows the existing consumed-attempt and no-retry rules.

`npm run wasm:build` remains available for a local build or inspection, but the
runner always rebuilds the package for its own exact invocation.

The committed locks define the expected identities:

- `sources/authenticated-v2-compiler-lock.json`: Node 24.14.0, pinned Git and
  the authenticated compiler's project and historical consensus binding.
- `sources/authenticated-v2-runtime-bundle-build-lock-v2.json`: the current
  package-lock and three installed TSX/esbuild package directories. The campaign
  consumes these loader pins with the compiler's Node 24.14.0 host; the separate
  bundle-build command still requires this lock's Node 24.18.1 host.
- `sources/substrate-federated-tracker-compiler-lock-v1.json`: the FED JVM
  compiler, dependencies and Node 24.14.0 host used by genesis materialization.
- `sources/native-verifier-toolchain-lock.json`: the native Rust and Git tools.
- `sources/substrate-federated-authority-safe-devnet-protoc-lock-v1.json`:
  the native build's protobuf compiler.
- `sources/substrate-federated-isolated-devnet-node-build-lock-v1.json`:
  the Ergo build's Java, SBT, source and process-containment inputs.
- `sources/consensus-source-lock.json`: the selected consensus sources.

Use the existing source/build validators rather than substituting a downloaded
node binary. Dependency caches and the exclusive same-user host remain trusted
inputs; this run is not an independent build attestation.

Prepare the FED compiler's locked runtime before invoking the campaign. Use
`npm run compiler:runtime-bundle` under its separately pinned Node 24.18.1 host,
or provide an immutable dependency cache matching every committed FED pin.
The native parent runs under Node 24.14.0 and does not invoke the bundle
producer. Its admission checks the actual compiler runtime in that checkout:
all 30 dependency JAR hashes and the aggregate classpath, compiler source,
parent Node/environment, and the complete Java home derived from the configured
Java executable. It checks again after the WASM build and in the worker.
A missing or altered runtime rejects before the initial WASM build or attempt
creation. Ordinary compiler execution retains its own runtime and snapshot
checks; admission does not create a compiler receipt or execution authority.

On Windows, launch from an x64 Visual Studio Developer PowerShell. The parent
rejects missing `LIB`, `LIBPATH`, `INCLUDE`, or a regular `link.exe` on `PATH`
before creating the attempt; the worker rechecks the same host prerequisites.
This is a discovery check for the native build, not an MSVC version pin or a
complete toolchain attestation. The selected host must still pass the actual
source-locked build. A failed preflight before attempt creation may be corrected
with a new shell; an existing attempt must never be resumed or retried.

The selected Ergo source must have no matching assembly under the build lock's
output directory and no pre-existing isolated SBT state directory. The parent
checks this after the normal environment and source-tool identity validation,
before it creates the attempt directory. A failure at this point consumes no
attempt, claims no worker and creates no campaign custody. Remove or replace
stale build state through the separately reviewed source-preparation process;
do not point the campaign at an old assembly or SBT workspace.

The parent checks its loaded Node/TSX identity before launching the worker. That
check cannot precede the parent's own initial TSX loading. The worker is launched
with the verified runtime and rechecks the captured inputs before calling the
root. Environment overrides that change the runtime are rejected.

## Configuration

Create a JSON file outside the checkout and outside the new attempt directory.
Use these exact keys; replace each bracketed value with the selected local
value. Paths must be absolute canonical local paths, with no symbolic links,
junctions or device/UNC aliases.

```json
{
  "schema": "e2s.substrate-federated-native-two-cycle-invocation.v1",
  "version": 1,
  "profile": "synthetic-loopback-two-cycle",
  "expectedBridgeCommit": "<40-character lowercase commit hash>",
  "bridgeRoot": "<bridge checkout>",
  "frontierSourcePath": "<Frontier source checkout>",
  "frontierBuildParentDirectory": "<existing native build parent>",
  "frontierCargoHomeDirectory": "<prepared Cargo home>",
  "frontierCargoExecutablePath": "<pinned cargo executable>",
  "frontierRustcExecutablePath": "<pinned rustc executable>",
  "frontierGitExecutablePath": "<pinned Git executable>",
  "frontierProtocExecutablePath": "<pinned protoc executable>",
  "ergoSourcePath": "<Ergo source checkout>",
  "ergoGitExecutablePath": "<pinned Git executable>",
  "ergoJavaExecutablePath": "<pinned Java executable>",
  "ergoSbtLauncherJarPath": "<pinned SBT launcher JAR>",
  "outputParentDirectory": "<existing campaign output parent>",
  "attemptName": "two-cycle-001"
}
```

The expected commit must contain the invocation being used and match the clean
checkout at execution time. Keep outputs, builds, source checkouts and caches
separate. The same pinned Git executable may serve both builders. The Ergo
builder's worktree root is derived from the bridge checkout layout.

On Windows, use a shallow existing absolute directory for
`frontierBuildParentDirectory`; the Frontier builder creates nested source,
target, temporary and WASM paths beneath it. Keep `outputParentDirectory`
separate for attempt files, with both roots canonical, alias-free and disjoint
from the checkout, source, cache and tool roots and from each other.

There are no caller-supplied keys, node endpoints, quorum settings, amounts,
runtime hashes, retry or resume options. Do not add wallet material or secrets
to the configuration.

## Run Once

From `relayer/`, with the pinned Node available to the command:

```powershell
npm run federated:native:two-cycle -- --config <absolute-config-path>
```

The parent creates a new attempt directory under `outputParentDirectory`,
captures the configuration, writes `start.json`, and launches the contained
worker. Existing attempts are refused. The worker calls the native root once.
Both external miner-fee inputs must be confirmed before each corresponding
checkpoint anchor is frozen.

Build-output freshness is an admission prerequisite only. The identity checks
after worker success or failure still accept the build outputs created by that
worker; they verify repository and tool identity and do not demand an empty
output directory after execution.

## Interpret The Result

Only the parent's terminal artifact determines the invocation outcome:

| Artifact | Meaning |
|---|---|
| `result.json` | Both cycles completed, the worker exited successfully, cleanup finished and the final identity checks passed. |
| `failure.json` | The invocation failed. Read its bounded failure classification and preserve the attempt. A containment timeout does not establish clean root cleanup. |
| `start.json` without a terminal artifact | The attempt is incomplete or ambiguous. It is not safe to resume or retry it. |
| Attempt directory without a valid `start.json` | Preparation failed before worker launch. The occupied attempt remains consumed and must not be reused. |
| `worker-start.json` | The worker entry is consumed, including when its environment check fails. It cannot be called again for this attempt. |
| `worker-result.json` | Internal transport from the worker; it is not the parent's completion result. |
| `worker-failure.json` | Optional bounded diagnostic written after the worker claim. It identifies the last execution stage and, when available, an existing allowlisted source failure phase. It is not a terminal result or cleanup evidence. |
| `failure-diagnostic.json` | Optional parent sidecar published only after `failure.json`, binding that receipt to a validated worker diagnostic with matching config, commit and path identities. It grants no execution or retry authority. |
| `worker-root-phase.json` | Optional root-only phase signal from a failed worker. It names a primary phase when known and counts bounded cleanup `Error` values. It carries no cause, path or cleanup claim. |
| `failure-root-phase.json` | Optional parent sidecar after `failure.json`. It binds the terminal failure and both validated worker diagnostics to the same invocation identities. It is not an outcome or admission receipt. |
| `worker-root-phase-v2.json` | Optional V2 root sidecar. It preserves the V1 root phase and adds an allowlisted Ergo node startup phase only when the primary phase is `node-start`; config, commit and path identities remain bound. |
| `failure-root-phase-v2.json` | Optional parent V2 sidecar. It binds the terminal failure, V1 worker failure and V2 worker root receipts to the same invocation. |
| `worker-cycle-step.json` | Optional invocation-local operation within a failed cycle, bound to the worker failure and V2 root phase. |
| `failure-cycle-step.json` | Optional parent sidecar linking that operation to the exact terminal failure and worker ancestry. |
| `worker-setup-stage.json` | Optional native setup operation label, available only for `cycle-1/setup-check` with valid worker failure, V2 root phase and cycle-step ancestry. |
| `failure-setup-stage.json` | Optional parent sidecar binding the setup label and every worker ancestor to the same terminal failure, config, commit and path identities. |

The diagnostic stages are `pre-root`, `root-or-cleanup`, `projection`,
`post-root-identity` and `transport-publication`. A root exception and a cleanup
exception share one stage because neither alone establishes successful teardown.
Diagnostics never include the raw error, stack, filesystem paths or custody
material. Their cleanup-established flag remains false for every stage. The
root-phase companion distinguishes setup/custody, Frontier build, Ergo build,
node start, either cycle, the interval between cycles and cleanup. The V2
sidecars add one existing allowlisted Ergo startup operation label to
`node-start`; an absent, conflicting or invalid label remains null. They use
their own schemas and digest domains and do not change the V1 sidecars or
terminal failure receipt. A null primary phase means the root evidence cannot
assign one; a cleanup exception count, including zero, never proves disposal.
A primitive value thrown during cleanup is not included in this count; a
cleanup-only primitive may have no root-phase companion. A missing or invalid
companion does not change the terminal result or permit another attempt.

The setup-stage companion narrows a future native setup failure to retained
session or compiler validation, request construction, observation, signing,
an individual node check or receipt promotion. It tags the original error in
the active operation. Unknown or conflicting detail, borrowed cycle metadata,
and stage detail below a cleanup-tagged aggregate are rejected. The label
identifies the failing section; it does not explain the raw cause or establish
that an operation completed, cleanup succeeded or custody was destroyed.
For a newly produced cycle-step companion, `tracker-context` means the V2
context constructor did not complete. `tracker-context-custody` means that
constructor returned and the immediately following retained-custody check
failed. Older receipts with `tracker-context`, including C39, cover both
operations and cannot be retroactively narrowed. Neither label establishes
tracker transaction construction, root cleanup or custody disposal.
Missing or invalid ancestry prevents the companion from being published.
Existing terminal, root-phase and cycle-step formats and digest domains are
unchanged. These optional files grant no signing, submission or retry authority.

The diagnostics use separate schemas and digest domains; the existing terminal
failure format and digest are unchanged. Missing, invalid or unwritable
diagnostics leave the original failure and consumed attempt intact. A worker
failure or root-phase file, including either V2 root sidecar, accompanying an
otherwise successful worker result blocks terminal success. A digest detects
changed bytes under the declared same-user host assumption; it is not
authentication or independent attestation.

A receipt contains transaction identities and bounded observations, not signing
or replay authority. Keep the attempt directory and retained build/journal
artifacts outside Git. Never reuse disposed custody or reconstruct authorization
from these files. Before a distinct fresh experiment, complete a bounded
diagnosis and verify the new experiment's admission conditions. If the previous
cause cannot be recovered safely, retain it as unknown and carry that uncertainty
into the separately reviewed fresh evidence contract. Check for remaining owned
processes and listeners without treating their absence as custody-disposal proof.

The campaign does not implement restart, database-loss or reorg recovery. Those
cases must be exercised separately against accumulated state before the wider
FED delivery can be considered complete.

## Observed campaign status

Campaign 24 invoked this command at
`5b901fdd7a8f64a4420a7847ecf6f5235f4abeb5` after clean-candidate environment
admission passed. It produced `two_cycle_invocation_failed` with failure class
`execution_failure` and a passing post-failure identity check. The terminal
receipt digest is
`a7bcbcb1ac14ac3e351dbee2c95f291524be454bab91716ea54684c0136e40d6`.
No successful two-cycle result was produced. The bounded receipt intentionally
omits the raw cause and does not establish root cleanup or custody disposal.
Source review established that the historical worker flattened post-claim
exceptions into one generic process failure, losing the deciding phase. The
cause therefore remains unknown. The new diagnostic addresses that information
loss for future attempts; it does not identify or repair Campaign 24's cause.
Its retained attempt must never be resumed or retried.

Campaign 25 was admitted separately and terminated with process exit code 1.
Its public terminal classified the result as `execution_failure`; the
post-failure identity check passed. The optional diagnostic remained at
`root-or-cleanup` with no allowlisted source failure phase, and cleanup was not
established. The attempt is consumed. Do not retry it or inspect private
attempt files.

A later check found that the currently selected Ergo source did not satisfy the
official build-output readiness guard because matching assembly output and
isolated SBT state were already present. Future invocations now reject either
condition before creating an attempt. This finding does not establish the
historical cause of Campaign 25's failure, and the standalone native
compiler/link and exact-genesis builder probes do not change that conclusion.

Campaign 26 used the exact candidate whose three hosted checks passed in
[run 36302008595](https://github.com/a-shannon/ergo-sidechain-bridge/actions/runs/36302008595).
It passed separate fresh admission and failed once at `root-or-cleanup` with
`execution_failure`. Its bounded diagnostic reported no source failure phase;
the post-failure identity check passed, but root cleanup and custody disposal
remain unestablished. The attempt is consumed. Separate fresh Ergo assembly
and root-prefix Frontier build probes passed without nodes or a campaign;
neither identifies Campaign 26's cause. A later candidate must pass its own
review, exact-head checks and fresh admission before any new attempt.

Campaign 27 used exact head `2a6f127385c87db8251c1b7a3f67a78685b2f3ba`
after all three hosted jobs passed in
[run 36317771092](https://github.com/a-shannon/ergo-sidechain-bridge/actions/runs/36317771092)
and a separate reviewed preflight. It failed once with `execution_failure`;
the new bounded root-phase companion identifies `frontier-build`. Its attempt
is consumed and root cleanup remains unestablished. A separate fresh build-only
probe reproduced a Cargo subprocess failure without the Visual Studio linker
environment; the same locked builder completed in a new build root from x64
Developer PowerShell. These probes establish a missing host admission condition,
not the private raw cause or cleanup state of Campaign 27.
