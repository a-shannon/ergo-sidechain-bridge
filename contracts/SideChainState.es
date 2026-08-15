{
  // Phase 010a: on-chain committee authorization
  // Sidechain state singleton — tracks the canonical sidechain block state on Ergo L1
  //
  // Register layout:
  //   R4: Long         — Sidechain block height
  //   R5: Coll[Byte]   — Transaction digest T_h (blake2b256 of sidechain block txs)
  //   R6: Coll[Byte]   — UTXO set digest U_h (sidechain state root)
  //   R7: Coll[Byte]   — Chain digest C_h (AVL+ tree of all historical states)
  //   R8: Int           — Ergo mainchain HEIGHT at last update
  //   R9: SigmaProp     — Authorization metadata
  //
  // Token: tokens(0) = Singleton NFT identifying this box
  //
  // Spending condition: Only the committee can update state, once per Ergo block,
  // with monotonically increasing sidechain height.

  val committee = Coll(
    COMMITTEE_SIGMAPROP_PLACEHOLDERS
  )
  val committeeOk = atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)
  val authMetadata = SELF.R9[SigmaProp].get

  val successor = OUTPUTS(0)

  // State must advance monotonically
  val heightAdvances = successor.R4[Long].get > SELF.R4[Long].get

  // Singleton NFT preserved
  val preserveNFT = successor.tokens(0)._1 == SELF.tokens(0)._1

  // Same contract continues
  val preserveContract = successor.propositionBytes == SELF.propositionBytes

  // Stamp must not be in the future relative to the mining block
  // (fixes Mempool Expiration Trap — TX survives indefinitely in mempool)
  val stampHeight = successor.R8[Int].get <= HEIGHT

  // R8 must advance monotonically (prevents replay with stale stamps)
  val timeAdvances = successor.R8[Int].get > SELF.R8[Int].get

  // Only one update per Ergo block (prevents rapid-fire state spam)
  val oneUpdatePerBlock = HEIGHT > SELF.R8[Int].get

  // Preserve authorization metadata in successor
  val preserveAuthMetadata = successor.R9[SigmaProp].get == authMetadata

  // Minimum ERG preserved (storage rent protection)
  val preserveValue = successor.value >= SELF.value

  sigmaProp(
    heightAdvances &&
    preserveNFT &&
    preserveContract &&
    stampHeight &&
    timeAdvances &&
    oneUpdatePerBlock &&
    preserveAuthMetadata &&
    preserveValue
  ) && committeeOk
}
