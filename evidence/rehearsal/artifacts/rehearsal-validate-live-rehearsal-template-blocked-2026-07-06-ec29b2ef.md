# Rehearsal Evidence Validation Report

This report records one Gate 3 rehearsal validator result. It does not authorize public claims, release claims, publishing, deployment, live submit, or transaction broadcast.

## Command Result

| Field | Value |
|---|---|
| Command | npm run rehearsal:validate -- ../docs/live-rehearsal-template.md --report-out <report.md> |
| Working directory | ergo-sidechain-bridge/relayer |
| Validated target | ../docs/live-rehearsal-template.md |
| Result | BLOCKED |
| Exit code | 1 |
| Structural issues | 65 |
| Stack trace emitted | no |
| Local path emitted | no |

## Issue Groups

| Issue group | Count | Operator meaning |
|---|---:|---|
| Evidence hygiene | 1 | The evidence text has unresolved, duplicate, placeholder, or unsafe evidence markers |
| Session metadata | 8 | Session date, operator, reviewer, environment, commit, network, or broadcast mode metadata is incomplete |
| Reviewer sign-off | 6 | Reviewer identity, dates, classification, blockers, or follow-up fields are incomplete |
| Preflight evidence | 9 | Clean deployment, ContextExtension guard, height, or broadcast-policy prerequisites are incomplete |
| Dry-run settlement evidence | 13 | Dry-run transaction, approval, burn, anchor, or /transactions/check evidence is incomplete |
| Rollback and cleanup | 5 | Rollback readiness, cleanup checks, or post-rehearsal stop conditions are incomplete |
| Publication evidence | 11 | Release-note/checklist updates or production/testnet claim-boundary fields are incomplete |
| Lifecycle rows | 11 | One or more lifecycle gate rows is missing, duplicated, malformed, or lacks row-specific evidence |
| Reconciliation | 1 | Settlement successor, DUP/SPV tracker, payout, or burn reconciliation evidence is incomplete |

## Structural Issue Examples

- Rehearsal Evidence: evidence hygiene must not contain runtime database, deployment-state, or diagnostic dump artifacts
- Session Metadata: Date is required
- Session Metadata: Operator is required
- Session Metadata: Reviewer is required
- Session Metadata: Environment is required
- Session Metadata: Git commit is required
- Session Metadata: Release level being evaluated is required
- Session Metadata: Ergo node network is required
- Session Metadata: Sidechain network is required
- Reviewer Sign-Off: Classification is required
- Reviewer Sign-Off: Publication blockers discovered is required
- Reviewer Sign-Off: Follow-up tests required is required
- Reviewer Sign-Off: Follow-up runbook changes required is required
- Reviewer Sign-Off: Reviewer is required

## Boundary

| Boundary | Value |
|---|---|
| Evidence target read | yes |
| Rehearsal validator completed | yes |
| Public claim authorization granted | no |
| Release gate PASS claimed | no |
| Gate 3 lifecycle closure claimed | no |
| Live execution approval granted | no |
| Runtime database or deployment state opened | no |
| Transaction broadcast, submit, deploy, signing, runtime database access, or state mutation performed | no |
