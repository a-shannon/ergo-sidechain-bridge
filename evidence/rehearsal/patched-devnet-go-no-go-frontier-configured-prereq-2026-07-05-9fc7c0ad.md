# Patched Devnet Frontier-Configured Prerequisite Diagnostic - 2026-07-05 - 9fc7c0ad

This evidence records a current-head safe, read-only prerequisite diagnostic
for a future local patched-devnet lifecycle rehearsal with both the patched Ergo
source and the Frontier binary supplied as explicit local operator inputs. Local
source and binary paths are not serialized. This is not completed Gate 3
lifecycle evidence.

## Diagnostic Classification

| Field | Value |
|---|---|
| Evidence name | patched-devnet frontier-configured prerequisite diagnostic |
| Git commit | 9fc7c0ad |
| Branch | codex/bridge-prod-readiness |
| Environment | local source-and-frontier-configured prerequisite check |
| Source location handling | configured source present; local path not serialized |
| Frontier binary handling | configured Frontier binary present; local path not serialized |
| Secret env inspection | disabled |
| Node config inspection | disabled |
| Runtime state inspection | skipped |
| Broadcast mode | disabled |
| Signing mode | disabled |
| Deployment mode | disabled |
| Reviewer | A. Shannon |
| Date | 2026-07-05 |

## Command Evidence

| Command | Result | Evidence |
|---|---|---|
| `npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --ergo-source-root <configured-ergo-source-root> --frontier-binary <configured-frontier-binary> --json-out ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-05-9fc7c0ad.json` | LOCAL_PREREQS_OK / exit code 0 | [frontier-configured prerequisite JSON](artifacts/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-05-9fc7c0ad.json) |
| `<configured-frontier-binary> --version` | PASS / exit code 0 | `frontier-template-node.exe 0.0.0-75329a2df49` |
| `npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-05-9fc7c0ad.json` | PASS / exit code 0 | [validation output](artifacts/patched-devnet-go-no-go-frontier-configured-prereq-validation-2026-07-05-9fc7c0ad.md) |

## Current Prerequisite Result

| Category | Count | Detail |
|---|---:|---|
| PASS checks | 12 | Configured source location, configured Frontier binary, required local launcher files, and required npm scripts are present |
| WARN checks | 7 | Secret inspection disabled, node environment values unset, local nodes offline, runtime-state inspection skipped, funding skipped, signer alignment not checked |
| FAIL checks | 0 | None |
| Final verdict | 1 | `LOCAL_PREREQS_OK -- EXECUTION NOT READY` until live local nodes, scoped environment values, funding, signer alignment, runtime-state inspection, and explicit approval are handled |

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

## Gate 3 Handling

| Claim | Decision |
|---|---|
| Gate 3 closure supported | no |
| Live execution approved | no |
| Broadcast authorization granted | no |
| Release claim support | no |
| Next action | Start the local Frontier sidechain and patched Ergo devnet in a controlled session, then rerun the diagnostic with scoped environment values before any rehearsal execution approval |
