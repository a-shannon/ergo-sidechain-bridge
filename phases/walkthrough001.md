# Phase 001 Walkthrough — Index

> **Status**: Scaffold complete ✅ | On-chain deployment pending (node syncing)
> **Date**: 2026-05-04

## Files

| File | Contents |
|------|----------|
| [walkthrough001a.md](walkthrough001a.md) | ErgoScript contracts (4 contracts, inline code, register layouts) |
| [walkthrough001b.md](walkthrough001b.md) | Solidity contracts (SERG.sol, ErgoBridge.sol) |
| [walkthrough001c.md](walkthrough001c.md) | Relayer TypeScript scaffold (config, ErgoClient, StateTracker, entry point) |
| [walkthrough001d.md](walkthrough001d.md) | Deployment scripts, compilation results, and next steps |

## Compilation Results

All 4 ErgoScript contracts compiled successfully via Ergo node v6 API:

| Contract | Address | ErgoTree size |
|----------|---------|---------------|
| SideChainState | `Bf1TpGMy...QfcN` | 100 bytes |
| DoubleUnlockPrevention | `6d484Xxq...AH7S` | 152 bytes |
| MainChainLock | `81U1GtCA...LUUXM` | 10 bytes |
| MainChainUnlock | `LYtcC8jD...ZGG6C` | 86 bytes |

## Relayer Smoke Test

```
═══════════════════════════════════════════════════
  Ergo-Substrate Sidechain Bridge — Relayer v0.1  
═══════════════════════════════════════════════════

🟢 Ergo node:       http://localhost:9052
   Height:          311763
   Network:         testnet
🔓 Wallet unlocked
🔑 Relayer address: 3Ww7bgrjcuAQHGBEY4129c6pAsJ1PzwefBYSzqv45To74B7WFxNr
📊 Last synced Ergo height: 0
📊 Last synced SC height:   0

✅ Phase 001 scaffold validation passed
```
