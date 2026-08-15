# Walkthrough 022 — MCL v2 Deployed + Full MCL v2 Cycle Verified

> **Session**: MCL v2 Escape Hatch Deployment & WASM Signer Validation
> **Date**: 2026-05-05
> **Phase**: 006 (Integration & Hardening) — **FINAL SESSION**

---

## Summary

Resolved the MCL v2 compilation blocker, deployed the escape hatch contract on testnet, and verified the complete peg-out cycle (Phase 1 + Phase 2) against the new contract. Phase 006 is now **COMPLETE**.

## Bugs Found & Fixed

| # | Bug | Impact | Fix | Commit |
|---|-----|--------|-----|--------|
| 1 | `SELF.creationHeight` in ErgoScript | MCL v2 compilation failure | `SELF.creationInfo._1` | `eee8233` |
| 2 | `from_boxes_json(JSON.stringify(...))` | Phase 2 DataInputs crash | Pass raw JS array | `f26e38a` |
| 3 | Hardcoded `deadbeef` burnTxId | AVL duplicate key crash on re-run | `crypto.randomBytes(32)` | `9b68941` |
| 4 | `__dirname` in ESM scripts | redeploy-mcl.ts crash | `fileURLToPath(import.meta.url)` | `eee8233` |
| 5 | Relative path `../../contracts` | Wrong directory resolution | `../../../contracts` (3 levels) | `eee8233` |

## Key Results

- **MCL v2 deployed**: `8ReAo81ACuRbYAKh9EJB8WMXonGgBJVTaizFGDkhEMvLmUxkq12aZVHN3n1ve9Rt81qMfTk79PsycsBXHLeteimweE`
- **Phase 1 atomic TX** (MCL v2): `c788a7ed4dc43b906fc166103f72d1d7dc1cf4434909eb8d2e5ca21ff662487c`
- **Phase 2 delivery**: `907e34f3a475d5b390a45311e8fc4904f5108b99d113c5c6aee4b35243c6a6c6`
- **DUP redeployed** with fresh AVL tree (NFT: `b25482ec...`)
- **Skills updated**: `SELF.creationInfo._1` trap added to sidechain-bridge skill + boxes-and-registers

## ErgoScript Trap Discovered

**`SELF.creationHeight` does NOT exist in ErgoScript.** The correct accessor is `SELF.creationInfo._1`, which returns the first element of the `(Int, Coll[Byte])` creation info tuple. The node compiler error was: `Cannot find method 'creationHeight' in the object Self$`.

## Git Commits

- `eee8233` — MCL v2 deployed (SELF.creationInfo fix + escape hatch + ESM compat)
- `9b68941` — Random burnTxId + DUP redeployment + deployed_state update
- `e83b6b6` — Skills: SELF.creationInfo._1 trap documentation
