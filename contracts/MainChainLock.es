{
  // MainChainLock v3 - refundable deposit staging for peg-in (Ergo -> Sidechain)
  //
  // Register layout:
  //   R4: Coll[Byte] - target EVM H160 address (20 bytes)
  //   R5: Long       - user-declared amount (informational; mint uses SELF.value)
  //   R6: Coll[Byte] - legacy signer metadata
  //   R7: Coll[Byte] - depositor ErgoTree for timeout recovery
  //
  // A deposit remains refundable until the committee consumes this box into the
  // canonical V2 settlement vault. The relayer may mint only after observing
  // that exact committed output as canonical and sufficiently confirmed.

  val targetEvmAddress = SELF.R4[Coll[Byte]].getOrElse(Coll[Byte]())
  val depositorTree = SELF.R7[Coll[Byte]].get
  val settlementVaultTree = fromBase16("SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER")
  val committee = Coll(
    COMMITTEE_SIGMAPROP_PLACEHOLDERS
  )
  val committeeOk = atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)

  // NORMAL PATH: the full pure-ERG deposit moves to OUTPUTS(0). A separate
  // fee input funds the miner fee, so no deposit value can disappear here.
  // The vault registers preserve source identity and mint bindings.
  val vaultOut = OUTPUTS(0)
  val vaultR4 = vaultOut.R4[Coll[Byte]]
  val vaultR5 = vaultOut.R5[Coll[Byte]]
  val vaultR6 = vaultOut.R6[Long]
  val vaultR7 = vaultOut.R7[Coll[Byte]]
  val depositShapeOk =
    SELF.tokens.size == 0 &&
    targetEvmAddress.size == 20 &&
    depositorTree.size > 0
  val vaultTransition =
    if (vaultR4.isDefined && vaultR5.isDefined && vaultR6.isDefined && vaultR7.isDefined) {
      depositShapeOk &&
      vaultOut.propositionBytes == settlementVaultTree &&
      vaultOut.value == SELF.value &&
      vaultOut.tokens.size == 0 &&
      vaultR4.get == SELF.id &&
      vaultR5.get == targetEvmAddress &&
      vaultR6.get == SELF.value &&
      vaultR7.get == depositorTree
    } else false
  val committeeSpend = sigmaProp(vaultTransition) && committeeOk

  // EMERGENCY PATH: while SELF is still unspent, anyone may return the deposit
  // to R7 after the timeout. Once the normal transition consumes SELF, this
  // branch no longer exists and therefore cannot be used after mint.
  val ESCAPE_TIMEOUT = 10000
  val escapeTimeElapsed = HEIGHT >= SELF.creationInfo._1 + ESCAPE_TIMEOUT
  val escapeOutput = OUTPUTS(0)
  val escapeToDepositor = escapeOutput.propositionBytes == depositorTree
  val escapeAmountCorrect = escapeOutput.value >= SELF.value - 1100000L
  val emergencyEscape = escapeTimeElapsed && escapeToDepositor && escapeAmountCorrect

  committeeSpend || sigmaProp(emergencyEscape)
}
