{
  // MainChainCausalVaultValidityApplicationV2
  //
  // Preactivation single-burn payout consumer for the application-bound
  // SPVTrackerValidityApplicationV2 family. The exact tracker proposition and
  // its 370-byte value authenticate the application proof result. The
  // 973-byte application payload and proof receipt are intentionally not
  // retransmitted through this settlement input.
  //
  // This profile is byte- and domain-distinct from ValiditySettlementV1.
  // It does not activate EIP-0045 and does not authorize deployed funds.
  //
  // Vault registers:
  //   R4: Coll[Byte] - exact 229-byte Peg-In Source Intent V2
  //   R5: Coll[Byte] - exact 32-byte consumed refundable source-box ID
  //
  // Transaction shape:
  //   DATA_INPUTS(0): SPVTrackerValidityApplicationV2 singleton
  //   INPUTS(0):      DoubleUnlockPreventionValidityApplicationV2 singleton
  //   INPUTS(1):      this causal settlement vault
  //   INPUTS(2):      exact external miner-fee funding
  //   OUTPUTS(0):     complete DUP successor
  //   OUTPUTS(1):     exact proved payout
  //   OUTPUTS(2):     optional causal-vault successor
  //   OUTPUTS(last):  bounded miner fee
  //
  // ContextExtension on this vault input:
  //   Var(0): Coll[Byte] application tracker key
  //   Var(1): Coll[Byte] application tracker get proof
  //   Var(2): Coll[Byte] canonical 205-byte burn leaf V1
  //   Var(3): Coll[Byte] versioned burn/DUP proof bundle V2

  val trackerNftId = fromBase16("TRACKER_NFT_ID_PLACEHOLDER")
  val dupNftId = fromBase16("DUP_NFT_ID_PLACEHOLDER")
  val trackerContractId =
    fromBase16("VALIDITY_APPLICATION_TRACKER_CONTRACT_ID_PLACEHOLDER")
  val sourceNetworkId =
    fromBase16("VALIDITY_SOURCE_NETWORK_ID_PLACEHOLDER")
  val sidechainProfileId =
    fromBase16("VALIDITY_SIDECHAIN_ID_PLACEHOLDER")
  val settlementProfileId =
    fromBase16("VALIDITY_APPLICATION_SETTLEMENT_PROFILE_ID_PLACEHOLDER")
  val causalProfileId =
    fromBase16("VALIDITY_APPLICATION_CAUSAL_PROFILE_ID_PLACEHOLDER")
  val bridgeAddress =
    fromBase16("VALIDITY_APPLICATION_BRIDGE_ADDRESS_PLACEHOLDER")
  val tokenAddress =
    fromBase16("VALIDITY_APPLICATION_TOKEN_ADDRESS_PLACEHOLDER")
  val approvedTrustAnchorDigest =
    fromBase16("VALIDITY_TRUST_ANCHOR_DIGEST_PLACEHOLDER")
  val expectedApplicationBindingDigest =
    fromBase16("VALIDITY_APPLICATION_BINDING_DIGEST_PLACEHOLDER")
  val expectedProgramId =
    fromBase16("VALIDITY_APPLICATION_PROGRAM_ID_PLACEHOLDER")
  val expectedVerifierProfileId =
    fromBase16("VALIDITY_APPLICATION_VERIFIER_PROFILE_ID_PLACEHOLDER")
  val minerFeeTree =
    fromBase16("1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304")
  val maxSuccessorCreationHeightLag = 100

  val trackerDataShapeOk = CONTEXT.dataInputs.size == 1
  val trackerIn = if (trackerDataShapeOk) CONTEXT.dataInputs(0) else SELF
  val dupIn = INPUTS(0)
  val feeIn = INPUTS(2)
  val dupOut = OUTPUTS(0)
  val payoutOut = OUTPUTS(1)
  val minerFeeOut = OUTPUTS(OUTPUTS.size - 1)

  val trackerKey = getVar[Coll[Byte]](0).get
  val trackerProof = getVar[Coll[Byte]](1).get
  val encodedLeaf = getVar[Coll[Byte]](2).get
  val proofBundle = getVar[Coll[Byte]](3).get

  val zero32 =
    fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero20 =
    fromBase16("0000000000000000000000000000000000000000")
  val zero8 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero7 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero6 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero4 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val trackerKeyDomain =
    fromBase16("4532535f5350565f56414c49444954595f4150504c49434154494f4e5f4b45595f5632")
  val trackerValueDomain =
    fromBase16("4532535f5350565f56414c49444954595f4150504c49434154494f4e5f56414c55455f563200")
  val bundleDomain =
    fromBase16("4532535f56414c49444954595f4150504c49434154494f4e5f534554544c454d454e545f42554e444c455f563200")
  val leafDomain =
    fromBase16("4532535f54525553544c4553535f4255524e5f4c4541465f5631")
  val nodeDomain =
    fromBase16("4532535f54525553544c4553535f4255524e5f4e4f44455f5631")
  val burnIdDomain =
    fromBase16("4532535f54525553544c4553535f4255524e5f49445f5631")

  val leafShapeOk = encodedLeaf.size == 205
  val leafVersion =
    if (leafShapeOk) encodedLeaf.slice(0, 1) else Coll[Byte]()
  val sidechainId =
    if (leafShapeOk) encodedLeaf.slice(1, 33) else zero32
  val executionBlockHash =
    if (leafShapeOk) encodedLeaf.slice(33, 65) else zero32
  val leafBurnId =
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
  val burnId = leafBurnId

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
    trackerIn.tokens.size == 1 &&
    trackerIn.tokens(0)._1 == trackerNftId &&
    trackerIn.tokens(0)._2 == 1L
  val trackerProfileOk =
    blake2b256(trackerIn.propositionBytes) == trackerContractId &&
    trackerIn.R6[Coll[Byte]].get == sidechainProfileId &&
    trackerIn.R9[Coll[Byte]].get == approvedTrustAnchorDigest
  val dupNftOk =
    dupIn.tokens.size == 1 &&
    dupOut.tokens.size == 1 &&
    dupIn.tokens(0)._1 == dupNftId &&
    dupIn.tokens(0)._2 == 1L &&
    dupOut.tokens(0)._1 == dupNftId &&
    dupOut.tokens(0)._2 == 1L
  val dupProfileOk =
    dupIn.R6[Coll[Byte]].get == settlementProfileId &&
    dupOut.R6[Coll[Byte]].get == settlementProfileId

  val trackerTree = trackerIn.R5[AvlTree].get
  val trackerValueOpt = trackerTree.get(trackerKey, trackerProof)
  val trackerValue = trackerValueOpt.getOrElse(Coll[Byte]())
  val trackerValueShapeOk =
    trackerValue.size == 370 &&
    trackerValue.slice(0, 38) == trackerValueDomain &&
    trackerValue(38) == 2.toByte &&
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
  val valueApplicationBindingDigest =
    if (trackerValueShapeOk) trackerValue.slice(178, 210) else zero32
  val valueSettlementProfileId =
    if (trackerValueShapeOk) trackerValue.slice(210, 242) else zero32
  val valueCausalProfileId =
    if (trackerValueShapeOk) trackerValue.slice(242, 274) else zero32
  val applicationPayloadDigest =
    if (trackerValueShapeOk) trackerValue.slice(274, 306) else zero32
  val valueProgramId =
    if (trackerValueShapeOk) trackerValue.slice(306, 338) else zero32
  val valueVerifierProfileId =
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
    valueApplicationBindingDigest == expectedApplicationBindingDigest &&
    valueSettlementProfileId == settlementProfileId &&
    valueCausalProfileId == causalProfileId &&
    applicationPayloadDigest != zero32 &&
    valueProgramId == expectedProgramId &&
    valueVerifierProfileId == expectedVerifierProfileId

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
            val widthAtLevel = (leafCount + divisor - 1) / divisor
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
  val amount = byteArrayToLong(amountBytes)

  val leafFieldsOk =
    leafShapeOk &&
    leafVersion == Coll(1.toByte) &&
    sidechainId == sidechainProfileId &&
    expectedBurnId == burnId &&
    expectedTrackerKey == trackerKey &&
    recipientHash == blake2b256(payoutOut.propositionBytes) &&
    assetId == zero32
  val eventRootOk =
    eventRoot != zero32 &&
    merklePathOk &&
    eventRoot == merkleRoot

  val dupTree = dupIn.R5[AvlTree].get
  val notSpent = dupTree.get(burnId, dupLookupProof).isEmpty
  val dupModified =
    dupTree.insert(Coll((burnId, Coll(1.toByte))), dupInsertProof).get
  val dupUpdated = dupOut.R5[AvlTree].get == dupModified

  val payoutOk =
    amount > 0L &&
    payoutOut.value == amount &&
    payoutOut.tokens.size == 0

  val sourceIntent = SELF.R4[Coll[Byte]].getOrElse(Coll[Byte]())
  val sourceBoxId = SELF.R5[Coll[Byte]].getOrElse(Coll[Byte]())
  val sourceIntentShapeOk = sourceIntent.size == 229
  val sourceAmountBytes =
    if (sourceIntentShapeOk) sourceIntent.slice(201, 209) else zero8
  val sourceAmount = byteArrayToLong(sourceAmountBytes)
  val vaultInputShapeOk =
    INPUTS.size == 3 &&
    SELF.id == INPUTS(1).id &&
    SELF.tokens.size == 0 &&
    sourceIntentShapeOk &&
    sourceIntent.slice(0, 1) == Coll(2.toByte) &&
    sourceIntent.slice(1, 33) == sourceNetworkId &&
    sourceIntent.slice(33, 65) == sidechainProfileId &&
    sourceIntent.slice(65, 85) == bridgeAddress &&
    sourceIntent.slice(85, 105) == tokenAddress &&
    bridgeAddress != zero20 &&
    tokenAddress != zero20 &&
    sourceIntent.slice(105, 137) == settlementProfileId &&
    sourceIntent.slice(137, 169) == causalProfileId &&
    sourceIntent.slice(169, 201) == zero32 &&
    sourceAmount > 0L &&
    SELF.value > 0L &&
    SELF.value <= sourceAmount &&
    sourceIntent.slice(209, 229) != zero20 &&
    sourceBoxId.size == 32 &&
    sourceBoxId != zero32
  val minerFeeOk =
    feeIn.tokens.size == 0 &&
    feeIn.value == minerFeeOut.value &&
    minerFeeOut.propositionBytes == minerFeeTree &&
    minerFeeOut.tokens.size == 0 &&
    minerFeeOut.value >= 1000000L &&
    minerFeeOut.value <= 2100000L
  val remainingVaultValue = SELF.value - amount
  val exactSpend =
    remainingVaultValue == 0L &&
    OUTPUTS.size == 3
  val partialSpend =
    if (remainingVaultValue >= 1000000L && OUTPUTS.size == 4) {
      val vaultSuccessor = OUTPUTS(2)
      vaultSuccessor.propositionBytes == SELF.propositionBytes &&
      vaultSuccessor.creationInfo._1 >= SELF.creationInfo._1 &&
      vaultSuccessor.creationInfo._1 <= HEIGHT &&
      vaultSuccessor.creationInfo._1 >=
        HEIGHT - maxSuccessorCreationHeightLag &&
      vaultSuccessor.value == remainingVaultValue &&
      vaultSuccessor.tokens.size == 0 &&
      vaultSuccessor.R4[Coll[Byte]].get == sourceIntent &&
      vaultSuccessor.R5[Coll[Byte]].get == sourceBoxId
    } else false
  val vaultValueOk =
    remainingVaultValue >= 0L &&
    minerFeeOk &&
    (exactSpend || partialSpend)

  val shapeOk =
    trackerDataShapeOk &&
    trackerKey.size == 32 &&
    trackerProof.size > 0 &&
    burnId.size == 32 &&
    payoutOut.propositionBytes.size == 36 &&
    trackerValueShapeOk &&
    proofBundleShapeOk

  sigmaProp(
    trackerNftOk &&
    trackerProfileOk &&
    trackerValueOpt.isDefined &&
    trackerValueProfileOk &&
    anchorDepthOk &&
    dupNftOk &&
    dupProfileOk &&
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
