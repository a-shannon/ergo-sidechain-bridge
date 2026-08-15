# Patched Devnet Current-HEAD Loopback-Bound Prerequisite Diagnostic - 2026-07-07 - d2b538cb

This evidence records a current-head safe prerequisite diagnostic for a future
local patched-devnet lifecycle rehearsal with the configured Frontier sidechain
started locally and the Ergo node environment variables bound to the same
loopback patched-devnet origin. Local source and binary paths are not
serialized. This is not completed Gate 3 lifecycle evidence.

## Diagnostic Classification

| Field | Value |
|---|---|
| Evidence name | patched-devnet loopback-bound prerequisite diagnostic |
| Git commit | d2b538cb |
| Branch | codex/bridge-prod-readiness |
| Environment | local source, Frontier-online, and loopback endpoint-binding prerequisite check |
| Source location handling | configured source present; local path not serialized |
| Frontier binary handling | configured Frontier binary present; local path not serialized |
| Frontier binary version | `frontier-template-node.exe 0.0.0-75329a2df49` |
| Frontier runtime handling | local temporary dev chain; `--dev --tmp`; no deployment |
| Ergo endpoint binding | `ERGO_NODE`, `ERGO_NODE_URL`, and `PATCHED_ERGO_NODE_URL` scoped to `http://127.0.0.1:9051` |
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
| `npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --ergo-source-root <configured-ergo-source-root> --frontier-binary <configured-frontier-binary> --json-out ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-d2b538cb.json` | LOCAL_PREREQS_OK / exit code 0 | [loopback-bound prerequisite JSON](artifacts/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-d2b538cb.json) |
| `npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-d2b538cb.json` | PASS / exit code 0 | [validation output](artifacts/patched-devnet-go-no-go-loopback-bound-prereq-validation-2026-07-07-d2b538cb.md) |
| `npm run rehearsal:local-devnet-request -- --source-commit d2b538cb --capture-manifest ../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-06-ec29b2ef.md --go-no-go-json ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-loopback-bound-prereq-2026-07-07-d2b538cb.json --go-no-go-validation ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-loopback-bound-prereq-validation-2026-07-07-d2b538cb.md --out ../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-d2b538cb.md --json-out ../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-07-d2b538cb.json` | PASS / exit code 0 | [local-devnet execution request](gate3-local-devnet-execution-request-2026-07-07-d2b538cb.md) |

## Current Prerequisite Result

| Category | Count | Detail |
|---|---:|---|
| PASS checks | 14 | Configured source location, configured Frontier binary, required local launcher files, required npm scripts, scoped Ergo node env vars, and live local Frontier RPC are present |
| WARN checks | 5 | Secret inspection disabled, patched Ergo devnet offline, runtime-state inspection skipped, funding skipped, signer alignment not checked |
| FAIL checks | 0 | None |
| Exit code | 0 | `LOCAL_PREREQS_OK -- EXECUTION NOT READY` until patched Ergo devnet, funding, signer alignment, runtime-state inspection, and explicit approval are handled |

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
| Next action | Start the patched Ergo devnet in a controlled no-broadcast session using no serialized secret material, then rerun the same loopback-bound diagnostic before any rehearsal execution approval |
