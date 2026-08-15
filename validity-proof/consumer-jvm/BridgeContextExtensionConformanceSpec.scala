package sigma.bridge

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}

import io.circe.ACursor
import io.circe.parser
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.hash.Blake2b256
import sigma.Coll
import sigma.ast.SCollection.{SByteArray, SByteArray2}
import sigma.ast._
import sigma.interpreter.ContextExtension
import sigma.serialization.{SigmaSerializer, ValueSerializer}

class BridgeContextExtensionConformanceSpec extends AnyFunSuite with Matchers {
  private val FixtureProperty = "bridge.eip0045.context.extension.fixture"
  private val Schema = "e2s.bridge-validity-context-extension.v1"
  private val StatementDigestHex =
    "e8aa9bc3671f75779cec78c91194ff33c56e7035a4100c6ee9ee644db564dd8c"
  private val ContextExtensionDigestHex =
    "62909ee396c68bb80ef85b3edab3d39556ebe944bc61be0e5b95f5e57fd742c4"
  private val UnsignedTransactionIdHex =
    "89e8063760f991b17cfb9fe685adc11d4f0dab38e6222a12181518468fa9037e"
  private val ProofChunkLengths = Vector(65535, 65535, 65535, 26063)

  private lazy val fixture = {
    val rawPath = System.getProperty(FixtureProperty)
    require(rawPath != null && rawPath.nonEmpty, s"missing -D$FixtureProperty")
    val path = Paths.get(rawPath).toAbsolutePath.normalize()
    require(Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      "ContextExtension fixture must be a real file")
    val text = new String(Files.readAllBytes(path), StandardCharsets.US_ASCII)
    parser.parse(text).fold(
      failure => throw new IllegalArgumentException(
        "ContextExtension fixture JSON rejected: " + failure.getMessage),
      identity)
  }

  private lazy val serializedBytes =
    hex(requiredString(fixture.hcursor.downField("contextExtension")
      .downField("serializedHex"), "serialized ContextExtension"))
  private lazy val expectedChunkDigests =
    requiredStrings(fixture.hcursor.downField("contextExtension")
      .downField("proofChunkBlake2b256Hex"), "proof chunk digests")
  private lazy val expectedPayloadBytes =
    requiredInt(fixture.hcursor.downField("contextExtension")
      .downField("applicationPayloadBytes"), "application payload bytes")
  private lazy val expectedPayloadDigest =
    requiredString(fixture.hcursor.downField("contextExtension")
      .downField("applicationPayloadBlake2b256Hex"), "application payload digest")

  test("WASM EIP-12 ContextExtension deserializes exactly and round-trips on the pinned JVM") {
    requiredString(fixture.hcursor.downField("schema"), "fixture schema") shouldBe Schema
    requiredInt(fixture.hcursor.downField("version"), "fixture version") shouldBe 1
    requiredString(fixture.hcursor.downField("sourceEnvelope")
      .downField("statementDigestHex"), "statement digest") shouldBe StatementDigestHex
    requiredString(fixture.hcursor.downField("contextExtension")
      .downField("serializedBlake2b256Hex"),
      "serialized ContextExtension digest") shouldBe ContextExtensionDigestHex
    requiredString(fixture.hcursor.downField("unsignedTransactionIdHex"),
      "unsigned transaction ID") shouldBe UnsignedTransactionIdHex
    hex(Blake2b256(serializedBytes)) shouldBe ContextExtensionDigestHex

    val extension = parseStrict(serializedBytes)
    assertExactSchema(extension)

    ContextExtension.serializer.toBytes(extension) should
      contain theSameElementsInOrderAs serializedBytes
    ValueSerializer.serialize(extension.get(0.toByte).get) should
      contain theSameElementsInOrderAs hex(requiredString(
        fixture.hcursor.downField("contextExtension").downField("eip12Values")
          .downField("0"),
        "EIP-12 variable 0"))
    ValueSerializer.serialize(extension.get(1.toByte).get) should
      contain theSameElementsInOrderAs hex(requiredString(
        fixture.hcursor.downField("contextExtension").downField("eip12Values")
          .downField("1"),
        "EIP-12 variable 1"))

    val emitted = requiredJson(
      fixture.hcursor.downField("eip12UnsignedTransaction")
        .downField("inputs").downArray.downField("extension"),
      "emitted EIP-12 extension")
    val roundTrip = requiredJson(
      fixture.hcursor.downField("wasmRoundTripEip12")
        .downField("inputs").downArray.downField("extension"),
      "round-trip EIP-12 extension")
    val expectedEip12 = requiredJson(
      fixture.hcursor.downField("contextExtension").downField("eip12Values"),
      "expected EIP-12 extension")
    emitted shouldBe expectedEip12
    roundTrip shouldBe expectedEip12

    requiredBoolean(fixture.hcursor.downField("boundaries")
      .downField("serializationConformanceOnly"),
      "serialization-only boundary") shouldBe true
    Vector(
      "signingPerformed",
      "nodeCheckPerformed",
      "submissionPerformed",
      "broadcastPerformed",
      "gate5Closed",
      "fundsAuthorityEstablished").foreach { field =>
      requiredBoolean(fixture.hcursor.downField("boundaries").downField(field),
        field) shouldBe false
    }
  }

  test("schema checks reject missing, extra, wrong-typed, or changed variables") {
    val extension = parseStrict(serializedBytes)
    val proofChunks = chunks(extension)
    val payload = payloadBytes(extension)

    intercept[IllegalArgumentException] {
      assertExactSchema(ContextExtension(extension.values - 0.toByte))
    }
    intercept[IllegalArgumentException] {
      assertExactSchema(ContextExtension(extension.values - 1.toByte))
    }
    intercept[IllegalArgumentException] {
      assertExactSchema(ContextExtension(
        extension.values + (2.toByte -> IntConstant(1))))
    }
    intercept[IllegalArgumentException] {
      assertExactSchema(ContextExtension(Map(
        0.toByte -> ByteArrayConstant(payload),
        1.toByte -> proofChunksValue(proofChunks))))
    }

    val reordered = proofChunks.map(_.clone()).toArray
    val first = reordered(0)
    reordered(0) = reordered(1)
    reordered(1) = first
    intercept[IllegalArgumentException] {
      assertExactSchema(extensionWith(reordered, payload))
    }

    val changedProof = proofChunks.map(_.clone()).toArray
    changedProof(0)(0) = (changedProof(0)(0) ^ 1).toByte
    intercept[IllegalArgumentException] {
      assertExactSchema(extensionWith(changedProof, payload))
    }

    val changedPayload = payload.clone()
    changedPayload(0) = (changedPayload(0) ^ 1).toByte
    intercept[IllegalArgumentException] {
      assertExactSchema(extensionWith(proofChunks, changedPayload))
    }
  }

  test("truncated or trailing ContextExtension bytes fail strict parsing") {
    intercept[RuntimeException] {
      parseStrict(serializedBytes.dropRight(1))
    }
    intercept[IllegalArgumentException] {
      parseStrict(serializedBytes :+ 0.toByte)
    }
  }

  private def parseStrict(bytes: Array[Byte]): ContextExtension = {
    val reader = SigmaSerializer.startReader(bytes)
    val extension = ContextExtension.serializer.parse(reader)
    require(reader.remaining == 0,
      s"ContextExtension parser left ${reader.remaining} trailing bytes")
    extension
  }

  private def assertExactSchema(extension: ContextExtension): Unit = {
    require(extension.values.keySet == Set(0.toByte, 1.toByte),
      "ContextExtension keys must be exactly 0 and 1")
    val proof = extension.get(0.toByte).get
    require(proof.tpe == SByteArray2,
      "ContextExtension variable 0 must be Coll[Coll[Byte]]")
    val applicationPayload = extension.get(1.toByte).get
    require(applicationPayload.tpe == SByteArray,
      "ContextExtension variable 1 must be Coll[Byte]")

    val proofChunks = chunks(extension)
    require(proofChunks.map(_.length).toVector == ProofChunkLengths,
      "proof chunk lengths mismatch")
    require(proofChunks.map(chunk => hex(Blake2b256(chunk))).toVector ==
      expectedChunkDigests,
      "proof chunk bytes or order mismatch")
    val payload = payloadBytes(extension)
    require(payload.length == expectedPayloadBytes,
      "application payload length mismatch")
    require(hex(Blake2b256(payload)) == expectedPayloadDigest,
      "application payload bytes mismatch")
  }

  private def chunks(extension: ContextExtension): Array[Array[Byte]] =
    extension.get(0.toByte).get.value
      .asInstanceOf[Coll[Coll[Byte]]].toArray.map(_.toArray)

  private def payloadBytes(extension: ContextExtension): Array[Byte] =
    extension.get(1.toByte).get.value.asInstanceOf[Coll[Byte]].toArray

  private def extensionWith(
      proofChunks: Array[Array[Byte]],
      applicationPayload: Array[Byte]): ContextExtension =
    ContextExtension(Map(
      0.toByte -> proofChunksValue(proofChunks),
      1.toByte -> ByteArrayConstant(applicationPayload)))

  private def proofChunksValue(proofChunks: Array[Array[Byte]]) =
    ConcreteCollection[SByteArray](
      proofChunks.map(chunk => ByteArrayConstant(chunk)).toIndexedSeq,
      SByteArray)

  private def requiredString(cursor: ACursor, label: String): String =
    cursor.as[String].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing or invalid: ${failure.getMessage}"),
      identity)

  private def requiredJson(cursor: ACursor, label: String) =
    cursor.focus.getOrElse(
      throw new IllegalArgumentException(s"$label missing or invalid"))

  private def requiredStrings(cursor: ACursor, label: String): Vector[String] =
    cursor.as[Vector[String]].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing or invalid: ${failure.getMessage}"),
      identity)

  private def requiredInt(cursor: ACursor, label: String): Int =
    cursor.as[Int].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing or invalid: ${failure.getMessage}"),
      identity)

  private def requiredBoolean(cursor: ACursor, label: String): Boolean =
    cursor.as[Boolean].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing or invalid: ${failure.getMessage}"),
      identity)

  private def hex(value: String): Array[Byte] = {
    require(value.matches("(?:[0-9a-f]{2})+"), "invalid lowercase whole-byte hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }

  private def hex(bytes: Array[Byte]): String =
    bytes.map(value => f"${value & 0xff}%02x").mkString
}
