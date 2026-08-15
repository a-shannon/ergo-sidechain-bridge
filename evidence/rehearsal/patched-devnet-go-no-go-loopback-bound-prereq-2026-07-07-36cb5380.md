# Patched Devnet Current-HEAD Loopback-Bound Prerequisite Diagnostic - 2026-07-07 - 36cb5380

This evidence records a current-head safe prerequisite diagnostic for a future
local patched-devnet lifecycle rehearsal. Local source and binary paths are not
serialized. This is not completed Gate 3 lifecycle evidence.

## Diagnostic Classification

| Field | Value |
|---|---|
| Evidence name | patched-devnet loopback-bound prerequisite diagnostic |
| Git commit | 36cb5380 |
| Branch | codex/bridge-prod-readiness |
| Environment | local source, Frontier binary, and loopback endpoint prerequisite check |
| Source location handling | default source location missing; local absolute path not serialized |
| Frontier binary handling | default Frontier binary missing; local absolute path not serialized |
| Ergo endpoint binding | `ERGO_NODE` and `ERGO_NODE_URL` not set in the scoped shell |
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
| `npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --json-out ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-36cb5380.json` | NO-GO / exit code 1 | [loopback-bound prerequisite JSON](artifacts/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-36cb5380.json) |
| `npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-36cb5380.json` | PASS / exit code 0 | [validation output](artifacts/patched-devnet-go-no-go-loopback-bound-prereq-validation-2026-07-07-36cb5380.md) |

## Current Prerequisite Result

| Category | Count | Detail |
|---|---:|---|
| PASS checks | 10 | Required local launcher files and required npm scripts are present |
| WARN checks | 7 | Secret inspection disabled, endpoint env vars unset, patched Ergo devnet offline, Frontier offline, runtime-state inspection skipped, funding skipped, signer alignment not checked |
| FAIL checks | 2 | `../ergo-source` is missing and `frontier-template-node.exe` is missing at the configured default location |
| Exit code | 1 | `NO-GO -- resolve FAIL items before proceeding` |

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
| Live execution approved | no |

## Gate 3 Handling

| Claim | Decision |
|---|---|
| Gate 3 closure supported | no |
| Live execution approved | no |
| Broadcast authorization granted | no |
| Release claim support | no |
| Next action | Restore or point to the patched Ergo source tree and Frontier binary in this local mirror, start local nodes in a controlled no-broadcast session, then rerun the same loopback-bound diagnostic before any rehearsal execution approval |
