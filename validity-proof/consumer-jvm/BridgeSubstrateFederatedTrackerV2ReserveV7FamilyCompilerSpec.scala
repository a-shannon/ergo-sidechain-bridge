package sigma.bridge

import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path, Paths, StandardOpenOption}
import java.security.MessageDigest

import io.circe.Json
import io.circe.parser
import org.scalatest.matchers.should.Matchers
import scorex.crypto.hash.Blake2b256
import sigma.VersionContext
import sigma.ast._
import sigma.compiler.{CompilerResult, SigmaCompiler}
import sigma.compiler.ir.CompiletimeIRContext
import sigma.serialization.ErgoTreeSerializer.DefaultSerializer
import sigmastate.helpers.CompilerTestingCommons

/** Source-only intent: compile the V2 tracker before binding a V7 reserve family. */
class BridgeSubstrateFederatedTrackerV2ReserveV7FamilyCompilerSpec
    extends CompilerTestingCommons with Matchers {
  private val RootProperty =
    "bridge.substrate.federated.tracker.v2.reserve.v7.root"
  private val OutputProperty =
    "bridge.substrate.federated.tracker.v2.reserve.v7.identity.out"
  private val IntentPath =
    "relayer/test-vectors/substrate-federated-tracker-v2-reserve-v7-family-compiler-intent-v1.json"
  private val IntentSha256 =
    "f1b153e054a00099d0d786a638a4191d4325fee3dda20595fd532360f392539a"
  private val AdmissionPath =
    "relayer/test-vectors/substrate-federated-v1-tracker-admission.json"
  private val AdmissionSha256 =
    "87b1db594810e8e21f4132ed51ee929dde6a07cce9f690ec8bba2fc90c57f5be"
  private val SigmaStateCommit =
    "f78deadd668f801e7fae3bc884283f79c6f484fa"
  private val ExpectedScalaVersion = "2.13.18"
  private val ExpectedSbtVersion = "1.12.11"
  private val FamilyDomain =
    "E2S_SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1"
  private val FamilySchema =
    "e2s.substrate-federated-settlement-family.v1"
  private val ReceiptSchema =
    "e2s.substrate-federated-tracker-v2-reserve-v7-family-compiler-batch.v1"
  private val ContractSchema =
    "e2s.substrate-federated-tracker-v2-reserve-v7-compiler-receipt.v1"
  private val OldTrackerContractId =
    "4fbcc5372efb4338b6f150ee5455a7a0cebd1f07c6cb0cc2929e17155086af8c"
  private val OldFamilyId =
    "ddc7c2832d87a30771edaea9d4021cfc64b30402d21175d675bd4d503809b6ae"

  private val Templates = Vector(
    ("tracker", "contracts/SPVTrackerSubstrateFederatedV2.es",
      "110b1aa22d59e1202435bb139cadbb49f28a48c8b8a3056d0426e620ee828eec"),
    ("duplicatePrevention", "contracts/DoubleUnlockPreventionSubstrateFederatedV1.es",
      "a3902150efcdeb4025a50c6a14149d9dc656232c5c65c923a91f85658ddaa12f"),
    ("sourceLock", "contracts/MainChainLockPooledReserveV6.es",
      "f03c1e2ecbb0433d9b5bcad2489467bee26e2e03543ec2a1cd61c18aba21db6b"),
    ("pooledReserve", "contracts/MainChainPooledReserveValidityApplicationV7.es",
      "cc507306454541c09e9e9be1d38d6858566aff4f31b260166e946161499a7229"))

  implicit lazy val IR: TestingIRContext = new TestingIRContext {
    beginPass(noConstPropagationPass)
  }

  property("pinned V2 tracker identity binds a distinct V7 reserve family") {
    scala.util.Properties.versionNumberString shouldBe ExpectedScalaVersion
    val root = exactDirectory(System.getProperty(RootProperty))
    val intentBytes = readPinned(root.resolve(IntentPath), IntentSha256)
    val intent = parseJson(intentBytes)
    text(intent, "schema") shouldBe
      "e2s.substrate-federated-tracker-v2-reserve-v7-family-compiler-intent.v1"
    integer(intent, "version") shouldBe 1
    text(intent, "sigmaStateCommit") shouldBe SigmaStateCommit
    val compiler = field(intent, "compiler")
    integer(compiler, "scriptVersion") shouldBe 3
    integer(compiler, "treeVersion") shouldBe 0
    val vectorRef = field(intent, "admissionVector")
    text(vectorRef, "relativePath") shouldBe AdmissionPath
    text(vectorRef, "sha256Hex") shouldBe AdmissionSha256
    val admission = parseJson(readPinned(root.resolve(AdmissionPath), AdmissionSha256))

    val templateRefs = array(intent, "templates")
    templateRefs.length shouldBe Templates.length
    val sourceTemplates = Templates.zip(templateRefs).map {
      case ((role, relativePath, pinnedSha), ref) =>
        text(ref, "role") shouldBe role
        text(ref, "relativePath") shouldBe relativePath
        text(ref, "sha256Hex") shouldBe pinnedSha
        role -> ascii(readPinned(root.resolve(relativePath), pinnedSha))
    }.toMap

    val tracker = field(intent, "tracker")
    val application = field(intent, "application")
    val family = field(intent, "family")
    validatePublicInputs(intent, tracker, application, family, admission)

    val trackerNft = text(tracker, "trackerNftIdHex")
    val dupNft = text(family, "duplicatePreventionNftIdHex")
    val reserveNft = text(family, "pooledReserveNftIdHex")
    Vector(trackerNft, dupNft, reserveNft).distinct.length shouldBe 3

    val trackerSource = resolvedSource(
      replaceAll(sourceTemplates("tracker"), trackerReplacements(
        tracker, application)), "SPVTrackerSubstrateFederatedV2")
    val compiledTracker = compile("tracker", trackerSource)
    compiledTracker.contractId should not be OldTrackerContractId

    // The family bytes cannot be frozen until the V2 tracker proposition exists.
    val familyBytes = encodedFamily(tracker, application, family,
      compiledTracker.contractId)
    familyBytes.length shouldBe 596
    val familyId = hex(Blake2b256(
      FamilyDomain.getBytes(StandardCharsets.US_ASCII) ++ familyBytes))
    familyId should not be OldFamilyId

    val dupSource = resolvedSource(replaceAll(
      sourceTemplates("duplicatePrevention"), Vector(
        "FEDERATED_SETTLEMENT_TRACKER_NFT_ID_PLACEHOLDER" -> trackerNft,
        "FEDERATED_SETTLEMENT_DUP_NFT_ID_PLACEHOLDER" -> dupNft,
        "FEDERATED_SETTLEMENT_RESERVE_NFT_ID_PLACEHOLDER" -> reserveNft,
        "FEDERATED_SETTLEMENT_FAMILY_ID_PLACEHOLDER" -> familyId,
        "FEDERATED_SETTLEMENT_TRACKER_CONTRACT_ID_PLACEHOLDER" ->
          compiledTracker.contractId,
        "FEDERATED_SETTLEMENT_SOURCE_NETWORK_ID_PLACEHOLDER" ->
          text(application, "sourceNetworkIdHex"),
        "FEDERATED_SETTLEMENT_SIDECHAIN_ID_PLACEHOLDER" ->
          text(application, "sidechainIdHex"),
        "FEDERATED_SETTLEMENT_RUNTIME_PROFILE_ID_PLACEHOLDER" ->
          text(application, "runtimeProfileIdHex"),
        "FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER" ->
          text(application, "settlementProfileIdHex"),
        "FEDERATED_SETTLEMENT_FEDERATION_PROFILE_ID_PLACEHOLDER" ->
          text(tracker, "federationProfileIdHex"),
        "FEDERATED_SETTLEMENT_ERGO_KEY_SET_DIGEST_PLACEHOLDER" ->
          text(tracker, "ergoAdmissionKeySetDigestHex"),
        "FEDERATED_SETTLEMENT_ERGO_THRESHOLD_PLACEHOLDER" ->
          hex(u16(integer(tracker, "ergoAdmissionThreshold"))),
        "FEDERATED_SETTLEMENT_EPOCH_PLACEHOLDER" ->
          hex(u64(decimal(tracker, "federationEpoch"))))),
      "DoubleUnlockPreventionSubstrateFederatedV1")
    val duplicatePrevention = compile("duplicatePrevention", dupSource)

    val sourceLockSource = resolvedSource(replaceAll(
      sourceTemplates("sourceLock"), Vector(
        "POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER" ->
          text(application, "sourceNetworkIdHex"),
        "POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER" ->
          text(application, "sidechainIdHex"),
        "POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER" ->
          text(application, "bridgeAddressHex"),
        "POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER" ->
          text(application, "tokenAddressHex"),
        "POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER" ->
          text(application, "settlementProfileIdHex"),
        "POOLED_RESERVE_PROFILE_ID_PLACEHOLDER" -> familyId,
        "POOLED_RESERVE_NFT_ID_PLACEHOLDER" -> reserveNft)),
      "MainChainLockPooledReserveV6")
    val sourceLock = compile("sourceLock", sourceLockSource)

    val reserveSource = resolvedSource(replaceAll(
      sourceTemplates("pooledReserve"), Vector(
        "POOLED_RESERVE_DUP_NFT_ID_PLACEHOLDER" -> dupNft,
        "POOLED_RESERVE_NFT_ID_PLACEHOLDER" -> reserveNft,
        "POOLED_RESERVE_PROFILE_ID_PLACEHOLDER" -> familyId,
        "POOLED_RESERVE_SIDECHAIN_ID_PLACEHOLDER" ->
          text(application, "sidechainIdHex"),
        "POOLED_RESERVE_SOURCE_NETWORK_ID_PLACEHOLDER" ->
          text(application, "sourceNetworkIdHex"),
        "POOLED_RESERVE_BRIDGE_ADDRESS_PLACEHOLDER" ->
          text(application, "bridgeAddressHex"),
        "POOLED_RESERVE_TOKEN_ADDRESS_PLACEHOLDER" ->
          text(application, "tokenAddressHex"),
        "POOLED_RESERVE_SETTLEMENT_PROFILE_ID_PLACEHOLDER" ->
          text(application, "settlementProfileIdHex"),
        "POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER" ->
          duplicatePrevention.contractId,
        "POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER" ->
          sourceLock.contractId)),
      "MainChainPooledReserveValidityApplicationV7")
    val reserve = compile("pooledReserve", reserveSource)

    val contracts = Vector(compiledTracker, duplicatePrevention, sourceLock, reserve)
    contracts.map(_.contractId).distinct.length shouldBe 4
    contracts.foreach { identity =>
      identity.treeVersion shouldBe 0
      identity.propositionBytes.length should be > 0
      identity.propositionBytes.length should be < 4096
    }
    writeReceipt(contracts, familyBytes, familyId)
  }

  private def validatePublicInputs(
      intent: Json, tracker: Json, application: Json, family: Json,
      admission: Json): Unit = {
    text(tracker, "anchorSelector") shouldBe "absolute-ergo-header-height"
    text(family, "schema") shouldBe FamilySchema
    integer(family, "version") shouldBe 1
    val vectorInput = field(admission, "input")
    val vectorProfile = field(vectorInput, "profile")
    val vectorStatement = field(vectorInput, "statement")
    val vectorExpected = field(admission, "expected")
    text(tracker, "federationProfileIdHex") shouldBe
      text(vectorExpected, "federationProfileIdHex")
    text(tracker, "sourceAttestationKeySetDigestHex") shouldBe
      text(vectorExpected, "sourceAttestationKeySetDigestHex")
    text(tracker, "ergoAdmissionKeySetDigestHex") shouldBe
      text(vectorExpected, "ergoAdmissionKeySetDigestHex")
    Vector("sourceAttestationThreshold", "ergoAdmissionThreshold")
      .foreach(key => integer(tracker, key) shouldBe integer(vectorProfile, key))
    Vector("federationEpoch", "maxAdmissionValidityBlocks")
      .foreach(key => text(tracker, key) shouldBe text(vectorProfile, key))
    array(tracker, "ergoAdmissionPublicKeysHex").map(_.asString.get) shouldBe
      array(vectorProfile, "ergoAdmissionPublicKeysHex").map(_.asString.get)
    Vector("sourceNetworkIdHex", "sidechainIdHex", "bridgeAddressHex",
      "tokenAddressHex", "bridgeRuntimeCodeSha256Hex",
      "tokenRuntimeCodeSha256Hex", "sourceRuntimeCodeSha256Hex",
      "runtimeProfileIdHex", "settlementProfileIdHex")
      .foreach(key => text(application, key) shouldBe text(vectorStatement, key))
    Vector("bridgeRuntimeCodeBytes", "tokenRuntimeCodeBytes",
      "sourceRuntimeCodeBytes")
      .foreach(key => integer(application, key) shouldBe integer(vectorStatement, key))
    Vector("trackerNftIdHex" -> tracker,
      "duplicatePreventionNftIdHex" -> family,
      "pooledReserveNftIdHex" -> family).foreach {
      case (key, owner) => exactHex(text(owner, key), 32, key)
    }
    text(tracker, "trackerNftIdHex") shouldBe
      text(field(vectorInput, "tracker"), "trackerNftIdHex")
    integer(family, "sourceRefundDelayBlocks") shouldBe 10000
    integer(family, "minimumAnchorConfirmations") shouldBe 10
    integer(family, "maximumSuccessorCreationHeightLag") shouldBe 100
    text(family, "minimumExternalFeeNanoErg") shouldBe "1000000"
    text(family, "maximumExternalFeeNanoErg") shouldBe "2100000"
    exactHex(text(family, "settlementAssetIdHex"), 32, "settlement asset")
    text(family, "settlementAssetIdHex") shouldBe "00" * 32
    Vector("sourceNetworkIdHex" -> 32, "sidechainIdHex" -> 32,
      "bridgeAddressHex" -> 20, "tokenAddressHex" -> 20,
      "bridgeRuntimeCodeSha256Hex" -> 32,
      "tokenRuntimeCodeSha256Hex" -> 32,
      "sourceRuntimeCodeSha256Hex" -> 32,
      "runtimeProfileIdHex" -> 32,
      "settlementProfileIdHex" -> 32).foreach {
      case (key, length) => exactHex(text(application, key), length, key)
    }
    Vector("federationProfileIdHex", "sourceAttestationKeySetDigestHex",
      "ergoAdmissionKeySetDigestHex").foreach {
      key => exactHex(text(tracker, key), 32, key)
    }
    array(tracker, "ergoAdmissionPublicKeysHex")
      .foreach(key => exactHex(key.asString.get, 33, "Ergo admission key"))
    integer(tracker, "sourceAttestationThreshold") shouldBe 2
    integer(tracker, "ergoAdmissionThreshold") shouldBe 2
    decimal(tracker, "federationEpoch") shouldBe 7L
    decimal(tracker, "maxAdmissionValidityBlocks") shouldBe 64L
    val boundaries = field(intent, "boundaries")
    field(boundaries, "profileActivated").asBoolean shouldBe Some(false)
    Vector("nodeCheckPerformed", "signingAuthorityEstablished",
      "submissionAuthorityEstablished", "broadcastAuthorityEstablished",
      "fundsAuthorityEstablished", "gate5Closed").foreach { key =>
      field(boundaries, key).asBoolean shouldBe Some(false)
    }
  }

  private def trackerReplacements(
      tracker: Json, application: Json): Vector[(String, String)] = {
    val keys = array(tracker, "ergoAdmissionPublicKeysHex")
      .map(key => s"""proveDlog(decodePoint(fromBase16("${key.asString.get}")))""")
      .mkString(",\n    ")
    Vector(
      "FEDERATED_TRACKER_NFT_ID_PLACEHOLDER" ->
        text(tracker, "trackerNftIdHex"),
      "FEDERATED_SOURCE_NETWORK_ID_PLACEHOLDER" ->
        text(application, "sourceNetworkIdHex"),
      "FEDERATED_SIDECHAIN_ID_PLACEHOLDER" ->
        text(application, "sidechainIdHex"),
      "FEDERATED_BRIDGE_ADDRESS_PLACEHOLDER" ->
        text(application, "bridgeAddressHex"),
      "FEDERATED_TOKEN_ADDRESS_PLACEHOLDER" ->
        text(application, "tokenAddressHex"),
      "FEDERATED_BRIDGE_RUNTIME_HASH_PLACEHOLDER" ->
        text(application, "bridgeRuntimeCodeSha256Hex"),
      "FEDERATED_BRIDGE_RUNTIME_BYTES_PLACEHOLDER" ->
        hex(u32(integer(application, "bridgeRuntimeCodeBytes"))),
      "FEDERATED_TOKEN_RUNTIME_HASH_PLACEHOLDER" ->
        text(application, "tokenRuntimeCodeSha256Hex"),
      "FEDERATED_TOKEN_RUNTIME_BYTES_PLACEHOLDER" ->
        hex(u32(integer(application, "tokenRuntimeCodeBytes"))),
      "FEDERATED_SOURCE_RUNTIME_HASH_PLACEHOLDER" ->
        text(application, "sourceRuntimeCodeSha256Hex"),
      "FEDERATED_SOURCE_RUNTIME_BYTES_PLACEHOLDER" ->
        hex(u32(integer(application, "sourceRuntimeCodeBytes"))),
      "FEDERATED_RUNTIME_PROFILE_ID_PLACEHOLDER" ->
        text(application, "runtimeProfileIdHex"),
      "FEDERATED_SETTLEMENT_PROFILE_ID_PLACEHOLDER" ->
        text(application, "settlementProfileIdHex"),
      "FEDERATED_PROFILE_ID_PLACEHOLDER" ->
        text(tracker, "federationProfileIdHex"),
      "FEDERATED_SOURCE_KEY_SET_DIGEST_PLACEHOLDER" ->
        text(tracker, "sourceAttestationKeySetDigestHex"),
      "FEDERATED_SOURCE_THRESHOLD_PLACEHOLDER" ->
        hex(u16(integer(tracker, "sourceAttestationThreshold"))),
      "FEDERATED_ERGO_KEY_SET_DIGEST_PLACEHOLDER" ->
        text(tracker, "ergoAdmissionKeySetDigestHex"),
      "FEDERATED_ERGO_THRESHOLD_BYTES_PLACEHOLDER" ->
        hex(u16(integer(tracker, "ergoAdmissionThreshold"))),
      "FEDERATED_EPOCH_PLACEHOLDER" ->
        hex(u64(decimal(tracker, "federationEpoch"))),
      "FEDERATED_MAX_ADMISSION_VALIDITY_BLOCKS_PLACEHOLDER" ->
        s"${decimal(tracker, "maxAdmissionValidityBlocks")}L",
      "FEDERATED_ERGO_SIGMAPROP_PLACEHOLDERS" -> keys,
      "FEDERATED_ERGO_THRESHOLD_PLACEHOLDER" ->
        integer(tracker, "ergoAdmissionThreshold").toString)
  }

  private def encodedFamily(
      tracker: Json, application: Json, family: Json,
      trackerContractId: String): Array[Byte] = {
    val parts = Vector(
      Array[Byte](1, 1, 1, 0),
      unhex(text(application, "sourceNetworkIdHex")),
      unhex(text(application, "sidechainIdHex")),
      unhex(text(application, "bridgeAddressHex")),
      unhex(text(application, "tokenAddressHex")),
      unhex(text(application, "runtimeProfileIdHex")),
      unhex(text(application, "settlementProfileIdHex")),
      unhex(text(tracker, "federationProfileIdHex")),
      unhex(text(tracker, "sourceAttestationKeySetDigestHex")),
      u16(integer(tracker, "sourceAttestationThreshold")),
      unhex(text(tracker, "ergoAdmissionKeySetDigestHex")),
      u16(integer(tracker, "ergoAdmissionThreshold")),
      u64(decimal(tracker, "federationEpoch")),
      unhex(text(tracker, "trackerNftIdHex")),
      unhex(text(family, "duplicatePreventionNftIdHex")),
      unhex(text(family, "pooledReserveNftIdHex")),
      unhex(trackerContractId),
      unhex(Templates(0)._3), unhex(Templates(1)._3),
      unhex(Templates(2)._3), unhex(Templates(3)._3),
      u32(integer(family, "sourceRefundDelayBlocks")),
      u32(integer(family, "minimumAnchorConfirmations")),
      u32(integer(family, "maximumSuccessorCreationHeightLag")),
      u64(decimal(family, "minimumExternalFeeNanoErg")),
      u64(decimal(family, "maximumExternalFeeNanoErg")),
      unhex(text(family, "settlementAssetIdHex")))
    parts.foldLeft(Array.empty[Byte])(_ ++ _)
  }

  private final class ContractIdentity(
      val role: String, val sourceSha256: String,
      val treeVersion: Int, val propositionBytes: Array[Byte]) {
    val propositionHex: String = hex(propositionBytes)
    val propositionSha256: String = sha256(propositionBytes)
    val contractId: String = hex(Blake2b256(propositionBytes))
  }

  private def compile(role: String, source: String): ContractIdentity = {
    val bytes = VersionContext.withVersions(3.toByte, 0.toByte) {
      val compiler = new SigmaCompiler(16.toByte)
      val result = compiler.compile(Map.empty, source)(new CompiletimeIRContext)
      val proposition = result match {
        case CompilerResult(_, _, _, script: Value[SSigmaProp.type @unchecked])
            if script.tpe == SSigmaProp => script
        case CompilerResult(_, _, _, script: Value[SBoolean.type @unchecked])
            if script.tpe == SBoolean => script.toSigmaProp
        case other => throw new IllegalArgumentException(
          s"compiled source has type ${other.buildTree.tpe}")
      }
      DefaultSerializer.serializeErgoTree(ErgoTree.fromProposition(
        ErgoTree.defaultHeaderWithVersion(0.toByte), proposition))
    }
    val parsed = DefaultSerializer.deserializeErgoTree(bytes)
    parsed.version shouldBe 0
    DefaultSerializer.serializeErgoTree(parsed) should
      contain theSameElementsInOrderAs bytes
    new ContractIdentity(role, sha256(source.getBytes(StandardCharsets.US_ASCII)),
      parsed.version.toInt, bytes)
  }

  private def resolvedSource(source: String, marker: String): String = {
    ascii(source.getBytes(StandardCharsets.US_ASCII)) shouldBe source
    source should include(marker)
    source.contains('\r') shouldBe false
    "[A-Z][A-Z0-9_]+_PLACEHOLDERS?".r.findAllIn(source).toVector shouldBe empty
    source
  }

  private def replaceAll(
      source: String, replacements: Seq[(String, String)]): String =
    replacements.foldLeft(source) { case (current, (placeholder, value)) =>
      current.sliding(placeholder.length).count(_ == placeholder) shouldBe 1
      current.replace(placeholder, value)
    }

  private def writeReceipt(
      contracts: Vector[ContractIdentity], familyBytes: Array[Byte],
      familyId: String): Unit = {
    val raw = System.getProperty(OutputProperty)
    require(raw != null && raw.nonEmpty, s"missing -D$OutputProperty")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(path.getFileName.toString ==
      "tracker-v2-reserve-v7-family-compiler-receipt-v1.json",
      "unexpected compiler receipt filename")
    val parent = path.getParent
    require(parent != null && parent.getFileName.toString ==
      "bridge-v7-family-compiler-receipts" && Files.isDirectory(parent) &&
      !Files.isSymbolicLink(parent), "unexpected compiler receipt parent")
    require(!Files.exists(path), "compiler receipt must be create-only")
    val contractJson = contracts.map(receiptJson).mkString(",\n")
    val json =
      s"""{
         |  "schema": "$ReceiptSchema",
         |  "version": 1,
         |  "sigmaStateCommit": "$SigmaStateCommit",
         |  "scalaVersion": "$ExpectedScalaVersion",
         |  "sbtVersion": "$ExpectedSbtVersion",
         |  "compilerIntentSha256Hex": "$IntentSha256",
         |  "trackerAnchorSelector": "absolute-ergo-header-height",
         |  "familySchema": "$FamilySchema",
         |  "familyProfileHex": "${hex(familyBytes)}",
         |  "familyIdHex": "$familyId",
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
    Files.write(path, json.getBytes(StandardCharsets.US_ASCII),
      StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)
  }

  private def receiptJson(contract: ContractIdentity): String =
    s"""    {
       |      "schema": "$ContractSchema",
       |      "version": 1,
       |      "role": "${contract.role}",
       |      "scriptVersion": 3,
       |      "treeVersion": ${contract.treeVersion},
       |      "resolvedSourceSha256Hex": "${contract.sourceSha256}",
       |      "propositionBytes": ${contract.propositionBytes.length},
       |      "propositionSha256Hex": "${contract.propositionSha256}",
       |      "propositionHex": "${contract.propositionHex}",
       |      "contractIdHex": "${contract.contractId}"
       |    }""".stripMargin

  private def exactDirectory(raw: String): Path = {
    require(raw != null && raw.nonEmpty, s"missing -D$RootProperty")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isDirectory(path) && !Files.isSymbolicLink(path),
      "bridge root must be a real directory")
    path
  }

  private def readPinned(path: Path, expectedSha: String): Array[Byte] = {
    require(Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      s"$path must be a real file")
    val bytes = Files.readAllBytes(path)
    sha256(bytes) shouldBe expectedSha
    bytes
  }

  private def parseJson(bytes: Array[Byte]): Json =
    parser.parse(ascii(bytes)).fold(
      error => throw new IllegalArgumentException(error.message), identity)

  private def field(json: Json, key: String): Json =
    json.hcursor.downField(key).focus.getOrElse(
      throw new IllegalArgumentException(s"missing $key"))

  private def text(json: Json, key: String): String =
    field(json, key).asString.getOrElse(
      throw new IllegalArgumentException(s"$key must be text"))

  private def integer(json: Json, key: String): Int =
    field(json, key).asNumber.flatMap(_.toInt).getOrElse(
      throw new IllegalArgumentException(s"$key must be integer"))

  private def array(json: Json, key: String): Vector[Json] =
    field(json, key).asArray.getOrElse(
      throw new IllegalArgumentException(s"$key must be an array")).toVector

  private def decimal(json: Json, key: String): Long = {
    val raw = text(json, key)
    require(raw.matches("[1-9][0-9]*"), s"$key must be positive decimal")
    val value = raw.toLong
    require(value > 0, s"$key exceeds signed Long")
    value
  }

  private def exactHex(value: String, bytes: Int, label: String): Unit =
    withClue(s"$label must be exact lowercase hex: ") {
      value should fullyMatch regex s"[0-9a-f]{${bytes * 2}}"
    }

  private def unhex(value: String): Array[Byte] = {
    require(value.length % 2 == 0 && value.matches("[0-9a-f]+"),
      "invalid lowercase hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }

  private def u16(value: Int): Array[Byte] = {
    require(value >= 0 && value <= 65535, "invalid unsigned 16-bit number")
    ByteBuffer.allocate(2).putShort(value.toShort).array()
  }

  private def u32(value: Int): Array[Byte] = {
    require(value >= 0, "invalid unsigned 32-bit number")
    ByteBuffer.allocate(4).putInt(value).array()
  }

  private def u64(value: Long): Array[Byte] = {
    require(value >= 0, "invalid unsigned 64-bit number")
    ByteBuffer.allocate(8).putLong(value).array()
  }

  private def ascii(bytes: Array[Byte]): String = {
    val value = new String(bytes, StandardCharsets.US_ASCII)
    value.getBytes(StandardCharsets.US_ASCII).sameElements(bytes) shouldBe true
    value.contains('\r') shouldBe false
    value
  }

  private def hex(bytes: Array[Byte]): String =
    bytes.iterator.map(byte => f"${byte & 0xff}%02x").mkString

  private def sha256(bytes: Array[Byte]): String =
    hex(MessageDigest.getInstance("SHA-256").digest(bytes))

}
