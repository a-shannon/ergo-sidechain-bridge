package sigma.bridge

import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}

import org.ergoplatform._
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.hash.Blake2b256
import sigma.VersionContext
import sigma.ast.ErgoTree.ZeroHeader
import sigma.ast.SCollection.SByteArray
import sigma.ast._
import sigma.ast.syntax.TrueSigmaProp
import sigma.data.AvlTreeData
import sigma.eval.StarkVerificationCapability._
import sigma.eval.{Risc0StockProfileRuntime, StarkVerificationCapability}
import sigma.exceptions.{InvalidType, OpcodeUnavailableException, StarkOpcodeErgoTreeVersionException, StarkProfileQuarantinedException}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.ErgoTreeSerializer.DefaultSerializer
import sigma.stark.profile.Risc0ProfilePackageLoader
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.createBox

class BridgeValidityConsumerSpec extends AnyFunSuite with Matchers {
  private val CandidateDirectoryProperty = "bridge.eip0045.candidate.dir"
  private val ProfilePackageRoot = "/stark-kats/eip0045-profile-package/"
  private val PropositionHex =
    "1c53020e205b46bf0ef2ff959327bfb39c6ac4dae48d509a0fcf91f89dcf84b26f44203934" +
    "0e2023c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383" +
    "d1b9e4e3001ae4e3010e73007301"
  private val ContractIdHex =
    "9d0ac3c2c7889ef4bfa53c31903f5e11012f20b24156cbcf82b3435d95a290fc"
  private val StatementDigestHex =
    "e8aa9bc3671f75779cec78c91194ff33c56e7035a4100c6ee9ee644db564dd8c"
  private val TerminalControlIdHex =
    "7a8f24092c34ed3eb81b3d0a0b796c588c615d3488ef9e61c21dbd1e4b83ea6e"
  private val StatementBytes = 813
  private val StatementPrefixBytes = 159
  private val ProofChunkLengths = Array(65535, 65535, 65535, 26063)
  private val CandidateFileNames = Vector(
    "statement.bin",
    "program-id.bin",
    "profile-id.bin",
    "terminal-control-id.bin",
    "proof-chunk-0.bin",
    "proof-chunk-1.bin",
    "proof-chunk-2.bin",
    "proof-chunk-3.bin")
  private val Message = Blake2b256("bridge EIP-0045 consumer fixture").toArray
  private val BoxValue = 1000000L

  private lazy val propositionBytes = hex(PropositionHex)
  private lazy val executableTree =
    DefaultSerializer.deserializeErgoTree(propositionBytes)
  private lazy val statement = candidateBytes("statement.bin")
  private lazy val proofChunks = ProofChunkLengths.indices
    .map(index => candidateBytes(s"proof-chunk-$index.bin")).toArray
  private lazy val profileId = candidateBytes("profile-id.bin")
  private lazy val programId = candidateBytes("program-id.bin")
  private lazy val chainDomainId = statement.slice(27, 59)
  private lazy val contractId = statement.slice(123, 155)
  private lazy val applicationPayload = statement.drop(StatementPrefixBytes)

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
  private lazy val activeCapability = snapshotFor(chainDomainId, activeEntry)

  test("pinned JVM emits the exact executable consumer and candidate statement") {
    val generatedTree = consumerTree()
    propositionBytes.length shouldBe 85
    hex(Blake2b256(propositionBytes)) shouldBe ContractIdHex
    DefaultSerializer.serializeErgoTree(generatedTree) should contain theSameElementsInOrderAs
      propositionBytes
    DefaultSerializer.serializeErgoTree(executableTree) should contain theSameElementsInOrderAs
      propositionBytes
    executableTree.header shouldBe generatedTree.header
    executableTree.constants.toSeq shouldBe generatedTree.constants.toSeq
    executableTree.root shouldBe generatedTree.root

    statement.length shouldBe StatementBytes
    hex(Blake2b256(statement)) shouldBe StatementDigestHex
    readU32Le(statement, 155) shouldBe applicationPayload.length
    profileId.length shouldBe 32
    programId.length shouldBe 32
    proofChunks.map(_.length) should contain theSameElementsInOrderAs ProofChunkLengths
    hex(candidateBytes("terminal-control-id.bin")) shouldBe TerminalControlIdHex
    statement.slice(59, 91) should contain theSameElementsInOrderAs profileId
    statement.slice(91, 123) should contain theSameElementsInOrderAs programId
    contractId should contain theSameElementsInOrderAs hex(ContractIdHex)
  }

  test("exact proof succeeds through input-script verification in a funds-neutral transaction") {
    verifyInputScript(
      executableTree,
      extension(proofChunks, applicationPayload),
      activeCapability) shouldBe true
  }

  test("proof, chunk-order, and payload mutations reject independently") {
    val wrongProof = cloneChunks(proofChunks)
    wrongProof(0)(0) = (wrongProof(0)(0) ^ 1).toByte
    verifyInputScript(
      executableTree,
      extension(wrongProof, applicationPayload),
      activeCapability) shouldBe false

    val wrongOrder = cloneChunks(proofChunks)
    val first = wrongOrder(0)
    wrongOrder(0) = wrongOrder(1)
    wrongOrder(1) = first
    verifyInputScript(
      executableTree,
      extension(wrongOrder, applicationPayload),
      activeCapability) shouldBe false

    val wrongPayload = applicationPayload.clone()
    wrongPayload(0) = (wrongPayload(0) ^ 1).toByte
    verifyInputScript(
      executableTree,
      extension(proofChunks, wrongPayload),
      activeCapability) shouldBe false
  }

  test("program, chain domain, and SELF proposition mutations reject independently") {
    val wrongProgram = programId.clone()
    wrongProgram(0) = (wrongProgram(0) ^ 1).toByte
    verifyInputScript(
      consumerTree(program = wrongProgram),
      extension(proofChunks, applicationPayload),
      activeCapability) shouldBe false

    val wrongChain = chainDomainId.clone()
    wrongChain(0) = (wrongChain(0) ^ 1).toByte
    verifyInputScript(
      executableTree,
      extension(proofChunks, applicationPayload),
      snapshotFor(wrongChain, activeEntry)) shouldBe false

    verifyInputScript(
      consumerTree(wrapWithTrue = true),
      extension(proofChunks, applicationPayload),
      activeCapability) shouldBe false
  }

  test("context shape, profile lifecycle, and tree-version guards fail closed") {
    verifyInputScript(
      executableTree,
      extension(proofChunks.updated(3, proofChunks(3).dropRight(1)), applicationPayload),
      activeCapability) shouldBe false

    val wrongProfile = profileId.clone()
    wrongProfile(0) = (wrongProfile(0) ^ 1).toByte
    verifyInputScript(
      consumerTree(profile = wrongProfile),
      extension(proofChunks, applicationPayload),
      activeCapability) shouldBe false

    intercept[OpcodeUnavailableException] {
      reduce(
        executableTree,
        extension(proofChunks, applicationPayload),
        StarkVerificationCapability.Unavailable)
    }

    val quarantinedEntry = right(
      StarkVerificationCapability.quarantined(profileId),
      "quarantined profile")
    intercept[StarkProfileQuarantinedException] {
      reduce(
        executableTree,
        extension(proofChunks, applicationPayload),
        snapshotFor(chainDomainId, quarantinedEntry))
    }

    intercept[StarkOpcodeErgoTreeVersionException] {
      reduce(
        consumerTree(version = 3),
        extension(proofChunks, applicationPayload),
        activeCapability,
        activatedVersion = 3)
    }
  }

  test("missing or wrong-typed context variables cannot reach proof acceptance") {
    intercept[NoSuchElementException] {
      reduce(
        executableTree,
        ContextExtension.empty,
        activeCapability)
    }
    intercept[InvalidType] {
      reduce(
        executableTree,
        ContextExtension(Map(
          0.toByte -> IntConstant(1),
          1.toByte -> ByteArrayConstant(applicationPayload))),
        activeCapability)
    }
    intercept[InvalidType] {
      reduce(
        executableTree,
        ContextExtension(Map(
          0.toByte -> proofChunksValue(proofChunks),
          1.toByte -> IntConstant(1))),
        activeCapability)
    }
  }

  private def consumerTree(
      program: Array[Byte] = programId,
      profile: Array[Byte] = profileId,
      wrapWithTrue: Boolean = false,
      version: Int = VersionContext.StarkVerificationVersion): ErgoTree = {
    val call = VerifyStark(
      OptionGet(GetVar(0.toByte, SCollection(SByteArray))),
      OptionGet(GetVar(1.toByte, SByteArray)),
      ByteArrayConstant(program),
      ByteArrayConstant(profile))
    val body = if (wrapWithTrue) BinAnd(TrueLeaf, call) else call
    ErgoTree.withSegregation(
      ErgoTree.headerWithVersion(ZeroHeader, version.toByte),
      body.toSigmaProp)
  }

  private def extension(
      chunks: Array[Array[Byte]],
      payload: Array[Byte]): ContextExtension =
    ContextExtension(Map(
      0.toByte -> proofChunksValue(chunks),
      1.toByte -> ByteArrayConstant(payload)))

  private def proofChunksValue(chunks: Array[Array[Byte]]) =
    ConcreteCollection[SByteArray](
      chunks.map(chunk => ByteArrayConstant(chunk)).toIndexedSeq,
      SByteArray)

  private def verifyInputScript(
      tree: ErgoTree,
      extension: ContextExtension,
      capability: StarkVerificationCapability): Boolean = {
    val context = transactionContext(tree, extension, capability, tree.version)
    val verification = new ErgoLikeTestInterpreter()
      .verify(tree, context, ProverResult(Array.emptyByteArray, extension), Message)
    withClue("input-script verification must complete without interpreter failure: ") {
      verification.isSuccess shouldBe true
    }
    verification.get._1
  }

  private def reduce(
      tree: ErgoTree,
      extension: ContextExtension,
      capability: StarkVerificationCapability,
      activatedVersion: Int = VersionContext.StarkVerificationVersion) =
    new ErgoLikeTestInterpreter().fullReduction(
      tree,
      transactionContext(tree, extension, capability, activatedVersion))

  private def transactionContext(
      tree: ErgoTree,
      extension: ContextExtension,
      capability: StarkVerificationCapability,
      activatedVersion: Int): ErgoLikeContext = {
    val self = createBox(BoxValue, tree)
    val output = createBox(BoxValue, ErgoTree.fromProposition(TrueSigmaProp))
    val transaction = new ErgoLikeTransaction(
      IndexedSeq(Input(self.id, ProverResult(Array.emptyByteArray, extension))),
      IndexedSeq.empty,
      IndexedSeq(output))
    ErgoLikeContextTesting(
      currentHeight = 0,
      lastBlockUtxoRoot = AvlTreeData.dummy,
      minerPubkey = ErgoLikeContextTesting.dummyPubkey,
      boxesToSpend = IndexedSeq(self),
      spendingTransaction = transaction,
      self = self,
      activatedVersion = activatedVersion.toByte,
      extension = extension)
      .withStarkVerificationCapability(capability)
  }

  private def snapshotFor(
      chain: Array[Byte],
      entry: ProfileEntry): StarkVerificationCapability =
    right(
      StarkVerificationCapability.snapshot(
        chain,
        protocolGeneration = 1,
        HistoricalBlockValidation,
        dispatchJit = 100,
        Vector(entry)),
      "capability snapshot")

  private lazy val candidateRoot = {
    val rawRoot = System.getProperty(CandidateDirectoryProperty)
    require(rawRoot != null && rawRoot.nonEmpty,
      s"missing -D$CandidateDirectoryProperty")
    val root = Paths.get(rawRoot).toAbsolutePath.normalize()
    require(Files.isDirectory(root) && !Files.isSymbolicLink(root),
      "candidate root must be a real directory")
    root
  }

  private lazy val candidateEntries: Map[String, (Int, String)] = {
    val path = candidateRoot.resolve("candidate-manifest-v1.txt").normalize()
    require(path.getParent == candidateRoot &&
      Files.isRegularFile(path) &&
      !Files.isSymbolicLink(path),
      "complete candidate manifest is unavailable")
    val lines = new String(
      Files.readAllBytes(path),
      StandardCharsets.US_ASCII).split("\n", -1).toVector
    require(lines.headOption.contains(
      "schema=e2s.bridge-validity-eip0045-candidate.v1"),
      "candidate manifest schema mismatch")
    require(lines.lift(1).contains("version=1"),
      "candidate manifest version mismatch")
    require(lines.takeRight(2) == Vector("complete=true", ""),
      "candidate manifest must end with the completion marker")
    val entries = lines.slice(2, lines.length - 2).map { line =>
      val parts = line.stripPrefix("file=").split(":", -1)
      require(line.startsWith("file=") && parts.length == 3,
        "candidate manifest file entry is malformed")
      require(parts(1).matches("[0-9]+"),
        "candidate manifest byte length is malformed")
      require(parts(2).matches("[0-9a-f]{64}"),
        "candidate manifest digest is malformed")
      parts(0) -> (parts(1).toInt, parts(2))
    }
    require(entries.map(_._1) == CandidateFileNames,
      "candidate manifest file order or names mismatch")
    require(entries.map(_._1).distinct.length == entries.length,
      "candidate manifest contains duplicate files")
    entries.toMap
  }

  private def candidateBytes(name: String): Array[Byte] = {
    val expected = candidateEntries.getOrElse(name,
      throw new IllegalArgumentException("candidate file is not manifested: " + name))
    val root = candidateRoot
    val path = root.resolve(name).normalize()
    require(path.getParent == root && Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      s"candidate file is unavailable: $name")
    val bytes = Files.readAllBytes(path)
    require(bytes.length == expected._1,
      s"candidate file length mismatch: $name")
    require(hex(Blake2b256(bytes)) == expected._2,
      s"candidate file digest mismatch: $name")
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

  private def right[A, B](value: Either[A, B], label: String): B = value match {
    case Right(result) => result
    case Left(failure) => fail(s"$label rejected: $failure")
  }

  private def cloneChunks(chunks: Array[Array[Byte]]): Array[Array[Byte]] =
    chunks.map(_.clone())

  private def readU32Le(bytes: Array[Byte], offset: Int): Int =
    (bytes(offset) & 0xff) |
      ((bytes(offset + 1) & 0xff) << 8) |
      ((bytes(offset + 2) & 0xff) << 16) |
      ((bytes(offset + 3) & 0xff) << 24)

  private def hex(value: String): Array[Byte] =
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray

  private def hex(bytes: Array[Byte]): String =
    bytes.map(value => f"${value & 0xff}%02x").mkString
}
