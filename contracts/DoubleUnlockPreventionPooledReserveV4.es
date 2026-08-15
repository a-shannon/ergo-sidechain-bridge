{
  // DoubleUnlockPreventionPooledReserveV4
  //
  // This exact singleton is the full burn-proof and replay predicate for the
  // pooled-reserve V4 family. It validates the authenticated V4 tracker value,
  // canonical 205-byte burn leaf, Merkle inclusion, payout bindings, reserve
  // conservation transition and one absent-to-present burn-ID insertion.
  //
  // Registers:
  //   R4: Coll[Byte] - exact pooled-reserve V4 profile ID
  //   R5: AvlTree    - spent burn IDs (key=32, value=1)
  //
  // Transaction:
  //   DATA_INPUTS(0): exact V4 tracker singleton
  //   INPUTS(0):      pooled reserve predecessor
  //   INPUTS(1):      SELF
  //   INPUTS(2):      external fee funding
  //   OUTPUTS(0):     pooled reserve successor
  //   OUTPUTS(1):     DUP successor
  //   OUTPUTS(2):     exact payout
  //   OUTPUTS(3):     exact miner fee
  //
  // ContextExtension:
  //   Var(0): Coll[Byte] application tracker key
  //   Var(1): Coll[Byte] application tracker get proof
  //   Var(2): Coll[Byte] canonical 205-byte burn leaf V1
  //   Var(3): Coll[Byte] canonical burn/DUP proof bundle V2

  val trackerNftId =
    fromBase16("POOLED_RESERVE_TRACKER_NFT_ID_PLACEHOLDER")
  val dupNftId =
    fromBase16("POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER")
  val pooledReserveNftId =
    fromBase16("POOLED_RESERVE_NFT_ID_PLACEHOLDER")
  val pooledReserveProfileId =
    fromBase16("POOLED_RESERVE_PROFILE_ID_PLACEHOLDER")
  val trackerContractId =
    fromBase16("POOLED_RESERVE_TRACKER_CONTRACT_ID_PLACEHOLDER")
  val sidechainIdExpected =
    fromBase16("POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER")
  val trustAnchorDigestExpected =
    fromBase16("POOLED_RESERVE_TRUST_ANCHOR_DIGEST_PLACEHOLDER")

  val zero32 =
    fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero8 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte,
      0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero7 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte,
      0.toByte, 0.toByte, 0.toByte)
  val zero6 =
    Coll(0.toByte, 0.toByte, 0.toByte,
      0.toByte, 0.toByte, 0.toByte)
  val zero4 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)
  // E2S_SPV_VALIDITY_APPLICATION_KEY_V4
  val trackerKeyDomain =
    fromBase16("4532535f5350565f56414c49444954595f4150504c49434154494f4e5f4b45595f5634")
  // E2S_SPV_VALIDITY_APPLICATION_VALUE_V4 plus a canonical NUL separator
  val trackerValueDomain =
    fromBase16("4532535f5350565f56414c49444954595f4150504c49434154494f4e5f56414c55455f563400")
  // E2S_VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2 plus NUL separator
  val bundleDomain =
    fromBase16("4532535f56414c49444954595f4150504c49434154494f4e5f534554544c454d454e545f42554e444c455f563200")
  val leafDomain =
    fromBase16("4532535f54525553544c4553535f4255524e5f4c4541465f5631")
  val nodeDomain =
    fromBase16("4532535f54525553544c4553535f4255524e5f4e4f44455f5631")
  val burnIdDomain =
    fromBase16("4532535f54525553544c4553535f4255524e5f49445f5631")
  val maxSuccessorCreationHeightLag = 100

  val trackerKey = getVar[Coll[Byte]](0).get
  val trackerProof = getVar[Coll[Byte]](1).get
  val encodedLeaf = getVar[Coll[Byte]](2).get
  val proofBundle = getVar[Coll[Byte]](3).get

  val transactionShapeOk =
    CONTEXT.dataInputs.size == 1 &&
    INPUTS.size == 3 &&
    OUTPUTS.size == 4 &&
    SELF.id == INPUTS(1).id
  val tracker = if (CONTEXT.dataInputs.size == 1) CONTEXT.dataInputs(0) else SELF
  val reserveIn = if (INPUTS.size == 3) INPUTS(0) else SELF
  val reserveOut = if (OUTPUTS.size == 4) OUTPUTS(0) else SELF
  val dupOut = if (OUTPUTS.size == 4) OUTPUTS(1) else SELF
  val payoutOut = if (OUTPUTS.size == 4) OUTPUTS(2) else SELF

  val leafShapeOk = encodedLeaf.size == 205
  val leafVersion =
    if (leafShapeOk) encodedLeaf.slice(0, 1) else Coll[Byte]()
  val sidechainId =
    if (leafShapeOk) encodedLeaf.slice(1, 33) else zero32
  val executionBlockHash =
    if (leafShapeOk) encodedLeaf.slice(33, 65) else zero32
  val burnId =
    if (leafShapeOk) encodedLeaf.slice(65, 97) else zero32
  val sidechainTxHash =
    if (leafShapeOk) encodedLeaf.slice(97, 129) else zero32
  val eventIndexBytes =
    if (leafShapeOk) encodedLeaf.slice(129, 133) else zero4
  val recipientHash =
    if (leafShapeOk) encodedLeaf.slice(133, 165) else zero32
  val amountBytes =
    if (leafShapeOk) encodedLeaf.slice(165, 173) else zero8
  val assetId =
    if (leafShapeOk) encodedLeaf.slice(173, 205) else zero32
  val amount = byteArrayToLong(amountBytes)

  val proofBundleHeaderOk =
    proofBundle.size >= 90 &&
    proofBundle.slice(0, 46) == bundleDomain &&
    proofBundle(46) == 2.toByte &&
    proofBundle(47) == 1.toByte &&
    proofBundle(48) == 1.toByte &&
    proofBundle(49) == 0.toByte
  val sidechainHeightBytes =
    if (proofBundleHeaderOk) proofBundle.slice(50, 58) else zero8
  val leafIndexBytes =
    if (proofBundleHeaderOk) proofBundle.slice(58, 66) else zero8
  val leafCountBytes =
    if (proofBundleHeaderOk) proofBundle.slice(66, 74) else zero8
  val burnProofNodeCountBytes =
    if (proofBundleHeaderOk) proofBundle.slice(74, 82) else zero8
  val dupLookupProofLenBytes =
    if (proofBundleHeaderOk) proofBundle.slice(82, 90) else zero8
  val sidechainHeight = byteArrayToLong(sidechainHeightBytes)
  val leafIndexSmall = leafIndexBytes.slice(0, 7) == zero7
  val leafCountSmall = leafCountBytes.slice(0, 6) == zero6
  val burnProofNodeCountSmall =
    burnProofNodeCountBytes.slice(0, 7) == zero7
  val dupLookupProofLenFitsInt =
    dupLookupProofLenBytes.slice(0, 4) == zero4
  val leafIndex =
    if (leafIndexSmall) byteArrayToLong(leafIndexBytes).toInt else 0
  val leafCount =
    if (leafCountSmall) byteArrayToLong(leafCountBytes).toInt else 0
  val burnProofNodeCount =
    if (burnProofNodeCountSmall)
      byteArrayToLong(burnProofNodeCountBytes).toInt
    else 0
  val dupLookupProofLenLong =
    if (dupLookupProofLenFitsInt)
      byteArrayToLong(dupLookupProofLenBytes)
    else 0L
  val expectedBurnProofDepth =
    if (leafCount <= 1) 0
    else if (leafCount <= 2) 1
    else if (leafCount <= 4) 2
    else if (leafCount <= 8) 3
    else if (leafCount <= 16) 4
    else if (leafCount <= 32) 5
    else if (leafCount <= 64) 6
    else if (leafCount <= 128) 7
    else 8
  val burnProofNodeCountOk =
    leafIndexSmall &&
    leafCountSmall &&
    burnProofNodeCountSmall &&
    leafCount > 0 &&
    leafCount <= 256 &&
    leafIndex >= 0 &&
    leafIndex < leafCount &&
    burnProofNodeCount == expectedBurnProofDepth
  val burnProofStart = 90
  val burnProofLen = burnProofNodeCount * 33
  val dupLookupProofStart = burnProofStart + burnProofLen
  val availableDupProofBytes =
    proofBundle.size - dupLookupProofStart
  val dupLookupProofLenBounded =
    dupLookupProofLenFitsInt &&
    dupLookupProofLenLong > 0L &&
    availableDupProofBytes > 1 &&
    dupLookupProofLenLong < availableDupProofBytes.toLong
  val dupLookupProofLen =
    if (dupLookupProofLenBounded)
      dupLookupProofLenLong.toInt
    else 0
  val dupInsertProofStart = dupLookupProofStart + dupLookupProofLen
  val proofBundleShapeOk =
    proofBundleHeaderOk &&
    sidechainHeight > 0L &&
    burnProofNodeCountOk &&
    dupLookupProofLenBounded &&
    burnProofLen >= 0 &&
    dupLookupProofStart >= burnProofStart &&
    dupInsertProofStart > dupLookupProofStart &&
    dupInsertProofStart < proofBundle.size
  val burnProofBytes =
    if (proofBundleShapeOk)
      proofBundle.slice(burnProofStart, dupLookupProofStart)
    else Coll[Byte]()
  val dupLookupProof =
    if (proofBundleShapeOk)
      proofBundle.slice(dupLookupProofStart, dupInsertProofStart)
    else Coll[Byte]()
  val dupInsertProof =
    if (proofBundleShapeOk)
      proofBundle.slice(dupInsertProofStart, proofBundle.size)
    else Coll[Byte]()

  val trackerNftOk =
    tracker.tokens.size == 1 &&
    tracker.tokens(0)._1 == trackerNftId &&
    tracker.tokens(0)._2 == 1L
  val trackerProfileOk =
    blake2b256(tracker.propositionBytes) == trackerContractId &&
    tracker.R4[Coll[Byte]].get == pooledReserveProfileId &&
    tracker.R6[Coll[Byte]].get == sidechainIdExpected &&
    tracker.R9[Coll[Byte]].get == trustAnchorDigestExpected
  val trackerTree = tracker.R5[AvlTree].get
  val trackerTreePolicyOk =
    trackerTree.isInsertAllowed &&
    !trackerTree.isUpdateAllowed &&
    !trackerTree.isRemoveAllowed
  val trackerValueOpt = trackerTree.get(trackerKey, trackerProof)
  val trackerValue = trackerValueOpt.getOrElse(Coll[Byte]())
  val trackerValueShapeOk =
    trackerValue.size == 370 &&
    trackerValue.slice(0, 38) == trackerValueDomain &&
    trackerValue(38) == 4.toByte &&
    trackerValue(39) == 1.toByte &&
    trackerValue(40) == 1.toByte &&
    trackerValue(41) == 0.toByte
  val eventRoot =
    if (trackerValueShapeOk) trackerValue.slice(42, 74) else zero32
  val checkpointCommitment =
    if (trackerValueShapeOk) trackerValue.slice(74, 106) else zero32
  val anchorHeaderId =
    if (trackerValueShapeOk) trackerValue.slice(106, 138) else zero32
  val anchorHeightBytes =
    if (trackerValueShapeOk) trackerValue.slice(138, 142) else zero4
  val sidechainConsensusBlockHash =
    if (trackerValueShapeOk) trackerValue.slice(142, 174) else zero32
  val trackerBurnCountBytes =
    if (trackerValueShapeOk) trackerValue.slice(174, 178) else zero4
  val applicationBindingDigest =
    if (trackerValueShapeOk) trackerValue.slice(178, 210) else zero32
  val settlementProfileId =
    if (trackerValueShapeOk) trackerValue.slice(210, 242) else zero32
  val valuePooledReserveProfileId =
    if (trackerValueShapeOk) trackerValue.slice(242, 274) else zero32
  val applicationPayloadDigest =
    if (trackerValueShapeOk) trackerValue.slice(274, 306) else zero32
  val programId =
    if (trackerValueShapeOk) trackerValue.slice(306, 338) else zero32
  val verifierProfileId =
    if (trackerValueShapeOk) trackerValue.slice(338, 370) else zero32
  val anchorHeight = byteArrayToLong(zero4 ++ anchorHeightBytes)
  val trackerBurnCount =
    byteArrayToLong(zero4 ++ trackerBurnCountBytes)
  val minAnchorConfirmations = 10L
  val anchorDepthOk =
    anchorHeaderId != zero32 &&
    anchorHeight >= 0L &&
    anchorHeight <= HEIGHT.toLong &&
    HEIGHT.toLong - anchorHeight >= minAnchorConfirmations
  val trackerValueProfileOk =
    checkpointCommitment != zero32 &&
    sidechainConsensusBlockHash != zero32 &&
    trackerBurnCount > 0L &&
    trackerBurnCount <= 256L &&
    trackerBurnCount == leafCount.toLong &&
    applicationBindingDigest != zero32 &&
    settlementProfileId != zero32 &&
    valuePooledReserveProfileId == pooledReserveProfileId &&
    applicationPayloadDigest != zero32 &&
    programId != zero32 &&
    verifierProfileId != zero32

  val expectedBurnId =
    blake2b256(
      burnIdDomain ++ sidechainId ++ sidechainTxHash ++ eventIndexBytes
    )
  val expectedTrackerKey =
    blake2b256(
      trackerKeyDomain ++
      sidechainId ++
      sidechainHeightBytes ++
      executionBlockHash
    )
  val leafHash = blake2b256(leafDomain ++ encodedLeaf)
  val burnProofLevels: Coll[Int] = Coll(0, 1, 2, 3, 4, 5, 6, 7)
  val levelDivisors: Coll[Int] = Coll(1, 2, 4, 8, 16, 32, 64, 128)
  val merkleState =
    if (proofBundleShapeOk)
      burnProofLevels.fold(
        (leafHash, true),
        { (state: (Coll[Byte], Boolean), i: Int) =>
          if (i >= burnProofNodeCount) state
          else {
            val off = i * 33
            val side = burnProofBytes(off)
            val siblingHash = burnProofBytes.slice(off + 1, off + 33)
            val divisor = levelDivisors(i)
            val indexAtLevel = leafIndex / divisor
            val widthAtLevel =
              (leafCount + divisor - 1) / divisor
            val expectedSide =
              if (indexAtLevel % 2 == 1) 0.toByte else 1.toByte
            val duplicateRight =
              expectedSide == 1.toByte &&
              indexAtLevel + 1 >= widthAtLevel
            val levelBindingOk =
              side == expectedSide &&
              (!duplicateRight || siblingHash == state._1)
            val nextHash =
              if (side == 0.toByte)
                blake2b256(nodeDomain ++ siblingHash ++ state._1)
              else
                blake2b256(nodeDomain ++ state._1 ++ siblingHash)
            (nextHash, state._2 && levelBindingOk)
          }
        }
      )
    else (zero32, false)
  val merkleRoot = merkleState._1
  val merklePathOk = merkleState._2
  val leafFieldsOk =
    leafShapeOk &&
    leafVersion == Coll(1.toByte) &&
    sidechainId == sidechainIdExpected &&
    expectedBurnId == burnId &&
    expectedTrackerKey == trackerKey &&
    recipientHash == blake2b256(payoutOut.propositionBytes) &&
    assetId == zero32
  val eventRootOk =
    eventRoot != zero32 &&
    merklePathOk &&
    eventRoot == merkleRoot
  val payoutOk =
    amount > 0L &&
    payoutOut.value == amount &&
    payoutOut.tokens.size == 0

  val reserveLiability = reserveIn.R6[Long].getOrElse(-1L)
  val reserveSuccessorLiability =
    reserveOut.R6[Long].getOrElse(-1L)
  val reserveNftOk =
    reserveIn.tokens.size == 1 &&
    reserveOut.tokens.size == 1 &&
    reserveIn.tokens(0)._1 == pooledReserveNftId &&
    reserveIn.tokens(0)._2 == 1L &&
    reserveOut.tokens(0)._1 == pooledReserveNftId &&
    reserveOut.tokens(0)._2 == 1L
  val reserveProfileOk =
    reserveIn.R4[Coll[Byte]].getOrElse(Coll[Byte]()) ==
      pooledReserveProfileId &&
    reserveOut.R4[Coll[Byte]].getOrElse(Coll[Byte]()) ==
      pooledReserveProfileId
  val reserveSubtractSafe =
    amount > 0L &&
    amount <= reserveIn.value &&
    amount <= reserveLiability
  val expectedReserveValue =
    if (reserveSubtractSafe) reserveIn.value - amount else -1L
  val expectedReserveLiability =
    if (reserveSubtractSafe) reserveLiability - amount else -1L
  val reserveTransitionOk =
    reserveLiability >= 0L &&
    reserveLiability <= reserveIn.value &&
    reserveSuccessorLiability >= 0L &&
    reserveSuccessorLiability <= reserveOut.value &&
    reserveOut.propositionBytes == reserveIn.propositionBytes &&
    reserveOut.value == expectedReserveValue &&
    reserveSuccessorLiability == expectedReserveLiability &&
    reserveIn.value - reserveLiability ==
      reserveOut.value - reserveSuccessorLiability

  val spentIdsTree = SELF.R5[AvlTree].get
  val spentIdsTreePolicyOk =
    spentIdsTree.isInsertAllowed &&
    !spentIdsTree.isUpdateAllowed &&
    !spentIdsTree.isRemoveAllowed
  val notSpent = spentIdsTree.get(burnId, dupLookupProof).isEmpty
  val modifiedTree =
    spentIdsTree.insert(
      Coll((burnId, Coll(1.toByte))),
      dupInsertProof
    )
  val dupNftOk =
    SELF.tokens.size == 1 &&
    dupOut.tokens.size == 1 &&
    SELF.tokens(0)._1 == dupNftId &&
    SELF.tokens(0)._2 == 1L &&
    dupOut.tokens(0)._1 == dupNftId &&
    dupOut.tokens(0)._2 == 1L
  val dupSuccessorOk =
    modifiedTree.isDefined &&
    SELF.R4[Coll[Byte]].get == pooledReserveProfileId &&
    dupOut.R4[Coll[Byte]].get == pooledReserveProfileId &&
    dupOut.R5[AvlTree].get == modifiedTree.get &&
    dupOut.propositionBytes == SELF.propositionBytes &&
    dupOut.creationInfo._1 >= SELF.creationInfo._1 &&
    dupOut.creationInfo._1 <= HEIGHT &&
    dupOut.creationInfo._1 >= HEIGHT - maxSuccessorCreationHeightLag &&
    dupOut.value == SELF.value

  sigmaProp(
    transactionShapeOk &&
    trackerKey.size == 32 &&
    trackerProof.size > 0 &&
    trackerNftOk &&
    trackerProfileOk &&
    trackerTreePolicyOk &&
    trackerValueOpt.isDefined &&
    trackerValueShapeOk &&
    trackerValueProfileOk &&
    anchorDepthOk &&
    proofBundleShapeOk &&
    leafFieldsOk &&
    eventRootOk &&
    payoutOk &&
    reserveNftOk &&
    reserveProfileOk &&
    reserveSubtractSafe &&
    reserveTransitionOk &&
    spentIdsTreePolicyOk &&
    notSpent &&
    dupNftOk &&
    dupSuccessorOk
  )
}
