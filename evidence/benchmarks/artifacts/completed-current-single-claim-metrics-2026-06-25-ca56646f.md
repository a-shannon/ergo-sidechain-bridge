# Completed Current Single-Claim Metrics - 2026-06-25 - ca56646f

Command:

```powershell
npm run showcase:metric-rows
```

Result: PASS / exit code 0.

Scenario: Single-claim settlement baseline.

Measurements:

- Sample count: 3.
- Build time runs: 3.4 ms, 0.3 ms, 0.2 ms.
- Mean build time: 1.3 ms.
- Proof size: tracker proof 137 B, DUP lookup 67 B, DUP insert 67 B.
- Unsigned EIP-12 JSON transaction shape: 2744 bytes.
- Cost-relevant counts: inputs=3 outputs=4 vars=15 batch=1.
- Throughput: 1 settlement per Ergo block in the offline single-claim model.
- Latency: 1.3 ms offline build latency.

Boundary:

- Transaction-size values are unsigned EIP-12 JSON transaction-shape bytes from
  deterministic public offline inputs.
- This is not signed live Ergo transaction-size evidence.
- This is not live benchmark evidence.
