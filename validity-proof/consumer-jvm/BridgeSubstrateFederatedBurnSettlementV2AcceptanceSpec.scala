package sigma.bridge

import java.math.BigInteger
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets.US_ASCII
import java.nio.file.{Files, Paths}
import java.security.MessageDigest

import io.circe.{Json, parser}
import org.ergoplatform._
import org.ergoplatform.validation.ValidationRules
import scorex.crypto.authds.{ADKey, ADValue}
import scorex.crypto.authds.avltree.batch.{BatchAVLProver, BatchAVLVerifier, Insert, Lookup}
import scorex.crypto.authds.{ADDigest, SerializedAdProof}
import scorex.crypto.hash.{Blake2b256, Digest32}
import sigma.{Coll, Colls, Header, VersionContext}
import sigma.ast._
import sigma.crypto.CryptoConstants
import sigma.data.{AvlTreeData, AvlTreeFlags}
import sigma.interpreter.{ContextExtension, ProverResult}
import sigma.serialization.{ErgoTreeSerializer, SigmaSerializer}
import sigma.util.Extensions.EcpOps
import sigmastate.crypto.DLogProtocol.DLogProverInput
import sigmastate.crypto.SigmaProtocolPrivateInput
import sigmastate.eval.CPreHeader
import sigmastate.interpreter.ProverInterpreter

import scala.util.{Failure, Success}

/** Standalone offline spec: compile only this file against the locked 6.0.2 JARs.
  * No node, resolver, test-helper classes, or chain-state acceptance. The scalar
  * one fee witness is public synthetic fixture material, never wallet custody.
  */
object BridgeSubstrateFederatedBurnSettlementV2AcceptanceSpec {
  private val Version = 3.toByte
  private val CostLimit = 1000000L
  private val FeeTree = "0008cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
  private class Verifier extends ErgoLikeInterpreter { override type CTX = ErgoLikeContext }
  private class FeeProver extends Verifier with ProverInterpreter {
    override val secrets: Seq[SigmaProtocolPrivateInput[_]] = Seq(DLogProverInput(BigInteger.ONE))
  }
  private case class Candidate(tx: ErgoLikeTransaction, boxes: IndexedSeq[ErgoBox],
      data: IndexedSeq[ErgoBox], height: Int)
  private case class Result(channel: String, cost: Long)

  def main(args: Array[String]): Unit = {
    require(args.length == 2 && args(1).matches("[0-9a-f]{64}"), "fixture path and exact SHA-256 required")
    val path = Paths.get(args(0))
    require(Files.isRegularFile(path) && !Files.isSymbolicLink(path), "fixture must be a regular file")
    val bytes = Files.readAllBytes(path)
    require(sha256(bytes) == args(1), "fixture hash mismatch")
    require(bytes.nonEmpty && bytes.forall(b => (b & 255) < 128) && !bytes.contains(13.toByte), "ASCII LF fixture required")
    val fixture = parser.parse(new String(bytes, US_ASCII)).fold(e => throw e, identity)
    require(str(fixture, "schema") == "e2s.substrate-federated-burn-settlement-jvm-fixture.v2", "V2 fixture schema")
    require(fixture.hcursor.get[Int]("version").right.get == 2, "V2 fixture version")
    val compiler = fixture.hcursor.downField("compiler").focus.get
    require(str(compiler, "trackerReceiptSchema") == "e2s.substrate-federated-tracker-jvm-compiler-receipt.v2", "genuine V2 tracker identity")
    require(str(compiler, "familyReceiptSchema") == "e2s.substrate-federated-settlement-family-jvm-compiler-receipt.v2", "genuine V2 family identity")
    require(str(compiler, "sigmaStateVersion") == "6.0.2", "SigmaState version")
    val artifact = Paths.get(classOf[ErgoLikeInterpreter].getProtectionDomain.getCodeSource.getLocation.toURI)
    require(sha256(Files.readAllBytes(artifact)) == str(compiler, "sigmaStateArtifactSha256Hex"), "runtime artifact binding")
    val proofless = unhex(str(fixture, "prooflessTransactionHex"))
    require(sha256(proofless) == str(fixture, "prooflessTransactionSha256Hex"), "proofless SHA-256")
    val tx = parseTransaction(proofless)
    require(tx.id == str(fixture, "unsignedTransactionIdHex"), "constructor transaction identity")
    require(tx.messageToSign.sameElements(proofless), "exact constructor message")
    val base = Candidate(tx, strings(fixture, "inputBoxSigmaHex").map(parseBox),
      strings(fixture, "dataInputBoxSigmaHex").map(parseBox), fixture.hcursor.get[Int]("currentErgoHeight").right.get)
    require(base.boxes.length == 3 && base.data.length == 1 && tx.outputCandidates.length == 4, "three-input settlement shape")
    require(fixture.hcursor.get[Int]("activatedScriptVersion").right.get == Version, "activated version")
    require(tx.inputs.forall(_.spendingProof.proof.isEmpty), "fixture must be proofless")
    require(hex(base.boxes(2).ergoTree.bytes) == FeeTree, "synthetic fee witness identity")
    require(tx.inputs.map(_.extension.values.keySet) == Vector(Set.empty[Byte], Set[Byte](0, 1, 2, 3), Set.empty[Byte]), "exact per-input extensions")
    val contracts = fixture.hcursor.downField("contracts").focus.get
    Seq("pooledReserve" -> base.boxes(0), "duplicatePrevention" -> base.boxes(1), "tracker" -> base.data.head).foreach {
      case (role, box) =>
        val identity = contracts.hcursor.downField(role).focus.get
        require(hex(box.ergoTree.bytes) == str(identity, "propositionHex"), s"$role exact tree")
        require(hex(Blake2b256(box.ergoTree.bytes)) == str(identity, "contractIdHex"), s"$role contract ID")
    }
    require(BigInt(base.boxes(0).value) - BigInt(tx.outputCandidates(0).value) == BigInt(str(fixture, "amountNanoErg")), "reserve decreases only by burn")
    val signed = signFee(base)
    check("positive", "all-inputs", signed, Vector("ACCEPT", "ACCEPT", "ACCEPT"))

    val payout = tx.outputCandidates(2)
    val otherTree = ErgoTreeSerializer.DefaultSerializer.deserializeErgoTree(unhex(FeeTree.replace("0008cd02", "0008cd03")))
    check("payout-recipient", "DUP.leafFieldsOk", signFee(withOutput(base, 2, copyOutput(payout)(tree = otherTree))),
      Vector("ACCEPT", "CONTRACT_FALSE", "ACCEPT"))

    check("replay-already-spent", "DUP.spentIdsTree.insert", signFee(replay(base, unhex(str(fixture, "burnIdHex")))),
      Vector("ACCEPT", "EVALUATION_FAILURE", "ACCEPT"))

    val reserve = tx.outputCandidates(0)
    val liability = reserve.additionalRegisters(ErgoBox.R6).value.asInstanceOf[Long]
    check("reserve-liability", "reserve.reserveSuccessorOk+DUP.reserveTransitionOk",
      signFee(withOutput(base, 0, copyOutput(reserve)(registers = reserve.additionalRegisters.toMap.updated(ErgoBox.R6, LongConstant(liability + 1))))),
      Vector("CONTRACT_FALSE", "CONTRACT_FALSE", "ACCEPT"))

    check("fee-redirection", "reserve.externalFeeOk",
      signFee(withOutput(base, 3, copyOutput(tx.outputCandidates(3))(tree = payout.ergoTree))),
      Vector("CONTRACT_FALSE", "ACCEPT", "ACCEPT"))

    val input = tx.inputs(1)
    val missing = Input(input.boxId, ProverResult(Array.emptyByteArray,
      ContextExtension(input.extension.values.toMap - 3.toByte)))
    check("context-missing-bundle", "DUP.getVar(3).get",
      signFee(base.copy(tx = new ErgoLikeTransaction(tx.inputs.updated(1, missing), tx.dataInputs, tx.outputCandidates))),
      Vector("ACCEPT", "EVALUATION_FAILURE", "ACCEPT"))

    check("fee-proof-absent", "fee.Sigma-proof", base, Vector("ACCEPT", "ACCEPT", "PROOF_FALSE"))
    // Payout creation height is not a contract failure; retaining the old fee
    // proof isolates the exact-message signature boundary.
    check("fee-proof-stale-message", "fee.transaction-message",
      withOutput(signed, 2, copyOutput(payout)(height = payout.creationHeight - 1)),
      Vector("ACCEPT", "ACCEPT", "PROOF_FALSE"))
    println("VM_MATRIX_PASS 8")
  }

  private def check(id: String, boundary: String, candidate: Candidate, expected: Vector[String]): Unit = {
    // Construction/serialization failures stay outside the interpreter result.
    val tx = parseTransaction(ErgoLikeTransactionSerializer.toBytes(candidate.tx))
    require(tx.messageToSign.sameElements(candidate.tx.messageToSign), s"$id signed-message roundtrip")
    require(tx.inputs.length == candidate.boxes.length && tx.inputs.zip(candidate.boxes).forall {
      case (input, box) => input.boxId.sameElements(box.id)
    }, s"$id spending box identity")
    require(tx.dataInputs.length == candidate.data.length && tx.dataInputs.zip(candidate.data).forall {
      case (input, box) => input.boxId.sameElements(box.id)
    }, s"$id data box identity")
    require(candidate.boxes.map(b => BigInt(b.value)).sum == tx.outputCandidates.map(b => BigInt(b.value)).sum, s"$id ERG conservation")
    val current = candidate.copy(tx = tx)
    val results = tx.inputs.indices.map { index =>
      val ctx = context(current, index)
      new Verifier().verify(candidate.boxes(index).ergoTree, ctx,
        tx.inputs(index).spendingProof, tx.messageToSign) match {
        case Success((true, cost)) => Result("ACCEPT", cost)
        case Success((false, cost)) => Result(if (index == 2) "PROOF_FALSE" else "CONTRACT_FALSE", cost)
        case Failure(error) =>
          var cause = error
          while (cause.getCause != null && cause.getCause != cause) { cause = cause.getCause }
          require(index == 1 && (
            (id == "replay-already-spent" && cause.getClass.getName == "sigma.exceptions.InterpreterException" &&
              Option(cause.getMessage).exists(message => message.startsWith("Incorrect insert for CAvlTree") &&
                message.contains("already exists"))) ||
            (id == "context-missing-bundle" && cause.isInstanceOf[NoSuchElementException] && cause.getMessage == "None.get")
          ), s"$id unexpected evaluation exception: ${cause.getClass.getName}")
          println(s"VM_EXCEPTION $id input=$index root=${cause.getClass.getName}")
          Result("EVALUATION_FAILURE", 0L)
      }
    }.toVector
    require(results.map(_.channel) == expected, s"$id expected=$expected actual=$results")
    require(results.map(_.cost).sum <= CostLimit, s"$id aggregate cost")
    val channels = results.map(r => s"${r.channel}:${if (r.channel == "EVALUATION_FAILURE") "n/a" else r.cost.toString}")
    println(s"VM_CASE $id boundary=$boundary results=${channels.mkString(",")} tx=${tx.id}")
  }

  private def context(candidate: Candidate, index: Int): ErgoLikeContext = {
    val preHeader = CPreHeader(0, Colls.emptyColl[Byte], 3L, 0L, candidate.height,
      CryptoConstants.dlogGroup.generator.toGroupElement, Colls.emptyColl[Byte])
    new ErgoLikeContext(AvlTreeData.dummy, Colls.emptyColl[Header], preHeader,
      candidate.data, candidate.boxes, candidate.tx, index, candidate.tx.inputs(index).extension,
      ValidationRules.currentSettings, CostLimit, 0L, Version)
  }

  private def signFee(candidate: Candidate): Candidate = {
    val proof = new FeeProver().prove(candidate.boxes(2).ergoTree, context(candidate, 2), candidate.tx.messageToSign).get
    require(proof.proof.nonEmpty, "synthetic fee proof must be non-empty")
    val tx = candidate.tx
    val signed = new ErgoLikeTransaction(tx.inputs.updated(2, Input(candidate.boxes(2).id, proof)), tx.dataInputs, tx.outputCandidates)
    require(signed.id == tx.id && signed.messageToSign.sameElements(tx.messageToSign), "fee signing changed transaction body")
    candidate.copy(tx = signed)
  }

  private def replay(base: Candidate, burnId: Array[Byte]): Candidate = {
    val prover = new BatchAVLProver[Digest32, Blake2b256.type](32, Some(1))
    val insert = Insert(burnId.clone().asInstanceOf[ADKey], Array[Byte](1).asInstanceOf[ADValue])
    require(prover.performOneOperation(insert).isSuccess, "synthetic prior burn insertion")
    prover.generateProof()
    val digest = prover.digest.clone()
    require(prover.performOneOperation(Lookup(burnId.clone().asInstanceOf[ADKey])).get.isDefined, "replay lookup proves burn present")
    val lookupProof = prover.generateProof().clone()
    require(prover.performOneOperation(insert).isFailure, "duplicate insertion must fail")
    // The valid existing-key path is supplied to both JVM operations. Lookup
    // succeeds; insertion of that same present key is the semantic fault.
    val insertProof = lookupProof.clone()
    val verifier = new BatchAVLVerifier[Digest32, Blake2b256.type](
      digest.clone().asInstanceOf[ADDigest], lookupProof.clone().asInstanceOf[SerializedAdProof], 32, Some(1))
    require(verifier.performOneOperation(Lookup(burnId.clone().asInstanceOf[ADKey])).get.get.sameElements(Array[Byte](1)),
      "independent replay membership witness")
    val old = base.boxes(1)
    val tree = new AvlTreeData(Colls.fromArray(digest), AvlTreeFlags.InsertOnly, 32, Some(1))
    val box = new ErgoBox(old.value, old.ergoTree, old.additionalTokens,
      old.additionalRegisters.toMap.updated(ErgoBox.R5, AvlTreeConstant(tree)), old.transactionId, old.index, old.creationHeight)
    val input = base.tx.inputs(1)
    val bundle = input.extension.get(3.toByte).get.value.asInstanceOf[Coll[Byte]].toArray
    val nodes = ByteBuffer.wrap(bundle.slice(74, 82)).getLong.toInt
    val prefix = bundle.take(90 + nodes * 33)
    ByteBuffer.wrap(prefix, 82, 8).putLong(lookupProof.length.toLong)
    val extension = ContextExtension(input.extension.values.toMap.updated(3.toByte,
      ByteArrayConstant(prefix ++ lookupProof ++ insertProof)))
    val tx = new ErgoLikeTransaction(base.tx.inputs.updated(1, Input(box.id, ProverResult(Array.emptyByteArray, extension))),
      base.tx.dataInputs, base.tx.outputCandidates)
    base.copy(tx = tx, boxes = base.boxes.updated(1, box))
  }

  private def withOutput(base: Candidate, index: Int, output: ErgoBoxCandidate): Candidate =
    base.copy(tx = new ErgoLikeTransaction(base.tx.inputs, base.tx.dataInputs, base.tx.outputCandidates.updated(index, output)))

  private def copyOutput(output: ErgoBoxCandidate)(tree: ErgoTree = output.ergoTree,
      registers: ErgoBox.AdditionalRegisters = output.additionalRegisters, height: Int = output.creationHeight): ErgoBoxCandidate =
    new ErgoBoxCandidate(output.value, tree, height, output.additionalTokens, registers)

  private def parseTransaction(bytes: Array[Byte]): ErgoLikeTransaction = VersionContext.withVersions(Version, 0.toByte) {
    val reader = SigmaSerializer.startReader(bytes.clone())
    val tx = ErgoLikeTransactionSerializer.parse(reader)
    require(reader.remaining == 0 && ErgoLikeTransactionSerializer.toBytes(tx).sameElements(bytes), "transaction serialization")
    tx
  }
  private def parseBox(encoded: String): ErgoBox = VersionContext.withVersions(Version, 0.toByte) {
    val bytes = unhex(encoded)
    val reader = SigmaSerializer.startReader(bytes.clone())
    val box = ErgoBox.sigmaSerializer.parse(reader)
    require(reader.remaining == 0 && ErgoBox.sigmaSerializer.toBytes(box).sameElements(bytes), "box serialization")
    box
  }
  private def str(json: Json, key: String): String = json.hcursor.get[String](key).right.get
  private def strings(json: Json, key: String): Vector[String] = json.hcursor.get[Vector[String]](key).right.get
  private def unhex(value: String): Array[Byte] = {
    require(value.nonEmpty && value.length % 2 == 0 && value.matches("[0-9a-f]+"), "canonical hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }
  private def hex(value: Array[Byte]): String = value.map(b => f"${b & 255}%02x").mkString
  private def sha256(bytes: Array[Byte]): String = hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
