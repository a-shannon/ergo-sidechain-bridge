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

A receipt contains transaction identities and bounded observations, not signing
or replay authority. Keep the attempt directory and retained build/journal
artifacts outside Git. Never reuse disposed custody or reconstruct authorization
from these files. Before a distinct fresh experiment, resolve the previous
failure and establish that its processes and listeners are no longer owned.

The campaign does not implement restart, database-loss or reorg recovery. Those
cases must be exercised separately against accumulated state before the wider
FED delivery can be considered complete.
