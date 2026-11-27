package org.ergoplatform.bridge.v1;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import org.ergoplatform.ErgoBox;
import org.ergoplatform.ErgoLikeContext;
import org.ergoplatform.ErgoLikeInterpreter;
import org.ergoplatform.ErgoLikeTransaction;
import org.ergoplatform.ErgoLikeTransactionSerializer$;
import org.ergoplatform.Input;

import scala.Tuple2;
import scala.collection.JavaConverters$;
import scala.collection.immutable.Map$;
import scala.reflect.ClassTag$;
import scala.runtime.AbstractFunction0;
import scala.util.Try;
import scorex.crypto.hash.Blake2b256;
import sigma.Coll;
import sigma.CollBuilder;
import sigma.VersionContext;
import sigma.ast.ErgoTree;
import sigma.ast.SBoolean$;
import sigma.ast.SSigmaProp$;
import sigma.ast.Value;
import sigma.compiler.CompilerResult;
import sigma.compiler.SigmaCompiler;
import sigma.compiler.ir.CompiletimeIRContext;
import sigma.data.AvlTreeData;
import sigma.data.CSigmaDslBuilder$;
import sigma.data.RType$;
import sigma.interpreter.ContextExtension;
import sigma.serialization.ErgoTreeSerializer;
import sigma.serialization.SigmaSerializer;
import sigma.validation.ValidationRules$;
import sigmastate.eval.CPreHeader;
import sigmastate.interpreter.Interpreter;

/**
 * SigmaState 6.0.2 JVM Compiler and Transaction Verifier CLI for Bridge V1.
 *
 * Commands:
 *   compile-batch <networkPrefix> <file1> [file2 ...]
 *     Compiles each .es source file with scriptVersion=3, treeVersion=0 and
 *     emits one JSON line per file.
 *
 *   verify-batch <batchRequestFile>
 *     Evaluates one or more transactions in a single JVM invocation.
 *     Each line in <batchRequestFile> has tab-separated fields:
 *       <id>\t<height>\t<txHex>\t<inputBoxHex1,inputBoxHex2,...>\t<dataBoxHex1,... or empty>
 *     Emits one JSON line per case with txId, messageToSignHex, per-input
 *     boolean verdict, JIT cost, and error message.
 */
public final class BridgeJvmTool {
  private static final byte SCRIPT_VERSION = 3;
  private static final byte TREE_VERSION = 0;
  private static final long COST_LIMIT = 1_000_000L;

  private BridgeJvmTool() {}

  public static void main(String[] args) {
    try {
      if (args.length < 2) {
        throw new IllegalArgumentException(
            "usage: BridgeJvmTool compile-batch <networkPrefix> <files...> | verify-batch <batchFile>");
      }
      String cmd = args[0];
      if ("compile-batch".equals(cmd)) {
        byte networkPrefix = Byte.parseByte(args[1]);
        if (args.length < 3) {
          throw new IllegalArgumentException("compile-batch requires at least one source file");
        }
        for (int i = 2; i < args.length; i++) {
          compileOne(networkPrefix, Paths.get(args[i]));
        }
      } else if ("verify-batch".equals(cmd)) {
        verifyBatch(Paths.get(args[1]));
      } else {
        throw new IllegalArgumentException("unknown command: " + cmd);
      }
    } catch (Throwable error) {
      String msg = error.getMessage() != null ? error.getMessage() : error.getClass().getName();
      System.err.println("BridgeJvmTool ERROR: " + msg);
      System.exit(1);
    }
  }

  private static void compileOne(byte networkPrefix, Path path) {
    try {
      String source = Files.readString(path, StandardCharsets.UTF_8).replace("\r\n", "\n");
      byte[] treeBytes = compileSource(networkPrefix, source);
      String treeHex = hex(treeBytes);
      String contractId = hex(Blake2b256.hash(treeBytes));
      String sha256 = hex(MessageDigest.getInstance("SHA-256").digest(treeBytes));
      System.out.println(
          "{\"ok\":true"
              + ",\"file\":" + jsonStr(path.toString())
              + ",\"ergoTreeHex\":" + jsonStr(treeHex)
              + ",\"contractIdHex\":" + jsonStr(contractId)
              + ",\"sha256Hex\":" + jsonStr(sha256)
              + ",\"byteLength\":" + treeBytes.length
              + "}");
    } catch (Throwable error) {
      String msg = error.getMessage() != null ? error.getMessage() : error.getClass().getName();
      System.out.println(
          "{\"ok\":false"
              + ",\"file\":" + jsonStr(path.toString())
              + ",\"error\":" + jsonStr(msg)
              + "}");
    }
  }

  @SuppressWarnings({"unchecked", "rawtypes"})
  private static byte[] compileSource(byte networkPrefix, String source) {
    return VersionContext.withVersions(
        SCRIPT_VERSION,
        TREE_VERSION,
        new AbstractFunction0<byte[]>() {
          @Override
          public byte[] apply() {
            SigmaCompiler compiler = new SigmaCompiler(networkPrefix);
            CompilerResult<?> result =
                compiler.compile(Map$.MODULE$.empty(), source, new CompiletimeIRContext());
            Value<?> script = result.buildTree();
            Value<SSigmaProp$> proposition;
            if (script.tpe().equals(SSigmaProp$.MODULE$)) {
              proposition = (Value<SSigmaProp$>) (Value) script;
            } else if (script.tpe().equals(SBoolean$.MODULE$)) {
              proposition = script.toSigmaProp();
            } else {
              throw new IllegalArgumentException(
                  "compiled source must return SigmaProp or Boolean");
            }
            ErgoTree tree =
                ErgoTree.fromProposition(
                    ErgoTree.defaultHeaderWithVersion(TREE_VERSION), proposition);
            byte[] bytes = ErgoTreeSerializer.DefaultSerializer().serializeErgoTree(tree);
            ErgoTree roundTrip = ErgoTreeSerializer.DefaultSerializer().deserializeErgoTree(bytes);
            if (roundTrip.version() != TREE_VERSION
                || !Arrays.equals(
                    ErgoTreeSerializer.DefaultSerializer().serializeErgoTree(roundTrip), bytes)) {
              throw new IllegalStateException("ErgoTree round-trip mismatch");
            }
            return bytes;
          }
        });
  }

  private static void verifyBatch(Path batchFile) throws Exception {
    List<String> lines = Files.readAllLines(batchFile, StandardCharsets.UTF_8);
    ErgoLikeInterpreter interpreter = new ErgoLikeInterpreter();
    SigmaSerializer<ErgoBox, ErgoBox> boxSerializer = ErgoBox.sigmaSerializer$.MODULE$;

    for (String line : lines) {
      if (line.isBlank()) continue;
      String[] fields = line.split("\t", -1);
      if (fields.length < 5) {
        System.out.println("{\"id\":\"unknown\",\"ok\":false,\"error\":\"expected 5 tab fields\"}");
        continue;
      }
      String id = fields[0];
      try {
        int height = Integer.parseInt(fields[1]);
        byte[] txBytes = decodeHex(fields[2]);
        ErgoLikeTransaction tx = ErgoLikeTransactionSerializer$.MODULE$.fromBytes(txBytes);

        List<ErgoBox> inputBoxes = parseBoxList(fields[3], boxSerializer);
        List<ErgoBox> dataBoxes = parseBoxList(fields[4], boxSerializer);

        if (inputBoxes.size() != tx.inputs().size()) {
          throw new IllegalArgumentException(
              "input box count (" + inputBoxes.size() + ") != tx inputs (" + tx.inputs().size() + ")");
        }
        if (dataBoxes.size() != tx.dataInputs().size()) {
          throw new IllegalArgumentException(
              "data box count (" + dataBoxes.size() + ") != tx dataInputs (" + tx.dataInputs().size() + ")");
        }
        for (int i = 0; i < inputBoxes.size(); i++) {
          if (!Arrays.equals(tx.inputs().apply(i).boxId(), inputBoxes.get(i).id())) {
            throw new IllegalArgumentException("input box id mismatch at index " + i);
          }
        }
        for (int i = 0; i < dataBoxes.size(); i++) {
          if (!Arrays.equals(tx.dataInputs().apply(i).boxId(), dataBoxes.get(i).id())) {
            throw new IllegalArgumentException("data input box id mismatch at index " + i);
          }
        }

        byte[] messageToSign = tx.messageToSign();
        boolean allPassed = true;
        long totalCost = 0L;
        StringBuilder inputsJson = new StringBuilder("[");
        for (int i = 0; i < inputBoxes.size(); i++) {
          if (i > 0) inputsJson.append(',');
          Input input = tx.inputs().apply(i);
          ErgoLikeContext ctx =
              buildContext(tx, inputBoxes, dataBoxes, i, input.extension(), height);
          boolean passed = false;
          long cost = 0L;
          String inputError = null;
          try {
            Try<Tuple2<Object, Object>> res =
                interpreter.verify(
                    Interpreter.emptyEnv(),
                    inputBoxes.get(i).ergoTree(),
                    ctx,
                    input.spendingProof().proof(),
                    messageToSign);
            if (res.isSuccess()) {
              Tuple2<Object, Object> pair = res.get();
              passed = (Boolean) pair._1();
              cost = ((Number) pair._2()).longValue();
              totalCost += cost;
            } else {
              Throwable cause = res.failed().get();
              inputError =
                  cause.getMessage() != null ? cause.getMessage() : cause.getClass().getName();
            }
          } catch (Throwable err) {
            inputError = err.getMessage() != null ? err.getMessage() : err.getClass().getName();
          }
          if (!passed) allPassed = false;
          inputsJson
              .append("{\"index\":")
              .append(i)
              .append(",\"passed\":")
              .append(passed)
              .append(",\"cost\":")
              .append(cost)
              .append(",\"error\":")
              .append(inputError == null ? "null" : jsonStr(inputError))
              .append('}');
        }
        inputsJson.append(']');
        if (totalCost > COST_LIMIT) {
          allPassed = false;
        }

        System.out.println(
            "{\"id\":" + jsonStr(id)
                + ",\"ok\":true"
                + ",\"txId\":" + jsonStr(tx.id())
                + ",\"messageToSignHex\":" + jsonStr(hex(messageToSign))
                + ",\"totalCost\":" + totalCost
                + ",\"allPassed\":" + allPassed
                + ",\"inputs\":" + inputsJson
                + "}");
      } catch (Throwable error) {
        String msg = error.getMessage() != null ? error.getMessage() : error.getClass().getName();
        System.out.println(
            "{\"id\":" + jsonStr(id)
                + ",\"ok\":false"
                + ",\"allPassed\":false"
                + ",\"error\":" + jsonStr(msg)
                + "}");
      }
    }
  }

  private static List<ErgoBox> parseBoxList(
      String csv, SigmaSerializer<ErgoBox, ErgoBox> boxSerializer) {
    List<ErgoBox> list = new ArrayList<>();
    if (csv == null || csv.isEmpty()) return list;
    for (String hexItem : csv.split(",")) {
      if (hexItem.isEmpty()) continue;
      list.add(boxSerializer.fromBytes(decodeHex(hexItem)));
    }
    return list;
  }

  private static ErgoLikeContext buildContext(
      ErgoLikeTransaction tx,
      List<ErgoBox> inputBoxes,
      List<ErgoBox> dataBoxes,
      int selfIndex,
      ContextExtension extension,
      int height) {
    CollBuilder collBuilder = CSigmaDslBuilder$.MODULE$.Colls();
    Coll<Object> parentId = collBuilder.fromArray(new byte[32], byteType());
    Coll<Object> votes = collBuilder.fromArray(new byte[3], byteType());
    CPreHeader preHeader =
        new CPreHeader(
            (byte) 0,
            parentId,
            0L,
            0L,
            height,
            CSigmaDslBuilder$.MODULE$.groupGenerator(),
            votes);
    Coll<sigma.Header> headers =
        collBuilder.emptyColl(
            RType$.MODULE$.fromClassTag(ClassTag$.MODULE$.apply(sigma.Header.class)));
    scala.collection.immutable.IndexedSeq<ErgoBox> boxesToSpend =
        JavaConverters$.MODULE$.asScalaBuffer(inputBoxes).toIndexedSeq();
    scala.collection.immutable.IndexedSeq<ErgoBox> readOnlyBoxes =
        JavaConverters$.MODULE$.asScalaBuffer(dataBoxes).toIndexedSeq();
    return new ErgoLikeContext(
        AvlTreeData.dummy(),
        headers,
        preHeader,
        readOnlyBoxes,
        boxesToSpend,
        tx,
        selfIndex,
        extension,
        ValidationRules$.MODULE$.coreSettings(),
        COST_LIMIT,
        0L,
        SCRIPT_VERSION);
  }

  @SuppressWarnings("unchecked")
  private static sigma.data.RType<Object> byteType() {
    return (sigma.data.RType<Object>)
        (sigma.data.RType<?>) RType$.MODULE$.fromClassTag(ClassTag$.MODULE$.Byte());
  }

  private static byte[] decodeHex(String s) {
    if (s.length() % 2 != 0) throw new IllegalArgumentException("odd hex length");
    byte[] out = new byte[s.length() / 2];
    for (int i = 0; i < out.length; i++) {
      out[i] = (byte) Integer.parseInt(s.substring(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  private static String hex(byte[] bytes) {
    StringBuilder sb = new StringBuilder(bytes.length * 2);
    for (byte b : bytes) sb.append(String.format(Locale.ROOT, "%02x", b & 0xff));
    return sb.toString();
  }

  private static String jsonStr(String s) {
    StringBuilder sb = new StringBuilder("\"");
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      if (c == '\\') sb.append("\\\\");
      else if (c == '"') sb.append("\\\"");
      else if (c == '\n') sb.append("\\n");
      else if (c == '\r') sb.append("\\r");
      else if (c == '\t') sb.append("\\t");
      else if (c < 0x20) sb.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
      else sb.append(c);
    }
    sb.append('"');
    return sb.toString();
  }
}
