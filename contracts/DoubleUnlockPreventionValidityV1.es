{
  // DoubleUnlockPreventionValidityV1
  //
  // Committee-free replay protection for MainChainCausalVaultValidityV1.
  // The tracker is a read-only data input; this singleton and the exact
  // hash-bound causal vault must agree on one complete AVL successor. The
  // third spending input funds the fee and is constrained by the vault.
  //
  // Registers:
  //   R4: Long       operation counter
  //   R5: AvlTree    spent burn IDs (key=32, value=1)
  //   R6: Coll[Byte] immutable ValiditySettlementProfileV1 ID
  //
  // ContextExtension:
  //   Var(0): Coll[Byte] non-membership lookup proof
  //   Var(1): Coll[Byte] canonical burnId (32 bytes)
  //   Var(2): Coll[Byte] insert proof

  val trackerNftId = fromBase16("TRACKER_NFT_ID_PLACEHOLDER")
  val dupNftId = fromBase16("DUP_NFT_ID_PLACEHOLDER")
  val trackerContractId = fromBase16("VALIDITY_TRACKER_CONTRACT_ID_PLACEHOLDER")
  val sidechainProfileId = fromBase16("VALIDITY_SIDECHAIN_ID_PLACEHOLDER")
  val settlementProfileId = fromBase16("VALIDITY_SETTLEMENT_PROFILE_ID_PLACEHOLDER")
  val approvedTrustAnchorDigest =
    fromBase16("VALIDITY_TRUST_ANCHOR_DIGEST_PLACEHOLDER")
  val unlockErgoTreeHash =
    fromBase16("VALIDITY_CAUSAL_VAULT_ERGOTREE_HASH_PLACEHOLDER")
  val maxSuccessorCreationHeightLag = 100

  val successor = OUTPUTS(0)
  val spentIdsTree = SELF.R5[AvlTree].get
  val profileId = SELF.R6[Coll[Byte]].get
  val lookupProof = getVar[Coll[Byte]](0).get
  val burnId = getVar[Coll[Byte]](1).get
  val insertProof = getVar[Coll[Byte]](2).get

  val notSpent = spentIdsTree.get(burnId, lookupProof).isEmpty
  val modifiedTree =
    spentIdsTree.insert(Coll((burnId, Coll(1.toByte))), insertProof).get

  val trackerDataShapeOk = CONTEXT.dataInputs.size == 1
  val tracker = if (trackerDataShapeOk) CONTEXT.dataInputs(0) else SELF
  val trackerNftOk =
    tracker.tokens.size == 1 &&
    tracker.tokens(0)._1 == trackerNftId &&
    tracker.tokens(0)._2 == 1L
  val trackerProfileOk =
    blake2b256(tracker.propositionBytes) == trackerContractId &&
    tracker.R6[Coll[Byte]].get == sidechainProfileId &&
    tracker.R9[Coll[Byte]].get == approvedTrustAnchorDigest
  val transactionBindingOk =
    INPUTS.size == 3 &&
    SELF.id == INPUTS(0).id &&
    blake2b256(INPUTS(1).propositionBytes) == unlockErgoTreeHash

  val preserveNft =
    SELF.tokens.size == 1 &&
    successor.tokens.size == 1 &&
    SELF.tokens(0)._1 == dupNftId &&
    SELF.tokens(0)._2 == 1L &&
    successor.tokens(0)._1 == dupNftId &&
    successor.tokens(0)._2 == 1L
  val preserveContract = successor.propositionBytes == SELF.propositionBytes
  val preserveCreationHeight =
    successor.creationInfo._1 >= SELF.creationInfo._1 &&
    successor.creationInfo._1 <= HEIGHT &&
    successor.creationInfo._1 >= HEIGHT - maxSuccessorCreationHeightLag
  val counterAdvances = successor.R4[Long].get == SELF.R4[Long].get + 1L
  val treeAdvances = successor.R5[AvlTree].get == modifiedTree
  val preserveProfile =
    profileId == settlementProfileId &&
    successor.R6[Coll[Byte]].get == settlementProfileId
  val preserveValue = successor.value == SELF.value

  sigmaProp(
    trackerDataShapeOk &&
    trackerNftOk &&
    trackerProfileOk &&
    transactionBindingOk &&
    burnId.size == 32 &&
    lookupProof.size > 0 &&
    insertProof.size > 0 &&
    notSpent &&
    preserveNft &&
    preserveContract &&
    preserveCreationHeight &&
    counterAdvances &&
    treeAdvances &&
    preserveProfile &&
    preserveValue
  )
}
