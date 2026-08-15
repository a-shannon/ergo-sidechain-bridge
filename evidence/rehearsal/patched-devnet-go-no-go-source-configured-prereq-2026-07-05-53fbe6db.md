# Patched Devnet Source-Configured Prerequisite Diagnostic - 2026-07-05 - 53fbe6db

This evidence records a current-head safe, read-only prerequisite diagnostic
for a future local patched-devnet lifecycle rehearsal with the patched Ergo
source supplied as an explicit local operator input. The local source path is
not serialized. This is not completed Gate 3 lifecycle evidence.

## Diagnostic Classification

| Field | Value |
|---|---|
| Evidence name | patched-devnet source-configured prerequisite diagnostic |
| Git commit | 53fbe6db |
| Branch | codex/bridge-prod-readiness |
| Environment | local source-configured prerequisite check |
| Source location handling | configured source present; local path not serialized |
| Frontier binary handling | default binary missing; no configured binary supplied |
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
| `npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --ergo-source-root <configured-ergo-source-root> --json-out ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-source-configured-prereq-2026-07-05-53fbe6db.json` | NO-GO / exit code 1 | [source-configured prerequisite JSON](artifacts/patched-devnet-go-no-go-source-configured-prereq-2026-07-05-53fbe6db.json) |
| `npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-source-configured-prereq-2026-07-05-53fbe6db.json` | PASS / exit code 0 | [validation output](artifacts/patched-devnet-go-no-go-source-configured-prereq-validation-2026-07-05-53fbe6db.md) |

## Current Prerequisite Result

| Category | Count | Detail |
|---|---:|---|
| PASS checks | 11 | Configured source location, required local launcher files, and required npm scripts are present |
| WARN checks | 7 | Secret inspection disabled, node environment values unset, local nodes offline, runtime-state inspection skipped, funding skipped, signer alignment not checked |
| FAIL checks | 1 | `frontier-template-node.exe` missing at the configured default location |
| Final verdict | 1 | `NO-GO` until the Frontier binary prerequisite is restored or explicitly configured |

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
| Next action | Restore or explicitly configure the Frontier binary, then rerun the same diagnostic before any scoped live rehearsal approval |
