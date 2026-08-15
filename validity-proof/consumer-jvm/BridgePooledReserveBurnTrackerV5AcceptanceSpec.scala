package sigma.bridge

import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}
import java.security.MessageDigest

import io.circe.ACursor
import io.circe.parser
import org.ergoplatform._
import org.ergoplatform.sdk.JsonCodecs
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.authds.avltree.batch.{BatchAVLProver, Insert}
import scorex.crypto.authds.{ADKey, ADValue}
import scorex.crypto.hash.Blake2b256
import scorex.crypto.hash.Digest32
import sigma.VersionContext
import sigma.ast._
import sigma.data.{AvlTreeData, AvlTreeFlags, CAvlTree, CHeader, Digest32Coll}
import sigma.eval.StarkVerificationCapability._
import sigma.eval.{StarkProfileRuntime, StarkVerificationCapability}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.{ErgoTreeSerializer, SigmaSerializer, ValueSerializer}
import sigma.{Coll, Colls, Header}
import sigmastate.eval.CPreHeader
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.{copyBox, copyContext}

class BridgePooledReserveBurnTrackerV5AcceptanceSpec
    extends AnyFunSuite with Matchers with JsonCodecs {
  private val FixtureProperty =
    "bridge.eip0045.pooled.reserve.burn.tracker.fixture"
  private val ExpectedFixtureSha256 =
    "5b18bedc2480a05cf56c6d7e18d34cad3bfb3252fb03b974074e82cab41c9f84"
  private val ExpectedProgramId =
    "bd72f52090ed45f2803767f64cde4d4314b7735f27e8d4596c4db37f1dc52a31"
  private val ExpectedProfileId =
    "23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383"
  private val ExpectedContractId =
    "008a6dfbcadae28b4383ff35b0d333a163dfe54b925e565844ae128331abb7a0"
  private val BindingDomain =
    "E2S_POOLED_RESERVE_BURN_APPLICATION_BINDING_V5"
      .getBytes(StandardCharsets.US_ASCII)
  private val Message =
    Blake2b256("pooled-reserve burn tracker V5 acceptance").toArray

  private lazy val fixtureBytes = {
    val raw = System.getProperty(FixtureProperty)
    require(raw != null && raw.nonEmpty, s"missing -D$FixtureProperty")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(
      Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      "pooled-reserve burn tracker fixture must be a real file")
    val bytes = Files.readAllBytes(path)
    require(
      bytes.nonEmpty && !bytes.contains('\r'.toByte) &&
        bytes.forall(byte => byte >= 0 && byte <= 0x7f),
      "pooled-reserve burn tracker fixture must be LF-only ASCII")
    sha256(bytes) shouldBe ExpectedFixtureSha256
    bytes
  }
  private lazy val fixture = parser.parse(
    new String(fixtureBytes, StandardCharsets.US_ASCII)).fold(
    failure => throw new IllegalArgumentException(
      "pooled-reserve burn tracker fixture rejected: " +
        failure.getMessage),
    identity)
  private lazy val cursor = fixture.hcursor
  private lazy val contractCursor = cursor.downField("contract")
  private lazy val transitionCursor = cursor.downField("trackerTransition")
  private lazy val statement = hex(requiredString(
    cursor.downField("statement").downField("encodedHex"),
    "statement"))
  private lazy val payload = statement.drop(159)
  private lazy val proofChunks = requiredStringArray(
    cursor.downField("contextExtension").downField("proofChunksHex"),
    "proof chunks").map(hex).toArray
  private lazy val extension = parseExtension(hex(requiredString(
    cursor.downField("contextExtension").downField("serializedHex"),
    "serialized ContextExtension")))
  private lazy val prooflessTransactionBytes = hex(requiredString(
    cursor.downField("prooflessTransactionHex"),
    "proofless transaction"))
  private lazy val trackerTree = {
    val bytes = hex(requiredString(
      contractCursor.downField("propositionHex"),
      "tracker proposition"))
    bytes.length shouldBe requiredInt(
      contractCursor.downField("propositionBytes"),
      "tracker proposition bytes")
    hex(Blake2b256(bytes)) shouldBe ExpectedContractId
    ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(bytes)
  }
  private lazy val trackerToken =
    (Digest32Coll @@ Colls.fromArray(hex(requiredString(
      transitionCursor.downField("trackerNftIdHex"),
      "tracker NFT")))) -> 1L
  private lazy val inputRegisters = registers(
    transitionCursor.downField("inputRegisters"), "input")
  private lazy val successorRegisters = registers(
    transitionCursor.downField("successorRegisters"), "successor")
  private lazy val trackerValue = requiredLong(
    transitionCursor.downField("inputValue"), "tracker value")
  private lazy val currentHeight = requiredInt(
    transitionCursor.downField("currentErgoHeight"),
    "current Ergo height")
  private lazy val trackerSelf = parseBox(hex(requiredString(
    cursor.downField("inputBoxSigmaHex"),
    "tracker input box")))
  private lazy val trackerSuccessor = new ErgoBoxCandidate(
    trackerValue,
    trackerTree,
    currentHeight,
    Colls.fromArray(Array(trackerToken)),
    successorRegisters)
  private lazy val contextHeaders = parseHeaders()

  private final class FixtureRuntime(
      acceptAnyPayload: Boolean,
      runtimeProfileId: Array[Byte],
      acceptedProgramId: Array[Byte],
      acceptedContractId: Array[Byte]) extends StarkProfileRuntime {
    override private[sigma] def profileId: Array[Byte] =
      runtimeProfileId.clone()
    override private[sigma] def exactProofBytes: Int =
      proofChunks.map(_.length).sum
    override private[sigma] def maxApplicationPayloadBytes: Int = 981
    override private[sigma] def canonicalProofChunkLengths: Array[Int] =
      proofChunks.map(_.length)
    override private[sigma] def verify(
        chainDomainId: Array[Byte],
        programId: Array[Byte],
        contractId: Array[Byte],
        applicationPayload: Array[Byte],
        suppliedChunks: Array[Array[Byte]]): Boolean =
      chainDomainId.sameElements(statement.slice(27, 59)) &&
      programId.sameElements(acceptedProgramId) &&
      contractId.sameElements(acceptedContractId) &&
      (acceptAnyPayload || applicationPayload.sameElements(payload)) &&
      sameChunks(suppliedChunks, proofChunks)
  }

  private lazy val strictCapability = capability(acceptAnyPayload = false)
  private lazy val parserDiagnosticCapability =
    capability(acceptAnyPayload = true)

  private def alternateAvlTransition(
      key: Array[Byte],
      value: Array[Byte]): (ContextExtension, ErgoBoxCandidate) = {
    require(
      key.length == 32 && value.length == 370,
      "alternate tracker transition must preserve the 32/370 AVL shape")
    val prover = new BatchAVLProver[Digest32, Blake2b256.type](
      keyLength = 32,
      valueLengthOpt = Some(370))
    val inputTree = avlData(inputRegisters(ErgoBox.R5).value)
    require(
      prover.digest.sameElements(inputTree.digest.toArray),
      "alternate tracker transition must start from the exact input digest")
    require(
      prover.performOneOperation(Insert(
        key.clone().asInstanceOf[ADKey],
        value.clone().asInstanceOf[ADValue])).isSuccess,
      "alternate tracker insertion must succeed")
    val proof = prover.generateProof().clone()
    val successorTree = new AvlTreeData(
      Colls.fromArray(prover.digest.clone()),
      AvlTreeFlags.InsertOnly,
      32,
      Some(370))
    val extensionProof = hex(requiredString(
      transitionCursor.downField("extensionProofHex"),
      "extension proof"))
    val bundle = ByteBuffer
      .allocate(java.lang.Long.BYTES + extensionProof.length + proof.length)
      .putLong(extensionProof.length.toLong)
      .put(extensionProof)
      .put(proof)
      .array()
    val registers = successorRegisters.toMap.updated(
      ErgoBox.R5,
      AvlTreeConstant(successorTree))
    (
      extensionWith(2, ByteArrayConstant(bundle)),
      candidate(registers = registers))
  }

  test("exact self-bound V5 proof, anchor, AVL insertion, and successor accept") {
    requiredString(cursor.downField("schema"), "fixture schema") shouldBe
      "e2s.pooled-reserve-burn-tracker-context.v5"
    requiredInt(cursor.downField("version"), "fixture version") shouldBe 5
    statement.length shouldBe 1140
    payload.length shouldBe 981
    hex(statement.slice(59, 91)) shouldBe ExpectedProfileId
    hex(statement.slice(91, 123)) shouldBe ExpectedProgramId
    hex(statement.slice(123, 155)) shouldBe ExpectedContractId
    hex(payload.slice(450 + 45, 482 + 45)) shouldBe ExpectedContractId
    proofChunks.map(_.length).toVector shouldBe Vector(1, 2)

    verify(capability = strictCapability) shouldBe true
  }

  test("JVM parses and evaluates the exact proofless transaction and carried extension") {
    prooflessTransactionBytes.length shouldBe requiredInt(
      cursor.downField("prooflessTransactionBytes"),
      "proofless transaction bytes")
    val expectedId = requiredString(
      cursor.downField("unsignedTransactionIdHex"),
      "unsigned transaction ID")
    hex(Blake2b256(prooflessTransactionBytes)) shouldBe expectedId

    val transaction = parseTransaction(prooflessTransactionBytes)
    ErgoLikeTransactionSerializer.toBytes(transaction) should
      contain theSameElementsInOrderAs prooflessTransactionBytes
    transaction.messageToSign should
      contain theSameElementsInOrderAs prooflessTransactionBytes
    transaction.id shouldBe expectedId
    transaction.inputs should have length 1
    transaction.dataInputs shouldBe empty
    transaction.outputCandidates should have length 1
    transaction.inputs.head.boxId should
      contain theSameElementsInOrderAs trackerSelf.id
    transaction.inputs.head.spendingProof.proof shouldBe empty
    ContextExtension.serializer.toBytes(transaction.inputs.head.extension) should
      contain theSameElementsInOrderAs ContextExtension.serializer.toBytes(extension)
    transaction.outputCandidates.head shouldBe trackerSuccessor
    verifyTransaction(transaction, strictCapability) shouldBe true

    val mutatedExtension = extensionWith(
      3,
      IntConstant(extension.get(3.toByte).get.value.asInstanceOf[Int] + 1))
    val mutatedBytes = ErgoLikeTransactionSerializer.toBytes(
      withInputExtension(transaction, mutatedExtension))
    val reparsed = parseTransaction(mutatedBytes)
    ContextExtension.serializer.toBytes(reparsed.inputs.head.extension) should
      contain theSameElementsInOrderAs
        ContextExtension.serializer.toBytes(mutatedExtension)
    reparsed.outputCandidates shouldBe transaction.outputCandidates
    reparsed.id should not be expectedId
    verifyTransaction(reparsed, strictCapability) shouldBe false
  }

  test("proof transport and payload are bound by the verifier capability") {
    val wrongChunks = proofChunks.map(_.clone())
    wrongChunks(0)(0) = (wrongChunks(0)(0) ^ 1).toByte
    verify(
      suppliedExtension = extensionWith(
        0,
        proofChunksValue(wrongChunks)),
      capability = strictCapability) shouldBe false

    Vector(
      proofChunks.dropRight(1),
      proofChunks ++ Array(Array(4.toByte)),
      Array(proofChunks(1), proofChunks(0))).foreach { changed =>
      verify(
        suppliedExtension = extensionWith(
          0,
          proofChunksValue(changed)),
        capability = strictCapability) shouldBe false
    }

    val mutatedPayload = payload.clone()
    mutatedPayload(811) = (mutatedPayload(811) ^ 1).toByte
    verify(
      suppliedExtension = extensionWith(
        1,
        ByteArrayConstant(mutatedPayload)),
      capability = strictCapability) shouldBe false
  }

  test("unknown profile and mutated program or consumer identities fail closed") {
    val unknownProfile = hex(ExpectedProfileId)
    unknownProfile(0) = (unknownProfile(0) ^ 1).toByte
    verify(
      capability = capability(
        acceptAnyPayload = false,
        runtimeProfileId = unknownProfile)) shouldBe false

    val wrongProgram = hex(ExpectedProgramId)
    wrongProgram(0) = (wrongProgram(0) ^ 1).toByte
    verify(
      capability = capability(
        acceptAnyPayload = false,
        acceptedProgramId = wrongProgram)) shouldBe false

    val wrongConsumer = hex(ExpectedContractId)
    wrongConsumer(0) = (wrongConsumer(0) ^ 1).toByte
    verify(
      capability = capability(
        acceptAnyPayload = false,
        acceptedContractId = wrongConsumer)) shouldBe false
  }

  test("binding prefix, self-contract ID, controls, and digest reject independently") {
    val prefixMutation = bindingMutation(0)
    verify(
      suppliedExtension = payloadExtension(prefixMutation),
      capability = parserDiagnosticCapability) shouldBe false

    val selfContractMutation = bindingMutation(450)
    verify(
      suppliedExtension = payloadExtension(selfContractMutation),
      capability = parserDiagnosticCapability) shouldBe false

    val controlMutation = bindingMutation(482)
    verify(
      suppliedExtension = payloadExtension(controlMutation),
      capability = parserDiagnosticCapability) shouldBe false

    val badDigest = payload.clone()
    badDigest(531) = (badDigest(531) ^ 1).toByte
    verify(
      suppliedExtension = payloadExtension(badDigest),
      capability = parserDiagnosticCapability) shouldBe false
  }

  test("payload family, extension membership, and anchor selection fail closed") {
    verify(
      suppliedExtension = payloadExtension(payload.dropRight(7)),
      capability = parserDiagnosticCapability) shouldBe false

    val wrongDomain = payload.clone()
    wrongDomain(0) = (wrongDomain(0) ^ 1).toByte
    verify(
      suppliedExtension = payloadExtension(wrongDomain),
      capability = parserDiagnosticCapability) shouldBe false

    val bundle = extension.get(2.toByte).get.value
      .asInstanceOf[Coll[Byte]].toArray
    val wrongMembership = bundle.clone()
    wrongMembership(9) = (wrongMembership(9) ^ 1).toByte
    verify(
      suppliedExtension = extensionWith(
        2,
        ByteArrayConstant(wrongMembership)),
      capability = strictCapability) shouldBe false

    val anchorIndex = extension.get(3.toByte).get.value.asInstanceOf[Int]
    verify(
      suppliedExtension = extensionWith(
        3,
        IntConstant(anchorIndex + 1)),
      capability = strictCapability) shouldBe false
    verify(
      suppliedExtension = extensionWith(
        3,
        IntConstant(contextHeaders.length)),
      capability = strictCapability) shouldBe false
  }

  test("singleton, immutable registers, AVL policy, and successor reject") {
    val wrongToken =
      (Digest32Coll @@ Colls.fromArray(Array.fill[Byte](32)(0x44.toByte))) -> 1L
    Vector(
      Colls.emptyColl[ErgoBox.Token],
      Colls.fromArray(Array(trackerToken._1 -> 2L)),
      Colls.fromArray(Array(wrongToken)),
      Colls.fromArray(Array(trackerToken, wrongToken))).foreach { tokens =>
      verify(
        self = copyBox(trackerSelf)(additionalTokens = tokens),
        capability = strictCapability) shouldBe false
    }

    Vector(ErgoBox.R4, ErgoBox.R6, ErgoBox.R9).foreach { registerId =>
      val bytes = inputRegisters(registerId).value
        .asInstanceOf[Coll[Byte]].toArray
      bytes(0) = (bytes(0) ^ 1).toByte
      verify(
        self = copyBox(trackerSelf)(
          additionalRegisters = inputRegisters.toMap.updated(
            registerId,
            ByteArrayConstant(bytes))),
        capability = strictCapability) shouldBe false
    }

    val replayInputRegisters = successorRegisters.toMap
      .updated(ErgoBox.R7, inputRegisters(ErgoBox.R7))
      .updated(ErgoBox.R8, inputRegisters(ErgoBox.R8))
    verify(
      self = copyBox(trackerSelf)(
        additionalRegisters = replayInputRegisters),
      capability = strictCapability) shouldBe false

    val tree = avlData(inputRegisters(ErgoBox.R5).value)
    val permissiveTree = new AvlTreeData(
      tree.digest,
      AvlTreeFlags.AllOperationsAllowed,
      tree.keyLength,
      tree.valueLengthOpt)
    verify(
      self = copyBox(trackerSelf)(
        additionalRegisters = inputRegisters.toMap.updated(
          ErgoBox.R5,
          AvlTreeConstant(permissiveTree))),
      capability = strictCapability) shouldBe false

    val successorMutations = Vector(
      successorRegisters.toMap.updated(
        ErgoBox.R5, inputRegisters(ErgoBox.R5)),
      successorRegisters.toMap.updated(
        ErgoBox.R7, LongConstant(12346L)),
      successorRegisters.toMap.updated(
        ErgoBox.R8, inputRegisters(ErgoBox.R8)))
    successorMutations.foreach { mutated =>
      verify(
        successor = candidate(registers = mutated),
        capability = strictCapability) shouldBe false
    }
    verify(
      successor = candidate(
        tree = ErgoTree.fromProposition(sigma.data.TrivialProp.TrueProp)),
      capability = strictCapability) shouldBe false
    Vector(
      Colls.emptyColl[ErgoBox.Token],
      Colls.fromArray(Array(trackerToken._1 -> 2L)),
      Colls.fromArray(Array(wrongToken)),
      Colls.fromArray(Array(trackerToken, wrongToken))).foreach { tokens =>
      verify(
        successor = candidate(tokens = tokens),
        capability = strictCapability) shouldBe false
    }
    verify(
      successor = candidate(value = trackerValue - 1L),
      capability = strictCapability) shouldBe false
    verify(
      successor = candidate(creationHeight = currentHeight - 101),
      capability = strictCapability) shouldBe false
    verify(
      successor = candidate(creationHeight = currentHeight + 1),
      capability = strictCapability) shouldBe false
    Vector(ErgoBox.R4, ErgoBox.R6, ErgoBox.R9).foreach { registerId =>
      val bytes = successorRegisters(registerId).value
        .asInstanceOf[Coll[Byte]].toArray
      bytes(0) = (bytes(0) ^ 1).toByte
      verify(
        successor = candidate(
          registers = successorRegisters.toMap.updated(
            registerId,
            ByteArrayConstant(bytes))),
        capability = strictCapability) shouldBe false
    }
  }

  test("otherwise-valid wrong tracker key proof and successor reject") {
    val key = hex(requiredString(
      transitionCursor.downField("trackerKeyHex"),
      "tracker key"))
    val value = hex(requiredString(
      transitionCursor.downField("trackerValueHex"),
      "tracker value"))
    key(0) = (key(0) ^ 1).toByte
    val (alternateExtension, alternateSuccessor) =
      alternateAvlTransition(key, value)

    verify(
      successor = alternateSuccessor,
      suppliedExtension = alternateExtension,
      capability = strictCapability) shouldBe false
  }

  test("otherwise-valid wrong tracker value proof and successor reject") {
    val key = hex(requiredString(
      transitionCursor.downField("trackerKeyHex"),
      "tracker key"))
    val value = hex(requiredString(
      transitionCursor.downField("trackerValueHex"),
      "tracker value"))
    value(0) = (value(0) ^ 1).toByte
    val (alternateExtension, alternateSuccessor) =
      alternateAvlTransition(key, value)

    verify(
      successor = alternateSuccessor,
      suppliedExtension = alternateExtension,
      capability = strictCapability) shouldBe false
  }

  test("missing or mistyped ContextExtension values and unavailable profile reject") {
    (0 to 3).foreach { index =>
      rejects(
        suppliedExtension = ContextExtension(
          extension.values - index.toByte),
        capability = strictCapability)
    }
    val wrongTypes = Vector(
      0.toByte -> ByteArrayConstant(Array(1.toByte)),
      1.toByte -> IntConstant(1),
      2.toByte -> IntConstant(1),
      3.toByte -> ByteArrayConstant(Array(1.toByte)))
    wrongTypes.foreach { case (index, value) =>
      rejects(
        suppliedExtension = ContextExtension(
          extension.values + (index -> value)),
        capability = strictCapability)
    }

    intercept[sigma.exceptions.OpcodeUnavailableException] {
      reduce(
        self = trackerSelf,
        successor = trackerSuccessor,
        suppliedExtension = extension,
        headers = contextHeaders,
        capability = StarkVerificationCapability.Unavailable)
    }
  }

  test("fixture remains explicitly preactivation and non-authorizing") {
    val boundaries = cursor.downField("boundaries")
    Vector(
      "frozenContractIdentityBound",
      "statementCodecValidated",
      "selfContractBindingValidated",
      "exactContextExtensionRoundTrip",
      "avlTransitionConstructed").foreach { field =>
      requiredBoolean(boundaries.downField(field), field) shouldBe true
    }
    Vector(
      "profileActivated",
      "nodeCheckPerformed",
      "signingPerformed",
      "submissionPerformed",
      "broadcastPerformed",
      "fundsAuthorityEstablished",
      "gate5Closed").foreach { field =>
      requiredBoolean(boundaries.downField(field), field) shouldBe false
    }
  }

  private def capability(
      acceptAnyPayload: Boolean,
      runtimeProfileId: Array[Byte] = hex(ExpectedProfileId),
      acceptedProgramId: Array[Byte] = hex(ExpectedProgramId),
      acceptedContractId: Array[Byte] = hex(ExpectedContractId)) = {
    val entry = right(
      StarkVerificationCapability.active(
        new FixtureRuntime(
          acceptAnyPayload,
          runtimeProfileId,
          acceptedProgramId,
          acceptedContractId),
        fixedJit = 100),
      "active fixture profile")
    right(
      StarkVerificationCapability.snapshot(
        statement.slice(27, 59),
        protocolGeneration = 1,
        HistoricalBlockValidation,
        dispatchJit = 100,
        Vector(entry)),
      "fixture capability snapshot")
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
    withClue("V5 tracker verification unexpectedly failed: ") {
      result.isSuccess shouldBe true
    }
    result.get._1
  }

  private def verifyTransaction(
      transaction: ErgoLikeTransaction,
      capability: StarkVerificationCapability): Boolean = {
    val spendingProof = transaction.inputs.head.spendingProof
    val result = new ErgoLikeTestInterpreter().verify(
      trackerSelf.ergoTree,
      contextForTransaction(
        trackerSelf,
        transaction,
        spendingProof.extension,
        contextHeaders,
        capability),
      spendingProof,
      Message)
    withClue("serialized V5 tracker verification unexpectedly failed: ") {
      result.isSuccess shouldBe true
    }
    result.get._1
  }

  private def rejects(
      suppliedExtension: ContextExtension,
      capability: StarkVerificationCapability): Unit = {
    val result = new ErgoLikeTestInterpreter().verify(
      trackerSelf.ergoTree,
      transactionContext(
        trackerSelf,
        trackerSuccessor,
        suppliedExtension,
        contextHeaders,
        capability),
      ProverResult(Array.emptyByteArray, suppliedExtension),
      Message)
    if (result.isSuccess) result.get._1 shouldBe false
  }

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
    contextForTransaction(
      self, transaction, suppliedExtension, headers, capability)
  }

  private def contextForTransaction(
      self: ErgoBox,
      transaction: ErgoLikeTransaction,
      suppliedExtension: ContextExtension,
      headers: Array[CHeader],
      capability: StarkVerificationCapability): ErgoLikeContext = {
    val tip = headers.head
    val tipState = tip.stateRoot match {
      case tree: CAvlTree => tree.treeData
      case _ => throw new IllegalArgumentException(
        "fixture tip state root is not AVL tree data")
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

  private def candidate(
      value: Long = trackerValue,
      tree: ErgoTree = trackerTree,
      creationHeight: Int = currentHeight,
      tokens: Coll[ErgoBox.Token] = Colls.fromArray(Array(trackerToken)),
      registers: ErgoBox.AdditionalRegisters = successorRegisters)
      : ErgoBoxCandidate =
    new ErgoBoxCandidate(
      value,
      tree,
      creationHeight,
      tokens,
      registers)

  private def withInputExtension(
      transaction: ErgoLikeTransaction,
      suppliedExtension: ContextExtension): ErgoLikeTransaction = {
    val current = transaction.inputs.head
    new ErgoLikeTransaction(
      transaction.inputs.updated(
        0,
        Input(
          current.boxId,
          ProverResult(current.spendingProof.proof, suppliedExtension))),
      transaction.dataInputs,
      transaction.outputCandidates)
  }

  private def bindingMutation(relativeOffset: Int): Array[Byte] = {
    require(relativeOffset >= 0 && relativeOffset < 486)
    val mutated = payload.clone()
    mutated(45 + relativeOffset) =
      (mutated(45 + relativeOffset) ^ 1).toByte
    val digest = Blake2b256(
      BindingDomain ++ mutated.slice(45, 531)).toArray
    Array.copy(digest, 0, mutated, 531, digest.length)
    mutated
  }

  private def payloadExtension(bytes: Array[Byte]): ContextExtension =
    extensionWith(1, ByteArrayConstant(bytes))

  private def extensionWith(
      index: Int,
      value: EvaluatedValue[_ <: SType]): ContextExtension =
    ContextExtension(extension.values + (index.toByte -> value))

  private def proofChunksValue(chunks: Array[Array[Byte]]) =
    ConcreteCollection[SCollection[SByte.type]](
      chunks.map(chunk => ByteArrayConstant(chunk)).toIndexedSeq,
      SCollection.SByteArray)

  private def parseHeaders(): Array[CHeader] = {
    val json = transitionCursor.downField("headers").focus.getOrElse(
      throw new IllegalArgumentException("headers missing"))
    json.asArray.getOrElse(
      throw new IllegalArgumentException("headers must be an array"))
      .zipWithIndex.map { case (entry, index) =>
        val item = entry.hcursor
        val headerJson = parser.parse(requiredString(
          item.downField("jvmHeaderJson"),
          s"header $index JVM JSON")).fold(
          failure => throw new IllegalArgumentException(
            s"header $index JVM JSON rejected: ${failure.getMessage}"),
          identity)
        val header = headerJson.as[Header].fold(
          failure => throw new IllegalArgumentException(
            s"header $index decoding rejected: ${failure.getMessage}"),
          identity).asInstanceOf[CHeader]
        hex(header.id.toArray) shouldBe requiredString(
          item.downField("id"), s"header $index ID")
        ErgoHeader.sigmaSerializer.toBytes(header.ergoHeader) should
          contain theSameElementsInOrderAs hex(requiredString(
            item.downField("serializedHex"),
            s"header $index serialized bytes"))
        header
      }.toArray
  }

  private def registers(
      source: ACursor,
      label: String): ErgoBox.AdditionalRegisters =
    (4 to 9).map(index =>
      ErgoBox.nonMandatoryRegisters(index - 4) -> parseValue(
        requiredString(
          source.downField(s"R$index"),
          s"$label R$index"))).toMap

  private def avlData(value: Any): AvlTreeData =
    value match {
      case tree: AvlTreeData => tree
      case wrapped: CAvlTree => wrapped.treeData
      case other => throw new IllegalArgumentException(
        s"expected AvlTree register, found ${other.getClass.getName}")
    }

  private def parseExtension(bytes: Array[Byte]): ContextExtension = {
    val reader = SigmaSerializer.startReader(bytes)
    val parsed = ContextExtension.serializer.parse(reader)
    require(reader.remaining == 0,
      s"ContextExtension parser left ${reader.remaining} bytes")
    parsed
  }

  private def parseBox(bytes: Array[Byte]): ErgoBox =
    VersionContext.withVersions(
      VersionContext.StarkVerificationVersion.toByte,
      0.toByte) {
      val reader = SigmaSerializer.startReader(bytes.clone())
      val parsed = ErgoBox.sigmaSerializer.parse(reader)
      require(reader.remaining == 0,
        s"box parser left ${reader.remaining} bytes")
      parsed
    }

  private def parseTransaction(bytes: Array[Byte]): ErgoLikeTransaction =
    VersionContext.withVersions(
      VersionContext.StarkVerificationVersion.toByte,
      0.toByte) {
      val reader = SigmaSerializer.startReader(bytes.clone())
      val parsed = ErgoLikeTransactionSerializer.parse(reader)
      require(reader.remaining == 0,
        s"transaction parser left ${reader.remaining} bytes")
      parsed
    }

  private def parseValue(
      bytesHex: String): EvaluatedValue[_ <: SType] = {
    val reader = SigmaSerializer.startReader(hex(bytesHex))
    val value = ValueSerializer.deserialize(reader)
      .asInstanceOf[EvaluatedValue[_ <: SType]]
    require(reader.remaining == 0,
      s"register parser left ${reader.remaining} bytes")
    value
  }

  private def sameChunks(
      left: Array[Array[Byte]],
      right: Array[Array[Byte]]): Boolean =
    left.length == right.length &&
      left.indices.forall(index => left(index).sameElements(right(index)))

  private def right[A, B](value: Either[A, B], label: String): B =
    value match {
      case Right(result) => result
      case Left(failure) => fail(s"$label rejected: $failure")
    }

  private def requiredString(cursor: ACursor, label: String): String =
    cursor.as[String].fold(
      failure => throw new IllegalArgumentException(
        s"$label missing or invalid: ${failure.getMessage}"),
      identity)

  private def requiredStringArray(
      cursor: ACursor,
      label: String): Vector[String] =
    cursor.as[Vector[String]].fold(
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

  private def hex(value: String): Array[Byte] = {
    require(value.matches("(?:[0-9a-f]{2})+"),
      "invalid lowercase whole-byte hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }

  private def hex(bytes: Array[Byte]): String =
    bytes.iterator.map(byte => f"${byte & 0xff}%02x").mkString

  private def sha256(bytes: Array[Byte]): String =
    hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
