package sigma.bridge

import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}
import java.security.MessageDigest

import io.circe.{ACursor, Json}
import io.circe.parser
import org.ergoplatform._
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.authds.avltree.batch.{BatchAVLProver, Insert}
import scorex.crypto.authds.{ADKey, ADValue}
import scorex.crypto.hash.{Blake2b256, Digest32}
import sigma.VersionContext
import sigma.ast._
import sigma.data.{AvlTreeData, AvlTreeFlags, Digest32Coll}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.{ErgoTreeSerializer, SigmaSerializer}
import sigma.{Colls}
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.{copyBox, copyTransaction, testBox}

/** Pinned V7 R7 guard checks for the deposit and burn reserve predicates. */
class BridgeSubstrateFederatedPooledReserveR7V7AcceptanceSpec
    extends AnyFunSuite with Matchers {
  private val RootProperty = "bridge.substrate.federated.r7.root"
  private val CompilerPath =
    "relayer/test-vectors/substrate-federated-v2-settlement-family-compiler-v1.json"
  private val CompilerSha =
    "be97b542a16e8c8589daf3d690cb2f9d2963fad194768793ab117b1d105299f4"
  private val RequestPath =
    "relayer/test-vectors/substrate-federated-v2-settlement-family-compiler-request.json"
  private val RequestSha =
    "a9be49e69317647d8dfcc66a58af2fc089bd60a64b9e0fee68d7521887c971ec"
  private val SigmaCommit = "f78deadd668f801e7fae3bc884283f79c6f484fa"
  private val ReserveId =
    "40419f444b13d44209dcde163ea2f37e86d5ef5456e6cea62c193052cd9134d5"
  private val ReserveSha =
    "1eaee99f0d0e0a878399c5e20b456b4cabcced3ed47e110069809857711c1af5"
  private val SourceId =
    "d7675ad2428c08db627419fc7d8376e30bb18cb4026be5b6a8a03ddab33f7053"
  private val SourceSha =
    "d27df7593949ae16d83f40554b7b21df4f3e6fe98ee6c56528163cd5218d720c"
  private val DupId =
    "131ce87b628c9fefe883b31e65d37e051c718102e06bcef9ba6b915978d2b773"
  private val DupSha =
    "89f45d7ba84a7c371e27d546314ee922140a699a99cf59fb71e24fbc4adc61e8"
  private val ActivatedVersion = 3.toByte
  private val Amount = 10000000L
  private val Height = 200
  private val MinerFeeTreeHex =
    "1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304"
  private val DepositorTreeHex =
    "0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
  private val CommitmentDomain =
    "E2S_PEG_IN_DEPOSIT_COMMITMENT_V4".getBytes(StandardCharsets.US_ASCII)
  private val Message = Blake2b256("federated V7 R7 guard reduction").toArray

  private lazy val compiler = readPinned(CompilerPath, CompilerSha)
  private lazy val request = readPinned(RequestPath, RequestSha)
  private lazy val requestProfile = request.hcursor.downField("profile")
  private lazy val requestTracker = request.hcursor.downField("tracker")
  private lazy val familyId = hex(field(
    requestProfile.downField("familyIdHex"), "family ID"))
  private lazy val nftId = hex(field(
    requestProfile.downField("pooledReserveNftIdHex"), "reserve NFT"))
  private lazy val dupNftId = hex(field(
    requestProfile.downField("duplicatePreventionNftIdHex"), "DUP NFT"))
  private lazy val reserveTree = contractTree("pooledReserve", 1985, ReserveSha, ReserveId)
  private lazy val sourceTree = contractTree("sourceLock", 1317, SourceSha, SourceId)
  private lazy val dupTree = contractTree("duplicatePrevention", 3419, DupSha, DupId)
  private lazy val depositorTree =
    ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(hex(DepositorTreeHex))
  private lazy val minerFeeTree =
    ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(hex(MinerFeeTreeHex))

  test("coherent V7 reserve deposit rejects predecessor and successor R7") {
    field(compiler.hcursor.downField("sigmaStateCommit"), "compiler commit") shouldBe
      SigmaCommit
    field(request.hcursor.downField("sigmaStateCommit"), "request commit") shouldBe
      SigmaCommit
    familyId.length shouldBe 32
    nftId.length shouldBe 32
    val prover = new BatchAVLProver[Digest32, Blake2b256.type](
      keyLength = 32,
      valueLengthOpt = Some(32))
    val emptyDigest = prover.digest.clone()
    val reserve = testBox(
      100000000L,
      reserveTree,
      50,
      additionalTokens = Seq(
        (Digest32Coll @@ Colls.fromArray(nftId.clone())) -> 1L),
      additionalRegisters = Map(
        ErgoBox.R4 -> ByteArrayConstant(familyId.clone()),
        ErgoBox.R5 -> AvlTreeConstant(avl(emptyDigest)),
        ErgoBox.R6 -> LongConstant(0L)))
    val intent = sourceIntent()
    val source = testBox(
      Amount,
      sourceTree,
      100,
      additionalRegisters = Map(
        ErgoBox.R4 -> ByteArrayConstant(intent.clone()),
        ErgoBox.R5 -> ByteArrayConstant(depositorTree.bytes.clone())))
    val fee = testBox(1100000L, depositorTree, 90)
    val commitment = Blake2b256(
      CommitmentDomain ++ familyId ++ source.id ++ intent).toArray
    require(commitment.length == 32, "deposit commitment must be 32 bytes")
    require(prover.performOneOperation(Insert(
      source.id.clone().asInstanceOf[ADKey],
      commitment.clone().asInstanceOf[ADValue])).isSuccess,
      "deposit AVL insertion must succeed")
    val proof = prover.generateProof().clone()
    require(proof.nonEmpty, "deposit AVL proof must not be empty")
    val successor = new ErgoBoxCandidate(
      reserve.value + Amount,
      reserveTree,
      Height,
      reserve.additionalTokens,
      Map(
        ErgoBox.R4 -> ByteArrayConstant(familyId.clone()),
        ErgoBox.R5 -> AvlTreeConstant(avl(prover.digest.clone())),
        ErgoBox.R6 -> LongConstant(Amount)))
    val feeOutput = new ErgoBoxCandidate(
      fee.value,
      minerFeeTree,
      Height,
      Colls.emptyColl,
      Map.empty)
    val inputs = IndexedSeq(reserve, source, fee)
    val baseline = new ErgoLikeTransaction(
      IndexedSeq(
        Input(reserve.id, ProverResult(
          Array.emptyByteArray,
          ContextExtension(Map(0.toByte -> ByteArrayConstant(proof.clone()))))),
        Input(source.id, ProverResult(Array.emptyByteArray, ContextExtension.empty)),
        Input(fee.id, ProverResult(Array.emptyByteArray, ContextExtension.empty))),
      IndexedSeq.empty,
      IndexedSeq(successor, feeOutput))
    withClue("V7 positive deposit with coherent family profile: ") {
      verifyBoth(baseline, inputs) shouldBe Vector(Right(true), Right(true))
    }

    def verifySuccessor(candidate: ErgoBoxCandidate): Vector[Either[Throwable, Boolean]] = {
      val transaction = copyTransaction(baseline)(
        outputCandidates = IndexedSeq(candidate, feeOutput))
      val parsed = parseTransaction(transaction.messageToSign)
      parsed.outputCandidates.head.additionalRegisters.keySet shouldBe
        candidate.additionalRegisters.keySet
      verifyBoth(transaction, inputs)
    }

    val r7Long = new ErgoBoxCandidate(
      successor.value,
      successor.ergoTree,
      successor.creationHeight,
      successor.additionalTokens,
      successor.additionalRegisters.toMap.updated(ErgoBox.R7, LongConstant(0L)))
    verifySuccessor(r7Long) shouldBe Vector(Right(false), Right(true))

    val r7WrongType = new ErgoBoxCandidate(
      successor.value,
      successor.ergoTree,
      successor.creationHeight,
      successor.additionalTokens,
      successor.additionalRegisters.toMap.updated(
        ErgoBox.R7, ByteArrayConstant(Array[Byte](1))))
    val wrongTypeResults = verifySuccessor(r7WrongType)
    wrongTypeResults(1) shouldBe Right(true)
    wrongTypeResults(0) match {
      case Right(true) => fail("V7 reserve accepted a wrong-type R7")
      case Right(false) => succeed
      case Left(_) => succeed
    }

    val r7R8 = new ErgoBoxCandidate(
      successor.value,
      successor.ergoTree,
      successor.creationHeight,
      successor.additionalTokens,
      successor.additionalRegisters.toMap
        .updated(ErgoBox.R7, LongConstant(0L))
        .updated(ErgoBox.R8, LongConstant(1L)))
    val denseTransaction = copyTransaction(baseline)(
      outputCandidates = IndexedSeq(r7R8, feeOutput))
    val denseParsed = parseTransaction(denseTransaction.messageToSign)
    denseParsed.outputCandidates.head.additionalRegisters.keySet shouldBe
      Set(ErgoBox.R4, ErgoBox.R5, ErgoBox.R6, ErgoBox.R7, ErgoBox.R8)
    verifyBoth(denseTransaction, inputs) shouldBe
      Vector(Right(false), Right(true))

    def verifyPredecessor(candidate: ErgoBox): Vector[Either[Throwable, Boolean]] = {
      val transaction = copyTransaction(baseline)(
        inputs = baseline.inputs.updated(
          0, Input(candidate.id, baseline.inputs(0).spendingProof)))
      val parsed = parseTransaction(transaction.messageToSign)
      parsed.inputs.head.boxId.toVector shouldBe candidate.id.toVector
      verifyBoth(transaction, IndexedSeq(candidate, source, fee))
    }
    val r7Predecessor = copyBox(reserve)(
      additionalRegisters =
        reserve.additionalRegisters.toMap.updated(ErgoBox.R7, LongConstant(0L)))
    verifyPredecessor(r7Predecessor) shouldBe
      Vector(Right(false), Right(true))
    val wrongTypePredecessor = copyBox(reserve)(
      additionalRegisters = reserve.additionalRegisters.toMap.updated(
        ErgoBox.R7, ByteArrayConstant(Array[Byte](1))))
    val wrongPredecessorResults = verifyPredecessor(wrongTypePredecessor)
    wrongPredecessorResults(1) shouldBe Right(true)
    wrongPredecessorResults(0) match {
      case Right(true) => fail("V7 reserve accepted a wrong-type predecessor R7")
      case Right(false) => succeed
      case Left(_) => succeed
    }
    val densePredecessor = copyBox(reserve)(
      additionalRegisters = reserve.additionalRegisters.toMap
        .updated(ErgoBox.R7, LongConstant(0L))
        .updated(ErgoBox.R8, LongConstant(1L)))
    verifyPredecessor(densePredecessor) shouldBe
      Vector(Right(false), Right(true))
  }

  test("coherent V7 burn reserve predicate rejects predecessor and successor R7") {
    familyId.length shouldBe 32
    nftId.length shouldBe 32
    dupNftId.length shouldBe 32
    val emptyDigest = new BatchAVLProver[Digest32, Blake2b256.type](
      keyLength = 32, valueLengthOpt = Some(32)).digest.clone()
    val reserve = testBox(
      100000000L, reserveTree, 50,
      additionalTokens = Seq(
        (Digest32Coll @@ Colls.fromArray(nftId.clone())) -> 1L),
      additionalRegisters = Map(
        ErgoBox.R4 -> ByteArrayConstant(familyId.clone()),
        ErgoBox.R5 -> AvlTreeConstant(avl(emptyDigest)),
        ErgoBox.R6 -> LongConstant(10000000L)))
    val dup = testBox(
      1000000L, dupTree, 50,
      additionalTokens = Seq(
        (Digest32Coll @@ Colls.fromArray(dupNftId.clone())) -> 1L),
      additionalRegisters = Map(
        ErgoBox.R4 -> ByteArrayConstant(familyId.clone())))
    val fee = testBox(1100000L, depositorTree, 90)
    val tracker = testBox(1000000L, depositorTree, 80)
    val reserveOut = new ErgoBoxCandidate(
      90000000L, reserveTree, Height, reserve.additionalTokens,
      Map(
        ErgoBox.R4 -> ByteArrayConstant(familyId.clone()),
        ErgoBox.R5 -> AvlTreeConstant(avl(emptyDigest)),
        ErgoBox.R6 -> LongConstant(0L)))
    val dupOut = new ErgoBoxCandidate(
      dup.value, dupTree, Height, dup.additionalTokens, dup.additionalRegisters)
    val payoutOut = new ErgoBoxCandidate(
      10000000L, depositorTree, Height, Colls.emptyColl, Map.empty)
    val feeOut = new ErgoBoxCandidate(
      fee.value, minerFeeTree, Height, Colls.emptyColl, Map.empty)
    val boxes = IndexedSeq(reserve, dup, fee)
    val data = IndexedSeq(tracker)
    val baseline = new ErgoLikeTransaction(
      boxes.map(box =>
        Input(box.id, ProverResult(Array.emptyByteArray, ContextExtension.empty))),
      IndexedSeq(DataInput(tracker.id)),
      IndexedSeq(reserveOut, dupOut, payoutOut, feeOut))
    withClue("V7 positive burn reserve predicate, not the DUP predicate: ") {
      verifyBurnReserve(baseline, boxes, data) shouldBe Right(true)
    }

    def verifySuccessor(candidate: ErgoBoxCandidate): Either[Throwable, Boolean] = {
      val transaction = copyTransaction(baseline)(
        outputCandidates = baseline.outputCandidates.updated(0, candidate))
      val parsed = parseTransaction(transaction.messageToSign)
      parsed.outputCandidates.head.additionalRegisters.keySet shouldBe
        candidate.additionalRegisters.keySet
      verifyBurnReserve(transaction, boxes, data)
    }
    def verifyPredecessor(candidate: ErgoBox): Either[Throwable, Boolean] = {
      val transaction = copyTransaction(baseline)(
        inputs = baseline.inputs.updated(
          0, Input(candidate.id, baseline.inputs(0).spendingProof)))
      val parsed = parseTransaction(transaction.messageToSign)
      parsed.inputs.head.boxId.toVector shouldBe candidate.id.toVector
      verifyBurnReserve(transaction, IndexedSeq(candidate, dup, fee), data)
    }
    def changedSuccessor(registers: ErgoBox.AdditionalRegisters): ErgoBoxCandidate =
      new ErgoBoxCandidate(
        reserveOut.value, reserveOut.ergoTree, reserveOut.creationHeight,
        reserveOut.additionalTokens, registers)

    verifySuccessor(changedSuccessor(
      reserveOut.additionalRegisters.toMap.updated(
        ErgoBox.R7, LongConstant(0L)))) shouldBe Right(false)
    val wrongSuccessor = verifySuccessor(changedSuccessor(
      reserveOut.additionalRegisters.toMap.updated(
        ErgoBox.R7, ByteArrayConstant(Array[Byte](1)))))
    wrongSuccessor match {
      case Right(true) => fail("V7 burn reserve accepted a wrong-type successor R7")
      case Right(false) => succeed
      case Left(_) => succeed
    }
    verifySuccessor(changedSuccessor(
      reserveOut.additionalRegisters.toMap
        .updated(ErgoBox.R7, LongConstant(0L))
        .updated(ErgoBox.R8, LongConstant(1L)))) shouldBe Right(false)

    verifyPredecessor(copyBox(reserve)(
      additionalRegisters = reserve.additionalRegisters.toMap.updated(
        ErgoBox.R7, LongConstant(0L)))) shouldBe Right(false)
    val wrongPredecessor = verifyPredecessor(copyBox(reserve)(
      additionalRegisters = reserve.additionalRegisters.toMap.updated(
        ErgoBox.R7, ByteArrayConstant(Array[Byte](1)))))
    wrongPredecessor match {
      case Right(true) => fail("V7 burn reserve accepted a wrong-type predecessor R7")
      case Right(false) => succeed
      case Left(_) => succeed
    }
    verifyPredecessor(copyBox(reserve)(
      additionalRegisters = reserve.additionalRegisters.toMap
        .updated(ErgoBox.R7, LongConstant(0L))
        .updated(ErgoBox.R8, LongConstant(1L)))) shouldBe Right(false)
  }

  private def readPinned(relative: String, expected: String): Json = {
    val rootValue = System.getProperty(RootProperty)
    require(rootValue != null && rootValue.nonEmpty, s"missing -D$RootProperty")
    val root = Paths.get(rootValue).toAbsolutePath.normalize()
    val file = root.resolve(relative).normalize()
    require(file.startsWith(root) && Files.isRegularFile(file) &&
      !Files.isSymbolicLink(file), s"$relative must be a direct regular file")
    val bytes = Files.readAllBytes(file)
    require(sha256(bytes) == expected, s"$relative SHA-256 mismatch")
    parser.parse(new String(bytes, StandardCharsets.UTF_8)).fold(
      error => throw new IllegalArgumentException(error.getMessage), identity)
  }

  private def contractTree(
      role: String,
      expectedBytes: Int,
      expectedSha: String,
      expectedId: String): ErgoTree = {
    val contracts = compiler.hcursor.downField("contracts").focus
      .flatMap(_.asArray).getOrElse(throw new IllegalArgumentException("contracts missing"))
    val contract = contracts.find(_.hcursor.get[String]("role").toOption.contains(role))
      .getOrElse(throw new IllegalArgumentException(s"$role receipt missing"))
    val cursor = contract.hcursor
    field(cursor.downField("contractIdHex"), s"$role ID") shouldBe expectedId
    field(cursor.downField("propositionSha256Hex"), s"$role SHA") shouldBe expectedSha
    val proposition = hex(field(cursor.downField("propositionHex"), s"$role proposition"))
    proposition.length shouldBe expectedBytes
    sha256(proposition) shouldBe expectedSha
    hex(Blake2b256(proposition)) shouldBe expectedId
    ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(proposition)
  }

  private def sourceIntent(): Array[Byte] = {
    def tracker(name: String): Array[Byte] =
      hex(field(requestTracker.downField(name), name))
    val encoded = ByteBuffer.allocate(229)
      .put(2.toByte)
      .put(tracker("sourceNetworkIdHex"))
      .put(tracker("sidechainIdHex"))
      .put(tracker("bridgeAddressHex"))
      .put(tracker("tokenAddressHex"))
      .put(tracker("settlementProfileIdHex"))
      .put(familyId)
      .put(Array.fill[Byte](32)(0))
      .putLong(Amount)
      .put(Array.fill[Byte](20)(0x66.toByte))
      .array()
    require(encoded.length == 229, "source intent must be 229 bytes")
    encoded
  }

  private def avl(digest: Array[Byte]): AvlTreeData = {
    require(digest.length == 33, "AVL digest must be 33 bytes")
    new AvlTreeData(Colls.fromArray(digest), AvlTreeFlags.InsertOnly, 32, Some(32))
  }

  private def verifyBoth(
      transaction: ErgoLikeTransaction,
      spendingBoxes: IndexedSeq[ErgoBox]): Vector[Either[Throwable, Boolean]] =
    Vector(0, 1).map { index =>
      try {
        val parsed = parseTransaction(transaction.messageToSign)
        val boxes = spendingBoxes.map(cloneBox)
        require(parsed.inputs.zip(boxes).forall { case (input, box) =>
          java.util.Arrays.equals(input.boxId, box.id)
        }, "input IDs differ from spending boxes")
        val context = ErgoLikeContextTesting(
          currentHeight = Height,
          lastBlockUtxoRoot = AvlTreeData.dummy,
          minerPubkey = ErgoLikeContextTesting.dummyPubkey,
          dataBoxes = IndexedSeq.empty,
          boxesToSpend = boxes,
          spendingTransaction = parsed,
          selfIndex = index,
          activatedVersion = ActivatedVersion)
        new ErgoLikeTestInterpreter().verify(
          boxes(index).ergoTree,
          context,
          ProverResult(Array.emptyByteArray, parsed.inputs(index).extension),
          Message).fold(Left(_), value => Right(value._1))
      } catch {
        case error: Throwable => Left(error)
      }
    }

  private def verifyBurnReserve(
      transaction: ErgoLikeTransaction,
      spendingBoxes: IndexedSeq[ErgoBox],
      dataBoxes: IndexedSeq[ErgoBox]): Either[Throwable, Boolean] =
    try {
      val parsed = parseTransaction(transaction.messageToSign)
      val boxes = spendingBoxes.map(cloneBox)
      val data = dataBoxes.map(cloneBox)
      require(parsed.inputs.zip(boxes).forall { case (input, box) =>
        java.util.Arrays.equals(input.boxId, box.id)
      }, "burn input IDs differ from spending boxes")
      require(parsed.dataInputs.zip(data).forall { case (input, box) =>
        java.util.Arrays.equals(input.boxId, box.id)
      }, "burn data input IDs differ from data boxes")
      val context = ErgoLikeContextTesting(
        currentHeight = Height,
        lastBlockUtxoRoot = AvlTreeData.dummy,
        minerPubkey = ErgoLikeContextTesting.dummyPubkey,
        dataBoxes = data,
        boxesToSpend = boxes,
        spendingTransaction = parsed,
        selfIndex = 0,
        activatedVersion = ActivatedVersion)
      new ErgoLikeTestInterpreter().verify(
        boxes.head.ergoTree,
        context,
        ProverResult(Array.emptyByteArray, parsed.inputs.head.extension),
        Message).fold(Left(_), value => Right(value._1))
    } catch {
      case error: Throwable => Left(error)
    }

  private def parseTransaction(bytes: Array[Byte]): ErgoLikeTransaction =
    VersionContext.withVersions(ActivatedVersion, 0.toByte) {
      val reader = SigmaSerializer.startReader(bytes.clone())
      val parsed = ErgoLikeTransactionSerializer.parse(reader)
      require(reader.remaining == 0, "transaction parser left trailing bytes")
      parsed
    }

  private def cloneBox(box: ErgoBox): ErgoBox =
    VersionContext.withVersions(ActivatedVersion, 0.toByte) {
      val reader = SigmaSerializer.startReader(ErgoBox.sigmaSerializer.toBytes(box))
      val parsed = ErgoBox.sigmaSerializer.parse(reader)
      require(reader.remaining == 0, "box parser left trailing bytes")
      parsed
    }

  private def field(cursor: ACursor, label: String): String =
    cursor.focus.flatMap(_.asString).getOrElse(
      throw new IllegalArgumentException(s"$label missing or not a string"))

  private def hex(text: String): Array[Byte] = {
    require(text.length % 2 == 0 && text.matches("[0-9a-f]+"),
      "expected lowercase whole-byte hex")
    text.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }
  private def hex(bytes: Array[Byte]): String =
    bytes.iterator.map(byte => f"${byte & 0xff}%02x").mkString
  private def sha256(bytes: Array[Byte]): String =
    hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
