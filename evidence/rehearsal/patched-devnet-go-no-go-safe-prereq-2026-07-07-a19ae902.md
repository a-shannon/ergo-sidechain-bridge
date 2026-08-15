# Patched Devnet Safe Prerequisite Diagnostic - 2026-07-07 - a19ae902

This evidence records a current-head safe, read-only prerequisite diagnostic
for a future local patched-devnet lifecycle rehearsal. It is not completed Gate
3 lifecycle evidence.

## Diagnostic Classification

| Field | Value |
|---|---|
| Evidence name | patched-devnet safe prerequisite diagnostic |
| Git commit | a19ae902 |
| Branch | codex/bridge-prod-readiness |
| Environment | local prerequisite check |
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
| `npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --ergo-source-root <configured-source-root> --json-out ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-safe-prereq-2026-07-07-a19ae902.json` | NO-GO / exit code 1 | [safe prerequisite JSON](artifacts/patched-devnet-go-no-go-safe-prereq-2026-07-07-a19ae902.json) |
| `npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-safe-prereq-2026-07-07-a19ae902.json` | PASS / exit code 0 | [validation output](artifacts/patched-devnet-go-no-go-safe-prereq-validation-2026-07-07-a19ae902.md) |

## Current Prerequisite Result

| Category | Count | Detail |
|---|---:|---|
| PASS checks | 12 | Configured Ergo source, patched-devnet launcher, start-substrate launcher, and required relayer scripts are present |
| WARN checks | 6 | Secret inspection disabled, runtime-state inspection skipped, patched Ergo devnet offline, Frontier sidechain offline, funding skipped, node config/signer alignment not checked |
| FAIL checks | 1 | `frontier-template-node.exe` missing at the configured default location |
| Final verdict | 1 | `NO-GO` until the Frontier binary is restored or configured |

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
| Next action | Restore or configure the Frontier binary, start Frontier and the patched Ergo devnet in a scoped local session, rerun go/no-go with runtime-state inspection in scope, then handle signer and funding checks without exposing wallet material |
