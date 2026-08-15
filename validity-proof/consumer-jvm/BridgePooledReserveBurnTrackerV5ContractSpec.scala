package sigma.bridge

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path, Paths, StandardOpenOption}
import java.security.MessageDigest

import io.circe.parser
import org.scalatest.matchers.should.Matchers
import scorex.crypto.hash.Blake2b256
import sigma.VersionContext
import sigma.ast.ErgoTree.ZeroHeader
import sigma.ast._
import sigma.ast.syntax.ValueOps
import sigma.serialization.ErgoTreeSerializer.DefaultSerializer
import sigmastate.helpers.CompilerTestingCommons
import sigmastate.interpreter.Interpreter

class BridgePooledReserveBurnTrackerV5ContractSpec
    extends CompilerTestingCommons with Matchers {
  private val RootProperty =
    "bridge.eip0045.pooled.reserve.burn.tracker.root"
  private val OutputProperty =
    "bridge.eip0045.pooled.reserve.burn.tracker.identity.out"
  private val SourceRelativePath =
    "contracts/SPVTrackerPooledReserveBurnV5.es"
  private val VectorRelativePath =
    "relayer/test-vectors/pooled-reserve-burn-statement-v5.json"
  private val SigmaStateCommit =
    "f78deadd668f801e7fae3bc884283f79c6f484fa"
  private val ExpectedSourceSha256 =
    "db88ddcacaf01d92d13daa8ac96f234ab6720fceefbf0018e671f41eb26a1d16"
  private val ExpectedVectorSha256 =
    "3e4773612be260eb6ba484b9a86bbed99cbe72d3077437f5b3802c56a2e58e02"
  private val ProgramId =
    "bd72f52090ed45f2803767f64cde4d4314b7735f27e8d4596c4db37f1dc52a31"
  private val VerifierProfileId =
    "23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383"
  private val RejectedApplicationV2ProgramId =
    "230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c"
  private val ExpectedPropositionBytes = 2943
  private val ExpectedPropositionSha256 =
    "55affa576cc67f5d7e729f9deae5ab7272963b80c2f7473c24b3b74476904efd"
  private val ExpectedContractId =
    "008a6dfbcadae28b4383ff35b0d333a163dfe54b925e565844ae128331abb7a0"

  implicit lazy val IR: TestingIRContext = new TestingIRContext {
    beginPass(noConstPropagationPass)
  }

  property("pinned compiler emits one self-bound pooled-reserve burn V5 tracker") {
    val root = exactDirectory(System.getProperty(RootProperty))
    val sourceBytes = exactFile(
      root.resolve(SourceRelativePath),
      ExpectedSourceSha256,
      "pooled-reserve burn tracker source")
    val vectorBytes = exactFile(
      root.resolve(VectorRelativePath),
      ExpectedVectorSha256,
      "pooled-reserve burn statement vector",
      requireLfOnly = false)
    val source = new String(sourceBytes, StandardCharsets.US_ASCII)
    val binding = vectorBinding(vectorBytes)
    val bindingPrefix = binding.take(450)
    binding.length shouldBe 486
    bindingPrefix.length shouldBe 450
    bindingPrefix.head shouldBe 5.toByte
    binding.takeRight(4) should contain theSameElementsInOrderAs
      Array.fill[Byte](4)(0)

    val resolved = replaceExactly(source, Vector(
      "POOLED_RESERVE_BURN_V5_PROGRAM_ID_PLACEHOLDER" -> ProgramId,
      "POOLED_RESERVE_BURN_V5_VERIFIER_PROFILE_ID_PLACEHOLDER" ->
        VerifierProfileId,
      "POOLED_RESERVE_BURN_V5_APPLICATION_BINDING_PREFIX_PLACEHOLDER" ->
        hex(bindingPrefix)))
    resolved should include("SPVTrackerPooledReserveBurnV5")
    resolved should include("blake2b256(SELF.propositionBytes)")
    resolved should include("payload.size == 981")
    resolved should include("verifyStark")
    resolved should not include RejectedApplicationV2ProgramId
    "[A-Z][A-Z0-9_]+_PLACEHOLDER".r
      .findAllIn(resolved).toVector shouldBe empty
    resolved.contains('\r') shouldBe false

    val first = compileTracker(resolved)
    val second = compileTracker(resolved)
    first should contain theSameElementsInOrderAs second
    val contractId = hex(Blake2b256(first))

    println(s"pooled_reserve_burn_tracker_v5_proposition_bytes=${first.length}")
    println(s"pooled_reserve_burn_tracker_v5_proposition_sha256=${sha256(first)}")
    println(s"pooled_reserve_burn_tracker_v5_contract_id_hex=$contractId")
    first.length shouldBe ExpectedPropositionBytes
    first.length should be < 65536
    sha256(first) shouldBe ExpectedPropositionSha256
    contractId shouldBe ExpectedContractId

    writeIdentityIfRequested(
      sourceBytes,
      resolved.getBytes(StandardCharsets.US_ASCII),
      bindingPrefix,
      first,
      contractId)
  }

  private def compileTracker(source: String): Array[Byte] = {
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
    bytes
  }

  private def vectorBinding(bytes: Array[Byte]): Array[Byte] = {
    val json = parser.parse(
      new String(bytes, StandardCharsets.US_ASCII)).fold(
      failure => throw new IllegalArgumentException(
        "pooled-reserve burn statement vector rejected: " +
          failure.getMessage),
      identity)
    val value = json.hcursor.downField("expected")
      .downField("encodedBindingHex").as[String].fold(
      failure => throw new IllegalArgumentException(
        "pooled-reserve burn statement vector binding missing: " +
          failure.getMessage),
      identity)
    decodeHex(value, 486, "pooled-reserve burn statement binding")
  }

  private def replaceExactly(
      source: String,
      replacements: Seq[(String, String)]): String =
    replacements.foldLeft(source) { case (current, (placeholder, value)) =>
      current.sliding(placeholder.length)
        .count(_ == placeholder) shouldBe 1
      current.replace(placeholder, value)
    }

  private def exactDirectory(raw: String): Path = {
    require(raw != null && raw.nonEmpty, s"missing -D$RootProperty")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(
      Files.isDirectory(path) && !Files.isSymbolicLink(path),
      "bridge root must be a real directory")
    path
  }

  private def exactFile(
      path: Path,
      expectedSha256: String,
      label: String,
      requireLfOnly: Boolean = true): Array[Byte] = {
    require(
      Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      s"$label must be a real file")
    val bytes = Files.readAllBytes(path)
    require(bytes.nonEmpty, s"$label must be non-empty")
    require(bytes.forall(byte => byte >= 0 && byte <= 0x7f),
      s"$label must be ASCII")
    if (requireLfOnly)
      require(!bytes.contains('\r'.toByte), s"$label must be LF-only")
    sha256(bytes) shouldBe expectedSha256
    bytes
  }

  private def writeIdentityIfRequested(
      templateBytes: Array[Byte],
      resolvedSourceBytes: Array[Byte],
      bindingPrefix: Array[Byte],
      propositionBytes: Array[Byte],
      contractId: String): Unit = {
    val raw = System.getProperty(OutputProperty)
    if (raw == null || raw.isEmpty) return
    val path = Paths.get(raw).toAbsolutePath.normalize()
    val parent = path.getParent
    require(
      parent != null && Files.isDirectory(parent) &&
        !Files.isSymbolicLink(parent),
      "pooled-reserve burn tracker identity parent must be a real directory")
    require(!Files.exists(path),
      "pooled-reserve burn tracker identity output must not already exist")
    val json =
      s"""{
         |  "schema": "e2s.pooled-reserve-burn-tracker-contract.v5",
         |  "version": 5,
         |  "sigmaStateCommit": "$SigmaStateCommit",
         |  "templateSourceSha256Hex": "${sha256(templateBytes)}",
         |  "resolvedSourceSha256Hex": "${sha256(resolvedSourceBytes)}",
         |  "applicationBindingPrefixHex": "${hex(bindingPrefix)}",
         |  "programIdHex": "$ProgramId",
         |  "verifierProfileIdHex": "$VerifierProfileId",
         |  "propositionBytes": ${propositionBytes.length},
         |  "propositionSha256Hex": "${sha256(propositionBytes)}",
         |  "propositionHex": "${hex(propositionBytes)}",
         |  "contractIdHex": "$contractId",
         |  "profileActivated": false,
         |  "nodeCheckPerformed": false,
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

  private def decodeHex(
      value: String,
      bytes: Int,
      label: String): Array[Byte] = {
    require(value.matches(s"[0-9a-f]{${bytes * 2}}"),
      s"$label must be exact lowercase hex")
    value.grouped(2)
      .map((pair: String) => Integer.parseInt(pair, 16).toByte)
      .toArray
  }

  private def hex(bytes: Array[Byte]): String =
    bytes.iterator.map(byte => f"${byte & 0xff}%02x").mkString

  private def sha256(bytes: Array[Byte]): String =
    hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
