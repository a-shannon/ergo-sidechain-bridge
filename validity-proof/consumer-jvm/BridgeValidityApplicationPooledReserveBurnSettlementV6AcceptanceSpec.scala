package sigma.bridge

import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}
import java.security.MessageDigest

import io.circe.{ACursor, Json}
import io.circe.parser
import org.ergoplatform._
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.authds.avltree.batch.{BatchAVLProver, Insert, Lookup}
import scorex.crypto.authds.{ADKey, ADValue}
import scorex.crypto.hash.{Blake2b256, Digest32}
import sigma.VersionContext
import sigma.ast._
import sigma.data.{
  AvlTreeData,
  AvlTreeFlags,
  CAvlTree,
  Digest32Coll,
  TrivialProp
}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.{ErgoTreeSerializer, SigmaSerializer}
import sigma.{Coll, Colls}
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.{copyBox, copyTransaction}

class BridgeValidityApplicationPooledReserveBurnSettlementV6AcceptanceSpec
    extends AnyFunSuite with Matchers {
  private val FixtureProperty =
    "bridge.validity.application.pooled.reserve.burn.v6.fixture"
  private val FixtureShaProperty =
    "bridge.validity.application.pooled.reserve.burn.v6.fixture.sha256"
  private val Schema =
    "e2s.validity-application-pooled-reserve-burn-settlement-jvm-fixture.v6"
  private val SigmaStateCommit =
    "f78deadd668f801e7fae3bc884283f79c6f484fa"
  private val ReceiptSha256 =
    "302db270a82d2492e52e3adaa7cfdb259f8e6bb6e452c34e563a7c85455a5b56"
  private val ProoflessTransactionBytes = 6600
  private val ProoflessTransactionId =
    "e9511548e623756c917496e13f41fbfd65703deedd8a521288b082aedb800a83"
  private val Message = Blake2b256(
    "pooled reserve V6 burn settlement acceptance fixture").toArray
  private val falseTree = ErgoTree.fromProposition(TrivialProp.FalseProp)

  private lazy val fixtureBytes = {
    val raw = System.getProperty(FixtureProperty)
    require(raw != null && raw.nonEmpty, s"missing -D$FixtureProperty")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(
      Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      "burn settlement fixture must be a real file")
    val bytes = Files.readAllBytes(path)
    require(
      bytes.nonEmpty &&
        bytes.forall(byte => (byte & 0xff) <= 0x7f) &&
        !bytes.contains(13.toByte),
      "burn settlement fixture must be non-empty LF-only ASCII")
    val expected = System.getProperty(FixtureShaProperty)
    require(
      expected != null && expected.matches("[0-9a-f]{64}"),
      s"missing or invalid -D$FixtureShaProperty")
    sha256(bytes) shouldBe expected
    bytes
  }
  private lazy val fixture: Json =
    parser.parse(new String(fixtureBytes, StandardCharsets.US_ASCII)).fold(
      failure => throw new IllegalArgumentException(
        "burn settlement fixture JSON rejected: " + failure.getMessage),
      identity)
  private lazy val cursor = fixture.hcursor
  private lazy val currentHeight =
    requiredInt(cursor.downField("currentErgoHeight"), "current Ergo height")
  private lazy val prooflessBytes = hex(requiredString(
    cursor.downField("prooflessTransactionHex"),
    "proofless transaction"))
  private def transaction = parseTransaction(prooflessBytes)
  private def inputBoxes = parseBoxes(
    cursor.downField("inputBoxSigmaHex"),
    "input boxes")
  private def dataBoxes = parseBoxes(
    cursor.downField("dataInputBoxSigmaHex"),
    "data input boxes")
  private lazy val bindings = cursor.downField("bindings")

  test("exact V6 transaction and both compiled predicates accept") {
    requiredString(cursor.downField("schema"), "fixture schema") shouldBe Schema
    requiredInt(cursor.downField("version"), "fixture version") shouldBe 6
    requiredString(
      cursor.downField("sigmaStateCommit"),
      "SigmaState commit") shouldBe SigmaStateCommit
    requiredString(
      cursor.downField("compilerReceipt").downField("sha256Hex"),
      "compiler receipt SHA-256") shouldBe ReceiptSha256

    val boxes = inputBoxes
    val data = dataBoxes
    val tx = transaction
    boxes should have length 3
    data should have length 1
    tx.inputs should have length 3
    tx.dataInputs should have length 1
    tx.outputCandidates should have length 4
    tx.inputs.zip(boxes).foreach { case (input, box) =>
      input.boxId should contain theSameElementsInOrderAs box.id
      input.spendingProof.proof shouldBe empty
    }
    tx.dataInputs.head.boxId should
      contain theSameElementsInOrderAs data.head.id
    prooflessBytes.length shouldBe ProoflessTransactionBytes
    requiredInt(
      cursor.downField("prooflessTransactionBytes"),
      "proofless transaction byte count") shouldBe ProoflessTransactionBytes
    val txId = requiredString(
      cursor.downField("prooflessTransactionIdHex"),
      "proofless transaction ID")
    txId shouldBe ProoflessTransactionId
    requiredString(
      cursor.downField("unsignedTransactionIdHex"),
      "unsigned transaction ID") shouldBe txId
    hex(Blake2b256(prooflessBytes)) shouldBe txId
    tx.id shouldBe txId
    tx.messageToSign should contain theSameElementsInOrderAs prooflessBytes
    ErgoLikeTransactionSerializer.toBytes(tx) should
      contain theSameElementsInOrderAs prooflessBytes

    val contracts = cursor.downField("contracts")
    contractId(boxes(0).ergoTree) shouldBe requiredString(
      contracts.downField("pooledReserve").downField("contractIdHex"),
      "pooled reserve contract ID")
    contractId(boxes(1).ergoTree) shouldBe requiredString(
      contracts.downField("duplicatePrevention").downField("contractIdHex"),
      "duplicate-prevention contract ID")
    contractId(data.head.ergoTree) shouldBe requiredString(
      contracts.downField("tracker").downField("contractIdHex"),
      "tracker contract ID")
    hex(boxes(0).additionalTokens(0)._1.toArray) shouldBe requiredString(
      bindings.downField("pooledReserveNftIdHex"),
      "pooled reserve NFT").stripPrefix("0x")
    hex(boxes(1).additionalTokens(0)._1.toArray) shouldBe requiredString(
      bindings.downField("duplicatePreventionNftIdHex"),
      "duplicate-prevention NFT").stripPrefix("0x")
    hex(data.head.additionalTokens(0)._1.toArray) shouldBe requiredString(
      bindings.downField("trackerNftIdHex"),
      "tracker NFT").stripPrefix("0x")
    assertExactExtensionShape(tx)
    assertAccepted("canonical V6 transaction", tx, boxes, data, currentHeight)

    requiredBoolean(
      cursor.downField("boundaries")
        .downField("syntheticSettlementPredecessorsConstructed"),
      "synthetic settlement predecessors") shouldBe true

    Vector(
      "reservePredecessorProvenanceEstablished",
      "trackerAdmissionEstablished",
      "sidechainFinalityEstablished",
      "proofSystemActivated",
      "profileActivated",
      "targetNodeAcceptanceEstablished",
      "nodeCheckPerformed",
      "signingAuthorityEstablished",
      "submissionAuthorityEstablished",
      "broadcastAuthorityEstablished",
      "fundsAuthorityEstablished",
      "gate5Closed",
      "trustlessStatusEstablished",
      "productionReadinessEstablished").foreach { field =>
      requiredBoolean(
        cursor.downField("boundaries").downField(field),
        field) shouldBe false
    }
  }

  test("input and output topology faults reject the protected conjunction") {
    val base = transaction
    val boxes = inputBoxes
    val swappedInputs = IndexedSeq(
      base.inputs(1),
      base.inputs(0),
      base.inputs(2))
    val swapped = copyTransaction(base)(inputs = swappedInputs)
    assertRejected(
      "swapped protected inputs",
      swapped,
      IndexedSeq(boxes(1), boxes(0), boxes(2)),
      dataBoxes,
      currentHeight,
      Set(0, 1),
      enforceExtensionShape = false)

    val missingOutput =
      copyTransaction(base)(outputCandidates = base.outputCandidates.dropRight(1))
    assertRejected(
      "missing fee output",
      missingOutput,
      boxes,
      dataBoxes,
      currentHeight,
      Set(0, 1))
  }

  test("tracker singleton, profile, proposition, and AVL policy reject") {
    val base = transaction
    val boxes = inputBoxes
    val tracker = dataBoxes.head
    val wrongToken = copyBox(tracker)(
      additionalTokens = Colls.fromArray(Array(
        token("7f" * 32, 1L))))
    assertRejectedWithTracker(
      "wrong tracker singleton", base, boxes, wrongToken, Set(1))

    val wrongProfile = copyBox(tracker)(
      additionalRegisters = tracker.additionalRegisters.toMap.updated(
        ErgoBox.R4,
        flippedBytes(tracker.additionalRegisters(ErgoBox.R4), 0)))
    assertRejectedWithTracker(
      "wrong tracker profile", base, boxes, wrongProfile, Set(1))

    val wrongTree = copyBox(tracker)(ergoTree = falseTree)
    assertRejectedWithTracker(
      "wrong tracker proposition", base, boxes, wrongTree, Set(1))

    val trackerAvl = avlData(tracker.additionalRegisters(ErgoBox.R5).value)
    val permissive = new AvlTreeData(
      trackerAvl.digest,
      AvlTreeFlags.AllOperationsAllowed,
      trackerAvl.keyLength,
      trackerAvl.valueLengthOpt)
    val wrongPolicy = copyBox(tracker)(
      additionalRegisters = tracker.additionalRegisters.toMap.updated(
        ErgoBox.R5,
        AvlTreeConstant(permissive)))
    assertRejectedWithTracker(
      "permissive tracker AVL policy", base, boxes, wrongPolicy, Set(1))
  }

  test("burn leaf, authenticated root, Merkle path, and count reject") {
    val base = transaction
    val boxes = inputBoxes
    val data = dataBoxes

    val wrongLeaf = mutateExtension(base, 1, 2, 0)
    assertRejected(
      "burn leaf version",
      wrongLeaf,
      boxes,
      data,
      currentHeight,
      Set(1))

    val rootVariant = trackerVariant(
      value => value.updated(42, (value(42) ^ 1).toByte))
    val wrongRoot = withTrackerVariant(base, rootVariant)
    assertRejected(
      "authenticated bridge-event root",
      wrongRoot,
      boxes,
      IndexedSeq(rootVariant._1),
      currentHeight,
      Set(1))

    val bundle = extensionBytes(base, 1, 3)
    val burnProofStart = 90
    require(bundle.length > burnProofStart + 1, "fixture burn proof missing")
    val wrongPath = mutateExtension(base, 1, 3, burnProofStart + 1)
    assertRejected(
      "burn Merkle path",
      wrongPath,
      boxes,
      data,
      currentHeight,
      Set(1))

    val countVariant = trackerVariant(value => {
      val changed = value.clone()
      putUnsignedInt(changed, 174, 2)
      changed
    })
    val wrongCount = withTrackerVariant(base, countVariant)
    assertRejected(
      "tracker burn count",
      wrongCount,
      boxes,
      IndexedSeq(countVariant._1),
      currentHeight,
      Set(1))
  }

  test("payout recipient and amount reject independently") {
    val base = transaction
    val boxes = inputBoxes
    val recipient = copyCandidate(base.outputCandidates(2))(ergoTree = falseTree)
    assertRejectedWithOutputs(
      "payout recipient",
      base,
      boxes,
      base.outputCandidates.updated(2, recipient),
      Set(1))

    val payout = base.outputCandidates(2)
    val amount = copyCandidate(payout)(value = payout.value - 1L)
    assertRejectedWithOutputs(
      "payout amount",
      base,
      boxes,
      base.outputCandidates.updated(2, amount),
      Set(0, 1))
  }

  test("reserve NFT, proposition, profile, value, and liability reject") {
    val base = transaction
    val boxes = inputBoxes
    val reserve = boxes(0)
    val reserveOut = base.outputCandidates(0)
    val wrongNftToken = token("7e" * 32, 1L)
    val wrongNft = copyBox(reserve)(
      additionalTokens = Colls.fromArray(Array(wrongNftToken)))
    val wrongNftOut = copyCandidate(reserveOut)(
      additionalTokens = Colls.fromArray(Array(wrongNftToken)))
    assertRejectedWithBoxAndOutputs(
      "reserve NFT",
      base,
      boxes,
      0,
      wrongNft,
      base.outputCandidates.updated(0, wrongNftOut),
      Set(0, 1))

    val wrongTree = copyBox(reserve)(ergoTree = falseTree)
    val wrongTreeOut = copyCandidate(reserveOut)(ergoTree = falseTree)
    assertRejectedWithBoxAndOutputs(
      "reserve proposition",
      base,
      boxes,
      0,
      wrongTree,
      base.outputCandidates.updated(0, wrongTreeOut),
      Set(0))

    val wrongProfileValue =
      flippedBytes(reserve.additionalRegisters(ErgoBox.R4), 0)
    val wrongProfile = copyBox(reserve)(
      additionalRegisters = reserve.additionalRegisters.toMap.updated(
        ErgoBox.R4, wrongProfileValue))
    val wrongProfileOut = copyCandidate(reserveOut)(
      additionalRegisters = reserveOut.additionalRegisters.toMap.updated(
        ErgoBox.R4, wrongProfileValue))
    assertRejectedWithBoxAndOutputs(
      "reserve profile",
      base,
      boxes,
      0,
      wrongProfile,
      base.outputCandidates.updated(0, wrongProfileOut),
      Set(0, 1))

    val wrongValue = copyCandidate(reserveOut)(value = reserveOut.value + 1L)
    assertRejectedWithOutputs(
      "reserve value",
      base,
      boxes,
      base.outputCandidates.updated(0, wrongValue),
      Set(0, 1))

    val liability = reserveOut.additionalRegisters(ErgoBox.R6)
      .value.asInstanceOf[Long]
    val wrongLiability = copyCandidate(reserveOut)(
      additionalRegisters = reserveOut.additionalRegisters.toMap.updated(
        ErgoBox.R6,
        LongConstant(liability + 1L)))
    assertRejectedWithOutputs(
      "reserve liability",
      base,
      boxes,
      base.outputCandidates.updated(0, wrongLiability),
      Set(0, 1))
  }

  test("DUP NFT, proposition, profile, replay, proofs, and successor reject") {
    val base = transaction
    val boxes = inputBoxes
    val dup = boxes(1)
    val dupOut = base.outputCandidates(1)
    val wrongNftToken = token("7d" * 32, 1L)
    val wrongNft = copyBox(dup)(
      additionalTokens = Colls.fromArray(Array(wrongNftToken)))
    val wrongNftOut = copyCandidate(dupOut)(
      additionalTokens = Colls.fromArray(Array(wrongNftToken)))
    assertRejectedWithBoxAndOutputs(
      "DUP NFT",
      base,
      boxes,
      1,
      wrongNft,
      base.outputCandidates.updated(1, wrongNftOut),
      Set(0, 1))

    val wrongTree = copyBox(dup)(ergoTree = falseTree)
    val wrongTreeOut = copyCandidate(dupOut)(ergoTree = falseTree)
    assertRejectedWithBoxAndOutputs(
      "DUP proposition",
      base,
      boxes,
      1,
      wrongTree,
      base.outputCandidates.updated(1, wrongTreeOut),
      Set(0, 1))

    val wrongProfileValue =
      flippedBytes(dup.additionalRegisters(ErgoBox.R4), 0)
    val wrongProfile = copyBox(dup)(
      additionalRegisters = dup.additionalRegisters.toMap.updated(
        ErgoBox.R4, wrongProfileValue))
    val wrongProfileOut = copyCandidate(dupOut)(
      additionalRegisters = dupOut.additionalRegisters.toMap.updated(
        ErgoBox.R4, wrongProfileValue))
    assertRejectedWithBoxAndOutputs(
      "DUP profile",
      base,
      boxes,
      1,
      wrongProfile,
      base.outputCandidates.updated(1, wrongProfileOut),
      Set(0, 1))

    val replay = copyBox(dup)(
      additionalRegisters = dup.additionalRegisters.toMap.updated(
        ErgoBox.R5, dupOut.additionalRegisters(ErgoBox.R5)))
    assertRejectedWithBox(
      "already-spent burn root", base, boxes, 1, replay, Set(1))

    val proofLayout = bundleLayout(extensionBytes(base, 1, 3))
    val wrongLookup =
      mutateExtension(base, 1, 3, proofLayout.dupLookupStart)
    assertRejected(
      "DUP lookup proof",
      wrongLookup,
      boxes,
      dataBoxes,
      currentHeight,
      Set(1))

    val wrongInsert =
      mutateExtension(base, 1, 3, proofLayout.dupInsertStart)
    assertRejected(
      "DUP insert proof",
      wrongInsert,
      boxes,
      dataBoxes,
      currentHeight,
      Set(1))

    val successorDigest = avlData(
      dupOut.additionalRegisters(ErgoBox.R5).value)
    val wrongDigest = successorDigest.digest.toArray.clone()
    wrongDigest(0) = (wrongDigest(0) ^ 1).toByte
    val wrongSuccessorTree = new AvlTreeData(
      Colls.fromArray(wrongDigest),
      successorDigest.treeFlags,
      successorDigest.keyLength,
      successorDigest.valueLengthOpt)
    val wrongSuccessor = copyCandidate(dupOut)(
      additionalRegisters = dupOut.additionalRegisters.toMap.updated(
        ErgoBox.R5,
        AvlTreeConstant(wrongSuccessorTree)))
    assertRejectedWithOutputs(
      "DUP successor digest",
      base,
      boxes,
      base.outputCandidates.updated(1, wrongSuccessor),
      Set(1))
  }

  test("fee source and fee output faults reject") {
    val base = transaction
    val boxes = inputBoxes
    val fee = boxes(2)
    val tokenizedFee = copyBox(fee)(
      additionalTokens = Colls.fromArray(Array(token("7c" * 32, 1L))))
    assertRejectedWithBox(
      "tokenized fee source", base, boxes, 2, tokenizedFee, Set(0))

    val feeOut = base.outputCandidates(3)
    val wrongFeeValue = copyCandidate(feeOut)(value = feeOut.value + 1L)
    assertRejectedWithOutputs(
      "fee output value",
      base,
      boxes,
      base.outputCandidates.updated(3, wrongFeeValue),
      Set(0))

    val wrongFeeTree = copyCandidate(feeOut)(ergoTree = falseTree)
    assertRejectedWithOutputs(
      "fee output proposition",
      base,
      boxes,
      base.outputCandidates.updated(3, wrongFeeTree),
      Set(0))
  }

  test("anchor depth is enforced by the full DUP predicate") {
    val base = transaction
    val shallow = trackerVariant(value => {
      val changed = value.clone()
      putUnsignedInt(changed, 138, currentHeight - 9)
      changed
    })
    val changed = withTrackerVariant(base, shallow)
    val results = verifyAll(
      changed,
      inputBoxes,
      IndexedSeq(shallow._1),
      currentHeight)
    results(0) shouldBe Right(true)
    results(1) should not be Right(true)

    val future = trackerVariant(value => {
      val changed = value.clone()
      putUnsignedInt(changed, 138, currentHeight + 1)
      changed
    })
    assertRejected(
      "future anchor",
      withTrackerVariant(base, future),
      inputBoxes,
      IndexedSeq(future._1),
      currentHeight,
      Set(1))
  }

  test("DUP ContextExtension faults reject and producer alone excludes inert extras") {
    val base = transaction
    val boxes = inputBoxes
    val data = dataBoxes

    Vector(0, 1, 2, 3).foreach { variableId =>
      val extension = base.inputs(1).extension
      val missing = withExtension(
        base,
        1,
        ContextExtension(extension.values - variableId.toByte))
      assertRejected(
        s"DUP input missing Var($variableId)",
        missing,
        boxes,
        data,
        currentHeight,
        Set(1),
        enforceExtensionShape = false)
    }

    val wrongType = withExtension(
      base,
      1,
      ContextExtension(
        base.inputs(1).extension.values.toMap.updated(
          0.toByte,
          LongConstant(1L))))
    assertRejected(
      "wrong ContextExtension type",
      wrongType,
      boxes,
      data,
      currentHeight,
      Set(1),
      enforceExtensionShape = false)

    val extra = withExtension(
      base,
      1,
      ContextExtension(
        base.inputs(1).extension.values.toMap.updated(
          4.toByte,
          ByteArrayConstant(Array(1.toByte)))))
    withClue("DUP input extra Var(4) is outside predicate semantics: ") {
      verifyAll(extra, boxes, data, currentHeight) shouldBe
        Vector(Right(true), Right(true))
    }
    an[IllegalArgumentException] should be thrownBy
      assertExactExtensionShape(extra)

    Vector(0, 2).foreach { inputIndex =>
      val duplicated = withExtension(
        base,
        inputIndex,
        base.inputs(1).extension)
      withClue(
        s"input $inputIndex duplicate proof variables are outside predicate semantics: ") {
        verifyAll(duplicated, boxes, data, currentHeight) shouldBe
          Vector(Right(true), Right(true))
      }
      an[IllegalArgumentException] should be thrownBy
        assertExactExtensionShape(duplicated)
    }

    val relocated = withExtension(
      withExtension(base, 0, base.inputs(1).extension),
      1,
      ContextExtension.empty)
    val relocatedResults = verifyAll(relocated, boxes, data, currentHeight)
    relocatedResults(0) shouldBe Right(true)
    relocatedResults(1) should not be Right(true)
    an[IllegalArgumentException] should be thrownBy
      assertExactExtensionShape(relocated)
  }

  private def trackerVariant(
      mutate: Array[Byte] => Array[Byte]): (ErgoBox, Array[Byte]) = {
    val key = hex(requiredString(bindings.downField("trackerKeyHex"), "tracker key"))
    val original = hex(requiredString(
      bindings.downField("trackerValueHex"),
      "tracker value"))
    val value = mutate(original.clone())
    require(
      key.length == 32 && value.length == 370,
      "tracker variant must preserve 32/370 shape")
    val prover =
      new BatchAVLProver[Digest32, Blake2b256.type](
        keyLength = 32,
        valueLengthOpt = Some(370))
    require(
      prover.performOneOperation(
        Insert(
          key.clone().asInstanceOf[ADKey],
          value.clone().asInstanceOf[ADValue])).isSuccess,
      "tracker variant insertion must succeed")
    val _ = prover.generateProof()
    val digest = prover.digest.clone()
    require(
      prover.performOneOperation(
        Lookup(key.clone().asInstanceOf[ADKey])).isSuccess,
      "tracker variant lookup must succeed")
    val proof = prover.generateProof().clone()
    val tracker = dataBoxes.head
    val tree = new AvlTreeData(
      Colls.fromArray(digest),
      AvlTreeFlags.InsertOnly,
      32,
      Some(370))
    val changed = copyBox(tracker)(
      additionalRegisters = tracker.additionalRegisters.toMap.updated(
        ErgoBox.R5,
        AvlTreeConstant(tree)))
    (changed, proof)
  }

  private def withTrackerVariant(
      tx: ErgoLikeTransaction,
      variant: (ErgoBox, Array[Byte])): ErgoLikeTransaction = {
    val withDupProof =
      replaceExtensionVariable(tx, 1, 1, variant._2)
    withDataBox(withDupProof, variant._1)
  }

  private def assertRejectedWithTracker(
      label: String,
      tx: ErgoLikeTransaction,
      boxes: IndexedSeq[ErgoBox],
      tracker: ErgoBox,
      expected: Set[Int]): Unit =
    assertRejected(
      label,
      withDataBox(tx, tracker),
      boxes,
      IndexedSeq(tracker),
      currentHeight,
      expected)

  private def assertRejectedWithBox(
      label: String,
      tx: ErgoLikeTransaction,
      boxes: IndexedSeq[ErgoBox],
      inputIndex: Int,
      box: ErgoBox,
      expected: Set[Int]): Unit =
    assertRejected(
      label,
      withSpendingBox(tx, inputIndex, box),
      boxes.updated(inputIndex, box),
      dataBoxes,
      currentHeight,
      expected)

  private def assertRejectedWithOutputs(
      label: String,
      tx: ErgoLikeTransaction,
      boxes: IndexedSeq[ErgoBox],
      outputs: IndexedSeq[ErgoBoxCandidate],
      expected: Set[Int]): Unit =
    assertRejected(
      label,
      copyTransaction(tx)(outputCandidates = outputs),
      boxes,
      dataBoxes,
      currentHeight,
      expected)

  private def assertRejectedWithBoxAndOutputs(
      label: String,
      tx: ErgoLikeTransaction,
      boxes: IndexedSeq[ErgoBox],
      inputIndex: Int,
      box: ErgoBox,
      outputs: IndexedSeq[ErgoBoxCandidate],
      expected: Set[Int]): Unit = {
    val changed = withSpendingBox(tx, inputIndex, box)
    assertRejected(
      label,
      copyTransaction(changed)(outputCandidates = outputs),
      boxes.updated(inputIndex, box),
      dataBoxes,
      currentHeight,
      expected)
  }

  private def assertAccepted(
      label: String,
      tx: ErgoLikeTransaction,
      boxes: IndexedSeq[ErgoBox],
      data: IndexedSeq[ErgoBox],
      height: Int): Unit = {
    val results = verifyAll(tx, boxes, data, height)
    withClue(s"$label must accept both protected inputs: ") {
      results shouldBe Vector(Right(true), Right(true))
    }
  }

  private def assertRejected(
      label: String,
      tx: ErgoLikeTransaction,
      boxes: IndexedSeq[ErgoBox],
      data: IndexedSeq[ErgoBox],
      height: Int,
      expectedRejectedInputs: Set[Int],
      enforceExtensionShape: Boolean = true): Unit = {
    val results =
      if (enforceExtensionShape) {
        try {
          assertExactExtensionShape(tx)
          verifyAll(tx, boxes, data, height)
        } catch {
          case failure: Throwable =>
            Vector(Left(failure), Left(failure))
        }
      } else verifyAll(tx, boxes, data, height)
    withClue(s"$label must reject the complete conjunction: ") {
      results should not be Vector(Right(true), Right(true))
      results.indices.foreach { index =>
        if (expectedRejectedInputs.contains(index)) {
          results(index) should not be Right(true)
        } else {
          results(index) shouldBe Right(true)
        }
      }
    }
  }

  private def verifyAll(
      tx: ErgoLikeTransaction,
      boxes: IndexedSeq[ErgoBox],
      data: IndexedSeq[ErgoBox],
      height: Int): Vector[Either[Throwable, Boolean]] =
    Vector(0, 1).map { index =>
      try {
        val freshTransaction = parseTransaction(tx.messageToSign)
        val freshBoxes = boxes.map(cloneBox)
        val freshData = data.map(cloneBox)
        require(
          freshTransaction.inputs.length == freshBoxes.length &&
            freshTransaction.inputs.zip(freshBoxes).forall {
              case (input, box) =>
                java.util.Arrays.equals(input.boxId, box.id)
            },
          "transaction input IDs do not match spending boxes")
        require(
          freshTransaction.dataInputs.length == freshData.length &&
            freshTransaction.dataInputs.zip(freshData).forall {
              case (input, box) =>
                java.util.Arrays.equals(input.boxId, box.id)
            },
          "transaction data-input IDs do not match data boxes")
        val context = ErgoLikeContextTesting(
          currentHeight = height,
          lastBlockUtxoRoot = AvlTreeData.dummy,
          minerPubkey = ErgoLikeContextTesting.dummyPubkey,
          dataBoxes = freshData,
          boxesToSpend = freshBoxes,
          spendingTransaction = freshTransaction,
          selfIndex = index,
          activatedVersion =
            VersionContext.StarkVerificationVersion.toByte)
        val result = new ErgoLikeTestInterpreter().verify(
          freshBoxes(index).ergoTree,
          context,
          ProverResult(
            Array.emptyByteArray,
            freshTransaction.inputs(index).extension),
          Message)
        result.fold(Left(_), value => Right(value._1))
      } catch {
        case failure: Throwable => Left(failure)
      }
    }

  private def assertExactExtensionShape(tx: ErgoLikeTransaction): Unit = {
    require(tx.inputs.length == 3, "fixture must contain exactly three inputs")
    require(
      tx.inputs(0).extension.values.isEmpty,
      "reserve ContextExtension must be empty")
    require(
      tx.inputs(1).extension.values.keySet ==
        Set(0.toByte, 1.toByte, 2.toByte, 3.toByte),
      "DUP ContextExtension must contain exactly Vars 0..3")
    require(
      tx.inputs(2).extension.values.isEmpty,
      "fee input ContextExtension must be empty")
  }

  private def mutateExtension(
      tx: ErgoLikeTransaction,
      inputIndex: Int,
      variableId: Int,
      byteOffset: Int): ErgoLikeTransaction = {
    val value = extensionBytes(tx, inputIndex, variableId)
    require(
      byteOffset >= 0 && byteOffset < value.length,
      "ContextExtension mutation offset is outside the value")
    value(byteOffset) = (value(byteOffset) ^ 1).toByte
    replaceExtensionVariable(tx, inputIndex, variableId, value)
  }

  private def extensionBytes(
      tx: ErgoLikeTransaction,
      inputIndex: Int,
      variableId: Int): Array[Byte] =
    tx.inputs(inputIndex).extension
      .get(variableId.toByte).get.value
      .asInstanceOf[Coll[Byte]].toArray.clone()

  private def replaceExtensionVariable(
      tx: ErgoLikeTransaction,
      inputIndex: Int,
      variableId: Int,
      value: Array[Byte]): ErgoLikeTransaction = {
    val extension = tx.inputs(inputIndex).extension
    withExtension(
      tx,
      inputIndex,
      ContextExtension(
        extension.values.toMap.updated(
          variableId.toByte,
          ByteArrayConstant(value.clone()))))
  }

  private def withExtension(
      tx: ErgoLikeTransaction,
      inputIndex: Int,
      extension: ContextExtension): ErgoLikeTransaction = {
    val input = tx.inputs(inputIndex)
    copyTransaction(tx)(
      inputs = tx.inputs.updated(
        inputIndex,
        Input(
          input.boxId,
          ProverResult(input.spendingProof.proof, extension))))
  }

  private def withSpendingBox(
      tx: ErgoLikeTransaction,
      index: Int,
      box: ErgoBox): ErgoLikeTransaction =
    copyTransaction(tx)(
      inputs = tx.inputs.updated(
        index,
        Input(box.id, tx.inputs(index).spendingProof)))

  private def withDataBox(
      tx: ErgoLikeTransaction,
      box: ErgoBox): ErgoLikeTransaction =
    copyTransaction(tx)(dataInputs = IndexedSeq(DataInput(box.id)))

  private def copyCandidate(candidate: ErgoBoxCandidate)(
      value: Long = candidate.value,
      ergoTree: ErgoTree = candidate.ergoTree,
      creationHeight: Int = candidate.creationHeight,
      additionalTokens: Coll[ErgoBox.Token] =
        candidate.additionalTokens,
      additionalRegisters: ErgoBox.AdditionalRegisters =
        candidate.additionalRegisters): ErgoBoxCandidate =
    new ErgoBoxCandidate(
      value,
      ergoTree,
      creationHeight,
      additionalTokens,
      additionalRegisters)

  private def bundleLayout(bundle: Array[Byte]): BundleLayout = {
    require(bundle.length >= 90, "proof bundle header missing")
    val nodes = unsignedLongAsInt(bundle.slice(74, 82))
    val lookupLength = unsignedLongAsInt(bundle.slice(82, 90))
    val lookupStart = 90 + nodes * 33
    val insertStart = lookupStart + lookupLength
    require(
      lookupStart >= 90 &&
        insertStart > lookupStart &&
        insertStart < bundle.length,
      "proof bundle lengths are invalid")
    BundleLayout(lookupStart, insertStart)
  }

  private final case class BundleLayout(
      dupLookupStart: Int,
      dupInsertStart: Int)

  private def putUnsignedInt(
      bytes: Array[Byte],
      offset: Int,
      value: Int): Unit = {
    require(
      value >= 0 && offset >= 0 && offset + 4 <= bytes.length,
      "unsigned Int replacement is out of bounds")
    ByteBuffer.wrap(bytes, offset, 4).putInt(value)
  }

  private def unsignedLongAsInt(bytes: Array[Byte]): Int = {
    require(
      bytes.length == 8 &&
        bytes.slice(0, 4).forall(_ == 0.toByte),
      "fixture count exceeds JVM Int")
    ByteBuffer.wrap(bytes.slice(4, 8)).getInt
  }

  private def avlData(value: Any): AvlTreeData =
    value match {
      case tree: AvlTreeData => tree
      case wrapped: CAvlTree => wrapped.treeData
      case other =>
        throw new IllegalArgumentException(
          s"expected AvlTree register, found ${other.getClass.getName}")
    }

  private def flippedBytes(
      value: EvaluatedValue[_ <: SType],
      offset: Int): EvaluatedValue[_ <: SType] = {
    val bytes = value.value.asInstanceOf[Coll[Byte]].toArray.clone()
    require(offset >= 0 && offset < bytes.length, "flip offset out of bounds")
    bytes(offset) = (bytes(offset) ^ 1).toByte
    ByteArrayConstant(bytes)
  }

  private def token(idHex: String, amount: Long): ErgoBox.Token =
    (Digest32Coll @@ Colls.fromArray(hex(idHex))) -> amount

  private def contractId(tree: ErgoTree): String =
    hex(Blake2b256(tree.bytes))

  private def parseTransaction(bytes: Array[Byte]): ErgoLikeTransaction =
    VersionContext.withVersions(
      VersionContext.StarkVerificationVersion.toByte,
      0.toByte) {
      val reader = SigmaSerializer.startReader(bytes.clone())
      val parsed = ErgoLikeTransactionSerializer.parse(reader)
      require(
        reader.remaining == 0,
        s"transaction parser left ${reader.remaining} trailing bytes")
      parsed
    }

  private def cloneBox(box: ErgoBox): ErgoBox =
    VersionContext.withVersions(
      VersionContext.StarkVerificationVersion.toByte,
      0.toByte) {
      val bytes = ErgoBox.sigmaSerializer.toBytes(box)
      val reader = SigmaSerializer.startReader(bytes)
      val parsed = ErgoBox.sigmaSerializer.parse(reader)
      require(
        reader.remaining == 0,
        s"box parser left ${reader.remaining} trailing bytes")
      parsed
    }

  private def parseBoxes(
      value: ACursor,
      label: String): IndexedSeq[ErgoBox] =
    requiredStrings(value, label).map { encoded =>
      VersionContext.withVersions(
        VersionContext.StarkVerificationVersion.toByte,
        0.toByte) {
        val reader = SigmaSerializer.startReader(hex(encoded))
        val box = ErgoBox.sigmaSerializer.parse(reader)
        require(
          reader.remaining == 0,
          s"$label parser left ${reader.remaining} trailing bytes")
        box
      }
    }

  private def requiredStrings(
      value: ACursor,
      label: String): IndexedSeq[String] =
    value.focus.getOrElse(
      throw new IllegalArgumentException(s"$label missing"))
      .asArray.getOrElse(
        throw new IllegalArgumentException(s"$label must be an array"))
      .zipWithIndex.map { case (entry, index) =>
        entry.asString.getOrElse(
          throw new IllegalArgumentException(
            s"$label entry $index must be a string"))
      }

  private def requiredString(value: ACursor, label: String): String =
    value.focus.flatMap(_.asString).getOrElse(
      throw new IllegalArgumentException(
        s"$label missing or not a string"))

  private def requiredInt(value: ACursor, label: String): Int =
    value.focus.flatMap(_.asNumber).flatMap(_.toInt).getOrElse(
      throw new IllegalArgumentException(
        s"$label missing or not an Int"))

  private def requiredBoolean(value: ACursor, label: String): Boolean =
    value.focus.flatMap(_.asBoolean).getOrElse(
      throw new IllegalArgumentException(
        s"$label missing or not a Boolean"))

  private def hex(value: String): Array[Byte] = {
    require(
      value.length % 2 == 0 && value.matches("[0-9a-f]+"),
      "expected lowercase whole-byte hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }

  private def hex(bytes: Array[Byte]): String =
    bytes.iterator.map(byte => f"${byte & 0xff}%02x").mkString

  private def sha256(bytes: Array[Byte]): String =
    hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
