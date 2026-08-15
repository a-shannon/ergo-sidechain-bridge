package org.ergoplatform.bridge.tools;

import java.io.File;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import scorex.crypto.hash.Blake2b256;
import scala.collection.immutable.Map$;
import scala.runtime.AbstractFunction0;
import sigma.VersionContext;
import sigma.ast.ErgoTree;
import sigma.ast.SBoolean$;
import sigma.ast.SSigmaProp$;
import sigma.ast.Value;
import sigma.compiler.CompilerResult;
import sigma.compiler.SigmaCompiler;
import sigma.compiler.ir.CompiletimeIRContext;
import sigma.serialization.ErgoTreeSerializer;

/** Resolver-free JVM compiler for process-owned federated contract requests. */
public final class ExactFederatedTrackerCompiler {
  private static final String INPUT_PREFIX = "BRIDGE_FED_TRACKER_REQUEST";
  private static final String META_PREFIX = "BRIDGE_FED_TRACKER_META";
  private static final String CONTRACT_PREFIX = "BRIDGE_FED_TRACKER_CONTRACT";
  private static final String FAMILY_INPUT_PREFIX = "BRIDGE_FED_FAMILY_REQUEST";
  private static final String FAMILY_META_PREFIX = "BRIDGE_FED_FAMILY_META";
  private static final String FAMILY_CONTRACT_PREFIX = "BRIDGE_FED_FAMILY_CONTRACT";
  private static final String DUP_CONTRACT_ID_PLACEHOLDER =
      "POOLED_RESERVE_DUP_CONTRACT_ID_PLACEHOLDER";
  private static final String SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER =
      "POOLED_RESERVE_SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER";
  private static final int MAX_INPUT_BYTES = 1024 * 1024;
  private static final int MAX_SOURCE_BYTES = 512 * 1024;
  private static final int MAX_PROPOSITION_BYTES = 4095;
  private static final byte NETWORK_PREFIX = 16;
  private static final byte SCRIPT_VERSION = 3;
  private static final byte TREE_VERSION = 0;
  private static final Pattern SHA256_HEX = Pattern.compile("[0-9a-f]{64}");
  private static final Pattern UNRESOLVED_PLACEHOLDER =
      Pattern.compile("[A-Z][A-Z0-9_]+_PLACEHOLDERS?");

  private ExactFederatedTrackerCompiler() {}

  public static void main(String[] args) {
    try {
      if (args.length != 4 || !"--input".equals(args[0]) || !"--output".equals(args[2])) {
        throw new IllegalArgumentException(
            "expected --input <request-record> --output <new-report>");
      }
      compileFile(Paths.get(args[1]), Paths.get(args[3]));
    } catch (Throwable error) {
      String detail = error.getMessage();
      if (detail == null || detail.isEmpty()) detail = error.getClass().getSimpleName();
      System.err.println("federated JVM compiler failed: " + detail);
      System.exit(1);
    }
  }

  private static void compileFile(Path inputPath, Path outputPath) throws Exception {
    requireRegularFile(inputPath, "compiler input");
    if (Files.exists(outputPath)) {
      throw new IllegalArgumentException("compiler output must be a new file");
    }
    byte[] inputBytes = Files.readAllBytes(inputPath);
    if (inputBytes.length == 0 || inputBytes.length > MAX_INPUT_BYTES) {
      throw new IllegalArgumentException("compiler input size is outside the supported bound");
    }
    String input = canonicalUtf8(inputBytes, "compiler input");
    if (input.indexOf('\0') >= 0 || input.indexOf('\r') >= 0 || !input.endsWith("\n")) {
      throw new IllegalArgumentException("compiler input must be NUL-free LF-only text");
    }
    String body = input.substring(0, input.length() - 1);
    if (body.indexOf('\n') >= 0) {
      throw new IllegalArgumentException("compiler input must contain exactly one record");
    }
    String[] fields = body.split("\\t", -1);
    if (fields.length == 5
        && INPUT_PREFIX.equals(fields[0])
        && "1".equals(fields[1])) {
      compileTracker(fields, outputPath);
      return;
    }
    if (fields.length == 9
        && FAMILY_INPUT_PREFIX.equals(fields[0])
        && "1".equals(fields[1])) {
      compileFamily(fields, outputPath);
      return;
    }
    throw new IllegalArgumentException("compiler input record is not canonical");
  }

  private static void compileTracker(String[] fields, Path outputPath) throws Exception {
    String requestDigest = canonicalSha256(fields[2], "request digest");
    SourceUnit source = decodeSource(fields[3], fields[4], "resolved tracker source");
    writeOutput(
        outputPath,
        META_PREFIX,
        CONTRACT_PREFIX,
        requestDigest,
        List.of(compileUnit("tracker", source)));
  }

  private static void compileFamily(String[] fields, Path outputPath) throws Exception {
    String requestDigest = canonicalSha256(fields[2], "family request digest");
    CompiledUnit duplicatePrevention = compileUnit(
        "duplicatePrevention",
        decodeSource(fields[3], fields[4], "duplicate-prevention source"));
    CompiledUnit sourceLock = compileUnit(
        "sourceLock",
        decodeSource(fields[5], fields[6], "source-lock source"));
    SourceUnit reserveTemplate = decodeSource(
        fields[7], fields[8], "pooled-reserve source template");
    String reserveSource = replaceExactlyOnce(
        reserveTemplate.source,
        DUP_CONTRACT_ID_PLACEHOLDER,
        duplicatePrevention.contractId,
        "pooled-reserve duplicate-prevention contract ID");
    reserveSource = replaceExactlyOnce(
        reserveSource,
        SOURCE_LOCK_CONTRACT_ID_PLACEHOLDER,
        sourceLock.contractId,
        "pooled-reserve source-lock contract ID");
    if (UNRESOLVED_PLACEHOLDER.matcher(reserveSource).find()) {
      throw new IllegalArgumentException(
          "pooled-reserve source retains an unresolved placeholder");
    }
    SourceUnit pooledReserveSource = sourceUnit(
        reserveSource.getBytes(StandardCharsets.UTF_8),
        "pooled-reserve resolved source");
    CompiledUnit pooledReserve = compileUnit("pooledReserve", pooledReserveSource);
    writeOutput(
        outputPath,
        FAMILY_META_PREFIX,
        FAMILY_CONTRACT_PREFIX,
        requestDigest,
        List.of(duplicatePrevention, sourceLock, pooledReserve));
  }

  private static SourceUnit decodeSource(
      String sourceSha256Input,
      String encodedSource,
      String label) throws Exception {
    String sourceSha256 = canonicalSha256(sourceSha256Input, label + " digest");
    byte[] sourceBytes;
    try {
      sourceBytes = Base64.getDecoder().decode(encodedSource);
    } catch (IllegalArgumentException error) {
      throw new IllegalArgumentException(label + " is not canonical base64");
    }
    if (!Base64.getEncoder().encodeToString(sourceBytes).equals(encodedSource)) {
      throw new IllegalArgumentException(label + " is not canonical base64");
    }
    SourceUnit source = sourceUnit(sourceBytes, label);
    if (!source.sourceSha256.equals(sourceSha256)) {
      throw new IllegalArgumentException(label + " digest does not match its bytes");
    }
    return source;
  }

  private static SourceUnit sourceUnit(byte[] sourceBytes, String label) throws Exception {
    if (sourceBytes.length == 0 || sourceBytes.length > MAX_SOURCE_BYTES) {
      throw new IllegalArgumentException(label + " size is outside the supported bound");
    }
    String source = canonicalUtf8(sourceBytes, label);
    if (source.indexOf('\0') >= 0 || source.indexOf('\r') >= 0) {
      throw new IllegalArgumentException(label + " must be NUL-free LF-only text");
    }
    return new SourceUnit(sha256(sourceBytes), source);
  }

  private static String replaceExactlyOnce(
      String source,
      String placeholder,
      String replacement,
      String label) {
    canonicalSha256(replacement, label);
    int index = source.indexOf(placeholder);
    if (index < 0 || index != source.lastIndexOf(placeholder)) {
      throw new IllegalArgumentException(label + " placeholder cardinality is invalid");
    }
    return source.substring(0, index)
        + replacement
        + source.substring(index + placeholder.length());
  }

  private static CompiledUnit compileUnit(String role, SourceUnit source)
      throws Exception {
    byte[] proposition = compile(source.source);
    if (proposition.length == 0 || proposition.length > MAX_PROPOSITION_BYTES) {
      throw new IllegalArgumentException(
          role + " compiled proposition size is outside the supported bound");
    }
    return new CompiledUnit(
        role,
        source.sourceSha256,
        proposition,
        sha256(proposition),
        hex(Blake2b256.hash(proposition)));
  }

  private static void writeOutput(
      Path outputPath,
      String metadataPrefix,
      String contractPrefix,
      String requestDigest,
      List<CompiledUnit> contracts) throws Exception {
    List<Path> classpath = runtimeClasspath();
    String toolClassesSha256 = directorySha256(classpath.get(0));
    String dependencyClasspathSha256 = dependencyClasspathSha256(classpath.subList(1, classpath.size()));
    String sigmaStateArtifactSha256 = codeSourceSha256(SigmaCompiler.class);
    String javaHomeSha256 = directorySha256(Paths.get(System.getProperty("java.home")));
    String metadata = String.join("\t",
        metadataPrefix,
        "1",
        Byte.toString(NETWORK_PREFIX),
        Byte.toString(SCRIPT_VERSION),
        Byte.toString(TREE_VERSION),
        System.getProperty("java.specification.version"),
        scala.util.Properties.versionNumberString(),
        sigmaStateArtifactSha256,
        dependencyClasspathSha256,
        javaHomeSha256,
        toolClassesSha256,
        requestDigest);
    List<String> records = new ArrayList<>();
    records.add(metadata);
    for (CompiledUnit contract : contracts) {
      records.add(String.join("\t",
          contractPrefix,
          contract.role,
          contract.sourceSha256,
          Integer.toString(contract.proposition.length),
          hex(contract.proposition),
          contract.propositionSha256,
          contract.contractId));
    }
    byte[] output = (String.join("\n", records) + "\n")
        .getBytes(StandardCharsets.UTF_8);
    Files.write(outputPath, output, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
  }

  private static final class SourceUnit {
    private final String sourceSha256;
    private final String source;

    private SourceUnit(String sourceSha256, String source) {
      this.sourceSha256 = sourceSha256;
      this.source = source;
    }
  }

  private static final class CompiledUnit {
    private final String role;
    private final String sourceSha256;
    private final byte[] proposition;
    private final String propositionSha256;
    private final String contractId;

    private CompiledUnit(
        String role,
        String sourceSha256,
        byte[] proposition,
        String propositionSha256,
        String contractId) {
      this.role = role;
      this.sourceSha256 = sourceSha256;
      this.proposition = proposition;
      this.propositionSha256 = propositionSha256;
      this.contractId = contractId;
    }
  }

  @SuppressWarnings({"unchecked", "rawtypes"})
  private static byte[] compile(String source) {
    return VersionContext.withVersions(
        SCRIPT_VERSION,
        TREE_VERSION,
        new AbstractFunction0<byte[]>() {
          @Override
          public byte[] apply() {
            SigmaCompiler compiler = new SigmaCompiler(NETWORK_PREFIX);
            CompilerResult<?> result = compiler.compile(
                Map$.MODULE$.empty(), source, new CompiletimeIRContext());
            Value<?> script = result.buildTree();
            Value<SSigmaProp$> proposition;
            if (script.tpe().equals(SSigmaProp$.MODULE$)) {
              proposition = (Value<SSigmaProp$>) (Value) script;
            } else if (script.tpe().equals(SBoolean$.MODULE$)) {
              proposition = script.toSigmaProp();
            } else {
              throw new IllegalArgumentException(
                  "compiled source must have SigmaProp or Boolean type");
            }
            ErgoTree tree = ErgoTree.fromProposition(
                ErgoTree.defaultHeaderWithVersion(TREE_VERSION), proposition);
            byte[] bytes = ErgoTreeSerializer.DefaultSerializer().serializeErgoTree(tree);
            ErgoTree parsed = ErgoTreeSerializer.DefaultSerializer().deserializeErgoTree(bytes);
            if (parsed.version() != TREE_VERSION
                || !Arrays.equals(
                    ErgoTreeSerializer.DefaultSerializer().serializeErgoTree(parsed), bytes)) {
              throw new IllegalArgumentException(
                  "compiled proposition failed its JVM serialization round trip");
            }
            return bytes;
          }
        });
  }

  private static List<Path> runtimeClasspath() {
    String raw = System.getProperty("java.class.path");
    String[] entries = raw.split(Pattern.quote(File.pathSeparator), -1);
    List<Path> paths = new ArrayList<>();
    for (String entry : entries) {
      if (entry.isEmpty()) {
        throw new IllegalArgumentException("runtime classpath contains an empty entry");
      }
      Path path = Paths.get(entry).toAbsolutePath().normalize();
      if (!Files.isRegularFile(path) && !Files.isDirectory(path)) {
        throw new IllegalArgumentException("runtime classpath contains an unsupported entry");
      }
      if (Files.isSymbolicLink(path)) {
        throw new IllegalArgumentException("runtime classpath contains a symbolic link");
      }
      paths.add(path);
    }
    if (paths.size() < 2 || !Files.isDirectory(paths.get(0))) {
      throw new IllegalArgumentException("runtime classpath is incomplete");
    }
    return paths;
  }

  private static String dependencyClasspathSha256(List<Path> paths) throws Exception {
    List<String> records = new ArrayList<>();
    for (int index = 0; index < paths.size(); index++) {
      Path path = paths.get(index);
      if (!Files.isRegularFile(path)) {
        throw new IllegalArgumentException("runtime dependency must be a regular file");
      }
      records.add(index + "\tfile\t" + path.getFileName() + "\t" + sha256(Files.readAllBytes(path)));
    }
    return sha256(String.join("\n", records).getBytes(StandardCharsets.UTF_8));
  }

  private static String codeSourceSha256(Class<?> clazz) throws Exception {
    URI location = clazz.getProtectionDomain().getCodeSource().getLocation().toURI();
    Path path = Paths.get(location).toAbsolutePath().normalize();
    requireRegularFile(path, "Sigma compiler code source");
    return sha256(Files.readAllBytes(path));
  }

  private static void requireRegularFile(Path path, String label) {
    if (!Files.isRegularFile(path) || Files.isSymbolicLink(path)) {
      throw new IllegalArgumentException(label + " must be a real regular file");
    }
  }

  private static String canonicalUtf8(byte[] bytes, String label)
      throws CharacterCodingException {
    String decoded = StandardCharsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
        .decode(ByteBuffer.wrap(bytes))
        .toString();
    if (!Arrays.equals(bytes, decoded.getBytes(StandardCharsets.UTF_8))) {
      throw new IllegalArgumentException(label + " is not canonical UTF-8");
    }
    return decoded;
  }

  private static String canonicalSha256(String value, String label) {
    if (!SHA256_HEX.matcher(value).matches()) {
      throw new IllegalArgumentException(label + " must be lowercase SHA-256 hex");
    }
    return value;
  }

  private static String directorySha256(Path root) throws Exception {
    if (!Files.isDirectory(root) || Files.isSymbolicLink(root)) {
      throw new IllegalArgumentException("hashed runtime directory must be a real directory");
    }
    List<String> records = new ArrayList<>();
    try (Stream<Path> stream = Files.walk(root)) {
      stream.filter(path -> !path.equals(root))
          .sorted(Comparator.comparing(path -> root.relativize(path).toString()))
          .forEach(path -> {
            try {
              if (Files.isSymbolicLink(path)) {
                throw new IllegalArgumentException(
                    "hashed runtime directory must not contain symbolic links");
              }
              if (Files.isRegularFile(path)) {
                String relative = root.relativize(path).toString().replace('\\', '/');
                records.add(relative + ":" + sha256(Files.readAllBytes(path)));
              } else if (!Files.isDirectory(path)) {
                throw new IllegalArgumentException(
                    "hashed runtime directory contains an unsupported entry");
              }
            } catch (RuntimeException error) {
              throw error;
            } catch (Exception error) {
              throw new IllegalStateException(error);
            }
          });
    }
    if (records.isEmpty()) {
      throw new IllegalArgumentException("hashed runtime directory must contain regular files");
    }
    records.sort(String::compareTo);
    return sha256(String.join("\n", records).getBytes(StandardCharsets.UTF_8));
  }

  private static String sha256(byte[] bytes) throws Exception {
    return hex(MessageDigest.getInstance("SHA-256").digest(bytes));
  }

  private static String hex(byte[] bytes) {
    StringBuilder result = new StringBuilder(bytes.length * 2);
    for (byte value : bytes) result.append(String.format("%02x", value & 0xff));
    return result.toString();
  }
}
