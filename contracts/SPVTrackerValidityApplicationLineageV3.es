{
  // SPVTrackerValidityApplicationLineageV3 - instance-resolved
  // application-bound preactivation validity-proof checkpoint admission.
  //
  // This template preserves the V2 statement/value semantics while binding
  // one V3 causal-lineage instance at compile time. It is byte- and
  // domain-distinct from the frozen SPVTrackerValidityApplicationV2 fixture.
  // It admits one 370-byte V2 tracker value only when the exact application
  // proof, the selected Ergo header's 0x0401 commitment, and the AVL
  // successor agree. EIP-0045 is not active, so this source is a
  // preactivation candidate and cannot authorize deployed funds.
  //
  // ContextExtension (all four variables are mandatory):
  //   Var(0): Coll[Coll[Byte]] exact EIP-0045 raw-seal chunks
  //   Var(1): Coll[Byte]       application payload V3 (973 bytes)
  //   Var(2): Coll[Byte]       extension-proof length, proof, AVL proof
  //   Var(3): Int              CONTEXT.headers index of the 0x0401 anchor

  val expectedProgramId =
    fromBase16("VALIDITY_APPLICATION_PROGRAM_ID_PLACEHOLDER")
  val expectedProfileId =
    fromBase16("VALIDITY_APPLICATION_VERIFIER_PROFILE_ID_PLACEHOLDER")
  val payloadDomain =
    fromBase16("4532535f4252494447455f56414c49444954595f4150504c49434154494f4e5f5041594c4f41445f563300")
  val finalityPayloadDomain =
    fromBase16("4532535f4252494447455f56414c49444954595f46494e414c4954595f5041594c4f41445f563200")
  // E2S_CAUSAL_APPLICATION_BINDING_V2
  val applicationBindingDomain =
    fromBase16("4532535f43415553414c5f4150504c49434154494f4e5f42494e44494e475f5632")
  val checkpointDomain =
    fromBase16("4532535f4252494447455f434845434b504f494e545f5631")
  // E2S_SPV_VALIDITY_APPLICATION_KEY_V2
  val trackerKeyDomain =
    fromBase16("4532535f5350565f56414c49444954595f4150504c49434154494f4e5f4b45595f5632")
  // E2S_SPV_VALIDITY_APPLICATION_VALUE_V2
  val trackerValueDomain =
    fromBase16("4532535f5350565f56414c49444954595f4150504c49434154494f4e5f56414c55455f563200")
  val payloadDigestDomain =
    fromBase16("4532535f5350565f56414c49444954595f4150504c49434154494f4e5f5041594c4f41445f4449474553545f5632")
  val expectedApplicationBinding =
    fromBase16("VALIDITY_APPLICATION_BINDING_PLACEHOLDER")
  val zero32 =
    fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero8 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero4 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val extensionKey = Coll(4.toByte, 1.toByte)
  val maxSuccessorCreationHeightLag = 100

  val successor = OUTPUTS(0)
  val oldTree = SELF.R5[AvlTree].get
  val approvedSidechainId = SELF.R6[Coll[Byte]].get
  val oldLatestSidechainHeight = SELF.R7[Long].get
  val approvedTrustAnchorDigest = SELF.R9[Coll[Byte]].get

  val proofChunks = getVar[Coll[Coll[Byte]]](0).get
  val payload = getVar[Coll[Byte]](1).get
  val proofBundle = getVar[Coll[Byte]](2).get
  val headerIndex = getVar[Int](3).get

  val payloadShapeOk = payload.size == 973
  val payloadDiscriminatorOk =
    payloadShapeOk &&
    payload.slice(0, 43) == payloadDomain &&
    payload(43) == 3.toByte &&
    payload(44) == 1.toByte &&
    payload(45) == 2.toByte &&
    payload(46) == 0.toByte &&
    payload.slice(47, 87) == finalityPayloadDomain &&
    payload(87) == 2.toByte &&
    payload(88) == 1.toByte &&
    payload(89) == 1.toByte &&
    payload(90) == 0.toByte

  val payloadTrackerNftId =
    if (payloadShapeOk) payload.slice(91, 123) else zero32
  val checkpoint =
    if (payloadShapeOk) payload.slice(123, 339) else Coll[Byte]()
  val checkpointCommitment =
    if (payloadShapeOk) payload.slice(339, 371) else zero32
  val suppliedTrustAnchorDigest =
    if (payloadShapeOk) payload.slice(563, 595) else zero32
  val suppliedExtensionKey =
    if (payloadShapeOk) payload.slice(635, 637) else Coll[Byte]()
  val suppliedExtensionValue =
    if (payloadShapeOk) payload.slice(637, 701) else Coll[Byte]()
  val applicationBinding =
    if (payloadShapeOk) payload.slice(701, 941) else Coll[Byte]()
  val suppliedApplicationBindingDigest =
    if (payloadShapeOk) payload.slice(941, 973) else zero32

  val checkpointShapeOk = checkpoint.size == 216
  val checkpointDiscriminatorOk =
    checkpointShapeOk &&
    checkpoint(0) == 1.toByte &&
    checkpoint(1) == 1.toByte &&
    checkpoint(2) == 1.toByte &&
    checkpoint(3) == 0.toByte
  val sidechainId =
    if (checkpointShapeOk) checkpoint.slice(4, 36) else zero32
  val sidechainHeightBytes =
    if (checkpointShapeOk) checkpoint.slice(36, 44) else zero8
  val sidechainHeight = byteArrayToLong(sidechainHeightBytes)
  val sidechainConsensusBlockHash =
    if (checkpointShapeOk) checkpoint.slice(44, 76) else zero32
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

  val applicationBindingOk =
    applicationBinding == expectedApplicationBinding &&
    suppliedApplicationBindingDigest ==
      blake2b256(applicationBindingDomain ++ applicationBinding) &&
    applicationBinding.slice(32, 64) == sidechainId

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
  val applicationPayloadDigest =
    if (payloadShapeOk) blake2b256(payloadDigestDomain ++ payload) else zero32
  val trackerValue =
    trackerValueDomain ++
    Coll(2.toByte, 1.toByte, 1.toByte, 0.toByte) ++
    bridgeEventRoot ++
    checkpointCommitment ++
    anchorHeader.id ++
    anchorHeightBytes ++
    sidechainConsensusBlockHash ++
    burnCountBytes ++
    suppliedApplicationBindingDigest ++
    applicationBinding.slice(104, 136) ++
    applicationBinding.slice(136, 168) ++
    applicationPayloadDigest ++
    expectedProgramId ++
    expectedProfileId
  val trackerValueShapeOk = trackerValue.size == 370

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
    blake2b256(
      trackerKeyDomain ++
      sidechainId ++
      sidechainHeightBytes ++
      executionBlockHash
    )
  val modifiedTree =
    oldTree.insert(Coll((expectedTrackerKey, trackerValue)), avlInsertProof)

  val successorOk =
    modifiedTree.isDefined &&
    successor.propositionBytes == SELF.propositionBytes &&
    successor.creationInfo._1 >= SELF.creationInfo._1 &&
    successor.creationInfo._1 <= HEIGHT &&
    successor.creationInfo._1 >= HEIGHT - maxSuccessorCreationHeightLag &&
    successor.R4[Long].get == SELF.R4[Long].get + 1L &&
    successor.R5[AvlTree].get == modifiedTree.get &&
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
    applicationBindingOk &&
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
