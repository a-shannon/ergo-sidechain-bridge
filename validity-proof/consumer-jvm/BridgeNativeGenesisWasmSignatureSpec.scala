package sigma.bridge

import java.nio.charset.StandardCharsets.US_ASCII
import java.nio.file.{Files, Paths}
import java.security.MessageDigest

import io.circe.{Json, parser}
import org.ergoplatform._
import org.ergoplatform.validation.ValidationRules
import sigma.{Colls, Header, VersionContext}
import sigma.crypto.CryptoConstants
import sigma.data.AvlTreeData
import sigma.serialization.SigmaSerializer
import sigma.util.Extensions.EcpOps
import sigmastate.eval.CPreHeader

import scala.util.{Failure, Success}
import scala.util.control.NonFatal

/** Offline differential for retained WASM proofs, never a signer or node oracle.
  * Only the exact P2PK and two reward input scripts are evaluated. Dummy state
  * and empty headers are sufficient for their HEIGHT/SELF/P2PK operations;
  * output contracts, full consensus, compiler provenance and node acceptance
  * are outside this probe.
  */
object BridgeNativeGenesisWasmSignatureSpec {
  private val Version = 3.toByte
  private val CostLimit = 1000000L
  private val ArtifactSha256 = "0dbd3b31ef94affec83f8f0f6c5a9891c45da1e975ff6016a0574fc5aa1418e6"
  private val FeeTree = "1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304"
  private val Roles = Vector("tracker", "duplicatePrevention", "pooledReserve")
  private val Kinds = Vector("p2pk", "reward1", "reward720")
  private val CaseFields = Set("id", "role", "inputTreeKind", "signedTransactionHex",
    "inputBoxSigmaHex", "unsignedTransactionIdHex", "currentErgoHeight", "expected")
  private class Verifier extends ErgoLikeInterpreter { override type CTX = ErgoLikeContext }
  private case class ProbeFailure(code: String) extends RuntimeException(code)
  private case class Candidate(id: String, role: String, kind: String, tx: ErgoLikeTransaction,
      box: ErgoBox, height: Int, expected: String, encodedTx: String, encodedBox: String)

  def main(args: Array[String]): Unit = try {
    run(args)
  } catch {
    case e: ProbeFailure => System.err.println("JVM_NATIVE_GENESIS_WASM_PROBE_FAIL " + e.code); System.exit(1)
    case NonFatal(_) => System.err.println("JVM_NATIVE_GENESIS_WASM_PROBE_FAIL UNEXPECTED_EXCEPTION"); System.exit(1)
  }

  private def run(args: Array[String]): Unit = {
    need(args.length == 2 && args(1).matches("[0-9a-f]{64}"), "ARGUMENTS")
    val path = Paths.get(args(0))
    need(Files.isRegularFile(path) && !Files.isSymbolicLink(path), "REGULAR_FILE")
    need(Files.size(path) > 0 && Files.size(path) <= 1048576L, "FIXTURE_SIZE")
    val bytes = Files.readAllBytes(path)
    need(sha256(bytes) == args(1), "FIXTURE_HASH")
    need(bytes.forall(b => (b & 255) < 128) && !bytes.contains(13.toByte), "ASCII_LF")
    val text = new String(bytes, US_ASCII)
    val fixture = parser.parse(text).fold(_ => throw ProbeFailure("JSON"), identity)
    // Re-rendering rejects duplicate keys at any depth, escapes, alternate number
    // spellings, whitespace and extra LF; unknown fields are rejected separately.
    need(text == canonical(fixture) + "\n", "CANONICAL_JSON")
    fields(fixture, Set("schema", "cases"))
    need(str(fixture, "schema") == "e2s.native-genesis-wasm-signature-probe.v1", "SCHEMA")
    val artifact = Paths.get(classOf[ErgoLikeInterpreter].getProtectionDomain.getCodeSource.getLocation.toURI)
    need(Files.isRegularFile(artifact) && sha256(Files.readAllBytes(artifact)) == ArtifactSha256, "RUNTIME_ARTIFACT")
    val cases = fixture.hcursor.get[Vector[Json]]("cases").fold(_ => throw ProbeFailure("CASES"), identity).map(readCase)
    val positiveIds = (for (kind <- Kinds; role <- Roles) yield s"$kind-$role").toSet
    val negativeIds = (Kinds.flatMap(k => Vector(s"$k-tracker-absent-proof", s"$k-tracker-stale-message")) ++
      Vector("reward1-tracker-immature", "reward720-tracker-immature")).toSet
    need(cases.length == 17 && cases.map(_.id).toSet == positiveIds ++ negativeIds, "CASE_MATRIX")
    val positives = cases.filter(c => positiveIds(c.id)).map(c => (c.kind, c.role) -> c).toMap
    cases.foreach { c =>
      shape(c)
      if (positiveIds(c.id)) {
        need(c.id == s"${c.kind}-${c.role}" && c.expected == "ACCEPT", "POSITIVE_ID")
        need(c.tx.inputs.head.spendingProof.proof.nonEmpty, "POSITIVE_PROOF")
        need(c.height.toLong >= c.box.creationHeight.toLong + delay(c.kind), "POSITIVE_MATURITY")
      } else {
        need(c.role == "tracker" && c.id.startsWith(c.kind + "-tracker-"), "NEGATIVE_ID")
        isolate(c, positives((c.kind, c.role)))
      }
      val verdict = new Verifier().verify(c.box.ergoTree, context(c),
        c.tx.inputs.head.spendingProof, c.tx.messageToSign) match {
        case Success((true, cost)) => ("ACCEPT", cost)
        case Success((false, cost)) =>
          // Exact tree/body/context isolation above identifies the failing
          // branch; verify itself reports a Boolean, not node error categories.
          (if (c.id.endsWith("-immature")) "CONTRACT_FALSE" else "PROOF_FALSE", cost)
        case Failure(_) => throw ProbeFailure("INTERPRETER_EXCEPTION")
      }
      need(verdict._1 == c.expected, "VERDICT")
      need(verdict._2 >= 0L && verdict._2 <= CostLimit, "COST")
      println(s"JVM_NATIVE_GENESIS_WASM_CASE ${c.id} ${verdict._1} ${verdict._2}")
    }
    println("JVM_NATIVE_GENESIS_WASM_PROBE_PASS 17")
  }

  private def readCase(j: Json): Candidate = {
    fields(j, CaseFields)
    val id = str(j, "id")
    val role = str(j, "role")
    val kind = str(j, "inputTreeKind")
    need(Roles.contains(role) && Kinds.contains(kind), "ROLE_KIND")
    val encodedTx = str(j, "signedTransactionHex")
    val tx = parseTransaction(unhex(encodedTx))
    val encodedBox = str(j, "inputBoxSigmaHex")
    val box = parseBox(unhex(encodedBox))
    val txId = str(j, "unsignedTransactionIdHex")
    need(txId.matches("[0-9a-f]{64}") && tx.id == txId, "TRANSACTION_ID")
    val height = j.hcursor.get[Int]("currentErgoHeight").fold(_ => throw ProbeFailure("HEIGHT"), identity)
    need(height >= 0 && box.creationHeight >= 0, "HEIGHT_RANGE")
    Candidate(id, role, kind, tx, box, height, str(j, "expected"), encodedTx, encodedBox)
  }

  private def shape(c: Candidate): Unit = {
    val tx = c.tx
    need(tx.inputs.length == 1 && tx.dataInputs.isEmpty && tx.outputCandidates.length == 3, "TRANSACTION_SHAPE")
    need(tx.inputs.head.boxId.sameElements(c.box.id) && tx.inputs.head.extension.values.isEmpty, "INPUT_BINDING")
    need(c.box.additionalTokens.isEmpty && c.box.additionalRegisters.isEmpty && c.box.value > 0L, "FUNDING_SHAPE")
    val tree = hex(c.box.ergoTree.bytes)
    val pattern = if (c.kind == "p2pk") "0008cd((?:02|03)[0-9a-f]{64})" else
      "100204" + (if (c.kind == "reward1") "02" else "a00b") + "08cd((?:02|03)[0-9a-f]{64})ea02d192a39a8cc7a70173007301"
    val matcher = java.util.regex.Pattern.compile(pattern).matcher(tree)
    need(matcher.matches(), "INPUT_TREE_KIND")
    val out = tx.outputCandidates
    need(out.forall(o => o.value > 0L && o.creationHeight >= 0), "OUTPUT_VALUES")
    need(BigInt(c.box.value) == out.map(o => BigInt(o.value)).sum, "ERG_CONSERVATION")
    need(out(0).additionalTokens.length == 1 &&
      out(0).additionalTokens(0)._1.toArray.sameElements(c.box.id) && out(0).additionalTokens(0)._2 == 1L, "SINGLETON_ISSUANCE")
    need(out.drop(1).forall(o => o.additionalTokens.isEmpty && o.additionalRegisters.isEmpty), "CHANGE_FEE_SHAPE")
    need(hex(out(0).ergoTree.bytes) == "0008cd" + matcher.group(1), "SINGLETON_OUTPUT_KEY")
    need(hex(out(1).ergoTree.bytes) == tree, "CHANGE_TREE")
    need(out(2).value == 1100000L && hex(out(2).ergoTree.bytes) == FeeTree, "MINER_FEE")
  }

  private def isolate(c: Candidate, base: Candidate): Unit = {
    need(c.encodedBox == base.encodedBox, "NEGATIVE_BOX")
    val proof = c.tx.inputs.head.spendingProof.proof
    if (c.id.endsWith("-absent-proof")) {
      need(c.expected == "PROOF_FALSE" && proof.isEmpty && c.height == base.height &&
        c.tx.messageToSign.sameElements(base.tx.messageToSign), "ABSENT_PROOF_ISOLATION")
    } else if (c.id.endsWith("-stale-message")) {
      val changed = c.tx.outputCandidates.zip(base.tx.outputCandidates)
      need(c.expected == "PROOF_FALSE" && c.height == base.height &&
        proof.sameElements(base.tx.inputs.head.spendingProof.proof) &&
        !c.tx.messageToSign.sameElements(base.tx.messageToSign), "STALE_PROOF_ISOLATION")
      need(changed.count { case (a, b) => a.creationHeight != b.creationHeight } == 1 && changed.forall {
        case (a, b) => a.value == b.value && a.ergoTree.bytes.sameElements(b.ergoTree.bytes) &&
          a.additionalTokens == b.additionalTokens && a.additionalRegisters == b.additionalRegisters &&
          (a.creationHeight == b.creationHeight || a.creationHeight.toLong == b.creationHeight.toLong - 1L)
      }, "STALE_BODY_ISOLATION")
    } else {
      need(c.id.endsWith("-immature") && c.kind != "p2pk" && c.expected == "CONTRACT_FALSE" &&
        c.encodedTx == base.encodedTx && c.height == c.box.creationHeight, "MATURITY_ISOLATION")
    }
  }

  private def context(c: Candidate): ErgoLikeContext = {
    val preHeader = CPreHeader(0, Colls.emptyColl[Byte], 3L, 0L, c.height,
      CryptoConstants.dlogGroup.generator.toGroupElement, Colls.emptyColl[Byte])
    new ErgoLikeContext(AvlTreeData.dummy, Colls.emptyColl[Header], preHeader,
      Vector.empty[ErgoBox], Vector(c.box), c.tx, 0, c.tx.inputs.head.extension,
      ValidationRules.currentSettings, CostLimit, 0L, Version)
  }

  private def parseTransaction(bytes: Array[Byte]): ErgoLikeTransaction = VersionContext.withVersions(Version, 0.toByte) {
    val reader = SigmaSerializer.startReader(bytes.clone())
    val tx = ErgoLikeTransactionSerializer.parse(reader)
    need(reader.remaining == 0 && ErgoLikeTransactionSerializer.toBytes(tx).sameElements(bytes), "TRANSACTION_ROUNDTRIP")
    tx
  }
  private def parseBox(bytes: Array[Byte]): ErgoBox = VersionContext.withVersions(Version, 0.toByte) {
    val reader = SigmaSerializer.startReader(bytes.clone())
    val box = ErgoBox.sigmaSerializer.parse(reader)
    need(reader.remaining == 0 && ErgoBox.sigmaSerializer.toBytes(box).sameElements(bytes), "BOX_ROUNDTRIP")
    box
  }
  private def fields(j: Json, keys: Set[String]): Unit =
    need(j.asObject.exists(_.keys.toSet == keys), "FIELDS")
  private def str(j: Json, key: String): String =
    j.hcursor.get[String](key).fold(_ => throw ProbeFailure("STRING"), identity)
  private def canonical(j: Json): String = j.asObject match {
    case Some(obj) => obj.toVector.sortBy(_._1).map { case (k, v) => Json.fromString(k).noSpaces + ":" + canonical(v) }.mkString("{", ",", "}")
    case None => j.asArray.map(_.map(canonical).mkString("[", ",", "]")).getOrElse(j.noSpaces)
  }
  private def delay(kind: String): Int = if (kind == "reward720") 720 else if (kind == "reward1") 1 else 0
  private def need(ok: Boolean, code: String): Unit = if (!ok) throw ProbeFailure(code)
  private def unhex(s: String): Array[Byte] = {
    need(s.nonEmpty && s.length % 2 == 0 && s.matches("[0-9a-f]+"), "HEX")
    s.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }
  private def hex(bytes: Array[Byte]): String = bytes.map(b => f"${b & 255}%02x").mkString
  private def sha256(bytes: Array[Byte]): String = hex(MessageDigest.getInstance("SHA-256").digest(bytes))
}
