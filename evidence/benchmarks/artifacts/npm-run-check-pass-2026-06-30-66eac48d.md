# Gate 7 Current-HEAD Relayer Check Output

## Command Result

| Field | Value |
|---|---|
| Result | PASS |
| Exit code | 0 |
| Command label | npm run check |
| Invocation boundary | Node 24.14.0 was used for the relayer check; tsx module.register deprecation warnings were suppressed without changing assertions or exit status |
| Git commit | 66eac48d |
| Date | 2026-06-30 |
| Runtime database opened | no |
| Deployment state opened | no |
| Transaction broadcast, submit, deploy, or state mutation performed | no |

## Output Summary

| Step | Result |
|---|---|
| node:guard | PASS |
| wasm:build | PASS |
| TypeScript build | PASS |
| bounded Vitest suite | PASS |

## Test Summary

| Metric | Value |
|---|---:|
| Test files | 103 |
| Tests | 6742 |
| Failed tests | 0 |

## Boundary

- This is command-output evidence for `npm run check`.
- It does not claim Gate 7 closure, release-gate PASS, production readiness, mainnet readiness, live settlement, signing, deployment, publication, or transaction broadcast.
- Gate 7 remains blocked until the linked benchmark validator and release gate report zero structural issues with the required live, reviewer, and publication-boundary evidence.
