{
  // SPVTracker - mutable AVL+ store of accepted sidechain commitments.
  //
  // Phase 011a Schema B:
  //   key   = blake2b256("E2S_SPV_V1" || sidechainId || sidechainHeight_8BE || sidechainHeaderHash)
  //   value = bridge_event_root(32) || ergoAnchorHeight_4BE(4)
  //
  // Register layout:
  //   R4: Long      - tracker version / operation counter
  //   R5: AvlTree   - accepted commitments tree (key=32, value=36)
  //   R6: SigmaProp - committee authorization
  //   R7: Long      - latest accepted sidechain height metadata
  //   R8: Int       - last Ergo HEIGHT stamp
  //
  // Token: tokens(0) = Tracker_NFT singleton.
  //
  // Context extensions for ingest path (V1: one anchor insert per update):
  //   Var(0): Coll[Byte] - commitment key (32 bytes)
  //   Var(1): Coll[Byte] - commitment value (36 bytes)
  //   Var(2): Coll[Byte] - AVL insert proof
  //   Var(3): Long       - new latest sidechain height
  //
  // If Var(0..3) are absent, this is a no-ingest aggregate settlement step:
  // the tracker box may still be spent so peg-out settlement can consume the
  // current tracker as an INPUT, but the AVL digest and latest sidechain height
  // must be preserved.

  val committeePk = SELF.R6[SigmaProp].get
  val successor = OUTPUTS(0)

  val oldTree = SELF.R5[AvlTree].get
  val oldLatestSidechainHeight = SELF.R7[Long].get

  val maybeInsertKey = getVar[Coll[Byte]](0)
  val maybeInsertValue = getVar[Coll[Byte]](1)
  val maybeInsertProof = getVar[Coll[Byte]](2)
  val maybeNewLatestSidechainHeight = getVar[Long](3)

  val hasInsert = maybeInsertKey.isDefined &&
    maybeInsertValue.isDefined &&
    maybeInsertProof.isDefined &&
    maybeNewLatestSidechainHeight.isDefined

  val treeOk = if (hasInsert) {
    val insertKey = maybeInsertKey.get
    val insertValue = maybeInsertValue.get
    val toInsert = Coll((insertKey, insertValue))
    val modifiedTree = oldTree.insert(toInsert, maybeInsertProof.get).get
    successor.R5[AvlTree].get == modifiedTree
  } else {
    successor.R5[AvlTree].get == oldTree
  }

  val insertShapeOk = if (hasInsert) {
    maybeInsertKey.get.size == 32 && maybeInsertValue.get.size == 36
  } else {
    true
  }

  val sidechainHeightOk = if (hasInsert) {
    val newLatestSidechainHeight = maybeNewLatestSidechainHeight.get
    successor.R7[Long].get == newLatestSidechainHeight &&
      newLatestSidechainHeight > oldLatestSidechainHeight
  } else {
    successor.R7[Long].get == oldLatestSidechainHeight
  }

  val preserveNft = if (SELF.tokens.size > 0 && successor.tokens.size > 0)
    successor.tokens(0)._1 == SELF.tokens(0)._1 &&
    successor.tokens(0)._2 == SELF.tokens(0)._2
  else false
  val preserveContract = successor.propositionBytes == SELF.propositionBytes
  val preserveCommitteePk = successor.R6[SigmaProp].get == committeePk
  val counterAdvances = successor.R4[Long].get == SELF.R4[Long].get + 1L
  val stampHeight = successor.R8[Int].get <= HEIGHT
  val timeAdvances = successor.R8[Int].get > SELF.R8[Int].get
  val preserveValue = successor.value >= SELF.value

  sigmaProp(
    treeOk &&
    insertShapeOk &&
    sidechainHeightOk &&
    preserveNft &&
    preserveContract &&
    preserveCommitteePk &&
    counterAdvances &&
    stampHeight &&
    timeAdvances &&
    preserveValue
  ) && committeePk
}
