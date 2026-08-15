{
  // MainChainCausalVaultValidityV1
  //
  // Preactivation single-burn payout path for SPVTrackerValidityV1. The
  // tracker is a read-only data input, while the committee-free replay
  // singleton and this non-refundable causal vault are consumed atomically.
  // This is a new settlement profile; it does not reinterpret authenticated
  // V2 trees or activate EIP-0045.
  //
  // Vault registers:
  //   R4: Coll[Byte] - exact 229-byte Peg-In Source Intent V2
  //   R5: Coll[Byte] - exact 32-byte consumed refundable source-box ID
  //
  // Transaction shape:
  //   DATA_INPUTS(0): SPVTrackerValidityV1 singleton
  //   INPUTS(0):      DoubleUnlockPreventionValidityV1 singleton
  //   INPUTS(1):      this causal settlement vault
  //   INPUTS(2):      exact external miner-fee funding
  //   OUTPUTS(0):     complete DUP successor
  //   OUTPUTS(1):     exact proved payout
  //   OUTPUTS(2):     optional causal-vault successor
  //   OUTPUTS(last):  bounded miner fee
  //
  // ContextExtension on this vault input:
  //   Var(0): Coll[Byte] validity tracker key
  //   Var(1): Coll[Byte] validity tracker get proof
  //   Var(2): Coll[Byte] canonical 205-byte burn leaf V1
  //   Var(3): Coll[Byte] compact burn/DUP proof bundle

  val trackerNftId = fromBase16("TRACKER_NFT_ID_PLACEHOLDER")
  val dupNftId = fromBase16("DUP_NFT_ID_PLACEHOLDER")
  val trackerContractId = fromBase16("VALIDITY_TRACKER_CONTRACT_ID_PLACEHOLDER")
  val sourceNetworkId = fromBase16("VALIDITY_SOURCE_NETWORK_ID_PLACEHOLDER")
  val sidechainProfileId = fromBase16("VALIDITY_SIDECHAIN_ID_PLACEHOLDER")
  val settlementProfileId = fromBase16("VALIDITY_SETTLEMENT_PROFILE_ID_PLACEHOLDER")
  val admissionProfileId = fromBase16("VALIDITY_ADMISSION_PROFILE_ID_PLACEHOLDER")
  val approvedTrustAnchorDigest =
    fromBase16("VALIDITY_TRUST_ANCHOR_DIGEST_PLACEHOLDER")
  val compatibilitySemanticProgramId =
    fromBase16("VALIDITY_COMPATIBILITY_SEMANTIC_PROGRAM_ID_PLACEHOLDER")
  val compatibilityVerifierProfileId =
    fromBase16("VALIDITY_COMPATIBILITY_VERIFIER_PROFILE_ID_PLACEHOLDER")
  val minerFeeTree = fromBase16("1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304")
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

  val zero32 = fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero20 = fromBase16("0000000000000000000000000000000000000000")
  val zero8 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero7 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero4 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val compatibilityProofSystemId = fromBase16("00000001")
  val trackerDomain = fromBase16("4532535f5350565f56414c49444954595f5631")
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
  val burnProofNodeCount =
    if (burnProofNodeCountSmall) byteArrayToLong(burnProofNodeCountBytes).toInt
    else 0
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
  val burnProofLevels: Coll[Int] =
    Coll(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13)
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
  val eventRoot = if (trackerValue.size == 264) trackerValue.slice(0, 32) else zero32
  val anchorHeightBytes =
    if (trackerValue.size == 264) trackerValue.slice(96, 100) else zero4
  val valueProofSystemId =
    if (trackerValue.size == 264) trackerValue.slice(100, 104) else zero4
  val valueSemanticProgramId =
    if (trackerValue.size == 264) trackerValue.slice(136, 168) else zero32
  val valueVerifierProfileId =
    if (trackerValue.size == 264) trackerValue.slice(168, 200) else zero32
  val anchorHeight = byteArrayToLong(zero4 ++ anchorHeightBytes)
  val minAnchorConfirmations = 10L
  val anchorDepthOk =
    anchorHeight >= 0L &&
    anchorHeight <= HEIGHT.toLong &&
    HEIGHT.toLong - anchorHeight >= minAnchorConfirmations
  val trackerValueProfileOk =
    valueProofSystemId == compatibilityProofSystemId &&
    valueSemanticProgramId == compatibilitySemanticProgramId &&
    valueVerifierProfileId == compatibilityVerifierProfileId

  val expectedBurnId =
    blake2b256(burnIdDomain ++ sidechainId ++ sidechainTxHash ++ eventIndexBytes)
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
    sidechainId == sidechainProfileId &&
    expectedBurnId == burnId &&
    expectedTrackerKey == trackerKey &&
    recipientHash == blake2b256(payoutOut.propositionBytes) &&
    assetId == zero32
  val eventRootOk = eventRoot == merkleRoot

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
    sourceIntent.slice(65, 85) != zero20 &&
    sourceIntent.slice(85, 105) != zero20 &&
    sourceIntent.slice(105, 137) == settlementProfileId &&
    sourceIntent.slice(137, 169) == admissionProfileId &&
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
  val exactSpend = remainingVaultValue == 0L && OUTPUTS.size == 3
  val partialSpend =
    if (remainingVaultValue >= 1000000L && OUTPUTS.size == 4) {
      val vaultSuccessor = OUTPUTS(2)
      vaultSuccessor.propositionBytes == SELF.propositionBytes &&
      vaultSuccessor.creationInfo._1 >= SELF.creationInfo._1 &&
      vaultSuccessor.creationInfo._1 <= HEIGHT &&
      vaultSuccessor.creationInfo._1 >= HEIGHT - maxSuccessorCreationHeightLag &&
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
    sidechainHeightBytes.size == 8 &&
    burnId.size == 32 &&
    payoutOut.propositionBytes.size == 36 &&
    trackerValue.size == 264 &&
    proofBundleShapeOk &&
    burnProofSidesOk

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
