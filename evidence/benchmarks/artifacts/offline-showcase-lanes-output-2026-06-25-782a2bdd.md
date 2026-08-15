# Offline Showcase Lanes Output - 2026-06-25 - 782a2bdd

Command:

```powershell
npm run showcase:lanes
```

Result: PASS / exit code 0.

Mode reported by command: OFFLINE, synthetic box IDs, no node calls.

Normalized output summary:

| Lane | Claims | Payout outputs | Estimated output count | DUP input | Liquidity input | SPVTracker input |
|---:|---:|---:|---:|---|---|---|
| 0 | 4 | 4 | 7 | lane-local | lane-local | shared today |
| 1 | 6 | 6 | 9 | lane-local | lane-local | shared today |

Overlap analysis reported by command:

- Shared inputs: SPVTracker.
- DUP inputs disjoint: yes.
- Liquidity inputs disjoint: yes.
- Expected current overlap: SPVTracker only.

Boundary:

- This demonstrates the next eUTXO scaling lever: DUP and liquidity state can
  become lane-local.
- It does not claim full parallel L1 settlement yet because SPVTracker is still
  global.
- Full parallel settlement still needs pre-ingested tracker entries or tracker
  sharding.
