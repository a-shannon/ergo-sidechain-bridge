import { sha256CanonicalJson } from './strict-json.js';
import type {
  LocalWasmExactBytesSignedCheckCandidate,
  LocalWasmOpaqueCheckResult,
  PreparedLocalWasmRootCheckBatch,
} from './fleet-signer.js';
import type {
  BridgeValidityTrackerObservedHeaderContextV1,
} from './bridge-validity-tracker-header-context-v1.js';
import type { SubstrateFederatedTrackerV1Context } from './substrate-federated-tracker-v1.js';
import type {
  Eip12Box,
  Eip12UnsignedTransaction,
} from './unsigned-ergo-transaction.js';

const PRIMARY_NODE_ORIGIN = 'http://127.0.0.1:9051';
const WITNESS_NODE_ORIGIN = 'http://127.0.0.1:9052';
const TRANSACTION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_TRANSACTION_V1';
const CHECK_RESPONSE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_RESPONSE_V1';

interface CheckpointBoundTargetV1 {
  readonly primaryNodeOrigin: string;
  readonly witnessNodeOrigin: string;
  readonly primaryMining: true;
  readonly witnessReadOnly: true;
  readonly checkpointBound: true;
}

interface CheckpointBoundTargetV2 {
  readonly primaryNodeOrigin: string;
  readonly witnessNodeOrigin: string;
  readonly primaryMining: false;
  readonly primaryReadOnly: true;
  readonly witnessReadOnly: true;
  readonly miningStopped: true;
  readonly checkpointBound: true;
}

interface TrackerReservationFreshnessTargetV1
  extends CheckpointBoundTargetV2 {
  readonly reservationFreshnessRevalidation: true;
}

interface TargetBindingV1 {
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
}

interface TrackerCheckSignerV1 {
  readonly publicKeyHex: string;
  readonly p2pkErgoTreeHex: string;
  readonly networkPrefix: number;
}

interface ObservedAnchorTrackerCheckKernelInput<TTarget> {
  readonly inputValue: Readonly<{
    readonly context: unknown;
    readonly observedHeaderContext: unknown;
    readonly trackerInputBox: unknown;
  }>;
  readonly target: Readonly<TTarget>;
  readonly expectedSigner: Readonly<TrackerCheckSignerV1>;
  readonly operations: Readonly<{
    readonly captureContext: (
      value: unknown,
    ) => Readonly<SubstrateFederatedTrackerV1Context>;
    readonly captureObservedHeaderContext: (
      value: unknown,
    ) => Readonly<BridgeValidityTrackerObservedHeaderContextV1>;
    readonly captureTargetBinding: (
      target: Readonly<TTarget>,
    ) => Readonly<TargetBindingV1>;
    readonly captureTrackerInputBox: (
      context: Readonly<SubstrateFederatedTrackerV1Context>,
      value: unknown,
    ) => Promise<Readonly<Eip12Box>>;
    readonly deriveUnsignedTransactionId: (
      transaction: Readonly<Eip12UnsignedTransaction>,
    ) => Promise<string>;
    readonly prepareCandidate: (input: Readonly<{
      readonly networkPrefix: number;
      readonly nodeOrigin: string;
      readonly role: 'observed-anchor-tracker';
      readonly headers: readonly Readonly<Record<string, unknown>>[];
      readonly eip12Tx: Readonly<Eip12UnsignedTransaction>;
      readonly expectedTxId: string;
    }>) => Promise<Readonly<PreparedLocalWasmRootCheckBatch>>;
    readonly checkCandidate: (
      candidate: Readonly<LocalWasmExactBytesSignedCheckCandidate>,
      nodeOrigin: string,
    ) => Promise<Readonly<LocalWasmOpaqueCheckResult> | null>;
  }>;
}

export type ObservedAnchorTrackerCheckKernelV1Input =
  ObservedAnchorTrackerCheckKernelInput<CheckpointBoundTargetV1>;

export type ObservedAnchorTrackerCheckKernelV2Input =
  ObservedAnchorTrackerCheckKernelInput<CheckpointBoundTargetV2>;

export type ObservedAnchorTrackerReservationFreshnessCheckKernelV1Input =
  ObservedAnchorTrackerCheckKernelInput<TrackerReservationFreshnessTargetV1>
  & Readonly<{
    readonly expectedFrozenCheck:
      Readonly<ObservedAnchorTrackerCheckKernelV2Result>;
  }>;

interface ObservedAnchorTrackerCheckKernelResultBase {
  readonly trackerInputBoxIdHex: string;
  readonly statementIdHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeight: number;
  readonly anchorContextIndex: number;
  readonly unsignedTransactionIdHex: string;
  readonly unsignedTransactionDigestHex: string;
  readonly signedTransactionIdHex: string;
  readonly signedTransactionCanonicalJsonSha256Hex: string;
  readonly signedTransactionBytesSha256Hex: string;
  readonly signedTransactionBytesLength: number;
  readonly checkResponseSha256Hex: string;
  readonly target: Readonly<TargetBindingV1>;
  readonly signer: Readonly<{
    readonly derivation: 'wasm-root';
    readonly publicKeyHex: string;
    readonly p2pkErgoTreeHex: string;
    readonly stateContextTipHeight: number;
    readonly stateContextTipIdHex: string;
  }>;
  readonly checker: Readonly<{
    readonly nodeOrigin: string;
    readonly path: '/transactions/check';
    readonly method: 'POST';
    readonly transportPolicy: 'no-redirect-no-proxy';
  }>;
}

export interface ObservedAnchorTrackerCheckKernelV1Result
  extends ObservedAnchorTrackerCheckKernelResultBase {
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly checkpointBoundActiveTarget: true;
    readonly observedAnchorContextBound: true;
    readonly exactTrackerInputAndTransactionBound: true;
    readonly localWasmRootSigningPerformed: true;
    readonly localJvmNodeCheckPassed: true;
    readonly signedTransactionBytesPersisted: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly trackerAdmissionEstablished: false;
    readonly replayProtectionEstablished: false;
    readonly payoutEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export interface ObservedAnchorTrackerCheckKernelV2Result
  extends ObservedAnchorTrackerCheckKernelResultBase {
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly checkpointBoundFrozenTarget: true;
    readonly observedAnchorContextBound: true;
    readonly exactTrackerInputAndTransactionBound: true;
    readonly localWasmRootSigningPerformed: true;
    readonly localJvmNodeCheckPassed: true;
    readonly signedTransactionBytesPersisted: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly trackerAdmissionEstablished: false;
    readonly replayProtectionEstablished: false;
    readonly payoutEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export interface ObservedAnchorTrackerReservationFreshnessCheckKernelV1Result
  extends ObservedAnchorTrackerCheckKernelResultBase {
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly reservationFreshnessRevalidationTarget: true;
    readonly observedAnchorContextBound: true;
    readonly exactTrackerInputAndTransactionBound: true;
    readonly localWasmRootSigningPerformed: true;
    readonly localJvmNodeCheckPassed: true;
    readonly durableReservationBound: false;
    readonly signedTransactionBytesPersisted: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly trackerAdmissionEstablished: false;
    readonly replayProtectionEstablished: false;
    readonly payoutEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export async function executeObservedAnchorTrackerCheckKernelV1(
  input: Readonly<ObservedAnchorTrackerCheckKernelV1Input>,
): Promise<Readonly<ObservedAnchorTrackerCheckKernelV1Result>> {
  const result = await executeObservedAnchorTrackerCheckKernel(
    input,
    'active',
  );
  return Object.freeze({
    ...result,
    boundaries: buildObservedAnchorTrackerCheckBoundaries('active'),
  });
}

export async function executeObservedAnchorTrackerCheckKernelV2(
  input: Readonly<ObservedAnchorTrackerCheckKernelV2Input>,
): Promise<Readonly<ObservedAnchorTrackerCheckKernelV2Result>> {
  const result = await executeObservedAnchorTrackerCheckKernel(
    input,
    'frozen',
  );
  return Object.freeze({
    ...result,
    boundaries: buildObservedAnchorTrackerCheckBoundaries('frozen'),
  });
}

export async function executeObservedAnchorTrackerReservationFreshnessCheckKernelV1(
  input: Readonly<
    ObservedAnchorTrackerReservationFreshnessCheckKernelV1Input
  >,
): Promise<Readonly<
  ObservedAnchorTrackerReservationFreshnessCheckKernelV1Result
>> {
  const result = await executeObservedAnchorTrackerCheckKernel(
    input,
    'reservation-freshness',
    input.expectedFrozenCheck,
  );
  assertReservationFreshnessMatchesFrozenCheck(
    result,
    input.expectedFrozenCheck,
  );
  return Object.freeze({
    ...result,
    boundaries: buildObservedAnchorTrackerCheckBoundaries(
      'reservation-freshness',
    ),
  });
}

function assertReservationFreshnessMatchesFrozenCheck(
  freshness: Readonly<ObservedAnchorTrackerCheckKernelResultBase>,
  frozen: Readonly<ObservedAnchorTrackerCheckKernelV2Result>,
): void {
  // Revalidation signs again, so proof and JVM-response bytes may change while
  // the unsigned transaction, authority, context, and checker remain exact.
  if (
    freshness.trackerInputBoxIdHex !== frozen.trackerInputBoxIdHex
    || freshness.statementIdHex !== frozen.statementIdHex
    || freshness.anchorHeaderIdHex !== frozen.anchorHeaderIdHex
    || freshness.anchorHeight !== frozen.anchorHeight
    || freshness.anchorContextIndex !== frozen.anchorContextIndex
    || freshness.unsignedTransactionIdHex !== frozen.unsignedTransactionIdHex
    || freshness.unsignedTransactionDigestHex
      !== frozen.unsignedTransactionDigestHex
    || freshness.signedTransactionIdHex !== frozen.signedTransactionIdHex
    || freshness.signer.derivation !== frozen.signer.derivation
    || freshness.signer.publicKeyHex !== frozen.signer.publicKeyHex
    || freshness.signer.p2pkErgoTreeHex !== frozen.signer.p2pkErgoTreeHex
    || freshness.signer.stateContextTipHeight
      !== frozen.signer.stateContextTipHeight
    || freshness.signer.stateContextTipIdHex
      !== frozen.signer.stateContextTipIdHex
    || freshness.checker.nodeOrigin !== frozen.checker.nodeOrigin
    || freshness.checker.path !== frozen.checker.path
    || freshness.checker.method !== frozen.checker.method
    || freshness.checker.transportPolicy !== frozen.checker.transportPolicy
  ) {
    throw new Error(
      'isolated tracker reservation freshness check differs from the frozen candidate',
    );
  }
}

function assertReservationFreshnessCandidateMatchesFrozenCheck(
  freshness: Readonly<{
    readonly trackerInputBoxIdHex: string;
    readonly statementIdHex: string;
    readonly anchorHeaderIdHex: string;
    readonly anchorHeight: number;
    readonly anchorContextIndex: number;
    readonly unsignedTransactionIdHex: string;
    readonly unsignedTransactionDigestHex: string;
  }>,
  frozen: Readonly<ObservedAnchorTrackerCheckKernelV2Result>,
): void {
  if (
    freshness.trackerInputBoxIdHex !== frozen.trackerInputBoxIdHex
    || freshness.statementIdHex !== frozen.statementIdHex
    || freshness.anchorHeaderIdHex !== frozen.anchorHeaderIdHex
    || freshness.anchorHeight !== frozen.anchorHeight
    || freshness.anchorContextIndex !== frozen.anchorContextIndex
    || freshness.unsignedTransactionIdHex !== frozen.unsignedTransactionIdHex
    || freshness.unsignedTransactionDigestHex
      !== frozen.unsignedTransactionDigestHex
  ) {
    throw new Error(
      'isolated tracker reservation freshness candidate differs from the frozen candidate',
    );
  }
}

async function executeObservedAnchorTrackerCheckKernel<
  TTarget extends
    | CheckpointBoundTargetV1
    | CheckpointBoundTargetV2
    | TrackerReservationFreshnessTargetV1,
>(
  input: Readonly<ObservedAnchorTrackerCheckKernelInput<TTarget>>,
  targetMode: 'active' | 'frozen' | 'reservation-freshness',
  expectedFrozenCheck?: Readonly<ObservedAnchorTrackerCheckKernelV2Result>,
): Promise<Readonly<ObservedAnchorTrackerCheckKernelResultBase>> {
  if (
    input.inputValue === null
    || typeof input.inputValue !== 'object'
    || Array.isArray(input.inputValue)
    || Object.keys(input.inputValue).sort().join('\0')
      !== 'context\0observedHeaderContext\0trackerInputBox'
  ) {
    throw new Error('isolated observed-anchor tracker check input is invalid');
  }
  const context = input.operations.captureContext(input.inputValue.context);
  const observedHeaderContext =
    input.operations.captureObservedHeaderContext(
      input.inputValue.observedHeaderContext,
    );
  if (
    context.trackerTransition.anchorContextProvenance
      !== 'eip0045-validity-tracker-observed-header-context'
  ) {
    throw new Error('isolated tracker check requires observed anchor provenance');
  }
  const before = input.operations.captureTargetBinding(input.target);
  const nodeOrigin = exactOrigin(
    input.target.primaryNodeOrigin,
    PRIMARY_NODE_ORIGIN,
    'observed-anchor tracker checker',
  );
  const activeTargetValid = targetMode === 'active'
    && input.target.primaryMining === true
    && input.target.witnessReadOnly === true
    && input.target.checkpointBound === true;
  const frozenTarget = input.target as Partial<CheckpointBoundTargetV2>;
  const frozenTargetValid = targetMode === 'frozen'
    && frozenTarget.primaryMining === false
    && frozenTarget.primaryReadOnly === true
    && frozenTarget.witnessReadOnly === true
    && frozenTarget.miningStopped === true
    && frozenTarget.checkpointBound === true
    && !('reservationFreshnessRevalidation' in frozenTarget);
  const freshnessTarget = input.target as Partial<
    TrackerReservationFreshnessTargetV1
  >;
  const freshnessTargetValid = targetMode === 'reservation-freshness'
    && freshnessTarget.primaryMining === false
    && freshnessTarget.primaryReadOnly === true
    && freshnessTarget.witnessReadOnly === true
    && freshnessTarget.miningStopped === true
    && freshnessTarget.checkpointBound === true
    && freshnessTarget.reservationFreshnessRevalidation === true;
  if (
    input.target.witnessNodeOrigin !== WITNESS_NODE_ORIGIN
    || (!activeTargetValid && !frozenTargetValid && !freshnessTargetValid)
  ) {
    const targetLabel = targetMode === 'reservation-freshness'
      ? 'reservation-freshness'
      : targetMode;
    throw new Error(
      `isolated tracker check target differs from the checkpoint-bound ${targetLabel} pair`,
    );
  }
  const anchor = context.trackerTransition.headers[
    context.trackerTransition.anchorContextIndex
  ];
  if (anchor === undefined || context.trackerTransition.headers.length !== 10) {
    throw new Error('isolated tracker check header context is incomplete');
  }
  assertObservedHeadersMatchTrackerContext(context, observedHeaderContext);
  if (
    context.contract.ergoAdmissionThreshold !== 1
    || context.contract.ergoAdmissionPublicKeysHex.length !== 1
    || context.contract.ergoAdmissionPublicKeysHex[0]
      !== input.expectedSigner.publicKeyHex
  ) {
    throw new Error('isolated tracker admission key differs from the signer');
  }
  const trackerInputBox = await input.operations.captureTrackerInputBox(
    context,
    input.inputValue.trackerInputBox,
  );
  const transaction = structuredClone(
    context.eip12UnsignedTransaction,
  ) as unknown as Eip12UnsignedTransaction;
  const minimalInput = transaction.inputs[0];
  if (
    transaction.inputs.length !== 1
    || minimalInput === undefined
    || minimalInput.boxId !== trackerInputBox.boxId
    || transaction.dataInputs.length !== 0
    || transaction.outputs.length !== 1
  ) {
    throw new Error('isolated tracker candidate input shape changed');
  }
  const enrichedTransaction: Eip12UnsignedTransaction = {
    ...transaction,
    inputs: [{
      ...trackerInputBox,
      extension: structuredClone(minimalInput.extension),
    }],
  };
  const independentlyDerivedId = fixedHex(
    await input.operations.deriveUnsignedTransactionId(enrichedTransaction),
    32,
    'isolated tracker independently derived transaction ID',
  );
  if (independentlyDerivedId !== context.unsignedTransactionIdHex) {
    throw new Error('isolated tracker candidate transaction ID changed');
  }
  const unsignedTransactionDigestHex = sha256CanonicalJson({
    trackerInputBoxIdHex: trackerInputBox.boxId,
    statementIdHex: context.statement.statementIdHex,
    anchorHeaderIdHex: anchor.id,
    anchorHeight: anchor.height,
    anchorContextIndex: context.trackerTransition.anchorContextIndex,
    eip12UnsignedTransaction: enrichedTransaction,
  }, TRANSACTION_DIGEST_DOMAIN);
  if (targetMode === 'reservation-freshness') {
    if (expectedFrozenCheck === undefined) {
      throw new Error(
        'isolated tracker reservation freshness lacks the frozen check',
      );
    }
    assertReservationFreshnessCandidateMatchesFrozenCheck({
      trackerInputBoxIdHex: trackerInputBox.boxId,
      statementIdHex: context.statement.statementIdHex,
      anchorHeaderIdHex: anchor.id,
      anchorHeight: anchor.height,
      anchorContextIndex: context.trackerTransition.anchorContextIndex,
      unsignedTransactionIdHex: context.unsignedTransactionIdHex,
      unsignedTransactionDigestHex,
    }, expectedFrozenCheck);
  }
  const batch = await input.operations.prepareCandidate({
    networkPrefix: input.expectedSigner.networkPrefix,
    nodeOrigin,
    role: 'observed-anchor-tracker',
    headers: observedHeaderContext.headers.map(header => header.raw),
    eip12Tx: enrichedTransaction,
    expectedTxId: context.unsignedTransactionIdHex,
  });
  const prepared = batch.candidates[0];
  if (
    batch.derivation !== 'wasm-root'
    || batch.pubKeyHex !== input.expectedSigner.publicKeyHex
    || batch.ergoTreeHex !== input.expectedSigner.p2pkErgoTreeHex
    || batch.candidates.length !== 1
    || prepared === undefined
    || prepared.role !== 'observed-anchor-tracker'
    || prepared.expectedTxId !== context.unsignedTransactionIdHex
    || prepared.signedCandidate.txId !== context.unsignedTransactionIdHex
    || batch.stateContextTipHeight
      !== context.trackerTransition.currentErgoHeight - 1
    || batch.stateContextTipIdHex !== context.trackerTransition.headers[0]!.id
  ) {
    throw new Error('isolated tracker signer or observed context binding changed');
  }
  const checked = await input.operations.checkCandidate(
    prepared.signedCandidate,
    nodeOrigin,
  );
  if (checked === null) {
    throw new Error('isolated local observed-anchor tracker JVM node check failed');
  }
  const signedBytesDigestHex = fixedHex(
    checked.signedTransactionBytesSha256Hex,
    32,
    'isolated tracker signed transaction bytes digest',
  );
  const signedBytesLength = positiveSafeInteger(
    checked.signedTransactionBytesLength,
    'isolated tracker signed transaction bytes length',
  );
  if (
    checked.txId !== context.unsignedTransactionIdHex
    || checked.signedTransactionDigestHex
      !== prepared.signedCandidate.signedTransactionDigestHex
    || signedBytesDigestHex
      !== prepared.signedCandidate.signedTransactionBytesSha256Hex
    || signedBytesLength
      !== prepared.signedCandidate.signedTransactionBytesLength
    || checked.signerContext.pubKeyHex !== input.expectedSigner.publicKeyHex
    || checked.signerContext.ergoTreeHex !== input.expectedSigner.p2pkErgoTreeHex
    || checked.signerContext.stateContextTipHeight
      !== batch.stateContextTipHeight
    || checked.signerContext.stateContextTipIdHex
      !== batch.stateContextTipIdHex
    || checked.checkerIdentity.nodeOrigin !== nodeOrigin
    || checked.checkerIdentity.path !== '/transactions/check'
    || checked.checkerIdentity.method !== 'POST'
    || checked.checkerIdentity.transportPolicy !== 'no-redirect-no-proxy'
  ) {
    throw new Error('isolated tracker signer and JVM node receipt disagree');
  }
  const after = input.operations.captureTargetBinding(input.target);
  if (
    after.processBindingDigestHex !== before.processBindingDigestHex
    || after.executionTargetIdentityDigestHex
      !== before.executionTargetIdentityDigestHex
  ) {
    throw new Error('isolated tracker checkpoint target changed during check');
  }
  return Object.freeze({
    trackerInputBoxIdHex: trackerInputBox.boxId,
    statementIdHex: context.statement.statementIdHex,
    anchorHeaderIdHex: anchor.id,
    anchorHeight: anchor.height,
    anchorContextIndex: context.trackerTransition.anchorContextIndex,
    unsignedTransactionIdHex: context.unsignedTransactionIdHex,
    unsignedTransactionDigestHex,
    signedTransactionIdHex: checked.txId,
    signedTransactionCanonicalJsonSha256Hex:
      checked.signedTransactionDigestHex,
    signedTransactionBytesSha256Hex: signedBytesDigestHex,
    signedTransactionBytesLength: signedBytesLength,
    checkResponseSha256Hex: sha256CanonicalJson({
      role: 'observed-anchor-tracker',
      response: checked.checkResult,
    }, CHECK_RESPONSE_DIGEST_DOMAIN),
    target: Object.freeze({
      processBindingDigestHex: after.processBindingDigestHex,
      executionTargetIdentityDigestHex:
        after.executionTargetIdentityDigestHex,
    }),
    signer: Object.freeze({
      derivation: 'wasm-root' as const,
      publicKeyHex: input.expectedSigner.publicKeyHex,
      p2pkErgoTreeHex: input.expectedSigner.p2pkErgoTreeHex,
      stateContextTipHeight: batch.stateContextTipHeight,
      stateContextTipIdHex: batch.stateContextTipIdHex,
    }),
    checker: Object.freeze({
      nodeOrigin,
      path: '/transactions/check' as const,
      method: 'POST' as const,
      transportPolicy: 'no-redirect-no-proxy' as const,
    }),
  });
}

function buildObservedAnchorTrackerCheckBoundaries(
  mode: 'active',
): Readonly<ObservedAnchorTrackerCheckKernelV1Result['boundaries']>;
function buildObservedAnchorTrackerCheckBoundaries(
  mode: 'frozen',
): Readonly<ObservedAnchorTrackerCheckKernelV2Result['boundaries']>;
function buildObservedAnchorTrackerCheckBoundaries(
  mode: 'reservation-freshness',
): Readonly<
  ObservedAnchorTrackerReservationFreshnessCheckKernelV1Result['boundaries']
>;
function buildObservedAnchorTrackerCheckBoundaries(
  mode: 'active' | 'frozen' | 'reservation-freshness',
): Readonly<Record<string, boolean>> {
  const shared = {
    localIsolatedDevnetOnly: true as const,
    observedAnchorContextBound: true as const,
    exactTrackerInputAndTransactionBound: true as const,
    localWasmRootSigningPerformed: true as const,
    localJvmNodeCheckPassed: true as const,
    signedTransactionBytesPersisted: false as const,
    submissionAuthorityEstablished: false as const,
    broadcastAuthorityEstablished: false as const,
    trackerAdmissionEstablished: false as const,
    replayProtectionEstablished: false as const,
    payoutEstablished: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  };
  if (mode === 'active') {
    return Object.freeze({
      ...shared,
      checkpointBoundActiveTarget: true as const,
    });
  }
  if (mode === 'frozen') {
    return Object.freeze({
      ...shared,
      checkpointBoundFrozenTarget: true as const,
    });
  }
  return Object.freeze({
    ...shared,
    reservationFreshnessRevalidationTarget: true as const,
    durableReservationBound: false as const,
  });
}

function assertObservedHeadersMatchTrackerContext(
  context: Readonly<SubstrateFederatedTrackerV1Context>,
  observed: Readonly<BridgeValidityTrackerObservedHeaderContextV1>,
): void {
  const tracker = context.trackerTransition;
  if (
    observed.currentHeight !== tracker.currentErgoHeight
    || observed.anchorContextIndex !== tracker.anchorContextIndex
    || observed.headers.length !== tracker.headers.length
  ) {
    throw new Error(
      'isolated observed header context differs from the tracker candidate',
    );
  }
  for (let index = 0; index < tracker.headers.length; index += 1) {
    const trackerHeader = tracker.headers[index]!;
    const observedHeader = observed.headers[index]!;
    if (
      observedHeader.id !== trackerHeader.id
      || observedHeader.height !== trackerHeader.height
      || observedHeader.extensionRootHex !== trackerHeader.extensionRootHex
      || observedHeader.jvmHeaderJson !== trackerHeader.jvmHeaderJson
      || observedHeader.serializedHex !== trackerHeader.serializedHex
    ) {
      throw new Error(
        'isolated observed header context differs from the tracker candidate',
      );
    }
  }
}

function exactOrigin(value: string, expected: string, label: string): string {
  let normalized: string;
  try {
    normalized = new URL(value).origin;
  } catch {
    throw new Error(`isolated ${label} node origin is invalid`);
  }
  if (normalized !== value || normalized !== expected) {
    throw new Error(`isolated ${label} node origin changed`);
  }
  return normalized;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be ${bytes} lowercase bytes`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value <= 0
  ) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}
