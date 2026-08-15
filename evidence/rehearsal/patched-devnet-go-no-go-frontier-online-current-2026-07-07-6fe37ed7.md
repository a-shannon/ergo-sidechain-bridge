# Patched Devnet Frontier-Online Current Diagnostic - 2026-07-07 - 6fe37ed7

This evidence records a current-head safe, read-only prerequisite diagnostic
for a future local patched-devnet lifecycle rehearsal. The local Frontier
sidechain was started in ephemeral `--dev --tmp` mode, reached over loopback,
and stopped after capture. Local source and binary paths are not serialized.
This is not completed Gate 3 lifecycle evidence.

## Diagnostic Classification

| Field | Value |
|---|---|
| Evidence name | patched-devnet frontier-online current diagnostic |
| Git commit | 6fe37ed7 |
| Branch | codex/bridge-prod-readiness |
| Environment | local source, Frontier binary, loopback endpoints, and Frontier reachability prerequisite check |
| Source location handling | configured source present; local path not serialized |
| Frontier binary handling | configured Frontier binary present; local path not serialized |
| Frontier binary version | `frontier-template-node.exe 0.0.0-75329a2df49` |
| Frontier launch mode | ephemeral `--dev --tmp` local sidechain |
| Frontier RPC status | online at `http://127.0.0.1:9945`, block `5` at go/no-go capture |
| Frontier process handling | stopped after diagnostic capture |
| Ergo endpoint binding | `ERGO_NODE` and `ERGO_NODE_URL` both set to `http://127.0.0.1:9051` in the scoped shell |
| Sidechain endpoint binding | `SUBSTRATE_EVM_URL` set to `http://127.0.0.1:9945` in the scoped shell |
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
| `<configured-frontier-binary> --version` | PASS / exit code 0 | `frontier-template-node.exe 0.0.0-75329a2df49` |
| `<configured-frontier-binary> --dev --tmp --rpc-port 9945 --rpc-cors=all --prometheus-port 9616` | PASS / local process started | Frontier reached over loopback during go/no-go capture |
| `eth_blockNumber` over `http://127.0.0.1:9945` | PASS / JSON-RPC result `0x2` before go/no-go capture | Local Frontier RPC readiness check |
| `npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --ergo-source-root <configured-ergo-source-root> --frontier-binary <configured-frontier-binary> --json-out ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-online-current-2026-07-07-6fe37ed7.json` | LOCAL_PREREQS_OK / exit code 0 | [frontier-online current JSON](artifacts/patched-devnet-go-no-go-frontier-online-current-2026-07-07-6fe37ed7.json) |
| `npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-online-current-2026-07-07-6fe37ed7.json` | PASS / exit code 0 | [validation output](artifacts/patched-devnet-go-no-go-frontier-online-current-validation-2026-07-07-6fe37ed7.md) |

## Current Prerequisite Result

| Category | Count | Detail |
|---|---:|---|
| PASS checks | 14 | Configured source location, configured Frontier binary, required local launcher files, required npm scripts, scoped loopback Ergo endpoint bindings, and local Frontier sidechain reachability are present |
| WARN checks | 5 | Secret inspection disabled, patched Ergo devnet offline, runtime-state inspection skipped, funding skipped, signer alignment not checked |
| FAIL checks | 0 | None |
| Exit code | 0 | Go/no-go command completed successfully |
| Final verdict | n/a | `LOCAL_PREREQS_OK -- EXECUTION NOT READY` until patched Ergo devnet reachability, scoped funding, signer alignment, runtime-state inspection, and explicit approval are handled |

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
| Database write by bridge tooling | no |
| Deployment | no |
| Deployment-state inspection | no |
| SQLite runtime-state inspection | no |
| Backup-directory inspection | no |
| Patched Ergo devnet reached | no |
| Frontier sidechain reached | yes |

## Gate 3 Handling

| Claim | Decision |
|---|---|
| Gate 3 closure supported | no |
| Live execution approved | no |
| Broadcast authorization granted | no |
| Release claim support | no |
| Next action | Start the patched Ergo devnet in the same controlled no-broadcast session, rerun the diagnostic with runtime-state inspection in scope, then capture funding and signer-alignment status without exposing wallet material |
