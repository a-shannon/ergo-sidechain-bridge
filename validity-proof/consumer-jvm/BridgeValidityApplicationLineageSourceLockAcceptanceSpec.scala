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
import scorex.crypto.hash.Blake2b256
import sigma.VersionContext
import sigma.ast.SCollection.SByteArray
import sigma.ast._
import sigma.data.{
  AvlTreeData,
  CTHRESHOLD,
  Digest32Coll,
  ProveDlog,
  SigmaBoolean,
  TrivialProp
}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.ErgoTreeSerializer
import sigma.{Coll, Colls}
import sigmastate.helpers.{ErgoLikeContextTesting, ErgoLikeTestInterpreter}
import sigmastate.helpers.TestingHelpers.{copyBox, testBox}
import sigmastate.utils.Helpers

class BridgeValidityApplicationLineageSourceLockAcceptanceSpec
    extends AnyFunSuite with Matchers {
  private val RootProperty =
    "bridge.validity.application.lineage.root"
  private val ReceiptRelativePath =
    "relayer/test-vectors/validity-application-lineage-compiler-v3.json"
  private val ReceiptSha256 =
    "280081d89ad8303506b3890559bef047cf6ac1bb2a23b729a7e9903e77cf3132"
  private val ReceiptSchema =
    "e2s.validity-application-lineage-compiler-batch.v1"
  private val SigmaStateCommit =
    "f78deadd668f801e7fae3bc884283f79c6f484fa"

  private val SourceLockContractId =
    "d32271c7e408b69d57e8ce56aa161b8d30c7d960180233d6376c0078b73ef675"
  private val SourceLockPropositionSha256 =
    "d5100456c709bb25feb9a6c81b86e2c63e6be5d9134e2f235b6478b5abd9e21f"
  private val SourceLockPropositionBytes = 867
  private val CausalVaultContractId =
    "402eed06957dfa7cbdcd817c6e8e99498b2b2857a22e9af4edc8e5c8f8c78831"
  private val CausalVaultPropositionSha256 =
    "9e6c7ed20925c778c6eb15e7f70d625bb672f850cce566b64cdc101a90feefea"
  private val CausalVaultPropositionBytes = 3562

  private val SourceNetworkId = hex("11" * 32)
  private val SidechainId = hex("22" * 32)
  private val BridgeAddress = hex("33" * 20)
  private val TokenAddress = hex("44" * 20)
  private val SettlementProfileId = hex("55" * 32)
  private val CausalProfileId =
    hex("ab7b2ad7d79dfedb57ec1ba2c9e2d09ab404d3bda6c311a3a90bc75957c4b246")
  private val ZeroAssetId = Array.fill[Byte](32)(0)
  private val Recipient = hex("66" * 20)
  private val DepositorPublicKey =
    "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
  private val MinerFeeTreeHex =
    "1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304"

  private val SourceValue = 10000000L
  private val FeeValue = 1100000L
  private val CreationHeight = 100
  private val EscapeTimeout = 10000
  private val CommitLastHeight = CreationHeight + EscapeTimeout - 1
  private val TimeoutHeight = CreationHeight + EscapeTimeout

  private val CommitteePublicKeys = Vector(
    "02671c8e95c0237797901a6cdb2ef8e6599400578385455f3423f77e43df39aad5",
    "0227562580bbfc2cf3f72b3dbb725f30f358ca545209255458536adcf1a4aad871",
    "03b6447502eeff10813c6c7a01e1f2c3a97c54bbeeb3f9206984ccb0e63b0c56f3")
  private lazy val expectedCommittee =
    CTHRESHOLD(
      2,
      CommitteePublicKeys.map(key =>
        ProveDlog(Helpers.decodeECPoint(key))))

  private val Message =
    hex("1dc01772ee0171f5f614c673e3c7fa1107a8cf727bdf5a6dadb379e93c0d1d00")
  // A public SigmaState threshold vector for a different 2-of-3 committee.
  // It must not authorize the keys compiled into this source-lock instance.
  private val ForeignCommitteeProof = hex(
    "0b6bf9bc42c7b509ab56c76318c0891b2c8d44ef5fafb1379cc6b72b89c53cd4" +
      "3f8ef10158ce08646301d09b450ea83a1cdbbfc3dc7438ece4bbe934919069c5" +
      "0ec5857209b0dbf120b325c88667bc84580720ff4b3c371ec752bc6874c933f7" +
      "fa53fae411e65ae07b647d365caac8c6744276c04c0240dd55e1f62c0e17a09" +
      "3dd91493c68104b1e01a4069017668d3f")

  private lazy val receipt = {
    val rootValue = System.getProperty(RootProperty)
    require(rootValue != null && rootValue.nonEmpty, s"missing -D$RootProperty")
    val root = Paths.get(rootValue).toAbsolutePath.normalize()
    require(
      Files.isDirectory(root) && !Files.isSymbolicLink(root),
      "lineage root must be a real directory")
    val path = root.resolve(ReceiptRelativePath).normalize()
    require(
      path.startsWith(root) &&
        Files.isRegularFile(path) &&
        !Files.isSymbolicLink(path),
      "lineage compiler receipt must be a real in-root file")
    val bytes = Files.readAllBytes(path)
    sha256(bytes) shouldBe ReceiptSha256
    require(
      bytes.nonEmpty && bytes.forall(byte => (byte & 0xff) <= 0x7f),
      "lineage compiler receipt must be non-empty ASCII JSON")
    parser.parse(new String(bytes, StandardCharsets.US_ASCII)).fold(
      failure => throw new IllegalArgumentException(
        "lineage compiler receipt JSON rejected: " + failure.getMessage),
      identity)
  }

  private lazy val sourceLockReceipt = contractReceipt("sourceLock")
  private lazy val causalVaultReceipt = contractReceipt("causalVault")
  private lazy val sourceLockTree = exactTree(
    sourceLockReceipt,
    "source lock",
    SourceLockContractId,
    SourceLockPropositionSha256,
    SourceLockPropositionBytes)
  private lazy val causalVaultTree = exactTree(
    causalVaultReceipt,
    "causal vault",
    CausalVaultContractId,
    CausalVaultPropositionSha256,
    CausalVaultPropositionBytes)
  private lazy val depositorTree =
    ErgoTree.fromProposition(
      ProveDlog(Helpers.decodeECPoint(DepositorPublicKey)))
  private lazy val minerFeeTree =
    ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(
      hex(MinerFeeTreeHex))
  private lazy val wrongTree =
    ErgoTree.fromProposition(TrivialProp.FalseProp)
  private lazy val canonicalIntent = sourceIntent()
  private lazy val canonicalSource = sourceBox()
  // The source predicate is the only input reduced by this suite. This
  // separate box models external fee funding without claiming its authority.
  private lazy val feeFundingBox =
    testBox(FeeValue, depositorTree, CreationHeight)

  test("canonical receipt pins the exact V3 source-lock and causal-vault propositions") {
    val cursor = receipt.hcursor
    requiredString(cursor.downField("schema"), "receipt schema") shouldBe
      ReceiptSchema
    requiredInt(cursor.downField("version"), "receipt version") shouldBe 1
    requiredString(
      cursor.downField("sigmaStateCommit"),
      "SigmaState commit") shouldBe SigmaStateCommit
    requiredString(
      cursor.downField("scalaVersion"),
      "Scala version") shouldBe "2.13.18"
    requiredString(
      cursor.downField("sbtVersion"),
      "sbt version") shouldBe "1.12.11"

    val roles = requiredArray(
      cursor.downField("contracts"),
      "compiler contracts").map { value =>
      requiredString(value.hcursor.downField("role"), "contract role")
    }
    roles should contain theSameElementsAs Vector(
      "tracker",
      "causalVault",
      "duplicatePrevention",
      "sourceLock")
    roles.distinct should have size 4

    hex(Blake2b256(sourceLockTree.bytes)) shouldBe SourceLockContractId
    sha256(sourceLockTree.bytes) shouldBe SourceLockPropositionSha256
    sourceLockTree.bytes.length shouldBe SourceLockPropositionBytes
    hex(Blake2b256(causalVaultTree.bytes)) shouldBe CausalVaultContractId
    sha256(causalVaultTree.bytes) shouldBe CausalVaultPropositionSha256
    causalVaultTree.bytes.length shouldBe CausalVaultPropositionBytes

    Vector(
      "profileActivated",
      "nodeCheckPerformed",
      "signingAuthorityEstablished",
      "submissionAuthorityEstablished",
      "broadcastAuthorityEstablished",
      "fundsAuthorityEstablished",
      "gate5Closed").foreach { field =>
      requiredBoolean(cursor.downField(field), field) shouldBe false
    }
  }

  test("commit reduces to the exact committee at the last pre-timeout height") {
    assertCommitteeReduction(
      "exact causal-vault commit",
      canonicalSource,
      commitOutputs(canonicalSource),
      CommitLastHeight)
  }

  test("refund is permissionless at and after the timeout") {
    Vector(TimeoutHeight, TimeoutHeight + 25).foreach { height =>
      assertAccepted(
        s"permissionless refund at height $height",
        canonicalSource,
        refundOutputs(canonicalSource),
        height,
        Array.emptyByteArray)
    }
  }

  test("each compiled source-intent identity field rejects independently") {
    val mutations = Vector(
      "source network" -> 1,
      "sidechain" -> 33,
      "bridge address" -> 65,
      "token address" -> 85,
      "settlement profile" -> 105,
      "causal profile" -> 137)

    mutations.foreach { case (label, offset) =>
      val changed = canonicalIntent.clone()
      changed(offset) = (changed(offset) ^ 1).toByte
      val self = sourceBox(intent = changed)
      assertScriptRejected(
        s"$label mutation",
        self,
        commitOutputs(self),
        CommitLastHeight)
    }
  }

  test("source-intent version and exact length reject independently") {
    val wrongVersion = canonicalIntent.clone()
    wrongVersion(0) = 3.toByte
    val versionSelf = sourceBox(intent = wrongVersion)
    assertScriptRejected(
      "source-intent version",
      versionSelf,
      commitOutputs(versionSelf),
      CommitLastHeight)

    val truncated = canonicalIntent.dropRight(1)
    val truncatedSelf = sourceBox(intent = truncated)
    assertScriptRejected(
      "truncated source intent",
      truncatedSelf,
      commitOutputs(
        truncatedSelf,
        intent = canonicalIntent,
        sourceId = truncatedSelf.id),
      CommitLastHeight)
  }

  test("source asset, amount, and recipient constraints reject independently") {
    val wrongAsset = canonicalIntent.clone()
    wrongAsset(169) = 1
    val assetSelf = sourceBox(intent = wrongAsset)
    assertScriptRejected(
      "non-ERG source asset",
      assetSelf,
      commitOutputs(assetSelf),
      CommitLastHeight)

    val wrongAmount = canonicalIntent.clone()
    putLong(wrongAmount, 201, SourceValue + 1L)
    val amountSelf = sourceBox(intent = wrongAmount)
    assertScriptRejected(
      "source amount different from SELF value",
      amountSelf,
      commitOutputs(amountSelf),
      CommitLastHeight)

    val zeroRecipient = canonicalIntent.clone()
    java.util.Arrays.fill(zeroRecipient, 209, 229, 0.toByte)
    val recipientSelf = sourceBox(intent = zeroRecipient)
    assertScriptRejected(
      "zero recipient",
      recipientSelf,
      commitOutputs(recipientSelf),
      CommitLastHeight)
  }

  test("source R4 and R5 shape failures reject before either branch") {
    val absent = sourceBox(registers = Map.empty)
    assertScriptRejected(
      "absent source registers",
      absent,
      commitOutputs(
        absent,
        intent = canonicalIntent,
        sourceId = absent.id),
      CommitLastHeight)

    val wrongR4 = sourceBox(registers = Map(
      ErgoBox.R4 -> LongConstant(SourceValue),
      ErgoBox.R5 -> ByteArrayConstant(depositorTree.bytes)))
    assertVmRejected(
      "wrong-typed source R4",
      wrongR4,
      commitOutputs(
        wrongR4,
        intent = canonicalIntent,
        sourceId = wrongR4.id),
      CommitLastHeight)

    val wrongR5 = sourceBox(registers = Map(
      ErgoBox.R4 -> ByteArrayConstant(canonicalIntent),
      ErgoBox.R5 -> LongConstant(1L)))
    assertVmRejected(
      "wrong-typed source R5",
      wrongR5,
      commitOutputs(wrongR5),
      CommitLastHeight)

    val emptyR5 = sourceBox(registers = Map(
      ErgoBox.R4 -> ByteArrayConstant(canonicalIntent),
      ErgoBox.R5 -> ByteArrayConstant(Array.emptyByteArray)))
    assertScriptRejected(
      "empty depositor tree",
      emptyR5,
      commitOutputs(emptyR5),
      CommitLastHeight)
  }

  test("causal-vault proposition, R4 intent, and R5 lineage reject independently") {
    val wrongProposition = commitOutputs(
      canonicalSource,
      tree = wrongTree)
    assertScriptRejected(
      "wrong causal-vault proposition hash",
      canonicalSource,
      wrongProposition,
      CommitLastHeight)

    val wrongIntent = canonicalIntent.clone()
    wrongIntent(209) = (wrongIntent(209) ^ 1).toByte
    assertScriptRejected(
      "vault R4 intent",
      canonicalSource,
      commitOutputs(canonicalSource, intent = wrongIntent),
      CommitLastHeight)

    val wrongSourceId = canonicalSource.id.clone()
    wrongSourceId(0) = (wrongSourceId(0) ^ 1).toByte
    assertScriptRejected(
      "vault R5 source-box lineage",
      canonicalSource,
      commitOutputs(canonicalSource, sourceId = wrongSourceId),
      CommitLastHeight)
  }

  test("commit value and token preservation reject independently") {
    assertScriptRejected(
      "lower vault value",
      canonicalSource,
      commitOutputs(canonicalSource, value = SourceValue - 1L),
      CommitLastHeight)

    assertScriptRejected(
      "vault token injection",
      canonicalSource,
      commitOutputs(
        canonicalSource,
        tokens = Colls.fromArray(Array(testToken))),
      CommitLastHeight)

    val tokenizedSource = copyBox(canonicalSource)(
      additionalTokens = Colls.fromArray(Array(testToken)))
    assertScriptRejected(
      "tokenized refundable source",
      tokenizedSource,
      commitOutputs(tokenizedSource),
      CommitLastHeight)
  }

  test("refund proposition, R4 lineage, value, and tokens reject independently") {
    assertScriptRejected(
      "wrong refund proposition",
      canonicalSource,
      refundOutputs(canonicalSource, tree = wrongTree),
      TimeoutHeight)

    val wrongSourceId = canonicalSource.id.clone()
    wrongSourceId(0) = (wrongSourceId(0) ^ 1).toByte
    assertScriptRejected(
      "refund R4 source-box lineage",
      canonicalSource,
      refundOutputs(canonicalSource, sourceId = wrongSourceId),
      TimeoutHeight)

    assertScriptRejected(
      "lower refund value",
      canonicalSource,
      refundOutputs(canonicalSource, value = SourceValue - 1L),
      TimeoutHeight)

    assertScriptRejected(
      "refund token injection",
      canonicalSource,
      refundOutputs(
        canonicalSource,
        tokens = Colls.fromArray(Array(testToken))),
      TimeoutHeight)
  }

  test("commit and refund timeout boundaries are disjoint") {
    assertCommitteeReduction(
      "commit immediately before timeout",
      canonicalSource,
      commitOutputs(canonicalSource),
      CommitLastHeight)
    assertScriptRejected(
      "commit at timeout",
      canonicalSource,
      commitOutputs(canonicalSource),
      TimeoutHeight)
    assertScriptRejected(
      "refund immediately before timeout",
      canonicalSource,
      refundOutputs(canonicalSource),
      CommitLastHeight)
    assertAccepted(
      "refund at timeout",
      canonicalSource,
      refundOutputs(canonicalSource),
      TimeoutHeight,
      Array.emptyByteArray)
  }

  test("only OUTPUTS(0) can carry the commit or refund transition") {
    val decoy = candidate(
      value = 1000000L,
      tree = wrongTree,
      registers = Map.empty)
    assertScriptRejected(
      "commit output moved to index one",
      canonicalSource,
      decoy +: commitOutputs(canonicalSource),
      CommitLastHeight)
    assertScriptRejected(
      "refund output moved to index one",
      canonicalSource,
      decoy +: refundOutputs(canonicalSource),
      TimeoutHeight)
  }

  test("commit requires the exact committee while refund does not") {
    assertCommitteeReduction(
      "valid commit branch",
      canonicalSource,
      commitOutputs(canonicalSource),
      CommitLastHeight)
    assertProofRejected(
      "permissionless commit",
      canonicalSource,
      commitOutputs(canonicalSource),
      CommitLastHeight,
      Array.emptyByteArray)

    assertProofRejected(
      "foreign committee proof",
      canonicalSource,
      commitOutputs(canonicalSource),
      CommitLastHeight,
      ForeignCommitteeProof)

    assertAccepted(
      "permissionless timeout refund",
      canonicalSource,
      refundOutputs(canonicalSource),
      TimeoutHeight,
      Array.emptyByteArray)
  }

  private def sourceIntent(
      sourceNetwork: Array[Byte] = SourceNetworkId,
      sidechain: Array[Byte] = SidechainId,
      bridge: Array[Byte] = BridgeAddress,
      token: Array[Byte] = TokenAddress,
      settlementProfile: Array[Byte] = SettlementProfileId,
      causalProfile: Array[Byte] = CausalProfileId,
      sourceAsset: Array[Byte] = ZeroAssetId,
      amount: Long = SourceValue,
      recipient: Array[Byte] = Recipient): Array[Byte] = {
    val fields = Vector(
      sourceNetwork -> 32,
      sidechain -> 32,
      bridge -> 20,
      token -> 20,
      settlementProfile -> 32,
      causalProfile -> 32,
      sourceAsset -> 32,
      recipient -> 20)
    fields.foreach { case (bytes, length) =>
      require(bytes.length == length, s"source-intent field must be $length bytes")
    }
    require(amount > 0L, "source amount must be positive")
    val encoded = ByteBuffer.allocate(229)
      .put(2.toByte)
      .put(sourceNetwork)
      .put(sidechain)
      .put(bridge)
      .put(token)
      .put(settlementProfile)
      .put(causalProfile)
      .put(sourceAsset)
      .putLong(amount)
      .put(recipient)
      .array()
    require(encoded.length == 229, "source intent must be exactly 229 bytes")
    encoded
  }

  private def sourceBox(
      intent: Array[Byte] = canonicalIntent,
      registers: ErgoBox.AdditionalRegisters = null): ErgoBox = {
    val exactRegisters =
      if (registers == null) Map(
        ErgoBox.R4 -> ByteArrayConstant(intent.clone()),
        ErgoBox.R5 -> ByteArrayConstant(depositorTree.bytes.clone()))
      else registers
    testBox(
      SourceValue,
      sourceLockTree,
      CreationHeight,
      additionalRegisters = exactRegisters)
  }

  private def commitOutputs(
      self: ErgoBox,
      tree: ErgoTree = causalVaultTree,
      intent: Array[Byte] = null,
      sourceId: Array[Byte] = null,
      value: Long = SourceValue,
      tokens: Coll[ErgoBox.Token] = Colls.emptyColl): IndexedSeq[ErgoBoxCandidate] = {
    val exactIntent =
      if (intent == null) sourceIntentRegister(self) else intent
    val exactSourceId =
      if (sourceId == null) self.id else sourceId
    IndexedSeq(candidate(
      value,
      tree,
      tokens,
      Map(
        ErgoBox.R4 -> ByteArrayConstant(exactIntent.clone()),
        ErgoBox.R5 -> ByteArrayConstant(exactSourceId.clone()))),
      candidate(
        FeeValue,
        minerFeeTree,
        registers = Map.empty))
  }

  private def refundOutputs(
      self: ErgoBox,
      tree: ErgoTree = depositorTree,
      sourceId: Array[Byte] = null,
      value: Long = SourceValue,
      tokens: Coll[ErgoBox.Token] = Colls.emptyColl): IndexedSeq[ErgoBoxCandidate] = {
    val exactSourceId =
      if (sourceId == null) self.id else sourceId
    IndexedSeq(candidate(
      value,
      tree,
      tokens,
      Map(ErgoBox.R4 -> ByteArrayConstant(exactSourceId.clone()))),
      candidate(
        FeeValue,
        minerFeeTree,
        registers = Map.empty))
  }

  private def candidate(
      value: Long,
      tree: ErgoTree,
      tokens: Coll[ErgoBox.Token] = Colls.emptyColl,
      registers: ErgoBox.AdditionalRegisters): ErgoBoxCandidate =
    new ErgoBoxCandidate(
      value,
      tree,
      CreationHeight,
      tokens,
      registers)

  private def sourceIntentRegister(box: ErgoBox): Array[Byte] =
    box.additionalRegisters.get(ErgoBox.R4) match {
      case Some(value) if value.tpe == SByteArray =>
        value.value.asInstanceOf[Coll[Byte]].toArray.clone()
      case _ => canonicalIntent.clone()
    }

  private def assertAccepted(
      label: String,
      self: ErgoBox,
      outputs: IndexedSeq[ErgoBoxCandidate],
      height: Int,
      proof: Array[Byte]): Unit =
    withClue(s"$label must accept: ") {
      reduce(self, outputs, height) shouldBe Right(TrivialProp.TrueProp)
      verify(self, outputs, height, proof) shouldBe Right(true)
    }

  private def assertCommitteeReduction(
      label: String,
      self: ErgoBox,
      outputs: IndexedSeq[ErgoBoxCandidate],
      height: Int): Unit =
    withClue(s"$label must reduce to the exact 2-of-3 committee: ") {
      reduce(self, outputs, height) shouldBe Right(expectedCommittee)
    }

  private def assertScriptRejected(
      label: String,
      self: ErgoBox,
      outputs: IndexedSeq[ErgoBoxCandidate],
      height: Int): Unit =
    withClue(s"$label must reduce to false: ") {
      reduce(self, outputs, height) shouldBe Right(TrivialProp.FalseProp)
    }

  private def assertProofRejected(
      label: String,
      self: ErgoBox,
      outputs: IndexedSeq[ErgoBoxCandidate],
      height: Int,
      proof: Array[Byte]): Unit =
    withClue(s"$label must not authorize the committee branch: ") {
      reduce(self, outputs, height) shouldBe Right(expectedCommittee)
      verify(self, outputs, height, proof) should not be Right(true)
    }

  private def assertVmRejected(
      label: String,
      self: ErgoBox,
      outputs: IndexedSeq[ErgoBoxCandidate],
      height: Int): Unit =
    withClue(s"$label must fail closed in the VM: ") {
      val result = reduce(self, outputs, height)
      result should not be Right(expectedCommittee)
      result should not be Right(TrivialProp.TrueProp)
      verify(
        self,
        outputs,
        height,
        Array.emptyByteArray) should not be Right(true)
    }

  private def reduce(
      self: ErgoBox,
      outputs: IndexedSeq[ErgoBoxCandidate],
      height: Int): Either[Throwable, SigmaBoolean] =
    try {
      val context = transactionContext(self, outputs, height)
      Right(new ErgoLikeTestInterpreter()
        .fullReduction(self.ergoTree, context).value)
    } catch {
      case failure: Throwable => Left(failure)
    }

  private def verify(
      self: ErgoBox,
      outputs: IndexedSeq[ErgoBoxCandidate],
      height: Int,
      proof: Array[Byte]): Either[Throwable, Boolean] =
    try {
      val extension = ContextExtension.empty
      val context = transactionContext(self, outputs, height)
      val result = new ErgoLikeTestInterpreter().verify(
        self.ergoTree,
        context,
        ProverResult(proof.clone(), extension),
        Message)
      result.fold(Left(_), value => Right(value._1))
    } catch {
      case failure: Throwable => Left(failure)
    }

  private def transactionContext(
      self: ErgoBox,
      outputs: IndexedSeq[ErgoBoxCandidate],
      height: Int): ErgoLikeContext = {
    val extension = ContextExtension.empty
    val transaction = new ErgoLikeTransaction(
      IndexedSeq(
        Input(
          self.id,
          ProverResult(Array.emptyByteArray, extension)),
        Input(
          feeFundingBox.id,
          ProverResult(Array.emptyByteArray, extension))),
      IndexedSeq.empty,
      outputs)
    ErgoLikeContextTesting(
      currentHeight = height,
      lastBlockUtxoRoot = AvlTreeData.dummy,
      minerPubkey = ErgoLikeContextTesting.dummyPubkey,
      dataBoxes = IndexedSeq.empty,
      boxesToSpend = IndexedSeq(self, feeFundingBox),
      spendingTransaction = transaction,
      selfIndex = 0,
      activatedVersion =
        VersionContext.StarkVerificationVersion.toByte)
  }

  private def contractReceipt(role: String): Json = {
    val contracts = requiredArray(
      receipt.hcursor.downField("contracts"),
      "compiler contracts")
    val matches = contracts.filter { value =>
      requiredString(value.hcursor.downField("role"), "contract role") == role
    }
    require(matches.length == 1, s"expected exactly one $role compiler receipt")
    matches.head
  }

  private def exactTree(
      value: Json,
      label: String,
      expectedContractId: String,
      expectedPropositionSha256: String,
      expectedPropositionBytes: Int): ErgoTree = {
    val cursor = value.hcursor
    requiredString(cursor.downField("schema"), s"$label schema") shouldBe
      "e2s.validity-application-lineage-compiler-receipt.v1"
    requiredInt(cursor.downField("version"), s"$label version") shouldBe 1
    requiredString(
      cursor.downField("sigmaStateCommit"),
      s"$label SigmaState commit") shouldBe SigmaStateCommit
    requiredInt(
      cursor.downField("treeVersion"),
      s"$label tree version") shouldBe 0
    requiredString(
      cursor.downField("contractIdHex"),
      s"$label contract ID") shouldBe expectedContractId
    requiredString(
      cursor.downField("propositionSha256Hex"),
      s"$label proposition SHA-256") shouldBe expectedPropositionSha256
    requiredInt(
      cursor.downField("propositionBytes"),
      s"$label proposition bytes") shouldBe expectedPropositionBytes
    val proposition = hex(requiredString(
      cursor.downField("propositionHex"),
      s"$label proposition"))
    proposition.length shouldBe expectedPropositionBytes
    sha256(proposition) shouldBe expectedPropositionSha256
    hex(Blake2b256(proposition)) shouldBe expectedContractId
    ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(proposition)
  }

  private lazy val testToken: ErgoBox.Token =
    (Digest32Coll @@ Colls.fromArray(hex("77" * 32))) -> 1L

  private def putLong(bytes: Array[Byte], offset: Int, value: Long): Unit = {
    require(
      offset >= 0 && offset + 8 <= bytes.length,
      "Long mutation is outside the byte array")
    val encoded = ByteBuffer.allocate(8).putLong(value).array()
    System.arraycopy(encoded, 0, bytes, offset, encoded.length)
  }

  private def requiredArray(value: ACursor, label: String): Vector[Json] =
    value.focus.getOrElse(
      throw new IllegalArgumentException(s"$label missing"))
      .asArray.getOrElse(
        throw new IllegalArgumentException(s"$label must be an array"))
      .toVector

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
      value.nonEmpty &&
        value.length % 2 == 0 &&
        value.matches("[0-9a-f]+"),
      "expected lowercase whole-byte hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }

  private def hex(bytes: Array[Byte]): String =
    bytes.iterator.map(byte => f"${byte & 0xff}%02x").mkString

  private def sha256(bytes: Array[Byte]): String =
    hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
