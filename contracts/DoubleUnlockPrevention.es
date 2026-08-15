{
  // DoubleUnlockPrevention — AVL+ tree of spent sidechain burn TX IDs
  // Prevents double-claiming during peg-out (sERG burn → ERG unlock)
  //
  // Register layout:
  //   R4: Long     — Operation counter (monotonically increasing)
  //   R5: AvlTree  — Spent TX IDs tree (key=32-byte txId, value=1-byte marker)
  //   R6: SigmaProp — Authorization metadata
  //
  // Token: tokens(0) = Singleton NFT
  //
  // Context extensions:
  //   Var(0): Coll[Byte] — AVL lookup proof (proves key NOT in tree)
  //   Var(1): Coll[Byte] — Sidechain burn TX ID (32 bytes)
  //   Var(2): Coll[Byte] — AVL insert proof (unified batch proof)

  val committee = Coll(
    COMMITTEE_SIGMAPROP_PLACEHOLDERS
  )
  val committeeOk = atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)
  val authMetadata = SELF.R6[SigmaProp].get

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
  val preserveAuthMetadata = successor.R6[SigmaProp].get == authMetadata
  val preserveValue = successor.value >= SELF.value

  sigmaProp(
    notSpent &&
    validTreeUpdate &&
    preserveNFT &&
    preserveContract &&
    counterAdvances &&
    preserveAuthMetadata &&
    preserveValue
  ) && committeeOk
}
