{
  // MainChainAggregateUnlockAuthenticatedExternalFeeV1
  //
  // Separately versioned external-fee settlement profile for the authenticated
  // V2 tracker. This preserves the frozen V1 burn leaf, proof parsing, tracker
  // key/value, payout, replay, and authority-separation semantics. It changes
  // only the transaction topology and value conservation: a third input funds
  // the exact miner-fee output, while the vault decreases by the burn amount.
  // This profile is not activated and does not claim trustless settlement.
  //
  // Transaction shape:
  //   DATA_INPUTS(0): SPVTrackerAuthenticated singleton
  //   INPUTS(0):      DoubleUnlockPreventionAuthenticatedExternalFeeV1 singleton
  //   INPUTS(1):      this settlement vault
  //   INPUTS(2):      exact external fee box
  //   OUTPUTS(0):     DUP successor
  //   OUTPUTS(1):     payout
  //   OUTPUTS(2):     optional vault successor
  //   OUTPUTS(last):  miner fee
  //
  // ContextExtension on this vault input:
  //   Var(0): Coll[Byte] V2 tracker key
  //   Var(1): Coll[Byte] V2 tracker get proof
  //   Var(2): Coll[Byte] canonical 205-byte burn leaf
  //   Var(3): Coll[Byte] compact burn/DUP proof bundle

  val trackerNftId = fromBase16("TRACKER_NFT_ID_PLACEHOLDER")
  val dupNftId = fromBase16("DUP_NFT_ID_PLACEHOLDER")
  val minerFeeTree = fromBase16("1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304")

  val trackerDataShapeOk = CONTEXT.dataInputs.size == 1
  val trackerIn = if (trackerDataShapeOk) CONTEXT.dataInputs(0) else SELF
  val dupIn = INPUTS(0)
  val dupOut = OUTPUTS(0)
  val payoutOut = OUTPUTS(1)
  val externalFeeIn = INPUTS(2)
  val minerFeeOut = OUTPUTS(OUTPUTS.size - 1)

  // The tracker finality attestor must be a different on-chain proposition
  // from the bridge committee metadata retained by the replay singleton. This
  // blocks the legacy same-authority deployment shape, but does not prove that
  // two different keys are controlled by independent organizations.
  val trackerFinalityAttestor = trackerIn.R9[SigmaProp].get
  val bridgeCommitteeMetadata = dupIn.R6[SigmaProp].get
  val authoritySeparationOk = trackerFinalityAttestor != bridgeCommitteeMetadata

  val trackerKey = getVar[Coll[Byte]](0).get
  val trackerProof = getVar[Coll[Byte]](1).get
  val encodedLeaf = getVar[Coll[Byte]](2).get
  val proofBundle = getVar[Coll[Byte]](3).get

  val zero32 = fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero8 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero7 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero4 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val trackerDomain = fromBase16("4532535f5350565f5632")
  val leafDomain = fromBase16("4532535f54525553544c4553535f4255524e5f4c4541465f5631")
  val nodeDomain = fromBase16("4532535f54525553544c4553535f4255524e5f4e4f44455f5631")
  val burnIdDomain = fromBase16("4532535f54525553544c4553535f4255524e5f49445f5631")

  val leafShapeOk = encodedLeaf.size == 205
  val leafVersion = if (leafShapeOk) encodedLeaf.slice(0, 1) else Coll[Byte]()
  val sidechainId = if (leafShapeOk) encodedLeaf.slice(1, 33) else zero32
  val executionBlockHash = if (leafShapeOk) encodedLeaf.slice(33, 65) else zero32
  val leafBurnId = if (leafShapeOk) encodedLeaf.slice(65, 97) else zero32
  val sidechainTxHash = if (leafShapeOk) encodedLeaf.slice(97, 129) else zero32
  val eventIndexBytes = if (leafShapeOk) encodedLeaf.slice(129, 133) else zero4
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
    dupLookupProofLen > 0 &&
    burnProofLen >= 0 &&
    dupInsertProofStart < proofBundle.size
  val burnProofBytes =
    if (proofBundleShapeOk) proofBundle.slice(burnProofStart, dupLookupProofStart)
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
    if (proofBundleShapeOk) proofBundle.slice(dupLookupProofStart, dupInsertProofStart)
    else Coll[Byte]()
  val dupInsertProof =
    if (proofBundleShapeOk) proofBundle.slice(dupInsertProofStart, proofBundle.size)
    else Coll[Byte]()

  val trackerNftOk =
    trackerIn.tokens.size == 1 &&
    trackerIn.tokens(0)._1 == trackerNftId &&
    trackerIn.tokens(0)._2 == 1L
  val dupNftOk =
    dupIn.tokens.size == 1 &&
    dupOut.tokens.size == 1 &&
    dupIn.tokens(0)._1 == dupNftId &&
    dupIn.tokens(0)._2 == 1L &&
    dupOut.tokens(0)._1 == dupNftId &&
    dupOut.tokens(0)._2 == 1L

  val trackerTree = trackerIn.R5[AvlTree].get
  val trackerValueOpt = trackerTree.get(trackerKey, trackerProof)
  val trackerValue = trackerValueOpt.getOrElse(Coll[Byte]())
  val eventRoot = if (trackerValue.size == 264) trackerValue.slice(0, 32) else zero32
  val anchorHeightBytes = if (trackerValue.size == 264) trackerValue.slice(96, 100) else zero4
  val anchorHeight = byteArrayToLong(zero4 ++ anchorHeightBytes)
  val minAnchorConfirmations = 10L
  val anchorDepthOk =
    anchorHeight >= 0L &&
    anchorHeight <= HEIGHT.toLong &&
    HEIGHT.toLong - anchorHeight >= minAnchorConfirmations

  val expectedBurnId = blake2b256(burnIdDomain ++ sidechainId ++ sidechainTxHash ++ eventIndexBytes)
  val expectedTrackerKey = blake2b256(
    trackerDomain ++ sidechainId ++ sidechainHeightBytes ++ executionBlockHash
  )
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
    expectedBurnId == burnId &&
    expectedTrackerKey == trackerKey &&
    recipientHash == blake2b256(payoutOut.propositionBytes) &&
    assetId == zero32
  val eventRootOk = eventRoot == merkleRoot

  val dupTree = dupIn.R5[AvlTree].get
  val notSpent = dupTree.get(burnId, dupLookupProof).isEmpty
  val dupModified = dupTree.insert(Coll((burnId, Coll(1.toByte))), dupInsertProof).get
  val dupUpdated = dupOut.R5[AvlTree].get == dupModified

  val payoutOk =
    amount > 0L &&
    payoutOut.value == amount &&
    payoutOut.tokens.size == 0

  // This is a pooled-liquidity vault. Its provenance registers identify the
  // vault deposit and original depositor, and must survive a partial spend.
  val vaultInputShapeOk =
    INPUTS.size == 3 &&
    SELF.id == INPUTS(1).id &&
    SELF.tokens.size == 0 &&
    SELF.R4[Coll[Byte]].get.size == 32 &&
    SELF.R5[Coll[Byte]].get.size == 20 &&
    SELF.R6[Long].get > 0L &&
    SELF.R7[Coll[Byte]].get.size > 0
  val externalFeeOk =
    externalFeeIn.tokens.size == 0 &&
    minerFeeOut.propositionBytes == minerFeeTree &&
    minerFeeOut.tokens.size == 0 &&
    externalFeeIn.value == minerFeeOut.value &&
    minerFeeOut.value >= 1000000L &&
    minerFeeOut.value <= 2100000L
  val remainingVaultValue = SELF.value - amount
  val exactSpend = remainingVaultValue == 0L && OUTPUTS.size == 3
  val partialSpend =
    if (remainingVaultValue >= 1000000L && OUTPUTS.size == 4) {
      val vaultSuccessor = OUTPUTS(2)
      vaultSuccessor.propositionBytes == SELF.propositionBytes &&
      vaultSuccessor.value == remainingVaultValue &&
      vaultSuccessor.tokens.size == 0 &&
      vaultSuccessor.R4[Coll[Byte]].get == SELF.R4[Coll[Byte]].get &&
      vaultSuccessor.R5[Coll[Byte]].get == SELF.R5[Coll[Byte]].get &&
      vaultSuccessor.R6[Long].get == SELF.R6[Long].get &&
      vaultSuccessor.R7[Coll[Byte]].get == SELF.R7[Coll[Byte]].get
    } else false
  val vaultValueOk =
    remainingVaultValue >= 0L &&
    externalFeeOk &&
    (exactSpend || partialSpend)

  val shapeOk =
    trackerDataShapeOk &&
    trackerKey.size == 32 &&
    trackerProof.size > 0 &&
    sidechainHeightBytes.size == 8 &&
    burnId.size == 32 &&
    payoutOut.propositionBytes.size == 36 &&
    trackerValue.size == 264 &&
    proofBundleShapeOk &&
    burnProofSidesOk

  sigmaProp(
    trackerNftOk &&
    dupNftOk &&
    authoritySeparationOk &&
    trackerValueOpt.isDefined &&
    anchorDepthOk &&
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
