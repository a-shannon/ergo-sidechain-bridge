{
  // MainChainAggregateUnlockTrustless
  //
  // V2 source-boundary contract for bridge-native trustless burn settlement.
  // This surface verifies the compact bridgeEventRoot proof bundle needed by
  // local source-boundary evidence. The burn proof is bounded to 14 nodes so
  // proof evaluation cost stays explicit; Gate 5 still needs contract
  // evaluation evidence, deployment, live rehearsal, and independent review.
  //
  // Transaction shape:
  //   INPUTS(0):  SPVTracker singleton
  //   INPUTS(1):  DoubleUnlockPreventionAggregate singleton
  //   INPUTS(2):  this unlock box
  //   OUTPUTS(0): SPVTracker successor
  //   OUTPUTS(1): DUP successor
  //   OUTPUTS(2): payout output
  //
  // Context extensions:
  //   Var(0): Coll[Byte] - SPV tracker key
  //   Var(1): Coll[Byte] - SPV tracker get proof
  //   Var(2): Coll[Byte] - canonical trustless burn encoded leaf, 205 bytes
  //   Var(3): Coll[Byte] - proof bundle:
  //     bytes 0..7:   sidechain height as 8-byte big-endian Long
  //     bytes 8..15:  burn Merkle proof node count as 8-byte big-endian Long
  //     bytes 16..23: DUP lookup proof byte length as 8-byte big-endian Long
  //     next bytes:   zero to fourteen burn proof nodes:
  //       side byte 0 = sibling on left, side byte 1 = sibling on right
  //       32-byte sibling hash
  //     remaining:    DUP lookup proof followed by DUP insert proof

  val trackerNftId = fromBase16("TRACKER_NFT_ID_PLACEHOLDER")
  val dupNftId = fromBase16("DUP_NFT_ID_PLACEHOLDER")
  val minerFeeTree = fromBase16("1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304")

  val trackerIn = INPUTS(0)
  val trackerOut = OUTPUTS(0)
  val dupIn = INPUTS(1)
  val dupOut = OUTPUTS(1)
  val payoutOut = OUTPUTS(2)
  val minerFeeOut = OUTPUTS(OUTPUTS.size - 1)

  val trackerKey = getVar[Coll[Byte]](0).get
  val trackerProof = getVar[Coll[Byte]](1).get
  val encodedLeaf = getVar[Coll[Byte]](2).get
  val proofBundle = getVar[Coll[Byte]](3).get

  val zero32 = fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero8 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero7 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero4 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val spvDomain = fromBase16("4532535f5350565f5631")
  val leafDomain = fromBase16("4532535f54525553544c4553535f4255524e5f4c4541465f5631")
  val nodeDomain = fromBase16("4532535f54525553544c4553535f4255524e5f4e4f44455f5631")
  val burnIdDomain = fromBase16("4532535f54525553544c4553535f4255524e5f49445f5631")

  val leafShapeOk = encodedLeaf.size == 205
  val leafVersion = if (leafShapeOk) encodedLeaf.slice(0, 1) else Coll[Byte]()
  val sidechainId = if (leafShapeOk) encodedLeaf.slice(1, 33) else zero32
  val sidechainBlockHash = if (leafShapeOk) encodedLeaf.slice(33, 65) else zero32
  val leafBurnId = if (leafShapeOk) encodedLeaf.slice(65, 97) else zero32
  val sidechainTxHash = if (leafShapeOk) encodedLeaf.slice(97, 129) else zero32
  val eventIndexBytes = if (leafShapeOk) encodedLeaf.slice(129, 133) else Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val recipientHash = if (leafShapeOk) encodedLeaf.slice(133, 165) else zero32
  val amountBytes = if (leafShapeOk) encodedLeaf.slice(165, 173) else zero8
  val assetId = if (leafShapeOk) encodedLeaf.slice(173, 205) else zero32
  val burnId = leafBurnId

  val proofBundleHeaderOk = proofBundle.size >= 24
  val sidechainHeightBytes = if (proofBundleHeaderOk) proofBundle.slice(0, 8) else zero8
  val burnProofNodeCountBytes = if (proofBundleHeaderOk) proofBundle.slice(8, 16) else zero8
  val dupLookupProofLenBytes = if (proofBundleHeaderOk) proofBundle.slice(16, 24) else zero8
  val maxBurnProofNodes = 14
  val burnProofNodeCountSmall = burnProofNodeCountBytes.slice(0, 7) == zero7
  val burnProofNodeCount = if (burnProofNodeCountSmall) byteArrayToLong(burnProofNodeCountBytes).toInt else 0
  val burnProofNodeCountOk =
    burnProofNodeCountSmall &&
    burnProofNodeCount >= 0 &&
    burnProofNodeCount <= maxBurnProofNodes
  val dupLookupProofLenFitsInt = dupLookupProofLenBytes.slice(0, 4) == zero4
  val dupLookupProofLen = byteArrayToLong(dupLookupProofLenBytes).toInt
  val burnProofStart = 24
  val burnProofLen = burnProofNodeCount * 33
  val dupLookupProofStart = burnProofStart + burnProofLen
  val dupInsertProofStart = dupLookupProofStart + dupLookupProofLen
  val proofBundleShapeOk =
    proofBundleHeaderOk &&
    burnProofNodeCountOk &&
    dupLookupProofLenFitsInt &&
    dupLookupProofLen >= 0 &&
    burnProofLen >= 0 &&
    dupInsertProofStart <= proofBundle.size
  val burnProofBytes =
    if (proofBundleShapeOk)
      proofBundle.slice(burnProofStart, dupLookupProofStart)
    else Coll[Byte]()
  val burnProofLevels: Coll[Int] = Coll(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13)
  val burnProofSidesOk =
    if (proofBundleShapeOk)
      burnProofLevels.forall({ (i: Int) =>
        if (i >= burnProofNodeCount) true
        else {
          val side = burnProofBytes(i * 33)
          side == 0.toByte || side == 1.toByte
        }
      })
    else false
  val dupLookupProof =
    if (proofBundleShapeOk) proofBundle.slice(dupLookupProofStart, dupInsertProofStart) else Coll[Byte]()
  val dupInsertProof =
    if (proofBundleShapeOk) proofBundle.slice(dupInsertProofStart, proofBundle.size) else Coll[Byte]()

  val trackerNftOk =
    if (trackerIn.tokens.size > 0 && trackerOut.tokens.size > 0)
      trackerIn.tokens(0)._1 == trackerNftId &&
      trackerOut.tokens(0)._1 == trackerNftId
    else false

  val dupNftOk =
    if (dupIn.tokens.size > 0 && dupOut.tokens.size > 0)
      dupIn.tokens(0)._1 == dupNftId &&
      dupOut.tokens(0)._1 == dupNftId
    else false

  val selectedTrackerTree = trackerIn.R5[AvlTree].get
  val trackerValueOpt = selectedTrackerTree.get(trackerKey, trackerProof)
  val trackerValue = trackerValueOpt.getOrElse(Coll[Byte]())
  val eventRoot = if (trackerValue.size == 36) trackerValue.slice(0, 32) else zero32
  val anchorBytes = if (trackerValue.size == 36) trackerValue.slice(32, 36) else Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val anchorLong = byteArrayToLong(Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte) ++ anchorBytes)
  val anchorInt = anchorLong.toInt
  val minConfirmations = 10
  val finalityOk = HEIGHT - anchorInt >= minConfirmations

  val expectedBurnId = blake2b256(burnIdDomain ++ sidechainId ++ sidechainTxHash ++ eventIndexBytes)
  val expectedTrackerKey = blake2b256(spvDomain ++ sidechainId ++ sidechainHeightBytes ++ sidechainBlockHash)
  val leafHash = blake2b256(leafDomain ++ encodedLeaf)
  val merkleRoot =
    if (proofBundleShapeOk)
      burnProofLevels.fold(leafHash, { (acc: Coll[Byte], i: Int) =>
        if (i >= burnProofNodeCount) acc
        else {
          val off = i * 33
          val side = burnProofBytes(off)
          val siblingHash = burnProofBytes.slice(off + 1, off + 33)
          if (side == 0.toByte) blake2b256(nodeDomain ++ siblingHash ++ acc)
          else if (side == 1.toByte) blake2b256(nodeDomain ++ acc ++ siblingHash)
          else zero32
        }
      })
    else zero32
  val amount = byteArrayToLong(amountBytes)

  val leafFieldsOk =
    leafShapeOk &&
    leafVersion == Coll(1.toByte) &&
    leafBurnId == burnId &&
    expectedBurnId == burnId &&
    expectedTrackerKey == trackerKey &&
    recipientHash == blake2b256(payoutOut.propositionBytes) &&
    assetId == zero32

  val eventRootOk = eventRoot == merkleRoot

  val dupTree = dupIn.R5[AvlTree].get
  val notSpent = dupTree.get(burnId, dupLookupProof).isEmpty
  val dupModified = dupTree.insert(Coll((burnId, Coll(1.toByte))), dupInsertProof).get
  val dupUpdated = dupOut.R5[AvlTree].get.digest == dupModified.digest

  val payoutOk =
    payoutOut.value == amount &&
    payoutOut.tokens.size == 0

  // The V2 liquidity input is a real settlement vault, not an unrestricted
  // funding box. Every nanoERG not paid by the proved burn must either remain
  // in an exact same-script successor at OUTPUTS(3) or fund the bounded miner
  // fee at the final output. Provenance registers are retained on partial use.
  val vaultInputShapeOk =
    SELF.tokens.size == 0 &&
    SELF.R4[Coll[Byte]].get.size == 32 &&
    SELF.R5[Coll[Byte]].get.size == 20 &&
    SELF.R6[Long].get > 0 &&
    SELF.R7[Coll[Byte]].get.size > 0
  val minerFeeOk =
    minerFeeOut.propositionBytes == minerFeeTree &&
    minerFeeOut.tokens.size == 0 &&
    minerFeeOut.value >= 1000000L &&
    minerFeeOut.value <= 2100000L
  val remainingVaultValue = SELF.value - amount - minerFeeOut.value
  val exactSpend = remainingVaultValue == 0L && OUTPUTS.size == 4
  val partialSpend =
    if (remainingVaultValue > 0L && OUTPUTS.size == 5) {
      val vaultSuccessor = OUTPUTS(3)
      vaultSuccessor.propositionBytes == SELF.propositionBytes &&
      vaultSuccessor.value == remainingVaultValue &&
      vaultSuccessor.tokens.size == 0 &&
      vaultSuccessor.R4[Coll[Byte]].get == SELF.R4[Coll[Byte]].get &&
      vaultSuccessor.R5[Coll[Byte]].get == SELF.R5[Coll[Byte]].get &&
      vaultSuccessor.R6[Long].get == SELF.R6[Long].get &&
      vaultSuccessor.R7[Coll[Byte]].get == SELF.R7[Coll[Byte]].get
    } else false
  val vaultValueOk =
    amount > 0L &&
    remainingVaultValue >= 0L &&
    minerFeeOk &&
    (exactSpend || partialSpend)

  val shapeOk =
    trackerKey.size == 32 &&
    sidechainHeightBytes.size == 8 &&
    burnId.size == 32 &&
    payoutOut.propositionBytes.size == 36 &&
    trackerValue.size == 36 &&
    proofBundleShapeOk &&
    burnProofSidesOk

  sigmaProp(
    trackerNftOk &&
    dupNftOk &&
    trackerValueOpt.isDefined &&
    finalityOk &&
    leafFieldsOk &&
    eventRootOk &&
    notSpent &&
    dupUpdated &&
    payoutOk &&
    vaultInputShapeOk &&
    vaultValueOk &&
    shapeOk
  )
}
