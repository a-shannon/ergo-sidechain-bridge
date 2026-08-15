{
  // SPVTrackerPooledReserveBurnV4 - exact preactivation consumer for the
  // pooled-reserve burn statement V4.
  //
  // The fixed binding prefix commits to one runtime profile, its derived
  // identity, the source runtime-code identity, and the tracker singleton.
  // The remaining binding field must equal this script's serialized ErgoTree
  // hash. EIP-0045 is not active, so this source cannot authorize deployed
  // funds until an activated node accepts the exact profile and transaction.
  //
  // Registers:
  //   R4: Coll[Byte] - exact pooled-reserve lineage profile ID
  //   R5: AvlTree    - insert-only authenticated tracker entries
  //   R6: Coll[Byte] - exact sidechain ID
  //   R7: Long       - latest accepted sidechain height
  //   R8: Int        - nonfuture application stamp
  //   R9: Coll[Byte] - exact approved trust-anchor digest
  //
  // ContextExtension (all four variables are mandatory):
  //   Var(0): Coll[Coll[Byte]] exact EIP-0045 raw-seal chunks
  //   Var(1): Coll[Byte]       pooled-reserve burn public inputs V4 (980 bytes)
  //   Var(2): Coll[Byte]       extension-proof length, proof, AVL proof
  //   Var(3): Int              CONTEXT.headers index of the 0x0401 anchor

  val expectedProgramId =
    fromBase16("POOLED_RESERVE_BURN_V4_PROGRAM_ID_PLACEHOLDER")
  val expectedVerifierProfileId =
    fromBase16("POOLED_RESERVE_BURN_V4_VERIFIER_PROFILE_ID_PLACEHOLDER")
  // First 449 bytes of PooledReserveBurnApplicationBindingV4: exact runtime
  // profile, profile ID, source runtime-code identity, and tracker NFT.
  val expectedApplicationBindingPrefix =
    fromBase16("POOLED_RESERVE_BURN_V4_APPLICATION_BINDING_PREFIX_PLACEHOLDER")

  val payloadDomain =
    fromBase16("4532535f504f4f4c45445f524553455256455f4255524e5f5055424c49435f494e505554535f5634")
  val applicationBindingDomain =
    fromBase16("4532535f504f4f4c45445f524553455256455f4255524e5f4150504c49434154494f4e5f42494e44494e475f5634")
  val runtimeProfileIdDomain =
    fromBase16("4532535f504f4f4c45445f524553455256455f4d494e545f5245534552564154494f4e5f50524f46494c455f5634")
  val checkpointDomain =
    fromBase16("4532535f4252494447455f434845434b504f494e545f5631")
  val trackerKeyDomain =
    fromBase16("4532535f5350565f56414c49444954595f4150504c49434154494f4e5f4b45595f5634")
  val trackerValueDomain =
    fromBase16("4532535f5350565f56414c49444954595f4150504c49434154494f4e5f56414c55455f563400")
  val payloadDigestDomain =
    fromBase16("4532535f5350565f56414c49444954595f4150504c49434154494f4e5f5041594c4f41445f4449474553545f5634")
  val zero32 =
    fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero8 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte,
      0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero4 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val extensionKey = Coll(4.toByte, 1.toByte)
  val maxSuccessorCreationHeightLag = 100

  val successor = OUTPUTS(0)
  val oldTree = SELF.R5[AvlTree].get
  val oldTreePolicyOk =
    oldTree.isInsertAllowed &&
    !oldTree.isUpdateAllowed &&
    !oldTree.isRemoveAllowed
  val oldLatestSidechainHeight = SELF.R7[Long].get

  val proofChunks = getVar[Coll[Coll[Byte]]](0).get
  val payload = getVar[Coll[Byte]](1).get
  val proofBundle = getVar[Coll[Byte]](2).get
  val headerIndex = getVar[Int](3).get

  val payloadShapeOk = payload.size == 980
  val payloadDiscriminatorOk =
    payloadShapeOk &&
    payload.slice(0, 40) == payloadDomain &&
    payload(40) == 0.toByte &&
    payload(41) == 4.toByte &&
    payload(42) == 1.toByte &&
    payload(43) == 1.toByte &&
    payload(44) == 0.toByte

  val applicationBinding =
    if (payloadShapeOk) payload.slice(45, 530) else Coll[Byte]()
  val suppliedApplicationBindingDigest =
    if (payloadShapeOk) payload.slice(530, 562) else zero32
  val checkpoint =
    if (payloadShapeOk) payload.slice(562, 778) else Coll[Byte]()
  val checkpointCommitment =
    if (payloadShapeOk) payload.slice(778, 810) else zero32
  val targetNativeStateRoot =
    if (payloadShapeOk) payload.slice(810, 842) else zero32
  val suppliedTrustAnchorDigest =
    if (payloadShapeOk) payload.slice(842, 874) else zero32
  val finalityHorizonHeightBytes =
    if (payloadShapeOk) payload.slice(874, 882) else zero8
  val finalityHorizonHeight = byteArrayToLong(finalityHorizonHeightBytes)
  val finalityHorizonHash =
    if (payloadShapeOk) payload.slice(882, 914) else zero32
  val suppliedExtensionKey =
    if (payloadShapeOk) payload.slice(914, 916) else Coll[Byte]()
  val suppliedExtensionValue =
    if (payloadShapeOk) payload.slice(916, 980) else Coll[Byte]()

  val runtimeProfile =
    if (applicationBinding.size == 485)
      applicationBinding.slice(0, 349)
    else Coll[Byte]()
  val suppliedRuntimeProfileId =
    if (applicationBinding.size == 485)
      applicationBinding.slice(349, 381)
    else zero32
  val suppliedTrackerNftId =
    if (applicationBinding.size == 485)
      applicationBinding.slice(417, 449)
    else zero32
  val suppliedTrackerContractId =
    if (applicationBinding.size == 485)
      applicationBinding.slice(449, 481)
    else zero32
  val bindingControlBytes =
    if (applicationBinding.size == 485)
      applicationBinding.slice(481, 485)
    else Coll[Byte]()
  val lineageProfileId =
    if (runtimeProfile.size == 349) runtimeProfile.slice(1, 33) else zero32
  val sidechainId =
    if (runtimeProfile.size == 349) runtimeProfile.slice(65, 97) else zero32
  val settlementProfileId =
    if (runtimeProfile.size == 349) runtimeProfile.slice(209, 241) else zero32
  val activationHeightLe =
    if (runtimeProfile.size == 349) runtimeProfile.slice(337, 345) else zero8
  val activationHeight =
    if (activationHeightLe.size == 8)
      byteArrayToLong(Coll(
        activationHeightLe(7), activationHeightLe(6),
        activationHeightLe(5), activationHeightLe(4),
        activationHeightLe(3), activationHeightLe(2),
        activationHeightLe(1), activationHeightLe(0)))
    else 0L
  val selfContractId = blake2b256(SELF.propositionBytes)
  val applicationBindingOk =
    applicationBinding.size == 485 &&
    applicationBinding.slice(0, 449) == expectedApplicationBindingPrefix &&
    suppliedTrackerContractId == selfContractId &&
    bindingControlBytes == zero4 &&
    suppliedRuntimeProfileId ==
      blake2b256(runtimeProfileIdDomain ++ runtimeProfile) &&
    suppliedApplicationBindingDigest ==
      blake2b256(applicationBindingDomain ++ applicationBinding)

  val checkpointShapeOk = checkpoint.size == 216
  val checkpointDiscriminatorOk =
    checkpointShapeOk &&
    checkpoint(0) == 1.toByte &&
    checkpoint(1) == 1.toByte &&
    checkpoint(2) == 1.toByte &&
    checkpoint(3) == 0.toByte
  val checkpointSidechainId =
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
    if (checkpointShapeOk)
      blake2b256(checkpointDomain ++ checkpoint)
    else zero32
  val extensionBindingOk =
    suppliedExtensionKey == extensionKey &&
    suppliedExtensionValue == bridgeEventRoot ++ checkpointCommitment
  val checkpointFieldsOk =
    checkpointDiscriminatorOk &&
    checkpointSidechainId == sidechainId &&
    sidechainHeight > 0L &&
    sidechainHeight >= activationHeight &&
    sidechainHeight > oldLatestSidechainHeight &&
    burnCount > 0L &&
    burnCount <= 256L &&
    checkpointCommitment == expectedCheckpointCommitment &&
    targetNativeStateRoot != zero32 &&
    suppliedTrustAnchorDigest != zero32 &&
    finalityHorizonHeight >= sidechainHeight &&
    finalityHorizonHash != zero32

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
    Coll(2.toByte, 4.toByte, 1.toByte) ++ suppliedExtensionValue
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
  val extensionMembershipOk =
    headerIndexOk &&
    anchorHeader.height <= HEIGHT &&
    computedExtensionRoot == anchorHeader.extensionRoot

  val anchorHeightBytes =
    longToByteArray(anchorHeader.height.toLong).slice(4, 8)
  val applicationPayloadDigest =
    if (payloadShapeOk)
      blake2b256(payloadDigestDomain ++ payload)
    else zero32
  val trackerValue =
    trackerValueDomain ++
    Coll(4.toByte, 1.toByte, 1.toByte, 0.toByte) ++
    bridgeEventRoot ++
    checkpointCommitment ++
    anchorHeader.id ++
    anchorHeightBytes ++
    sidechainConsensusBlockHash ++
    burnCountBytes ++
    suppliedApplicationBindingDigest ++
    settlementProfileId ++
    lineageProfileId ++
    applicationPayloadDigest ++
    expectedProgramId ++
    expectedVerifierProfileId
  val trackerValueShapeOk = trackerValue.size == 370

  val trackerNftOk =
    SELF.tokens.size == 1 &&
    successor.tokens.size == 1 &&
    SELF.tokens(0)._1 == suppliedTrackerNftId &&
    SELF.tokens(0)._2 == 1L &&
    successor.tokens(0)._1 == suppliedTrackerNftId &&
    successor.tokens(0)._2 == 1L
  val immutableStateOk =
    SELF.R4[Coll[Byte]].get == lineageProfileId &&
    SELF.R6[Coll[Byte]].get == sidechainId &&
    SELF.R9[Coll[Byte]].get == suppliedTrustAnchorDigest
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
    successor.R4[Coll[Byte]].get == lineageProfileId &&
    successor.R5[AvlTree].get == modifiedTree.get &&
    successor.R6[Coll[Byte]].get == sidechainId &&
    successor.R7[Long].get == sidechainHeight &&
    successor.R8[Int].get <= HEIGHT &&
    successor.R8[Int].get > SELF.R8[Int].get &&
    successor.R9[Coll[Byte]].get == suppliedTrustAnchorDigest &&
    successor.value >= SELF.value

  val proofAccepted =
    verifyStark(
      proofChunks,
      payload,
      expectedProgramId,
      expectedVerifierProfileId
    )

  sigmaProp(
    payloadDiscriminatorOk &&
    applicationBindingOk &&
    checkpointFieldsOk &&
    extensionBindingOk &&
    extensionMembershipOk &&
    extensionSidesOk &&
    emptyPaddingCanonical &&
    trackerValueShapeOk &&
    trackerNftOk &&
    immutableStateOk &&
    oldTreePolicyOk &&
    avlInsertProof.size > 0 &&
    successorOk &&
    proofAccepted
  )
}
