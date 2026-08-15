# npm run check Command Output - 2026-07-02 - ae94e8a7

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

- Node version guard: passed.
- WASM build: passed.
- TypeScript build: passed.
- Test files: 111 passed.
- Tests: 6,851 passed.

The project `check` script used the bounded Vitest runner. The benchmark code
baseline for this evidence packet is `ae94e8a7`; this command was rerun during
the Gate 7 evidence refresh cycle and produced the summary above.

This artifact is benchmark command output evidence for the Gate 7 offline
structured benchmark candidate.
