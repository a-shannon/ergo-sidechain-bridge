package sigma.bridge

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths, StandardOpenOption}
import java.security.MessageDigest

import scorex.crypto.hash.Blake2b256
import sigma.VersionContext
import sigma.ast.ErgoTree.ZeroHeader
import sigma.ast._
import sigma.ast.syntax.ValueOps
import sigma.serialization.ErgoTreeSerializer.DefaultSerializer
import sigmastate.helpers.CompilerTestingCommons
import sigmastate.interpreter.Interpreter

class BridgeValidityApplicationTrackerContractSpec
    extends CompilerTestingCommons {
  private val SourceProperty =
    "bridge.eip0045.validity.application.tracker.source"
  private val OutputProperty =
    "bridge.eip0045.validity.application.tracker.identity.out"
  private val ExpectedSourceSha256 =
    "58ca1aa1558adcef5e5997c34df8cdd699effd2f00f8a5ccac5982cbd290f96f"
  private val ExpectedPropositionBytes = 2424
  private val ExpectedContractId =
    "adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b"

  implicit lazy val IR: TestingIRContext = new TestingIRContext {
    beginPass(noConstPropagationPass)
  }

  property("pinned compiler emits one exact application-bound V2 tracker") {
    val sourceBytes = sourceFileBytes()
    val source = new String(sourceBytes, StandardCharsets.US_ASCII)
    source should include("verifyStark")
    source should include("SPVTrackerValidityApplicationV2")
    sha256(sourceBytes) shouldBe ExpectedSourceSha256

    val proposition = compile(Interpreter.emptyEnv, source).asSigmaProp
    val tree = ErgoTree.withSegregation(
      ErgoTree.headerWithVersion(
        ZeroHeader,
        VersionContext.StarkVerificationVersion.toByte),
      proposition)
    val bytes = DefaultSerializer.serializeErgoTree(tree)
    val parsed = DefaultSerializer.deserializeErgoTree(bytes)

    tree.version shouldBe VersionContext.StarkVerificationVersion
    parsed.header shouldBe tree.header
    parsed.constants.toSeq shouldBe tree.constants.toSeq
    parsed.root shouldBe tree.root
    DefaultSerializer.serializeErgoTree(parsed) should
      contain theSameElementsInOrderAs bytes
    val contractId = hex(Blake2b256(bytes))
    println(s"validity_application_tracker_proposition_bytes=${bytes.length}")
    println(s"validity_application_tracker_proposition_hex=${hex(bytes)}")
    println(s"validity_application_tracker_contract_id_hex=$contractId")
    bytes.length shouldBe ExpectedPropositionBytes
    bytes.length should be < 65536
    contractId shouldBe ExpectedContractId
    writeIdentityIfRequested(sourceBytes, bytes, contractId)
  }

  private def sourceFileBytes(): Array[Byte] = {
    val rawPath = System.getProperty(SourceProperty)
    require(rawPath != null && rawPath.nonEmpty, s"missing -D$SourceProperty")
    val path = Paths.get(rawPath).toAbsolutePath.normalize()
    require(
      Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      "application tracker source must be a real file")
    Files.readAllBytes(path)
  }

  private def writeIdentityIfRequested(
      sourceBytes: Array[Byte],
      propositionBytes: Array[Byte],
      contractId: String): Unit = {
    val rawPath = System.getProperty(OutputProperty)
    if (rawPath == null || rawPath.isEmpty) return
    val path = Paths.get(rawPath).toAbsolutePath.normalize()
    val parent = path.getParent
    require(
      parent != null && Files.isDirectory(parent) &&
        !Files.isSymbolicLink(parent),
      "application tracker identity output parent must be a real directory")
    require(!Files.exists(path),
      "application tracker identity output must not already exist")
    val json =
      s"""{
         |  "schema": "e2s.bridge-validity-application-tracker-contract.v2",
         |  "version": 2,
         |  "sigmaStateCommit": "f78deadd668f801e7fae3bc884283f79c6f484fa",
         |  "sourceSha256Hex": "${sha256(sourceBytes)}",
         |  "propositionBytes": ${propositionBytes.length},
         |  "propositionSha256Hex": "${sha256(propositionBytes)}",
         |  "propositionHex": "${hex(propositionBytes)}",
         |  "contractIdHex": "$contractId",
         |  "profileActivated": false,
         |  "fundsAuthorityEstablished": false,
         |  "gate5Closed": false
         |}
         |""".stripMargin
    Files.write(
      path,
      json.getBytes(StandardCharsets.US_ASCII),
      StandardOpenOption.CREATE_NEW,
      StandardOpenOption.WRITE)
  }

  private def hex(bytes: Array[Byte]): String =
    bytes.iterator.map(byte => f"${byte & 0xff}%02x").mkString

  private def sha256(bytes: Array[Byte]): String =
    hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
