# Completed Current Claim-Core Size Evidence - 2026-06-25 - ca56646f

Command:

```powershell
npm run showcase:benchmark
```

Result: PASS / exit code 0.

Evidence:

- Batch unlock claim-core size is 109 B per claim.
- Batch=10 claim cores total 1090 B.
- Batch unlock claim-core size limits payload growth before wider benchmark
  claims can be made.

Boundary:

- This is offline benchmark evidence only.
- It does not prove signed live transaction byte size.
