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
import sigma.data.{AvlTreeData, AvlTreeFlags, Digest32Coll, TrivialProp}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.{ErgoTreeSerializer, SigmaSerializer}
import sigma.{Colls}
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.{copyTransaction, testBox}

/** A two-input reduction of the current federated V6 reserve deposit branch. */
class BridgeSubstrateFederatedPooledReserveR7ReductionSpec
    extends AnyFunSuite with Matchers {
  private val RootProperty = "bridge.substrate.federated.r7.root"
  private val CompilerPath =
    "relayer/test-vectors/substrate-federated-v1-settlement-family-compiler-v1.json"
  private val CompilerSha =
    "8a6fa2b2acba330f92718389fc401cc7f15f67602282d949958cc072406fa20e"
  private val RequestPath =
    "relayer/test-vectors/substrate-federated-v1-settlement-family-compiler-request.json"
  private val RequestSha =
    "2452f61fcda7fc8f25fbace6336a55b9c82d7cf9654515f3e61635ff820ec8ce"
  private val SigmaCommit = "f78deadd668f801e7fae3bc884283f79c6f484fa"
  private val ReserveId =
    "16ac723b2c5e899240173abbb5632aa4a1730c0688ada499898a63b05389421c"
  private val ReserveSha =
    "c0daea38f6aa856c2a260386fb51c95209673e20851663cb239a75432605b25d"
  private val SourceId =
    "76c16560b4232d3d992febfd3a9939b67203424087b5b54a1845e13b39464402"
  private val SourceSha =
    "d9b5193eef560ede574f39b4dce3c5615ce5543caa680cd1cff413f70b8703ea"
  private val ActivatedVersion = 3.toByte
  private val Amount = 10000000L
  private val Height = 200
  private val MinerFeeTreeHex =
    "1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304"
  private val DepositorTreeHex =
    "0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
  private val CommitmentDomain =
    "E2S_PEG_IN_DEPOSIT_COMMITMENT_V4".getBytes(StandardCharsets.US_ASCII)
  private val Message = Blake2b256("federated V6 R7 reduction").toArray

  private lazy val compiler = readPinned(CompilerPath, CompilerSha)
  private lazy val request = readPinned(RequestPath, RequestSha)
  private lazy val requestProfile = request.hcursor.downField("profile")
  private lazy val requestTracker = request.hcursor.downField("tracker")
  private lazy val familyId = hex(field(
    requestProfile.downField("familyIdHex"), "family ID"))
  private lazy val nftId = hex(field(
    requestProfile.downField("pooledReserveNftIdHex"), "reserve NFT"))
  private lazy val reserveTree = contractTree("pooledReserve", 1962, ReserveSha, ReserveId)
  private lazy val sourceTree = contractTree("sourceLock", 1317, SourceSha, SourceId)
  private lazy val depositorTree =
    ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(hex(DepositorTreeHex))
  private lazy val minerFeeTree =
    ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(hex(MinerFeeTreeHex))

  test("compiled federated V6 reserve characterizes acceptance of a deposit successor with R7") {
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
    val baselineResults = verifyBoth(baseline, inputs)
    withClue("V6 positive deposit must validate both protected inputs: ") {
      baselineResults shouldBe Vector(Right(true), Right(true))
    }

    val r7Successor = new ErgoBoxCandidate(
      successor.value,
      successor.ergoTree,
      successor.creationHeight,
      successor.additionalTokens,
      successor.additionalRegisters.toMap.updated(
        ErgoBox.R7, LongConstant(0L)))
    val twin = copyTransaction(baseline)(
      outputCandidates = IndexedSeq(r7Successor, feeOutput))
    val parsedTwin = parseTransaction(twin.messageToSign)
    parsedTwin.outputCandidates.head.additionalRegisters(ErgoBox.R7).value shouldBe 0L
    val twinResults = verifyBoth(twin, inputs)
    twinResults(1) shouldBe Right(true)
    twinResults(0) match {
      case Right(true) => succeed
      case Right(false) => fail("CONTRACT_FALSE: V6 reserve rejected an extra R7")
      case Left(error) => fail("EVALUATION_FAILURE: " + error.getClass.getName)
    }
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
