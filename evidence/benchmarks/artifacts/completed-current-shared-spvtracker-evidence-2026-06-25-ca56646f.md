# Completed Current Shared SPVTracker Evidence - 2026-06-25 - ca56646f

Command:

```powershell
npm run showcase:lanes
```

Result: PASS / exit code 0.

Evidence:

- SPVTracker remains a shared input today.
- Expected current overlap: SPVTracker only.
- This is the reason full parallel L1 settlement is not claimed by the current
  offline planner.

Boundary:

- This keeps the SPVTracker shared-input limitation explicit.
- It does not authorize full parallel L1 settlement claims.
