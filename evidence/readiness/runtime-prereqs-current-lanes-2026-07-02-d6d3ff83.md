# Bridge Readiness Runtime Prerequisites

This report combines the default or JSON-backed readiness triage with the non-mainnet Ergo node preflight.
It is planning output only and does not close evidence rows, authorize claims, deploy, sign, submit, or broadcast transactions.

## Summary

| Field | Value |
|---|---|
| Command | npm run readiness:runtime-prereqs -- --triage-json ../evidence/readiness/readiness-triage-current-lanes-2026-07-02-d6d3ff83.json --node-preflight-json ../evidence/readiness/node-preflight-testnet-2026-07-02-5dbaa14d.json --anchor-preflight-json ../evidence/readiness/anchor-preflight-observation-export-testnet-2026-07-02-c53f299f.json --out <report.md> --json-out <report.json> |
| Result | READY |
| Exit code | 0 |
| Total structural issues | 38 |
| Node-backed/live-drill issues | 7 |
| Reviewer/external issues | 24 |
| Claim/publication-boundary issues | 7 |
| Local evidence issues | 0 |
| Local-only closure status | External Or Live Required |
| Local-only closure issues | 0 |
| External/live/claim closure issues | 38 |
| Manual triage issues | 0 |
| Local closure summary | No local-only closure candidates remain for the selected lanes; next progress requires non-mainnet/live evidence, external review, human approval, or claim fields that must wait for those blockers. |
| Readiness triage source | json report: ../evidence/readiness/readiness-triage-current-lanes-2026-07-02-d6d3ff83.json |
| Node preflight | PASS |
| Node preflight source | json report: ../evidence/readiness/node-preflight-testnet-2026-07-02-5dbaa14d.json |
| Anchor preflight | FAIL |
| Anchor preflight source | json report: ../evidence/readiness/anchor-preflight-observation-export-testnet-2026-07-02-c53f299f.json |
| Anchor count | 0 |
| Anchor expected root mode | root-bound |
| Node endpoint | http://213.239.193.208:9052 |

## Next Actions

- Collect node-backed/live-drill evidence for Gate 5 trustless burn and Gate 7 benchmark before changing claim/publication fields.
- No local-only closure candidates remain for the selected lanes; next progress requires non-mainnet/live evidence, external review, human approval, or claim fields that must wait for those blockers.
- Route reviewer/external blockers to human review material after the concrete runtime evidence exists.
- Do not unlock claim/publication fields until node-backed/live-drill and reviewer/external blockers are resolved.

## Node-Backed/Live Drill Blockers

| Lane | Issue |
|---|---|
| Gate 5 trustless burn | Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Required Components: Sidechain header/finality verifier: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Required Components: SPV relay contract or tracker: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Required Components: DUP settlement binding: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Positive Proof Acceptance: Valid burn proof acceptance: status must be linked before Gate 5 evidence can pass |
| Gate 7 benchmark | Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass |

## Triage Lane Targets

| Lane | Target |
|---|---|
| Gate 5 trustless burn | ../evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-06-29-5d075bd9.md |
| Gate 6 committee governance | ../evidence/governance/phase010a-committee-governance-blocker-map-2026-07-02-cb31d9f3.md |
| Gate 7 benchmark | ../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-02-aa729be2.md |

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
