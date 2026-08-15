# Completed Current Lane-Local Liquidity Evidence - 2026-06-25 - ca56646f

Command:

```powershell
npm run showcase:lanes
```

Result: PASS / exit code 0.

Evidence:

- Liquidity inputs are lane-local.
- Lane 0 liquidity and Lane 1 liquidity are distinct.
- Overlap analysis reported liquidity inputs disjoint: yes.

Boundary:

- This proves lane-local liquidity planning in the offline sharded planner.
- It does not prove live liquidity availability or live settlement throughput.
