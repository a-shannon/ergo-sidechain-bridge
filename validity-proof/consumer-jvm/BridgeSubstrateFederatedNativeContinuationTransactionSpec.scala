package org.ergoplatform.bridge

import java.nio.ByteBuffer
import java.nio.charset.{StandardCharsets => Charsets}
import java.nio.file.{Files, LinkOption, Path, Paths}
import java.security.MessageDigest

import com.typesafe.config.{ConfigFactory, ConfigResolveOptions, ConfigValueFactory}
import io.circe.{ACursor, Json, parser}
import net.ceedubs.ficus.Ficus._
import net.ceedubs.ficus.readers.ArbitraryTypeReader._
import org.ergoplatform.{ErgoBox, ErgoBoxCandidate, Input}
import org.ergoplatform.http.api.ApiCodecs
import org.ergoplatform.modifiers.history.CPreHeader
import org.ergoplatform.modifiers.history.header.{Header, HeaderSerializer}
import org.ergoplatform.modifiers.mempool.{ErgoTransaction, ErgoTransactionSerializer}
import org.ergoplatform.nodeView.ErgoContext
import org.ergoplatform.nodeView.state.{ErgoStateContext, UpcomingStateContext, VotingData}
import org.ergoplatform.sdk.wallet.protocol.context.TransactionContext
import org.ergoplatform.settings._
import org.ergoplatform.wallet.interpreter.ErgoInterpreter
import org.ergoplatform.wallet.protocol.context.InputContext
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.util.serialization.VLQByteBufferReader
import sigma.VersionContext
import sigma.interpreter.ProverResult
import sigma.serialization.SigmaSerializer

/** Fresh signed continuation -> offline node transaction validation.
  * Uses Ergo 2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1 and its pinned interpreter.
  * Supplied boxes are synthetic inputs, not evidence of UTXO membership.
  * No node, database, actor, wallet, HTTP, mempool or submission is instantiated.
  */
class BridgeSubstrateFederatedNativeContinuationTransactionSpec
    extends AnyFunSuite with Matchers with ApiCodecs with PowSchemeReaders
    with SettingsReaders with NodeConfigurationReaders {
  private val Prefix = "bridge.substrate.federated.native.continuation.transaction."
  private val Schema = "e2s.substrate-federated-native-continuation-transaction-fixture.v1"
  private val ContextSchema = "e2s.ergo-wasm-default-evaluation-context.v1"
  private val SourceConfigHash = "2348654f74dd9f5ba8dcbc8e7415ee02d1f7f8fddc2be43ccddc45e0fce92727"
  private val MaxFixtureBytes = 1048576
  private val Parameters = DevnetLaunchParameters
  private val ScriptVersion = Header.scriptFromBlockVersion(Parameters.blockVersion)
  private val PreHeaderFields = Set("version", "parentId", "timestamp", "nBits", "height", "minerPk", "votes")
  private val ParameterFields = Set("blockVersion", "storageFeeFactor", "minValuePerByte", "maxBlockSize",
    "maxBlockCost", "tokenAccessCost", "inputCost", "dataInputCost", "outputCost")
  private val RawHeaderFields = Set("extensionId", "difficulty", "votes", "timestamp", "size", "stateRoot",
    "height", "nBits", "version", "adProofsRoot", "transactionsRoot", "extensionHash", "powSolutions",
    "adProofsId", "transactionsId", "parentId", "id")

  private lazy val fixture = {
    val digest = property("fixture.sha256")
    require(digest.matches("[0-9a-f]{64}"), "canonical fixture hash")
    val bytes = boundedFile(Paths.get(property("fixture")))
    require(sha256(bytes) == digest, "fixture hash mismatch")
    require(bytes.forall(_ >= 0), "ASCII fixture")
    val text = new String(bytes, Charsets.US_ASCII)
    val value = parser.parse(text).fold(e => fail(e.message), identity)
    require(text == canonical(value) + "\n", "canonical fixture JSON")
    exactFields(value, Set("schema", "version", "transaction", "inputs", "headers", "evaluationContext"))
    require(str(value.hcursor, "schema") == Schema && int(value.hcursor, "version") == 1, "fixture schema/version")
    value
  }
  private lazy val txJson = {
    val value = field(fixture.hcursor, "transaction")
    exactFields(value, Set("id", "signedBytesHex", "signedBytesSha256Hex", "signedBytesLength", "json"))
    value.hcursor
  }
  private lazy val signedBytes = {
    val bytes = unhex(str(txJson, "signedBytesHex"))
    require(bytes.length == int(txJson, "signedBytesLength"), "signed byte length")
    require(sha256(bytes) == str(txJson, "signedBytesSha256Hex"), "signed byte hash")
    bytes
  }
  private lazy val transaction = parseTransaction(txJson, signedBytes)
  private def parseTransaction(packet: ACursor, bytes: Array[Byte]): ErgoTransaction = inVersion {
    val json = field(packet, "json")
    val decoded = transactionDecoder.decodeJson(json).fold(e => fail(e.message), identity)
    val reader = new VLQByteBufferReader(ByteBuffer.wrap(bytes.clone()))
    val parsed = ErgoTransactionSerializer.parse(reader)
    require(reader.remaining == 0, "transaction trailing bytes")
    require(ErgoTransactionSerializer.toBytes(parsed).sameElements(bytes), "transaction roundtrip")
    require(ErgoTransactionSerializer.toBytes(decoded).sameElements(bytes), "transaction JSON byte binding")
    val id = str(packet, "id")
    require(id.matches("[0-9a-f]{64}") && parsed.id == id && decoded.id == id && str(json.hcursor, "id") == id,
      "transaction identity")
    require(parsed.inputs.size == 3 && parsed.dataInputs.isEmpty, "three inputs without data inputs")
    parsed
  }
  private lazy val inputs = entries(fixture.hcursor, "inputs", 3).map { value => inVersion {
    exactFields(value, Set("id", "serializedHex"))
    val bytes = unhex(str(value.hcursor, "serializedHex"))
    val reader = SigmaSerializer.startReader(bytes.clone())
    val box = ErgoBox.sigmaSerializer.parse(reader)
    require(reader.remaining == 0 && ErgoBox.sigmaSerializer.toBytes(box).sameElements(bytes), "input roundtrip")
    require(hex(box.id) == str(value.hcursor, "id"), "input identity")
    box
  }}
  private lazy val headers = entries(fixture.hcursor, "headers", 10).map { value =>
    exactFields(value, Set("id", "serializedHex"))
    val bytes = unhex(str(value.hcursor, "serializedHex"))
    val reader = new VLQByteBufferReader(ByteBuffer.wrap(bytes.clone()))
    val header = HeaderSerializer.parse(reader)
    require(reader.remaining == 0 && HeaderSerializer.toBytes(header).sameElements(bytes), "header roundtrip")
    require(header.id == str(value.hcursor, "id"), "header identity")
    header
  }
  private lazy val evaluation = field(fixture.hcursor, "evaluationContext")

  private lazy val sourceConfig = {
    val bytes = boundedFile(Paths.get(property("root")).resolve("src/main/resources/application.conf"))
    require(sha256(bytes) == SourceConfigHash, "pinned source configuration")
    // These paths remain inert values. No storage or node constructor uses them.
    ConfigFactory.parseString(new String(bytes, Charsets.UTF_8))
      .withValue("ergo.directory", ConfigValueFactory.fromAnyRef("unused-continuation-validator"))
      .withValue("scorex.dataDir", ConfigValueFactory.fromAnyRef("unused-continuation-validator/data"))
      .withValue("scorex.logDir", ConfigValueFactory.fromAnyRef("unused-continuation-validator/log"))
      .withValue("ergo.chain.monetary.minerRewardDelay", ConfigValueFactory.fromAnyRef(1))
      .resolve(ConfigResolveOptions.noSystem())
  }
  private lazy val chain = sourceConfig.as[ChainSettings]("ergo.chain")
  private lazy val node = sourceConfig.as[NodeConfigurationSettings]("ergo.node")
  private lazy val nodeContext: UpcomingStateContext = {
    require(!node.mining && node.blacklistedTransactions.isEmpty, "inert node configuration")
    val wallet = sourceConfig.as[WalletSettings]("ergo.wallet")
    require(wallet.testMnemonic.isEmpty && wallet.testKeysQty.isEmpty, "inert wallet configuration")
    require(chain.monetary.minerRewardDelay == 1, "synthetic monetary delay")
    new ErgoStateContext(headers, None, chain.genesisStateDigest, Parameters,
      ErgoValidationSettings.initial, VotingData.empty)(chain).simplifiedUpcoming()
  }
  private lazy val wasmContext: UpcomingStateContext = {
    val h = nodeContext.predictedHeader
    // WASM consumes a full-header carrier with three vote bytes. Node's actual
    // simplifiedUpcoming uses empty votes. Keep and check both contexts explicitly.
    // Both JVM evaluations retain native parameters; SDK defaults are compared
    // separately and are not the node's version/cost policy.
    nodeContext.copy(predictedHeader = CPreHeader(h.version, h.parentId, h.timestamp, h.nBits,
      h.height, Array(0.toByte, 0.toByte, 0.toByte), h.minerPk))(chain)
  }

  private def checkInputOrder(tx: ErgoTransaction, boxes: Vector[ErgoBox]): Unit = {
    require(boxes.size == 3 && boxes.map(b => hex(b.id)).distinct.size == 3, "three distinct input identities")
    require(tx.inputs.map(i => hex(i.boxId)) == boxes.map(b => hex(b.id)), "ordered input identity")
  }
  private def checkHeaderOrder(window: Vector[Header]): Unit = {
    require(window.size == 10, "ten headers")
    require(window.sliding(2).forall(p => p.head.height.toLong == p(1).height.toLong + 1L), "header heights")
    require(window.sliding(2).forall(p => p.head.parentId == p(1).id), "header parents")
  }
  private def preHeaderJson(context: ErgoStateContext): Json = {
    val h = context.sigmaPreHeader
    Json.obj("version" -> Json.fromInt(h.version.toInt), "parentId" -> Json.fromString(hex(h.parentId.toArray)),
      "timestamp" -> Json.fromString(h.timestamp.toString), "nBits" -> Json.fromString(h.nBits.toString),
      "height" -> Json.fromInt(h.height), "minerPk" -> Json.fromString(hex(h.minerPk.getEncoded.toArray)),
      "votes" -> Json.fromString(hex(h.votes.toArray)))
  }
  private def parametersJson(context: ErgoStateContext): Json = {
    val p = context.currentParameters
    Json.obj("blockVersion" -> Json.fromInt(p.blockVersion.toInt),
      "storageFeeFactor" -> Json.fromInt(p.storageFeeFactor), "minValuePerByte" -> Json.fromInt(p.minValuePerByte),
      "maxBlockSize" -> Json.fromInt(p.maxBlockSize), "maxBlockCost" -> Json.fromInt(p.maxBlockCost),
      "tokenAccessCost" -> Json.fromInt(p.tokenAccessCost), "inputCost" -> Json.fromInt(p.inputCost),
      "dataInputCost" -> Json.fromInt(p.dataInputCost), "outputCost" -> Json.fromInt(p.outputCost))
  }
  private def sameHeaderProjection(a: sigma.Header, b: sigma.Header): Boolean =
    a.id.toArray.sameElements(b.id.toArray) && a.version == b.version &&
      a.parentId.toArray.sameElements(b.parentId.toArray) &&
      a.ADProofsRoot.toArray.sameElements(b.ADProofsRoot.toArray) &&
      a.stateRoot.digest.toArray.sameElements(b.stateRoot.digest.toArray) &&
      a.transactionsRoot.toArray.sameElements(b.transactionsRoot.toArray) &&
      a.timestamp == b.timestamp && a.nBits == b.nBits && a.height == b.height &&
      a.extensionRoot.toArray.sameElements(b.extensionRoot.toArray) &&
      a.minerPk.getEncoded.toArray.sameElements(b.minerPk.getEncoded.toArray) &&
      a.powOnetimePk.getEncoded.toArray.sameElements(b.powOnetimePk.getEncoded.toArray) &&
      a.powNonce.toArray.sameElements(b.powNonce.toArray) && a.powDistance == b.powDistance &&
      a.votes.toArray.sameElements(b.votes.toArray)
  private def checkEvaluation(value: Json): Unit = {
    exactFields(value, Set("schema", "wasmPreHeader", "nodePreHeader", "parameters", "headers", "previousStateDigestHex"))
    val c = value.hcursor
    require(str(c, "schema") == ContextSchema, "evaluation schema")
    val nodePreHeader = field(c, "nodePreHeader")
    val wasmPreHeader = field(c, "wasmPreHeader")
    exactFields(nodePreHeader, PreHeaderFields)
    exactFields(wasmPreHeader, PreHeaderFields)
    require(nodePreHeader == preHeaderJson(nodeContext), "node preheader binding")
    require(wasmPreHeader == preHeaderJson(wasmContext), "WASM carrier preheader binding")
    require(nodeContext.sigmaPreHeader.votes.length == 0 && hex(wasmContext.sigmaPreHeader.votes.toArray) == "000000",
      "explicit vote carrier difference")
    require(nodePreHeader.mapObject(_.remove("votes")) == wasmPreHeader.mapObject(_.remove("votes")), "other preheader fields equal")
    val parameters = field(c, "parameters")
    exactFields(parameters, ParameterFields)
    // sigma-rust ergo-lib-v0.28.0, ergo-lib/src/chain/parameters.rs Default:
    // seven shared coefficients, blockVersion=1, no MaxBlockCost entry. The
    // absent getter panics, so null records source-backed absence, not a cap.
    val nativeParameters = parametersJson(nodeContext)
    require(nativeParameters == parametersJson(wasmContext), "native parameter contexts equal")
    require(nodeContext.currentParameters.blockVersion == 3.toByte && nodeContext.currentParameters.maxBlockCost > 0,
      "native version and cost policy")
    val expectedSdkParameters = nativeParameters.mapObject(_.add("blockVersion", Json.fromInt(1)).add("maxBlockCost", Json.Null))
    require(parameters == expectedSdkParameters, "parameter binding")
    require(str(c, "previousStateDigestHex") == hex(nodeContext.previousStateDigest.toArray), "previous state digest binding")
    require(nodeContext.previousStateDigest == wasmContext.previousStateDigest, "context state digest equality")
    require(nodeContext.validationSettings.bytes.sameElements(wasmContext.validationSettings.bytes), "validation settings equality")
    val raw = entries(c, "headers", 10)
    raw.zipWithIndex.foreach { case (json, index) =>
      exactFields(json, RawHeaderFields)
      exactFields(field(json.hcursor, "powSolutions"), Set("pk", "w", "n", "d"))
      val decoded = Header.jsonDecoder.decodeJson(json).fold(e => fail(e.message), identity)
      require(str(json.hcursor, "id") == headers(index).id && decoded.id == headers(index).id, "context header identity")
      require(HeaderSerializer.toBytes(decoded).sameElements(HeaderSerializer.toBytes(headers(index))), "context header bytes")
      // The exporter binds these exact JSON objects to its WASM header inputs.
      // This checks the node projection, not unavailable WASM Header getters.
      require(sameHeaderProjection(Header.toSigma(decoded), nodeContext.sigmaLastHeaders(index)), "context header projection")
    }
    require(nodeContext.sigmaLastHeaders == wasmContext.sigmaLastHeaders, "context headers equality")
  }
  private def checkFixture(): Unit = {
    require(Parameters.blockVersion == 3.toByte && ScriptVersion == 2.toByte, "DevNet interpreter version")
    checkInputOrder(transaction, inputs)
    checkHeaderOrder(headers)
    require(nodeContext.currentHeight == headers.head.height + 1, "upcoming height")
    require(signedBytes.length <= node.maxTransactionSize, "transaction size cap")
    require(node.maxTransactionCost > 0, "transaction cost cap")
    checkEvaluation(evaluation)
  }

  private def validate(tx: ErgoTransaction, context: ErgoStateContext): scala.util.Try[Int] = inVersion {
    checkInputOrder(tx, inputs)
    val verifier = ErgoInterpreter(context.currentParameters.withBlockCost(node.maxTransactionCost))
    tx.statelessValidity().flatMap { _ =>
      tx.statefulValidity(inputs, IndexedSeq.empty[ErgoBox], context, accumulatedCost = 0L)(verifier).map { cost =>
        require(cost > 0 && cost <= node.maxTransactionCost, "validated transaction cost")
        cost
      }
    }
  }
  private def inputVerdicts(tx: ErgoTransaction, context: ErgoStateContext): Vector[Boolean] = inVersion {
    val verifier = ErgoInterpreter(context.currentParameters.withBlockCost(node.maxTransactionCost))
    inputs.indices.map { index =>
      val proof = tx.inputs(index).spendingProof
      val ctx = new ErgoContext(context, TransactionContext(inputs, IndexedSeq.empty[ErgoBox], tx),
        InputContext(index.toShort, proof.extension), node.maxTransactionCost.toLong, 0L)
      val result = verifier.verify(inputs(index).ergoTree, ctx, proof, tx.messageToSign).get
      require(result._2 >= 0L && result._2 <= node.maxTransactionCost, "input proof cost")
      result._1
    }.toVector
  }

  test("fresh signed continuation passes full offline node validation in both explicit vote contexts") {
    checkFixture()
    require(transaction.inputs(2).spendingProof.proof.nonEmpty, "fee proof present")
    Vector(nodeContext, wasmContext).foreach { context =>
      inputVerdicts(transaction, context) shouldBe Vector(true, true, true)
      validate(transaction, context).isSuccess shouldBe true
    }
    ErgoTransactionSerializer.toBytes(transaction).toVector shouldBe signedBytes.toVector
  }

  test("only an empty fee proof rejects input two while protected inputs remain valid in both contexts") {
    checkFixture()
    val fee = transaction.inputs(2)
    require(fee.spendingProof.proof.nonEmpty, "original fee proof present")
    val changed = transaction.copy(inputs = transaction.inputs.updated(2,
      Input(fee.boxId, ProverResult(Array.emptyByteArray, fee.spendingProof.extension))), sizeOpt = None)
    changed.id shouldBe transaction.id
    changed.messageToSign.toVector shouldBe transaction.messageToSign.toVector
    changed.inputs.take(2) shouldBe transaction.inputs.take(2)
    changed.inputs(2).extension shouldBe fee.extension
    changed.inputs(2).boxId.toVector shouldBe fee.boxId.toVector
    changed.dataInputs shouldBe transaction.dataInputs
    changed.outputCandidates shouldBe transaction.outputCandidates
    changed.statelessValidity().isSuccess shouldBe true
    Vector(nodeContext, wasmContext).foreach { context =>
      inputVerdicts(changed, context) shouldBe Vector(true, true, false)
      val result = validate(changed, context)
      result.isFailure shouldBe true
      result.failed.get.getMessage should include("#2 =>")
      result.failed.get.getMessage should not include "#0 =>"
      result.failed.get.getMessage should not include "#1 =>"
    }
    ErgoTransactionSerializer.toBytes(transaction).toVector shouldBe signedBytes.toVector
  }

  test("full validation refuses an outputless transaction at the stateless boundary") {
    checkFixture()
    val changed = transaction.copy(outputCandidates = IndexedSeq.empty[ErgoBoxCandidate], sizeOpt = None)
    changed.inputs shouldBe transaction.inputs
    changed.dataInputs shouldBe transaction.dataInputs
    val stateless = changed.statelessValidity()
    stateless.isFailure shouldBe true
    stateless.failed.get.getMessage should include("has no outputs")
    Vector(nodeContext, wasmContext).foreach { context =>
      val result = validate(changed, context)
      result.isFailure shouldBe true
      result.failed.get.getMessage shouldBe stateless.failed.get.getMessage
    }
  }

  test("full validation refuses only one extra nanoERG before input proofs") {
    checkFixture()
    val original = transaction.outputCandidates.head
    val increased = new ErgoBoxCandidate(original.value + 1L, original.ergoTree,
      original.creationHeight, original.additionalTokens, original.additionalRegisters)
    val changed = transaction.copy(outputCandidates = transaction.outputCandidates.updated(0, increased), sizeOpt = None)
    changed.inputs shouldBe transaction.inputs
    changed.dataInputs shouldBe transaction.dataInputs
    changed.outputCandidates.tail shouldBe transaction.outputCandidates.tail
    increased.ergoTree shouldBe original.ergoTree
    increased.creationHeight shouldBe original.creationHeight
    increased.additionalTokens shouldBe original.additionalTokens
    increased.additionalRegisters shouldBe original.additionalRegisters
    changed.statelessValidity().isSuccess shouldBe true
    val originalSum = transaction.outputCandidates.map(_.value).sum
    changed.outputCandidates.map(_.value).sum shouldBe originalSum + 1L
    Vector(nodeContext, wasmContext).foreach { context =>
      val result = validate(changed, context)
      result.isFailure shouldBe true
      result.failed.get.getMessage should include(s"Success($originalSum) == Success(${originalSum + 1L})")
      result.failed.get.getMessage should not include "#0 =>"
      result.failed.get.getMessage should not include "#1 =>"
      result.failed.get.getMessage should not include "#2 =>"
    }
  }

  test("ordered inputs reject the same valid boxes in reverse order") {
    checkFixture()
    intercept[IllegalArgumentException](checkInputOrder(transaction, inputs.reverse)).getMessage shouldBe
      "requirement failed: ordered input identity"
  }
  test("header parents reject one replacement while heights remain intact") {
    checkFixture()
    val changed = headers.updated(0, headers.head.copy(parentId = headers(2).id, sizeOpt = None))
    intercept[IllegalArgumentException](checkHeaderOrder(changed)).getMessage shouldBe "requirement failed: header parents"
  }
  test("header heights reject one changed height while parent IDs remain intact") {
    checkFixture()
    val changed = headers.updated(0, headers.head.copy(height = headers.head.height + 1, sizeOpt = None))
    intercept[IllegalArgumentException](checkHeaderOrder(changed)).getMessage shouldBe "requirement failed: header heights"
  }
  for (name <- Vector("nodePreHeader", "wasmPreHeader"); key <- PreHeaderFields.toVector.sorted) {
    test(s"evaluation refuses isolated $name $key substitution") {
      checkFixture()
      val old = field(evaluation.hcursor, name)
      val changedValue = field(old.hcursor, key).asString match {
        case Some(s) => Json.fromString(s + "0")
        case None => Json.fromInt(int(old.hcursor, key) + 1)
      }
      val changed = evaluation.mapObject(_.add(name, old.mapObject(_.add(key, changedValue))))
      intercept[IllegalArgumentException](checkEvaluation(changed))
    }
  }
  for (key <- ParameterFields.toVector.sorted) {
    test(s"evaluation refuses isolated parameter $key substitution") {
      checkFixture()
      val old = field(evaluation.hcursor, "parameters")
      // An invented numeric maximum must be refused, rather than calling the
      // absent WASM getter or silently borrowing the node's block-cost cap.
      val changedValue = if (key == "maxBlockCost") Json.fromInt(0) else Json.fromInt(int(old.hcursor, key) + 1)
      val changed = evaluation.mapObject(_.add("parameters", old.mapObject(_.add(key, changedValue))))
      intercept[IllegalArgumentException](checkEvaluation(changed)).getMessage shouldBe "requirement failed: parameter binding"
    }
  }
  test("evaluation refuses only a substituted previous state digest") {
    checkFixture()
    val old = str(evaluation.hcursor, "previousStateDigestHex")
    val changed = (if (old.startsWith("00")) "01" else "00") + old.drop(2)
    intercept[IllegalArgumentException](checkEvaluation(evaluation.mapObject(_.add("previousStateDigestHex", Json.fromString(changed)))))
      .getMessage shouldBe "requirement failed: previous state digest binding"
  }
  test("evaluation refuses a substituted raw header under unchanged canonical header bytes") {
    checkFixture()
    val raw = entries(evaluation.hcursor, "headers", 10)
    val changed = raw.updated(0, raw.head.mapObject(_.add("timestamp", Json.fromLong(headers.head.timestamp + 1))))
    intercept[IllegalArgumentException](checkEvaluation(evaluation.mapObject(_.add("headers", Json.fromValues(changed)))))
      .getMessage shouldBe "requirement failed: context header identity"
  }
  test("evaluation refuses a changed V2 proof distance even when serialized bytes are unchanged") {
    checkFixture()
    val raw = entries(evaluation.hcursor, "headers", 10)
    val solution = field(raw.head.hcursor, "powSolutions")
    int(solution.hcursor, "d") shouldBe 0
    headers.head.version shouldBe 2.toByte
    val changedHeader = raw.head.mapObject(_.add("powSolutions", solution.mapObject(_.add("d", Json.fromInt(1)))))
    val decoded = Header.jsonDecoder.decodeJson(changedHeader).fold(e => fail(e.message), identity)
    HeaderSerializer.toBytes(decoded).toVector shouldBe HeaderSerializer.toBytes(headers.head).toVector
    val changed = evaluation.mapObject(_.add("headers", Json.fromValues(raw.updated(0, changedHeader))))
    intercept[IllegalArgumentException](checkEvaluation(changed)).getMessage shouldBe "requirement failed: context header projection"
  }
  test("evaluation refuses an unknown raw header field") {
    checkFixture()
    val raw = entries(evaluation.hcursor, "headers", 10)
    val changed = evaluation.mapObject(_.add("headers", Json.fromValues(raw.updated(0,
      raw.head.mapObject(_.add("unexpected", Json.fromBoolean(false)))))))
    intercept[IllegalArgumentException](checkEvaluation(changed)).getMessage shouldBe "requirement failed: exact fields"
  }
  test("transaction parser refuses a trailing byte before validation") {
    checkFixture()
    intercept[IllegalArgumentException](parseTransaction(txJson, signedBytes ++ Array(0.toByte))).getMessage shouldBe
      "requirement failed: transaction trailing bytes"
  }

  private def inVersion[A](body: => A): A = VersionContext.withVersions(ScriptVersion, ScriptVersion)(body)
  private def property(name: String): String = {
    val value = System.getProperty(Prefix + name)
    require(value != null && value.nonEmpty, s"missing -D$Prefix$name")
    value
  }
  private def boundedFile(path: Path): Array[Byte] = {
    require(Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) && !Files.isSymbolicLink(path), "regular source or fixture")
    require(Files.size(path) > 0 && Files.size(path) <= MaxFixtureBytes, "file bound")
    val stream = Files.newInputStream(path)
    val bytes = try stream.readNBytes(MaxFixtureBytes + 1) finally stream.close()
    require(bytes.nonEmpty && bytes.length <= MaxFixtureBytes, "bounded file read")
    bytes
  }
  private def exactFields(value: Json, names: Set[String]): Unit =
    require(value.asObject.exists(_.keys.toSet == names), "exact fields")
  private def field(c: ACursor, name: String): Json = c.downField(name).focus.getOrElse(fail("missing " + name))
  private def str(c: ACursor, name: String): String = c.downField(name).as[String].fold(e => fail(e.message), identity)
  private def int(c: ACursor, name: String): Int = c.downField(name).as[Int].fold(e => fail(e.message), identity)
  private def entries(c: ACursor, name: String, count: Int): Vector[Json] = {
    val values = c.downField(name).as[Vector[Json]].fold(e => fail(e.message), identity)
    require(values.size == count, s"exact $name count")
    values
  }
  private def canonical(value: Json): String = value.asObject match {
    case Some(obj) => obj.toVector.sortBy(_._1).map { case (k, v) => Json.fromString(k).noSpaces + ":" + canonical(v) }.mkString("{", ",", "}")
    case None => value.asArray.map(_.map(canonical).mkString("[", ",", "]")).getOrElse(value.noSpaces)
  }
  private def unhex(value: String): Array[Byte] = {
    require(value.matches("(?:[0-9a-f]{2})+"), "canonical nonempty hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }
  private def hex(bytes: Array[Byte]): String = bytes.map(b => f"${b & 0xff}%02x").mkString
  private def sha256(bytes: Array[Byte]): String = hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
