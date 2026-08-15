# Patched Devnet Current-HEAD Frontier-Online Prerequisite Diagnostic - 2026-07-07 - e50ed468

This evidence records a current-head safe prerequisite diagnostic for a future
local patched-devnet lifecycle rehearsal with the configured Frontier sidechain
started locally and responding on JSON-RPC. Local source and binary paths are
not serialized. This is not completed Gate 3 lifecycle evidence.

## Diagnostic Classification

| Field | Value |
|---|---|
| Evidence name | patched-devnet frontier-online prerequisite diagnostic |
| Git commit | e50ed468 |
| Branch | codex/bridge-prod-readiness |
| Environment | local source-and-frontier-online prerequisite check |
| Source location handling | configured source present; local path not serialized |
| Frontier binary handling | configured Frontier binary present; local path not serialized |
| Frontier binary version | `frontier-template-node.exe 0.0.0-75329a2df49` |
| Frontier runtime handling | local temporary dev chain; `--dev --tmp`; no deployment |
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
| `<configured-frontier-binary> --dev --tmp --rpc-port 9945 --rpc-cors=all --prometheus-port 9616` | PASS / local Frontier RPC online | Temporary local process only; no deployment, signing, or broadcast |
| `eth_blockNumber` against `http://127.0.0.1:9945` | PASS | Frontier JSON-RPC returned a local block number before go/no-go capture |
| `npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --ergo-source-root <configured-ergo-source-root> --frontier-binary <configured-frontier-binary> --json-out ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-online-prereq-2026-07-07-e50ed468.json` | LOCAL_PREREQS_OK / exit code 0 | [frontier-online prerequisite JSON](artifacts/patched-devnet-go-no-go-frontier-online-prereq-2026-07-07-e50ed468.json) |
| `npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-online-prereq-2026-07-07-e50ed468.json` | PASS / exit code 0 | [validation output](artifacts/patched-devnet-go-no-go-frontier-online-prereq-validation-2026-07-07-e50ed468.md) |

## Current Prerequisite Result

| Category | Count | Detail |
|---|---:|---|
| PASS checks | 13 | Configured source location, configured Frontier binary, required local launcher files, required npm scripts, and live local Frontier RPC are present |
| WARN checks | 6 | Secret inspection disabled, node environment values unset, patched Ergo devnet offline, runtime-state inspection skipped, funding skipped, signer alignment not checked |
| FAIL checks | 0 | None |
| Exit code | 0 | `LOCAL_PREREQS_OK -- EXECUTION NOT READY` until patched Ergo devnet, scoped environment values, funding, signer alignment, runtime-state inspection, and explicit approval are handled |

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
| Next action | Start the patched Ergo devnet in the same controlled no-broadcast session, set scoped local node environment values, and rerun the diagnostic before any rehearsal execution approval |
