{
  // DoubleUnlockPreventionAggregateBatch
  //
  // Fixed-max batched DUP for aggregate settlement with up to MAX_CLAIMS = 20
  // simultaneous burn TX ID insertions in a single aggregate transaction.
  //
  // In the aggregate TX shape, OUTPUTS(0) is the SPVTracker successor,
  // OUTPUTS(1) is this DUP successor.
  //
  // Register layout:
  //   R4: Long      - operation counter
  //   R5: AvlTree   - spent sidechain burn TX IDs (key=32, value=1)
  //   R6: SigmaProp - authorization metadata
  //
  // Context extensions:
  //   Var(0): Int          - active claim count (1 <= count <= 20)
  //   Var(1): Coll[Byte]   - batched AVL insert proof (one proof for all active keys)
  //   Var(2)..Var(21):     - burn TX ID keys (32 bytes each), slot i = Var(2 + i)
  //   Var(22)..Var(41):    - AVL lookup proofs (non-membership), slot i = Var(22 + i)

  val committee = Coll(
    COMMITTEE_SIGMAPROP_PLACEHOLDERS
  )
  val committeeOk = atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)
  val authMetadata = SELF.R6[SigmaProp].get

  val spentIdsTree = SELF.R5[AvlTree].get
  val count = getVar[Int](0).get
  val insertProof = getVar[Coll[Byte]](1).get

  // Read all 20 key slots — inactive slots default to empty
  val key0  = getVar[Coll[Byte]](2).getOrElse(Coll[Byte]())
  val key1  = getVar[Coll[Byte]](3).getOrElse(Coll[Byte]())
  val key2  = getVar[Coll[Byte]](4).getOrElse(Coll[Byte]())
  val key3  = getVar[Coll[Byte]](5).getOrElse(Coll[Byte]())
  val key4  = getVar[Coll[Byte]](6).getOrElse(Coll[Byte]())
  val key5  = getVar[Coll[Byte]](7).getOrElse(Coll[Byte]())
  val key6  = getVar[Coll[Byte]](8).getOrElse(Coll[Byte]())
  val key7  = getVar[Coll[Byte]](9).getOrElse(Coll[Byte]())
  val key8  = getVar[Coll[Byte]](10).getOrElse(Coll[Byte]())
  val key9  = getVar[Coll[Byte]](11).getOrElse(Coll[Byte]())
  val key10 = getVar[Coll[Byte]](12).getOrElse(Coll[Byte]())
  val key11 = getVar[Coll[Byte]](13).getOrElse(Coll[Byte]())
  val key12 = getVar[Coll[Byte]](14).getOrElse(Coll[Byte]())
  val key13 = getVar[Coll[Byte]](15).getOrElse(Coll[Byte]())
  val key14 = getVar[Coll[Byte]](16).getOrElse(Coll[Byte]())
  val key15 = getVar[Coll[Byte]](17).getOrElse(Coll[Byte]())
  val key16 = getVar[Coll[Byte]](18).getOrElse(Coll[Byte]())
  val key17 = getVar[Coll[Byte]](19).getOrElse(Coll[Byte]())
  val key18 = getVar[Coll[Byte]](20).getOrElse(Coll[Byte]())
  val key19 = getVar[Coll[Byte]](21).getOrElse(Coll[Byte]())

  // Read all 20 lookup proof slots
  val lp0  = getVar[Coll[Byte]](22).getOrElse(Coll[Byte]())
  val lp1  = getVar[Coll[Byte]](23).getOrElse(Coll[Byte]())
  val lp2  = getVar[Coll[Byte]](24).getOrElse(Coll[Byte]())
  val lp3  = getVar[Coll[Byte]](25).getOrElse(Coll[Byte]())
  val lp4  = getVar[Coll[Byte]](26).getOrElse(Coll[Byte]())
  val lp5  = getVar[Coll[Byte]](27).getOrElse(Coll[Byte]())
  val lp6  = getVar[Coll[Byte]](28).getOrElse(Coll[Byte]())
  val lp7  = getVar[Coll[Byte]](29).getOrElse(Coll[Byte]())
  val lp8  = getVar[Coll[Byte]](30).getOrElse(Coll[Byte]())
  val lp9  = getVar[Coll[Byte]](31).getOrElse(Coll[Byte]())
  val lp10 = getVar[Coll[Byte]](32).getOrElse(Coll[Byte]())
  val lp11 = getVar[Coll[Byte]](33).getOrElse(Coll[Byte]())
  val lp12 = getVar[Coll[Byte]](34).getOrElse(Coll[Byte]())
  val lp13 = getVar[Coll[Byte]](35).getOrElse(Coll[Byte]())
  val lp14 = getVar[Coll[Byte]](36).getOrElse(Coll[Byte]())
  val lp15 = getVar[Coll[Byte]](37).getOrElse(Coll[Byte]())
  val lp16 = getVar[Coll[Byte]](38).getOrElse(Coll[Byte]())
  val lp17 = getVar[Coll[Byte]](39).getOrElse(Coll[Byte]())
  val lp18 = getVar[Coll[Byte]](40).getOrElse(Coll[Byte]())
  val lp19 = getVar[Coll[Byte]](41).getOrElse(Coll[Byte]())

  // Validate count range
  val countOk = count >= 1 && count <= 20

  // Validate active key sizes (32 bytes each)
  val keySizeOk =
    (count < 1  || key0.size  == 32) &&
    (count < 2  || key1.size  == 32) &&
    (count < 3  || key2.size  == 32) &&
    (count < 4  || key3.size  == 32) &&
    (count < 5  || key4.size  == 32) &&
    (count < 6  || key5.size  == 32) &&
    (count < 7  || key6.size  == 32) &&
    (count < 8  || key7.size  == 32) &&
    (count < 9  || key8.size  == 32) &&
    (count < 10 || key9.size  == 32) &&
    (count < 11 || key10.size == 32) &&
    (count < 12 || key11.size == 32) &&
    (count < 13 || key12.size == 32) &&
    (count < 14 || key13.size == 32) &&
    (count < 15 || key14.size == 32) &&
    (count < 16 || key15.size == 32) &&
    (count < 17 || key16.size == 32) &&
    (count < 18 || key17.size == 32) &&
    (count < 19 || key18.size == 32) &&
    (count < 20 || key19.size == 32)

  // Verify each active key is absent in the tree (non-membership)
  val allAbsent =
    (count < 1  || spentIdsTree.get(key0,  lp0).isEmpty)  &&
    (count < 2  || spentIdsTree.get(key1,  lp1).isEmpty)  &&
    (count < 3  || spentIdsTree.get(key2,  lp2).isEmpty)  &&
    (count < 4  || spentIdsTree.get(key3,  lp3).isEmpty)  &&
    (count < 5  || spentIdsTree.get(key4,  lp4).isEmpty)  &&
    (count < 6  || spentIdsTree.get(key5,  lp5).isEmpty)  &&
    (count < 7  || spentIdsTree.get(key6,  lp6).isEmpty)  &&
    (count < 8  || spentIdsTree.get(key7,  lp7).isEmpty)  &&
    (count < 9  || spentIdsTree.get(key8,  lp8).isEmpty)  &&
    (count < 10 || spentIdsTree.get(key9,  lp9).isEmpty)  &&
    (count < 11 || spentIdsTree.get(key10, lp10).isEmpty) &&
    (count < 12 || spentIdsTree.get(key11, lp11).isEmpty) &&
    (count < 13 || spentIdsTree.get(key12, lp12).isEmpty) &&
    (count < 14 || spentIdsTree.get(key13, lp13).isEmpty) &&
    (count < 15 || spentIdsTree.get(key14, lp14).isEmpty) &&
    (count < 16 || spentIdsTree.get(key15, lp15).isEmpty) &&
    (count < 17 || spentIdsTree.get(key16, lp16).isEmpty) &&
    (count < 18 || spentIdsTree.get(key17, lp17).isEmpty) &&
    (count < 19 || spentIdsTree.get(key18, lp18).isEmpty) &&
    (count < 20 || spentIdsTree.get(key19, lp19).isEmpty)

  // Construct the tuple collection for batched insert via explicit if/else
  val marker = Coll(1.toByte)
  val t0  = (key0,  marker)
  val t1  = (key1,  marker)
  val t2  = (key2,  marker)
  val t3  = (key3,  marker)
  val t4  = (key4,  marker)
  val t5  = (key5,  marker)
  val t6  = (key6,  marker)
  val t7  = (key7,  marker)
  val t8  = (key8,  marker)
  val t9  = (key9,  marker)
  val t10 = (key10, marker)
  val t11 = (key11, marker)
  val t12 = (key12, marker)
  val t13 = (key13, marker)
  val t14 = (key14, marker)
  val t15 = (key15, marker)
  val t16 = (key16, marker)
  val t17 = (key17, marker)
  val t18 = (key18, marker)
  val t19 = (key19, marker)

  val toInsert =
    if (count == 1)  Coll(t0)
    else if (count == 2)  Coll(t0, t1)
    else if (count == 3)  Coll(t0, t1, t2)
    else if (count == 4)  Coll(t0, t1, t2, t3)
    else if (count == 5)  Coll(t0, t1, t2, t3, t4)
    else if (count == 6)  Coll(t0, t1, t2, t3, t4, t5)
    else if (count == 7)  Coll(t0, t1, t2, t3, t4, t5, t6)
    else if (count == 8)  Coll(t0, t1, t2, t3, t4, t5, t6, t7)
    else if (count == 9)  Coll(t0, t1, t2, t3, t4, t5, t6, t7, t8)
    else if (count == 10) Coll(t0, t1, t2, t3, t4, t5, t6, t7, t8, t9)
    else if (count == 11) Coll(t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10)
    else if (count == 12) Coll(t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11)
    else if (count == 13) Coll(t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12)
    else if (count == 14) Coll(t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13)
    else if (count == 15) Coll(t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14)
    else if (count == 16) Coll(t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14, t15)
    else if (count == 17) Coll(t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14, t15, t16)
    else if (count == 18) Coll(t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14, t15, t16, t17)
    else if (count == 19) Coll(t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14, t15, t16, t17, t18)
    else                  Coll(t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14, t15, t16, t17, t18, t19)

  val modifiedTree = spentIdsTree.insert(toInsert, insertProof).get

  val successor = OUTPUTS(1)
  val validTreeUpdate = successor.R5[AvlTree].get.digest == modifiedTree.digest

  val preserveNFT = if (SELF.tokens.size > 0 && successor.tokens.size > 0)
    successor.tokens(0)._1 == SELF.tokens(0)._1
  else false
  val preserveNFTAmount = if (SELF.tokens.size > 0 && successor.tokens.size > 0)
    successor.tokens(0)._2 == SELF.tokens(0)._2
  else false
  val preserveContract = successor.propositionBytes == SELF.propositionBytes
  val counterAdvances = successor.R4[Long].get == SELF.R4[Long].get + 1L
  val preserveAuthMetadata = successor.R6[SigmaProp].get == authMetadata
  val preserveValue = successor.value >= SELF.value

  sigmaProp(
    countOk &&
    keySizeOk &&
    allAbsent &&
    validTreeUpdate &&
    preserveNFT &&
    preserveNFTAmount &&
    preserveContract &&
    counterAdvances &&
    preserveAuthMetadata &&
    preserveValue
  ) && committeeOk
}
