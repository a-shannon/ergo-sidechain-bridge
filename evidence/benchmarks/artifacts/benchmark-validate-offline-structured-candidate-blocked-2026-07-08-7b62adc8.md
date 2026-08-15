# Benchmark Evidence Validation Report

This report records one benchmark validator result. It does not authorize public claims, release claims, publishing, deployment, or transaction broadcast.

## Command Result

| Field | Value |
|---|---|
| Command | npm run benchmark:validate -- ../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-08-7b62adc8.md --report-out <report.md> |
| Working directory | ergo-sidechain-bridge/relayer |
| Validated target | ../evidence/benchmarks/gate7-offline-structured-candidate-2026-07-08-7b62adc8.md |
| Result | BLOCKED |
| Exit code | 1 |
| Structural issues | 6 |
| Stack trace emitted | no |
| Local path emitted | no |

## Issue Groups

| Issue group | Count | Operator meaning |
|---|---:|---|
| Live batch settlement | 1 | Live batch evidence is still absent or incomplete and cannot be inferred from offline outputs |
| Publication decision | 2 | Release-note/checklist updates, blocker closure, or claim-boundary decision fields are incomplete |
| Reviewer sign-off | 3 | Benchmark owner, security reviewer, or operator reviewer approval is incomplete or inconsistent |

## Structural Issue Examples

- Metric Table: Live batch settlement: status must be linked before Gate 7 evidence can pass
- Publication Decision: Open benchmark blockers must be 0 before benchmark evidence can pass
- Publication Decision: Reviewer decision summary: open benchmark blockers must be 0
- Reviewer Sign-Off: Benchmark owner: decision must be approve before benchmark evidence can pass
- Reviewer Sign-Off: Security reviewer: decision must be approve before benchmark evidence can pass
- Reviewer Sign-Off: Operator reviewer: decision must be approve before benchmark evidence can pass

## Boundary

| Boundary | Value |
|---|---|
| Evidence target read | yes |
| Benchmark validator completed | yes |
| Public claim authorization granted | no |
| Release gate PASS claimed | no |
| Runtime database or deployment state opened | no |
| Transaction broadcast, submit, deploy, or state mutation performed | no |
