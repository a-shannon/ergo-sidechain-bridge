# Walkthrough 001a â€” ErgoScript Contracts

> 4 contracts for the Ergo-Substrate sidechain bridge.
> All compiled 4/4 on Ergo testnet node v6.0.3.

---

## Architecture Overview

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Ergo L1 â€” On-Chain Contract Architecture       â”‚
â”‚                                                  â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚ SideChainState   â”‚  â”‚ DoubleUnlockPrev.   â”‚  â”‚
â”‚  â”‚ (Singleton NFT)  â”‚  â”‚ (Singleton NFT)     â”‚  â”‚
â”‚  â”‚                  â”‚  â”‚                     â”‚  â”‚
â”‚  â”‚ R4: SC height    â”‚  â”‚ R4: counter         â”‚  â”‚
â”‚  â”‚ R5: T_h digest   â”‚  â”‚ R5: AVL+ tree       â”‚  â”‚
â”‚  â”‚ R6: U_h digest   â”‚  â”‚ R9: relayerPk       â”‚  â”‚
â”‚  â”‚ R7: C_h AVL root â”‚  â”‚                     â”‚  â”‚
â”‚  â”‚ R8: MC height    â”‚  â”‚ Ctx: Var(0)=lookup  â”‚  â”‚
â”‚  â”‚ R9: relayerPk    â”‚  â”‚      Var(1)=txId    â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚      Var(2)=insert  â”‚  â”‚
â”‚                         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚ MainChainLock    â”‚  â”‚ MainChainUnlock     â”‚  â”‚
â”‚  â”‚ (peg-in deposit) â”‚  â”‚ (peg-out release)   â”‚  â”‚
â”‚  â”‚                  â”‚  â”‚                     â”‚  â”‚
â”‚  â”‚ R4: EVM H160 addrâ”‚  â”‚ R4: burn TX hash    â”‚  â”‚
â”‚  â”‚ R5: amount       â”‚  â”‚ R5: unlock amount   â”‚  â”‚
â”‚  â”‚ R6: relayerPk    â”‚  â”‚ R6: recipient tree  â”‚  â”‚
â”‚  â”‚                  â”‚  â”‚ R7: burn height     â”‚  â”‚
â”‚  â”‚ proveDlog(R6)    â”‚  â”‚ R9: relayerPk       â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚ DataInput: StateBox â”‚  â”‚
â”‚                         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## Contract 1: SideChainState.es

**Purpose**: Singleton box tracking the canonical sidechain block state on Ergo L1.

**Design decisions**:
- `R9[SigmaProp]` stores relayerPk â†’ contract address is deployment-independent
- `oneUpdatePerBlock` prevents rapid-fire state spam (max 1 update per Ergo block)
- `preserveValue` ensures storage rent protection
- `sigmaProp(...) && relayerPk` combines proposition with signature requirement

**Compiled ErgoTree**: `1003040004000400d802d601b2a5730000d602e4c6a70908ea02d1edededededed91e4c672010405e4c6a70405938cb2db63087201730100018cb2db6308a77302000193c27201c2a793e4c672010804a391a3e4c6a7080493e4c672010908720292c17201c1a77202`

```scala
{
  // Phase 1: Single relayer authorization
  // Sidechain state singleton â€” tracks the canonical sidechain block state on Ergo L1
  //
  // Register layout:
  //   R4: Long         â€” Sidechain block height
  //   R5: Coll[Byte]   â€” Transaction digest T_h (blake2b256 of sidechain block txs)
  //   R6: Coll[Byte]   â€” UTXO set digest U_h (sidechain state root)
  //   R7: Coll[Byte]   â€” Chain digest C_h (AVL+ tree of all historical states)
  //   R8: Int           â€” Ergo mainchain HEIGHT at last update
  //
  // Token: tokens(0) = Singleton NFT identifying this box
  //
  // Spending condition: Only the relayer can update state, once per Ergo block,
  // with monotonically increasing sidechain height.

  val relayerPk = SELF.R9[SigmaProp].get

  val successor = OUTPUTS(0)

  // State must advance monotonically
  val heightAdvances = successor.R4[Long].get > SELF.R4[Long].get

  // Singleton NFT preserved
  val preserveNFT = successor.tokens(0)._1 == SELF.tokens(0)._1

  // Same contract continues
  val preserveContract = successor.propositionBytes == SELF.propositionBytes

  // Stamp current Ergo mainchain height
  val stampHeight = successor.R8[Int].get == HEIGHT

  // Only one update per Ergo block (prevents rapid-fire state spam)
  val oneUpdatePerBlock = HEIGHT > SELF.R8[Int].get

  // Preserve relayer PK in successor
  val preserveRelayerPk = successor.R9[SigmaProp].get == relayerPk

  // Minimum ERG preserved (storage rent protection)
  val preserveValue = successor.value >= SELF.value

  sigmaProp(
    heightAdvances &&
    preserveNFT &&
    preserveContract &&
    stampHeight &&
    oneUpdatePerBlock &&
    preserveRelayerPk &&
    preserveValue
  ) && relayerPk
}
```

> **Audit question for Deep Think**: Is `OUTPUTS(0)` safe here? If a malicious miner reorders outputs, the NFT could end up in a different output index. Should we use a filter-based successor lookup instead (e.g., find output with matching NFT)?

---

## Contract 2: DoubleUnlockPrevention.es

**Purpose**: AVL+ authenticated dictionary tracking spent sidechain burn TX IDs. Prevents double-claiming during peg-out.

**Design decisions**:
- Separate `lookupProof` (Var(0)) and `insertProof` (Var(2)) â€” lookup proves non-membership, insert adds the key
- Value is `Coll(1.toByte)` not `Coll[Byte](1)` â€” the latter creates `Coll[Int]` which fails type checking
- Counter in R4 provides an audit trail of total operations
- Uses the **Batch Proof Mandate**: if processing multiple peg-outs, the relayer MUST generate a single unified batch proof

**Compiled ErgoTree**: `100504000201040004000502d804d601e4c6a70564d602e4e3010ed603b2a5730000d604e4c6a70908ea02d1ededededededefe6dc640a7201027202e4e3000e93db6401e4c672030564db6401e4dc640c72010283013c0e0e860272028301027301e4e3020e938cb2db63087203730200018cb2db6308a77303000193c27203c2a793e4c6720304059ae4c6a70405730493e4c672030908720492c17203c1a77204`

```scala
{
  // DoubleUnlockPrevention â€” AVL+ tree of spent sidechain burn TX IDs
  // Prevents double-claiming during peg-out (sERG burn â†’ ERG unlock)
  //
  // Register layout:
  //   R4: Long     â€” Operation counter (monotonically increasing)
  //   R5: AvlTree  â€” Spent TX IDs tree (key=32-byte txId, value=1-byte marker)
  //   R9: SigmaProp â€” Relayer public key (authorization)
  //
  // Token: tokens(0) = Singleton NFT
  //
  // Context extensions:
  //   Var(0): Coll[Byte] â€” AVL lookup proof (proves key NOT in tree)
  //   Var(1): Coll[Byte] â€” Sidechain burn TX ID (32 bytes)
  //   Var(2): Coll[Byte] â€” AVL insert proof (unified batch proof)

  val relayerPk = SELF.R9[SigmaProp].get

  val spentIdsTree = SELF.R5[AvlTree].get
  val lookupProof = getVar[Coll[Byte]](0).get
  val newTxId = getVar[Coll[Byte]](1).get
  val insertProof = getVar[Coll[Byte]](2).get

  // 1. Verify this TX ID has NOT been spent yet
  val notSpent = spentIdsTree.get(newTxId, lookupProof).isEmpty

  // 2. Insert into the tree (key=txId, value=0x01 marker)
  val toInsert = Coll((newTxId, Coll(1.toByte)))
  val modifiedTree = spentIdsTree.insert(toInsert, insertProof).get

  // 3. Verify successor box has the updated tree
  val successor = OUTPUTS(0)
  val validTreeUpdate = successor.R5[AvlTree].get.digest == modifiedTree.digest

  // 4. Preserve invariants
  val preserveNFT = successor.tokens(0)._1 == SELF.tokens(0)._1
  val preserveContract = successor.propositionBytes == SELF.propositionBytes
  val counterAdvances = successor.R4[Long].get == SELF.R4[Long].get + 1L
  val preserveRelayerPk = successor.R9[SigmaProp].get == relayerPk
  val preserveValue = successor.value >= SELF.value

  sigmaProp(
    notSpent &&
    validTreeUpdate &&
    preserveNFT &&
    preserveContract &&
    counterAdvances &&
    preserveRelayerPk &&
    preserveValue
  ) && relayerPk
}
```

> **Audit question for Deep Think**: This contract uses TWO separate proofs (lookup proof + insert proof). In the reference impl, we use a single unified proof for the batch operation. Is there a risk that the lookup proof and insert proof are generated from different tree states? The relayer must ensure both proofs are generated from the SAME tree snapshot.

---

## Contract 3: MainChainLock.es

**Purpose**: Deposit address for peg-in. Users send ERG here with their target EVM address in R4.

**Design decisions**:
- `proveDlog(decodePoint(R6))` â€” relayer PK embedded per-box, not hardcoded in contract
- This means the contract address is the same for all relayers, but each box is locked to a specific relayer
- `validTarget` and `validAmount` are checked but not enforced in the spending condition (they're informational for the relayer)

```scala
{
  // MainChainLock â€” ERG deposit address for peg-in (Ergo â†’ Sidechain)
  // 
  // Users send ERG to this contract to initiate a peg-in transfer.
  // The relayer monitors this address for new boxes, then mints
  // equivalent sERG on the sidechain.
  //
  // Register layout:
  //   R4: Coll[Byte] â€” Target EVM H160 address (20 bytes) on sidechain
  //   R5: Long       â€” Amount to mint on sidechain (nanoERG)
  //   R6: Coll[Byte] â€” Relayer public key bytes (for spending authorization)
  //
  // Anyone can CREATE a box at this address (deposit).
  // Only the relayer can SPEND it (process the peg-in).

  // The relayer PK is embedded in R6 at creation time
  val relayerPkBytes = SELF.R6[Coll[Byte]].get

  // Validate that target EVM address is exactly 20 bytes
  val targetAddress = SELF.R4[Coll[Byte]].get
  val validTarget = targetAddress.size == 20

  // Validate amount > 0
  val amount = SELF.R5[Long].get
  val validAmount = amount > 0L

  // Only the relayer can spend (proveDlog on the embedded PK)
  proveDlog(decodePoint(relayerPkBytes))
}
```

> **Audit question for Deep Think**: `validTarget` and `validAmount` are computed but never used in the spending condition. Should they be? If a user creates a malformed box (wrong EVM address length), the relayer will simply ignore it â€” but it wastes the user's ERG. Should the contract reject invalid deposits?

---

## Contract 4: MainChainUnlock.es

**Purpose**: Two-phase ERG release for peg-out. Uses SideChainState as DataInput for confirmation depth verification.

**Design decisions**:
- `CONTEXT.dataInputs(0)` reads the SideChainState box without spending it
- `getVar[Coll[Byte]](0)` passes the SideChainState NFT ID via context extension (avoids hardcoding)
- `confirmationDepth = 50L` hardcoded â€” should this be configurable via a register?
- `correctRecipient` compares `propositionBytes` directly â€” safe for P2PK addresses

```scala
{
  // MainChainUnlock â€” Two-phase ERG release for peg-out (Sidechain â†’ Ergo)
  //
  // Phase 1 (create): Relayer creates this box after detecting sERG burn on sidechain.
  // Phase 2 (spend): After sufficient sidechain confirmations, release ERG to recipient.
  //
  // Register layout:
  //   R4: Coll[Byte] â€” Sidechain burn TX hash (32 bytes)
  //   R5: Long       â€” Amount to unlock (nanoERG)
  //   R6: Coll[Byte] â€” Recipient ErgoTree bytes
  //   R7: Long       â€” Sidechain height at burn event
  //   R8: Long       â€” Creation height on Ergo (for timeout recovery)
  //   R9: SigmaProp  â€” Relayer PK

  val relayerPk = SELF.R9[SigmaProp].get
  val burnTxId = SELF.R4[Coll[Byte]].get
  val unlockAmount = SELF.R5[Long].get
  val recipientTree = SELF.R6[Coll[Byte]].get
  val burnHeight = SELF.R7[Long].get

  // SideChainState box as DataInput (read-only, not spent)
  val stateBox = CONTEXT.dataInputs(0)
  val sideChainStateNftId = getVar[Coll[Byte]](0).get
  val isValidStateBox = stateBox.tokens(0)._1 == sideChainStateNftId

  // Confirmation depth check
  val confirmationDepth = 50L
  val currentSidechainHeight = stateBox.R4[Long].get
  val sufficientConfirmations = currentSidechainHeight >= burnHeight + confirmationDepth

  // Verify that ERG goes to the correct recipient
  val recipientOutput = OUTPUTS(0)
  val correctRecipient = recipientOutput.propositionBytes == recipientTree
  val correctAmount = recipientOutput.value >= unlockAmount

  sigmaProp(
    isValidStateBox &&
    sufficientConfirmations &&
    correctRecipient &&
    correctAmount
  ) && relayerPk
}
```

> **Audit question for Deep Think**: Should there be a timeout/recovery path? If the relayer disappears after Phase 1 but before Phase 2, the user's ERG is permanently locked. Consider adding an `OR` branch: `|| (HEIGHT > SELF.R8[Long].get + 720 && recipientSigma)` allowing the user to reclaim after ~24h.
