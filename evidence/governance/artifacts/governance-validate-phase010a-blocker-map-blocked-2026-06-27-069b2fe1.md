# Committee Governance Evidence Validation Report

This report records one committee governance validator result. It does not authorize public claims, release claims, publishing, deployment, key rotation, governance mutation, or transaction broadcast.

## Command Result

| Field | Value |
|---|---|
| Command | npm run governance:validate -- ../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-27-069b2fe1.md --report-out <report.md> |
| Working directory | ergo-sidechain-bridge/relayer |
| Validated target | ../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-27-069b2fe1.md |
| Result | BLOCKED |
| Exit code | 1 |
| Structural issues | 37 |
| Stack trace emitted | no |
| Local path emitted | no |

## Issue Groups

| Issue group | Count | Operator meaning |
|---|---:|---|
| Scope | 6 | One or more governed surfaces lacks completed authority-transition evidence |
| Required commands | 4 | One or more required governance/check commands lacks command-specific completed output evidence |
| Rotation plan | 11 | One or more key-rotation steps lacks linked evidence, identifiers, stop conditions, or disjoint old/new committee bindings |
| Positive checks | 2 | One or more expected new-committee acceptance checks lacks completed evidence |
| Negative checks | 4 | One or more rejection, broadcast-disabled, or wrong-network negative checks lacks completed evidence |
| Publication rules | 7 | Governance-ready, release support, open blocker, release-note, checklist, or external review publication fields are incomplete |
| Reviewer sign-off | 3 | Governance owner, security reviewer, or operator reviewer approval is incomplete or inconsistent |

## Structural Issue Examples

- Scope: SideChainState successor authorization: status must be linked before committee governance evidence can pass
- Scope: DUP authorization: status must be linked before committee governance evidence can pass
- Scope: Aggregate DUP authorization: status must be linked before committee governance evidence can pass
- Scope: Batch DUP authorization: status must be linked before committee governance evidence can pass
- Scope: MainChainLock normal path: status must be linked before committee governance evidence can pass
- Scope: SPVTracker ingest authorization: status must be linked before committee governance evidence can pass
- Required Commands: npm run contracts:check: status must be linked before committee governance evidence can pass
- Required Commands: npm run demo:readiness: status must be linked before committee governance evidence can pass
- Required Commands: npm run status: status must be linked before committee governance evidence can pass
- Required Commands: spike010a-committee-guard-eval.ts: status must be linked before committee governance evidence can pass
- Rotation Plan: Identify old committee public keys: status must be linked before committee governance evidence can pass
- Rotation Plan: Identify old committee public keys: required evidence must include at least one concrete public key/hash identifier
- Rotation Plan: Identify new committee public keys: status must be linked before committee governance evidence can pass
- Rotation Plan: Identify new committee public keys: required evidence must include at least 3 concrete public key/hash identifiers matching Committee member count

## Boundary

| Boundary | Value |
|---|---|
| Evidence target read | yes |
| Committee governance validator completed | yes |
| Public claim authorization granted | no |
| Release gate PASS claimed | no |
| Gate 6 committee governance closure claimed | no |
| Key rotation authorization granted | no |
| Runtime database or deployment state opened | no |
| Transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed | no |
