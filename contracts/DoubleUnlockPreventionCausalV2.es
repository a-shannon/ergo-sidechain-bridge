{
  // DoubleUnlockPreventionCausalV2
  //
  // Replay protection dedicated to MainChainCausalVaultV2. This is a new
  // singleton profile: the existing authenticated DUP ErgoTree is bound to a
  // different unlock hash and cannot be reused by changing deployment labels.
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
  val unlockErgoTreeHash = fromBase16("CAUSAL_VAULT_ERGOTREE_HASH_PLACEHOLDER")

  val successor = OUTPUTS(0)
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
    INPUTS.size == 2 &&
    SELF.id == INPUTS(0).id &&
    blake2b256(INPUTS(1).propositionBytes) == unlockErgoTreeHash

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
  val preserveValue = successor.value >= SELF.value

  sigmaProp(
    trackerDataShapeOk &&
    trackerNftOk &&
    transactionBindingOk &&
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
