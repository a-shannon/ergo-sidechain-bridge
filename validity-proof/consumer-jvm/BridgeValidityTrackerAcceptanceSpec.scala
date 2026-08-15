package sigma.bridge

import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path, Paths}

import io.circe.ACursor
import io.circe.parser
import org.ergoplatform._
import org.ergoplatform.sdk.JsonCodecs
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.hash.Blake2b256
import sigma.VersionContext
import sigma.ast._
import sigma.data.{CAvlTree, CHeader, Digest32Coll, TrivialProp}
import sigma.eval.StarkVerificationCapability._
import sigma.eval.{Risc0StockProfileRuntime, StarkVerificationCapability}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.{ErgoTreeSerializer, SigmaSerializer, ValueSerializer}
import sigma.stark.profile.Risc0ProfilePackageLoader
import sigma.{Coll, Colls, Header}
import sigmastate.eval.CPreHeader
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.{copyBox, copyContext, createBox}

class BridgeValidityTrackerAcceptanceSpec
    extends AnyFunSuite with Matchers with JsonCodecs {
  private val FixtureProperty =
    "bridge.eip0045.validity.tracker.context.fixture"
  private val CandidateDirectoryProperty =
    "bridge.eip0045.validity.tracker.candidate.dir"
  private val ProfilePackageRoot = "/stark-kats/eip0045-profile-package/"
  private val ContractIdHex =
    "c22f8d631e99022bd4bad5ce84ee9d7da30bf51684977c8bad28d8200f8cff5b"
  private val CandidateFileNames = Vector(
    "statement.bin",
    "program-id.bin",
    "profile-id.bin",
    "terminal-control-id.bin",
    "proof-chunk-0.bin",
    "proof-chunk-1.bin",
    "proof-chunk-2.bin",
    "proof-chunk-3.bin")
  private val Message =
    Blake2b256("bridge validity tracker acceptance fixture").toArray

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
  private lazy val fixtureCursor = fixture.hcursor
  private lazy val transitionCursor =
    fixtureCursor.downField("trackerTransition")
  private lazy val outputCursor =
    fixtureCursor.downField("eip12UnsignedTransaction")
      .downField("outputs").downArray
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
  private lazy val proofChunks = (0 to 3)
    .map(index => candidateBytes(s"proof-chunk-$index.bin")).toArray
  private lazy val extension = parseExtension(hex(requiredString(
    fixtureCursor.downField("contextExtension")
      .downField("serializedHex"),
    "serialized ContextExtension")))
  private lazy val trackerTree = {
    val bytes = hex(requiredString(outputCursor.downField("ergoTree"),
      "tracker proposition"))
    hex(Blake2b256(bytes)) shouldBe ContractIdHex
    ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(bytes)
  }
  private lazy val trackerToken =
    (Digest32Coll @@ Colls.fromArray(hex(requiredString(
      transitionCursor.downField("trackerNftIdHex"),
      "tracker NFT ID")))) -> 1L
  private lazy val inputRegisters =
    registers(transitionCursor.downField("inputRegisters"), "input")
  private lazy val successorRegisters =
    registers(transitionCursor.downField("successorRegisters"), "successor")
  private lazy val trackerValue = requiredLong(
    transitionCursor.downField("inputValue"), "tracker value")
  private lazy val currentHeight = requiredInt(
    transitionCursor.downField("currentErgoHeight"), "current Ergo height")
  private lazy val trackerSelf =
    createBox(trackerValue, trackerTree, Seq(trackerToken), inputRegisters)
  private lazy val trackerSuccessor = new ErgoBoxCandidate(
    trackerValue,
    trackerTree,
    currentHeight,
    Colls.fromArray(Array(trackerToken)),
    successorRegisters)
  private lazy val contextHeaders = parseHeaders()

  private lazy val loadedProfile = right(
    Risc0ProfilePackageLoader.load(
      resourceBytes(ProfilePackageRoot + "manifest.bin"),
      resourceBytes(ProfilePackageRoot + "algorithm.txt"),
      resourceBytes(ProfilePackageRoot + "constants.bin"),
      resourceBytes(ProfilePackageRoot + "profile-id.bin")),
    "profile package")
  private lazy val runtime = right(
    Risc0StockProfileRuntime.fromLoadedProfile(loadedProfile),
    "stock runtime")
  private lazy val activeEntry = right(
    StarkVerificationCapability.active(runtime, fixedJit = 100),
    "active profile")
  private lazy val activeCapability = right(
    StarkVerificationCapability.snapshot(
      statement.slice(27, 59),
      protocolGeneration = 1,
      HistoricalBlockValidation,
      dispatchJit = 100,
      Vector(activeEntry)),
    "capability snapshot")

  test("exact proof, anchor, AVL transition, and tracker successor accept together") {
    contextHeaders.length shouldBe 10
    contextHeaders.zipWithIndex.foreach { case (header, index) =>
      val expected = transitionCursor.downField("headers").downN(index)
      hex(header.id.toArray) shouldBe requiredString(
        expected.downField("id"), s"header $index ID")
      header.height shouldBe requiredInt(
        expected.downField("height"), s"header $index height")
      hex(header.extensionRoot.toArray) shouldBe requiredString(
        expected.downField("extensionRootHex"),
        s"header $index extension root")
    }

    verify(
      self = trackerSelf,
      successor = trackerSuccessor,
      suppliedExtension = extension,
      headers = contextHeaders,
      capability = activeCapability) shouldBe true
  }

  test("STARK proof, extension membership, and successor mutations reject independently") {
    val wrongChunks = proofChunks.map(_.clone())
    wrongChunks(0)(0) = (wrongChunks(0)(0) ^ 1).toByte
    verify(
      suppliedExtension = extensionWith(
        proofChunksValue(wrongChunks), extension.get(2.toByte).get),
      capability = activeCapability) shouldBe false

    val proofBundle = extension.get(2.toByte).get.value
      .asInstanceOf[Coll[Byte]].toArray
    val wrongMembership = proofBundle.clone()
    wrongMembership(9) = (wrongMembership(9) ^ 1).toByte
    verify(
      suppliedExtension = extensionWith(
        extension.get(0.toByte).get, ByteArrayConstant(wrongMembership)),
      capability = activeCapability) shouldBe false

    val wrongCounter = successorRegisters.toMap.updated(
      ErgoBox.R4,
      LongConstant(
        successorRegisters(ErgoBox.R4).value.asInstanceOf[Long] + 1L))
    val wrongSuccessor = new ErgoBoxCandidate(
      trackerValue,
      trackerTree,
      currentHeight,
      Colls.fromArray(Array(trackerToken)),
      wrongCounter)
    verify(
      successor = wrongSuccessor,
      capability = activeCapability) shouldBe false
  }

  test("source identity and verifier lifecycle remain fail-closed") {
    val wrongSidechain = inputRegisters(ErgoBox.R6).value
      .asInstanceOf[Coll[Byte]].toArray
    wrongSidechain(0) = (wrongSidechain(0) ^ 1).toByte
    val wrongInput = copyBox(trackerSelf)(
      additionalRegisters = inputRegisters.toMap.updated(
        ErgoBox.R6, ByteArrayConstant(wrongSidechain)))
    verify(
      self = wrongInput,
      capability = activeCapability) shouldBe false

    intercept[sigma.exceptions.OpcodeUnavailableException] {
      reduce(
        self = trackerSelf,
        successor = trackerSuccessor,
        suppliedExtension = extension,
        headers = contextHeaders,
      capability = StarkVerificationCapability.Unavailable)
    }
  }

  test("approved trust root and complete singleton lineage reject independently") {
    val approvedAnchor = inputRegisters(ErgoBox.R9).value
      .asInstanceOf[Coll[Byte]].toArray
    val unapprovedAnchor = approvedAnchor.clone()
    unapprovedAnchor(0) = (unapprovedAnchor(0) ^ 1).toByte
    val unapprovedAnchorValue = ByteArrayConstant(unapprovedAnchor)
    val unapprovedInputRegisters = inputRegisters.toMap.updated(
      ErgoBox.R9, unapprovedAnchorValue)
    val unapprovedSuccessorRegisters = successorRegisters.toMap.updated(
      ErgoBox.R9, unapprovedAnchorValue)
    verify(
      self = copyBox(trackerSelf)(
        additionalRegisters = unapprovedInputRegisters),
      successor = candidate(registers = unapprovedSuccessorRegisters),
      capability = activeCapability) shouldBe false

    verify(
      successor = candidate(registers = successorRegisters.toMap.updated(
        ErgoBox.R9, unapprovedAnchorValue)),
      capability = activeCapability) shouldBe false

    val wrongSuccessorSidechain = successorRegisters(ErgoBox.R6).value
      .asInstanceOf[Coll[Byte]].toArray
    wrongSuccessorSidechain(0) =
      (wrongSuccessorSidechain(0) ^ 1).toByte
    verify(
      successor = candidate(registers = successorRegisters.toMap.updated(
        ErgoBox.R6, ByteArrayConstant(wrongSuccessorSidechain))),
      capability = activeCapability) shouldBe false

    verify(
      successor = candidate(
        tree = ErgoTree.fromProposition(TrivialProp.TrueProp)),
      capability = activeCapability) shouldBe false

    verify(
      successor = candidate(registers = successorRegisters.toMap.updated(
        ErgoBox.R8, IntConstant(currentHeight + 1))),
      capability = activeCapability) shouldBe false

    val wrongIdToken =
      (Digest32Coll @@ Colls.fromArray(Array.fill[Byte](32)(0x44.toByte))) -> 1L
    val extraToken =
      (Digest32Coll @@ Colls.fromArray(Array.fill[Byte](32)(0x45.toByte))) -> 1L
    val inputTokenMutations = Vector(
      Colls.fromArray(Array(wrongIdToken)),
      Colls.fromArray(Array(trackerToken._1 -> 2L)),
      Colls.fromArray(Array(trackerToken, extraToken)))
    inputTokenMutations.foreach { tokens =>
      verify(
        self = copyBox(trackerSelf)(additionalTokens = tokens),
        capability = activeCapability) shouldBe false
    }

    val successorTokenMutations = Vector(
      Colls.fromArray(Array(trackerToken._1 -> 2L)),
      Colls.fromArray(Array(trackerToken, extraToken)))
    successorTokenMutations.foreach { tokens =>
      verify(
        successor = candidate(tokens = tokens),
        capability = activeCapability) shouldBe false
    }
  }

  test("anchor selector and tracker transition authority reject independently") {
    val anchorIndex = extension.get(3.toByte).get.value.asInstanceOf[Int]
    val wrongAnchorIndex =
      if (anchorIndex == contextHeaders.length - 1) anchorIndex - 1
      else anchorIndex + 1
    verify(
      suppliedExtension = ContextExtension(
        extension.values +
          (3.toByte -> IntConstant(wrongAnchorIndex))),
      capability = activeCapability) shouldBe false

    verify(
      suppliedExtension = ContextExtension(
        extension.values +
          (3.toByte -> IntConstant(contextHeaders.length))),
      capability = activeCapability) shouldBe false

    val admittedSidechainHeight =
      successorRegisters(ErgoBox.R7).value.asInstanceOf[Long]
    val nonAdvancingInput = copyBox(trackerSelf)(
      additionalRegisters = inputRegisters.toMap.updated(
        ErgoBox.R7, LongConstant(admittedSidechainHeight)))
    verify(
      self = nonAdvancingInput,
      capability = activeCapability) shouldBe false

    val successorMutations = Vector(
      successorRegisters.toMap.updated(
        ErgoBox.R5, inputRegisters(ErgoBox.R5)),
      successorRegisters.toMap.updated(
        ErgoBox.R7, LongConstant(admittedSidechainHeight + 1L)),
      successorRegisters.toMap.updated(
        ErgoBox.R8, inputRegisters(ErgoBox.R8)))
    successorMutations.foreach { registers =>
      verify(
        successor = new ErgoBoxCandidate(
          trackerValue,
          trackerTree,
          currentHeight,
          Colls.fromArray(Array(trackerToken)),
          registers),
        capability = activeCapability) shouldBe false
    }

    val wrongToken =
      (Digest32Coll @@ Colls.fromArray(Array.fill[Byte](32)(0x44.toByte))) -> 1L
    verify(
      successor = new ErgoBoxCandidate(
        trackerValue,
        trackerTree,
        currentHeight,
        Colls.fromArray(Array(wrongToken)),
        successorRegisters),
      capability = activeCapability) shouldBe false

    verify(
      successor = new ErgoBoxCandidate(
        trackerValue - 1L,
        trackerTree,
        currentHeight,
        Colls.fromArray(Array(trackerToken)),
        successorRegisters),
      capability = activeCapability) shouldBe false
  }

  test("local JVM acceptance does not promote the preactivation fixture") {
    val boundaries = fixtureCursor.downField("boundaries")
    requiredString(
      transitionCursor.downField("provenance"),
      "header provenance") shouldBe
      "eip0045-validity-tracker-canonical-synthetic-header-context"
    requiredBoolean(boundaries.downField("serializationConformanceOnly"),
      "serialization boundary") shouldBe true
    requiredBoolean(boundaries.downField("exactTrackerSuccessorIncluded"),
      "successor boundary") shouldBe true
    requiredBoolean(
      boundaries.downField("canonicalSyntheticHeaderIdsEstablished"),
      "canonical synthetic header boundary") shouldBe true
    requiredBoolean(
      boundaries.downField("minedHeaderEvidenceEstablished"),
      "mined header evidence boundary") shouldBe false
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

  private def verify(
      self: ErgoBox = trackerSelf,
      successor: ErgoBoxCandidate = trackerSuccessor,
      suppliedExtension: ContextExtension = extension,
      headers: Array[CHeader] = contextHeaders,
      capability: StarkVerificationCapability): Boolean = {
    val result = new ErgoLikeTestInterpreter().verify(
      self.ergoTree,
      transactionContext(
        self, successor, suppliedExtension, headers, capability),
      ProverResult(Array.emptyByteArray, suppliedExtension),
      Message)
    withClue(
      "tracker input-script verification must not collapse an interpreter failure into rejection: ") {
      result.isSuccess shouldBe true
    }
    result.get._1
  }

  private def candidate(
      tree: ErgoTree = trackerTree,
      value: Long = trackerValue,
      tokens: Coll[ErgoBox.Token] =
        Colls.fromArray(Array(trackerToken)),
      registers: ErgoBox.AdditionalRegisters =
        successorRegisters): ErgoBoxCandidate =
    new ErgoBoxCandidate(
      value,
      tree,
      currentHeight,
      tokens,
      registers)

  private def reduce(
      self: ErgoBox,
      successor: ErgoBoxCandidate,
      suppliedExtension: ContextExtension,
      headers: Array[CHeader],
      capability: StarkVerificationCapability) =
    new ErgoLikeTestInterpreter().fullReduction(
      self.ergoTree,
      transactionContext(
        self, successor, suppliedExtension, headers, capability))

  private def transactionContext(
      self: ErgoBox,
      successor: ErgoBoxCandidate,
      suppliedExtension: ContextExtension,
      headers: Array[CHeader],
      capability: StarkVerificationCapability): ErgoLikeContext = {
    val transaction = new ErgoLikeTransaction(
      IndexedSeq(Input(
        self.id,
        ProverResult(Array.emptyByteArray, suppliedExtension))),
      IndexedSeq.empty,
      IndexedSeq(successor))
    val tip = headers.head
    val tipState = tip.stateRoot match {
      case tree: CAvlTree => tree.treeData
      case _ => throw new IllegalArgumentException(
        "canonical context tip state root is not AVL tree data")
    }
    val preHeader = CPreHeader(
      tip.version,
      tip.id,
      tip.timestamp + 1L,
      tip.nBits,
      tip.height + 1,
      tip.minerPk,
      Colls.emptyColl[Byte])
    val base = ErgoLikeContextTesting(
      currentHeight = currentHeight,
      lastBlockUtxoRoot = tipState,
      minerPubkey = ErgoLikeContextTesting.dummyPubkey,
      boxesToSpend = IndexedSeq(self),
      spendingTransaction = transaction,
      self = self,
      activatedVersion = VersionContext.StarkVerificationVersion.toByte,
      extension = suppliedExtension)
    copyContext(base)(
      headers = Colls.fromArray(headers.map(header => header: Header)),
      preHeader = preHeader)
      .withStarkVerificationCapability(capability)
  }

  private def extensionWith(
      proofValue: EvaluatedValue[_ <: SType],
      bundleValue: EvaluatedValue[_ <: SType]): ContextExtension =
    ContextExtension(Map(
      0.toByte -> proofValue,
      1.toByte -> extension.get(1.toByte).get,
      2.toByte -> bundleValue,
      3.toByte -> extension.get(3.toByte).get))

  private def proofChunksValue(chunks: Array[Array[Byte]]) =
    ConcreteCollection[SCollection[SByte.type]](
      chunks.map(chunk => ByteArrayConstant(chunk)).toIndexedSeq,
      SCollection.SByteArray)

  private def parseHeaders(): Array[CHeader] = {
    val json = transitionCursor.downField("headers").focus.getOrElse(
      throw new IllegalArgumentException("headers missing"))
    val entries = json.asArray.getOrElse(
      throw new IllegalArgumentException("headers must be an array"))
    entries.zipWithIndex.map { case (entry, index) =>
      val cursor = entry.hcursor
      val headerJsonText = requiredString(
        cursor.downField("jvmHeaderJson"), s"header $index JVM JSON")
      val headerJson = parser.parse(headerJsonText).fold(
        failure => throw new IllegalArgumentException(
          s"header $index JVM JSON rejected: ${failure.getMessage}"),
        identity)
      val header = headerJson.as[Header].fold(
        failure => throw new IllegalArgumentException(
          s"header $index JVM decoding rejected: ${failure.getMessage}"),
        identity).asInstanceOf[CHeader]
      hex(header.id.toArray) shouldBe requiredString(
        cursor.downField("id"), s"header $index derived ID")
      ErgoHeader.sigmaSerializer.toBytes(header.ergoHeader) should
        contain theSameElementsInOrderAs hex(requiredString(
          cursor.downField("serializedHex"),
          s"header $index serialized bytes"))
      header
    }.toArray
  }

  private def registers(
      cursor: ACursor,
      label: String): ErgoBox.AdditionalRegisters =
    (4 to 9).map(index =>
      ErgoBox.nonMandatoryRegisters(index - 4) -> parseValue(requiredString(
        cursor.downField(s"R$index"), s"$label R$index"))).toMap

  private def parseExtension(bytes: Array[Byte]): ContextExtension = {
    val reader = SigmaSerializer.startReader(bytes)
    val parsed = ContextExtension.serializer.parse(reader)
    require(reader.remaining == 0,
      s"ContextExtension parser left ${reader.remaining} trailing bytes")
    parsed
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

  private def resourceBytes(path: String): Array[Byte] = {
    val in = getClass.getResourceAsStream(path)
    require(in != null, "missing pinned profile resource " + path)
    val out = new ByteArrayOutputStream()
    val buffer = new Array[Byte](8192)
    try {
      var read = in.read(buffer)
      while (read >= 0) {
        if (read > 0) out.write(buffer, 0, read)
        read = in.read(buffer)
      }
      out.toByteArray
    } finally {
      in.close()
      out.close()
    }
  }

  private def right[A, B](value: Either[A, B], label: String): B =
    value match {
      case Right(result) => result
      case Left(failure) => fail(s"$label rejected: $failure")
    }

  private def exactFile(raw: String, label: String): Path = {
    require(raw != null && raw.nonEmpty, s"missing $label path")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      s"$label must be a real file")
    path
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

  private def requiredLong(cursor: ACursor, label: String): Long =
    cursor.as[Long].toOption.orElse(
      cursor.as[String].toOption
        .filter(_.matches("[0-9]+"))
        .map(BigInt(_))
        .filter(_.isValidLong)
        .map(_.longValue)).getOrElse(
      throw new IllegalArgumentException(s"$label missing or invalid"))

  private def requiredBoolean(cursor: ACursor, label: String): Boolean =
    cursor.as[Boolean].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing or invalid: ${failure.getMessage}"),
      identity)

  private def hex(value: String): Array[Byte] = {
    require(value.matches("(?:[0-9a-f]{2})+"),
      "invalid lowercase whole-byte hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }

  private def hex(bytes: Array[Byte]): String =
    bytes.map(value => f"${value & 0xff}%02x").mkString
}
