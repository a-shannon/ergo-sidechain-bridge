{
  // MainChainAggregateUnlockBatch
  //
  // Fixed-max batched payout guard for Phase 011a multi-claim aggregate settlement.
  // Supports 1 to MAX_CLAIMS = 10 peg-out payouts in a single aggregate TX.
  // (Capped at 10 due to the 4KB ErgoTree box limit — inline per-claim verification
  // is ~350 bytes/claim, so 10 claims ≈ 3.5KB which is the practical ceiling.)
  //
  // Transaction shape:
  //   INPUTS(0):  SPVTracker singleton
  //   INPUTS(1):  DoubleUnlockPreventionAggregateBatch singleton
  //   INPUTS(2+): this unlock box(es)
  //   OUTPUTS(0): SPVTracker successor
  //   OUTPUTS(1): DUP successor
  //   OUTPUTS(2..2+count-1): payout outputs
  //
  // Placeholder constants (patched at deploy/spike time):
  //   TRACKER_NFT_ID_PLACEHOLDER
  //   DUP_NFT_ID_PLACEHOLDER
  //
  // Context extensions (packed per-claim layout):
  //   Var(0):  Int          - active claim count (1 <= count <= 10)
  //   Var(1):  Coll[Byte]   - batched DUP insert proof
  //
  //   Per claim i (0..9):
  //     Var(2 + i):      Coll[Byte] - claimCore_i (109 bytes packed):
  //       trackerKey(32) || burnTxId(32) || amountBytes(8) || recipientTree(36) || trackerTreeSelector(1)
  //     Var(12 + i):     Coll[Byte] - trackerProof_i (variable size)
  //     Var(22 + i):     Coll[Byte] - dupLookupProof_i (variable size)
  //
  //   Total: 2 + 3*10 = 32 Var slots max.

  val trackerNftId = fromBase16("TRACKER_NFT_ID_PLACEHOLDER")
  val dupNftId = fromBase16("DUP_NFT_ID_PLACEHOLDER")

  val trackerIn = INPUTS(0)
  val trackerOut = OUTPUTS(0)
  val dupIn = INPUTS(1)
  val dupOut = OUTPUTS(1)

  val count = getVar[Int](0).get
  val batchedDupInsertProof = getVar[Coll[Byte]](1).get

  val trackerNftOk =
    if (trackerIn.tokens.size > 0 && trackerOut.tokens.size > 0)
      trackerIn.tokens(0)._1 == trackerNftId &&
      trackerOut.tokens(0)._1 == trackerNftId
    else false

  val dupNftOk =
    if (dupIn.tokens.size > 0 && dupOut.tokens.size > 0)
      dupIn.tokens(0)._1 == dupNftId &&
      dupOut.tokens(0)._1 == dupNftId
    else false

  val countOk = count >= 1 && count <= 10

  val domain = Coll(
    69.toByte, 50.toByte, 83.toByte, 95.toByte, 66.toByte, 85.toByte,
    82.toByte, 78.toByte, 95.toByte, 86.toByte, 49.toByte
  )
  val minConf = 10
  val zeroPad = Coll(0.toByte, 0.toByte, 0.toByte, 0.toByte)
  val marker = Coll(1.toByte)
  val tInTree = trackerIn.R5[AvlTree].get
  val tOutTree = trackerOut.R5[AvlTree].get
  val dupTree = dupIn.R5[AvlTree].get

  // Read packed claim cores (Var 2..11), tracker proofs (Var 12..21), DUP lookup proofs (Var 22..31)
  val c0  = getVar[Coll[Byte]](2).getOrElse(Coll[Byte]())
  val c1  = getVar[Coll[Byte]](3).getOrElse(Coll[Byte]())
  val c2  = getVar[Coll[Byte]](4).getOrElse(Coll[Byte]())
  val c3  = getVar[Coll[Byte]](5).getOrElse(Coll[Byte]())
  val c4  = getVar[Coll[Byte]](6).getOrElse(Coll[Byte]())
  val c5  = getVar[Coll[Byte]](7).getOrElse(Coll[Byte]())
  val c6  = getVar[Coll[Byte]](8).getOrElse(Coll[Byte]())
  val c7  = getVar[Coll[Byte]](9).getOrElse(Coll[Byte]())
  val c8  = getVar[Coll[Byte]](10).getOrElse(Coll[Byte]())
  val c9  = getVar[Coll[Byte]](11).getOrElse(Coll[Byte]())

  val tp0  = getVar[Coll[Byte]](12).getOrElse(Coll[Byte]())
  val tp1  = getVar[Coll[Byte]](13).getOrElse(Coll[Byte]())
  val tp2  = getVar[Coll[Byte]](14).getOrElse(Coll[Byte]())
  val tp3  = getVar[Coll[Byte]](15).getOrElse(Coll[Byte]())
  val tp4  = getVar[Coll[Byte]](16).getOrElse(Coll[Byte]())
  val tp5  = getVar[Coll[Byte]](17).getOrElse(Coll[Byte]())
  val tp6  = getVar[Coll[Byte]](18).getOrElse(Coll[Byte]())
  val tp7  = getVar[Coll[Byte]](19).getOrElse(Coll[Byte]())
  val tp8  = getVar[Coll[Byte]](20).getOrElse(Coll[Byte]())
  val tp9  = getVar[Coll[Byte]](21).getOrElse(Coll[Byte]())

  val dlp0  = getVar[Coll[Byte]](22).getOrElse(Coll[Byte]())
  val dlp1  = getVar[Coll[Byte]](23).getOrElse(Coll[Byte]())
  val dlp2  = getVar[Coll[Byte]](24).getOrElse(Coll[Byte]())
  val dlp3  = getVar[Coll[Byte]](25).getOrElse(Coll[Byte]())
  val dlp4  = getVar[Coll[Byte]](26).getOrElse(Coll[Byte]())
  val dlp5  = getVar[Coll[Byte]](27).getOrElse(Coll[Byte]())
  val dlp6  = getVar[Coll[Byte]](28).getOrElse(Coll[Byte]())
  val dlp7  = getVar[Coll[Byte]](29).getOrElse(Coll[Byte]())
  val dlp8  = getVar[Coll[Byte]](30).getOrElse(Coll[Byte]())
  val dlp9  = getVar[Coll[Byte]](31).getOrElse(Coll[Byte]())

  // Inline per-claim verification macro:
  // Each claimCore is 109 bytes:
  //   [0..32)   trackerKey
  //   [32..64)  burnTxId
  //   [64..72)  amountBytes
  //   [72..108) recipientTree
  //   [108]     trackerTreeSelector (0=trackerIn, 1=trackerOut)

  val claimsOk = {
    val ok0 = if (count < 1) true else {
      val selTree = if (c0(108) == 1.toByte) tOutTree else tInTree
      val tv = selTree.get(c0.slice(0,32), tp0).get
      c0.size == 109 && tv.size == 36 &&
      (c0(108) == 0.toByte || c0(108) == 1.toByte) &&
      (HEIGHT - byteArrayToLong(zeroPad ++ tv.slice(32,36)).toInt >= minConf) &&
      tv.slice(0,32) == blake2b256(domain ++ c0.slice(32,64) ++ c0.slice(72,108) ++ c0.slice(64,72)) &&
      dupTree.get(c0.slice(32,64), dlp0).isEmpty &&
      OUTPUTS(2).propositionBytes == c0.slice(72,108) &&
      OUTPUTS(2).value >= byteArrayToLong(c0.slice(64,72))
    }
    val ok1 = if (count < 2) true else {
      val selTree = if (c1(108) == 1.toByte) tOutTree else tInTree
      val tv = selTree.get(c1.slice(0,32), tp1).get
      c1.size == 109 && tv.size == 36 &&
      (c1(108) == 0.toByte || c1(108) == 1.toByte) &&
      (HEIGHT - byteArrayToLong(zeroPad ++ tv.slice(32,36)).toInt >= minConf) &&
      tv.slice(0,32) == blake2b256(domain ++ c1.slice(32,64) ++ c1.slice(72,108) ++ c1.slice(64,72)) &&
      dupTree.get(c1.slice(32,64), dlp1).isEmpty &&
      OUTPUTS(3).propositionBytes == c1.slice(72,108) &&
      OUTPUTS(3).value >= byteArrayToLong(c1.slice(64,72))
    }
    val ok2 = if (count < 3) true else {
      val selTree = if (c2(108) == 1.toByte) tOutTree else tInTree
      val tv = selTree.get(c2.slice(0,32), tp2).get
      c2.size == 109 && tv.size == 36 &&
      (c2(108) == 0.toByte || c2(108) == 1.toByte) &&
      (HEIGHT - byteArrayToLong(zeroPad ++ tv.slice(32,36)).toInt >= minConf) &&
      tv.slice(0,32) == blake2b256(domain ++ c2.slice(32,64) ++ c2.slice(72,108) ++ c2.slice(64,72)) &&
      dupTree.get(c2.slice(32,64), dlp2).isEmpty &&
      OUTPUTS(4).propositionBytes == c2.slice(72,108) &&
      OUTPUTS(4).value >= byteArrayToLong(c2.slice(64,72))
    }
    val ok3 = if (count < 4) true else {
      val selTree = if (c3(108) == 1.toByte) tOutTree else tInTree
      val tv = selTree.get(c3.slice(0,32), tp3).get
      c3.size == 109 && tv.size == 36 &&
      (c3(108) == 0.toByte || c3(108) == 1.toByte) &&
      (HEIGHT - byteArrayToLong(zeroPad ++ tv.slice(32,36)).toInt >= minConf) &&
      tv.slice(0,32) == blake2b256(domain ++ c3.slice(32,64) ++ c3.slice(72,108) ++ c3.slice(64,72)) &&
      dupTree.get(c3.slice(32,64), dlp3).isEmpty &&
      OUTPUTS(5).propositionBytes == c3.slice(72,108) &&
      OUTPUTS(5).value >= byteArrayToLong(c3.slice(64,72))
    }
    val ok4 = if (count < 5) true else {
      val selTree = if (c4(108) == 1.toByte) tOutTree else tInTree
      val tv = selTree.get(c4.slice(0,32), tp4).get
      c4.size == 109 && tv.size == 36 &&
      (c4(108) == 0.toByte || c4(108) == 1.toByte) &&
      (HEIGHT - byteArrayToLong(zeroPad ++ tv.slice(32,36)).toInt >= minConf) &&
      tv.slice(0,32) == blake2b256(domain ++ c4.slice(32,64) ++ c4.slice(72,108) ++ c4.slice(64,72)) &&
      dupTree.get(c4.slice(32,64), dlp4).isEmpty &&
      OUTPUTS(6).propositionBytes == c4.slice(72,108) &&
      OUTPUTS(6).value >= byteArrayToLong(c4.slice(64,72))
    }
    val ok5 = if (count < 6) true else {
      val selTree = if (c5(108) == 1.toByte) tOutTree else tInTree
      val tv = selTree.get(c5.slice(0,32), tp5).get
      c5.size == 109 && tv.size == 36 &&
      (c5(108) == 0.toByte || c5(108) == 1.toByte) &&
      (HEIGHT - byteArrayToLong(zeroPad ++ tv.slice(32,36)).toInt >= minConf) &&
      tv.slice(0,32) == blake2b256(domain ++ c5.slice(32,64) ++ c5.slice(72,108) ++ c5.slice(64,72)) &&
      dupTree.get(c5.slice(32,64), dlp5).isEmpty &&
      OUTPUTS(7).propositionBytes == c5.slice(72,108) &&
      OUTPUTS(7).value >= byteArrayToLong(c5.slice(64,72))
    }
    val ok6 = if (count < 7) true else {
      val selTree = if (c6(108) == 1.toByte) tOutTree else tInTree
      val tv = selTree.get(c6.slice(0,32), tp6).get
      c6.size == 109 && tv.size == 36 &&
      (c6(108) == 0.toByte || c6(108) == 1.toByte) &&
      (HEIGHT - byteArrayToLong(zeroPad ++ tv.slice(32,36)).toInt >= minConf) &&
      tv.slice(0,32) == blake2b256(domain ++ c6.slice(32,64) ++ c6.slice(72,108) ++ c6.slice(64,72)) &&
      dupTree.get(c6.slice(32,64), dlp6).isEmpty &&
      OUTPUTS(8).propositionBytes == c6.slice(72,108) &&
      OUTPUTS(8).value >= byteArrayToLong(c6.slice(64,72))
    }
    val ok7 = if (count < 8) true else {
      val selTree = if (c7(108) == 1.toByte) tOutTree else tInTree
      val tv = selTree.get(c7.slice(0,32), tp7).get
      c7.size == 109 && tv.size == 36 &&
      (c7(108) == 0.toByte || c7(108) == 1.toByte) &&
      (HEIGHT - byteArrayToLong(zeroPad ++ tv.slice(32,36)).toInt >= minConf) &&
      tv.slice(0,32) == blake2b256(domain ++ c7.slice(32,64) ++ c7.slice(72,108) ++ c7.slice(64,72)) &&
      dupTree.get(c7.slice(32,64), dlp7).isEmpty &&
      OUTPUTS(9).propositionBytes == c7.slice(72,108) &&
      OUTPUTS(9).value >= byteArrayToLong(c7.slice(64,72))
    }
    val ok8 = if (count < 9) true else {
      val selTree = if (c8(108) == 1.toByte) tOutTree else tInTree
      val tv = selTree.get(c8.slice(0,32), tp8).get
      c8.size == 109 && tv.size == 36 &&
      (c8(108) == 0.toByte || c8(108) == 1.toByte) &&
      (HEIGHT - byteArrayToLong(zeroPad ++ tv.slice(32,36)).toInt >= minConf) &&
      tv.slice(0,32) == blake2b256(domain ++ c8.slice(32,64) ++ c8.slice(72,108) ++ c8.slice(64,72)) &&
      dupTree.get(c8.slice(32,64), dlp8).isEmpty &&
      OUTPUTS(10).propositionBytes == c8.slice(72,108) &&
      OUTPUTS(10).value >= byteArrayToLong(c8.slice(64,72))
    }
    val ok9 = if (count < 10) true else {
      val selTree = if (c9(108) == 1.toByte) tOutTree else tInTree
      val tv = selTree.get(c9.slice(0,32), tp9).get
      c9.size == 109 && tv.size == 36 &&
      (c9(108) == 0.toByte || c9(108) == 1.toByte) &&
      (HEIGHT - byteArrayToLong(zeroPad ++ tv.slice(32,36)).toInt >= minConf) &&
      tv.slice(0,32) == blake2b256(domain ++ c9.slice(32,64) ++ c9.slice(72,108) ++ c9.slice(64,72)) &&
      dupTree.get(c9.slice(32,64), dlp9).isEmpty &&
      OUTPUTS(11).propositionBytes == c9.slice(72,108) &&
      OUTPUTS(11).value >= byteArrayToLong(c9.slice(64,72))
    }
    ok0 && ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && ok7 && ok8 && ok9
  }

  // --- Build DUP insertion tuples from claimCores (burnTxId at offset 32..64) ---
  val b0  = (c0.slice(32, 64),  marker)
  val b1  = (c1.slice(32, 64),  marker)
  val b2  = (c2.slice(32, 64),  marker)
  val b3  = (c3.slice(32, 64),  marker)
  val b4  = (c4.slice(32, 64),  marker)
  val b5  = (c5.slice(32, 64),  marker)
  val b6  = (c6.slice(32, 64),  marker)
  val b7  = (c7.slice(32, 64),  marker)
  val b8  = (c8.slice(32, 64),  marker)
  val b9  = (c9.slice(32, 64),  marker)

  val dupToInsert =
    if (count == 1)  Coll(b0)
    else if (count == 2)  Coll(b0, b1)
    else if (count == 3)  Coll(b0, b1, b2)
    else if (count == 4)  Coll(b0, b1, b2, b3)
    else if (count == 5)  Coll(b0, b1, b2, b3, b4)
    else if (count == 6)  Coll(b0, b1, b2, b3, b4, b5)
    else if (count == 7)  Coll(b0, b1, b2, b3, b4, b5, b6)
    else if (count == 8)  Coll(b0, b1, b2, b3, b4, b5, b6, b7)
    else if (count == 9)  Coll(b0, b1, b2, b3, b4, b5, b6, b7, b8)
    else                  Coll(b0, b1, b2, b3, b4, b5, b6, b7, b8, b9)

  val dupModified = dupTree.insert(dupToInsert, batchedDupInsertProof).get
  val dupUpdated = dupOut.R5[AvlTree].get.digest == dupModified.digest

  sigmaProp(
    trackerNftOk &&
    dupNftOk &&
    countOk &&
    claimsOk &&
    dupUpdated
  )
}
