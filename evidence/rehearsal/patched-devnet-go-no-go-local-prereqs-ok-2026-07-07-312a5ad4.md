# Patched Devnet Local Prereqs OK Diagnostic - 2026-07-07 - 312a5ad4

This evidence records a current-head safe, read-only prerequisite diagnostic
for a future local patched-devnet lifecycle rehearsal with both the patched Ergo
source and Frontier binary supplied as explicit local operator inputs. Local
source and binary paths are not serialized. This is not completed Gate 3
lifecycle evidence.

## Diagnostic Classification

| Field | Value |
|---|---|
| Evidence name | patched-devnet local-prereqs-ok diagnostic |
| Git commit | 312a5ad4 |
| Branch | codex/bridge-prod-readiness |
| Environment | local source, Frontier binary, and loopback endpoint prerequisite check |
| Source location handling | configured source present; local path not serialized |
| Frontier binary handling | configured Frontier binary present; local path not serialized |
| Frontier binary version | `frontier-template-node.exe 0.0.0-75329a2df49` |
| Ergo endpoint binding | `ERGO_NODE` and `ERGO_NODE_URL` both set to `http://127.0.0.1:9051` in the scoped shell |
| Sidechain endpoint binding | `SUBSTRATE_EVM_URL` set to `http://127.0.0.1:9945` in the scoped shell |
| Secret env inspection | disabled |
| Node config inspection | disabled |
| Runtime state inspection | skipped |
| Broadcast mode | disabled |
| Signing mode | disabled |
| Deployment mode | disabled |
| Reviewer | A. Shannon |
| Date | 2026-07-07 |

## Command Evidence

| Command | Result | Evidence |
|---|---|---|
| `npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --ergo-source-root <configured-ergo-source-root> --frontier-binary <configured-frontier-binary> --json-out ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-local-prereqs-ok-2026-07-07-312a5ad4.json` | LOCAL_PREREQS_OK / exit code 0 | [local-prereqs-ok JSON](artifacts/patched-devnet-go-no-go-local-prereqs-ok-2026-07-07-312a5ad4.json) |
| `<configured-frontier-binary> --version` | PASS / exit code 0 | `frontier-template-node.exe 0.0.0-75329a2df49` |
| `npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-local-prereqs-ok-2026-07-07-312a5ad4.json` | PASS / exit code 0 | [validation output](artifacts/patched-devnet-go-no-go-local-prereqs-ok-validation-2026-07-07-312a5ad4.md) |

## Current Prerequisite Result

| Category | Count | Detail |
|---|---:|---|
| PASS checks | 13 | Configured source location, configured Frontier binary, required local launcher files, required npm scripts, and scoped loopback Ergo endpoint bindings are present |
| WARN checks | 6 | Secret inspection disabled, patched Ergo devnet offline, Frontier offline, runtime-state inspection skipped, funding skipped, signer alignment not checked |
| FAIL checks | 0 | None |
| Final verdict | 0 | `LOCAL_PREREQS_OK -- EXECUTION NOT READY` until live local nodes, scoped funding, signer alignment, runtime-state inspection, and explicit approval are handled |

## Boundary

| Boundary | Value |
|---|---|
| `.env` file loaded | no |
| Secret env inspection | no |
| Node config inspection | no |
| Mnemonic inspection | no |
| Runtime state inspection | no |
| Signing | no |
| Broadcast | no |
| Database write | no |
| Deployment | no |
| Deployment-state inspection | no |
| SQLite runtime-state inspection | no |
| Backup-directory inspection | no |
| Local node reachability required for this diagnostic | no |

## Gate 3 Handling

| Claim | Decision |
|---|---|
| Gate 3 closure supported | no |
| Live execution approved | no |
| Broadcast authorization granted | no |
| Release claim support | no |
| Next action | Start the local Frontier sidechain and patched Ergo devnet in a controlled no-broadcast session, then rerun the diagnostic with runtime-state inspection in scope before any completed rehearsal claim |
