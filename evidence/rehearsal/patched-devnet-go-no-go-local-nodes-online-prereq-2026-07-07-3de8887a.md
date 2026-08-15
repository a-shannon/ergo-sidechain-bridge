# Patched Devnet Local Nodes Online Prereq - 2026-07-07 - 3de8887a

This evidence records a current-head safe, no-secret prerequisite diagnostic for
a future local patched-devnet lifecycle rehearsal. It confirms that both local
loopback nodes were online during the diagnostic, while keeping runtime-state,
funding, signer alignment, signing, deployment, submit, and broadcast out of
scope. This is not completed Gate 3 lifecycle evidence.

## Diagnostic Classification

| Field | Value |
|---|---|
| Evidence name | patched-devnet local-nodes-online prerequisite diagnostic |
| Git commit | 3de8887a |
| Branch | codex/bridge-prod-readiness |
| Environment | local source, configured Frontier binary, patched Ergo devnet loopback endpoint, and Frontier loopback endpoint prerequisite check |
| Source location handling | configured source present; local path not serialized |
| Frontier binary handling | configured Frontier binary present; local path not serialized |
| Frontier binary version | `frontier-template-node.exe 0.0.0-75329a2df49` |
| Ergo endpoint binding | `ERGO_NODE` and `ERGO_NODE_URL` both set to `http://127.0.0.1:9051` in the scoped shell |
| Sidechain endpoint binding | `SUBSTRATE_EVM_URL` set to `http://127.0.0.1:9945` in the scoped shell |
| Patched Ergo devnet | online at `http://127.0.0.1:9051` during capture |
| Frontier sidechain | online at `http://127.0.0.1:9945` during capture |
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
| `npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --ergo-source-root <configured-ergo-source-root> --frontier-binary <configured-frontier-binary> --json-out ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-local-nodes-online-prereq-2026-07-07-3de8887a.json` | LOCAL_PREREQS_OK / exit code 0 | [local-nodes-online JSON](artifacts/patched-devnet-go-no-go-local-nodes-online-prereq-2026-07-07-3de8887a.json) |
| `npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-local-nodes-online-prereq-2026-07-07-3de8887a.json` | PASS / exit code 0 | [validation output](artifacts/patched-devnet-go-no-go-local-nodes-online-prereq-validation-2026-07-07-3de8887a.md) |

## Current Prerequisite Result

| Category | Count | Detail |
|---|---:|---|
| PASS checks | 15 | Configured source location, configured Frontier binary, required local launcher files, required npm scripts, scoped loopback endpoint bindings, patched Ergo devnet reachability, and Frontier reachability are present |
| WARN checks | 4 | Secret inspection disabled, runtime-state inspection skipped, funding skipped, signer alignment not checked |
| FAIL checks | 0 | None |
| Final verdict | 0 | `LOCAL_PREREQS_OK -- EXECUTION NOT READY` until runtime-state inspection, scoped funding, signer alignment, readiness, and explicit approval are handled |

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
| Local node reachability captured | yes |

## Gate 3 Handling

| Claim | Decision |
|---|---|
| Gate 3 closure supported | no |
| Live execution approved | no |
| Broadcast authorization granted | no |
| Release claim support | no |
| Next action | Run a private local operator capture for runtime-state, funding, and signer alignment without serializing wallet material or node config secrets |
