package sigma.bridge

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path, Paths}

import io.circe.ACursor
import io.circe.parser
import org.ergoplatform._
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.hash.Blake2b256
import sigma.{AvlTree, Coll}
import sigma.ast.SCollection.{SByteArray, SByteArray2}
import sigma.ast._
import sigma.interpreter.ContextExtension
import sigma.serialization.{SigmaSerializer, ValueSerializer}

class BridgeValidityTrackerContextConformanceSpec
    extends AnyFunSuite with Matchers {
  private val FixtureProperty =
    "bridge.eip0045.validity.tracker.context.fixture"
  private val CandidateDirectoryProperty =
    "bridge.eip0045.validity.tracker.candidate.dir"
  private val Schema = "e2s.bridge-validity-tracker-context.v1"
  private val ContractIdHex =
    "c22f8d631e99022bd4bad5ce84ee9d7da30bf51684977c8bad28d8200f8cff5b"
  private val PropositionBytes = 1784
  private val PayloadBytes = 654
  private val StatementPrefixBytes = 159
  private val ProofChunkLengths = Vector(65535, 65535, 65535, 26063)
  private val CandidateFileNames = Vector(
    "statement.bin",
    "program-id.bin",
    "profile-id.bin",
    "terminal-control-id.bin",
    "proof-chunk-0.bin",
    "proof-chunk-1.bin",
    "proof-chunk-2.bin",
    "proof-chunk-3.bin")

  private lazy val fixture = {
    val path = exactFile(
      System.getProperty(FixtureProperty),
      "validity tracker ContextExtension fixture")
    val text =
      new String(Files.readAllBytes(path), StandardCharsets.US_ASCII)
    parser.parse(text).fold(
      failure => throw new IllegalArgumentException(
        "validity tracker fixture JSON rejected: " + failure.getMessage),
      identity)
  }
  private lazy val candidateRoot = {
    val raw = System.getProperty(CandidateDirectoryProperty)
    require(raw != null && raw.nonEmpty,
      s"missing -D$CandidateDirectoryProperty")
    val root = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isDirectory(root) && !Files.isSymbolicLink(root),
      "validity tracker candidate root must be a real directory")
    root
  }
  private lazy val candidateEntries = candidateManifest()
  private lazy val statement = candidateBytes("statement.bin")
  private lazy val proofChunks = ProofChunkLengths.indices
    .map(index => candidateBytes(s"proof-chunk-$index.bin")).toArray
  private lazy val serializedExtension = hex(requiredString(
    fixture.hcursor.downField("contextExtension")
      .downField("serializedHex"),
    "serialized ContextExtension"))
  private lazy val prooflessTransactionBytes = hex(requiredString(
    fixture.hcursor.downField("prooflessTransactionHex"),
    "proofless transaction bytes"))

  test("JVM parses the exact four-variable WASM tracker context") {
    requiredString(fixture.hcursor.downField("schema"),
      "fixture schema") shouldBe Schema
    requiredInt(fixture.hcursor.downField("version"),
      "fixture version") shouldBe 1
    hex(Blake2b256(serializedExtension)) shouldBe requiredString(
      fixture.hcursor.downField("contextExtension")
        .downField("serializedBlake2b256Hex"),
      "serialized ContextExtension digest")

    val extension = parseExtension(serializedExtension)
    extension.values.keySet shouldBe Set(
      0.toByte, 1.toByte, 2.toByte, 3.toByte)
    extension.get(0.toByte).get.tpe shouldBe SByteArray2
    extension.get(1.toByte).get.tpe shouldBe SByteArray
    extension.get(2.toByte).get.tpe shouldBe SByteArray
    extension.get(3.toByte).get.tpe shouldBe SInt
    ContextExtension.serializer.toBytes(extension) should
      contain theSameElementsInOrderAs serializedExtension

    val chunks = extension.get(0.toByte).get.value
      .asInstanceOf[Coll[Coll[Byte]]].toArray.map(_.toArray)
    chunks.map(_.length).toVector shouldBe ProofChunkLengths
    chunks.indices.foreach { index =>
      chunks(index) should contain theSameElementsInOrderAs proofChunks(index)
    }
    val payload = extension.get(1.toByte).get.value
      .asInstanceOf[Coll[Byte]].toArray
    payload.length shouldBe PayloadBytes
    payload should contain theSameElementsInOrderAs
      statement.drop(StatementPrefixBytes)

    val proofBundle = extension.get(2.toByte).get.value
      .asInstanceOf[Coll[Byte]].toArray
    proofBundle.length should be > 8
    val extensionProofLength = readU64Be(proofBundle, 0)
    extensionProofLength should be > 0L
    extensionProofLength should be <= 462L
    extensionProofLength % 33L shouldBe 0L
    8L + extensionProofLength should be < proofBundle.length.toLong

    val headerIndex = extension.get(3.toByte).get.value.asInstanceOf[Int]
    headerIndex shouldBe requiredInt(
      fixture.hcursor.downField("trackerTransition")
        .downField("anchorHeader").downField("contextIndex"),
      "anchor header index")

    (0 to 3).foreach { index =>
      ValueSerializer.serialize(extension.get(index.toByte).get) should
        contain theSameElementsInOrderAs hex(requiredString(
          fixture.hcursor.downField("contextExtension")
            .downField("eip12Values").downField(index.toString),
          s"EIP-12 variable $index"))
    }

    val headers = fixture.hcursor.downField("trackerTransition")
      .downField("headers").focus.getOrElse(
        throw new IllegalArgumentException("headers missing"))
      .asArray.getOrElse(
        throw new IllegalArgumentException("headers must be an array"))
    headers.length shouldBe 10
    headers.zipWithIndex.foreach { case (header, index) =>
      val cursor = header.hcursor
      val serialized = hex(requiredString(
        cursor.downField("serializedHex"),
        s"header $index serialized bytes"))
      hex(Blake2b256(serialized)) shouldBe requiredString(
        cursor.downField("id"), s"header $index ID")
      if (index + 1 < headers.length) {
        requiredString(cursor.downField("parentId"),
          s"header $index parent ID") shouldBe requiredString(
          headers(index + 1).hcursor.downField("id"),
          s"header ${index + 1} ID")
      }
    }
  }

  test("candidate statement, tracker proposition, and proof digests agree") {
    statement.length shouldBe StatementPrefixBytes + PayloadBytes
    statement.slice(123, 155) should
      contain theSameElementsInOrderAs hex(ContractIdHex)
    requiredString(
      fixture.hcursor.downField("sourceAdmission")
        .downField("statementDigestHex"),
      "statement digest") shouldBe hex(Blake2b256(statement))
    requiredString(
      fixture.hcursor.downField("sourceAdmission")
        .downField("rawSealDigestHex"),
      "raw seal digest") shouldBe hex(Blake2b256(proofChunks.flatten))

    val output = fixture.hcursor.downField("eip12UnsignedTransaction")
      .downField("outputs").downArray
    val propositionHex = requiredString(
      output.downField("ergoTree"),
      "tracker proposition")
    hex(propositionHex).length shouldBe PropositionBytes
    hex(Blake2b256(hex(propositionHex))) shouldBe ContractIdHex
    requiredString(
      output.downField("assets").downArray.downField("tokenId"),
      "tracker output token ID") shouldBe requiredString(
      fixture.hcursor.downField("trackerTransition")
        .downField("trackerNftIdHex"),
      "tracker transition NFT ID")
    requiredString(
      output.downField("assets").downArray.downField("amount"),
      "tracker output token amount") shouldBe "1"
  }

  test("JVM parses and byte-matches the complete proofless transaction") {
    prooflessTransactionBytes.length shouldBe requiredInt(
      fixture.hcursor.downField("prooflessTransactionBytes"),
      "proofless transaction length")
    val transactionId = requiredString(
      fixture.hcursor.downField("prooflessTransactionIdHex"),
      "proofless transaction ID")
    transactionId shouldBe requiredString(
      fixture.hcursor.downField("unsignedTransactionIdHex"),
      "unsigned transaction ID")
    hex(Blake2b256(prooflessTransactionBytes)) shouldBe transactionId

    val transaction = parseTransaction(prooflessTransactionBytes)
    ErgoLikeTransactionSerializer.toBytes(transaction) should
      contain theSameElementsInOrderAs prooflessTransactionBytes
    transaction.messageToSign should
      contain theSameElementsInOrderAs prooflessTransactionBytes
    transaction.id shouldBe transactionId
    transaction.inputs.length shouldBe 1
    transaction.dataInputs shouldBe empty
    transaction.outputCandidates.length shouldBe 1

    val input = transaction.inputs.head
    hex(input.boxId) shouldBe "55" * 32
    input.spendingProof.proof shouldBe empty
    ContextExtension.serializer.toBytes(input.extension) should
      contain theSameElementsInOrderAs serializedExtension

    val outputCursor = fixture.hcursor.downField("eip12UnsignedTransaction")
      .downField("outputs").downArray
    val output = transaction.outputCandidates.head
    output.value.toString shouldBe requiredString(
      outputCursor.downField("value"), "tracker output value")
    hex(output.ergoTree.bytes) shouldBe requiredString(
      outputCursor.downField("ergoTree"), "tracker output proposition")
    output.additionalTokens.length shouldBe 1
    hex(output.additionalTokens(0)._1.toArray) shouldBe requiredString(
      outputCursor.downField("assets").downArray.downField("tokenId"),
      "tracker output token ID")
    output.additionalTokens(0)._2.toString shouldBe requiredString(
      outputCursor.downField("assets").downArray.downField("amount"),
      "tracker output token amount")
    output.additionalRegisters.keySet shouldBe
      ErgoBox.nonMandatoryRegisters.toSet
    val outputRegisters = outputCursor.downField("additionalRegisters")
    ErgoBox.nonMandatoryRegisters.zipWithIndex.foreach {
      case (registerId, index) =>
        ValueSerializer.serialize(output.additionalRegisters(registerId)) should
          contain theSameElementsInOrderAs hex(requiredString(
            outputRegisters.downField(s"R${index + 4}"),
            s"tracker output R${index + 4}"))
    }
    output.creationHeight shouldBe requiredInt(
      outputCursor.downField("creationHeight"),
      "tracker output creation height")
  }

  test("registers retain one lineage-preserved trust root and no committee predicate") {
    val inputRegisters = fixture.hcursor.downField("trackerTransition")
      .downField("inputRegisters")
    val successorRegisters = fixture.hcursor.downField("trackerTransition")
      .downField("successorRegisters")
    requiredObjectKeys(inputRegisters, "input registers") shouldBe
      Vector("R4", "R5", "R6", "R7", "R8", "R9")
    requiredObjectKeys(successorRegisters, "successor registers") shouldBe
      Vector("R4", "R5", "R6", "R7", "R8", "R9")

    val input: Map[Int, EvaluatedValue[_ <: SType]] = (4 to 9).map(index =>
      index -> parseValue(requiredString(
        inputRegisters.downField(s"R$index"),
        s"input R$index"))).toMap
    val successor: Map[Int, EvaluatedValue[_ <: SType]] =
      (4 to 9).map(index =>
      index -> parseValue(requiredString(
        successorRegisters.downField(s"R$index"),
        s"successor R$index"))).toMap
    input(4).tpe shouldBe SLong
    input(5).tpe shouldBe SAvlTree
    input(6).tpe shouldBe SByteArray
    input(7).tpe shouldBe SLong
    input(8).tpe shouldBe SInt
    input(9).tpe shouldBe SByteArray
    successor(4).tpe shouldBe SLong
    successor(5).tpe shouldBe SAvlTree
    successor(6).tpe shouldBe SByteArray
    successor(7).tpe shouldBe SLong
    successor(8).tpe shouldBe SInt
    successor(9).tpe shouldBe SByteArray

    successor(4).value.asInstanceOf[Long] shouldBe
      input(4).value.asInstanceOf[Long] + 1L
    successor(7).value.asInstanceOf[Long] should be >
      input(7).value.asInstanceOf[Long]
    successor(8).value.asInstanceOf[Int] shouldBe requiredInt(
      fixture.hcursor.downField("trackerTransition")
        .downField("currentErgoHeight"),
      "current Ergo height")
    hex(input(9).value.asInstanceOf[Coll[Byte]].toArray) shouldBe
      requiredString(
        fixture.hcursor.downField("trackerTransition")
          .downField("approvedTrustAnchorDigestHex"),
        "approved trust-anchor digest")
    successor(9) shouldBe input(9)
    hex(input(5).value.asInstanceOf[AvlTree].digest.toArray) shouldBe
      requiredString(
        fixture.hcursor.downField("sourceAdmission")
          .downField("inputDigestHex"),
        "input AVL digest")
    hex(successor(5).value.asInstanceOf[AvlTree].digest.toArray) shouldBe
      requiredString(
        fixture.hcursor.downField("sourceAdmission")
          .downField("successorDigestHex"),
        "successor AVL digest")

    val outputRegisters = fixture.hcursor
      .downField("eip12UnsignedTransaction")
      .downField("outputs").downArray.downField("additionalRegisters")
    (4 to 9).foreach { index =>
      requiredString(outputRegisters.downField(s"R$index"),
        s"output R$index") shouldBe requiredString(
        successorRegisters.downField(s"R$index"),
        s"successor R$index")
    }
  }

  test("fixture retains only preactivation non-authority claims") {
    requiredString(
      fixture.hcursor.downField("trackerTransition")
        .downField("provenance"),
      "header provenance") shouldBe
      "eip0045-validity-tracker-canonical-synthetic-header-context"
    requiredBoolean(
      fixture.hcursor.downField("boundaries")
        .downField("serializationConformanceOnly"),
      "serialization conformance boundary") shouldBe true
    requiredBoolean(
      fixture.hcursor.downField("boundaries")
        .downField("exactTrackerSuccessorIncluded"),
      "successor inclusion boundary") shouldBe true
    requiredBoolean(
      fixture.hcursor.downField("boundaries")
        .downField("canonicalSyntheticHeaderIdsEstablished"),
      "canonical synthetic header boundary") shouldBe true
    requiredBoolean(
      fixture.hcursor.downField("boundaries")
        .downField("minedHeaderEvidenceEstablished"),
      "mined header evidence boundary") shouldBe false
    Vector(
      "signingPerformed",
      "nodeCheckPerformed",
      "submissionPerformed",
      "broadcastPerformed",
      "profileActivated",
      "gate5Closed",
      "fundsAuthorityEstablished").foreach { field =>
      requiredBoolean(
        fixture.hcursor.downField("boundaries").downField(field),
        field) shouldBe false
    }
  }

  private def parseExtension(bytes: Array[Byte]): ContextExtension = {
    val reader = SigmaSerializer.startReader(bytes)
    val extension = ContextExtension.serializer.parse(reader)
    require(reader.remaining == 0,
      s"ContextExtension parser left ${reader.remaining} trailing bytes")
    extension
  }

  private def parseTransaction(bytes: Array[Byte]): ErgoLikeTransaction = {
    val reader = SigmaSerializer.startReader(bytes)
    val transaction = ErgoLikeTransactionSerializer.parse(reader)
    require(reader.remaining == 0,
      s"transaction parser left ${reader.remaining} trailing bytes")
    transaction
  }

  private def parseValue(
      bytesHex: String): EvaluatedValue[_ <: SType] = {
    val reader = SigmaSerializer.startReader(hex(bytesHex))
    val value = ValueSerializer.deserialize(reader)
      .asInstanceOf[EvaluatedValue[_ <: SType]]
    require(reader.remaining == 0,
      s"register parser left ${reader.remaining} trailing bytes")
    value
  }

  private def candidateManifest(): Map[String, (Int, String)] = {
    val path = candidateRoot.resolve("candidate-manifest-v1.txt").normalize()
    require(path.getParent == candidateRoot &&
      Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      "complete candidate manifest is unavailable")
    val lines = new String(
      Files.readAllBytes(path),
      StandardCharsets.US_ASCII).split("\n", -1).toVector
    require(lines.take(2) == Vector(
      "schema=e2s.bridge-validity-eip0045-candidate.v1",
      "version=1"),
      "candidate manifest envelope mismatch")
    require(lines.takeRight(2) == Vector("complete=true", ""),
      "candidate manifest completion marker mismatch")
    val entries = lines.slice(2, lines.length - 2).map { line =>
      val parts = line.stripPrefix("file=").split(":", -1)
      require(line.startsWith("file=") && parts.length == 3 &&
        parts(1).matches("[0-9]+") &&
        parts(2).matches("[0-9a-f]{64}"),
        "candidate manifest file entry is malformed")
      parts(0) -> (parts(1).toInt, parts(2))
    }
    require(entries.map(_._1) == CandidateFileNames &&
      entries.map(_._1).distinct.length == entries.length,
      "candidate manifest file order or names mismatch")
    entries.toMap
  }

  private def candidateBytes(name: String): Array[Byte] = {
    val expected = candidateEntries.getOrElse(name,
      throw new IllegalArgumentException(
        "candidate file is not manifested: " + name))
    val path = candidateRoot.resolve(name).normalize()
    require(path.getParent == candidateRoot &&
      Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      s"candidate file is unavailable: $name")
    val bytes = Files.readAllBytes(path)
    require(bytes.length == expected._1 &&
      hex(Blake2b256(bytes)) == expected._2,
      s"candidate file identity mismatch: $name")
    bytes
  }

  private def exactFile(raw: String, label: String): Path = {
    require(raw != null && raw.nonEmpty, s"missing $label path")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      s"$label must be a real file")
    path
  }

  private def requiredObjectKeys(
      cursor: ACursor,
      label: String): Vector[String] = {
    val json = cursor.focus.getOrElse(
      throw new IllegalArgumentException(s"$label missing"))
    json.asObject.getOrElse(
      throw new IllegalArgumentException(s"$label must be an object"))
      .keys.toVector
  }

  private def requiredString(cursor: ACursor, label: String): String =
    cursor.as[String].fold(
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

  private def readU64Be(bytes: Array[Byte], offset: Int): Long = {
    require(offset >= 0 && offset + 8 <= bytes.length,
      "u64 read exceeds proof bundle")
    var value = 0L
    var index = 0
    while (index < 8) {
      value = (value << 8) | (bytes(offset + index) & 0xffL)
      index += 1
    }
    value
  }

  private def hex(value: String): Array[Byte] = {
    require(value.matches("(?:[0-9a-f]{2})+"),
      "invalid lowercase whole-byte hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }

  private def hex(bytes: Array[Byte]): String =
    bytes.map(value => f"${value & 0xff}%02x").mkString
}
