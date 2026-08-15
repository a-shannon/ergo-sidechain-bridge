package sigma.bridge

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path, Paths, StandardOpenOption}
import java.security.MessageDigest

import org.scalatest.matchers.should.Matchers
import scorex.crypto.hash.Blake2b256
import sigma.VersionContext
import sigma.ast.ErgoTree.ZeroHeader
import sigma.ast._
import sigma.ast.syntax.ValueOps
import sigma.compiler.{CompilerResult, SigmaCompiler}
import sigma.compiler.ir.CompiletimeIRContext
import sigma.serialization.ErgoTreeSerializer.DefaultSerializer
import sigmastate.helpers.CompilerTestingCommons
import sigmastate.interpreter.Interpreter

class BridgeValidityApplicationLineageCompilerSpec
    extends CompilerTestingCommons with Matchers {
  private val RootProperty =
    "bridge.validity.application.lineage.root"
  private val OutputProperty =
    "bridge.eip0045.validity.application.lineage.identity.out"

  private val SigmaStateCommit =
    "f78deadd668f801e7fae3bc884283f79c6f484fa"
  private val ExpectedScalaVersion = "2.13.18"
  private val ExpectedSbtVersion = "1.12.11"
  private val ReceiptSchema =
    "e2s.validity-application-lineage-compiler-receipt.v1"
  private val TrackerTemplateSha256 =
    "94334a43b8c356babe5caeeb52bc7f79a20ebcac7587c725b1ed48af972947f5"
  private val VaultTemplateSha256 =
    "c30d57938590c130dbd97c50b54cb6c707d9ae53b3c2a2651712c9c0864631e7"
  private val DupTemplateSha256 =
    "76544c021b45f073e03a7497fb27e910559fdd8e8e2e15d4c3d1beca10eded6a"
  private val SourceLockTemplateSha256 =
    "c1f977e17472504b4b3a552d306be621b9fc32c8971f803356e03bfeaa4925ff"

  private val TrackerNft =
    "00e4ed6ac28c8ccd2a3476a39cb8ac33f7fdefefd0b88978841ed9bb9045a7e9"
  private val DupNft =
    "667382038b0da5742442e04629d11ca4047a73ea98da1b21ba37e5bd8a4eb538"
  private val SourceNetwork = "11" * 32
  private val Sidechain = "22" * 32
  private val BridgeAddress = "33" * 20
  private val TokenAddress = "44" * 20
  private val SettlementProfile = "55" * 32
  private val CausalProfile =
    "ab7b2ad7d79dfedb57ec1ba2c9e2d09ab404d3bda6c311a3a90bc75957c4b246"
  private val TrustAnchor = "aa" * 32
  private val ProgramId =
    "230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c"
  private val VerifierProfile =
    "23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383"
  private val ApplicationBinding =
    SourceNetwork + Sidechain + BridgeAddress + TokenAddress +
    SettlementProfile + CausalProfile + ("bb" * 32) + "00001000" +
    ("cc" * 32) + "00000800"
  private val ApplicationBindingDigest =
    "519646a9e4980570caaed860fb21e76938635ea3bfb05bc89a095ceb8adc3d57"
  private val CommitteePublicKeys = Vector(
    "02671c8e95c0237797901a6cdb2ef8e6599400578385455f3423f77e43df39aad5",
    "0227562580bbfc2cf3f72b3dbb725f30f358ca545209255458536adcf1a4aad871",
    "03b6447502eeff10813c6c7a01e1f2c3a97c54bbeeb3f9206984ccb0e63b0c56f3")
  private val CommitteeThreshold = "2"

  implicit lazy val IR: TestingIRContext = new TestingIRContext {
    beginPass(noConstPropagationPass)
  }

  property("pinned compiler emits one exact four-contract lineage instance") {
    scala.util.Properties.versionNumberString shouldBe ExpectedScalaVersion

    val root = exactDirectory(System.getProperty(RootProperty))
    val trackerTemplate = exactTemplate(
      root.resolve("contracts/SPVTrackerValidityApplicationLineageV3.es"),
      TrackerTemplateSha256)
    val vaultTemplate = exactTemplate(
      root.resolve(
        "contracts/MainChainCausalVaultValidityApplicationV2.es"),
      VaultTemplateSha256)
    val dupTemplate = exactTemplate(
      root.resolve(
        "contracts/DoubleUnlockPreventionValidityApplicationV2.es"),
      DupTemplateSha256)
    val sourceLockTemplate = exactTemplate(
      root.resolve("contracts/MainChainLockCausalLineageV3.es"),
      SourceLockTemplateSha256)

    val trackerSource = exactSource(
      replaceAll(trackerTemplate.source, Vector(
        "VALIDITY_APPLICATION_PROGRAM_ID_PLACEHOLDER" -> ProgramId,
        "VALIDITY_APPLICATION_VERIFIER_PROFILE_ID_PLACEHOLDER" ->
          VerifierProfile,
        "VALIDITY_APPLICATION_BINDING_PLACEHOLDER" -> ApplicationBinding)),
      "SPVTrackerValidityApplicationLineageV3",
      expectStark = true)

    val tracker = compileTracker(trackerSource.bytes, trackerSource.source)
    val shared = Vector(
      "TRACKER_NFT_ID_PLACEHOLDER" -> TrackerNft,
      "DUP_NFT_ID_PLACEHOLDER" -> DupNft,
      "VALIDITY_APPLICATION_TRACKER_CONTRACT_ID_PLACEHOLDER" ->
        tracker.contractId,
      "VALIDITY_SIDECHAIN_ID_PLACEHOLDER" -> Sidechain,
      "VALIDITY_APPLICATION_SETTLEMENT_PROFILE_ID_PLACEHOLDER" ->
        SettlementProfile,
      "VALIDITY_TRUST_ANCHOR_DIGEST_PLACEHOLDER" -> TrustAnchor)
    val vaultSource = exactSource(
      replaceAll(vaultTemplate.source, shared ++ Vector(
        "VALIDITY_SOURCE_NETWORK_ID_PLACEHOLDER" -> SourceNetwork,
        "VALIDITY_APPLICATION_CAUSAL_PROFILE_ID_PLACEHOLDER" ->
          CausalProfile,
        "VALIDITY_APPLICATION_BRIDGE_ADDRESS_PLACEHOLDER" ->
          BridgeAddress,
        "VALIDITY_APPLICATION_TOKEN_ADDRESS_PLACEHOLDER" -> TokenAddress,
        "VALIDITY_APPLICATION_BINDING_DIGEST_PLACEHOLDER" ->
          ApplicationBindingDigest,
        "VALIDITY_APPLICATION_PROGRAM_ID_PLACEHOLDER" -> ProgramId,
        "VALIDITY_APPLICATION_VERIFIER_PROFILE_ID_PLACEHOLDER" ->
          VerifierProfile)),
      "MainChainCausalVaultValidityApplicationV2",
      expectStark = false)
    val vault =
      compileStandard("causalVault", vaultSource.bytes, vaultSource.source)
    val dupSource = exactSource(
      replaceAll(dupTemplate.source, shared ++ Vector(
        "VALIDITY_APPLICATION_CAUSAL_VAULT_ERGOTREE_HASH_PLACEHOLDER" ->
          vault.contractId)),
      "DoubleUnlockPreventionValidityApplicationV2",
      expectStark = false)
    val dup = compileStandard(
      "duplicatePrevention",
      dupSource.bytes,
      dupSource.source)
    val committeeSource = CommitteePublicKeys.map { key =>
      s"""proveDlog(decodePoint(fromBase16("$key")))"""
    }.mkString(",\n    ")
    val sourceLockSource = exactSource(
      replaceAll(sourceLockTemplate.source, Vector(
        "CAUSAL_SOURCE_NETWORK_ID_HEX_PLACEHOLDER" -> SourceNetwork,
        "CAUSAL_SIDECHAIN_ID_HEX_PLACEHOLDER" -> Sidechain,
        "CAUSAL_BRIDGE_ADDRESS_HEX_PLACEHOLDER" -> BridgeAddress,
        "CAUSAL_TOKEN_ADDRESS_HEX_PLACEHOLDER" -> TokenAddress,
        "CAUSAL_SETTLEMENT_PROFILE_ID_HEX_PLACEHOLDER" ->
          SettlementProfile,
        "CAUSAL_PROFILE_ID_HEX_PLACEHOLDER" -> CausalProfile,
        "CAUSAL_SETTLEMENT_VAULT_CONTRACT_ID_HEX_PLACEHOLDER" ->
          vault.contractId,
        "COMMITTEE_SIGMAPROP_PLACEHOLDERS" -> committeeSource,
        "COMMITTEE_THRESHOLD_PLACEHOLDER" -> CommitteeThreshold)),
      "MainChainLockCausalLineageV3",
      expectStark = false)
    val sourceLock =
      compileStandard(
        "sourceLock",
        sourceLockSource.bytes,
        sourceLockSource.source)
    val contracts = Vector(tracker, vault, dup, sourceLock)

    contracts.map(_.contractId).distinct.size shouldBe contracts.size
    tracker.treeVersion shouldBe
      VersionContext.StarkVerificationVersion.toInt
    vault.treeVersion shouldBe 0
    dup.treeVersion shouldBe 0
    sourceLock.treeVersion shouldBe 0
    contracts.foreach { contract =>
      contract.propositionBytes.length should be > 0
      contract.propositionBytes.length should be < 65536
      contract.propositionBytes.length shouldBe contract.propositionHex.length / 2
    }

    assertSameContract(
      compileTracker(trackerSource.bytes, trackerSource.source),
      tracker)
    assertSameContract(compileStandard(
      "causalVault",
      vaultSource.bytes,
      vaultSource.source), vault)
    assertSameContract(compileStandard(
      "duplicatePrevention",
      dupSource.bytes,
      dupSource.source), dup)
    assertSameContract(compileStandard(
      "sourceLock",
      sourceLockSource.bytes,
      sourceLockSource.source), sourceLock)

    println(s"lineage_tracker_contract_id_hex=${tracker.contractId}")
    println(s"lineage_vault_contract_id_hex=${vault.contractId}")
    println(s"lineage_dup_contract_id_hex=${dup.contractId}")
    println(s"lineage_source_lock_contract_id_hex=${sourceLock.contractId}")

    writeReceiptIfRequested(contracts)
  }

  private final class SourceInput(
      val bytes: Array[Byte],
      val source: String)

  private final class ContractIdentity(
      val role: String,
      val sourceSha256: String,
      val treeVersion: Int,
      val propositionBytes: Array[Byte]) {
    val propositionHex: String = hex(propositionBytes)
    val propositionSha256: String = sha256(propositionBytes)
    val contractId: String = hex(Blake2b256(propositionBytes))
  }

  private def exactSource(
      source: String,
      requiredMarker: String,
      expectStark: Boolean): SourceInput = {
    val bytes = source.getBytes(StandardCharsets.US_ASCII)
    new String(bytes, StandardCharsets.US_ASCII) shouldBe source
    source should include(requiredMarker)
    source.contains('\r') shouldBe false
    "[A-Z][A-Z0-9_]+_PLACEHOLDERS?".r.findAllIn(source).toVector shouldBe
      empty
    source.contains("verifyStark") shouldBe expectStark
    new SourceInput(bytes, source)
  }

  private final class TemplateInput(
      val bytes: Array[Byte],
      val source: String)

  private def exactDirectory(raw: String): Path = {
    require(raw != null && raw.nonEmpty, s"missing -D$RootProperty")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(
      Files.isDirectory(path) && !Files.isSymbolicLink(path),
      "bridge root must be a real directory")
    path
  }

  private def exactTemplate(
      path: Path,
      expectedSha256: String): TemplateInput = {
    require(
      Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      s"$path must be a real file")
    val bytes = Files.readAllBytes(path)
    sha256(bytes) shouldBe expectedSha256
    val source = new String(bytes, StandardCharsets.US_ASCII)
    source.getBytes(StandardCharsets.US_ASCII).sameElements(bytes) shouldBe true
    source.contains('\r') shouldBe false
    new TemplateInput(bytes, source)
  }

  private def replaceAll(
      source: String,
      replacements: Seq[(String, String)]): String =
    replacements.foldLeft(source) { case (current, (placeholder, value)) =>
      current.sliding(placeholder.length).count(_ == placeholder) shouldBe 1
      current.replace(placeholder, value)
    }

  private def compileTracker(
      sourceBytes: Array[Byte],
      source: String): ContractIdentity = {
    val proposition = compile(Interpreter.emptyEnv, source).asSigmaProp
    val tree = ErgoTree.withSegregation(
      ErgoTree.headerWithVersion(
        ZeroHeader,
        VersionContext.StarkVerificationVersion.toByte),
      proposition)
    val bytes = DefaultSerializer.serializeErgoTree(tree)
    val parsed = DefaultSerializer.deserializeErgoTree(bytes)
    parsed.header shouldBe tree.header
    parsed.constants.toSeq shouldBe tree.constants.toSeq
    parsed.root shouldBe tree.root
    DefaultSerializer.serializeErgoTree(parsed) should
      contain theSameElementsInOrderAs bytes
    new ContractIdentity(
      "tracker",
      sha256(sourceBytes),
      tree.version.toInt,
      bytes)
  }

  private def compileStandard(
      role: String,
      sourceBytes: Array[Byte],
      source: String): ContractIdentity = {
    val bytes = VersionContext.withVersions(3.toByte, 0.toByte) {
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
      DefaultSerializer.serializeErgoTree(
        ErgoTree.fromProposition(
          ErgoTree.defaultHeaderWithVersion(0.toByte),
          proposition))
    }
    val parsed = DefaultSerializer.deserializeErgoTree(bytes)
    parsed.version shouldBe 0
    DefaultSerializer.serializeErgoTree(parsed) should
      contain theSameElementsInOrderAs bytes
    require(
      Set("causalVault", "duplicatePrevention", "sourceLock").contains(role),
      "unknown standard contract role")
    new ContractIdentity(
      role,
      sha256(sourceBytes),
      parsed.version.toInt,
      bytes)
  }

  private def assertSameContract(
      actual: ContractIdentity,
      expected: ContractIdentity): Unit = {
    actual.role shouldBe expected.role
    actual.sourceSha256 shouldBe expected.sourceSha256
    actual.treeVersion shouldBe expected.treeVersion
    actual.propositionBytes should
      contain theSameElementsInOrderAs expected.propositionBytes
    actual.propositionSha256 shouldBe expected.propositionSha256
    actual.contractId shouldBe expected.contractId
  }

  private def writeReceiptIfRequested(
      contracts: Vector[ContractIdentity]): Unit = {
    val raw = System.getProperty(OutputProperty)
    if (raw == null || raw.isEmpty) return
    val path = Paths.get(raw).toAbsolutePath.normalize()
    val parent = path.getParent
    require(
      parent != null && Files.isDirectory(parent) &&
        !Files.isSymbolicLink(parent),
      "lineage compiler receipt parent must be a real directory")
    require(
      !Files.exists(path),
      "lineage compiler receipt output must not already exist")

    val contractJson = contracts.map(receiptJson).mkString(",\n")
    val json =
      s"""{
         |  "schema": "e2s.validity-application-lineage-compiler-batch.v1",
         |  "version": 1,
         |  "sigmaStateCommit": "$SigmaStateCommit",
         |  "scalaVersion": "$ExpectedScalaVersion",
         |  "sbtVersion": "$ExpectedSbtVersion",
         |  "contracts": [
         |$contractJson
         |  ],
         |  "profileActivated": false,
         |  "nodeCheckPerformed": false,
         |  "signingAuthorityEstablished": false,
         |  "submissionAuthorityEstablished": false,
         |  "broadcastAuthorityEstablished": false,
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

  private def receiptJson(contract: ContractIdentity): String =
    s"""    {
       |      "schema": "$ReceiptSchema",
       |      "version": 1,
       |      "role": "${contract.role}",
       |      "sigmaStateCommit": "$SigmaStateCommit",
       |      "scalaVersion": "$ExpectedScalaVersion",
       |      "sbtVersion": "$ExpectedSbtVersion",
       |      "scriptVersion": 3,
       |      "treeVersion": ${contract.treeVersion},
       |      "resolvedSourceSha256Hex": "${contract.sourceSha256}",
       |      "propositionBytes": ${contract.propositionBytes.length},
       |      "propositionSha256Hex": "${contract.propositionSha256}",
       |      "propositionHex": "${contract.propositionHex}",
       |      "contractIdHex": "${contract.contractId}",
       |      "profileActivated": false,
       |      "nodeCheckPerformed": false,
       |      "signingAuthorityEstablished": false,
       |      "submissionAuthorityEstablished": false,
       |      "broadcastAuthorityEstablished": false,
       |      "fundsAuthorityEstablished": false,
       |      "gate5Closed": false
       |    }""".stripMargin

  private def hex(bytes: Array[Byte]): String =
    bytes.iterator.map(byte => f"${byte & 0xff}%02x").mkString

  private def sha256(bytes: Array[Byte]): String =
    hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
