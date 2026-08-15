# Completed Current Showcase Benchmark Output - 2026-06-25 - ca56646f

Command:

```powershell
npm run showcase:benchmark
```

Result: PASS / exit code 0.

Mode reported by command: OFFLINE, no live node required.

Normalized output summary:

| Batch size | Build ms | Tracker proof | DUP lookup | DUP insert | Claim cores | Vars | Inputs | Outputs | Notes |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 2.4 ms | 137 B | 67 B | 67 B | n/a | 15 | 3 | 4 | single-claim V1 path |
| 2 | 0.8 ms | 171 B | 67 B | 68 B | 218 B | 18 | 3 | 5 | none |
| 5 | 0.9 ms | 191 B | 67 B | 68 B | 545 B | 33 | 3 | 8 | none |
| 10 | 1.3 ms | 225 B | 67 B | 70 B | 1090 B | 58 | 3 | 13 | at unlock cap 10 |

Command-reported scaling note:

- Batch 10 vs single: 1.0x DUP insert size, 10x settlements.
- Net efficiency: approximately 10.0x in the offline model.

Boundary:

- This is offline showcase output only.
- It is not live benchmark evidence.
- It does not authorize production throughput, mainnet capacity, live batch
  settlement, or full parallel L1 settlement claims.
