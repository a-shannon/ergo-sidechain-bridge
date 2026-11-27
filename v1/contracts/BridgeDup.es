{
  // BridgeDup (V1)
  //
  // Burn inclusion, confirmation-depth, payout-binding, and replay-prevention
  // singleton for one V1 bridge family.
  //
  // EIP-0045 Upgrade Seam:
  //   Authenticates DATA_INPUTS(0) by its unforgeable singleton NFT
  //   (trackerNftId) + familyId + sidechainId + unified 370-byte tracker AVL
  //   entry schema (authMode 1 = Federated, authMode 2 = EIP-0045 STARK).
  //   Neither committee rotation nor irreversible EIP-0045 STARK graduation of
  //   BridgeTracker requires any change or TVL migration on BridgeDup or
  //   BridgeReserve.
  //
  // Registers:
  //   R4: Coll[Byte] - familyId (32 bytes, immutable)
  //   R5: AvlTree    - spent burn IDs (key=32, value=1, insert-only)
  //
  // Branch 1 (payout):
  //   DATA_INPUTS(0): BridgeTracker singleton (carrying trackerNftId)
  //   INPUTS(0):      BridgeReserve predecessor (carrying reserveNftId)
  //   INPUTS(1):      SELF
  //   INPUTS(2):      external pure-ERG fee input
  //   OUTPUTS(0):     BridgeReserve successor
  //   OUTPUTS(1):     BridgeDup successor
  //   OUTPUTS(2):     exact payout
  //   OUTPUTS(3):     miner fee (1..5 mERG)
  //   OUTPUTS(4):     optional pure-ERG fee change
  //   ContextExtension:
  //     Var(0): Coll[Byte] 32-byte trackerKey
  //     Var(1): Coll[Byte] tracker AVL membership proof
  //     Var(2): Coll[Byte] 205-byte canonical burn leaf V1
  //     Var(3): Coll[Byte] proof bundle (71B header || Merkle path || DUP lookup || DUP insert)
  //
  // Branch 2 (rentRefresh, permissionless):
  //   DATA_INPUTS: none
  //   INPUTS(0):   SELF
  //   INPUTS(1):   external pure-ERG fee/top-up input
  //   OUTPUTS(0):  BridgeDup successor (value >= SELF.value)
  //   OUTPUTS(1):  miner fee (1..5 mERG)
  //   OUTPUTS(2):  optional pure-ERG fee change
  //   Vars:        none

  val trackerNftId =
    fromBase16("BRIDGE_V1_TRACKER_NFT_ID_PLACEHOLDER")
  val dupNftId =
    fromBase16("BRIDGE_V1_DUP_NFT_ID_PLACEHOLDER")
  val reserveNftId =
    fromBase16("BRIDGE_V1_RESERVE_NFT_ID_PLACEHOLDER")
  val familyId =
    fromBase16("BRIDGE_V1_FAMILY_ID_PLACEHOLDER")
  val sourceNetworkIdExpected =
    fromBase16("BRIDGE_V1_SOURCE_NETWORK_ID_PLACEHOLDER")
  val sidechainIdExpected =
    fromBase16("BRIDGE_V1_SIDECHAIN_ID_PLACEHOLDER")
  val minConfirmations = BRIDGE_V1_MIN_CONFIRMATIONS_PLACEHOLDER
  val minRefreshAgeBlocks = BRIDGE_V1_MIN_REFRESH_AGE_BLOCKS_PLACEHOLDER
  val minEarlyTopUpNanoErg = 1000000000L

  val minerFeeTree =
    fromBase16("1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304")
  val zero32 =
    fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero22 =
    fromBase16("00000000000000000000000000000000000000000000")
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

  // E2S_BRIDGE_V1_TRACKER_KEY_V1 (28 bytes)
  val trackerKeyDomain =
    fromBase16("4532535f4252494447455f56315f545241434b45525f4b45595f5631")
  // E2S_BRIDGE_V1_TRACKER_VALUE_V1 (30 bytes)
  val trackerValueDomain =
    fromBase16("4532535f4252494447455f56315f545241434b45525f56414c55455f5631")
  // E2S_BRIDGE_V1_PROOF_BUNDLE_V1\0 (30 bytes)
  val bundleDomain =
    fromBase16("4532535f4252494447455f56315f50524f4f465f42554e444c455f563100")
  // E2S_TRUSTLESS_BURN_LEAF_V1 (26 bytes)
  val leafDomain =
    fromBase16("4532535f54525553544c4553535f4255524e5f4c4541465f5631")
  // E2S_TRUSTLESS_BURN_NODE_V1 (26 bytes)
  val nodeDomain =
    fromBase16("4532535f54525553544c4553535f4255524e5f4e4f44455f5631")
  // E2S_TRUSTLESS_BURN_ID_V1 (24 bytes)
  val burnIdDomain =
    fromBase16("4532535f54525553544c4553535f4255524e5f49445f5631")

  val maxSuccessorCreationHeightLag = 100
  val minMinerFee = 1000000L
  val maxMinerFee = 5000000L
  val minChangeValue = 1000000L

  val spentIdsTree = SELF.R5[AvlTree].get
  val spentIdsTreePolicyOk =
    spentIdsTree.isInsertAllowed &&
    !spentIdsTree.isUpdateAllowed &&
    !spentIdsTree.isRemoveAllowed
  val selfIdentityOk =
    SELF.tokens.size == 1 &&
    SELF.tokens(0)._1 == dupNftId &&
    SELF.tokens(0)._2 == 1L &&
    SELF.R4[Coll[Byte]].get == familyId &&
    SELF.R6[Long].isEmpty

  val isPayout = CONTEXT.dataInputs.size == 1 && INPUTS.size == 3
  val isRefresh = CONTEXT.dataInputs.size == 0 && INPUTS.size == 2

  if (isPayout) {
    val trackerKey = getVar[Coll[Byte]](0).get
    val trackerProof = getVar[Coll[Byte]](1).get
    val encodedLeaf = getVar[Coll[Byte]](2).get
    val proofBundle = getVar[Coll[Byte]](3).get

    val transactionShapeOk =
      (OUTPUTS.size == 4 || OUTPUTS.size == 5) &&
      SELF.id == INPUTS(1).id
    val tracker = CONTEXT.dataInputs(0)
    val reserveIn = INPUTS(0)
    val feeIn = INPUTS(2)
    val reserveOut = OUTPUTS(0)
    val dupOut = OUTPUTS(1)
    val payoutOut = OUTPUTS(2)
    val feeOut = OUTPUTS(3)
    val hasChange = OUTPUTS.size == 5
    val changeOut = if (hasChange) OUTPUTS(4) else SELF

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
      proofBundle.size >= 71 &&
      proofBundle.slice(0, 30) == bundleDomain &&
      proofBundle(30) == 1.toByte
    val sidechainHeightBytes =
      if (proofBundleHeaderOk) proofBundle.slice(31, 39) else zero8
    val leafIndexBytes =
      if (proofBundleHeaderOk) proofBundle.slice(39, 47) else zero8
    val leafCountBytes =
      if (proofBundleHeaderOk) proofBundle.slice(47, 55) else zero8
    val burnProofNodeCountBytes =
      if (proofBundleHeaderOk) proofBundle.slice(55, 63) else zero8
    val dupLookupProofLenBytes =
      if (proofBundleHeaderOk) proofBundle.slice(63, 71) else zero8
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
    val burnProofStart = 71
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

    val trackerIdentityOk =
      tracker.tokens.size == 1 &&
      tracker.tokens(0)._1 == trackerNftId &&
      tracker.tokens(0)._2 == 1L &&
      tracker.R4[Coll[Byte]].get == familyId &&
      tracker.R6[Coll[Byte]].get == sidechainIdExpected
    val trackerTree = tracker.R5[AvlTree].get
    val trackerTreePolicyOk =
      trackerTree.isInsertAllowed &&
      !trackerTree.isUpdateAllowed &&
      !trackerTree.isRemoveAllowed
    val trackerValueOpt = trackerTree.get(trackerKey, trackerProof)
    val trackerValue = trackerValueOpt.getOrElse(Coll[Byte]())
    val trackerAuthMode =
      if (trackerValue.size == 370) trackerValue(31) else 0.toByte
    val trackerValueShapeOk =
      trackerValue.size == 370 &&
      trackerValue.slice(0, 30) == trackerValueDomain &&
      trackerValue(30) == 1.toByte &&
      (trackerAuthMode == 1.toByte || trackerAuthMode == 2.toByte)
    val valueFamilyId =
      if (trackerValueShapeOk) trackerValue.slice(32, 64) else zero32
    val valueSidechainId =
      if (trackerValueShapeOk) trackerValue.slice(64, 96) else zero32
    val sourceHeightBytes =
      if (trackerValueShapeOk) trackerValue.slice(96, 104) else zero8
    val sourceHeight = byteArrayToLong(sourceHeightBytes)
    val sourceBlockHash =
      if (trackerValueShapeOk) trackerValue.slice(104, 136) else zero32
    val trackerExecutionBlockHash =
      if (trackerValueShapeOk) trackerValue.slice(136, 168) else zero32
    val eventRoot =
      if (trackerValueShapeOk) trackerValue.slice(168, 200) else zero32
    val trackerBurnCountBytes =
      if (trackerValueShapeOk) trackerValue.slice(200, 204) else zero4
    val trackerBurnCount =
      byteArrayToLong(zero4 ++ trackerBurnCountBytes)
    val statementId =
      if (trackerValueShapeOk) trackerValue.slice(204, 236) else zero32
    val admissionHeightBytes =
      if (trackerValueShapeOk) trackerValue.slice(236, 244) else zero8
    val admissionHeight = byteArrayToLong(admissionHeightBytes)
    val valueSourceNetworkId =
      if (trackerValueShapeOk) trackerValue.slice(316, 348) else zero32
    val valueReservedZero =
      if (trackerValueShapeOk) trackerValue.slice(348, 370) else Coll[Byte]()

    val confirmationDepthOk =
      admissionHeight >= 0L &&
      admissionHeight <= HEIGHT.toLong &&
      HEIGHT.toLong - admissionHeight >= minConfirmations
    val trackerValueFieldsOk =
      valueFamilyId == familyId &&
      valueSidechainId == sidechainIdExpected &&
      valueSourceNetworkId == sourceNetworkIdExpected &&
      valueReservedZero == zero22 &&
      statementId != zero32 &&
      sourceHeight > 0L &&
      sourceHeight == sidechainHeight &&
      sourceBlockHash != zero32 &&
      trackerExecutionBlockHash != zero32 &&
      trackerBurnCount > 0L &&
      trackerBurnCount <= 256L &&
      trackerBurnCount == leafCount.toLong

    val expectedBurnId =
      blake2b256(
        burnIdDomain ++ sidechainId ++ sidechainTxHash ++ eventIndexBytes
      )
    val expectedTrackerKey =
      blake2b256(
        trackerKeyDomain ++
        sourceNetworkIdExpected ++
        sidechainIdExpected ++
        sourceHeightBytes ++
        sourceBlockHash ++
        trackerExecutionBlockHash
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
      executionBlockHash == trackerExecutionBlockHash &&
      recipientHash == blake2b256(payoutOut.propositionBytes) &&
      assetId == zero32
    val eventRootOk =
      eventRoot != zero32 &&
      merklePathOk &&
      eventRoot == merkleRoot
    val payoutOk =
      amount > 0L &&
      payoutOut.value == amount &&
      payoutOut.tokens.size == 0 &&
      payoutOut.propositionBytes != SELF.propositionBytes &&
      payoutOut.propositionBytes != reserveIn.propositionBytes &&
      payoutOut.propositionBytes != minerFeeTree

    val reserveLiability = reserveIn.R6[Long].getOrElse(-1L)
    val reserveSuccessorLiability =
      reserveOut.R6[Long].getOrElse(-1L)
    val reserveNftOk =
      reserveIn.tokens.size == 1 &&
      reserveOut.tokens.size == 1 &&
      reserveIn.tokens(0)._1 == reserveNftId &&
      reserveIn.tokens(0)._2 == 1L &&
      reserveOut.tokens(0)._1 == reserveNftId &&
      reserveOut.tokens(0)._2 == 1L
    val reserveFamilyOk =
      reserveIn.R4[Coll[Byte]].getOrElse(Coll[Byte]()) == familyId &&
      reserveOut.R4[Coll[Byte]].getOrElse(Coll[Byte]()) == familyId
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

    val notSpent = spentIdsTree.get(burnId, dupLookupProof).isEmpty
    val modifiedTree =
      spentIdsTree.insert(
        Coll((burnId, Coll(1.toByte))),
        dupInsertProof
      )
    val dupSuccessorOk =
      modifiedTree.isDefined &&
      dupOut.tokens.size == 1 &&
      dupOut.tokens(0)._1 == dupNftId &&
      dupOut.tokens(0)._2 == 1L &&
      dupOut.R4[Coll[Byte]].get == familyId &&
      dupOut.R5[AvlTree].get == modifiedTree.get &&
      dupOut.R6[Long].isEmpty &&
      dupOut.propositionBytes == SELF.propositionBytes &&
      dupOut.creationInfo._1 >= SELF.creationInfo._1 &&
      dupOut.creationInfo._1 <= HEIGHT &&
      dupOut.creationInfo._1 >= HEIGHT - maxSuccessorCreationHeightLag &&
      dupOut.value == SELF.value
    val feeBaseOk =
      feeIn.tokens.size == 0 &&
      feeOut.tokens.size == 0 &&
      feeOut.propositionBytes == minerFeeTree &&
      feeOut.value >= minMinerFee &&
      feeOut.value <= maxMinerFee
    val feeBalanceOk =
      if (hasChange) {
        feeIn.value > feeOut.value &&
        changeOut.tokens.size == 0 &&
        changeOut.value >= minChangeValue &&
        changeOut.value == feeIn.value - feeOut.value &&
        changeOut.propositionBytes != SELF.propositionBytes &&
        changeOut.propositionBytes != reserveIn.propositionBytes &&
        changeOut.propositionBytes != minerFeeTree
      } else {
        feeIn.value == feeOut.value
      }

    sigmaProp(
      selfIdentityOk &&
      spentIdsTreePolicyOk &&
      transactionShapeOk &&
      trackerKey.size == 32 &&
      trackerProof.size > 0 &&
      trackerIdentityOk &&
      trackerTreePolicyOk &&
      trackerValueOpt.isDefined &&
      trackerValueShapeOk &&
      trackerValueFieldsOk &&
      confirmationDepthOk &&
      proofBundleShapeOk &&
      leafFieldsOk &&
      eventRootOk &&
      payoutOk &&
      reserveNftOk &&
      reserveFamilyOk &&
      reserveSubtractSafe &&
      reserveTransitionOk &&
      notSpent &&
      dupSuccessorOk &&
      feeBaseOk &&
      feeBalanceOk
    )
  } else if (isRefresh) {
    val transactionShapeOk =
      (OUTPUTS.size == 2 || OUTPUTS.size == 3) &&
      SELF.id == INPUTS(0).id
    val feeIn = INPUTS(1)
    val dupOut = OUTPUTS(0)
    val feeOut = OUTPUTS(1)
    val hasChange = OUTPUTS.size == 3
    val changeOut = if (hasChange) OUTPUTS(2) else SELF

    val topUp = dupOut.value - SELF.value
    val refreshEligible =
      (HEIGHT - SELF.creationInfo._1 >= minRefreshAgeBlocks) ||
      (topUp >= minEarlyTopUpNanoErg)
    val dupSuccessorOk =
      refreshEligible &&
      topUp >= 0L &&
      dupOut.tokens.size == 1 &&
      dupOut.tokens(0)._1 == dupNftId &&
      dupOut.tokens(0)._2 == 1L &&
      dupOut.propositionBytes == SELF.propositionBytes &&
      dupOut.R4[Coll[Byte]].get == familyId &&
      dupOut.R5[AvlTree].get == spentIdsTree &&
      dupOut.R6[Long].isEmpty &&
      dupOut.creationInfo._1 >= SELF.creationInfo._1 &&
      dupOut.creationInfo._1 <= HEIGHT &&
      dupOut.creationInfo._1 >= HEIGHT - maxSuccessorCreationHeightLag
    val feeBaseOk =
      feeIn.tokens.size == 0 &&
      feeOut.tokens.size == 0 &&
      feeOut.propositionBytes == minerFeeTree &&
      feeOut.value >= minMinerFee &&
      feeOut.value <= maxMinerFee
    val feeBalanceOk =
      if (hasChange) {
        feeIn.value >= feeOut.value &&
        feeIn.value - feeOut.value > topUp &&
        changeOut.tokens.size == 0 &&
        changeOut.value >= minChangeValue &&
        changeOut.value == (feeIn.value - feeOut.value) - topUp &&
        changeOut.propositionBytes != SELF.propositionBytes &&
        changeOut.propositionBytes != minerFeeTree
      } else {
        feeIn.value >= feeOut.value &&
        feeIn.value - feeOut.value == topUp
      }

    sigmaProp(
      selfIdentityOk &&
      spentIdsTreePolicyOk &&
      transactionShapeOk &&
      dupSuccessorOk &&
      feeBaseOk &&
      feeBalanceOk
    )
  } else {
    sigmaProp(false)
  }
}
