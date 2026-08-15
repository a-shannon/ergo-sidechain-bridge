package sigma.bridge

import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path, Paths}

import io.circe.ACursor
import io.circe.parser
import org.ergoplatform._
import org.ergoplatform.sdk.JsonCodecs
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.hash.{Blake2b256, Digest32}
import scorex.util.bytesToId
import sigma.VersionContext
import sigma.ast._
import sigma.data.{CAvlTree, CHeader, Digest32Coll, TrivialProp}
import sigma.eval.StarkVerificationCapability._
import sigma.eval.{Risc0StockProfileRuntime, StarkVerificationCapability}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.{ErgoTreeSerializer, SigmaSerializer, ValueSerializer}
import sigma.stark.profile.Risc0ProfilePackageLoader
import sigma.{AvlTree, Coll, Colls, Header}
import sigmastate.eval.CPreHeader
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.{copyBox, copyContext, createBox}

class BridgeValidityApplicationTrackerAcceptanceSpec
    extends AnyFunSuite with Matchers with JsonCodecs {
  private val FixtureProperty =
    "bridge.eip0045.validity.application.tracker.context.fixture"
  private val CandidateDirectoryProperty =
    "bridge.eip0045.validity.application.tracker.candidate.dir"
  private val RejectionFixtureProperty =
    "bridge.eip0045.validity.application.tracker.binding.rejection.context.fixture"
  private val RejectionCandidateDirectoryProperty =
    "bridge.eip0045.validity.application.tracker.binding.rejection.candidate.dir"
  private val V1FixtureProperty =
    "bridge.eip0045.validity.tracker.v1.context.fixture"
  private val V1CandidateDirectoryProperty =
    "bridge.eip0045.validity.tracker.v1.candidate.dir"
  private val ProfilePackageRoot = "/stark-kats/eip0045-profile-package/"
  private val ContractIdHex =
    "adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b"
  private val CandidateFileNames = Vector(
    "statement.bin",
    "program-id.bin",
    "profile-id.bin",
    "terminal-control-id.bin",
    "proof-chunk-0.bin",
    "proof-chunk-1.bin",
    "proof-chunk-2.bin",
    "proof-chunk-3.bin")
  private val Message =
    Blake2b256("bridge validity application tracker acceptance fixture").toArray

  private lazy val fixture = {
    val path = exactFile(
      System.getProperty(FixtureProperty),
      "application tracker ContextExtension fixture")
    val text =
      new String(Files.readAllBytes(path), StandardCharsets.US_ASCII)
    parser.parse(text).fold(
      failure => throw new IllegalArgumentException(
        "application tracker fixture JSON rejected: " + failure.getMessage),
      identity)
  }
  private lazy val fixtureCursor = fixture.hcursor
  private lazy val v1Fixture = {
    val path = exactFile(
      System.getProperty(V1FixtureProperty),
      "V1 tracker ContextExtension fixture")
    val text =
      new String(Files.readAllBytes(path), StandardCharsets.US_ASCII)
    parser.parse(text).fold(
      failure => throw new IllegalArgumentException(
        "V1 tracker fixture JSON rejected: " + failure.getMessage),
      identity)
  }
  private lazy val rejectionFixture = {
    val path = exactFile(
      System.getProperty(RejectionFixtureProperty),
      "application tracker binding-rejection fixture")
    val text =
      new String(Files.readAllBytes(path), StandardCharsets.US_ASCII)
    parser.parse(text).fold(
      failure => throw new IllegalArgumentException(
        "application tracker binding-rejection fixture JSON rejected: " +
          failure.getMessage),
      identity)
  }
  private lazy val rejectionFixtureCursor = rejectionFixture.hcursor
  private lazy val transitionCursor =
    fixtureCursor.downField("trackerTransition")
  private lazy val outputCursor =
    fixtureCursor.downField("eip12UnsignedTransaction")
      .downField("outputs").downArray
  private lazy val candidateRoot = {
    val raw = System.getProperty(CandidateDirectoryProperty)
    require(raw != null && raw.nonEmpty,
      s"missing -D$CandidateDirectoryProperty")
    val root = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isDirectory(root) && !Files.isSymbolicLink(root),
      "application tracker candidate root must be a real directory")
    root
  }
  private lazy val candidateEntries = candidateManifest()
  private lazy val statement = candidateBytes("statement.bin")
  private lazy val proofChunks = (0 to 3)
    .map(index => candidateBytes(s"proof-chunk-$index.bin")).toArray
  private lazy val v1CandidateRoot = exactDirectory(
    System.getProperty(V1CandidateDirectoryProperty),
    "V1 tracker candidate root")
  private lazy val v1CandidateEntries = candidateManifestAt(
    v1CandidateRoot,
    "candidate-manifest-v1.txt",
    "e2s.bridge-validity-eip0045-candidate.v1",
    1)
  private lazy val v1Statement = candidateBytesAt(
    v1CandidateRoot, v1CandidateEntries, "statement.bin", "V1 tracker")
  private lazy val rejectionCandidateRoot = exactDirectory(
    System.getProperty(RejectionCandidateDirectoryProperty),
    "application tracker binding-rejection candidate root")
  private lazy val rejectionCandidateEntries = candidateManifestAt(
    rejectionCandidateRoot,
    "application-binding-rejection-manifest-v2.txt",
    "e2s.bridge-validity-eip0045-application-binding-rejection-candidate.v2",
    2,
    Vector(
      "mutation-field=bridge-runtime-code-sha256",
      s"contract-id=$ContractIdHex"))
  private lazy val rejectionStatement = candidateBytesAt(
    rejectionCandidateRoot,
    rejectionCandidateEntries,
    "statement.bin",
    "application tracker binding-rejection")
  private lazy val rejectionProofChunks = (0 to 3)
    .map(index => candidateBytesAt(
      rejectionCandidateRoot,
      rejectionCandidateEntries,
      s"proof-chunk-$index.bin",
      "application tracker binding-rejection")).toArray
  private lazy val extension = parseExtension(hex(requiredString(
    fixtureCursor.downField("contextExtension")
      .downField("serializedHex"),
    "serialized ContextExtension")))
  private lazy val trackerTree = {
    val bytes = hex(requiredString(outputCursor.downField("ergoTree"),
      "tracker proposition"))
    hex(Blake2b256(bytes)) shouldBe ContractIdHex
    ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(bytes)
  }
  private lazy val alternateProfileDiagnosticTree = {
    val canonicalBindingBytes = statement.slice(159 + 701, 159 + 941)
    val alternateBindingBytes =
      rejectionStatement.slice(159 + 701, 159 + 941)
    canonicalBindingBytes.indices.filter(index =>
      canonicalBindingBytes(index) != alternateBindingBytes(index)) shouldBe
      Vector(168)
    val canonicalBinding = ByteArrayConstant(canonicalBindingBytes)
    val alternateBinding = ByteArrayConstant(alternateBindingBytes)
    val matchingIndices = trackerTree.constants.zipWithIndex.collect {
      case (constant, index) if constant == canonicalBinding => index
    }
    matchingIndices shouldBe Vector(matchingIndices.headOption.getOrElse(
      fail("canonical tracker must contain the complete application binding constant")))
    val updated = trackerTree.constants.updated(
      matchingIndices.head, alternateBinding)
    updated.zip(trackerTree.constants).count {
      case (left, right) => left != right
    } shouldBe 1
    new ErgoTree(trackerTree.header, updated, trackerTree.root)
  }
  private lazy val v1TrackerTree = {
    val proposition = requiredString(
      v1Fixture.hcursor.downField("eip12UnsignedTransaction")
        .downField("outputs").downArray.downField("ergoTree"),
      "V1 tracker proposition")
    ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(hex(proposition))
  }
  private lazy val v1Extension = parseExtension(hex(requiredString(
    v1Fixture.hcursor.downField("contextExtension")
      .downField("serializedHex"),
    "V1 serialized ContextExtension")))
  private lazy val rejectionTransitionCursor =
    rejectionFixtureCursor.downField("trackerTransition")
  private lazy val rejectionOutputCursor =
    rejectionFixtureCursor.downField("eip12UnsignedTransaction")
      .downField("outputs").downArray
  private lazy val rejectionExtension = parseExtension(hex(requiredString(
    rejectionFixtureCursor.downField("contextExtension")
      .downField("serializedHex"),
    "binding-rejection serialized ContextExtension")))
  private lazy val trackerToken =
    (Digest32Coll @@ Colls.fromArray(hex(requiredString(
      transitionCursor.downField("trackerNftIdHex"),
      "tracker NFT ID")))) -> 1L
  private lazy val rejectionTrackerToken =
    (Digest32Coll @@ Colls.fromArray(hex(requiredString(
      rejectionTransitionCursor.downField("trackerNftIdHex"),
      "binding-rejection tracker NFT ID")))) -> 1L
  private lazy val inputRegisters =
    registers(transitionCursor.downField("inputRegisters"), "input")
  private lazy val successorRegisters =
    registers(transitionCursor.downField("successorRegisters"), "successor")
  private lazy val rejectionInputRegisters = registers(
    rejectionTransitionCursor.downField("inputRegisters"),
    "binding-rejection input")
  private lazy val rejectionSuccessorRegisters = registers(
    rejectionTransitionCursor.downField("successorRegisters"),
    "binding-rejection successor")
  private lazy val trackerValue = requiredLong(
    transitionCursor.downField("inputValue"), "tracker value")
  private lazy val currentHeight = requiredInt(
    transitionCursor.downField("currentErgoHeight"), "current Ergo height")
  private lazy val rejectionTrackerValue = requiredLong(
    rejectionTransitionCursor.downField("inputValue"),
    "binding-rejection tracker value")
  private lazy val rejectionCurrentHeight = requiredInt(
    rejectionTransitionCursor.downField("currentErgoHeight"),
    "binding-rejection current Ergo height")
  private lazy val trackerSelf =
    createBox(trackerValue, trackerTree, Seq(trackerToken), inputRegisters)
  private lazy val trackerSuccessor = new ErgoBoxCandidate(
    trackerValue,
    trackerTree,
    currentHeight,
    Colls.fromArray(Array(trackerToken)),
    successorRegisters)
  private lazy val rejectionTrackerSelf =
    createBox(
      rejectionTrackerValue,
      trackerTree,
      Seq(rejectionTrackerToken),
      rejectionInputRegisters)
  private lazy val rejectionTrackerSuccessor = new ErgoBoxCandidate(
    rejectionTrackerValue,
    trackerTree,
    rejectionCurrentHeight,
    Colls.fromArray(Array(rejectionTrackerToken)),
    rejectionSuccessorRegisters)
  private lazy val contextHeaders = parseHeadersAt(transitionCursor)
  private lazy val rejectionContextHeaders =
    parseHeadersAt(rejectionTransitionCursor)

  private lazy val loadedProfile = right(
    Risc0ProfilePackageLoader.load(
      resourceBytes(ProfilePackageRoot + "manifest.bin"),
      resourceBytes(ProfilePackageRoot + "algorithm.txt"),
      resourceBytes(ProfilePackageRoot + "constants.bin"),
      resourceBytes(ProfilePackageRoot + "profile-id.bin")),
    "profile package")
  private lazy val runtime = right(
    Risc0StockProfileRuntime.fromLoadedProfile(loadedProfile),
    "stock runtime")
  private lazy val activeEntry = right(
    StarkVerificationCapability.active(runtime, fixedJit = 100),
    "active profile")
  private lazy val activeCapability = right(
    StarkVerificationCapability.snapshot(
      statement.slice(27, 59),
      protocolGeneration = 1,
      HistoricalBlockValidation,
      dispatchJit = 100,
      Vector(activeEntry)),
    "capability snapshot")

  test("exact application proof, anchor, AVL transition, and successor accept together") {
    contextHeaders.length shouldBe 10
    contextHeaders.zipWithIndex.foreach { case (header, index) =>
      val expected = transitionCursor.downField("headers").downN(index)
      hex(header.id.toArray) shouldBe requiredString(
        expected.downField("id"), s"header $index ID")
      header.height shouldBe requiredInt(
        expected.downField("height"), s"header $index height")
      hex(header.extensionRoot.toArray) shouldBe requiredString(
        expected.downField("extensionRootHex"),
        s"header $index extension root")
    }

    verify(
      self = trackerSelf,
      successor = trackerSuccessor,
      suppliedExtension = extension,
      headers = contextHeaders,
      capability = activeCapability) shouldBe true
  }

  test("STARK proof, extension membership, and successor mutations reject independently") {
    val wrongChunks = proofChunks.map(_.clone())
    wrongChunks(0)(0) = (wrongChunks(0)(0) ^ 1).toByte
    verify(
      suppliedExtension = extensionWith(
        proofChunksValue(wrongChunks), extension.get(2.toByte).get),
      capability = activeCapability) shouldBe false

    val proofBundle = extension.get(2.toByte).get.value
      .asInstanceOf[Coll[Byte]].toArray
    val wrongMembership = proofBundle.clone()
    wrongMembership(9) = (wrongMembership(9) ^ 1).toByte
    verify(
      suppliedExtension = extensionWith(
        extension.get(0.toByte).get, ByteArrayConstant(wrongMembership)),
      capability = activeCapability) shouldBe false

    val wrongLength = proofBundle.clone()
    wrongLength(7) = (wrongLength(7) ^ 1).toByte
    verify(
      suppliedExtension = extensionWith(
        extension.get(0.toByte).get, ByteArrayConstant(wrongLength)),
      capability = activeCapability) shouldBe false

    val wrongSide = proofBundle.clone()
    wrongSide(8) = 4.toByte
    verify(
      suppliedExtension = extensionWith(
        extension.get(0.toByte).get, ByteArrayConstant(wrongSide)),
      capability = activeCapability) shouldBe false

    val extensionProofLength = readU64Be(proofBundle, 0).toInt
    val emptyLevel = (0 until extensionProofLength / 33).find { level =>
      val side = proofBundle(8 + level * 33)
      side == 2.toByte || side == 3.toByte
    }.getOrElse(fail("fixture must contain one canonical empty level"))
    val nonCanonicalPadding = proofBundle.clone()
    nonCanonicalPadding(8 + emptyLevel * 33 + 1) = 1.toByte
    verify(
      suppliedExtension = extensionWith(
        extension.get(0.toByte).get,
        ByteArrayConstant(nonCanonicalPadding)),
      capability = activeCapability) shouldBe false

    val wrongCounter = successorRegisters.toMap.updated(
      ErgoBox.R4,
      LongConstant(
        successorRegisters(ErgoBox.R4).value.asInstanceOf[Long] + 1L))
    val wrongSuccessor = new ErgoBoxCandidate(
      trackerValue,
      trackerTree,
      currentHeight,
      Colls.fromArray(Array(trackerToken)),
      wrongCounter)
    verify(
      successor = wrongSuccessor,
      capability = activeCapability) shouldBe false
  }

  test("missing and wrong-typed ContextExtension variables fail closed") {
    (0 to 3).foreach { index =>
      rejects(
        suppliedExtension =
          ContextExtension(extension.values - index.toByte),
        capability = activeCapability)
    }

    val wrongTypes = Vector(
      0.toByte -> ByteArrayConstant(Array(1.toByte)),
      1.toByte -> IntConstant(1),
      2.toByte -> IntConstant(1),
      3.toByte -> ByteArrayConstant(Array(1.toByte)))
    wrongTypes.foreach { case (index, value) =>
      rejects(
        suppliedExtension =
          ContextExtension(extension.values + (index -> value)),
        capability = activeCapability)
    }
  }

  test("V1 payload, transition proof, and successor proposition reject unchanged") {
    v1Statement.length shouldBe 813
    val v1Payload = v1Statement.drop(159)
    v1Payload.length shouldBe 654
    verify(
      suppliedExtension = ContextExtension(
        extension.values +
          (1.toByte -> ByteArrayConstant(v1Payload))),
      capability = activeCapability) shouldBe false

    verify(
      suppliedExtension = ContextExtension(
        extension.values +
          (2.toByte -> v1Extension.get(2.toByte).get)),
      capability = activeCapability) shouldBe false

    verify(
      successor = candidate(tree = v1TrackerTree),
      capability = activeCapability) shouldBe false
  }

  test("each pinned application-profile field rejects a single-byte mutation") {
    val payload = extension.get(1.toByte).get.value
      .asInstanceOf[Coll[Byte]].toArray
    val fieldOffsets = Vector(
      701,
      701 + 32,
      701 + 64,
      701 + 84,
      701 + 104,
      701 + 136,
      701 + 168,
      701 + 200,
      701 + 204,
      701 + 236,
      941)
    fieldOffsets.foreach { offset =>
      val mutated = payload.clone()
      mutated(offset) = (mutated(offset) ^ 1).toByte
      verify(
        suppliedExtension = ContextExtension(
          extension.values +
            (1.toByte -> ByteArrayConstant(mutated))),
        capability = activeCapability) shouldBe false
    }
  }

  test("valid alternate application proof rejects at the frozen profile boundary") {
    requiredString(
      rejectionFixtureCursor.downField("schema"),
      "binding-rejection fixture schema") shouldBe
      "e2s.bridge-validity-application-tracker-binding-rejection-context.v2"
    requiredBoolean(
      rejectionFixtureCursor.downField("boundaries")
        .downField("expectedContractAcceptance"),
      "binding-rejection expected acceptance") shouldBe false
    requiredString(
      rejectionOutputCursor.downField("ergoTree"),
      "binding-rejection tracker proposition") shouldBe
      requiredString(outputCursor.downField("ergoTree"),
        "canonical tracker proposition")
    rejectionCurrentHeight shouldBe currentHeight
    rejectionStatement.slice(27, 155) should
      contain theSameElementsInOrderAs statement.slice(27, 155)
    val canonicalBinding = statement.slice(159 + 701, 159 + 941)
    val alternateBinding =
      rejectionStatement.slice(159 + 701, 159 + 941)
    canonicalBinding.indices.filter(
      index => canonicalBinding(index) != alternateBinding(index)) shouldBe
      Vector(168)
    canonicalBinding(168) shouldBe 0xbb.toByte
    alternateBinding(168) shouldBe 0xba.toByte

    runtime.verify(
      rejectionStatement.slice(27, 59),
      rejectionStatement.slice(91, 123),
      rejectionStatement.slice(123, 155),
      rejectionStatement.drop(159),
      rejectionProofChunks) shouldBe true

    verifyScript(
      script = alternateProfileDiagnosticTree,
      self = rejectionTrackerSelf,
      successor = rejectionTrackerSuccessor,
      suppliedExtension = rejectionExtension,
      headers = rejectionContextHeaders,
      capability = activeCapability) shouldBe true

    verify(
      self = rejectionTrackerSelf,
      successor = rejectionTrackerSuccessor,
      suppliedExtension = rejectionExtension,
      headers = rejectionContextHeaders,
      capability = activeCapability) shouldBe false
  }

  test("duplicate V2 key and V1 replay schema reject independently") {
    val duplicate = fixtureCursor.downField("rejectionVectors")
      .downField("duplicateKey")
    requiredBoolean(
      duplicate.downField("expectedContractAcceptance"),
      "duplicate-key expected acceptance") shouldBe false
    val populatedDigest = requiredString(
      duplicate.downField("inputDigestHex"),
      "duplicate-key populated digest")
    hex(successorRegisters(ErgoBox.R5).value
      .asInstanceOf[AvlTree].digest.toArray) shouldBe populatedDigest
    val duplicateInputRegisters = inputRegisters.toMap
      .updated(ErgoBox.R4, LongConstant(1L))
      .updated(ErgoBox.R5, successorRegisters(ErgoBox.R5))
    val duplicateSuccessorRegisters = successorRegisters.toMap
      .updated(ErgoBox.R4, LongConstant(2L))
      .updated(ErgoBox.R5, successorRegisters(ErgoBox.R5))
    verify(
      self = copyBox(trackerSelf)(
        additionalRegisters = duplicateInputRegisters),
      successor = candidate(registers = duplicateSuccessorRegisters),
      suppliedExtension = ContextExtension(
        extension.values +
          (2.toByte -> ByteArrayConstant(hex(requiredString(
            duplicate.downField("transitionProofBundleHex"),
            "duplicate-key transition proof bundle"))))),
      capability = activeCapability) shouldBe false

    val canonicalBundle = extension.get(2.toByte).get.value
      .asInstanceOf[Coll[Byte]].toArray
    val canonicalExtensionProofLength =
      readU64Be(canonicalBundle, 0).toInt
    val v1Bundle = v1Extension.get(2.toByte).get.value
      .asInstanceOf[Coll[Byte]].toArray
    val v1ExtensionProofLength = readU64Be(v1Bundle, 0).toInt
    val v1InsertProof = v1Bundle.drop(8 + v1ExtensionProofLength)
    v1InsertProof.nonEmpty shouldBe true
    val canonicalMembershipPrefix =
      canonicalBundle.take(8 + canonicalExtensionProofLength)
    val isolatedV1InsertBundle =
      canonicalMembershipPrefix ++ v1InsertProof
    verify(
      suppliedExtension = ContextExtension(
        extension.values +
          (2.toByte -> ByteArrayConstant(isolatedV1InsertBundle))),
      capability = activeCapability) shouldBe false
  }

  test("successor stamp may precede the reduction height without expiring") {
    val inputStamp =
      inputRegisters(ErgoBox.R8).value.asInstanceOf[Int]
    val olderSuccessorStamp = currentHeight - 1
    olderSuccessorStamp should be > inputStamp
    verify(
      successor = candidate(registers = successorRegisters.toMap.updated(
        ErgoBox.R8, IntConstant(olderSuccessorStamp))),
      capability = activeCapability) shouldBe true
  }

  test("successor creation height is nondecreasing, nonfuture, and fresh") {
    val olderInput = copyBox(trackerSelf)(
      creationHeight = currentHeight - 50)
    verify(
      self = olderInput,
      successor = candidate(creationHeight = currentHeight - 51),
      capability = activeCapability) shouldBe false

    verify(
      successor = candidate(creationHeight = currentHeight + 1),
      capability = activeCapability) shouldBe false

    val staleInput = copyBox(trackerSelf)(
      creationHeight = currentHeight - 200)
    verify(
      self = staleInput,
      successor = candidate(creationHeight = currentHeight - 101),
      capability = activeCapability) shouldBe false

    verify(
      self = staleInput,
      successor = candidate(creationHeight = currentHeight - 100),
      capability = activeCapability) shouldBe true
  }

  test("source identity and verifier lifecycle remain fail-closed") {
    val wrongSidechain = inputRegisters(ErgoBox.R6).value
      .asInstanceOf[Coll[Byte]].toArray
    wrongSidechain(0) = (wrongSidechain(0) ^ 1).toByte
    val wrongInput = copyBox(trackerSelf)(
      additionalRegisters = inputRegisters.toMap.updated(
        ErgoBox.R6, ByteArrayConstant(wrongSidechain)))
    verify(
      self = wrongInput,
      capability = activeCapability) shouldBe false

    intercept[sigma.exceptions.OpcodeUnavailableException] {
      reduce(
        self = trackerSelf,
        successor = trackerSuccessor,
        suppliedExtension = extension,
        headers = contextHeaders,
      capability = StarkVerificationCapability.Unavailable)
    }
  }

  test("approved trust root and complete singleton lineage reject independently") {
    val approvedAnchor = inputRegisters(ErgoBox.R9).value
      .asInstanceOf[Coll[Byte]].toArray
    val unapprovedAnchor = approvedAnchor.clone()
    unapprovedAnchor(0) = (unapprovedAnchor(0) ^ 1).toByte
    val unapprovedAnchorValue = ByteArrayConstant(unapprovedAnchor)
    val unapprovedInputRegisters = inputRegisters.toMap.updated(
      ErgoBox.R9, unapprovedAnchorValue)
    val unapprovedSuccessorRegisters = successorRegisters.toMap.updated(
      ErgoBox.R9, unapprovedAnchorValue)
    verify(
      self = copyBox(trackerSelf)(
        additionalRegisters = unapprovedInputRegisters),
      capability = activeCapability) shouldBe false

    verify(
      self = copyBox(trackerSelf)(
        additionalRegisters = unapprovedInputRegisters),
      successor = candidate(registers = unapprovedSuccessorRegisters),
      capability = activeCapability) shouldBe false

    verify(
      successor = candidate(registers = successorRegisters.toMap.updated(
        ErgoBox.R9, unapprovedAnchorValue)),
      capability = activeCapability) shouldBe false

    val wrongSuccessorSidechain = successorRegisters(ErgoBox.R6).value
      .asInstanceOf[Coll[Byte]].toArray
    wrongSuccessorSidechain(0) =
      (wrongSuccessorSidechain(0) ^ 1).toByte
    verify(
      successor = candidate(registers = successorRegisters.toMap.updated(
        ErgoBox.R6, ByteArrayConstant(wrongSuccessorSidechain))),
      capability = activeCapability) shouldBe false

    verify(
      successor = candidate(
        tree = ErgoTree.fromProposition(TrivialProp.TrueProp)),
      capability = activeCapability) shouldBe false

    verify(
      successor = candidate(registers = successorRegisters.toMap.updated(
        ErgoBox.R8, IntConstant(currentHeight + 1))),
      capability = activeCapability) shouldBe false

    val wrongIdToken =
      (Digest32Coll @@ Colls.fromArray(Array.fill[Byte](32)(0x44.toByte))) -> 1L
    val extraToken =
      (Digest32Coll @@ Colls.fromArray(Array.fill[Byte](32)(0x45.toByte))) -> 1L
    val inputTokenMutations = Vector(
      Colls.fromArray(Array(wrongIdToken)),
      Colls.fromArray(Array(trackerToken._1 -> 2L)),
      Colls.fromArray(Array(trackerToken, extraToken)))
    inputTokenMutations.foreach { tokens =>
      verify(
        self = copyBox(trackerSelf)(additionalTokens = tokens),
        capability = activeCapability) shouldBe false
    }

    val successorTokenMutations = Vector(
      Colls.fromArray(Array(trackerToken._1 -> 2L)),
      Colls.fromArray(Array(trackerToken, extraToken)))
    successorTokenMutations.foreach { tokens =>
      verify(
        successor = candidate(tokens = tokens),
        capability = activeCapability) shouldBe false
    }
  }

  test("anchor selector and tracker transition authority reject independently") {
    val anchorIndex = extension.get(3.toByte).get.value.asInstanceOf[Int]
    val wrongAnchorIndex =
      if (anchorIndex == contextHeaders.length - 1) anchorIndex - 1
      else anchorIndex + 1
    verify(
      suppliedExtension = ContextExtension(
        extension.values +
          (3.toByte -> IntConstant(wrongAnchorIndex))),
      capability = activeCapability) shouldBe false

    verify(
      suppliedExtension = ContextExtension(
        extension.values +
          (3.toByte -> IntConstant(contextHeaders.length))),
      capability = activeCapability) shouldBe false

    verify(
      suppliedExtension = ContextExtension(
        extension.values +
          (3.toByte -> IntConstant(-1))),
      capability = activeCapability) shouldBe false

    val timestampChanged = mutateSelectedHeader(anchorIndex)(_.copy(
        timestamp = contextHeaders(anchorIndex).timestamp + 1L,
        _bytes = null))
    verify(
      headers = timestampChanged,
      capability = activeCapability) shouldBe false

    val heightChanged = mutateSelectedHeader(anchorIndex)(_.copy(
        height = contextHeaders(anchorIndex).height + 1,
        _bytes = null))
    verify(
      headers = heightChanged,
      capability = activeCapability) shouldBe false

    val extensionRoot = contextHeaders(anchorIndex).extensionRoot.toArray
    extensionRoot(0) = (extensionRoot(0) ^ 1).toByte
    val rootChanged = mutateSelectedHeader(anchorIndex)(_.copy(
        extensionRoot = Digest32 @@ extensionRoot,
        _bytes = null))
    verify(
      headers = rootChanged,
      capability = activeCapability) shouldBe false

    val admittedSidechainHeight =
      successorRegisters(ErgoBox.R7).value.asInstanceOf[Long]
    val nonAdvancingInput = copyBox(trackerSelf)(
      additionalRegisters = inputRegisters.toMap.updated(
        ErgoBox.R7, LongConstant(admittedSidechainHeight)))
    verify(
      self = nonAdvancingInput,
      capability = activeCapability) shouldBe false

    val successorMutations = Vector(
      successorRegisters.toMap.updated(
        ErgoBox.R5, inputRegisters(ErgoBox.R5)),
      successorRegisters.toMap.updated(
        ErgoBox.R7, LongConstant(admittedSidechainHeight + 1L)),
      successorRegisters.toMap.updated(
        ErgoBox.R8, inputRegisters(ErgoBox.R8)))
    successorMutations.foreach { registers =>
      verify(
        successor = new ErgoBoxCandidate(
          trackerValue,
          trackerTree,
          currentHeight,
          Colls.fromArray(Array(trackerToken)),
          registers),
        capability = activeCapability) shouldBe false
    }

    val wrongToken =
      (Digest32Coll @@ Colls.fromArray(Array.fill[Byte](32)(0x44.toByte))) -> 1L
    verify(
      successor = new ErgoBoxCandidate(
        trackerValue,
        trackerTree,
        currentHeight,
        Colls.fromArray(Array(wrongToken)),
        successorRegisters),
      capability = activeCapability) shouldBe false

    verify(
      successor = new ErgoBoxCandidate(
        trackerValue - 1L,
        trackerTree,
        currentHeight,
        Colls.fromArray(Array(trackerToken)),
        successorRegisters),
      capability = activeCapability) shouldBe false
  }

  test("local JVM acceptance does not promote the preactivation fixture") {
    val boundaries = fixtureCursor.downField("boundaries")
    requiredString(
      transitionCursor.downField("provenance"),
      "header provenance") shouldBe
      "eip0045-validity-tracker-canonical-synthetic-header-context"
    requiredBoolean(boundaries.downField("serializationConformanceOnly"),
      "serialization boundary") shouldBe true
    requiredBoolean(boundaries.downField("exactTrackerSuccessorIncluded"),
      "successor boundary") shouldBe true
    requiredBoolean(
      boundaries.downField("exactContractPinnedApplicationProfileIncluded"),
      "application profile boundary") shouldBe true
    requiredBoolean(
      boundaries.downField("canonicalSyntheticHeaderIdsEstablished"),
      "canonical synthetic header boundary") shouldBe true
    requiredBoolean(
      boundaries.downField("minedHeaderEvidenceEstablished"),
      "mined header evidence boundary") shouldBe false
    Vector(
      "proofValidityEstablishedByFixture",
      "signingPerformed",
      "nodeCheckPerformed",
      "submissionPerformed",
      "broadcastPerformed",
      "profileActivated",
      "gate5Closed",
      "fundsAuthorityEstablished").foreach { field =>
      requiredBoolean(boundaries.downField(field), field) shouldBe false
    }
  }

  private def verify(
      self: ErgoBox = trackerSelf,
      successor: ErgoBoxCandidate = trackerSuccessor,
      suppliedExtension: ContextExtension = extension,
      headers: Array[CHeader] = contextHeaders,
      capability: StarkVerificationCapability): Boolean = {
    val result = new ErgoLikeTestInterpreter().verify(
      self.ergoTree,
      transactionContext(
        self, successor, suppliedExtension, headers, capability),
      ProverResult(Array.emptyByteArray, suppliedExtension),
      Message)
    withClue(
      "tracker input-script verification must not collapse an interpreter failure into rejection: ") {
      result.isSuccess shouldBe true
    }
    result.get._1
  }

  private def verifyScript(
      script: ErgoTree,
      self: ErgoBox,
      successor: ErgoBoxCandidate,
      suppliedExtension: ContextExtension,
      headers: Array[CHeader],
      capability: StarkVerificationCapability): Boolean = {
    val result = new ErgoLikeTestInterpreter().verify(
      script,
      transactionContext(
        self, successor, suppliedExtension, headers, capability),
      ProverResult(Array.emptyByteArray, suppliedExtension),
      Message)
    withClue(
      "diagnostic tracker reduction must not collapse an interpreter failure into rejection: ") {
      result.isSuccess shouldBe true
    }
    result.get._1
  }

  private def rejects(
      self: ErgoBox = trackerSelf,
      successor: ErgoBoxCandidate = trackerSuccessor,
      suppliedExtension: ContextExtension,
      headers: Array[CHeader] = contextHeaders,
      capability: StarkVerificationCapability): Unit = {
    val result = new ErgoLikeTestInterpreter().verify(
      self.ergoTree,
      transactionContext(
        self, successor, suppliedExtension, headers, capability),
      ProverResult(Array.emptyByteArray, suppliedExtension),
      Message)
    if (result.isSuccess) {
      result.get._1 shouldBe false
    }
  }

  private def candidate(
      tree: ErgoTree = trackerTree,
      value: Long = trackerValue,
      tokens: Coll[ErgoBox.Token] =
        Colls.fromArray(Array(trackerToken)),
      registers: ErgoBox.AdditionalRegisters =
        successorRegisters,
      creationHeight: Int = currentHeight): ErgoBoxCandidate =
    new ErgoBoxCandidate(
      value,
      tree,
      creationHeight,
      tokens,
      registers)

  private def reduce(
      self: ErgoBox,
      successor: ErgoBoxCandidate,
      suppliedExtension: ContextExtension,
      headers: Array[CHeader],
      capability: StarkVerificationCapability) =
    new ErgoLikeTestInterpreter().fullReduction(
      self.ergoTree,
      transactionContext(
        self, successor, suppliedExtension, headers, capability))

  private def transactionContext(
      self: ErgoBox,
      successor: ErgoBoxCandidate,
      suppliedExtension: ContextExtension,
      headers: Array[CHeader],
      capability: StarkVerificationCapability): ErgoLikeContext = {
    val transaction = new ErgoLikeTransaction(
      IndexedSeq(Input(
        self.id,
        ProverResult(Array.emptyByteArray, suppliedExtension))),
      IndexedSeq.empty,
      IndexedSeq(successor))
    val tip = headers.head
    val tipState = tip.stateRoot match {
      case tree: CAvlTree => tree.treeData
      case _ => throw new IllegalArgumentException(
        "canonical context tip state root is not AVL tree data")
    }
    val preHeader = CPreHeader(
      tip.version,
      tip.id,
      tip.timestamp + 1L,
      tip.nBits,
      tip.height + 1,
      tip.minerPk,
      Colls.emptyColl[Byte])
    val base = ErgoLikeContextTesting(
      currentHeight = currentHeight,
      lastBlockUtxoRoot = tipState,
      minerPubkey = ErgoLikeContextTesting.dummyPubkey,
      boxesToSpend = IndexedSeq(self),
      spendingTransaction = transaction,
      self = self,
      activatedVersion = VersionContext.StarkVerificationVersion.toByte,
      extension = suppliedExtension)
    copyContext(base)(
      headers = Colls.fromArray(headers.map(header => header: Header)),
      preHeader = preHeader)
      .withStarkVerificationCapability(capability)
  }

  private def extensionWith(
      proofValue: EvaluatedValue[_ <: SType],
      bundleValue: EvaluatedValue[_ <: SType]): ContextExtension =
    ContextExtension(Map(
      0.toByte -> proofValue,
      1.toByte -> extension.get(1.toByte).get,
      2.toByte -> bundleValue,
      3.toByte -> extension.get(3.toByte).get))

  private def proofChunksValue(chunks: Array[Array[Byte]]) =
    ConcreteCollection[SCollection[SByte.type]](
      chunks.map(chunk => ByteArrayConstant(chunk)).toIndexedSeq,
      SCollection.SByteArray)

  private def mutateSelectedHeader(
      selectedIndex: Int)(
      mutate: ErgoHeader => ErgoHeader): Array[CHeader] = {
    val headers = contextHeaders.clone()
    headers(selectedIndex) = new CHeader(
      mutate(headers(selectedIndex).ergoHeader))
    var index = selectedIndex - 1
    while (index >= 0) {
      headers(index) = new CHeader(headers(index).ergoHeader.copy(
        parentId = bytesToId(headers(index + 1).id.toArray),
        _bytes = null))
      index -= 1
    }
    headers
  }

  private def parseHeadersAt(cursor: ACursor): Array[CHeader] = {
    val json = cursor.downField("headers").focus.getOrElse(
      throw new IllegalArgumentException("headers missing"))
    val entries = json.asArray.getOrElse(
      throw new IllegalArgumentException("headers must be an array"))
    entries.zipWithIndex.map { case (entry, index) =>
      val cursor = entry.hcursor
      val headerJsonText = requiredString(
        cursor.downField("jvmHeaderJson"), s"header $index JVM JSON")
      val headerJson = parser.parse(headerJsonText).fold(
        failure => throw new IllegalArgumentException(
          s"header $index JVM JSON rejected: ${failure.getMessage}"),
        identity)
      val header = headerJson.as[Header].fold(
        failure => throw new IllegalArgumentException(
          s"header $index JVM decoding rejected: ${failure.getMessage}"),
        identity).asInstanceOf[CHeader]
      hex(header.id.toArray) shouldBe requiredString(
        cursor.downField("id"), s"header $index derived ID")
      ErgoHeader.sigmaSerializer.toBytes(header.ergoHeader) should
        contain theSameElementsInOrderAs hex(requiredString(
          cursor.downField("serializedHex"),
          s"header $index serialized bytes"))
      header
    }.toArray
  }

  private def registers(
      cursor: ACursor,
      label: String): ErgoBox.AdditionalRegisters =
    (4 to 9).map(index =>
      ErgoBox.nonMandatoryRegisters(index - 4) -> parseValue(requiredString(
        cursor.downField(s"R$index"), s"$label R$index"))).toMap

  private def parseExtension(bytes: Array[Byte]): ContextExtension = {
    val reader = SigmaSerializer.startReader(bytes)
    val parsed = ContextExtension.serializer.parse(reader)
    require(reader.remaining == 0,
      s"ContextExtension parser left ${reader.remaining} trailing bytes")
    parsed
  }

  private def parseValue(
      bytesHex: String): EvaluatedValue[_ <: SType] = {
    val reader = SigmaSerializer.startReader(hex(bytesHex))
    val value = ValueSerializer.deserialize(reader)
      .asInstanceOf[EvaluatedValue[_ <: SType]]
    require(reader.remaining == 0,
      s"register parser left ${reader.remaining} trailing bytes")
    value
  }

  private def candidateManifest(): Map[String, (Int, String)] =
    candidateManifestAt(
      candidateRoot,
      "candidate-manifest-v2.txt",
      "e2s.bridge-validity-eip0045-application-candidate.v2",
      2)

  private def candidateManifestAt(
      root: Path,
      manifestName: String,
      schema: String,
      version: Int,
      metadata: Vector[String] = Vector.empty): Map[String, (Int, String)] = {
    val path = root.resolve(manifestName).normalize()
    require(path.getParent == root &&
      Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      "complete candidate manifest is unavailable")
    val lines = new String(
      Files.readAllBytes(path),
      StandardCharsets.US_ASCII).split("\n", -1).toVector
    val prefix = Vector(
      s"schema=$schema",
      s"version=$version") ++ metadata
    require(lines.take(prefix.length) == prefix,
      "candidate manifest envelope mismatch")
    require(lines.takeRight(2) == Vector("complete=true", ""),
      "candidate manifest completion marker mismatch")
    val entries = lines.slice(prefix.length, lines.length - 2).map { line =>
      val parts = line.stripPrefix("file=").split(":", -1)
      require(line.startsWith("file=") && parts.length == 3 &&
        parts(1).matches("[0-9]+") &&
        parts(2).matches("[0-9a-f]{64}"),
        "candidate manifest file entry is malformed")
      parts(0) -> (parts(1).toInt, parts(2))
    }
    require(entries.map(_._1) == CandidateFileNames &&
      entries.map(_._1).distinct.length == entries.length,
      "candidate manifest file order or names mismatch")
    entries.toMap
  }

  private def candidateBytes(name: String): Array[Byte] =
    candidateBytesAt(candidateRoot, candidateEntries, name, "application")

  private def candidateBytesAt(
      root: Path,
      entries: Map[String, (Int, String)],
      name: String,
      label: String): Array[Byte] = {
    val expected = entries.getOrElse(name,
      throw new IllegalArgumentException(
        "candidate file is not manifested: " + name))
    val path = root.resolve(name).normalize()
    require(path.getParent == root &&
      Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      s"$label candidate file is unavailable: $name")
    val bytes = Files.readAllBytes(path)
    require(bytes.length == expected._1 &&
      hex(Blake2b256(bytes)) == expected._2,
      s"$label candidate file identity mismatch: $name")
    bytes
  }

  private def resourceBytes(path: String): Array[Byte] = {
    val in = getClass.getResourceAsStream(path)
    require(in != null, "missing pinned profile resource " + path)
    val out = new ByteArrayOutputStream()
    val buffer = new Array[Byte](8192)
    try {
      var read = in.read(buffer)
      while (read >= 0) {
        if (read > 0) out.write(buffer, 0, read)
        read = in.read(buffer)
      }
      out.toByteArray
    } finally {
      in.close()
      out.close()
    }
  }

  private def right[A, B](value: Either[A, B], label: String): B =
    value match {
      case Right(result) => result
      case Left(failure) => fail(s"$label rejected: $failure")
    }

  private def exactFile(raw: String, label: String): Path = {
    require(raw != null && raw.nonEmpty, s"missing $label path")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      s"$label must be a real file")
    path
  }

  private def exactDirectory(raw: String, label: String): Path = {
    require(raw != null && raw.nonEmpty, s"missing $label path")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isDirectory(path) && !Files.isSymbolicLink(path),
      s"$label must be a real directory")
    path
  }

  private def requiredString(cursor: ACursor, label: String): String =
    cursor.as[String].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing or invalid: ${failure.getMessage}"),
      identity)

  private def requiredInt(cursor: ACursor, label: String): Int =
    cursor.as[Int].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing or invalid: ${failure.getMessage}"),
      identity)

  private def requiredLong(cursor: ACursor, label: String): Long =
    cursor.as[Long].toOption.orElse(
      cursor.as[String].toOption
        .filter(_.matches("[0-9]+"))
        .map(BigInt(_))
        .filter(_.isValidLong)
        .map(_.longValue)).getOrElse(
      throw new IllegalArgumentException(s"$label missing or invalid"))

  private def requiredBoolean(cursor: ACursor, label: String): Boolean =
    cursor.as[Boolean].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing or invalid: ${failure.getMessage}"),
      identity)

  private def readU64Be(bytes: Array[Byte], offset: Int): Long = {
    require(offset >= 0 && offset + 8 <= bytes.length,
      "u64 read exceeds proof bundle")
    var value = 0L
    var index = 0
    while (index < 8) {
      value = (value << 8) | (bytes(offset + index) & 0xffL)
      index += 1
    }
    value
  }

  private def hex(value: String): Array[Byte] = {
    require(value.matches("(?:[0-9a-f]{2})+"),
      "invalid lowercase whole-byte hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }

  private def hex(bytes: Array[Byte]): String =
    bytes.map(value => f"${value & 0xff}%02x").mkString
}
