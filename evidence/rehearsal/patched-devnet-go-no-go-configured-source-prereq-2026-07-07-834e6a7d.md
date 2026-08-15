# Patched Devnet Configured-Source Prerequisite Diagnostic - 2026-07-07 - 834e6a7d

This evidence records a current-head safe prerequisite diagnostic for a future
local patched-devnet lifecycle rehearsal with the local Ergo source tree supplied
as an explicit operator input. Local source and binary paths are not serialized.
This is not completed Gate 3 lifecycle evidence.

## Diagnostic Classification

| Field | Value |
|---|---|
| Evidence name | patched-devnet configured-source prerequisite diagnostic |
| Git commit | 834e6a7d |
| Branch | codex/bridge-prod-readiness |
| Environment | local source, Frontier binary, and loopback endpoint prerequisite check |
| Source location handling | configured source location found; local absolute path not serialized |
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
| `npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --ergo-source-root <configured-local-source> --json-out ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-configured-source-prereq-2026-07-07-834e6a7d.json` | NO-GO / exit code 1 | [configured-source prerequisite JSON](artifacts/patched-devnet-go-no-go-configured-source-prereq-2026-07-07-834e6a7d.json) |
| `npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-configured-source-prereq-2026-07-07-834e6a7d.json` | PASS / exit code 0 | [validation output](artifacts/patched-devnet-go-no-go-configured-source-prereq-validation-2026-07-07-834e6a7d.md) |

## Current Prerequisite Result

| Category | Count | Detail |
|---|---:|---|
| PASS checks | 11 | Configured local source, required local launcher files, and required npm scripts are present |
| WARN checks | 7 | Secret inspection disabled, endpoint env vars unset, patched Ergo devnet offline, Frontier offline, runtime-state inspection skipped, funding skipped, signer alignment not checked |
| FAIL checks | 1 | `frontier-template-node.exe` is missing at the configured default Frontier binary location |
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
| Next action | Restore or build the Frontier node binary, set scoped loopback node endpoints, start local nodes in a controlled no-broadcast session, then rerun the same diagnostic before any rehearsal execution approval |
