package sigma.bridge

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths, StandardOpenOption}
import java.security.MessageDigest

import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.hash.Blake2b256
import sigma.VersionContext
import sigma.ast.{ErgoTree, SBoolean, SSigmaProp, Value}
import sigma.compiler.{CompilerResult, SigmaCompiler}
import sigma.compiler.ir.CompiletimeIRContext
import sigma.serialization.ErgoTreeSerializer

class BridgeValiditySettlementContractSpec
    extends AnyFunSuite with Matchers {
  private val RootProperty = "bridge.validity.settlement.root"
  private val OutputProperty =
    "bridge.eip0045.validity.settlement.identity.out"

  private val ExpectedVaultTemplateSha256 =
    "89a317e7554e7c1ec5df0d3cb4c16aca1e3ad54302d412149010c70ef7197e30"
  private val ExpectedDupTemplateSha256 =
    "e23a382656a5f652b07e327ee532fe30eb21a004d3c05d04aa7dd16490e0e2af"
  private val ExpectedVaultSourceSha256 =
    "0f7591ddcee082d4d712cc94c673bff5992246f9959286767a76c36d6bd16576"
  private val ExpectedVaultBytes = 2558
  private val ExpectedVaultSha256 =
    "5749bf8e737579d834bf661946ebe99acb642353df0b73444efeaee01fe00731"
  private val ExpectedVaultContractId =
    "cbd6fd09d69e25ffc0407da6de94a70a38ee7fc2114891094252d9e7778e3fff"
  private val ExpectedDupSourceSha256 =
    "79633365941304e7534981458f371a7fe236a4b983522e53c3c2314c347e1eec"
  private val ExpectedDupBytes = 672
  private val ExpectedDupSha256 =
    "2a2f8aafd9ed576e1bd9e36f3277f468ec015460ab348ab16eb28439105b6192"
  private val ExpectedDupContractId =
    "854444a9f7f44ad4ca50e7344027d8857588aff0fbb27dd422633249150ef312"

  private val TrackerNft = "91" * 32
  private val DupNft = "a1" * 32
  private val TrackerContract =
    "c22f8d631e99022bd4bad5ce84ee9d7da30bf51684977c8bad28d8200f8cff5b"
  private val SourceNetwork = "31" * 32
  private val Sidechain = "11" * 32
  private val SettlementProfile =
    "72ae135aea3c9a29b1dc170c5b425fbd8b2d54c4338ca2f831be17438e0972ee"
  private val AdmissionProfile = "41" * 32
  private val TrustAnchor =
    "4ebf246ef2a1ad2e27005b6fed7a85c7e2dcb4ce88c97400e31fd33bb5251454"
  private val SemanticProgram =
    "c175355a0813b4381e9ec9526e00dc0eb920bee5d841936ae2b8d3d3aea3e106"
  private val VerifierProfile = "82" * 32

  test("pinned compiler emits exact committee-free validity settlement trees") {
    val root = exactDirectory(System.getProperty(RootProperty))
    val vaultTemplateBytes = exactFileBytes(root.resolve(
      "contracts/MainChainCausalVaultValidityV1.es"))
    val dupTemplateBytes = exactFileBytes(root.resolve(
      "contracts/DoubleUnlockPreventionValidityV1.es"))

    val shared = Vector(
      "TRACKER_NFT_ID_PLACEHOLDER" -> TrackerNft,
      "DUP_NFT_ID_PLACEHOLDER" -> DupNft,
      "VALIDITY_TRACKER_CONTRACT_ID_PLACEHOLDER" -> TrackerContract,
      "VALIDITY_SIDECHAIN_ID_PLACEHOLDER" -> Sidechain,
      "VALIDITY_SETTLEMENT_PROFILE_ID_PLACEHOLDER" -> SettlementProfile,
      "VALIDITY_TRUST_ANCHOR_DIGEST_PLACEHOLDER" -> TrustAnchor)
    val vaultSource = replaceAll(
      new String(vaultTemplateBytes, StandardCharsets.US_ASCII),
      shared ++ Vector(
        "VALIDITY_SOURCE_NETWORK_ID_PLACEHOLDER" -> SourceNetwork,
        "VALIDITY_ADMISSION_PROFILE_ID_PLACEHOLDER" -> AdmissionProfile,
        "VALIDITY_COMPATIBILITY_SEMANTIC_PROGRAM_ID_PLACEHOLDER" ->
          SemanticProgram,
        "VALIDITY_COMPATIBILITY_VERIFIER_PROFILE_ID_PLACEHOLDER" ->
          VerifierProfile))
    val vaultBytes = compile(vaultSource)
    val vaultContractId = hex(Blake2b256(vaultBytes))
    val dupSource = replaceAll(
      new String(dupTemplateBytes, StandardCharsets.US_ASCII),
      shared ++ Vector(
        "VALIDITY_CAUSAL_VAULT_ERGOTREE_HASH_PLACEHOLDER" ->
          vaultContractId))
    val dupBytes = compile(dupSource)
    val dupContractId = hex(Blake2b256(dupBytes))

    sha256(vaultTemplateBytes) shouldBe ExpectedVaultTemplateSha256
    sha256(dupTemplateBytes) shouldBe ExpectedDupTemplateSha256
    vaultSource should not include "[SigmaProp]"
    vaultSource should not include "atLeast("
    dupSource should not include "[SigmaProp]"
    dupSource should not include "atLeast("
    unresolvedPlaceholders(vaultSource) shouldBe empty
    unresolvedPlaceholders(dupSource) shouldBe empty
    sha256(vaultSource.getBytes(StandardCharsets.US_ASCII)) shouldBe
      ExpectedVaultSourceSha256
    vaultBytes.length shouldBe ExpectedVaultBytes
    sha256(vaultBytes) shouldBe ExpectedVaultSha256
    vaultContractId shouldBe ExpectedVaultContractId
    sha256(dupSource.getBytes(StandardCharsets.US_ASCII)) shouldBe
      ExpectedDupSourceSha256
    dupBytes.length shouldBe ExpectedDupBytes
    sha256(dupBytes) shouldBe ExpectedDupSha256
    dupContractId shouldBe ExpectedDupContractId

    compile(vaultSource) should contain theSameElementsInOrderAs vaultBytes
    compile(dupSource) should contain theSameElementsInOrderAs dupBytes
    writeIdentityIfRequested(
      vaultTemplateBytes,
      vaultSource,
      vaultBytes,
      vaultContractId,
      dupTemplateBytes,
      dupSource,
      dupBytes,
      dupContractId)
  }

  private def compile(source: String): Array[Byte] =
    VersionContext.withVersions(3.toByte, 0.toByte) {
      val compiler = new SigmaCompiler(16.toByte)
      val result = compiler.compile(Map.empty, source)(
        new CompiletimeIRContext)
      val proposition = result match {
        case CompilerResult(_, _, _, script: Value[SSigmaProp.type @unchecked])
            if script.tpe == SSigmaProp => script
        case CompilerResult(_, _, _, script: Value[SBoolean.type @unchecked])
            if script.tpe == SBoolean => script.toSigmaProp
        case other => throw new IllegalArgumentException(
          s"compiled source has type ${other.buildTree.tpe}")
      }
      ErgoTreeSerializer.DefaultSerializer.serializeErgoTree(
        ErgoTree.fromProposition(
          ErgoTree.defaultHeaderWithVersion(0.toByte),
          proposition))
    }

  private def replaceAll(
      source: String,
      replacements: Seq[(String, String)]): String =
    replacements.foldLeft(source) { case (current, (placeholder, value)) =>
      require(current.contains(placeholder), s"missing $placeholder")
      current.replace(placeholder, value)
    }

  private def unresolvedPlaceholders(source: String): Vector[String] =
    "[A-Z][A-Z0-9_]+_PLACEHOLDER".r.findAllIn(source).toVector

  private def exactDirectory(raw: String) = {
    require(raw != null && raw.nonEmpty, s"missing -D$RootProperty")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isDirectory(path) && !Files.isSymbolicLink(path),
      "bridge root must be a real directory")
    path
  }

  private def exactFileBytes(path: java.nio.file.Path): Array[Byte] = {
    require(Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      s"$path must be a real file")
    Files.readAllBytes(path)
  }

  private def writeIdentityIfRequested(
      vaultTemplate: Array[Byte],
      vaultSource: String,
      vaultBytes: Array[Byte],
      vaultContractId: String,
      dupTemplate: Array[Byte],
      dupSource: String,
      dupBytes: Array[Byte],
      dupContractId: String): Unit = {
    val raw = System.getProperty(OutputProperty)
    if (raw == null || raw.isEmpty) return
    val path = Paths.get(raw).toAbsolutePath.normalize()
    val parent = path.getParent
    require(parent != null && Files.isDirectory(parent) &&
      !Files.isSymbolicLink(parent),
      "validity settlement identity output parent must be a real directory")
    require(!Files.exists(path),
      "validity settlement identity output must not already exist")
    val json =
      s"""{
         |  "schema": "e2s.bridge-validity-settlement-contracts.v1",
         |  "version": 1,
         |  "sigmaStateCommit": "f78deadd668f801e7fae3bc884283f79c6f484fa",
         |  "settlementProfileIdHex": "$SettlementProfile",
         |  "vault": {
         |    "templateSha256Hex": "${sha256(vaultTemplate)}",
         |    "resolvedSourceSha256Hex": "${sha256(vaultSource.getBytes(StandardCharsets.US_ASCII))}",
         |    "propositionBytes": ${vaultBytes.length},
         |    "propositionSha256Hex": "${sha256(vaultBytes)}",
         |    "propositionHex": "${hex(vaultBytes)}",
         |    "contractIdHex": "$vaultContractId"
         |  },
         |  "duplicatePrevention": {
         |    "templateSha256Hex": "${sha256(dupTemplate)}",
         |    "resolvedSourceSha256Hex": "${sha256(dupSource.getBytes(StandardCharsets.US_ASCII))}",
         |    "propositionBytes": ${dupBytes.length},
         |    "propositionSha256Hex": "${sha256(dupBytes)}",
         |    "propositionHex": "${hex(dupBytes)}",
         |    "contractIdHex": "$dupContractId"
         |  },
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

  private def hex(bytes: Array[Byte]): String =
    bytes.iterator.map(byte => f"${byte & 0xff}%02x").mkString

  private def sha256(bytes: Array[Byte]): String =
    hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
