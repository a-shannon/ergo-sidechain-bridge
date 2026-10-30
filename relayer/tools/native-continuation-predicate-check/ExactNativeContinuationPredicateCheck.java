import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import org.ergoplatform.ErgoBox;
import org.ergoplatform.ErgoLikeContext;
import org.ergoplatform.ErgoLikeInterpreter;
import org.ergoplatform.ErgoLikeTransaction;
import org.ergoplatform.ErgoLikeTransactionSerializer$;
import org.ergoplatform.Input;

import scala.Tuple2;
import scala.collection.JavaConverters$;
import scala.reflect.ClassTag$;
import scala.util.Try;
import sigma.Coll;
import sigma.CollBuilder;
import sigma.data.AvlTreeData;
import sigma.data.RType$;
import sigma.data.CSigmaDslBuilder$;
import sigma.interpreter.ContextExtension;
import sigma.interpreter.ProverResult;
import sigma.serialization.SigmaSerializer;
import sigma.validation.ValidationRules$;
import sigmastate.interpreter.Interpreter;
import sigmastate.eval.CPreHeader;

/**
 * Verifies the protected continuation predicate on one fresh public fixture.
 * This program accepts fixture bytes only; it has no node, wallet, or signing
 * integration.
 */
public final class ExactNativeContinuationPredicateCheck {
    private static final String SCHEMA = "E2S_NATIVE_CONTINUATION_PREDICATE_FIXTURE_V1";
    private static final String COMPILER_LOCK_SHA256 =
            "441c518aabefd19ddeee102a2cf403152b3c641fa0ea970f35a707d3f4d47583";
    private static final String SIGMA_JAR_SHA256 =
            "0dbd3b31ef94affec83f8f0f6c5a9891c45da1e975ff6016a0574fc5aa1418e6";
    private static final String SOURCE_LOCK_TEMPLATE_SHA256 =
            "f03c1e2ecbb0433d9b5bcad2489467bee26e2e03543ec2a1cd61c18aba21db6b";
    private static final String RESERVE_TEMPLATE_SHA256 =
            "44f8bf015c301b3fe478764cfc2b841a026b9727a71fa0c4d5a60309894d67f5";
    private static final int FIELD_COUNT = 14;
    private static final int RESERVE_INPUT_INDEX = 0;
    private static final int SOURCE_LOCK_INPUT_INDEX = 1;
    private static final int FEE_INPUT_INDEX = 2;
    private static final int MAX_FIXTURE_BYTES = 1024 * 1024;
    private static final long COST_LIMIT = 1_000_000L;
    private static final byte ACTIVATED_SCRIPT_VERSION = 3;
    private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");
    private static final Pattern DECIMAL = Pattern.compile("0|[1-9][0-9]*");
    private static final Pattern LOWER_HEX = Pattern.compile("(?:[0-9a-f]{2})+");

    private ExactNativeContinuationPredicateCheck() {}

    public static void main(String[] args) {
        boolean selfTest = args.length == 3 && "--self-test".equals(args[0]);
        if ((!selfTest && args.length != 2) || (selfTest && args.length != 3)) {
            fail("usage: ExactNativeContinuationPredicateCheck [--self-test] <fixture> <expected-sha256>");
        }
        final int offset = selfTest ? 1 : 0;
        try {
            String expectedSha256 = args[offset + 1];
            require(SHA256.matcher(expectedSha256).matches(), "expected fixture SHA-256 must be lowercase hex");
            byte[] wire = readBoundedRegularFile(Paths.get(args[offset]));
            require(sha256(wire).equals(expectedSha256), "fixture SHA-256 mismatch");
            VerifiedFixture fixture = preflightWire(wire);
            if (selfTest) {
                runPreflightSelfTests(fixture.fields, fixture.transaction);
                System.out.println("PASS preflight-self-test cases=19 interpreter=not-invoked");
                return;
            }
            verifyBoundary(fixture);
        } catch (PreflightReject e) {
            fail("fixture rejected code=" + e.code);
        } catch (Exception e) {
            fail("fixture rejected code=UNEXPECTED");
        }
    }

    private static byte[] readBoundedRegularFile(Path path) throws IOException {
        BasicFileAttributes attributes = Files.readAttributes(
                path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        require(attributes.isRegularFile() && !attributes.isSymbolicLink() && !attributes.isOther(),
                "fixture must be a direct regular file");
        require(attributes.size() <= MAX_FIXTURE_BYTES, "fixture exceeds 1 MiB");
        byte[] bytes = Files.readAllBytes(path);
        require(bytes.length <= MAX_FIXTURE_BYTES, "fixture exceeds 1 MiB");
        return bytes;
    }

    private static VerifiedFixture preflightWire(byte[] wire) {
        String[] fields = decodeWire(wire);
        validatePins(fields);

        int baselineHeight = parseHeight(fields[5]);
        int successorHeight = parseHeight(fields[13]);
        require((long) successorHeight + 101L <= Integer.MAX_VALUE, "successor boundary height overflows");

        String txId = fields[6];
        require(SHA256.matcher(txId).matches(), "transaction id must be lowercase 32-byte hex");
        ErgoLikeTransaction transaction = parseTransaction(decodeHex(fields[7]));
        require(Arrays.equals(ErgoLikeTransactionSerializer$.MODULE$.toBytes(transaction), decodeHex(fields[7])),
                "transaction bytes are not canonical");
        require(transaction.id().equals(txId), "transaction id mismatch");
        require(transaction.inputs().size() == 3, "expected exactly three inputs");
        require(transaction.dataInputs().isEmpty(), "expected no data inputs");
        require(transaction.outputCandidates().size() == 2, "expected exactly two outputs");
        require(transaction.outputs().size() == 2, "materialized transaction must have exactly two outputs");

        ErgoBox[] boxes = new ErgoBox[3];
        byte[][] boxBytes = new byte[3][];
        SigmaSerializer<ErgoBox, ErgoBox> boxSerializer = ErgoBox.sigmaSerializer$.MODULE$;
        for (int i = 0; i < boxes.length; i++) {
            boxBytes[i] = decodeHex(fields[8 + i]);
            boxes[i] = parseBox(boxBytes[i], boxSerializer);
            require(Arrays.equals(boxSerializer.toBytes(boxes[i]), boxBytes[i]), "input box bytes are not canonical");
            require(Arrays.equals(transaction.inputs().apply(i).boxId(), boxes[i].id()),
                    "ordered input box id mismatch");
            require(transaction.inputs().apply(i).spendingProof().proof().length == 0,
                    "fixture input proof must be empty");
        }
        validateExtensions(transaction);
        require(Arrays.equals(transaction.messageToSign(), decodeHex(fields[7])),
                "messageToSign must equal the exact proofless transaction bytes");

        require(Arrays.equals(boxes[RESERVE_INPUT_INDEX].ergoTree().bytes(), decodeHex(fields[11])),
                "reserve proposition does not match input 0");
        require(Arrays.equals(boxes[SOURCE_LOCK_INPUT_INDEX].ergoTree().bytes(), decodeHex(fields[12])),
                "source-lock proposition does not match input 1");
        require(boxes[RESERVE_INPUT_INDEX].ergoTree().version() == 0
                        && boxes[SOURCE_LOCK_INPUT_INDEX].ergoTree().version() == 0,
                "pinned compiler fixture expects ErgoTree version 0");
        require(transaction.outputCandidates().apply(0).creationHeight() == successorHeight,
                "reserve successor creation height mismatch");
        require(successorHeight <= baselineHeight
                        && (long) baselineHeight <= (long) successorHeight + 100L,
                "baseline height must be in the inclusive successor window");
        for (ErgoBox box : boxes) {
            require(box.creationHeight() <= baselineHeight,
                    "input box creation height exceeds baseline height");
        }

        return new VerifiedFixture(fields, transaction, boxes, baselineHeight, successorHeight, txId);
    }

    private static String[] decodeWire(byte[] wire) {
        require(wire.length > 0 && wire[wire.length - 1] == '\n', "fixture must end with LF");
        for (byte value : wire) {
            require(value >= 0, "fixture must be ASCII");
            require(value != '\r', "fixture must use LF line endings");
        }
        String text = new String(wire, StandardCharsets.US_ASCII);
        String[] split = text.split("\\n", -1);
        require(split.length == FIELD_COUNT + 1 && split[FIELD_COUNT].isEmpty(),
                "fixture must contain exactly 14 positional fields and one trailing LF");
        String[] fields = Arrays.copyOf(split, FIELD_COUNT);
        for (String field : fields) {
            require(!field.isEmpty(), "fixture fields must be nonempty");
        }
        return fields;
    }

    private static void validatePins(String[] fields) {
        require(fields[0].equals(SCHEMA), "fixture schema mismatch");
        require(fields[1].equals(COMPILER_LOCK_SHA256), "compiler lock pin mismatch");
        require(fields[2].equals(SIGMA_JAR_SHA256), "SigmaState artifact pin mismatch");
        require(fields[3].equals(SOURCE_LOCK_TEMPLATE_SHA256), "source-lock template pin mismatch");
        require(fields[4].equals(RESERVE_TEMPLATE_SHA256), "reserve template pin mismatch");
        parseHeight(fields[5]);
        require(SHA256.matcher(fields[6]).matches(), "transaction id must be lowercase 32-byte hex");
        for (int i = 7; i < 13; i++) {
            require(LOWER_HEX.matcher(fields[i]).matches(), "binary fixture fields must be canonical lowercase hex");
        }
        parseHeight(fields[13]);
    }

    private static ErgoLikeTransaction parseTransaction(byte[] bytes) {
        try {
            return ErgoLikeTransactionSerializer$.MODULE$.fromBytes(bytes);
        } catch (RuntimeException e) {
            throw new PreflightReject("TX_PARSE", "transaction parse failed");
        }
    }

    private static ErgoBox parseBox(byte[] bytes, SigmaSerializer<ErgoBox, ErgoBox> serializer) {
        try {
            return serializer.fromBytes(bytes);
        } catch (RuntimeException e) {
            throw new PreflightReject("BOX_PARSE", "box parse failed");
        }
    }

    private static void validateExtensions(ErgoLikeTransaction transaction) {
        ContextExtension first = transaction.inputs().apply(0).extension();
        require(first.values().size() == 1, "input 0 extension must contain only variable 0");
        scala.Option<sigma.ast.EvaluatedValue<? extends sigma.ast.SType>> value = first.get((byte) 0);
        require(value.isDefined(), "input 0 extension variable 0 is absent");
        Object decoded = value.get().value();
        require(decoded instanceof Coll<?>, "input 0 extension variable 0 must be a byte collection");
        Object array = ((Coll<?>) decoded).toArray();
        require(array instanceof byte[] && ((byte[]) array).length > 0,
                "input 0 extension variable 0 must be a nonempty byte collection");
        require(transaction.inputs().apply(SOURCE_LOCK_INPUT_INDEX).extension().values().isEmpty(),
                "input 1 extension must be empty");
        require(transaction.inputs().apply(FEE_INPUT_INDEX).extension().values().isEmpty(),
                "input 2 extension must be empty");
    }

    private static void verifyBoundary(VerifiedFixture fixture) {
        int at100 = Math.addExact(fixture.successorHeight, 100);
        int at101 = Math.addExact(fixture.successorHeight, 101);
        long sourceLockAgeAt101 = (long) at101 - fixture.boxes[SOURCE_LOCK_INPUT_INDEX].creationHeight();
        require(sourceLockAgeAt101 >= 0 && sourceLockAgeAt101 < 10_000,
                "source-lock input must remain inside its 10000-block escape at +101");

        ErgoLikeInterpreter interpreter = new ErgoLikeInterpreter();
        boolean reserveAtBaseline = verifyInput(interpreter, fixture, RESERVE_INPUT_INDEX, fixture.baselineHeight);
        boolean sourceLockAtBaseline = verifyInput(interpreter, fixture, SOURCE_LOCK_INPUT_INDEX, fixture.baselineHeight);
        boolean reserveAt100 = verifyInput(interpreter, fixture, RESERVE_INPUT_INDEX, at100);
        boolean sourceLockAt100 = verifyInput(interpreter, fixture, SOURCE_LOCK_INPUT_INDEX, at100);
        boolean reserveAt101 = verifyInput(interpreter, fixture, RESERVE_INPUT_INDEX, at101);
        boolean sourceLockAt101 = verifyInput(interpreter, fixture, SOURCE_LOCK_INPUT_INDEX, at101);

        require(reserveAtBaseline && sourceLockAtBaseline,
                "baseline verification must be true for reserve and source-lock inputs");
        require(reserveAt100 && sourceLockAt100,
                "+100 verification must be true for reserve and source-lock inputs");
        require(!reserveAt101 && sourceLockAt101,
                "+101 verification must be exactly false for input 0 and true for input 1");

        System.out.println("PASS sigma-state=6.0.2 verifiedInputs=0,1 heights="
                + fixture.baselineHeight + "," + at100 + "," + at101
                + " results=true,true;true,true;false,true txId=" + fixture.txId
                + " sourceLockAgeAt101=" + sourceLockAgeAt101);
    }

    private static boolean verifyInput(
            ErgoLikeInterpreter interpreter, VerifiedFixture fixture, int inputIndex, int height) {
        Input input = fixture.transaction.inputs().apply(inputIndex);
        ErgoLikeContext context = context(fixture.transaction, fixture.boxes, inputIndex, input.extension(), height);
        Try<Tuple2<Object, Object>> result = interpreter.verify(
                Interpreter.emptyEnv(), fixture.boxes[inputIndex].ergoTree(), context,
                input.spendingProof().proof(), fixture.transaction.messageToSign());
        require(result.isSuccess(), "SigmaState verifier returned a failed Try");
        Object truth = result.get()._1();
        require(truth instanceof Boolean, "SigmaState verifier returned a non-Boolean result");
        return (Boolean) truth;
    }

    private static ErgoLikeContext context(
            ErgoLikeTransaction transaction, ErgoBox[] boxes, int selfIndex,
            ContextExtension extension, int height) {
        CollBuilder collBuilder = CSigmaDslBuilder$.MODULE$.Colls();
        Coll<Object> parentId = collBuilder.fromArray(new byte[32], byteType());
        Coll<Object> votes = collBuilder.fromArray(new byte[3], byteType());
        CPreHeader preHeader = new CPreHeader(
                (byte) 0, parentId, 0L, 0L, height,
                CSigmaDslBuilder$.MODULE$.groupGenerator(), votes);
        Coll<sigma.Header> headers = collBuilder.emptyColl(
                RType$.MODULE$.fromClassTag(ClassTag$.MODULE$.apply(sigma.Header.class)));
        scala.collection.immutable.IndexedSeq<ErgoBox> boxesToSpend =
                JavaConverters$.MODULE$.asScalaBuffer(Arrays.asList(boxes)).toIndexedSeq();
        scala.collection.immutable.IndexedSeq<ErgoBox> readOnlyBoxes =
                JavaConverters$.MODULE$.asScalaBuffer(new ArrayList<ErgoBox>()).toIndexedSeq();
        return new ErgoLikeContext(
                AvlTreeData.dummy(), headers, preHeader, readOnlyBoxes, boxesToSpend, transaction,
                selfIndex, extension, ValidationRules$.MODULE$.coreSettings(),
                COST_LIMIT, 0L, ACTIVATED_SCRIPT_VERSION);
    }

    @SuppressWarnings("unchecked")
    private static sigma.data.RType<Object> byteType() {
        return (sigma.data.RType<Object>) (sigma.data.RType<?>) RType$.MODULE$.fromClassTag(ClassTag$.MODULE$.Byte());
    }

    private static void runPreflightSelfTests(String[] fields, ErgoLikeTransaction tx) {
        final String[] modifiedId = fields.clone();
        modifiedId[6] = (fields[6].charAt(0) == '0' ? "1" : "0") + fields[6].substring(1);
        expectReject("TX_ID", () -> preflightWire(encodeFields(modifiedId)));

        final String[] compilerPin = fields.clone();
        compilerPin[1] = "0".repeat(64);
        expectReject("COMPILER_LOCK_PIN", () -> preflightWire(encodeFields(compilerPin)));

        final String[] sigmaPin = fields.clone();
        sigmaPin[2] = "0".repeat(64);
        expectReject("SIGMA_ARTIFACT_PIN", () -> preflightWire(encodeFields(sigmaPin)));

        final String[] sourceTemplatePin = fields.clone();
        sourceTemplatePin[3] = "0".repeat(64);
        expectReject("SOURCE_LOCK_TEMPLATE_PIN", () -> preflightWire(encodeFields(sourceTemplatePin)));

        final String[] reserveTemplatePin = fields.clone();
        reserveTemplatePin[4] = "0".repeat(64);
        expectReject("RESERVE_TEMPLATE_PIN", () -> preflightWire(encodeFields(reserveTemplatePin)));

        final String[] wrongSchema = fields.clone();
        wrongSchema[0] = "E2S_NATIVE_CONTINUATION_PREDICATE_FIXTURE_WRONG";
        expectReject("SCHEMA", () -> preflightWire(encodeFields(wrongSchema)));

        byte[] canonicalWire = encodeFields(fields);
        byte[] extraLine = Arrays.copyOf(canonicalWire, canonicalWire.length + 6);
        System.arraycopy("extra\n".getBytes(StandardCharsets.US_ASCII), 0, extraLine, canonicalWire.length, 6);
        expectReject("FIELD_COUNT", () -> preflightWire(extraLine));

        byte[] crlf = new String(canonicalWire, StandardCharsets.US_ASCII)
                .replace("\n", "\r\n").getBytes(StandardCharsets.US_ASCII);
        expectReject("CRLF", () -> preflightWire(crlf));

        byte[] missingFinalLf = Arrays.copyOf(canonicalWire, canonicalWire.length - 1);
        expectReject("MISSING_FINAL_LF", () -> preflightWire(missingFinalLf));

        final String[] noncanonicalHeight = fields.clone();
        noncanonicalHeight[5] = "0" + fields[5];
        expectReject("HEIGHT_CANONICAL", () -> preflightWire(encodeFields(noncanonicalHeight)));

        final String[] outsideSuccessorWindow = fields.clone();
        outsideSuccessorWindow[5] = Integer.toString(parseHeight(fields[13]) + 101);
        expectReject("HEIGHT_WINDOW", () -> preflightWire(encodeFields(outsideSuccessorWindow)));

        final String[] wrongSuccessorHeight = fields.clone();
        wrongSuccessorHeight[13] = Integer.toString(parseHeight(fields[13]) + 1);
        expectReject("SUCCESSOR_HEIGHT", () -> preflightWire(encodeFields(wrongSuccessorHeight)));

        final String[] trailingTransaction = fields.clone();
        trailingTransaction[7] += "00";
        expectReject(new String[] {"TX_CANONICAL", "TX_PARSE"},
                () -> preflightWire(encodeFields(trailingTransaction)));

        final String[] trailingBox = fields.clone();
        trailingBox[8] += "00";
        expectReject(new String[] {"BOX_CANONICAL", "BOX_PARSE"},
                () -> preflightWire(encodeFields(trailingBox)));

        final String[] swappedBoxes = fields.clone();
        String swap = swappedBoxes[8];
        swappedBoxes[8] = swappedBoxes[9];
        swappedBoxes[9] = swap;
        expectReject("BOX_ORDER", () -> preflightWire(encodeFields(swappedBoxes)));

        final String[] reserveContract = fields.clone();
        reserveContract[11] = flipHexNibble(reserveContract[11]);
        expectReject("RESERVE_PROPOSITION", () -> preflightWire(encodeFields(reserveContract)));

        final String[] sourceLockContract = fields.clone();
        sourceLockContract[12] = flipHexNibble(sourceLockContract[12]);
        expectReject("SOURCE_LOCK_PROPOSITION", () -> preflightWire(encodeFields(sourceLockContract)));

        Input originalInput = tx.inputs().apply(0);
        ErgoLikeTransaction proofMutation = replaceInput(tx, 0,
                new Input(originalInput.boxId(),
                        ProverResult.apply(new byte[] {1}, originalInput.extension())));
        String[] nonemptyProof = fields.clone();
        nonemptyProof[6] = proofMutation.id();
        nonemptyProof[7] = encodeHex(ErgoLikeTransactionSerializer$.MODULE$.toBytes(proofMutation));
        expectReject("NONEMPTY_PROOF", () -> preflightWire(encodeFields(nonemptyProof)));

        sigma.ast.EvaluatedValue<? extends sigma.ast.SType> variableZero =
                originalInput.extension().get((byte) 0).get();
        scala.collection.Map<Object, sigma.ast.EvaluatedValue<? extends sigma.ast.SType>> expandedValues =
                originalInput.extension().values().$plus(
                        new Tuple2<Object, sigma.ast.EvaluatedValue<? extends sigma.ast.SType>>(
                                (byte) 1, variableZero));
        ContextExtension expandedExtension = new ContextExtension(expandedValues);
        ErgoLikeTransaction extensionMutation = replaceInput(tx, 0,
                new Input(originalInput.boxId(), ProverResult.apply(
                        originalInput.spendingProof().proof(), expandedExtension)));
        String[] extraExtension = fields.clone();
        extraExtension[6] = extensionMutation.id();
        extraExtension[7] = encodeHex(ErgoLikeTransactionSerializer$.MODULE$.toBytes(extensionMutation));
        expectReject("EXTRA_EXTENSION", () -> preflightWire(encodeFields(extraExtension)));

        System.out.println("PASS preflight-self-test cases=19 interpreter=not-invoked");
    }

    private static ErgoLikeTransaction replaceInput(ErgoLikeTransaction tx, int index, Input replacement) {
        List<Input> inputs = new ArrayList<>();
        for (int i = 0; i < tx.inputs().size(); i++) {
            inputs.add(i == index ? replacement : tx.inputs().apply(i));
        }
        scala.collection.immutable.IndexedSeq<Input> scalaInputs =
                JavaConverters$.MODULE$.asScalaBuffer(inputs).toIndexedSeq();
        return new ErgoLikeTransaction(scalaInputs, tx.dataInputs(), tx.outputCandidates());
    }

    private static byte[] encodeFields(String[] fields) {
        return (String.join("\n", fields) + "\n").getBytes(StandardCharsets.US_ASCII);
    }

    private static String encodeHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) result.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return result.toString();
    }

    private static String flipHexNibble(String value) {
        char replacement = value.charAt(0) == '0' ? '1' : '0';
        return replacement + value.substring(1);
    }

    private static int parseHeight(String value) {
        require(DECIMAL.matcher(value).matches(), "height must be canonical decimal");
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("height out of range");
        }
    }

    private static byte[] decodeHex(String value) {
        require(LOWER_HEX.matcher(value).matches(), "binary fixture field must be nonempty lowercase hex");
        byte[] bytes = new byte[value.length() / 2];
        for (int i = 0; i < bytes.length; i++) {
            bytes[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
        }
        return bytes;
    }

    private static String sha256(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder result = new StringBuilder(64);
        for (byte b : digest) result.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return result.toString();
    }

    private static void expectReject(String expectedCode, CheckedAction action) {
        expectReject(new String[] {expectedCode}, action);
    }

    private static void expectReject(String[] expectedCodes, CheckedAction action) {
        try {
            action.run();
        } catch (PreflightReject rejected) {
            for (String expectedCode : expectedCodes) {
                if (rejected.code.equals(expectedCode)) return;
            }
            throw new IllegalStateException("preflight rejected a negative case for the wrong reason");
        } catch (Exception unexpected) {
            throw new IllegalStateException("preflight negative case escaped its closed rejection set");
        }
        throw new IllegalStateException("preflight accepted a negative case");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new PreflightReject(codeFor(message), message);
    }

    private static String codeFor(String message) {
        if (message.equals("fixture must end with LF")) return "MISSING_FINAL_LF";
        if (message.equals("fixture must use LF line endings")) return "CRLF";
        if (message.startsWith("fixture must contain exactly 14 positional fields")) return "FIELD_COUNT";
        if (message.equals("fixture schema mismatch")) return "SCHEMA";
        if (message.equals("fixture SHA-256 mismatch")) return "FIXTURE_SHA256";
        if (message.equals("compiler lock pin mismatch")) return "COMPILER_LOCK_PIN";
        if (message.equals("SigmaState artifact pin mismatch")) return "SIGMA_ARTIFACT_PIN";
        if (message.equals("source-lock template pin mismatch")) return "SOURCE_LOCK_TEMPLATE_PIN";
        if (message.equals("reserve template pin mismatch")) return "RESERVE_TEMPLATE_PIN";
        if (message.equals("height must be canonical decimal")) return "HEIGHT_CANONICAL";
        if (message.equals("baseline height must be in the inclusive successor window")) return "HEIGHT_WINDOW";
        if (message.equals("reserve successor creation height mismatch")) return "SUCCESSOR_HEIGHT";
        if (message.equals("transaction id mismatch")) return "TX_ID";
        if (message.equals("transaction bytes are not canonical")) return "TX_CANONICAL";
        if (message.equals("input box bytes are not canonical")) return "BOX_CANONICAL";
        if (message.equals("ordered input box id mismatch")) return "BOX_ORDER";
        if (message.equals("fixture input proof must be empty")) return "NONEMPTY_PROOF";
        if (message.equals("input 0 extension must contain only variable 0")) return "EXTRA_EXTENSION";
        if (message.equals("reserve proposition does not match input 0")) return "RESERVE_PROPOSITION";
        if (message.equals("source-lock proposition does not match input 1")) return "SOURCE_LOCK_PROPOSITION";
        if (message.equals("messageToSign must equal the exact proofless transaction bytes")) return "MESSAGE_TO_SIGN";
        if (message.equals("source-lock input must remain inside its 10000-block escape at +101")) return "SOURCE_LOCK_AGE";
        if (message.equals("SigmaState verifier returned a failed Try")) return "SIGMA_TRY_FAILURE";
        if (message.equals("baseline verification must be true for reserve and source-lock inputs")) return "BASELINE_OUTCOME";
        if (message.equals("+100 verification must be true for reserve and source-lock inputs")) return "PLUS_100_OUTCOME";
        if (message.equals("+101 verification must be exactly false for input 0 and true for input 1")) return "PLUS_101_OUTCOME";
        return "PREFLIGHT";
    }

    private static void fail(String message) {
        System.err.println("FAIL: " + message);
        System.exit(2);
        throw new IllegalStateException(message);
    }

    private interface CheckedAction { void run() throws Exception; }

    private static final class PreflightReject extends IllegalArgumentException {
        final String code;
        PreflightReject(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    private static final class VerifiedFixture {
        final String[] fields;
        final ErgoLikeTransaction transaction;
        final ErgoBox[] boxes;
        final int baselineHeight;
        final int successorHeight;
        final String txId;

        VerifiedFixture(String[] fields, ErgoLikeTransaction transaction, ErgoBox[] boxes,
                        int baselineHeight, int successorHeight, String txId) {
            this.fields = fields;
            this.transaction = transaction;
            this.boxes = boxes;
            this.baselineHeight = baselineHeight;
            this.successorHeight = successorHeight;
            this.txId = txId;
        }
    }
}
