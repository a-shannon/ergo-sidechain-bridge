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

class BridgeValidityApplicationSettlementContractSpec
    extends AnyFunSuite with Matchers {
  private val RootProperty =
    "bridge.validity.application.settlement.root"
  private val OutputProperty =
    "bridge.eip0045.validity.application.settlement.identity.out"

  private val ExpectedVaultTemplateSha256 =
    "c30d57938590c130dbd97c50b54cb6c707d9ae53b3c2a2651712c9c0864631e7"
  private val ExpectedDupTemplateSha256 =
    "76544c021b45f073e03a7497fb27e910559fdd8e8e2e15d4c3d1beca10eded6a"
  private val ExpectedVaultSourceSha256 =
    "3824f398ae8fc8e24f3992edf53723956273d448764f35d662864e75e9e078e6"
  private val ExpectedVaultBytes = 3562
  private val ExpectedVaultSha256 =
    "043657b6d81e88eefcc3e7a967f021689f01d54fbcbd88ec2e5696a91ae03e11"
  private val ExpectedVaultContractId =
    "a77327ce3bd279b725ea4dddbbbd78046ab744f3cb75ccf46d5147046fe77064"
  private val ExpectedDupSourceSha256 =
    "ee478e55fb74e4ebdb287739655a502a848e06673cb8ade47e03c3fd443eb458"
  private val ExpectedDupBytes = 701
  private val ExpectedDupSha256 =
    "52c03c0cc46d3c168649918ab8962da30a0163ef28eb33a0a0d1ab2630582618"
  private val ExpectedDupContractId =
    "58d1e5b169a86e7906d4d87fe2a4214bd5327ff4053370c6a0fbe3b8e79939b9"

  private val TrackerNft = "a1" * 32
  private val DupNft = "a2" * 32
  private val TrackerContract =
    "adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b"
  private val SourceNetwork = "11" * 32
  private val Sidechain = "22" * 32
  private val SettlementProfile = "55" * 32
  private val CausalProfile =
    "a0a5ba76f51548dfa7148b623cedcbb6205ce1f51428a508480ece5df66e73f5"
  private val BridgeAddress = "33" * 20
  private val TokenAddress = "44" * 20
  private val TrustAnchor =
    "bb6a14b2c4a73c39dae8de6c2214c330858120232806c77110263b395e493abe"
  private val ApplicationBindingDigest =
    "5feb8c9311afef7c729ef2df0c0648f87689b10f9e0b9f48637c15024f6b587a"
  private val ProgramId =
    "230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c"
  private val VerifierProfile =
    "23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383"

  test("pinned compiler emits exact application-bound settlement trees") {
    val root = exactDirectory(System.getProperty(RootProperty))
    val vaultTemplateBytes = exactFileBytes(root.resolve(
      "contracts/MainChainCausalVaultValidityApplicationV2.es"))
    val dupTemplateBytes = exactFileBytes(root.resolve(
      "contracts/DoubleUnlockPreventionValidityApplicationV2.es"))

    val shared = Vector(
      "TRACKER_NFT_ID_PLACEHOLDER" -> TrackerNft,
      "DUP_NFT_ID_PLACEHOLDER" -> DupNft,
      "VALIDITY_APPLICATION_TRACKER_CONTRACT_ID_PLACEHOLDER" ->
        TrackerContract,
      "VALIDITY_SIDECHAIN_ID_PLACEHOLDER" -> Sidechain,
      "VALIDITY_APPLICATION_SETTLEMENT_PROFILE_ID_PLACEHOLDER" ->
        SettlementProfile,
      "VALIDITY_TRUST_ANCHOR_DIGEST_PLACEHOLDER" -> TrustAnchor)
    val vaultSource = replaceAll(
      new String(vaultTemplateBytes, StandardCharsets.US_ASCII),
      shared ++ Vector(
        "VALIDITY_SOURCE_NETWORK_ID_PLACEHOLDER" -> SourceNetwork,
        "VALIDITY_APPLICATION_CAUSAL_PROFILE_ID_PLACEHOLDER" ->
          CausalProfile,
        "VALIDITY_APPLICATION_BRIDGE_ADDRESS_PLACEHOLDER" -> BridgeAddress,
        "VALIDITY_APPLICATION_TOKEN_ADDRESS_PLACEHOLDER" -> TokenAddress,
        "VALIDITY_APPLICATION_BINDING_DIGEST_PLACEHOLDER" ->
          ApplicationBindingDigest,
        "VALIDITY_APPLICATION_PROGRAM_ID_PLACEHOLDER" -> ProgramId,
        "VALIDITY_APPLICATION_VERIFIER_PROFILE_ID_PLACEHOLDER" ->
          VerifierProfile))
    val vaultBytes = compile(vaultSource)
    val vaultContractId = hex(Blake2b256(vaultBytes))
    val dupSource = replaceAll(
      new String(dupTemplateBytes, StandardCharsets.US_ASCII),
      shared ++ Vector(
        "VALIDITY_APPLICATION_CAUSAL_VAULT_ERGOTREE_HASH_PLACEHOLDER" ->
          vaultContractId))
    val dupBytes = compile(dupSource)
    val dupContractId = hex(Blake2b256(dupBytes))

    writeIdentityIfRequested(
      vaultTemplateBytes,
      vaultSource,
      vaultBytes,
      vaultContractId,
      dupTemplateBytes,
      dupSource,
      dupBytes,
      dupContractId)

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
      "application settlement identity output parent must be a real directory")
    require(!Files.exists(path),
      "application settlement identity output must not already exist")
    val json =
      s"""{
         |  "schema": "e2s.bridge-validity-application-settlement-contracts.v2",
         |  "version": 2,
         |  "sigmaStateCommit": "f78deadd668f801e7fae3bc884283f79c6f484fa",
         |  "settlementProfileIdHex": "$SettlementProfile",
         |  "causalProfileIdHex": "$CausalProfile",
         |  "applicationBindingDigestHex": "$ApplicationBindingDigest",
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
