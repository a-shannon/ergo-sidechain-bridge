# Completed Current Liquidity Fragmentation Evidence - 2026-06-25 - ca56646f

Command:

```powershell
npm run showcase:lanes
```

Result: PASS / exit code 0.

Evidence:

- Liquidity inputs are lane-local.
- Lane 0 has 4 claims and Lane 1 has 6 claims in the offline planner.
- Liquidity lane fragmentation affects per-lane capacity and payout distribution.

Boundary:

- This is offline planner evidence.
- It does not prove live liquidity availability.
