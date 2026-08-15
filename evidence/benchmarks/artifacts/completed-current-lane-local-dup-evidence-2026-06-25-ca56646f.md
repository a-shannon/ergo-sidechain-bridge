# Completed Current Lane-Local DUP Evidence - 2026-06-25 - ca56646f

Command:

```powershell
npm run showcase:lanes
```

Result: PASS / exit code 0.

Evidence:

- DUP inputs are lane-local.
- Lane 0 DUP shard and Lane 1 DUP shard are distinct.
- Overlap analysis reported DUP inputs disjoint: yes.

Boundary:

- This proves lane-local DUP planning in the offline sharded planner.
- It does not prove live batch settlement or full parallel L1 settlement.
