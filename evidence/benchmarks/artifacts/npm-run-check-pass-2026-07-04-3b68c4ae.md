# npm run check Command Output - 2026-07-04 - 3b68c4ae

## Command

`npm run check`

## Boundary

- Node queries: no
- Runtime database opened: no
- Deployment-state file opened: no
- Transaction signing: no
- Transaction submission, deployment, publication, or broadcast: no

## Result

PASS exit code 0.

Observed summary:

- Node version guard: passed under Node v24.14.0.
- WASM build: passed.
- TypeScript build: passed.
- Test files: 118 passed.
- Tests: 6,909 passed.

The project `check` script used the bounded Vitest runner. The benchmark code
baseline for this evidence packet is `3b68c4ae`; this command was rerun during
the Gate 7 evidence refresh cycle and produced the summary above.

This artifact is benchmark command output evidence for the Gate 7 offline
structured benchmark candidate.
