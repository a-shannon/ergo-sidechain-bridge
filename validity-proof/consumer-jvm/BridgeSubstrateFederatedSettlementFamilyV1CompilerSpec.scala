package sigma.bridge

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path, Paths, StandardOpenOption}
import java.security.MessageDigest

import org.scalatest.matchers.should.Matchers
import scorex.crypto.hash.Blake2b256
import sigma.VersionContext
import sigma.ast._
import sigma.compiler.{CompilerResult, SigmaCompiler}
import sigma.compiler.ir.CompiletimeIRContext
import sigma.serialization.ErgoTreeSerializer.DefaultSerializer
import sigmastate.helpers.CompilerTestingCommons

class BridgeSubstrateFederatedSettlementFamilyV1CompilerSpec
    extends CompilerTestingCommons with Matchers {
  private val RootProperty =
    "bridge.substrate.federated.settlement.v1.root"
  private val OutputProperty =
    "bridge.substrate.federated.settlement.v1.identity.out"

  private val SigmaStateCommit =
    "f78deadd668f801e7fae3bc884283f79c6f484fa"
  private val ExpectedScalaVersion = "2.13.18"
  private val ExpectedSbtVersion = "1.12.11"
  private val ReceiptSchema =
    "e2s.validity-application-pooled-reserve-compiler-receipt.v1"
  private val BatchSchema =
    "e2s.validity-application-pooled-reserve-compiler-batch.v1"

  private val DupTemplateSha256 =
    "a3902150efcdeb4025a50c6a14149d9dc656232c5c65c923a91f85658ddaa12f"
  private val SourceLockTemplateSha256 =
    "f03c1e2ecbb0433d9b5bcad2489467bee26e2e03543ec2a1cd61c18aba21db6b"
  private val PooledReserveTemplateSha256 =
    "44f8bf015c301b3fe478764cfc2b841a026b9727a71fa0c4d5a60309894d67f5"

  private val TrackerNft =
    "0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d"
  private val DupNft =
    "0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e"
  private val PooledReserveNft =
    "0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f"
  private val SettlementFamily =
    "fc4ef41f900e0801c56183999056ef739c4cce29dab9a7c7129ecaf49c76e6e8"
  private val TrackerContract =
    "4fbcc5372efb4338b6f150ee5455a7a0cebd1f07c6cb0cc2929e17155086af8c"
  private val SourceNetwork =
    "0101010101010101010101010101010101010101010101010101010101010101"
  private val Sidechain =
    "0202020202020202020202020202020202020202020202020202020202020202"
  private val BridgeAddress =
    "0606060606060606060606060606060606060606"
  private val TokenAddress =
    "0707070707070707070707070707070707070707"
  private val RuntimeProfile =
    "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b"
  private val SettlementProfile =
    "0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c"
  private val FederationProfile =
    "957cac901136cc26a00ef51293bf587789292856f79ae0bcf6b4b4c253927de8"
  private val ErgoKeySetDigest =
    "9615487c6728fe34514499611d89a438c70ef6788c4b4228dc4885bb59e5ce98"
  private val ErgoThreshold = "0002"
  private val FederationEpoch = "0000000000000007"

  implicit lazy val IR: TestingIRContext = new TestingIRContext {
    beginPass(noConstPropagationPass)
  }

  property("pinned compiler emits the exact federated settlement family") {
    scala.util.Properties.versionNumberString shouldBe ExpectedScalaVersion
    assertConcreteInputs()

    val root = exactDirectory(System.getProperty(RootProperty))
    val dupTemplate = exactTemplate(
      root.resolve(
        "contracts/DoubleUnlockPreventionSubstrateFederatedV1.es"),
      DupTemplateSha256)
    val sourceLockTemplate = exactTemplate(
      root.resolve("contracts/MainChainLockPooledReserveV6.es"),
      SourceLockTemplateSha256)
    val pooledReserveTemplate = exactTemplate(
      root.resolve(
        "contracts/MainChainPooledReserveValidityApplicationV6.es"),
      PooledReserveTemplateSha256)

    val dupSource = exactSource(
      replaceAll(dupTemplate.source, Vector(
        "FEDERATED_SETTLEMENT_TRACKER_NFT_ID_PLACEHOLDER" -> TrackerNft,
        "FEDERATED_SETTLEMENT_DUP_NFT_ID_PLACEHOLDER" -> DupNft,
        "FEDERATED_SETTLEMENT_RESERVE_NFT_ID_PLACEHOLDER" ->
          PooledReserveNft,
        "FEDERATED_SETTLEMENT_FAMILY_ID_PLACEHOLDER" -> SettlementFamily,
        "FEDERATED_SETTLEMENT_TRACKER_CONTRACT_ID_PLACEHOLDER" ->
          TrackerContract,
        "FEDERATED_SETTLEMENT_SOURCE_NETWORK_ID_PLACEHOLDER" ->
          SourceNetwork,
        "FEDERATED_SETTLEMENT_SIDECHAIN_ID_PLACEHOLDER" -> Sidechain,
        "FEDERATED_SETTLEMENT_RUNTIME_PROFILE_ID_PLACEHOLDER" ->
          RuntimeProfile,
        "FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER" ->
          SettlementProfile,
        "FEDERATED_SETTLEMENT_FEDERATION_PROFILE_ID_PLACEHOLDER" ->
          FederationProfile,
        "FEDERATED_SETTLEMENT_ERGO_KEY_SET_DIGEST_PLACEHOLDER" ->
          ErgoKeySetDigest,
        "FEDERATED_SETTLEMENT_ERGO_THRESHOLD_PLACEHOLDER" ->
          ErgoThreshold,
        "FEDERATED_SETTLEMENT_EPOCH_PLACEHOLDER" -> FederationEpoch)),
      "DoubleUnlockPreventionSubstrateFederatedV1")
    val duplicatePrevention = compileStandard(
      "duplicatePrevention",
      dupSource.bytes,
      dupSource.source)

    val sourceLockSource = exactSource(
      replaceAll(sourceLockTemplate.source, Vector(
        "POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER" -> SourceNetwork,
        "POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER" -> Sidechain,
        "POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER" -> BridgeAddress,
        "POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER" -> TokenAddress,
        "POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER" ->
          SettlementProfile,
        "POOLED_RESERVE_PROFILE_ID_PLACEHOLDER" -> SettlementFamily,
        "POOLED_RESERVE_NFT_ID_PLACEHOLDER" -> PooledReserveNft)),
      "MainChainLockPooledReserveV6")
    val sourceLock = compileStandard(
      "sourceLock",
      sourceLockSource.bytes,
      sourceLockSource.source)

    val pooledReserveSource = exactSource(
      replaceAll(pooledReserveTemplate.source, Vector(
        "POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER" -> DupNft,
        "POOLED_RESERVE_NFT_ID_PLACEHOLDER" -> PooledReserveNft,
        "POOLED_RESERVE_PROFILE_ID_PLACEHOLDER" -> SettlementFamily,
        "POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER" -> Sidechain,
        "POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER" -> SourceNetwork,
        "POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER" -> BridgeAddress,
        "POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER" -> TokenAddress,
        "POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER" ->
          SettlementProfile,
        "POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER" ->
          duplicatePrevention.contractId,
        "POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER" ->
          sourceLock.contractId)),
      "MainChainPooledReserveValidityApplicationV6")
    val pooledReserve = compileStandard(
      "pooledReserve",
      pooledReserveSource.bytes,
      pooledReserveSource.source)

    val contracts =
      Vector(duplicatePrevention, sourceLock, pooledReserve)
    contracts.map(_.contractId).distinct.size shouldBe contracts.size
    contracts.foreach { contract =>
      contract.treeVersion shouldBe 0
      contract.propositionBytes.length should be > 0
      contract.propositionBytes.length should be < 4096
      contract.propositionBytes.length shouldBe
        contract.propositionHex.length / 2
    }

    assertSameContract(
      compileStandard(
        "duplicatePrevention",
        dupSource.bytes,
        dupSource.source),
      duplicatePrevention)
    assertSameContract(
      compileStandard(
        "sourceLock",
        sourceLockSource.bytes,
        sourceLockSource.source),
      sourceLock)
    assertSameContract(
      compileStandard(
        "pooledReserve",
        pooledReserveSource.bytes,
        pooledReserveSource.source),
      pooledReserve)

    println(
      "federated_settlement_dup_contract_id_hex=" +
        duplicatePrevention.contractId)
    println(
      "federated_settlement_source_lock_contract_id_hex=" +
        sourceLock.contractId)
    println(
      "federated_settlement_reserve_contract_id_hex=" +
        pooledReserve.contractId)

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

  private final class TemplateInput(
      val bytes: Array[Byte],
      val source: String)

  private def assertConcreteInputs(): Unit = {
    Vector(
      ("DUP template SHA-256", DupTemplateSha256, 32),
      ("source-lock template SHA-256", SourceLockTemplateSha256, 32),
      ("pooled-reserve template SHA-256", PooledReserveTemplateSha256, 32),
      ("tracker NFT", TrackerNft, 32),
      ("DUP NFT", DupNft, 32),
      ("pooled-reserve NFT", PooledReserveNft, 32),
      ("settlement family", SettlementFamily, 32),
      ("tracker contract", TrackerContract, 32),
      ("source network", SourceNetwork, 32),
      ("sidechain", Sidechain, 32),
      ("bridge address", BridgeAddress, 20),
      ("token address", TokenAddress, 20),
      ("runtime profile", RuntimeProfile, 32),
      ("settlement profile", SettlementProfile, 32),
      ("federation profile", FederationProfile, 32),
      ("Ergo key-set digest", ErgoKeySetDigest, 32),
      ("Ergo threshold", ErgoThreshold, 2),
      ("federation epoch", FederationEpoch, 8)
    ).foreach { case (label, value, bytes) =>
      exactHex(value, bytes, label)
    }
    Vector(TrackerNft, DupNft, PooledReserveNft).distinct.size shouldBe 3
    BridgeAddress should not be TokenAddress
    TrackerContract should not be SettlementFamily
  }

  private def exactHex(
      value: String,
      bytes: Int,
      label: String): Unit = {
    withClue(s"$label must be exact lowercase hex: ") {
      value should fullyMatch regex s"[0-9a-f]{${bytes * 2}}"
    }
  }

  private def exactSource(
      source: String,
      requiredMarker: String): SourceInput = {
    val bytes = source.getBytes(StandardCharsets.US_ASCII)
    new String(bytes, StandardCharsets.US_ASCII) shouldBe source
    source should include(requiredMarker)
    source.contains('\r') shouldBe false
    "[A-Z][A-Z0-9_]+_PLACEHOLDERS?".r
      .findAllIn(source).toVector shouldBe empty
    source.contains("verifyStark") shouldBe false
    new SourceInput(bytes, source)
  }

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
    source.getBytes(StandardCharsets.US_ASCII)
      .sameElements(bytes) shouldBe true
    source.contains('\r') shouldBe false
    new TemplateInput(bytes, source)
  }

  private def replaceAll(
      source: String,
      replacements: Seq[(String, String)]): String =
    replacements.foldLeft(source) { case (current, (placeholder, value)) =>
      current.sliding(placeholder.length)
        .count(_ == placeholder) shouldBe 1
      current.replace(placeholder, value)
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
      Set("duplicatePrevention", "sourceLock", "pooledReserve")
        .contains(role),
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
      parent != null &&
        Files.isDirectory(parent) &&
        !Files.isSymbolicLink(parent),
      "federated settlement receipt parent must be a real directory")
    require(
      !Files.exists(path),
      "federated settlement receipt output must not already exist")

    val contractJson = contracts.map(receiptJson).mkString(",\n")
    val json =
      s"""{
         |  "schema": "$BatchSchema",
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
