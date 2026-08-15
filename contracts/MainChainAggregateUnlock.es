{
  // MainChainAggregateUnlock
  //
  // Direct aggregate-settlement payout guard for Phase 011a.
  //
  // This contract replaces the old two-phase MainChainUnlock SCS DataInput
  // confirmation check for aggregate settlement. It validates:
  //   - the real SPV tracker singleton is present at INPUTS(0)/OUTPUTS(0)
  //   - the real aggregate DUP singleton is present at INPUTS(1)/OUTPUTS(1)
  //   - the sidechain commitment exists in trackerIn.R5[AvlTree] or trackerOut.R5[AvlTree]
  //   - tracker value finality via ergoAnchorHeight
  //   - a V1 single-event bridge root preimage
  //   - the DUP update inserts the same burnTxId
  //   - OUTPUTS(2) pays the claimed amount to the claimed recipient tree
  //
  // Placeholder constants are patched at deploy/spike time:
  //   TRACKER_NFT_ID_PLACEHOLDER
  //   DUP_NFT_ID_PLACEHOLDER
  //
  // Context extensions:
  //   Var(0): Coll[Byte] - SPV tracker key
  //   Var(1): Coll[Byte] - SPV tracker get proof
  //   Var(2): Coll[Byte] - burn TX ID (32 bytes)
  //   Var(3): Coll[Byte] - amount as 8-byte big-endian Long
  //   Var(4): Coll[Byte] - recipient ErgoTree bytes
  //   Var(5): Coll[Byte] - DUP lookup proof
  //   Var(6): Coll[Byte] - DUP insert proof
  //   Var(7): Int        - tracker tree selector: 0 = trackerIn, 1 = trackerOut

  val trackerNftId = fromBase16("TRACKER_NFT_ID_PLACEHOLDER")
  val dupNftId = fromBase16("DUP_NFT_ID_PLACEHOLDER")

  val trackerIn = INPUTS(0)
  val trackerOut = OUTPUTS(0)
  val dupIn = INPUTS(1)
  val dupOut = OUTPUTS(1)
  val payoutOut = OUTPUTS(2)

  val trackerKey = getVar[Coll[Byte]](0).get
  val trackerProof = getVar[Coll[Byte]](1).get
  val burnTxId = getVar[Coll[Byte]](2).get
  val amountBytes = getVar[Coll[Byte]](3).get
  val recipientTree = getVar[Coll[Byte]](4).get
  val dupLookupProof = getVar[Coll[Byte]](5).get
  val dupInsertProof = getVar[Coll[Byte]](6).get
  val trackerTreeSelector = getVar[Int](7).get

  val trackerNftOk =
    trackerIn.tokens(0)._1 == trackerNftId &&
    trackerOut.tokens(0)._1 == trackerNftId

  val dupNftOk =
    dupIn.tokens(0)._1 == dupNftId &&
    dupOut.tokens(0)._1 == dupNftId

  val selectedTrackerTree = if (trackerTreeSelector == 1) {
    trackerOut.R5[AvlTree].get
  } else {
    trackerIn.R5[AvlTree].get
  }
  val trackerSelectorOk = trackerTreeSelector == 0 || trackerTreeSelector == 1
  val trackerValueOpt = selectedTrackerTree.get(trackerKey, trackerProof)
  val trackerValue = trackerValueOpt.get
  val eventRoot = trackerValue.slice(0, 32)
  val anchorBytes = trackerValue.slice(32, 36)
  val anchorLong = byteArrayToLong(Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte) ++ anchorBytes)
  val anchorInt = anchorLong.toInt
  val minConfirmations = 10
  val finalityOk = HEIGHT - anchorInt >= minConfirmations

  val amount = byteArrayToLong(amountBytes)
  val domain = Coll(
    69.toByte, 50.toByte, 83.toByte, 95.toByte, 66.toByte, 85.toByte,
    82.toByte, 78.toByte, 95.toByte, 86.toByte, 49.toByte
  ) // "E2S_BURN_V1"
  val expectedEventRoot = blake2b256(domain ++ burnTxId ++ recipientTree ++ amountBytes)
  val eventRootOk = eventRoot == expectedEventRoot

  val dupTree = dupIn.R5[AvlTree].get
  val notSpent = dupTree.get(burnTxId, dupLookupProof).isEmpty
  val dupModified = dupTree.insert(Coll((burnTxId, Coll(1.toByte))), dupInsertProof).get
  val dupUpdated = dupOut.R5[AvlTree].get.digest == dupModified.digest

  val payoutOk =
    payoutOut.propositionBytes == recipientTree &&
    payoutOut.value >= amount

  val shapeOk =
    trackerKey.size == 32 &&
    burnTxId.size == 32 &&
    amountBytes.size == 8 &&
    recipientTree.size == 36 &&
    trackerValue.size == 36 &&
    trackerSelectorOk

  sigmaProp(
    trackerNftOk &&
    dupNftOk &&
    trackerValueOpt.isDefined &&
    finalityOk &&
    eventRootOk &&
    notSpent &&
    dupUpdated &&
    payoutOk &&
    shapeOk
  )
}
