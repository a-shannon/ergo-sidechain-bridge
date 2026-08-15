/**
 * WP-06T1 source-to-tracker conformance.
 *
 * This command builds the native verifier from the pinned Frontier source,
 * replays the public synthetic RPC and receipt vectors, derives one exact
 * aggregate-finality commitment and 0x0401 field, then evaluates tracker
 * admission in sigma-rust and in the pinned JVM interpreter. Cargo may fetch
 * missing locked dependencies. VM execution uses generated in-memory keys; the
 * JVM adapter writes only the exact secret-free signed fixture to an isolated
 * per-run directory and deletes it after execution. The command has no external
 * wallet or wallet-state access, chain RPC, submit, broadcast, deployment,
 * database, or mutable runtime-state capability.
 */

import { createHash } from 'crypto';
import { isAbsolute, resolve } from 'path';
import { fileURLToPath } from 'url';
import { isDeepStrictEqual } from 'util';

import {
  assertWp06SourceDerivedFixtureProvenance,
  collectWp06SourceDerivedFixture,
  runWp06SourceDerivedAdversarialMatrix,
  WP06_SOURCE_DERIVED_NEGATIVE_CASES,
  type Wp06SourceDerivedFixture,
} from '../../test-fixtures/wp06-source-derived-fixture.js';
import {
  AUTHENTICATED_SPV_TRACKER_NEGATIVE_CASES,
  type AuthenticatedSpvTrackerVmAdmissionResult,
  runAuthenticatedSpvTrackerVm,
} from './spike13-authenticated-spv-tracker-vm.js';
import {
  decodeAuthenticatedSpvTrackerValue,
  getAuthenticatedSpvTrackerDigest,
  type AuthenticatedSpvTrackerHistoryEntry,
} from '../../spv-tracker-authenticated.js';
import type {
  AuthenticatedV2JvmVmConformanceReport,
} from '../../authenticated-v2-source-tree-conformance.js';
import {
  assertWp06CanonicalJvmHeaderVectorProvenance,
  getWp06CanonicalJvmHeaderWindow,
  loadWp06CanonicalJvmHeaderVector,
  WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE,
} from '../../wp06-canonical-jvm-header-chain.js';
import {
  assertExactExecutableErgoTree,
  assertWp06SignedSuccessorBinding,
  assertWp06TrackerJvmReplayReport,
  type Wp06JvmReplayBinding,
} from '../../wp06-source-bound-jvm-validation.js';

const LINKED_DUPLICATE_PREVENTION_NFT_ID = 'b2'.repeat(32);
const JVM_EXECUTABLE_TARGET_BURN_ID_HEX =
  'f35e408ecfd1d5b585b9d39aca25af08362f66ef0b95413e6f0526229235645e';

interface Arguments {
  frontierSourcePath: string;
  ergoSourcePath: string;
  cargoExecutablePath: string;
  rustcExecutablePath: string;
  gitExecutablePath: string;
}

export interface Wp06SourceToTrackerVmResult {
  sourceBindings: {
    sidechainIdHex: string;
    sidechainHeight: string;
    executionBlockHashHex: string;
    bridgeEventRootHex: string;
    checkpointCommitmentHex: string;
    aggregateFinalityProofDigestHex: string;
    burnIdHex: string;
    extensionKeyHex: '0401';
    extensionRootHex: string;
    trackerKeyHex: string;
    trackerValueHex: string;
    trackerAdmissionTransactionIdHex: string;
  };
  nativeBuildIdentity: NonNullable<Wp06SourceDerivedFixture['nativeBuildIdentity']>;
  canonicalHeaderVector: Readonly<{
    fileSha256Hex: string;
    anchorIdHex: string;
    anchorHeight: number;
    anchorExtensionRootHex: string;
  }>;
  checkpoint: Wp06SourceDerivedFixture['checkpoint']['checkpointCommitment'];
  aggregateFinalityProof: Wp06SourceDerivedFixture['aggregateFinalityProof'];
  aggregateFinalityCommitment: Wp06SourceDerivedFixture['aggregateFinalityCommitment'];
  targetBurn: Wp06SourceDerivedFixture['targetBurn'];
  pegOut: Wp06SourceDerivedFixture['pegOut'];
  burnProofBundle: Wp06SourceDerivedFixture['proofBundle'];
  extensionMembership: Wp06SourceDerivedFixture['extension'];
  trackerHistoryBefore: ReadonlyArray<Readonly<AuthenticatedSpvTrackerHistoryEntry>>;
  trackerHistoryAfterAdmission: ReadonlyArray<Readonly<AuthenticatedSpvTrackerHistoryEntry>>;
  trackerAdmission: AuthenticatedSpvTrackerVmAdmissionResult['plan'];
  trackerAdmissionHeaderContext: Readonly<{
    currentHeight: number;
    anchorContextIndex: number;
    anchorHeader: Readonly<AuthenticatedSpvTrackerVmAdmissionResult['anchorHeader']>;
    headers: ReadonlyArray<
      Readonly<AuthenticatedSpvTrackerVmAdmissionResult['anchorHeader']>
    >;
    vectorFileSha256Hex: string;
    provenance: typeof WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE;
  }>;
  trackerAdmissionJvmConformanceReport: Readonly<AuthenticatedV2JvmVmConformanceReport>;
  trackerAdmissionJvmReplayBinding: Readonly<Wp06JvmReplayBinding>;
  admittedTrackerSuccessor: Readonly<Record<string, unknown>>;
  trackerTree: string;
  negativeCases: readonly string[];
  sourceNegativeCases: readonly string[];
  boundary: {
    sourceDerivedPublicFixture: true;
    sourceDependencyFetchPrevented: false;
    chainRpcAccessEnabled: false;
    chainRpcWritesEnabled: false;
    ephemeralInMemorySigningUsed: true;
    externalWalletStateAccessed: false;
    sourceBoundPinnedJvmTrackerReplayVerified: true;
    r9FinalityAuthority: true;
    gate5Closed: false;
    submitOrBroadcastEnabled: false;
  };
}

const WP06_SOURCE_TO_TRACKER_RESULTS = new WeakSet<object>();

export function assertWp06SourceToTrackerVmResultProvenance(
  value: unknown,
): asserts value is Wp06SourceToTrackerVmResult {
  if (
    typeof value !== 'object'
    || value === null
    || !WP06_SOURCE_TO_TRACKER_RESULTS.has(value)
    || !isDeepFrozen(value)
  ) {
    throw new Error('tracker successor lacks immutable WP-06 source-to-tracker provenance');
  }
  assertWp06SourceToTrackerHandoffConsistency(value as Wp06SourceToTrackerVmResult);
}

export async function runWp06SourceToTrackerVm(
  input: Arguments,
): Promise<Wp06SourceToTrackerVmResult> {
  requireAbsolutePaths(input);
  const fixture = await collectWp06SourceDerivedFixture({
    frontierSourcePath: input.frontierSourcePath,
    cargoExecutablePath: input.cargoExecutablePath,
    rustcExecutablePath: input.rustcExecutablePath,
    gitExecutablePath: input.gitExecutablePath,
    targetBurnIdHex: JVM_EXECUTABLE_TARGET_BURN_ID_HEX,
  });
  assertWp06SourceDerivedFixtureProvenance(fixture);
  if (!fixture.nativeBuildIdentity) {
    throw new Error('WP-06 source-to-tracker replay requires exact native build identities');
  }
  const sourceNegativeCases = await runWp06SourceDerivedAdversarialMatrix(fixture);
  assertWp06SourceDerivedFixtureProvenance(fixture);
  const wasm = await getWasm();
  assertExactExecutableErgoTree(
    wasm,
    fixture.targetBurn.recipientErgoTreeHex,
    'WP-06 T1 target-burn recipient',
  );
  const canonicalVector = loadWp06CanonicalJvmHeaderVector();
  assertWp06CanonicalJvmHeaderVectorProvenance(canonicalVector);
  if (
    canonicalVector.anchorExtensionRootHex !== fixture.extension.rootHex
    || canonicalVector.anchorHeight !== 99_995
  ) {
    throw new Error('WP-06 canonical JVM header vector does not bind the source extension root');
  }
  const trackerHeaderWindow = getWp06CanonicalJvmHeaderWindow(
    canonicalVector,
    'trackerAdmission',
  );

  const admission = await runAuthenticatedSpvTrackerVm({
    ergoSourcePath: input.ergoSourcePath,
    injection: {
      checkpoint: fixture.checkpoint.checkpointCommitment,
      aggregateFinalityCommitment: fixture.aggregateFinalityCommitment,
      extension: {
        keyHex: fixture.extension.keyHex,
        valueHex: fixture.extension.valueHex,
        fields: fixture.extension.fields.map(field => ({
          key: Buffer.from(field.keyHex, 'hex'),
          value: Buffer.from(field.valueHex, 'hex'),
        })),
        proofHex: fixture.extension.proofHex,
        rootHex: fixture.extension.rootHex,
      },
      burnProof: fixture.proofBundle.proof,
    },
    syntheticContext: true,
    jvmConformance: true,
    duplicatePreventionNftId: LINKED_DUPLICATE_PREVENTION_NFT_ID,
    canonicalSyntheticHeaderWindow: trackerHeaderWindow,
  });
  assertWp06SourceDerivedFixtureProvenance(fixture);
  assertWp06CanonicalJvmHeaderVectorProvenance(canonicalVector);
  const admittedTrackerValue = decodeAuthenticatedSpvTrackerValue(
    admission.plan.trackerValueHex,
  );
  const trackerJvmReport = admission.jvmConformanceReport;
  const trackerJvmBinding = admission.jvmReplayBinding;

  if (
    admission.plan.checkpointCommitmentHex
      !== fixture.checkpoint.checkpointCommitment.checkpointCommitmentHex
    || admittedTrackerValue.bridgeEventRootHex !== fixture.join.bridgeEventRootHex
    || admittedTrackerValue.finalityProofDigestHex
      !== fixture.aggregateFinalityCommitment.proofDigestHex
    || !isDeepStrictEqual(
      admission.admittedSuccessor.additionalRegisters,
      admission.plan.successorRegisters,
    )
    || !isDeepStrictEqual(
      admission.negativeCases,
      AUTHENTICATED_SPV_TRACKER_NEGATIVE_CASES,
    )
    || !trackerJvmReport
    || !trackerJvmBinding
  ) {
    throw new Error('WP-06 source-derived identity drifted before tracker VM admission');
  }
  assertWp06TrackerJvmReplayReport({
    report: trackerJvmReport,
    binding: trackerJvmBinding,
    signedTransactionIdHex: String(admission.signedTransaction.id),
    trackerNftId: 'a1'.repeat(32),
    duplicatePreventionNftId: LINKED_DUPLICATE_PREVENTION_NFT_ID,
    trackerTreeSha256Hex: sha256HexBytes(admission.trackerTree),
  });

  console.log('PASS pinned-source native GRANDPA and runtime-state conformance.');
  console.log('PASS Frontier receipt extraction and burn inclusion binding.');
  console.log('PASS source-derived adversarial matrix rejected every exact case.');
  console.log('PASS exact 0x0401 membership and proof-bound tracker VM admission.');
  console.log('PASS exact source-bound tracker admission in the pinned JVM interpreter.');
  console.log(`Tracker successor: ${String(admission.admittedSuccessor.boxId)}`);
  console.log(
    'BOUNDARY: public synthetic chain fixtures and generated in-memory signing keys only; the ' +
    'secret-free JVM fixture is deleted after isolated per-run execution. Cargo may fetch missing ' +
    'locked dependencies, the pinned local build lacks complete tool/dependency attestation, and ' +
    'no external wallet state is accessed. R9 remains the finality authority and Ergo does not verify GRANDPA ' +
    'payload semantics. Admission eligibility, node stateful acceptance, committee-bypass ' +
    'prevention, Gate 5 closure, submit, broadcast, deployment, trustless, and production-ready ' +
    'claims remain false.',
  );

  const retainedHeaders = admission.headerContext.headers.map(header => structuredClone(header));
  const retainedAnchorHeader = retainedHeaders[admission.headerContext.anchorContextIndex];
  if (!retainedAnchorHeader) {
    throw new Error('WP-06 tracker admission did not retain its exact anchor header');
  }
  if (admission.headerContext.provenance !== WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE) {
    throw new Error('WP-06 tracker handoff requires its JVM-canonical synthetic header context');
  }
  const trackerAdmissionHeaderContext = {
    currentHeight: admission.headerContext.currentHeight,
    anchorContextIndex: admission.headerContext.anchorContextIndex,
    anchorHeader: retainedAnchorHeader,
    headers: retainedHeaders,
    vectorFileSha256Hex: canonicalVector.fileSha256Hex,
    provenance: WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE,
  };
  const result = deepFreeze({
    sourceBindings: {
      sidechainIdHex: fixture.checkpoint.checkpointCommitment.checkpoint.sidechainIdHex,
      sidechainHeight: String(
        fixture.checkpoint.checkpointCommitment.checkpoint.sidechainHeight,
      ),
      executionBlockHashHex:
        fixture.checkpoint.checkpointCommitment.checkpoint.executionBlockHashHex,
      bridgeEventRootHex: fixture.join.bridgeEventRootHex,
      checkpointCommitmentHex:
        fixture.checkpoint.checkpointCommitment.checkpointCommitmentHex,
      aggregateFinalityProofDigestHex:
        fixture.aggregateFinalityCommitment.proofDigestHex,
      burnIdHex: fixture.proofBundle.proof.leaf.burnIdHex,
      extensionKeyHex: '0401' as const,
      extensionRootHex: fixture.extension.rootHex,
      trackerKeyHex: admission.plan.trackerKeyHex,
      trackerValueHex: admission.plan.trackerValueHex,
      trackerAdmissionTransactionIdHex: trackerJvmReport.transactionIdHex,
    },
    nativeBuildIdentity: structuredClone(fixture.nativeBuildIdentity),
    canonicalHeaderVector: {
      fileSha256Hex: canonicalVector.fileSha256Hex,
      anchorIdHex: canonicalVector.anchorIdHex,
      anchorHeight: canonicalVector.anchorHeight,
      anchorExtensionRootHex: canonicalVector.anchorExtensionRootHex,
    },
    checkpoint: structuredClone(fixture.checkpoint.checkpointCommitment),
    aggregateFinalityProof: structuredClone(fixture.aggregateFinalityProof),
    aggregateFinalityCommitment: structuredClone(fixture.aggregateFinalityCommitment),
    targetBurn: structuredClone(fixture.targetBurn),
    pegOut: structuredClone(fixture.pegOut),
    burnProofBundle: structuredClone(fixture.proofBundle),
    extensionMembership: structuredClone(fixture.extension),
    trackerHistoryBefore: [] as const,
    trackerHistoryAfterAdmission: [{
      key: admission.plan.trackerKeyHex,
      value: admission.plan.trackerValueHex,
    }],
    trackerAdmission: structuredClone(admission.plan),
    trackerAdmissionHeaderContext,
    trackerAdmissionJvmConformanceReport: structuredClone(trackerJvmReport),
    trackerAdmissionJvmReplayBinding: structuredClone(trackerJvmBinding),
    admittedTrackerSuccessor: structuredClone(admission.admittedSuccessor),
    trackerTree: admission.trackerTree,
    negativeCases: [...admission.negativeCases],
    sourceNegativeCases: [...sourceNegativeCases],
    boundary: {
      sourceDerivedPublicFixture: true as const,
      sourceDependencyFetchPrevented: false as const,
      chainRpcAccessEnabled: false as const,
      chainRpcWritesEnabled: false as const,
      ephemeralInMemorySigningUsed: true as const,
      externalWalletStateAccessed: false as const,
      sourceBoundPinnedJvmTrackerReplayVerified: true as const,
      r9FinalityAuthority: true as const,
      gate5Closed: false as const,
      submitOrBroadcastEnabled: false as const,
    },
  });
  WP06_SOURCE_TO_TRACKER_RESULTS.add(result);
  assertWp06SourceToTrackerVmResultProvenance(result);
  console.log('PASS immutable source-specific tracker handoff with retained proof material.');
  return result;
}

function requireAbsolutePaths(input: Arguments): void {
  for (const [label, value] of [
    ['Frontier source', input.frontierSourcePath],
    ['Ergo source', input.ergoSourcePath],
    ['Cargo executable', input.cargoExecutablePath],
    ['rustc executable', input.rustcExecutablePath],
    ['Git executable', input.gitExecutablePath],
  ] as const) {
    if (!isAbsolute(value)) throw new Error(`${label} path must be absolute`);
  }
}

function parseArguments(argv: string[]): Arguments {
  const optionNames = [
    '--frontier-source',
    '--ergo-source',
    '--cargo',
    '--rustc',
    '--git',
  ] as const;
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (
      !optionNames.includes(option as typeof optionNames[number])
      || !value
      || value.startsWith('--')
      || values.has(option)
    ) {
      throw new Error(
        'usage: spike15-wp06-source-to-tracker-vm ' +
        '--frontier-source <absolute-path> --ergo-source <absolute-path> ' +
        '--cargo <absolute-path> --rustc <absolute-path> --git <absolute-path>',
      );
    }
    values.set(option, value);
  }
  for (const option of optionNames) {
    if (!values.has(option)) throw new Error(`missing required option ${option}`);
  }
  return {
    frontierSourcePath: values.get('--frontier-source')!,
    ergoSourcePath: values.get('--ergo-source')!,
    cargoExecutablePath: values.get('--cargo')!,
    rustcExecutablePath: values.get('--rustc')!,
    gitExecutablePath: values.get('--git')!,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (ArrayBuffer.isView(value)) {
    throw new Error('WP-06 source-to-tracker handoffs must not retain mutable binary views');
  }
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value)
    && Object.values(value as Record<string, unknown>).every(isDeepFrozen);
}

function assertWp06SourceToTrackerHandoffConsistency(
  result: Wp06SourceToTrackerVmResult,
): void {
  const afterAdmission = result.trackerHistoryAfterAdmission.map(entry => ({
    key: entry.key,
    value: entry.value,
  }));
  assertWp06TrackerJvmReplayReport({
    report: result.trackerAdmissionJvmConformanceReport,
    binding: result.trackerAdmissionJvmReplayBinding,
    signedTransactionIdHex: result.sourceBindings.trackerAdmissionTransactionIdHex,
    trackerNftId: 'a1'.repeat(32),
    duplicatePreventionNftId: LINKED_DUPLICATE_PREVENTION_NFT_ID,
    trackerTreeSha256Hex: sha256HexBytes(result.trackerTree),
  });
  assertWp06SignedSuccessorBinding({
    signedTransactionIdHex: result.sourceBindings.trackerAdmissionTransactionIdHex,
    successorTransactionIdHex: result.admittedTrackerSuccessor.transactionId,
    successorIndex: result.admittedTrackerSuccessor.index,
  });
  const coherent =
    result.checkpoint.checkpointCommitmentHex === result.sourceBindings.checkpointCommitmentHex
    && result.aggregateFinalityProof.verifierProfileIdHex
      === result.nativeBuildIdentity.verifierExecutableSha256Hex
    && result.checkpoint.checkpoint.bridgeEventRootHex === result.sourceBindings.bridgeEventRootHex
    && result.aggregateFinalityProof.proofDigestHex
      === result.sourceBindings.aggregateFinalityProofDigestHex
    && result.aggregateFinalityCommitment.proofDigestHex
      === result.sourceBindings.aggregateFinalityProofDigestHex
    && result.aggregateFinalityCommitment.statement.encodedCheckpointHex
      === result.checkpoint.encodedCheckpointHex
    && result.targetBurn.burnIdHex === result.sourceBindings.burnIdHex
    && result.targetBurn.sidechainTxHashHex
      === result.burnProofBundle.proof.leaf.sidechainTxHashHex
    && result.targetBurn.eventIndex === result.burnProofBundle.proof.leaf.eventIndex
    && result.targetBurn.recipientErgoTreeHashHex
      === result.burnProofBundle.proof.leaf.recipientErgoTreeHashHex
    && result.targetBurn.amountNanoErg
      === result.burnProofBundle.proof.leaf.amountNanoErg
    && result.pegOut.user === result.targetBurn.userAddress
    && result.pegOut.amount.toString() === result.targetBurn.amountNanoErg
    && result.pegOut.ergoRecipientAddress === result.targetBurn.recipientErgoTreeHex
    && result.pegOut.sidechainTxHash === result.targetBurn.sidechainTxHashHex
    && result.pegOut.sidechainBlockNumber.toString() === result.sourceBindings.sidechainHeight
    && result.pegOut.sidechainBlockHash === result.sourceBindings.executionBlockHashHex
    && result.pegOut.sidechainLogIndex === result.targetBurn.logIndex
    && result.burnProofBundle.proof.leaf.sidechainIdHex
      === result.sourceBindings.sidechainIdHex
    && result.burnProofBundle.proof.leaf.sidechainBlockHashHex
      === result.sourceBindings.executionBlockHashHex
    && result.burnProofBundle.proof.leaf.assetIdHex === '00'.repeat(32)
    && result.burnProofBundle.proof.leaf.burnIdHex === result.sourceBindings.burnIdHex
    && result.burnProofBundle.proof.bridgeEventRootHex
      === result.sourceBindings.bridgeEventRootHex
    && result.extensionMembership.keyHex === result.sourceBindings.extensionKeyHex
    && result.extensionMembership.valueHex === result.checkpoint.extensionValueHex
    && result.extensionMembership.rootHex === result.sourceBindings.extensionRootHex
    && result.trackerAdmission.trackerKeyHex === result.sourceBindings.trackerKeyHex
    && result.trackerAdmission.trackerValueHex === result.sourceBindings.trackerValueHex
    && result.trackerAdmission.checkpointCommitmentHex
      === result.sourceBindings.checkpointCommitmentHex
    && result.trackerAdmission.aggregateFinalityCommitmentHex
      === result.aggregateFinalityCommitment.encodedCommitmentHex
    && result.trackerAdmission.avlInsertProofHex.length > 0
    && result.trackerAdmission.proofBundleHex.length > 0
    && result.sourceBindings.trackerAdmissionTransactionIdHex
      === result.trackerAdmissionJvmConformanceReport.transactionIdHex
    && result.canonicalHeaderVector.fileSha256Hex
      === result.trackerAdmissionHeaderContext.vectorFileSha256Hex
    && result.canonicalHeaderVector.anchorIdHex
      === result.trackerAdmissionHeaderContext.anchorHeader.id
    && result.canonicalHeaderVector.anchorHeight
      === result.trackerAdmissionHeaderContext.anchorHeader.height
    && result.canonicalHeaderVector.anchorExtensionRootHex
      === result.sourceBindings.extensionRootHex
    && result.trackerAdmissionJvmConformanceReport.preHeaderParentIdHex
      === result.trackerAdmissionHeaderContext.headers[0].id
    && result.trackerAdmissionJvmConformanceReport.preHeaderHeight
      === result.trackerAdmissionHeaderContext.currentHeight
    && result.trackerAdmissionJvmConformanceReport.headerIdsSha256Hex === sha256Text(
      result.trackerAdmissionHeaderContext.headers.map(header => header.id).join('\n'),
    )
    && result.trackerHistoryBefore.length === 0
    && result.trackerHistoryAfterAdmission.length === 1
    && result.trackerHistoryAfterAdmission[0]?.key === result.sourceBindings.trackerKeyHex
    && result.trackerHistoryAfterAdmission[0]?.value === result.sourceBindings.trackerValueHex
    && result.trackerAdmission.inputDigestHex
      === getAuthenticatedSpvTrackerDigest([])
    && result.trackerAdmission.successorDigestHex
      === getAuthenticatedSpvTrackerDigest(afterAdmission)
    && isConsistentRetainedHeaderContext(result)
    && isDeepStrictEqual(
      result.admittedTrackerSuccessor.additionalRegisters,
      result.trackerAdmission.successorRegisters,
    )
    && isDeepStrictEqual(
      result.negativeCases,
      AUTHENTICATED_SPV_TRACKER_NEGATIVE_CASES,
    )
    && isDeepStrictEqual(
      result.sourceNegativeCases,
      WP06_SOURCE_DERIVED_NEGATIVE_CASES,
    )
    && result.boundary.sourceDerivedPublicFixture === true
    && result.boundary.sourceBoundPinnedJvmTrackerReplayVerified === true
    && result.boundary.r9FinalityAuthority === true
    && result.boundary.gate5Closed === false
    && result.boundary.submitOrBroadcastEnabled === false;
  if (!coherent) {
    throw new Error('immutable WP-06 source-to-tracker handoff is internally inconsistent');
  }
}

function isConsistentRetainedHeaderContext(
  result: Wp06SourceToTrackerVmResult,
): boolean {
  const context = result.trackerAdmissionHeaderContext;
  if (
    !context
    || context.provenance !== WP06_CANONICAL_JVM_HEADER_CONTEXT_PROVENANCE
    || !Number.isSafeInteger(context.currentHeight)
    || context.headers.length !== 10
    || !Number.isSafeInteger(context.anchorContextIndex)
    || context.anchorContextIndex < 0
    || context.anchorContextIndex >= context.headers.length
    || context.anchorHeader !== context.headers[context.anchorContextIndex]
    || context.anchorHeader.id !== result.trackerAdmission.anchorHeader.idHex
    || context.anchorHeader.height !== result.trackerAdmission.anchorHeader.height
    || context.anchorHeader.extensionRootHex
      !== result.trackerAdmission.anchorHeader.extensionRootHex
    || context.anchorHeader.extensionRootHex !== result.sourceBindings.extensionRootHex
    || context.currentHeight - context.anchorHeader.height
      !== context.anchorContextIndex + 1
    || Number(result.admittedTrackerSuccessor.creationHeight) !== context.currentHeight
  ) {
    return false;
  }
  const ids = new Set<string>();
  for (let index = 0; index < context.headers.length; index += 1) {
    const header = context.headers[index];
    if (
      !header
      || header.height !== context.currentHeight - index - 1
      || header.raw.id !== header.id
      || header.raw.parentId !== header.parentId
      || header.raw.height !== header.height
      || header.raw.extensionHash !== header.extensionRootHex
      || !/^[0-9a-f]{64}$/i.test(header.id)
      || !/^[0-9a-f]{64}$/i.test(header.parentId)
      || !/^[0-9a-f]{64}$/i.test(header.extensionRootHex)
      || ids.has(header.id)
      || (index + 1 < context.headers.length
        && header.parentId !== context.headers[index + 1].id)
    ) {
      return false;
    }
    ids.add(header.id);
  }
  return true;
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256HexBytes(value: string): string {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) throw new Error('tracker tree must be even-length hex');
  return createHash('sha256').update(Buffer.from(value, 'hex')).digest('hex');
}

async function getWasm(): Promise<any> {
  const imported = await import('ergo-lib-wasm-nodejs');
  return (imported as any).default ?? imported;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runWp06SourceToTrackerVm(parseArguments(process.argv.slice(2))).catch(error => {
    console.error('FATAL:', error);
    process.exit(1);
  });
}
