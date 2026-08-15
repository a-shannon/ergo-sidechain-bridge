{
  // SPVTrackerValidityV1 - preactivation validity-proof checkpoint admission.
  //
  // This new profile does not reinterpret SPVTrackerAuthenticated or its V1
  // GRANDPA commitment bytes. It admits one V2 tracker entry only when the
  // exact EIP-0045 proof, the 0x0401 Ergo extension commitment, and the AVL
  // successor all agree. EIP-0045 is not active, so this source is a
  // preactivation candidate and cannot authorize deployed funds.
  //
  // Tracker schema:
  //   key = blake2b256(
  //     "E2S_SPV_VALIDITY_V1" || sidechainId || height_8BE || executionHash
  //   )
  //   value = bridgeEventRoot(32) || checkpointCommitment(32) ||
  //           Ergo anchor header id(32) || Ergo anchor height(4BE) ||
  //           compatibility proof system id(4BE) ||
  //           compatibility statement digest(32) ||
  //           compatibility semantic program id(32) ||
  //           compatibility verifier profile id(32) ||
  //           compatibility payload digest(32) ||
  //           compatibility aggregate proof digest(32)
  //
  // Registers:
  //   R4: Long      operation counter
  //   R5: AvlTree   accepted checkpoints (key=32, value=264)
  //   R6: Coll[Byte] approved sidechain id (32 bytes)
  //   R7: Long      latest admitted sidechain height
  //   R8: Int       last Ergo HEIGHT stamp
  //   R9: Coll[Byte] approved GRANDPA trust-anchor digest (32 bytes)
  //
  // ContextExtension (all four variables are mandatory):
  //   Var(0): Coll[Coll[Byte]] exact EIP-0045 raw-seal chunks
  //   Var(1): Coll[Byte]       BridgeValidityFinalityPayloadV2 (654 bytes)
  //   Var(2): Coll[Byte]       proof bundle:
  //     bytes 0..7: extension-proof byte length as 8-byte big-endian Long
  //     extension proof: 1..14 levels of [side(1) || sibling/padding(32)]
  //     remaining bytes: AVL insert proof
  //   Var(3): Int              CONTEXT.headers index of the 0x0401 anchor

  val expectedProgramId =
    fromBase16("5b46bf0ef2ff959327bfb39c6ac4dae48d509a0fcf91f89dcf84b26f44203934")
  val expectedProfileId =
    fromBase16("23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383")
  val payloadDomain =
    fromBase16("4532535f4252494447455f56414c49444954595f46494e414c4954595f5041594c4f41445f563200")
  val checkpointDomain =
    fromBase16("4532535f4252494447455f434845434b504f494e545f5631")
  val trackerDomain =
    fromBase16("4532535f5350565f56414c49444954595f5631")
  val zero32 =
    fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero8 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero4 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val extensionKey = Coll(4.toByte, 1.toByte)
  val compatibilityProofSystemId = fromBase16("00000001")

  val successor = OUTPUTS(0)
  val oldTree = SELF.R5[AvlTree].get
  val approvedSidechainId = SELF.R6[Coll[Byte]].get
  val oldLatestSidechainHeight = SELF.R7[Long].get
  val approvedTrustAnchorDigest = SELF.R9[Coll[Byte]].get

  val proofChunks = getVar[Coll[Coll[Byte]]](0).get
  val payload = getVar[Coll[Byte]](1).get
  val proofBundle = getVar[Coll[Byte]](2).get
  val headerIndex = getVar[Int](3).get

  val payloadShapeOk = payload.size == 654
  val payloadDiscriminatorOk =
    payloadShapeOk &&
    payload.slice(0, 40) == payloadDomain &&
    payload(40) == 2.toByte &&
    payload(41) == 1.toByte &&
    payload(42) == 1.toByte &&
    payload(43) == 0.toByte

  val payloadTrackerNftId = if (payloadShapeOk) payload.slice(44, 76) else zero32
  val checkpoint = if (payloadShapeOk) payload.slice(76, 292) else Coll[Byte]()
  val checkpointCommitment =
    if (payloadShapeOk) payload.slice(292, 324) else zero32
  val compatibilityStatementDigest =
    if (payloadShapeOk) payload.slice(324, 356) else zero32
  val compatibilitySemanticProgramId =
    if (payloadShapeOk) payload.slice(356, 388) else zero32
  val compatibilityVerifierProfileId =
    if (payloadShapeOk) payload.slice(388, 420) else zero32
  val compatibilityPayloadDigest =
    if (payloadShapeOk) payload.slice(420, 452) else zero32
  val compatibilityAggregateProofDigest =
    if (payloadShapeOk) payload.slice(452, 484) else zero32
  val suppliedTrustAnchorDigest =
    if (payloadShapeOk) payload.slice(516, 548) else zero32
  val suppliedExtensionKey =
    if (payloadShapeOk) payload.slice(588, 590) else Coll[Byte]()
  val suppliedExtensionValue =
    if (payloadShapeOk) payload.slice(590, 654) else Coll[Byte]()

  val checkpointShapeOk = checkpoint.size == 216
  val checkpointDiscriminatorOk =
    checkpointShapeOk &&
    checkpoint(0) == 1.toByte &&
    checkpoint(1) == 1.toByte &&
    checkpoint(2) == 1.toByte &&
    checkpoint(3) == 0.toByte
  val sidechainId = if (checkpointShapeOk) checkpoint.slice(4, 36) else zero32
  val sidechainHeightBytes =
    if (checkpointShapeOk) checkpoint.slice(36, 44) else zero8
  val sidechainHeight = byteArrayToLong(sidechainHeightBytes)
  val executionBlockHash =
    if (checkpointShapeOk) checkpoint.slice(76, 108) else zero32
  val bridgeEventRoot =
    if (checkpointShapeOk) checkpoint.slice(108, 140) else zero32
  val burnCountBytes =
    if (checkpointShapeOk) checkpoint.slice(140, 144) else zero4
  val burnCount = byteArrayToLong(zero4 ++ burnCountBytes)
  val expectedCheckpointCommitment =
    if (checkpointShapeOk) blake2b256(checkpointDomain ++ checkpoint) else zero32
  val extensionBindingOk =
    suppliedExtensionKey == extensionKey &&
    suppliedExtensionValue == bridgeEventRoot ++ checkpointCommitment

  val proofBundleShapeOk = proofBundle.size > 8
  val extensionProofLenBytes =
    if (proofBundleShapeOk) proofBundle.slice(0, 8) else zero8
  val extensionProofLenFitsInt = extensionProofLenBytes.slice(0, 4) == zero4
  val extensionProofLen = byteArrayToLong(extensionProofLenBytes).toInt
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
  val levels: Coll[Int] = Coll(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13)
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
    Coll(2.toByte, 4.toByte, 1.toByte) ++ suppliedExtensionValue
  val extensionLeafHash = blake2b256(Coll(0.toByte) ++ extensionLeaf)
  val computedExtensionRoot =
    if (extensionProofShapeOk)
      levels.fold(extensionLeafHash, { (acc: Coll[Byte], i: Int) =>
        if (i >= extensionProofDepth) acc
        else {
          val off = i * 33
          val side = extensionProof(off)
          val sibling = extensionProof.slice(off + 1, off + 33)
          if (side == 0.toByte) blake2b256(Coll(1.toByte) ++ acc ++ sibling)
          else if (side == 1.toByte) blake2b256(Coll(1.toByte) ++ sibling ++ acc)
          else if (side == 2.toByte || side == 3.toByte)
            blake2b256(Coll(1.toByte) ++ acc)
          else zero32
        }
      })
    else zero32
  val extensionMembershipOk =
    headerIndexOk &&
    anchorHeader.height <= HEIGHT &&
    computedExtensionRoot == anchorHeader.extensionRoot

  val anchorHeightBytes =
    longToByteArray(anchorHeader.height.toLong).slice(4, 8)
  val trackerValue =
    bridgeEventRoot ++
    checkpointCommitment ++
    anchorHeader.id ++
    anchorHeightBytes ++
    compatibilityProofSystemId ++
    compatibilityStatementDigest ++
    compatibilitySemanticProgramId ++
    compatibilityVerifierProfileId ++
    compatibilityPayloadDigest ++
    compatibilityAggregateProofDigest
  val trackerValueShapeOk = trackerValue.size == 264

  val trackerNftOk =
    SELF.tokens.size == 1 &&
    successor.tokens.size == 1 &&
    SELF.tokens(0)._2 == 1L &&
    successor.tokens(0)._1 == SELF.tokens(0)._1 &&
    successor.tokens(0)._2 == 1L &&
    payloadTrackerNftId == SELF.tokens(0)._1
  val checkpointFieldsOk =
    checkpointDiscriminatorOk &&
    approvedSidechainId.size == 32 &&
    approvedTrustAnchorDigest.size == 32 &&
    sidechainId == approvedSidechainId &&
    suppliedTrustAnchorDigest == approvedTrustAnchorDigest &&
    sidechainHeight > 0L &&
    sidechainHeight > oldLatestSidechainHeight &&
    burnCount > 0L &&
    burnCount <= 256L &&
    checkpointCommitment == expectedCheckpointCommitment
  val expectedTrackerKey =
    blake2b256(trackerDomain ++ sidechainId ++ sidechainHeightBytes ++ executionBlockHash)
  val modifiedTree =
    oldTree.insert(Coll((expectedTrackerKey, trackerValue)), avlInsertProof).get

  val successorOk =
    successor.propositionBytes == SELF.propositionBytes &&
    successor.R4[Long].get == SELF.R4[Long].get + 1L &&
    successor.R5[AvlTree].get == modifiedTree &&
    successor.R6[Coll[Byte]].get == approvedSidechainId &&
    successor.R7[Long].get == sidechainHeight &&
    successor.R8[Int].get <= HEIGHT &&
    successor.R8[Int].get > SELF.R8[Int].get &&
    successor.R9[Coll[Byte]].get == approvedTrustAnchorDigest &&
    successor.value >= SELF.value

  val proofAccepted =
    verifyStark(proofChunks, payload, expectedProgramId, expectedProfileId)

  sigmaProp(
    payloadDiscriminatorOk &&
    checkpointFieldsOk &&
    extensionBindingOk &&
    extensionMembershipOk &&
    extensionSidesOk &&
    emptyPaddingCanonical &&
    trackerValueShapeOk &&
    trackerNftOk &&
    avlInsertProof.size > 0 &&
    successorOk &&
    proofAccepted
  )
}
