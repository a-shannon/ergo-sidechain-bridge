{
  // DoubleUnlockPreventionAuthenticatedExternalFeeV1
  //
  // Replay protection for the separately versioned external-fee settlement
  // profile. The tracker remains read-only at CONTEXT.dataInputs(0), this
  // singleton is INPUTS(0), the exact settlement vault is INPUTS(1), and the
  // token-free external fee box is INPUTS(2). The unlock script independently
  // derives and inserts the same burnId into this tree. This script also
  // independently enforces exact DUP value preservation and fee neutrality.
  // This profile is not activated and does not claim trustless settlement.
  //
  // Registers:
  //   R4: Long      operation counter
  //   R5: AvlTree   spent burn IDs (key=32, value=1)
  //   R6: SigmaProp retained authorization metadata
  //
  // ContextExtension:
  //   Var(0): Coll[Byte] non-membership lookup proof
  //   Var(1): Coll[Byte] canonical burnId (32 bytes)
  //   Var(2): Coll[Byte] insert proof

  val trackerNftId = fromBase16("TRACKER_NFT_ID_PLACEHOLDER")
  val unlockErgoTreeHash = fromBase16("AUTHENTICATED_EXTERNAL_FEE_UNLOCK_HASH_PLACEHOLDER")
  val minerFeeTree = fromBase16("1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304")

  val successor = OUTPUTS(0)
  val externalFeeIn = INPUTS(2)
  val minerFeeOut = OUTPUTS(OUTPUTS.size - 1)
  val spentIdsTree = SELF.R5[AvlTree].get
  val authMetadata = SELF.R6[SigmaProp].get
  val lookupProof = getVar[Coll[Byte]](0).get
  val burnId = getVar[Coll[Byte]](1).get
  val insertProof = getVar[Coll[Byte]](2).get

  val notSpent = spentIdsTree.get(burnId, lookupProof).isEmpty
  val modifiedTree = spentIdsTree.insert(Coll((burnId, Coll(1.toByte))), insertProof).get

  val trackerDataShapeOk = CONTEXT.dataInputs.size == 1
  val tracker = if (trackerDataShapeOk) CONTEXT.dataInputs(0) else SELF
  val trackerNftOk =
    tracker.tokens.size == 1 &&
    tracker.tokens(0)._1 == trackerNftId &&
    tracker.tokens(0)._2 == 1L
  val transactionBindingOk =
    INPUTS.size == 3 &&
    SELF.id == INPUTS(0).id &&
    blake2b256(INPUTS(1).propositionBytes) == unlockErgoTreeHash
  val externalFeeOk =
    (OUTPUTS.size == 3 || OUTPUTS.size == 4) &&
    externalFeeIn.tokens.size == 0 &&
    minerFeeOut.propositionBytes == minerFeeTree &&
    minerFeeOut.tokens.size == 0 &&
    externalFeeIn.value == minerFeeOut.value &&
    minerFeeOut.value >= 1000000L &&
    minerFeeOut.value <= 2100000L

  val preserveNft =
    SELF.tokens.size == 1 &&
    successor.tokens.size == 1 &&
    SELF.tokens(0)._2 == 1L &&
    successor.tokens(0)._1 == SELF.tokens(0)._1 &&
    successor.tokens(0)._2 == 1L
  val preserveContract = successor.propositionBytes == SELF.propositionBytes
  val counterAdvances = successor.R4[Long].get == SELF.R4[Long].get + 1L
  val treeAdvances = successor.R5[AvlTree].get == modifiedTree
  val preserveAuthMetadata = successor.R6[SigmaProp].get == authMetadata
  val preserveValue = successor.value == SELF.value

  sigmaProp(
    trackerDataShapeOk &&
    trackerNftOk &&
    transactionBindingOk &&
    externalFeeOk &&
    burnId.size == 32 &&
    lookupProof.size > 0 &&
    insertProof.size > 0 &&
    notSpent &&
    preserveNft &&
    preserveContract &&
    counterAdvances &&
    treeAdvances &&
    preserveAuthMetadata &&
    preserveValue
  )
}
