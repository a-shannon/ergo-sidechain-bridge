package sigma.bridge

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}
import java.security.MessageDigest

import io.circe.ACursor
import io.circe.parser
import org.ergoplatform._
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.hash.Blake2b256
import sigma.VersionContext
import sigma.ast._
import sigma.data.{AvlTreeData, Digest32Coll, TrivialProp}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.SigmaSerializer
import sigma.{Coll, Colls}
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.{
  copyBox,
  copyTransaction
}

class BridgeValiditySettlementAcceptanceSpec
    extends AnyFunSuite with Matchers {
  private val FixtureProperty =
    "bridge.eip0045.validity.settlement.context.fixture"
  private val Schema = "e2s.bridge-validity-settlement-context.v1"
  private val ProfileId =
    "72ae135aea3c9a29b1dc170c5b425fbd8b2d54c4338ca2f831be17438e0972ee"
  private val TrackerContractId =
    "c22f8d631e99022bd4bad5ce84ee9d7da30bf51684977c8bad28d8200f8cff5b"
  private val VaultContractId =
    "cbd6fd09d69e25ffc0407da6de94a70a38ee7fc2114891094252d9e7778e3fff"
  private val DupContractId =
    "854444a9f7f44ad4ca50e7344027d8857588aff0fbb27dd422633249150ef312"
  private val SigmaStateCommit =
    "f78deadd668f801e7fae3bc884283f79c6f484fa"
  private val TrackerContextSha256 =
    "a71996f2bb66e822d5d50a94293633bdff03a831adeb0592d10e31625069e274"
  private val ContractIdentitySha256 =
    "0f76cd7d7b5e6470cc42b7875395906d40317cb08d283d4320e15039803ed90d"
  private val FrontierVectorSha256 =
    "8746f4fdf308815932c8a977be59b8b047853c03b45bafd33c502e485b7b6be0"
  private val VaultTemplateSha256 =
    "89a317e7554e7c1ec5df0d3cb4c16aca1e3ad54302d412149010c70ef7197e30"
  private val VaultSourceSha256 =
    "0f7591ddcee082d4d712cc94c673bff5992246f9959286767a76c36d6bd16576"
  private val VaultPropositionSha256 =
    "5749bf8e737579d834bf661946ebe99acb642353df0b73444efeaee01fe00731"
  private val DupTemplateSha256 =
    "e23a382656a5f652b07e327ee532fe30eb21a004d3c05d04aa7dd16490e0e2af"
  private val DupSourceSha256 =
    "79633365941304e7534981458f371a7fe236a4b983522e53c3c2314c347e1eec"
  private val DupPropositionSha256 =
    "2a2f8aafd9ed576e1bd9e36f3277f468ec015460ab348ab16eb28439105b6192"
  private val TrackerTransactionId =
    "fa6a7c217a6a8d43bc87f258fd5eb3ee017d91c403a2776a0dc251b4ea2465f5"
  private val TrackerBoxId =
    "03254c503a6c42f1a828542a6ec19760b45f4e2c7a67967c5814aaf3926de5a4"
  private val SettlementTransactionId =
    "93abf21bb0fcdc026e3c0066c4b72a68d5935aa5371fc38e0f4af745ed3ca58e"
  private val BurnId =
    "f35e408ecfd1d5b585b9d39aca25af08362f66ef0b95413e6f0526229235645e"
  private val EventRoot =
    "af06acdab6c0a84382ba80bd42c1e80d9f8494cacd8954ca1226f00522c8976e"
  private val DupExtensionDigest =
    "71376bf43ff1072c0641c152703a9a853634d94bde3aa698bf15b0e0e0800724"
  private val VaultExtensionDigest =
    "0ee3259be16697f65302f074e22fa7346b117106a7732c03ba6f30fc06b43646"
  private val FeeExtensionDigest =
    "03170a2e7597b7b7e3d84c05391d139a62b157e78786d8c082f29dcf4c111314"
  private val Message =
    Blake2b256("bridge validity settlement acceptance fixture").toArray

  private lazy val fixture = {
    val raw = System.getProperty(FixtureProperty)
    require(raw != null && raw.nonEmpty, s"missing -D$FixtureProperty")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      "validity settlement fixture must be a real file")
    parser.parse(
      new String(Files.readAllBytes(path), StandardCharsets.US_ASCII)
    ).fold(
      failure => throw new IllegalArgumentException(
        "validity settlement fixture JSON rejected: " + failure.getMessage),
      identity)
  }
  private lazy val cursor = fixture.hcursor
  private lazy val currentHeight = requiredInt(
    cursor.downField("settlementPlan").downField("currentErgoHeight"),
    "settlement current Ergo height")
  private lazy val prooflessBytes = hex(requiredString(
    cursor.downField("prooflessTransactionHex"),
    "settlement proofless transaction"))
  private def transaction = parseTransaction(prooflessBytes)
  private def inputBoxes = parseBoxes(
    cursor.downField("inputBoxSigmaHex"),
    "input boxes")
  private def dataBoxes = parseBoxes(
    cursor.downField("dataInputBoxSigmaHex"),
    "data input boxes")

  test("DUP successor, vault provenance, payout, fee, and ordering fail closed") {
    assertSettlementOutputBoundaries()
  }

  test("exact WASM transaction, boxes, extensions, and source bindings agree") {
    requiredString(cursor.downField("schema"), "fixture schema") shouldBe Schema
    requiredInt(cursor.downField("version"), "fixture version") shouldBe 1
    requiredString(cursor.downField("profileIdHex"),
      "settlement profile ID") shouldBe ProfileId

    val source = cursor.downField("sourceBindings")
    requiredString(source.downField("trackerContextSha256Hex"),
      "tracker context source SHA-256") shouldBe TrackerContextSha256
    requiredString(source.downField("contractIdentitySha256Hex"),
      "contract identity source SHA-256") shouldBe ContractIdentitySha256
    requiredString(source.downField("frontierVectorSha256Hex"),
      "Frontier vector source SHA-256") shouldBe FrontierVectorSha256
    requiredString(source.downField("trackerProoflessTransactionIdHex"),
      "tracker transaction ID") shouldBe TrackerTransactionId
    requiredString(source.downField("trackerOutputBoxIdHex"),
      "tracker output box ID") shouldBe TrackerBoxId
    requiredString(source.downField("bridgeEventRootHex"),
      "bridge event root") shouldBe EventRoot
    requiredString(source.downField("targetBurnIdHex"),
      "target burn ID") shouldBe BurnId
    requiredInt(source.downField("targetEventIndex"),
      "target event index") shouldBe 5

    val contracts = cursor.downField("contractIdentity")
    requiredString(contracts.downField("sigmaStateCommit"),
      "SigmaState commit") shouldBe SigmaStateCommit
    requiredString(contracts.downField("trackerContractIdHex"),
      "tracker contract ID") shouldBe TrackerContractId
    requiredString(contracts.downField("causalVaultContractIdHex"),
      "causal vault contract ID") shouldBe VaultContractId
    requiredString(contracts.downField("duplicatePreventionContractIdHex"),
      "DUP contract ID") shouldBe DupContractId
    requiredString(contracts.downField("causalVaultTemplateSha256Hex"),
      "causal vault template SHA-256") shouldBe VaultTemplateSha256
    requiredString(contracts.downField("causalVaultResolvedSourceSha256Hex"),
      "causal vault source SHA-256") shouldBe VaultSourceSha256
    requiredString(contracts.downField("causalVaultPropositionSha256Hex"),
      "causal vault proposition SHA-256") shouldBe VaultPropositionSha256
    requiredInt(contracts.downField("causalVaultPropositionBytes"),
      "causal vault proposition bytes") shouldBe 2558
    requiredString(
      contracts.downField("duplicatePreventionTemplateSha256Hex"),
      "DUP template SHA-256") shouldBe DupTemplateSha256
    requiredString(
      contracts.downField("duplicatePreventionResolvedSourceSha256Hex"),
      "DUP source SHA-256") shouldBe DupSourceSha256
    requiredString(
      contracts.downField("duplicatePreventionPropositionSha256Hex"),
      "DUP proposition SHA-256") shouldBe DupPropositionSha256
    requiredInt(contracts.downField("duplicatePreventionPropositionBytes"),
      "DUP proposition bytes") shouldBe 672
    hex(Blake2b256(inputBoxes(0).ergoTree.bytes)) shouldBe DupContractId
    hex(Blake2b256(inputBoxes(1).ergoTree.bytes)) shouldBe VaultContractId
    hex(Blake2b256(dataBoxes.head.ergoTree.bytes)) shouldBe TrackerContractId
    sha256(inputBoxes(0).ergoTree.bytes) shouldBe DupPropositionSha256
    sha256(inputBoxes(1).ergoTree.bytes) shouldBe VaultPropositionSha256

    prooflessBytes.length shouldBe requiredInt(
      cursor.downField("prooflessTransactionBytes"),
      "settlement proofless byte count")
    prooflessBytes.length shouldBe 4929
    requiredString(cursor.downField("unsignedTransactionIdHex"),
      "unsigned transaction ID") shouldBe SettlementTransactionId
    requiredString(cursor.downField("prooflessTransactionIdHex"),
      "proofless transaction ID") shouldBe SettlementTransactionId
    hex(Blake2b256(prooflessBytes)) shouldBe SettlementTransactionId
    ErgoLikeTransactionSerializer.toBytes(transaction) should
      contain theSameElementsInOrderAs prooflessBytes
    transaction.id shouldBe SettlementTransactionId
    transaction.messageToSign should
      contain theSameElementsInOrderAs prooflessBytes
    transaction.inputs.length shouldBe 3
    transaction.dataInputs.length shouldBe 1
    transaction.outputCandidates.length shouldBe 4
    transaction.inputs.zip(inputBoxes).foreach { case (input, box) =>
      input.boxId shouldBe box.id
      input.spendingProof.proof shouldBe empty
    }
    transaction.dataInputs.head.boxId shouldBe dataBoxes.head.id

    val extensionCursors = requiredArray(
      cursor.downField("contextExtensions"),
      "context extensions")
    val expected = Vector(
      (Set(0.toByte, 1.toByte, 2.toByte), DupExtensionDigest),
      (Set(0.toByte, 1.toByte, 2.toByte, 3.toByte), VaultExtensionDigest),
      (Set.empty[Byte], FeeExtensionDigest))
    transaction.inputs.zipWithIndex.foreach { case (input, index) =>
      val bytes = ContextExtension.serializer.toBytes(input.extension)
      input.extension.values.keySet shouldBe expected(index)._1
      hex(Blake2b256(bytes)) shouldBe expected(index)._2
      hex(bytes) shouldBe requiredString(
        extensionCursors(index).downField("serializedHex"),
        s"input $index ContextExtension")
      requiredString(
        extensionCursors(index).downField("serializedBlake2b256Hex"),
        s"input $index ContextExtension digest") shouldBe expected(index)._2
    }
  }

  test("partial and terminal settlement branches accept both protected inputs") {
    assertAccepted("partial causal-vault settlement",
      transaction, inputBoxes, dataBoxes, currentHeight)

    val terminalVaultValue =
      transaction.outputCandidates(1).value
    val terminalVault = copyBox(inputBoxes(1))(value = terminalVaultValue)
    val terminalInputs =
      IndexedSeq(inputBoxes(0), terminalVault, inputBoxes(2))
    val terminalTransaction = copyTransaction(transaction)(
      inputs = IndexedSeq(
        transaction.inputs(0),
        Input(
          terminalVault.id,
          transaction.inputs(1).spendingProof),
        transaction.inputs(2)),
      outputCandidates = IndexedSeq(
        transaction.outputCandidates(0),
        transaction.outputCandidates(1),
        transaction.outputCandidates.last))
    assertAccepted("terminal causal-vault settlement",
      terminalTransaction, terminalInputs, dataBoxes, currentHeight)
  }

  test("tracker identity, trust root, anchor age, and mutable stamp are isolated") {
    val tracker = dataBoxes.head
    val wrongTree = copyBox(tracker)(
      ergoTree = ErgoTree.fromProposition(TrivialProp.TrueProp))
    assertRejected("tracker proposition substitution",
      withDataBox(transaction, wrongTree), inputBoxes,
      IndexedSeq(wrongTree), currentHeight, Set(0, 1))

    val wrongId = token("92" * 32, 1L)
    val extra = token("93" * 32, 1L)
    Vector(
      Colls.fromArray(Array(wrongId)),
      Colls.fromArray(Array(tracker.additionalTokens(0)._1 -> 2L)),
      Colls.fromArray(Array(tracker.additionalTokens(0), extra))
    ).zipWithIndex.foreach { case (tokens, index) =>
      val changed = copyBox(tracker)(additionalTokens = tokens)
      assertRejected(s"tracker singleton mutation $index",
        withDataBox(transaction, changed), inputBoxes,
        IndexedSeq(changed), currentHeight, Set(0, 1))
    }

    Vector(ErgoBox.R6, ErgoBox.R9).foreach { registerId =>
      val changed = copyBox(tracker)(
        additionalRegisters = tracker.additionalRegisters.toMap.updated(
          registerId,
          flippedBytes(tracker.additionalRegisters(registerId), 0)))
      assertRejected(s"tracker R${registerId.number} mutation",
        withDataBox(transaction, changed), inputBoxes,
        IndexedSeq(changed), currentHeight, Set(0, 1))
    }
    val wrongTreeDigest = copyBox(tracker)(
      additionalRegisters = tracker.additionalRegisters.toMap.updated(
        ErgoBox.R5, inputBoxes(0).additionalRegisters(ErgoBox.R5)))
    assertRejected("tracker authenticated digest substitution",
      withDataBox(transaction, wrongTreeDigest), inputBoxes,
      IndexedSeq(wrongTreeDigest), currentHeight, Set(1))

    assertAccepted("baseline replay before mutable tracker stamp",
      transaction, inputBoxes, dataBoxes, currentHeight)
    val mutableStamp =
      tracker.additionalRegisters(ErgoBox.R8).value.asInstanceOf[Int]
    val changedStamp = copyBox(tracker)(
      additionalRegisters = tracker.additionalRegisters.toMap.updated(
        ErgoBox.R8, IntConstant(mutableStamp - 1)))
    assertAccepted("mutable tracker R8 is not finality evidence",
      withDataBox(transaction, changedStamp), inputBoxes,
      IndexedSeq(changedStamp), currentHeight)

    assertRejected("anchor is one confirmation too young",
      transaction, inputBoxes, dataBoxes, currentHeight - 1, Set(1))
  }

  test("burn inclusion, payout binding, and DUP proofs reject independently") {
    Vector(
      (0, 0, "tracker key"),
      (1, 0, "tracker get proof"),
      (2, 0, "burn leaf version"),
      (2, 1, "burn leaf sidechain"),
      (2, 33, "burn leaf execution block"),
      (2, 65, "burn leaf burn ID"),
      (2, 97, "burn leaf transaction"),
      (2, 129, "burn leaf event index"),
      (2, 133, "burn leaf recipient"),
      (2, 165, "burn leaf amount"),
      (2, 173, "burn leaf asset"),
      (3, 0, "proof bundle sidechain height"),
      (3, 25, "proof bundle Merkle path"),
      (3, -1, "proof bundle insert tail")
    ).foreach { case (variableId, offset, label) =>
      val changed = mutateExtension(
        transaction, 1, variableId, offset)
      withClue(s"$label mutation must survive transaction serialization: ") {
        ContextExtension.serializer.toBytes(
          parseTransaction(changed.messageToSign).inputs(1).extension) should
          contain theSameElementsInOrderAs ContextExtension.serializer.toBytes(
            changed.inputs(1).extension)
      }
      assertRejected(label, changed, inputBoxes, dataBoxes,
        currentHeight, Set(1))
    }

    Vector(
      (0, 0, "DUP non-membership proof"),
      (1, 0, "DUP burn ID"),
      (2, -1, "DUP insert proof")
    ).foreach { case (variableId, offset, label) =>
      val changed = mutateExtension(
        transaction, 0, variableId, offset)
      assertRejected(label, changed, inputBoxes, dataBoxes,
        currentHeight, Set(0))
    }
  }

  test("DUP input profile and prior-spend state fail closed") {
    val dup = inputBoxes(0)
    val dupOut = transaction.outputCandidates(0)

    val wrongDupProfile = copyBox(dup)(
      additionalRegisters = dup.additionalRegisters.toMap.updated(
        ErgoBox.R6,
        flippedBytes(dup.additionalRegisters(ErgoBox.R6), 0)))
    assertRejected("DUP input profile",
      withSpendingBox(transaction, 0, wrongDupProfile),
      inputBoxes.updated(0, wrongDupProfile), dataBoxes,
      currentHeight, Set(0, 1))
    val priorSpentTree = copyBox(dup)(
      additionalRegisters = dup.additionalRegisters.toMap.updated(
        ErgoBox.R5, dupOut.additionalRegisters(ErgoBox.R5)))
    assertRejected("already-spent DUP tree",
      withSpendingBox(transaction, 0, priorSpentTree),
      inputBoxes.updated(0, priorSpentTree), dataBoxes,
      currentHeight, Set(0, 1))
  }

  private def assertSettlementOutputBoundaries(): Unit = {
    (0 until 6).foreach { index =>
      val baselineTransaction = transaction
      val baselineOutputs = baselineTransaction.outputCandidates
      val baselineDup = baselineOutputs(0)
      val baselineDupInput = inputBoxes(0)
      val changed = index match {
        case 0 => copyCandidate(baselineDup)(
          value = baselineDup.value + 1L)
        case 1 => copyCandidate(baselineDup)(
          ergoTree = ErgoTree.fromProposition(TrivialProp.TrueProp))
        case 2 => copyCandidate(baselineDup)(
          additionalTokens = Colls.fromArray(Array(
            baselineDup.additionalTokens(0)._1 -> 2L)))
        case 3 => copyCandidate(baselineDup)(
          additionalRegisters = baselineDup.additionalRegisters.toMap.updated(
            ErgoBox.R4,
            LongConstant(
              baselineDup.additionalRegisters(ErgoBox.R4)
                .value.asInstanceOf[Long] + 1L)))
        case 4 => copyCandidate(baselineDup)(
          additionalRegisters = baselineDup.additionalRegisters.toMap.updated(
            ErgoBox.R5,
            baselineDupInput.additionalRegisters(ErgoBox.R5)))
        case 5 => copyCandidate(baselineDup)(
          additionalRegisters = baselineDup.additionalRegisters.toMap.updated(
            ErgoBox.R6,
            flippedBytes(
              baselineDup.additionalRegisters(ErgoBox.R6),
              0)))
      }
      val changedTransaction = withOutputs(
        baselineTransaction,
        baselineOutputs.updated(0, changed))
      assertRejected(s"DUP successor mutation $index",
        changedTransaction,
        inputBoxes, dataBoxes, currentHeight,
        if (index == 0 || index == 1 || index == 3) Set(0)
        else Set(0, 1))
    }
    val outputs = transaction.outputCandidates
    val delayedStateOutputs = outputs
      .updated(0, copyCandidate(outputs(0))(
        creationHeight = currentHeight - 1))
      .updated(2, copyCandidate(outputs(2))(
        creationHeight = currentHeight - 1))
    assertAccepted("mempool-delayed state successor heights",
      withOutputs(transaction, delayedStateOutputs),
      inputBoxes, dataBoxes, currentHeight)
    val belowInputDup = copyCandidate(outputs(0))(
      creationHeight = currentHeight - 2)
    assertRejected("DUP successor predates its input",
      withOutputs(transaction, outputs.updated(0, belowInputDup)),
      inputBoxes, dataBoxes, currentHeight, Set(0))
    val oldDupInput = copyBox(inputBoxes(0))(
      creationHeight = currentHeight - 102)
    val tooOldDup = copyCandidate(outputs(0))(
      creationHeight = currentHeight - 101)
    assertRejected("DUP successor exceeds the height-lag bound",
      withOutputs(
        withSpendingBox(transaction, 0, oldDupInput),
        outputs.updated(0, tooOldDup)),
      inputBoxes.updated(0, oldDupInput), dataBoxes, currentHeight, Set(0))
    val futureDup = copyCandidate(outputs(0))(
      creationHeight = currentHeight + 1)
    assertRejected("future DUP successor creation height",
      withOutputs(transaction, outputs.updated(0, futureDup)),
      inputBoxes, dataBoxes, currentHeight, Set(0))

    val dup = inputBoxes(0)
    val vault = inputBoxes(1)
    val payout = outputs(1)
    val vaultOut = outputs(2)
    val fee = outputs(3)
    val belowInputVault = copyCandidate(vaultOut)(
      creationHeight = currentHeight - 2)
    assertRejected("causal-vault successor predates its input",
      withOutputs(transaction, outputs.updated(2, belowInputVault)),
      inputBoxes, dataBoxes, currentHeight, Set(1))
    val oldVaultInput = copyBox(vault)(
      creationHeight = currentHeight - 102)
    val tooOldVault = copyCandidate(vaultOut)(
      creationHeight = currentHeight - 101)
    assertRejected("causal-vault successor exceeds the height-lag bound",
      withOutputs(
        withSpendingBox(transaction, 1, oldVaultInput),
        outputs.updated(2, tooOldVault)),
      inputBoxes.updated(1, oldVaultInput), dataBoxes, currentHeight, Set(1))
    val futureVault = copyCandidate(vaultOut)(
      creationHeight = currentHeight + 1)
    assertRejected("future causal-vault successor creation height",
      withOutputs(transaction, outputs.updated(2, futureVault)),
      inputBoxes, dataBoxes, currentHeight, Set(1))
    val sourceIntent = vault.additionalRegisters(ErgoBox.R4)
      .value.asInstanceOf[Coll[Byte]].toArray
    Vector(
      1 -> "source network",
      33 -> "source sidechain",
      105 -> "settlement profile",
      137 -> "admission profile",
      169 -> "source asset",
      201 -> "source amount"
    ).foreach { case (offset, label) =>
      val changedIntent = sourceIntent.clone()
      changedIntent(offset) = (changedIntent(offset) ^ 1).toByte
      val changed = copyBox(vault)(
        additionalRegisters = vault.additionalRegisters.toMap.updated(
          ErgoBox.R4, ByteArrayConstant(changedIntent)))
      assertRejected(label,
        withSpendingBox(transaction, 1, changed),
        inputBoxes.updated(1, changed), dataBoxes,
        currentHeight, Set(1))
    }
    Vector(
      65 -> "zero bridge address",
      85 -> "zero token address",
      209 -> "zero source recipient"
    ).foreach { case (offset, label) =>
      val changedIntent = sourceIntent.clone()
      java.util.Arrays.fill(changedIntent, offset, offset + 20, 0.toByte)
      val changed = copyBox(vault)(
        additionalRegisters = vault.additionalRegisters.toMap.updated(
          ErgoBox.R4, ByteArrayConstant(changedIntent)))
      assertRejected(label,
        withSpendingBox(transaction, 1, changed),
        inputBoxes.updated(1, changed), dataBoxes,
        currentHeight, Set(1))
    }
    val zeroSourceId = copyBox(vault)(
      additionalRegisters = vault.additionalRegisters.toMap.updated(
        ErgoBox.R5, ByteArrayConstant(Array.fill(32)(0.toByte))))
    assertRejected("zero consumed source-box ID",
      withSpendingBox(transaction, 1, zeroSourceId),
      inputBoxes.updated(1, zeroSourceId), dataBoxes,
      currentHeight, Set(1))
    val tokenizedVault = copyBox(vault)(
      additionalTokens = Colls.fromArray(Array(token("94" * 32, 1L))))
    assertRejected("tokenized causal vault",
      withSpendingBox(transaction, 1, tokenizedVault),
      inputBoxes.updated(1, tokenizedVault), dataBoxes,
      currentHeight, Set(1))

    val feeInput = inputBoxes(2)
    val wrongFeeValue = copyBox(feeInput)(value = feeInput.value + 1L)
    assertRejected("fee-funding input value",
      withSpendingBox(transaction, 2, wrongFeeValue),
      inputBoxes.updated(2, wrongFeeValue), dataBoxes,
      currentHeight, Set(1))
    val tokenizedFeeInput = copyBox(feeInput)(
      additionalTokens = Colls.fromArray(Array(token("96" * 32, 1L))))
    assertRejected("tokenized fee-funding input",
      withSpendingBox(transaction, 2, tokenizedFeeInput),
      inputBoxes.updated(2, tokenizedFeeInput), dataBoxes,
      currentHeight, Set(1))

    val outputMutations = Vector(
      copyCandidate(payout)(value = payout.value + 1L),
      copyCandidate(payout)(
        ergoTree = ErgoTree.fromProposition(TrivialProp.TrueProp)),
      copyCandidate(payout)(
        additionalTokens = Colls.fromArray(Array(token("95" * 32, 1L)))),
      copyCandidate(vaultOut)(value = vaultOut.value + 1L),
      copyCandidate(vaultOut)(
        ergoTree = ErgoTree.fromProposition(TrivialProp.TrueProp)),
      copyCandidate(vaultOut)(
        additionalRegisters = vaultOut.additionalRegisters.toMap.updated(
          ErgoBox.R4, flippedBytes(vaultOut.additionalRegisters(ErgoBox.R4), 0))),
      copyCandidate(vaultOut)(
        additionalRegisters = vaultOut.additionalRegisters.toMap.updated(
          ErgoBox.R5, ByteArrayConstant(Array.fill(32)(0.toByte)))),
      copyCandidate(fee)(value = 999999L),
      copyCandidate(fee)(
        ergoTree = ErgoTree.fromProposition(TrivialProp.TrueProp))
    )
    outputMutations.zipWithIndex.foreach { case (changed, index) =>
      val outputIndex =
        if (index <= 2) 1 else if (index <= 6) 2 else 3
      assertRejected(s"value-release output mutation $index",
        withOutputs(transaction, outputs.updated(outputIndex, changed)),
        inputBoxes, dataBoxes, currentHeight, Set(1))
    }

    assertRejected("output ordering",
      withOutputs(transaction, IndexedSeq(
        outputs(1), outputs(0), outputs(2), outputs(3))),
      inputBoxes, dataBoxes, currentHeight, Set(0, 1))
    assertRejected("missing tracker data input",
      copyTransaction(transaction)(dataInputs = IndexedSeq.empty),
      inputBoxes, IndexedSeq.empty, currentHeight, Set(0, 1))
    val extraTracker = copyBox(dataBoxes.head)(index = 1.toShort)
    assertRejected("extra tracker data input",
      copyTransaction(transaction)(
        dataInputs = IndexedSeq(
          DataInput(dataBoxes.head.id),
          DataInput(extraTracker.id))),
      inputBoxes, IndexedSeq(dataBoxes.head, extraTracker),
      currentHeight, Set(0, 1))

    val wrongVaultTree = copyBox(vault)(
      ergoTree = ErgoTree.fromProposition(TrivialProp.TrueProp))
    assertRejected("DUP-to-vault proposition binding",
      withSpendingBox(transaction, 1, wrongVaultTree),
      inputBoxes.updated(1, wrongVaultTree), dataBoxes,
      currentHeight, Set(0))

    val swappedInputs = IndexedSeq(vault, dup, inputBoxes(2))
    val swappedTransaction = copyTransaction(transaction)(
      inputs = IndexedSeq(
        Input(vault.id, transaction.inputs(1).spendingProof),
        Input(dup.id, transaction.inputs(0).spendingProof),
        transaction.inputs(2)))
    assertRejected("spending input ordering",
      swappedTransaction, swappedInputs, dataBoxes,
      currentHeight, Set(0, 1))
  }

  test("fixture boundaries remain preactivation and non-authorizing") {
    val boundaries = cursor.downField("boundaries")
    requiredBoolean(
      boundaries.downField("exactWp06aaTrackerSuccessorConsumed"),
      "exact tracker successor boundary") shouldBe true
    Vector(
      "fullInputConjunctionReducedByFixture",
      "singletonSetupLineageEstablished",
      "bridgeEventRootFinalizedStateMembershipEstablished",
      "feeFundingAuthorizationEstablished",
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
      expectedRejectedInputs: Set[Int]): Unit = {
    val results = verifyAll(tx, boxes, data, height)
    withClue(s"$label must reject the complete conjunction: ") {
      results should not be Vector(Right(true), Right(true))
      expectedRejectedInputs.foreach { index =>
        results(index) should not be Right(true)
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
          s"fresh input IDs " +
            s"${freshTransaction.inputs.map(input => hex(input.boxId))} " +
            s"do not match fresh boxes ${freshBoxes.map(box => hex(box.id))}")
        require(
          freshTransaction.dataInputs.length == freshData.length &&
            freshTransaction.dataInputs.zip(freshData).forall {
              case (input, box) =>
                java.util.Arrays.equals(input.boxId, box.id)
            },
          s"fresh data input IDs " +
            s"${freshTransaction.dataInputs.map(input => hex(input.boxId))} " +
            s"do not match fresh boxes ${freshData.map(box => hex(box.id))}")
        val extension = freshTransaction.inputs(index).extension
        val base = ErgoLikeContextTesting(
          currentHeight = height,
          lastBlockUtxoRoot = AvlTreeData.dummy,
          minerPubkey = ErgoLikeContextTesting.dummyPubkey,
          dataBoxes = freshData,
          boxesToSpend = freshBoxes,
          spendingTransaction = freshTransaction,
          selfIndex = index,
          activatedVersion = VersionContext.StarkVerificationVersion.toByte)
        // Materialize lazy outputs before AVL evaluation mutates test-only state.
        val realizedOutputValues =
          freshTransaction.outputs.map(_.value)
        require(
          realizedOutputValues ==
            freshTransaction.outputCandidates.map(_.value),
          "transaction output materialization changed output values")
        val result = new ErgoLikeTestInterpreter().verify(
          freshBoxes(index).ergoTree,
          base,
          ProverResult(Array.emptyByteArray, extension),
          Message)
        result.fold(Left(_), value => Right(value._1))
      } catch {
        case failure: Throwable => Left(failure)
      }
    }

  private def mutateExtension(
      tx: ErgoLikeTransaction,
      inputIndex: Int,
      variableId: Int,
      byteOffset: Int): ErgoLikeTransaction = {
    val current = tx.inputs(inputIndex)
    val extension = current.extension
    val value = extension.get(variableId.toByte).get.value
      .asInstanceOf[Coll[Byte]].toArray.clone()
    val index = if (byteOffset < 0) value.length - 1 else byteOffset
    require(index >= 0 && index < value.length,
      s"mutation offset $byteOffset is outside variable $variableId")
    value(index) = (value(index) ^ 1).toByte
    val changed = ContextExtension(
      extension.values.toMap.updated(
        variableId.toByte,
        ByteArrayConstant(value)))
    val changedInput = Input(
      current.boxId,
      ProverResult(current.spendingProof.proof, changed))
    copyTransaction(tx)(
      inputs = tx.inputs.updated(inputIndex, changedInput))
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

  private def withOutputs(
      tx: ErgoLikeTransaction,
      outputs: IndexedSeq[ErgoBoxCandidate]): ErgoLikeTransaction =
    copyTransaction(tx)(outputCandidates = outputs)

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

  private def flippedBytes(
      value: EvaluatedValue[_ <: SType],
      offset: Int): EvaluatedValue[_ <: SType] = {
    val bytes = value.value.asInstanceOf[Coll[Byte]].toArray.clone()
    bytes(offset) = (bytes(offset) ^ 1).toByte
    ByteArrayConstant(bytes)
  }

  private def token(idHex: String, amount: Long): ErgoBox.Token =
    (Digest32Coll @@ Colls.fromArray(hex(idHex))) -> amount

  private def parseTransaction(bytes: Array[Byte]): ErgoLikeTransaction =
    VersionContext.withVersions(
      VersionContext.StarkVerificationVersion.toByte,
      0.toByte) {
      val reader = SigmaSerializer.startReader(bytes.clone())
      val parsed = ErgoLikeTransactionSerializer.parse(reader)
      require(reader.remaining == 0,
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
      require(reader.remaining == 0,
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
        require(reader.remaining == 0,
          s"$label parser left ${reader.remaining} trailing bytes")
        box
      }
    }

  private def requiredArray(
      value: ACursor,
      label: String): Vector[ACursor] =
    value.focus.getOrElse(
      throw new IllegalArgumentException(s"$label missing"))
      .asArray.getOrElse(
        throw new IllegalArgumentException(s"$label must be an array"))
      .indices.map(value.downN).toVector

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
      throw new IllegalArgumentException(s"$label missing or not a string"))

  private def requiredInt(value: ACursor, label: String): Int =
    value.focus.flatMap(_.asNumber).flatMap(_.toInt).getOrElse(
      throw new IllegalArgumentException(s"$label missing or not an Int"))

  private def requiredBoolean(value: ACursor, label: String): Boolean =
    value.focus.flatMap(_.asBoolean).getOrElse(
      throw new IllegalArgumentException(
        s"$label missing or not a Boolean"))

  private def hex(value: String): Array[Byte] = {
    require(value.length % 2 == 0 && value.matches("[0-9a-f]+"),
      "expected lowercase whole-byte hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }

  private def hex(bytes: Array[Byte]): String =
    bytes.iterator.map(byte => f"${byte & 0xff}%02x").mkString

  private def sha256(bytes: Array[Byte]): String =
    hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
