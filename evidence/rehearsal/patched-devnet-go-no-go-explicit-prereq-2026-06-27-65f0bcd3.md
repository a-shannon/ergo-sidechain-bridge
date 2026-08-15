# Patched Devnet Explicit CLI Prerequisite Diagnostic - 2026-06-27 - 65f0bcd3

This evidence records a current-head safe, read-only prerequisite diagnostic
for a future local patched-devnet lifecycle rehearsal using explicit CLI path
bindings for the local source checkout and Frontier binary. It is not completed
Gate 3 lifecycle evidence.

## Diagnostic Classification

| Field | Value |
|---|---|
| Evidence name | patched-devnet explicit CLI prerequisite diagnostic |
| Git commit | 65f0bcd3 |
| Branch | codex/bridge-prod-readiness |
| Environment | local configured prerequisite check |
| Source location handling | explicit CLI path binding; configured source present; local path not serialized |
| Frontier binary handling | explicit CLI path binding; configured binary present; local path not serialized |
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
| `npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --ergo-source-root <configured source root> --frontier-binary <configured frontier binary> --json-out ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-explicit-prereq-2026-06-27-65f0bcd3.json` | LOCAL_PREREQS_OK / exit code 0 | [explicit prerequisite JSON](artifacts/patched-devnet-go-no-go-explicit-prereq-2026-06-27-65f0bcd3.json) |
| `npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-explicit-prereq-2026-06-27-65f0bcd3.json` | PASS / exit code 0 | [validation output](artifacts/patched-devnet-go-no-go-explicit-prereq-validation-2026-06-27-65f0bcd3.md) |

## Current Prerequisite Result

| Category | Count | Detail |
|---|---:|---|
| PASS checks | 12 | Explicit source checkout binding, explicit Frontier binary binding, required local launcher files, and required npm scripts are present |
| WARN checks | 7 | Secret inspection disabled, node environment values unset, local nodes offline, runtime-state inspection skipped, funding skipped, signer alignment not checked |
| FAIL checks | 0 | No mandatory local file prerequisite failures in explicit configured safe mode |
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
