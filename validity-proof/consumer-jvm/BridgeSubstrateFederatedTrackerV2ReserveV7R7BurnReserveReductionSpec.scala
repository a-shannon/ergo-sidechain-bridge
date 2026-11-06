package sigma.bridge

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}
import java.security.MessageDigest

import io.circe.{ACursor, Json}
import io.circe.parser
import org.ergoplatform._
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.authds.avltree.batch.BatchAVLProver
import scorex.crypto.hash.{Blake2b256, Digest32}
import sigma.VersionContext
import sigma.ast._
import sigma.data.{AvlTreeData, AvlTreeFlags, Digest32Coll}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.{ErgoTreeSerializer, SigmaSerializer}
import sigma.Colls
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.{copyBox, copyTransaction, testBox}

/** Exact-family burn-shaped V7 reserve predicate only; DUP and tracker are not reduced. */
class BridgeSubstrateFederatedTrackerV2ReserveV7R7BurnReserveReductionSpec
    extends AnyFunSuite with Matchers {
  private val RootProperty =
    "bridge.substrate.federated.tracker.v2.reserve.v7.root"
  private val ReceiptPath =
    "relayer/test-vectors/substrate-federated-tracker-v2-reserve-v7-family-compiler-receipt-v1.json"
  private val ReceiptSha =
    "a48a49ead2b1072bdb46acd42fa7a735be94e01a0696a15a3c51e32bbead6db6"
  private val IntentPath =
    "relayer/test-vectors/substrate-federated-tracker-v2-reserve-v7-family-compiler-intent-v1.json"
  private val IntentSha =
    "f1b153e054a00099d0d786a638a4191d4325fee3dda20595fd532360f392539a"
  private val AdmissionPath =
    "relayer/test-vectors/substrate-federated-v1-tracker-admission.json"
  private val AdmissionSha =
    "87b1db594810e8e21f4132ed51ee929dde6a07cce9f690ec8bba2fc90c57f5be"
  private val SigmaCommit = "f78deadd668f801e7fae3bc884283f79c6f484fa"
  private val FamilyId =
    "9f03d6a02746b1d42c1d7b9f6108938dd1bdfc7aea14e4cc56c44cf88d96c756"
  private val ContractPins = Vector(
    ("tracker", 2767,
      "7a467ebcaf12709f51215b038d0c3f6b6a591fcede84553e4c0dd61f53699dc7",
      "9e9a4bc54640a35299110f9870b8ffab6d7ed5a64cb39dbe323d805caaa91da7"),
    ("duplicatePrevention", 3419,
      "895d286dc2a3379486ba2e426279ef73c21b93509d68c8a5a4952e65a97976c7",
      "0b9403ef836effe2a402fd85fb006ee1dd3805dacfe470a384185267fd1ef2de"),
    ("sourceLock", 1317,
      "0751ed1f5321b7f212f611d84e25cb8fc3ab3f0b7971d64edea4a2997b0e8a18",
      "36aa9030eb5fc45dbcac71b75dc717aadc023a23981fd051708d11a6b1908de2"),
    ("pooledReserve", 1985,
      "1e89d0b6a1675cc4aa74aa37eafa973e12466cf22146c6210f9801fd13abb586",
      "cd987d5a77ee19f2fa3894d4d2265207156638a40fbdaefe85f3d512b38fc320"))
  private val ActivatedVersion = 3.toByte
  private val Amount = 10000000L
  private val Height = 1200
  private val MinerFeeTreeHex =
    "1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304"
  private val DepositorTreeHex =
    "0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
  private val Message = Blake2b256("V2 tracker V7 reserve-only burn R7 reduction").toArray

  test("pinned V2 tracker V7 reserve-only burn rejects predecessor and successor R7") {
    val receipt = readPinned(ReceiptPath, ReceiptSha)
    val intent = readPinned(IntentPath, IntentSha)
    val admission = readPinned(AdmissionPath, AdmissionSha)
    field(receipt.hcursor.downField("schema"), "receipt schema") shouldBe
      "e2s.substrate-federated-tracker-v2-reserve-v7-family-compiler-batch.v1"
    field(receipt.hcursor.downField("sigmaStateCommit"), "receipt commit") shouldBe SigmaCommit
    field(receipt.hcursor.downField("compilerIntentSha256Hex"), "intent digest") shouldBe IntentSha
    field(receipt.hcursor.downField("familyIdHex"), "family ID") shouldBe FamilyId
    field(intent.hcursor.downField("sigmaStateCommit"), "intent commit") shouldBe SigmaCommit
    field(intent.hcursor.downField("admissionVector").downField("relativePath"),
      "admission path") shouldBe AdmissionPath
    field(intent.hcursor.downField("admissionVector").downField("sha256Hex"),
      "admission digest") shouldBe AdmissionSha
    field(admission.hcursor.downField("schema"), "admission schema") shouldBe
      "e2s.substrate-federated-v1-tracker-admission.golden-vector"

    val contracts = receipt.hcursor.downField("contracts").focus
      .flatMap(_.asArray).getOrElse(throw new IllegalArgumentException("contracts missing"))
    contracts.map(c => field(c.hcursor.downField("role"), "contract role")) shouldBe
      ContractPins.map(_._1)
    val trees = ContractPins.map { case (role, bytes, sha, id) =>
      role -> contractTree(contracts.find(c =>
        field(c.hcursor.downField("role"), "contract role") == role)
        .getOrElse(throw new IllegalArgumentException(s"$role missing")),
        role, bytes, sha, id)
    }.toMap
    trees.size shouldBe 4
    val reserveTree = trees("pooledReserve")
    val dupTree = trees("duplicatePrevention")
    val trackerTree = trees("tracker")
    val familyId = hex(FamilyId)
    val family = intent.hcursor.downField("family")
    val trackerIntent = intent.hcursor.downField("tracker")
    val application = intent.hcursor.downField("application")
    val reserveNft = hex(field(family.downField("pooledReserveNftIdHex"), "reserve NFT"))
    val dupNft = hex(field(family.downField("duplicatePreventionNftIdHex"), "DUP NFT"))
    val trackerNft = hex(field(trackerIntent.downField("trackerNftIdHex"), "tracker NFT"))
    val federationProfile = hex(field(
      trackerIntent.downField("federationProfileIdHex"), "federation profile"))
    val sidechainId = hex(field(application.downField("sidechainIdHex"), "sidechain ID"))
    val keySetDigest = hex(field(
      trackerIntent.downField("ergoAdmissionKeySetDigestHex"), "key-set digest"))
    Seq(familyId, reserveNft, dupNft, trackerNft, federationProfile,
      sidechainId, keySetDigest).foreach(_.length shouldBe 32)
    field(admission.hcursor.downField("expected")
      .downField("federationProfileIdHex"), "admission federation profile") shouldBe
      hex(federationProfile)
    field(admission.hcursor.downField("expected")
      .downField("ergoAdmissionKeySetDigestHex"), "admission key-set digest") shouldBe
      hex(keySetDigest)
    field(admission.hcursor.downField("input").downField("statement")
      .downField("sidechainIdHex"), "admission sidechain") shouldBe hex(sidechainId)
    val sourceHeight = admission.hcursor.downField("input")
      .downField("statement").downField("sourceNativeBlockHeight").focus
      .flatMap(_.asString).flatMap(_.toLongOption).getOrElse(
        throw new IllegalArgumentException("source height missing"))
    val ergoHeight = admission.hcursor.downField("input")
      .downField("tracker").downField("currentErgoHeight").focus
      .flatMap(_.asNumber).flatMap(_.toInt).getOrElse(
        throw new IllegalArgumentException("Ergo height missing"))
    sourceHeight shouldBe 1000L
    ergoHeight shouldBe 1030

    val reserveDigest = new BatchAVLProver[Digest32, Blake2b256.type](
      keyLength = 32, valueLengthOpt = Some(32)).digest.clone()
    val dupDigest = new BatchAVLProver[Digest32, Blake2b256.type](
      keyLength = 32, valueLengthOpt = Some(1)).digest.clone()
    val trackerDigest = new BatchAVLProver[Digest32, Blake2b256.type](
      keyLength = 32, valueLengthOpt = Some(370)).digest.clone()
    val reserve = testBox(100000000L, reserveTree, 50,
      additionalTokens = Seq(
        (Digest32Coll @@ Colls.fromArray(reserveNft.clone())) -> 1L),
      additionalRegisters = Map(
        ErgoBox.R4 -> ByteArrayConstant(familyId.clone()),
        ErgoBox.R5 -> AvlTreeConstant(avl(reserveDigest, 32)),
        ErgoBox.R6 -> LongConstant(Amount)))
    val dup = testBox(1000000L, dupTree, 50,
      additionalTokens = Seq(
        (Digest32Coll @@ Colls.fromArray(dupNft.clone())) -> 1L),
      additionalRegisters = Map(
        ErgoBox.R4 -> ByteArrayConstant(familyId.clone()),
        ErgoBox.R5 -> AvlTreeConstant(avl(dupDigest, 1))))
    // The exact V2 proposition is a data input, but only the reserve input is
    // interpreted. This synthetic typed state is not a checkpoint admission.
    val tracker = testBox(1000000L, trackerTree, ergoHeight,
      additionalTokens = Seq(
        (Digest32Coll @@ Colls.fromArray(trackerNft.clone())) -> 1L),
      additionalRegisters = Map(
        ErgoBox.R4 -> ByteArrayConstant(federationProfile.clone()),
        ErgoBox.R5 -> AvlTreeConstant(avl(trackerDigest, 370)),
        ErgoBox.R6 -> ByteArrayConstant(sidechainId.clone()),
        ErgoBox.R7 -> LongConstant(sourceHeight),
        ErgoBox.R8 -> IntConstant(ergoHeight),
        ErgoBox.R9 -> ByteArrayConstant(keySetDigest.clone())))
    val depositorTree = ErgoTreeSerializer.DefaultSerializer
      .deserializeErgoTree(hex(DepositorTreeHex))
    val minerFeeTree = ErgoTreeSerializer.DefaultSerializer
      .deserializeErgoTree(hex(MinerFeeTreeHex))
    val fee = testBox(1100000L, depositorTree, 90)
    val reserveOut = new ErgoBoxCandidate(reserve.value - Amount, reserveTree,
      Height, reserve.additionalTokens, Map(
        ErgoBox.R4 -> ByteArrayConstant(familyId.clone()),
        ErgoBox.R5 -> AvlTreeConstant(avl(reserveDigest, 32)),
        ErgoBox.R6 -> LongConstant(0L)))
    val dupOut = new ErgoBoxCandidate(dup.value, dupTree, Height,
      dup.additionalTokens, dup.additionalRegisters)
    val payoutOut = new ErgoBoxCandidate(Amount, depositorTree, Height,
      Colls.emptyColl, Map.empty)
    val feeOut = new ErgoBoxCandidate(fee.value, minerFeeTree, Height,
      Colls.emptyColl, Map.empty)
    val boxes = IndexedSeq(reserve, dup, fee)
    val data = IndexedSeq(tracker)
    val baseline = new ErgoLikeTransaction(
      boxes.map(box => Input(box.id,
        ProverResult(Array.emptyByteArray, ContextExtension.empty))),
      IndexedSeq(DataInput(tracker.id)),
      IndexedSeq(reserveOut, dupOut, payoutOut, feeOut))
    withClue("V2-family reserve-only burn baseline, not DUP acceptance: ") {
      verifyBurnReserve(baseline, boxes, data) shouldBe Right(true)
    }

    def verifySuccessor(candidate: ErgoBoxCandidate): Either[Throwable, Boolean] = {
      val tx = copyTransaction(baseline)(
        outputCandidates = baseline.outputCandidates.updated(0, candidate))
      val parsed = parseTransaction(tx.messageToSign)
      parsed.outputCandidates.head.additionalRegisters.keySet shouldBe
        candidate.additionalRegisters.keySet
      verifyBurnReserve(tx, boxes, data)
    }
    def verifyPredecessor(candidate: ErgoBox): Either[Throwable, Boolean] = {
      val tx = copyTransaction(baseline)(inputs = baseline.inputs.updated(0,
        Input(candidate.id, baseline.inputs.head.spendingProof)))
      parseTransaction(tx.messageToSign).inputs.head.boxId.toVector shouldBe
        candidate.id.toVector
      verifyBurnReserve(tx, IndexedSeq(candidate, dup, fee), data)
    }
    def changedSuccessor(registers: ErgoBox.AdditionalRegisters): ErgoBoxCandidate =
      new ErgoBoxCandidate(reserveOut.value, reserveOut.ergoTree,
        reserveOut.creationHeight, reserveOut.additionalTokens, registers)
    def rejectedWrongType(result: Either[Throwable, Boolean]): Unit =
      result match {
        case Right(true) => fail("V7 reserve accepted a wrong-type R7")
        case Right(false) => succeed
        case Left(_) => succeed
      }

    verifySuccessor(changedSuccessor(reserveOut.additionalRegisters.toMap
      .updated(ErgoBox.R7, LongConstant(0L)))) shouldBe Right(false)
    rejectedWrongType(verifySuccessor(changedSuccessor(
      reserveOut.additionalRegisters.toMap.updated(
        ErgoBox.R7, ByteArrayConstant(Array[Byte](1))))))
    val denseSuccessor = changedSuccessor(reserveOut.additionalRegisters.toMap
      .updated(ErgoBox.R7, LongConstant(0L))
      .updated(ErgoBox.R8, LongConstant(1L)))
    val denseTx = copyTransaction(baseline)(
      outputCandidates = baseline.outputCandidates.updated(0, denseSuccessor))
    parseTransaction(denseTx.messageToSign)
      .outputCandidates.head.additionalRegisters.keySet shouldBe
      Set(ErgoBox.R4, ErgoBox.R5, ErgoBox.R6, ErgoBox.R7, ErgoBox.R8)
    verifyBurnReserve(denseTx, boxes, data) shouldBe Right(false)

    verifyPredecessor(copyBox(reserve)(additionalRegisters =
      reserve.additionalRegisters.toMap.updated(
        ErgoBox.R7, LongConstant(0L)))) shouldBe Right(false)
    rejectedWrongType(verifyPredecessor(copyBox(reserve)(additionalRegisters =
      reserve.additionalRegisters.toMap.updated(
        ErgoBox.R7, ByteArrayConstant(Array[Byte](1))))))
    val densePredecessor = copyBox(reserve)(additionalRegisters =
      reserve.additionalRegisters.toMap
        .updated(ErgoBox.R7, LongConstant(0L))
        .updated(ErgoBox.R8, LongConstant(1L)))
    verifyPredecessor(densePredecessor) shouldBe Right(false)
  }

  private def readPinned(relative: String, expected: String): Json = {
    val raw = System.getProperty(RootProperty)
    require(raw != null && raw.nonEmpty, s"missing -D$RootProperty")
    val root = Paths.get(raw).toAbsolutePath.normalize()
    val file = root.resolve(relative).normalize()
    require(file.startsWith(root) && Files.isRegularFile(file) &&
      !Files.isSymbolicLink(file), s"$relative must be a direct regular file")
    val bytes = Files.readAllBytes(file)
    require(sha256(bytes) == expected, s"$relative SHA-256 mismatch")
    parser.parse(new String(bytes, StandardCharsets.UTF_8)).fold(
      error => throw new IllegalArgumentException(error.getMessage), identity)
  }

  private def contractTree(contract: Json, role: String, expectedBytes: Int,
      expectedSha: String, expectedId: String): ErgoTree = {
    val cursor = contract.hcursor
    field(cursor.downField("schema"), s"$role schema") shouldBe
      "e2s.substrate-federated-tracker-v2-reserve-v7-compiler-receipt.v1"
    field(cursor.downField("contractIdHex"), s"$role ID") shouldBe expectedId
    field(cursor.downField("propositionSha256Hex"), s"$role SHA") shouldBe
      expectedSha
    val proposition = hex(field(cursor.downField("propositionHex"),
      s"$role proposition"))
    proposition.length shouldBe expectedBytes
    sha256(proposition) shouldBe expectedSha
    hex(Blake2b256(proposition)) shouldBe expectedId
    ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(proposition)
  }

  private def avl(digest: Array[Byte], valueLength: Int): AvlTreeData = {
    require(digest.length == 33, "AVL digest must be 33 bytes")
    new AvlTreeData(Colls.fromArray(digest), AvlTreeFlags.InsertOnly,
      32, Some(valueLength))
  }

  private def verifyBurnReserve(
      transaction: ErgoLikeTransaction,
      spendingBoxes: IndexedSeq[ErgoBox],
      dataBoxes: IndexedSeq[ErgoBox]): Either[Throwable, Boolean] =
    try {
      val parsed = parseTransaction(transaction.messageToSign)
      val boxes = spendingBoxes.map(cloneBox)
      val data = dataBoxes.map(cloneBox)
      require(parsed.inputs.length == boxes.length &&
        parsed.inputs.zip(boxes).forall { case (input, box) =>
          java.util.Arrays.equals(input.boxId, box.id)
        }, "burn input IDs differ from spending boxes")
      require(parsed.dataInputs.length == data.length &&
        parsed.dataInputs.zip(data).forall { case (input, box) =>
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
        boxes.head.ergoTree, context,
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
