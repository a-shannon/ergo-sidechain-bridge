# Bridge Readiness Runtime Prerequisites

This report combines the default or JSON-backed readiness triage with the non-mainnet Ergo node preflight.
It is planning output only and does not close evidence rows, authorize claims, deploy, sign, submit, or broadcast transactions.

## Summary

| Field | Value |
|---|---|
| Command | npm run readiness:runtime-prereqs -- --triage-json ../evidence/readiness/readiness-triage-2026-06-30-52c7bcff.json --node-preflight-json ../evidence/readiness/node-preflight-testnet-2026-06-30-817f801d.json --anchor-preflight-json ../evidence/readiness/anchor-preflight-explicit-testnet-scan-2026-06-30-41f7d9ec.json --out <report.md> --json-out <report.json> |
| Result | READY |
| Exit code | 0 |
| Total structural issues | 40 |
| Node-backed/live-drill issues | 9 |
| Reviewer/external issues | 24 |
| Claim/publication-boundary issues | 7 |
| Local evidence issues | 0 |
| Readiness triage source | json report: ../evidence/readiness/readiness-triage-2026-06-30-52c7bcff.json |
| Node preflight | PASS |
| Node preflight source | json report: ../evidence/readiness/node-preflight-testnet-2026-06-30-817f801d.json |
| Anchor preflight | FAIL |
| Anchor preflight source | json report: ../evidence/readiness/anchor-preflight-explicit-testnet-scan-2026-06-30-41f7d9ec.json |
| Anchor count | 0 |
| Anchor expected root mode | generic-diagnostic |
| Node endpoint | http://213.239.193.208:9052 |

## Next Actions

- Collect node-backed/live-drill evidence for Gate 5 trustless burn, Gate 6 committee governance and Gate 7 benchmark before changing claim/publication fields.
- Route reviewer/external blockers to human review material after the concrete runtime evidence exists.
- Do not unlock claim/publication fields until node-backed, local-evidence, and reviewer/external blockers are all resolved.

## Node-Backed/Live Drill Blockers

| Lane | Issue |
|---|---|
| Gate 5 trustless burn | Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Required Components: Sidechain header/finality verifier: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Required Components: SPV relay contract or tracker: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Required Components: DUP settlement binding: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Positive Proof Acceptance: Valid burn proof acceptance: status must be linked before Gate 5 evidence can pass |
| Gate 6 committee governance | Rotation Plan: Reconcile deployment state: status must be linked before committee governance evidence can pass |
| Gate 6 committee governance | Negative Checks: Deployment state points to the wrong network: status must be linked before committee governance evidence can pass |
| Gate 7 benchmark | Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass |

## Boundary

| Boundary | Value |
|---|---|
| Planning output only | yes |
| Readiness triage JSON reused | yes |
| Node preflight executed | no |
| Node preflight JSON reused | yes |
| Live node probe executed by runtime prerequisites | no |
| Anchor preflight JSON reused | yes |
| Non-mainnet node prerequisite available | yes |
| Claim/publication fields unlocked | no |
| ERGO_API_KEY read | no |
| Auth header sent | no |
| Runtime database opened | no |
| Deployment state opened | no |
| Private key material serialized | no |
| Anchor evidence row closure claimed | no |
| Evidence row closure claimed | no |
| Release gate PASS claimed | no |
| Public claim authorization granted | no |
| Transaction broadcast, submit, deploy, key rotation, or state mutation performed | no |
