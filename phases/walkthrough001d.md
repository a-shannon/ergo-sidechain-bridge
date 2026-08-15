# Walkthrough 001d â€” Deployment Scripts & Audit Questions

> Compilation output, deployment flow, known issues, and consolidated Deep Think audit brief.

---

## Compilation Results

All 4 ErgoScript contracts compiled via Ergo node v6 API (`/script/p2sAddress` with `treeVersion: 0`):

```json
{
  "SideChainState": {
    "address": "Bf1TpGMyurgvNKZjPuqa2z6uEwJnC5rU7Pv72mPfeiThmQNyE68QtfP4cPCBqV6NRuEzqw7JeHrJW57v3gvqCuAHpApWf54VtkNya26o7DGS3tSzayNuRdZqkMyMsgvqtBQs4ZqdE9KsULMJEeQfcN",
    "ergoTreeHex": "1003040004000400d802d601b2a5730000d602e4c6a70908ea02d1edededededed91e4c672010405e4c6a70405938cb2db63087201730100018cb2db6308a77302000193c27201c2a793e4c672010804a391a3e4c6a7080493e4c672010908720292c17201c1a77202"
  },
  "DoubleUnlockPrevention": {
    "address": "6d484XxQbver8ydBZLtLkAfHmgaeA7FD92M9bVrWMSSTcwzch8gzCQV3Sbu8qCjKZyMdAgVmConaiTPACwdJyjfNWtKMJZH13rMW43LAvjxTCXj7RhSSg5GajT4LiqWi8jSxq9voZk2i5XvhZQNygRyqLte9dSRaWiaF3rij4uZYAcpBFd8XP41GX4qBVWBQsfDu7zqCxSaCEBdcZCsKVgwdCz749FstAH7S",
    "ergoTreeHex": "100504000201040004000502d804d601e4c6a70564d602e4e3010ed603b2a5730000d604e4c6a70908ea02d1ededededededefe6dc640a7201027202e4e3000e93db6401e4c672030564db6401e4dc640c72010283013c0e0e860272028301027301e4e3020e938cb2db63087203730200018cb2db6308a77303000193c27203c2a793e4c6720304059ae4c6a70405730493e4c672030908720492c17203c1a77204"
  },
  "MainChainLock": {
    "address": "81U1GtCAjUQiBLQUUXM",
    "ergoTreeHex": "1000cdeee4c6a7060e"
  },
  "MainChainUnlock": {
    "address": "LYtcC8jDvvaRtdJnj8dkRUJWt5LN7DsbtiU6C1srWUAYYCMEG9R4Z9m3GC7hqDFLaxxWwQutat9Mnm7KG3ZhXJnxbsvsZybEr53p5HwahxvCDC2hnaDVoy4Ck9gZGG6C",
    "ergoTreeHex": "10040400040004000564d802d601b2db6501fe730000d602b2a5730100ea02d1ededed938cb2db6308720173020001e4e3000e92e4c6720104059ae4c6a70705730393c27202e4c6a7060e92c17202e4c6a70505e4c6a70908"
  }
}
```

---

## Known Issues Found During Build

### 1. treeVersion is mandatory in v6 node API
The v6 node requires `treeVersion` in the POST body for `/script/p2sAddress`. Omitting it causes: `Attempt to decode value on failed cursor: DownField(treeVersion)`.

**Fix**: Always send `treeVersion: 0` (ErgoTree v0 is sufficient for all current operations).

### 2. `Coll[Byte](1)` creates `Coll[Int]` in ErgoScript
In the DoubleUnlockPrevention contract, `Coll[Byte](1)` creates a `Coll[Int]`, causing a type mismatch with `AvlTree.insert()`.

**Fix**: Use `Coll(1.toByte)` instead.

### 3. `/utils/addressToRaw` returns an object, not a string
The node API returns `{ "raw": "0e..." }` not a bare hex string.

**Fix**: Parse as `treeData.raw ?? treeData.hex ?? JSON.stringify(treeData)`.

---

## Deployment Flow (deploy.ts)

The deployment script mints NFTs and creates initial state boxes. Currently awaiting node sync (311k/324k).

```
Step 1: Verify node connection
Step 2: Unlock wallet
Step 3: Get relayer address (3Ww7bgrj...WFxNr)
Step 4: Load compiled_contracts.json
Step 5: Create SideChainState box with:
   - R4: Long(0)       â€” initial sidechain height
   - R5: 32 zero bytes â€” initial T_h
   - R6: 32 zero bytes â€” initial U_h
   - R7: empty AVL tree â€” initial C_h
   - R8: Int(0)         â€” initial MC height
   - R9: relayerPk      â€” relayer authorization
   - tokens(0): singleton NFT (auto-minted from first input)
Step 6: Create DoubleUnlockPrevention box with:
   - R4: Long(0)       â€” counter
   - R5: empty AVL tree â€” spent TX IDs
   - R9: relayerPk
   - tokens(0): singleton NFT
Step 7: Save deployed_state.json
```

---

## Consolidated Deep Think Audit Brief

### Critical Questions (Security)

1. **OUTPUTS(0) assumption** â€” Both SideChainState and DoubleUnlockPrevention assume the successor is `OUTPUTS(0)`. If a miner or co-spending contract reorders outputs, the singleton could be misdirected. **Should we use a filter: find the output containing `SELF.tokens(0)._1`?**

2. **Separate AVL proofs in DoubleUnlockPrevention** â€” We use `Var(0)` for lookup proof and `Var(2)` for insert proof. If these are generated from different tree snapshots, the verification could pass incorrectly. **Is the relayer's "generate both from same snapshot" sufficient, or should the contract enforce this?**

3. **No timeout recovery in MainChainUnlock** â€” If the relayer goes offline after Phase 1 (box created) but before Phase 2 (ERG released), user funds are permanently locked. **Should we add an OR-branch timeout: `|| (HEIGHT > R8 + 720 && proveDlog(recipientPk))`?**

4. **PegOut event without burn** â€” In `ErgoBridge.sol`, `pegOut()` emits an event but doesn't burn sERG. A user could emit PegOut events without burning, tricking the relayer into unlocking ERG. **The relayer MUST verify the sERG balance decreased before processing.**

### Design Questions

5. **MainChainLock validation** â€” `validTarget` and `validAmount` are computed but never enforced. Should the contract reject malformed deposits, or is "relayer ignores them" sufficient?

6. **Hardcoded `confirmationDepth = 50L`** â€” Should this be parameterized via a register in the SideChainState box, allowing governance-controlled updates?

7. **AVL tree key size** â€” DoubleUnlockPrevention uses 32-byte keys (TX IDs). The tree is configured with `keyLength = 32` but the contract doesn't explicitly validate `newTxId.size == 32`. Should it?

### the reference impl Lessons Applied

8. **Batch Proof Mandate** âœ… â€” The contract uses `spentIdsTree.insert(toInsert, insertProof).get` with a single unified proof. This matches the production invariant: one `generate_proof()` call per batch.

9. **Rebuild-on-Demand** âœ… â€” `avl_tree_history` table stores all keys. WASM crate rebuilds from scratch on each invocation. No persistent WASM state = crash-safe.

10. **Context Extensions** â€” DoubleUnlockPrevention uses `Var(0)`, `Var(1)`, `Var(2)`. MainChainUnlock uses `Var(0)` for the SideChainState NFT ID. This matches the reference impl's `Var(0)`â€“`Var(12)` pattern for bypassing the 4KB box limit.

---

## Next Steps

| Phase | Task | Status |
|-------|------|--------|
| 001 (remaining) | Mint NFTs + create state boxes on-chain | â³ Awaiting node sync |
| 002 | Bootstrap Substrate/Frontier EVM node | ðŸ”² Can start in parallel |
| 003 | Adapt reference-avl â†’ bridge-avl WASM crate | ðŸ”² Can start in parallel |
| 004 | Relayer event loop (peg-in monitor) | ðŸ”² Needs 001 + 002 |
