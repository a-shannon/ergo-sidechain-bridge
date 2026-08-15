# Patched Devnet Safe Prerequisite Diagnostic - 2026-06-26 - b050798b

This evidence records a current-head safe, read-only prerequisite diagnostic
for a future local patched-devnet lifecycle rehearsal. It is not completed Gate
3 lifecycle evidence.

## Diagnostic Classification

| Field | Value |
|---|---|
| Evidence name | patched-devnet safe prerequisite diagnostic |
| Git commit | b050798b |
| Branch | codex/bridge-prod-readiness |
| Environment | local prerequisite check |
| Secret env inspection | disabled |
| Node config inspection | disabled |
| Runtime state inspection | skipped |
| Broadcast mode | disabled |
| Signing mode | disabled |
| Deployment mode | disabled |
| Reviewer | A. Shannon |
| Date | 2026-06-26 |

## Command Evidence

| Command | Result | Evidence |
|---|---|---|
| `npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --json-out ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-safe-prereq-2026-06-26-b050798b.json` | NO-GO / exit code 1 | [safe prerequisite JSON](artifacts/patched-devnet-go-no-go-safe-prereq-2026-06-26-b050798b.json) |
| `npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-safe-prereq-2026-06-26-b050798b.json` | PASS / exit code 0 | [validation output](artifacts/patched-devnet-go-no-go-safe-prereq-validation-2026-06-26-b050798b.md) |

## Current Prerequisite Result

| Category | Count | Detail |
|---|---:|---|
| PASS checks | 10 | Required scripts and local launcher files that are present |
| WARN checks | 7 | Secret inspection disabled, node config inspection disabled, runtime-state inspection skipped, local nodes offline, funding skipped, signer alignment not checked |
| FAIL checks | 2 | `../ergo-source` missing; `frontier-template-node.exe` missing |
| Final verdict | 1 | `NO-GO` until missing mandatory prerequisites are resolved |

## Boundary

| Boundary | Value |
|---|---|
| `.env` file loaded | no |
| Secret env inspection | no |
| Node config inspection | no |
| Mnemonic inspection | no |
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
| Next action | Restore or install the missing patched-devnet source and Frontier binary, then rerun the same diagnostic before any scoped live rehearsal approval |
