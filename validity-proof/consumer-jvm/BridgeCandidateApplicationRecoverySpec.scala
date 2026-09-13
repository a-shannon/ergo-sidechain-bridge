package org.ergoplatform.mining

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, LinkOption, Paths}
import java.security.MessageDigest
import java.util.UUID

import akka.actor.{Actor, ActorRef, ActorSystem, Props}
import akka.pattern.StatusReply
import akka.testkit.{TestKit, TestProbe}
import com.typesafe.config.{ConfigFactory, ConfigResolveOptions, ConfigValueFactory}
import net.ceedubs.ficus.Ficus._
import net.ceedubs.ficus.readers.ArbitraryTypeReader._
import org.ergoplatform.mining.CandidateGenerator.{Candidate, GenerateCandidate}
import org.ergoplatform.modifiers.ErgoFullBlock
import org.ergoplatform.modifiers.history.header.Header
import org.ergoplatform.network.ErgoNodeViewSynchronizerMessages._
import org.ergoplatform.nodeView.{ErgoNodeViewRef, ErgoReadersHolderRef, LocallyGeneratedModifier}
import org.ergoplatform.nodeView.ErgoReadersHolder.{GetReaders, Readers}
import org.ergoplatform.nodeView.state.StateType
import org.ergoplatform.settings._
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import sigmastate.crypto.DLogProtocol.DLogProverInput

import scala.concurrent.Await
import scala.concurrent.duration._

/** Real CandidateGenerator and NodeViewHolder actors, fresh synthetic genesis.
  * No ErgoApp, HTTP/P2P services, campaign transaction, or existing runtime state.
  * The rejection is a controlled declared-state-root fault.
  */
class BridgeCandidateApplicationRecoverySpec extends AnyFunSuite with Matchers
    with PowSchemeReaders with SettingsReaders with NodeConfigurationReaders {
  private val Prefix = "bridge.candidate.solved.application."
  private val SourceConfigHash = "2348654f74dd9f5ba8dcbc8e7415ee02d1f7f8fddc2be43ccddc45e0fce92727"
  private val CandidateSourceHash = "e19af43eed37fa4ed70a7ab7bd7656e5a263be0e69992ec0f5bfbd8cf25db319"
  private val SyntheticMiner = DLogProverInput(java.math.BigInteger.valueOf(7L))
  private val ReplyBound = 14.seconds

  private case object Release
  private case object Released

  private class ModifierGate(target: ActorRef, observer: ActorRef) extends Actor {
    private var pending = Vector.empty[LocallyGeneratedModifier]
    override def receive: Receive = {
      case modifier: LocallyGeneratedModifier =>
        pending :+= modifier
        observer ! modifier
      case Release =>
        pending.foreach(target.tell(_, self))
        pending = Vector.empty
        observer ! Released
    }
  }

  private def property(suffix: String): String = sys.props.getOrElse(Prefix + suffix,
    throw new IllegalArgumentException("missing property: " + Prefix + suffix))

  private def sha256(bytes: Array[Byte]): String = MessageDigest.getInstance("SHA-256")
    .digest(bytes).map(b => f"${b & 0xff}%02x").mkString

  private def sourceBytes(relative: String, expected: String): Array[Byte] = {
    val source = Paths.get(property("root")).toRealPath()
    val path = source.resolve(relative)
    require(Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS), "source must be a regular file")
    require(Files.size(path) <= 1024 * 1024, "source byte bound")
    val bytes = Files.readAllBytes(path)
    require(sha256(bytes) == expected, "source digest mismatch: " + relative)
    bytes
  }

  private def withActors(body: (TestKit, ErgoSettings, ActorRef, ActorRef, TestProbe) => Unit): Unit = {
    sourceBytes("src/main/scala/org/ergoplatform/mining/CandidateGenerator.scala", CandidateSourceHash)
    val bytes = sourceBytes("src/main/resources/application.conf", SourceConfigHash)
    val parent = Paths.get(property("scratch")).toAbsolutePath.normalize()
    require(Files.isDirectory(parent, LinkOption.NOFOLLOW_LINKS) && parent.toRealPath() == parent,
      "scratch must be a canonical existing directory")
    require(!parent.startsWith(Paths.get(property("root")).toRealPath()), "scratch must be outside source")
    val directory = Files.createTempDirectory(parent, "native-tracker-mempool-actor-")
    val config = ConfigFactory.parseString(new String(bytes, StandardCharsets.UTF_8))
      .withValue("ergo.directory", ConfigValueFactory.fromAnyRef(directory.toString))
      .withValue("scorex.dataDir", ConfigValueFactory.fromAnyRef(directory.resolve("inert-scorex").toString))
      .withValue("scorex.logDir", ConfigValueFactory.fromAnyRef(directory.resolve("inert-log").toString))
      .withValue("ergo.chain.monetary.minerRewardDelay", ConfigValueFactory.fromAnyRef(1))
      // The delay-one emission tree changes genesis boxes; use the same
      // declared digest as the isolated target, still checked by real state generation.
      .withValue("ergo.chain.genesisStateDigestHex", ConfigValueFactory.fromAnyRef(
        "840ca0b8aec2d7a6c4f1589ca6070c8a5ed5924c835cdb8f816aa773b6fe1b6302"))
      .withValue("ergo.chain.blockInterval", ConfigValueFactory.fromAnyRef("100ms"))
      .withValue("ergo.chain.initialDifficultyHex", ConfigValueFactory.fromAnyRef("04"))
      .withValue("ergo.chain.epochLength", ConfigValueFactory.fromAnyRef(16))
      .withValue("ergo.chain.voting.votingLength", ConfigValueFactory.fromAnyRef(128))
      .resolve(ConfigResolveOptions.noSystem())
    val wallet = config.as[WalletSettings]("ergo.wallet")
    require(wallet.testMnemonic.isEmpty && wallet.testKeysQty.isEmpty, "wallet must remain uninitialized")
    val node = config.as[NodeConfigurationSettings]("ergo.node").copy(
      stateType = StateType.Utxo,
      mining = true,
      offlineGeneration = true,
      useExternalMiner = false,
      verifyTransactions = true,
      minimalFeeAmount = 0L,
      internalMinerPollingInterval = 8.seconds,
      // Keep unrelated mempool notifications from replacing the exact candidate
      // between observation and fault injection. Recovery must clear its cache.
      blockCandidateGenerationInterval = 1.minute
    )
    val settings = ErgoSettings(directory.toString, NetworkType.DevNet,
      config.as[ChainSettings]("ergo.chain"), node, config.as[ScorexSettings]("scorex"),
      wallet, config.as[CacheSettings]("ergo.cache"))
    settings.chainSettings.initialNBits shouldBe config.as[ChainSettings]("ergo.chain").initialNBits
    settings.chainSettings.initialDifficulty shouldBe BigInt(4)
    val system = ActorSystem("candidate-application-" + UUID.randomUUID().toString,
      config.withFallback(ConfigFactory.defaultReference()).resolve(ConfigResolveOptions.noSystem()))
    val kit = new TestKit(system)
    try {
      val view = ErgoNodeViewRef(settings)(system)
      val readers = ErgoReadersHolderRef(view)(system)
      val intercepted = TestProbe()(system)
      val gate = system.actorOf(Props(new ModifierGate(view, intercepted.ref)))
      val generator = CandidateGenerator(SyntheticMiner.publicImage, readers, gate, settings)(system)
      body(kit, settings, readers, generator, intercepted)
    } finally {
      Await.result(system.terminate(), 20.seconds)
      // NodeViewHolder closes history/main state storage on actor termination.
      // UtxoState's separately registered snapshots database is closed by the root's
      // contained-JVM exit. The runner owns scratch deletion only after that exit.
    }
  }

  private def candidate(generator: ActorRef, probe: TestProbe): Candidate = {
    generator.tell(GenerateCandidate(Seq.empty, reply = true, forced = false), probe.ref)
    probe.expectMsgPF(ReplyBound) { case StatusReply.Success(value: Candidate) => value }
  }

  private def submitAndIntercept(settings: ErgoSettings, generator: ActorRef,
                                 probe: TestProbe, intercepted: TestProbe,
                                 value: Candidate): ErgoFullBlock = {
    val block = settings.chainSettings.powScheme
      .proveCandidate(value.candidateBlock, SyntheticMiner.w, 0, 1000)
      .getOrElse(fail("bounded synthetic PoW search found no solution"))
    settings.chainSettings.powScheme.validate(block.header).isSuccess shouldBe true
    generator.tell(block.header.powSolution, probe.ref)
    probe.expectMsg(StatusReply.Success(()))
    val expected = Vector(block.header) ++ block.mandatoryBlockSections
    expected.foreach { section =>
      val actual = intercepted.expectMsgType[LocallyGeneratedModifier](ReplyBound)
      actual.pmod.id shouldBe section.id
      actual.pmod.modifierTypeId shouldBe section.modifierTypeId
    }
    block
  }

  private def release(intercepted: TestProbe): Unit = {
    // The gate is the sender of every intercepted modifier.
    val gate = intercepted.lastSender
    gate.tell(Release, intercepted.ref)
    intercepted.expectMsg(Released)
  }

  private def assertSyntheticFailureIgnored(
    failureFor: ErgoFullBlock => SemanticallyFailedModification
  ): Unit = {
    withActors { (kit, settings, _, generator, intercepted) =>
      val replies = TestProbe()(kit.system)
      val cached = candidate(generator, replies)
      val block = submitAndIntercept(settings, generator, replies, intercepted, cached)

      // These direct, typed events isolate the actor's type/id predicate. The real
      // NodeViewHolder publication and recovery path are exercised in the first test.
      generator.tell(failureFor(block), replies.ref)
      val afterFailure = candidate(generator, replies)
      afterFailure.candidateBlock.timestamp shouldBe cached.candidateBlock.timestamp
      afterFailure.candidateBlock.stateRoot.sameElements(cached.candidateBlock.stateRoot) shouldBe true
      generator.tell(block.header.powSolution, replies.ref)
      replies.expectMsgPF(ReplyBound) {
        case StatusReply.Error(error) => error.getMessage should include("Block already solved")
      }
      intercepted.expectNoMessage(100.millis)
    }
  }

  private def checkPostGenesisRecovery(staleSolution: Boolean): Unit = {
    withActors { (kit, settings, readers, generator, intercepted) =>
      val replies = TestProbe()(kit.system)
      val failures = TestProbe()(kit.system)
      val applied = TestProbe()(kit.system)
      kit.system.eventStream.subscribe(failures.ref, classOf[SemanticallyFailedModification])
      kit.system.eventStream.subscribe(applied.ref, classOf[FullBlockApplied])
      val first = submitAndIntercept(settings, generator, replies, intercepted, candidate(generator, replies))
      release(intercepted)
      applied.expectMsgType[FullBlockApplied](ReplyBound).header.id shouldBe first.id
      kit.awaitAssert({
        candidate(generator, replies).candidateBlock.parentOpt.map(_.id) shouldBe Some(first.id)
      }, ReplyBound, 50.millis)
      val cached = candidate(generator, replies)
      val originalRoot = cached.candidateBlock.stateRoot.clone()
      val originalParent = cached.candidateBlock.parentOpt.map(_.id)
      readers.tell(GetReaders, replies.ref)
      val beforeMutation = replies.expectMsgType[Readers](ReplyBound)
      val livePreStateRoot = beforeMutation.s.rootDigest.toVector
      // CandidateBlock exposes a mutable ADDigest. Change one declared-root byte
      // before deriving PoW so PoW remains valid for the exact rejected block.
      cached.candidateBlock.stateRoot(0) = (cached.candidateBlock.stateRoot(0) ^ 1).toByte
      cached.candidateBlock.stateRoot.sameElements(originalRoot) shouldBe false
      beforeMutation.s.rootDigest.toVector shouldBe livePreStateRoot
      readers.tell(GetReaders, replies.ref)
      replies.expectMsgType[Readers](ReplyBound).s.rootDigest.toVector shouldBe livePreStateRoot
      val block = submitAndIntercept(settings, generator, replies, intercepted, cached)
      release(intercepted)
      val failure = failures.expectMsgType[SemanticallyFailedModification](ReplyBound)
      failure.typeId shouldBe ErgoFullBlock.modifierTypeId
      failure.modifierId shouldBe block.id
      failure.error.getMessage should include("Calculated AVL+ digest")
      applied.expectNoMessage(100.millis)

      readers.tell(GetReaders, replies.ref)
      val current = replies.expectMsgType[Readers](ReplyBound)
      current.s.rootDigest.toVector shouldBe livePreStateRoot
      current.h.bestFullBlockOpt.exists(_.id == block.id) shouldBe false
      current.s.stateContext.lastHeaderOpt.exists(_.id == block.id) shouldBe false

      // Recovery itself must not retransmit the rejected block. The next ordinary
      // poll regenerates from the unchanged live state after rollback completes.
      intercepted.expectNoMessage(100.millis)
      kit.awaitAssert({
        val regenerated = candidate(generator, replies)
        regenerated.candidateBlock.timestamp should be > cached.candidateBlock.timestamp
        regenerated.candidateBlock.parentOpt.map(_.id) shouldBe originalParent
        regenerated.candidateBlock.stateRoot.sameElements(originalRoot) shouldBe true
      }, ReplyBound, 50.millis)
      val regenerated = candidate(generator, replies)
      if (staleSolution) {
        // A solution for the rejected candidate must reach the invalid-PoW branch,
        // with no previous candidate available after recovery.
        val pow = settings.chainSettings.powScheme
        val alternatives = (0L until 16L).iterator.flatMap { attempt =>
          pow.proveCandidate(cached.candidateBlock, SyntheticMiner.w,
            attempt * 1000L, (attempt + 1L) * 1000L).map(_.header.powSolution)
        }
        val stale = (Iterator.single(block.header.powSolution) ++ alternatives)
          .find(solution => pow.validate(CandidateGenerator.completeBlock(
            regenerated.candidateBlock, solution).header).isFailure)
          .getOrElse(fail("bounded search found no stale solution invalid for the new candidate"))
        pow.validate(CandidateGenerator.completeBlock(cached.candidateBlock, stale).header).isSuccess shouldBe true
        val mismatched = CandidateGenerator.completeBlock(regenerated.candidateBlock, stale)
        settings.chainSettings.powScheme.validate(mismatched.header).isFailure shouldBe true
        generator.tell(stale, replies.ref)
        replies.expectMsgPF(ReplyBound) {
          case StatusReply.Error(error) => error.getMessage should include("Invalid block mined")
        }
        intercepted.expectNoMessage(100.millis)
      }
      val usable = candidate(generator, replies)
      usable.candidateBlock.parentOpt.map(_.id) shouldBe originalParent
      usable.candidateBlock.stateRoot.sameElements(originalRoot) shouldBe true
      val nextBlock = submitAndIntercept(settings, generator, replies, intercepted, usable)
      nextBlock.header.parentId shouldBe block.header.parentId
      release(intercepted)
      applied.expectMsgType[FullBlockApplied](ReplyBound).header.id shouldBe nextBlock.id
      failures.expectNoMessage(100.millis)
    }
  }

  test("real post-genesis semantic failure recovers and applies the next candidate") {
    checkPostGenesisRecovery(staleSolution = false)
  }

  test("a stale solution after post-genesis recovery returns an error and preserves actor progress") {
    checkPostGenesisRecovery(staleSolution = true)
  }

  test("semantic failure for an unrelated full-block id leaves solved state intact") {
    assertSyntheticFailureIgnored { block =>
      block.header.parentId should not equal block.id
      SemanticallyFailedModification(
        ErgoFullBlock.modifierTypeId,
        block.header.parentId,
        new IllegalStateException("synthetic unrelated id")
      )
    }
  }

  test("semantic failure for an unrelated modifier type leaves solved state intact") {
    assertSyntheticFailureIgnored { block =>
      Header.modifierTypeId should not equal ErgoFullBlock.modifierTypeId
      SemanticallyFailedModification(
        Header.modifierTypeId,
        block.id,
        new IllegalStateException("synthetic unrelated type")
      )
    }
  }

  test("real FullBlockApplied clears solved state and polling returns successor candidate") {
    withActors { (kit, settings, _, generator, intercepted) =>
      val replies = TestProbe()(kit.system)
      val applied = TestProbe()(kit.system)
      val failures = TestProbe()(kit.system)
      kit.system.eventStream.subscribe(applied.ref, classOf[FullBlockApplied])
      kit.system.eventStream.subscribe(failures.ref, classOf[SemanticallyFailedModification])
      val first = candidate(generator, replies)
      val block = submitAndIntercept(settings, generator, replies, intercepted, first)
      release(intercepted)
      applied.expectMsgType[FullBlockApplied](ReplyBound).header.id shouldBe block.id
      kit.awaitAssert({
        candidate(generator, replies).candidateBlock.parentOpt.map(_.id) shouldBe Some(block.id)
      }, ReplyBound, 50.millis)
      val successor = candidate(generator, replies)
      successor.candidateBlock.timestamp should be > first.candidateBlock.timestamp
      val nextBlock = submitAndIntercept(settings, generator, replies, intercepted, successor)
      nextBlock.header.parentId shouldBe block.id
      release(intercepted)
      applied.expectMsgType[FullBlockApplied](ReplyBound).header.id shouldBe nextBlock.id
      failures.expectNoMessage(100.millis)
    }
  }
}
