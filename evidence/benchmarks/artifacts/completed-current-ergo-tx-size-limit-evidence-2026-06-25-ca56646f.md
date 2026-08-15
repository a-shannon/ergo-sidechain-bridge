# Completed Current Ergo Transaction Size Limit Evidence - 2026-06-25 - ca56646f

Command:

```powershell
npm run showcase:metric-rows
```

Result: PASS / exit code 0.

Evidence:

- Single-claim unsigned EIP-12 JSON transaction shape: 2744 bytes.
- Batch unsigned EIP-12 JSON transaction shape: 13893 bytes.
- Sharded-lane unsigned EIP-12 JSON transaction shape: 9073 bytes.
- Ergo transaction byte-size limit remains a benchmark scaling limit.

Boundary:

- Transaction-size values are unsigned JSON transaction-shape bytes.
- This is not signed live transaction-size evidence.
