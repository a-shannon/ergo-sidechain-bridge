package org.ergoplatform.nodeView.state.bridge

import java.util.Locale

import org.ergoplatform.settings.Algos.HF
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import scorex.crypto.authds.{ADKey, ADValue}
import scorex.crypto.authds.avltree.batch.{BatchAVLProver, BatchAVLVerifier, Insert, Lookup}
import scorex.crypto.hash.{Blake2b256, Digest32}
import scorex.util.encode.Base16

class BridgeUtxoStateProofDifferentialSpec
    extends AnyFunSuite with Matchers {
  private val ExpectedCommit =
    "2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1"
  private val ResultPrefix = "E2S_ERGO_UTXO_STATE_PROOF_JVM_DIFFERENTIAL="
  private val KeyLength = 32

  test("pinned JVM prover reproduces exact vault membership and source absence") {
    requiredProperty("bridge.ergo.utxo.ergo.commit") shouldBe ExpectedCommit

    val vaultId = ADKey @@ hexProperty("bridge.ergo.utxo.vault.id")
    val vaultBytes = ADValue @@ hexProperty("bridge.ergo.utxo.vault.bytes")
    val sourceId = ADKey @@ hexProperty("bridge.ergo.utxo.source.id")
    val historicalSourceBytes =
      ADValue @@ hexProperty("bridge.ergo.utxo.source.historical-bytes")
    val expectedPreRoot = hexProperty("bridge.ergo.utxo.pre-root")
    val expectedPostRoot = hexProperty("bridge.ergo.utxo.post-root")
    val expectedProof = hexProperty("bridge.ergo.utxo.proof")

    Blake2b256(vaultBytes).toIndexedSeq shouldBe vaultId.toIndexedSeq
    Blake2b256(historicalSourceBytes).toIndexedSeq shouldBe sourceId.toIndexedSeq

    val prover = new BatchAVLProver[Digest32, HF](KeyLength, None)
    val preRoot = prover.digest
    prover.performOneOperation(Insert(vaultId, vaultBytes)).get shouldBe None
    prover.generateProof()
    val postRoot = prover.digest

    prover.performOneOperation(Lookup(vaultId)).get.map(_.toIndexedSeq) shouldBe
      Some(vaultBytes.toIndexedSeq)
    prover.performOneOperation(Lookup(sourceId)).get shouldBe None
    val proof = prover.generateProof()

    preRoot.toIndexedSeq shouldBe expectedPreRoot.toIndexedSeq
    postRoot.toIndexedSeq shouldBe expectedPostRoot.toIndexedSeq
    proof.toIndexedSeq shouldBe expectedProof.toIndexedSeq

    val verifier = new BatchAVLVerifier[Digest32, HF](
      postRoot,
      proof,
      KeyLength,
      None,
      maxNumOperations = Some(2)
    )
    verifier.performOneOperation(Lookup(vaultId)).get.map(_.toIndexedSeq) shouldBe
      Some(vaultBytes.toIndexedSeq)
    verifier.performOneOperation(Lookup(sourceId)).get shouldBe None
    verifier.digest.get.toIndexedSeq shouldBe postRoot.toIndexedSeq

    info(s"$ResultPrefix${Base16.encode(postRoot)}")
  }

  private def requiredProperty(name: String): String =
    sys.props
      .get(name)
      .orElse(sys.env.get(name.toUpperCase(Locale.ROOT).replace('.', '_').replace('-', '_')))
      .map(_.trim)
      .filter(_.nonEmpty)
      .getOrElse {
      fail(s"missing required JVM differential input $name")
    }

  private def hexProperty(name: String): Array[Byte] =
    Base16.decode(requiredProperty(name)).getOrElse {
      fail(s"system property $name is not valid base16")
    }
}
