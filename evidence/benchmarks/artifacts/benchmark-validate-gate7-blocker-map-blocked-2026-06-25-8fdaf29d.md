# Benchmark Validate Gate 7 Blocker Map - 2026-06-25 - 8fdaf29d

Command:

```powershell
npm run benchmark:validate -- ../evidence/benchmarks/gate7-benchmark-blocker-map-2026-06-25-8fdaf29d.md
```

Result: BLOCKED / exit code 1.

Observed validator summary:

```text
Benchmark evidence BLOCKED: 13 structural issue(s).
```

Focused blocker list:

- Metric Table: Single-claim settlement baseline must be linked before Gate 7 evidence can pass.
- Metric Table: Batch settlement must be linked before Gate 7 evidence can pass.
- Metric Table: Sharded lanes planner must be linked before Gate 7 evidence can pass.
- Metric Table: Live batch settlement must be linked before Gate 7 evidence can pass.
- Publication Decision: Release supported must not be none before benchmark evidence can pass.
- Publication Decision: Scaling claims allowed must be yes before Gate 7 evidence can pass.
- Publication Decision: Open benchmark blockers must be 0 before benchmark evidence can pass.
- Publication Decision: Release notes updated must be yes before benchmark evidence can pass.
- Publication Decision: Required release-note updates must include a link, command, or artifact marker.
- Publication Decision: Required checklist updates must include a link, command, or artifact marker.
- Reviewer Sign-Off: Benchmark owner must approve before benchmark evidence can pass.
- Reviewer Sign-Off: Security reviewer must approve before benchmark evidence can pass.
- Reviewer Sign-Off: Operator reviewer must approve before benchmark evidence can pass.

Boundary:

- This artifact records the current Gate 7 benchmark blocker map validation.
- It is not completed Gate 7 benchmark evidence.
- It does not support live settlement, production throughput, testnet
  production-candidate, mainnet, or full parallel L1 settlement claims.
