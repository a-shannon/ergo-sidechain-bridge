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

class BridgeValidityTrackerContractSpec extends CompilerTestingCommons {
  private val SourceProperty = "bridge.eip0045.validity.tracker.source"
  private val OutputProperty = "bridge.eip0045.validity.tracker.identity.out"
  private val ExpectedSourceSha256 =
    "147737352138614d529178751751b03b478e1df0029d5cd387fd0f420e1548db"
  private val ExpectedPropositionBytes = 1784
  private val ExpectedContractId =
    "c22f8d631e99022bd4bad5ce84ee9d7da30bf51684977c8bad28d8200f8cff5b"

  implicit lazy val IR: TestingIRContext = new TestingIRContext {
    beginPass(noConstPropagationPass)
  }

  property("pinned compiler emits one exact version-4 validity tracker") {
    val sourceBytes = sourceFileBytes()
    val source = new String(sourceBytes, StandardCharsets.US_ASCII)
    source should include("verifyStark")
    source should include("SPVTrackerValidityV1")
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
    DefaultSerializer.serializeErgoTree(parsed) should contain theSameElementsInOrderAs bytes
    val contractId = hex(Blake2b256(bytes))
    println(s"validity_tracker_proposition_bytes=${bytes.length}")
    println(s"validity_tracker_proposition_hex=${hex(bytes)}")
    println(s"validity_tracker_contract_id_hex=$contractId")
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
      "validity tracker source must be a real file")
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
    require(parent != null && Files.isDirectory(parent) && !Files.isSymbolicLink(parent),
      "validity tracker identity output parent must be a real directory")
    require(!Files.exists(path), "validity tracker identity output must not already exist")
    val json =
      s"""{
         |  "schema": "e2s.bridge-validity-tracker-contract.v1",
         |  "version": 1,
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
