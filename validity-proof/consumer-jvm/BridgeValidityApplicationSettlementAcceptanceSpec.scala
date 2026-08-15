package sigma.bridge

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
import sigma.data.{AvlTreeData, AvlTreeFlags, Digest32Coll, TrivialProp}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.{ErgoTreeSerializer, SigmaSerializer}
import sigma.{Coll, Colls}
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.{copyBox, copyTransaction}

class BridgeValidityApplicationSettlementAcceptanceSpec
    extends AnyFunSuite with Matchers {
  private val FixtureProperty =
    "bridge.eip0045.validity.application.settlement.context.fixture"
  private val Schema =
    "e2s.bridge-validity-application-settlement-context.v2"
  private val SigmaStateCommit =
    "f78deadd668f801e7fae3bc884283f79c6f484fa"

  private val TrackerContextSha256 =
    "609147a9e7e6aa67da64781f372b148adc7730b0e9d46bbeaca58ccea2a474f5"
  private val TrackerTransactionId =
    "f34ddf0e925c9a435adb9316747b4e18bcd230bf43ace553d5e2adba1a71d1b8"
  private val ContractIdentitySha256 =
    "0f9c0a86da1a5895b4b90bd65a3f230e47d0484b32bfd2c4a715a3d998017430"
  private val FrontierVectorNormalizedLfSha256 =
    "15059f17a6c81b16ac4861431fe375fcb1f3bfe8ecdd3cbcac92e4b60ee1edc4"
  private val FrontierVectorSchema =
    "e2s.frontier-bridge-event-root-application.vector.v2"
  private val FrontierBridgeEventRoot =
    "d5f26f1ddc319a969c8c3aea47fedd7d8e615c0746fdae84ac9984202aefe3b7"

  private val TrackerContractId =
    "adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b"
  private val VaultContractId =
    "a77327ce3bd279b725ea4dddbbbd78046ab744f3cb75ccf46d5147046fe77064"
  private val DupContractId =
    "58d1e5b169a86e7906d4d87fe2a4214bd5327ff4053370c6a0fbe3b8e79939b9"
  private val LegacyV1TrackerContractId =
    "c22f8d631e99022bd4bad5ce84ee9d7da30bf51684977c8bad28d8200f8cff5b"
  private val LegacyV1TrackerPropositionSha256 =
    "4ca5a3d606845336d583075a4653c58b5cb403f41e2bf2a66d544e531d248bae"

  private val VaultTemplateSha256 =
    "c30d57938590c130dbd97c50b54cb6c707d9ae53b3c2a2651712c9c0864631e7"
  private val VaultSourceSha256 =
    "3824f398ae8fc8e24f3992edf53723956273d448764f35d662864e75e9e078e6"
  private val VaultPropositionSha256 =
    "043657b6d81e88eefcc3e7a967f021689f01d54fbcbd88ec2e5696a91ae03e11"
  private val DupTemplateSha256 =
    "76544c021b45f073e03a7497fb27e910559fdd8e8e2e15d4c3d1beca10eded6a"
  private val DupSourceSha256 =
    "ee478e55fb74e4ebdb287739655a502a848e06673cb8ade47e03c3fd443eb458"
  private val DupPropositionSha256 =
    "52c03c0cc46d3c168649918ab8962da30a0163ef28eb33a0a0d1ab2630582618"

  private val TrackerNftId = "a1" * 32
  private val DupNftId = "a2" * 32
  private val SourceNetworkId = "11" * 32
  private val SidechainId = "22" * 32
  private val BridgeAddress = "33" * 20
  private val TokenAddress = "44" * 20
  private val SettlementProfileId = "55" * 32
  private val CausalProfileId =
    "a0a5ba76f51548dfa7148b623cedcbb6205ce1f51428a508480ece5df66e73f5"
  private val ApplicationBindingDigest =
    "5feb8c9311afef7c729ef2df0c0648f87689b10f9e0b9f48637c15024f6b587a"
  private val ProgramId =
    "230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c"
  private val VerifierProfileId =
    "23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383"
  private val ApprovedTrustRoot =
    "bb6a14b2c4a73c39dae8de6c2214c330858120232806c77110263b395e493abe"

  private val TrackerValueDomain =
    "E2S_SPV_VALIDITY_APPLICATION_VALUE_V2\u0000"
      .getBytes(StandardCharsets.US_ASCII)
  private val SettlementBundleDomain =
    "E2S_VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2\u0000"
      .getBytes(StandardCharsets.US_ASCII)
  private val BurnLeafDomain =
    "E2S_TRUSTLESS_BURN_LEAF_V1"
      .getBytes(StandardCharsets.US_ASCII)
  private val Message = Blake2b256(
    "bridge validity application settlement acceptance fixture").toArray

  private lazy val fixture = {
    val raw = System.getProperty(FixtureProperty)
    require(raw != null && raw.nonEmpty, s"missing -D$FixtureProperty")
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(
      Files.isRegularFile(path) && !Files.isSymbolicLink(path),
      "application settlement fixture must be a real file")
    parseStrictFixtureJson(
      Files.readAllBytes(path),
      "application settlement fixture")
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

  test("exact source identities, contracts, transaction, and extensions agree") {
    requiredString(cursor.downField("schema"), "fixture schema") shouldBe Schema
    requiredInt(cursor.downField("version"), "fixture version") shouldBe 2
    requiredString(
      cursor.downField("settlementProfileIdHex"),
      "settlement profile ID") shouldBe SettlementProfileId

    val source = cursor.downField("sourceBindings")
    assertPinnedProvenance(source)
    requiredString(
      source.downField("trackerProoflessTransactionIdHex"),
      "tracker transaction ID") shouldBe TrackerTransactionId
    requiredString(
      cursor.downField("profile").downField("trackerNftIdHex"),
      "tracker NFT ID") shouldBe TrackerNftId
    requiredString(
      cursor.downField("profile").downField("approvedTrustRootDigestHex"),
      "approved trust root") shouldBe ApprovedTrustRoot
    requiredString(
      source.downField("bridgeEventRootHex"),
      "Frontier bridge event root") shouldBe FrontierBridgeEventRoot

    val contracts = cursor.downField("contractIdentity")
    requiredString(
      contracts.downField("sigmaStateCommit"),
      "SigmaState commit") shouldBe SigmaStateCommit
    requiredString(
      contracts.downField("settlementProfileIdHex"),
      "contract settlement profile") shouldBe SettlementProfileId
    requiredString(
      contracts.downField("causalProfileIdHex"),
      "contract causal profile") shouldBe CausalProfileId
    requiredString(
      contracts.downField("applicationBindingDigestHex"),
      "contract application binding") shouldBe ApplicationBindingDigest
    assertContractIdentity(
      contracts.downField("causalVault"),
      "causal vault",
      VaultContractId,
      VaultTemplateSha256,
      VaultSourceSha256,
      VaultPropositionSha256,
      3562)
    assertContractIdentity(
      contracts.downField("duplicatePrevention"),
      "duplicate prevention",
      DupContractId,
      DupTemplateSha256,
      DupSourceSha256,
      DupPropositionSha256,
      701)

    val boxes = inputBoxes
    val data = dataBoxes
    boxes.length shouldBe 3
    data.length shouldBe 1
    hex(Blake2b256(boxes(0).ergoTree.bytes)) shouldBe DupContractId
    hex(Blake2b256(boxes(1).ergoTree.bytes)) shouldBe VaultContractId
    hex(Blake2b256(data.head.ergoTree.bytes)) shouldBe TrackerContractId
    sha256(boxes(0).ergoTree.bytes) shouldBe DupPropositionSha256
    sha256(boxes(1).ergoTree.bytes) shouldBe VaultPropositionSha256
    hex(boxes(0).additionalTokens(0)._1.toArray) shouldBe DupNftId
    hex(data.head.additionalTokens(0)._1.toArray) shouldBe TrackerNftId

    val tx = transaction
    prooflessBytes.length shouldBe requiredInt(
      cursor.downField("prooflessTransactionBytes"),
      "proofless transaction byte count")
    val expectedTransactionId = requiredString(
      cursor.downField("prooflessTransactionIdHex"),
      "proofless transaction ID")
    requiredString(
      cursor.downField("unsignedTransactionIdHex"),
      "unsigned transaction ID") shouldBe expectedTransactionId
    hex(Blake2b256(prooflessBytes)) shouldBe expectedTransactionId
    tx.id shouldBe expectedTransactionId
    tx.messageToSign should contain theSameElementsInOrderAs prooflessBytes
    ErgoLikeTransactionSerializer.toBytes(tx) should
      contain theSameElementsInOrderAs prooflessBytes
    tx.inputs.length shouldBe 3
    tx.dataInputs.length shouldBe 1
    tx.outputCandidates.length shouldBe 4
    tx.inputs.zip(boxes).foreach { case (input, box) =>
      input.boxId shouldBe box.id
      input.spendingProof.proof shouldBe empty
    }
    tx.dataInputs.head.boxId shouldBe data.head.id
    hex(data.head.id) shouldBe requiredString(
      source.downField("trackerOutputBoxIdHex"),
      "tracker output box ID")

    val extensionCursors = requiredArray(
      cursor.downField("contextExtensions"),
      "context extensions")
    val expectedKeys = Vector(
      Set(0.toByte, 1.toByte, 2.toByte),
      Set(0.toByte, 1.toByte, 2.toByte, 3.toByte),
      Set.empty[Byte])
    tx.inputs.zipWithIndex.foreach { case (input, index) =>
      input.extension.values.keySet shouldBe expectedKeys(index)
      requiredInts(
        extensionCursors(index).downField("keys"),
        s"input $index extension keys").map(_.toByte).toSet shouldBe
        expectedKeys(index)
      val bytes = ContextExtension.serializer.toBytes(input.extension)
      hex(bytes) shouldBe requiredString(
        extensionCursors(index).downField("serializedHex"),
        s"input $index ContextExtension")
      hex(Blake2b256(bytes)) shouldBe requiredString(
        extensionCursors(index).downField("serializedBlake2b256Hex"),
        s"input $index ContextExtension digest")
    }
  }

  test("fixture parser rejects duplicate object keys including escaped aliases") {
    val duplicate =
      """{"outer":{"key":1,"\u006bey":2}}"""
        .getBytes(StandardCharsets.US_ASCII)
    val failure = intercept[IllegalArgumentException] {
      parseStrictFixtureJson(duplicate, "duplicate fixture")
    }
    failure.getMessage should include ("duplicate JSON object key")
  }

  test("tracker value binds the application profile and burn commitment") {
    val source = cursor.downField("sourceBindings")
    val value = hex(requiredString(
      source.downField("trackerValueHex"),
      "tracker value"))
    value.length shouldBe 370
    value.slice(0, 38) should contain theSameElementsInOrderAs
      TrackerValueDomain
    value.slice(38, 42) should contain theSameElementsInOrderAs
      Array(2.toByte, 1.toByte, 1.toByte, 0.toByte)
    hex(value.slice(42, 74)) shouldBe requiredString(
      source.downField("bridgeEventRootHex"),
      "tracker bridge event root")
    hex(value.slice(178, 210)) shouldBe ApplicationBindingDigest
    hex(value.slice(210, 242)) shouldBe SettlementProfileId
    hex(value.slice(242, 274)) shouldBe CausalProfileId
    hex(value.slice(274, 306)) shouldBe requiredString(
      source.downField("applicationPayloadBlake2b256Hex"),
      "application payload digest")
    hex(value.slice(306, 338)) shouldBe ProgramId
    hex(value.slice(338, 370)) shouldBe VerifierProfileId

    val plan = cursor.downField("settlementPlan")
    requiredString(plan.downField("trackerValueHex"),
      "planned tracker value") shouldBe hex(value)
    requiredString(plan.downField("trackerKeyHex"),
      "planned tracker key") shouldBe requiredString(
      source.downField("trackerKeyHex"),
      "source tracker key")
    requiredInt(plan.downField("leafCount"),
      "planned leaf count") shouldBe unsignedInt(value.slice(174, 178))
    requiredString(plan.downField("applicationBindingDigestHex"),
      "planned application binding") shouldBe ApplicationBindingDigest
    requiredString(plan.downField("programIdHex"),
      "planned program ID") shouldBe ProgramId
    requiredString(plan.downField("verifierProfileIdHex"),
      "planned verifier profile") shouldBe VerifierProfileId
  }

  test("partial and terminal transactions accept both protected predicates") {
    assertAccepted(
      "partial application-bound settlement",
      transaction,
      inputBoxes,
      dataBoxes,
      currentHeight)

    val baseline = transaction
    val terminalVaultValue = baseline.outputCandidates(1).value
    val terminalVault = copyBox(inputBoxes(1))(value = terminalVaultValue)
    val terminalInputs =
      IndexedSeq(inputBoxes(0), terminalVault, inputBoxes(2))
    val terminalTransaction = copyTransaction(baseline)(
      inputs = IndexedSeq(
        baseline.inputs(0),
        Input(terminalVault.id, baseline.inputs(1).spendingProof),
        baseline.inputs(2)),
      outputCandidates = IndexedSeq(
        baseline.outputCandidates(0),
        baseline.outputCandidates(1),
        baseline.outputCandidates.last))
    assertAccepted(
      "terminal application-bound settlement",
      terminalTransaction,
      terminalInputs,
      dataBoxes,
      currentHeight)
  }

  test("tracker proposition, singleton, registers, proof, and age fail closed") {
    val tracker = dataBoxes.head
    val wrongTree = copyBox(tracker)(
      ergoTree = ErgoTree.fromProposition(TrivialProp.TrueProp))
    assertRejected(
      "tracker proposition substitution",
      withDataBox(transaction, wrongTree),
      inputBoxes,
      IndexedSeq(wrongTree),
      currentHeight,
      Set(0, 1))

    val trackerToken = tracker.additionalTokens(0)
    val extra = token("92" * 32, 1L)
    Vector(
      Colls.fromArray(Array(token("93" * 32, 1L))),
      Colls.fromArray(Array(trackerToken._1 -> 2L)),
      Colls.fromArray(Array(trackerToken, extra))
    ).zipWithIndex.foreach { case (tokens, index) =>
      val changed = copyBox(tracker)(additionalTokens = tokens)
      assertRejected(
        s"tracker singleton mutation $index",
        withDataBox(transaction, changed),
        inputBoxes,
        IndexedSeq(changed),
        currentHeight,
        Set(0, 1))
    }

    Vector(ErgoBox.R6, ErgoBox.R9).foreach { registerId =>
      val changed = copyBox(tracker)(
        additionalRegisters = tracker.additionalRegisters.toMap.updated(
          registerId,
          flippedBytes(tracker.additionalRegisters(registerId), 0)))
      assertRejected(
        s"tracker R${registerId.number} mutation",
        withDataBox(transaction, changed),
        inputBoxes,
        IndexedSeq(changed),
        currentHeight,
        Set(0, 1))
    }
    val wrongDigest = copyBox(tracker)(
      additionalRegisters = tracker.additionalRegisters.toMap.updated(
        ErgoBox.R5,
        inputBoxes(0).additionalRegisters(ErgoBox.R5)))
    assertRejected(
      "tracker authenticated digest substitution",
      withDataBox(transaction, wrongDigest),
      inputBoxes,
      IndexedSeq(wrongDigest),
      currentHeight,
      Set(1))

    assertRejected(
      "tracker membership proof",
      mutateExtension(transaction, 1, 1, 0),
      inputBoxes,
      dataBoxes,
      currentHeight,
      Set(1))
    assertRejected(
      "anchor one confirmation too young",
      transaction,
      inputBoxes,
      dataBoxes,
      currentHeight - 1,
      Set(1))
  }

  test("burn leaf, compact bundle, payout binding, and DUP proofs fail closed") {
    Vector(
      (2, 0, "burn leaf version"),
      (2, 1, "burn leaf sidechain"),
      (2, 33, "burn leaf execution block"),
      (2, 65, "burn leaf burn ID"),
      (2, 97, "burn leaf transaction"),
      (2, 129, "burn leaf event index"),
      (2, 133, "burn leaf recipient"),
      (2, 165, "burn leaf amount"),
      (2, 173, "burn leaf asset"),
      (3, 0, "bundle domain"),
      (3, 46, "bundle version"),
      (3, 47, "bundle hash profile"),
      (3, 48, "bundle source profile"),
      (3, 49, "bundle flags"),
      (3, 50, "bundle sidechain height"),
      (3, 58, "bundle leaf index"),
      (3, 66, "bundle leaf count"),
      (3, 74, "bundle path count"),
      (3, 82, "bundle DUP lookup length"),
      (3, -1, "bundle DUP insert tail")
    ).foreach { case (variableId, offset, label) =>
      assertRejected(
        label,
        mutateExtension(transaction, 1, variableId, offset),
        inputBoxes,
        dataBoxes,
        currentHeight,
        Set(1))
    }

    val bundle = extensionBytes(transaction, 1, 3)
    bundle.length should be >= 90
    bundle.slice(0, 46) should contain theSameElementsInOrderAs
      SettlementBundleDomain
    val pathCount = unsignedLongAsInt(bundle.slice(74, 82))
    val leafCount = unsignedLongAsInt(bundle.slice(66, 74))
    val leafIndex = unsignedLongAsInt(bundle.slice(58, 66))
    leafCount should be >= 1
    leafCount should be <= 256
    leafIndex should be >= 0
    leafIndex should be < leafCount
    pathCount shouldBe expectedMerkleDepth(leafCount)

    val uint32MaxLength = Array.fill[Byte](8)(0)
    java.util.Arrays.fill(
      uint32MaxLength,
      4,
      8,
      0xff.toByte)
    assertRejected(
      "DUP lookup length above signed Int",
      replaceExtensionBytes(
        transaction,
        1,
        3,
        82,
        uint32MaxLength),
      inputBoxes,
      dataBoxes,
      currentHeight,
      Set(1))

    assertRejected(
      "zero-length DUP lookup proof",
      replaceExtensionBytes(
        transaction,
        1,
        3,
        82,
        Array.fill[Byte](8)(0)),
      inputBoxes,
      dataBoxes,
      currentHeight,
      Set(1))

    val availableDupProofBytes =
      bundle.length - (90 + pathCount * 33)
    val consumesInsertProof = Array.fill[Byte](8)(0)
    putUnsignedLong(
      consumesInsertProof,
      0,
      availableDupProofBytes)
    assertRejected(
      "DUP lookup length consumes insert proof",
      replaceExtensionBytes(
        transaction,
        1,
        3,
        82,
        consumesInsertProof),
      inputBoxes,
      dataBoxes,
      currentHeight,
      Set(1))

    if (pathCount > 0) {
      assertRejected(
        "burn path side or sibling",
        mutateExtension(transaction, 1, 3, 90),
        inputBoxes,
        dataBoxes,
        currentHeight,
        Set(1))
    }

    val count257 = Array.fill[Byte](8)(0)
    count257(6) = 1.toByte
    count257(7) = 1.toByte
    assertRejected(
      "leaf count above 256",
      replaceExtensionBytes(transaction, 1, 3, 66, count257),
      inputBoxes,
      dataBoxes,
      currentHeight,
      Set(1))

    Vector(
      (0, 0, "DUP non-membership proof"),
      (1, 0, "DUP burn ID"),
      (2, -1, "DUP insertion proof")
    ).foreach { case (variableId, offset, label) =>
      assertRejected(
        label,
        mutateExtension(transaction, 0, variableId, offset),
        inputBoxes,
        dataBoxes,
        currentHeight,
        Set(0))
    }
  }

  test("single-leaf settlement accepts and rejects depth, node, and root drift") {
    val base = transaction
    val boxes = inputBoxes
    val leaf = extensionBytes(base, 1, 2)
    val leafRoot = Blake2b256(BurnLeafDomain ++ leaf)
    val singleBundle = singleLeafBundle(base)
    val (singleTracker, singleTrackerProof) =
      trackerVariant(leafRoot, 1)
    val single = withTrackerAndBundle(
      base,
      singleTracker,
      singleTrackerProof,
      singleBundle)
    assertAccepted(
      "single-leaf application settlement",
      single,
      boxes,
      IndexedSeq(singleTracker),
      currentHeight)

    val unexpectedNodeBundle =
      singleBundle.take(90) ++
        Array(1.toByte) ++
        leafRoot ++
        singleBundle.drop(90)
    putUnsignedLong(unexpectedNodeBundle, 74, 1)
    assertRejected(
      "single-leaf unexpected Merkle node",
      withTrackerAndBundle(
        base,
        singleTracker,
        singleTrackerProof,
        unexpectedNodeBundle),
      boxes,
      IndexedSeq(singleTracker),
      currentHeight,
      Set(1))

    val wrongDepthBundle = singleBundle.clone()
    putUnsignedLong(wrongDepthBundle, 66, 2)
    val (wrongDepthTracker, wrongDepthProof) =
      trackerVariant(leafRoot, 2)
    assertRejected(
      "single-leaf wrong Merkle depth",
      withTrackerAndBundle(
        base,
        wrongDepthTracker,
        wrongDepthProof,
        wrongDepthBundle),
      boxes,
      IndexedSeq(wrongDepthTracker),
      currentHeight,
      Set(1))

    val wrongRoot = leafRoot.clone()
    wrongRoot(0) = (wrongRoot(0) ^ 1).toByte
    val (wrongRootTracker, wrongRootProof) =
      trackerVariant(wrongRoot, 1)
    assertRejected(
      "single-leaf wrong tracker root",
      withTrackerAndBundle(
        base,
        wrongRootTracker,
        wrongRootProof,
        singleBundle),
      boxes,
      IndexedSeq(wrongRootTracker),
      currentHeight,
      Set(1))
  }

  test("source intent, replay state, successors, fee, and ordering fail closed") {
    assertSettlementOutputBoundaries()
  }

  test("required context variables reject and the canonical serializer excludes extras") {
    val tx = transaction
    val expected = Vector(
      Set(0.toByte, 1.toByte, 2.toByte),
      Set(0.toByte, 1.toByte, 2.toByte, 3.toByte),
      Set.empty[Byte])
    tx.inputs.zipWithIndex.foreach { case (input, index) =>
      exactExtensionShape(input.extension, expected(index)) shouldBe true
    }

    Vector(
      0 -> Set(0, 1, 2),
      1 -> Set(0, 1, 2, 3)
    ).foreach { case (inputIndex, variables) =>
      variables.foreach { variableId =>
        val missing = withExtension(
          tx,
          inputIndex,
          ContextExtension(
            tx.inputs(inputIndex).extension.values.toMap -
              variableId.toByte))
        assertRejected(
          s"missing input $inputIndex variable $variableId",
          missing,
          inputBoxes,
          dataBoxes,
          currentHeight,
          Set(inputIndex))

        val mistyped = withExtension(
          tx,
          inputIndex,
          ContextExtension(
            tx.inputs(inputIndex).extension.values.toMap.updated(
              variableId.toByte,
              IntConstant(1))))
        assertRejected(
          s"mistyped input $inputIndex variable $variableId",
          mistyped,
          inputBoxes,
          dataBoxes,
          currentHeight,
          Set(inputIndex))
      }
    }

    Vector(0, 1).foreach { inputIndex =>
      val values = tx.inputs(inputIndex).extension.values.toMap
      val crossWired = withExtension(
        tx,
        inputIndex,
        ContextExtension(
          values
            .updated(0.toByte, values(1.toByte))
            .updated(1.toByte, values(0.toByte))))
      assertRejected(
        s"cross-wired input $inputIndex variables",
        crossWired,
        inputBoxes,
        dataBoxes,
        currentHeight,
        Set(inputIndex))
    }

    val extra = ContextExtension(
      tx.inputs(1).extension.values.toMap.updated(
        4.toByte,
        ByteArrayConstant(Array(1.toByte))))
    // ErgoScript cannot enumerate ContextExtension keys. Exact-shape exclusion
    // is therefore a serializer guard, while required-key failures reduce in VM.
    exactExtensionShape(extra, expected(1)) shouldBe false
  }

  test("the isolated V1 tracker proposition cannot authorize V2 settlement") {
    val compatibility = cursor.downField("compatibility")
    requiredString(
      compatibility.downField("v1TrackerContractIdHex"),
      "V1 tracker contract ID") shouldBe LegacyV1TrackerContractId
    requiredString(
      compatibility.downField("v1TrackerPropositionSha256Hex"),
      "V1 tracker proposition SHA-256") shouldBe
      LegacyV1TrackerPropositionSha256
    val legacyBytes = hex(requiredString(
      compatibility.downField("v1TrackerPropositionHex"),
      "V1 tracker proposition"))
    legacyBytes.length shouldBe 1784
    sha256(legacyBytes) shouldBe LegacyV1TrackerPropositionSha256
    hex(Blake2b256(legacyBytes)) shouldBe LegacyV1TrackerContractId
    val legacyTree =
      ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(legacyBytes)
    val changed = copyBox(dataBoxes.head)(ergoTree = legacyTree)
    assertRejected(
      "V1 tracker proposition under unchanged V2 state",
      withDataBox(transaction, changed),
      inputBoxes,
      IndexedSeq(changed),
      currentHeight,
      Set(0, 1))
  }

  test("provenance mutations reject before they become settlement evidence") {
    val source = cursor.downField("sourceBindings")
    val canonical = Vector(
      requiredString(source.downField("trackerContextSha256Hex"),
        "tracker context SHA-256"),
      requiredString(source.downField("trackerProoflessTransactionIdHex"),
        "tracker transaction ID"),
      requiredString(source.downField("contractIdentitySha256Hex"),
        "contract identity SHA-256"),
      requiredString(source.downField("frontierVectorNormalizedLfSha256Hex"),
        "normalized-LF Frontier vector SHA-256"),
      requiredString(source.downField("frontierVectorSchema"),
        "Frontier vector schema"))
    provenanceErrors(canonical) shouldBe empty
    canonical.indices.foreach { index =>
      val changed =
        if (index == 4)
          canonical.updated(index, canonical(index) + "-changed")
        else
          canonical.updated(index, flipHex(canonical(index)))
      provenanceErrors(changed) should have size 1
    }
  }

  test("local JVM reduction preserves every preactivation claim cap") {
    val boundaries = cursor.downField("boundaries")
    requiredBoolean(
      boundaries.downField("exactWp06adTrackerContextConsumed"),
      "exact WP-06AD tracker boundary") shouldBe true
    requiredBoolean(
      boundaries.downField("applicationPayloadCrossCheckedOffChain"),
      "application payload boundary") shouldBe true
    requiredBoolean(
      boundaries.downField("canonicalBurnPathValidatedByPlanner"),
      "canonical burn path boundary") shouldBe true
    requiredBoolean(
      boundaries.downField("payloadOrReceiptTransportedToSettlement"),
      "payload transport boundary") shouldBe false
    requiredBoolean(
      boundaries.downField("exactContractIdentityReceiptConsumed"),
      "contract identity receipt boundary") shouldBe true
    requiredBoolean(
      boundaries.downField("frontierRootAndCountMatchedTracker"),
      "Frontier root/count boundary") shouldBe true
    requiredBoolean(
      boundaries.downField("publicFrontierRootVectorProvenanceMatched"),
      "Frontier vector provenance boundary") shouldBe true
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
      "targetNodeAcceptanceEstablished",
      "proofValidityEstablishedInPayoutTransaction",
      "gate5Closed",
      "fundsAuthorityEstablished").foreach { field =>
      requiredBoolean(boundaries.downField(field), field) shouldBe false
    }
  }

  private def assertSettlementOutputBoundaries(): Unit = {
    val tx = transaction
    val boxes = inputBoxes
    val data = dataBoxes
    val outputs = tx.outputCandidates
    val dup = boxes(0)
    val vault = boxes(1)
    val feeInput = boxes(2)
    val dupOut = outputs(0)
    val payout = outputs(1)
    val vaultOut = outputs(2)
    val fee = outputs(3)

    Vector(
      copyCandidate(dupOut)(value = dupOut.value + 1L),
      copyCandidate(dupOut)(
        ergoTree = ErgoTree.fromProposition(TrivialProp.TrueProp)),
      copyCandidate(dupOut)(
        additionalTokens = Colls.fromArray(Array(
          dupOut.additionalTokens(0)._1 -> 2L))),
      copyCandidate(dupOut)(
        additionalRegisters = dupOut.additionalRegisters.toMap.updated(
          ErgoBox.R4,
          LongConstant(
            dupOut.additionalRegisters(ErgoBox.R4)
              .value.asInstanceOf[Long] + 1L))),
      copyCandidate(dupOut)(
        additionalRegisters = dupOut.additionalRegisters.toMap.updated(
          ErgoBox.R5,
          dup.additionalRegisters(ErgoBox.R5))),
      copyCandidate(dupOut)(
        additionalRegisters = dupOut.additionalRegisters.toMap.updated(
          ErgoBox.R6,
          flippedBytes(dupOut.additionalRegisters(ErgoBox.R6), 0)))
    ).zipWithIndex.foreach { case (changed, index) =>
      assertRejected(
        s"DUP successor mutation $index",
        withOutputs(tx, outputs.updated(0, changed)),
        boxes,
        data,
        currentHeight,
        if (index <= 1 || index == 3) Set(0) else Set(0, 1))
    }

    val maxCounterDup = copyBox(dup)(
      additionalRegisters = dup.additionalRegisters.toMap.updated(
        ErgoBox.R4,
        LongConstant(Long.MaxValue)))
    val wrappedCounterOut = copyCandidate(dupOut)(
      additionalRegisters = dupOut.additionalRegisters.toMap.updated(
        ErgoBox.R4,
        LongConstant(Long.MinValue)))
    assertRejected(
      "DUP counter overflow",
      withOutputs(
        withSpendingBox(tx, 0, maxCounterDup),
        outputs.updated(0, wrappedCounterOut)),
      boxes.updated(0, maxCounterDup),
      data,
      currentHeight,
      Set(0))

    val negativeCounterDup = copyBox(dup)(
      additionalRegisters = dup.additionalRegisters.toMap.updated(
        ErgoBox.R4,
        LongConstant(-1L)))
    assertRejected(
      "negative DUP counter",
      withSpendingBox(tx, 0, negativeCounterDup),
      boxes.updated(0, negativeCounterDup),
      data,
      currentHeight,
      Set(0))

    val wrongDupProfile = copyBox(dup)(
      additionalRegisters = dup.additionalRegisters.toMap.updated(
        ErgoBox.R6,
        flippedBytes(dup.additionalRegisters(ErgoBox.R6), 0)))
    assertRejected(
      "DUP input profile",
      withSpendingBox(tx, 0, wrongDupProfile),
      boxes.updated(0, wrongDupProfile),
      data,
      currentHeight,
      Set(0, 1))
    val priorSpent = copyBox(dup)(
      additionalRegisters = dup.additionalRegisters.toMap.updated(
        ErgoBox.R5,
        dupOut.additionalRegisters(ErgoBox.R5)))
    assertRejected(
      "prior DUP membership",
      withSpendingBox(tx, 0, priorSpent),
      boxes.updated(0, priorSpent),
      data,
      currentHeight,
      Set(0, 1))

    val sourceIntent = vault.additionalRegisters(ErgoBox.R4)
      .value.asInstanceOf[Coll[Byte]].toArray
    sourceIntent.length shouldBe 229
    hex(sourceIntent.slice(1, 33)) shouldBe SourceNetworkId
    hex(sourceIntent.slice(33, 65)) shouldBe SidechainId
    hex(sourceIntent.slice(65, 85)) shouldBe BridgeAddress
    hex(sourceIntent.slice(85, 105)) shouldBe TokenAddress
    hex(sourceIntent.slice(105, 137)) shouldBe SettlementProfileId
    hex(sourceIntent.slice(137, 169)) shouldBe CausalProfileId
    hex(sourceIntent.slice(169, 201)) shouldBe "00" * 32
    Vector(
      1 -> "source network",
      33 -> "source sidechain",
      65 -> "source bridge address",
      85 -> "source token address",
      105 -> "source settlement profile",
      137 -> "source causal profile",
      169 -> "source asset",
      201 -> "source amount",
      209 -> "source recipient"
    ).foreach { case (offset, label) =>
      val bytes = sourceIntent.clone()
      bytes(offset) = (bytes(offset) ^ 1).toByte
      val changed = copyBox(vault)(
        additionalRegisters = vault.additionalRegisters.toMap.updated(
          ErgoBox.R4,
          ByteArrayConstant(bytes)))
      assertRejected(
        label,
        withSpendingBox(tx, 1, changed),
        boxes.updated(1, changed),
        data,
        currentHeight,
        Set(1))
    }
    val zeroSourceBox = copyBox(vault)(
      additionalRegisters = vault.additionalRegisters.toMap.updated(
        ErgoBox.R5,
        ByteArrayConstant(Array.fill(32)(0.toByte))))
    assertRejected(
      "zero consumed source-box ID",
      withSpendingBox(tx, 1, zeroSourceBox),
      boxes.updated(1, zeroSourceBox),
      data,
      currentHeight,
      Set(1))
    val tokenizedVault = copyBox(vault)(
      additionalTokens = Colls.fromArray(Array(token("94" * 32, 1L))))
    assertRejected(
      "tokenized causal vault",
      withSpendingBox(tx, 1, tokenizedVault),
      boxes.updated(1, tokenizedVault),
      data,
      currentHeight,
      Set(1))

    Vector(
      copyCandidate(payout)(value = payout.value + 1L),
      copyCandidate(payout)(
        ergoTree = ErgoTree.fromProposition(TrivialProp.TrueProp)),
      copyCandidate(payout)(
        additionalTokens = Colls.fromArray(Array(token("95" * 32, 1L))))
    ).zipWithIndex.foreach { case (changed, index) =>
      assertRejected(
        s"payout mutation $index",
        withOutputs(tx, outputs.updated(1, changed)),
        boxes,
        data,
        currentHeight,
        Set(1))
    }
    Vector(
      copyCandidate(vaultOut)(value = vaultOut.value + 1L),
      copyCandidate(vaultOut)(
        ergoTree = ErgoTree.fromProposition(TrivialProp.TrueProp)),
      copyCandidate(vaultOut)(
        additionalRegisters = vaultOut.additionalRegisters.toMap.updated(
          ErgoBox.R4,
          flippedBytes(vaultOut.additionalRegisters(ErgoBox.R4), 0))),
      copyCandidate(vaultOut)(
        additionalRegisters = vaultOut.additionalRegisters.toMap.updated(
          ErgoBox.R5,
          ByteArrayConstant(Array.fill(32)(0.toByte))))
    ).zipWithIndex.foreach { case (changed, index) =>
      assertRejected(
        s"vault successor mutation $index",
        withOutputs(tx, outputs.updated(2, changed)),
        boxes,
        data,
        currentHeight,
        Set(1))
    }

    val wrongFeeInput = copyBox(feeInput)(value = feeInput.value + 1L)
    assertRejected(
      "fee-funding input value",
      withSpendingBox(tx, 2, wrongFeeInput),
      boxes.updated(2, wrongFeeInput),
      data,
      currentHeight,
      Set(1))
    val tokenizedFeeInput = copyBox(feeInput)(
      additionalTokens = Colls.fromArray(Array(token("96" * 32, 1L))))
    assertRejected(
      "tokenized fee input",
      withSpendingBox(tx, 2, tokenizedFeeInput),
      boxes.updated(2, tokenizedFeeInput),
      data,
      currentHeight,
      Set(1))
    Vector(
      copyCandidate(fee)(value = 999999L),
      copyCandidate(fee)(
        ergoTree = ErgoTree.fromProposition(TrivialProp.TrueProp))
    ).zipWithIndex.foreach { case (changed, index) =>
      assertRejected(
        s"fee output mutation $index",
        withOutputs(tx, outputs.updated(3, changed)),
        boxes,
        data,
        currentHeight,
        Set(1))
    }

    val delayed = outputs
      .updated(0, copyCandidate(dupOut)(creationHeight = currentHeight - 1))
      .updated(2, copyCandidate(vaultOut)(
        creationHeight = currentHeight - 1))
    assertAccepted(
      "mempool-delayed state successors",
      withOutputs(tx, delayed),
      boxes,
      data,
      currentHeight)
    Vector(
      0 -> copyCandidate(dupOut)(creationHeight = currentHeight + 1),
      2 -> copyCandidate(vaultOut)(creationHeight = currentHeight + 1)
    ).foreach { case (outputIndex, changed) =>
      assertRejected(
        s"future state successor $outputIndex",
        withOutputs(tx, outputs.updated(outputIndex, changed)),
        boxes,
        data,
        currentHeight,
        Set(if (outputIndex == 0) 0 else 1))
    }

    assertRejected(
      "output ordering",
      withOutputs(tx, IndexedSeq(
        outputs(1), outputs(0), outputs(2), outputs(3))),
      boxes,
      data,
      currentHeight,
      Set(0, 1))
    val swappedBoxes = IndexedSeq(vault, dup, feeInput)
    val swappedTransaction = copyTransaction(tx)(
      inputs = IndexedSeq(
        Input(vault.id, tx.inputs(1).spendingProof),
        Input(dup.id, tx.inputs(0).spendingProof),
        tx.inputs(2)))
    assertRejected(
      "spending input ordering",
      swappedTransaction,
      swappedBoxes,
      data,
      currentHeight,
      Set(0, 1))
    assertRejected(
      "missing tracker data input",
      copyTransaction(tx)(dataInputs = IndexedSeq.empty),
      boxes,
      IndexedSeq.empty,
      currentHeight,
      Set(0, 1))
    val extraTracker = copyBox(data.head)(index = 1.toShort)
    assertRejected(
      "extra tracker data input",
      copyTransaction(tx)(
        dataInputs = IndexedSeq(
          DataInput(data.head.id),
          DataInput(extraTracker.id))),
      boxes,
      IndexedSeq(data.head, extraTracker),
      currentHeight,
      Set(0, 1))
    val wrongVaultTree = copyBox(vault)(
      ergoTree = ErgoTree.fromProposition(TrivialProp.TrueProp))
    assertRejected(
      "DUP-to-vault proposition binding",
      withSpendingBox(tx, 1, wrongVaultTree),
      boxes.updated(1, wrongVaultTree),
      data,
      currentHeight,
      Set(0))
  }

  private def assertPinnedProvenance(source: ACursor): Unit = {
    val pinned = Vector(
      requiredString(source.downField("trackerContextSha256Hex"),
        "tracker context SHA-256"),
      requiredString(source.downField("trackerProoflessTransactionIdHex"),
        "tracker transaction ID"),
      requiredString(source.downField("contractIdentitySha256Hex"),
        "contract identity SHA-256"),
      requiredString(source.downField("frontierVectorNormalizedLfSha256Hex"),
        "normalized-LF Frontier vector SHA-256"),
      requiredString(source.downField("frontierVectorSchema"),
        "Frontier vector schema"))
    provenanceErrors(pinned) shouldBe empty
  }

  private def parseStrictFixtureJson(
      bytes: Array[Byte],
      label: String): Json = {
    if (bytes.isEmpty || bytes.exists(byte => (byte & 0xff) > 0x7f)) {
      throw new IllegalArgumentException(
        s"$label must be non-empty ASCII JSON")
    }
    val text = new String(bytes, StandardCharsets.US_ASCII)
    val value = parser.parse(text).fold(
      failure => throw new IllegalArgumentException(
        s"$label JSON rejected: ${failure.getMessage}"),
      identity)
    new DuplicateJsonKeyScanner(text, label).validate()
    value
  }

  private final class DuplicateJsonKeyScanner(
      text: String,
      label: String) {
    private var offset = 0

    def validate(): Unit = {
      skipWhitespace()
      scanValue()
      skipWhitespace()
      if (offset != text.length) {
        fail("contains trailing JSON bytes")
      }
    }

    private def scanValue(): Unit = {
      skipWhitespace()
      if (offset >= text.length) fail("contains a truncated JSON value")
      text.charAt(offset) match {
        case '{' => scanObject()
        case '[' => scanArray()
        case '"' =>
          val _ = scanString()
        case 't' => scanLiteral("true")
        case 'f' => scanLiteral("false")
        case 'n' => scanLiteral("null")
        case value if value == '-' || value.isDigit => scanNumber()
        case _ => fail("contains an unsupported JSON token")
      }
    }

    private def scanObject(): Unit = {
      consume('{')
      skipWhitespace()
      if (consumeIf('}')) return
      val keys = scala.collection.mutable.HashSet.empty[String]
      var complete = false
      while (!complete) {
        skipWhitespace()
        if (offset >= text.length || text.charAt(offset) != '"') {
          fail("contains a non-string JSON object key")
        }
        val key = scanString()
        if (!keys.add(key)) {
          fail(s"contains duplicate JSON object key '$key'")
        }
        skipWhitespace()
        consume(':')
        scanValue()
        skipWhitespace()
        if (consumeIf(',')) {
          skipWhitespace()
        } else if (consumeIf('}')) {
          complete = true
        } else {
          fail("contains an unterminated JSON object")
        }
      }
    }

    private def scanArray(): Unit = {
      consume('[')
      skipWhitespace()
      if (consumeIf(']')) return
      var complete = false
      while (!complete) {
        scanValue()
        skipWhitespace()
        if (consumeIf(',')) {
          skipWhitespace()
        } else if (consumeIf(']')) {
          complete = true
        } else {
          fail("contains an unterminated JSON array")
        }
      }
    }

    private def scanString(): String = {
      consume('"')
      val decoded = new java.lang.StringBuilder()
      while (offset < text.length) {
        val value = text.charAt(offset)
        offset += 1
        if (value == '"') return decoded.toString
        if (value != '\\') {
          decoded.append(value)
        } else {
          if (offset >= text.length) fail("contains a truncated JSON escape")
          val escaped = text.charAt(offset)
          offset += 1
          escaped match {
            case '"' => decoded.append('"')
            case '\\' => decoded.append('\\')
            case '/' => decoded.append('/')
            case 'b' => decoded.append('\b')
            case 'f' => decoded.append('\f')
            case 'n' => decoded.append('\n')
            case 'r' => decoded.append('\r')
            case 't' => decoded.append('\t')
            case 'u' =>
              if (offset + 4 > text.length) {
                fail("contains a truncated Unicode escape")
              }
              val encoded = text.substring(offset, offset + 4)
              if (!encoded.forall(isHexDigit)) {
                fail("contains an invalid Unicode escape")
              }
              decoded.append(Integer.parseInt(encoded, 16).toChar)
              offset += 4
            case _ => fail("contains an invalid JSON escape")
          }
        }
      }
      fail("contains an unterminated JSON string")
    }

    private def scanLiteral(expected: String): Unit = {
      if (!text.startsWith(expected, offset)) {
        fail(s"contains an invalid '$expected' token")
      }
      offset += expected.length
    }

    private def scanNumber(): Unit = {
      val start = offset
      while (
        offset < text.length &&
        "-+0123456789.eE".indexOf(text.charAt(offset)) >= 0
      ) {
        offset += 1
      }
      if (offset == start) fail("contains an invalid JSON number")
    }

    private def consume(expected: Char): Unit = {
      if (offset >= text.length || text.charAt(offset) != expected) {
        fail(s"expected '$expected'")
      }
      offset += 1
    }

    private def consumeIf(expected: Char): Boolean = {
      if (offset < text.length && text.charAt(offset) == expected) {
        offset += 1
        true
      } else false
    }

    private def skipWhitespace(): Unit = {
      while (
        offset < text.length &&
        " \t\r\n".indexOf(text.charAt(offset)) >= 0
      ) {
        offset += 1
      }
    }

    private def isHexDigit(value: Char): Boolean =
      (value >= '0' && value <= '9') ||
      (value >= 'a' && value <= 'f') ||
      (value >= 'A' && value <= 'F')

    private def fail(message: String): Nothing =
      throw new IllegalArgumentException(
        s"$label $message at byte $offset")
  }

  private def provenanceErrors(value: Vector[String]): Vector[String] = {
    require(value.length == 5, "expected five provenance fields")
    Vector(
      "tracker context SHA-256" ->
        (value(0) != TrackerContextSha256),
      "tracker transaction ID" ->
        (value(1) != TrackerTransactionId),
      "contract identity SHA-256" ->
        (value(2) != ContractIdentitySha256),
      "normalized-LF Frontier vector SHA-256" ->
        (value(3) != FrontierVectorNormalizedLfSha256),
      "Frontier vector schema" ->
        (value(4) != FrontierVectorSchema)
    ).collect { case (label, true) => label }
  }

  private def assertContractIdentity(
      value: ACursor,
      label: String,
      contractId: String,
      templateSha256: String,
      sourceSha256: String,
      propositionSha256: String,
      propositionBytes: Int): Unit = {
    requiredString(value.downField("contractIdHex"),
      s"$label contract ID") shouldBe contractId
    requiredString(value.downField("templateSha256Hex"),
      s"$label template SHA-256") shouldBe templateSha256
    requiredString(value.downField("resolvedSourceSha256Hex"),
      s"$label source SHA-256") shouldBe sourceSha256
    requiredString(value.downField("propositionSha256Hex"),
      s"$label proposition SHA-256") shouldBe propositionSha256
    requiredInt(value.downField("propositionBytes"),
      s"$label proposition bytes") shouldBe propositionBytes
    val proposition = hex(requiredString(
      value.downField("propositionHex"),
      s"$label proposition"))
    proposition.length shouldBe propositionBytes
    sha256(proposition) shouldBe propositionSha256
    hex(Blake2b256(proposition)) shouldBe contractId
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
          "fresh transaction input IDs do not match spending boxes")
        require(
          freshTransaction.dataInputs.length == freshData.length &&
            freshTransaction.dataInputs.zip(freshData).forall {
              case (input, box) =>
                java.util.Arrays.equals(input.boxId, box.id)
            },
          "fresh transaction data-input IDs do not match data boxes")
        val extension = freshTransaction.inputs(index).extension
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
        val realizedOutputValues =
          freshTransaction.outputs.map(_.value)
        require(
          realizedOutputValues ==
            freshTransaction.outputCandidates.map(_.value),
          "transaction output materialization changed output values")
        val result = new ErgoLikeTestInterpreter().verify(
          freshBoxes(index).ergoTree,
          context,
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
    val value = extensionBytes(tx, inputIndex, variableId)
    val index = if (byteOffset < 0) value.length - 1 else byteOffset
    require(
      index >= 0 && index < value.length,
      s"mutation offset $byteOffset is outside variable $variableId")
    value(index) = (value(index) ^ 1).toByte
    replaceExtensionVariable(tx, inputIndex, variableId, value)
  }

  private def replaceExtensionBytes(
      tx: ErgoLikeTransaction,
      inputIndex: Int,
      variableId: Int,
      offset: Int,
      replacement: Array[Byte]): ErgoLikeTransaction = {
    val value = extensionBytes(tx, inputIndex, variableId)
    require(
      offset >= 0 && offset + replacement.length <= value.length,
      "replacement is outside ContextExtension variable")
    System.arraycopy(replacement, 0, value, offset, replacement.length)
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
          ByteArrayConstant(value))))
  }

  private def singleLeafBundle(tx: ErgoLikeTransaction): Array[Byte] = {
    val bundle = extensionBytes(tx, 1, 3)
    val nodeCount = unsignedLongAsInt(bundle.slice(74, 82))
    val burnProofBytes = nodeCount * 33
    require(
      nodeCount == expectedMerkleDepth(3) &&
        bundle.length > 90 + burnProofBytes,
      "canonical fixture must contain the expected three-leaf proof")
    val single =
      bundle.take(90) ++ bundle.drop(90 + burnProofBytes)
    putUnsignedLong(single, 58, 0)
    putUnsignedLong(single, 66, 1)
    putUnsignedLong(single, 74, 0)
    single
  }

  private def trackerVariant(
      bridgeEventRoot: Array[Byte],
      burnCount: Int): (ErgoBox, Array[Byte]) = {
    require(
      bridgeEventRoot.length == 32 && burnCount > 0,
      "tracker variant requires a root and positive count")
    val source = cursor.downField("sourceBindings")
    val keyBytes = hex(requiredString(
      source.downField("trackerKeyHex"),
      "tracker key"))
    val valueBytes = hex(requiredString(
      source.downField("trackerValueHex"),
      "tracker value"))
    System.arraycopy(bridgeEventRoot, 0, valueBytes, 42, 32)
    putUnsignedInt(valueBytes, 174, burnCount)

    val prover =
      new BatchAVLProver[Digest32, Blake2b256.type](
        keyLength = 32,
        valueLengthOpt = Some(370))
    val key = keyBytes.clone().asInstanceOf[ADKey]
    val value = valueBytes.clone().asInstanceOf[ADValue]
    require(
      prover.performOneOperation(Insert(key, value)).isSuccess,
      "tracker variant insert must succeed")
    val _ = prover.generateProof()
    val digest = prover.digest.clone()
    require(
      prover.performOneOperation(Lookup(key)).isSuccess,
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

  private def withTrackerAndBundle(
      tx: ErgoLikeTransaction,
      tracker: ErgoBox,
      trackerProof: Array[Byte],
      bundle: Array[Byte]): ErgoLikeTransaction = {
    val withProof =
      replaceExtensionVariable(tx, 1, 1, trackerProof)
    val withBundle =
      replaceExtensionVariable(withProof, 1, 3, bundle)
    withDataBox(withBundle, tracker)
  }

  private def putUnsignedInt(
      bytes: Array[Byte],
      offset: Int,
      value: Int): Unit = {
    require(
      value >= 0 && offset >= 0 && offset + 4 <= bytes.length,
      "unsigned Int replacement is out of bounds")
    bytes(offset) = ((value >>> 24) & 0xff).toByte
    bytes(offset + 1) = ((value >>> 16) & 0xff).toByte
    bytes(offset + 2) = ((value >>> 8) & 0xff).toByte
    bytes(offset + 3) = (value & 0xff).toByte
  }

  private def putUnsignedLong(
      bytes: Array[Byte],
      offset: Int,
      value: Int): Unit = {
    require(
      value >= 0 && offset >= 0 && offset + 8 <= bytes.length,
      "unsigned Long replacement is out of bounds")
    java.util.Arrays.fill(bytes, offset, offset + 8, 0.toByte)
    putUnsignedInt(bytes, offset + 4, value)
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

  private def exactExtensionShape(
      extension: ContextExtension,
      expected: Set[Byte]): Boolean =
    extension.values.keySet == expected

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

  private def expectedMerkleDepth(leafCount: Int): Int = {
    var width = leafCount
    var depth = 0
    while (width > 1) {
      width = (width + 1) / 2
      depth += 1
    }
    depth
  }

  private def unsignedInt(bytes: Array[Byte]): Int = {
    require(bytes.length == 4, "expected four-byte unsigned Int")
    ((bytes(0) & 0xff) << 24) |
      ((bytes(1) & 0xff) << 16) |
      ((bytes(2) & 0xff) << 8) |
      (bytes(3) & 0xff)
  }

  private def unsignedLongAsInt(bytes: Array[Byte]): Int = {
    require(bytes.length == 8, "expected eight-byte unsigned Long")
    require(
      bytes.slice(0, 4).forall(_ == 0.toByte),
      "fixture count exceeds JVM Int")
    unsignedInt(bytes.slice(4, 8))
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

  private def requiredInts(
      value: ACursor,
      label: String): IndexedSeq[Int] =
    value.focus.getOrElse(
      throw new IllegalArgumentException(s"$label missing"))
      .asArray.getOrElse(
        throw new IllegalArgumentException(s"$label must be an array"))
      .zipWithIndex.map { case (entry, index) =>
        entry.asNumber.flatMap(_.toInt).getOrElse(
          throw new IllegalArgumentException(
            s"$label entry $index must be an Int"))
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

  private def flipHex(value: String): String = {
    require(value.nonEmpty && value.matches("[0-9a-f]+"))
    val first = if (value.head == '0') '1' else '0'
    first + value.tail
  }
}
