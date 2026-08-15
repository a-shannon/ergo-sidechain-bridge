# Committee Governance Evidence Validation Report

This report records one committee governance validator result. It does not authorize public claims, release claims, publishing, deployment, key rotation, governance mutation, or transaction broadcast.

## Command Result

| Field | Value |
|---|---|
| Command | npm run governance:validate -- ..\evidence\governance\phase010a-committee-governance-blocker-map-2026-06-29-f341ad8c.md --report-out <report.md> |
| Working directory | ergo-sidechain-bridge/relayer |
| Validated target | ..\evidence\governance\phase010a-committee-governance-blocker-map-2026-06-29-f341ad8c.md |
| Result | BLOCKED |
| Exit code | 1 |
| Structural issues | 17 |
| Stack trace emitted | no |
| Local path emitted | no |

## Issue Groups

| Issue group | Count | Operator meaning |
|---|---:|---|
| Rotation plan | 6 | One or more key-rotation steps lacks linked evidence, identifiers, stop conditions, or disjoint old/new committee bindings |
| Negative checks | 1 | One or more rejection, broadcast-disabled, or wrong-network negative checks lacks completed evidence |
| Publication rules | 7 | Governance-ready, release support, open blocker, release-note, checklist, or external review publication fields are incomplete |
| Reviewer sign-off | 3 | Governance owner, security reviewer, or operator reviewer approval is incomplete or inconsistent |

## Structural Issue Examples

- Rotation Plan: Identify old committee public keys: status must be linked before committee governance evidence can pass
- Rotation Plan: Identify old committee public keys: required evidence must include at least one concrete public key/hash identifier
- Rotation Plan: Identify new committee public keys: status must be linked before committee governance evidence can pass
- Rotation Plan: Identify new committee public keys: required evidence must include at least 3 concrete public key/hash identifiers matching Committee member count
- Rotation Plan: Reconcile deployment state: status must be linked before committee governance evidence can pass
- Rotation Plan: Verify rollback plan: status must be linked before committee governance evidence can pass
- Negative Checks: Deployment state points to the wrong network: status must be linked before committee governance evidence can pass
- Publication Rules: Release supported must not be none before committee governance evidence can pass
- Publication Rules: Governance-ready claim allowed must be yes before committee governance evidence can pass
- Publication Rules: Open governance blockers must be 0 before committee governance evidence can pass
- Publication Rules: Reviewer decision summary must use exact Governance-ready claim allowed = yes
- Publication Rules: Reviewer decision summary must use exact Open governance blockers = 0
- Publication Rules: Reviewer decision summary: open governance blockers must be 0
- Publication Rules: External review evidence must include a link, command, or artifact marker

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
