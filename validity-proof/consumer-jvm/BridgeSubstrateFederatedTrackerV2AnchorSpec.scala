package sigma.bridge

import java.math.BigInteger
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets.US_ASCII
import java.nio.file.{Files, Paths}
import java.security.MessageDigest

import io.circe.{ACursor, Json}
import io.circe.parser
import org.ergoplatform._
import org.ergoplatform.sdk.JsonCodecs
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.authds.{ADKey, ADValue}
import scorex.crypto.authds.avltree.batch.{BatchAVLProver, Insert}
import scorex.crypto.hash.{Blake2b256, Digest32}
import scorex.util.bytesToId
import sigma.{Colls, Header, VersionContext}
import sigma.ast._
import sigma.compiler.{CompilerResult, SigmaCompiler}
import sigma.compiler.ir.CompiletimeIRContext
import sigma.data.{AvlTreeData, AvlTreeFlags, CAvlTree, CHeader, CTHRESHOLD, SigmaBoolean, TrivialProp}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.{ErgoTreeSerializer, GroupElementSerializer, SigmaSerializer}
import sigmastate.crypto.DLogProtocol.DLogProverInput
import sigmastate.crypto.SigmaProtocolPrivateInput
import sigmastate.eval.CPreHeader
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter, ErgoLikeTestProvingInterpreter}
import sigmastate.helpers.TestingHelpers.{copyBox, copyContext}

/** Inactive synthetic input-script proof test, not target-node/mempool acceptance.
  * The one-input, value-preserving transaction has no miner fee; it is not a V1 receipt.
  */
class BridgeSubstrateFederatedTrackerV2AnchorSpec
    extends AnyFunSuite with Matchers with JsonCodecs {
  private val Prefix = "bridge.substrate.federated.tracker.v2."
  private val StatementDomain = ascii("E2S_SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1")
  private val KeyDomain = ascii("E2S_SPV_SUBSTRATE_FEDERATED_KEY_V1")
  private val ValueDomain = ascii("E2S_SPV_SUBSTRATE_FEDERATED_VALUE_V1")
  private val Discriminator = Array[Byte](1, 1, 1, 0)
  private val serializer = ErgoTreeSerializer.DefaultSerializer
  private final case class Scenario(tx: ErgoLikeTransaction, self: ErgoBox,
      headers: Array[CHeader], height: Int)

  // These are public test scalars, never wallet or runtime inputs.
  private val keys = (1 to 3).map(n => DLogProverInput(BigInteger.valueOf(n.toLong)))
    .sortBy(k => hex(GroupElementSerializer.toBytes(k.publicImage.value))).toVector
  private val keyHex = keys.map(k => hex(GroupElementSerializer.toBytes(k.publicImage.value)))
  private val threshold = CTHRESHOLD(2, keys.map(_.publicImage))
  private lazy val fixtureBytes = {
    val bytes = readFile(requiredProperty("context.fixture"))
    sha256(bytes) shouldBe "1eafd524364dc496030200ddd06ea3b8edc56509ef6568807cf923858ce92efe"
    bytes
  }
  private lazy val fixture = json(fixtureBytes).hcursor
  private lazy val profileInput = fixture.downField("profileInput")
  private lazy val statementInput = fixture.downField("statementInput")
  private lazy val profile = fixture.downField("profile")
  private lazy val statement = fixture.downField("statement")
  private lazy val base = fixture.downField("baseContext")
  private lazy val transition = base.downField("trackerTransition")
  private lazy val initialHeight = number(transition, "currentErgoHeight").toInt
  private lazy val anchorIndex = number(transition, "anchorContextIndex").toInt
  private lazy val baseBox = inVersion {
    val reader = SigmaSerializer.startReader(unhex(str(base, "inputBoxSigmaHex")))
    val box = ErgoBox.sigmaSerializer.parse(reader)
    reader.remaining shouldBe 0
    box
  }
  private lazy val baseHeaders = transition.downField("headers").as[Vector[Json]].fold(
    e => fail(e.getMessage), identity).map { entry =>
    val c = entry.hcursor
    val h = json(ascii(str(c, "jvmHeaderJson"))).as[Header].fold(
      e => fail(e.getMessage), identity).asInstanceOf[CHeader]
    hex(h.id.toArray) shouldBe str(c, "id")
    hex(ErgoHeader.sigmaSerializer.toBytes(h.ergoHeader)) shouldBe str(c, "serializedHex")
    h
  }.toArray
  private lazy val sourceBytes = {
    val bytes = readFile(Paths.get(requiredProperty("root"))
      .resolve("contracts/SPVTrackerSubstrateFederatedV2.es").toString)
    sha256(bytes) shouldBe "110b1aa22d59e1202435bb139cadbb49f28a48c8b8a3056d0426e620ee828eec"
    bytes
  }
  private lazy val statementBytes = {
    checkIdentity()
    unhex(str(statement, "encodedStatementHex"))
  }
  private lazy val trackerTree = {
    val tree = compile(resolveSource())
    val request = fixture.downField("compilerRequest")
    val receipt = fixture.downField("compilerReceipt")
    val contract = receipt.downField("contract")
    str(request, "schema") shouldBe "e2s.substrate-federated-tracker-compiler-request.v2"
    number(request, "version") shouldBe 2L
    str(request, "anchorSelector") shouldBe "absolute-ergo-header-height"
    str(request.downField("template"), "templateSourceSha256Hex") shouldBe sha256(sourceBytes)
    str(request.downField("template"), "resolvedSourceSha256Hex") shouldBe sha256(ascii(resolveSource()))
    str(request, "trackerNftIdHex") shouldBe str(transition, "trackerNftIdHex")
    str(request.downField("profile"), "encodedProfileHex") shouldBe str(profile, "encodedProfileHex")
    str(receipt, "schema") shouldBe "e2s.substrate-federated-tracker-jvm-compiler-receipt.v2"
    number(receipt, "version") shouldBe 2L
    str(receipt, "anchorSelector") shouldBe "absolute-ergo-header-height"
    str(receipt, "compilerRequestDigestHex") shouldBe str(request, "requestDigestHex")
    str(receipt.downField("compiler"), "sigmaStateVersion") shouldBe "6.0.2"
    number(receipt.downField("compiler"), "scriptVersion") shouldBe 3L
    number(receipt.downField("compiler"), "treeVersion") shouldBe 0L
    str(contract, "resolvedSourceSha256Hex") shouldBe sha256(ascii(resolveSource()))
    val compiled = serializer.serializeErgoTree(tree)
    str(contract, "propositionHex") shouldBe hex(compiled)
    number(contract, "propositionBytes") shouldBe compiled.length.toLong
    str(contract, "propositionSha256Hex") shouldBe sha256(compiled)
    str(contract, "contractIdHex") shouldBe hex(Blake2b256.hash(compiled))
    tree
  }
  private lazy val canonical = build(statementBytes)
  private lazy val signed = sign(canonical, keys.take(2))

  test("locked compiler V2 bytes match independent JVM compilation under the synthetic profile") {
    statementBytes.length shouldBe 512
    serializer.serializeErgoTree(trackerTree) should contain theSameElementsInOrderAs
      serializer.serializeErgoTree(compile(resolveSource()))
    hex(serializer.serializeErgoTree(trackerTree)) should not be
      hex(serializer.serializeErgoTree(baseBox.ergoTree))
    reduce(canonical) shouldBe threshold
    verify(canonical) shouldBe false
    println(s"substrate_federated_tracker_v2_fixture_sha256=${sha256(fixtureBytes)}")
    println(s"substrate_federated_tracker_v2_template_sha256=${sha256(sourceBytes)}")
    println(s"substrate_federated_tracker_v2_resolved_sha256=${sha256(ascii(resolveSource()))}")
    println(s"substrate_federated_tracker_v2_tree_sha256=${sha256(serializer.serializeErgoTree(trackerTree))}")
  }

  test("fresh 2-of-3 input-script proof verifies unchanged until its anchor leaves ten headers") {
    val frozen = ErgoLikeTransactionSerializer.toBytes(signed.tx).clone()
    val frozenMessage = signed.tx.messageToSign.clone()
    val frozenInput = ErgoBox.sigmaSerializer.toBytes(signed.self).clone()
    val anchor = signed.headers(anchorIndex)
    val retainedSteps = 9 - anchorIndex
    retainedSteps should be >= 1
    readLong(statementBytes, 504) should be > (initialHeight.toLong + retainedSteps + 1)
    var headers = signed.headers
    (0 to retainedSteps).foreach { step =>
      withClue(s"descendant $step: ") {
        headers should have length 10
        headers(anchorIndex + step).id shouldBe anchor.id
        headers(anchorIndex + step).height shouldBe anchor.height
        val replay = signed.copy(tx = parseTransaction(frozen), headers = headers,
          height = initialHeight + step)
        context(replay).preHeader.height shouldBe initialHeight + step
        context(replay).preHeader.parentId shouldBe headers.head.id
        reduce(replay) shouldBe threshold
        verify(replay) shouldBe true
        ErgoLikeTransactionSerializer.toBytes(replay.tx) should
          contain theSameElementsInOrderAs frozen
        replay.tx.messageToSign should contain theSameElementsInOrderAs frozenMessage
        ErgoBox.sigmaSerializer.toBytes(replay.self) should
          contain theSameElementsInOrderAs frozenInput
      }
      headers = descend(headers)
    }
    headers.exists(_.id == anchor.id) shouldBe false
    val evicted = signed.copy(tx = parseTransaction(frozen), headers = headers,
      height = initialHeight + retainedSteps + 1)
    reduce(evicted) shouldBe TrivialProp.FalseProp
    verify(evicted) shouldBe false
    verify(signed) shouldBe true
  }

  test("V1 with the same synthetic profile signs at baseline but fails after one descendant") {
    val bytes = readFile(Paths.get(requiredProperty("root"))
      .resolve("contracts/SPVTrackerSubstrateFederatedV1.es").toString)
    sha256(bytes) shouldBe "8ea6c51bd501d59f10ba0c771828881d4fea10dc48d2cba451949a3f573ec852"
    val v1 = compile(resolveSource(bytes, "SPVTrackerSubstrateFederatedV1"))
    val sameRoots = relink(canonical.headers.zipWithIndex.map { case (h, i) =>
      if (i < anchorIndex) new CHeader(h.ergoHeader.copy(
        extensionRoot = Digest32 @@ canonical.headers(anchorIndex).extensionRoot.toArray, _bytes = null))
      else h
    })
    val indexed = withHeight(withTree(canonical.copy(headers = sameRoots), v1), anchorIndex)
    val v1Signed = sign(indexed, keys.take(2))
    val frozen = ErgoLikeTransactionSerializer.toBytes(v1Signed.tx).clone()
    val advanced = v1Signed.copy(tx = parseTransaction(frozen), headers = descend(sameRoots),
      height = initialHeight + 1)
    context(advanced).preHeader.height shouldBe initialHeight + 1
    advanced.headers(anchorIndex).extensionRoot shouldBe sameRoots(anchorIndex).extensionRoot
    assertFalse("V1 retained index", v1Signed, advanced)
    verify(advanced) shouldBe false
    ErgoLikeTransactionSerializer.toBytes(advanced.tx) should contain theSameElementsInOrderAs frozen
    verify(v1Signed) shouldBe true
  }

  test("zero and each one-key quorum fail specifically at the witness threshold") {
    (Vector(Vector.empty[DLogProverInput]) ++ keys.map(k => Vector(k))).foreach { witnesses =>
      withClue(s"${witnesses.size} witnesses: ") {
        reduce(canonical) shouldBe threshold
        val attempted = prover(witnesses).prove(trackerTree, context(canonical),
          canonical.tx.messageToSign)
        attempted.isFailure shouldBe true
        val failure = attempted.failed.get
        failure shouldBe a[AssertionError]
        failure.getMessage should include("Tree root should be real but was")
        verify(canonical) shouldBe false
        verify(signed) shouldBe true
      }
    }
  }

  test("signature and transaction-message mutations fail after successful threshold reduction") {
    verify(signed) shouldBe true
    val proof = signed.tx.inputs.head.spendingProof.proof.clone()
    proof.length should be > 0
    proof(proof.length - 1) = (proof.last ^ 1).toByte
    val signatureMutation = withProof(signed, ProverResult(proof, signed.tx.inputs.head.extension))
    signatureMutation.tx.messageToSign should contain theSameElementsInOrderAs signed.tx.messageToSign
    reduce(signatureMutation) shouldBe threshold
    verify(signatureMutation) shouldBe false

    val out = signed.tx.outputCandidates.head
    val alternate = new ErgoBoxCandidate(out.value, out.ergoTree, out.creationHeight - 1,
      out.additionalTokens, out.additionalRegisters)
    val messageMutation = signed.copy(tx = new ErgoLikeTransaction(signed.tx.inputs,
      signed.tx.dataInputs, IndexedSeq(alternate)))
    messageMutation.tx.messageToSign.sameElements(signed.tx.messageToSign) shouldBe false
    reduce(messageMutation) shouldBe threshold
    verify(messageMutation) shouldBe false
    verify(sign(messageMutation, keys.take(2))) shouldBe true
    verify(signed) shouldBe true
  }

  test("negative future extreme and out-of-window heights reduce to false before indexing") {
    // Tip-based positive also matches the guarded fallback AVL value, isolating the range check.
    val tip = build(statementBytes, selected = 0)
    val tipHeight = tip.headers.head.height
    Vector(-1, Int.MinValue, Int.MaxValue, tipHeight + 1, tipHeight - 10).foreach { height =>
      val offset = tipHeight.toLong - height.toLong
      (height >= 0 && offset >= 0L && offset < 10L) shouldBe false
      if (height == Int.MinValue) offset should be > Int.MaxValue.toLong
      assertFalse(s"requested height $height", tip, withHeight(tip, height))
    }
    val missing = withExtension(tip, ContextExtension(tip.tx.inputs.head.extension.values - 2.toByte))
    reduce(tip) shouldBe threshold
    missing.tx.inputs.head.extension.get(2.toByte) shouldBe None
    rootCause(intercept[Exception] { reduce(missing) }) shouldBe a[NoSuchElementException]
    reduce(tip) shouldBe threshold
  }

  test("replaced anchor identity and changed extension root fail independently") {
    verify(signed) shouldBe true
    val anchor = canonical.headers(anchorIndex)
    val replaced = relink(canonical.headers.updated(anchorIndex,
      new CHeader(anchor.ergoHeader.copy(timestamp = anchor.timestamp + 1L, _bytes = null))))
    replaced(anchorIndex).extensionRoot shouldBe anchor.extensionRoot
    replaced(anchorIndex).height shouldBe anchor.height
    replaced(anchorIndex).id should not be anchor.id
    assertFalse("same-height same-root replacement ID", signed, signed.copy(headers = replaced))

    val root = anchor.extensionRoot.toArray.clone()
    root(0) = (root(0) ^ 1).toByte
    val changed = relink(canonical.headers.updated(anchorIndex,
      new CHeader(anchor.ergoHeader.copy(extensionRoot = Digest32 @@ root, _bytes = null))))
    // Rebuild AVL against the changed ID, so membership alone is the negative.
    val changedRoot = build(statementBytes, suppliedHeaders = Some(changed))
    assertFalse("extension root with coordinated AVL successor", canonical, changedRoot)
    verify(signed) shouldBe true
  }

  test("missing anchor and selected-height mismatch fail with coordinated AVL values") {
    val requested = canonical.headers(anchorIndex).height
    val withoutAnchor = canonical.headers.take(anchorIndex) ++ canonical.headers.drop(anchorIndex + 1)
    val missing = relink(withoutAnchor.updated(anchorIndex, new CHeader(
      withoutAnchor(anchorIndex).ergoHeader.copy(
        extensionRoot = Digest32 @@ canonical.headers(anchorIndex).extensionRoot.toArray, _bytes = null))))
    missing.exists(_.height == requested) shouldBe false
    val missingCandidate = build(statementBytes, suppliedHeaders = Some(missing))
    assertFalse("missing requested header", canonical, withHeight(missingCandidate, requested))

    val anchor = canonical.headers(anchorIndex)
    val mismatch = relink(canonical.headers.updated(anchorIndex,
      new CHeader(anchor.ergoHeader.copy(height = requested - 1, _bytes = null))))
    val mismatched = build(statementBytes, suppliedHeaders = Some(mismatch))
    val negative = withHeight(mismatched, requested)
    assertFalse("selected height differs from requested height", canonical, negative)
    // Exact guard mutant: the same coordinated AVL/header child must now reach the quorum.
    val mutantSource = replaceOnce(resolveSource(),
      "anchorHeader.height == requestedAnchorHeight &&", "true &&")
    val mutant = compile(mutantSource)
    reduce(withTree(canonical, mutant)) shouldBe threshold
    reduce(withTree(negative, mutant)) shouldBe threshold
    reduce(withTree(withHeight(missingCandidate, requested), mutant)) shouldBe threshold
    reduce(negative) shouldBe TrivialProp.FalseProp
    reduce(canonical) shouldBe threshold
  }

  test("frozen proof expires at the validity boundary while its anchor remains present") {
    val expiring = statementBytes.clone()
    ByteBuffer.wrap(expiring, 504, 8).putLong(initialHeight.toLong + 1L)
    val fresh = sign(build(expiring), keys.take(2))
    reduce(fresh) shouldBe threshold
    verify(fresh) shouldBe true
    val frozen = ErgoLikeTransactionSerializer.toBytes(fresh.tx)
    val expired = fresh.copy(tx = parseTransaction(frozen), height = initialHeight + 1)
    context(expired).preHeader.height shouldBe initialHeight + 1
    expired.headers.map(_.id).toVector shouldBe fresh.headers.map(_.id).toVector
    assertFalse("HEIGHT equals expiresAt", fresh, expired)
    ErgoLikeTransactionSerializer.toBytes(expired.tx) should contain theSameElementsInOrderAs frozen
    verify(expired) shouldBe false
    verify(fresh) shouldBe true
  }

  private def checkIdentity(): Unit = {
    str(fixture, "schema") shouldBe "e2s.substrate-federated-tracker-v2-anchor-prototype"
    number(fixture, "version") shouldBe 2L
    str(base, "schema") shouldBe "e2s.substrate-federated-v1-tracker-context"
    number(base, "version") shouldBe 1L
    number(profile, "version") shouldBe 1L
    number(statement, "version") shouldBe 1L
    str(fixture, "trustModel") shouldBe "federated_non_trustless"
    Vector("runtimeProfileActivated", "sourceAttestationsVerified", "targetNodeAccepted",
      "fundsAuthorityEstablished").foreach { field =>
      fixture.downField("boundaries").downField(field).as[Boolean].fold(e => fail(e.getMessage), identity) shouldBe false
    }
    strings(profileInput, "ergoAdmissionPublicKeysHex") shouldBe keyHex
    strings(profile, "ergoAdmissionPublicKeysHex") shouldBe keyHex
    number(profileInput, "ergoAdmissionThreshold") shouldBe 2L
    number(profile, "ergoAdmissionThreshold") shouldBe 2L
    val sourceKeys = strings(profileInput, "sourceAttestationPublicKeysHex")
    sourceKeys shouldBe sourceKeys.sorted.distinct
    strings(profile, "sourceAttestationPublicKeysHex") shouldBe sourceKeys
    val sourceThreshold = number(profileInput, "sourceAttestationThreshold").toInt
    sourceThreshold should be > 0
    sourceThreshold should be <= sourceKeys.size
    Vector("federationEpoch", "maxAdmissionValidityBlocks", "sourceAttestationThreshold")
      .foreach(f => number(profile, f) shouldBe number(profileInput, f))
    val encoded = Discriminator ++ longBytes(number(profileInput, "federationEpoch")) ++
      longBytes(number(profileInput, "maxAdmissionValidityBlocks")) ++
      shortBytes(sourceThreshold) ++ shortBytes(sourceKeys.size) ++ sourceKeys.flatMap(unhex).toArray ++
      shortBytes(2) ++ shortBytes(3) ++ keyHex.flatMap(unhex).toArray
    hex(encoded) shouldBe str(profile, "encodedProfileHex")
    hex(hash(ascii("E2S_SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1") ++ encoded)) shouldBe
      str(profile, "profileIdHex")
    Vector(("SOURCE", sourceKeys, "sourceAttestationKeySetDigestHex"),
      ("ERGO", keyHex, "ergoAdmissionKeySetDigestHex")).foreach { case (role, publicKeys, field) =>
      hex(hash(ascii(s"E2S_SUBSTRATE_FEDERATED_${role}_KEY_SET_V1") ++
        shortBytes(publicKeys.size) ++ publicKeys.flatMap(unhex).toArray)) shouldBe str(profile, field)
    }
    val expected = Discriminator ++ statementLayout.flatMap { case (name, width) =>
      if (name.endsWith("Hex")) unhex(str(statementInput, name)).toVector
      else if (width == 8) longBytes(number(statementInput, name)).toVector
      else intBytes(number(statementInput, name).toInt).toVector
    }.toArray ++ unhex(str(profile, "profileIdHex")) ++
      unhex(str(profile, "sourceAttestationKeySetDigestHex")) ++ shortBytes(sourceThreshold) ++
      unhex(str(profile, "ergoAdmissionKeySetDigestHex")) ++ shortBytes(2) ++
      longBytes(number(profile, "federationEpoch")) ++
      longBytes(number(statementInput, "admissionValidFromErgoHeight")) ++
      longBytes(number(statementInput, "admissionExpiresAtErgoHeight"))
    expected.length shouldBe 512
    hex(expected) shouldBe str(statement, "encodedStatementHex")
    hex(hash(StatementDomain ++ expected)) shouldBe str(statement, "statementIdHex")
    statementLayout.foreach { case (name, width) =>
      if (name.endsWith("Hex")) {
        unhex(str(statementInput, name)).length shouldBe width
        str(statement, name) shouldBe str(statementInput, name)
      } else number(statement, name) shouldBe number(statementInput, name)
    }
    Vector("sourceAttestationKeySetDigestHex", "ergoAdmissionKeySetDigestHex")
      .foreach(f => str(statement, f) shouldBe str(profile, f))
    str(statement, "federationProfileIdHex") shouldBe str(profile, "profileIdHex")
    baseHeaders should have length 10
    anchorIndex should be > 0
    anchorIndex should be < 9
    baseHeaders.head.height shouldBe initialHeight - 1
    baseHeaders.sliding(2).foreach(pair => pair(0).height shouldBe pair(1).height + 1)
  }

  private val statementLayout = Vector(
    "sourceNetworkIdHex" -> 32, "sidechainIdHex" -> 32, "sourceNativeBlockHeight" -> 8,
    "sourceNativeBlockHashHex" -> 32, "executionBlockHashHex" -> 32, "bridgeEventRootHex" -> 32,
    "burnLeafCount" -> 4, "bridgeAddressHex" -> 20, "tokenAddressHex" -> 20,
    "bridgeRuntimeCodeSha256Hex" -> 32, "bridgeRuntimeCodeBytes" -> 4,
    "tokenRuntimeCodeSha256Hex" -> 32, "tokenRuntimeCodeBytes" -> 4,
    "sourceRuntimeCodeSha256Hex" -> 32, "sourceRuntimeCodeBytes" -> 4,
    "runtimeProfileIdHex" -> 32, "settlementProfileIdHex" -> 32)

  private def resolveSource(template: Array[Byte] = sourceBytes,
      contractName: String = "SPVTrackerSubstrateFederatedV2"): String = {
    statementBytes.length shouldBe 512
    val application = Vector(
      "SOURCE_NETWORK_ID" -> "sourceNetworkIdHex", "SIDECHAIN_ID" -> "sidechainIdHex",
      "BRIDGE_ADDRESS" -> "bridgeAddressHex", "TOKEN_ADDRESS" -> "tokenAddressHex",
      "BRIDGE_RUNTIME_HASH" -> "bridgeRuntimeCodeSha256Hex", "TOKEN_RUNTIME_HASH" -> "tokenRuntimeCodeSha256Hex",
      "SOURCE_RUNTIME_HASH" -> "sourceRuntimeCodeSha256Hex", "RUNTIME_PROFILE_ID" -> "runtimeProfileIdHex",
      "SETTLEMENT_PROFILE_ID" -> "settlementProfileIdHex").map { case (p, f) => p -> str(statement, f) }
    val lengths = Vector("BRIDGE" -> "bridge", "TOKEN" -> "token", "SOURCE" -> "source")
      .map { case (p, f) => s"${p}_RUNTIME_BYTES" -> hex(intBytes(number(statement, f + "RuntimeCodeBytes").toInt)) }
    val replacements = application ++ lengths ++ Vector(
      "TRACKER_NFT_ID" -> str(transition, "trackerNftIdHex"),
      "PROFILE_ID" -> str(profile, "profileIdHex"),
      "SOURCE_KEY_SET_DIGEST" -> str(profile, "sourceAttestationKeySetDigestHex"),
      "SOURCE_THRESHOLD" -> hex(shortBytes(number(profile, "sourceAttestationThreshold").toInt)),
      "ERGO_KEY_SET_DIGEST" -> str(profile, "ergoAdmissionKeySetDigestHex"),
      "ERGO_THRESHOLD_BYTES" -> hex(shortBytes(2)),
      "EPOCH" -> hex(longBytes(number(profile, "federationEpoch"))),
      "MAX_ADMISSION_VALIDITY_BLOCKS" -> s"${number(profile, "maxAdmissionValidityBlocks")}L",
      "ERGO_THRESHOLD" -> "2")
    val withKeys = replaceOnce(new String(template, US_ASCII), "FEDERATED_ERGO_SIGMAPROP_PLACEHOLDERS",
      keyHex.map(k => s"""proveDlog(decodePoint(fromBase16("$k")))""").mkString(",\n    "))
    val resolved = replacements.foldLeft(withKeys) { case (s, (p, v)) =>
      replaceOnce(s, s"FEDERATED_${p}_PLACEHOLDER", v)
    }
    "[A-Z][A-Z0-9_]+_PLACEHOLDERS?".r.findAllIn(resolved).toVector shouldBe empty
    resolved should include(contractName)
    resolved should include("statement.size == 512")
    resolved should include("trackerValue.size == 370")
    resolved
  }

  private def compile(source: String): ErgoTree = inVersion {
    val result = new SigmaCompiler(16.toByte).compile(Map.empty, source)(new CompiletimeIRContext)
    val proposition = result match {
      case CompilerResult(_, _, _, v: Value[SSigmaProp.type @unchecked]) if v.tpe == SSigmaProp => v
      case CompilerResult(_, _, _, v: Value[SBoolean.type @unchecked]) if v.tpe == SBoolean => v.toSigmaProp
      case other => fail(s"unexpected compiler type ${other.buildTree.tpe}")
    }
    val tree = ErgoTree.fromProposition(ErgoTree.defaultHeaderWithVersion(0.toByte), proposition)
    val bytes = serializer.serializeErgoTree(tree)
    val parsed = serializer.deserializeErgoTree(bytes)
    parsed.version shouldBe 0
    serializer.serializeErgoTree(parsed) should contain theSameElementsInOrderAs bytes
    parsed
  }

  private def build(bytes: Array[Byte], selected: Int = anchorIndex,
      suppliedHeaders: Option[Array[CHeader]] = None): Scenario = {
    bytes.length shouldBe 512
    val statementId = hash(StatementDomain ++ bytes)
    // Canonical one-level empty-right-child extension proof, with zero padding.
    val extensionProof = Array(2.toByte) ++ Array.fill[Byte](32)(0)
    val root = hash(Array[Byte](1) ++ hash(Array[Byte](0, 2, 4, 1) ++ bytes.slice(140, 172) ++ statementId))
    val headers = suppliedHeaders.getOrElse(relink(baseHeaders.updated(selected,
      new CHeader(baseHeaders(selected).ergoHeader.copy(extensionRoot = Digest32 @@ root, _bytes = null)))))
    val anchor = headers(selected)
    val key = hash(KeyDomain ++ bytes.slice(4, 140))
    val value = ValueDomain ++ Discriminator ++ bytes.slice(140, 172) ++ statementId ++
      anchor.id.toArray ++ intBytes(anchor.height) ++ bytes.slice(68, 140) ++ bytes.slice(172, 176) ++
      bytes.slice(324, 420) ++ bytes.slice(454, 512)
    key.length shouldBe 32
    value.length shouldBe 370
    val avl = new BatchAVLProver[Digest32, Blake2b256.type](keyLength = 32, valueLengthOpt = Some(370))
    val initial = avlData(baseBox.additionalRegisters(ErgoBox.R5).value)
    avl.digest.toArray should contain theSameElementsInOrderAs initial.digest.toArray
    avl.performOneOperation(Insert(key.asInstanceOf[ADKey], value.asInstanceOf[ADValue])).get
    val proof = avl.generateProof().clone()
    val next = new AvlTreeData(Colls.fromArray(avl.digest.clone()), AvlTreeFlags.InsertOnly, 32, Some(370))
    val registers = baseBox.additionalRegisters.toMap
      .updated(ErgoBox.R4, ByteArrayConstant(bytes.slice(388, 420)))
      .updated(ErgoBox.R6, ByteArrayConstant(bytes.slice(36, 68)))
      .updated(ErgoBox.R9, ByteArrayConstant(bytes.slice(454, 486)))
      .updated(ErgoBox.R8, IntConstant(initialHeight - 1))
    val self = copyBox(baseBox)(ergoTree = trackerTree, additionalRegisters = registers,
      creationHeight = initialHeight - 2)
    hex(self.additionalTokens(0)._1.toArray) shouldBe str(transition, "trackerNftIdHex")
    val out = new ErgoBoxCandidate(self.value, trackerTree, initialHeight, self.additionalTokens,
      registers.updated(ErgoBox.R5, AvlTreeConstant(next))
        .updated(ErgoBox.R7, LongConstant(readLong(bytes, 68)))
        .updated(ErgoBox.R8, IntConstant(initialHeight)))
    val extension = ContextExtension(Map(
      0.toByte -> ByteArrayConstant(bytes.clone()),
      1.toByte -> ByteArrayConstant(longBytes(extensionProof.length.toLong) ++ extensionProof ++ proof),
      2.toByte -> IntConstant(anchor.height)))
    Scenario(new ErgoLikeTransaction(IndexedSeq(Input(self.id, ProverResult(Array.empty[Byte], extension))),
      IndexedSeq.empty, IndexedSeq(out)), self, headers, initialHeight)
  }

  private def context(s: Scenario): ErgoLikeContext = {
    val tip = s.headers.head
    val preHeader = CPreHeader(tip.version, tip.id, tip.timestamp + 1L, tip.nBits,
      s.height, tip.minerPk, Colls.emptyColl[Byte])
    val ctx = ErgoLikeContextTesting(s.height, avlData(tip.stateRoot),
      ErgoLikeContextTesting.dummyPubkey, IndexedSeq(s.self), s.tx, s.self, 3.toByte,
      s.tx.inputs.head.extension)
    copyContext(ctx)(headers = Colls.fromArray(s.headers.map(h => h: Header)), preHeader = preHeader)
  }
  private def reduce(s: Scenario): SigmaBoolean =
    new ErgoLikeTestInterpreter().fullReduction(s.self.ergoTree, context(s)).value
  private def verify(s: Scenario): Boolean =
    new ErgoLikeTestInterpreter().verify(s.self.ergoTree, context(s),
      s.tx.inputs.head.spendingProof, s.tx.messageToSign).get._1
  private def prover(witnesses: Seq[DLogProverInput]) = new ErgoLikeTestProvingInterpreter {
    override lazy val secrets: Seq[SigmaProtocolPrivateInput[_]] = witnesses
  }
  private def sign(s: Scenario, witnesses: Seq[DLogProverInput]): Scenario = {
    reduce(s) shouldBe threshold
    val message = s.tx.messageToSign.clone()
    val result = prover(witnesses).prove(s.self.ergoTree, context(s), message).get
    result.proof should not be empty
    val signedScenario = withProof(s, ProverResult(result.proof.clone(), result.extension))
    signedScenario.tx.messageToSign should contain theSameElementsInOrderAs message
    verify(signedScenario) shouldBe true
    signedScenario
  }
  private def withProof(s: Scenario, proof: ProverResult): Scenario =
    s.copy(tx = new ErgoLikeTransaction(IndexedSeq(Input(s.self.id, proof)),
      s.tx.dataInputs, s.tx.outputCandidates))
  private def withExtension(s: Scenario, e: ContextExtension): Scenario =
    withProof(s, ProverResult(s.tx.inputs.head.spendingProof.proof.clone(), e))
  private def withHeight(s: Scenario, height: Int): Scenario =
    withExtension(s, ContextExtension(s.tx.inputs.head.extension.values + (2.toByte -> IntConstant(height))))
  private def withTree(s: Scenario, tree: ErgoTree): Scenario = {
    val self = copyBox(s.self)(ergoTree = tree)
    val out = s.tx.outputCandidates.head
    val output = new ErgoBoxCandidate(out.value, tree, out.creationHeight,
      out.additionalTokens, out.additionalRegisters)
    s.copy(self = self, tx = new ErgoLikeTransaction(
      IndexedSeq(Input(self.id, s.tx.inputs.head.spendingProof)), s.tx.dataInputs, IndexedSeq(output)))
  }
  private def assertFalse(label: String, positive: Scenario, negative: Scenario): Unit = withClue(label + ": ") {
    val frozen = ErgoLikeTransactionSerializer.toBytes(positive.tx).clone()
    reduce(positive) shouldBe threshold
    reduce(negative) shouldBe TrivialProp.FalseProp
    reduce(positive) shouldBe threshold
    ErgoLikeTransactionSerializer.toBytes(positive.tx) should contain theSameElementsInOrderAs frozen
  }
  private def descend(headers: Array[CHeader]): Array[CHeader] = {
    val tip = headers.head
    val next = new CHeader(tip.ergoHeader.copy(parentId = bytesToId(tip.id.toArray),
      height = tip.height + 1, timestamp = tip.timestamp + 1L, _bytes = null))
    (Array(next) ++ headers).take(10)
  }
  private def relink(headers: Array[CHeader]): Array[CHeader] = {
    val result = headers.clone()
    (result.length - 2 to 0 by -1).foreach { i =>
      result(i) = new CHeader(result(i).ergoHeader.copy(
        parentId = bytesToId(result(i + 1).id.toArray), _bytes = null))
    }
    result
  }
  private def parseTransaction(bytes: Array[Byte]): ErgoLikeTransaction = inVersion {
    val reader = SigmaSerializer.startReader(bytes.clone())
    val tx = ErgoLikeTransactionSerializer.parse(reader)
    reader.remaining shouldBe 0
    tx
  }
  private def avlData(value: Any): AvlTreeData = value match {
    case t: AvlTreeData => t
    case t: CAvlTree => t.treeData
    case _ => fail("expected AVL data")
  }
  private def inVersion[A](f: => A): A = VersionContext.withVersions(3.toByte, 0.toByte)(f)
  private def rootCause(e: Throwable): Throwable =
    if (e.getCause == null || e.getCause == e) e else rootCause(e.getCause)
  private def requiredProperty(suffix: String): String = {
    val value = System.getProperty(Prefix + suffix)
    require(value != null && value.nonEmpty, s"missing -D$Prefix$suffix")
    value
  }
  private def readFile(raw: String): Array[Byte] = {
    val path = Paths.get(raw).toAbsolutePath.normalize()
    require(Files.isRegularFile(path) && !Files.isSymbolicLink(path), "expected a regular input file")
    val bytes = Files.readAllBytes(path)
    require(bytes.nonEmpty && bytes.forall(_ >= 0) && !bytes.contains('\r'.toByte), "expected LF-only ASCII")
    bytes
  }
  private def replaceOnce(s: String, p: String, v: String): String = {
    s.sliding(p.length).count(_ == p) shouldBe 1
    s.replace(p, v)
  }
  private def json(bytes: Array[Byte]): Json = parser.parse(new String(bytes, US_ASCII))
    .fold(e => fail(e.getMessage), identity)
  private def str(c: ACursor, f: String): String = c.downField(f).as[String].fold(e => fail(e.getMessage), identity)
  private def strings(c: ACursor, f: String): Vector[String] =
    c.downField(f).as[Vector[String]].fold(e => fail(e.getMessage), identity)
  private def number(c: ACursor, f: String): Long = c.downField(f).as[Long].toOption
    .orElse(c.downField(f).as[String].toOption.map(_.toLong)).getOrElse(fail(s"missing number $f"))
  private def ascii(s: String): Array[Byte] = s.getBytes(US_ASCII)
  private def hash(bytes: Array[Byte]): Array[Byte] = Blake2b256(bytes).toArray
  private def hex(bytes: Array[Byte]): String = bytes.map(b => f"${b & 0xff}%02x").mkString
  private def unhex(s: String): Array[Byte] = {
    require(s.matches("(?:[0-9a-f]{2})+"), "expected canonical lowercase hex")
    s.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }
  private def shortBytes(n: Int): Array[Byte] = ByteBuffer.allocate(2).putShort(n.toShort).array()
  private def intBytes(n: Int): Array[Byte] = ByteBuffer.allocate(4).putInt(n).array()
  private def longBytes(n: Long): Array[Byte] = ByteBuffer.allocate(8).putLong(n).array()
  private def readLong(bytes: Array[Byte], offset: Int): Long = ByteBuffer.wrap(bytes, offset, 8).getLong
  private def sha256(bytes: Array[Byte]): String = hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
