# Patched Devnet Configured Prerequisite Diagnostic - 2026-06-27 - a27358f1

This evidence records a current-head safe, read-only prerequisite diagnostic
for a future local patched-devnet lifecycle rehearsal with configured local
source and Frontier binary locations. It is not completed Gate 3 lifecycle
evidence.

## Diagnostic Classification

| Field | Value |
|---|---|
| Evidence name | patched-devnet configured prerequisite diagnostic |
| Git commit | a27358f1 |
| Branch | codex/bridge-prod-readiness |
| Environment | local configured prerequisite check |
| Source location handling | configured source present; local path not serialized |
| Frontier binary handling | configured binary present; local path not serialized |
| Secret env inspection | disabled |
| Node config inspection | disabled |
| Runtime state inspection | skipped |
| Broadcast mode | disabled |
| Signing mode | disabled |
| Deployment mode | disabled |
| Reviewer | A. Shannon |
| Date | 2026-06-27 |

## Command Evidence

| Command | Result | Evidence |
|---|---|---|
| `npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --json-out ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-configured-prereq-2026-06-27-a27358f1.json` | LOCAL_PREREQS_OK / exit code 0 | [configured prerequisite JSON](artifacts/patched-devnet-go-no-go-configured-prereq-2026-06-27-a27358f1.json) |
| `npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-configured-prereq-2026-06-27-a27358f1.json` | PASS / exit code 0 | [validation output](artifacts/patched-devnet-go-no-go-configured-prereq-validation-2026-06-27-a27358f1.md) |

## Current Prerequisite Result

| Category | Count | Detail |
|---|---:|---|
| PASS checks | 12 | Configured source location, configured Frontier binary, required local launcher files, and required npm scripts are present |
| WARN checks | 7 | Secret inspection disabled, node environment values unset, local nodes offline, runtime-state inspection skipped, funding skipped, signer alignment not checked |
| FAIL checks | 0 | No mandatory local file prerequisite failures in configured safe mode |
| Final verdict | 0 | `LOCAL_PREREQS_OK`; execution remains blocked until live-operation prerequisites and approvals are handled |

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
| Next action | Start scoped local nodes, set aligned local node environment values, perform approved runtime-state inspection, and rerun the same diagnostic before any controlled lifecycle rehearsal |
