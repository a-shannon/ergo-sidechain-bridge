package org.ergoplatform.mining.bridge

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path, Paths}
import java.security.MessageDigest

import io.circe.{ACursor, Json}
import io.circe.parser
import org.ergoplatform.mining.difficulty.{DifficultyAdjustment, DifficultySerializer}
import org.ergoplatform.mining.{AutolykosPowScheme, AutolykosSolution, groupElemFromBytes}
import org.ergoplatform.modifiers.history.header.{Header, HeaderSerializer}
import org.ergoplatform.utils.ErgoCoreTestConstants
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.authds.ADDigest
import scorex.crypto.hash.Digest32
import scorex.util.ModifierId
import scorex.util.encode.Base16

import scala.concurrent.duration._
import scala.util.Try

class ErgoAutolykosV2SpvDifferentialSpec
    extends AnyFunSuite with Matchers {
  private val FixtureProperty = "bridge.ergo.spv.jvm.fixture"
  private val FixtureShaProperty = "bridge.ergo.spv.jvm.fixture.sha256"
  private val ErgoCommitProperty = "bridge.ergo.spv.jvm.ergo.commit"
  private val ExpectedErgoCommit =
    "2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1"
  private val ExpectedSchema =
    "e2s.ergo-autolykos-v2-spv-jvm-differential.v1"
  private val ResultPrefix =
    "E2S_ERGO_AUTOLYKOS_V2_SPV_JVM_DIFFERENTIAL="

  private lazy val fixturePath = exactFile(
    Paths.get(requiredProperty(FixtureProperty)))
  private lazy val fixtureBytes = Files.readAllBytes(fixturePath)
  private lazy val fixtureSha256 = sha256(fixtureBytes)
  private lazy val fixture = loadFixture()
  private lazy val pow = new AutolykosPowScheme(32, 26)
  private lazy val difficulty = new DifficultyAdjustment(
    ErgoCoreTestConstants.chainSettings.copy(
      blockInterval = 2.minutes,
      epochLength = 128,
      eip37EpochLength = Some(128),
      useLastEpochs = 8,
      initialDifficultyHex = "011765000000"))

  test("fixture pins the exact source and non-authorizing boundary") {
    scala.util.Properties.versionNumberString shouldBe "2.12.20"
    requiredProperty(ErgoCommitProperty) shouldBe ExpectedErgoCommit
    fixtureSha256 shouldBe exactDigest(
      requiredProperty(FixtureShaProperty),
      "fixture SHA-256")
    fixture.schema shouldBe ExpectedSchema
    fixture.ergoNodeCommit shouldBe ExpectedErgoCommit
    fixture.networkIdHex shouldBe
      "b0244dfc267baca974a4caee06120321562784303a8a688976ae56170e4d175b"
    fixture.historicalHeaderFixture shouldBe true
    fixture.falseBoundaries.values.toSet shouldBe Set(false)
    fixture.context.map(_.header.height) shouldBe
      Vector(925952, 926080, 926208, 926336, 926464, 926592,
        926720, 926848)
    fixture.checkpoint.header.height shouldBe 926976
    fixture.suffix.map(_.header.height) shouldBe (926977 to 926986)
  }

  test("JVM matches the EIP-37, serialization, PoW and work vectors") {
    (fixture.context :+ fixture.checkpoint).foreach { entry =>
      entry.header.id shouldBe entry.expectedIdHex
    }
    fixture.suffix.foreach { entry =>
      entry.header.id shouldBe entry.expectedIdHex
    }

    val previousHeaders =
      fixture.context.map(_.header) :+ fixture.checkpoint.header
    val boundaryDifficulty = difficulty.eip37Calculate(previousHeaders, 128)
    boundaryDifficulty shouldBe fixture.boundaryDifficulty
    DifficultySerializer.encodeCompactBits(boundaryDifficulty) shouldBe
      fixture.boundaryNBits

    val results = validateSuffix(
      fixture.checkpoint.header,
      fixture.suffix,
      boundaryDifficulty)
    results.size shouldBe fixture.suffix.size
    results.zip(fixture.suffix).foreach { case (result, expected) =>
      result.idHex shouldBe expected.expectedIdHex
      result.prePowHex shouldBe expected.prePowHex
      result.difficulty shouldBe expected.difficulty
      result.target shouldBe expected.target
      result.hit shouldBe expected.hit
      result.relativeCumulativeWork shouldBe
        expected.relativeCumulativeWork
    }
    results.map(_.difficulty).sum shouldBe fixture.suffixWork
    results.last.relativeCumulativeWork shouldBe
      fixture.finalRelativeCumulativeWork
    results.last.idHex shouldBe fixture.finalHeaderIdHex
  }

  test("JVM composition rejects isolated difficulty and ancestry mutants") {
    val easier = fixture.suffix.head.copy(
      header = fixture.suffix.head.header.copy(
        nBits = fixture.easierBoundaryNBits))
    DifficultySerializer.decodeCompactBits(easier.header.nBits) should be <
      fixture.suffix.head.difficulty
    pow.validate(easier.header).isSuccess shouldBe true
    Try(validateSuffix(
      fixture.checkpoint.header,
      easier +: fixture.suffix.tail,
      fixture.boundaryDifficulty)).isFailure shouldBe true

    val ancestryIndex = fixture.ancestryHeaderIndex
    val ancestry = fixture.suffix.updated(
      ancestryIndex,
      fixture.suffix(ancestryIndex).copy(
        header = fixture.suffix(ancestryIndex).header.copy(
          parentId = ModifierId @@ fixture.ancestryParentIdHex)))
    Try(validateSuffix(
      fixture.checkpoint.header,
      ancestry,
      fixture.boundaryDifficulty)).isFailure shouldBe true

    println(ResultPrefix + Json.obj(
      "schema" -> Json.fromString(
        "e2s.ergo-autolykos-v2-spv-jvm-differential-result.v1"),
      "fixtureSha256" -> Json.fromString(fixtureSha256),
      "ergoNodeCommit" -> Json.fromString(ExpectedErgoCommit),
      "boundaryDifficulty" -> Json.fromString(
        fixture.boundaryDifficulty.toString),
      "boundaryNBits" -> Json.fromLong(fixture.boundaryNBits),
      "suffixCount" -> Json.fromInt(fixture.suffix.size),
      "finalRelativeCumulativeWork" -> Json.fromString(
        fixture.finalRelativeCumulativeWork.toString),
      "finalHeaderIdHex" -> Json.fromString(fixture.finalHeaderIdHex),
      "difficultyMutantRejected" -> Json.fromBoolean(true),
      "ancestryMutantRejected" -> Json.fromBoolean(true),
      "fundsAuthorityEstablished" -> Json.fromBoolean(false),
      "gate5Closed" -> Json.fromBoolean(false),
      "broadcastPerformed" -> Json.fromBoolean(false)).noSpaces)
  }

  private def validateSuffix(
      checkpoint: Header,
      suffix: Vector[ExpectedHeader],
      boundaryDifficulty: BigInt): Vector[ObservedHeader] = {
    var parent = checkpoint
    var expectedNBits =
      DifficultySerializer.encodeCompactBits(boundaryDifficulty)
    var cumulativeWork = fixture.relativeCheckpointWork

    suffix.map { entry =>
      val header = entry.header
      require(header.parentId == parent.id,
        s"header ${header.height} does not extend the expected parent")
      require(header.height == parent.height + 1,
        s"header ${header.height} is not parent height plus one")
      require(header.timestamp > parent.timestamp,
        s"header ${header.height} timestamp did not advance")
      require(header.nBits == expectedNBits,
        s"header ${header.height} does not bind expected difficulty")
      pow.validate(header).get

      val requiredDifficulty =
        DifficultySerializer.decodeCompactBits(header.nBits)
      val hit = pow.hitForVersion2(header)
      val target = pow.getB(header.nBits)
      cumulativeWork += requiredDifficulty
      val observed = ObservedHeader(
        header.id,
        Base16.encode(HeaderSerializer.bytesWithoutPow(header)),
        requiredDifficulty,
        target,
        hit,
        cumulativeWork)
      parent = header
      expectedNBits = header.nBits
      observed
    }
  }

  private def loadFixture(): Fixture = {
    require(fixtureBytes.nonEmpty && fixtureBytes.length <= 1024 * 1024,
      "fixture must contain from 1 byte to 1 MiB")
    require(!fixtureBytes.contains(0.toByte),
      "fixture must not contain NUL bytes")
    val text = new String(fixtureBytes, StandardCharsets.UTF_8)
    require(java.util.Arrays.equals(
      text.getBytes(StandardCharsets.UTF_8),
      fixtureBytes), "fixture is not canonical UTF-8")
    require(!text.contains('\r'), "fixture must use LF line endings")
    val json = parser.parse(text).fold(
      error => throw new IllegalArgumentException(
        s"fixture JSON is invalid: ${error.message}"),
      identity)
    val root = json.hcursor
    val source = root.downField("source")
    val profile = root.downField("profile")
    val expected = root.downField("expected")
    val mutants = root.downField("mutants")
    val boundaries = root.downField("boundaries")

    Fixture(
      schema = requiredString(root, "schema"),
      ergoNodeCommit = requiredString(source, "ergoNodeCommit"),
      networkIdHex = exactHex(
        requiredString(source, "networkIdHex"), 32, "network ID"),
      context = requiredArray(root, "difficultyContext")
        .map(parseHeaderEntry),
      checkpoint = parseHeaderEntry(requiredObject(root, "checkpoint")),
      suffix = requiredArray(root, "suffix").map(parseExpectedHeader),
      boundaryDifficulty = canonicalBigInt(
        requiredString(expected, "boundaryDifficulty"),
        "boundary difficulty"),
      boundaryNBits = requiredLong(expected, "boundaryNBits"),
      suffixWork = canonicalBigInt(
        requiredString(expected, "suffixWork"), "suffix work"),
      finalRelativeCumulativeWork = canonicalBigInt(
        requiredString(expected, "finalRelativeCumulativeWork"),
        "final relative cumulative work"),
      finalHeaderIdHex = exactHex(
        requiredString(expected, "finalHeaderIdHex"),
        32,
        "final header ID"),
      relativeCheckpointWork = canonicalBigInt(
        requiredString(profile, "relativeCheckpointWork"),
        "relative checkpoint work"),
      easierBoundaryNBits = requiredLong(mutants, "easierBoundaryNBits"),
      ancestryHeaderIndex = requiredInt(mutants, "ancestryHeaderIndex"),
      ancestryParentIdHex = exactHex(
        requiredString(mutants, "ancestryParentIdHex"),
        32,
        "ancestry parent ID"),
      historicalHeaderFixture =
        requiredBoolean(boundaries, "historicalHeaderFixture"),
      falseBoundaries = Vector(
        "currentCanonicalityEstablished",
        "checkpointAuthenticationEstablished",
        "absoluteCheckpointWorkEstablished",
        "nodeAcceptanceEstablished",
        "mintAuthorityEstablished",
        "settlementAuthorityEstablished",
        "gate5Closed",
        "trustlessStatusEstablished",
        "productionReadinessEstablished",
        "broadcastPerformed").map { name =>
          name -> requiredBoolean(boundaries, name)
        }.toMap)
  }

  private def parseExpectedHeader(json: Json): ExpectedHeader = {
    val cursor = json.hcursor
    val header = parseHeaderEntry(requiredObject(cursor, "header"))
    val expected = cursor.downField("expected")
    ExpectedHeader(
      header.expectedIdHex,
      header.header,
      exactHex(requiredString(expected, "prePowHex"),
        HeaderSerializer.bytesWithoutPow(header.header).length,
        "pre-PoW bytes"),
      canonicalBigInt(requiredString(expected, "difficulty"), "difficulty"),
      canonicalBigInt(requiredString(expected, "target"), "target"),
      canonicalBigInt(requiredString(expected, "hit"), "hit"),
      canonicalBigInt(
        requiredString(expected, "relativeCumulativeWork"),
        "relative cumulative work"))
  }

  private def parseHeaderEntry(json: Json): HeaderEntry = {
    val cursor = json.hcursor
    val expectedIdHex = exactHex(
      requiredString(cursor, "idHex"), 32, "header ID")
    val version = requiredInt(cursor, "version")
    require(version >= 2 && version <= 4,
      "differential header version must be from 2 to 4")
    val header = Header(
      version.toByte,
      ModifierId @@ exactHex(
        requiredString(cursor, "parentIdHex"), 32, "parent ID"),
      Digest32 @@ decodedHex(
        requiredString(cursor, "adProofsRootHex"), 32, "AD proofs root"),
      ADDigest @@ decodedHex(
        requiredString(cursor, "stateRootHex"), 33, "state root"),
      Digest32 @@ decodedHex(
        requiredString(cursor, "transactionsRootHex"),
        32,
        "transactions root"),
      canonicalLong(requiredString(cursor, "timestampMs"), "timestamp"),
      requiredLong(cursor, "nBits"),
      requiredInt(cursor, "height"),
      Digest32 @@ decodedHex(
        requiredString(cursor, "extensionHashHex"),
        32,
        "extension hash"),
      AutolykosSolution(
        groupElemFromBytes(decodedHex(
          requiredString(cursor, "powPublicKeyHex"),
          33,
          "PoW public key")),
        AutolykosSolution.wForV2,
        decodedHex(requiredString(cursor, "powNonceHex"), 8, "PoW nonce"),
        AutolykosSolution.dForV2),
      decodedHex(requiredString(cursor, "votesHex"), 3, "votes"),
      Array.emptyByteArray)
    HeaderEntry(expectedIdHex, header)
  }

  private def requiredArray(cursor: ACursor, name: String): Vector[Json] =
    cursor.downField(name).focus.flatMap(_.asArray)
      .map(_.toVector)
      .getOrElse(throw new IllegalArgumentException(
        s"$name must be an array"))

  private def requiredObject(cursor: ACursor, name: String): Json =
    cursor.downField(name).focus.filter(_.isObject)
      .getOrElse(throw new IllegalArgumentException(
        s"$name must be an object"))

  private def requiredString(cursor: ACursor, name: String): String =
    cursor.get[String](name).fold(
      error => throw new IllegalArgumentException(
        s"$name must be a string: ${error.message}"),
      identity)

  private def requiredInt(cursor: ACursor, name: String): Int =
    cursor.get[Int](name).fold(
      error => throw new IllegalArgumentException(
        s"$name must be an Int: ${error.message}"),
      identity)

  private def requiredLong(cursor: ACursor, name: String): Long =
    cursor.get[Long](name).fold(
      error => throw new IllegalArgumentException(
        s"$name must be a Long: ${error.message}"),
      identity)

  private def requiredBoolean(cursor: ACursor, name: String): Boolean =
    cursor.get[Boolean](name).fold(
      error => throw new IllegalArgumentException(
        s"$name must be a Boolean: ${error.message}"),
      identity)

  private def canonicalBigInt(value: String, label: String): BigInt = {
    require(value.matches("0|[1-9][0-9]*"),
      s"$label must be an unsigned canonical decimal")
    BigInt(value)
  }

  private def canonicalLong(value: String, label: String): Long = {
    val numeric = canonicalBigInt(value, label)
    require(numeric <= Long.MaxValue, s"$label exceeds Long capacity")
    numeric.toLong
  }

  private def exactHex(value: String, bytes: Int, label: String): String = {
    require(value.matches(s"[0-9a-f]{${bytes * 2}}"),
      s"$label must be exactly $bytes lowercase hex bytes")
    value
  }

  private def decodedHex(
      value: String,
      bytes: Int,
      label: String): Array[Byte] =
    Base16.decode(exactHex(value, bytes, label)).fold(
      error => throw new IllegalArgumentException(
        s"$label is invalid hex: $error"),
      identity)

  private def exactDigest(value: String, label: String): String =
    exactHex(value, 32, label)

  private def requiredProperty(name: String): String =
    Option(System.getProperty(name))
      .filter(_.nonEmpty)
      .getOrElse(throw new IllegalArgumentException(
        s"required JVM property $name is missing"))

  private def exactFile(path: Path): Path = {
    val resolved = path.toAbsolutePath.normalize
    require(Files.isRegularFile(resolved),
      s"fixture is not a regular file: $resolved")
    resolved
  }

  private def sha256(bytes: Array[Byte]): String =
    Base16.encode(MessageDigest.getInstance("SHA-256").digest(bytes))

  private final case class HeaderEntry(
      expectedIdHex: String,
      header: Header)

  private final case class ExpectedHeader(
      expectedIdHex: String,
      header: Header,
      prePowHex: String,
      difficulty: BigInt,
      target: BigInt,
      hit: BigInt,
      relativeCumulativeWork: BigInt)

  private final case class ObservedHeader(
      idHex: String,
      prePowHex: String,
      difficulty: BigInt,
      target: BigInt,
      hit: BigInt,
      relativeCumulativeWork: BigInt)

  private final case class Fixture(
      schema: String,
      ergoNodeCommit: String,
      networkIdHex: String,
      context: Vector[HeaderEntry],
      checkpoint: HeaderEntry,
      suffix: Vector[ExpectedHeader],
      boundaryDifficulty: BigInt,
      boundaryNBits: Long,
      suffixWork: BigInt,
      finalRelativeCumulativeWork: BigInt,
      finalHeaderIdHex: String,
      relativeCheckpointWork: BigInt,
      easierBoundaryNBits: Long,
      ancestryHeaderIndex: Int,
      ancestryParentIdHex: String,
      historicalHeaderFixture: Boolean,
      falseBoundaries: Map[String, Boolean])
}
