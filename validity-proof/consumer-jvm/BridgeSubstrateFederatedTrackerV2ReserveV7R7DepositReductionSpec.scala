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
import sigma.Colls
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.{copyBox, copyTransaction, testBox}

/** Exact V2-tracker/V7-reserve family deposit reduction, without runtime authority. */
class BridgeSubstrateFederatedTrackerV2ReserveV7R7DepositReductionSpec
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
  private val Height = 200
  private val MinerFeeTreeHex =
    "1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304"
  private val DepositorTreeHex =
    "0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
  private val CommitmentDomain =
    "E2S_PEG_IN_DEPOSIT_COMMITMENT_V4".getBytes(StandardCharsets.US_ASCII)
  private val Message = Blake2b256("V2 tracker V7 reserve deposit R7 reduction").toArray

  test("pinned V2 tracker V7 reserve deposit rejects predecessor and successor R7") {
    val receipt = readPinned(ReceiptPath, ReceiptSha)
    val intent = readPinned(IntentPath, IntentSha)
    val admission = readPinned(AdmissionPath, AdmissionSha)
    field(receipt.hcursor.downField("schema"), "receipt schema") shouldBe
      "e2s.substrate-federated-tracker-v2-reserve-v7-family-compiler-batch.v1"
    field(receipt.hcursor.downField("sigmaStateCommit"), "receipt commit") shouldBe
      SigmaCommit
    field(receipt.hcursor.downField("compilerIntentSha256Hex"),
      "receipt intent digest") shouldBe IntentSha
    field(receipt.hcursor.downField("familyIdHex"), "family ID") shouldBe FamilyId
    field(intent.hcursor.downField("sigmaStateCommit"), "intent commit") shouldBe
      SigmaCommit
    field(intent.hcursor.downField("admissionVector").downField("relativePath"),
      "admission path") shouldBe AdmissionPath
    field(intent.hcursor.downField("admissionVector").downField("sha256Hex"),
      "admission digest") shouldBe AdmissionSha
    field(admission.hcursor.downField("schema"), "admission schema") shouldBe
      "e2s.substrate-federated-v1-tracker-admission.golden-vector"

    val contracts = receipt.hcursor.downField("contracts").focus
      .flatMap(_.asArray).getOrElse(
        throw new IllegalArgumentException("contracts missing"))
    contracts.map(contract =>
      field(contract.hcursor.downField("role"), "contract role")) shouldBe
      ContractPins.map(_._1)
    val trees = ContractPins.map { case (role, bytes, sha, id) =>
      role -> contractTree(contracts.find(contract =>
        field(contract.hcursor.downField("role"), "contract role") == role)
        .getOrElse(throw new IllegalArgumentException(s"$role missing")),
        role, bytes, sha, id)
    }.toMap
    trees.size shouldBe 4
    val reserveTree = trees("pooledReserve")
    val sourceTree = trees("sourceLock")
    val familyId = hex(FamilyId)
    val reserveNft = hex(field(intent.hcursor.downField("family")
      .downField("pooledReserveNftIdHex"), "reserve NFT"))
    familyId.length shouldBe 32
    reserveNft.length shouldBe 32

    val prover = new BatchAVLProver[Digest32, Blake2b256.type](
      keyLength = 32, valueLengthOpt = Some(32))
    val emptyDigest = prover.digest.clone()
    val reserve = testBox(
      100000000L, reserveTree, 50,
      additionalTokens = Seq(
        (Digest32Coll @@ Colls.fromArray(reserveNft.clone())) -> 1L),
      additionalRegisters = Map(
        ErgoBox.R4 -> ByteArrayConstant(familyId.clone()),
        ErgoBox.R5 -> AvlTreeConstant(avl(emptyDigest)),
        ErgoBox.R6 -> LongConstant(0L)))
    val sourceIntentBytes = sourceIntent(intent, familyId)
    val depositorTree = ErgoTreeSerializer.DefaultSerializer
      .deserializeErgoTree(hex(DepositorTreeHex))
    val minerFeeTree = ErgoTreeSerializer.DefaultSerializer
      .deserializeErgoTree(hex(MinerFeeTreeHex))
    val source = testBox(
      Amount, sourceTree, 100,
      additionalRegisters = Map(
        ErgoBox.R4 -> ByteArrayConstant(sourceIntentBytes.clone()),
        ErgoBox.R5 -> ByteArrayConstant(depositorTree.bytes.clone())))
    val fee = testBox(1100000L, depositorTree, 90)
    val commitment = Blake2b256(
      CommitmentDomain ++ familyId ++ source.id ++ sourceIntentBytes).toArray
    require(commitment.length == 32, "commitment must be 32 bytes")
    require(prover.performOneOperation(Insert(
      source.id.clone().asInstanceOf[ADKey],
      commitment.clone().asInstanceOf[ADValue])).isSuccess,
      "deposit AVL insertion must succeed")
    val proof = prover.generateProof().clone()
    require(proof.nonEmpty, "deposit AVL proof must not be empty")
    val successor = new ErgoBoxCandidate(
      reserve.value + Amount, reserveTree, Height, reserve.additionalTokens,
      Map(
        ErgoBox.R4 -> ByteArrayConstant(familyId.clone()),
        ErgoBox.R5 -> AvlTreeConstant(avl(prover.digest.clone())),
        ErgoBox.R6 -> LongConstant(Amount)))
    val feeOutput = new ErgoBoxCandidate(
      fee.value, minerFeeTree, Height, Colls.emptyColl, Map.empty)
    val boxes = IndexedSeq(reserve, source, fee)
    val baseline = new ErgoLikeTransaction(
      IndexedSeq(
        Input(reserve.id, ProverResult(Array.emptyByteArray,
          ContextExtension(Map(0.toByte -> ByteArrayConstant(proof.clone()))))),
        Input(source.id, ProverResult(Array.emptyByteArray, ContextExtension.empty)),
        Input(fee.id, ProverResult(Array.emptyByteArray, ContextExtension.empty))),
      IndexedSeq.empty, IndexedSeq(successor, feeOutput))
    withClue("V2-bound V7 deposit baseline: ") {
      verifyBoth(baseline, boxes) shouldBe Vector(Right(true), Right(true))
    }

    def verifySuccessor(candidate: ErgoBoxCandidate): Vector[Either[Throwable, Boolean]] = {
      val transaction = copyTransaction(baseline)(
        outputCandidates = IndexedSeq(candidate, feeOutput))
      val parsed = parseTransaction(transaction.messageToSign)
      parsed.outputCandidates.head.additionalRegisters.keySet shouldBe
        candidate.additionalRegisters.keySet
      verifyBoth(transaction, boxes)
    }
    def verifyPredecessor(candidate: ErgoBox): Vector[Either[Throwable, Boolean]] = {
      val transaction = copyTransaction(baseline)(
        inputs = baseline.inputs.updated(0,
          Input(candidate.id, baseline.inputs.head.spendingProof)))
      val parsed = parseTransaction(transaction.messageToSign)
      parsed.inputs.head.boxId.toVector shouldBe candidate.id.toVector
      verifyBoth(transaction, IndexedSeq(candidate, source, fee))
    }
    def changedSuccessor(registers: ErgoBox.AdditionalRegisters): ErgoBoxCandidate =
      new ErgoBoxCandidate(successor.value, successor.ergoTree,
        successor.creationHeight, successor.additionalTokens, registers)
    def rejectedWrongType(results: Vector[Either[Throwable, Boolean]]): Unit = {
      results(1) shouldBe Right(true)
      results.head match {
        case Right(true) => fail("V7 reserve accepted a wrong-type R7")
        case Right(false) => succeed
        case Left(_) => succeed
      }
    }

    verifySuccessor(changedSuccessor(successor.additionalRegisters.toMap
      .updated(ErgoBox.R7, LongConstant(0L)))) shouldBe
      Vector(Right(false), Right(true))
    rejectedWrongType(verifySuccessor(changedSuccessor(
      successor.additionalRegisters.toMap.updated(
        ErgoBox.R7, ByteArrayConstant(Array[Byte](1))))))
    val denseSuccessor = changedSuccessor(successor.additionalRegisters.toMap
      .updated(ErgoBox.R7, LongConstant(0L))
      .updated(ErgoBox.R8, LongConstant(1L)))
    val denseTransaction = copyTransaction(baseline)(
      outputCandidates = IndexedSeq(denseSuccessor, feeOutput))
    parseTransaction(denseTransaction.messageToSign)
      .outputCandidates.head.additionalRegisters.keySet shouldBe
      Set(ErgoBox.R4, ErgoBox.R5, ErgoBox.R6, ErgoBox.R7, ErgoBox.R8)
    verifyBoth(denseTransaction, boxes) shouldBe
      Vector(Right(false), Right(true))

    verifyPredecessor(copyBox(reserve)(additionalRegisters =
      reserve.additionalRegisters.toMap.updated(ErgoBox.R7, LongConstant(0L)))) shouldBe
      Vector(Right(false), Right(true))
    rejectedWrongType(verifyPredecessor(copyBox(reserve)(additionalRegisters =
      reserve.additionalRegisters.toMap.updated(
        ErgoBox.R7, ByteArrayConstant(Array[Byte](1))))))
    val densePredecessor = copyBox(reserve)(additionalRegisters =
      reserve.additionalRegisters.toMap
        .updated(ErgoBox.R7, LongConstant(0L))
        .updated(ErgoBox.R8, LongConstant(1L)))
    verifyPredecessor(densePredecessor) shouldBe
      Vector(Right(false), Right(true))
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

  private def sourceIntent(intent: Json, familyId: Array[Byte]): Array[Byte] = {
    val application = intent.hcursor.downField("application")
    def app(name: String): Array[Byte] =
      hex(field(application.downField(name), name))
    val encoded = ByteBuffer.allocate(229)
      .put(2.toByte)
      .put(app("sourceNetworkIdHex"))
      .put(app("sidechainIdHex"))
      .put(app("bridgeAddressHex"))
      .put(app("tokenAddressHex"))
      .put(app("settlementProfileIdHex"))
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

  private def verifyBoth(transaction: ErgoLikeTransaction,
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
          boxes(index).ergoTree, context,
          ProverResult(Array.emptyByteArray, parsed.inputs(index).extension),
          Message).fold(Left(_), value => Right(value._1))
      } catch {
        case error: Throwable => Left(error)
      }
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
