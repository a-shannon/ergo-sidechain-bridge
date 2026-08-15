package org.ergoplatform.bridge.tools

import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path, Paths, StandardOpenOption}
import java.security.MessageDigest
import java.util.{Arrays, Base64}

import io.circe.{Decoder, Json}
import io.circe.parser.parse
import org.ergoplatform.{ErgoBox, ErgoLikeContext, ErgoLikeInterpreter, ErgoLikeTransaction, ErgoLikeTransactionSerializer}
import org.ergoplatform.sdk.JsonCodecs
import scorex.crypto.authds.{ADDigest, ADKey, ADValue, SerializedAdProof}
import scorex.crypto.authds.avltree.batch.{BatchAVLVerifier, Insert}
import scorex.crypto.hash.{Blake2b256, Digest32}
import sigma.VersionContext
import sigma.{Coll, Colls, Header, PreHeader}
import sigma.ast.{ErgoTree, SBoolean, SSigmaProp, Value}
import sigma.compiler.{CompilerResult, SigmaCompiler}
import sigma.compiler.ir.CompiletimeIRContext
import sigma.serialization.ErgoTreeSerializer
import sigma.validation.ValidationRules
import sigmastate.interpreter.Interpreter

import scala.collection.JavaConverters._
import scala.util.{Failure, Success, Try}

/** Resolver-free compiler for the exact authenticated V2 contract sources. */
object ExactAuthenticatedV2Compiler {
  private val InputRoles = Vector("tracker", "unlock", "duplicatePrevention")
  private val NetworkPrefix: Byte = 16.toByte
  private val ScriptVersion: Byte = 3.toByte
  private val TreeVersion: Byte = 0.toByte
  private val VmFixtureSchema = "e2s.authenticated-v2-jvm-vm-fixture.v2"
  private val AvlFixtureSchema = "e2s.authenticated-spv-tracker-jvm-avl-fixture.v1"
  private val SimplifiedUpcomingMinerPk =
    "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"

  private case class VmBinding(role: String, treeBytes: Array[Byte])

  private object Codecs extends JsonCodecs

  def main(args: Array[String]): Unit = {
    try {
      args.toVector match {
        case Vector("--metadata-only") => println(metadataLine)
        case Vector("--input", inputPath, "--output", outputPath) =>
          compileFile(Paths.get(inputPath), Paths.get(outputPath))
        case Vector("--verify-vm", inputPath, "--output", outputPath) =>
          verifyVmFile(Paths.get(inputPath), Paths.get(outputPath))
        case Vector("--verify-avl-insert", inputPath, "--output", outputPath) =>
          verifyAvlInsertFile(Paths.get(inputPath), Paths.get(outputPath))
        case _ => throw new IllegalArgumentException(
          "expected --metadata-only, --input <records> --output <new-report>, " +
            "--verify-vm <fixture> --output <new-report>, " +
            "or --verify-avl-insert <fixture> --output <new-report>",
        )
      }
    } catch {
      case error: Throwable =>
        val detail = Option(error.getMessage).filter(_.nonEmpty).getOrElse(error.getClass.getSimpleName)
        System.err.println(s"bridge compiler failed: $detail")
        System.exit(1)
    }
  }

  private def compileFile(inputPath: Path, outputPath: Path): Unit = {
    require(Files.isRegularFile(inputPath), "compiler input must be a regular file")
    require(!Files.exists(outputPath), "compiler output must be a new file")
    val records = Files.readAllLines(inputPath, StandardCharsets.UTF_8).asScala.toVector.filter(_.nonEmpty)
    require(records.size == InputRoles.size, s"expected ${InputRoles.size} source records")
    val decoded = records.map(decodeRecord)
    require(decoded.map(_._1) == InputRoles, "source records must use the canonical role order")

    val lines = metadataLine +: decoded.map { case (role, sourceBytes) =>
      val source = new String(sourceBytes, StandardCharsets.UTF_8)
      require(
        Arrays.equals(sourceBytes, source.getBytes(StandardCharsets.UTF_8)),
        s"$role source is not canonical UTF-8",
      )
      val treeBytes = compile(source)
      s"BRIDGE_CONTRACT\t$role\t${sha256(sourceBytes)}\t${hex(treeBytes)}\t${sha256(treeBytes)}"
    }
    Files.write(
      outputPath,
      (lines.mkString("\n") + "\n").getBytes(StandardCharsets.UTF_8),
      StandardOpenOption.CREATE_NEW,
      StandardOpenOption.WRITE,
    )
  }

  private def verifyVmFile(inputPath: Path, outputPath: Path): Unit = {
    require(Files.isRegularFile(inputPath), "VM fixture input must be a regular file")
    require(!Files.exists(outputPath), "VM fixture output must be a new file")
    val fixtureBytes = Files.readAllBytes(inputPath)
    val fixtureSha256 = sha256(fixtureBytes)
    val root = parse(new String(fixtureBytes, StandardCharsets.UTF_8))
      .fold(error => throw new IllegalArgumentException(s"VM fixture is invalid JSON: ${error.message}"), identity)
    val cursor = root.hcursor
    require(required[String](cursor, "schema") == VmFixtureSchema, "VM fixture schema is unsupported")
    val mode = required[String](cursor, "mode")
    require(mode == "tracker" || mode == "settlement", "VM fixture mode is unsupported")
    val contextKind = required[String](cursor, "contextKind")
    require(contextKind == "node-simplified-upcoming", "VM fixture context kind is unsupported")
    val costLimit = required[Long](cursor, "costLimit")
    val initCost = required[Long](cursor, "initCost")
    val activatedScriptVersion = required[Int](cursor, "activatedScriptVersion")
    require(costLimit == 1000000L, "VM fixture cost limit must be 1000000")
    require(initCost == 0L, "VM fixture initial cost must be zero")
    require(activatedScriptVersion == ScriptVersion, "VM fixture activated script version is unsupported")
    val boundaries = cursor.downField("boundaries")
    require(!required[Boolean](boundaries, "nodeStatefulAcceptance"), "VM fixture cannot claim node acceptance")
    require(!required[Boolean](boundaries, "broadcastPerformed"), "VM fixture cannot claim broadcast")
    require(!required[Boolean](boundaries, "gate5Closed"), "VM fixture cannot claim Gate 5 closure")

    val transactionBytes = decodeHex(required[String](cursor, "signedTransactionHex"), "signed transaction")
    val expectedTransactionSha256 = canonicalHex(
      required[String](cursor, "signedTransactionSha256Hex"),
      32,
      "signed transaction SHA-256",
    )
    require(sha256(transactionBytes) == expectedTransactionSha256, "signed transaction SHA-256 mismatch")
    val transaction = ErgoLikeTransactionSerializer.fromBytes(transactionBytes)
    require(
      Arrays.equals(ErgoLikeTransactionSerializer.toBytes(transaction), transactionBytes),
      "signed transaction JVM serialization round trip changed bytes",
    )
    val expectedTransactionId = canonicalHex(
      required[String](cursor, "expectedTransactionIdHex"),
      32,
      "expected transaction ID",
    )
    val expectedUnsignedId = canonicalHex(
      required[String](cursor, "expectedUnsignedIdHex"),
      32,
      "expected unsigned transaction ID",
    )
    val bytesToSignDigest = hex(Blake2b256.hash(transaction.messageToSign))
    require(expectedTransactionId == expectedUnsignedId, "signed and unsigned transaction IDs differ")
    require(transaction.id == expectedTransactionId, "JVM transaction ID differs from sigma-rust")
    require(bytesToSignDigest == expectedUnsignedId, "JVM bytes-to-sign digest differs from sigma-rust")

    val inputBoxes = required[Vector[String]](cursor, "inputBoxesHex")
      .zipWithIndex
      .map { case (value, index) => decodeBox(value, s"input box $index") }
    val dataBoxes = required[Vector[String]](cursor, "dataInputBoxesHex")
      .zipWithIndex
      .map { case (value, index) => decodeBox(value, s"data input box $index") }
    require(inputBoxes.nonEmpty, "VM fixture must contain input boxes")
    require(transaction.inputs.size == inputBoxes.size, "transaction input count differs from fixture boxes")
    require(transaction.dataInputs.size == dataBoxes.size, "transaction data-input count differs from fixture boxes")
    inputBoxes.zipWithIndex.foreach { case (box, index) =>
      require(Arrays.equals(transaction.inputs(index).boxId, box.id), s"input box $index ID mismatch")
    }
    dataBoxes.zipWithIndex.foreach { case (box, index) =>
      require(Arrays.equals(transaction.dataInputs(index).boxId, box.id), s"data input box $index ID mismatch")
    }

    val bindingCursor = cursor.downField("contractBindings")
    val inputBindings = required[Vector[Json]](bindingCursor, "inputs")
      .zipWithIndex
      .map { case (entry, index) => decodeVmBinding(entry, s"input binding $index") }
    val dataInputBindings = required[Vector[Json]](bindingCursor, "dataInputs")
      .zipWithIndex
      .map { case (entry, index) => decodeVmBinding(entry, s"data-input binding $index") }
    require(inputBindings.size == inputBoxes.size, "input binding count differs from fixture boxes")
    require(dataInputBindings.size == dataBoxes.size, "data-input binding count differs from fixture boxes")
    requireModeBindings(mode, inputBindings, dataInputBindings)
    inputBindings.zip(inputBoxes).zipWithIndex.foreach { case ((binding, box), index) =>
      val actual = ErgoTreeSerializer.DefaultSerializer.serializeErgoTree(box.ergoTree)
      require(Arrays.equals(binding.treeBytes, actual), s"input binding $index ErgoTree mismatch")
    }
    dataInputBindings.zip(dataBoxes).zipWithIndex.foreach { case ((binding, box), index) =>
      val actual = ErgoTreeSerializer.DefaultSerializer.serializeErgoTree(box.ergoTree)
      require(Arrays.equals(binding.treeBytes, actual), s"data-input binding $index ErgoTree mismatch")
    }

    val headerEntries = required[Vector[Json]](cursor, "headers")
    require(headerEntries.size == 10, "VM fixture must contain exactly 10 headers")
    val headerRecords = headerEntries.zipWithIndex.map { case (entry, index) =>
      val entryCursor = entry.hcursor
      val expectedId = canonicalHex(
        required[String](entryCursor, "expectedIdHex"),
        32,
        s"header $index expected ID",
      )
      val headerJsonText = required[String](entryCursor, "headerJson")
      val headerJson = parse(headerJsonText)
        .fold(error => throw new IllegalArgumentException(s"header $index JSON is invalid: ${error.message}"), identity)
      val header = decodeJson(headerJson, Codecs.headerDecoder, s"header $index")
      require(hex(header.id.toArray) == expectedId, s"header $index JVM-derived ID mismatch")
      (expectedId, headerJsonText, header)
    }
    val headers = headerRecords.map(_._3)
    headers.sliding(2).zipWithIndex.foreach {
      case (Vector(child, parent), index) =>
        require(
          Arrays.equals(child.parentId.toArray, parent.id.toArray),
          s"header $index does not extend header ${index + 1}",
        )
        require(
          child.height == parent.height + 1,
          s"header $index height is not exactly one above header ${index + 1}",
        )
      case _ =>
    }
    val preHeaderJsonText = required[String](cursor, "preHeaderJson")
    val preHeaderJson = parse(preHeaderJsonText)
      .fold(error => throw new IllegalArgumentException(s"preheader JSON is invalid: ${error.message}"), identity)
    val preHeader = decodeJson(preHeaderJson, Codecs.preHeaderDecoder, "preheader")
    require(Arrays.equals(preHeader.parentId.toArray, headers.head.id.toArray), "preheader does not extend context tip")
    require(preHeader.height == headers.head.height + 1, "preheader height is not one above context tip")
    require(preHeader.version == headers.head.version, "preheader version differs from context tip")
    require(preHeader.timestamp == headers.head.timestamp + 1, "preheader timestamp is not one above context tip")
    require(preHeader.nBits == headers.head.nBits, "preheader nBits differs from context tip")
    val preHeaderCursor = preHeaderJson.hcursor
    require(
      canonicalHex(required[String](preHeaderCursor, "minerPk"), 33, "preheader miner public key") ==
        SimplifiedUpcomingMinerPk,
      "preheader miner public key is not simplifiedUpcoming",
    )
    require(required[String](preHeaderCursor, "votes").isEmpty, "preheader votes are not simplifiedUpcoming")
    val contextSha256 = sha256((Vector(contextKind, preHeaderJsonText) ++ headerRecords.map {
      case (expectedId, headerJsonText, _) => s"$expectedId\t$headerJsonText"
    }).mkString("\n").getBytes(StandardCharsets.UTF_8))
    require(
      contextSha256 == canonicalHex(
        required[String](cursor, "contextSha256Hex"),
        32,
        "context SHA-256",
      ),
      "VM fixture context SHA-256 mismatch",
    )
    val headerIdsSha256 = sha256(
      headerRecords.map(_._1).mkString("\n").getBytes(StandardCharsets.UTF_8),
    )

    val headerColl: Coll[Header] = Colls.fromArray(headers.toArray)
    val lastBlockUtxoRoot = headers.head.stateRoot match {
      case tree: sigma.data.CAvlTree => tree.treeData
      case _ => throw new IllegalArgumentException("context tip state root is not canonical AVL tree data")
    }
    val boxesToSpend = inputBoxes.toIndexedSeq
    val readOnlyBoxes = dataBoxes.toIndexedSeq
    val interpreter = new ErgoLikeInterpreter()
    val inputResults = boxesToSpend.indices.map { inputIndex =>
      val proof = transaction.inputs(inputIndex).spendingProof
      val context = new ErgoLikeContext(
        lastBlockUtxoRoot,
        headerColl,
        preHeader,
        readOnlyBoxes,
        boxesToSpend,
        transaction,
        inputIndex,
        proof.extension,
        ValidationRules.coreSettings,
        costLimit,
        initCost,
        activatedScriptVersion.toByte,
      )
      val proofContext = context
        .withExtension(proof.extension)
        .asInstanceOf[interpreter.CTX]
      val (accepted, cost) = interpreter
        .verify(
          Interpreter.emptyEnv,
          boxesToSpend(inputIndex).ergoTree,
          proofContext,
          proof.proof,
          transaction.messageToSign,
        )
        .get
      require(accepted, s"input $inputIndex JVM proof verification returned false")
      (inputIndex, inputBindings(inputIndex), cost, proof.proof.length)
    }

    val lines = Vector(
      s"BRIDGE_VM_META\t2\t$mode\t${transaction.id}\t$bytesToSignDigest" +
        s"\t$expectedTransactionSha256\t$fixtureSha256\t$contextSha256" +
        s"\t${hex(preHeader.parentId.toArray)}\t${preHeader.height}\t$headerIdsSha256" +
        s"\t${inputResults.size}\t${dataInputBindings.size}\t${headers.size}\troundtrip-ok",
    ) ++ inputResults.map { case (index, binding, cost, proofBytes) =>
      s"BRIDGE_VM_INPUT\t$index\t${binding.role}\t${sha256(binding.treeBytes)}\ttrue\t$cost\t$proofBytes"
    } ++ dataInputBindings.zipWithIndex.map { case (binding, index) =>
      s"BRIDGE_VM_DATA\t$index\t${binding.role}\t${sha256(binding.treeBytes)}"
    }
    Files.write(
      outputPath,
      (lines.mkString("\n") + "\n").getBytes(StandardCharsets.UTF_8),
      StandardOpenOption.CREATE_NEW,
      StandardOpenOption.WRITE,
    )
  }

  private def verifyAvlInsertFile(inputPath: Path, outputPath: Path): Unit = {
    require(Files.isRegularFile(inputPath), "AVL fixture input must be a regular file")
    require(!Files.exists(outputPath), "AVL fixture output must be a new file")
    val fixtureSize = Files.size(inputPath)
    require(fixtureSize > 0L && fixtureSize <= 4L * 1024L * 1024L, "AVL fixture must be between 1 byte and 4 MiB")
    val fixtureBytes = Files.readAllBytes(inputPath)
    require(!fixtureBytes.contains(0.toByte), "AVL fixture must not contain NUL bytes")
    val fixtureText = new String(fixtureBytes, StandardCharsets.UTF_8)
    require(
      Arrays.equals(fixtureBytes, fixtureText.getBytes(StandardCharsets.UTF_8)),
      "AVL fixture must be canonical UTF-8",
    )
    val root = parse(fixtureText)
      .fold(error => throw new IllegalArgumentException(s"AVL fixture is invalid JSON: ${error.message}"), identity)
    requireExactKeys(root, Set("schema", "cases", "boundaries"), "AVL fixture")
    val cursor = root.hcursor
    require(required[String](cursor, "schema") == AvlFixtureSchema, "AVL fixture schema is unsupported")
    val boundariesJson = cursor.downField("boundaries").focus
      .getOrElse(throw new IllegalArgumentException("AVL fixture boundaries are missing"))
    requireExactKeys(
      boundariesJson,
      Set("nodeStatefulAcceptance", "signingPerformed", "submissionPerformed", "broadcastPerformed", "gate5Closed"),
      "AVL fixture boundaries",
    )
    val boundaries = boundariesJson.hcursor
    require(!required[Boolean](boundaries, "nodeStatefulAcceptance"), "AVL fixture cannot claim node acceptance")
    require(!required[Boolean](boundaries, "signingPerformed"), "AVL fixture cannot claim signing")
    require(!required[Boolean](boundaries, "submissionPerformed"), "AVL fixture cannot claim submission")
    require(!required[Boolean](boundaries, "broadcastPerformed"), "AVL fixture cannot claim broadcast")
    require(!required[Boolean](boundaries, "gate5Closed"), "AVL fixture cannot claim Gate 5 closure")

    val caseValues = required[Vector[Json]](cursor, "cases")
    require(caseValues.nonEmpty && caseValues.size <= 64, "AVL fixture must contain between 1 and 64 cases")
    val seenCaseIds = scala.collection.mutable.Set.empty[String]
    val caseLines = caseValues.zipWithIndex.map { case (caseJson, index) =>
      requireExactKeys(
        caseJson,
        Set("caseId", "currentDigestHex", "keyHex", "valueHex", "proofHex"),
        s"AVL fixture case $index",
      )
      val caseCursor = caseJson.hcursor
      val caseId = required[String](caseCursor, "caseId")
      require(caseId.matches("[a-z][a-z0-9-]{2,63}"), s"AVL fixture case $index ID is not canonical")
      require(seenCaseIds.add(caseId), s"AVL fixture case ID $caseId is duplicated")
      val currentDigest = decodeFixedHex(
        required[String](caseCursor, "currentDigestHex"),
        33,
        s"AVL fixture case $caseId current digest",
      )
      val key = decodeFixedHex(required[String](caseCursor, "keyHex"), 32, s"AVL fixture case $caseId key")
      val value = decodeFixedHex(required[String](caseCursor, "valueHex"), 264, s"AVL fixture case $caseId value")
      val proofHex = required[String](caseCursor, "proofHex")
      require(
        proofHex.nonEmpty && proofHex.length <= 2 * 1024 * 1024 && proofHex.length % 2 == 0 && proofHex.matches("[0-9a-f]+"),
        s"AVL fixture case $caseId proof must be 1 to 1048576 bytes of lowercase hex",
      )
      val proof = decodeHex(proofHex, s"AVL fixture case $caseId proof")
      val verifierAttempt = Try(new BatchAVLVerifier[Digest32, Blake2b256.type](
          currentDigest.asInstanceOf[ADDigest],
          proof.asInstanceOf[SerializedAdProof],
          32,
          Some(264),
          Some(1),
          Some(0),
        )(Blake2b256))
      verifierAttempt match {
        case Failure(_) =>
          s"BRIDGE_AVL_CASE\t$index\t$caseId\tfalse\t-\tverifier-construction-rejected"
        case Success(verifier) =>
          Try(verifier.performOneOperation(Insert(
            key.asInstanceOf[ADKey],
            value.asInstanceOf[ADValue],
          ))).flatten match {
            case Failure(_) =>
              s"BRIDGE_AVL_CASE\t$index\t$caseId\tfalse\t-\toperation-rejected"
            case Success(_) =>
              Try(verifier.digest) match {
                case Failure(_) =>
                  s"BRIDGE_AVL_CASE\t$index\t$caseId\tfalse\t-\tdigest-read-rejected"
                case Success(None) =>
                  s"BRIDGE_AVL_CASE\t$index\t$caseId\tfalse\t-\tdigest-missing"
                case Success(Some(digest)) if digest.length != 33 =>
                  s"BRIDGE_AVL_CASE\t$index\t$caseId\tfalse\t-\tdigest-invalid"
                case Success(Some(digest)) =>
                  s"BRIDGE_AVL_CASE\t$index\t$caseId\ttrue\t${hex(digest)}\toperation-accepted"
              }
          }
      }
    }
    val metadata =
      s"BRIDGE_AVL_META\t1\t${sha256(fixtureBytes)}\t${caseLines.size}" +
        s"\t${codeSourceSha256(Class.forName("scorex.crypto.authds.avltree.batch.BatchAVLVerifier"))}" +
        s"\t${runtimeClasspathSha256}" +
        "\tno-node\tno-sign\tno-submit\tno-broadcast\tgate5-open"
    Files.write(
      outputPath,
      ((metadata +: caseLines).mkString("\n") + "\n").getBytes(StandardCharsets.UTF_8),
      StandardOpenOption.CREATE_NEW,
      StandardOpenOption.WRITE,
    )
  }

  private def decodeVmBinding(value: Json, label: String): VmBinding = {
    val cursor = value.hcursor
    val role = required[String](cursor, "role")
    require(InputRoles.contains(role), s"$label role is unsupported")
    VmBinding(role, decodeHex(required[String](cursor, "ergoTreeHex"), s"$label ErgoTree"))
  }

  private def requireModeBindings(
    mode: String,
    inputBindings: Vector[VmBinding],
    dataInputBindings: Vector[VmBinding],
  ): Unit = {
    val inputRoles = inputBindings.map(_.role)
    val dataInputRoles = dataInputBindings.map(_.role)
    if (mode == "tracker") {
      require(inputRoles == Vector("tracker"), "tracker input roles must be exactly tracker")
      require(dataInputRoles.isEmpty, "tracker fixture must not contain data-input roles")
    } else {
      require(
        inputRoles == Vector("duplicatePrevention", "unlock"),
        "settlement input roles must be exactly duplicatePrevention,unlock",
      )
      require(dataInputRoles == Vector("tracker"), "settlement data-input roles must be exactly tracker")
    }
  }

  private def decodeBox(value: String, label: String): ErgoBox = {
    val bytes = decodeHex(value, label)
    val box = ErgoBox.sigmaSerializer.fromBytes(bytes)
    require(Arrays.equals(ErgoBox.sigmaSerializer.toBytes(box), bytes), s"$label JVM serialization round trip changed bytes")
    box
  }

  private def required[T](cursor: io.circe.ACursor, field: String)(implicit decoder: Decoder[T]): T =
    cursor.downField(field).as[T].fold(
      error => throw new IllegalArgumentException(s"VM fixture field $field is invalid: ${error.message}"),
      identity,
    )

  private def decodeJson[T](value: Json, decoder: Decoder[T], label: String): T =
    decoder.decodeJson(value).fold(
      error => throw new IllegalArgumentException(s"$label is invalid: ${error.message}"),
      identity,
    )

  private def decodeHex(value: String, label: String): Array[Byte] = {
    require(value.nonEmpty && value.length % 2 == 0 && value.matches("[0-9a-f]+"), s"$label must be lowercase hex")
    value.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }

  private def canonicalHex(value: String, expectedBytes: Int, label: String): String = {
    require(value.length == expectedBytes * 2 && value.matches("[0-9a-f]+"), s"$label must be canonical lowercase hex")
    value
  }

  private def decodeFixedHex(value: String, expectedBytes: Int, label: String): Array[Byte] = {
    canonicalHex(value, expectedBytes, label)
    decodeHex(value, label)
  }

  private def requireExactKeys(value: Json, expected: Set[String], label: String): Unit = {
    val actual = value.asObject
      .getOrElse(throw new IllegalArgumentException(s"$label must be an object"))
      .keys
      .toSet
    require(actual == expected, s"$label fields are not exact")
  }

  private def metadataLine: String =
    s"BRIDGE_COMPILER_META\t$NetworkPrefix\t$ScriptVersion\t$TreeVersion" +
      s"\t${scala.util.Properties.versionNumberString}" +
      s"\t${System.getProperty("java.specification.version")}" +
      s"\t${codeSourceSha256(classOf[SigmaCompiler])}" +
      s"\t${runtimeClasspathSha256}" +
      s"\t${directorySha256(Paths.get(System.getProperty("java.home")))}" +
      s"\t${InputRoles.mkString(",")}"

  private def decodeRecord(line: String): (String, Array[Byte]) = {
    val fields = line.split("\\t", -1)
    require(fields.length == 2, "source record must contain role and base64 source")
    require(InputRoles.contains(fields(0)), s"unsupported source role: ${fields(0)}")
    val bytes = Try(Base64.getDecoder.decode(fields(1))).getOrElse {
      throw new IllegalArgumentException(s"${fields(0)} source is not canonical base64")
    }
    require(Base64.getEncoder.encodeToString(bytes) == fields(1), s"${fields(0)} source is not canonical base64")
    fields(0) -> bytes
  }

  private def compile(source: String): Array[Byte] = {
    VersionContext.withVersions(ScriptVersion, TreeVersion) {
      val compiler = new SigmaCompiler(NetworkPrefix)
      val header = ErgoTree.defaultHeaderWithVersion(TreeVersion)
      val tree = Try(compiler.compile(Map.empty, source)(new CompiletimeIRContext)).flatMap {
        case CompilerResult(_, _, _, script: Value[SSigmaProp.type @unchecked])
            if script.tpe == SSigmaProp =>
          Success(ErgoTree.fromProposition(header, script))
        case CompilerResult(_, _, _, script: Value[SBoolean.type @unchecked])
            if script.tpe == SBoolean =>
          Success(ErgoTree.fromProposition(header, script.toSigmaProp))
        case other =>
          Failure(new IllegalArgumentException(
            s"compiled source has type ${other.buildTree.tpe}; expected SigmaProp or Boolean",
          ))
      }.get
      ErgoTreeSerializer.DefaultSerializer.serializeErgoTree(tree)
    }
  }

  private def codeSourceSha256(clazz: Class[_]): String = {
    val location = Option(clazz.getProtectionDomain)
      .flatMap(domain => Option(domain.getCodeSource))
      .flatMap(source => Option(source.getLocation))
      .getOrElse(throw new IllegalStateException("Sigma compiler code source is unavailable"))
    val path = Paths.get(location.toURI)
    require(Files.isRegularFile(path), "Sigma compiler code source must be a regular artifact")
    sha256(Files.readAllBytes(path))
  }

  private def runtimeClasspathSha256: String = {
    val records = System.getProperty("java.class.path")
      .split(java.util.regex.Pattern.quote(File.pathSeparator))
      .toVector
      .filter(_.nonEmpty)
      .zipWithIndex
      .map { case (entry, index) =>
        val path = Paths.get(entry)
        if (Files.isRegularFile(path)) {
          s"$index\tfile\t${path.getFileName}\t${sha256(Files.readAllBytes(path))}"
        } else if (Files.isDirectory(path)) {
          s"$index\tdir\t${path.getFileName}\t${directorySha256(path)}"
        } else {
          throw new IllegalStateException("runtime classpath contains a non-file entry")
        }
      }
    sha256(records.mkString("\n").getBytes(StandardCharsets.UTF_8))
  }

  private def directorySha256(root: Path): String = {
    require(Files.isDirectory(root), "hashed runtime directory is missing")
    val stream = Files.walk(root)
    val records = try {
      stream.iterator().asScala
        .filter(path => path != root)
        .map(path => {
          require(!Files.isSymbolicLink(path), "hashed runtime directory must not contain symbolic links")
          require(Files.isDirectory(path) || Files.isRegularFile(path), "hashed runtime directory contains an unsupported entry")
          path
        })
        .filter(path => Files.isRegularFile(path))
        .map(path => {
          val relative = root.relativize(path).toString.replace('\\', '/')
          s"$relative:${sha256(Files.readAllBytes(path))}"
        })
        .toVector
        .sorted
    } finally stream.close()
    require(records.nonEmpty, "hashed runtime directory must contain regular files")
    sha256(records.mkString("\n").getBytes(StandardCharsets.UTF_8))
  }

  private def sha256(bytes: Array[Byte]): String =
    hex(MessageDigest.getInstance("SHA-256").digest(bytes))

  private def hex(bytes: Array[Byte]): String =
    bytes.map(byte => f"${byte & 0xff}%02x").mkString
}
