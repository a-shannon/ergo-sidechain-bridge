# Walkthrough 002d â€” Dense Register Packing Fix (from prior art Pattern)

> **Discovery**: Ergo requires registers R4â†’R9 to be **densely packed** (no gaps).
> **Impact**: `DoubleUnlockPrevention.es` used R4, R5, R9 â€” skipping R6/R7/R8. Box creation rejected by node.
> **Fix**: Moved `relayerPk` from R9 â†’ R6. Consistent with the reference impl's pattern.
> **Status**: âœ… VALIDATED by Deep Think audit. Fix already applied.

---

## The Rule (Consensus-Level)

Ergo boxes enforce **dense register packing** (dense prefix array):

- You **cannot** define R9 without also defining R4, R5, R6, R7, R8.
- Registers must be filled sequentially without gaps.
- If a register in the sequence is missing, the node rejects the transaction with **`Registers are not densely packed`**.

> [!CAUTION]
> This is NOT a convention â€” it is a **consensus-level validation rule**. Violating it crashes
> at box creation time, not at script evaluation. No error in the contract logic, just a flat
> rejection by the node.

## Deep Think Audit Response âœ…

> **YES â€” STRICT CONSENSUS RULE.**
>
> On Ergo, the box's `additionalRegisters` must form a **dense prefix array**.
> Attempting to assign R4, R5, R9 while leaving a gap on R6, R7, R8 causes the L1 node
> to reject the transaction outright with `Registers are not densely packed`.
>
> Filling R6-R8 with placeholder values would be wasteful â€” it increases storage rent costs
> and bloats peg-out transaction sizes. The correct fix is to compact the register layout.

---

## How the reference impl Solved This

The reference impl **never** uses R9. All pools use contiguous registers R4â†’R7:

```typescript
// mint-genesis.ts:84-100
const R4 = encodeCollByteRegister(genesisRoot);       // R4: root history
const R5 = encodeAvlTreeRegister(nullDigest, 11);     // R5: nullifier tree
const R6 = encodeCollByteRegister(emptyQueue);         // R6: deposit queue
const R7 = encodeLongRegister(DENOM);                  // R7: denomination
// No R8, no R9 â€” contiguous block stops at R7
```

For authorization, The reference impl embeds the relayer identity **inside the compiled contract ErgoTree** (as a constant), not in a register. The contract is compiled with the relayer's public key baked in.

---

## Bridge Fix Applied

Two contracts were audited:

### `SideChainState.es` â€” No issue âœ…

Uses R4, R5, R6, R7, R8, R9 â€” **all contiguous**. No gap.

```
R4: Long       â€” Sidechain height
R5: Coll[Byte] â€” T_h (tx digest)
R6: Coll[Byte] â€” U_h (UTXO digest)
R7: Coll[Byte] â€” C_h (chain digest / AVL tree)
R8: Int        â€” Mainchain height
R9: SigmaProp  â€” Relayer PK        â† OK, contiguous
```

### `DoubleUnlockPrevention.es` â€” Fixed âš ï¸â†’âœ…

**Before** (broken â€” gap R6/R7/R8):
```
R4: Long       â€” Counter
R5: AvlTree    â€” Spent TX IDs
R9: SigmaProp  â€” Relayer PK        â† GAP: R6/R7/R8 missing!
```

**After** (fixed â€” contiguous):
```
R4: Long       â€” Counter
R5: AvlTree    â€” Spent TX IDs
R6: SigmaProp  â€” Relayer PK        â† Moved from R9
```

### Code Changes

```diff
// DoubleUnlockPrevention.es
-  val relayerPk = SELF.R9[SigmaProp].get
+  val relayerPk = SELF.R6[SigmaProp].get

-  val preserveRelayerPk = successor.R9[SigmaProp].get == relayerPk
+  val preserveRelayerPk = successor.R6[SigmaProp].get == relayerPk
```

```diff
// deploy.ts â€” DoubleUnlockPrevention registers
   R4: encodeLongRegister(0),
   R5: encodeAvlTreeRegister(emptyDigest33, 0x0B, 1),
-  R9: encodeSigmaPropRegister(relayerPubKey33),
+  R6: encodeSigmaPropRegister(relayerPubKey33),
```

---

## Design Principle (from prior art)

> **Always use the lowest available register number.** If your contract needs N user registers,
> use R4 through R(3+N). Never skip registers, even if it seems "cleaner" to reserve slots
> for future use. The node won't let you.

This is analogous to C struct packing â€” no padding between fields.

> [!IMPORTANT]
> After modifying any `.es` contract, you MUST recompile to update the ErgoTree:
> `npx tsx src/scripts/compile-contracts.ts`
