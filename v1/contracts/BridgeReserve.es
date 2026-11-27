{
  // BridgeReserve (V1)
  //
  // Native-ERG pooled reserve singleton for one V1 bridge family.
  // Supports permissionless deposit absorption, burn payout via authenticated
  // BridgeDup, and permissionless storage-rent refresh / ERG buffer top-up.
  //
  // Registers:
  //   R4: Coll[Byte] - familyId (32 bytes, immutable)
  //   R5: AvlTree    - append-only deposit commitments (key=32, value=32)
  //   R6: Long       - outstanding nanoERG liability (0 <= R6 <= SELF.value)
  //
  // Branch 1 (deposit):
  //   DATA_INPUTS: none
  //   INPUTS:  SELF=0, BridgeDepositLock=1, external fee=2
  //   OUTPUTS: reserve successor=0, miner fee=1, optional fee change=2
  //   Var(0):  deposit AVL insert proof
  //
  // Branch 2 (payout):
  //   DATA_INPUTS: BridgeTracker=0
  //   INPUTS:  SELF=0, BridgeDup=1, external fee=2
  //   OUTPUTS: reserve successor=0, DUP successor=1, payout=2, fee=3, optional change=4
  //   Vars:    none consumed by BridgeReserve (BridgeDup owns Vars 0..3)
  //
  // Branch 3 (rentRefresh, permissionless):
  //   DATA_INPUTS: none
  //   INPUTS:  SELF=0, external fee/top-up=1
  //   OUTPUTS: reserve successor=0 (value >= SELF.value), fee=1, optional change=2
  //   Vars:    none

  val reserveNftId =
    fromBase16("BRIDGE_V1_RESERVE_NFT_ID_PLACEHOLDER")
  val dupNftId =
    fromBase16("BRIDGE_V1_DUP_NFT_ID_PLACEHOLDER")
  val familyId =
    fromBase16("BRIDGE_V1_FAMILY_ID_PLACEHOLDER")
  val sourceNetworkId =
    fromBase16("BRIDGE_V1_SOURCE_NETWORK_ID_PLACEHOLDER")
  val sidechainId =
    fromBase16("BRIDGE_V1_SIDECHAIN_ID_PLACEHOLDER")
  val bridgeAddress =
    fromBase16("BRIDGE_V1_BRIDGE_ADDRESS_PLACEHOLDER")
  val tokenAddress =
    fromBase16("BRIDGE_V1_TOKEN_ADDRESS_PLACEHOLDER")
  val dupContractId =
    fromBase16("BRIDGE_V1_DUP_CONTRACT_ID_PLACEHOLDER")
  val depositLockContractId =
    fromBase16("BRIDGE_V1_DEPOSIT_LOCK_CONTRACT_ID_PLACEHOLDER")
  val minDepositNanoErg = BRIDGE_V1_MIN_DEPOSIT_NANOERG_PLACEHOLDER
  val minRefreshAgeBlocks = BRIDGE_V1_MIN_REFRESH_AGE_BLOCKS_PLACEHOLDER
  val minEarlyTopUpNanoErg = 1000000000L

  val minerFeeTree =
    fromBase16("1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304")
  val zero32 =
    fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero20 =
    fromBase16("0000000000000000000000000000000000000000")
  val zero8 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte,
      0.toByte, 0.toByte, 0.toByte, 0.toByte)
  // E2S_BRIDGE_V1_DEPOSIT_COMMITMENT_V1
  val depositCommitmentDomain =
    fromBase16("4532535f4252494447455f56315f4445504f5349545f434f4d4d49544d454e545f5631")
  val maxSuccessorCreationHeightLag = 100
  val minMinerFee = 1000000L
  val maxMinerFee = 5000000L
  val minChangeValue = 1000000L

  val reserveTree = SELF.R5[AvlTree].get
  val reserveTreePolicyOk =
    reserveTree.isInsertAllowed &&
    !reserveTree.isUpdateAllowed &&
    !reserveTree.isRemoveAllowed
  val reserveLiability = SELF.R6[Long].get
  val reserveIdentityOk =
    SELF.tokens.size == 1 &&
    SELF.tokens(0)._1 == reserveNftId &&
    SELF.tokens(0)._2 == 1L &&
    SELF.R4[Coll[Byte]].get == familyId &&
    SELF.R7[Long].isEmpty &&
    reserveLiability >= 0L &&
    reserveLiability <= SELF.value

  val isDeposit = CONTEXT.dataInputs.size == 0 && INPUTS.size == 3
  val isPayout = CONTEXT.dataInputs.size == 1 && INPUTS.size == 3
  val isRefresh = CONTEXT.dataInputs.size == 0 && INPUTS.size == 2

  if (isDeposit) {
    val depositProof = getVar[Coll[Byte]](0).get
    val transactionShapeOk =
      (OUTPUTS.size == 2 || OUTPUTS.size == 3) &&
      SELF.id == INPUTS(0).id
    val sourceLock = INPUTS(1)
    val feeIn = INPUTS(2)
    val reserveOut = OUTPUTS(0)
    val feeOut = OUTPUTS(1)
    val hasChange = OUTPUTS.size == 3
    val changeOut = if (hasChange) OUTPUTS(2) else SELF

    val sourceIntent =
      sourceLock.R4[Coll[Byte]].getOrElse(Coll[Byte]())
    val depositorTree =
      sourceLock.R5[Coll[Byte]].getOrElse(Coll[Byte]())
    val intentShapeOk = sourceIntent.size == 229
    val sourceAmountBytes =
      if (intentShapeOk) sourceIntent.slice(201, 209) else zero8
    val sourceAmount = byteArrayToLong(sourceAmountBytes)
    val sourceLockOk =
      blake2b256(sourceLock.propositionBytes) == depositLockContractId &&
      sourceLock.tokens.size == 0 &&
      intentShapeOk &&
      sourceIntent.slice(0, 1) == Coll(2.toByte) &&
      sourceIntent.slice(1, 33) == sourceNetworkId &&
      sourceIntent.slice(33, 65) == sidechainId &&
      sourceIntent.slice(65, 85) == bridgeAddress &&
      sourceIntent.slice(85, 105) == tokenAddress &&
      sourceIntent.slice(105, 137) == familyId &&
      sourceIntent.slice(137, 169) == reserveNftId &&
      sourceIntent.slice(169, 201) == zero32 &&
      sourceAmount >= minDepositNanoErg &&
      sourceAmount == sourceLock.value &&
      sourceIntent.slice(209, 229) != zero20 &&
      depositorTree.size > 0

    val depositCommitment =
      blake2b256(
        depositCommitmentDomain ++
        familyId ++
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
      reserveOut.tokens(0)._1 == reserveNftId &&
      reserveOut.tokens(0)._2 == 1L &&
      reserveOut.propositionBytes == SELF.propositionBytes &&
      reserveOut.R4[Coll[Byte]].get == familyId &&
      reserveOut.R5[AvlTree].get == modifiedTree.get &&
      reserveOut.R7[Long].isEmpty &&
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
    val feeBaseOk =
      feeIn.tokens.size == 0 &&
      feeIn.propositionBytes != sourceLock.propositionBytes &&
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
        changeOut.propositionBytes != sourceLock.propositionBytes &&
        changeOut.propositionBytes != minerFeeTree
      } else {
        feeIn.value == feeOut.value
      }

    sigmaProp(
      reserveIdentityOk &&
      reserveTreePolicyOk &&
      transactionShapeOk &&
      sourceLockOk &&
      depositProof.size > 0 &&
      reserveAdditionSafe &&
      reserveSuccessorOk &&
      feeBaseOk &&
      feeBalanceOk
    )
  } else if (isPayout) {
    val transactionShapeOk =
      (OUTPUTS.size == 4 || OUTPUTS.size == 5) &&
      SELF.id == INPUTS(0).id
    val dupIn = INPUTS(1)
    val feeIn = INPUTS(2)
    val reserveOut = OUTPUTS(0)
    val dupOut = OUTPUTS(1)
    val payoutOut = OUTPUTS(2)
    val feeOut = OUTPUTS(3)
    val hasChange = OUTPUTS.size == 5
    val changeOut = if (hasChange) OUTPUTS(4) else SELF

    val dupOk =
      blake2b256(dupIn.propositionBytes) == dupContractId &&
      dupIn.tokens.size == 1 &&
      dupOut.tokens.size == 1 &&
      dupIn.tokens(0)._1 == dupNftId &&
      dupIn.tokens(0)._2 == 1L &&
      dupOut.tokens(0)._1 == dupNftId &&
      dupOut.tokens(0)._2 == 1L &&
      dupIn.R4[Coll[Byte]].get == familyId &&
      dupOut.R4[Coll[Byte]].get == familyId &&
      dupOut.propositionBytes == dupIn.propositionBytes &&
      dupOut.value == dupIn.value

    val successorLiability =
      reserveOut.R6[Long].getOrElse(-1L)
    val payoutAmount = payoutOut.value
    val reserveSubtractSafe =
      payoutAmount > 0L &&
      payoutAmount <= SELF.value &&
      payoutAmount <= reserveLiability
    val expectedReserveValue =
      if (reserveSubtractSafe) SELF.value - payoutAmount else -1L
    val expectedSuccessorLiability =
      if (reserveSubtractSafe)
        reserveLiability - payoutAmount
      else -1L
    val payoutShapeOk =
      payoutAmount > 0L &&
      payoutOut.tokens.size == 0 &&
      payoutOut.propositionBytes != SELF.propositionBytes &&
      payoutOut.propositionBytes != dupIn.propositionBytes &&
      payoutOut.propositionBytes != minerFeeTree
    val reserveSuccessorOk =
      reserveOut.tokens.size == 1 &&
      reserveOut.tokens(0)._1 == reserveNftId &&
      reserveOut.tokens(0)._2 == 1L &&
      reserveOut.propositionBytes == SELF.propositionBytes &&
      reserveOut.R4[Coll[Byte]].get == familyId &&
      reserveOut.R5[AvlTree].get == reserveTree &&
      reserveOut.R7[Long].isEmpty &&
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
        changeOut.propositionBytes != dupIn.propositionBytes &&
        changeOut.propositionBytes != minerFeeTree
      } else {
        feeIn.value == feeOut.value
      }

    sigmaProp(
      reserveIdentityOk &&
      reserveTreePolicyOk &&
      transactionShapeOk &&
      dupOk &&
      payoutShapeOk &&
      reserveSubtractSafe &&
      reserveSuccessorOk &&
      feeBaseOk &&
      feeBalanceOk
    )
  } else if (isRefresh) {
    val transactionShapeOk =
      (OUTPUTS.size == 2 || OUTPUTS.size == 3) &&
      SELF.id == INPUTS(0).id
    val feeIn = INPUTS(1)
    val reserveOut = OUTPUTS(0)
    val feeOut = OUTPUTS(1)
    val hasChange = OUTPUTS.size == 3
    val changeOut = if (hasChange) OUTPUTS(2) else SELF

    val topUp = reserveOut.value - SELF.value
    val refreshEligible =
      (HEIGHT - SELF.creationInfo._1 >= minRefreshAgeBlocks) ||
      (topUp >= minEarlyTopUpNanoErg)
    val reserveSuccessorOk =
      refreshEligible &&
      topUp >= 0L &&
      reserveOut.tokens.size == 1 &&
      reserveOut.tokens(0)._1 == reserveNftId &&
      reserveOut.tokens(0)._2 == 1L &&
      reserveOut.propositionBytes == SELF.propositionBytes &&
      reserveOut.R4[Coll[Byte]].get == familyId &&
      reserveOut.R5[AvlTree].get == reserveTree &&
      reserveOut.R6[Long].get == reserveLiability &&
      reserveOut.R7[Long].isEmpty &&
      reserveOut.creationInfo._1 >= SELF.creationInfo._1 &&
      reserveOut.creationInfo._1 <= HEIGHT &&
      reserveOut.creationInfo._1 >=
        HEIGHT - maxSuccessorCreationHeightLag
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
      reserveIdentityOk &&
      reserveTreePolicyOk &&
      transactionShapeOk &&
      reserveSuccessorOk &&
      feeBaseOk &&
      feeBalanceOk
    )
  } else {
    sigmaProp(false)
  }
}
