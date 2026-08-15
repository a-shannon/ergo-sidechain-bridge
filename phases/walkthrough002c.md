# Walkthrough 002c â€” valueLengthOpt Fix (from prior art Forensics)

> **Discovery**: Comparing the reference impl's AVL encoding with the bridge revealed a critical `valueLengthOpt` mismatch.
> **Impact**: Would cause "Script reduced to false" at deployment time â€” the on-chain AvlTree metadata wouldn't match the WASM prover configuration.
> **Fix**: New `encodeAvlTreeRegister()` with explicit `valueLengthOpt` parameter.
> **Status**: âœ… VALIDATED by Deep Think audit.

---

## Root Cause Analysis

### The the reference impl Precedent

The reference impl uses AVL+ trees for **set membership** (nullifier tracking, deposit commitments). The WASM prover is configured with:

```rust
// reference-impl/wasm-crypto/reference-avl/src/lib.rs:139
Some(0), // value_length_opt = fixed-zero (Ergo L1 set membership â€” consensus-critical)
```

And the register encoder hardcodes `valueLengthOpt = None`:

```typescript
// reference-impl/relayer/src/ergo-helpers.ts:170-171
export function encodeAvlTreeRegister(digest33: Buffer, flags = 1): string {
  return "64" + digest33.toString("hex") + flags...padStart(2, "0") + vlq(32).toString("hex") + "00";
  //                                                                                              ^^^^
  //                                                                                  "00" = None (no value length)
}
```

This works for the reference impl because the ErgoScript contracts use empty values (`Bytes::new()` / `Bytes::from(vec![0u8; 0])`).

### The Bridge Difference

The `DoubleUnlockPrevention.es` contract explicitly uses a **1-byte value**:

```scala
// Line 28 of DoubleUnlockPrevention.es
val toInsert = Coll((newTxId, Coll(1.toByte)))  // value = [0x01] (1 byte)
```

And the WASM crate creates the tree with:

```rust
// bridge-avl/src/lib.rs:41
Some(1),  // value length = 1 byte (0x01 marker)
```

### The Mismatch

If we use the reference impl's `encodeAvlTreeRegister` directly (ending with `"00"`), the on-chain `AvlTree` object has `valueLengthOpt = None`. But the WASM prover generates proofs with `valueLengthOpt = Some(1)`. The Ergo JIT verifier checks this metadata during `tree.insert()` and rejects the proof.

---

## Fix: Enhanced `encodeAvlTreeRegister`

New signature supports explicit `valueLengthOpt`:

```typescript
export function encodeAvlTreeRegister(
  digest33: Buffer,
  flags: number = 1,
  valueLengthOpt?: number
): string {
  const typeByte = "64";
  const digestHex = digest33.toString("hex");
  const flagsHex = flags.toString(16).padStart(2, "0");
  const keyLengthVlq = vlq(32).toString("hex");

  // Encode Option[Int] for valueLengthOpt
  let valueLengthHex: string;
  if (valueLengthOpt === undefined || valueLengthOpt === null) {
    valueLengthHex = "00"; // None
  } else {
    valueLengthHex = "01" + vlq(valueLengthOpt).toString("hex"); // Some(n)
  }

  return typeByte + digestHex + flagsHex + keyLengthVlq + valueLengthHex;
}
```

### Sigma Option Encoding Reference

| Scenario | Hex suffix | Meaning |
|----------|-----------|---------|
| the reference impl (set membership) | `...2000` | keyLen=32, valueLenOpt=None |
| Bridge (1-byte marker)  | `...200101` | keyLen=32, valueLenOpt=Some(1) |
| Future (32-byte values)  | `...200120` | keyLen=32, valueLenOpt=Some(32) |

---

## Deep Think Audit Response âœ…

### Q1: Is the `0101` encoding correct?

> **YES â€” RIGOROUSLY EXACT.**
>
> The subtlety is the internal serialization type. In Ergo (Sigma), standard "business" values
> (`SInt`, `SLong`) use **VLQ + ZigZag** encoding. However, for internal structure metadata
> like `AvlTree` (`keyLength`, `valueLengthOpt`), the protocol (`AvlTreeDataSerializer` in
> `sigmastate` source) explicitly uses `putUInt` â€” standard **Base128 ULEB128, WITHOUT ZigZag**.
>
> - `0x01`: `Option[T]` tag for `Some`
> - `0x01`: ULEB128 encoding of the length value `1`
>
> The encoding `"01" + "01" = "0101"` is therefore **perfect to the bit**.

> [!TIP]
> The Fleet SDK supports `SAvlTree({ digest, keyLength: 32, valueLengthOpt: 1, ... })` natively,
> but the custom helper is equally valid and avoids changing the import chain.

### Q2: Must registers be contiguous?

> **YES â€” STRICT CONSENSUS RULE.** (See [walkthrough002d](walkthrough002d.md) for the full fix.)

---

## Additional Discovery: Flush-per-key vs Batch Flush

The reference impl calls `generate_proof()` after EACH history key insert during replay:

```rust
// reference-avl (line 158-161)
for (i, key) in history.iter().enumerate() {
    prover.perform_one_operation(&op)?;
    prover.generate_proof();  // â† flush after EACH insert
}
```

Bridge does a single batch flush:

```rust
// bridge-avl (line 77-92)
for key_hex in &history_keys {
    prover.perform_one_operation(&op)?;
}
let _ = prover.generate_proof();  // â† single flush after ALL inserts
```

**Analysis**: Both produce the **same digest**. `generate_proof()` resets the proof buffer and internal tracking (`old_top_node`, `directions`), but does NOT modify the tree structure. The node hashes and rotations are computed during `perform_one_operation`. The digest is derived from the tree structure, which is identical in both cases.

The per-key flush was a the reference impl design choice for debugging granularity, not a correctness requirement. The batch flush is slightly more efficient for the bridge use case.
