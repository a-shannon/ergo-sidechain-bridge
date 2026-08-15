package sigma.bridge

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}

import io.circe.ACursor
import io.circe.parser
import org.ergoplatform._
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.authds.ADKey
import scorex.crypto.hash.Blake2b256
import sigma.Colls
import sigma.ast.SCollection.{SByteArray, SByteArray2}
import sigma.ast._
import sigma.data.Digest32Coll
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.{ErgoTreeSerializer, SigmaSerializer}

class BridgeProoflessTransactionConformanceSpec
    extends AnyFunSuite with Matchers {
  private val FixtureProperty =
    "bridge.eip0045.proofless.transaction.fixture"
  private val Schema = "e2s.bridge-validity-proofless-transaction.v1"
  private val ContextSchema = "e2s.bridge-validity-context-extension.v1"
  private val ContextExtensionDigestHex =
    "62909ee396c68bb80ef85b3edab3d39556ebe944bc61be0e5b95f5e57fd742c4"
  private val StatementDigestHex =
    "e8aa9bc3671f75779cec78c91194ff33c56e7035a4100c6ee9ee644db564dd8c"
  private val RawSealDigestHex =
    "6805511503aec556be20c8bd1573be27ad56518bfc10907df48cd236004977bd"
  private val UnsignedEip12DigestHex =
    "1f57e6469fb3982c316d8f10096e13aede8e3e62100df392c3418f440b0982f4"
  private val ProoflessEip12DigestHex =
    "29432073392169fc49b46edbed2415caa687fbf9fdf30b32be308d2c8f98316f"
  private val TransactionIdHex =
    "89e8063760f991b17cfb9fe685adc11d4f0dab38e6222a12181518468fa9037e"
  private val InputBoxIdHex = "44" * 32
  private val OutputErgoTreeHex = "0008cd02" + ("33" * 32)
  private val OutputBoxIdHex =
    "0e2243e11aa27e468463d68c075063738d16cf199b6ca2f3c5b85b28f8b48426"
  private val ProofChunkLengths = Vector(65535, 65535, 65535, 26063)

  private lazy val fixture = {
    val rawPath = System.getProperty(FixtureProperty)
    require(rawPath != null && rawPath.nonEmpty, s"missing -D$FixtureProperty")
    val path = Paths.get(rawPath).toAbsolutePath.normalize()
    require(Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      "proofless transaction fixture must be a real file")
    val text = new String(Files.readAllBytes(path), StandardCharsets.US_ASCII)
    parser.parse(text).fold(
      failure => throw new IllegalArgumentException(
        "proofless transaction fixture JSON rejected: " + failure.getMessage),
      identity)
  }

  private lazy val contextCursor =
    fixture.hcursor.downField("sourceContextExtension")
  private lazy val transactionCursor =
    fixture.hcursor.downField("transaction")
  private lazy val contextBytes =
    hex(requiredString(contextCursor.downField("serializedHex"),
      "serialized ContextExtension"))
  private lazy val bytesToSign =
    hex(requiredString(transactionCursor.downField("bytesToSignHex"),
      "bytes-to-sign"))
  private lazy val expectedChunkDigests =
    requiredStrings(contextCursor.downField("proofChunkBlake2b256Hex"),
      "proof chunk digests")
  private lazy val expectedPayloadBytes =
    requiredInt(contextCursor.downField("applicationPayloadBytes"),
      "application payload bytes")
  private lazy val expectedPayloadDigest =
    requiredString(contextCursor.downField("applicationPayloadBlake2b256Hex"),
      "application payload digest")
  private lazy val exactContext = parseContextStrict(contextBytes)
  private lazy val exactOutput = new ErgoBoxCandidate(
    value = 1000000L,
    ergoTree = ErgoTreeSerializer.DefaultSerializer
      .deserializeErgoTree(hex(OutputErgoTreeHex)),
    creationHeight = 100)

  test("pinned JVM projection matches the exact sigma-rust bytes-to-sign and ID") {
    assertDeclaredFixture()
    hex(Blake2b256(contextBytes)) shouldBe ContextExtensionDigestHex
    hex(Blake2b256(chunks(exactContext).flatten)) shouldBe RawSealDigestHex
    requiredInt(transactionCursor.downField("bytesToSignBytes"),
      "bytes-to-sign length") shouldBe 223421
    bytesToSign.length shouldBe 223421
    requiredString(transactionCursor.downField("bytesToSignBlake2b256Hex"),
      "bytes-to-sign digest") shouldBe TransactionIdHex
    requiredString(transactionCursor.downField("transactionIdHex"),
      "transaction ID") shouldBe TransactionIdHex
    hex(Blake2b256(bytesToSign)) shouldBe TransactionIdHex

    assertExactContext(exactContext)
    val unsigned = exactUnsignedTransaction()
    assertExactProjection(unsigned)
    unsigned.messageToSign should contain theSameElementsInOrderAs bytesToSign
    unsigned.id shouldBe TransactionIdHex

    val boundaries = fixture.hcursor.downField("boundaries")
    requiredBoolean(boundaries.downField("wholeTransactionSerializationOnly"),
      "whole-transaction serialization boundary") shouldBe true
    Vector(
      "signingPerformed",
      "nodeCheckPerformed",
      "submissionPerformed",
      "broadcastPerformed",
      "profileActivated",
      "gate5Closed",
      "fundsAuthorityEstablished").foreach { field =>
      requiredBoolean(boundaries.downField(field), field) shouldBe false
    }
  }

  test("strict transaction parse round-trips and preserves every exact field") {
    val transaction = parseTransactionStrict(bytesToSign)
    ErgoLikeTransactionSerializer.toBytes(transaction) should
      contain theSameElementsInOrderAs bytesToSign
    transaction.messageToSign should contain theSameElementsInOrderAs bytesToSign
    transaction.id shouldBe TransactionIdHex
    transaction.inputs.length shouldBe 1
    transaction.dataInputs shouldBe empty
    transaction.outputCandidates.length shouldBe 1

    val input = transaction.inputs.head
    hex(input.boxId) shouldBe InputBoxIdHex
    assertProoflessSpendingProof(transaction)
    ContextExtension.serializer.toBytes(input.extension) should
      contain theSameElementsInOrderAs contextBytes
    assertExactContext(input.extension)

    val output = transaction.outputCandidates.head
    output.value shouldBe 1000000L
    hex(output.ergoTree.bytes) shouldBe OutputErgoTreeHex
    output.additionalTokens.length shouldBe 0
    output.additionalRegisters shouldBe empty
    output.creationHeight shouldBe 100
    hex(transaction.outputs.head.id) shouldBe OutputBoxIdHex
  }

  test("single-field transaction mutations change identity or fail exact shape") {
    val changedInputId = hex(InputBoxIdHex)
    changedInputId(0) = (changedInputId(0) ^ 1).toByte
    assertIdentityChanges(new UnsignedErgoLikeTransaction(
      IndexedSeq(new UnsignedInput(ADKey @@ changedInputId, exactContext)),
      IndexedSeq.empty,
      IndexedSeq(exactOutput)))

    val proofChunks = chunks(exactContext)
    val payload = payloadBytes(exactContext)
    val changedProof = proofChunks.map(_.clone())
    changedProof(0)(0) = (changedProof(0)(0) ^ 1).toByte
    assertIdentityChanges(unsignedWith(
      extension = extensionWith(changedProof, payload)))

    val changedPayload = payload.clone()
    changedPayload(0) = (changedPayload(0) ^ 1).toByte
    assertIdentityChanges(unsignedWith(
      extension = extensionWith(proofChunks, changedPayload)))

    val withSpendingProof = new ErgoLikeTransaction(
      IndexedSeq(Input(
        ADKey @@ hex(InputBoxIdHex),
        ProverResult(Array(1.toByte), exactContext))),
      IndexedSeq.empty,
      IndexedSeq(exactOutput))
    withSpendingProof.messageToSign should
      contain theSameElementsInOrderAs bytesToSign
    withSpendingProof.id shouldBe TransactionIdHex
    java.util.Arrays.equals(
      ErgoLikeTransactionSerializer.toBytes(withSpendingProof),
      bytesToSign) shouldBe false
    intercept[IllegalArgumentException] {
      assertProoflessSpendingProof(withSpendingProof)
    }

    assertIdentityChanges(unsignedWith(output = candidate(value = 1000001L)))
    val alternateTree = ErgoTreeSerializer.DefaultSerializer
      .deserializeErgoTree(hex("10010100d17300"))
    assertIdentityChanges(unsignedWith(output = candidate(ergoTree = alternateTree)))
    assertIdentityChanges(unsignedWith(output = candidate(creationHeight = 101)))

    val withDataInput = new UnsignedErgoLikeTransaction(
      IndexedSeq(new UnsignedInput(ADKey @@ hex(InputBoxIdHex), exactContext)),
      IndexedSeq(DataInput(ADKey @@ Array.fill(32)(0x55.toByte))),
      IndexedSeq(exactOutput))
    intercept[IllegalArgumentException] {
      assertExactProjection(withDataInput)
    }

    val tokenId =
      Digest32Coll @@@ Colls.fromArray(Array.fill(32)(0x66.toByte))
    val withToken = unsignedWith(output = candidate(
      tokens = Colls.fromArray(Array(tokenId -> 1L))))
    intercept[IllegalArgumentException] {
      assertExactProjection(withToken)
    }

    val withRegister = unsignedWith(output = candidate(
      registers = Map(ErgoBox.R4 -> IntConstant(1))))
    intercept[IllegalArgumentException] {
      assertExactProjection(withRegister)
    }

    val withExtraInput = new UnsignedErgoLikeTransaction(
      IndexedSeq(
        new UnsignedInput(ADKey @@ hex(InputBoxIdHex), exactContext),
        new UnsignedInput(ADKey @@ Array.fill(32)(0x77.toByte), exactContext)),
      IndexedSeq.empty,
      IndexedSeq(exactOutput))
    intercept[IllegalArgumentException] {
      assertExactProjection(withExtraInput)
    }

    val withExtraOutput = new UnsignedErgoLikeTransaction(
      IndexedSeq(new UnsignedInput(ADKey @@ hex(InputBoxIdHex), exactContext)),
      IndexedSeq.empty,
      IndexedSeq(exactOutput, exactOutput))
    intercept[IllegalArgumentException] {
      assertExactProjection(withExtraOutput)
    }
  }

  test("truncated or trailing transaction bytes fail strict parsing") {
    intercept[RuntimeException] {
      parseTransactionStrict(bytesToSign.dropRight(1))
    }
    intercept[IllegalArgumentException] {
      parseTransactionStrict(bytesToSign :+ 0.toByte)
    }
  }

  private def exactUnsignedTransaction() =
    new UnsignedErgoLikeTransaction(
      IndexedSeq(new UnsignedInput(ADKey @@ hex(InputBoxIdHex), exactContext)),
      IndexedSeq.empty,
      IndexedSeq(exactOutput))

  private def unsignedWith(
      extension: ContextExtension = exactContext,
      output: ErgoBoxCandidate = exactOutput) =
    new UnsignedErgoLikeTransaction(
      IndexedSeq(new UnsignedInput(ADKey @@ hex(InputBoxIdHex), extension)),
      IndexedSeq.empty,
      IndexedSeq(output))

  private def candidate(
      value: Long = 1000000L,
      ergoTree: ErgoTree = exactOutput.ergoTree,
      creationHeight: Int = 100,
      tokens: sigma.Coll[ErgoBox.Token] = Colls.emptyColl,
      registers: ErgoBox.AdditionalRegisters = Map()) =
    new ErgoBoxCandidate(
      value,
      ergoTree,
      creationHeight,
      tokens,
      registers)

  private def assertIdentityChanges(
      transaction: UnsignedErgoLikeTransaction): Unit = {
    java.util.Arrays.equals(transaction.messageToSign, bytesToSign) shouldBe false
    transaction.id should not be TransactionIdHex
  }

  private def assertDeclaredFixture(): Unit = {
    requiredString(fixture.hcursor.downField("schema"),
      "fixture schema") shouldBe Schema
    requiredInt(fixture.hcursor.downField("version"),
      "fixture version") shouldBe 1
    requiredString(contextCursor.downField("schema"),
      "context schema") shouldBe ContextSchema
    requiredInt(contextCursor.downField("version"),
      "context version") shouldBe 1
    requiredString(contextCursor.downField("statementDigestHex"),
      "statement digest") shouldBe StatementDigestHex
    requiredString(contextCursor.downField("rawSealDigestHex"),
      "raw seal digest") shouldBe RawSealDigestHex
    requiredString(contextCursor.downField("serializedBlake2b256Hex"),
      "ContextExtension digest") shouldBe ContextExtensionDigestHex
    requiredInts(contextCursor.downField("proofChunkLengths"),
      "proof chunk lengths") shouldBe ProofChunkLengths
    requiredString(contextCursor.downField("unsignedTransactionIdHex"),
      "unsigned transaction ID") shouldBe TransactionIdHex
    requiredString(contextCursor.downField("unsignedEip12Blake2b256Hex"),
      "unsigned EIP-12 digest") shouldBe UnsignedEip12DigestHex

    requiredInt(transactionCursor.downField("inputCount"),
      "input count") shouldBe 1
    requiredInt(transactionCursor.downField("dataInputCount"),
      "data input count") shouldBe 0
    requiredInt(transactionCursor.downField("outputCount"),
      "output count") shouldBe 1
    requiredString(transactionCursor.downField("inputBoxIdHex"),
      "input box ID") shouldBe InputBoxIdHex
    requiredInt(transactionCursor.downField("inputProofBytes"),
      "input proof bytes") shouldBe 0
    requiredInts(transactionCursor.downField("contextExtensionKeys"),
      "ContextExtension keys") shouldBe Vector(0, 1)
    requiredString(transactionCursor.downField("outputBoxIdHex"),
      "output box ID") shouldBe OutputBoxIdHex
    requiredString(transactionCursor.downField("prooflessEip12Blake2b256Hex"),
      "proofless EIP-12 digest") shouldBe ProoflessEip12DigestHex

    val output = transactionCursor.downField("output")
    requiredString(output.downField("value"),
      "output value") shouldBe "1000000"
    requiredString(output.downField("ergoTreeHex"),
      "output ErgoTree") shouldBe OutputErgoTreeHex
    requiredInt(output.downField("assetCount"),
      "output asset count") shouldBe 0
    requiredInt(output.downField("additionalRegisterCount"),
      "output register count") shouldBe 0
    requiredInt(output.downField("creationHeight"),
      "output creation height") shouldBe 100
  }

  private def assertProoflessSpendingProof(
      transaction: ErgoLikeTransaction): Unit = {
    require(transaction.inputs.length == 1,
      "proofless transaction must contain exactly one input")
    require(transaction.inputs.head.spendingProof.proof.isEmpty,
      "proofless transaction must contain an empty spending proof")
  }

  private def assertExactProjection(
      transaction: UnsignedErgoLikeTransaction): Unit = {
    require(transaction.inputs.length == 1,
      "projection must contain exactly one input")
    require(transaction.dataInputs.isEmpty,
      "projection must not contain data inputs")
    require(transaction.outputCandidates.length == 1,
      "projection must contain exactly one output")
    val input = transaction.inputs.head
    require(hex(input.boxId) == InputBoxIdHex, "input box ID mismatch")
    require(java.util.Arrays.equals(
      ContextExtension.serializer.toBytes(input.extension),
      contextBytes), "input ContextExtension mismatch")
    assertExactContext(input.extension)
    val output = transaction.outputCandidates.head
    require(output.value == 1000000L, "output value mismatch")
    require(hex(output.ergoTree.bytes) == OutputErgoTreeHex,
      "output ErgoTree mismatch")
    require(output.additionalTokens.length == 0,
      "output assets must be empty")
    require(output.additionalRegisters.isEmpty,
      "output additional registers must be empty")
    require(output.creationHeight == 100,
      "output creation height mismatch")
  }

  private def parseContextStrict(bytes: Array[Byte]): ContextExtension = {
    val reader = SigmaSerializer.startReader(bytes)
    val extension = ContextExtension.serializer.parse(reader)
    require(reader.remaining == 0,
      s"ContextExtension parser left ${reader.remaining} trailing bytes")
    extension
  }

  private def parseTransactionStrict(bytes: Array[Byte]): ErgoLikeTransaction = {
    val reader = SigmaSerializer.startReader(bytes)
    val transaction = ErgoLikeTransactionSerializer.parse(reader)
    require(reader.remaining == 0,
      s"transaction parser left ${reader.remaining} trailing bytes")
    transaction
  }

  private def assertExactContext(extension: ContextExtension): Unit = {
    require(extension.values.keySet == Set(0.toByte, 1.toByte),
      "ContextExtension keys must be exactly 0 and 1")
    require(extension.get(0.toByte).get.tpe == SByteArray2,
      "ContextExtension variable 0 must be Coll[Coll[Byte]]")
    require(extension.get(1.toByte).get.tpe == SByteArray,
      "ContextExtension variable 1 must be Coll[Byte]")
    val proofChunks = chunks(extension)
    require(proofChunks.map(_.length).toVector == ProofChunkLengths,
      "proof chunk lengths mismatch")
    require(proofChunks.map(chunk => hex(Blake2b256(chunk))).toVector ==
      expectedChunkDigests,
      "proof chunk bytes or order mismatch")
    val payload = payloadBytes(extension)
    require(payload.length == expectedPayloadBytes,
      "application payload length mismatch")
    require(hex(Blake2b256(payload)) == expectedPayloadDigest,
      "application payload bytes mismatch")
  }

  private def chunks(extension: ContextExtension): Array[Array[Byte]] =
    extension.get(0.toByte).get.value
      .asInstanceOf[sigma.Coll[sigma.Coll[Byte]]].toArray.map(_.toArray)

  private def payloadBytes(extension: ContextExtension): Array[Byte] =
    extension.get(1.toByte).get.value
      .asInstanceOf[sigma.Coll[Byte]].toArray

  private def extensionWith(
      proofChunks: Array[Array[Byte]],
      applicationPayload: Array[Byte]): ContextExtension =
    ContextExtension(Map(
      0.toByte -> ConcreteCollection[SByteArray](
        proofChunks.map(ByteArrayConstant(_)).toIndexedSeq,
        SByteArray),
      1.toByte -> ByteArrayConstant(applicationPayload)))

  private def requiredString(cursor: ACursor, label: String): String =
    cursor.as[String].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing or invalid: ${failure.getMessage}"),
      identity)

  private def requiredStrings(cursor: ACursor, label: String): Vector[String] =
    cursor.as[Vector[String]].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing or invalid: ${failure.getMessage}"),
      identity)

  private def requiredInts(cursor: ACursor, label: String): Vector[Int] =
    cursor.as[Vector[Int]].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing or invalid: ${failure.getMessage}"),
      identity)

  private def requiredInt(cursor: ACursor, label: String): Int =
    cursor.as[Int].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing or invalid: ${failure.getMessage}"),
      identity)

  private def requiredBoolean(cursor: ACursor, label: String): Boolean =
    cursor.as[Boolean].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing or invalid: ${failure.getMessage}"),
      identity)

  private def hex(value: String): Array[Byte] = {
    require(value.matches("(?:[0-9a-f]{2})+"), "invalid lowercase whole-byte hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }

  private def hex(bytes: Array[Byte]): String =
    bytes.map(value => f"${value & 0xff}%02x").mkString
}
