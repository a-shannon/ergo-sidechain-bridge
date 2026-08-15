# npm run check Command Output - 2026-07-03 - 8100681e

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
- Tests: 6,900 passed.
- Duration: 1107.47s.

The project `check` script used the bounded Vitest runner. The benchmark code
baseline for this evidence packet is `8100681e`; this command was rerun during
the Gate 7 evidence refresh cycle and produced the summary above.

This artifact is benchmark command output evidence for the Gate 7 offline
structured benchmark candidate.
