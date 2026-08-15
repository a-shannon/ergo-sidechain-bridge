# Bridge Readiness Handoff Validation

This report validates a generated readiness handoff JSON artifact without closing evidence rows or authorizing claims.

## Summary

| Field | Value |
|---|---|
| Command | npm run readiness:handoff:validate -- ../evidence/readiness/readiness-handoff-current-lanes-2026-07-03-af70f9c8.json --expected-source-commit af70f9c8 --report-out <report.md> --json-out <report.json> |
| Result | PASS |
| Exit code | 0 |
| Source commit | af70f9c8 |
| Expected source commit | af70f9c8 |
| Handoff source | ../evidence/readiness/readiness-handoff-current-lanes-2026-07-03-af70f9c8.json |
| Local evidence requests | 0 |
| Live evidence requests | 11 |
| Reviewer/external requests | 59 |
| Lane packets | 4 |
| Lane packet covered requests | 70 |
| Operator input checklists | 4 |
| Operator evidence inputs | 16 |
| Structural issues | 0 |

## Lane Coverage

| Lane | Requests | Operator inputs | Template | Validator command | Release-gate flag |
|---|---:|---:|---|---|---|
| Independent security review | 39 | 4 | ../docs/independent-security-review-evidence-template.md | npm run security:validate -- <completed-independent-security-review.md> | --security-review-evidence <completed-independent-security-review.md> |
| Trustless burn verification | 19 | 6 | ../docs/trustless-burn-verification-evidence-template.md | npm run trustless:validate -- <completed-trustless-burn-evidence.md> | --trustless-burn-evidence <completed-trustless-burn-evidence.md> |
| Benchmark and scaling evidence | 5 | 3 | ../docs/performance-benchmark-evidence-template.md | npm run benchmark:validate -- <completed-benchmark-evidence.md> | --benchmark-evidence <completed-benchmark-evidence.md> |
| Committee governance and key rotation | 7 | 3 | ../docs/committee-governance-evidence-template.md | npm run governance:validate -- <completed-committee-governance-evidence.md> | --governance-evidence <completed-committee-governance-evidence.md> |

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
