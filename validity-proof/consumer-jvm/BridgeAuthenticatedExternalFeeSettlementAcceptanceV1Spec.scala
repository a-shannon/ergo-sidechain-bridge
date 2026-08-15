package sigma.bridge

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path, Paths, StandardOpenOption}
import java.security.MessageDigest

import io.circe.{ACursor, Json}
import io.circe.parser
import org.ergoplatform._
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.hash.Blake2b256
import sigma.VersionContext
import sigma.ast._
import sigma.compiler.{CompilerResult, SigmaCompiler}
import sigma.compiler.ir.CompiletimeIRContext
import sigma.data.{Digest32Coll, TrivialProp}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.{ErgoTreeSerializer, SigmaSerializer}
import sigma.{Coll, Colls}
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.{copyBox, copyTransaction}

class BridgeAuthenticatedExternalFeeSettlementAcceptanceV1Spec
    extends AnyFunSuite with Matchers {
  private val ModeProperty =
    "bridge.authenticated.external.fee.jvm.mode"
  private val RootProperty =
    "bridge.authenticated.external.fee.jvm.root"
  private val OutputProperty =
    "bridge.authenticated.external.fee.jvm.receipt.out"
  private val SpecShaProperty =
    "bridge.authenticated.external.fee.jvm.spec.sha256"
  private val CompilerReceiptProperty =
    "bridge.authenticated.external.fee.jvm.compiler.receipt"
  private val CompilerReceiptShaProperty =
    "bridge.authenticated.external.fee.jvm.compiler.receipt.sha256"
  private val FixtureProperty =
    "bridge.authenticated.external.fee.jvm.fixture"
  private val FixtureShaProperty =
    "bridge.authenticated.external.fee.jvm.fixture.sha256"

  private val SigmaStateCommit =
    "f78deadd668f801e7fae3bc884283f79c6f484fa"
  private val CompilerSchema =
    "e2s.authenticated-external-fee-settlement-jvm-compiler-receipt.v1"
  private val AcceptanceSchema =
    "e2s.authenticated-external-fee-settlement-jvm-receipt.v1"
  private val FixtureSchema =
    "e2s.authenticated-external-fee-settlement-jvm-fixture.v1"

  private val UnlockTemplatePath =
    "contracts/MainChainAggregateUnlockAuthenticatedExternalFeeV1.es"
  private val DupTemplatePath =
    "contracts/DoubleUnlockPreventionAuthenticatedExternalFeeV1.es"
  private val OldDupTemplatePath =
    "contracts/DoubleUnlockPreventionAuthenticated.es"
  private val UnlockTemplateSha256 =
    "3e0807ad84dac5ed9dcacd78beeec82650367aa3c04614ea9a10b6d9c8f0947e"
  private val DupTemplateSha256 =
    "9ffc36b1fde633cfd8ee60442bb4c363c593d98d95605f71a89505db8b5fcf3e"
  private val OldDupTemplateSha256 =
    "c4947b034b40ebf8c6385d48da1e8c109a98958cb9c1d5431b9714853ad24a33"

  // These IDs match the deterministic external-fee TypeScript fixture family.
  private val TrackerNftId = "aa" * 32
  private val DupNftId = "bb" * 32
  private val Message =
    Blake2b256("authenticated external fee settlement JVM V1").toArray
  private val falseTree = ErgoTree.fromProposition(TrivialProp.FalseProp)

  private val NegativeCaseIds = Vector(
    "missing_fee_input",
    "reordered_fee_input",
    "fee_value_mismatch",
    "token_bearing_fee",
    "wrong_fee_tree",
    "dust_residual",
    "wrong_dup_successor_avl",
    "wrong_dup_successor_proposition",
    "wrong_dup_successor_value",
    "wrong_dup_insert_proof",
    "wrong_vault_successor_tree",
    "wrong_vault_successor_value",
    "wrong_vault_successor_registers",
    "wrong_payout_tree",
    "wrong_payout_value",
    "legacy_dup_profile_rejected")

  private val BoundaryNames = Vector(
    "nodeCheckPerformed",
    "signingAuthorityEstablished",
    "submissionAuthorityEstablished",
    "broadcastAuthorityEstablished",
    "fundsAuthorityEstablished",
    "gate5Closed",
    "trustlessStatusEstablished",
    "productionReadinessEstablished")

  private lazy val mode = requiredProperty(ModeProperty) match {
    case "compile" => "compile"
    case "accept" => "accept"
    case other => throw new IllegalArgumentException(
      s"unsupported external-fee JVM mode $other")
  }
  private lazy val root = exactDirectory(requiredProperty(RootProperty))
  private lazy val specSha256 = exactDigest(
    requiredProperty(SpecShaProperty),
    "spec SHA-256")
  private lazy val contracts = compileContracts()

  test("pinned compiler emits exact external-fee settlement identities") {
    scala.util.Properties.versionNumberString shouldBe "2.13.18"
    contracts.unlock.templateSha256 shouldBe UnlockTemplateSha256
    contracts.duplicatePrevention.templateSha256 shouldBe DupTemplateSha256
    contracts.oldDuplicatePrevention.templateSha256 shouldBe
      OldDupTemplateSha256
    contracts.unlock.treeBytes should not be empty
    contracts.duplicatePrevention.treeBytes should not be empty
    contracts.unlock.contractId should not be
      contracts.duplicatePrevention.contractId
    contracts.duplicatePrevention.source should include(
      contracts.unlock.contractId)
    contracts.unlock.source should not include "PLACEHOLDER"
    contracts.duplicatePrevention.source should not include "PLACEHOLDER"
    compileSource(contracts.unlock.source).treeBytes should
      contain theSameElementsInOrderAs contracts.unlock.treeBytes
    compileSource(contracts.duplicatePrevention.source).treeBytes should
      contain theSameElementsInOrderAs
        contracts.duplicatePrevention.treeBytes

    if (mode == "compile") {
      writeReceipt(compilerReceiptJson(contracts))
    }
  }

  test("external proofless fixtures accept and isolated faults reject") {
    if (mode != "accept") cancel("compile mode emits identities only")

    val compilerReceipt = loadCompilerReceipt()
    assertCompilerReceipt(compilerReceipt, contracts)
    val loadedFixture = loadFixture()
    val cases = parseFixture(loadedFixture.json, contracts)
    cases.map(_.kind) shouldBe Vector("partialVault", "terminalVault")
    val partial = cases(0)
    val terminal = cases(1)

    assertPositive(partial, expectedOutputs = 4)
    assertPositive(terminal, expectedOutputs = 3)

    runNegativeMatrix(partial, terminal, contracts.oldDuplicatePrevention.tree)

    val positives = cases.map { candidate =>
      PositiveRecord(
        candidate.kind,
        candidate.transaction.id,
        candidate.prooflessBytes.length,
        sha256(candidate.prooflessBytes))
    }
    writeReceipt(acceptanceReceiptJson(
      contracts,
      compilerReceipt.sha256,
      loadedFixture.sha256,
      positives))
  }

  private def runNegativeMatrix(
      partial: AcceptanceCase,
      terminal: AcceptanceCase,
      oldDupTree: ErgoTree): Unit = {
    val missingFeeTx =
      copyTransaction(partial.transaction)(
        inputs = partial.transaction.inputs.take(2))
    assertRejected(
      "missing fee input",
      missingFeeTx,
      partial.boxes.take(2),
      partial.dataBoxes,
      partial.currentHeight,
      0,
      1,
      Set("duplicatePrevention", "vault"))

    val reorderedTx = copyTransaction(partial.transaction)(
      inputs = IndexedSeq(
        partial.transaction.inputs(0),
        partial.transaction.inputs(2),
        partial.transaction.inputs(1)))
    assertRejected(
      "reordered fee input",
      reorderedTx,
      IndexedSeq(partial.boxes(0), partial.boxes(2), partial.boxes(1)),
      partial.dataBoxes,
      partial.currentHeight,
      0,
      2,
      Set("duplicatePrevention", "vault"))

    val fee = partial.boxes(2)
    val wrongFeeValue = copyBox(fee)(value = fee.value + 1L)
    assertRejectedWithBox(
      "fee value mismatch",
      partial,
      2,
      wrongFeeValue,
      Set("duplicatePrevention", "vault"))

    val tokenBearingFee = copyBox(fee)(
      additionalTokens =
        Colls.fromArray(Array(token("7c" * 32, 1L))))
    assertRejectedWithBox(
      "token-bearing fee",
      partial,
      2,
      tokenBearingFee,
      Set("duplicatePrevention", "vault"))

    val feeIndex = partial.transaction.outputCandidates.length - 1
    val wrongFeeTree = copyCandidate(
      partial.transaction.outputCandidates(feeIndex))(ergoTree = falseTree)
    assertRejectedWithOutputs(
      "wrong fee tree",
      partial,
      partial.transaction.outputCandidates.updated(feeIndex, wrongFeeTree),
      Set("duplicatePrevention", "vault"))

    val payoutValue = terminal.transaction.outputCandidates(1).value
    val dustVault = copyBox(terminal.boxes(1))(value = payoutValue + 500000L)
    assertRejectedWithBox(
      "dust residual",
      terminal,
      1,
      dustVault,
      Set("vault"))

    val dupOut = partial.transaction.outputCandidates(0)
    val wrongDupAvl = copyCandidate(dupOut)(
      additionalRegisters = dupOut.additionalRegisters.toMap.updated(
        ErgoBox.R5,
        partial.boxes(0).additionalRegisters(ErgoBox.R5)))
    assertRejectedWithOutputs(
      "wrong DUP successor AVL state",
      partial,
      partial.transaction.outputCandidates.updated(0, wrongDupAvl),
      Set("duplicatePrevention", "vault"))

    val wrongDupProposition = copyCandidate(dupOut)(ergoTree = falseTree)
    assertRejectedWithOutputs(
      "wrong DUP successor proposition",
      partial,
      partial.transaction.outputCandidates.updated(0, wrongDupProposition),
      Set("duplicatePrevention"))

    val wrongDupValue = copyCandidate(dupOut)(value = dupOut.value + 1L)
    assertRejectedWithOutputs(
      "wrong DUP successor value",
      partial,
      partial.transaction.outputCandidates.updated(0, wrongDupValue),
      Set("duplicatePrevention"))

    val wrongDupProof = mutateExtension(
      partial.transaction,
      inputIndex = 0,
      variableId = 2,
      byteOffset = 0)
    assertRejected(
      "wrong DUP insert proof",
      wrongDupProof,
      partial.boxes,
      partial.dataBoxes,
      partial.currentHeight,
      0,
      1,
      Set("duplicatePrevention"))

    val vaultOut = partial.transaction.outputCandidates(2)
    val wrongVaultTree = copyCandidate(vaultOut)(ergoTree = falseTree)
    assertRejectedWithOutputs(
      "wrong vault successor tree",
      partial,
      partial.transaction.outputCandidates.updated(2, wrongVaultTree),
      Set("vault"))

    val wrongVaultValue = copyCandidate(vaultOut)(value = vaultOut.value + 1L)
    assertRejectedWithOutputs(
      "wrong vault successor value",
      partial,
      partial.transaction.outputCandidates.updated(2, wrongVaultValue),
      Set("vault"))

    val wrongVaultRegisters = copyCandidate(vaultOut)(
      additionalRegisters = vaultOut.additionalRegisters.toMap.updated(
        ErgoBox.R4,
        flippedBytes(vaultOut.additionalRegisters(ErgoBox.R4), 0)))
    assertRejectedWithOutputs(
      "wrong vault successor registers",
      partial,
      partial.transaction.outputCandidates.updated(2, wrongVaultRegisters),
      Set("vault"))

    val payout = partial.transaction.outputCandidates(1)
    val wrongPayoutTree = copyCandidate(payout)(ergoTree = falseTree)
    assertRejectedWithOutputs(
      "wrong payout tree",
      partial,
      partial.transaction.outputCandidates.updated(1, wrongPayoutTree),
      Set("vault"))

    val wrongPayoutValue = copyCandidate(payout)(value = payout.value + 1L)
    assertRejectedWithOutputs(
      "wrong payout value",
      partial,
      partial.transaction.outputCandidates.updated(1, wrongPayoutValue),
      Set("vault"))

    val oldDup = copyBox(partial.boxes(0))(ergoTree = oldDupTree)
    val oldDupOut = copyCandidate(dupOut)(ergoTree = oldDupTree)
    val oldDupTx = withSpendingBox(
      copyTransaction(partial.transaction)(
        outputCandidates =
          partial.transaction.outputCandidates.updated(0, oldDupOut)),
      0,
      oldDup)
    val oldResults = verifyProtected(
      oldDupTx,
      partial.boxes.updated(0, oldDup),
      partial.dataBoxes,
      partial.currentHeight,
      0,
      1)
    withClue("legacy DUP profile must reject the new transaction shape: ") {
      oldResults.duplicatePrevention should not be Right(true)
      oldResults.vault shouldBe Right(true)
    }
  }

  private def assertPositive(
      candidate: AcceptanceCase,
      expectedOutputs: Int): Unit = {
    val tx = candidate.transaction
    tx.inputs should have length 3
    tx.dataInputs should have length 1
    tx.outputCandidates should have length expectedOutputs
    candidate.boxes should have length 3
    candidate.dataBoxes should have length 1
    tx.inputs.zip(candidate.boxes).foreach { case (input, box) =>
      input.boxId should contain theSameElementsInOrderAs box.id
      input.spendingProof.proof shouldBe empty
    }
    tx.dataInputs.head.boxId should
      contain theSameElementsInOrderAs candidate.dataBoxes.head.id
    tx.messageToSign should
      contain theSameElementsInOrderAs candidate.prooflessBytes
    ErgoLikeTransactionSerializer.toBytes(tx) should
      contain theSameElementsInOrderAs candidate.prooflessBytes
    tx.id shouldBe candidate.transactionId
    hex(Blake2b256(candidate.prooflessBytes)) shouldBe candidate.transactionId
    contractId(candidate.boxes(0).ergoTree) shouldBe
      contracts.duplicatePrevention.contractId
    contractId(candidate.boxes(1).ergoTree) shouldBe
      contracts.unlock.contractId
    hex(candidate.boxes(0).additionalTokens(0)._1.toArray) shouldBe DupNftId
    hex(candidate.dataBoxes.head.additionalTokens(0)._1.toArray) shouldBe
      TrackerNftId
    assertExactExtensionShape(tx)
    val results = verifyProtected(
      tx,
      candidate.boxes,
      candidate.dataBoxes,
      candidate.currentHeight,
      0,
      1)
    withClue(s"${candidate.kind} must accept both protected inputs: ") {
      results shouldBe ProtectedResults(Right(true), Right(true))
    }
  }

  private def assertRejectedWithBox(
      label: String,
      candidate: AcceptanceCase,
      inputIndex: Int,
      box: ErgoBox,
      expectedRejected: Set[String]): Unit = {
    val changed = withSpendingBox(candidate.transaction, inputIndex, box)
    assertRejected(
      label,
      changed,
      candidate.boxes.updated(inputIndex, box),
      candidate.dataBoxes,
      candidate.currentHeight,
      0,
      1,
      expectedRejected)
  }

  private def assertRejectedWithOutputs(
      label: String,
      candidate: AcceptanceCase,
      outputs: IndexedSeq[ErgoBoxCandidate],
      expectedRejected: Set[String]): Unit =
    assertRejected(
      label,
      copyTransaction(candidate.transaction)(outputCandidates = outputs),
      candidate.boxes,
      candidate.dataBoxes,
      candidate.currentHeight,
      0,
      1,
      expectedRejected)

  private def assertRejected(
      label: String,
      tx: ErgoLikeTransaction,
      boxes: IndexedSeq[ErgoBox],
      data: IndexedSeq[ErgoBox],
      height: Int,
      dupIndex: Int,
      vaultIndex: Int,
      expectedRejected: Set[String]): Unit = {
    val results = verifyProtected(
      tx,
      boxes,
      data,
      height,
      dupIndex,
      vaultIndex)
    withClue(s"$label must reject the protected conjunction: ") {
      results should not be ProtectedResults(Right(true), Right(true))
      if (expectedRejected.contains("duplicatePrevention"))
        results.duplicatePrevention should not be Right(true)
      else results.duplicatePrevention shouldBe Right(true)
      if (expectedRejected.contains("vault"))
        results.vault should not be Right(true)
      else results.vault shouldBe Right(true)
    }
  }

  private def verifyProtected(
      tx: ErgoLikeTransaction,
      boxes: IndexedSeq[ErgoBox],
      data: IndexedSeq[ErgoBox],
      height: Int,
      dupIndex: Int,
      vaultIndex: Int): ProtectedResults =
    ProtectedResults(
      verifyInput(tx, boxes, data, height, dupIndex),
      verifyInput(tx, boxes, data, height, vaultIndex))

  private def verifyInput(
      tx: ErgoLikeTransaction,
      boxes: IndexedSeq[ErgoBox],
      data: IndexedSeq[ErgoBox],
      height: Int,
      index: Int): Either[Throwable, Boolean] =
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
      require(index >= 0 && index < freshBoxes.length, "protected index missing")
      val context = ErgoLikeContextTesting(
        currentHeight = height,
        lastBlockUtxoRoot = sigma.data.AvlTreeData.dummy,
        minerPubkey = ErgoLikeContextTesting.dummyPubkey,
        dataBoxes = freshData,
        boxesToSpend = freshBoxes,
        spendingTransaction = freshTransaction,
        selfIndex = index,
        activatedVersion = VersionContext.StarkVerificationVersion.toByte)
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

  private def assertExactExtensionShape(tx: ErgoLikeTransaction): Unit = {
    require(tx.inputs.length == 3, "fixture must contain exactly three inputs")
    require(
      tx.inputs(0).extension.values.keySet ==
        Set(0.toByte, 1.toByte, 2.toByte),
      "DUP ContextExtension must contain exactly Vars 0..2")
    require(
      tx.inputs(1).extension.values.keySet ==
        Set(0.toByte, 1.toByte, 2.toByte, 3.toByte),
      "vault ContextExtension must contain exactly Vars 0..3")
    require(
      tx.inputs(2).extension.values.isEmpty,
      "external-fee ContextExtension must be empty")
  }

  private def mutateExtension(
      tx: ErgoLikeTransaction,
      inputIndex: Int,
      variableId: Int,
      byteOffset: Int): ErgoLikeTransaction = {
    val bytes = tx.inputs(inputIndex).extension
      .get(variableId.toByte).get.value
      .asInstanceOf[Coll[Byte]].toArray.clone()
    require(
      byteOffset >= 0 && byteOffset < bytes.length,
      "ContextExtension mutation offset is outside the value")
    bytes(byteOffset) = (bytes(byteOffset) ^ 1).toByte
    val input = tx.inputs(inputIndex)
    val extension = ContextExtension(
      input.extension.values.toMap.updated(
        variableId.toByte,
        ByteArrayConstant(bytes)))
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

  private def parseFixture(
      json: Json,
      compiled: CompiledContracts): Vector[AcceptanceCase] = {
    val cursor = json.hcursor
    assertExactKeys(json, Vector(
      "schema",
      "version",
      "sigmaStateCommit",
      "compilerReceiptSha256Hex",
      "currentErgoHeight",
      "bindings",
      "contracts",
      "cases",
      "boundaries"), "fixture")
    requiredString(cursor.downField("schema"), "fixture schema") shouldBe
      FixtureSchema
    requiredInt(cursor.downField("version"), "fixture version") shouldBe 1
    requiredString(
      cursor.downField("sigmaStateCommit"),
      "fixture SigmaState commit") shouldBe SigmaStateCommit
    requiredString(
      cursor.downField("compilerReceiptSha256Hex"),
      "fixture compiler receipt SHA-256") shouldBe
        loadCompilerReceipt().sha256
    val height = requiredInt(
      cursor.downField("currentErgoHeight"),
      "current Ergo height")
    height should be > 0

    val bindings = cursor.downField("bindings")
    assertExactKeys(
      requiredJson(bindings, "fixture bindings"),
      Vector("trackerNftIdHex", "duplicatePreventionNftIdHex"),
      "fixture bindings")
    requiredString(
      bindings.downField("trackerNftIdHex"),
      "tracker NFT ID") shouldBe TrackerNftId
    requiredString(
      bindings.downField("duplicatePreventionNftIdHex"),
      "DUP NFT ID") shouldBe DupNftId

    val identities = cursor.downField("contracts")
    assertExactKeys(
      requiredJson(identities, "fixture contracts"),
      Vector(
        "mainChainAggregateUnlockAuthenticatedExternalFee",
        "doubleUnlockPreventionAuthenticatedExternalFee"),
      "fixture contracts")
    assertFixtureContract(
      identities.downField(
        "mainChainAggregateUnlockAuthenticatedExternalFee"),
      compiled.unlock)
    assertFixtureContract(
      identities.downField(
        "doubleUnlockPreventionAuthenticatedExternalFee"),
      compiled.duplicatePrevention)
    assertFalseBoundaries(cursor.downField("boundaries"), "fixture boundaries")

    requiredJsonArray(cursor.downField("cases"), "fixture cases")
      .map { entry =>
        assertExactKeys(entry, Vector(
          "kind",
          "prooflessTransactionHex",
          "prooflessTransactionIdHex",
          "inputBoxSigmaHex",
          "dataInputBoxSigmaHex"), "fixture case")
        val caseCursor = entry.hcursor
        val kind = requiredString(caseCursor.downField("kind"), "case kind")
        require(
          kind == "partialVault" || kind == "terminalVault",
          s"unsupported fixture case $kind")
        val prooflessBytes = hex(requiredString(
          caseCursor.downField("prooflessTransactionHex"),
          s"$kind proofless transaction"))
        val transaction = parseTransaction(prooflessBytes)
        val transactionId = exactDigest(
          requiredString(
            caseCursor.downField("prooflessTransactionIdHex"),
            s"$kind transaction ID"),
          s"$kind transaction ID")
        val boxes = parseBoxes(
          caseCursor.downField("inputBoxSigmaHex"),
          s"$kind input boxes")
        val dataBoxes = parseBoxes(
          caseCursor.downField("dataInputBoxSigmaHex"),
          s"$kind data-input boxes")
        AcceptanceCase(
          kind,
          height,
          prooflessBytes,
          transactionId,
          transaction,
          boxes,
          dataBoxes)
      }.toVector
  }

  private def assertFixtureContract(
      cursor: ACursor,
      expected: ContractIdentity): Unit = {
    val json = requiredJson(cursor, s"${expected.role} fixture contract")
    assertExactKeys(json, Vector(
      "propositionHex",
      "propositionBytes",
      "propositionSha256Hex",
      "propositionBlake2b256Hex"), s"${expected.role} fixture contract")
    assertPropositionFields(cursor, expected)
  }

  private def assertPropositionFields(
      cursor: ACursor,
      expected: ContractIdentity): Unit = {
    requiredString(
      cursor.downField("propositionHex"),
      s"${expected.role} proposition") shouldBe expected.treeHex
    requiredInt(
      cursor.downField("propositionBytes"),
      s"${expected.role} proposition bytes") shouldBe expected.treeBytes.length
    requiredString(
      cursor.downField("propositionSha256Hex"),
      s"${expected.role} proposition SHA-256") shouldBe expected.treeSha256
    requiredString(
      cursor.downField("propositionBlake2b256Hex"),
      s"${expected.role} proposition Blake2b-256") shouldBe
        expected.contractId
  }

  private def loadCompilerReceipt(): LoadedJson = {
    val loaded = loadJsonFile(
      CompilerReceiptProperty,
      CompilerReceiptShaProperty,
      "compiler receipt",
      64 * 1024)
    requiredString(
      loaded.json.hcursor.downField("schema"),
      "compiler receipt schema") shouldBe CompilerSchema
    loaded
  }

  private def loadFixture(): LoadedJson =
    loadJsonFile(
      FixtureProperty,
      FixtureShaProperty,
      "acceptance fixture",
      1024 * 1024)

  private def loadJsonFile(
      pathProperty: String,
      shaProperty: String,
      label: String,
      maxBytes: Int): LoadedJson = {
    val path = exactFile(Paths.get(requiredProperty(pathProperty)), label)
    require(
      Files.size(path) <= maxBytes,
      s"$label exceeds the $maxBytes-byte ingress limit")
    val bytes = Files.readAllBytes(path)
    require(
      bytes.length <= maxBytes,
      s"$label exceeds the $maxBytes-byte ingress limit")
    requireAsciiLf(bytes, label)
    val expected = exactDigest(requiredProperty(shaProperty), s"$label SHA-256")
    val actual = sha256(bytes)
    require(actual == expected, s"$label does not match its exact SHA-256")
    val json = parser.parse(
      new String(bytes, StandardCharsets.US_ASCII)).fold(
      failure => throw new IllegalArgumentException(
        s"$label JSON rejected: ${failure.getMessage}"),
      identity)
    LoadedJson(path, bytes, actual, json)
  }

  private def assertCompilerReceipt(
      receipt: LoadedJson,
      compiled: CompiledContracts): Unit = {
    val cursor = receipt.json.hcursor
    assertExactKeys(receipt.json, Vector(
      "schema",
      "version",
      "sigmaStateCommit",
      "specSha256Hex",
      "bindings",
      "contracts",
      "negativeDependencies",
      "boundaries"), "compiler receipt")
    requiredString(cursor.downField("schema"), "compiler receipt schema") shouldBe
      CompilerSchema
    requiredInt(cursor.downField("version"), "compiler receipt version") shouldBe
      1
    requiredString(
      cursor.downField("sigmaStateCommit"),
      "compiler receipt SigmaState commit") shouldBe SigmaStateCommit
    requiredString(
      cursor.downField("specSha256Hex"),
      "compiler receipt spec SHA-256") shouldBe specSha256
    val contractsCursor = cursor.downField("contracts")
    assertReceiptContract(
      contractsCursor.downField(
        "mainChainAggregateUnlockAuthenticatedExternalFee"),
      compiled.unlock)
    assertReceiptContract(
      contractsCursor.downField(
        "doubleUnlockPreventionAuthenticatedExternalFee"),
      compiled.duplicatePrevention)
    assertFalseBoundaries(
      cursor.downField("boundaries"),
      "compiler receipt boundaries")
  }

  private def compileContracts(): CompiledContracts = {
    val unlockTemplate = exactTemplate(
      root.resolve(UnlockTemplatePath),
      UnlockTemplatePath,
      UnlockTemplateSha256)
    val dupTemplate = exactTemplate(
      root.resolve(DupTemplatePath),
      DupTemplatePath,
      DupTemplateSha256)
    val oldDupTemplate = exactTemplate(
      root.resolve(OldDupTemplatePath),
      OldDupTemplatePath,
      OldDupTemplateSha256)

    val unlockSource = replaceAll(
      unlockTemplate.source,
      Vector(
        "TRACKER_NFT_ID_PLACEHOLDER" -> TrackerNftId,
        "DUP_NFT_ID_PLACEHOLDER" -> DupNftId))
    val unlockCompiled = compileSource(unlockSource)
    val unlock = ContractIdentity(
      "mainChainAggregateUnlockAuthenticatedExternalFee",
      unlockTemplate.path,
      unlockTemplate.sha256,
      sha256(unlockSource.getBytes(StandardCharsets.US_ASCII)),
      unlockSource,
      unlockCompiled.tree,
      unlockCompiled.treeBytes)

    val dupSource = replaceAll(
      dupTemplate.source,
      Vector(
        "TRACKER_NFT_ID_PLACEHOLDER" -> TrackerNftId,
        "AUTHENTICATED_EXTERNAL_FEE_UNLOCK_HASH_PLACEHOLDER" ->
          unlock.contractId))
    val dupCompiled = compileSource(dupSource)
    val duplicatePrevention = ContractIdentity(
      "doubleUnlockPreventionAuthenticatedExternalFee",
      dupTemplate.path,
      dupTemplate.sha256,
      sha256(dupSource.getBytes(StandardCharsets.US_ASCII)),
      dupSource,
      dupCompiled.tree,
      dupCompiled.treeBytes)

    val oldDupSource = replaceAll(
      oldDupTemplate.source,
      Vector(
        "TRACKER_NFT_ID_PLACEHOLDER" -> TrackerNftId,
        "AUTHENTICATED_UNLOCK_HASH_PLACEHOLDER" -> unlock.contractId))
    val oldDupCompiled = compileSource(oldDupSource)
    val oldDuplicatePrevention = ContractIdentity(
      "oldAuthenticatedDuplicatePreventionNegative",
      oldDupTemplate.path,
      oldDupTemplate.sha256,
      sha256(oldDupSource.getBytes(StandardCharsets.US_ASCII)),
      oldDupSource,
      oldDupCompiled.tree,
      oldDupCompiled.treeBytes)

    require(
      Vector(unlock.contractId, duplicatePrevention.contractId,
        oldDuplicatePrevention.contractId).distinct.length == 3,
      "compiled external-fee and old-profile trees must be distinct")
    CompiledContracts(unlock, duplicatePrevention, oldDuplicatePrevention)
  }

  private def compileSource(source: String): CompiledTree =
    VersionContext.withVersions(3.toByte, 0.toByte) {
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
      val tree = ErgoTree.fromProposition(
        ErgoTree.defaultHeaderWithVersion(0.toByte),
        proposition)
      val bytes =
        ErgoTreeSerializer.DefaultSerializer.serializeErgoTree(tree)
      CompiledTree(tree, bytes)
    }

  private def exactTemplate(
      path: Path,
      relativePath: String,
      expectedSha256: String): Template = {
    val exact = exactFile(path, relativePath)
    val bytes = Files.readAllBytes(exact)
    requireAsciiLf(bytes, relativePath)
    val actual = sha256(bytes)
    require(
      actual == expectedSha256,
      s"$relativePath does not match the reviewed SHA-256")
    Template(
      relativePath,
      actual,
      new String(bytes, StandardCharsets.US_ASCII))
  }

  private def replaceAll(
      source: String,
      replacements: Seq[(String, String)]): String = {
    val resolved = replacements.foldLeft(source) {
      case (current, (placeholder, value)) =>
        require(current.contains(placeholder), s"missing $placeholder")
        current.replace(placeholder, value)
    }
    require(
      !"[A-Z][A-Z0-9_]+_PLACEHOLDER".r.findFirstIn(resolved).isDefined,
      "resolved source retains a placeholder")
    resolved
  }

  private def compilerReceiptJson(compiled: CompiledContracts): String =
    s"""{
       |  "schema": "$CompilerSchema",
       |  "version": 1,
       |  "sigmaStateCommit": "$SigmaStateCommit",
       |  "specSha256Hex": "$specSha256",
       |  "bindings": {
       |    "trackerNftIdHex": "$TrackerNftId",
       |    "duplicatePreventionNftIdHex": "$DupNftId"
       |  },
       |  "contracts": {
       |    "mainChainAggregateUnlockAuthenticatedExternalFee": ${contractJson(compiled.unlock, 4)},
       |    "doubleUnlockPreventionAuthenticatedExternalFee": ${contractJson(compiled.duplicatePrevention, 4)}
       |  },
       |  "negativeDependencies": {
       |    "oldAuthenticatedDuplicatePreventionTemplateSha256Hex": "$OldDupTemplateSha256",
       |    "oldAuthenticatedDuplicatePreventionPropositionBlake2b256Hex": "${compiled.oldDuplicatePrevention.contractId}"
       |  },
       |  "boundaries": ${boundariesJson(2)}
       |}
       |""".stripMargin

  private def acceptanceReceiptJson(
      compiled: CompiledContracts,
      compilerReceiptSha256: String,
      fixtureSha256: String,
      positives: Vector[PositiveRecord]): String = {
    require(
      positives.map(_.kind) == Vector("partialVault", "terminalVault"),
      "acceptance receipt requires exact ordered positive cases")
    val positiveJson = positives.map { record =>
      s"""    {
         |      "caseId": "${record.kind}",
         |      "transactionIdHex": "${record.transactionId}",
         |      "prooflessTransactionBytes": ${record.bytes},
         |      "prooflessTransactionSha256Hex": "${record.sha256}",
         |      "duplicatePreventionInputAccepted": true,
         |      "vaultInputAccepted": true
         |    }""".stripMargin
    }.mkString(",\n")
    val negativeJson =
      NegativeCaseIds.map(id => s"""    "$id"""").mkString(",\n")
    s"""{
       |  "schema": "$AcceptanceSchema",
       |  "version": 1,
       |  "sigmaStateCommit": "$SigmaStateCommit",
       |  "specSha256Hex": "$specSha256",
       |  "compilerReceiptSha256Hex": "$compilerReceiptSha256",
       |  "fixtureSha256Hex": "$fixtureSha256",
       |  "bindings": {
       |    "trackerNftIdHex": "$TrackerNftId",
       |    "duplicatePreventionNftIdHex": "$DupNftId"
       |  },
       |  "contracts": {
       |    "mainChainAggregateUnlockAuthenticatedExternalFee": ${contractJson(compiled.unlock, 4)},
       |    "doubleUnlockPreventionAuthenticatedExternalFee": ${contractJson(compiled.duplicatePrevention, 4)}
       |  },
       |  "positiveCaseCount": ${positives.length},
       |  "positives": [
       |$positiveJson
       |  ],
       |  "negativeCaseCount": ${NegativeCaseIds.length},
       |  "negativeCaseIds": [
       |$negativeJson
       |  ],
       |  "boundaries": ${boundariesJson(2)}
       |}
       |""".stripMargin
  }

  private def contractJson(
      contract: ContractIdentity,
      indent: Int): String = {
    val pad = " " * indent
    s"""{
       |$pad  "templatePath": "${contract.templatePath}",
       |$pad  "templateSha256Hex": "${contract.templateSha256}",
       |$pad  "resolvedSourceSha256Hex": "${contract.sourceSha256}",
       |$pad  "propositionHex": "${contract.treeHex}",
       |$pad  "propositionBytes": ${contract.treeBytes.length},
       |$pad  "propositionSha256Hex": "${contract.treeSha256}",
       |$pad  "propositionBlake2b256Hex": "${contract.contractId}"
       |$pad}""".stripMargin
  }

  private def boundariesJson(indent: Int): String = {
    val pad = " " * indent
    val fields = BoundaryNames.map(name => s"""$pad  "$name": false""")
    ("{\n" + fields.mkString(",\n") + s"\n$pad}")
  }

  private def writeReceipt(raw: String): Unit = {
    val path = Paths.get(requiredProperty(OutputProperty))
      .toAbsolutePath.normalize()
    val parent = path.getParent
    require(
      parent != null &&
        Files.isDirectory(parent) &&
        !Files.isSymbolicLink(parent),
      "receipt parent must be a real directory")
    require(!Files.exists(path), "receipt output must not already exist")
    val normalized = raw.replace("\r\n", "\n")
    val bytes = normalized.getBytes(StandardCharsets.US_ASCII)
    requireAsciiLf(bytes, "receipt")
    Files.write(
      path,
      bytes,
      StandardOpenOption.CREATE_NEW,
      StandardOpenOption.WRITE)
  }

  private def assertReceiptContract(
      cursor: ACursor,
      expected: ContractIdentity): Unit = {
    val json = requiredJson(cursor, s"${expected.role} receipt contract")
    assertExactKeys(json, Vector(
      "templatePath",
      "templateSha256Hex",
      "resolvedSourceSha256Hex",
      "propositionHex",
      "propositionBytes",
      "propositionSha256Hex",
      "propositionBlake2b256Hex"), s"${expected.role} receipt contract")
    requiredString(
      cursor.downField("templatePath"),
      s"${expected.role} template path") shouldBe expected.templatePath
    requiredString(
      cursor.downField("templateSha256Hex"),
      s"${expected.role} template SHA-256") shouldBe expected.templateSha256
    requiredString(
      cursor.downField("resolvedSourceSha256Hex"),
      s"${expected.role} source SHA-256") shouldBe expected.sourceSha256
    assertPropositionFields(cursor, expected)
  }

  private def assertFalseBoundaries(cursor: ACursor, label: String): Unit = {
    val json = requiredJson(cursor, label)
    assertExactKeys(json, BoundaryNames, label)
    BoundaryNames.foreach { name =>
      requiredBoolean(cursor.downField(name), s"$label $name") shouldBe false
    }
  }

  private def assertExactKeys(
      json: Json,
      expected: Seq[String],
      label: String): Unit = {
    val actual = json.asObject.getOrElse(
      throw new IllegalArgumentException(s"$label must be an object"))
      .keys.toVector.sorted
    require(
      actual == expected.toVector.sorted,
      s"$label has an unexpected field set")
  }

  private def parseTransaction(bytes: Array[Byte]): ErgoLikeTransaction =
    VersionContext.withVersions(
      VersionContext.StarkVerificationVersion.toByte,
      0.toByte) {
      val reader = SigmaSerializer.startReader(bytes.clone())
      try {
        val parsed = ErgoLikeTransactionSerializer.parse(reader)
        require(
          reader.remaining == 0,
          s"transaction parser left ${reader.remaining} trailing bytes")
        parsed
      } catch {
        case error: Throwable =>
          val offset = reader.position
          val contextStart = math.max(0, offset - 16)
          val contextEnd = math.min(bytes.length, offset + 16)
          val context = hex(bytes.slice(contextStart, contextEnd))
          throw new IllegalArgumentException(
            s"transaction parse failed at byte $offset of ${bytes.length}; " +
              s"context [$contextStart,$contextEnd)=$context",
            error)
      }
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
      cursor: ACursor,
      label: String): IndexedSeq[ErgoBox] =
    requiredJsonArray(cursor, label).zipWithIndex.map {
      case (entry, index) =>
        val encoded = entry.asString.getOrElse(
          throw new IllegalArgumentException(
            s"$label entry $index must be a string"))
        VersionContext.withVersions(
          VersionContext.StarkVerificationVersion.toByte,
          0.toByte) {
          val bytes = hex(encoded)
          val reader = SigmaSerializer.startReader(bytes)
          try {
            val box = ErgoBox.sigmaSerializer.parse(reader)
            require(
              reader.remaining == 0,
              s"$label parser left ${reader.remaining} trailing bytes")
            box
          } catch {
            case error: Throwable =>
              val offset = reader.position
              val contextStart = math.max(0, offset - 16)
              val contextEnd = math.min(bytes.length, offset + 16)
              val context = hex(bytes.slice(contextStart, contextEnd))
              throw new IllegalArgumentException(
                s"$label entry $index parse failed at byte $offset of " +
                  s"${bytes.length}; context [$contextStart,$contextEnd)=" +
                  context,
                error)
          }
        }
    }

  private def exactDirectory(raw: String): Path = {
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(
      Files.isDirectory(path) && !Files.isSymbolicLink(path),
      "bridge root must be a real directory")
    path
  }

  private def exactFile(path: Path, label: String): Path = {
    val normalized = path.toAbsolutePath.normalize()
    require(
      Files.isRegularFile(normalized) && !Files.isSymbolicLink(normalized),
      s"$label must be a real file")
    normalized
  }

  private def requireAsciiLf(bytes: Array[Byte], label: String): Unit =
    require(
      bytes.nonEmpty &&
        bytes.forall(byte => (byte & 0xff) <= 0x7f) &&
        !bytes.contains(13.toByte) &&
        !(bytes.length >= 3 &&
          bytes(0) == 0xef.toByte &&
          bytes(1) == 0xbb.toByte &&
          bytes(2) == 0xbf.toByte),
      s"$label must be non-empty BOM-free LF-only ASCII")

  private def requiredProperty(name: String): String = {
    val value = System.getProperty(name)
    require(value != null && value.nonEmpty, s"missing -D$name")
    value
  }

  private def requiredJson(cursor: ACursor, label: String): Json =
    cursor.focus.getOrElse(
      throw new IllegalArgumentException(s"$label missing"))

  private def requiredJsonArray(
      cursor: ACursor,
      label: String): Vector[Json] =
    cursor.focus.flatMap(_.asArray).map(_.toVector).getOrElse(
      throw new IllegalArgumentException(s"$label must be an array"))

  private def requiredString(cursor: ACursor, label: String): String =
    cursor.focus.flatMap(_.asString).getOrElse(
      throw new IllegalArgumentException(
        s"$label missing or not a string"))

  private def requiredInt(cursor: ACursor, label: String): Int =
    cursor.focus.flatMap(_.asNumber).flatMap(_.toInt).getOrElse(
      throw new IllegalArgumentException(s"$label missing or not an Int"))

  private def requiredBoolean(cursor: ACursor, label: String): Boolean =
    cursor.focus.flatMap(_.asBoolean).getOrElse(
      throw new IllegalArgumentException(
        s"$label missing or not a Boolean"))

  private def exactDigest(value: String, label: String): String = {
    require(value.matches("[0-9a-f]{64}"), s"$label must be lowercase hex")
    value
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

  private final case class Template(
      path: String,
      sha256: String,
      source: String)

  private final case class CompiledTree(
      tree: ErgoTree,
      treeBytes: Array[Byte])

  private final case class ContractIdentity(
      role: String,
      templatePath: String,
      templateSha256: String,
      sourceSha256: String,
      source: String,
      tree: ErgoTree,
      treeBytes: Array[Byte]) {
    val treeHex: String = hex(treeBytes)
    val treeSha256: String = sha256(treeBytes)
    val contractId: String = hex(Blake2b256(treeBytes))
  }

  private final case class CompiledContracts(
      unlock: ContractIdentity,
      duplicatePrevention: ContractIdentity,
      oldDuplicatePrevention: ContractIdentity)

  private final case class LoadedJson(
      path: Path,
      bytes: Array[Byte],
      sha256: String,
      json: Json)

  private final case class AcceptanceCase(
      kind: String,
      currentHeight: Int,
      prooflessBytes: Array[Byte],
      transactionId: String,
      transaction: ErgoLikeTransaction,
      boxes: IndexedSeq[ErgoBox],
      dataBoxes: IndexedSeq[ErgoBox])

  private final case class ProtectedResults(
      duplicatePrevention: Either[Throwable, Boolean],
      vault: Either[Throwable, Boolean])

  private final case class PositiveRecord(
      kind: String,
      transactionId: String,
      bytes: Int,
      sha256: String)
}
