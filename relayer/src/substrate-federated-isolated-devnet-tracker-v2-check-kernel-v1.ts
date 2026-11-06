import {
  assertBridgeValidityTrackerObservedHeaderContextV1,
  type BridgeValidityTrackerObservedHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import {
  ERGO_NODE_CHECKER_PROFILE,
  ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE,
  LOCAL_WASM_CHECK_SIGNER_PROFILE,
  LOCAL_WASM_SIGNED_CHECK_CANDIDATE_PROFILE,
} from './ergo-check-profiles.js';
import type {
  LocalWasmExactBytesSignedCheckCandidate,
  LocalWasmOpaqueCheckResult,
  PreparedLocalWasmRootCheckBatch,
} from './fleet-signer.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import type {
  SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2,
  SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  resolveSubstrateFederatedTrackerCompilerSourceV2,
  type SubstrateFederatedTrackerCompilerRequestV2,
} from './substrate-federated-tracker-compiler-v2.js';
import {
  assertSubstrateFederatedTrackerV2Context,
  type SubstrateFederatedTrackerV2Context,
} from './substrate-federated-tracker-v2.js';
import {
  assertSubstrateFederatedTrackerV2ExternalFeeTransaction,
  buildSubstrateFederatedTrackerV2ExternalFeeTransaction,
  type SubstrateFederatedTrackerV2ExternalFeeTransaction,
} from './substrate-federated-tracker-v2-external-fee.js';
import { normalizeEip12Box, type Eip12UnsignedTransaction } from './unsigned-ergo-transaction.js';

const CHECK_DIGEST_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_V2_CHECK_KERNEL_V1';
const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const ROLE = 'tracker-v2-external-fee' as const;
type Target = SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2;
type Binding = SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1;

export interface SubstrateFederatedIsolatedDevnetTrackerV2CheckKernelV1Input {
  readonly compilerRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV2>;
  readonly context: Readonly<SubstrateFederatedTrackerV2Context>;
  readonly transaction: Readonly<SubstrateFederatedTrackerV2ExternalFeeTransaction>;
  readonly observedHeaderContext: Readonly<BridgeValidityTrackerObservedHeaderContextV1>;
  readonly target: Readonly<Target>;
  readonly expectedSigner: Readonly<{
    publicKeyHex: string;
    p2pkErgoTreeHex: string;
    networkPrefix: number;
  }>;
  readonly operations: Readonly<{
    captureTargetBinding(target: Readonly<Target>): Readonly<Binding>;
    observeInputBox(boxId: string, origin: string): Promise<unknown>;
    prepareCandidate(input: Readonly<{
      networkPrefix: number;
      nodeOrigin: string;
      role: typeof ROLE;
      headers: readonly Readonly<Record<string, unknown>>[];
      eip12Tx: Readonly<Eip12UnsignedTransaction>;
      expectedTxId: string;
    }>): Promise<Readonly<PreparedLocalWasmRootCheckBatch>>;
    checkCandidate(
      candidate: Readonly<LocalWasmExactBytesSignedCheckCandidate>,
      nodeOrigin: string,
    ): Promise<Readonly<LocalWasmOpaqueCheckResult> | null>;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetTrackerV2CheckKernelV1Result {
  readonly context: Readonly<SubstrateFederatedTrackerV2Context>;
  readonly transaction: Readonly<SubstrateFederatedTrackerV2ExternalFeeTransaction>;
  readonly observedHeaderContext: Readonly<BridgeValidityTrackerObservedHeaderContextV1>;
  readonly signedCandidate: Readonly<LocalWasmExactBytesSignedCheckCandidate>;
  readonly checkedResult: Readonly<LocalWasmOpaqueCheckResult>;
  readonly targetBinding: Readonly<Binding>;
  readonly checkDigestHex: string;
}

export async function executeSubstrateFederatedIsolatedDevnetTrackerV2CheckKernelV1(
  input: Readonly<SubstrateFederatedIsolatedDevnetTrackerV2CheckKernelV1Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetTrackerV2CheckKernelV1Result>> {
  exactKeys(input, ['compilerRequest', 'context', 'transaction', 'observedHeaderContext',
    'target', 'expectedSigner', 'operations'], 'input');
  const { compilerRequest, context, transaction, observedHeaderContext, target } = input;
  const signerIngress = input.expectedSigner;
  const operationIngress = input.operations;
  exactKeys(signerIngress, ['publicKeyHex', 'p2pkErgoTreeHex', 'networkPrefix'], 'expected signer');
  const signer = Object.freeze({ ...signerIngress });
  exactKeys(operationIngress, ['captureTargetBinding', 'observeInputBox', 'prepareCandidate',
    'checkCandidate'], 'operations');
  const operations = Object.freeze({ ...operationIngress });
  if (Object.values(operations).some(operation => typeof operation !== 'function')) {
    throw new Error('tracker V2 check operations must be functions');
  }
  assertSubstrateFederatedTrackerV2Context(context);
  assertSubstrateFederatedTrackerV2ExternalFeeTransaction(transaction);
  assertBridgeValidityTrackerObservedHeaderContextV1(observedHeaderContext);
  resolveSubstrateFederatedTrackerCompilerSourceV2(compilerRequest);
  if (compilerRequest.requestDigestHex !== context.compilerRequestDigestHex) {
    throw new Error('tracker V2 check compiler request differs from the context');
  }
  if (signer.networkPrefix !== 16
    || !/^(02|03)[0-9a-f]{64}$/.test(signer.publicKeyHex)
    || signer.p2pkErgoTreeHex !== `0008cd${signer.publicKeyHex}`) {
    throw new Error('tracker V2 check requires the exact LAB P2PK signer');
  }
  const profile = compilerRequest.profile;
  if (profile.ergoAdmissionThreshold !== 1
    || profile.ergoAdmissionPublicKeysHex.length !== 1
    || profile.ergoAdmissionPublicKeysHex[0] !== signer.publicKeyHex) {
    throw new Error('tracker V2 check requires the signer as the sole 1-of-1 admission key');
  }
  assertHeaderJoin(context, observedHeaderContext);
  const targetSnapshot = captureTarget(target);
  const before = captureBinding(operations.captureTargetBinding(target));
  const assertTargetUnchanged = (): void => {
    if (canonicalJson(captureTarget(target)) !== canonicalJson(targetSnapshot)
      || canonicalJson(captureBinding(operations.captureTargetBinding(target))) !== canonicalJson(before)) {
      throw new Error('tracker V2 check target binding changed');
    }
  };

  // Reuse the genuine composer to close the full body, box-Sigma and ID join.
  // The tracker's fee-less ID must never become this candidate's signing ID.
  const rebuilt = await buildSubstrateFederatedTrackerV2ExternalFeeTransaction({
    trackerContext: context,
    trackerInputBox: transaction.inputBoxes[0],
    feeInputBox: transaction.inputBoxes[1],
    feePayerPublicKeyHex: signer.publicKeyHex,
  });
  if (canonicalJson(rebuilt) !== canonicalJson(transaction)) {
    throw new Error('tracker V2 check external transaction differs from the exact context');
  }
  const expectedTxId = transaction.unsignedTransactionIdHex;
  const eip12Tx = deepFreeze(structuredClone(transaction.eip12UnsignedTransaction)) as unknown as Readonly<Eip12UnsignedTransaction>;
  const headers = deepFreeze(observedHeaderContext.headers.map(header => structuredClone(header.raw)));
  const observeInputs = async (): Promise<void> => {
    for (const origin of [PRIMARY, WITNESS]) {
      for (const box of transaction.inputBoxes) {
        const raw = structuredClone(await operations.observeInputBox(box.boxId, origin));
        const observed = await normalizeEip12Box(raw, 'tracker V2 check live input');
        if (canonicalJson(observed) !== canonicalJson(box)) {
          throw new Error('tracker V2 check live input differs from the exact candidate');
        }
      }
    }
    assertTargetUnchanged();
  };
  await observeInputs();
  const batch = await operations.prepareCandidate(Object.freeze({
    networkPrefix: signer.networkPrefix, nodeOrigin: PRIMARY, role: ROLE,
    headers, eip12Tx, expectedTxId,
  }));
  exactKeys(batch, ['derivation', 'pubKeyHex', 'ergoTreeHex', 'stateContextTipHeight',
    'stateContextTipIdHex', 'candidates'], 'signer batch');
  const prepared = batch.candidates?.[0];
  if (batch.derivation !== 'wasm-root'
    || batch.pubKeyHex !== signer.publicKeyHex || batch.ergoTreeHex !== signer.p2pkErgoTreeHex
    || batch.stateContextTipHeight !== observedHeaderContext.currentHeight - 1
    || batch.stateContextTipIdHex !== observedHeaderContext.headers[0]!.id
    || !Array.isArray(batch.candidates) || batch.candidates.length !== 1 || prepared === undefined) {
    throw new Error('tracker V2 check signer batch binding changed');
  }
  exactKeys(prepared, ['role', 'expectedTxId', 'signedCandidate'], 'prepared candidate');
  if (prepared.role !== ROLE || prepared.expectedTxId !== expectedTxId) {
    throw new Error('tracker V2 check prepared role or transaction ID changed');
  }
  const signedCandidate = prepared.signedCandidate;
  exactKeys(signedCandidate, ['profile', 'txId', 'signedTransactionDigestHex',
    'signedTransactionBytesSha256Hex', 'signedTransactionBytesLength', 'nodeOrigin',
    'signerContext'], 'signed candidate');
  const expectedSignerContext = {
    profile: LOCAL_WASM_CHECK_SIGNER_PROFILE,
    pubKeyHex: signer.publicKeyHex, ergoTreeHex: signer.p2pkErgoTreeHex,
    networkPrefix: signer.networkPrefix, stateContextTipHeight: batch.stateContextTipHeight,
    stateContextTipIdHex: batch.stateContextTipIdHex,
  };
  if (signedCandidate.profile !== LOCAL_WASM_SIGNED_CHECK_CANDIDATE_PROFILE
    || signedCandidate.txId !== expectedTxId || signedCandidate.nodeOrigin !== PRIMARY
    || canonicalJson(signedCandidate.signerContext) !== canonicalJson(expectedSignerContext)) {
    throw new Error('tracker V2 check signed candidate metadata changed');
  }
  hex32(signedCandidate.signedTransactionDigestHex, 'signed JSON digest');
  hex32(signedCandidate.signedTransactionBytesSha256Hex, 'signed bytes digest');
  if (!Number.isSafeInteger(signedCandidate.signedTransactionBytesLength)
    || signedCandidate.signedTransactionBytesLength < 1
    || signedCandidate.signedTransactionBytesLength > 262_144) {
    throw new Error('tracker V2 check signed bytes length is outside the ingress bound');
  }
  // Keep the original opaque candidate/check objects for the session's private
  // provenance. Freezing them also stops an I/O port from changing checked metadata.
  deepFreeze(signedCandidate);
  assertTargetUnchanged();
  const checkedResult = await operations.checkCandidate(signedCandidate, PRIMARY);
  if (checkedResult === null) throw new Error('tracker V2 JVM node check rejected the candidate');
  exactKeys(checkedResult, ['txId', 'checkResult', 'signedTransactionDigestHex',
    'signedTransactionBytesSha256Hex', 'signedTransactionBytesLength', 'signerContext',
    'checkerIdentity'], 'check result');
  if (checkedResult.txId !== expectedTxId
    || checkedResult.signedTransactionDigestHex !== signedCandidate.signedTransactionDigestHex
    || checkedResult.signedTransactionBytesSha256Hex !== signedCandidate.signedTransactionBytesSha256Hex
    || checkedResult.signedTransactionBytesLength !== signedCandidate.signedTransactionBytesLength
    || canonicalJson(checkedResult.signerContext) !== canonicalJson(expectedSignerContext)
    || canonicalJson(checkedResult.checkerIdentity) !== canonicalJson({
      profile: ERGO_NODE_CHECKER_PROFILE,
      sourceAdapterProfile: ERGO_NODE_CHECK_SOURCE_ADAPTER_PROFILE,
      nodeOrigin: PRIMARY, path: '/transactions/check', method: 'POST',
      transportPolicy: 'no-redirect-no-proxy',
    })) {
    throw new Error('tracker V2 check signer and checker metadata disagree');
  }
  deepFreeze(checkedResult);
  await observeInputs();
  const result = { context, transaction, observedHeaderContext, signedCandidate,
    checkedResult, targetBinding: before };
  return Object.freeze({ ...result, checkDigestHex: sha256CanonicalJson(result, CHECK_DIGEST_DOMAIN) });
}

function assertHeaderJoin(
  context: Readonly<SubstrateFederatedTrackerV2Context>,
  observed: Readonly<BridgeValidityTrackerObservedHeaderContextV1>,
): void {
  const transition = context.trackerTransition;
  if (transition.currentErgoHeight !== observed.currentHeight
    || transition.anchorHeight !== observed.anchorHeader.height
    || transition.headers.length !== observed.headers.length
    || transition.headers.some((header, index) => {
      const expected = observed.headers[index]!;
      return header.id !== expected.id || header.height !== expected.height
        || header.extensionRootHex !== expected.extensionRootHex
        || header.jvmHeaderJson !== expected.jvmHeaderJson || header.serializedHex !== expected.serializedHex;
    })) {
    throw new Error('tracker V2 check observed headers or absolute anchor height differ from context');
  }
}

function captureTarget(target: Readonly<Target>): Readonly<Target> {
  exactKeys(target, ['primaryNodeOrigin', 'witnessNodeOrigin', 'primaryMining', 'primaryReadOnly',
    'witnessReadOnly', 'miningStopped', 'checkpointBound'], 'frozen target');
  const snapshot = Object.freeze({ ...target });
  if (snapshot.primaryNodeOrigin !== PRIMARY || snapshot.witnessNodeOrigin !== WITNESS
    || snapshot.primaryMining !== false || snapshot.primaryReadOnly !== true
    || snapshot.witnessReadOnly !== true || snapshot.miningStopped !== true
    || snapshot.checkpointBound !== true) {
    throw new Error('tracker V2 check requires the exact frozen checkpoint target');
  }
  return snapshot;
}

function captureBinding(binding: Readonly<Binding>): Readonly<Binding> {
  exactKeys(binding, ['processBindingDigestHex', 'executionTargetIdentityDigestHex'], 'target binding');
  const snapshot = Object.freeze({ ...binding });
  hex32(snapshot.processBindingDigestHex, 'target process binding');
  hex32(snapshot.executionTargetIdentityDigestHex, 'target execution binding');
  return snapshot;
}

function exactKeys(value: unknown, keys: readonly string[], label: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) {
    throw new Error(`tracker V2 check ${label} fields differ`);
  }
}

function hex32(value: unknown, label: string): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`tracker V2 check ${label} must be canonical 32-byte hex`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
