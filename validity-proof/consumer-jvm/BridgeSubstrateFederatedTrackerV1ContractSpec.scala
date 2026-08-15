package sigma.bridge

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path, Paths, StandardOpenOption}
import java.security.MessageDigest

import io.circe.ACursor
import io.circe.parser
import org.scalatest.matchers.should.Matchers
import scorex.crypto.hash.Blake2b256
import sigma.VersionContext
import sigma.ast._
import sigma.compiler.{CompilerResult, SigmaCompiler}
import sigma.compiler.ir.CompiletimeIRContext
import sigma.serialization.ErgoTreeSerializer.DefaultSerializer
import sigmastate.helpers.CompilerTestingCommons

class BridgeSubstrateFederatedTrackerV1ContractSpec
    extends CompilerTestingCommons with Matchers {
  private val RootProperty =
    "bridge.substrate.federated.tracker.v1.root"
  private val OutputProperty =
    "bridge.substrate.federated.tracker.v1.identity.out"
  private val SourceRelativePath =
    "contracts/SPVTrackerSubstrateFederatedV1.es"
  private val VectorRelativePath =
    "relayer/test-vectors/substrate-federated-v1-tracker-admission.json"
  private val SigmaStateCommit =
    "f78deadd668f801e7fae3bc884283f79c6f484fa"
  private val ExpectedSourceSha256 =
    "8ea6c51bd501d59f10ba0c771828881d4fea10dc48d2cba451949a3f573ec852"
  private val ExpectedVectorSha256 =
    "87b1db594810e8e21f4132ed51ee929dde6a07cce9f690ec8bba2fc90c57f5be"
  private val ExpectedPropositionBytes = 2713
  private val ExpectedPropositionSha256 =
    "8de007e45b4528614885b922732c1d1b2f38bc76bc73f4468f91ccb85d4f7a80"
  private val ExpectedContractId =
    "4fbcc5372efb4338b6f150ee5455a7a0cebd1f07c6cb0cc2929e17155086af8c"

  implicit lazy val IR: TestingIRContext = new TestingIRContext {
    beginPass(noConstPropagationPass)
  }

  property("pinned compiler emits one exact federated tracker V1") {
    val root = exactDirectory(System.getProperty(RootProperty))
    val sourceBytes = exactFile(
      root.resolve(SourceRelativePath),
      ExpectedSourceSha256,
      "federated tracker source")
    val vectorBytes = exactFile(
      root.resolve(VectorRelativePath),
      ExpectedVectorSha256,
      "federated tracker vector",
      requireLfOnly = false)
    val source = new String(sourceBytes, StandardCharsets.US_ASCII)
    val vector = parser.parse(
      new String(vectorBytes, StandardCharsets.US_ASCII)).fold(
      failure => throw new IllegalArgumentException(
        "federated tracker vector rejected: " + failure.getMessage),
      identity)
    val cursor = vector.hcursor
    val profile = cursor.downField("input").downField("profile")
    val statement = cursor.downField("input").downField("statement")
    val tracker = cursor.downField("input").downField("tracker")
    val expected = cursor.downField("expected")
    val ergoKeys = requiredStringArray(
      profile.downField("ergoAdmissionPublicKeysHex"),
      "Ergo admission public keys")
    val ergoThreshold = requiredInt(
      profile.downField("ergoAdmissionThreshold"),
      "Ergo admission threshold")
    ergoKeys shouldBe ergoKeys.sorted
    ergoKeys.distinct shouldBe ergoKeys
    ergoThreshold shouldBe 2
    ergoKeys.length shouldBe 3
    val ergoSigmaProps = ergoKeys.map { key =>
      s"""proveDlog(decodePoint(fromBase16("$key")))"""
    }.mkString(",\n    ")

    val resolved = replaceExactly(source, Vector(
      "FEDERATED_TRACKER_NFT_ID_PLACEHOLDER" ->
        requiredString(tracker.downField("trackerNftIdHex"), "tracker NFT"),
      "FEDERATED_SOURCE_NETWORK_ID_PLACEHOLDER" ->
        requiredString(statement.downField("sourceNetworkIdHex"), "source network ID"),
      "FEDERATED_SIDECHAIN_ID_PLACEHOLDER" ->
        requiredString(statement.downField("sidechainIdHex"), "sidechain ID"),
      "FEDERATED_BRIDGE_ADDRESS_PLACEHOLDER" ->
        requiredString(statement.downField("bridgeAddressHex"), "bridge address"),
      "FEDERATED_TOKEN_ADDRESS_PLACEHOLDER" ->
        requiredString(statement.downField("tokenAddressHex"), "token address"),
      "FEDERATED_BRIDGE_RUNTIME_HASH_PLACEHOLDER" ->
        requiredString(statement.downField("bridgeRuntimeCodeSha256Hex"), "bridge runtime hash"),
      "FEDERATED_BRIDGE_RUNTIME_BYTES_PLACEHOLDER" ->
        uint32Hex(requiredInt(statement.downField("bridgeRuntimeCodeBytes"), "bridge runtime bytes")),
      "FEDERATED_TOKEN_RUNTIME_HASH_PLACEHOLDER" ->
        requiredString(statement.downField("tokenRuntimeCodeSha256Hex"), "token runtime hash"),
      "FEDERATED_TOKEN_RUNTIME_BYTES_PLACEHOLDER" ->
        uint32Hex(requiredInt(statement.downField("tokenRuntimeCodeBytes"), "token runtime bytes")),
      "FEDERATED_SOURCE_RUNTIME_HASH_PLACEHOLDER" ->
        requiredString(statement.downField("sourceRuntimeCodeSha256Hex"), "source runtime hash"),
      "FEDERATED_SOURCE_RUNTIME_BYTES_PLACEHOLDER" ->
        uint32Hex(requiredInt(statement.downField("sourceRuntimeCodeBytes"), "source runtime bytes")),
      "FEDERATED_RUNTIME_PROFILE_ID_PLACEHOLDER" ->
        requiredString(statement.downField("runtimeProfileIdHex"), "runtime profile ID"),
      "FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER" ->
        requiredString(statement.downField("settlementProfileIdHex"), "settlement profile ID"),
      "FEDERATED_PROFILE_ID_PLACEHOLDER" ->
        requiredString(expected.downField("federationProfileIdHex"), "federation profile ID"),
      "FEDERATED_SOURCE_KEY_SET_DIGEST_PLACEHOLDER" ->
        requiredString(expected.downField("sourceAttestationKeySetDigestHex"), "source key-set digest"),
      "FEDERATED_SOURCE_THRESHOLD_PLACEHOLDER" ->
        uint16Hex(requiredInt(profile.downField("sourceAttestationThreshold"), "source threshold")),
      "FEDERATED_ERGO_KEY_SET_DIGEST_PLACEHOLDER" ->
        requiredString(expected.downField("ergoAdmissionKeySetDigestHex"), "Ergo key-set digest"),
      "FEDERATED_ERGO_THRESHOLD_BYTES_PLACEHOLDER" ->
        uint16Hex(ergoThreshold),
      "FEDERATED_EPOCH_PLACEHOLDER" ->
        uint64Hex(requiredString(profile.downField("federationEpoch"), "federation epoch")),
      "FEDERATED_MAX_ADMISSION_VALIDITY_BLOCKS_PLACEHOLDER" ->
        s"${requiredString(profile.downField("maxAdmissionValidityBlocks"), "maximum validity blocks")}L",
      "FEDERATED_ERGO_SIGMAPROP_PLACEHOLDERS" -> ergoSigmaProps,
      "FEDERATED_ERGO_THRESHOLD_PLACEHOLDER" -> ergoThreshold.toString))
    resolved should include("SPVTrackerSubstrateFederatedV1")
    resolved should include("statement.size == 512")
    resolved should include("trackerValue.size == 370")
    resolved should include("atLeast(2, ergoAdmissionKeys)")
    resolved should include("does not")
    resolved should not include "verifyStark"
    resolved should not include "COMMITTEE_"
    "[A-Z][A-Z0-9_]+_PLACEHOLDERS?".r
      .findAllIn(resolved).toVector shouldBe empty
    resolved.contains('\r') shouldBe false

    val first = compileStandard(resolved)
    val second = compileStandard(resolved)
    first should contain theSameElementsInOrderAs second
    val contractId = hex(Blake2b256(first))
    val resolvedBytes = resolved.getBytes(StandardCharsets.US_ASCII)

    println(s"substrate_federated_tracker_v1_proposition_bytes=${first.length}")
    println(s"substrate_federated_tracker_v1_proposition_sha256=${sha256(first)}")
    println(s"substrate_federated_tracker_v1_contract_id_hex=$contractId")
    println(s"substrate_federated_tracker_v1_resolved_source_sha256=${sha256(resolvedBytes)}")
    first.length shouldBe ExpectedPropositionBytes
    sha256(first) shouldBe ExpectedPropositionSha256
    contractId shouldBe ExpectedContractId

    writeIdentityIfRequested(
      sourceBytes,
      resolvedBytes,
      first,
      contractId,
      cursor)
  }

  private def compileStandard(source: String): Array[Byte] =
    VersionContext.withVersions(3.toByte, 0.toByte) {
      val result = new SigmaCompiler(16.toByte).compile(Map.empty, source)(
        new CompiletimeIRContext)
      val proposition = result match {
        case CompilerResult(_, _, _, script: Value[SSigmaProp.type @unchecked])
            if script.tpe == SSigmaProp => script
        case CompilerResult(_, _, _, script: Value[SBoolean.type @unchecked])
            if script.tpe == SBoolean => script.toSigmaProp
        case other => throw new IllegalArgumentException(
          s"compiled federated tracker has type ${other.buildTree.tpe}")
      }
      val tree = ErgoTree.fromProposition(
        ErgoTree.defaultHeaderWithVersion(0.toByte),
        proposition)
      val bytes = DefaultSerializer.serializeErgoTree(tree)
      val parsed = DefaultSerializer.deserializeErgoTree(bytes)
      parsed.version shouldBe 0
      DefaultSerializer.serializeErgoTree(parsed) should
        contain theSameElementsInOrderAs bytes
      bytes
    }

  private def writeIdentityIfRequested(
      templateBytes: Array[Byte],
      resolvedSourceBytes: Array[Byte],
      propositionBytes: Array[Byte],
      contractId: String,
      cursor: io.circe.HCursor): Unit = {
    val raw = System.getProperty(OutputProperty)
    if (raw == null || raw.isEmpty) return
    val path = Paths.get(raw).toAbsolutePath.normalize()
    val parent = path.getParent
    require(parent != null && Files.isDirectory(parent) &&
      !Files.isSymbolicLink(parent),
      "federated tracker identity parent must be a real directory")
    require(!Files.exists(path),
      "federated tracker identity output must not already exist")
    val profile = cursor.downField("input").downField("profile")
    val statement = cursor.downField("input").downField("statement")
    val tracker = cursor.downField("input").downField("tracker")
    val expected = cursor.downField("expected")
    val ergoKeysJson = requiredStringArray(
      profile.downField("ergoAdmissionPublicKeysHex"),
      "Ergo admission public keys")
      .map(key => s"\"$key\"").mkString(", ")
    val json =
      s"""{
         |  "schema": "e2s.substrate-federated-v1-tracker-contract",
         |  "version": 1,
         |  "sigmaStateCommit": "$SigmaStateCommit",
         |  "templateSourceSha256Hex": "${sha256(templateBytes)}",
         |  "resolvedSourceSha256Hex": "${sha256(resolvedSourceBytes)}",
         |  "propositionBytes": ${propositionBytes.length},
         |  "propositionSha256Hex": "${sha256(propositionBytes)}",
         |  "propositionHex": "${hex(propositionBytes)}",
         |  "contractIdHex": "$contractId",
         |  "trackerNftIdHex": "${requiredString(tracker.downField("trackerNftIdHex"), "tracker NFT")}",
         |  "application": {
         |    "sourceNetworkIdHex": "${requiredString(statement.downField("sourceNetworkIdHex"), "source network ID")}",
         |    "sidechainIdHex": "${requiredString(statement.downField("sidechainIdHex"), "sidechain ID")}",
         |    "bridgeAddressHex": "${requiredString(statement.downField("bridgeAddressHex"), "bridge address")}",
         |    "tokenAddressHex": "${requiredString(statement.downField("tokenAddressHex"), "token address")}",
         |    "bridgeRuntimeCodeSha256Hex": "${requiredString(statement.downField("bridgeRuntimeCodeSha256Hex"), "bridge runtime hash")}",
         |    "bridgeRuntimeCodeBytes": ${requiredInt(statement.downField("bridgeRuntimeCodeBytes"), "bridge runtime bytes")},
         |    "tokenRuntimeCodeSha256Hex": "${requiredString(statement.downField("tokenRuntimeCodeSha256Hex"), "token runtime hash")}",
         |    "tokenRuntimeCodeBytes": ${requiredInt(statement.downField("tokenRuntimeCodeBytes"), "token runtime bytes")},
         |    "sourceRuntimeCodeSha256Hex": "${requiredString(statement.downField("sourceRuntimeCodeSha256Hex"), "source runtime hash")}",
         |    "sourceRuntimeCodeBytes": ${requiredInt(statement.downField("sourceRuntimeCodeBytes"), "source runtime bytes")},
         |    "runtimeProfileIdHex": "${requiredString(statement.downField("runtimeProfileIdHex"), "runtime profile ID")}",
         |    "settlementProfileIdHex": "${requiredString(statement.downField("settlementProfileIdHex"), "settlement profile ID")}"
         |  },
         |  "federationProfileIdHex": "${requiredString(expected.downField("federationProfileIdHex"), "federation profile ID")}",
         |  "sourceAttestationKeySetDigestHex": "${requiredString(expected.downField("sourceAttestationKeySetDigestHex"), "source key-set digest")}",
         |  "sourceAttestationThreshold": ${requiredInt(profile.downField("sourceAttestationThreshold"), "source threshold")},
         |  "ergoAdmissionKeySetDigestHex": "${requiredString(expected.downField("ergoAdmissionKeySetDigestHex"), "Ergo key-set digest")}",
         |  "ergoAdmissionThreshold": ${requiredInt(profile.downField("ergoAdmissionThreshold"), "Ergo threshold")},
         |  "ergoAdmissionPublicKeysHex": [$ergoKeysJson],
         |  "federationEpoch": "${requiredString(profile.downField("federationEpoch"), "federation epoch")}",
         |  "maxAdmissionValidityBlocks": "${requiredString(profile.downField("maxAdmissionValidityBlocks"), "maximum validity blocks")}",
         |  "sourceSignaturesVerifiedOnChain": false,
         |  "jvmReductionAccepted": false,
         |  "profileActivated": false,
         |  "signingPerformed": false,
         |  "submissionPerformed": false,
         |  "broadcastPerformed": false,
         |  "fundsAuthorityEstablished": false,
         |  "gate5Closed": false,
         |  "trustlessStatusEstablished": false
         |}
         |""".stripMargin
    Files.write(
      path,
      json.getBytes(StandardCharsets.US_ASCII),
      StandardOpenOption.CREATE_NEW,
      StandardOpenOption.WRITE)
  }

  private def exactDirectory(raw: String): Path = {
    require(raw != null && raw.nonEmpty, s"missing -D$RootProperty")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isDirectory(path) && !Files.isSymbolicLink(path),
      "bridge root must be a real directory")
    path
  }

  private def exactFile(
      path: Path,
      expectedSha256: String,
      label: String,
      requireLfOnly: Boolean = true): Array[Byte] = {
    require(Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      s"$label must be a real file")
    val bytes = Files.readAllBytes(path)
    require(bytes.nonEmpty && bytes.forall(byte => byte >= 0 && byte <= 0x7f),
      s"$label must be non-empty ASCII")
    if (requireLfOnly)
      require(!bytes.contains('\r'.toByte), s"$label must be LF-only")
    sha256(bytes) shouldBe expectedSha256
    bytes
  }

  private def replaceExactly(
      source: String,
      replacements: Seq[(String, String)]): String =
    replacements.foldLeft(source) { case (current, (placeholder, value)) =>
      current.sliding(placeholder.length).count(_ == placeholder) shouldBe 1
      current.replace(placeholder, value)
    }

  private def requiredString(cursor: ACursor, label: String): String =
    cursor.as[String].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing: ${failure.getMessage}"),
      identity)

  private def requiredInt(cursor: ACursor, label: String): Int =
    cursor.as[Int].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing: ${failure.getMessage}"),
      identity)

  private def requiredStringArray(
      cursor: ACursor,
      label: String): Vector[String] =
    cursor.as[Vector[String]].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing: ${failure.getMessage}"),
      identity)

  private def uint16Hex(value: Int): String = {
    require(value > 0 && value <= 0xffff, "uint16 value is out of range")
    f"$value%04x"
  }

  private def uint32Hex(value: Int): String = {
    require(value > 0, "uint32 value must be positive")
    f"$value%08x"
  }

  private def uint64Hex(value: String): String = {
    val parsed = BigInt(value)
    require(parsed > 0 && parsed <= BigInt(Long.MaxValue),
      "uint64 value exceeds the positive signed Long range")
    f"$parsed%016x"
  }

  private def hex(bytes: Array[Byte]): String =
    bytes.iterator.map(byte => f"${byte & 0xff}%02x").mkString

  private def sha256(bytes: Array[Byte]): String =
    hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
