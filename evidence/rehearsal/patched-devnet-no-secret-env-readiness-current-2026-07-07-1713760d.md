# Patched Devnet No-Secret Env And Readiness Preflight - 2026-07-07 - 1713760d

This evidence records the current no-secret preflight state for a future local
patched-devnet lifecycle rehearsal. It verifies that the session environment can
now be checked without reading mnemonic values, node config secrets, private
runtime databases, or deployment-state files. It is not completed Gate 3
lifecycle evidence.

## Preflight Classification

| Field | Value |
|---|---|
| Evidence name | patched-devnet no-secret env and readiness preflight |
| Git commit | 1713760d |
| Branch | codex/bridge-prod-readiness |
| Environment | local source, local launcher, Java/sbt, loopback endpoint, and no-secret env preflight |
| Source location handling | configured source present; local path not serialized |
| Launcher handling | launcher present; local path not serialized |
| Secret env inspection | disabled by default |
| Node config inspection | disabled by default |
| Runtime state inspection | not performed |
| Deployment-state inspection | not performed |
| Broadcast mode | disabled |
| Signing mode | disabled |
| Deployment mode | disabled |
| Reviewer | A. Shannon |
| Date | 2026-07-07 |

## Command Evidence

| Command | Result | Evidence |
|---|---|---|
| `npm run demo:devnet:env` with loopback devnet env vars and no `WALLET_MNEMONIC` | PASS/WARN / exit code 0 | 4 PASS, 3 WARN; node URLs aligned to `http://127.0.0.1:9051`; batch config ready; secret material, `WALLET_MNEMONIC`, and signer/mining alignment not inspected |
| `npm run demo:patched-devnet:readiness` with configured source root and loopback devnet env vars | PASS/WARN / exit code 0 | local source present, launcher present, sbt present, Java 17 present, node env vars aligned, patched Ergo devnet offline |
| `npm test -- --run src/devnet-session-env.test.ts src/devnet-signer-alignment.test.ts` | PASS / exit code 0 | 2 test files, 57 tests passed |

## Current Preflight Result

| Category | Count | Detail |
|---|---:|---|
| Env PASS checks | 4 | Node URLs aligned to loopback, batch mode enabled, max claims bounded at 10, anchor confirmations set to 1 |
| Env WARN checks | 3 | Secret material inspection disabled, `WALLET_MNEMONIC` not inspected, signer/mining alignment not inspected |
| Readiness PASS checks | 5 | Configured source, launcher, sbt, Java runtime, and loopback Ergo node env vars are present |
| Readiness WARN checks | 1 | Patched Ergo devnet is offline at `http://127.0.0.1:9051` |
| Readiness FAIL checks | 0 | None after configured source root is supplied |
| Final verdict | n/a | No-secret prerequisites are ready for operator-controlled patched Ergo devnet startup, but execution is not ready until the local node is online and signer/funding checks are handled without exposing wallet material |

## Boundary

| Boundary | Value |
|---|---|
| `.env` file loaded | no |
| Secret env value read | no |
| Node config file read | no |
| Mnemonic inspection | no |
| Runtime state inspection | no |
| Deployment-state inspection | no |
| SQLite runtime-state inspection | no |
| Signing | no |
| Broadcast | no |
| Database write by bridge tooling | no |
| Deployment | no |
| Patched Ergo devnet reached | no |
| Frontier sidechain reached | not checked in this preflight |

## Gate 3 Handling

| Claim | Decision |
|---|---|
| Gate 3 closure supported | no |
| Live execution approved | no |
| Broadcast authorization granted | no |
| Release claim support | no |
| Next action | Start the patched Ergo devnet in a controlled local session, rerun go/no-go with runtime-state inspection in scope only after operator-controlled backups, then handle funding and signer alignment without exposing wallet material |
