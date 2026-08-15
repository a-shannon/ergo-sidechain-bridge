# npm run check Command Output - 2026-07-01 - 5d37c906

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
- Test files: 105 passed.
- Tests: 6,774 passed.

The project `check` script uses the bounded Vitest runner so the required
release-readiness check runs the complete test corpus without the local Windows
parallel runner drain issue.

This artifact is benchmark command output evidence for the Gate 7 offline
structured benchmark candidate.
