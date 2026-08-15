# Bridge Readiness Handoff Validation

This report validates a generated readiness handoff JSON artifact without closing evidence rows or authorizing claims.

## Summary

| Field | Value |
|---|---|
| Command | npm run readiness:handoff:validate -- ../evidence/readiness/readiness-handoff-2026-07-02-48323e35.json --report-out <report.md> --json-out <report.json> |
| Result | PASS |
| Exit code | 0 |
| Handoff source | ../evidence/readiness/readiness-handoff-2026-07-02-48323e35.json |
| Live evidence requests | 9 |
| Lane packets | 3 |
| Lane packet covered requests | 9 |
| Operator input checklists | 3 |
| Operator evidence inputs | 10 |
| Structural issues | 0 |

## Lane Coverage

| Lane | Requests | Operator inputs | Template | Validator command | Release-gate flag |
|---|---:|---:|---|---|---|
| Trustless burn verification | 6 | 4 | ../docs/trustless-burn-verification-evidence-template.md | npm run trustless:validate -- <completed-trustless-burn-evidence.md> | --trustless-burn-evidence <completed-trustless-burn-evidence.md> |
| Committee governance and key rotation | 2 | 3 | ../docs/committee-governance-evidence-template.md | npm run governance:validate -- <completed-committee-governance-evidence.md> | --governance-evidence <completed-committee-governance-evidence.md> |
| Benchmark and scaling evidence | 1 | 3 | ../docs/performance-benchmark-evidence-template.md | npm run benchmark:validate -- <completed-benchmark-evidence.md> | --benchmark-evidence <completed-benchmark-evidence.md> |

## Structural Issues

- None.

## Boundary

| Boundary | Value |
|---|---|
| Planning output only | yes |
| Handoff JSON reused | yes |
| Runtime prerequisites JSON reused | yes |
| Live node probe executed by handoff validation | no |
| ERGO_API_KEY read | no |
| Auth header sent | no |
| Runtime database opened | no |
| Deployment state opened | no |
| Private key material serialized | no |
| Evidence row closure claimed | no |
| Release gate PASS claimed | no |
| Public claim authorization granted | no |
| Claim/publication fields unlocked | no |
| Transaction broadcast, submit, deploy, key rotation, or state mutation performed | no |
