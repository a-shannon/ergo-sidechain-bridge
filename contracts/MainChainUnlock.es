{
  // MainChainUnlock v2 - transitional, committee-authorized peg-out release.
  //
  // This contract does not prove that the sidechain burn is canonical. Until
  // Gate 5 supplies an Ergo-verifiable burn/finality proof, the committee must
  // revalidate the complete burn receipt before authorizing this spend.
  // SideChainState height is only an additional delay; it is not burn proof.
  //
  // Register layout:
  //   R4: Coll[Byte] - sidechain burn transaction hash metadata (32 bytes)
  //   R5: Long       - exact amount to unlock (nanoERG)
  //   R6: Coll[Byte] - recipient ErgoTree bytes
  //   R7: Long       - sidechain height at the burn event
  //   R8: Long       - creation height on Ergo (historical metadata)
  //   R9: SigmaProp  - legacy signer metadata
  //
  // There is deliberately no Ergo-height timeout. Existing v1 MCU boxes are
  // immutable and must be inventoried separately; deploying this source cannot
  // make those legacy boxes safe.
  // R4 is not consumed by this predicate and is not an on-chain burn proof.
  // No active builder may use this source until exact off-chain receipt binding
  // is reviewed; Gate 5 replaces that policy boundary with proof acceptance.

  val unlockAmount = SELF.R5[Long].get
  val recipientTree = SELF.R6[Coll[Byte]].get
  val burnHeight = SELF.R7[Long].get

  val sideChainStateNftId = fromBase16("SCS_NFT_ID_PLACEHOLDER")
  val committee = Coll(
    COMMITTEE_SIGMAPROP_PLACEHOLDERS
  )
  val committeeOk = atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)

  val hasStateInput = CONTEXT.dataInputs.size > 0
  val authorizedPayout = if (hasStateInput) {
    val stateBox = CONTEXT.dataInputs(0)
    val hasStateNft = stateBox.tokens.size > 0
    val stateBoxOk =
      hasStateNft &&
      stateBox.tokens(0)._1 == sideChainStateNftId
    val confirmationDepth = 50L
    val currentSidechainHeight = stateBox.R4[Long].get
    val confirmationsOk =
      currentSidechainHeight >= burnHeight + confirmationDepth

    val payout = OUTPUTS(0)
    val payoutOk =
      payout.propositionBytes == recipientTree &&
      payout.value == unlockAmount &&
      payout.tokens.size == 0

    SELF.tokens.size == 0 &&
      unlockAmount > 0L &&
      recipientTree.size > 0 &&
      stateBoxOk &&
      confirmationsOk &&
      payoutOk
  } else false

  sigmaProp(authorizedPayout) && committeeOk
}
