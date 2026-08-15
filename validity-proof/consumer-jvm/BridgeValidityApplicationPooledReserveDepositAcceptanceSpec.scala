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
import scorex.crypto.authds.avltree.batch.{BatchAVLProver, Insert, Lookup}
import scorex.crypto.authds.{ADKey, ADValue}
import scorex.crypto.hash.{Blake2b256, Digest32}
import sigma.VersionContext
import sigma.ast._
import sigma.data.{
  AvlTreeData,
  AvlTreeFlags,
  CAvlTree,
  Digest32Coll,
  ProveDlog,
  TrivialProp
}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.ErgoTreeSerializer
import sigma.{Coll, Colls}
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.{copyBox, copyTransaction, testBox}
import sigmastate.utils.Helpers

class BridgeValidityApplicationPooledReserveDepositAcceptanceSpec
    extends AnyFunSuite with Matchers {
  private val RootProperty =
    "bridge.validity.application.pooled.reserve.deposit.root"
  private val ReceiptRelativePath =
    "relayer/test-vectors/validity-application-pooled-reserve-compiler-v4.json"
  private val ReceiptSha256 =
    "69a545564256e84b28c6744f96e3a484eac76b3c30b97f99f6eee14fda57dc52"
  private val ReceiptSchema =
    "e2s.validity-application-pooled-reserve-compiler-batch.v1"
  private val ContractReceiptSchema =
    "e2s.validity-application-pooled-reserve-compiler-receipt.v1"
  private val SigmaStateCommit =
    "f78deadd668f801e7fae3bc884283f79c6f484fa"

  private val SourceLockContractId =
    "6ff71fb0c46f1e2d2d20e8f963388a3e9c01c3d2aa891daebbde6f91f3960424"
  private val SourceLockPropositionSha256 =
    "5143eeccecab4aed51a6f35b460a149a31185f724c42072c957054b6ae916cc2"
  private val SourceLockPropositionBytes = 1317
  private val ReserveContractId =
    "89614a780176b0fdc214cd05fc0b7859d143482ef4bec86af64aa3f780d9a07c"
  private val ReservePropositionSha256 =
    "7acb08e428f076dcbf03762fdac56a16a05015d4827dd69e15a2da6a2d099ad7"
  private val ReservePropositionBytes = 2981

  private val SourceNetworkId = hex("11" * 32)
  private val SidechainId = hex("22" * 32)
  private val BridgeAddress = hex("33" * 20)
  private val TokenAddress = hex("44" * 20)
  private val SettlementProfileId = hex("55" * 32)
  private val PooledReserveProfileId =
    hex("f0cd15e335996211353a2eb895b5bbdeaf7a5de4f10ec0f547a8f6e505a522f9")
  private val PooledReserveNftId =
    hex("b7ca9a5aaac5b702dc9e21d6f3de0f8f7d23e3932d3ac018fd64316071cb21f8")
  private val ZeroAssetId = Array.fill[Byte](32)(0)
  private val RecipientOne = hex("66" * 20)
  private val RecipientTwo = hex("67" * 20)
  private val DepositorPublicKey =
    "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
  private val MinerFeeTreeHex =
    "1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304"
  private val DepositCommitmentDomain =
    "E2S_PEG_IN_DEPOSIT_COMMITMENT_V4"
      .getBytes(StandardCharsets.US_ASCII)

  private val ReserveSeed = 100000000L
  private val FirstAmount = 10000000L
  private val SecondAmount = 12000000L
  private val FeeValue = 1100000L
  private val ReserveCreationHeight = 50
  private val FirstSourceCreationHeight = 100
  private val SecondSourceCreationHeight = 150
  private val FirstCommitHeight = 200
  private val SecondCommitHeight = 300
  private val EscapeTimeout = 10000
  private val TimeoutMinusOne =
    FirstSourceCreationHeight + EscapeTimeout - 1
  private val TimeoutHeight =
    FirstSourceCreationHeight + EscapeTimeout
  private val Message = Blake2b256(
    "pooled reserve V4 deposit acceptance fixture").toArray

  private lazy val receipt = {
    val rootValue = System.getProperty(RootProperty)
    require(rootValue != null && rootValue.nonEmpty, s"missing -D$RootProperty")
    val root = Paths.get(rootValue).toAbsolutePath.normalize()
    require(
      Files.isDirectory(root) && !Files.isSymbolicLink(root),
      "bridge root must be a real directory")
    val path = root.resolve(ReceiptRelativePath).normalize()
    require(
      path.startsWith(root) &&
        Files.isRegularFile(path) &&
        !Files.isSymbolicLink(path),
      "pooled-reserve compiler receipt must be a real in-root file")
    val bytes = Files.readAllBytes(path)
    sha256(bytes) shouldBe ReceiptSha256
    require(
      bytes.nonEmpty && bytes.forall(byte => (byte & 0xff) <= 0x7f),
      "pooled-reserve compiler receipt must be non-empty ASCII JSON")
    parser.parse(new String(bytes, StandardCharsets.US_ASCII)).fold(
      failure => throw new IllegalArgumentException(
        "pooled-reserve compiler receipt JSON rejected: " +
          failure.getMessage),
      identity)
  }

  private lazy val sourceLockTree = exactTree(
    contractReceipt("sourceLock"),
    "source lock",
    SourceLockContractId,
    SourceLockPropositionSha256,
    SourceLockPropositionBytes)
  private lazy val reserveTree = exactTree(
    contractReceipt("pooledReserve"),
    "pooled reserve",
    ReserveContractId,
    ReservePropositionSha256,
    ReservePropositionBytes)
  private lazy val depositorTree =
    ErgoTree.fromProposition(
      ProveDlog(Helpers.decodeECPoint(DepositorPublicKey)))
  private lazy val minerFeeTree =
    ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(
      hex(MinerFeeTreeHex))
  private lazy val falseTree =
    ErgoTree.fromProposition(TrivialProp.FalseProp)
  private lazy val reserveToken: ErgoBox.Token =
    (Digest32Coll @@ Colls.fromArray(PooledReserveNftId.clone())) -> 1L
  private lazy val wrongReserveToken: ErgoBox.Token =
    (Digest32Coll @@ Colls.fromArray(hex("7f" * 32))) -> 1L

  private final case class DepositFixture(
      reserveIn: ErgoBox,
      source: ErgoBox,
      feeIn: ErgoBox,
      transaction: ErgoLikeTransaction,
      proof: Array[Byte],
      commitment: Array[Byte],
      successorDigest: Array[Byte],
      height: Int)

  private final case class DepositChain(
      emptyDigest: Array[Byte],
      first: DepositFixture,
      second: DepositFixture,
      repeatedKeyProof: Array[Byte],
      wrongCommitmentProof: Array[Byte],
      wrongCommitmentDigest: Array[Byte])

  private lazy val chain = buildChain()

  test("canonical receipt pins the exact V4 source-lock and reserve propositions") {
    val cursor = receipt.hcursor
    requiredString(cursor.downField("schema"), "receipt schema") shouldBe
      ReceiptSchema
    requiredInt(cursor.downField("version"), "receipt version") shouldBe 1
    requiredString(
      cursor.downField("sigmaStateCommit"),
      "SigmaState commit") shouldBe SigmaStateCommit
    requiredString(cursor.downField("scalaVersion"), "Scala version") shouldBe
      "2.13.18"
    requiredString(cursor.downField("sbtVersion"), "sbt version") shouldBe
      "1.12.11"

    val roles = requiredArray(
      cursor.downField("contracts"),
      "compiler contracts").map(value =>
      requiredString(value.hcursor.downField("role"), "contract role"))
    roles should contain theSameElementsAs Vector(
      "tracker",
      "duplicatePrevention",
      "sourceLock",
      "pooledReserve")
    roles.distinct should have size 4

    hex(Blake2b256(sourceLockTree.bytes)) shouldBe SourceLockContractId
    sha256(sourceLockTree.bytes) shouldBe SourceLockPropositionSha256
    sourceLockTree.bytes.length shouldBe SourceLockPropositionBytes
    hex(Blake2b256(reserveTree.bytes)) shouldBe ReserveContractId
    sha256(reserveTree.bytes) shouldBe ReservePropositionSha256
    reserveTree.bytes.length shouldBe ReservePropositionBytes

    Vector(
      "profileActivated",
      "nodeCheckPerformed",
      "signingAuthorityEstablished",
      "submissionAuthorityEstablished",
      "broadcastAuthorityEstablished",
      "fundsAuthorityEstablished",
      "gate5Closed").foreach { field =>
      requiredBoolean(cursor.downField(field), field) shouldBe false
    }
  }

  test("first empty-reserve deposit reduces both protected inputs") {
    val first = chain.first
    val reserve = first.reserveIn
    reserveAvl(reserve).digest.toArray should contain theSameElementsInOrderAs
      chain.emptyDigest
    reserveLiability(reserve) shouldBe 0L
    assertFixtureExtensionShape(first.transaction)
    assertAccepted("first deposit", first)
    assertDepositConservation(first)
  }

  test("second deposit consumes the first successor and non-empty AVL history") {
    val first = chain.first
    val second = chain.second
    second.reserveIn.id should contain theSameElementsInOrderAs
      first.transaction.outputs.head.id
    reserveAvl(second.reserveIn).digest.toArray should
      contain theSameElementsInOrderAs first.successorDigest
    reserveLiability(second.reserveIn) shouldBe FirstAmount
    java.util.Arrays.equals(second.source.id, first.source.id) shouldBe false
    assertFixtureExtensionShape(second.transaction)
    assertAccepted("second deposit", second)
    assertDepositConservation(second)
  }

  test("commit and refund branches meet at an exact disjoint timeout") {
    val first = chain.first
    val beforeTimeout = copyFixture(first, height = TimeoutMinusOne)
    assertAccepted("commit at timeout minus one", beforeTimeout)

    val atTimeout = copyFixture(first, height = TimeoutHeight)
    assertRejected(
      "commit at timeout",
      atTimeout.transaction,
      boxes(atTimeout),
      IndexedSeq.empty,
      TimeoutHeight,
      Set(1))

    val refund = refundFixture(first.source, first.feeIn)
    assertFixtureExtensionShape(
      refund._1,
      expected = Vector(Set.empty, Set.empty))
    verifyIndices(
      refund._1,
      refund._2,
      IndexedSeq.empty,
      TimeoutHeight,
      Vector(0),
      enforceFixtureShape = false) shouldBe Vector(Right(true))
    verifyIndices(
      refund._1,
      refund._2,
      IndexedSeq.empty,
      TimeoutHeight + 1,
      Vector(0),
      enforceFixtureShape = false) shouldBe Vector(Right(true))
  }

  test("refund branch rejects isolated identity, value, fee, and topology drift") {
    val first = chain.first
    val canonical = refundFixture(first.source, first.feeIn)
    val transaction = canonical._1
    val spendingBoxes = canonical._2
    val refundOut = transaction.outputCandidates.head
    val feeOut = transaction.outputCandidates(1)

    assertRefundRejected(
      "refund before timeout",
      transaction,
      spendingBoxes,
      TimeoutHeight - 1)

    assertRefundRejected(
      "wrong refund recipient",
      withOutputs(
        transaction,
        transaction.outputCandidates.updated(
          0,
          copyCandidate(refundOut)(ergoTree = falseTree))),
      spendingBoxes)

    Vector(-1L, 1L).foreach { delta =>
      assertRefundRejected(
        s"refund value delta $delta",
        withOutputs(
          transaction,
          transaction.outputCandidates.updated(
            0,
            copyCandidate(refundOut)(value = refundOut.value + delta))),
        spendingBoxes)
    }

    assertRefundRejected(
      "wrong refund source ID",
      withOutputs(
        transaction,
        transaction.outputCandidates.updated(
          0,
          copyCandidate(refundOut)(
            additionalRegisters = Map(
              ErgoBox.R4 ->
                ByteArrayConstant(flipped(first.source.id)))))),
      spendingBoxes)

    assertRefundRejected(
      "token-bearing refund",
      withOutputs(
        transaction,
        transaction.outputCandidates.updated(
          0,
          copyCandidate(refundOut)(
            additionalTokens =
              Colls.fromArray(Array(wrongReserveToken))))),
      spendingBoxes)

    Vector(
      "format version" -> 0,
      "source network" -> 1,
      "sidechain" -> 33,
      "bridge address" -> 65,
      "token address" -> 85,
      "settlement profile" -> 105,
      "pooled-reserve profile" -> 137,
      "source asset" -> 169,
      "source amount" -> 201
    ).foreach { case (label, offset) =>
      val intent = first.source.additionalRegisters(ErgoBox.R4).value
        .asInstanceOf[Coll[Byte]].toArray.clone()
      intent(offset) = (intent(offset) ^ 1).toByte
      val mutatedSource = copyBox(first.source)(
        additionalRegisters =
          first.source.additionalRegisters.toMap.updated(
            ErgoBox.R4,
            ByteArrayConstant(intent)))
      val mutatedRefundOut = copyCandidate(refundOut)(
        additionalRegisters = Map(
          ErgoBox.R4 -> ByteArrayConstant(mutatedSource.id)))
      assertRefundRejected(
        s"source-intent $label",
        withOutputs(
          withSpendingBox(transaction, 0, mutatedSource),
          transaction.outputCandidates.updated(0, mutatedRefundOut)),
        spendingBoxes.updated(0, mutatedSource))
    }

    val zeroRecipientIntent =
      first.source.additionalRegisters(ErgoBox.R4).value
        .asInstanceOf[Coll[Byte]].toArray.clone()
    java.util.Arrays.fill(zeroRecipientIntent, 209, 229, 0.toByte)
    val zeroRecipientSource = copyBox(first.source)(
      additionalRegisters =
        first.source.additionalRegisters.toMap.updated(
          ErgoBox.R4,
          ByteArrayConstant(zeroRecipientIntent)))
    val zeroRecipientRefundOut = copyCandidate(refundOut)(
      additionalRegisters = Map(
        ErgoBox.R4 -> ByteArrayConstant(zeroRecipientSource.id)))
    assertRefundRejected(
      "zero source-intent recipient",
      withOutputs(
        withSpendingBox(transaction, 0, zeroRecipientSource),
        transaction.outputCandidates.updated(0, zeroRecipientRefundOut)),
      spendingBoxes.updated(0, zeroRecipientSource))

    assertRefundRejected(
      "wrong fee proposition",
      withOutputs(
        transaction,
        transaction.outputCandidates.updated(
          1,
          copyCandidate(feeOut)(ergoTree = depositorTree))),
      spendingBoxes)

    assertRefundRejected(
      "fee value leakage",
      withOutputs(
        transaction,
        transaction.outputCandidates.updated(
          1,
          copyCandidate(feeOut)(value = FeeValue - 1L))),
      spendingBoxes)

    assertRefundRejected(
      "token-bearing fee output",
      withOutputs(
        transaction,
        transaction.outputCandidates.updated(
          1,
          copyCandidate(feeOut)(
            additionalTokens =
              Colls.fromArray(Array(wrongReserveToken))))),
      spendingBoxes)

    val tokenFee = copyBox(first.feeIn)(
      additionalTokens = Colls.fromArray(Array(wrongReserveToken)))
    assertRefundRejected(
      "token-bearing fee input",
      withSpendingBox(transaction, 1, tokenFee),
      spendingBoxes.updated(1, tokenFee))

    Vector(999999L, 2100001L).foreach { feeValue =>
      val boundedFee = copyBox(first.feeIn)(value = feeValue)
      val boundedTx = withOutputs(
        withSpendingBox(transaction, 1, boundedFee),
        transaction.outputCandidates.updated(
          1,
          copyCandidate(feeOut)(value = feeValue)))
      assertRefundRejected(
        s"fee bound $feeValue",
        boundedTx,
        spendingBoxes.updated(1, boundedFee))
    }

    val decoy = testBox(1000000L, depositorTree, TimeoutHeight)
    assertRefundRejected(
      "unexpected data input",
      copyTransaction(transaction)(
        dataInputs = IndexedSeq(DataInput(decoy.id))),
      spendingBoxes,
      dataBoxes = IndexedSeq(decoy))

    val extraInput = Input(
      decoy.id,
      ProverResult(Array.emptyByteArray, ContextExtension.empty))
    assertRefundRejected(
      "extra input",
      copyTransaction(transaction)(
        inputs = transaction.inputs :+ extraInput),
      spendingBoxes :+ decoy)

    assertRefundRejected(
      "missing fee input",
      copyTransaction(transaction)(
        inputs = IndexedSeq(transaction.inputs.head)),
      IndexedSeq(first.source))

    assertRefundRejected(
      "swapped inputs",
      copyTransaction(transaction)(inputs = transaction.inputs.reverse),
      spendingBoxes.reverse,
      sourceIndex = 1)

    assertRefundRejected(
      "extra output",
      withOutputs(
        transaction,
        transaction.outputCandidates :+
          copyCandidate(refundOut)(value = 1000000L)),
      spendingBoxes)

    assertRefundRejected(
      "missing fee output",
      withOutputs(
        transaction,
        IndexedSeq(refundOut)),
      spendingBoxes)

    assertRefundRejected(
      "swapped outputs",
      withOutputs(
        transaction,
        transaction.outputCandidates.reverse),
      spendingBoxes)
  }

  test("reserve NFT, proposition, and profile reject independently") {
    val first = chain.first

    val wrongNft = copyBox(first.reserveIn)(
      additionalTokens = Colls.fromArray(Array(wrongReserveToken)))
    assertRejectedWithBox(
      "independently issued reserve NFT",
      first,
      0,
      wrongNft,
      Set(0, 1))

    val clonedShape = copyBox(first.reserveIn)(ergoTree = falseTree)
    val clonedOut = copyCandidate(first.transaction.outputCandidates.head)(
      ergoTree = falseTree)
    val clonedTx = withOutputs(
      withSpendingBox(first.transaction, 0, clonedShape),
      first.transaction.outputCandidates.updated(0, clonedOut))
    assertRejected(
      "cloned reserve shape under a foreign proposition",
      clonedTx,
      boxes(first).updated(0, clonedShape),
      IndexedSeq.empty,
      first.height,
      Set(0))

    val wrongProfile = copyBox(first.reserveIn)(
      additionalRegisters =
        first.reserveIn.additionalRegisters.toMap.updated(
          ErgoBox.R4,
          ByteArrayConstant(flipped(PooledReserveProfileId))))
    assertRejectedWithBox(
      "wrong reserve profile",
      first,
      0,
      wrongProfile,
      Set(0, 1))

    val wrongSuccessorTree =
      copyCandidate(first.transaction.outputCandidates.head)(
        ergoTree = falseTree)
    assertRejectedWithOutputs(
      "wrong reserve successor proposition",
      first,
      first.transaction.outputCandidates.updated(0, wrongSuccessorTree),
      Set(0, 1))
  }

  test("source identity and AVL insertion reject independently") {
    val first = chain.first
    val second = chain.second

    val foreignSource = copyBox(first.source)(ergoTree = falseTree)
    assertRejectedWithBox(
      "foreign source lock",
      first,
      1,
      foreignSource,
      Set(0, 1))

    val omittedInputs = IndexedSeq(
      first.transaction.inputs(0),
      first.transaction.inputs(2))
    val omittedBoxes = IndexedSeq(first.reserveIn, first.feeIn)
    val omittedTx = copyTransaction(first.transaction)(inputs = omittedInputs)
    verifyIndices(
      omittedTx,
      omittedBoxes,
      IndexedSeq.empty,
      first.height,
      Vector(0),
      enforceFixtureShape = false).head should not be Right(true)

    val malformedProof = first.proof.clone()
    malformedProof(malformedProof.length / 2) =
      (malformedProof(malformedProof.length / 2) ^ 1).toByte
    assertRejected(
      "malformed insert proof",
      withExtensionBytes(first.transaction, 0, malformedProof),
      boxes(first),
      IndexedSeq.empty,
      first.height,
      Set(0))

    assertRejected(
      "stale empty-tree proof on the populated reserve",
      withExtensionBytes(second.transaction, 0, first.proof),
      boxes(second),
      IndexedSeq.empty,
      second.height,
      Set(0))

    val repeated = depositTransaction(
      second.reserveIn,
      first.source,
      first.feeIn,
      chain.repeatedKeyProof,
      first.successorDigest,
      SecondCommitHeight)
    assertRejected(
      "repeated source key",
      repeated,
      IndexedSeq(second.reserveIn, first.source, first.feeIn),
      IndexedSeq.empty,
      SecondCommitHeight,
      Set(0))

    val wrongCommitment = depositTransaction(
      first.reserveIn,
      first.source,
      first.feeIn,
      chain.wrongCommitmentProof,
      chain.wrongCommitmentDigest,
      first.height)
    assertRejected(
      "proof for a wrong deposit commitment",
      wrongCommitment,
      boxes(first),
      IndexedSeq.empty,
      first.height,
      Set(0))
  }

  test("reserve conservation and fee funding reject isolated drift") {
    val first = chain.first
    val reserveOut = first.transaction.outputCandidates.head

    val highValue = copyCandidate(reserveOut)(value = reserveOut.value + 1L)
    assertRejectedWithOutputs(
      "reserve value plus one",
      first,
      first.transaction.outputCandidates.updated(0, highValue),
      Set(0, 1))

    val lowValue = copyCandidate(reserveOut)(value = reserveOut.value - 1L)
    assertRejectedWithOutputs(
      "reserve value minus one",
      first,
      first.transaction.outputCandidates.updated(0, lowValue),
      Set(0, 1))

    val lowLiability = copyCandidate(reserveOut)(
      additionalRegisters = reserveOut.additionalRegisters.toMap.updated(
        ErgoBox.R6,
        LongConstant(FirstAmount - 1L)))
    assertRejectedWithOutputs(
      "reserve liability minus one",
      first,
      first.transaction.outputCandidates.updated(0, lowLiability),
      Set(0, 1))

    val highLiability = copyCandidate(reserveOut)(
      additionalRegisters = reserveOut.additionalRegisters.toMap.updated(
        ErgoBox.R6,
        LongConstant(FirstAmount + 1L)))
    assertRejectedWithOutputs(
      "reserve liability plus one",
      first,
      first.transaction.outputCandidates.updated(0, highLiability),
      Set(0, 1))

    val coordinatedSeedDrift = copyCandidate(reserveOut)(
      value = reserveOut.value + 1L,
      additionalRegisters = reserveOut.additionalRegisters.toMap.updated(
        ErgoBox.R6,
        LongConstant(FirstAmount + 1L)))
    assertRejectedWithOutputs(
      "coordinated reserve value and liability drift",
      first,
      first.transaction.outputCandidates.updated(0, coordinatedSeedDrift),
      Set(0, 1))

    val leakingFee = copyCandidate(first.transaction.outputCandidates(1))(
      value = FeeValue - 1L)
    assertRejectedWithOutputs(
      "fee leakage",
      first,
      first.transaction.outputCandidates.updated(1, leakingFee),
      Set(0, 1))
  }

  test("data inputs, ordering, and cardinality reject") {
    val first = chain.first
    val decoy = testBox(1000000L, depositorTree, FirstCommitHeight)
    val withData = copyTransaction(first.transaction)(
      dataInputs = IndexedSeq(DataInput(decoy.id)))
    assertRejected(
      "unexpected data input",
      withData,
      boxes(first),
      IndexedSeq(decoy),
      first.height,
      Set(0, 1))

    val swappedInputs = IndexedSeq(
      first.transaction.inputs(1),
      first.transaction.inputs(0),
      first.transaction.inputs(2))
    val swappedTx = copyTransaction(first.transaction)(inputs = swappedInputs)
    assertRejected(
      "protected input ordering",
      swappedTx,
      IndexedSeq(first.source, first.reserveIn, first.feeIn),
      IndexedSeq.empty,
      first.height,
      Set(0, 1),
      protectedIndices = Vector(0, 1),
      enforceFixtureShape = false)

    assertRejectedWithOutputs(
      "output ordering",
      first,
      first.transaction.outputCandidates.reverse,
      Set(0, 1))

    val extraInput = Input(
      decoy.id,
      ProverResult(Array.emptyByteArray, ContextExtension.empty))
    val extraTx = copyTransaction(first.transaction)(
      inputs = first.transaction.inputs :+ extraInput)
    assertRejected(
      "extra input",
      extraTx,
      boxes(first) :+ decoy,
      IndexedSeq.empty,
      first.height,
      Set(0, 1),
      enforceFixtureShape = false)

    val missingOutput = withOutputs(
      first.transaction,
      IndexedSeq(first.transaction.outputCandidates.head))
    assertRejected(
      "missing fee output",
      missingOutput,
      boxes(first),
      IndexedSeq.empty,
      first.height,
      Set(0, 1))
  }

  test("Var(0) fails closed and fixture extensions have exact key sets") {
    val first = chain.first
    val missing = withExtension(first.transaction, 0, ContextExtension.empty)
    verifyIndices(
      missing,
      boxes(first),
      IndexedSeq.empty,
      first.height,
      Vector(0, 1),
      enforceFixtureShape = false)(0) should not be Right(true)

    val wrongType = withExtension(
      first.transaction,
      0,
      ContextExtension(Map(0.toByte -> LongConstant(1L))))
    verifyIndices(
      wrongType,
      boxes(first),
      IndexedSeq.empty,
      first.height,
      Vector(0, 1),
      enforceFixtureShape = false)(0) should not be Right(true)

    val extraKey = ContextExtension(
      first.transaction.inputs(0).extension.values.toMap.updated(
        1.toByte,
        ByteArrayConstant(Array(1.toByte))))
    val extra = withExtension(first.transaction, 0, extraKey)
    an[IllegalArgumentException] should be thrownBy
      assertFixtureExtensionShape(extra)

    assertFixtureExtensionShape(first.transaction)
    first.transaction.inputs(0).extension.values.keySet shouldBe Set(0.toByte)
    first.transaction.inputs(1).extension.values.keySet shouldBe Set.empty
    first.transaction.inputs(2).extension.values.keySet shouldBe Set.empty
  }

  test("isolated mutations prove that both protected predicates are evaluated") {
    val first = chain.first

    val reserveOnlyFailure = withExtensionBytes(
      first.transaction,
      0,
      flipped(first.proof))
    val reserveResults = verifyIndices(
      reserveOnlyFailure,
      boxes(first),
      IndexedSeq.empty,
      first.height,
      Vector(0, 1),
      enforceFixtureShape = true)
    reserveResults(0) should not be Right(true)
    reserveResults(1) shouldBe Right(true)

    val sourceOnlyFailure = copyFixture(first, height = TimeoutHeight)
    val sourceResults = verifyIndices(
      sourceOnlyFailure.transaction,
      boxes(sourceOnlyFailure),
      IndexedSeq.empty,
      sourceOnlyFailure.height,
      Vector(0, 1),
      enforceFixtureShape = true)
    sourceResults(0) shouldBe Right(true)
    sourceResults(1) should not be Right(true)
  }

  private def buildChain(): DepositChain = {
    val prover =
      new BatchAVLProver[Digest32, Blake2b256.type](
        keyLength = 32,
        valueLengthOpt = Some(32))
    val emptyDigest = prover.digest.clone()
    val emptyState = avlTree(emptyDigest)
    val genesis = reserveBox(
      ReserveSeed,
      liability = 0L,
      emptyState,
      ReserveCreationHeight)
    val firstSource = sourceBox(
      FirstAmount,
      RecipientOne,
      FirstSourceCreationHeight)
    val firstCommitment = depositCommitment(firstSource)
    val firstInsert = insert(
      prover,
      firstSource.id,
      firstCommitment,
      "first deposit")
    val firstFee = feeBox(FirstCommitHeight)
    val firstTx = depositTransaction(
      genesis,
      firstSource,
      firstFee,
      firstInsert._1,
      firstInsert._2,
      FirstCommitHeight)
    val first = DepositFixture(
      genesis,
      firstSource,
      firstFee,
      firstTx,
      firstInsert._1,
      firstCommitment,
      firstInsert._2,
      FirstCommitHeight)

    require(
      prover.performOneOperation(
        Lookup(firstSource.id.clone().asInstanceOf[ADKey])).isSuccess,
      "existing first deposit key must be provable")
    val repeatedKeyProof = prover.generateProof().clone()

    val secondSource = sourceBox(
      SecondAmount,
      RecipientTwo,
      SecondSourceCreationHeight)
    require(
      !java.util.Arrays.equals(firstSource.id, secondSource.id),
      "second source lock must have a distinct box ID")
    val secondCommitment = depositCommitment(secondSource)
    val secondInsert = insert(
      prover,
      secondSource.id,
      secondCommitment,
      "second deposit")
    val secondReserve = firstTx.outputs.head
    val secondFee = feeBox(SecondCommitHeight)
    val secondTx = depositTransaction(
      secondReserve,
      secondSource,
      secondFee,
      secondInsert._1,
      secondInsert._2,
      SecondCommitHeight)
    val second = DepositFixture(
      secondReserve,
      secondSource,
      secondFee,
      secondTx,
      secondInsert._1,
      secondCommitment,
      secondInsert._2,
      SecondCommitHeight)

    val wrongProver =
      new BatchAVLProver[Digest32, Blake2b256.type](
        keyLength = 32,
        valueLengthOpt = Some(32))
    require(
      java.util.Arrays.equals(wrongProver.digest, emptyDigest),
      "independent empty 32/32 AVL histories must agree")
    val wrongValue = flipped(firstCommitment)
    val wrongInsert = insert(
      wrongProver,
      firstSource.id,
      wrongValue,
      "wrong commitment")

    DepositChain(
      emptyDigest,
      first,
      second,
      repeatedKeyProof,
      wrongInsert._1,
      wrongInsert._2)
  }

  private def insert(
      prover: BatchAVLProver[Digest32, Blake2b256.type],
      key: Array[Byte],
      value: Array[Byte],
      label: String): (Array[Byte], Array[Byte]) = {
    require(key.length == 32 && value.length == 32, s"$label must be 32/32")
    require(
      prover.performOneOperation(
        Insert(
          key.clone().asInstanceOf[ADKey],
          value.clone().asInstanceOf[ADValue])).isSuccess,
      s"$label insertion must succeed")
    val proof = prover.generateProof().clone()
    require(proof.nonEmpty, s"$label proof must be non-empty")
    (proof, prover.digest.clone())
  }

  private def depositTransaction(
      reserve: ErgoBox,
      source: ErgoBox,
      fee: ErgoBox,
      proof: Array[Byte],
      successorDigest: Array[Byte],
      height: Int): ErgoLikeTransaction = {
    val amount = source.value
    val liability = reserveLiability(reserve)
    require(
      amount > 0L &&
        reserve.value <= Long.MaxValue - amount &&
        liability <= Long.MaxValue - amount,
      "deposit fixture must not overflow a signed Long")
    val successor = new ErgoBoxCandidate(
      reserve.value + amount,
      reserve.ergoTree,
      height,
      reserve.additionalTokens,
      Map(
        ErgoBox.R4 -> ByteArrayConstant(PooledReserveProfileId.clone()),
        ErgoBox.R5 -> AvlTreeConstant(avlTree(successorDigest)),
        ErgoBox.R6 -> LongConstant(liability + amount)))
    val minerFee = new ErgoBoxCandidate(
      fee.value,
      minerFeeTree,
      height,
      Colls.emptyColl,
      Map.empty)
    new ErgoLikeTransaction(
      IndexedSeq(
        Input(
          reserve.id,
          ProverResult(
            Array.emptyByteArray,
            ContextExtension(
              Map(0.toByte -> ByteArrayConstant(proof.clone()))))),
        Input(
          source.id,
          ProverResult(Array.emptyByteArray, ContextExtension.empty)),
        Input(
          fee.id,
          ProverResult(Array.emptyByteArray, ContextExtension.empty))),
      IndexedSeq.empty,
      IndexedSeq(successor, minerFee))
  }

  private def refundFixture(
      source: ErgoBox,
      fee: ErgoBox): (ErgoLikeTransaction, IndexedSeq[ErgoBox]) = {
    val refund = new ErgoBoxCandidate(
      source.value,
      depositorTree,
      TimeoutHeight,
      Colls.emptyColl,
      Map(ErgoBox.R4 -> ByteArrayConstant(source.id.clone())))
    val minerFee = new ErgoBoxCandidate(
      fee.value,
      minerFeeTree,
      TimeoutHeight,
      Colls.emptyColl,
      Map.empty)
    val tx = new ErgoLikeTransaction(
      IndexedSeq(
        Input(
          source.id,
          ProverResult(Array.emptyByteArray, ContextExtension.empty)),
        Input(
          fee.id,
          ProverResult(Array.emptyByteArray, ContextExtension.empty))),
      IndexedSeq.empty,
      IndexedSeq(refund, minerFee))
    (tx, IndexedSeq(source, fee))
  }

  private def sourceBox(
      amount: Long,
      recipient: Array[Byte],
      creationHeight: Int): ErgoBox = {
    val intent = sourceIntent(amount, recipient)
    testBox(
      amount,
      sourceLockTree,
      creationHeight,
      additionalRegisters = Map(
        ErgoBox.R4 -> ByteArrayConstant(intent),
        ErgoBox.R5 -> ByteArrayConstant(depositorTree.bytes.clone())))
  }

  private def reserveBox(
      value: Long,
      liability: Long,
      avl: AvlTreeData,
      creationHeight: Int): ErgoBox =
    testBox(
      value,
      reserveTree,
      creationHeight,
      additionalTokens = Seq(reserveToken),
      additionalRegisters = Map(
        ErgoBox.R4 -> ByteArrayConstant(PooledReserveProfileId.clone()),
        ErgoBox.R5 -> AvlTreeConstant(avl),
        ErgoBox.R6 -> LongConstant(liability)))

  private def feeBox(creationHeight: Int): ErgoBox =
    testBox(FeeValue, depositorTree, creationHeight)

  private def sourceIntent(
      amount: Long,
      recipient: Array[Byte]): Array[Byte] = {
    require(amount > 0L, "source amount must be positive")
    require(recipient.length == 20, "recipient must be 20 bytes")
    val encoded = ByteBuffer.allocate(229)
      .put(2.toByte)
      .put(SourceNetworkId)
      .put(SidechainId)
      .put(BridgeAddress)
      .put(TokenAddress)
      .put(SettlementProfileId)
      .put(PooledReserveProfileId)
      .put(ZeroAssetId)
      .putLong(amount)
      .put(recipient)
      .array()
    require(encoded.length == 229, "source intent must be exactly 229 bytes")
    encoded
  }

  private def depositCommitment(source: ErgoBox): Array[Byte] = {
    val intent = source.additionalRegisters(ErgoBox.R4).value
      .asInstanceOf[Coll[Byte]].toArray
    Blake2b256(
      DepositCommitmentDomain ++
        PooledReserveProfileId ++
        source.id ++
        intent).toArray
  }

  private def avlTree(digest: Array[Byte]): AvlTreeData = {
    require(digest.length == 33, "AVL digest must be 33 bytes")
    new AvlTreeData(
      Colls.fromArray(digest.clone()),
      AvlTreeFlags.InsertOnly,
      32,
      Some(32))
  }

  private def reserveAvl(box: ErgoBox): AvlTreeData =
    avlData(box.additionalRegisters(ErgoBox.R5).value)

  private def reserveLiability(box: ErgoBox): Long =
    box.additionalRegisters(ErgoBox.R6).value.asInstanceOf[Long]

  private def boxes(fixture: DepositFixture): IndexedSeq[ErgoBox] =
    IndexedSeq(fixture.reserveIn, fixture.source, fixture.feeIn)

  private def copyFixture(
      fixture: DepositFixture,
      height: Int): DepositFixture =
    fixture.copy(
      transaction = depositTransaction(
        fixture.reserveIn,
        fixture.source,
        fixture.feeIn,
        fixture.proof,
        fixture.successorDigest,
        height),
      height = height)

  private def assertDepositConservation(fixture: DepositFixture): Unit = {
    val successor = fixture.transaction.outputCandidates.head
    val predecessorLiability = reserveLiability(fixture.reserveIn)
    val successorLiability =
      successor.additionalRegisters(ErgoBox.R6).value.asInstanceOf[Long]
    successor.value shouldBe fixture.reserveIn.value + fixture.source.value
    successorLiability shouldBe predecessorLiability + fixture.source.value
    fixture.reserveIn.value - predecessorLiability shouldBe
      successor.value - successorLiability
    avlData(successor.additionalRegisters(ErgoBox.R5).value).digest.toArray should
      contain theSameElementsInOrderAs fixture.successorDigest
  }

  private def assertAccepted(
      label: String,
      fixture: DepositFixture): Unit = {
    val results = verifyIndices(
      fixture.transaction,
      boxes(fixture),
      IndexedSeq.empty,
      fixture.height,
      Vector(0, 1),
      enforceFixtureShape = true)
    withClue(s"$label must accept both protected inputs: ") {
      results shouldBe Vector(Right(true), Right(true))
    }
  }

  private def assertRejectedWithBox(
      label: String,
      fixture: DepositFixture,
      boxIndex: Int,
      replacement: ErgoBox,
      expectedRejectedInputs: Set[Int]): Unit = {
    val tx = withSpendingBox(
      fixture.transaction,
      boxIndex,
      replacement)
    assertRejected(
      label,
      tx,
      boxes(fixture).updated(boxIndex, replacement),
      IndexedSeq.empty,
      fixture.height,
      expectedRejectedInputs)
  }

  private def assertRejectedWithOutputs(
      label: String,
      fixture: DepositFixture,
      outputs: IndexedSeq[ErgoBoxCandidate],
      expectedRejectedInputs: Set[Int]): Unit =
    assertRejected(
      label,
      withOutputs(fixture.transaction, outputs),
      boxes(fixture),
      IndexedSeq.empty,
      fixture.height,
      expectedRejectedInputs)

  private def assertRejected(
      label: String,
      transaction: ErgoLikeTransaction,
      spendingBoxes: IndexedSeq[ErgoBox],
      dataBoxes: IndexedSeq[ErgoBox],
      height: Int,
      expectedRejectedInputs: Set[Int],
      protectedIndices: Vector[Int] = Vector(0, 1),
      enforceFixtureShape: Boolean = true): Unit = {
    val results = verifyIndices(
      transaction,
      spendingBoxes,
      dataBoxes,
      height,
      protectedIndices,
      enforceFixtureShape = enforceFixtureShape)
    withClue(s"$label must reject the protected conjunction: ") {
      results should not be Vector.fill(protectedIndices.length)(Right(true))
      expectedRejectedInputs.foreach { index =>
        val position = protectedIndices.indexOf(index)
        require(position >= 0, s"protected input $index was not evaluated")
        results(position) should not be Right(true)
      }
    }
  }

  private def assertRefundRejected(
      label: String,
      transaction: ErgoLikeTransaction,
      spendingBoxes: IndexedSeq[ErgoBox],
      height: Int = TimeoutHeight,
      dataBoxes: IndexedSeq[ErgoBox] = IndexedSeq.empty,
      sourceIndex: Int = 0): Unit = {
    val result = verifyIndices(
      transaction,
      spendingBoxes,
      dataBoxes,
      height,
      Vector(sourceIndex),
      enforceFixtureShape = false)
    withClue(s"$label must reject the source-lock predicate: ") {
      result shouldBe Vector(Right(false))
    }
  }

  private def verifyIndices(
      transaction: ErgoLikeTransaction,
      spendingBoxes: IndexedSeq[ErgoBox],
      dataBoxes: IndexedSeq[ErgoBox],
      height: Int,
      indices: Vector[Int],
      enforceFixtureShape: Boolean): Vector[Either[Throwable, Boolean]] = {
    if (enforceFixtureShape) {
      assertFixtureExtensionShape(transaction)
    }
    indices.map { index =>
      try {
        require(
          transaction.inputs.length == spendingBoxes.length &&
            transaction.inputs.zip(spendingBoxes).forall {
              case (input, box) =>
                java.util.Arrays.equals(input.boxId, box.id)
            },
          "transaction input IDs must match spending boxes")
        require(
          transaction.dataInputs.length == dataBoxes.length &&
            transaction.dataInputs.zip(dataBoxes).forall {
              case (input, box) =>
                java.util.Arrays.equals(input.boxId, box.id)
            },
          "transaction data-input IDs must match data boxes")
        val context = ErgoLikeContextTesting(
          currentHeight = height,
          lastBlockUtxoRoot = AvlTreeData.dummy,
          minerPubkey = ErgoLikeContextTesting.dummyPubkey,
          dataBoxes = dataBoxes,
          boxesToSpend = spendingBoxes,
          spendingTransaction = transaction,
          selfIndex = index,
          activatedVersion =
            VersionContext.StarkVerificationVersion.toByte)
        val result = new ErgoLikeTestInterpreter().verify(
          spendingBoxes(index).ergoTree,
          context,
          ProverResult(
            Array.emptyByteArray,
            transaction.inputs(index).extension),
          Message)
        result.fold(Left(_), value => Right(value._1))
      } catch {
        case failure: Throwable => Left(failure)
      }
    }
  }

  private def assertFixtureExtensionShape(
      transaction: ErgoLikeTransaction,
      expected: Vector[Set[Byte]] =
        Vector(Set(0.toByte), Set.empty, Set.empty)): Unit = {
    require(
      transaction.inputs.length == expected.length,
      "fixture input count does not match its extension policy")
    transaction.inputs.zip(expected).zipWithIndex.foreach {
      case ((input, keys), index) =>
        require(
          input.extension.values.keySet == keys,
          s"input $index ContextExtension key set is not exact")
    }
  }

  private def withSpendingBox(
      transaction: ErgoLikeTransaction,
      index: Int,
      box: ErgoBox): ErgoLikeTransaction = {
    val input = transaction.inputs(index)
    copyTransaction(transaction)(
      inputs = transaction.inputs.updated(
        index,
        Input(box.id, input.spendingProof)))
  }

  private def withOutputs(
      transaction: ErgoLikeTransaction,
      outputs: IndexedSeq[ErgoBoxCandidate]): ErgoLikeTransaction =
    copyTransaction(transaction)(outputCandidates = outputs)

  private def withExtensionBytes(
      transaction: ErgoLikeTransaction,
      inputIndex: Int,
      proof: Array[Byte]): ErgoLikeTransaction =
    withExtension(
      transaction,
      inputIndex,
      ContextExtension(
        Map(0.toByte -> ByteArrayConstant(proof.clone()))))

  private def withExtension(
      transaction: ErgoLikeTransaction,
      inputIndex: Int,
      extension: ContextExtension): ErgoLikeTransaction = {
    val input = transaction.inputs(inputIndex)
    copyTransaction(transaction)(
      inputs = transaction.inputs.updated(
        inputIndex,
        Input(
          input.boxId,
          ProverResult(input.spendingProof.proof, extension))))
  }

  private def copyCandidate(candidate: ErgoBoxCandidate)(
      value: Long = candidate.value,
      ergoTree: ErgoTree = candidate.ergoTree,
      creationHeight: Int = candidate.creationHeight,
      additionalTokens: Coll[ErgoBox.Token] =
        candidate.additionalTokens,
      additionalRegisters: ErgoBox.AdditionalRegisters =
        candidate.additionalRegisters): ErgoBoxCandidate =
    new ErgoBoxCandidate(
      value,
      ergoTree,
      creationHeight,
      additionalTokens,
      additionalRegisters)

  private def contractReceipt(role: String): Json = {
    val contracts = requiredArray(
      receipt.hcursor.downField("contracts"),
      "compiler contracts")
    val matches = contracts.filter(value =>
      requiredString(value.hcursor.downField("role"), "contract role") == role)
    require(matches.length == 1, s"expected exactly one $role compiler receipt")
    matches.head
  }

  private def exactTree(
      value: Json,
      label: String,
      expectedContractId: String,
      expectedPropositionSha256: String,
      expectedPropositionBytes: Int): ErgoTree = {
    val cursor = value.hcursor
    requiredString(cursor.downField("schema"), s"$label schema") shouldBe
      ContractReceiptSchema
    requiredInt(cursor.downField("version"), s"$label version") shouldBe 1
    requiredString(
      cursor.downField("sigmaStateCommit"),
      s"$label SigmaState commit") shouldBe SigmaStateCommit
    requiredInt(cursor.downField("treeVersion"), s"$label tree version") shouldBe
      0
    requiredString(
      cursor.downField("contractIdHex"),
      s"$label contract ID") shouldBe expectedContractId
    requiredString(
      cursor.downField("propositionSha256Hex"),
      s"$label proposition SHA-256") shouldBe expectedPropositionSha256
    requiredInt(
      cursor.downField("propositionBytes"),
      s"$label proposition bytes") shouldBe expectedPropositionBytes
    val proposition = hex(requiredString(
      cursor.downField("propositionHex"),
      s"$label proposition"))
    proposition.length shouldBe expectedPropositionBytes
    sha256(proposition) shouldBe expectedPropositionSha256
    hex(Blake2b256(proposition)) shouldBe expectedContractId
    ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(proposition)
  }

  private def avlData(value: Any): AvlTreeData =
    value match {
      case tree: CAvlTree => tree.treeData
      case tree: AvlTreeData => tree
      case other => throw new IllegalArgumentException(
        s"expected AVL register value, got ${other.getClass.getName}")
    }

  private def requiredString(cursor: ACursor, label: String): String =
    cursor.as[String].fold(
      failure => throw new IllegalArgumentException(
        s"$label rejected: ${failure.getMessage}"),
      value => {
        require(value.nonEmpty, s"$label must not be empty")
        value
      })

  private def requiredInt(cursor: ACursor, label: String): Int =
    cursor.as[Int].fold(
      failure => throw new IllegalArgumentException(
        s"$label rejected: ${failure.getMessage}"),
      identity)

  private def requiredBoolean(cursor: ACursor, label: String): Boolean =
    cursor.as[Boolean].fold(
      failure => throw new IllegalArgumentException(
        s"$label rejected: ${failure.getMessage}"),
      identity)

  private def requiredArray(cursor: ACursor, label: String): Vector[Json] =
    cursor.focus
      .flatMap(_.asArray)
      .map(_.toVector)
      .getOrElse(throw new IllegalArgumentException(s"$label must be an array"))

  private def flipped(bytes: Array[Byte]): Array[Byte] = {
    require(bytes.nonEmpty, "cannot flip an empty byte array")
    val changed = bytes.clone()
    changed(changed.length / 2) = (changed(changed.length / 2) ^ 1).toByte
    changed
  }

  private def sha256(bytes: Array[Byte]): String =
    hex(MessageDigest.getInstance("SHA-256").digest(bytes))

  private def hex(bytes: Array[Byte]): String =
    bytes.map(byte => f"${byte & 0xff}%02x").mkString

  private def hex(value: String): Array[Byte] = {
    require(
      value.length % 2 == 0 && value.matches("[0-9a-fA-F]*"),
      "hex input must be even-length hexadecimal")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }
}
