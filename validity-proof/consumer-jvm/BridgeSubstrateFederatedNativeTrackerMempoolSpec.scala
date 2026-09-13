package org.ergoplatform.bridge

import java.nio.ByteBuffer
import java.nio.charset.{StandardCharsets => Charsets}
import java.nio.file.{Files, LinkOption, Path, Paths}
import java.security.MessageDigest

import com.typesafe.config.{ConfigFactory, ConfigResolveOptions, ConfigValueFactory}
import io.circe.{ACursor, Json, parser}
import net.ceedubs.ficus.Ficus._
import net.ceedubs.ficus.readers.ArbitraryTypeReader._
import org.ergoplatform.ErgoBox
import org.ergoplatform.core.idToVersion
import org.ergoplatform.http.api.ApiCodecs
import org.ergoplatform.mining.{CandidateGenerator, group}
import org.ergoplatform.modifiers.history.header.{Header, HeaderSerializer}
import org.ergoplatform.modifiers.mempool.{ErgoTransaction, ErgoTransactionSerializer, UnconfirmedTransaction}
import org.ergoplatform.nodeView.mempool.ErgoMemPool
import org.ergoplatform.nodeView.mempool.ErgoMemPoolUtils.ProcessingOutcome
import org.ergoplatform.nodeView.state.{BoxHolder, ErgoState, ErgoStateContext, ErgoStateReader, UtxoState, VotingData}
import org.ergoplatform.settings._
import org.ergoplatform.settings.Algos.HF
import org.ergoplatform.wallet.interpreter.ErgoInterpreter
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.authds.ADValue
import scorex.crypto.authds.avltree.batch.{BatchAVLProver, Insert, PersistentBatchAVLProver, VersionedLDBAVLStorage}
import scorex.crypto.hash.Digest32
import scorex.db.{LDBFactory, LDBKVStore, LDBVersionedStore}
import scorex.util.serialization.VLQByteBufferReader
import sigma.VersionContext
import sigma.data.ProveDlog
import sigma.serialization.SigmaSerializer

import scala.collection.JavaConverters._

/** Exact fixture -> synthetic persisted UTXO state -> shared validation -> real pool policy.
  * Ergo source 2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1; DevNet block version 3.
  * No actors, wallet, HTTP, mining, submission, or existing runtime state is used.
  * Acceptance here is not chain inclusion or an explanation of a campaign failure.
  * The external runner owns source/tool pins and selects this one test source.
  */
class BridgeSubstrateFederatedNativeTrackerMempoolSpec
    extends AnyFunSuite with Matchers with ApiCodecs with PowSchemeReaders
    with SettingsReaders with NodeConfigurationReaders {
  private val Prefix = "bridge.substrate.federated.native.tracker.mempool."
  private val Schema = "e2s.substrate-federated-native-tracker-mempool-fixture.v1"
  private val SourceConfigHash = "2348654f74dd9f5ba8dcbc8e7415ee02d1f7f8fddc2be43ccddc45e0fce92727"
  private val MaxFixtureBytes = 1048576
  private val parameters = DevnetLaunchParameters
  private val BlockVersion = parameters.blockVersion
  private val ScriptVersion = Header.scriptFromBlockVersion(BlockVersion)

  private lazy val fixtureBytes = {
    val expected = property("fixture.sha256")
    require(expected.matches("[0-9a-f]{64}"), "canonical fixture hash")
    val bytes = boundedFile(Paths.get(property("fixture")), MaxFixtureBytes)
    require(bytes.forall(_ >= 0), "fixture must be ASCII")
    require(sha256(bytes) == expected, "fixture hash mismatch")
    bytes
  }
  private lazy val fixture = parser.parse(new String(fixtureBytes, Charsets.US_ASCII))
    .fold(e => fail(e.message), identity)
  private lazy val cursor = {
    exactFields(fixture, Set("schema", "version", "transaction", "inputs", "headers", "anchor", "checkpointExpiryHeight"))
    require(str(fixture.hcursor, "schema") == Schema && int(fixture.hcursor, "version") == 1, "fixture schema/version")
    fixture.hcursor
  }
  private lazy val txJson = {
    val value = cursor.downField("transaction").focus.getOrElse(fail("missing transaction"))
    exactFields(value, Set("id", "signedBytesHex", "signedBytesSha256Hex", "signedBytesLength", "json"))
    value.hcursor
  }
  private lazy val signedBytes = {
    val bytes = unhex(str(txJson, "signedBytesHex"))
    require(bytes.length == int(txJson, "signedBytesLength"), "signed byte length")
    require(sha256(bytes) == str(txJson, "signedBytesSha256Hex"), "signed byte hash")
    bytes
  }
  private lazy val transaction: ErgoTransaction = parseTransaction(txJson, signedBytes)
  private def parseTransaction(packet: ACursor, bytes: Array[Byte]): ErgoTransaction = inVersion {
    val exported = packet.downField("json").focus.getOrElse(fail("missing transaction JSON"))
    require(exported.isObject, "transaction JSON object")
    val decoded = transactionDecoder.decodeJson(exported).fold(e => fail(e.message), identity)
    val reader = new VLQByteBufferReader(ByteBuffer.wrap(bytes.clone()))
    val parsed = ErgoTransactionSerializer.parse(reader)
    require(reader.remaining == 0, "transaction trailing bytes")
    require(ErgoTransactionSerializer.toBytes(decoded).sameElements(bytes), "JSON differs from signed bytes")
    require(ErgoTransactionSerializer.toBytes(parsed).sameElements(bytes), "signed byte roundtrip")
    val expected = str(packet, "id")
    require(expected.matches("[0-9a-f]{64}") && decoded.id == expected && parsed.id == expected, "transaction identity")
    require(str(exported.hcursor, "id") == expected, "JSON claimed identity")
    require(parsed.inputs.size == 2 && parsed.dataInputs.isEmpty, "exact two-input transaction")
    parsed
  }
  private lazy val inputs: Vector[ErgoBox] = entries(cursor, "inputs", 2).map(parseInput)
  private def parseInput(value: Json): ErgoBox = inVersion {
    exactFields(value, Set("id", "serializedHex"))
    val bytes = unhex(str(value.hcursor, "serializedHex"))
    val reader = SigmaSerializer.startReader(bytes.clone())
    val box = ErgoBox.sigmaSerializer.parse(reader)
    require(reader.remaining == 0 && ErgoBox.sigmaSerializer.toBytes(box).sameElements(bytes), "input byte roundtrip")
    require(hex(box.id) == str(value.hcursor, "id"), "input identity")
    box
  }
  private lazy val headers: Vector[Header] = entries(cursor, "headers", 10).map(parseHeader)
  private def parseHeader(value: Json): Header = {
    exactFields(value, Set("id", "serializedHex"))
    val bytes = unhex(str(value.hcursor, "serializedHex"))
    val reader = new VLQByteBufferReader(ByteBuffer.wrap(bytes.clone()))
    val header = HeaderSerializer.parse(reader)
    require(reader.remaining == 0 && HeaderSerializer.toBytes(header).sameElements(bytes), "header byte roundtrip")
    require(header.id == str(value.hcursor, "id"), "header identity")
    header
  }

  private def checkInputOrder(tx: ErgoTransaction, boxes: Vector[ErgoBox]): Unit = {
    require(tx.inputs.map(i => hex(i.boxId)) == boxes.map(b => hex(b.id)), "ordered input identity")
    require(boxes.map(b => hex(b.id)).distinct.size == 2, "distinct input identities")
  }
  private def checkHeaderOrder(window: Vector[Header]): Unit = {
    require(window.size == 10, "exact header window")
    // Keep the independent height and parent predicates separately observable.
    require(window.sliding(2).forall(pair => pair.head.height == pair(1).height + 1), "newest-first header heights")
    require(window.sliding(2).forall(pair => pair.head.parentId == pair(1).id), "newest-first header parents")
  }

  private def settings(scratch: Path, minerRewardDelay: Int, actualMinimumFee: Boolean): ErgoSettings = {
    require(minerRewardDelay == 720 || minerRewardDelay == 1, "bounded monetary delay comparison")
    val source = Paths.get(property("root")).toAbsolutePath.normalize()
    val bytes = boundedFile(source.resolve("src/main/resources/application.conf"), MaxFixtureBytes)
    require(sha256(bytes) == SourceConfigHash, "pinned main-source configuration mismatch")
    // Parse only these pinned source bytes. Do not use defaultApplication,
    // defaultOverrides, ErgoSettingsReader, private files, or environment values.
    val config = ConfigFactory.parseString(new String(bytes, Charsets.UTF_8))
      .withValue("ergo.directory", ConfigValueFactory.fromAnyRef(scratch.toString))
      .withValue("scorex.dataDir", ConfigValueFactory.fromAnyRef(scratch.resolve("inert-scorex").toString))
      .withValue("scorex.logDir", ConfigValueFactory.fromAnyRef(scratch.resolve("inert-log").toString))
      .withValue("ergo.chain.monetary.minerRewardDelay", ConfigValueFactory.fromAnyRef(minerRewardDelay))
      .resolve(ConfigResolveOptions.noSystem())
    val node = config.as[NodeConfigurationSettings]("ergo.node")
    require(!node.mining && node.blacklistedTransactions.isEmpty, "inert baseline node settings")
    node.minimalFeeAmount shouldBe 1000000L
    // The generated isolated target sets ergo.node.minimalFeeAmount = 0
    // (node-process-v1.ts), independently of monetary.minerRewardDelay = 1.
    // Candidate comparisons use that policy at both delays; old cases retain
    // the pinned application.conf positive minimum without another override.
    val selectedNode = if (actualMinimumFee) node.copy(minimalFeeAmount = 0L) else node
    val wallet = config.as[WalletSettings]("ergo.wallet")
    require(wallet.testMnemonic.isEmpty && wallet.testKeysQty.isEmpty, "inert wallet settings")
    ErgoSettings(scratch.toString, NetworkType.DevNet, config.as[ChainSettings]("ergo.chain"), selectedNode,
      config.as[ScorexSettings]("scorex"), wallet, config.as[CacheSettings]("ergo.cache"))
  }

  private def checkFixture(): Unit = {
    BlockVersion shouldBe 3.toByte
    ScriptVersion shouldBe 2.toByte
    checkInputOrder(transaction, inputs)
    checkHeaderOrder(headers)
    val anchor = cursor.downField("anchor").focus.getOrElse(fail("missing anchor"))
    exactFields(anchor, Set("id", "height", "index", "extensionRootHex"))
    val index = int(anchor.hcursor, "index")
    require(index >= 0 && index < 10, "anchor index")
    headers(index).id shouldBe str(anchor.hcursor, "id")
    headers(index).height shouldBe int(anchor.hcursor, "height")
    hex(headers(index).extensionRoot) shouldBe str(anchor.hcursor, "extensionRootHex")
    require(int(cursor, "checkpointExpiryHeight") > headers.head.height + 1, "unexpired fixture context")
  }

  private def withState[A](availableInputs: Vector[ErgoBox] = inputs, minerRewardDelay: Int = 720,
                           actualMinimumFee: Boolean = false)
                          (body: (UtxoState, ErgoSettings, ErgoStateContext) => A): A = {
    checkFixture()
    val parent = Paths.get(property("scratch")).toAbsolutePath.normalize()
    require(Files.isDirectory(parent, LinkOption.NOFOLLOW_LINKS) && !Files.isSymbolicLink(parent), "scratch parent directory")
    require(parent.toRealPath() == parent, "scratch parent must be canonical")
    require(!parent.startsWith(Paths.get(property("root")).toRealPath()), "scratch must be outside source root")
    val directory = Files.createTempDirectory(parent, "native-tracker-mempool-")
    var store: Option[LDBVersionedStore] = None
    var snapshotsStore: Option[LDBKVStore] = None
    try {
      val config = settings(directory, minerRewardDelay, actualMinimumFee)
      config.chainSettings.monetary.minerRewardDelay shouldBe minerRewardDelay
      val prover = new BatchAVLProver[Digest32, HF](32, None)
      BoxHolder(availableInputs).sortedBoxes.foreach(box => prover.performOneOperation(Insert(box.id, ADValue @@ box.bytes)).get)
      val base = new ErgoStateContext(headers, None, config.chainSettings.genesisStateDigest,
        parameters, ErgoValidationSettings.initial, VotingData.empty)(config.chainSettings)
      val db = new LDBVersionedStore(directory.toFile, initialKeepVersions = config.nodeSettings.keepVersions)
      store = Some(db)
      // UtxoState eagerly opens the node's separate snapshots database, while
      // closeStorage closes only ldb_main/ldb_undo. Retain the registry-owned
      // instance first so this bounded harness can close that exact database.
      snapshotsStore = Some(LDBFactory.createKvDb(s"${config.directory}/snapshots"))
      val version = idToVersion(headers.head.id)
      val persistent = PersistentBatchAVLProver.create(prover, new VersionedLDBAVLStorage(db),
        UtxoState.metadata(version, prover.digest, None, base), paranoidChecks = true).get
      val state = new UtxoState(persistent, version, db, config)
      db.get(ErgoStateReader.ContextKey).get.toVector shouldBe base.bytes.toVector
      state.stateContext.bytes.toVector shouldBe base.bytes.toVector
      state.stateContext.blockVersion shouldBe BlockVersion
      availableInputs.foreach(box => state.boxById(box.id).get.bytes.toVector shouldBe box.bytes.toVector)
      body(state, config, base)
    } finally {
      // All derived states share these registry-owned stores. Close each exact
      // database once, then remove only this invocation's child.
      try snapshotsStore.foreach(_.close()) finally store.foreach(_.close())
      val walk = Files.walk(directory)
      val owned = try walk.iterator().asScala.toVector finally walk.close()
      owned.foreach(p => require(p.toAbsolutePath.normalize().startsWith(directory) && !Files.isSymbolicLink(p), "unsafe scratch cleanup"))
      owned.sortBy(_.getNameCount).reverse.foreach(p => Files.delete(p))
      require(!Files.exists(directory, LinkOption.NOFOLLOW_LINKS), "scratch cleanup incomplete")
    }
  }

  private val candidateMiner = ProveDlog(group.generator)

  private def candidateUpcoming(base: ErgoStateContext): ErgoStateContext = {
    val upcoming = base.upcoming(candidateMiner.value, headers.head.timestamp + 120000L,
      headers.head.nBits, Array(0.toByte, 0.toByte, 0.toByte), ErgoValidationSettingsUpdate.empty, BlockVersion)
    upcoming.currentHeight shouldBe headers.head.height + 1
    upcoming.blockVersion shouldBe BlockVersion
    upcoming.lastHeaders.map(_.id) shouldBe headers.map(_.id)
    upcoming
  }

  private def checkContextWindow(index: Int, fullValid: Boolean): Unit = inVersion {
    require(index == 8 || index == 9, "bounded context-window comparison")
    sha256(fixtureBytes) shouldBe "ff5b4efec4ef8dc0d1c3631f43ad0c3d18ad8972c8c647141c6de720abade8bf"
    signedBytes.length shouldBe 4173
    headers.head.height shouldBe 1029
    int(cursor, "checkpointExpiryHeight") shouldBe 1060
    Constants.LastHeadersInContext shouldBe 10
    val anchor = headers(1)
    anchor.height shouldBe 1028
    transaction.outputs.map(_.creationHeight) shouldBe IndexedSeq(1030, 1030)
    transaction.outputs.head.additionalRegisters(ErgoBox.R8) shouldBe sigma.ast.IntConstant(1030)
    val frozenTransaction = signedBytes.toVector
    val frozenInputs = inputs.map(box => ErgoBox.sigmaSerializer.toBytes(box).toVector)
    val frozenHeaders = headers.map(header => HeaderSerializer.toBytes(header).toVector)
    val frozenAnchor = HeaderSerializer.toBytes(anchor).toVector

    def child(tip: Header): Header = tip.copy(parentId = tip.id, height = tip.height + 1,
      timestamp = tip.timestamp + 120000L, version = BlockVersion,
      votes = Array(0.toByte, 0.toByte, 0.toByte), sizeOpt = None)
    def sigmaIds(context: ErgoStateContext): Vector[Vector[Byte]] =
      context.sigmaLastHeaders.toArray.toVector.map(_.id.toArray.toVector)
    def sigmaHeights(context: ErgoStateContext): Vector[Int] =
      context.sigmaLastHeaders.toArray.toVector.map(_.height)

    withState(actualMinimumFee = true) { (state, config, base) =>
      val frozenStateContext = base.bytes.toVector
      val tip = (1 until index).foldLeft(base) { (context, _) =>
        context.process(child(context.lastHeaders.head), None).get
      }
      checkHeaderOrder(tip.lastHeaders.toVector)
      tip.lastHeaders.head.height shouldBe 1028 + index
      tip.lastHeaders(index).id shouldBe anchor.id
      HeaderSerializer.toBytes(tip.lastHeaders(index)).toVector shouldBe frozenAnchor
      val next = child(tip.lastHeaders.head)
      // Synthetic descendants use the native producers. process() is the
      // transition after appendFullBlock's extension/size/height checks; no
      // full block or campaign header/state provenance is supplied here.
      val upcoming = tip.upcoming(next.minerPk, next.timestamp, next.nBits, next.votes,
        ErgoValidationSettingsUpdate.empty, next.version)
      val processed = tip.process(next, None).get
      processed.lastHeaders.map(_.id) shouldBe (next +: tip.lastHeaders.take(9)).map(_.id)
      sigmaHeights(upcoming) shouldBe (tip.currentHeight to (tip.currentHeight - 9) by -1).toVector
      sigmaHeights(processed) shouldBe (tip.currentHeight to (tip.currentHeight - 8) by -1).toVector
      sigmaIds(upcoming) shouldBe tip.lastHeaders.map(h => Header.toSigma(h).id.toArray.toVector).toVector
      sigmaIds(processed) shouldBe sigmaIds(upcoming).take(9)
      sigmaIds(upcoming)(index) shouldBe Header.toSigma(anchor).id.toArray.toVector
      sigmaIds(processed).contains(Header.toSigma(anchor).id.toArray.toVector) shouldBe fullValid

      val a = upcoming.sigmaPreHeader
      val b = processed.sigmaPreHeader
      a.height shouldBe next.height
      a.height shouldBe b.height
      a.version shouldBe b.version
      a.parentId.toArray.toVector shouldBe b.parentId.toArray.toVector
      a.timestamp shouldBe b.timestamp
      a.nBits shouldBe b.nBits
      a.minerPk.getEncoded.toArray.toVector shouldBe b.minerPk.getEncoded.toArray.toVector
      a.votes.toArray.toVector shouldBe b.votes.toArray.toVector
      upcoming.previousStateDigest.toArray.toVector shouldBe processed.previousStateDigest.toArray.toVector
      upcoming.currentParameters.parametersTable shouldBe processed.currentParameters.parametersTable
      upcoming.currentParameters.proposedUpdate shouldBe processed.currentParameters.proposedUpdate
      // The native producers differ in parameter-height metadata, while the
      // execution parameter table and validation settings remain identical.
      upcoming.currentParameters.height shouldBe next.height
      processed.currentParameters.height shouldBe tip.currentParameters.height
      upcoming.validationSettings.bytes.toVector shouldBe processed.validationSettings.bytes.toVector
      upcoming.blockVersion shouldBe processed.blockVersion
      upcoming.currentHeight shouldBe processed.currentHeight
      upcoming.currentHeight should be < int(cursor, "checkpointExpiryHeight")
      config.nodeSettings.checkpoint shouldBe None

      def execute(context: ErgoStateContext) = ErgoState.execTransactions(Seq(transaction), context, config.nodeSettings) { id =>
        state.boxById(id).map(scala.util.Success(_))
          .getOrElse(scala.util.Failure(new Exception("missing frozen input")))
      }
      val candidateResult = execute(upcoming)
      val fullResult = execute(processed)
      candidateResult.isValid shouldBe true
      candidateResult.payload.get should be > 0L
      fullResult.isValid shouldBe fullValid
      if (fullValid) fullResult.payload shouldBe candidateResult.payload
      else {
        fullResult.errors.size shouldBe 1
        fullResult.errors.head.message should include(transaction.id + ": #0 => Success((false,")
      }
      state.stateContext.bytes.toVector shouldBe frozenStateContext
      inputs.foreach(box => state.boxById(box.id).get.bytes.toVector shouldBe box.bytes.toVector)
      ErgoTransactionSerializer.toBytes(transaction).toVector shouldBe frozenTransaction
      inputs.map(box => ErgoBox.sigmaSerializer.toBytes(box).toVector) shouldBe frozenInputs
      headers.map(header => HeaderSerializer.toBytes(header).toVector) shouldBe frozenHeaders
      HeaderSerializer.toBytes(anchor).toVector shouldBe frozenAnchor
      info(s"synthetic_native_context_window anchor_index=$index tip=${tip.currentHeight} " +
        s"execution_height=${upcoming.currentHeight} upcoming_headers=${upcoming.sigmaLastHeaders.length} " +
        s"processed_headers=${processed.sigmaLastHeaders.length} upcoming_valid=${candidateResult.isValid} " +
        s"processed_valid=${fullResult.isValid} actual_campaign_context=false")
    }
  }

  test("native upcoming and processed contexts both execute the unchanged tracker at anchor index eight") {
    checkContextWindow(8, fullValid = true)
  }

  test("native upcoming executes the unchanged tracker at index nine while processed context rejects its input script") {
    checkContextWindow(9, fullValid = false)
  }

  private def checkCandidate(minerRewardDelay: Int, requireValidFee: Boolean): Unit = {
    withState(minerRewardDelay = minerRewardDelay, actualMinimumFee = true) { (state, config, base) =>
      config.nodeSettings.minimalFeeAmount shouldBe 0L
      val upcoming = candidateUpcoming(base)
      val verifier = ErgoInterpreter(upcoming.currentParameters)
      val maxCost = upcoming.currentParameters.maxBlockCost
      val maxSize = upcoming.currentParameters.maxBlockSize
      val originalCost = inVersion { state.validateWithCost(transaction, upcoming, maxCost, Some(verifier)).get }
      originalCost should be > 0
      val pool = ErgoMemPool.empty(config)
      val (acceptedPool, admission) = inVersion { pool.process(UnconfirmedTransaction(transaction, None), state) }
      admission shouldBe a[ProcessingOutcome.Accepted]
      acceptedPool.modifierById(transaction.id).get.bytes.toVector shouldBe signedBytes.toVector

      val matchingFeeBoxes = transaction.outputs.filter(box =>
        java.util.Arrays.equals(box.propositionBytes, config.chainSettings.monetary.feePropositionBytes))
      if (minerRewardDelay == 1) matchingFeeBoxes shouldBe empty
      val fee = CandidateGenerator.collectFees(base.currentHeight, Seq(transaction), candidateMiner, upcoming)
      fee.isDefined shouldBe matchingFeeBoxes.nonEmpty
      val feeValidation = fee.map { generated =>
        generated.inputs.map(input => hex(input.boxId)) shouldBe matchingFeeBoxes.map(box => hex(box.id))
        generated.outputs.size shouldBe 1
        generated.outputs.head.value shouldBe matchingFeeBoxes.map(_.value).sum
        generated.outputs.head.creationHeight shouldBe upcoming.currentHeight
        inVersion { generated.statefulValidity(matchingFeeBoxes, IndexedSeq(), upcoming)(verifier) }
      }
      val (selected, eliminated) = inVersion {
        CandidateGenerator.collectTxs(candidateMiner, maxCost, maxSize, state, upcoming, Seq(transaction))
      }
      info(s"synthetic_native_tracker_candidate_delay=$minerRewardDelay selected=${selected.size} " +
        s"original_selected=${selected.exists(_.id == transaction.id)} matching_fee_boxes=${matchingFeeBoxes.size} " +
        s"fee_generated=${fee.isDefined} fee_valid=${feeValidation.map(_.isSuccess)} eliminated=${eliminated.size} " +
        s"shared_cost=$originalCost original_id=${transaction.id}")
      if (requireValidFee) {
        fee.isDefined shouldBe true
        feeValidation.get.isSuccess shouldBe true
      }
      // Both monetary settings must retain the original transaction. A failed
      // fee spend must stay RED rather than becoming an accepted empty result.
      selected.exists(_.id == transaction.id) shouldBe true
      val expected = Seq(transaction) ++ fee.toSeq
      selected.map(_.id) shouldBe expected.map(_.id)
      selected.map(_.bytes.toVector) shouldBe expected.map(_.bytes.toVector)
      eliminated shouldBe empty
      selected.head.id shouldBe transaction.id
      selected.head.bytes.toVector shouldBe signedBytes.toVector
      feeValidation.foreach(_.isSuccess shouldBe true)
      val costs = Seq(transaction -> originalCost) ++ fee.toSeq.zip(feeValidation.toSeq.map(_.get))
      CandidateGenerator.correctLimits(costs, maxCost, maxSize) shouldBe true
      state.stateContext.bytes.toVector shouldBe base.bytes.toVector
      inputs.foreach(box => state.boxById(box.id).get.bytes.toVector shouldBe box.bytes.toVector)
      transaction.bytes.toVector shouldBe signedBytes.toVector
    }
  }

  test("candidate selection at monetary delay 720 includes exact tracker bytes and a valid generated fee") {
    checkCandidate(720, requireValidFee = true)
  }

  test("candidate selection at monetary delay 1 retains exact tracker bytes with its actual fee handling") {
    checkCandidate(1, requireValidFee = false)
  }

  test("delay 1 unchanged tracker is declined only when the baseline positive minimum fee is restored") {
    withState(minerRewardDelay = 1, actualMinimumFee = true) { (state, config, base) =>
      config.nodeSettings.minimalFeeAmount shouldBe 0L
      transaction.outputs.filter(_.ergoTree == config.chainSettings.monetary.feeProposition) shouldBe empty
      val upcoming = candidateUpcoming(base)
      inVersion { state.validateWithCost(transaction, upcoming, config.nodeSettings.maxTransactionCost, None).isSuccess } shouldBe true
      val unconfirmed = UnconfirmedTransaction(transaction, None)
      val (acceptedPool, accepted) = inVersion { ErgoMemPool.empty(config).process(unconfirmed, state) }
      accepted shouldBe a[ProcessingOutcome.Accepted]
      acceptedPool.modifierById(transaction.id).get.bytes.toVector shouldBe signedBytes.toVector
      // Same state, headers, signed bytes and monetary delay. Only the pinned
      // application.conf minimum changes from the actual target's 0 to 1M.
      val positiveMinimum = config.copy(nodeSettings = config.nodeSettings.copy(minimalFeeAmount = 1000000L))
      val (declinedPool, declined) = inVersion { ErgoMemPool.empty(positiveMinimum).process(unconfirmed, state) }
      declined shouldBe a[ProcessingOutcome.Declined]
      declined.asInstanceOf[ProcessingOutcome.Declined].e.getMessage shouldBe
        "Min fee not met: 0.001 ergs required, 0.0 ergs given"
      declinedPool.size shouldBe 0
      declinedPool.isInvalidated(transaction.id) shouldBe false
      state.stateContext.bytes.toVector shouldBe base.bytes.toVector
      inputs.foreach(box => state.boxById(box.id).get.bytes.toVector shouldBe box.bytes.toVector)
      transaction.bytes.toVector shouldBe signedBytes.toVector
    }
  }

  test("candidate selection eliminates exact tracker ID when only its required fee UTXO is absent") {
    withState(inputs.take(1), minerRewardDelay = 1, actualMinimumFee = true) { (state, _, base) =>
      val upcoming = candidateUpcoming(base)
      state.boxById(inputs.head.id).get.bytes.toVector shouldBe inputs.head.bytes.toVector
      state.boxById(inputs(1).id) shouldBe None
      val (selected, eliminated) = inVersion {
        CandidateGenerator.collectTxs(candidateMiner, upcoming.currentParameters.maxBlockCost,
          upcoming.currentParameters.maxBlockSize, state, upcoming, Seq(transaction))
      }
      selected shouldBe empty
      eliminated shouldBe Seq(transaction.id)
      state.stateContext.bytes.toVector shouldBe base.bytes.toVector
      transaction.bytes.toVector shouldBe signedBytes.toVector
    }
  }

  test("exact native tracker bytes pass persisted UTXO validation and real mempool acceptance") {
    withState() { (state, config, base) =>
      val pool = ErgoMemPool.empty(config)
      val overlay = state.withMempool(pool)
      overlay.stateContext.bytes.toVector shouldBe base.bytes.toVector
      inputs.foreach(box => overlay.boxById(box.id).get.bytes.toVector shouldBe box.bytes.toVector)
      val upcoming = state.stateContext.simplifiedUpcoming()
      upcoming.blockVersion shouldBe BlockVersion
      upcoming.currentHeight shouldBe headers.head.height + 1
      transaction.size shouldBe signedBytes.length
      transaction.size should be <= config.nodeSettings.maxTransactionSize
      val cost = inVersion { overlay.validateWithCost(transaction, upcoming, config.nodeSettings.maxTransactionCost, None).get }
      cost should be > 0
      cost should be <= config.nodeSettings.maxTransactionCost
      val unconfirmed = UnconfirmedTransaction(transaction, None).withCost(cost)
      val (acceptedPool, outcome) = pool.process(unconfirmed, state)
      outcome shouldBe a[ProcessingOutcome.Accepted]
      outcome.asInstanceOf[ProcessingOutcome.Accepted].tx.lastCost shouldBe Some(cost)
      acceptedPool.size shouldBe 1
      acceptedPool.modifierById(transaction.id).get.bytes.toVector shouldBe signedBytes.toVector
      pool.size shouldBe 0
      state.stateContext.bytes.toVector shouldBe base.bytes.toVector
      inputs.foreach(box => state.boxById(box.id).get.bytes.toVector shouldBe box.bytes.toVector)

      // Same bytes and state; only prior pool membership changes.
      val (duplicatePool, duplicate) = acceptedPool.process(unconfirmed, state)
      duplicate shouldBe a[ProcessingOutcome.Declined]
      duplicatePool.size shouldBe 1
      duplicatePool.contains(transaction.id) shouldBe true
      duplicatePool.isInvalidated(transaction.id) shouldBe false

      // Same bytes and UTXO state; only the local blacklist policy changes.
      val blacklisted = config.copy(nodeSettings = config.nodeSettings.copy(blacklistedTransactions = Seq(transaction.id)))
      val (blockedPool, blocked) = ErgoMemPool.empty(blacklisted).process(unconfirmed, state)
      blocked shouldBe a[ProcessingOutcome.Invalidated]
      blocked.asInstanceOf[ProcessingOutcome.Invalidated].e.getMessage shouldBe "blacklisted tx"
      blockedPool.size shouldBe 0
      blockedPool.isInvalidated(transaction.id) shouldBe true
      ErgoTransactionSerializer.toBytes(transaction).toVector shouldBe signedBytes.toVector
      info(s"synthetic_native_tracker_mempool=accepted shared_cost=$cost signed_bytes=${signedBytes.length} " +
        s"block_version=$BlockVersion duplicate=declined blacklist=invalidated")
    }
  }

  // The immutable outer fixture is hash-checked first. Each negative changes one
  // already-decoded in-memory subject and calls the positive path's predicate;
  // an outer hash/length failure must not mask the intended consumer rejection.
  test("signed transaction parser rejects one trailing byte") {
    checkFixture()
    val changed = signedBytes ++ Array(0.toByte)
    intercept[IllegalArgumentException](parseTransaction(txJson, changed)).getMessage shouldBe
      "requirement failed: transaction trailing bytes"
  }

  test("signed transaction parser rejects only a substituted claimed identity") {
    checkFixture()
    val different = if (transaction.id == "00" * 32) "01" * 32 else "00" * 32
    val changed = txJson.focus.get.mapObject(_.add("id", Json.fromString(different)))
    intercept[IllegalArgumentException](parseTransaction(changed.hcursor, signedBytes)).getMessage shouldBe
      "requirement failed: transaction identity"
  }

  test("input parser rejects valid substituted serialization under the original box identity") {
    checkFixture()
    val original = entries(cursor, "inputs", 2)
    val changed = original.head.mapObject(_.add("serializedHex", original(1).hcursor.downField("serializedHex").focus.get))
    intercept[IllegalArgumentException](parseInput(changed)).getMessage shouldBe
      "requirement failed: input identity"
  }

  test("input ordering rejects the same two valid boxes in reverse order") {
    checkFixture()
    val changed = entries(cursor, "inputs", 2).reverse.map(parseInput)
    intercept[IllegalArgumentException](checkInputOrder(transaction, changed)).getMessage shouldBe
      "requirement failed: ordered input identity"
  }

  test("header parser rejects valid substituted serialization under the original header identity") {
    checkFixture()
    val original = entries(cursor, "headers", 10)
    val changed = original.head.mapObject(_.add("serializedHex", original(1).hcursor.downField("serializedHex").focus.get))
    intercept[IllegalArgumentException](parseHeader(changed)).getMessage shouldBe
      "requirement failed: header identity"
  }

  test("header ordering rejects one changed parent with all heights preserved") {
    checkFixture()
    val changed = headers.updated(0, headers.head.copy(parentId = headers(2).id, sizeOpt = None))
    intercept[IllegalArgumentException](checkHeaderOrder(changed)).getMessage shouldBe
      "requirement failed: newest-first header parents"
  }

  test("header ordering rejects one changed newest height with parent links preserved") {
    checkFixture()
    val changed = headers.updated(0, headers.head.copy(height = headers.head.height + 1, sizeOpt = None))
    changed.sliding(2).foreach(pair => pair.head.parentId shouldBe pair(1).id)
    intercept[IllegalArgumentException](checkHeaderOrder(changed)).getMessage shouldBe
      "requirement failed: newest-first header heights"
  }

  test("shared validation and real pool reject one absent required UTXO without altering transaction bytes") {
    withState(inputs.take(1)) { (state, config, base) =>
      val pool = ErgoMemPool.empty(config)
      val overlay = state.withMempool(pool)
      overlay.stateContext.bytes.toVector shouldBe base.bytes.toVector
      overlay.boxById(inputs.head.id).get.bytes.toVector shouldBe inputs.head.bytes.toVector
      overlay.boxById(inputs(1).id) shouldBe None
      val result = inVersion {
        overlay.validateWithCost(transaction, state.stateContext.simplifiedUpcoming(), config.nodeSettings.maxTransactionCost, None)
      }
      result.isFailure shouldBe true
      result.failed.get.getMessage should include("Missing inputs: 1")
      val (next, outcome) = pool.process(UnconfirmedTransaction(transaction, None), state)
      outcome shouldBe a[ProcessingOutcome.Declined]
      outcome.asInstanceOf[ProcessingOutcome.Declined].e.getMessage shouldBe "not all utxos in place yet"
      next.size shouldBe 0
      next.isInvalidated(transaction.id) shouldBe false
      state.stateContext.bytes.toVector shouldBe base.bytes.toVector
      ErgoTransactionSerializer.toBytes(transaction).toVector shouldBe signedBytes.toVector
    }
  }

  private def inVersion[A](body: => A): A = VersionContext.withVersions(ScriptVersion, ScriptVersion)(body)
  private def property(name: String): String = {
    val value = System.getProperty(Prefix + name)
    require(value != null && value.nonEmpty, s"missing -D$Prefix$name")
    value
  }
  private def boundedFile(path: Path, limit: Int): Array[Byte] = {
    require(Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) && !Files.isSymbolicLink(path), "regular source/fixture file")
    require(Files.size(path) > 0 && Files.size(path) <= limit, "source/fixture size bound")
    val stream = Files.newInputStream(path)
    val bytes = try stream.readNBytes(limit + 1) finally stream.close()
    require(bytes.nonEmpty && bytes.length <= limit, "bounded source/fixture read")
    bytes
  }
  private def exactFields(value: Json, fields: Set[String]): Unit =
    require(value.asObject.exists(_.keys.toSet == fields), "exact fixture fields")
  private def entries(c: ACursor, name: String, count: Int): Vector[Json] = {
    val values = c.downField(name).as[Vector[Json]].fold(e => fail(e.message), identity)
    require(values.size == count, s"exact $name count")
    values
  }
  private def str(c: ACursor, name: String): String = c.downField(name).as[String].fold(e => fail(e.message), identity)
  private def int(c: ACursor, name: String): Int = c.downField(name).as[Int].fold(e => fail(e.message), identity)
  private def unhex(value: String): Array[Byte] = {
    require(value.matches("(?:[0-9a-f]{2})+"), "canonical nonempty hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }
  private def hex(bytes: Array[Byte]): String = bytes.map(b => f"${b & 0xff}%02x").mkString
  private def sha256(bytes: Array[Byte]): String = hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
