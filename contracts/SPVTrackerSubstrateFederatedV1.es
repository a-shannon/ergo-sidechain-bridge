{
  // SPVTrackerSubstrateFederatedV1
  //
  // Federated, application-bound checkpoint admission. This contract does not
  // verify source Ed25519 signatures and must not be described as trustless.
  // Source attestations are an off-chain precondition. The compiled Ergo
  // SigmaProp threshold below is the on-chain deciding authority.
  //
  // Registers:
  //   R4: Coll[Byte] - exact federation profile ID
  //   R5: AvlTree    - insert-only 32-byte key / 370-byte value tracker
  //   R6: Coll[Byte] - exact sidechain ID
  //   R7: Long       - latest admitted source-native block height
  //   R8: Int        - latest Ergo admission height
  //   R9: Coll[Byte] - exact Ergo-admission key-set digest
  //
  // ContextExtension:
  //   0: Coll[Byte] - exact 512-byte federated checkpoint statement V1
  //   1: Coll[Byte] - u64be extension-proof length || extension proof || AVL proof
  //   2: Int        - index of the anchor header in CONTEXT.headers

  val trackerNftId =
    fromBase16("FEDERATED_TRACKER_NFT_ID_PLACEHOLDER")
  val expectedSourceNetworkId =
    fromBase16("FEDERATED_SOURCE_NETWORK_ID_PLACEHOLDER")
  val expectedSidechainId =
    fromBase16("FEDERATED_SIDECHAIN_ID_PLACEHOLDER")
  val expectedBridgeAddress =
    fromBase16("FEDERATED_BRIDGE_ADDRESS_PLACEHOLDER")
  val expectedTokenAddress =
    fromBase16("FEDERATED_TOKEN_ADDRESS_PLACEHOLDER")
  val expectedBridgeRuntimeHash =
    fromBase16("FEDERATED_BRIDGE_RUNTIME_HASH_PLACEHOLDER")
  val expectedBridgeRuntimeBytes =
    fromBase16("FEDERATED_BRIDGE_RUNTIME_BYTES_PLACEHOLDER")
  val expectedTokenRuntimeHash =
    fromBase16("FEDERATED_TOKEN_RUNTIME_HASH_PLACEHOLDER")
  val expectedTokenRuntimeBytes =
    fromBase16("FEDERATED_TOKEN_RUNTIME_BYTES_PLACEHOLDER")
  val expectedSourceRuntimeHash =
    fromBase16("FEDERATED_SOURCE_RUNTIME_HASH_PLACEHOLDER")
  val expectedSourceRuntimeBytes =
    fromBase16("FEDERATED_SOURCE_RUNTIME_BYTES_PLACEHOLDER")
  val expectedRuntimeProfileId =
    fromBase16("FEDERATED_RUNTIME_PROFILE_ID_PLACEHOLDER")
  val expectedSettlementProfileId =
    fromBase16("FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER")
  val expectedFederationProfileId =
    fromBase16("FEDERATED_PROFILE_ID_PLACEHOLDER")
  val expectedSourceKeySetDigest =
    fromBase16("FEDERATED_SOURCE_KEY_SET_DIGEST_PLACEHOLDER")
  val expectedSourceThreshold =
    fromBase16("FEDERATED_SOURCE_THRESHOLD_PLACEHOLDER")
  val expectedErgoKeySetDigest =
    fromBase16("FEDERATED_ERGO_KEY_SET_DIGEST_PLACEHOLDER")
  val expectedErgoThreshold =
    fromBase16("FEDERATED_ERGO_THRESHOLD_BYTES_PLACEHOLDER")
  val expectedFederationEpoch =
    fromBase16("FEDERATED_EPOCH_PLACEHOLDER")
  val maxAdmissionValidityBlocks =
    FEDERATED_MAX_ADMISSION_VALIDITY_BLOCKS_PLACEHOLDER
  val maxSuccessorCreationHeightLag = 100
  val ergoAdmissionKeys = Coll(
    FEDERATED_ERGO_SIGMAPROP_PLACEHOLDERS
  )
  val ergoAdmissionOk =
    atLeast(FEDERATED_ERGO_THRESHOLD_PLACEHOLDER, ergoAdmissionKeys)

  val statementDomain =
    fromBase16("4532535f5355425354524154455f4645444552415445445f434845434b504f494e545f53544154454d454e545f5631")
  val trackerKeyDomain =
    fromBase16("4532535f5350565f5355425354524154455f4645444552415445445f4b45595f5631")
  val trackerValueDomain =
    fromBase16("4532535f5350565f5355425354524154455f4645444552415445445f56414c55455f5631")
  val extensionKey = Coll(4.toByte, 1.toByte)
  val zero32 =
    fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero8 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte,
      0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero6 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero4 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)

  val successor = OUTPUTS(0)
  val oldTree = SELF.R5[AvlTree].get
  val oldTreePolicyOk =
    oldTree.isInsertAllowed &&
    !oldTree.isUpdateAllowed &&
    !oldTree.isRemoveAllowed
  val oldLatestSourceHeight = SELF.R7[Long].get

  val statement = getVar[Coll[Byte]](0).get
  val proofBundle = getVar[Coll[Byte]](1).get
  val headerIndex = getVar[Int](2).get

  val statementShapeOk = statement.size == 512
  val sourceNetworkId =
    if (statementShapeOk) statement.slice(4, 36) else zero32
  val sidechainId =
    if (statementShapeOk) statement.slice(36, 68) else zero32
  val sourceHeightBytes =
    if (statementShapeOk) statement.slice(68, 76) else zero8
  val sourceHeight = byteArrayToLong(sourceHeightBytes)
  val sourceBlockHash =
    if (statementShapeOk) statement.slice(76, 108) else zero32
  val executionBlockHash =
    if (statementShapeOk) statement.slice(108, 140) else zero32
  val bridgeEventRoot =
    if (statementShapeOk) statement.slice(140, 172) else zero32
  val burnCountBytes =
    if (statementShapeOk) statement.slice(172, 176) else zero4
  val burnCount = byteArrayToLong(zero4 ++ burnCountBytes)
  val bridgeAddress =
    if (statementShapeOk) statement.slice(176, 196) else Coll[Byte]()
  val tokenAddress =
    if (statementShapeOk) statement.slice(196, 216) else Coll[Byte]()
  val bridgeRuntimeHash =
    if (statementShapeOk) statement.slice(216, 248) else zero32
  val bridgeRuntimeBytes =
    if (statementShapeOk) statement.slice(248, 252) else zero4
  val tokenRuntimeHash =
    if (statementShapeOk) statement.slice(252, 284) else zero32
  val tokenRuntimeBytes =
    if (statementShapeOk) statement.slice(284, 288) else zero4
  val sourceRuntimeHash =
    if (statementShapeOk) statement.slice(288, 320) else zero32
  val sourceRuntimeBytes =
    if (statementShapeOk) statement.slice(320, 324) else zero4
  val runtimeProfileId =
    if (statementShapeOk) statement.slice(324, 356) else zero32
  val settlementProfileId =
    if (statementShapeOk) statement.slice(356, 388) else zero32
  val federationProfileId =
    if (statementShapeOk) statement.slice(388, 420) else zero32
  val sourceKeySetDigest =
    if (statementShapeOk) statement.slice(420, 452) else zero32
  val sourceThreshold =
    if (statementShapeOk) statement.slice(452, 454) else Coll[Byte]()
  val ergoKeySetDigest =
    if (statementShapeOk) statement.slice(454, 486) else zero32
  val ergoThreshold =
    if (statementShapeOk) statement.slice(486, 488) else Coll[Byte]()
  val federationEpochBytes =
    if (statementShapeOk) statement.slice(488, 496) else zero8
  val federationEpoch = byteArrayToLong(federationEpochBytes)
  val validFromBytes =
    if (statementShapeOk) statement.slice(496, 504) else zero8
  val validFrom = byteArrayToLong(validFromBytes)
  val expiresAtBytes =
    if (statementShapeOk) statement.slice(504, 512) else zero8
  val expiresAt = byteArrayToLong(expiresAtBytes)

  val statementDiscriminatorOk =
    statementShapeOk &&
    statement(0) == 1.toByte &&
    statement(1) == 1.toByte &&
    statement(2) == 1.toByte &&
    statement(3) == 0.toByte
  val applicationBindingOk =
    sourceNetworkId == expectedSourceNetworkId &&
    sidechainId == expectedSidechainId &&
    bridgeAddress == expectedBridgeAddress &&
    tokenAddress == expectedTokenAddress &&
    bridgeRuntimeHash == expectedBridgeRuntimeHash &&
    bridgeRuntimeBytes == expectedBridgeRuntimeBytes &&
    tokenRuntimeHash == expectedTokenRuntimeHash &&
    tokenRuntimeBytes == expectedTokenRuntimeBytes &&
    sourceRuntimeHash == expectedSourceRuntimeHash &&
    sourceRuntimeBytes == expectedSourceRuntimeBytes &&
    runtimeProfileId == expectedRuntimeProfileId &&
    settlementProfileId == expectedSettlementProfileId
  val federationBindingOk =
    federationProfileId == expectedFederationProfileId &&
    sourceKeySetDigest == expectedSourceKeySetDigest &&
    sourceThreshold == expectedSourceThreshold &&
    ergoKeySetDigest == expectedErgoKeySetDigest &&
    ergoThreshold == expectedErgoThreshold &&
    federationEpochBytes == expectedFederationEpoch
  val statementFieldsOk =
    sourceHeight > 0L &&
    sourceHeight > oldLatestSourceHeight &&
    sourceBlockHash != zero32 &&
    executionBlockHash != zero32 &&
    bridgeEventRoot != zero32 &&
    burnCount > 0L &&
    burnCount <= 256L
  val horizonOk =
    validFrom > 0L &&
    expiresAt > validFrom &&
    expiresAt - validFrom <= maxAdmissionValidityBlocks &&
    HEIGHT.toLong >= validFrom &&
    HEIGHT.toLong < expiresAt

  val statementId =
    if (statementShapeOk)
      blake2b256(statementDomain ++ statement)
    else zero32
  val expectedExtensionValue = bridgeEventRoot ++ statementId

  val proofBundleShapeOk = proofBundle.size > 8
  val extensionProofLenBytes =
    if (proofBundleShapeOk) proofBundle.slice(0, 8) else zero8
  val extensionProofLenFitsInt =
    extensionProofLenBytes.slice(0, 4) == zero4
  val extensionProofLen =
    if (extensionProofLenFitsInt)
      byteArrayToLong(extensionProofLenBytes).toInt
    else 0
  val extensionProofShapeOk =
    proofBundleShapeOk &&
    extensionProofLenFitsInt &&
    extensionProofLen >= 33 &&
    extensionProofLen <= 462 &&
    extensionProofLen % 33 == 0 &&
    8 + extensionProofLen < proofBundle.size
  val extensionProof =
    if (extensionProofShapeOk)
      proofBundle.slice(8, 8 + extensionProofLen)
    else Coll[Byte]()
  val avlInsertProof =
    if (extensionProofShapeOk)
      proofBundle.slice(8 + extensionProofLen, proofBundle.size)
    else Coll[Byte]()
  val extensionProofDepth = extensionProofLen / 33
  val levels: Coll[Int] =
    Coll(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13)
  val extensionSidesOk =
    if (extensionProofShapeOk)
      levels.forall({ (i: Int) =>
        if (i >= extensionProofDepth) true
        else {
          val side = extensionProof(i * 33)
          side == 0.toByte ||
          side == 1.toByte ||
          side == 2.toByte ||
          side == 3.toByte
        }
      })
    else false
  val emptyPaddingCanonical =
    if (extensionProofShapeOk)
      levels.forall({ (i: Int) =>
        if (i >= extensionProofDepth) true
        else {
          val off = i * 33
          val side = extensionProof(off)
          val siblingOrPadding = extensionProof.slice(off + 1, off + 33)
          if (side == 2.toByte || side == 3.toByte)
            siblingOrPadding == zero32
          else true
        }
      })
    else false

  val headerIndexOk =
    headerIndex >= 0 &&
    headerIndex < CONTEXT.headers.size
  val anchorHeader =
    if (headerIndexOk) CONTEXT.headers(headerIndex) else CONTEXT.headers(0)
  val extensionLeaf =
    Coll(2.toByte, 4.toByte, 1.toByte) ++ expectedExtensionValue
  val extensionLeafHash =
    blake2b256(Coll(0.toByte) ++ extensionLeaf)
  val computedExtensionRoot =
    if (extensionProofShapeOk)
      levels.fold(extensionLeafHash, { (acc: Coll[Byte], i: Int) =>
        if (i >= extensionProofDepth) acc
        else {
          val off = i * 33
          val side = extensionProof(off)
          val sibling = extensionProof.slice(off + 1, off + 33)
          if (side == 0.toByte)
            blake2b256(Coll(1.toByte) ++ acc ++ sibling)
          else if (side == 1.toByte)
            blake2b256(Coll(1.toByte) ++ sibling ++ acc)
          else if (side == 2.toByte || side == 3.toByte)
            blake2b256(Coll(1.toByte) ++ acc)
          else zero32
        }
      })
    else zero32
  val anchorHeight = anchorHeader.height.toLong
  val extensionMembershipOk =
    headerIndexOk &&
    anchorHeight >= validFrom &&
    anchorHeight < expiresAt &&
    anchorHeader.height <= HEIGHT &&
    computedExtensionRoot == anchorHeader.extensionRoot

  val anchorHeightBytes =
    longToByteArray(anchorHeight).slice(4, 8)
  val trackerValue =
    trackerValueDomain ++
    Coll(1.toByte, 1.toByte, 1.toByte, 0.toByte) ++
    bridgeEventRoot ++
    statementId ++
    anchorHeader.id ++
    anchorHeightBytes ++
    sourceHeightBytes ++
    sourceBlockHash ++
    executionBlockHash ++
    burnCountBytes ++
    runtimeProfileId ++
    settlementProfileId ++
    federationProfileId ++
    ergoKeySetDigest ++
    ergoThreshold ++
    federationEpochBytes ++
    validFromBytes ++
    expiresAtBytes
  val trackerValueShapeOk = trackerValue.size == 370
  val expectedTrackerKey =
    blake2b256(
      trackerKeyDomain ++
      sourceNetworkId ++
      sidechainId ++
      sourceHeightBytes ++
      sourceBlockHash ++
      executionBlockHash
    )
  val modifiedTree =
    oldTree.insert(Coll((expectedTrackerKey, trackerValue)), avlInsertProof)

  val trackerNftOk =
    SELF.tokens.size == 1 &&
    successor.tokens.size == 1 &&
    SELF.tokens(0)._1 == trackerNftId &&
    SELF.tokens(0)._2 == 1L &&
    successor.tokens(0)._1 == trackerNftId &&
    successor.tokens(0)._2 == 1L
  val immutableStateOk =
    SELF.R4[Coll[Byte]].get == expectedFederationProfileId &&
    SELF.R6[Coll[Byte]].get == expectedSidechainId &&
    SELF.R9[Coll[Byte]].get == expectedErgoKeySetDigest
  val successorOk =
    modifiedTree.isDefined &&
    successor.propositionBytes == SELF.propositionBytes &&
    successor.creationInfo._1 >= SELF.creationInfo._1 &&
    successor.creationInfo._1 <= HEIGHT &&
    successor.creationInfo._1 >= HEIGHT - maxSuccessorCreationHeightLag &&
    successor.value == SELF.value &&
    successor.R4[Coll[Byte]].get == expectedFederationProfileId &&
    successor.R5[AvlTree].get == modifiedTree.get &&
    successor.R6[Coll[Byte]].get == expectedSidechainId &&
    successor.R7[Long].get == sourceHeight &&
    successor.R8[Int].get <= HEIGHT &&
    successor.R8[Int].get > SELF.R8[Int].get &&
    successor.R9[Coll[Byte]].get == expectedErgoKeySetDigest

  sigmaProp(
    statementDiscriminatorOk &&
    applicationBindingOk &&
    federationBindingOk &&
    statementFieldsOk &&
    horizonOk &&
    extensionMembershipOk &&
    extensionSidesOk &&
    emptyPaddingCanonical &&
    trackerValueShapeOk &&
    trackerNftOk &&
    immutableStateOk &&
    oldTreePolicyOk &&
    avlInsertProof.size > 0 &&
    successorOk
  ) && ergoAdmissionOk
}
