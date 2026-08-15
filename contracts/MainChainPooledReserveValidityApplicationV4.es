{
  // MainChainPooledReserveValidityApplicationV4
  //
  // Canonical native-ERG pooled reserve for one V4 settlement profile.
  //
  // Registers:
  //   R4: Coll[Byte] - exact pooled-reserve V4 profile ID
  //   R5: AvlTree    - append-only deposit commitments
  //   R6: Long       - current outstanding nanoERG liability
  //
  // Deposit branch:
  //   DATA_INPUTS: none
  //   INPUTS:  reserve=0, source lock=1, external fee=2
  //   OUTPUTS: reserve successor=0, miner fee=1
  //   Var(0):  deposit AVL insert proof
  //
  // Burn branch:
  //   DATA_INPUTS: tracker=0
  //   INPUTS:  reserve=0, exact DUP=1, external fee=2
  //   OUTPUTS: reserve successor=0, DUP successor=1, payout=2, fee=3
  //   Vars(0..3): tracker key/proof, burn leaf V1, proof bundle V2
  //
  // Full tracker, Merkle and replay verification belongs to the exact DUP
  // input predicate. This reserve authenticates that compiled predicate and
  // independently binds the tracker profile, leaf payout and conservation
  // delta, keeping this ErgoTree below the reader-size boundary.

  val trackerNftId =
    fromBase16("POOLED_RESERVE_TRACKER_NFT_ID_PLACEHOLDER")
  val dupNftId =
    fromBase16("POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER")
  val pooledReserveNftId =
    fromBase16("POOLED_RESERVE_NFT_ID_PLACEHOLDER")
  val pooledReserveProfileId =
    fromBase16("POOLED_RESERVE_PROFILE_ID_PLACEHOLDER")
  val trackerContractId =
    fromBase16("POOLED_RESERVE_TRACKER_CONTRACT_ID_PLACEHOLDER")
  val sidechainIdExpected =
    fromBase16("POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER")
  val trustAnchorDigestExpected =
    fromBase16("POOLED_RESERVE_TRUST_ANCHOR_DIGEST_PLACEHOLDER")
  val sourceNetworkId =
    fromBase16("POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER")
  val bridgeAddress =
    fromBase16("POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER")
  val tokenAddress =
    fromBase16("POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER")
  val settlementProfileId =
    fromBase16("POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER")
  val dupContractId =
    fromBase16("POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER")
  val sourceLockContractId =
    fromBase16("POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER")
  val applicationBindingDigestExpected =
    fromBase16("POOLED_RESERVE_APPLICATION_BINDING_DIGEST_PLACEHOLDER")

  val minerFeeTree =
    fromBase16("1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304")
  val zero32 =
    fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero20 =
    fromBase16("0000000000000000000000000000000000000000")
  val zero8 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte,
      0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val zero4 = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)
  // E2S_PEG_IN_DEPOSIT_COMMITMENT_V4
  val depositCommitmentDomain =
    fromBase16("4532535f5045475f494e5f4445504f5349545f434f4d4d49544d454e545f5634")
  // E2S_SPV_VALIDITY_APPLICATION_KEY_V4
  val trackerKeyDomain =
    fromBase16("4532535f5350565f56414c49444954595f4150504c49434154494f4e5f4b45595f5634")
  // E2S_SPV_VALIDITY_APPLICATION_VALUE_V4 plus a canonical NUL separator
  val trackerValueDomain =
    fromBase16("4532535f5350565f56414c49444954595f4150504c49434154494f4e5f56414c55455f563400")
  // E2S_VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2 plus NUL separator
  val bundleDomain =
    fromBase16("4532535f56414c49444954595f4150504c49434154494f4e5f534554544c454d454e545f42554e444c455f563200")
  val burnIdDomain =
    fromBase16("4532535f54525553544c4553535f4255524e5f49445f5631")
  val maxSuccessorCreationHeightLag = 100

  val reserveTree = SELF.R5[AvlTree].get
  val reserveTreePolicyOk =
    reserveTree.isInsertAllowed &&
    !reserveTree.isUpdateAllowed &&
    !reserveTree.isRemoveAllowed
  val reserveLiability = SELF.R6[Long].get
  val reserveIdentityOk =
    SELF.tokens.size == 1 &&
    SELF.tokens(0)._1 == pooledReserveNftId &&
    SELF.tokens(0)._2 == 1L &&
    SELF.R4[Coll[Byte]].get == pooledReserveProfileId &&
    reserveLiability >= 0L &&
    reserveLiability <= SELF.value

  val isDeposit = CONTEXT.dataInputs.size == 0
  val isBurn = CONTEXT.dataInputs.size == 1

  if (isDeposit) {
    val depositProof = getVar[Coll[Byte]](0).get
    val transactionShapeOk =
      INPUTS.size == 3 &&
      OUTPUTS.size == 2 &&
      SELF.id == INPUTS(0).id
    val sourceLock = if (INPUTS.size == 3) INPUTS(1) else SELF
    val feeIn = if (INPUTS.size == 3) INPUTS(2) else SELF
    val reserveOut = if (OUTPUTS.size == 2) OUTPUTS(0) else SELF
    val feeOut = if (OUTPUTS.size == 2) OUTPUTS(1) else SELF

    val sourceIntent =
      sourceLock.R4[Coll[Byte]].getOrElse(Coll[Byte]())
    val depositorTree =
      sourceLock.R5[Coll[Byte]].getOrElse(Coll[Byte]())
    val intentShapeOk = sourceIntent.size == 229
    val sourceAmountBytes =
      if (intentShapeOk) sourceIntent.slice(201, 209) else zero8
    val sourceAmount = byteArrayToLong(sourceAmountBytes)
    val sourceLockOk =
      blake2b256(sourceLock.propositionBytes) == sourceLockContractId &&
      sourceLock.tokens.size == 0 &&
      intentShapeOk &&
      sourceIntent.slice(0, 1) == Coll(2.toByte) &&
      sourceIntent.slice(1, 33) == sourceNetworkId &&
      sourceIntent.slice(33, 65) == sidechainIdExpected &&
      sourceIntent.slice(65, 85) == bridgeAddress &&
      sourceIntent.slice(85, 105) == tokenAddress &&
      sourceIntent.slice(105, 137) == settlementProfileId &&
      sourceIntent.slice(137, 169) == pooledReserveProfileId &&
      sourceIntent.slice(169, 201) == zero32 &&
      sourceAmount > 0L &&
      sourceAmount == sourceLock.value &&
      sourceIntent.slice(209, 229) != zero20 &&
      depositorTree.size > 0

    val depositCommitment =
      blake2b256(
        depositCommitmentDomain ++
        pooledReserveProfileId ++
        sourceLock.id ++
        sourceIntent
      )
    val modifiedTree =
      reserveTree.insert(
        Coll((sourceLock.id, depositCommitment)),
        depositProof
      )
    val successorLiability =
      reserveOut.R6[Long].getOrElse(-1L)
    val reserveAdditionSafe =
      sourceAmount > 0L &&
      SELF.value <= 9223372036854775807L - sourceAmount &&
      reserveLiability <= 9223372036854775807L - sourceAmount
    val expectedReserveValue =
      if (reserveAdditionSafe) SELF.value + sourceAmount else 0L
    val expectedSuccessorLiability =
      if (reserveAdditionSafe)
        reserveLiability + sourceAmount
      else -1L
    val reserveSuccessorOk =
      modifiedTree.isDefined &&
      reserveOut.tokens.size == 1 &&
      reserveOut.tokens(0)._1 == pooledReserveNftId &&
      reserveOut.tokens(0)._2 == 1L &&
      reserveOut.propositionBytes == SELF.propositionBytes &&
      reserveOut.R4[Coll[Byte]].get == pooledReserveProfileId &&
      reserveOut.R5[AvlTree].get == modifiedTree.get &&
      successorLiability == expectedSuccessorLiability &&
      successorLiability >= 0L &&
      successorLiability <= reserveOut.value &&
      reserveOut.value == expectedReserveValue &&
      SELF.value - reserveLiability ==
        reserveOut.value - successorLiability &&
      reserveOut.creationInfo._1 >= SELF.creationInfo._1 &&
      reserveOut.creationInfo._1 <= HEIGHT &&
      reserveOut.creationInfo._1 >=
        HEIGHT - maxSuccessorCreationHeightLag
    val externalFeeOk =
      feeIn.tokens.size == 0 &&
      feeOut.tokens.size == 0 &&
      feeOut.propositionBytes == minerFeeTree &&
      feeIn.value == feeOut.value &&
      feeOut.value >= 1000000L &&
      feeOut.value <= 2100000L

    sigmaProp(
      reserveIdentityOk &&
      reserveTreePolicyOk &&
      transactionShapeOk &&
      sourceLockOk &&
      depositProof.size > 0 &&
      reserveAdditionSafe &&
      reserveSuccessorOk &&
      externalFeeOk
    )
  } else if (isBurn) {
    val trackerKey = getVar[Coll[Byte]](0).get
    val trackerProof = getVar[Coll[Byte]](1).get
    val encodedLeaf = getVar[Coll[Byte]](2).get
    val proofBundle = getVar[Coll[Byte]](3).get

    val transactionShapeOk =
      INPUTS.size == 3 &&
      OUTPUTS.size == 4 &&
      SELF.id == INPUTS(0).id
    val tracker = CONTEXT.dataInputs(0)
    val dupIn = if (INPUTS.size == 3) INPUTS(1) else SELF
    val feeIn = if (INPUTS.size == 3) INPUTS(2) else SELF
    val reserveOut = if (OUTPUTS.size == 4) OUTPUTS(0) else SELF
    val dupOut = if (OUTPUTS.size == 4) OUTPUTS(1) else SELF
    val payoutOut = if (OUTPUTS.size == 4) OUTPUTS(2) else SELF
    val feeOut = if (OUTPUTS.size == 4) OUTPUTS(3) else SELF

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
    val expectedBurnId =
      blake2b256(
        burnIdDomain ++ sidechainId ++ sidechainTxHash ++ eventIndexBytes
      )
    val leafFieldsOk =
      leafShapeOk &&
      leafVersion == Coll(1.toByte) &&
      sidechainId == sidechainIdExpected &&
      burnId == expectedBurnId &&
      recipientHash == blake2b256(payoutOut.propositionBytes) &&
      assetId == zero32 &&
      amount > 0L &&
      payoutOut.value == amount &&
      payoutOut.tokens.size == 0

    val proofBundleHeaderOk =
      proofBundle.size >= 90 &&
      proofBundle.slice(0, 46) == bundleDomain &&
      proofBundle(46) == 2.toByte &&
      proofBundle(47) == 1.toByte &&
      proofBundle(48) == 1.toByte &&
      proofBundle(49) == 0.toByte
    val sidechainHeightBytes =
      if (proofBundleHeaderOk) proofBundle.slice(50, 58) else zero8
    val sidechainHeight = byteArrayToLong(sidechainHeightBytes)
    val expectedTrackerKey =
      blake2b256(
        trackerKeyDomain ++
        sidechainId ++
        sidechainHeightBytes ++
        executionBlockHash
      )
    val trackerNftOk =
      tracker.tokens.size == 1 &&
      tracker.tokens(0)._1 == trackerNftId &&
      tracker.tokens(0)._2 == 1L
    val trackerProfileOk =
      blake2b256(tracker.propositionBytes) == trackerContractId &&
      tracker.R4[Coll[Byte]].get == pooledReserveProfileId &&
      tracker.R6[Coll[Byte]].get == sidechainIdExpected &&
      tracker.R9[Coll[Byte]].get == trustAnchorDigestExpected
    val trackerTree = tracker.R5[AvlTree].get
    val trackerTreePolicyOk =
      trackerTree.isInsertAllowed &&
      !trackerTree.isUpdateAllowed &&
      !trackerTree.isRemoveAllowed
    val trackerValueOpt =
      trackerTree.get(trackerKey, trackerProof)
    val trackerValue = trackerValueOpt.getOrElse(Coll[Byte]())
    val trackerValueOk =
      trackerValue.size == 370 &&
      trackerValue.slice(0, 38) == trackerValueDomain &&
      trackerValue(38) == 4.toByte &&
      trackerValue(39) == 1.toByte &&
      trackerValue(40) == 1.toByte &&
      trackerValue(41) == 0.toByte &&
      trackerValue.slice(178, 210) ==
        applicationBindingDigestExpected &&
      trackerValue.slice(242, 274) == pooledReserveProfileId
    val trackerBindingOk =
      trackerKey.size == 32 &&
      trackerProof.size > 0 &&
      sidechainHeight > 0L &&
      trackerKey == expectedTrackerKey &&
      trackerValueOpt.isDefined &&
      trackerValueOk

    val dupOk =
      blake2b256(dupIn.propositionBytes) == dupContractId &&
      dupIn.tokens.size == 1 &&
      dupOut.tokens.size == 1 &&
      dupIn.tokens(0)._1 == dupNftId &&
      dupIn.tokens(0)._2 == 1L &&
      dupOut.tokens(0)._1 == dupNftId &&
      dupOut.tokens(0)._2 == 1L &&
      dupIn.R4[Coll[Byte]].get == pooledReserveProfileId &&
      dupOut.R4[Coll[Byte]].get == pooledReserveProfileId &&
      dupOut.propositionBytes == dupIn.propositionBytes &&
      dupOut.value == dupIn.value

    val successorLiability =
      reserveOut.R6[Long].getOrElse(-1L)
    val reserveSubtractSafe =
      amount > 0L &&
      amount <= SELF.value &&
      amount <= reserveLiability
    val expectedReserveValue =
      if (reserveSubtractSafe) SELF.value - amount else -1L
    val expectedSuccessorLiability =
      if (reserveSubtractSafe) reserveLiability - amount else -1L
    val reserveSuccessorOk =
      reserveOut.tokens.size == 1 &&
      reserveOut.tokens(0)._1 == pooledReserveNftId &&
      reserveOut.tokens(0)._2 == 1L &&
      reserveOut.propositionBytes == SELF.propositionBytes &&
      reserveOut.R4[Coll[Byte]].get == pooledReserveProfileId &&
      reserveOut.R5[AvlTree].get == reserveTree &&
      successorLiability == expectedSuccessorLiability &&
      successorLiability >= 0L &&
      successorLiability <= reserveOut.value &&
      reserveOut.value == expectedReserveValue &&
      SELF.value - reserveLiability ==
        reserveOut.value - successorLiability &&
      reserveOut.creationInfo._1 >= SELF.creationInfo._1 &&
      reserveOut.creationInfo._1 <= HEIGHT &&
      reserveOut.creationInfo._1 >=
        HEIGHT - maxSuccessorCreationHeightLag
    val externalFeeOk =
      feeIn.tokens.size == 0 &&
      feeOut.tokens.size == 0 &&
      feeOut.propositionBytes == minerFeeTree &&
      feeIn.value == feeOut.value &&
      feeOut.value >= 1000000L &&
      feeOut.value <= 2100000L

    sigmaProp(
      reserveIdentityOk &&
      reserveTreePolicyOk &&
      transactionShapeOk &&
      leafFieldsOk &&
      proofBundleHeaderOk &&
      trackerNftOk &&
      trackerProfileOk &&
      trackerTreePolicyOk &&
      trackerBindingOk &&
      dupOk &&
      reserveSubtractSafe &&
      reserveSuccessorOk &&
      externalFeeOk
    )
  } else sigmaProp(false)
}
