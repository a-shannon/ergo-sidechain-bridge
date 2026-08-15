# Completed Current Sharded Lanes Metrics - 2026-06-25 - ca56646f

Command:

```powershell
npm run showcase:metric-rows
```

Result: PASS / exit code 0.

Scenario: Sharded lanes planner.

Measurements:

- Sample count: 3.
- Build time runs: 4 ms, 1.3 ms, 1.4 ms.
- Mean build time: 2.2 ms.
- Proof size: max lane tracker proof 228 B, max lane DUP lookup 67 B,
  max lane DUP insert 69 B, max lane claim cores 654 B, lane claim split 4 + 6.
- Unsigned EIP-12 JSON transaction shape: 9073 bytes.
- Cost-relevant counts: inputs=6 outputs=16 vars=66 batch=10.
- Throughput: 10 planned settlements across 2 lanes in the offline sharded planner.
- Latency: 2.2 ms offline sharded planning and lane transaction-shape build latency.

Boundary:

- Sharded planner values are per-lane unsigned transaction-shape candidates
  with SPVTracker still shared.
- This is not live benchmark evidence.
- It does not authorize full parallel L1 settlement claims.
