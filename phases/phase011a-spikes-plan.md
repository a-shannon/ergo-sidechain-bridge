# Phase 011a — Federated Anchored SPV Tracker: Spikes Plan

> **Status**: Spike validation complete. Architecture selected; local Ergo node/miner `0x04` extension injection hook implemented in `ergo-source` commit `ed506f3`; patched devnet block verification complete.
> **Architecture**: Federated (committee-authorized), not trustless. Trustless validation depends on Phase 008/009/011; Phase 011b remains showcase/demo work and Phase 015 remains FROST-only.
> **kushti guidance (2026-05-06)**: SPV relay preferred for regular communication. NiPoPoW retained for bootstrapping/fallback.
> **Runtime retirement note**: the progress log below records former V1
> submission capabilities for historical traceability. New V1 signing,
> authorization, submission, and broadcast routes are now physically absent;
> only offline diagnostics and exact historical reconciliation remain.

## Roadmap Re-Audit Boundary

Phase 011a is a federated anchored-SPV transition path and developer evidence
path. It preserves the useful `0x0401` / `bridge_event_root` architecture, but
it does not claim trustless status until sidechain finality and on-chain proof
acceptance are implemented.

Substrate/Frontier is used here as the EVM-compatible burn-event source and
commitment producer. Frontier receipt extraction is acceptable for deriving the
bridge-native commitment, but raw EVM receipt proofs are not the preferred
Ergo-side proof format. The long-term proof surface should remain a versioned
Blake2b/STARK-ready `bridge_event_root` / `burn_root` under the `0x04`
extension prefix.

The Chain zeta / Phantom Burn closure path is Phase 011 / Gate 5: a proof that
binds extension anchoring, sidechain finality, burn inclusion, recipient,
amount, sidechain ID, burn ID, DUP replay insertion, and stale-anchor/reorg
rejection. Local proof vectors and SPV tracker source-boundary evidence are
prerequisites, not closure.

## Candidate Architecture Summary

- **SPV Tracker box**: Mutable box with `Tracker_NFT` + AVL digest of accepted sidechain commitments
- **DUP AVL box**: Separate box for spent-burn replay protection (existing)
- **0x04 extension value**: 32-byte Blake2b hash of typed preimage, injected by merged-mining miners
- **Ingest authorization**: Committee-authorized via Ergo-native `atLeast(m, Coll(pk1..pkN))`
- **Trust model**: Federated anchoring (Phase 011a) -> trustless validation only after Phase 008/009/011.

The WP-06A successor is now implemented as a separate source schema rather
than mutating this historical V1 tracker. `SPVTrackerAuthenticated.es` and its
pure builder authenticate the frozen 64-byte `0x0401` checkpoint value against
an Ergo header and store a 264-byte append-only entry. The entry binds the
event root and anchor to the exact canonical finality statement, verifier
profile, payload digest, and aggregate proof digest authorized at admission.
This removes claimant-supplied anchor metadata and unbound proof identity, but
it does not make the path trustless: R9 still authorizes sidechain-finality
semantics until Ergo can verify GRANDPA or an equivalent cryptographic proof.
The previous local VM evidence predates this proof-bound contract tree and must
be rerun against the current source. WP-06C adds per-sidechain V2 history and
unsigned service preparation after fresh burn verification. Current-tree VM
acceptance, daemon candidate coordination, reorg invalidation, and
sidechain-finality verification remain Phase 011 work.

## Known Caveats

1. **DataInput/BoxId contention for mutable SPV Tracker**: A peg-out TX reading the SPV Tracker via DataInput references a specific BoxId. If an ingestion TX spends that tracker (creating a new BoxId) before the peg-out confirms, the peg-out's DataInput becomes invalid and the TX fails. SPV ingest and peg-out reads **do contend** at the mempool/BoxId level unless: (a) ingestion + peg-outs are batched in the same TX with contracts verifying INPUTS/OUTPUTS explicitly, or (b) a read-only DataInput-compatible pattern is used (e.g., separate immutable snapshot boxes). This is addressed in **Spike 7**.
2. **Federated relay, not trustless contiguous header chain**: Relaying only event blocks is checkpointed/federated. Trustless validation requires Phase 008 verifiable consensus, Phase 009 `0x04` commitments, and Phase 011 burn proof acceptance.
3. **0x04 key/value layout batching**: Must support multiple commitments per Ergo block (multiple sidechains, or multiple events per sidechain).
4. **AVL proof availability**: Old claims require AVL proof reconstruction from historical tree state. Relayer must maintain proof history or be able to reconstruct from `avl_tree_history`.
5. **0x04 injection environment**: Injecting custom extension fields likely requires a local devnet/miner node, not public testnet (miners control extension content).

---

## Spikes

### Spike 1: Extension Merkle Serialization — ✅ PASS

> **Objective**: Find the exact Ergo extension section Merkle leaf/internal-node serialization needed to verify a key/value pair against `Header.extensionRoot`.

- [x] Read Ergo node / Scorex `MerkleTree` implementation
- [x] Determine leaf hash formula: `Blake2b256(0x00 || keyLen || key || value)`
- [x] Determine internal node hash formula: `Blake2b256(0x01 || leftHash || rightHash)`
- [x] Determine proof sibling ordering: bottom-up, `0x00=LeftSide` (we are left), `0x01=RightSide` (we are right)
- [x] Determine empty/singleton tree handling: EmptyNode = `[]`; singleton → InternalNode(leaf, EmptyNode)
- [x] Confirm tree construction mirrors Scorex exactly (pairwise grouping per level, NOT pad-to-power-of-two)
- [x] Self-consistency tests for 1, 2, 3, 4, 5, 6, 7 leaves — all proofs build and verify ✅
- [x] Cross-check against **real Ergo mainnet block** (height 1779794, 10 extension fields) — root matches ✅
- [x] Confirm field ordering: **serialized block order** (no sorting) — verified from `ExtensionSerializer.scala`
- [x] Confirm `keyLength` is 1 byte, key is fixed 2 bytes for Ergo extension (value length NOT encoded)
- [x] Document in `relayer/src/scripts/spikes/spike1-extension-merkle.ts`

**Result**: ✅ **PASS** — Off-chain Merkle tree construction matches both Scorex source code and real Ergo mainnet block (root cross-check verified). This validates the leaf/internal hash formulas and tree structure for proof generation.

**Cross-check block**:
- Block ID: `87e2e46669cfb4b69e5d3757304cc79019249d0ca398608b562536869b59b6e2`
- Height: 1779794
- Extension fields: 10 (all NiPoPoW interlinks, prefix `0x01`)
- Computed root matches `extensionHash` exactly ✅

**Source files verified**:
- `scrypto/.../Node.scala` — leaf/internal hash prefixes (`0x00`, `0x01`)
- `scrypto/.../MerkleTree.scala` — `calcTopNode` (pairwise per level), `LeafPrefix=0x00`, `InternalNodePrefix=0x01`
- `scrypto/.../MerkleProof.scala` — proof format, side encoding, verification algorithm
- `scrypto/.../CryptographicHash.scala` — `prefixedHash(prefix, inputs*) = hash(prefix +: concat(inputs))`
- `ergo/.../Extension.scala` — `kvToLeaf` = `concat(keyLength(1 byte), key(2 bytes), value(N bytes))`
- `ergo/.../ExtensionSerializer.scala` — field ordering = serialized block order (no sorting)
- `ergo/.../Algos.scala` — `merkleTree(elements)(hash)` where hash = Blake2b256; empty root = `blake2b256([])`

**Key findings**:
| Formula | Value |
|---------|-------|
| Leaf prefix | `0x00` (single byte) |
| Internal prefix | `0x01` (single byte) |
| Leaf data | `keyLength(1 byte=0x02) \|\| key(2 bytes) \|\| value(N bytes)` — no value length |
| Leaf hash | `Blake2b256(0x00 \|\| leafData)` |
| Internal hash | `Blake2b256(0x01 \|\| leftHash \|\| rightHash)` |
| Empty node hash | `[]` (empty byte array, 0 bytes) |
| Empty tree root | `Blake2b256([]) = 0e5751c...` (special case in `Algos.merkleTreeRoot`) |
| Tree construction | Pairwise grouping per level, odd → EmptyNode right sibling. NOT pad-to-power-of-two. |
| Field ordering | Serialized block order (not sorted) |
| Proof format | `[side(1) \|\| siblingHash(32)]` per level, bottom-up |
| Side encoding | `0x00` = LeftSide (we are left), `0x01` = RightSide (we are right) |
| Hash function | Blake2b-256 (32-byte output) |

---

### Spike 2: ContextExtension Size / Proof Passing — ✅ PASS

> **Objective**: Confirm that an extension Merkle proof (siblings + directions) fits within the 96KB transaction size limit alongside existing AVL proofs.

- [x] Measure typical extension Merkle proof size: **33-462 bytes** (depth 1-14, 33 bytes/level)
- [x] Measure typical AVL insert/lookup proof size: **~500-1000 bytes** per operation
- [x] Confirm both fit in context extensions simultaneously: **~2.4 KB typical, ~6.7 KB worst case** — 94.8% headroom vs 96KB limit
- [x] Confirm `getVar[Coll[Byte]]` reads Sigma-serialized flat proof correctly — ✅ **Phase C verified (2026-05-07)**
- [x] Document in `relayer/src/scripts/spikes/spike2-context-extension-capacity.ts`

**Result**: ✅ **PASS (sizing)** — No size bottleneck. Extension Merkle proofs are negligible (132 bytes typical for 15 fields, 462 bytes theoretical max at depth 14). Combined peg-out TX with DUP AVL proofs + extension Merkle proof + SPV tracker lookup totals ~5KB, leaving >90% of the 96KB TX limit unused. `getVar[Coll[Byte]]` deserialization was confirmed by the historical Phase C result; its direct broadcast-capable evaluator is intentionally absent from the current checkout and remains recoverable through Git history.

**Key measurements** (typical case: 15 extension fields, 500-5000 entry AVL trees):

| Component | Size |
|-----------|------|
| Extension Merkle proof (15 fields, depth 4) | 136 bytes |
| DUP AVL lookup proof | ~635 bytes |
| DUP AVL insert proof | ~699 bytes |
| SPV Tracker AVL lookup proof | ~903 bytes |
| Burn TX ID | 32 bytes |
| Sigma serialization overhead | ~20 bytes |
| **Total context extension** | **~2,425 bytes** |
| Total TX (with boxes, sigs, outputs) | **~5,125 bytes** |
| TX size limit | 98,304 bytes (96 KB) |
| **Headroom** | **94.8%** |

**Worst case** (full extension section, 10,922 fields at 1-byte values, depth 14, 100K-entry AVL trees): ~7,123 bytes — still within limits.

**Serialization format**: Flat byte array `[side(1) || sibHash(32)]` repeated per level, via `getVar[Coll[Byte]]`. ErgoScript unpacks with `slice()` operations. Same pattern as AVL proofs; deserialization was confirmed by the historical Phase C result, while current execution remains subject to the fail-closed ContextExtension guard and VM/JVM conformance paths.

**JIT cost estimate**: Extension Merkle verification ≈ 400-700 JIT units (5-6 `blake2b256()` calls + slice ops). Well within 1M budget.

**Ergo physical limits reference**:
- `maxTransactionSize`: 96 KB (node default) — no explicit ContextExtension byte limit
- `maxBoxSize`: 4 KB — not relevant for context extensions
- `maxBlockSize`: ~1.27 MB (miner-voted)
- JIT cost budget: 1,000,000 units per block

---

### Spike 2b: ErgoScript On-Chain Merkle Verification — ✅ PASS

> **Objective**: Prove that the extension Merkle proof from Spike 1 can be verified **inside** ErgoScript using `blake2b256()`, `slice()`, and `fold()`.

- [x] TypeScript simulation of ErgoScript fold logic — passes for depths 1, 4, 5, 8, 10
- [x] Real mainnet block cross-check (block 1779794) — both field 0 and field 9 verify
- [x] Negative test: wrong root correctly rejected
- [x] **EmptyNode fix via side-byte encoding**: Side byte 0x02/0x03 signals empty sibling — no sentinel collision risk
- [x] **Node compilation**: ErgoScript compiles successfully via `/script/p2sAddress`
- [x] **ErgoScript type inference lesson**: `Coll[Int]` must be explicitly annotated; `Coll(0, 1, 2, ...)` alone is inferred as `Coll[Byte]` by the node compiler. `fold` type parameter must NOT be specified (let inference handle it).
- [x] **Phase C**: Real TX evaluation with Sigma-serialized context extensions — ✅ PASS (2026-05-07)

**Result**: ✅ **PASS** — Compilation, simulation, and real TX evaluation all verified.

**Phase C results (spike2c, 2026-05-07)**:
1. `getVar[Coll[Byte]]` correctly reads Sigma-serialized Var(0), Var(1), Var(2) — ✅
2. Test TX with compiled contract evaluates to `true` with valid proof — ✅ (depths 1, 5, 8, 10, 14)
3. Test TX evaluates to `false` with wrong root (negative test) — ✅ (all depths)
4. JIT cost: successful script evaluation proves cost < 1,000,000 budget. Exact cost not measured (requires node instrumentation). Acceptance: evaluation success = under budget.

**ErgoScript Contract** (compiles on Ergo node):
```scala
val levels: Coll[Int] = Coll(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13)
val computedRoot = levels.fold(leafHash, { (acc: Coll[Byte], i: Int) =>
  if (i >= proofLen) { acc }
  else {
    val side = proof(i * 33)
    val sib = proof.slice(i*33 + 1, i*33 + 33)
    val pfx = Coll(1.toByte)
    if (side >= 2.toByte) { blake2b256(pfx ++ acc) }
    else if (side == 0.toByte) { blake2b256(pfx ++ acc ++ sib) }
    else { blake2b256(pfx ++ sib ++ acc) }
  }
})

val allSidesValid = levels.forall({ (i: Int) =>
  if (i >= proofLen) { true }
  else {
    val s = proof(i * 33)
    s == 0.toByte || s == 1.toByte || s == 2.toByte || s == 3.toByte
  }
})

sigmaProp( computedRoot == expectedRoot && proof.size % 33 == 0 && allSidesValid )
```

**Proof format** (fixed-width, 33 bytes/level):
| Byte | Content |
|------|---------|
| 0 | Side byte (see below) |
| 1-32 | Sibling hash (32 bytes), or zero-padding when side >= 0x02 |

**Side byte encoding** (collision-free):
| Value | Meaning |
|-------|---------|
| `0x00` | Target is left child, sibling hash present in bytes 1-32 |
| `0x01` | Target is right child, sibling hash present in bytes 1-32 |
| `0x02` | Target is left child, right sibling is EmptyNode — bytes 1-32 ignored |
| `0x03` | Target is right child, left sibling is EmptyNode — bytes 1-32 ignored |

**Key findings**:
- JIT cost: evaluation success proves under 1M budget. Exact cost not measured (node instrumentation needed).
- Proof size: 132-462 bytes — **negligible vs 96KB TX limit**
- ErgoScript limitations: no `def`, no lambda vals, `.indices` type inference is broken, must use explicit `Coll[Int]` with `fold`

---

### Spike 3: SPV Tracker AVL Insert + Old-Header Lookup Proof — ✅ PASS

> **Objective**: Validate that an AVL tree can serve as the SPV Tracker's accepted-header store, and that lookup proofs for old headers are practical.

- [x] Design AVL key/value schema — **two schemas tested head-to-head**
  - Schema A: key = `blake2b256(E2S_SPV_V1 || scId || scHeight || scHash || eventRoot || anchorH)`, value = `0x01`
  - Schema B: key = `blake2b256(E2S_SPV_V1 || scId || scHeight || scHash)`, value = `eventRoot(32) || anchorH_BE(4)` = 36 bytes
- [x] Measure insert proof size: 171–580 bytes (10–10K entries) — **negligible vs 96KB TX limit**
- [x] Measure lookup/get proof size: 170–546 bytes (10–10K entries) — **O(log N) confirmed**
- [x] Confirm ErgoScript `tree.contains(key, proof)` — **PASS** (compile-only Schema A check)
- [x] Confirm ErgoScript `tree.get(key, proof)` + value decode — **PASS** (real TX evaluation in Spike 3c; uses `byteArrayToLong`)
- [x] First-anchor-wins policy: AVL `Insert` on existing key **panics** — safe by default
- [x] Rebuild time: 10K entries in ~28ms — **well within acceptable limits**
- [x] Negative tests: WASM-level unknown/duplicate/value round-trip + Spike 3c TX-level proof/NFT failures — all pass
- [x] **Spike 3c: Real TX evaluation** — ✅ PASS (2026-05-07)

**Comparison Table (proof sizes):**
| Tree Size | Schema A Lookup | Schema B Get | Schema B Insert |
|-----------|----------------|--------------|-----------------|
| 10        | 170 B          | 205 B        | 205 B           |
| 100       | 272 B          | 307 B        | 307 B           |
| 1,000     | 409 B          | 478 B        | 478 B           |
| 10,000    | 545 B          | 546 B        | 546 B           |

**Decision: Schema B recommended.** Both schemas are viable, but Schema B provides:
- Natural deduplication (same sidechain header = same key)
- Fewer context extension slots at claim time (4 Var vs 6+)
- `eventRoot` and `ergoAnchorHeight` extracted from tree value — claimant doesn't provide them
- Proof sizes are within 10% of Schema A

**Key discovery: `byteArrayToLong` for BE→Int decode.** ErgoScript doesn't support bitwise ops on `Byte.toLong`, but `byteArrayToLong(Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte) ++ anchorBytes)` works as a workaround for decoding 4-byte BE integers. The zero bytes MUST be prepended (left-padded), not appended — appending shifts the value left by 32 bits and causes `toInt` overflow.

**Result**: ✅ **PASS** — Schema B compiles, proofs scale O(log N), and Spike 3c confirms real TX evaluation (tree.get() with DataInput + NFT auth + anchorH decode + 4 negative tests).

#### Spike 3c: Real TX Evaluation — ✅ PASS (2026-05-07)

> **Objective**: Validate the Spike 3 contract via real WASM-signed transactions on testnet, with a 5-point security test matrix. Tracker_NFT is **hardcoded at compile time** — NOT claimant-provided.

**Architecture**: `ergo-lib-wasm-nodejs` full sigma-rust interpreter for transaction signing (bypasses Ergo node v6 `/wallet/transaction/sign` bug with segregated-constant ErgoTree boxes).

**Test Matrix** (all 5 tests pass):
| Test | Description | Result |
|------|-------------|--------|
| P1+P2 | Valid `tree.get()` + exact `anchorH` decode via `byteArrayToLong` | ✅ PASS — TX signed successfully |
| N1 | Unknown key (valid proof for different key) | ✅ PASS — `Tree proof is incorrect` |
| N2 | Tampered proof (bit-flipped byte 5) | ✅ PASS — `starting_digest.starts_with` failure |
| N3 | Wrong-tree proof (`tracker_get_proof()` from a different AVL tree with distinct digest) | ✅ PASS — `starting_digest.starts_with` failure |
| N4 | Fake tracker DataInput (same R5 digest, **no token**) | ✅ PASS — `Prover error` (tokens(0) crash) |

**ErgoScript Contract** (compiled + evaluated on testnet):
```scala
{
  // Tracker_NFT is HARDCODED — not claimant-provided via getVar.
  // NFT ID = mint input boxId, interpolated at compile time.
  val trackerNftId = fromBase16("68e9c9e60bc04abffe09474c...")
  val tracker = CONTEXT.dataInputs(0)
  val nftOk = tracker.tokens(0)._1 == trackerNftId
  val tree = tracker.R5[AvlTree].get
  val key = getVar[Coll[Byte]](0).get
  val proof = getVar[Coll[Byte]](1).get
  val expectedAnchorH = getVar[Int](2).get
  val valueOpt = tree.get(key, proof)
  val value = valueOpt.get
  val anchorBytes = value.slice(32, 36)
  // LEFT-PAD: zeros ++ anchorBytes (NOT anchorBytes ++ zeros — that overflows)
  val anchorLong = byteArrayToLong(Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte) ++ anchorBytes)
  val anchorInt = anchorLong.toInt
  sigmaProp(nftOk && valueOpt.isDefined && value.size == 36 && anchorInt == expectedAnchorH)
}
```

**Bugs found and fixed during Spike 3c**:
| Issue | Root Cause | Fix |
|-------|-----------|-----|
| `key_length > 0` assertion | AvlTree R5 serialization: Scala node uses `digest → flags → keyLen(VLQ) → valueOpt(VLQ)`, NOT `flags → digest → keyLen(u32)` | Fixed serialization order + VLQ encoding |
| `Downcast: Int overflow` | `byteArrayToLong(anchorBytes ++ zeros)` shifts value left by 32 bits → overflow | Changed to `zeros ++ anchorBytes` (left-pad) |
| `Malformed request` from node | Node v6 `/wallet/transaction/sign` can't parse contract boxes with `0x10` ErgoTree header in `inputsRaw` | Switched to `ergo-lib-wasm-nodejs` `Wallet.sign_transaction()` |
| NFT not authenticated | `trackerNftId = getVar[Coll[Byte]](0).get` — claimant-controlled, doesn't authenticate singleton | Changed to `fromBase16("...")` hardcoded at compile time |

**Negative test tightening**: Rejection is classified ONLY on specific error strings (`Script reduced to false`, `Tree proof is incorrect`, `starting_digest.starts_with`, `key_length`, `Prover error`). Generic `Evaluation error` alone is NOT counted as PASS — unexpected evaluation crashes surface as ERROR.

---

### Spike 4: DUP Batched Insert Budget Feasibility — ✅ PASS

> **Objective**: Evaluate budget feasibility of batched AVL insertions into the DUP tree when processing multiple peg-out claims in a single TX.

- [x] Benchmark 1, 5, 10, 20 insertions per TX with a synthetic batched DUP contract
- [x] Compare against the Ergo execution budget via real `ergo-lib-wasm-nodejs` transaction evaluation
- [x] Identify practical V1 target: **10-20 peg-outs per DUP batch** is viable
- [x] Document proof shape: one lookup proof per key + one batched insert proof

**Proof shape tested**:
- `N` independent non-membership lookup proofs, each against the original DUP tree
- one `AvlTree.insert(Coll[(key, value)], insertProof)` proof for all `N` inserts
- fixed-size contracts generated for `N = 1, 5, 10, 20`
- production `DoubleUnlockPrevention.es` unchanged; this is a spike proving the future batched contract shape

**Spike 4 measurements** (history tree size: 1,000 existing keys, value length `Some(1)`):
| Batch Size | Lookup Proofs Total | Batch Insert Proof | Context Extension Total | Proof Gen | Sign/Eval |
|------------|---------------------|--------------------|-------------------------|-----------|-----------|
| 1          | 409 B               | 409 B              | 858 B                   | 5.0 ms    | 61.8 ms   |
| 5          | 2,045 B             | 1,532 B            | 3,765 B                 | 15.4 ms   | 9.2 ms    |
| 10         | 4,124 B             | 2,587 B            | 7,084 B                 | 22.9 ms   | 9.2 ms    |
| 20         | 8,145 B             | 4,697 B            | 13,585 B                | 43.3 ms   | 11.6 ms   |

**Result**: ✅ **PASS** — batches up to 20 evaluate under the current Ergo budget. Exact JIT cost not measured; acceptance is successful full transaction evaluation under `ergo-lib-wasm-nodejs`. Batch 20 leaves substantial headroom vs the 96KB transaction size limit, so Phase 011a can target 10-20 peg-outs per relayer batch before retesting larger sizes.

---

### Spike 5: Substrate Frontier Receipt / Revert Event Extraction — ✅ PASS

> **Objective**: Validate that sidechain burn events can be reliably extracted from Substrate Frontier blocks for commitment anchoring.

- [x] Identify where EVM `PegOut` events land: **Frontier receipt logs**, not native Substrate pallet events
- [x] Confirm runtime exposes `pallet_ethereum::CurrentReceipts` and `CurrentTransactionStatuses`
- [x] Extract `PegOut(address,uint256,bytes)` by ABI topic from successful receipts only
- [x] Reject reverted receipts (`status != 1`) even if a malformed fixture contains a matching log
- [x] Live devnet validation: deploy transient SERG + ErgoBridge, mint sERG, call `pegOut`, compare `eth_getTransactionReceipt` extraction with `queryFilter`

**Extraction rule tested**:
1. Use `eth_getLogs` / `queryFilter` to find `PegOut` logs for the bridge contract.
2. Fetch each `eth_getTransactionReceipt`.
3. Accept only `receipt.status == 1`.
4. Parse logs whose `address == bridgeAddress` and `topics[0] == keccak256("PegOut(address,uint256,bytes)")`.
5. Persist `(txHash, blockNumber, blockHash, logIndex, user, netAmount, ergoRecipientPubKey)`.

**Spike 5 live result** (`spike5-frontier-pegout-extraction.ts`, temporary Frontier dev node):
| Check | Result |
|-------|--------|
| Static runtime: `CurrentReceipts` exposed | ✅ PASS |
| Static runtime: transaction statuses exposed | ✅ PASS |
| Synthetic successful receipt extraction | ✅ PASS |
| Synthetic wrong bridge address ignored | ✅ PASS |
| Synthetic reverted receipt ignored | ✅ PASS |
| Live transient deployment | ✅ PASS |
| Live PegOut receipt extraction | ✅ PASS (`events=1`) |
| Live receipt/queryFilter parity | ✅ PASS (`logIndex=2`) |

**Result**: ✅ **PASS** — PegOut extraction is receipt-log based, status-gated, and deterministic. For Phase 011a, the relayer should build `bridge_event_root` from successful Frontier receipt logs. Native Substrate events are not the canonical source for EVM PegOut burns. A future production pallet hook can compute the same root in `on_finalize` by reading `pallet_ethereum::CurrentReceipts`, but this spike did not add a production pallet.

---

### Spike 6: Local Mining / Devnet 0x04 Injection — ✅ PASS WITH NODE PATCH

> **Objective**: Confirm that a custom Ergo devnet miner can inject `0x04` extension fields, or determine alternative injection strategy.

- [x] Check if `SidechainsDataPrefix` code exists in local Ergo source — **not found**
- [x] Determine if extension fields with arbitrary first-byte prefixes are accepted by node validation — **yes, no prefix whitelist**
- [x] Confirm `(0x0401, 32-byte-hash)` participates in Scorex-compatible extension Merkle root/proof — **yes**
- [x] Inspect stock mining API and candidate generation path — **no extension injection parameter/hook**
- [x] Implement patched local node/miner sidechain extension injection hook — `ergo-source` commit `ed506f3`
- [x] Set up patched local devnet/miner with `ERGO_SIDECHAIN_EXTENSION_FIELDS=0401:<64hex>`
- [x] Mine a real block containing `(0x0401, 32-byte-hash)` and verify the field appears in headers/`extensionRoot`

**Source findings** (`spike6-extension-injection-viability.ts`):

| Check | Result |
|-------|--------|
| `SidechainsDataPrefix` in local Ergo source | ✅ Not found |
| Extension key/value constraints | ✅ 2-byte key, value <= 64 bytes |
| Extension validator prefix whitelist | ✅ None found; validates interlinks, key length, value length, duplicate keys, non-empty |
| Extension serializer | ✅ Writes `key`, `value.length`, `value` without prefix-specific branching |
| Protocol comment | ✅ Extension section may contain arbitrary miner data |
| `/mining/candidate` / `/mining/candidateWithTxs` | ⚠️ Tx selection only; no extension-field injection |
| `CandidateGenerator` extension assembly | ⚠️ Built from params/interlinks/validation settings; no sidechain hook |
| Synthetic `0x0401` Merkle proof | ✅ Root/proof verifies; proof size 66 bytes for 3-field synthetic extension |

**Implementation implication**:

The extension **format** is viable for a sidechain key space such as `0x04xx`; the blocker is operational, not cryptographic. In stock Ergo node, `extensionRoot` is derived from `candidate.extension.digest` inside `CandidateGenerator.deriveUnprovenHeader`, and the public mining API only lets callers request candidates with selected transactions. An external miner cannot safely append `0x04` fields after candidate creation because the header already commits to the extension root.

**Required path for a real devnet test**:

Patch the Ergo node/miner candidate path to append configured sidechain extension fields before `extensionRoot` is derived, e.g. after:

```scala
newParams.toExtensionCandidate ++ interlinksExtension ++ newValidationSettings.toExtensionCandidate
```

and in the non-voting-epoch branch after `interlinksExtension`. The patched node should then mine a local block with `0x0401 -> bridge_event_root` and expose the field in the block extension section.

**Result**: ✅ **PASS WITH NODE PATCH** — `0x04xx` extension fields are format-valid, Merkle-verifiable, and were verified in a real patched devnet block. Stock node mining still has no public injection hook, so Phase 011a requires the explicit Ergo node/miner patch or an equivalent trusted candidate generator.

**Patch status**: ✅ local Ergo node hook implemented in `ergo-source` commit `ed506f3`:

```text
ERGO_SIDECHAIN_EXTENSION_FIELDS=0401:<64-byte-hex-or-less>
```

Multiple fields use comma or semicolon separators, e.g. `0401:<hex>,0402:<hex>`. The patch accepts only `0x04xx` keys, enforces 2-byte keys, value length <= 64 bytes, duplicate-key rejection, and appends the fields before `extensionRoot` is derived.

**Patched devnet verification (2026-05-07)**:
- Ran patched node from `ergo-source` commit `ed506f3` on isolated devnet ports `19052/19021`.
- Runtime env: `ERGO_SIDECHAIN_EXTENSION_FIELDS=0401:1111111111111111111111111111111111111111111111111111111111111111`.
- Node version reported by `/info`: `6.0.2-2-ed506f3c-SNAPSHOT`; mining active; devnet height advanced from 1 to 45.
- Inspected block `9df302ea8dffe84a5a29101a26dafac56e62b4f8309b73fb5434864e321a3c4a` (height 45) via `/blocks/{headerId}`.
- Verified `extension.fields` includes `["0401", "1111111111111111111111111111111111111111111111111111111111111111"]`.
- Verified block `extension.digest` equals header `extensionHash` (`96eebff800aa8da97f0092b3663346443250559919bc0226fb7511daf439695e`).
- Operational note: running via SBT on Java 17 required `runMain org.ergoplatform.ErgoApp` and clearing the obsolete forked runtime option with `set run / javaOptions := Seq.empty`.

---

### Spike 7: SPV Tracker Contention — Ingest/Peg-Out Batching Pattern — ✅ PASS

> **Objective**: Determine how to avoid BoxId contention between SPV Tracker ingestion (which spends the tracker box) and peg-out claim verification (which reads the tracker via DataInput).

The mutable SPV Tracker box has a single BoxId at any point in time. A peg-out TX referencing this BoxId as a DataInput will fail if an ingestion TX spends it first. This spike must find a viable pattern:

- [x] Option A: **Batch ingest + peg-outs in a single TX** — relayer builds one TX that advances the SPV Tracker (INPUTS→OUTPUTS) and simultaneously resolves peg-out claims, with contracts verifying the combined INPUTS/OUTPUTS structure — **selected**
- [x] Option B: **Snapshot box pattern** ⚠️ HIGH-RISK/EXPERIMENTAL — ingestion creates an immutable "latest snapshot" box that peg-outs read via DataInput, while the mutable tracker advances independently. **Rejected for Phase 011a.** Security guardrail: In Ergo, a contract protects spending but NOT creation. Any actor can create a box with any script and any register values. A snapshot box read as DataInput is NOT authenticated just because it has the right script or registers. If this option is ever revisited, it MUST prove:
  - How `MainChainUnlock` authenticates that the snapshot originates from the real tracker (e.g., via a Snapshot_NFT minted by the tracker contract, or by verifying the snapshot's creation TX consumed the tracker singleton)
  - Why an attacker cannot create a fake snapshot with a forged `bridge_event_root`
  - How this avoids the HVT/header-box anti-pattern (unauthenticated DataInput boxes already rejected in bridge threat model)
  - What the GC/storage rent model is for expired snapshots (who pays, who reclaims)
  - **Until these are answered, Option B is experimental only, not a presumed-viable candidate**
- [x] Option C: **Epoch-based ingestion** — ingest only at fixed intervals (e.g., every N blocks), peg-outs use the stable BoxId between epochs — **partial operational fallback**
- [x] Evaluate each option for: JIT cost, TX size, contract complexity, latency impact, and composability with existing DUP replay protection
- [x] Prototype the winning pattern in ErgoScript pseudocode

**Spike 7 result** (`spike7-spv-tracker-contention.ts`):

| Scenario | Result |
|----------|--------|
| Separate ingest then peg-out DataInput | ✅ Conflicts as expected: stale tracker DataInput is missing after ingest spends T0 |
| Combined aggregate TX | ✅ Valid model: tracker is an INPUT and successor is an OUTPUT |
| Epoch ingestion window | ⚠️ Works only if relayer freezes ingestion while peg-outs settle |
| Snapshot fake-box attack | ✅ Demonstrated: script/register matching alone accepts a fake snapshot; token auth fixes authenticity but reintroduces mutable BoxId movement |

**Decision**: Option A is the Phase 011a pattern.

```
INPUTS:  tracker Tn + DUP + lock boxes + fee boxes
OUTPUTS: tracker Tn+1 + DUP successor + user payouts + fee/change
```

Peg-out contracts must read the SPV tracker as a transaction **INPUT**, not as a DataInput, when a tracker ingest may occur in the same settlement window. They authenticate the hardcoded `TRACKER_NFT_ID` on the tracker input/output. Existing commitments can be proven against `trackerIn.R5[AvlTree]`; commitments ingested in the same aggregate TX can be proven against `trackerOut.R5[AvlTree]`, while the tracker input script enforces that `trackerOut.R5.digest` is the valid AVL insert result.

**Winning pseudocode**:

```scala
// SPV Tracker input script, simplified
val trackerOut = OUTPUTS(0)
val preserveNft = trackerOut.tokens(0)._1 == SELF.tokens(0)._1
val oldTree = SELF.R5[AvlTree].get
val insertOps = getVar[Coll[Byte]](0).get
val insertProof = getVar[Coll[Byte]](1).get
val newTree = oldTree.insert(insertOps, insertProof).get
sigmaProp(
  preserveNft &&
  trackerOut.R5[AvlTree].get.digest == newTree.digest &&
  committeeOk
)
```

```scala
// Peg-out contract path, simplified
val trackerIn = INPUTS(trackerInputIndex)
val trackerOut = OUTPUTS(trackerOutputIndex)
val trackerInputOk = trackerIn.tokens(0)._1 == TRACKER_NFT_ID
val trackerOutputOk = trackerOut.tokens(0)._1 == TRACKER_NFT_ID

val trackerTree = if (usePostIngestDigest) {
  trackerOut.R5[AvlTree].get
} else {
  trackerIn.R5[AvlTree].get
}

val valueOpt = trackerTree.get(commitmentKey, trackerProof)
sigmaProp(trackerInputOk && trackerOutputOk && valueOpt.isDefined && burnProofOk && dupUpdated)
```

**Operational fallback**: Option C (epoch windows) may be used if implementation wants lower contract complexity at the cost of added latency: pause ingestion during a peg-out settlement window, then ingest the next batch. This reduces contention but does not support atomic "ingest new commitment + claim against it" in the same TX.

**Result**: ✅ **PASS** — BoxId contention has a viable Phase 011a workaround: aggregate settlement TX with tracker as INPUT. Snapshot boxes are rejected for this phase.

---

### Spike 9: Aggregate Singleton Co-Spend Evaluation — ✅ PASS

> **Objective**: Prove the selected aggregate TX shape can spend the SPV tracker singleton and the DUP singleton in one transaction without successor-output index conflicts.

**Key issue found**: `SPVTracker.es` and the legacy `DoubleUnlockPrevention.es` both expect their successor at `OUTPUTS(0)`. They cannot both be used unchanged in the same aggregate transaction.

**Fix**: Add `contracts/DoubleUnlockPreventionAggregate.es`, a single-claim aggregate-compatible DUP variant with the same context extension layout as the legacy DUP contract but with its successor at `OUTPUTS(1)`.

**Historically evaluated TX shape** (`spike9-aggregate-settlement-eval.ts`,
broadcast-capable source intentionally retired from the current checkout):

```text
INPUTS:  SPVTracker + DoubleUnlockPreventionAggregate + fee input
OUTPUTS: SPVTracker successor (0) + DUP successor (1) + payout + change + fee
```

**Real evaluation result** (2026-05-07):
- `SPVTracker` no-ingest path evaluated while preserving AVL digest/latest sidechain height.
- `DoubleUnlockPreventionAggregate` evaluated a real non-membership lookup + insert proof for one burn TX ID.
- The aggregate spend was signed locally with `ergo-lib-wasm-nodejs` and was not submitted.
- Setup TXs: `9d313cd890b72734e595454259457c50ede381dbf91461b9ce46d6c903287760` (SPVTracker) and `761fa6dae4a3575ccb9fb4265fe455fe8ba241a47fd62c45495095050b3da5f8` (aggregate DUP).
- Signed aggregate TX prefix: `bbe970269962356f91166d8a...`
- Evaluation time: ~98ms.

**Scope note**: This validates singleton coordination and the single-claim DUP update. Final peg-out payout authorization and multi-claim batched DUP contract wiring remain production-integration work.

---

### Spike 10: Aggregate SPV Payout Evaluation — ✅ PASS

> **Objective**: Replace the old `MainChainUnlock.es` SCS/DataInput confirmation model with a direct aggregate payout guard that verifies the SPV tracker lookup, DUP update, finality, event root, and user payout in one transaction.

**New contract**: `contracts/MainChainAggregateUnlock.es`

**Historically evaluated TX shape** (`spike10-aggregate-payout-eval.ts`,
broadcast-capable source intentionally retired from the current checkout):

```text
INPUTS:  SPVTracker + DoubleUnlockPreventionAggregate + MainChainAggregateUnlock
OUTPUTS: SPVTracker successor (0) + DUP successor (1) + user payout (2) + fee
```

**What the payout guard verifies**:
- `TRACKER_NFT_ID` and `DUP_NFT_ID` are hardcoded at compile/deploy time, not claimant-provided.
- `trackerIn.R5[AvlTree].get.get(trackerKey, trackerProof)` returns a 36-byte Schema B value.
- `ergoAnchorHeight` is decoded with `byteArrayToLong(zeros ++ anchorBytes)` and must satisfy `HEIGHT - anchorHeight >= 10`.
- V1 event-root binding: `eventRoot == blake2b256("E2S_BURN_V1" || burnTxId || recipientTree || amountBytes)`.
- DUP input proves the same `burnTxId` is absent and `dupOut.R5` matches the insert result.
- `OUTPUTS(2)` pays at least the claimed amount to the claimed recipient ErgoTree.

**Real evaluation result** (2026-05-07):
- Positive aggregate payout signed/evaluated locally: `0d71ebf7bf1bf18ed8405653...` in ~118ms.
- Negative tests all rejected with `Script reduced to false`:
  - wrong recipient output
  - underpaid payout
  - wrong event-root preimage
- Setup TXs: `268cc65d97d2d00d2b6e809e8c7c4ea90721954ba9f29198b933531d97ea5352` (SPVTracker), `2b3f1a8be8580613c7bb8b327e33d3320496a857c0b3a00b80f41146e6c572ec` (aggregate DUP), `2c91392fade36d104bbcd3572c8c432dc7f612887ea4cfaaa3fe1a717c8a8d1f` (aggregate unlock box).

**Scope note**: This is a V1 single-event event-root binding. Multi-event bridge-event Merkle proofs remain production-integration work; the contract shape deliberately does not claim to validate a multi-leaf event tree yet.

---

## Final Phase 011a Architecture Decision

The seven-spike architecture gate is complete, and follow-up implementation validation spikes 8-10 have passed. Spike 6 requires a patched Ergo node/miner because the stock miner has no public `0x04xx` extension injection hook, but the local hook in `ergo-source` commit `ed506f3` was verified by mining and inspecting a patched devnet block containing key `0x0401`.

### Selected Architecture

1. **Ergo L1 anchor format**
   - Patched Ergo node/miner injects extension key `0x0401`.
   - Value is the 32-byte sidechain commitment root / bridge event root commitment for that anchor.
   - Extension Merkle proof uses the Spike 2b fixed-width format: `[side(1) || siblingHash(32)]` per level, with side byte `0x02/0x03` for EmptyNode cases.

2. **SPV tracker schema**
   - Use Spike 3 **Schema B**.
   - Key: `blake2b256("E2S_SPV_V1" || sidechainId || sidechainHeight_8BE || sidechainHeaderHash)`.
   - Value: `bridge_event_root(32) || ergoAnchorHeight_4BE(4)`.
   - Peg-out verification uses `tree.get(key, proof)` and decodes `anchorHeight` via `byteArrayToLong(zeros ++ anchorBytes)`.

3. **Ingest policy**
   - First-anchor-wins for duplicate sidechain headers.
   - Relayer only ingests L1 anchors after K confirmations to reduce reorg poisoning risk.
   - Federated committee authorization remains the Phase 011a trust anchor for tracker updates.

4. **Peg-out extraction**
   - Substrate Frontier peg-outs are derived from successful EVM receipts only.
   - Accept only logs from the configured bridge contract and only receipts with `status == 1`.
   - Reject reverted receipts even if malformed fixtures contain matching log topics.

5. **Settlement transaction pattern**
   - Use Spike 7 **Option A**: relayer/coordinator builds an aggregate TX.
   - The SPV tracker is a transaction **INPUT**, not a peg-out DataInput, when an ingest may occur in the same settlement window.
   - TX shape:

```text
INPUTS:  tracker Tn + DUP + lock boxes + fee boxes
OUTPUTS: tracker Tn+1 + DUP successor + user payouts + fee/change
```

   - Existing commitments may be proven against `trackerIn.R5[AvlTree]`.
   - Commitments ingested in the same TX may be proven against `trackerOut.R5[AvlTree]`.
   - Tracker input script enforces the AVL digest transition; peg-out scripts authenticate hardcoded `TRACKER_NFT_ID` on tracker input/output.
   - Single-claim payout authorization uses `MainChainAggregateUnlock.es`, which validates tracker membership/finality, DUP insertion, V1 event-root binding, and `OUTPUTS(2)` payout.

6. **DUP replay protection**
   - Single-claim aggregate settlement uses `DoubleUnlockPreventionAggregate.es`, whose successor is `OUTPUTS(1)` because `OUTPUTS(0)` is reserved for the SPV tracker successor.
   - Use one unified batched AVL proof for multiple burn IDs once the fixed-size batched aggregate DUP contract shape is promoted from Spike 4 to production.
   - Spike 4 validates batches up to 20 under the current budget; exact JIT cost is still not separately measured.

### Rejected / Deferred

- **Snapshot boxes** are rejected for Phase 011a. A box with matching script/registers is forgeable because Ergo protects spending, not creation. A singleton Snapshot_NFT restores authenticity but moves on update, reintroducing BoxId contention.
- **Trustless reorg purge** is deferred. Phase 011a uses K-confirmation gating plus federated correction.
- **Stock Ergo miner without patch** is insufficient for `0x04` injection. A patched candidate generation path is required before end-to-end devnet anchoring.

### Historical Implementation Gate And Current Boundary

The original Phase 011a implementation sequence was:

1. SPV Tracker contract using Schema B (`valueLengthOpt = Some(36)`) — ✅ implemented in `contracts/SPVTracker.es`.
2. Aggregate settlement builder combining tracker ingest, DUP update, and
   peg-out payouts. The historical daemon selected no-ingest or same-transaction
   ingest from local tracker state. That routing is no longer active: the V1 fee
   equation can undercollateralize the bridge, so current code cannot build,
   sign, submit, or broadcast a new V1 payout. Multi-claim expansion is not a
   current objective.
3. Historical end-to-end target: Frontier peg-out event -> Ergo `0x0401`
   anchor -> tracker ingest -> aggregate peg-out settlement. The former V1
   run/check/submit runner is retired. The remaining runner exposes unsigned
   diagnostics and exact historical reconciliation only; live completion waits
   for the separately versioned external-fee replacement profile.

**Implementation progress (2026-05-07)**:
- Added `contracts/SPVTracker.es` with registers `R4=version`, `R5=AvlTree(key=32,value=36)`, `R6=committee SigmaProp`, `R7=latest sidechain height`, `R8=last Ergo HEIGHT stamp`.
- Contract supports an insert path with context vars `Var(0)=key`, `Var(1)=value`, `Var(2)=insertProof`, `Var(3)=newLatestSidechainHeight`.
- Contract also supports a no-ingest aggregate-settlement path when those vars are absent; AVL tree and latest sidechain height must be preserved while version/time advance.
- Full `AvlTree` equality is used for successor checks, not digest-only equality, so key length/value length/flags cannot be silently changed.
- Historical Spike 8 results verified real `ergo-lib-wasm-nodejs` transaction evaluation for both insert and no-ingest paths. Setup TX `90769542c57ae7d88e284e806cd93a8169ae466e2a84f0106d58047e4e18ae9d` minted a test tracker box; spend TXs were signed/evaluated locally and not submitted. The direct broadcast-capable script is intentionally absent from the current checkout and remains recoverable only from Git history.
- Added `relayer/src/spv-tracker.ts` proof helpers and `spv_tracker_history` SQLite persistence for rebuild-on-demand SPV tracker proof generation.
- Exposed batched DUP proof generation through `relayer/src/avl-bridge.ts` (`insertLockRecordsBatch`).
- Added `contracts/DoubleUnlockPreventionAggregate.es`, a single-claim aggregate-compatible DUP variant that checks its successor at `OUTPUTS(1)`.
- Historical Spike 9 results record a signed/evaluated aggregate singleton co-spend with `SPVTracker` successor at `OUTPUTS(0)` and DUP successor at `OUTPUTS(1)`; the direct broadcast-capable script is intentionally absent from the current checkout.
- Added `contracts/MainChainAggregateUnlock.es`; historical Spike 10 results record the first direct SPV-aware aggregate payout guard evaluation, including finality, event-root binding, DUP insertion, and payout checks. The retired script remains available only through Git history. The contract accepts `Var(7)` as a tracker-tree selector (`0=trackerIn.R5`, `1=trackerOut.R5`) so newly ingested same-TX commitments can be proven against the tracker successor guarded by `SPVTracker.es`.
- Extended `deployed_state.json` shape, deployment, and status reporting for optional `doubleUnlockPreventionAggregate` and `mainChainAggregateUnlock` entries.
- Added `relayer/src/aggregate-settlement-tx.ts` for single-claim aggregate TX assembly from the proof plan. It emits the SPV tracker ingest extension when present and sets the payout contract tracker selector so claims can be proven against `trackerIn.R5` or `trackerOut.R5`.
- The first aggregate settlement service historically combined candidate assembly,
  signing, submission, and reconciliation. Its current boundary retains unsigned
  preparation plus exact confirmation/recovery of already-submitted historical
  transactions; new V1 checking, signing, authorization, and transport are
  physically absent.
- The former aggregate CLI and anchored variants demonstrated same-transaction
  SPV ingest and payout. Current commands are limited to unsigned `prepare*`
  diagnostics and `confirm*` historical reconciliation. Configuration or old
  approvals cannot restore the removed `submit*` surface.
- The former aggregate daemon flags selected live V1 settlement. They now only
  identify historical configuration; the daemon cannot build, sign, submit, or
  broadcast a new legacy aggregate payout.
- The historical E2E runner exercised seed, burn, anchor, node check, submit,
  and confirmation on a patched devnet. Its current compatibility harness
  exposes unsigned preparation and exact historical confirmation only.
- Verified the aggregate runner on 2026-05-07 through the seed + burn boundary: seed lock `2d227143c2a55df51c79a215e58946e8744e0a0adc108d65af702483b89fae1f`, confirmed MCL box `e31947216519b89c029ba7efcd8ea1682ba5fc9f6881f2e8da28f8a894c5332a`, mint TX `0x12763494b960b49911feff97c8b351a0ca6b22baab54137f5f008172da8895fc`, peg-out burn `0x896b4e569f3c71665e6cc242eb2855dbb4093882290b52038e8f0e88201c281d` at sidechain height 192. A short `prepare` run correctly timed out at the expected stock-node boundary: no confirmed `0x0401` anchor for that burn in the current Ergo node window.
- Added `scripts/run-patched-ergo-devnet.ps1`, a Windows-safe launcher for the patched `../ergo-source` node. It merges `application.conf`, `devnet.conf`, and `node1/application.conf`, restores a valid REST API key hash, passes `ERGO_SIDECHAIN_EXTENSION_FIELDS`, and avoids the Java 17 `java.xml.bind` run option. Verified on 2026-05-08 with patched node `6.0.2-2-ed506f3c-SNAPSHOT` on `127.0.0.1:9051`, mining enabled, and real block extension field `0401:cb87e59afa376bb7d38e7a0fd6d8f4e03b83286c324597ff1549cd38617f946c`.
- Verified `anchor-check` on 2026-05-08 against the patched devnet for burn `0x896b4e569f3c71665e6cc242eb2855dbb4093882290b52038e8f0e88201c281d`: explicit height 24 produced tracker key `00b746d32d417b3fdba7d22873dfa6de16de547abbea550f6e73fedc40766b3b` and tracker value `cb87e59afa376bb7d38e7a0fd6d8f4e03b83286c324597ff1549cd38617f946c00000018`; confirmed-window scan also passes and, with the static devnet hook, selects the oldest confirmed matching anchor.
- A dedicated aggregate deployment entrypoint formerly created V1 tracker, DUP,
  and liquidity boxes. It is now removed. Any recorded testnet transaction or
  box identities are immutable historical evidence and do not define an active
  deployment or funding procedure.
- Added `relayer/src/aggregate-settlement-builder.ts` as an isolated proof planner. It prepares SPV tracker insert/get proofs, DUP batch proofs, tracker ingest extensions, and a single-claim DUP extension compatible with `DoubleUnlockPreventionAggregate.es`. It explicitly flags multi-claim plans as requiring the Spike 4 batched DUP contract shape.
- Extended deployment/config/status paths for an optional `spvTracker` singleton in `deployed_state.json`.
- Added `ErgoClient.getSidechainExtensionFieldsAtHeight()` and `relayer/src/spv-anchor.ts` to normalize `0x0401` extension fields into SPV tracker entries. Unit coverage now includes SPV anchor normalization, SPV tracker persistence, and aggregate proof planning.

---

## Decision Gate

All 7 architecture-gate spikes plus implementation validation spikes 8-10 must produce clear pass/fail results before Phase 011a architecture is persisted as final. **Status: complete through single-claim aggregate payout validation.**

**Pass criteria**: All spikes pass, or failing spikes have documented workarounds that do not break the federated anchoring model.

**Fail criteria**: Any spike reveals a fundamental incompatibility (e.g., extension Merkle proofs cannot be verified in ErgoScript, JIT cost is prohibitive, or BoxId contention has no viable solution) without a viable workaround.

**Gate result**: ✅ **PASS** — no fundamental incompatibility found. The required Ergo node/miner hook from Spike 6 is implemented locally and verified by a real patched-devnet mined block containing `0x0401`.
