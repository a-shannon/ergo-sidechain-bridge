# Completed Current Offline Metric Rows - 2026-06-25 - 5a56dbf4

Command:

```powershell
npm run showcase:metric-rows
```

Result: PASS / exit code 0.

Mode reported by command:

- Local offline.
- Node calls: none.
- Signing: none.
- Broadcast: none.
- Local DB, runtime-state, or deployment-state reads: none.

Normalized output summary:

| Scenario | Sample count | Build time runs | Mean build time | Proof size | Unsigned EIP-12 JSON transaction shape | Cost-relevant counts | Throughput | Latency |
|---|---:|---|---:|---|---:|---|---|---|
| Single-claim settlement baseline | 3 | 4.3 ms, 0.4 ms, 0.3 ms | 1.7 ms | tracker proof 137 B, DUP lookup 67 B, DUP insert 67 B | 2744 bytes | inputs=3 outputs=4 vars=15 batch=1 | 1 settlement per Ergo block in the offline single-claim model | 1.7 ms offline build latency |
| Batch settlement | 3 | 2.4 ms, 1.7 ms, 1.1 ms | 1.7 ms | tracker proof 222 B, DUP lookup 67 B, DUP insert 70 B, claim cores 1090 B | 13893 bytes | inputs=3 outputs=13 vars=58 batch=10 | 10 settlements per Ergo block in the offline batch model | 1.7 ms offline build latency |
| Sharded lanes planner | 3 | 3.2 ms, 1.1 ms, 1 ms | 1.8 ms | max lane tracker proof 228 B, max lane DUP lookup 67 B, max lane DUP insert 69 B, max lane claim cores 654 B, lane claim split 4 + 6 | 9073 bytes | inputs=6 outputs=16 vars=66 batch=10 | 10 planned settlements across 2 lanes in the offline sharded planner | 1.8 ms offline sharded planning and lane transaction-shape build latency |

Boundary:

- Transaction-size values are unsigned EIP-12 JSON transaction-shape bytes from
  deterministic public offline inputs.
- Sharded planner values are per-lane unsigned transaction-shape candidates
  with SPVTracker still shared.
- This is not signed live Ergo transaction-size evidence.
- This is not live benchmark evidence.
- It does not authorize production throughput, mainnet capacity, live
  settlement, trustless burn completion, or full parallel L1 settlement claims.
