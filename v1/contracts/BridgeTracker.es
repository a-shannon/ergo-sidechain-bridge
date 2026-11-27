{
  // BridgeTracker (V1 - Federated with Timelocked Rotation & EIP-0045 Graduation)
  //
  // Stock-Ergo-compatible (NO 0x0401 header extension required) checkpoint
  // tracker singleton for one V1 bridge family.
  //
  // Trust Model:
  //   V1 checkpoint admission and upgrade proposals are authorized on-chain by
  //   the committee threshold `atLeast(threshold, committeeKeys)`. This is a
  //   federated tracker, not trustless, until graduated via Branch 4 (mode=2)
  //   to BridgeTrackerStark (EIP-0045 native STARK verification).
  //
  // Registers:
  //   R4: Coll[Byte] - familyId (32 bytes, immutable)
  //   R5: AvlTree    - append-only checkpoints (key=32, value=370, insert-only)
  //   R6: Coll[Byte] - sidechainId (32 bytes, immutable)
  //   R7: Long       - latestSourceHeight (strictly increasing on admit)
  //   R8: Int        - lastAdmissionErgoHeight (nondecreasing, <= HEIGHT)
  //   R9: Coll[Byte] - 81-byte governance state:
  //       [0..8)   epoch (u64be, == committeeEpoch)
  //       [8..9)   pendingMode (0=none, 1=rotateCommittee, 2=graduateStark)
  //       [9..41)  pendingTargetScriptHash (32B)
  //       [41..49) pendingActivatesAtHeight (u64be)
  //       [49..81) pendingTrustAnchorDigest (32B; non-zero iff mode==2)
  //
  // Transaction shape (ALL branches):
  //   DATA_INPUTS: none
  //   INPUTS(0):   SELF
  //   INPUTS(1):   external pure-ERG fee/top-up input
  //   OUTPUTS(0):  BridgeTracker successor (value >= SELF.value)
  //   OUTPUTS(1):  miner fee (1..5 mERG)
  //   OUTPUTS(2):  optional pure-ERG fee change
  //
  // Dispatch by ContextExtension Var(0) (action bytes; absent => rentRefresh):
  //   len=0:             Branch 5 rentRefresh (permissionless)
  //   len=174, tag=0x01: Branch 1 admitCheckpoint (committee, Var(1)=avlInsertProof)
  //   len=66,  tag=0x02: Branch 2 proposeUpgrade (committee)
  //   len=1,   tag=0x03: Branch 3 cancelUpgrade (committee)
  //   len=1,   tag=0x04: Branch 4 executeUpgrade (permissionless after timelock)

  val trackerNftId =
    fromBase16("BRIDGE_V1_TRACKER_NFT_ID_PLACEHOLDER")
  val familyId =
    fromBase16("BRIDGE_V1_FAMILY_ID_PLACEHOLDER")
  val expectedSourceNetworkId =
    fromBase16("BRIDGE_V1_SOURCE_NETWORK_ID_PLACEHOLDER")
  val expectedSidechainId =
    fromBase16("BRIDGE_V1_SIDECHAIN_ID_PLACEHOLDER")
  val expectedErgoKeySetDigest =
    fromBase16("BRIDGE_V1_ERGO_KEY_SET_DIGEST_PLACEHOLDER")
  val committeeEpoch = BRIDGE_V1_COMMITTEE_EPOCH_PLACEHOLDER
  val upgradeTimelockBlocks = BRIDGE_V1_UPGRADE_TIMELOCK_BLOCKS_PLACEHOLDER
  val maxAdmissionLag = BRIDGE_V1_MAX_ADMISSION_LAG_PLACEHOLDER
  val minRefreshAgeBlocks = BRIDGE_V1_MIN_REFRESH_AGE_BLOCKS_PLACEHOLDER
  val committeeKeys = Coll(
    BRIDGE_V1_COMMITTEE_SIGMAPROPS_PLACEHOLDER
  )
  val committeeAuth =
    atLeast(BRIDGE_V1_COMMITTEE_THRESHOLD_PLACEHOLDER, committeeKeys)

  val minerFeeTree =
    fromBase16("1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304")
  val zero32 =
    fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero22 =
    fromBase16("00000000000000000000000000000000000000000000")
  val zero8 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte,
      0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero4 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)

  // E2S_BRIDGE_V1_CHECKPOINT_STMT_V1 (32 bytes)
  val statementDomain =
    fromBase16("4532535f4252494447455f56315f434845434b504f494e545f53544d545f5631")
  // E2S_BRIDGE_V1_TRACKER_KEY_V1 (28 bytes)
  val trackerKeyDomain =
    fromBase16("4532535f4252494447455f56315f545241434b45525f4b45595f5631")
  // E2S_BRIDGE_V1_TRACKER_VALUE_V1 (30 bytes)
  val trackerValueDomain =
    fromBase16("4532535f4252494447455f56315f545241434b45525f56414c55455f5631")

  val maxSuccessorCreationHeightLag = 100
  val minMinerFee = 1000000L
  val maxMinerFee = 5000000L
  val minChangeValue = 1000000L

  val expectedEpochBytes = longToByteArray(committeeEpoch)
  val txShapeOk =
    CONTEXT.dataInputs.size == 0 &&
    INPUTS.size == 2 &&
    (OUTPUTS.size == 2 || OUTPUTS.size == 3) &&
    SELF.id == INPUTS(0).id
  val feeIn = if (txShapeOk) INPUTS(1) else SELF
  val successor = if (txShapeOk) OUTPUTS(0) else SELF
  val feeOut = if (txShapeOk) OUTPUTS(1) else SELF
  val hasChange = txShapeOk && OUTPUTS.size == 3
  val changeOut = if (hasChange) OUTPUTS(2) else SELF

  val oldTree = SELF.R5[AvlTree].get
  val oldTreePolicyOk =
    oldTree.isInsertAllowed &&
    !oldTree.isUpdateAllowed &&
    !oldTree.isRemoveAllowed
  val oldLatestSourceHeight = SELF.R7[Long].get
  val oldLastAdmissionHeight = SELF.R8[Int].get
  val selfR9 = SELF.R9[Coll[Byte]].get
  val selfR9ShapeOk = selfR9.size == 81
  val selfEpochBytes = if (selfR9ShapeOk) selfR9.slice(0, 8) else zero8
  val pendingMode = if (selfR9ShapeOk) selfR9(8) else 99.toByte
  val pendingTargetHash = if (selfR9ShapeOk) selfR9.slice(9, 41) else zero32
  val pendingActivatesAt =
    if (selfR9ShapeOk) byteArrayToLong(selfR9.slice(41, 49)) else 0L
  val pendingTrustAnchor = if (selfR9ShapeOk) selfR9.slice(49, 81) else zero32

  val selfR9Valid =
    selfR9ShapeOk &&
    selfEpochBytes == expectedEpochBytes &&
    (
      (pendingMode == 0.toByte &&
       pendingTargetHash == zero32 &&
       pendingActivatesAt == 0L &&
       pendingTrustAnchor == zero32) ||
      (pendingMode == 1.toByte &&
       pendingTargetHash != zero32 &&
       pendingActivatesAt > 0L &&
       pendingTrustAnchor == zero32) ||
      (pendingMode == 2.toByte &&
       pendingTargetHash != zero32 &&
       pendingActivatesAt > 0L &&
       pendingTrustAnchor != zero32)
    )

  val commonIdentityOk =
    txShapeOk &&
    SELF.tokens.size == 1 &&
    successor.tokens.size == 1 &&
    SELF.tokens(0)._1 == trackerNftId &&
    SELF.tokens(0)._2 == 1L &&
    successor.tokens(0)._1 == trackerNftId &&
    successor.tokens(0)._2 == 1L &&
    SELF.R4[Coll[Byte]].get == familyId &&
    successor.R4[Coll[Byte]].get == familyId &&
    SELF.R6[Coll[Byte]].get == expectedSidechainId &&
    successor.R6[Coll[Byte]].get == expectedSidechainId &&
    oldTreePolicyOk &&
    oldLatestSourceHeight >= 0L &&
    oldLastAdmissionHeight >= 0 &&
    selfR9Valid

  val topUp = successor.value - SELF.value
  val feeBaseOk =
    topUp >= 0L &&
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
      changeOut.propositionBytes != successor.propositionBytes &&
      changeOut.propositionBytes != minerFeeTree
    } else {
      feeIn.value >= feeOut.value &&
      feeIn.value - feeOut.value == topUp
    }

  val action = getVar[Coll[Byte]](0).getOrElse(Coll[Byte]())
  val isAdmit = action.size == 174 && action(0) == 1.toByte
  val isPropose = action.size == 66 && action(0) == 2.toByte
  val isCancel = action.size == 1 && action(0) == 3.toByte
  val isExecute = action.size == 1 && action(0) == 4.toByte
  val isRefresh = action.size == 0

  if (isAdmit) {
    val avlInsertProof = getVar[Coll[Byte]](1).get
    val sourceNetworkId = action.slice(2, 34)
    val sidechainId = action.slice(34, 66)
    val sourceHeightBytes = action.slice(66, 74)
    val sourceHeight = byteArrayToLong(sourceHeightBytes)
    val sourceBlockHash = action.slice(74, 106)
    val executionBlockHash = action.slice(106, 138)
    val bridgeEventRoot = action.slice(138, 170)
    val burnCountBytes = action.slice(170, 174)
    val burnCount = byteArrayToLong(zero4 ++ burnCountBytes)

    val admissionHeight = successor.creationInfo._1
    val admissionHeightBytes = longToByteArray(admissionHeight.toLong)
    val statementId = blake2b256(statementDomain ++ action)
    val trackerValue =
      trackerValueDomain ++
      Coll(1.toByte, 1.toByte) ++
      familyId ++
      sidechainId ++
      sourceHeightBytes ++
      sourceBlockHash ++
      executionBlockHash ++
      bridgeEventRoot ++
      burnCountBytes ++
      statementId ++
      admissionHeightBytes ++
      expectedEpochBytes ++
      expectedErgoKeySetDigest ++
      zero32 ++
      sourceNetworkId ++
      zero22
    val trackerKey =
      blake2b256(
        trackerKeyDomain ++
        sourceNetworkId ++
        sidechainId ++
        sourceHeightBytes ++
        sourceBlockHash ++
        executionBlockHash
      )
    val modifiedTree =
      oldTree.insert(Coll((trackerKey, trackerValue)), avlInsertProof)

    val admitFieldsOk =
      action(1) == 1.toByte &&
      sourceNetworkId == expectedSourceNetworkId &&
      sidechainId == expectedSidechainId &&
      sourceHeight > 0L &&
      sourceHeight > oldLatestSourceHeight &&
      sourceBlockHash != zero32 &&
      executionBlockHash != zero32 &&
      bridgeEventRoot != zero32 &&
      burnCount > 0L &&
      burnCount <= 256L &&
      trackerValue.size == 370 &&
      avlInsertProof.size > 0
    val admitSuccessorOk =
      modifiedTree.isDefined &&
      successor.propositionBytes == SELF.propositionBytes &&
      admissionHeight >= SELF.creationInfo._1 &&
      admissionHeight >= oldLastAdmissionHeight &&
      admissionHeight <= HEIGHT &&
      admissionHeight.toLong >= HEIGHT.toLong - maxAdmissionLag &&
      successor.R5[AvlTree].get == modifiedTree.get &&
      successor.R7[Long].get == sourceHeight &&
      successor.R8[Int].get == admissionHeight &&
      successor.R9[Coll[Byte]].get == selfR9

    sigmaProp(
      commonIdentityOk &&
      feeBaseOk &&
      feeBalanceOk &&
      admitFieldsOk &&
      admitSuccessorOk
    ) && committeeAuth
  } else if (isPropose) {
    val newMode = action(1)
    val newTargetHash = action.slice(2, 34)
    val newTrustAnchor = action.slice(34, 66)
    val proposeHeight = successor.creationInfo._1
    val timelockSafe =
      upgradeTimelockBlocks > 0L &&
      proposeHeight.toLong <= 9223372036854775807L - upgradeTimelockBlocks
    val activatesAt =
      if (timelockSafe) proposeHeight.toLong + upgradeTimelockBlocks else 0L
    val expectedNextR9 =
      expectedEpochBytes ++
      Coll(newMode) ++
      newTargetHash ++
      longToByteArray(activatesAt) ++
      newTrustAnchor

    val proposeOk =
      pendingMode == 0.toByte &&
      timelockSafe &&
      newTargetHash != zero32 &&
      newTargetHash != blake2b256(SELF.propositionBytes) &&
      (
        (newMode == 1.toByte && newTrustAnchor == zero32) ||
        (newMode == 2.toByte && newTrustAnchor != zero32)
      ) &&
      successor.propositionBytes == SELF.propositionBytes &&
      proposeHeight >= SELF.creationInfo._1 &&
      proposeHeight <= HEIGHT &&
      proposeHeight.toLong >= HEIGHT.toLong - maxAdmissionLag &&
      successor.R5[AvlTree].get == oldTree &&
      successor.R7[Long].get == oldLatestSourceHeight &&
      successor.R8[Int].get == oldLastAdmissionHeight &&
      successor.R9[Coll[Byte]].get == expectedNextR9

    sigmaProp(
      commonIdentityOk &&
      feeBaseOk &&
      feeBalanceOk &&
      proposeOk
    ) && committeeAuth
  } else if (isCancel) {
    val expectedClearedR9 =
      expectedEpochBytes ++
      Coll(0.toByte) ++
      zero32 ++
      zero8 ++
      zero32
    val cancelOk =
      pendingMode != 0.toByte &&
      successor.propositionBytes == SELF.propositionBytes &&
      successor.creationInfo._1 >= SELF.creationInfo._1 &&
      successor.creationInfo._1 <= HEIGHT &&
      successor.creationInfo._1 >= HEIGHT - maxSuccessorCreationHeightLag &&
      successor.R5[AvlTree].get == oldTree &&
      successor.R7[Long].get == oldLatestSourceHeight &&
      successor.R8[Int].get == oldLastAdmissionHeight &&
      successor.R9[Coll[Byte]].get == expectedClearedR9

    sigmaProp(
      commonIdentityOk &&
      feeBaseOk &&
      feeBalanceOk &&
      cancelOk
    ) && committeeAuth
  } else if (isExecute) {
    val nextEpochSafe =
      committeeEpoch < 9223372036854775807L
    val rotatedR9 =
      if (nextEpochSafe)
        longToByteArray(committeeEpoch + 1L) ++
        Coll(0.toByte) ++
        zero32 ++
        zero8 ++
        zero32
      else Coll[Byte]()
    val expectedSuccessorR9 =
      if (pendingMode == 1.toByte) rotatedR9
      else pendingTrustAnchor
    val executeOk =
      (pendingMode == 1.toByte || pendingMode == 2.toByte) &&
      (pendingMode != 1.toByte || nextEpochSafe) &&
      HEIGHT.toLong >= pendingActivatesAt &&
      blake2b256(successor.propositionBytes) == pendingTargetHash &&
      successor.creationInfo._1 >= SELF.creationInfo._1 &&
      successor.creationInfo._1 <= HEIGHT &&
      successor.creationInfo._1 >= HEIGHT - maxSuccessorCreationHeightLag &&
      successor.R5[AvlTree].get == oldTree &&
      successor.R7[Long].get == oldLatestSourceHeight &&
      successor.R8[Int].get == oldLastAdmissionHeight &&
      successor.R9[Coll[Byte]].get == expectedSuccessorR9

    sigmaProp(
      commonIdentityOk &&
      feeBaseOk &&
      feeBalanceOk &&
      executeOk
    )
  } else if (isRefresh) {
    // Gate permissionless rentRefresh behind minRefreshAgeBlocks AND require
    // pendingMode == 0 so nobody can front-run active committee ceremonies or
    // censor cancelUpgrade during a timelocked upgrade window.
    val refreshOk =
      pendingMode == 0.toByte &&
      HEIGHT - SELF.creationInfo._1 >= minRefreshAgeBlocks &&
      successor.propositionBytes == SELF.propositionBytes &&
      successor.creationInfo._1 >= SELF.creationInfo._1 &&
      successor.creationInfo._1 <= HEIGHT &&
      successor.creationInfo._1 >= HEIGHT - maxSuccessorCreationHeightLag &&
      successor.R5[AvlTree].get == oldTree &&
      successor.R7[Long].get == oldLatestSourceHeight &&
      successor.R8[Int].get == oldLastAdmissionHeight &&
      successor.R9[Coll[Byte]].get == selfR9

    sigmaProp(
      commonIdentityOk &&
      feeBaseOk &&
      feeBalanceOk &&
      refreshOk
    )
  } else {
    sigmaProp(false)
  }
}
