{
  // MainChainLockCausalV2 - refundable ERG staging for a canonical V2 intent.
  //
  // Register layout:
  //   R4: Coll[Byte] - exact 229-byte Peg-In Source Intent V2
  //   R5: Coll[Byte] - depositor ErgoTree for timeout recovery
  //
  // The normal path consumes this refundable box into the exact causal vault.
  // The committee is a transitional profile-activation guard only: mint still
  // requires the separately authenticated causal admission and runtime state
  // transition. Once this box is consumed, its refund branch no longer exists.

  val sourceIntent = SELF.R4[Coll[Byte]].getOrElse(Coll[Byte]())
  val depositorTree = SELF.R5[Coll[Byte]].getOrElse(Coll[Byte]())
  val sourceNetworkId = fromBase16("CAUSAL_SOURCE_NETWORK_ID_HEX_PLACEHOLDER")
  val causalVaultTree = fromBase16("CAUSAL_SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER")
  val zero32 = fromBase16("0000000000000000000000000000000000000000000000000000000000000000")
  val zero20 = fromBase16("0000000000000000000000000000000000000000")

  val intentShapeOk = sourceIntent.size == 229
  val sourceAmountBytes =
    if (intentShapeOk) sourceIntent.slice(201, 209)
    else Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val sourceAmount = byteArrayToLong(sourceAmountBytes)
  val intentOk =
    intentShapeOk &&
    sourceIntent.slice(0, 1) == Coll(2.toByte) &&
    sourceIntent.slice(1, 33) == sourceNetworkId &&
    sourceIntent.slice(33, 65) != zero32 &&
    sourceIntent.slice(65, 85) != zero20 &&
    sourceIntent.slice(85, 105) != zero20 &&
    sourceIntent.slice(105, 137) != zero32 &&
    sourceIntent.slice(137, 169) != zero32 &&
    sourceIntent.slice(169, 201) == zero32 &&
    sourceAmount > 0L &&
    sourceAmount == SELF.value &&
    sourceIntent.slice(209, 229) != zero20 &&
    depositorTree.size > 0 &&
    SELF.tokens.size == 0

  val committee = Coll(
    COMMITTEE_SIGMAPROP_PLACEHOLDERS
  )
  val committeeOk = atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)
  val ESCAPE_TIMEOUT = 10000
  val commitWindowOpen = HEIGHT < SELF.creationInfo._1 + ESCAPE_TIMEOUT

  // NORMAL PATH: a separate input funds the miner fee, so all staged ERG and
  // the exact intent move to OUTPUTS(0). R5 makes the consumed source box part
  // of the persistent vault identity.
  val hasOutput = OUTPUTS.size > 0
  val vaultOut = if (hasOutput) OUTPUTS(0) else SELF
  val vaultIntent = vaultOut.R4[Coll[Byte]]
  val vaultSourceBoxId = vaultOut.R5[Coll[Byte]]
  val vaultTransition =
    if (hasOutput && vaultIntent.isDefined && vaultSourceBoxId.isDefined) {
      intentOk &&
      vaultOut.propositionBytes == causalVaultTree &&
      vaultOut.value == SELF.value &&
      vaultOut.tokens.size == 0 &&
      vaultIntent.get == sourceIntent &&
      vaultSourceBoxId.get == SELF.id
    } else false
  val committeeSpend = sigmaProp(vaultTransition && commitWindowOpen) && committeeOk

  // REFUND PATH: anyone may execute the refund after the timeout, but the
  // complete staged value must return to the exact depositor ErgoTree. A
  // separate input therefore funds the fee here as well.
  val escapeTimeElapsed = HEIGHT >= SELF.creationInfo._1 + ESCAPE_TIMEOUT
  val escapeOutput = if (hasOutput) OUTPUTS(0) else SELF
  val escapeSourceBoxId = escapeOutput.R4[Coll[Byte]]
  val emergencyEscape =
    if (hasOutput && escapeSourceBoxId.isDefined) {
      intentOk &&
      escapeTimeElapsed &&
      escapeOutput.propositionBytes == depositorTree &&
      escapeOutput.value == SELF.value &&
      escapeOutput.tokens.size == 0 &&
      escapeSourceBoxId.get == SELF.id
    } else false

  committeeSpend || sigmaProp(emergencyEscape)
}
