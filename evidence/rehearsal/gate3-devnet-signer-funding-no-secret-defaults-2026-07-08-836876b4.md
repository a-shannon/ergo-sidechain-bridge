# Gate 3 Devnet Signer/Funding No-Secret Defaults

This artifact records the current no-secret default behavior for the local
patched-devnet signer and funding diagnostics. It is prerequisite evidence for
the private operator capture path only. It does not prove signer alignment,
funding sufficiency, runtime-state readiness, transaction signing, broadcast,
deployment, reconciliation, Gate 3 closure, or release readiness.

## Summary

| Field | Value |
| --- | --- |
| Source commit | 836876b4 |
| Date | 2026-07-08 |
| Scope | Gate 3 local-devnet prerequisite |
| Result | Default signer/funding checks are no-secret and operator-gated |
| Gate 3 lifecycle closure supported | no |
| Release gate PASS supported | no |
| Production-ready claim supported | no |
| Testnet production-candidate claim supported | no |

## Code Changes Verified

| Area | Behavior |
| --- | --- |
| `demo:devnet:signer` | Default mode does not read mnemonic values or node config files. Secret-material derivation requires `--include-secret-material`. |
| `demo:devnet:funding` | Default mode does not read mnemonic values. Public no-secret balance checking is available with `--address <relayer-address>`. Secret-material derivation requires `--include-secret-material`. |
| `demo:patched-devnet:plan` | Step 4 now separates safe default checks, public address balance checks, and operator-local secret-material checks. |

## Command Evidence

| Command | Exit code | Observed result |
| --- | ---: | --- |
| `npm test -- --run src/devnet-signer-alignment.test.ts src/devnet-funding-preflight.test.ts src/devnet-session-env.test.ts src/patched-devnet-go-no-go.test.ts` | 0 | 4 test files passed, 111 tests passed. |
| `npm run demo:devnet:signer` | 0 | Reported `Config: (not inspected)` and WARN rows for mining target and signer alignment not inspected because secret material inspection is disabled. |
| `npm run demo:devnet:funding` | 0 | Reported WARN `Relayer signer config: secret material inspection disabled by default`, plus minimum `0.15 ERG` and comfortable `0.5 ERG` thresholds. |
| `npm run demo:devnet:signer -- --help` | 0 | Help states default mode does not read mnemonic values, node configs, environment files, runtime databases, or deployment state; local derivation requires `--include-secret-material`. |
| `npm run demo:devnet:funding -- --help` | 0 | Help states default mode does not read mnemonic values, supports `--address <relayer-address>` for public balance checks, and requires `--include-secret-material` for local derivation. |

## Operator Boundary

| Boundary | Value |
| --- | --- |
| Environment files read | no |
| Mnemonic or private key value read by default | no |
| Node config file read by default | no |
| Runtime database opened | no |
| Deployment-state file opened | no |
| Transaction signing performed | no |
| Transaction broadcast, submit, deploy, confirmation, or reconciliation performed | no |
| Gate 3 closure claimed | no |

## Next Action

The next Gate 3 step is an operator-private local capture:

1. Run `demo:devnet:funding -- --address <relayer-address>` for a public
   no-secret balance check when the relayer address can be shared safely.
2. Run `demo:devnet:signer -- --include-secret-material` and
   `demo:devnet:funding -- --include-secret-material` only in a scoped private
   local devnet shell when signer/mining alignment and reward-box funding must
   be derived.
3. Return only PASS/BLOCKED summaries, redacted signer/funding status, and
   command-output evidence. Do not provide wallet recovery material, private
   keys, raw node config values, runtime databases, or deployment-state dumps.
