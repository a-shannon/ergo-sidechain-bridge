# Completed Current Batch Settlement Metrics - 2026-06-25 - ca56646f

Command:

```powershell
npm run showcase:metric-rows
```

Result: PASS / exit code 0.

Scenario: Batch settlement.

Measurements:

- Sample count: 3.
- Build time runs: 1.7 ms, 1.3 ms, 0.8 ms.
- Mean build time: 1.3 ms.
- Proof size: tracker proof 222 B, DUP lookup 67 B, DUP insert 70 B, claim cores 1090 B.
- Unsigned EIP-12 JSON transaction shape: 13893 bytes.
- Cost-relevant counts: inputs=3 outputs=13 vars=58 batch=10.
- Throughput: 10 settlements per Ergo block in the offline batch model.
- Latency: 1.3 ms offline build latency.

Boundary:

- Transaction-size values are unsigned EIP-12 JSON transaction-shape bytes from
  deterministic public offline inputs.
- This is not signed live Ergo transaction-size evidence.
- This is not live benchmark evidence.
