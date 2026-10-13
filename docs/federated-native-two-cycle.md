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

The optional Boolean `captureCommittedReserveConfirmationProgress` defaults to
disabled. Set it to `true` in a separately admitted fresh configuration to
capture both nodes' index heights and transaction-specific pool observations
during genesis and continuation reserve confirmation. The helper derives the
transaction ID from its own reserve packet. The option is bound to the exact
configuration hash; omission and explicit `false` preserve the default root
input. Other values are rejected.

Capture adds four HTTP reads per matching observation, each with a two-second
timeout, alongside the required transaction reads. All optional reads drain before the
observer returns. The existing 50-second observation envelope and confirmation
deadlines remain unchanged, but fast observations can become slower, reducing
the number of polls and potentially changing the deadline category.

The optional Boolean `captureCopiedErgoRecoverySelection` defaults to disabled.
When `true`, a genuine successful in-memory root return supplies a bounded
public selection for later copied-Ergo observation. The option is bound to the
configuration hash. Omission and explicit `false` preserve the root input and
legacy result format; other values reject before an attempt is created.
This option neither starts recovery nor changes lifecycle predicates.

On Windows, use a shallow existing absolute directory for
`frontierBuildParentDirectory`; the Frontier builder creates nested source,
target, temporary and WASM paths beneath it. Keep `outputParentDirectory`
separate for attempt files, with both roots canonical, alias-free and disjoint
from the checkout, source, cache and tool roots and from each other.

There are no caller-supplied keys, node endpoints, quorum settings, amounts,
runtime hashes, retry or resume options. Do not add wallet material or secrets
to the configuration.

## Check Prerequisites Without Starting A Campaign

Complete the dependency, compiler-runtime and tool/cache preparation above,
then follow the [fresh source-checkout recipe](consensus-source-baseline.md#fresh-checkout)
for the exact base commits and locked patches. Use the configured absolute
source paths. Keep the Frontier checkout LF-only with just patch 0001 applied;
apply the cumulative Ergo patch to its pinned base. Apply both patches plainly
to the working tree, without `--index` or staging: the source validator requires
an empty index diff and the declared unstaged modified/added files.

The [FED build owner](federated-genesis-runtime.md#fresh-federation-build)
constructs the configured Frontier tree with overlays 0004, 0005 and 0006 in
its own separate index and fresh export. Do not apply those overlays to
`frontierSourcePath` or substitute an earlier build export for that checkout.

From `relayer/`, use the pinned Node 24.14.0 and Visual Studio shell described
above. First validate both configured source checkouts:

```powershell
npm run sources:verify -- --frontier-byte-policy raw --frontier-source <absolute-frontier-source-path> --ergo-source <absolute-ergo-source-path>
```

Require exit code zero and the Markdown report's `Result` to be `PASS`, with no
`Blockers` section. All six check rows must say `yes`: source lock bindings,
Solidity build closure artifacts, Frontier checkout required and validated,
and Ergo checkout required and validated. These rows correspond to strict true
checks; no blockers means the underlying errors list is empty. Lock-only or
Ergo-only validation cannot replace this step. The explicit `raw` policy
applies to Frontier only; Ergo retains the canonical validator's controlled
line-ending policy. Omitting the option uses the compatibility policy and does
not establish raw Frontier equality.

Then check the same invocation configuration:

```powershell
npm run --silent federated:native:two-cycle:preflight -- --config <absolute-config-path>
```

This command loads the exact configuration, checks the clean expected checkout,
parent runtime, compiler/JVM dependencies, native tools and build-host discovery,
then applies the existing Ergo build-output freshness check. It can run bounded
tool identity probes. It stops before the WASM build, attempt creation, worker,
node startup, custody or signing. It neither submits a transaction nor reserves
the configured attempt name.

A passing JSON report has `status: "local-preflight-passed"` and all fourteen
of these fields set to Boolean `false`: `executionAuthorized`,
`campaignStarted`, `wasmBuildStarted`, `attemptDirectoryCreated`, `nodeStarted`,
`custodyEstablished`, `signingAuthorized`, `transportStarted`,
`fullErgoBaselineEstablished`, `emptyFrontierOutputEstablished`,
`processPortsValidated`, `custodyAndFeesReady`, `finalShellReady` and
`admissionReviewed`.
It describes only the checks completed by this command. It is not a start,
terminal or admission receipt, and later execution repeats its own checks.
Full source-baseline validation, process/port exclusivity, available space,
fresh custody and confirmed fee inputs still need their respective admission
checks. Cache content and independent operator custody are not attested here.
Correct a failed prerequisite before selecting a fresh invocation; preserve any
already occupied, consumed or ambiguous attempt. Stop preparation here. Running
the campaign requires separate selection and admission against the exact inputs;
neither report authorizes dispatch or reuse of earlier builds or custody.

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

For each deposit, the original owned primary process first holds mining and
the relayer joins both nodes' exact indexed held tip. Funding and packet heights
are captured against that tip. The already authorized source-lock, reserve and
two external-fee submissions each arm a separate permit after their existing
checked authorization and before the transaction POST. Each permit binds the
exact transaction and held parent, allows its inclusion plus ten successors,
then holds again. This is eleven block applications for indexed depth ten.
The existing confirmation check and fresh exact held-index completion must
both finish within the original confirmation deadline before the next Arm.
During that indexed join, independently sampled header, full-block and index
heights can lag one another. A well-formed sample below the held watermark
remains pending within the original deadline. No sample may exceed the held
height, report an index beyond its own full height, or name a different header
at the held height. Both nodes must reach the exact held header and fully
indexed height, pass canonical-height lookups and remain exact across the
stability observation before the join completes. Regression after that first
exact observation refuses the operation.
The original process, target and custody guards remain active across every
awaited operation. A failed or ambiguous operation never permits resubmission.

Before attesting either checkpoint, the original owned mining target requests
its one-way submission pause. The node drains the exact pending submitted
header before acknowledging the pause; an acknowledgment alone does not prove
that the indexes are current. The relayer requires both indexes to reach one
common tip with the acknowledged watermark in their canonical ancestry. It
then reobserves the reserve and both distinct external fee transactions at that
tip, preserving their exact confirmation heights and header IDs, and rechecks
the same snapshot and watermark before attestation. The original target and
callback must remain active through these operations.

For the resulting fixed validity window `[V, E)`, subsequent checkpoint mining
receives an immutable maximum submitted-block height of `E - 2`. A required
minimum height beyond that ceiling is refused before credential consumption.
The source control checks the completed block selected from the current or
previous cached candidate before submitting its sections. Later indexed
snapshots must also respect the ceiling. The separately authorized tracker
transport retains its exact required-transaction gate; it does not resume the
paused process or inherit authority from a pause receipt.

Build-output freshness is an admission prerequisite only. The identity checks
after worker success or failure still accept the build outputs created by that
worker; they verify repository and tool identity and do not demand an empty
output directory after execution.

## Interpret The Result

Only the parent's terminal artifact determines the invocation outcome:

| Artifact | Meaning |
|---|---|
| `result.json` | Both cycles completed, the worker exited successfully, cleanup finished, the recovery manifest was located and hash-checked, and the final identity checks passed. It remains the final success marker. |
| `failure.json` | The invocation failed. Read its bounded failure classification and preserve the attempt. A containment timeout does not establish clean root cleanup. |
| `start.json` without a terminal artifact | The attempt is incomplete or ambiguous. It is not safe to resume or retry it. |
| Attempt directory without a valid `start.json` | Preparation failed before worker launch. The occupied attempt remains consumed and must not be reused. |
| `worker-start.json` | The worker entry is consumed, including when its environment check fails. It cannot be called again for this attempt. |
| `worker-result.json` | Internal transport from the worker; it is not the parent's completion result. |
| `worker-recovery-locator-v1.json` | Create-only worker success companion binding the relative builder/capture names and manifest hash to the invocation and unchanged V1 root-result digest. It is not a terminal result. |
| `recovery-locator-v1.json` | Parent success companion binding the validated worker locator to the terminal digest. Combine its generated names with the captured invocation's Frontier build parent to find the private manifest; the parent checks its file identity and SHA-256 before writing `result.json`. The locator does not prove database consistency or restart. |
| `worker-failure.json` | Optional bounded diagnostic written after the worker claim. It identifies the last execution stage and, when available, an existing allowlisted source failure phase. It is not a terminal result or cleanup evidence. |
| `failure-diagnostic.json` | Optional parent sidecar published only after `failure.json`, binding that receipt to a validated worker diagnostic with matching config, commit and path identities. It grants no execution or retry authority. |
| `worker-root-phase.json` | Optional root-only phase signal from a failed worker. It names a primary phase when known and counts bounded cleanup `Error` values. It carries no cause, path or cleanup claim. |
| `failure-root-phase.json` | Optional parent sidecar after `failure.json`. It binds the terminal failure and both validated worker diagnostics to the same invocation identities. It is not an outcome or admission receipt. |
| `worker-root-phase-v2.json` | Optional V2 root sidecar. It preserves the V1 root phase and adds an allowlisted Ergo node startup phase only when the primary phase is `node-start`; config, commit and path identities remain bound. |
| `failure-root-phase-v2.json` | Optional parent V2 sidecar. It binds the terminal failure, V1 worker failure and V2 worker root receipts to the same invocation. |
| `worker-cycle-step.json` | Optional invocation-local operation within a failed cycle, bound to the worker failure and V2 root phase. |
| `failure-cycle-step.json` | Optional parent sidecar linking that operation to the exact terminal failure and worker ancestry. |
| `worker-tracker-context.json` | Optional V2 context-construction phase for either cycle, bound to the worker failure, V2 root phase and cycle-step ancestry. |
| `failure-tracker-context.json` | Optional parent sidecar binding the constructor phase, exact worker ancestry and validated parent cycle-step receipt to the terminal failure. |
| `worker-setup-stage.json` | Optional native setup operation label, available only for `cycle-1/setup-check` with valid worker failure, V2 root phase and cycle-step ancestry. |
| `failure-setup-stage.json` | Optional parent sidecar binding the setup label and every worker ancestor to the same terminal failure, config, commit and path identities. |
| `worker-owner-stage.json` / `failure-owner-stage.json` | Optional worker/parent failure pair identifying an allowlisted post-callback owner stage with exact terminal ancestry. |
| `worker-owner-stage-v2.json` / `failure-owner-stage-v2.json` | Optional worker/parent failure pair adding `invalid-timing` or `budget-exceeded` only at the exact owner completion check. It cannot classify a historical attempt. |
| `worker-committed-reserve-stage.json` / `failure-committed-reserve-stage.json` | Optional worker/parent pair binding a closed native committed-reserve stage and `genesis` or `continuation` kind to the existing cycle-step and terminal failure ancestry. |
| `worker-committed-reserve-revalidation.json` / `failure-committed-reserve-revalidation.json` | Optional worker/parent pair narrowing `operational-revalidate` to `callback-observation-guard` or `revalidator-call`, with exact committed-reserve-stage ancestry. |
| `worker-committed-reserve-revalidation-operation.json` / `failure-committed-reserve-revalidation-operation.json` | Optional worker/parent pair identifying the last operation entered by the native revalidator, bound to the complete prior revalidation lineage. |
| `worker-committed-reserve-input-refusal.json` / `failure-committed-reserve-input-refusal.json` | Optional source-owned predicate refusal and node role, joined to the complete prior operation lineage. |
| `worker-committed-reserve-confirmation-progress.json` / `failure-committed-reserve-confirmation-progress.json` | Optional opt-in worker/parent pair binding the latest completed paired-node index and exact-ID pool observations to the original confirmation failure, reserve kind and complete legacy ancestry. |

Confirmation progress retains each node's full height before and after the
transaction read, index heights and pool status. A pool `not_found` means only
that the endpoint did not return that transaction. Index lag, node disagreement
and unavailable metrics can guide a subsequent investigation; they do not
establish a failure cause or transaction acceptance. Export performs no new
HTTP reads. The observation sequence and minimum final height must match the
original failure's last observation; stale, foreign or malformed detail is
refused. Missing, invalid or occupied optional files preserve the terminal
failure and older receipts. Either progress file contradicts success, even
when capture is disabled. Completion, cleanup and raw-cause claims remain
false. These diagnostics cannot reclassify earlier attempts or permit a retry.

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

The revalidation companion distinguishes the callback's retained observation
and custody guard from the following concrete revalidator call. It tags only
the original native error and requires its own matching cycle, step, stage and
kind. Unknown or conflicting origins, ambiguous primary errors and detail
under a cleanup ancestor are refused. The parent validates the complete legacy
worker and parent committed-reserve lineage before publishing the new detail.
Missing, malformed or occupied optional files preserve the terminal failure
and older receipts. Either new file contradicts a successful invocation.
The origin identifies a call boundary, not an inner predicate or raw cause;
completion, cleanup and raw-cause flags remain false. Existing receipt formats,
digest domains, budgets and thrown values are unchanged. These files cannot
classify earlier attempts or supply execution, signing or retry authority.

The operation companion applies only to `revalidator-call`. Its six values are
`ingress-binding`, `input-observation-before-check`, `fresh-signed-check`,
`input-observation-after-check`, `post-check-observation-join` and
`final-authorizer-binding`. The actual native revalidator owns the invocation
token and tags the original escaping error. A second invocation reusing that
error, conflicting labels, unsafe error graphs or cleanup ancestry refuse
detail. A label names the last operation entered; it does not identify an
inner predicate or raw cause. Each file is bounded to 16 KiB and binds config,
commit, path and exact legacy worker/parent receipt digests. Missing, invalid
or occupied optional files preserve the terminal failure and older receipts.
Either operation file contradicts success. Completion, cleanup and raw-cause
claims remain false. The companion grants no execution or retry authority.

The input-refusal companion names only an explicit predicate thrown by the
native input observer. It attaches private metadata to that exact Error,
using a separate invocation token; concurrent reads share no mutable current
node label. The closed codes are `source-funding-present`,
`transition-input-unavailable`, `transition-input-bytes-changed`,
`source-refund-timeout`, `successor-creation-height-window`,
`paired-observations-disagree`, `check-ancestry-window-exceeded` and
`input-observation-convergence-exhausted`. Node predicates identify `primary`
or `witness`; paired disagreement and convergence exhaustion identify `pair`.
The old operation identifies before-check or after-check observation. Ancestry
window refusal applies only after the check. Grouped input predicates do not
identify which individual input failed. Paired disagreement retains an existing
defensive predicate; malformed-normalizer tests do not establish its reachability
with genuine exact native reads.

HTTP, normalization and custody exceptions are not classified by message or
catch location. Transient tip advancement has no refusal tag. Only its existing
bounded retry exhaustion has a code. The projector requires the same unique
native primary Error to own the refusal and operation in a safe graph of at
most 64 errors. Conflicts, cross-invocation reuse, unsafe graphs and cleanup
attribution refuse detail; an independent untagged cleanup sibling retains the
old primary-selection semantics. Each canonical create-only file is bounded to
16 KiB and binds the exact old worker/parent operation ancestry. Missing,
invalid or occupied detail preserves the old failure. Either file, including
a dangling filesystem entry, contradicts success. Completion, root cleanup,
raw-cause publication and restored execution authority remain false. This
prospective detail cannot classify a historical attempt or admit another run.

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

The tracker-context companion narrows a future constructor failure to `ingress`,
`provenance`, `statement`, `membership`, `tracker-input`, `avl-transition` or
`serialization`. The constructor records the active section on the original
native error; it preserves the thrown value and successful context bytes.
Publication requires the same error's own matching cycle and `tracker-context`
step. Unknown or conflicting phases, multiple phase-bearing producers and
detail under a cleanup ancestor are rejected. The parent validates both worker
ancestry and its own cycle-step receipt before writing the optional detail.
Missing, changed or occupied companions leave the primary failure and older
receipts intact. This phase is a section label, not a predicate or raw cause;
it does not classify previous attempts or establish cleanup, custody disposal
or operation completion. Its digest establishes diagnostic consistency under
the same-user host assumption, not authentication.

The optional `worker-tracker-statement.json` and
`failure-tracker-statement.json` pair identifies the constructor's statement
check. `admission-before-window` means its validated current height is below
the statement's valid-from height; `admission-expired` means it is at or above
the exclusive expiry. These labels come from the actual admission comparison,
not error text. `admission-horizon` remains readable for earlier receipts and
for failures without a validated comparison, including invalid height
conversion. No height, statement window, predicate or execution deadline is
changed. The same unique-primary-error and exact-ancestry checks apply.

Updated readers accept all earlier statement-check values with unchanged fields,
schemas and digest domains. Earlier binaries reject the two new values; use the
source version bound to the attempt when interpreting a receipt. A new label
does not identify an earlier attempt's branch or permit retry, signing or a new
campaign.

The diagnostics use separate schemas and digest domains; the existing terminal
failure format and digest are unchanged. Missing, invalid or unwritable
diagnostics leave the original failure and consumed attempt intact. Any worker
failure companion accompanying an otherwise successful worker result blocks
terminal success. A digest detects
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

After a successful two-cycle root, the source-derived capture path can copy
fixed Frontier and Ergo database subtrees in the owners' stopped-data windows
and back up the two exact tracker admissions from SQLite. It writes bounded
hash manifests without keys or restored execution authority. The capture has
not been demonstrated against actual stopped node data, and its manifests do
not establish cross-node consistency or fresh-process restart. Recovery
acceptance requires a separately admitted run and validation on disposable
copies.

The node-state copy API accepts `capturedManifestSha256Hex` when preparing a
second disposable copy from a capture. Supply the exact `primary` and `witness`
children of one captured root, a separately admitted SHA-256 of its
`manifest.json`, and a fresh destination outside that root. The reader accepts
at most 16 MiB of strict UTF-8 JSON and verifies the existing schema, role/path
inventory, sizes, hashes and both false claims against the actual fixed database
subtrees. Captured directories must be ancestors of a manifest-listed file;
empty directories that the existing manifest cannot bind are unsupported by
this reader. Missing or extra entries, links, overlapping roots and mismatched
bytes refuse before a staging directory is created. The source and manifest are
checked again during materialization; an interrupted or failed partial copy is
never published as a completed export.

The quiescence callback remains a caller obligation, not proof of shutdown.
Matching manifests and copies establish byte correspondence only. This API
does not start nodes, reopen databases, recover custody or restore execution
authority.

`withSubstrateFederatedCopiedNonMiningErgoNodePairV1` connects that materializer
to a fresh pair of owned, non-mining Ergo processes. Its inputs include pinned
Java/JAR and public launch bindings, the separately admitted captured manifest,
a quiescence callback and an exact expected devnet snapshot. The full and
indexed heights must agree, and the expected header ID must be explicit. The
owner checks both the original capture and completed disposable copy before
the first launch, creates only two non-mining configurations, and checks owned
images, listeners, artifacts and the exact paired snapshots.

The callback receives only the expected snapshot and a bounded paired-read
method. This lease cannot satisfy the existing read-only, checkpoint, tracker
or execution target guards. Started reads settle before shutdown, ignored read
failures refuse success, and the lease is revoked when the callback settles.
Successful return requires the final snapshot checks, both owned terminations
and unowned ports. An unverified stop retains the owner lifetime. Disposable
directories are retained for inspection; neither return nor absence of stop
errors establishes database consistency or custody disposal.
The returned manifest pin identifies the original admitted capture. The owner
separately derives and verifies the disposable output manifest pin; it may
differ when the original admitted JSON uses a different serialization.

This component is tested with genuine synthetic files and simulated process,
HTTP and metadata boundaries. Actual restart of captured node databases remains
unexecuted. No existing campaign root can import this new observation owner;
connecting an operational caller requires a separate recovery admission and
exact architecture binding. A successful lifecycle capture, its expected
public tip and an admitted fresh recovery execution are still missing.

`prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1` prepares the observation
inputs from bounded strict JSON for a separately selected successful root
result and its aggregate capture manifest. The caller supplies the exact raw
root SHA-256, a controlled local build parent and the quiescence callback. The
function validates the two-cycle result, relative capture names, aggregate
hash, fixed component roles and the second confirmation's exact indexed devnet
snapshot. It derives the two Ergo roots and selects the Ergo component pin for
the copied owner; the aggregate pin is a different hash. The canonical capture
is beneath the build's fixed `target` directory, followed by the capture name
and `ergo/primary` or `ergo/witness`.

This function reads no files and does not authenticate success or admit
recovery. Its selected raw root hash covers the recovery pointer and snapshot;
the legacy projected receipt is retained separately and cannot bind those
omitted fields. The confirmation snapshot precedes capture and remains an
expected observation. Actual component bytes, stopped-state ownership,
canonical paths and paired restart observations remain separate checks.
Selection does not prove payout persistence at that tip.

With `captureCopiedErgoRecoverySelection: true`, the packaged worker derives
`worker-copied-ergo-selection-v1.json` from the complete in-memory root return
and the selected aggregate capture. The parent validates its bindings against
the existing worker recovery locator, projected result and freshly read
aggregate, then writes `copied-ergo-selection-v1.json`. Each companion is
create-only, canonical JSON plus LF, and bounded to 16 KiB. Both companions
must be valid before the corresponding success result is published. A missing
or malformed required companion refuses success; an occupied output is never
overwritten. Unexpected companions also refuse success when the option is
disabled.

The public selection retains relative capture names, aggregate and Ergo
component pins, the complete canonical root hash and the exact second
confirmation snapshot. It binds the configuration, source and tool identities,
legacy projected result and existing recovery-locator ancestry. The parent
also binds its precomputed canonical result receipt. That digest is distinct
from a launcher terminal receipt. A separately selected public parent
companion can be parsed against explicit expected bindings without reading
worker files.

The bounded aggregate reader checks canonical direct ancestors, a stable
single-link regular manifest, its raw hash, fixed component roles and declared
bounds. It does not inspect component databases. The legacy result still omits
the complete root data; the companion exposes only the selected public fields.
Its raw-root hash and opaque worker digests establish byte correspondence
under the trusted local producer assumption. They cannot authenticate a
coherently forged result or snapshot. All five claims remain false:
`successAuthenticated`, `recoveryAdmitted`, `nodeConsistencyEstablished`,
`freshRestartValidated` and `executionAuthorityRestored`.

Synthetic composition exercises this producer-to-parent path and publication
ordering. A genuine successful lifecycle capture and separately admitted
recovery execution remain unobserved. The selection does not establish payout
persistence, stopped-state ownership, custody disposal or permission to start
recovery.

`prepareNativeTwoCycleCopiedErgoOwnerInputV1` connects a separately selected
public parent companion to the copied owner without requiring the complete root
or worker files. Supply the companion text, its independently selected raw
SHA-256, explicit expected parent ancestry, a controlled local build parent and
the quiescence callback. The function reuses the canonical parent parser,
derives the fixed capture layout, and returns exactly the owner's five input
fields with the Ergo component pin and selected expected snapshot. It freezes
the returned records and retains the callback by reference without invoking it.

Preparation performs no file or network reads and does not launch the owner.
Its raw parent pin is distinct from the receipt, root, aggregate and component
pins. Five false claims remain explicit; optional independently selected root
or snapshot checks retain their parser meaning. Matching a self-consistent
companion does not authenticate its tip. The owner must still validate the
actual component inventory and bytes, quiescence, process inputs and paired
observations under a separate recovery admission. The current composition
uses synthetic capture files and simulated process/HTTP boundaries.

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
