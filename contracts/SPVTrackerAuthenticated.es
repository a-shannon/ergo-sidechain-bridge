{
  // SPVTrackerAuthenticated - V2 checkpoint admission bound to an Ergo header.
  //
  // This contract authenticates that the exact frozen V1 bridge checkpoint was
  // committed under extension key 0x0401 in one of CONTEXT.headers and binds the
  // tracker entry to the exact canonical finality statement/proof identity that
  // R9 authorized. It does not verify the proof payload or GRANDPA semantics:
  // R9 remains a finality authority until an equivalent proof is verified on
  // Ergo.
  //
  // Tracker schema:
  //   key = blake2b256("E2S_SPV_V2" || sidechainId || height_8BE || executionHash)
  //   value = bridgeEventRoot(32) || checkpointCommitment(32) ||
  //           Ergo anchor header id(32) || Ergo anchor height(4BE) ||
  //           proof system id(4BE) || statement digest(32) || program id(32) ||
  //           verifier profile id(32) || proof payload digest(32) ||
  //           aggregate proof digest(32)
  //
  // Registers:
  //   R4: Long      operation counter
  //   R5: AvlTree   accepted checkpoints (key=32, value=264)
  //   R6: Coll[Byte] approved sidechain id (32 bytes)
  //   R7: Long      latest admitted sidechain height
  //   R8: Int       last Ergo HEIGHT stamp
  //   R9: SigmaProp distinct finality attestor
  //
  // ContextExtension (all four variables are mandatory):
  //   Var(0): Coll[Byte] AggregateFinalityCommitmentV1 (496 bytes)
  //   Var(1): Coll[Byte] tracker value (264 bytes)
  //   Var(2): Coll[Byte] proof bundle:
  //     bytes 0..7: extension proof byte length as 8-byte big-endian Long
  //     extension proof: 1..14 levels of [side(1) || sibling/padding(32)]
  //     remaining bytes: AVL insert proof
  //   Var(3): Int index of the authenticated anchor in CONTEXT.headers

  val successor = OUTPUTS(0)
  val oldTree = SELF.R5[AvlTree].get
  val approvedSidechainId = SELF.R6[Coll[Byte]].get
  val oldLatestSidechainHeight = SELF.R7[Long].get
  val finalityAttestorPk = SELF.R9[SigmaProp].get

  val finalityCommitment = getVar[Coll[Byte]](0).get
  val trackerValue = getVar[Coll[Byte]](1).get
  val proofBundle = getVar[Coll[Byte]](2).get
  val headerIndex = getVar[Int](3).get

  val zero32 = fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero8 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero4 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val proofSystemIdBytes = fromBase16("00000001")
  val statementLengthBytes = fromBase16("00000164")
  val checkpointDomain = fromBase16("4532535f4252494447455f434845434b504f494e545f5631")
  val statementDomain = fromBase16("4532535f4252494447455f46494e414c4954595f53544154454d454e545f5631")
  val expectedFinalityProgramId = fromBase16("c175355a0813b4381e9ec9526e00dc0eb920bee5d841936ae2b8d3d3aea3e106")
  val trackerDomain = fromBase16("4532535f5350565f5632")

  val finalityCommitmentShapeOk = finalityCommitment.size == 496
  val statement =
    if (finalityCommitmentShapeOk) finalityCommitment.slice(108, 464) else Coll[Byte]()
  val checkpoint = if (statement.size == 356) statement.slice(4, 220) else Coll[Byte]()
  val checkpointShapeOk = checkpoint.size == 216
  val trackerValueShapeOk = trackerValue.size == 264
  val proofBundleHeaderOk = proofBundle.size > 8
  val headerIndexOk = headerIndex >= 0 && headerIndex < CONTEXT.headers.size
  val anchorHeader = if (headerIndexOk) CONTEXT.headers(headerIndex) else CONTEXT.headers(0)

  val finalityEnvelopeOk = finalityCommitmentShapeOk &&
    finalityCommitment(0) == 1.toByte &&
    finalityCommitment(1) == 1.toByte &&
    finalityCommitment(2) == 1.toByte &&
    finalityCommitment(3) == 0.toByte &&
    finalityCommitment.slice(4, 8) == statementLengthBytes
  val payloadLengthBytes =
    if (finalityCommitmentShapeOk) finalityCommitment.slice(8, 12) else zero4
  val payloadLength = byteArrayToLong(zero4 ++ payloadLengthBytes)
  // Must remain byte-for-byte aligned with MAX_NATIVE_VERIFIER_REQUEST_BYTES
  // in relayer/src/native-verifier-limits.ts.
  val payloadLengthOk = payloadLength > 0L && payloadLength <= 33554432L
  val verifierProfileId =
    if (finalityCommitmentShapeOk) finalityCommitment.slice(12, 44) else zero32
  val suppliedStatementDigest =
    if (finalityCommitmentShapeOk) finalityCommitment.slice(44, 76) else zero32
  val payloadDigest =
    if (finalityCommitmentShapeOk) finalityCommitment.slice(76, 108) else zero32
  val proofDigest =
    if (finalityCommitmentShapeOk) finalityCommitment.slice(464, 496) else zero32
  val statementShapeOk = statement.size == 356
  val statementVersionOk = statementShapeOk &&
    statement(0) == 1.toByte &&
    statement(1) == 1.toByte &&
    statement(2) == 1.toByte &&
    statement(3) == 0.toByte
  val versionOk = checkpointShapeOk &&
    checkpoint(0) == 1.toByte &&
    checkpoint(1) == 1.toByte &&
    checkpoint(2) == 1.toByte &&
    checkpoint(3) == 0.toByte
  val sidechainId = if (checkpointShapeOk) checkpoint.slice(4, 36) else zero32
  val sidechainHeightBytes = if (checkpointShapeOk) checkpoint.slice(36, 44) else zero8
  val sidechainHeight = byteArrayToLong(sidechainHeightBytes)
  val executionBlockHash = if (checkpointShapeOk) checkpoint.slice(76, 108) else zero32
  val eventRoot = if (checkpointShapeOk) checkpoint.slice(108, 140) else zero32
  val burnCountBytes = if (checkpointShapeOk) checkpoint.slice(140, 144) else zero4
  val burnCount = byteArrayToLong(zero4 ++ burnCountBytes)
  val checkpointCommitment = blake2b256(checkpointDomain ++ checkpoint)
  val statementCheckpointCommitment =
    if (statementShapeOk) statement.slice(220, 252) else zero32
  val finalityProgramId =
    if (statementShapeOk) statement.slice(324, 356) else zero32
  val statementDigestOk = statementShapeOk &&
    blake2b256(statementDomain ++ statement) == suppliedStatementDigest
  val finalityIdentityOk =
    finalityEnvelopeOk &&
    payloadLengthOk &&
    statementVersionOk &&
    statementCheckpointCommitment == checkpointCommitment &&
    finalityProgramId == expectedFinalityProgramId &&
    statementDigestOk

  val extensionProofLenBytes = if (proofBundleHeaderOk) proofBundle.slice(0, 8) else zero8
  val extensionProofLenFitsInt = extensionProofLenBytes.slice(0, 4) == zero4
  val extensionProofLen = byteArrayToLong(extensionProofLenBytes).toInt
  val extensionProofShapeOk =
    proofBundleHeaderOk &&
    extensionProofLenFitsInt &&
    extensionProofLen >= 33 &&
    extensionProofLen <= 462 &&
    extensionProofLen % 33 == 0 &&
    8 + extensionProofLen < proofBundle.size
  val extensionProof =
    if (extensionProofShapeOk) proofBundle.slice(8, 8 + extensionProofLen) else Coll[Byte]()
  val avlInsertProof =
    if (extensionProofShapeOk) proofBundle.slice(8 + extensionProofLen, proofBundle.size) else Coll[Byte]()
  val extensionProofDepth = extensionProofLen / 33
  val levels: Coll[Int] = Coll(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13)

  val extensionSidesOk =
    if (extensionProofShapeOk)
      levels.forall({ (i: Int) =>
        if (i >= extensionProofDepth) true
        else {
          val side = extensionProof(i * 33)
          side == 0.toByte || side == 1.toByte || side == 2.toByte || side == 3.toByte
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
          if (side == 2.toByte || side == 3.toByte) siblingOrPadding == zero32 else true
        }
      })
    else false

  val extensionValue = eventRoot ++ checkpointCommitment
  val extensionLeaf = Coll(2.toByte, 4.toByte, 1.toByte) ++ extensionValue
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
          else if (side == 2.toByte || side == 3.toByte) blake2b256(Coll(1.toByte) ++ acc)
          else zero32
        }
      })
    else zero32

  val anchorHeight = anchorHeader.height
  val anchorHeightBytes =
    if (trackerValueShapeOk) trackerValue.slice(96, 100) else zero4
  val anchorHeightLong = byteArrayToLong(zero4 ++ anchorHeightBytes)
  val trackerValueOk = trackerValueShapeOk &&
    trackerValue.slice(0, 32) == eventRoot &&
    trackerValue.slice(32, 64) == checkpointCommitment &&
    trackerValue.slice(64, 96) == anchorHeader.id &&
    anchorHeightLong == anchorHeight.toLong &&
    trackerValue.slice(100, 104) == proofSystemIdBytes &&
    trackerValue.slice(104, 136) == suppliedStatementDigest &&
    trackerValue.slice(136, 168) == finalityProgramId &&
    trackerValue.slice(168, 200) == verifierProfileId &&
    trackerValue.slice(200, 232) == payloadDigest &&
    trackerValue.slice(232, 264) == proofDigest
  val extensionMembershipOk =
    headerIndexOk &&
    anchorHeight <= HEIGHT &&
    computedExtensionRoot == anchorHeader.extensionRoot

  val checkpointFieldsOk =
    versionOk &&
    approvedSidechainId.size == 32 &&
    sidechainId == approvedSidechainId &&
    sidechainHeight > 0L &&
    sidechainHeight > oldLatestSidechainHeight &&
    burnCount > 0L &&
    burnCount <= 256L
  val expectedTrackerKey = blake2b256(
    trackerDomain ++ sidechainId ++ sidechainHeightBytes ++ executionBlockHash
  )
  val modifiedTree = oldTree.insert(Coll((expectedTrackerKey, trackerValue)), avlInsertProof).get

  val preserveNft =
    if (SELF.tokens.size > 0 && successor.tokens.size > 0)
      SELF.tokens(0)._2 == 1L &&
      successor.tokens(0)._1 == SELF.tokens(0)._1 &&
      successor.tokens(0)._2 == 1L
    else false
  val preserveContract = successor.propositionBytes == SELF.propositionBytes
  val preserveSidechain = successor.R6[Coll[Byte]].get == approvedSidechainId
  val preserveFinalityAttestor = successor.R9[SigmaProp].get == finalityAttestorPk
  val counterAdvances = successor.R4[Long].get == SELF.R4[Long].get + 1L
  val treeAdvances = successor.R5[AvlTree].get == modifiedTree
  val heightAdvances = successor.R7[Long].get == sidechainHeight
  val stampAdvances =
    successor.R8[Int].get <= HEIGHT &&
    successor.R8[Int].get > SELF.R8[Int].get
  val preserveValue = successor.value >= SELF.value

  sigmaProp(
    checkpointFieldsOk &&
    finalityIdentityOk &&
    trackerValueOk &&
    extensionMembershipOk &&
    extensionSidesOk &&
    emptyPaddingCanonical &&
    avlInsertProof.size > 0 &&
    preserveNft &&
    preserveContract &&
    preserveSidechain &&
    preserveFinalityAttestor &&
    counterAdvances &&
    treeAdvances &&
    heightAdvances &&
    stampAdvances &&
    preserveValue
  ) && finalityAttestorPk
}
