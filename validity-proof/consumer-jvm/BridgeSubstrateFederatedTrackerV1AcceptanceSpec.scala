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
import scorex.crypto.authds.{ADKey, ADValue}
import scorex.crypto.authds.avltree.batch.{BatchAVLProver, Insert}
import scorex.crypto.hash.{Blake2b256, Digest32}
import scorex.util.bytesToId
import sigma.VersionContext
import sigma.ast._
import sigma.data.{AvlTreeData, AvlTreeFlags, CAvlTree, CHeader, CTHRESHOLD, Digest32Coll, ProveDlog, SigmaBoolean, TrivialProp}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.{ErgoTreeSerializer, GroupElementSerializer, SigmaSerializer, ValueSerializer}
import sigma.{Coll, Colls, Header}
import sigmastate.eval.CPreHeader
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.{copyBox, copyContext}

class BridgeSubstrateFederatedTrackerV1AcceptanceSpec
    extends AnyFunSuite with Matchers with JsonCodecs {
  private val FixtureProperty =
    "bridge.substrate.federated.tracker.v1.context.fixture"
  private val ExpectedFixtureSha256 =
    "65fc196a98c4ce25ed72d4bea1f61425f51908970e6f6b09ea0b0a39f604c77a"
  private val ExpectedContractId =
    "4fbcc5372efb4338b6f150ee5455a7a0cebd1f07c6cb0cc2929e17155086af8c"
  private val ExpectedTransactionId =
    "f71b9153ef7fb2319d732af59328e07af0fd8dc7cbb748c0583f3ce400620266"
  private val FederatedActivatedVersion = 3.toByte
  private val Message =
    Blake2b256("substrate federated tracker V1 acceptance").toArray
  private val StatementDomain = hex(
    "4532535f5355425354524154455f4645444552415445445f434845434b504f494e545f53544154454d454e545f5631")
  private val TrackerKeyDomain = hex(
    "4532535f5350565f5355425354524154455f4645444552415445445f4b45595f5631")
  private val TrackerValueDomain = hex(
    "4532535f5350565f5355425354524154455f4645444552415445445f56414c55455f5631")

  private final case class CoordinatedContext(
      transaction: ErgoLikeTransaction,
      self: ErgoBox,
      headers: Array[CHeader],
      height: Int)

  private lazy val fixtureBytes = {
    val raw = System.getProperty(FixtureProperty)
    require(raw != null && raw.nonEmpty, s"missing -D$FixtureProperty")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      "federated tracker fixture must be a real file")
    val bytes = Files.readAllBytes(path)
    require(bytes.nonEmpty && !bytes.contains('\r'.toByte) &&
      bytes.forall(byte => byte >= 0 && byte <= 0x7f),
      "federated tracker fixture must be LF-only ASCII")
    sha256(bytes) shouldBe ExpectedFixtureSha256
    bytes
  }
  private lazy val fixture = parser.parse(
    new String(fixtureBytes, StandardCharsets.US_ASCII)).fold(
    failure => throw new IllegalArgumentException(
      "federated tracker fixture rejected: " + failure.getMessage),
    identity)
  private lazy val cursor = fixture.hcursor
  private lazy val contractCursor = cursor.downField("contract")
  private lazy val transitionCursor = cursor.downField("trackerTransition")
  private lazy val extension = parseExtension(hex(requiredString(
    cursor.downField("contextExtension").downField("serializedHex"),
    "serialized ContextExtension")))
  private lazy val statementBytes = extension.get(0.toByte).get.value
    .asInstanceOf[Coll[Byte]].toArray
  private lazy val proofBundleBytes = extension.get(1.toByte).get.value
    .asInstanceOf[Coll[Byte]].toArray
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
  private lazy val expectedInputRegisters = registers(
    transitionCursor.downField("inputRegisters"), "input")
  private lazy val expectedSuccessorRegisters = registers(
    transitionCursor.downField("successorRegisters"), "successor")
  private lazy val trackerValue = requiredLong(
    transitionCursor.downField("inputValue"), "tracker value")
  private lazy val currentHeight = requiredInt(
    transitionCursor.downField("currentErgoHeight"),
    "current Ergo height")
  private lazy val anchorIndex = requiredInt(
    transitionCursor.downField("anchorContextIndex"),
    "anchor context index")
  private lazy val trackerSelf = parseBox(hex(requiredString(
    cursor.downField("inputBoxSigmaHex"),
    "tracker input box")))
  private lazy val contextHeaders = parseHeaders()
  private lazy val transaction = parseTransaction(prooflessTransactionBytes)
  private lazy val trackerSuccessor = transaction.outputCandidates.head
  private lazy val inputRegisters = trackerSelf.additionalRegisters
  private lazy val successorRegisters = trackerSuccessor.additionalRegisters
  private lazy val expectedThreshold = {
    val keys = requiredStringArray(
      contractCursor.downField("ergoAdmissionPublicKeysHex"),
      "Ergo admission public keys")
    val threshold = requiredInt(
      contractCursor.downField("ergoAdmissionThreshold"),
      "Ergo admission threshold")
    CTHRESHOLD(threshold, keys.map { key =>
      val reader = SigmaSerializer.startReader(hex(key))
      val point = GroupElementSerializer.parse(reader)
      require(reader.remaining == 0,
        "Ergo admission public key parser left trailing bytes")
      ProveDlog(point)
    })
  }

  test("exact V1 transaction reduces to the compiled 2-of-3 federation") {
    requiredString(cursor.downField("schema"), "fixture schema") shouldBe
      "e2s.substrate-federated-v1-tracker-context"
    requiredInt(cursor.downField("version"), "fixture version") shouldBe 1
    requiredString(cursor.downField("trustModel"), "trust model") shouldBe
      "federated_non_trustless"
    requiredString(contractCursor.downField("contractIdHex"),
      "contract ID") shouldBe ExpectedContractId
    requiredString(cursor.downField("unsignedTransactionIdHex"),
      "unsigned transaction ID") shouldBe ExpectedTransactionId
    requiredInt(cursor.downField("prooflessTransactionBytes"),
      "proofless transaction bytes") shouldBe 3940
    requiredString(cursor.downField("statement").downField("encodedHex"),
      "statement").length shouldBe 512 * 2
    requiredString(transitionCursor.downField("trackerValueHex"),
      "tracker value").length shouldBe 370 * 2
    extension.values.keySet shouldBe Set(0.toByte, 1.toByte, 2.toByte)
    expectedThreshold.k shouldBe 2
    expectedThreshold.children should have length 3

    hex(Blake2b256(prooflessTransactionBytes)) shouldBe ExpectedTransactionId
    ErgoLikeTransactionSerializer.toBytes(transaction) should
      contain theSameElementsInOrderAs prooflessTransactionBytes
    transaction.messageToSign should
      contain theSameElementsInOrderAs prooflessTransactionBytes
    transaction.id shouldBe ExpectedTransactionId
    transaction.inputs should have length 1
    transaction.dataInputs shouldBe empty
    transaction.outputCandidates should have length 1
    transaction.inputs.head.boxId should
      contain theSameElementsInOrderAs trackerSelf.id
    transaction.inputs.head.spendingProof.proof shouldBe empty
    ContextExtension.serializer.toBytes(transaction.inputs.head.extension) should
      contain theSameElementsInOrderAs ContextExtension.serializer.toBytes(extension)
    transaction.outputCandidates.head shouldBe trackerSuccessor

    val reduced = reduceTransaction(transaction)
    reduced shouldBe Right(expectedThreshold)
    verifyTransaction(transaction) shouldBe Right(false)
  }

  test("every statement field remains bound into the derived checkpoint commitments") {
    val statementFieldOffsets = Vector(
      "statement discriminator byte 0" -> 0,
      "statement discriminator byte 1" -> 1,
      "statement discriminator byte 2" -> 2,
      "statement discriminator byte 3" -> 3,
      "source network ID" -> 4,
      "sidechain ID" -> 36,
      "source native height" -> 75,
      "source native block hash" -> 76,
      "execution block hash" -> 108,
      "bridge event root" -> 140,
      "burn leaf count" -> 175,
      "bridge address" -> 176,
      "token address" -> 196,
      "bridge runtime hash" -> 216,
      "bridge runtime byte length" -> 251,
      "token runtime hash" -> 252,
      "token runtime byte length" -> 287,
      "source runtime hash" -> 288,
      "source runtime byte length" -> 323,
      "runtime profile ID" -> 324,
      "settlement profile ID" -> 356,
      "federation profile ID" -> 388,
      "source key-set digest" -> 420,
      "source threshold" -> 453,
      "Ergo key-set digest" -> 454,
      "Ergo threshold" -> 487,
      "federation epoch" -> 495,
      "admission valid-from height" -> 503,
      "admission expiry height" -> 511)
    statementFieldOffsets.foreach { case (label, offset) =>
      assertVmFalse(label, mutateExtensionByte(transaction, 0, offset))
    }

    Vector(
      "short statement" -> statementBytes.dropRight(1),
      "long statement" -> (statementBytes :+ 0.toByte)).foreach {
      case (label, bytes) =>
        assertAvlInsertFailure(
          label,
          withExtensionBytes(transaction, 0, bytes),
          expectedDetail = Some("Value length is fixed and should be 370"))
    }

    val canonical = coordinatedContext(statementBytes.clone())
    withClue("coordinated fixture rebuild must preserve the positive predicate: ") {
      reduceTransaction(
        canonical.transaction,
        canonical.self,
        canonical.headers,
        canonical.height) shouldBe Right(expectedThreshold)
    }
    Vector(0, 1, 2, 3).foreach { offset =>
      assertCoordinatedStatementFalse(
        s"statement discriminator byte $offset",
        bytes => bytes(offset) = (bytes(offset) ^ 1).toByte)
    }
    assertCoordinatedStatementFalse(
      "zero source-native height",
      bytes => putLong(bytes, 68, 0L),
      oldSourceHeight = Some(-1L))
    assertCoordinatedStatementFalse(
      "zero source-native block hash",
      bytes => java.util.Arrays.fill(bytes, 76, 108, 0.toByte))
    assertCoordinatedStatementFalse(
      "zero execution block hash",
      bytes => java.util.Arrays.fill(bytes, 108, 140, 0.toByte))
    assertCoordinatedStatementFalse(
      "zero bridge event root",
      bytes => java.util.Arrays.fill(bytes, 140, 172, 0.toByte))
    assertCoordinatedStatementFalse(
      "zero burn count",
      bytes => putInt(bytes, 172, 0))
    assertCoordinatedStatementFalse(
      "burn count above the admitted bound",
      bytes => putInt(bytes, 172, 257))
    assertCoordinatedStatementFalse(
      "source-attestation threshold",
      bytes => bytes(453) = (bytes(453) ^ 1).toByte)
    assertCoordinatedStatementFalse(
      "Ergo-admission threshold",
      bytes => bytes(487) = (bytes(487) ^ 1).toByte)
    assertCoordinatedStatementFalse(
      "zero valid-from height",
      bytes => {
        putLong(bytes, 496, 0L)
        putLong(bytes, 504, 50L)
      },
      height = 25,
      anchorHeight = Some(20))
    assertCoordinatedStatementFalse(
      "non-increasing validity window",
      bytes => putLong(bytes, 504, readU64Be(bytes, 496)))
    assertCoordinatedStatementFalse(
      "validity window above the compiled span",
      bytes => putLong(bytes, 504, 1075L))
    assertCoordinatedStatementFalse(
      "current height before valid-from",
      bytes => putLong(bytes, 496, currentHeight.toLong + 1L))
    assertCoordinatedStatementFalse(
      "current height at expiry",
      bytes => putLong(bytes, 504, currentHeight.toLong))
    assertCoordinatedStatementFalse(
      "anchor height before valid-from",
      _ => (),
      anchorHeight = Some(1009))
    assertCoordinatedStatementFalse(
      "anchor height after the current height",
      _ => (),
      anchorHeight = Some(currentHeight + 1))
  }

  test("compiled application and federation bindings reject coordinated profile drift") {
    val exactBindings = Vector(
      ("source network ID", 4, 36, None),
      ("sidechain ID", 36, 68, Some(ErgoBox.R6)),
      ("bridge address", 176, 196, None),
      ("token address", 196, 216, None),
      ("bridge runtime hash", 216, 248, None),
      ("bridge runtime byte length", 248, 252, None),
      ("token runtime hash", 252, 284, None),
      ("token runtime byte length", 284, 288, None),
      ("source runtime hash", 288, 320, None),
      ("source runtime byte length", 320, 324, None),
      ("runtime profile ID", 324, 356, None),
      ("settlement profile ID", 356, 388, None),
      ("federation profile ID", 388, 420, Some(ErgoBox.R4)),
      ("source key-set digest", 420, 452, None),
      ("Ergo key-set digest", 454, 486, Some(ErgoBox.R9)),
      ("federation epoch", 488, 496, None))
    exactBindings.foreach { case (label, start, end, stateRegister) =>
      val canonical = statementBytes.slice(start, end)
      val alternate = canonical.clone()
      alternate(0) = (alternate(0) ^ 1).toByte
      assertTreeMutationFalse(
        label,
        mutateUniqueConstant(
          label,
          ByteArrayConstant(canonical),
          ByteArrayConstant(alternate)),
        stateRegister.map(_ -> ByteArrayConstant(alternate)))
    }

  }

  test("proof framing, membership, and AVL transition faults fail closed") {
    val extensionProofLength = readU64Be(proofBundleBytes, 0).toInt
    extensionProofLength shouldBe 33
    proofBundleBytes.length should be > (8 + extensionProofLength)

    val highLengthWord = proofBundleBytes.clone()
    highLengthWord(0) = 1.toByte
    val invalidSide = proofBundleBytes.clone()
    invalidSide(8) = 4.toByte
    val siblingDrift = proofBundleBytes.clone()
    siblingDrift(9) = (siblingDrift(9) ^ 1).toByte
    val avlDrift = proofBundleBytes.clone()
    avlDrift(avlDrift.length - 1) =
      (avlDrift(avlDrift.length - 1) ^ 1).toByte

    Vector(
      "empty proof bundle" -> Array.empty[Byte],
      "length-only proof bundle" -> Array.fill[Byte](8)(0.toByte),
      "non-zero high proof-length word" -> highLengthWord,
      "zero extension-proof length" -> withDeclaredProofLength(0),
      "below-minimum extension-proof length" -> withDeclaredProofLength(32),
      "misaligned extension-proof length" -> withDeclaredProofLength(34),
      "aligned extension proof above the maximum" -> oversizedProofBundle(),
      "maximum declared length cannot consume AVL bytes" ->
        withDeclaredProofLength(462),
      "missing AVL proof" -> proofBundleBytes.take(8 + extensionProofLength),
      "truncated AVL proof" -> proofBundleBytes.dropRight(1),
      "AVL proof drift" -> avlDrift).foreach { case (label, bytes) =>
      assertAvlInsertFailure(label, withExtensionBytes(transaction, 1, bytes))
    }
    Vector(
      "invalid extension side tag" -> invalidSide,
      "extension sibling drift" -> siblingDrift).foreach { case (label, bytes) =>
      assertVmFalse(label, withExtensionBytes(transaction, 1, bytes))
    }

    val canonicalEmptyProof = Array.fill[Byte](33)(0.toByte)
    canonicalEmptyProof(0) = 2.toByte
    val canonicalEmpty = coordinatedContext(
      statementBytes.clone(),
      extensionProof = canonicalEmptyProof)
    reduceTransaction(
      canonicalEmpty.transaction,
      canonicalEmpty.self,
      canonicalEmpty.headers,
      canonicalEmpty.height) shouldBe Right(expectedThreshold)
    val nonCanonicalEmptyProof = canonicalEmptyProof.clone()
    nonCanonicalEmptyProof(1) = 1.toByte
    val nonCanonicalEmpty = coordinatedContext(
      statementBytes.clone(),
      extensionProof = nonCanonicalEmptyProof)
    assertVmFalse(
      "non-canonical empty-child padding",
      nonCanonicalEmpty.transaction,
      self = nonCanonicalEmpty.self,
      headers = nonCanonicalEmpty.headers,
      height = nonCanonicalEmpty.height)
  }

  test("missing and wrongly typed ContextExtension values fail during evaluation") {
    Vector(0, 1, 2).foreach { variableId =>
      assertAbsentTypedValueFailure(
        s"missing ContextExtension variable $variableId",
        withInputExtension(
          transaction,
          ContextExtension(extension.values - variableId.toByte)))
    }
    Vector(
      0.toByte -> IntConstant(1),
      1.toByte -> IntConstant(1),
      2.toByte -> ByteArrayConstant(Array(1.toByte))).foreach {
      case (variableId, wrongValue) =>
        assertInvalidTypeFailure(
          s"wrong ContextExtension type $variableId",
          withInputExtension(
            transaction,
            ContextExtension(extension.values + (variableId -> wrongValue))))
    }
  }

  test("anchor selector and selected-header faults reduce to false") {
    require(contextHeaders.length > 1, "anchor matrix requires two headers")
    val alternateAnchor = if (anchorIndex == 0) 1 else 0
    Vector(
      "alternate anchor selector" -> alternateAnchor,
      "negative anchor selector" -> -1,
      "out-of-range anchor selector" -> contextHeaders.length).foreach {
      case (label, selected) =>
        assertVmFalse(
          label,
          withInputExtension(
            transaction,
            ContextExtension(extension.values +
              (2.toByte -> IntConstant(selected)))))
    }

    val changedRoot = contextHeaders(anchorIndex).extensionRoot.toArray
    changedRoot(0) = (changedRoot(0) ^ 1).toByte
    assertVmFalse(
      "selected anchor extension root",
      transaction,
      headers = mutateAnchorHeader(_.copy(
        extensionRoot = Digest32 @@ changedRoot,
        _bytes = null)))
    assertVmFalse(
      "selected anchor identity",
      transaction,
      headers = mutateAnchorHeader(_.copy(
        timestamp = contextHeaders(anchorIndex).timestamp + 1L,
        _bytes = null)))
  }

  test("tracker authority and complete successor lineage fail closed") {
    val wrongInputToken =
      (Digest32Coll @@ Colls.fromArray(Array.fill[Byte](32)(0x43.toByte))) -> 1L
    val inputTokenMutations = Vector(
      "missing input tracker token" -> Colls.emptyColl[ErgoBox.Token],
      "input tracker token amount" ->
        Colls.fromArray(Array(trackerToken._1 -> 2L)),
      "input tracker token ID" -> Colls.fromArray(Array(wrongInputToken)),
      "extra input tracker token" ->
        Colls.fromArray(Array(trackerToken, wrongInputToken)))
    inputTokenMutations.foreach { case (label, tokens) =>
      val changedSelf = copyBox(trackerSelf)(additionalTokens = tokens)
      assertVmFalse(
        label,
        withSelfAndOutput(transaction, changedSelf, trackerSuccessor),
        self = changedSelf)
    }

    val inputTree = avlData(inputRegisters(ErgoBox.R5).value)
    val successorTree = avlData(successorRegisters(ErgoBox.R5).value)
    val permissiveInputTree = new AvlTreeData(
      inputTree.digest,
      AvlTreeFlags.AllOperationsAllowed,
      inputTree.keyLength,
      inputTree.valueLengthOpt)
    val permissiveSuccessorTree = new AvlTreeData(
      successorTree.digest,
      AvlTreeFlags.AllOperationsAllowed,
      successorTree.keyLength,
      successorTree.valueLengthOpt)
    val permissiveSelf = copyBox(trackerSelf)(
      additionalRegisters = inputRegisters.toMap.updated(
        ErgoBox.R5,
        AvlTreeConstant(permissiveInputTree)))
    val permissiveSuccessor = candidate(
      registers = successorRegisters.toMap.updated(
        ErgoBox.R5,
        AvlTreeConstant(permissiveSuccessorTree)))
    assertVmFalse(
      "input AVL insert-only policy",
      withSelfAndOutput(transaction, permissiveSelf, permissiveSuccessor),
      self = permissiveSelf)

    Vector(ErgoBox.R4, ErgoBox.R6, ErgoBox.R9).foreach { register =>
      val value = inputRegisters(register).value
        .asInstanceOf[Coll[Byte]].toArray.clone()
      value(0) = (value(0) ^ 1).toByte
      val changedSelf = copyBox(trackerSelf)(
        additionalRegisters = inputRegisters.toMap.updated(
          register,
          ByteArrayConstant(value)))
      assertVmFalse(
        s"input $register authority binding",
        withSelfAndOutput(transaction, changedSelf, trackerSuccessor),
        self = changedSelf)
    }
    val sourceHeight = successorRegisters(ErgoBox.R7).value
      .asInstanceOf[Long]
    val nonAdvancingSelf = copyBox(trackerSelf)(
      additionalRegisters = inputRegisters.toMap.updated(
        ErgoBox.R7,
        LongConstant(sourceHeight)))
    assertVmFalse(
      "non-advancing source height",
      withSelfAndOutput(transaction, nonAdvancingSelf, trackerSuccessor),
      self = nonAdvancingSelf)
    val nonAdvancingAdmissionSelf = copyBox(trackerSelf)(
      additionalRegisters = inputRegisters.toMap.updated(
        ErgoBox.R8,
        IntConstant(currentHeight)))
    assertVmFalse(
      "non-advancing admission height",
      withSelfAndOutput(
        transaction,
        nonAdvancingAdmissionSelf,
        trackerSuccessor),
      self = nonAdvancingAdmissionSelf)

    val wrongProfileId = successorRegisters(ErgoBox.R4).value
      .asInstanceOf[Coll[Byte]].toArray.clone()
    wrongProfileId(0) = (wrongProfileId(0) ^ 1).toByte
    val wrongSidechainId = successorRegisters(ErgoBox.R6).value
      .asInstanceOf[Coll[Byte]].toArray.clone()
    wrongSidechainId(0) = (wrongSidechainId(0) ^ 1).toByte
    val wrongErgoKeySet = successorRegisters(ErgoBox.R9).value
      .asInstanceOf[Coll[Byte]].toArray.clone()
    wrongErgoKeySet(0) = (wrongErgoKeySet(0) ^ 1).toByte
    val admittedAt = successorRegisters(ErgoBox.R8).value
      .asInstanceOf[Int]
    val wrongTokenId =
      (Digest32Coll @@ Colls.fromArray(Array.fill[Byte](32)(0x44.toByte))) -> 1L
    val extraToken =
      (Digest32Coll @@ Colls.fromArray(Array.fill[Byte](32)(0x45.toByte))) -> 1L
    val successorMutations = Vector(
      "successor value" -> candidate(value = trackerValue + 1L),
      "successor proposition" -> candidate(
        tree = ErgoTree.fromProposition(TrivialProp.TrueProp)),
      "successor tracker token ID" -> candidate(
        tokens = Colls.fromArray(Array(wrongTokenId))),
      "successor tracker token amount" -> candidate(
        tokens = Colls.fromArray(Array(trackerToken._1 -> 2L))),
      "successor extra token" -> candidate(
        tokens = Colls.fromArray(Array(trackerToken, extraToken))),
      "successor federation profile" -> candidate(
        registers = successorRegisters.toMap.updated(
          ErgoBox.R4, ByteArrayConstant(wrongProfileId))),
      "successor AVL state" -> candidate(
        registers = successorRegisters.toMap.updated(
          ErgoBox.R5, inputRegisters(ErgoBox.R5))),
      "successor sidechain ID" -> candidate(
        registers = successorRegisters.toMap.updated(
          ErgoBox.R6, ByteArrayConstant(wrongSidechainId))),
      "successor source height" -> candidate(
        registers = successorRegisters.toMap.updated(
          ErgoBox.R7, LongConstant(sourceHeight + 1L))),
      "successor admission height" -> candidate(
        registers = successorRegisters.toMap.updated(
          ErgoBox.R8, IntConstant(admittedAt + 1))),
      "successor Ergo key-set digest" -> candidate(
        registers = successorRegisters.toMap.updated(
          ErgoBox.R9, ByteArrayConstant(wrongErgoKeySet))))
    successorMutations.foreach { case (label, successor) =>
      assertVmFalse(label, withOutput(transaction, successor))
    }

    val wrongRegisterTypes = Map[ErgoBox.NonMandatoryRegisterId,
      EvaluatedValue[_ <: SType]](
      ErgoBox.R4 -> IntConstant(1),
      ErgoBox.R5 -> ByteArrayConstant(Array(1.toByte)),
      ErgoBox.R6 -> IntConstant(1),
      ErgoBox.R7 -> IntConstant(1),
      ErgoBox.R8 -> LongConstant(1L),
      ErgoBox.R9 -> IntConstant(1))
    (4 to 9).foreach { index =>
      val register = ErgoBox.nonMandatoryRegisters(index - 4)
      val missing = withOutput(
        transaction,
        candidate(registers = successorRegisters.toMap - register))
      if (index < 9)
        assertSparseRegisterFailure(s"missing successor R$index", missing, index)
      else
        assertVmFalse(s"missing successor R$index", missing)
      assertVmFalse(
        s"wrong successor R$index type",
        withOutput(
          transaction,
          candidate(registers = successorRegisters.toMap.updated(
            register,
            wrongRegisterTypes(register)))))
    }
  }

  test("successor creation height is monotonic, nonfuture and fresh") {
    val oneBlockLag = coordinatedContext(
      statementBytes.clone(),
      selfCreationHeight = currentHeight - 1,
      successorCreationHeight = Some(currentHeight - 1))
    reduceTransaction(
      oneBlockLag.transaction,
      oneBlockLag.self,
      oneBlockLag.headers,
      oneBlockLag.height) shouldBe Right(expectedThreshold)

    val boundary = coordinatedContext(
      statementBytes.clone(),
      selfCreationHeight = currentHeight - 200,
      successorCreationHeight = Some(currentHeight - 100))
    reduceTransaction(
      boundary.transaction,
      boundary.self,
      boundary.headers,
      boundary.height) shouldBe Right(expectedThreshold)

    val stale = coordinatedContext(
      statementBytes.clone(),
      selfCreationHeight = currentHeight - 200,
      successorCreationHeight = Some(currentHeight - 101))
    assertVmFalse(
      "successor creation height below the freshness boundary",
      stale.transaction,
      self = stale.self,
      headers = stale.headers,
      height = stale.height)

    val future = coordinatedContext(
      statementBytes.clone(),
      successorCreationHeight = Some(currentHeight + 1))
    assertVmFalse(
      "future successor creation height",
      future.transaction,
      self = future.self,
      headers = future.headers,
      height = future.height)

    val regressing = coordinatedContext(
      statementBytes.clone(),
      selfCreationHeight = currentHeight - 50,
      successorCreationHeight = Some(currentHeight - 51))
    assertVmFalse(
      "successor creation height before its predecessor",
      regressing.transaction,
      self = regressing.self,
      headers = regressing.headers,
      height = regressing.height)
  }

  test("the fixture records only local construction and JVM reduction inputs") {
    anchorIndex should be >= 0
    anchorIndex should be < contextHeaders.length
    trackerSelf.ergoTree shouldBe trackerTree
    trackerSelf.value shouldBe trackerValue
    trackerSelf.additionalTokens shouldBe Colls.fromArray(Array(trackerToken))
    trackerSelf.additionalRegisters shouldBe expectedInputRegisters
    trackerSuccessor.additionalRegisters shouldBe expectedSuccessorRegisters
    requiredBoolean(cursor.downField("boundaries")
      .downField("contractIdentityBound"), "contract identity boundary") shouldBe true
    requiredBoolean(cursor.downField("boundaries")
      .downField("statementAndProfileValidated"), "statement boundary") shouldBe true
    requiredBoolean(cursor.downField("boundaries")
      .downField("anchorMembershipConstructed"), "anchor boundary") shouldBe true
    requiredBoolean(cursor.downField("boundaries")
      .downField("avlTransitionConstructed"), "AVL boundary") shouldBe true
    Vector(
      "sourceSignaturesVerifiedOnChain",
      "jvmReductionAccepted",
      "nodeCheckPerformed",
      "profileActivated",
      "signingPerformed",
      "submissionPerformed",
      "broadcastPerformed",
      "fundsAuthorityEstablished",
      "gate5Closed",
      "trustlessStatusEstablished").foreach { field =>
      requiredBoolean(cursor.downField("boundaries").downField(field), field) shouldBe false
    }
  }

  private def assertVmFalse(
      label: String,
      tx: ErgoLikeTransaction,
      self: ErgoBox = trackerSelf,
      headers: Array[CHeader] = contextHeaders,
      height: Int = currentHeight): Unit =
    withClue(s"$label mutation must reduce to false: ") {
      reduceTransaction(tx, self, headers, height) shouldBe
        Right(TrivialProp.FalseProp)
    }

  private def assertAbsentTypedValueFailure(
      label: String,
      tx: ErgoLikeTransaction,
      self: ErgoBox = trackerSelf): Unit =
    withClue(s"$label must fail through Option.get on an absent typed value: ") {
      reduceTransaction(tx, self) match {
        case Left(_: NoSuchElementException) => ()
        case Left(other) => fail(
          s"unexpected ${other.getClass.getName}: ${other.getMessage}")
        case Right(value) => fail(s"unexpected reduction result: $value")
      }
    }

  private def assertInvalidTypeFailure(
      label: String,
      tx: ErgoLikeTransaction,
      self: ErgoBox = trackerSelf): Unit =
    withClue(s"$label must fail through the typed-value boundary: ") {
      reduceTransaction(tx, self) match {
        case Left(_: sigma.exceptions.InvalidType) => ()
        case Left(other) => fail(
          s"unexpected ${other.getClass.getName}: ${other.getMessage}")
        case Right(value) => fail(s"unexpected reduction result: $value")
      }
    }

  private def assertAvlInsertFailure(
      label: String,
      tx: ErgoLikeTransaction,
      expectedDetail: Option[String] = None): Unit =
    withClue(s"$label must fail the exact AVL insertion boundary: ") {
      reduceTransaction(tx) match {
        case Left(failure: sigma.exceptions.InterpreterException) =>
          failure.getMessage should startWith("Incorrect insert for CAvlTree")
          expectedDetail.foreach(detail =>
            failure.getMessage should include(detail))
        case Left(other) => fail(
          s"unexpected ${other.getClass.getName}: ${other.getMessage}")
        case Right(value) => fail(s"unexpected reduction result: $value")
      }
    }

  private def assertSparseRegisterFailure(
      label: String,
      tx: ErgoLikeTransaction,
      missingIndex: Int): Unit =
    withClue(s"$label must fail the dense-register encoding boundary: ") {
      reduceTransaction(tx) match {
        case Left(failure: RuntimeException) =>
          failure.getMessage should include(
            s"register R$missingIndex is missing in the range")
        case Left(other) => fail(
          s"unexpected ${other.getClass.getName}: ${other.getMessage}")
        case Right(value) => fail(s"unexpected reduction result: $value")
      }
    }

  private def reduceTransaction(
      tx: ErgoLikeTransaction,
      self: ErgoBox = trackerSelf,
      headers: Array[CHeader] = contextHeaders,
      height: Int = currentHeight): Either[Throwable, SigmaBoolean] =
    try {
      Right(new ErgoLikeTestInterpreter().fullReduction(
        self.ergoTree,
        transactionContext(tx, self, headers, height)).value)
    } catch {
      case failure: Throwable => Left(rootCause(failure))
    }

  private def verifyTransaction(
      tx: ErgoLikeTransaction): Either[Throwable, Boolean] =
    try {
      val spendingProof = tx.inputs.head.spendingProof
      val result = new ErgoLikeTestInterpreter().verify(
        trackerSelf.ergoTree,
        transactionContext(tx, trackerSelf, contextHeaders, currentHeight),
        spendingProof,
        Message)
      result.fold(Left(_), value => Right(value._1))
    } catch {
      case failure: Throwable => Left(failure)
    }

  private def transactionContext(
      tx: ErgoLikeTransaction,
      self: ErgoBox,
      headers: Array[CHeader],
      height: Int) = {
    val tip = headers.head
    val tipState = tip.stateRoot match {
      case tree: CAvlTree => tree.treeData
      case _ => throw new IllegalArgumentException(
        "federated context tip state root is not AVL tree data")
    }
    val preHeader = CPreHeader(
      tip.version,
      tip.id,
      tip.timestamp + 1L,
      tip.nBits,
      tip.height + 1,
      tip.minerPk,
      Colls.emptyColl[Byte])
    val suppliedExtension = tx.inputs.head.extension
    val base = ErgoLikeContextTesting(
      currentHeight = height,
      lastBlockUtxoRoot = tipState,
      minerPubkey = ErgoLikeContextTesting.dummyPubkey,
      boxesToSpend = IndexedSeq(self),
      spendingTransaction = tx,
      self = self,
      activatedVersion = FederatedActivatedVersion,
      extension = suppliedExtension)
    copyContext(base)(
      headers = Colls.fromArray(headers.map(header => header: Header)),
      preHeader = preHeader)
  }

  private def candidate(
      value: Long = trackerSuccessor.value,
      tree: ErgoTree = trackerSuccessor.ergoTree,
      creationHeight: Int = currentHeight,
      tokens: Coll[ErgoBox.Token] = trackerSuccessor.additionalTokens,
      registers: ErgoBox.AdditionalRegisters = successorRegisters)
      : ErgoBoxCandidate =
    new ErgoBoxCandidate(
      value,
      tree,
      creationHeight,
      tokens,
      registers)

  private def mutateExtensionByte(
      tx: ErgoLikeTransaction,
      variableId: Int,
      offset: Int): ErgoLikeTransaction = {
    val bytes = tx.inputs.head.extension.get(variableId.toByte).get.value
      .asInstanceOf[Coll[Byte]].toArray.clone()
    require(offset >= 0 && offset < bytes.length,
      "ContextExtension mutation is outside the selected value")
    bytes(offset) = (bytes(offset) ^ 1).toByte
    withInputExtension(
      tx,
      ContextExtension(tx.inputs.head.extension.values +
        (variableId.toByte -> ByteArrayConstant(bytes))))
  }

  private def withExtensionBytes(
      tx: ErgoLikeTransaction,
      variableId: Int,
      bytes: Array[Byte]): ErgoLikeTransaction =
    withInputExtension(
      tx,
      ContextExtension(tx.inputs.head.extension.values +
        (variableId.toByte -> ByteArrayConstant(bytes))))

  private def withDeclaredProofLength(length: Long): Array[Byte] = {
    require(length >= 0L, "declared proof length must be non-negative")
    val bytes = proofBundleBytes.clone()
    var index = 7
    var remaining = length
    while (index >= 0) {
      bytes(index) = (remaining & 0xffL).toByte
      remaining = remaining >>> 8
      index -= 1
    }
    require(remaining == 0L, "declared proof length exceeds u64")
    bytes
  }

  private def readU64Be(bytes: Array[Byte], offset: Int): Long = {
    require(offset >= 0 && offset + 8 <= bytes.length,
      "u64 read is outside the supplied bytes")
    var value = 0L
    var index = offset
    while (index < offset + 8) {
      value = (value << 8) | (bytes(index) & 0xffL)
      index += 1
    }
    value
  }

  private def mutateUniqueConstant(
      label: String,
      canonical: Constant[SType],
      alternate: Constant[SType]): ErgoTree = {
    canonical should not be alternate
    val matching = trackerTree.constants.zipWithIndex.collect {
      case (constant, index) if constant == canonical => index
    }
    withClue(s"$label compiled constant identity: ") {
      matching should have size 1
    }
    val updated = trackerTree.constants.updated(matching.head, alternate)
    updated.zip(trackerTree.constants).count {
      case (left, right) => left != right
    } shouldBe 1
    new ErgoTree(trackerTree.header, updated, trackerTree.root)
  }

  private def assertTreeMutationFalse(
      label: String,
      mutantTree: ErgoTree,
      stateBinding: Option[(ErgoBox.NonMandatoryRegisterId,
        EvaluatedValue[_ <: SType])] = None): Unit = {
    val mutantInputRegisters = stateBinding.fold(inputRegisters.toMap) {
      case (register, value) => inputRegisters.toMap.updated(register, value)
    }
    val mutantSuccessorRegisters = stateBinding.fold(successorRegisters.toMap) {
      case (register, value) => successorRegisters.toMap.updated(register, value)
    }
    val mutantSelf = copyBox(trackerSelf)(
      ergoTree = mutantTree,
      additionalRegisters = mutantInputRegisters)
    val mutantTransaction = withSelfAndOutput(
      transaction,
      mutantSelf,
      candidate(
        tree = mutantTree,
        registers = mutantSuccessorRegisters))
    assertVmFalse(label, mutantTransaction, self = mutantSelf)
  }

  private def assertCoordinatedStatementFalse(
      label: String,
      mutate: Array[Byte] => Unit,
      height: Int = currentHeight,
      anchorHeight: Option[Int] = None,
      oldSourceHeight: Option[Long] = None): Unit = {
    val statement = statementBytes.clone()
    mutate(statement)
    val candidate = coordinatedContext(
      statement,
      height = height,
      anchorHeight = anchorHeight,
      oldSourceHeight = oldSourceHeight)
    assertVmFalse(
      label,
      candidate.transaction,
      self = candidate.self,
      headers = candidate.headers,
      height = candidate.height)
  }

  private def coordinatedContext(
      statement: Array[Byte],
      extensionProof: Array[Byte] = canonicalExtensionProof,
      height: Int = currentHeight,
      anchorHeight: Option[Int] = None,
      oldSourceHeight: Option[Long] = None,
      selfCreationHeight: Int = trackerSelf.creationHeight,
      successorCreationHeight: Option[Int] = None): CoordinatedContext = {
    require(statement.length == 512,
      "coordinated statement must preserve the 512-byte shape")
    require(extensionProof.nonEmpty && extensionProof.length % 33 == 0,
      "coordinated extension proof must preserve 33-byte levels")
    require(height > 0,
      "coordinated current height must remain positive")

    val extensionRoot = extensionRootFor(statement, extensionProof)
    val headers = coordinatedHeaders(extensionRoot, anchorHeight)
    val anchor = headers(anchorIndex)
    val statementId = Blake2b256(StatementDomain ++ statement).toArray
    val sourceHeightBytes = statement.slice(68, 76)
    val sourceHeight = readU64Be(sourceHeightBytes, 0)
    val trackerKey = Blake2b256(
      TrackerKeyDomain ++
      statement.slice(4, 36) ++
      statement.slice(36, 68) ++
      sourceHeightBytes ++
      statement.slice(76, 108) ++
      statement.slice(108, 140)).toArray
    val trackerValueBytes =
      TrackerValueDomain ++
      Array[Byte](1.toByte, 1.toByte, 1.toByte, 0.toByte) ++
      statement.slice(140, 172) ++
      statementId ++
      anchor.id.toArray ++
      intBytes(anchor.height) ++
      sourceHeightBytes ++
      statement.slice(76, 108) ++
      statement.slice(108, 140) ++
      statement.slice(172, 176) ++
      statement.slice(324, 356) ++
      statement.slice(356, 388) ++
      statement.slice(388, 420) ++
      statement.slice(454, 486) ++
      statement.slice(486, 488) ++
      statement.slice(488, 496) ++
      statement.slice(496, 504) ++
      statement.slice(504, 512)
    require(trackerKey.length == 32 && trackerValueBytes.length == 370,
      "coordinated tracker transition changed its 32/370 shape")

    val prover = new BatchAVLProver[Digest32, Blake2b256.type](
      keyLength = 32,
      valueLengthOpt = Some(370))
    val inputTree = avlData(inputRegisters(ErgoBox.R5).value)
    require(prover.digest.sameElements(inputTree.digest.toArray),
      "coordinated tracker transition must start from the fixture digest")
    require(prover.performOneOperation(Insert(
      trackerKey.clone().asInstanceOf[ADKey],
      trackerValueBytes.clone().asInstanceOf[ADValue])).isSuccess,
      "coordinated tracker insertion must succeed")
    val avlProof = prover.generateProof().clone()
    val successorTree = new AvlTreeData(
      Colls.fromArray(prover.digest.clone()),
      AvlTreeFlags.InsertOnly,
      32,
      Some(370))
    val proofBundle = encodeProofBundle(extensionProof, avlProof)

    val selfRegisters = inputRegisters.toMap
      .updated(
        ErgoBox.R7,
        LongConstant(oldSourceHeight.getOrElse(
          inputRegisters(ErgoBox.R7).value.asInstanceOf[Long])))
      .updated(ErgoBox.R8, IntConstant(height - 1))
    val self = copyBox(trackerSelf)(
      additionalRegisters = selfRegisters,
      creationHeight = selfCreationHeight)
    val outputRegisters = successorRegisters.toMap
      .updated(ErgoBox.R5, AvlTreeConstant(successorTree))
      .updated(ErgoBox.R7, LongConstant(sourceHeight))
      .updated(ErgoBox.R8, IntConstant(height))
    val output = candidate(
      creationHeight = successorCreationHeight.getOrElse(height),
      registers = outputRegisters)
    val withStatement = withExtensionBytes(transaction, 0, statement)
    val withProof = withExtensionBytes(withStatement, 1, proofBundle)
    CoordinatedContext(
      withSelfAndOutput(withProof, self, output),
      self,
      headers,
      height)
  }

  private def coordinatedHeaders(
      extensionRoot: Array[Byte],
      anchorHeight: Option[Int]): Array[CHeader] = {
    require(extensionRoot.length == 32,
      "coordinated extension root must be 32 bytes")
    val headers = contextHeaders.clone()
    val selected = headers(anchorIndex).ergoHeader
    val selectedHeight = anchorHeight.getOrElse(selected.height)
    headers(anchorIndex) = new CHeader(selected.copy(
      extensionRoot = Digest32 @@ extensionRoot.clone(),
      height = selectedHeight,
      _bytes = null))
    var index = anchorIndex - 1
    while (index >= 0) {
      headers(index) = new CHeader(headers(index).ergoHeader.copy(
        parentId = bytesToId(headers(index + 1).id.toArray),
        _bytes = null))
      index -= 1
    }
    headers
  }

  private def extensionRootFor(
      statement: Array[Byte],
      extensionProof: Array[Byte]): Array[Byte] = {
    val statementId = Blake2b256(StatementDomain ++ statement).toArray
    val leaf = Array[Byte](2.toByte, 4.toByte, 1.toByte) ++
      statement.slice(140, 172) ++ statementId
    var root = Blake2b256(Array[Byte](0.toByte) ++ leaf).toArray
    var offset = 0
    while (offset < extensionProof.length) {
      val side = extensionProof(offset)
      val sibling = extensionProof.slice(offset + 1, offset + 33)
      root = side match {
        case 0 => Blake2b256(Array[Byte](1.toByte) ++ root ++ sibling).toArray
        case 1 => Blake2b256(Array[Byte](1.toByte) ++ sibling ++ root).toArray
        case 2 | 3 => Blake2b256(Array[Byte](1.toByte) ++ root).toArray
        case _ => throw new IllegalArgumentException(
          "coordinated extension proof has an invalid side tag")
      }
      offset += 33
    }
    root
  }

  private def canonicalExtensionProof: Array[Byte] = {
    val length = readU64Be(proofBundleBytes, 0).toInt
    proofBundleBytes.slice(8, 8 + length)
  }

  private def encodeProofBundle(
      extensionProof: Array[Byte],
      avlProof: Array[Byte]): Array[Byte] =
    ByteBuffer.allocate(8 + extensionProof.length + avlProof.length)
      .putLong(extensionProof.length.toLong)
      .put(extensionProof)
      .put(avlProof)
      .array()

  private def oversizedProofBundle(): Array[Byte] = {
    val extensionProof = Array.fill[Byte](15 * 33)(0.toByte)
    (0 until 15).foreach(index => extensionProof(index * 33) = 2.toByte)
    val canonicalLength = readU64Be(proofBundleBytes, 0).toInt
    val avlProof = proofBundleBytes.drop(8 + canonicalLength)
    require(avlProof.nonEmpty,
      "oversized proof negative requires a trailing AVL proof")
    encodeProofBundle(extensionProof, avlProof)
  }

  private def putLong(bytes: Array[Byte], offset: Int, value: Long): Unit =
    ByteBuffer.wrap(bytes, offset, 8).putLong(value)

  private def putInt(bytes: Array[Byte], offset: Int, value: Int): Unit =
    ByteBuffer.wrap(bytes, offset, 4).putInt(value)

  private def intBytes(value: Int): Array[Byte] =
    ByteBuffer.allocate(4).putInt(value).array()

  private def avlData(value: Any): AvlTreeData =
    value match {
      case tree: AvlTreeData => tree
      case wrapped: CAvlTree => wrapped.treeData
      case other => throw new IllegalArgumentException(
        s"expected AvlTree register, found ${other.getClass.getName}")
    }

  private def mutateAnchorHeader(
      mutate: ErgoHeader => ErgoHeader): Array[CHeader] = {
    val headers = contextHeaders.clone()
    headers(anchorIndex) = new CHeader(
      mutate(headers(anchorIndex).ergoHeader))
    var index = anchorIndex - 1
    while (index >= 0) {
      headers(index) = new CHeader(headers(index).ergoHeader.copy(
        parentId = bytesToId(headers(index + 1).id.toArray),
        _bytes = null))
      index -= 1
    }
    headers
  }

  private def rootCause(failure: Throwable): Throwable = {
    val cause = failure.getCause
    if (cause == null || cause == failure) failure else rootCause(cause)
  }

  private def withInputExtension(
      tx: ErgoLikeTransaction,
      suppliedExtension: ContextExtension): ErgoLikeTransaction = {
    val input = tx.inputs.head
    new ErgoLikeTransaction(
      tx.inputs.updated(
        0,
        Input(
          input.boxId,
          ProverResult(input.spendingProof.proof, suppliedExtension))),
      tx.dataInputs,
      tx.outputCandidates)
  }

  private def withOutput(
      tx: ErgoLikeTransaction,
      output: ErgoBoxCandidate): ErgoLikeTransaction =
    new ErgoLikeTransaction(
      tx.inputs,
      tx.dataInputs,
      IndexedSeq(output))

  private def withSelfAndOutput(
      tx: ErgoLikeTransaction,
      self: ErgoBox,
      output: ErgoBoxCandidate): ErgoLikeTransaction = {
    val input = tx.inputs.head
    new ErgoLikeTransaction(
      tx.inputs.updated(
        0,
        Input(self.id, input.spendingProof)),
      tx.dataInputs,
      IndexedSeq(output))
  }

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
      ErgoBox.nonMandatoryRegisters(index - 4) -> parseValue(requiredString(
        source.downField(s"R$index"), s"$label R$index"))).toMap

  private def parseExtension(bytes: Array[Byte]): ContextExtension = {
    val reader = SigmaSerializer.startReader(bytes)
    val parsed = ContextExtension.serializer.parse(reader)
    require(reader.remaining == 0,
      s"ContextExtension parser left ${reader.remaining} trailing bytes")
    parsed
  }

  private def parseBox(bytes: Array[Byte]): ErgoBox =
    VersionContext.withVersions(FederatedActivatedVersion, 0.toByte) {
      val reader = SigmaSerializer.startReader(bytes.clone())
      val parsed = ErgoBox.sigmaSerializer.parse(reader)
      require(reader.remaining == 0,
        s"box parser left ${reader.remaining} trailing bytes")
      parsed
    }

  private def parseTransaction(bytes: Array[Byte]): ErgoLikeTransaction =
    VersionContext.withVersions(FederatedActivatedVersion, 0.toByte) {
      val reader = SigmaSerializer.startReader(bytes.clone())
      val parsed = ErgoLikeTransactionSerializer.parse(reader)
      require(reader.remaining == 0,
        s"transaction parser left ${reader.remaining} trailing bytes")
      parsed
    }

  private def parseValue(bytesHex: String): EvaluatedValue[_ <: SType] = {
    val reader = SigmaSerializer.startReader(hex(bytesHex))
    val value = ValueSerializer.deserialize(reader)
      .asInstanceOf[EvaluatedValue[_ <: SType]]
    require(reader.remaining == 0,
      s"register parser left ${reader.remaining} trailing bytes")
    value
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
    bytes.map(value => f"${value & 0xff}%02x").mkString

  private def sha256(bytes: Array[Byte]): String =
    hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
