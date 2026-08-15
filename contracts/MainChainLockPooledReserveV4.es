{
  // MainChainLockPooledReserveV4 - refundable native-ERG staging for one
  // pooled-reserve V4 instance.
  //
  // Registers:
  //   R4: Coll[Byte] - exact 229-byte Peg-In Source Intent V2
  //   R5: Coll[Byte] - exact depositor ErgoTree for timeout recovery
  //
  // The normal branch is permissionless and consumes this source lock in the
  // same transaction as the canonical reserve predecessor. The source lock
  // authenticates the reserve NFT/profile and exact protected-value delta,
  // but deliberately does not embed the future reserve proposition.
  //
  // Normal transaction:
  //   INPUTS(0):  reserve predecessor
  //   INPUTS(1):  SELF
  //   INPUTS(2):  external fee funding
  //   OUTPUTS(0): reserve successor
  //   OUTPUTS(1): exact miner fee
  //
  // Refund transaction:
  //   INPUTS(0):  SELF
  //   INPUTS(1):  external fee funding
  //   OUTPUTS(0): exact depositor recovery
  //   OUTPUTS(1): exact miner fee

  val sourceNetworkId =
    fromBase16("POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER")
  val sidechainId =
    fromBase16("POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER")
  val bridgeAddress =
    fromBase16("POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER")
  val tokenAddress =
    fromBase16("POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER")
  val settlementProfileId =
    fromBase16("POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER")
  val pooledReserveProfileId =
    fromBase16("POOLED_RESERVE_PROFILE_ID_PLACEHOLDER")
  val pooledReserveNftId =
    fromBase16("POOLED_RESERVE_NFT_ID_PLACEHOLDER")
  val minerFeeTree =
    fromBase16("1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304")
  val zero32 =
    fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero20 =
    fromBase16("0000000000000000000000000000000000000000")
  val zero8 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte,
      0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val escapeTimeout = 10000

  val sourceIntent = SELF.R4[Coll[Byte]].getOrElse(Coll[Byte]())
  val depositorTree = SELF.R5[Coll[Byte]].getOrElse(Coll[Byte]())
  val intentShapeOk = sourceIntent.size == 229
  val sourceAmountBytes =
    if (intentShapeOk) sourceIntent.slice(201, 209) else zero8
  val sourceAmount = byteArrayToLong(sourceAmountBytes)
  val intentOk =
    intentShapeOk &&
    sourceIntent.slice(0, 1) == Coll(2.toByte) &&
    sourceIntent.slice(1, 33) == sourceNetworkId &&
    sourceIntent.slice(33, 65) == sidechainId &&
    sourceIntent.slice(65, 85) == bridgeAddress &&
    sourceIntent.slice(85, 105) == tokenAddress &&
    sourceIntent.slice(105, 137) == settlementProfileId &&
    sourceIntent.slice(137, 169) == pooledReserveProfileId &&
    sourceIntent.slice(169, 201) == zero32 &&
    sourceAmount > 0L &&
    sourceAmount == SELF.value &&
    sourceIntent.slice(209, 229) != zero20 &&
    depositorTree.size > 0 &&
    SELF.tokens.size == 0

  val normalShape =
    CONTEXT.dataInputs.size == 0 &&
    INPUTS.size == 3 &&
    OUTPUTS.size == 2 &&
    SELF.id == INPUTS(1).id
  val reserveIn = if (normalShape) INPUTS(0) else SELF
  val reserveOut = if (normalShape) OUTPUTS(0) else SELF
  val normalFeeIn = if (normalShape) INPUTS(2) else SELF
  val normalFeeOut = if (normalShape) OUTPUTS(1) else SELF
  val reserveLiability = reserveIn.R6[Long].getOrElse(-1L)
  val successorLiability = reserveOut.R6[Long].getOrElse(-1L)
  val reserveProfileOk =
    reserveIn.R4[Coll[Byte]].getOrElse(Coll[Byte]()) ==
      pooledReserveProfileId &&
    reserveOut.R4[Coll[Byte]].getOrElse(Coll[Byte]()) ==
      pooledReserveProfileId
  val reserveNftOk =
    reserveIn.tokens.size == 1 &&
    reserveOut.tokens.size == 1 &&
    reserveIn.tokens(0)._1 == pooledReserveNftId &&
    reserveIn.tokens(0)._2 == 1L &&
    reserveOut.tokens(0)._1 == pooledReserveNftId &&
    reserveOut.tokens(0)._2 == 1L
  val reserveStateOk =
    reserveLiability >= 0L &&
    reserveLiability <= reserveIn.value &&
    successorLiability >= 0L &&
    successorLiability <= reserveOut.value
  val reserveAdditionSafe =
    sourceAmount > 0L &&
    reserveIn.value <= 9223372036854775807L - sourceAmount &&
    reserveLiability <= 9223372036854775807L - sourceAmount
  val expectedReserveValue =
    if (reserveAdditionSafe) reserveIn.value + sourceAmount else 0L
  val expectedSuccessorLiability =
    if (reserveAdditionSafe) reserveLiability + sourceAmount else -1L
  val reserveTransitionOk =
    reserveOut.propositionBytes == reserveIn.propositionBytes &&
    reserveOut.value == expectedReserveValue &&
    successorLiability == expectedSuccessorLiability &&
    reserveIn.value - reserveLiability ==
      reserveOut.value - successorLiability
  val normalFeeOk =
    normalFeeIn.tokens.size == 0 &&
    normalFeeOut.tokens.size == 0 &&
    normalFeeOut.propositionBytes == minerFeeTree &&
    normalFeeIn.value == normalFeeOut.value &&
    normalFeeOut.value >= 1000000L &&
    normalFeeOut.value <= 2100000L
  val commitWindowOpen =
    HEIGHT < SELF.creationInfo._1 + escapeTimeout
  val commitToReserve =
    normalShape &&
    intentOk &&
    commitWindowOpen &&
    reserveProfileOk &&
    reserveNftOk &&
    reserveStateOk &&
    reserveAdditionSafe &&
    reserveTransitionOk &&
    normalFeeOk

  val refundShape =
    CONTEXT.dataInputs.size == 0 &&
    INPUTS.size == 2 &&
    OUTPUTS.size == 2 &&
    SELF.id == INPUTS(0).id
  val refundOut = if (refundShape) OUTPUTS(0) else SELF
  val refundFeeIn = if (refundShape) INPUTS(1) else SELF
  val refundFeeOut = if (refundShape) OUTPUTS(1) else SELF
  val refundSourceBoxId =
    refundOut.R4[Coll[Byte]].getOrElse(Coll[Byte]())
  val refundFeeOk =
    refundFeeIn.tokens.size == 0 &&
    refundFeeOut.tokens.size == 0 &&
    refundFeeOut.propositionBytes == minerFeeTree &&
    refundFeeIn.value == refundFeeOut.value &&
    refundFeeOut.value >= 1000000L &&
    refundFeeOut.value <= 2100000L
  val timeoutElapsed =
    HEIGHT >= SELF.creationInfo._1 + escapeTimeout
  val refund =
    refundShape &&
    intentOk &&
    timeoutElapsed &&
    refundOut.propositionBytes == depositorTree &&
    refundOut.value == SELF.value &&
    refundOut.tokens.size == 0 &&
    refundSourceBoxId == SELF.id &&
    refundFeeOk

  sigmaProp(commitToReserve || refund)
}
