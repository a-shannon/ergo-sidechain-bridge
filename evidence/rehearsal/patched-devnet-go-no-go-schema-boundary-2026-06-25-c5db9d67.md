# Patched Devnet Go/No-Go Schema Boundary - 2026-06-25 - c5db9d67

This evidence records a safe, read-only prerequisite diagnostic for a future
local patched-devnet lifecycle rehearsal. It is not completed Gate 3 lifecycle
evidence.

## Diagnostic Classification

| Field | Value |
| --- | --- |
| Evidence name | patched-devnet go/no-go schema boundary diagnostic |
| Git commit | c5db9d67 |
| Branch | codex/bridge-prod-readiness |
| Environment | local prerequisite check |
| Secret env inspection | disabled |
| Node config inspection | disabled |
| Runtime state inspection | skipped |
| Broadcast mode | disabled |
| Signing mode | disabled |
| Deployment mode | disabled |
| Reviewer | A. Shannon |
| Date | 2026-06-25 |

## Command Evidence

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run demo:patched-devnet:go-no-go -- --skip-runtime-state-checks --json-out ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-schema-boundary-2026-06-25-c5db9d67.json` | LOCAL_PREREQS_OK / exit code 0 | [schema-boundary prerequisite JSON](artifacts/patched-devnet-go-no-go-schema-boundary-2026-06-25-c5db9d67.json) |
| `npm run demo:patched-devnet:go-no-go:validate -- ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-schema-boundary-2026-06-25-c5db9d67.json` | PASS / exit code 0 | [validation output](artifacts/patched-devnet-go-no-go-schema-boundary-validation-2026-06-25-c5db9d67.md) |

## Current Prerequisite Result

| Category | Count | Detail |
| --- | ---: | --- |
| PASS checks | 12 | Required source, Frontier binary, scripts, and local launcher files are present through configured locations |
| WARN checks | 7 | Secret inspection disabled, node config inspection disabled, runtime-state inspection skipped, local nodes offline, funding skipped |
| FAIL checks | 0 | No mandatory local prerequisite failure in the safe diagnostic |
| Final verdict | 1 | `LOCAL_PREREQS_OK` with execution still blocked until live nodes, scoped env, funding, signer alignment, runtime-state inspection, and explicit approval are handled |

## Schema Boundary

| Field | Required value | Validator handling |
| --- | --- | --- |
| `secretEnvInspection` | `disabled` | Blocks enabled secret-env inspection |
| `nodeConfigInspection` | `disabled` | Blocks enabled or missing node config inspection boundary |
| `runtimeStateInspection` | `skipped` | Blocks runtime-state inspection in safe prerequisite evidence |
| Secret env warning row | present | Blocks reports without disabled secret-env warning |
| Node config warning row | present | Blocks reports without disabled node config inspection warning |
| Runtime-state warning row | present | Blocks reports without `--skip-runtime-state-checks` warning |

## Boundary

| Boundary | Value |
| --- | --- |
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
| --- | --- |
| Gate 3 closure supported | no |
| Live execution approved | no |
| Broadcast authorization granted | no |
| Release claim support | no |
| Next action | Start local patched Ergo and Frontier nodes, bind scoped non-secret env values, then run operator-scoped checks only when runtime-state and secret-bearing inspections are explicitly approved |
