# Bridge Readiness Runtime Prerequisites

This report combines the default or JSON-backed readiness triage with the non-mainnet Ergo node preflight.
It is planning output only and does not close evidence rows, authorize claims, deploy, sign, submit, or broadcast transactions.

## Summary

| Field | Value |
|---|---|
| Command | npm run readiness:runtime-prereqs -- --triage-json ../evidence/readiness/readiness-triage-current-lanes-2026-07-08-91c3904e.json --node-preflight-json ../evidence/readiness/node-preflight-testnet-2026-07-06-233729a0.json --anchor-preflight-json ../evidence/trustless-burn/anchor-preflight-root-bound-testnet-2026-07-08-91c3904e.json --out <report.md> --json-out <report.json> |
| Result | READY |
| Exit code | 0 |
| Source commit | 91c3904e |
| Total structural issues | 80 |
| Node-backed/live-drill issues | 10 |
| Reviewer/external issues | 59 |
| Claim/publication-boundary issues | 11 |
| Local evidence issues | 0 |
| Local-only closure status | External Or Live Required |
| Local-only closure issues | 0 |
| External/live/claim closure issues | 80 |
| Manual triage issues | 0 |
| Local closure summary | No local-only closure candidates remain for the selected lanes; next progress requires non-mainnet/live evidence, external review, human approval, or claim fields that must wait for those blockers. |
| Readiness triage source | json report: ../evidence/readiness/readiness-triage-current-lanes-2026-07-08-91c3904e.json |
| Node preflight | PASS |
| Node preflight source | json report: ../evidence/readiness/node-preflight-testnet-2026-07-06-233729a0.json |
| Anchor preflight | FAIL |
| Anchor preflight source | json report: ../evidence/trustless-burn/anchor-preflight-root-bound-testnet-2026-07-08-91c3904e.json |
| Anchor count | 0 |
| Anchor expected root mode | root-bound |
| Node endpoint | http://213.239.193.208:9052 |

## Next Actions

- Collect node-backed/live-drill evidence for Gate 4 independent security review, Gate 5 trustless burn and Gate 7 benchmark before changing claim/publication fields.
- No local-only closure candidates remain for the selected lanes; next progress requires non-mainnet/live evidence, external review, human approval, or claim fields that must wait for those blockers.
- Route reviewer/external blockers to human review material after the concrete runtime evidence exists.
- Do not unlock claim/publication fields until node-backed/live-drill and reviewer/external blockers are resolved.

## Local Evidence Blockers

- No local evidence blockers were reported.

## Node-Backed/Live Drill Blockers

| Lane | Issue |
|---|---|
| Gate 4 independent security review | Required Evidence Package: Fresh local devnet rehearsal: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Evidence Package: Fresh testnet rehearsal: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Evidence Package: Failed broadcast / phantom AVL drill: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Evidence Package: Batch settlement check/submit/confirm rehearsal: status must be linked before security review evidence can pass |
| Gate 5 trustless burn | Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Required Components: Sidechain header/finality verifier: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Required Components: DUP settlement binding: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Positive Proof Acceptance: Valid burn proof acceptance: status must be linked before Gate 5 evidence can pass |
| Gate 7 benchmark | Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass |

## Reviewer/External Decision Blockers

| Lane | Issue |
|---|---|
| Gate 4 independent security review | Review Classification: Final decision must be approve before security review evidence can pass |
| Gate 4 independent security review | Required Scope Coverage: ErgoScript contracts: coverage must be covered before Gate 4 evidence can pass |
| Gate 4 independent security review | Required Scope Coverage: ErgoScript contracts: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Scope Coverage: Relayer signing: coverage must be covered before Gate 4 evidence can pass |
| Gate 4 independent security review | Required Scope Coverage: Relayer signing: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Scope Coverage: AVL proof generation: coverage must be covered before Gate 4 evidence can pass |
| Gate 4 independent security review | Required Scope Coverage: AVL proof generation: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Scope Coverage: Settlement reconciliation: coverage must be covered before Gate 4 evidence can pass |
| Gate 4 independent security review | Required Scope Coverage: Settlement reconciliation: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Scope Coverage: Sidechain finality and burn validity: coverage must be covered before Gate 4 evidence can pass |
| Gate 4 independent security review | Required Scope Coverage: Sidechain finality and burn validity: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Scope Coverage: Operator recovery: coverage must be covered before Gate 4 evidence can pass |
| Gate 4 independent security review | Required Scope Coverage: Operator recovery: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Scope Coverage: Dependency risk: coverage must be covered before Gate 4 evidence can pass |
| Gate 4 independent security review | Required Scope Coverage: Dependency risk: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Finding Disposition: Critical findings: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Finding Disposition: High findings: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Finding Disposition: Medium findings: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Finding Disposition: Low findings: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Finding Disposition: Informational findings: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Finding Disposition: Accepted risks: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Finding Disposition: Publication blockers: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Negative Review Checks: Can a production path sign through the Ergo node wallet?: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Negative Review Checks: Can default production/testnet mode sign an unsafe ContextExtension shape?: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Negative Review Checks: Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Negative Review Checks: Can a failed broadcast or reorg insert a phantom DUP key?: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Negative Review Checks: Can a batch settlement accept a wrong-recipient, low-value, or reused payout?: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Negative Review Checks: Can a same-recipient batch collision pay fewer outputs than expected?: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Negative Review Checks: Can stale SPV tracker or DUP history build against the wrong singleton digest?: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Negative Review Checks: Can trusted burn interpretation be mistaken for trustless verification?: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Required Negative Review Checks: Can an operator recover from SQLite loss without private maintainer context?: status must be linked before security review evidence can pass |
| Gate 4 independent security review | Reviewer Sign-Off: Lead reviewer: decision must be approve before security review evidence can pass |
| Gate 4 independent security review | Reviewer Sign-Off: Security owner: decision must be approve before security review evidence can pass |
| Gate 4 independent security review | Reviewer Sign-Off: Maintainer: decision must be approve before security review evidence can pass |
| Gate 4 independent security review | Reviewer Sign-Off: Operator reviewer: decision must be approve before security review evidence can pass |
| Gate 5 trustless burn | Publication Decision: Reviewer decision summary: critical/high findings must be numeric 0 |
| Gate 5 trustless burn | Publication Decision: Reviewer decision summary must mention release support, trustless burn verification implementation, production-ready claim handling, testnet production-candidate claim handling, transitional trusted burn path handling, and critical/high findings |
| Gate 5 trustless burn | Publication Decision: Reviewer decision summary must use exact Trustless burn verification implemented = yes |
| Gate 5 trustless burn | Publication Decision: Reviewer decision summary must use exact Transitional trusted burn path disabled = yes |
| Gate 5 trustless burn | Publication Decision: Reviewer decision summary must use exact Critical/high findings open = 0 |
| Gate 5 trustless burn | Publication Decision: Reviewer decision summary must not leave critical/high findings open |
| Gate 5 trustless burn | Publication Decision: Reviewer decision summary: transitional trusted burn path handling must be disabled, blocked, or not allowed |
| Gate 5 trustless burn | Required Components: Independent review: status must be linked before Gate 5 evidence can pass |
| Gate 5 trustless burn | Reviewer Sign-Off: Protocol reviewer: decision must be approve before Gate 5 evidence can pass |
| Gate 5 trustless burn | Reviewer Sign-Off: Security reviewer: decision must be approve before Gate 5 evidence can pass |
| Gate 5 trustless burn | Reviewer Sign-Off: Security reviewer: notes must state a concrete trustless-burn outcome |
| Gate 5 trustless burn | Reviewer Sign-Off: Operator reviewer: decision must be approve before Gate 5 evidence can pass |
| Gate 5 trustless burn | Reviewer Sign-Off: Operator reviewer: notes must state a concrete trustless-burn outcome |
| Gate 6 committee governance | Publication Rules: Reviewer decision summary must use exact Governance-ready claim allowed = yes |
| Gate 6 committee governance | Publication Rules: Reviewer decision summary must use exact Open governance blockers = 0 |
| Gate 6 committee governance | Publication Rules: Reviewer decision summary: open governance blockers must be 0 |
| Gate 6 committee governance | Publication Rules: External review evidence must include a link, command, or artifact marker |
| Gate 6 committee governance | Reviewer Sign-Off: Governance owner: decision must be approve before committee governance evidence can pass |
| Gate 6 committee governance | Reviewer Sign-Off: Security reviewer: decision must be approve before committee governance evidence can pass |
| Gate 6 committee governance | Reviewer Sign-Off: Operator reviewer: decision must be approve before committee governance evidence can pass |
| Gate 7 benchmark | Publication Decision: Reviewer decision summary: open benchmark blockers must be 0 |
| Gate 7 benchmark | Reviewer Sign-Off: Benchmark owner: decision must be approve before benchmark evidence can pass |
| Gate 7 benchmark | Reviewer Sign-Off: Security reviewer: decision must be approve before benchmark evidence can pass |
| Gate 7 benchmark | Reviewer Sign-Off: Operator reviewer: decision must be approve before benchmark evidence can pass |

## Triage Lane Targets

| Lane | Target |
|---|---|
| Gate 4 independent security review | ../evidence/security/gate4-independent-security-review-blocker-map-2026-06-26-4ec4f7d1.md |
| Gate 5 trustless burn | ../evidence/trustless-burn/gate5-trustless-burn-blocker-map-2026-07-03-1a24c7ae.md |
| Gate 6 committee governance | ../evidence/governance/phase010a-committee-governance-blocker-map-2026-07-03-7f516dcc.md |
| Gate 7 benchmark | ../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-08-05f25f0e.md |

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
