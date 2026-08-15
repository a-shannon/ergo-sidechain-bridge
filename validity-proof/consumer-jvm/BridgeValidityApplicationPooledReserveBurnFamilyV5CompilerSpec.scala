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

class BridgeValidityApplicationPooledReserveBurnFamilyV5CompilerSpec
    extends CompilerTestingCommons with Matchers {
  private val RootProperty =
    "bridge.validity.application.pooled.reserve.v5.root"
  private val OutputProperty =
    "bridge.eip0045.validity.application.pooled.reserve.v5.identity.out"

  private val SigmaStateCommit =
    "f78deadd668f801e7fae3bc884283f79c6f484fa"
  private val ExpectedScalaVersion = "2.13.18"
  private val ExpectedSbtVersion = "1.12.11"
  private val ReceiptSchema =
    "e2s.validity-application-pooled-reserve-compiler-receipt.v1"
  private val BatchSchema =
    "e2s.validity-application-pooled-reserve-compiler-batch.v1"

  // Exact normalized-LF template inputs and canonical TypeScript-derived V5
  // settlement lineage plus exact V4 source-runtime application binding.
  private val TrackerTemplateSha256 =
    "06efeec6836e01d40d2e0d68dbe91a7e6e46bb65ab9d045a3064adf2bc7bbda6"
  private val DupTemplateSha256 =
    "13428b1e471229d2e9d577e8b4a3c946d5d7ba9c8505c4c3ff594801e8104043"
  private val SourceLockTemplateSha256 =
    "7c30e9a20ddcea4175a5981b0a2cdff8d6df7bb961a08a311eae47b9d50990d0"
  private val PooledReserveTemplateSha256 =
    "6a6e256585116a37fc85975e837b1160bd6e4cab87b981ac50ec85a41e5e6008"

  // The singleton IDs are derived from the three reviewed genesis fixtures.
  private val TrackerNft =
    "00e4ed6ac28c8ccd2a3476a39cb8ac33f7fdefefd0b88978841ed9bb9045a7e9"
  private val DupNft =
    "667382038b0da5742442e04629d11ca4047a73ea98da1b21ba37e5bd8a4eb538"
  private val PooledReserveNft =
    "b7ca9a5aaac5b702dc9e21d6f3de0f8f7d23e3932d3ac018fd64316071cb21f8"
  private val PooledReserveProfile =
    "ffba97e5ce0b2a467b7b18dde382ce2a6c4fff7448804f793641fd9955c74dd2"
  private val SourceRuntimeLineageProfile =
    "f0cd15e335996211353a2eb895b5bbdeaf7a5de4f10ec0f547a8f6e505a522f9"
  private val SourceNetwork =
    "1111111111111111111111111111111111111111111111111111111111111111"
  private val Sidechain =
    "2222222222222222222222222222222222222222222222222222222222222222"
  private val BridgeAddress =
    "3333333333333333333333333333333333333333"
  private val TokenAddress =
    "4444444444444444444444444444444444444444"
  private val SettlementProfile =
    "5555555555555555555555555555555555555555555555555555555555555555"
  private val TrustAnchor =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  private val ProgramId =
    "bd72f52090ed45f2803767f64cde4d4314b7735f27e8d4596c4db37f1dc52a31"
  private val VerifierProfile =
    "23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383"
  private val RuntimeProfile =
    "04f0cd15e335996211353a2eb895b5bbdeaf7a5de4f10ec0f547a8f6e505a522f91111111111111111111111111111111111111111111111111111111111111111222222222222222222222222222222222222222222222222222222222222222233333333333333333333333333333333333333334444444444444444444444444444444444444444bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb00100000cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc0008000055555555555555555555555555555555555555555555555555555555555555554322c3e83dd656d497b10cb2d5a3eb83c0e542e540b534cadefd113110c75af4115d7970045dfc71a0591583bee1bf4e9291a81ccf426dc56d948742836dc0d731797a6450bcb7121df06dfb16829727401f831c7b6f23fc53ad100630956c67000000000000000014000000"
  private val RuntimeProfileId =
    "881b1501f629edbec0ccfe9723952ede9b52786672be60d7c929376d9759b394"
  private val SourceRuntimeCodeSha256 =
    "c93eee2d0db02f10acc7460d9576e122dcf8cd53c4bf8dfcae1b3e74ebcfff5a"
  private val SourceRuntimeCodeSize = "00001000"
  private val ApplicationBindingPrefix =
    "05" + RuntimeProfile + RuntimeProfileId + SourceRuntimeCodeSha256 +
      SourceRuntimeCodeSize + TrackerNft
  private val ApplicationBindingDomain =
    "E2S_POOLED_RESERVE_BURN_APPLICATION_BINDING_V5"

  implicit lazy val IR: TestingIRContext = new TestingIRContext {
    beginPass(noConstPropagationPass)
  }

  property(
    "pinned compiler emits one exact four-contract pooled-reserve instance") {
    scala.util.Properties.versionNumberString shouldBe ExpectedScalaVersion
    assertConcreteInputs()

    val root = exactDirectory(System.getProperty(RootProperty))
    val trackerTemplate = exactTemplate(
      root.resolve(
        "contracts/SPVTrackerPooledReserveBurnSettlementV5.es"),
      TrackerTemplateSha256)
    val dupTemplate = exactTemplate(
      root.resolve("contracts/DoubleUnlockPreventionPooledReserveV5.es"),
      DupTemplateSha256)
    val sourceLockTemplate = exactTemplate(
      root.resolve("contracts/MainChainLockPooledReserveV5.es"),
      SourceLockTemplateSha256)
    val pooledReserveTemplate = exactTemplate(
      root.resolve(
        "contracts/MainChainPooledReserveValidityApplicationV5.es"),
      PooledReserveTemplateSha256)

    val trackerSource = exactSource(
      replaceAll(trackerTemplate.source, Vector(
        "POOLED_RESERVE_BURN_V5_PROGRAM_ID_PLACEHOLDER" -> ProgramId,
        "POOLED_RESERVE_BURN_V5_VERIFIER_PROFILE_ID_PLACEHOLDER" ->
          VerifierProfile,
        "POOLED_RESERVE_BURN_V5_APPLICATION_BINDING_PREFIX_PLACEHOLDER" ->
          ApplicationBindingPrefix,
        "POOLED_RESERVE_PROFILE_ID_PLACEHOLDER" ->
          PooledReserveProfile)),
      "SPVTrackerPooledReserveBurnV5",
      expectStark = true)
    val tracker = compileTracker(trackerSource.bytes, trackerSource.source)
    val applicationBinding =
      ApplicationBindingPrefix + tracker.contractId + "00000000"
    val applicationBindingDigest = hex(Blake2b256(
      ApplicationBindingDomain.getBytes(StandardCharsets.US_ASCII) ++
        decodeHex(applicationBinding)))

    val dupSource = exactSource(
      replaceAll(dupTemplate.source, Vector(
        "POOLED_RESERVE_TRACKER_NFT_ID_PLACEHOLDER" -> TrackerNft,
        "POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER" -> DupNft,
        "POOLED_RESERVE_NFT_ID_PLACEHOLDER" -> PooledReserveNft,
        "POOLED_RESERVE_PROFILE_ID_PLACEHOLDER" ->
          PooledReserveProfile,
        "POOLED_RESERVE_TRACKER_CONTRACT_ID_PLACEHOLDER" ->
          tracker.contractId,
        "POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER" -> Sidechain,
        "POOLED_RESERVE_TRUST_ANCHOR_DIGEST_PLACEHOLDER" ->
          TrustAnchor)),
      "DoubleUnlockPreventionPooledReserveV5",
      expectStark = false)
    val duplicatePrevention = compileStandard(
      "duplicatePrevention",
      dupSource.bytes,
      dupSource.source)

    val sourceLockSource = exactSource(
      replaceAll(sourceLockTemplate.source, Vector(
        "POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER" ->
          SourceNetwork,
        "POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER" -> Sidechain,
        "POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER" -> BridgeAddress,
        "POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER" -> TokenAddress,
        "POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER" ->
          SettlementProfile,
        "POOLED_RESERVE_PROFILE_ID_PLACEHOLDER" ->
          PooledReserveProfile,
        "POOLED_RESERVE_NFT_ID_PLACEHOLDER" -> PooledReserveNft)),
      "MainChainLockPooledReserveV5",
      expectStark = false)
    val sourceLock = compileStandard(
      "sourceLock",
      sourceLockSource.bytes,
      sourceLockSource.source)

    val pooledReserveSource = exactSource(
      replaceAll(pooledReserveTemplate.source, Vector(
        "POOLED_RESERVE_TRACKER_NFT_ID_PLACEHOLDER" -> TrackerNft,
        "POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER" -> DupNft,
        "POOLED_RESERVE_NFT_ID_PLACEHOLDER" -> PooledReserveNft,
        "POOLED_RESERVE_PROFILE_ID_PLACEHOLDER" ->
          PooledReserveProfile,
        "POOLED_RESERVE_TRACKER_CONTRACT_ID_PLACEHOLDER" ->
          tracker.contractId,
        "POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER" -> Sidechain,
        "POOLED_RESERVE_TRUST_ANCHOR_DIGEST_PLACEHOLDER" ->
          TrustAnchor,
        "POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER" ->
          SourceNetwork,
        "POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER" -> BridgeAddress,
        "POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER" -> TokenAddress,
        "POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER" ->
          SettlementProfile,
        "POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER" ->
          duplicatePrevention.contractId,
        "POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER" ->
          sourceLock.contractId,
        "POOLED_RESERVE_APPLICATION_BINDING_DIGEST_PLACEHOLDER" ->
          applicationBindingDigest)),
      "MainChainPooledReserveValidityApplicationV5",
      expectStark = false)
    val pooledReserve = compileStandard(
      "pooledReserve",
      pooledReserveSource.bytes,
      pooledReserveSource.source)

    val contracts =
      Vector(tracker, duplicatePrevention, sourceLock, pooledReserve)
    contracts.map(_.contractId).distinct.size shouldBe contracts.size
    tracker.treeVersion shouldBe
      VersionContext.StarkVerificationVersion.toInt
    duplicatePrevention.treeVersion shouldBe 0
    sourceLock.treeVersion shouldBe 0
    pooledReserve.treeVersion shouldBe 0
    contracts.foreach { contract =>
      contract.propositionBytes.length should be > 0
      contract.propositionBytes.length should be < 4096
      contract.propositionBytes.length shouldBe
        contract.propositionHex.length / 2
    }

    assertSameContract(
      compileTracker(trackerSource.bytes, trackerSource.source),
      tracker)
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
      s"pooled_reserve_tracker_contract_id_hex=${tracker.contractId}")
    println(
      "pooled_reserve_dup_contract_id_hex=" +
        duplicatePrevention.contractId)
    println(
      s"pooled_reserve_source_lock_contract_id_hex=${sourceLock.contractId}")
    println(
      s"pooled_reserve_contract_id_hex=${pooledReserve.contractId}")

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
      ("tracker template SHA-256", TrackerTemplateSha256, 32),
      ("DUP template SHA-256", DupTemplateSha256, 32),
      ("source-lock template SHA-256", SourceLockTemplateSha256, 32),
      ("pooled-reserve template SHA-256", PooledReserveTemplateSha256, 32),
      ("tracker NFT", TrackerNft, 32),
      ("DUP NFT", DupNft, 32),
      ("pooled-reserve NFT", PooledReserveNft, 32),
      ("pooled-reserve profile", PooledReserveProfile, 32),
      ("source runtime lineage profile", SourceRuntimeLineageProfile, 32),
      ("source network", SourceNetwork, 32),
      ("sidechain", Sidechain, 32),
      ("bridge address", BridgeAddress, 20),
      ("token address", TokenAddress, 20),
      ("settlement profile", SettlementProfile, 32),
      ("trust anchor", TrustAnchor, 32),
      ("program ID", ProgramId, 32),
      ("verifier profile", VerifierProfile, 32),
      ("runtime profile", RuntimeProfile, 349),
      ("runtime profile ID", RuntimeProfileId, 32),
      ("source runtime-code SHA-256", SourceRuntimeCodeSha256, 32),
      ("source runtime-code size", SourceRuntimeCodeSize, 4),
      ("application binding prefix", ApplicationBindingPrefix, 450)
    ).foreach { case (label, value, bytes) =>
      exactHex(value, bytes, label)
    }

    Vector(TrackerNft, DupNft, PooledReserveNft).distinct.size shouldBe 3
    BridgeAddress should not be TokenAddress

    val runtime = decodeHex(RuntimeProfile)
    runtime.length shouldBe 349
    hex(runtime.slice(1, 33)) shouldBe SourceRuntimeLineageProfile
    SourceRuntimeLineageProfile should not be PooledReserveProfile
    hex(runtime.slice(33, 65)) shouldBe SourceNetwork
    hex(runtime.slice(65, 97)) shouldBe Sidechain
    hex(runtime.slice(97, 117)) shouldBe BridgeAddress
    hex(runtime.slice(117, 137)) shouldBe TokenAddress
    hex(runtime.slice(209, 241)) shouldBe SettlementProfile
    val bindingPrefix = decodeHex(ApplicationBindingPrefix)
    bindingPrefix(0) shouldBe 5.toByte
    hex(bindingPrefix.slice(1, 350)) shouldBe RuntimeProfile
    hex(bindingPrefix.slice(350, 382)) shouldBe RuntimeProfileId
    hex(bindingPrefix.slice(382, 414)) shouldBe SourceRuntimeCodeSha256
    hex(bindingPrefix.slice(414, 418)) shouldBe SourceRuntimeCodeSize
    hex(bindingPrefix.slice(418, 450)) shouldBe TrackerNft
  }

  private def exactHex(
      value: String,
      bytes: Int,
      label: String): Unit = {
    withClue(s"$label must be exact lowercase hex: ") {
      value should fullyMatch regex s"[0-9a-f]{${bytes * 2}}"
    }
  }

  private def decodeHex(value: String): Array[Byte] =
    value.grouped(2)
      .map((pair: String) => Integer.parseInt(pair, 16).toByte)
      .toArray

  private def exactSource(
      source: String,
      requiredMarker: String,
      expectStark: Boolean): SourceInput = {
    val bytes = source.getBytes(StandardCharsets.US_ASCII)
    new String(bytes, StandardCharsets.US_ASCII) shouldBe source
    source should include(requiredMarker)
    source.contains('\r') shouldBe false
    "[A-Z][A-Z0-9_]+_PLACEHOLDERS?".r
      .findAllIn(source).toVector shouldBe empty
    source.contains("verifyStark") shouldBe expectStark
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
      "pooled-reserve compiler receipt parent must be a real directory")
    require(
      !Files.exists(path),
      "pooled-reserve compiler receipt output must not already exist")

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
