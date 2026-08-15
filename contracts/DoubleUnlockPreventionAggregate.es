{
  // DoubleUnlockPreventionAggregate
  //
  // Aggregate-settlement variant of DoubleUnlockPrevention.es.
  // The regular DUP contract expects its successor at OUTPUTS(0). In the
  // aggregate transaction shape, OUTPUTS(0) is reserved for the SPVTracker
  // successor, so this contract verifies its DUP successor at OUTPUTS(1).
  //
  // Register layout:
  //   R4: Long      - operation counter
  //   R5: AvlTree   - spent sidechain burn TX IDs (key=32, value=1)
  //   R6: SigmaProp - authorization metadata
  //
  // Context extensions:
  //   Var(0): Coll[Byte] - AVL lookup proof proving burn TX ID is absent
  //   Var(1): Coll[Byte] - sidechain burn TX ID (32 bytes)
  //   Var(2): Coll[Byte] - AVL insert proof

  val committee = Coll(
    COMMITTEE_SIGMAPROP_PLACEHOLDERS
  )
  val committeeOk = atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)
  val authMetadata = SELF.R6[SigmaProp].get

  val spentIdsTree = SELF.R5[AvlTree].get
  val lookupProof = getVar[Coll[Byte]](0).get
  val newTxId = getVar[Coll[Byte]](1).get
  val insertProof = getVar[Coll[Byte]](2).get

  val notSpent = spentIdsTree.get(newTxId, lookupProof).isEmpty

  val toInsert = Coll((newTxId, Coll(1.toByte)))
  val modifiedTree = spentIdsTree.insert(toInsert, insertProof).get

  val successor = OUTPUTS(1)
  val validTreeUpdate = successor.R5[AvlTree].get.digest == modifiedTree.digest

  val preserveNFT = successor.tokens(0)._1 == SELF.tokens(0)._1
  val preserveNFTAmount = successor.tokens(0)._2 == SELF.tokens(0)._2
  val preserveContract = successor.propositionBytes == SELF.propositionBytes
  val counterAdvances = successor.R4[Long].get == SELF.R4[Long].get + 1L
  val preserveAuthMetadata = successor.R6[SigmaProp].get == authMetadata
  val preserveValue = successor.value >= SELF.value

  sigmaProp(
    newTxId.size == 32 &&
    notSpent &&
    validTreeUpdate &&
    preserveNFT &&
    preserveNFTAmount &&
    preserveContract &&
    counterAdvances &&
    preserveAuthMetadata &&
    preserveValue
  ) && committeeOk
}
