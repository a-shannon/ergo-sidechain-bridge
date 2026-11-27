{
  // BridgeDepositLock (V1)
  //
  // Refundable native-ERG peg-in staging contract for one V1 bridge family.
  //
  // Registers:
  //   R4: Coll[Byte] - exact 229-byte Peg-In Source Intent V2
  //   R5: Coll[Byte] - exact depositor ErgoTree for timeout recovery
  //
  // Branch 1 (commitToReserve, permissionless before escapeTimeout):
  //   DATA_INPUTS: none
  //   INPUTS(0):   BridgeReserve predecessor (reserveNftId, R4 == familyId)
  //   INPUTS(1):   SELF
  //   INPUTS(2):   external pure-ERG fee input
  //   OUTPUTS(0):  BridgeReserve successor (+amount ERG, +amount liability)
  //   OUTPUTS(1):  miner fee (1..5 mERG)
  //   OUTPUTS(2):  optional pure-ERG fee change (non-protocol script)
  //
  // Branch 2 (refund, permissionless at or after escapeTimeout):
  //   DATA_INPUTS: none
  //   INPUTS(0):   SELF
  //   INPUTS(1):   external pure-ERG fee input
  //   OUTPUTS(0):  depositorTree (exact SELF.value, R4 == SELF.id)
  //   OUTPUTS(1):  miner fee (1..5 mERG)
  //   OUTPUTS(2):  optional pure-ERG fee change (non-protocol script)
  //   Note: R4 is NOT read on the refund branch so a depositor whose box carries
  //         a malformed or wrong-typed R4 can still recover funds after timeout.

  val sourceNetworkId =
    fromBase16("BRIDGE_V1_SOURCE_NETWORK_ID_PLACEHOLDER")
  val sidechainId =
    fromBase16("BRIDGE_V1_SIDECHAIN_ID_PLACEHOLDER")
  val bridgeAddress =
    fromBase16("BRIDGE_V1_BRIDGE_ADDRESS_PLACEHOLDER")
  val tokenAddress =
    fromBase16("BRIDGE_V1_TOKEN_ADDRESS_PLACEHOLDER")
  val familyId =
    fromBase16("BRIDGE_V1_FAMILY_ID_PLACEHOLDER")
  val reserveNftId =
    fromBase16("BRIDGE_V1_RESERVE_NFT_ID_PLACEHOLDER")
  val escapeTimeout = BRIDGE_V1_ESCAPE_TIMEOUT_PLACEHOLDER
  val minDepositNanoErg = BRIDGE_V1_MIN_DEPOSIT_NANOERG_PLACEHOLDER

  val minerFeeTree =
    fromBase16("1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304")
  val zero32 =
    fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero20 =
    fromBase16("0000000000000000000000000000000000000000")
  val zero8 =
    Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte,
      0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val minMinerFee = 1000000L
  val maxMinerFee = 5000000L
  val minChangeValue = 1000000L

  val depositorTree = SELF.R5[Coll[Byte]].getOrElse(Coll[Byte]())
  val normalShape =
    CONTEXT.dataInputs.size == 0 &&
    INPUTS.size == 3 &&
    (OUTPUTS.size == 2 || OUTPUTS.size == 3) &&
    SELF.id == INPUTS(1).id
  val refundShape =
    CONTEXT.dataInputs.size == 0 &&
    INPUTS.size == 2 &&
    (OUTPUTS.size == 2 || OUTPUTS.size == 3) &&
    SELF.id == INPUTS(0).id

  if (normalShape) {
    val sourceIntent = SELF.R4[Coll[Byte]].getOrElse(Coll[Byte]())
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
      sourceIntent.slice(105, 137) == familyId &&
      sourceIntent.slice(137, 169) == reserveNftId &&
      sourceIntent.slice(169, 201) == zero32 &&
      sourceAmount >= minDepositNanoErg &&
      sourceAmount == SELF.value &&
      sourceIntent.slice(209, 229) != zero20 &&
      depositorTree.size > 0 &&
      SELF.tokens.size == 0

    val reserveIn = INPUTS(0)
    val reserveOut = OUTPUTS(0)
    val normalFeeIn = INPUTS(2)
    val normalFeeOut = OUTPUTS(1)
    val normalHasChange = OUTPUTS.size == 3
    val normalChangeOut = if (normalHasChange) OUTPUTS(2) else SELF

    val reserveLiability = reserveIn.R6[Long].getOrElse(-1L)
    val successorLiability = reserveOut.R6[Long].getOrElse(-1L)
    val reserveFamilyOk =
      reserveIn.R4[Coll[Byte]].getOrElse(Coll[Byte]()) == familyId &&
      reserveOut.R4[Coll[Byte]].getOrElse(Coll[Byte]()) == familyId
    val reserveNftOk =
      reserveIn.tokens.size == 1 &&
      reserveOut.tokens.size == 1 &&
      reserveIn.tokens(0)._1 == reserveNftId &&
      reserveIn.tokens(0)._2 == 1L &&
      reserveOut.tokens(0)._1 == reserveNftId &&
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
    val normalFeeBaseOk =
      normalFeeIn.tokens.size == 0 &&
      normalFeeIn.propositionBytes != SELF.propositionBytes &&
      normalFeeOut.tokens.size == 0 &&
      normalFeeOut.propositionBytes == minerFeeTree &&
      normalFeeOut.value >= minMinerFee &&
      normalFeeOut.value <= maxMinerFee
    val normalFeeBalanceOk =
      if (normalHasChange) {
        normalFeeIn.value > normalFeeOut.value &&
        normalChangeOut.tokens.size == 0 &&
        normalChangeOut.value >= minChangeValue &&
        normalChangeOut.value == normalFeeIn.value - normalFeeOut.value &&
        normalChangeOut.propositionBytes != SELF.propositionBytes &&
        normalChangeOut.propositionBytes != reserveIn.propositionBytes &&
        normalChangeOut.propositionBytes != minerFeeTree
      } else {
        normalFeeIn.value == normalFeeOut.value
      }
    val commitWindowOpen =
      HEIGHT < SELF.creationInfo._1 + escapeTimeout

    sigmaProp(
      intentOk &&
      commitWindowOpen &&
      reserveFamilyOk &&
      reserveNftOk &&
      reserveStateOk &&
      reserveAdditionSafe &&
      reserveTransitionOk &&
      normalFeeBaseOk &&
      normalFeeBalanceOk
    )
  } else if (refundShape) {
    val refundOut = OUTPUTS(0)
    val refundFeeIn = INPUTS(1)
    val refundFeeOut = OUTPUTS(1)
    val refundHasChange = OUTPUTS.size == 3
    val refundChangeOut = if (refundHasChange) OUTPUTS(2) else SELF
    val refundSourceBoxId =
      refundOut.R4[Coll[Byte]].getOrElse(Coll[Byte]())
    val refundFeeBaseOk =
      refundFeeIn.tokens.size == 0 &&
      refundFeeIn.propositionBytes != SELF.propositionBytes &&
      refundFeeOut.tokens.size == 0 &&
      refundFeeOut.propositionBytes == minerFeeTree &&
      refundFeeOut.value >= minMinerFee &&
      refundFeeOut.value <= maxMinerFee
    val refundFeeBalanceOk =
      if (refundHasChange) {
        refundFeeIn.value > refundFeeOut.value &&
        refundChangeOut.tokens.size == 0 &&
        refundChangeOut.value >= minChangeValue &&
        refundChangeOut.value == refundFeeIn.value - refundFeeOut.value &&
        refundChangeOut.propositionBytes != SELF.propositionBytes &&
        refundChangeOut.propositionBytes != minerFeeTree
      } else {
        refundFeeIn.value == refundFeeOut.value
      }
    val timeoutElapsed =
      HEIGHT >= SELF.creationInfo._1 + escapeTimeout

    sigmaProp(
      SELF.tokens.size == 0 &&
      depositorTree.size > 0 &&
      timeoutElapsed &&
      refundOut.propositionBytes == depositorTree &&
      refundOut.value == SELF.value &&
      refundOut.tokens.size == 0 &&
      refundSourceBoxId == SELF.id &&
      refundFeeBaseOk &&
      refundFeeBalanceOk
    )
  } else {
    sigmaProp(false)
  }
}
