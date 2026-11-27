{
  // BridgeTrackerStark (V1 - Preactivation EIP-0045 Graduation Target)
  //
  // Trustless native-STARK checkpoint tracker designed as the irreversible
  // timelocked graduation target of BridgeTracker (mode=2).
  //
  // Compatibility Seam:
  //   - Exact same singleton NFT (trackerNftId), R4..R8 layout, 32-byte
  //     trackerKey, and 370-byte unified trackerValue schema (with authMode=2)
  //     consumed by BridgeDup (V1).
  //   - Graduating BridgeTracker -> BridgeTrackerStark preserves the complete
  //     R5 AVL history and requires ZERO changes to BridgeDup or BridgeReserve.
  //   - No 0x0401 header extension required; no committee keys; irreversible.
  //
  // Activation Boundary:
  //   Requires EIP-0045 native `verifyStark` activation (target ErgoTree v4,
  //   RISC Zero 3.1.0+ verifier profileId, 4-chunk raw seal 65535/65535/65535/26063).
  //   Cannot execute on SigmaState 6.0.2 / stock Ergo 6.0.3 before EIP-0045.
  //
  // Registers:
  //   R4: Coll[Byte] - familyId (32 bytes, immutable)
  //   R5: AvlTree    - append-only checkpoints (key=32, value=370, insert-only)
  //   R6: Coll[Byte] - sidechainId (32 bytes, immutable)
  //   R7: Long       - latestSourceHeight (strictly increasing on admit)
  //   R8: Int        - lastAdmissionErgoHeight (nondecreasing, <= HEIGHT)
  //   R9: Coll[Byte] - approvedGrandpaTrustAnchorDigest (32 bytes, immutable)
  //
  // Branch 1 (admitStarkCheckpoint, permissionless with valid EIP-0045 proof):
  //   Var(0): Coll[Coll[Byte]] 4-chunk EIP-0045 raw seal
  //   Var(1): Coll[Byte]       300-byte BridgeStarkPayloadV1:
  //     [0..31)   domain "E2S_BRIDGE_V1_STARK_PAYLOAD_V1\0" (31B)
  //     [31..32)  version = 1 (1B)
  //     [32..64)  trackerNftId (32B)
  //     [64..96)  familyId (32B)
  //     [96..128) sourceNetworkId (32B)
  //     [128..160) sidechainId (32B)
  //     [160..168) sourceHeight (8B u64be)
  //     [168..200) sourceBlockHash (32B)
  //     [200..232) executionBlockHash (32B)
  //     [232..264) bridgeEventRoot (32B)
  //     [264..268) burnCount (4B u32be)
  //     [268..300) trustAnchorDigest (32B)
  //     Total = 300 bytes
  //   Var(2): Coll[Byte]       avlInsertProof
  //
  // Branch 2 (rentRefresh, permissionless):
  //   Var(1) absent (empty); preserves R4..R9 and propositionBytes.

  val trackerNftId =
    fromBase16("BRIDGE_V1_TRACKER_NFT_ID_PLACEHOLDER")
  val familyId =
    fromBase16("BRIDGE_V1_FAMILY_ID_PLACEHOLDER")
  val expectedSourceNetworkId =
    fromBase16("BRIDGE_V1_SOURCE_NETWORK_ID_PLACEHOLDER")
  val expectedSidechainId =
    fromBase16("BRIDGE_V1_SIDECHAIN_ID_PLACEHOLDER")
  val expectedProgramId =
    fromBase16("BRIDGE_V1_STARK_PROGRAM_ID_PLACEHOLDER")
  val expectedProfileId =
    fromBase16("BRIDGE_V1_STARK_PROFILE_ID_PLACEHOLDER")
  val maxAdmissionLag = BRIDGE_V1_MAX_ADMISSION_LAG_PLACEHOLDER
  val minRefreshAgeBlocks = BRIDGE_V1_MIN_REFRESH_AGE_BLOCKS_PLACEHOLDER

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

  // E2S_BRIDGE_V1_STARK_PAYLOAD_V1\0 (31 bytes)
  val payloadDomain =
    fromBase16("4532535f4252494447455f56315f535441524b5f5041594c4f41445f563100")
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
  val approvedTrustAnchorDigest = SELF.R9[Coll[Byte]].get

  val commonIdentityOk =
    txShapeOk &&
    SELF.tokens.size == 1 &&
    successor.tokens.size == 1 &&
    SELF.tokens(0)._1 == trackerNftId &&
    SELF.tokens(0)._2 == 1L &&
    successor.tokens(0)._1 == trackerNftId &&
    successor.tokens(0)._2 == 1L &&
    successor.propositionBytes == SELF.propositionBytes &&
    SELF.R4[Coll[Byte]].get == familyId &&
    successor.R4[Coll[Byte]].get == familyId &&
    SELF.R6[Coll[Byte]].get == expectedSidechainId &&
    successor.R6[Coll[Byte]].get == expectedSidechainId &&
    approvedTrustAnchorDigest.size == 32 &&
    approvedTrustAnchorDigest != zero32 &&
    successor.R9[Coll[Byte]].get == approvedTrustAnchorDigest &&
    oldTreePolicyOk &&
    oldLatestSourceHeight >= 0L &&
    oldLastAdmissionHeight >= 0

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
      changeOut.propositionBytes != minerFeeTree
    } else {
      feeIn.value >= feeOut.value &&
      feeIn.value - feeOut.value == topUp
    }

  val payload = getVar[Coll[Byte]](1).getOrElse(Coll[Byte]())
  val isRefresh = payload.size == 0
  val isAdmit = payload.size == 300

  if (isAdmit) {
    val proofChunks = getVar[Coll[Coll[Byte]]](0).get
    val avlInsertProof = getVar[Coll[Byte]](2).get

    val payloadTrackerNftId = payload.slice(32, 64)
    val payloadFamilyId = payload.slice(64, 96)
    val sourceNetworkId = payload.slice(96, 128)
    val sidechainId = payload.slice(128, 160)
    val sourceHeightBytes = payload.slice(160, 168)
    val sourceHeight = byteArrayToLong(sourceHeightBytes)
    val sourceBlockHash = payload.slice(168, 200)
    val executionBlockHash = payload.slice(200, 232)
    val bridgeEventRoot = payload.slice(232, 264)
    val burnCountBytes = payload.slice(264, 268)
    val burnCount = byteArrayToLong(zero4 ++ burnCountBytes)
    val suppliedTrustAnchor = payload.slice(268, 300)

    val admissionHeight = successor.creationInfo._1
    val admissionHeightBytes = longToByteArray(admissionHeight.toLong)
    val statementId = blake2b256(payload)
    val starkAuthorityDigest =
      blake2b256(expectedProgramId ++ expectedProfileId)

    val trackerValue =
      trackerValueDomain ++
      Coll(1.toByte, 2.toByte) ++
      familyId ++
      sidechainId ++
      sourceHeightBytes ++
      sourceBlockHash ++
      executionBlockHash ++
      bridgeEventRoot ++
      burnCountBytes ++
      statementId ++
      admissionHeightBytes ++
      zero8 ++
      starkAuthorityDigest ++
      approvedTrustAnchorDigest ++
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

    val payloadOk =
      payload.slice(0, 31) == payloadDomain &&
      payload(31) == 1.toByte &&
      payloadTrackerNftId == trackerNftId &&
      payloadFamilyId == familyId &&
      sourceNetworkId == expectedSourceNetworkId &&
      sidechainId == expectedSidechainId &&
      suppliedTrustAnchor == approvedTrustAnchorDigest &&
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
      admissionHeight >= SELF.creationInfo._1 &&
      admissionHeight >= oldLastAdmissionHeight &&
      admissionHeight <= HEIGHT &&
      admissionHeight.toLong >= HEIGHT.toLong - maxAdmissionLag &&
      successor.R5[AvlTree].get == modifiedTree.get &&
      successor.R7[Long].get == sourceHeight &&
      successor.R8[Int].get == admissionHeight
    val proofAccepted =
      verifyStark(proofChunks, payload, expectedProgramId, expectedProfileId)

    sigmaProp(
      commonIdentityOk &&
      feeBaseOk &&
      feeBalanceOk &&
      payloadOk &&
      admitSuccessorOk &&
      proofAccepted
    )
  } else if (isRefresh) {
    val refreshOk =
      HEIGHT - SELF.creationInfo._1 >= minRefreshAgeBlocks &&
      successor.creationInfo._1 >= SELF.creationInfo._1 &&
      successor.creationInfo._1 <= HEIGHT &&
      successor.creationInfo._1 >= HEIGHT - maxSuccessorCreationHeightLag &&
      successor.R5[AvlTree].get == oldTree &&
      successor.R7[Long].get == oldLatestSourceHeight &&
      successor.R8[Int].get == oldLastAdmissionHeight

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
