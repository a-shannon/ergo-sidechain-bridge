# Completed Offline Shape Metrics Output - 2026-06-25 - 6d3ffbc1

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
| Single-claim settlement baseline | 3 | 3.1 ms, 0.3 ms, 0.2 ms | 1.2 ms | tracker proof 137 B, DUP lookup 67 B, DUP insert 67 B | 2744 bytes | inputs=3 outputs=4 vars=15 batch=1 | 1 settlement per Ergo block in the offline single-claim model | 1.2 ms offline build latency |
| Batch settlement | 3 | 2.3 ms, 1.2 ms, 0.7 ms | 1.4 ms | tracker proof 222 B, DUP lookup 67 B, DUP insert 70 B, claim cores 1090 B | 13893 bytes | inputs=3 outputs=13 vars=58 batch=10 | 10 settlements per Ergo block in the offline batch model | 1.4 ms offline build latency |

Boundary:

- Transaction-size values are unsigned EIP-12 JSON transaction-shape bytes from
  deterministic public offline inputs.
- This is not signed live Ergo transaction-size evidence.
- This is not live benchmark evidence.
- It does not authorize production throughput, mainnet capacity, live batch
  settlement, trustless burn completion, or full parallel L1 settlement claims.
