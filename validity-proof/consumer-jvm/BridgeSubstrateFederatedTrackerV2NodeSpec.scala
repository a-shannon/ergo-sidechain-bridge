package org.ergoplatform.bridge

import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets.US_ASCII
import java.nio.file.{Files, Paths}
import java.security.MessageDigest

import com.typesafe.config.{ConfigFactory, ConfigResolveOptions}
import io.circe.{ACursor, DecodingFailure, Json, parser}
import net.ceedubs.ficus.Ficus._
import net.ceedubs.ficus.readers.ArbitraryTypeReader._
import org.ergoplatform.{ErgoBox, ErgoBoxCandidate, Input}
import org.ergoplatform.http.api.ApiCodecs
import org.ergoplatform.modifiers.history.header.{Header, HeaderSerializer}
import org.ergoplatform.modifiers.mempool.{ErgoTransaction, ErgoTransactionSerializer}
import org.ergoplatform.nodeView.state.{ErgoStateContext, UpcomingStateContext, VotingData}
import org.ergoplatform.settings.{ChainSettings, ErgoValidationSettings, MainnetLaunchParameters, Parameters, PowSchemeReaders, SettingsReaders}
import org.ergoplatform.settings.ModifierIdReader
import org.ergoplatform.wallet.interpreter.ErgoInterpreter
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.util.serialization.VLQByteBufferReader
import sigma.VersionContext
import sigma.ast.IntConstant
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.SigmaSerializer

import scala.util.{Failure, Success, Try}

/** Node-code validation of synthetic state, not HTTP, UTXO membership, mempool,
  * header consensus, or chain-resident acceptance. No signing or node services.
  * Source: Ergo 2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1, Sigma 6.0.2.
  * Run as the sole root Test / unmanagedSources entry on Scala 2.12.20.
  */
class BridgeSubstrateFederatedTrackerV2NodeSpec
    extends AnyFunSuite with Matchers with ApiCodecs with PowSchemeReaders with SettingsReaders with ModifierIdReader {
  private val Prefix = "bridge.substrate.federated.tracker.v2.node."
  private val ContextHash = "416300485667d83a62b13826cb6514f0969df0faad4ced9b2cdbadb58aee266b"
  private val TransactionId = "0b3e954926805417c209cd59c1c6620f4ee0872adc6d1c31beeff93bbf472085"
  private val BlockVersion = Header.Interpreter60Version
  private val ScriptVersion = Header.scriptFromBlockVersion(BlockVersion)

  private lazy val contextBytes = readFixture("context.fixture", ContextHash)
  private lazy val contextJson = json(contextBytes)
  private lazy val funded = contextJson.hcursor.downField("feeFundedContext")
  private lazy val transition = contextJson.hcursor.downField("wasmContext").downField("trackerTransition")
  private lazy val signedHash = requiredProperty("signed.fixture.sha256")
  private lazy val signedPacket = json(readFixture("signed.fixture", signedHash))
  private lazy val signedBytes = {
    val c = signedPacket.hcursor
    require(str(c, "schema") == "e2s.substrate-federated-tracker-v2-synthetic-wasm-signature", "signed schema")
    require(int(c, "version") == 2, "signed version")
    require(str(c, "fixtureSha256Hex") == ContextHash, "signed context binding")
    require(str(c, "unsignedTransactionIdHex") ==
      str(contextJson.hcursor.downField("wasmContext"), "unsignedTransactionIdHex"), "signed tracker binding")
    val bytes = unhex(str(c, "feeFundedSignedTransactionHex"))
    require(bytes.length == 4342, "signed byte length")
    bytes
  }
  private lazy val wireHash = requiredProperty("wire.fixture.sha256")
  private lazy val wirePacket = json(readFixture("wire.fixture", wireHash))
  private lazy val wireJson = checkedWire(wirePacket)
  private lazy val decoded = decode(wireJson).fold(e => fail(s"ApiCodecs: $e"), identity)
  private lazy val transaction = {
    val bytes = ErgoTransactionSerializer.toBytes(decoded)
    require(bytes.sameElements(signedBytes), "WASM JSON decoded signed bytes")
    require(decoded.id == TransactionId && str(wireJson.hcursor, "id") == TransactionId,
      "WASM JSON decoded transaction identity")
    val tx = reparse(bytes)
    val proofless = tx.copy(inputs = tx.inputs.map(i =>
      Input(i.boxId, ProverResult(Array.emptyByteArray, i.extension))), sizeOpt = None)
    require(ErgoTransactionSerializer.toBytes(proofless).sameElements(
      unhex(str(funded, "prooflessTransactionHex"))), "decoded proofless bytes")
    require(tx.id == TransactionId, "reparsed transaction identity")
    tx
  }
  private lazy val inputBoxes = strings(funded, "inputBoxSigmaHex").map { encoded =>
    inVersion {
      val bytes = unhex(encoded)
      val reader = SigmaSerializer.startReader(bytes.clone())
      val box = ErgoBox.sigmaSerializer.parse(reader)
      require(reader.remaining == 0, "input box trailing bytes")
      require(ErgoBox.sigmaSerializer.toBytes(box).sameElements(bytes), "input box bytes")
      box
    }
  }
  private lazy val headers = transition.downField("headers").as[Vector[Json]]
    .fold(e => fail(e.getMessage), identity).map { entry =>
      val c = entry.hcursor
      val bytes = unhex(str(c, "serializedHex"))
      val reader = new VLQByteBufferReader(ByteBuffer.wrap(bytes))
      val header = HeaderSerializer.parse(reader)
      require(reader.remaining == 0, "header trailing bytes")
      require(HeaderSerializer.toBytes(header).sameElements(bytes), "header byte roundtrip")
      require(header.id == str(c, "id"), "header identity")
      header
    }

  // Read only the public chain resource, with explicit production defaults.
  // Do not load application.conf, system overrides, wallet settings or node state.
  private lazy val chainSettings: ChainSettings = {
    val defaults = ConfigFactory.parseString("""
      blockInterval = 2m
      epochLength = 1024
      useLastEpochs = 8
      makeSnapshotEvery = 52224
      foundersPubkeys = []
      monetary {
        fixedRatePeriod = 525600
        fixedRate = 75000000000
        foundersInitialReward = 7500000000
        epochLength = 64800
        oneEpochReduction = 3000000000
        minerRewardDelay = 720
      }
      powScheme { powType = autolykos, k = 32, n = 26 }
      voting { votingLength = 1024, softForkEpochs = 32, activationEpochs = 32 }
    """)
    ConfigFactory.parseResources("mainnet.conf").getConfig("ergo.chain")
      .withFallback(defaults).resolve(ConfigResolveOptions.noSystem()).as[ChainSettings]
  }
  private lazy val parameters = Parameters(MainnetLaunchParameters.height,
    MainnetLaunchParameters.parametersTable.updated(Parameters.BlockVersion, BlockVersion.toInt),
    MainnetLaunchParameters.proposedUpdate)
  private lazy val state = upcoming(headers, parameters.maxBlockCost)
  private lazy val positiveCost = {
    val result = validate(transaction, inputBoxes, state)
    result match {
      case Success(cost) => cost
      case Failure(error) => fail(s"FROZEN POSITIVE REJECTED: ${diagnostic(error)}", error)
    }
  }
  private lazy val nodePolicy = {
    val source = Paths.get(requiredProperty("root"))
      .resolve("src/main/resources/application.conf").toFile
    ConfigFactory.parseFile(source).getConfig("ergo.node")
  }

  test("wire envelope binds the exact context, signed packet and WASM export") {
    signedBytes.length shouldBe 4342
    checkedWire(wirePacket).isObject shouldBe true
    Seq("contextFixtureSha256Hex", "signedFixtureSha256Hex").foreach { field =>
      val changed = wirePacket.mapObject(_.add(field, Json.fromString("00" * 32)))
      intercept[IllegalArgumentException](checkedWire(changed)).getMessage should include(field)
    }
    val changedHex = flip(signedBytes)
    val changed = wirePacket.mapObject(_.add("feeFundedSignedTransactionHex", Json.fromString(hex(changedHex))))
    intercept[IllegalArgumentException](checkedWire(changed)).getMessage should include("signed byte binding")
  }

  test("actual WASM JSON decodes then reparses without changing signed or proofless bytes") {
    BlockVersion shouldBe 4.toByte
    ScriptVersion shouldBe 3.toByte
    str(wireJson.hcursor, "id") shouldBe TransactionId
    decoded.id shouldBe TransactionId
    transaction.id shouldBe TransactionId
    ErgoTransactionSerializer.toBytes(decoded).toVector shouldBe signedBytes.toVector
    ErgoTransactionSerializer.toBytes(transaction).toVector shouldBe signedBytes.toVector
    val proofless = transaction.copy(inputs = transaction.inputs.map(i =>
      Input(i.boxId, ProverResult(Array.emptyByteArray, i.extension))), sizeOpt = None)
    val expected = unhex(str(funded, "prooflessTransactionHex"))
    expected.length shouldBe 4141
    ErgoTransactionSerializer.toBytes(proofless).toVector shouldBe expected.toVector
    proofless.messageToSign.toVector shouldBe transaction.messageToSign.toVector
    proofless.id shouldBe TransactionId
    inputBoxes.size shouldBe 2
    transaction.inputs.map(i => hex(i.boxId)) shouldBe inputBoxes.map(b => hex(b.id))
    transaction.dataInputs shouldBe empty
    transaction.outputs.map(_.value) shouldBe IndexedSeq(10000000L, 1100000L)
    headers.size shouldBe 10
    headers.sliding(2).foreach { pair =>
      pair.head.parentId shouldBe pair(1).id
      pair.head.height shouldBe pair(1).height + 1
    }
    state.currentHeight shouldBe int(transition, "currentErgoHeight")
    state.blockVersion shouldBe BlockVersion
    state.sigmaPreHeader.version shouldBe headers.head.version
    state.sigmaLastHeaders.length shouldBe 10
  }

  test("frozen positive passes real stateless and stateful validity with bounded cost") {
    transaction.statelessValidity().get shouldBe (())
    positiveCost should be > ErgoInterpreter.interpreterInitCost
    positiveCost should be <= state.currentParameters.maxBlockCost
    // The HTTP size predicate is not executed here; compare against its exact
    // source default, without loading a local/operator configuration.
    nodePolicy.getInt("maxTransactionSize") shouldBe 98304
    nodePolicy.getInt("maxTransactionCost") shouldBe 1000000
    nodePolicy.getLong("minimalFeeAmount") shouldBe 1000000L
    transaction.size shouldBe signedBytes.length
    transaction.size should be <= nodePolicy.getInt("maxTransactionSize")
    positiveCost should be <= nodePolicy.getInt("maxTransactionCost")
    transaction.outputs(1).value should be >= nodePolicy.getLong("minimalFeeAmount")
    info(s"synthetic_node_cost=$positiveCost max_block_cost=${state.currentParameters.maxBlockCost} " +
      s"signed_bytes=${transaction.size} default_ingress=${nodePolicy.getInt("maxTransactionSize")}")
  }

  test("ApiCodecs rejects isolated malformed proof hex and malformed context constants") {
    val malformedProof = updateInputJson(wireJson, 0) { input =>
      input.mapObject(_.add("spendingProof", input.hcursor.downField("spendingProof").focus.get
        .mapObject(_.add("proofBytes", Json.fromString("zz")))))
    }
    decode(malformedProof).isLeft shouldBe true
    val malformedExtension = updateInputJson(wireJson, 0) { input =>
      val proof = input.hcursor.downField("spendingProof").focus.get
      val extension = proof.hcursor.downField("extension").focus.get
      input.mapObject(_.add("spendingProof", proof.mapObject(_.add("extension",
        extension.mapObject(_.add("2", Json.fromString("zz")))))))
    }
    decode(malformedExtension).isLeft shouldBe true
    decode(wireJson).isRight shouldBe true
  }

  test("a substituted claimed transaction ID cannot satisfy the exact wire identity join") {
    val changed = wireJson.mapObject(_.add("id", Json.fromString("00" * 32)))
    // A decoder rejection and a decoded/recomputed-ID mismatch are distinct channels.
    decode(changed) match {
      case Left(error) => info(s"claimed_id_channel=decoder_rejection ${error.message}")
      case Right(tx) =>
        tx.id shouldBe TransactionId
        tx.id should not be str(changed.hcursor, "id")
        info("claimed_id_channel=recomputed_identity_mismatch")
    }
    transaction.id shouldBe TransactionId
  }

  test("real stateless validity rejects an isolated duplicate input") {
    positiveCost should be > 0
    val changed = reparse(ErgoTransactionSerializer.toBytes(transaction.copy(
      inputs = transaction.inputs.updated(1, transaction.inputs.head), sizeOpt = None)))
    changed.statelessValidity().isFailure shouldBe true
    transaction.statelessValidity().isSuccess shouldBe true
  }

  Seq(0 -> "tracker", 1 -> "fee payer").foreach { case (index, role) =>
    test(s"real stateful validity rejects only the mutated $role proof with the same transaction ID") {
      positiveCost should be > 0
      val input = transaction.inputs(index)
      input.spendingProof.proof should not be empty
      val changed = replaceInput(index, ProverResult(flip(input.spendingProof.proof), input.extension))
      changed.id shouldBe TransactionId
      changed.messageToSign.toVector shouldBe transaction.messageToSign.toVector
      val other = 1 - index
      changed.inputs(other).spendingProof.proof.toVector shouldBe transaction.inputs(other).spendingProof.proof.toVector
      changed.statelessValidity().isSuccess shouldBe true
      rejected(validate(changed, inputBoxes, state), s"$role proof", Some(s"#$index =>"))
    }
  }

  test("real stateful validity reports the missing fee input from the synthetic lookup") {
    positiveCost should be > 0
    val available = inputBoxes.take(1)
    val resolved = transaction.inputs.flatMap(i => available.find(b => b.id.sameElements(i.boxId)))
    rejected(validate(transaction, resolved, state), "missing input", Some("Missing inputs: 1"))
  }

  test("real node conservation rejects an isolated one-nanoERG output inflation before proofs") {
    positiveCost should be > 0
    val out = transaction.outputCandidates.head
    val inflated = new ErgoBoxCandidate(out.value + 1L, out.ergoTree, out.creationHeight,
      out.additionalTokens, out.additionalRegisters)
    val changed = reparse(ErgoTransactionSerializer.toBytes(transaction.copy(
      outputCandidates = transaction.outputCandidates.updated(0, inflated), sizeOpt = None)))
    changed.statelessValidity().isSuccess shouldBe true
    rejected(validate(changed, inputBoxes, state), "ERG inflation",
      Some("Amount of Ergs in inputs should be equal to amount of Erg in outputs"))
  }

  test("real node asset conservation rejects isolated tracker token inflation before proofs") {
    positiveCost should be > 0
    val out = transaction.outputCandidates.head
    out.additionalTokens.length shouldBe 1
    val tokens = out.additionalTokens.map { case (id, amount) => (id, amount + 1L) }
    val inflated = new ErgoBoxCandidate(out.value, out.ergoTree, out.creationHeight,
      tokens, out.additionalRegisters)
    val changed = reparse(ErgoTransactionSerializer.toBytes(transaction.copy(
      outputCandidates = transaction.outputCandidates.updated(0, inflated), sizeOpt = None)))
    changed.statelessValidity().isSuccess shouldBe true
    rejected(validate(changed, inputBoxes, state), "token inflation",
      Some("For every token, its amount in outputs should not exceed its amount in inputs"))
  }

  test("real cost accounting accepts the exact budget and rejects one less or exhausted accumulated cost") {
    val cost = positiveCost
    validate(transaction, inputBoxes, upcoming(headers, cost)).get shouldBe cost
    rejected(validate(transaction, inputBoxes, upcoming(headers, cost - 1)), "one below exact cost")
    rejected(validate(transaction, inputBoxes, state, state.currentParameters.maxBlockCost.toLong),
      "exhausted accumulated cost", Some("initial cost"))
  }

  test("a signed context-selector mutation fails real stateful validity") {
    positiveCost should be > 0
    val input = transaction.inputs.head
    val extension = ContextExtension(input.extension.values.updated(2.toByte,
      IntConstant(int(transition, "anchorHeight") + 1)))
    val changed = replaceInput(0, ProverResult(input.spendingProof.proof.clone(), extension))
    changed.inputs.head.spendingProof.proof.toVector shouldBe input.spendingProof.proof.toVector
    changed.statelessValidity().isSuccess shouldBe true
    changed.messageToSign.toVector should not be transaction.messageToSign.toVector
    // This binds signed context, not the anchor predicate independently of the
    // signature. V154's separate reduction matrix supplies that isolation.
    rejected(validate(changed, inputBoxes, state), "signed context mutation", Some("#0 =>"))
  }

  test("unchanged signed bytes validate through descendant windows and reject after anchor eviction") {
    positiveCost should be > 0
    val anchorHeight = int(transition, "anchorHeight")
    val anchor = headers.find(_.height == anchorHeight).getOrElse(fail("missing fixture anchor"))
    val survivors = 9 - headers.indexWhere(_.id == anchor.id)
    survivors shouldBe 8
    var window = headers
    (1 to survivors).foreach { step =>
      window = descend(window)
      withClue(s"descendant $step: ") {
        window.exists(_.id == anchor.id) shouldBe true
        val cost = validate(transaction, inputBoxes, upcoming(window, parameters.maxBlockCost)).get
        cost should be > 0
        cost should be <= parameters.maxBlockCost
      }
    }
    window = descend(window)
    window.exists(_.id == anchor.id) shouldBe false
    rejected(validate(transaction, inputBoxes, upcoming(window, parameters.maxBlockCost)),
      "evicted anchor", Some("#0 =>"))
    ErgoTransactionSerializer.toBytes(transaction).toVector shouldBe signedBytes.toVector
    validate(transaction, inputBoxes, state).get shouldBe positiveCost
  }

  private def checkedWire(packet: Json): Json = {
    val c = packet.hcursor
    require(str(c, "schema") == "e2s.substrate-federated-tracker-v2-node-wire-fixture", "wire schema")
    require(int(c, "version") == 2, "wire version")
    require(str(c, "contextFixtureSha256Hex") == sha256(contextBytes), "contextFixtureSha256Hex")
    require(str(c, "signedFixtureSha256Hex") == signedHash, "signedFixtureSha256Hex")
    require(unhex(str(c, "feeFundedSignedTransactionHex")).sameElements(signedBytes), "signed byte binding")
    val exported = c.downField("feeFundedSignedTransactionJson").focus.getOrElse(
      fail("missing actual WASM to_json object; node encoding is not a substitute"))
    require(exported.isObject, "feeFundedSignedTransactionJson must be an object from WASM to_json")
    exported
  }

  private def decode(value: Json): Either[DecodingFailure, ErgoTransaction] =
    inVersion(transactionDecoder.decodeJson(value))

  private def reparse(bytes: Array[Byte]): ErgoTransaction = inVersion {
    val reader = new VLQByteBufferReader(ByteBuffer.wrap(bytes.clone()))
    val tx = ErgoTransactionSerializer.parse(reader)
    require(reader.remaining == 0, "transaction trailing bytes")
    require(ErgoTransactionSerializer.toBytes(tx).sameElements(bytes), "transaction byte roundtrip")
    tx
  }

  private def upcoming(window: Vector[Header], limit: Int): UpcomingStateContext = {
    require(limit > 0, "positive synthetic cost limit")
    new ErgoStateContext(window, None, chainSettings.genesisStateDigest,
      parameters.withBlockCost(limit), ErgoValidationSettings.initial, VotingData.empty)(chainSettings)
      .simplifiedUpcoming()
  }

  private def validate(tx: ErgoTransaction, boxes: IndexedSeq[ErgoBox], ctx: ErgoStateContext,
      accumulatedCost: Long = 0L): Try[Int] = {
    val version = Header.scriptFromBlockVersion(ctx.blockVersion)
    VersionContext.withVersions(version, version) {
      tx.statelessValidity().flatMap(_ => tx.statefulValidity(boxes, IndexedSeq.empty, ctx,
        accumulatedCost)(ErgoInterpreter(ctx.currentParameters)))
    }
  }

  private def rejected(result: Try[Int], label: String, expected: Option[String] = None): Unit = result match {
    case Success(cost) => fail(s"$label unexpectedly accepted at cost $cost")
    case Failure(error) =>
      val detail = diagnostic(error)
      expected.foreach(fragment => withClue(s"$label: $detail: ") { detail should include(fragment) })
      info(s"$label rejected: $detail")
  }

  private def replaceInput(index: Int, proof: ProverResult): ErgoTransaction =
    reparse(ErgoTransactionSerializer.toBytes(transaction.copy(inputs = transaction.inputs.updated(index,
      Input(transaction.inputs(index).boxId, proof)), sizeOpt = None)))

  private def descend(window: Vector[Header]): Vector[Header] = {
    val tip = window.head
    val next = tip.copy(parentId = tip.id, height = tip.height + 1, timestamp = tip.timestamp + 1L, sizeOpt = None)
    (next +: window).take(10)
  }

  private def updateInputJson(value: Json, index: Int)(f: Json => Json): Json = {
    val inputs = value.hcursor.downField("inputs").as[Vector[Json]].fold(e => fail(e.getMessage), identity)
    value.mapObject(_.add("inputs", Json.fromValues(inputs.updated(index, f(inputs(index))))))
  }

  private def inVersion[A](body: => A): A = VersionContext.withVersions(ScriptVersion, ScriptVersion)(body)
  private def requiredProperty(name: String): String = {
    val value = System.getProperty(Prefix + name)
    require(value != null && value.nonEmpty, s"missing -D$Prefix$name")
    value
  }
  private def readFixture(name: String, expected: String): Array[Byte] = {
    require(expected.matches("[0-9a-f]{64}"), "canonical fixture SHA-256")
    val path = Paths.get(requiredProperty(name)).toAbsolutePath.normalize()
    require(Files.isRegularFile(path) && !Files.isSymbolicLink(path), "regular fixture file required")
    require(Files.size(path) > 0 && Files.size(path) <= 1048576L, "fixture size bound")
    val bytes = Files.readAllBytes(path)
    require(bytes.length <= 1048576 && bytes.forall(_ >= 0), "bounded ASCII fixture")
    require(sha256(bytes) == expected, s"$name SHA-256 mismatch")
    bytes
  }
  private def json(bytes: Array[Byte]): Json = parser.parse(new String(bytes, US_ASCII))
    .fold(e => fail(e.getMessage), identity)
  private def str(c: ACursor, field: String): String = c.downField(field).as[String]
    .fold(e => fail(e.getMessage), identity)
  private def int(c: ACursor, field: String): Int = c.downField(field).as[Int]
    .fold(e => fail(e.getMessage), identity)
  private def strings(c: ACursor, field: String): Vector[String] = c.downField(field).as[Vector[String]]
    .fold(e => fail(e.getMessage), identity)
  private def unhex(value: String): Array[Byte] = {
    require(value.matches("(?:[0-9a-f]{2})+"), "canonical nonempty hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }
  private def flip(bytes: Array[Byte]): Array[Byte] = {
    require(bytes.nonEmpty, "nonempty mutation subject")
    val changed = bytes.clone()
    changed(0) = (changed(0) ^ 1).toByte
    changed
  }
  private def hex(bytes: Array[Byte]): String = bytes.map(b => f"${b & 0xff}%02x").mkString
  private def sha256(bytes: Array[Byte]): String = hex(MessageDigest.getInstance("SHA-256").digest(bytes))
  private def diagnostic(error: Throwable): String = {
    val here = s"${error.getClass.getSimpleName}: ${Option(error.getMessage).getOrElse("")}"
    if (error.getCause == null || error.getCause == error) here else here + "; " + diagnostic(error.getCause)
  }
}
