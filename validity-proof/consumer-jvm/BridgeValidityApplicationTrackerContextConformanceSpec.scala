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

class BridgeValidityApplicationTrackerContextConformanceSpec
    extends AnyFunSuite with Matchers {
  private val FixtureProperty =
    "bridge.eip0045.validity.application.tracker.context.fixture"
  private val CandidateDirectoryProperty =
    "bridge.eip0045.validity.application.tracker.candidate.dir"
  private val RejectionFixtureProperty =
    "bridge.eip0045.validity.application.tracker.binding.rejection.context.fixture"
  private val RejectionCandidateDirectoryProperty =
    "bridge.eip0045.validity.application.tracker.binding.rejection.candidate.dir"
  private val Schema =
    "e2s.bridge-validity-application-tracker-context.v2"
  private val RejectionSchema =
    "e2s.bridge-validity-application-tracker-binding-rejection-context.v2"
  private val ContractIdHex =
    "adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b"
  private val ProgramIdHex =
    "230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c"
  private val ProfileIdHex =
    "23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383"
  private val TerminalControlIdHex =
    "7a8f24092c34ed3eb81b3d0a0b796c588c615d3488ef9e61c21dbd1e4b83ea6e"
  private val SourceNetworkIdHex = "11" * 32
  private val SidechainIdHex = "22" * 32
  private val SettlementProfileIdHex = "55" * 32
  private val CausalProfileIdHex =
    "a0a5ba76f51548dfa7148b623cedcbb6205ce1f51428a508480ece5df66e73f5"
  private val PropositionBytes = 2424
  private val PayloadBytes = 973
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
      "application tracker ContextExtension fixture")
    val text =
      new String(Files.readAllBytes(path), StandardCharsets.US_ASCII)
    parser.parse(text).fold(
      failure => throw new IllegalArgumentException(
        "application tracker fixture JSON rejected: " + failure.getMessage),
      identity)
  }
  private lazy val candidateRoot = {
    val raw = System.getProperty(CandidateDirectoryProperty)
    require(raw != null && raw.nonEmpty,
      s"missing -D$CandidateDirectoryProperty")
    val root = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isDirectory(root) && !Files.isSymbolicLink(root),
      "application tracker candidate root must be a real directory")
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
  private lazy val rejectionFixture = {
    val path = exactFile(
      System.getProperty(RejectionFixtureProperty),
      "application tracker binding-rejection fixture")
    val text =
      new String(Files.readAllBytes(path), StandardCharsets.US_ASCII)
    parser.parse(text).fold(
      failure => throw new IllegalArgumentException(
        "application tracker binding-rejection fixture JSON rejected: " +
          failure.getMessage),
      identity)
  }
  private lazy val rejectionCandidateRoot = exactDirectory(
    System.getProperty(RejectionCandidateDirectoryProperty),
    "application tracker binding-rejection candidate root")
  private lazy val rejectionCandidateEntries = candidateManifestAt(
    rejectionCandidateRoot,
    "application-binding-rejection-manifest-v2.txt",
    Vector(
      "schema=e2s.bridge-validity-eip0045-application-binding-rejection-candidate.v2",
      "version=2",
      "mutation-field=bridge-runtime-code-sha256",
      s"contract-id=$ContractIdHex"))
  private lazy val rejectionStatement = candidateBytesAt(
    rejectionCandidateRoot,
    rejectionCandidateEntries,
    "statement.bin",
    "application tracker binding-rejection")
  private lazy val rejectionProofChunks = ProofChunkLengths.indices
    .map(index => candidateBytesAt(
      rejectionCandidateRoot,
      rejectionCandidateEntries,
      s"proof-chunk-$index.bin",
      "application tracker binding-rejection")).toArray

  test("JVM parses the exact four-variable WASM application tracker context") {
    requiredString(fixture.hcursor.downField("schema"),
      "fixture schema") shouldBe Schema
    requiredInt(fixture.hcursor.downField("version"),
      "fixture version") shouldBe 2
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

  test("candidate statement, application tracker proposition, and proof digests agree") {
    statement.length shouldBe StatementPrefixBytes + PayloadBytes
    statement.slice(27, 59) should
      contain theSameElementsInOrderAs hex(SourceNetworkIdHex)
    statement.slice(59, 91) should
      contain theSameElementsInOrderAs hex(ProfileIdHex)
    statement.slice(91, 123) should
      contain theSameElementsInOrderAs hex(ProgramIdHex)
    statement.slice(123, 155) should
      contain theSameElementsInOrderAs hex(ContractIdHex)
    readU32Le(statement, 155) shouldBe PayloadBytes
    candidateBytes("program-id.bin") should
      contain theSameElementsInOrderAs hex(ProgramIdHex)
    candidateBytes("profile-id.bin") should
      contain theSameElementsInOrderAs hex(ProfileIdHex)
    candidateBytes("terminal-control-id.bin") should
      contain theSameElementsInOrderAs hex(TerminalControlIdHex)
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

  test("alternate application proof retains exact transport under a distinct rejection schema") {
    val cursor = rejectionFixture.hcursor
    requiredString(cursor.downField("schema"),
      "binding-rejection fixture schema") shouldBe RejectionSchema
    requiredInt(cursor.downField("version"),
      "binding-rejection fixture version") shouldBe 2
    rejectionStatement.length shouldBe StatementPrefixBytes + PayloadBytes
    rejectionStatement.slice(27, 155) should
      contain theSameElementsInOrderAs statement.slice(27, 155)

    val canonicalBinding =
      statement.slice(StatementPrefixBytes + 701, StatementPrefixBytes + 941)
    val alternateBinding = rejectionStatement.slice(
      StatementPrefixBytes + 701, StatementPrefixBytes + 941)
    canonicalBinding.indices.filter(
      index => canonicalBinding(index) != alternateBinding(index)) shouldBe
      Vector(168)
    canonicalBinding(168) shouldBe 0xbb.toByte
    alternateBinding(168) shouldBe 0xba.toByte

    val serialized = hex(requiredString(
      cursor.downField("contextExtension").downField("serializedHex"),
      "binding-rejection serialized ContextExtension"))
    val parsed = parseExtension(serialized)
    parsed.values.keySet shouldBe Set(
      0.toByte, 1.toByte, 2.toByte, 3.toByte)
    parsed.get(0.toByte).get.tpe shouldBe SByteArray2
    parsed.get(1.toByte).get.tpe shouldBe SByteArray
    parsed.get(2.toByte).get.tpe shouldBe SByteArray
    parsed.get(3.toByte).get.tpe shouldBe SInt
    ContextExtension.serializer.toBytes(parsed) should
      contain theSameElementsInOrderAs serialized
    val chunks = parsed.get(0.toByte).get.value
      .asInstanceOf[Coll[Coll[Byte]]].toArray.map(_.toArray)
    chunks.indices.foreach { index =>
      chunks(index) should
        contain theSameElementsInOrderAs rejectionProofChunks(index)
    }
    parsed.get(1.toByte).get.value.asInstanceOf[Coll[Byte]].toArray should
      contain theSameElementsInOrderAs rejectionStatement.drop(
        StatementPrefixBytes)
    requiredString(
      cursor.downField("sourceAdmission").downField("statementDigestHex"),
      "binding-rejection statement digest") shouldBe
      hex(Blake2b256(rejectionStatement))
    requiredString(
      cursor.downField("sourceAdmission").downField("rawSealDigestHex"),
      "binding-rejection raw seal digest") shouldBe
      hex(Blake2b256(rejectionProofChunks.flatten))
    requiredBoolean(
      cursor.downField("boundaries")
        .downField("exactContractPinnedApplicationProfileIncluded"),
      "binding-rejection pinned profile boundary") shouldBe false
    requiredBoolean(
      cursor.downField("boundaries")
        .downField("expectedContractAcceptance"),
      "binding-rejection expected acceptance") shouldBe false
  }

  test("application binding, V2 key, and 370-byte value decode independently") {
    val payload = statement.drop(StatementPrefixBytes)
    val checkpoint = payload.slice(123, 339)
    val applicationBinding = payload.slice(701, 941)
    val applicationBindingDomain =
      "E2S_CAUSAL_APPLICATION_BINDING_V2"
        .getBytes(StandardCharsets.US_ASCII)
    val payloadDigestDomain =
      "E2S_SPV_VALIDITY_APPLICATION_PAYLOAD_DIGEST_V2"
        .getBytes(StandardCharsets.US_ASCII)
    val trackerKeyDomain =
      "E2S_SPV_VALIDITY_APPLICATION_KEY_V2"
        .getBytes(StandardCharsets.US_ASCII)
    val trackerValueDomain =
      "E2S_SPV_VALIDITY_APPLICATION_VALUE_V2"
        .getBytes(StandardCharsets.US_ASCII)
    val trackerKey = hex(requiredString(
      fixture.hcursor.downField("sourceAdmission")
        .downField("trackerKeyHex"),
      "application tracker key"))
    val trackerValue = hex(requiredString(
      fixture.hcursor.downField("sourceAdmission")
        .downField("trackerValueHex"),
      "application tracker value"))

    applicationBinding.length shouldBe 240
    applicationBinding.slice(0, 32) should
      contain theSameElementsInOrderAs hex(SourceNetworkIdHex)
    applicationBinding.slice(32, 64) should
      contain theSameElementsInOrderAs hex(SidechainIdHex)
    applicationBinding.slice(64, 84) should
      contain theSameElementsInOrderAs Array.fill(20)(0x33.toByte)
    applicationBinding.slice(84, 104) should
      contain theSameElementsInOrderAs Array.fill(20)(0x44.toByte)
    applicationBinding.slice(104, 136) should
      contain theSameElementsInOrderAs hex(SettlementProfileIdHex)
    applicationBinding.slice(136, 168) should
      contain theSameElementsInOrderAs hex(CausalProfileIdHex)
    applicationBinding.slice(168, 200) should
      contain theSameElementsInOrderAs Array.fill(32)(0xbb.toByte)
    readU32Be(applicationBinding, 200) shouldBe 4096
    applicationBinding.slice(204, 236) should
      contain theSameElementsInOrderAs Array.fill(32)(0xcc.toByte)
    readU32Be(applicationBinding, 236) shouldBe 2048
    payload.slice(941, 973) should contain theSameElementsInOrderAs
      Blake2b256(applicationBindingDomain ++ applicationBinding)

    checkpoint.slice(4, 36) should
      contain theSameElementsInOrderAs hex(SidechainIdHex)
    trackerKey should contain theSameElementsInOrderAs Blake2b256(
      trackerKeyDomain ++
        checkpoint.slice(4, 36) ++
        checkpoint.slice(36, 44) ++
        checkpoint.slice(76, 108))

    trackerValue.length shouldBe 370
    trackerValue.slice(0, 37) should
      contain theSameElementsInOrderAs trackerValueDomain
    trackerValue.slice(37, 42) should
      contain theSameElementsInOrderAs Array(
        0.toByte, 2.toByte, 1.toByte, 1.toByte, 0.toByte)
    trackerValue.slice(42, 74) should
      contain theSameElementsInOrderAs checkpoint.slice(108, 140)
    trackerValue.slice(74, 106) should
      contain theSameElementsInOrderAs payload.slice(339, 371)
    trackerValue.slice(106, 138) should
      contain theSameElementsInOrderAs hex(requiredString(
        fixture.hcursor.downField("trackerTransition")
          .downField("anchorHeader").downField("idHex"),
        "selected anchor header ID"))
    readU32Be(trackerValue, 138) shouldBe requiredInt(
      fixture.hcursor.downField("trackerTransition")
        .downField("anchorHeader").downField("height"),
      "selected anchor header height")
    trackerValue.slice(142, 174) should
      contain theSameElementsInOrderAs checkpoint.slice(44, 76)
    trackerValue.slice(174, 178) should
      contain theSameElementsInOrderAs checkpoint.slice(140, 144)
    trackerValue.slice(178, 210) should
      contain theSameElementsInOrderAs payload.slice(941, 973)
    trackerValue.slice(210, 242) should
      contain theSameElementsInOrderAs applicationBinding.slice(104, 136)
    trackerValue.slice(242, 274) should
      contain theSameElementsInOrderAs applicationBinding.slice(136, 168)
    trackerValue.slice(274, 306) should contain theSameElementsInOrderAs
      Blake2b256(payloadDigestDomain ++ payload)
    trackerValue.slice(306, 338) should
      contain theSameElementsInOrderAs hex(ProgramIdHex)
    trackerValue.slice(338, 370) should
      contain theSameElementsInOrderAs hex(ProfileIdHex)
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
    hex(input.boxId) shouldBe "66" * 32
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
        .downField("exactContractPinnedApplicationProfileIncluded"),
      "application profile inclusion boundary") shouldBe true
    requiredBoolean(
      fixture.hcursor.downField("boundaries")
        .downField("canonicalSyntheticHeaderIdsEstablished"),
      "canonical synthetic header boundary") shouldBe true
    requiredBoolean(
      fixture.hcursor.downField("boundaries")
        .downField("minedHeaderEvidenceEstablished"),
      "mined header evidence boundary") shouldBe false
    Vector(
      "proofValidityEstablishedByFixture",
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

  private def candidateManifest(): Map[String, (Int, String)] =
    candidateManifestAt(
      candidateRoot,
      "candidate-manifest-v2.txt",
      Vector(
        "schema=e2s.bridge-validity-eip0045-application-candidate.v2",
        "version=2"))

  private def candidateManifestAt(
      root: Path,
      manifestName: String,
      prefix: Vector[String]): Map[String, (Int, String)] = {
    val path = root.resolve(manifestName).normalize()
    require(path.getParent == root &&
      Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      "complete candidate manifest is unavailable")
    val lines = new String(
      Files.readAllBytes(path),
      StandardCharsets.US_ASCII).split("\n", -1).toVector
    require(lines.take(prefix.length) == prefix,
      "candidate manifest envelope mismatch")
    require(lines.takeRight(2) == Vector("complete=true", ""),
      "candidate manifest completion marker mismatch")
    val entries = lines.slice(prefix.length, lines.length - 2).map { line =>
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
    candidateBytesAt(candidateRoot, candidateEntries, name, "application")
  }

  private def candidateBytesAt(
      root: Path,
      entries: Map[String, (Int, String)],
      name: String,
      label: String): Array[Byte] = {
    val expected = entries.getOrElse(name,
      throw new IllegalArgumentException(
        "candidate file is not manifested: " + name))
    val path = root.resolve(name).normalize()
    require(path.getParent == root &&
      Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      s"$label candidate file is unavailable: $name")
    val bytes = Files.readAllBytes(path)
    require(bytes.length == expected._1 &&
      hex(Blake2b256(bytes)) == expected._2,
      s"$label candidate file identity mismatch: $name")
    bytes
  }

  private def exactFile(raw: String, label: String): Path = {
    require(raw != null && raw.nonEmpty, s"missing $label path")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      s"$label must be a real file")
    path
  }

  private def exactDirectory(raw: String, label: String): Path = {
    require(raw != null && raw.nonEmpty, s"missing $label path")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isDirectory(path) && !Files.isSymbolicLink(path),
      s"$label must be a real directory")
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

  private def readU32Be(bytes: Array[Byte], offset: Int): Int = {
    require(offset >= 0 && offset + 4 <= bytes.length,
      "u32 BE read exceeds input")
    ((bytes(offset) & 0xff) << 24) |
      ((bytes(offset + 1) & 0xff) << 16) |
      ((bytes(offset + 2) & 0xff) << 8) |
      (bytes(offset + 3) & 0xff)
  }

  private def readU32Le(bytes: Array[Byte], offset: Int): Int = {
    require(offset >= 0 && offset + 4 <= bytes.length,
      "u32 LE read exceeds input")
    (bytes(offset) & 0xff) |
      ((bytes(offset + 1) & 0xff) << 8) |
      ((bytes(offset + 2) & 0xff) << 16) |
      ((bytes(offset + 3) & 0xff) << 24)
  }

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
