import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import blakejs from 'blakejs';
import { describe, expect, it } from 'vitest';

import { AggregateSettlementService } from './aggregate-settlement-service.js';
import {
  observeAuthenticatedV2Funding,
  type AuthenticatedV2FundingObservationFetch,
  type AuthenticatedV2FundingObservationReport,
} from './authenticated-v2-funding-observation.js';
import {
  AUTHENTICATED_V2_PRE_SETUP_FUNDING_REVALIDATION_SCHEMA,
  revalidateAuthenticatedV2PreSetupFunding,
  validateAuthenticatedV2PreSetupFundingRevalidationReport,
  type AuthenticatedV2PreSetupFundingRevalidationReport,
} from './authenticated-v2-pre-setup-funding-revalidation.js';
import {
  AUTHENTICATED_V2_PROVISIONING_SCHEMA,
  assessAuthenticatedV2ProvisioningFunding,
  buildAuthenticatedV2ProvisioningPlan,
  type AuthenticatedV2ProvisioningInput,
  type AuthenticatedV2ProvisioningPlan,
  type ProvisioningContractInput,
} from './authenticated-v2-provisioning-plan.js';
import {
  AUTHENTICATED_V2_SETUP_JVM_CHECK_SCHEMA,
  runAuthenticatedV2SetupJvmCheck,
  type AuthenticatedV2SetupJvmCheckDependencies,
  type AuthenticatedV2SetupJvmCheckRequest,
} from './authenticated-v2-setup-jvm-check.js';
import {
  AUTHENTICATED_V2_SOURCE_TREE_CONFORMANCE_SCHEMA,
  type AuthenticatedV2SourceTreeConformanceReport,
} from './authenticated-v2-source-tree-conformance.js';
import {
  AUTHENTICATED_V2_ADMISSION_STAGE_SCHEMA,
  AUTHENTICATED_V2_SETTLEMENT_STAGE_SCHEMA,
  buildAuthenticatedV2AdmissionStagePlan,
  buildAuthenticatedV2SettlementStagePlan,
  type AuthenticatedV2ChainSnapshot,
  type AuthenticatedV2ConfirmedBoxObservation,
  type AuthenticatedV2FreshHeaderContext,
} from './authenticated-v2-stage-rebuild.js';
import {
  buildBridgeCheckpointFromBurnsV1,
  BRIDGE_EXTENSION_KEY_HEX,
} from './bridge-checkpoint-commitment.js';
import { buildAggregateFinalityCommitmentV1 } from './bridge-finality-commitment.js';
import {
  buildAggregateFinalityProofV1,
  buildBridgeFinalityStatementV1,
} from './bridge-finality-proof.js';
import { encodeSigmaPropRegister } from './ergo-encoding.js';
import { buildErgoExtensionMembershipProof } from './ergo-extension-membership.js';
import {
  buildTrustlessBurnInclusionProof,
  deriveTrustlessBurnIdHex,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';
import {
  deriveUnsignedTransactionId,
  type LocalWasmCheckAcceptance,
  type PreparedLocalWasmCheckSigner,
} from './fleet-signer.js';

const COMMITTEE_PUBKEY =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const FINALITY_ATTESTOR_PUBKEY =
  '02671c8e95c0237797901a6cdb2ef8e6599400578385455f3423f77e43df39aad5';
const FUNDING_TREE = `0008cd02${COMMITTEE_PUBKEY.slice(2)}`;
const RECIPIENT_TREE = `0008cd02${COMMITTEE_PUBKEY.slice(2)}`;
const TRACKER_TREE = '1000';
const UNLOCK_TREE = '1001';
const DUP_TREE = '10010100d17300';
const SIDECHAIN_ID = '11'.repeat(32);
const EXECUTION_HASH = '22'.repeat(32);
const SIDECHAIN_TX_HASH = '55'.repeat(32);
const PRIOR_TIP_ID = 'a5'.repeat(32);
const FRESH_TIP_ID = 'a6'.repeat(32);
const PRIOR_OBSERVED_AT = '2026-07-12T12:00:00.000Z';
const FRESH_OBSERVED_AT = '2026-07-12T12:05:00.000Z';
const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: `0008cd02${'22'.repeat(32)}`,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};

function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Tree(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'hex')).digest('hex');
}

function sha256Canonical(value: unknown): string {
  const canonical = (item: unknown): string => {
    if (item === undefined) return 'null';
    if (item === null || typeof item === 'string' || typeof item === 'boolean') {
      return JSON.stringify(item);
    }
    if (typeof item === 'number') return JSON.stringify(item);
    if (typeof item === 'bigint') return JSON.stringify(item.toString());
    if (Array.isArray(item)) return `[${item.map(canonical).join(',')}]`;
    const record = item as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => (
      `${JSON.stringify(key)}:${canonical(record[key])}`
    )).join(',')}}`;
  };
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function blake2b256(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function contractInput(path: string, ergoTreeHex: string): ProvisioningContractInput {
  const sourceTemplate = readFileSync(new URL(path, import.meta.url), 'utf8');
  return {
    sourceTemplate,
    sourceTemplateSha256Hex: sha256Utf8(sourceTemplate),
    ergoTreeHex,
    ergoTreeSha256Hex: sha256Tree(ergoTreeHex),
  };
}

async function fundingBoxes(options: {
  trackerValue?: string;
  trackerAssets?: Eip12Box['assets'];
} = {}): Promise<[Eip12Box, Eip12Box]> {
  const trackerValue = BigInt(options.trackerValue ?? '100000000');
  const materialized = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [
      {
        value: trackerValue,
        ergoTree: FUNDING_TREE,
        assets: options.trackerAssets ?? [],
        additionalRegisters: {},
        creationHeight: 110,
      },
      {
        value: BigInt(BASE_INPUT.value) - trackerValue,
        ergoTree: FUNDING_TREE,
        assets: [],
        additionalRegisters: {},
        creationHeight: 110,
      },
    ],
  }, 'funding-box fixture');
  return [materialized.outputs[0], materialized.outputs[1]];
}

async function sigmaBytes(box: Eip12Box): Promise<string> {
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
  try {
    return Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
  } finally {
    parsed.free?.();
  }
}

async function fundingObservationFetch(
  tracker: Eip12Box,
  dupVault: Eip12Box,
  options: {
    network?: string;
    tipHeight?: number;
    tipIdHex?: string;
    postTipIdHex?: string;
    trackerStatus?: number;
    dupVaultStatus?: number;
  } = {},
): Promise<{
  fetchFn: AuthenticatedV2FundingObservationFetch;
  calls: string[];
}> {
  const trackerBytes = await sigmaBytes(tracker);
  const dupVaultBytes = await sigmaBytes(dupVault);
  const calls: string[] = [];
  let headerReads = 0;
  const tipHeight = options.tipHeight ?? 120;
  const tipIdHex = options.tipIdHex ?? PRIOR_TIP_ID;
  const fetchFn: AuthenticatedV2FundingObservationFetch = async input => {
    const path = new URL(String(input)).pathname;
    calls.push(path);
    if (path === '/info') {
      return new Response(JSON.stringify({
        network: options.network ?? 'testnet',
        fullHeight: tipHeight,
      }), { status: 200 });
    }
    if (path === '/blocks/lastHeaders/1') {
      headerReads += 1;
      return new Response(JSON.stringify([{
        id: headerReads > 1 ? (options.postTipIdHex ?? tipIdHex) : tipIdHex,
        height: tipHeight,
      }]), { status: 200 });
    }
    if (path === `/utxo/byId/${tracker.boxId}`) {
      return new Response(JSON.stringify(tracker), { status: options.trackerStatus ?? 200 });
    }
    if (path === `/utxo/byIdBinary/${tracker.boxId}`) {
      return new Response(JSON.stringify({ bytes: trackerBytes }), {
        status: options.trackerStatus ?? 200,
      });
    }
    if (path === `/utxo/byId/${dupVault.boxId}`) {
      return new Response(JSON.stringify(dupVault), { status: options.dupVaultStatus ?? 200 });
    }
    if (path === `/utxo/byIdBinary/${dupVault.boxId}`) {
      return new Response(JSON.stringify({ bytes: dupVaultBytes }), {
        status: options.dupVaultStatus ?? 200,
      });
    }
    throw new Error(`unexpected observation path ${path}`);
  };
  return { fetchFn, calls };
}

async function validInput(): Promise<AuthenticatedV2ProvisioningInput> {
  const [trackerFundingBox, dupVaultFundingBox] = await fundingBoxes();
  const recipientErgoTreeHashHex = blake2b256(Buffer.from(RECIPIENT_TREE, 'hex'));
  const burnIdHex = deriveTrustlessBurnIdHex({
    sidechainIdHex: SIDECHAIN_ID,
    sidechainTxHashHex: SIDECHAIN_TX_HASH,
    eventIndex: 7,
  });
  const burn: TrustlessBurnLeafInput = {
    sidechainIdHex: SIDECHAIN_ID,
    sidechainBlockHashHex: EXECUTION_HASH,
    burnIdHex,
    sidechainTxHashHex: SIDECHAIN_TX_HASH,
    eventIndex: 7,
    recipientErgoTreeHashHex,
    amountNanoErg: '10000000',
    assetIdHex: '00'.repeat(32),
  };
  const checkpoint = buildBridgeCheckpointFromBurnsV1({
    sidechainIdHex: SIDECHAIN_ID,
    sidechainHeight: 1024,
    sidechainConsensusBlockHashHex: '21'.repeat(32),
    executionBlockHashHex: EXECUTION_HASH,
    finalityAuthoritySetId: 7,
    finalityAuthoritySetHashHex: '33'.repeat(32),
    finalityProofHashHex: '44'.repeat(32),
    burnLeavesInCanonicalOrder: [burn],
  });
  const finalityStatement = buildBridgeFinalityStatementV1({
    encodedCheckpointHex: checkpoint.encodedCheckpointHex,
    checkpointCommitmentHex: checkpoint.checkpointCommitmentHex,
    trustedAnchorDigestHex: '45'.repeat(32),
    finalityHorizonHeight: 1_024,
    finalityHorizonHashHex: '46'.repeat(32),
  });
  const aggregateFinalityProof = buildAggregateFinalityProofV1({
    verifierProfileIdHex: '47'.repeat(32),
    encodedStatement: finalityStatement.encodedStatementHex,
    payload: Buffer.from('authenticated-v2-provisioning-plan-proof', 'ascii'),
  });
  const aggregateFinalityCommitment = buildAggregateFinalityCommitmentV1(
    aggregateFinalityProof,
  );
  const extension = buildErgoExtensionMembershipProof([{
    key: Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'),
    value: Buffer.from(checkpoint.extensionValueHex, 'hex'),
  }], Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'));
  const inclusion = buildTrustlessBurnInclusionProof([burn], burnIdHex);

  return {
    environment: 'patched-devnet',
    provenance: {
      fundingObservation: {
        reportDigestHex: 'a1'.repeat(32),
        snapshotDigestHex: 'a2'.repeat(32),
        observedAt: '2026-07-12T12:00:00.000Z',
        nodeNetwork: 'testnet',
        tipHeight: 120,
        tipIdHex: 'a3'.repeat(32),
      },
      initialBinding: {
        reportDigestHex: 'b1'.repeat(32),
        inputDigestHex: 'b2'.repeat(32),
      },
      revalidationRequiredBeforeSetup: true,
    },
    provisioningCreationHeight: 120,
    settlementCreationHeight: 130,
    sidechainIdHex: SIDECHAIN_ID,
    committeePubKeyHex: COMMITTEE_PUBKEY,
    trackerFinalityAttestorPubKeyHex: FINALITY_ATTESTOR_PUBKEY,
    trackerFundingBox,
    dupVaultFundingBox,
    contracts: {
      tracker: contractInput('../../contracts/SPVTrackerAuthenticated.es', TRACKER_TREE),
      unlock: contractInput('../../contracts/MainChainAggregateUnlockAuthenticated.es', UNLOCK_TREE),
      duplicatePrevention: contractInput(
        '../../contracts/DoubleUnlockPreventionAuthenticated.es',
        DUP_TREE,
      ),
    },
    values: {
      trackerSingletonNanoErg: '5000000',
      duplicatePreventionSingletonNanoErg: '5000000',
      vaultNanoErg: '50000000',
      setupFeeNanoErg: '1100000',
      admissionFeeNanoErg: '1100000',
    },
    vault: {
      depositIdHex: '66'.repeat(32),
      depositorIdentityHex: '77'.repeat(20),
      provenanceHex: '01020304',
    },
    checkpoint: {
      encodedCheckpointHex: checkpoint.encodedCheckpointHex,
      aggregateFinalityCommitmentHex:
        aggregateFinalityCommitment.encodedCommitmentHex,
      extensionProofHex: extension.proof.toString('hex'),
      anchorHeader: {
        idHex: '99'.repeat(32),
        height: 119,
        extensionRootHex: extension.root.toString('hex'),
        contextIndex: 0,
      },
    },
    settlement: {
      pegOut: {
        user: '0x0000000000000000000000000000000000000001',
        amount: 10000000n,
        ergoRecipientAddress: RECIPIENT_TREE,
        sidechainTxHash: SIDECHAIN_TX_HASH,
        sidechainBlockNumber: 1024,
        sidechainLogIndex: 7,
      },
      settlementIdentity: {
        source: 'trustless-burn-leaf',
        duplicatePreventionKeyHex: burnIdHex,
        bridgeEventRootHex: checkpoint.checkpoint.bridgeEventRootHex,
        recipientErgoTreeHashHex,
        amountNanoErg: '10000000',
        assetIdHex: '00'.repeat(32),
        trustlessBurnProof: inclusion.proof,
      },
      recipientErgoTreeHex: RECIPIENT_TREE,
    },
  };
}

async function preSetupFixture() {
  const input = await validInput();
  const priorFetch = await fundingObservationFetch(
    input.trackerFundingBox,
    input.dupVaultFundingBox,
    { tipHeight: 120, tipIdHex: PRIOR_TIP_ID },
  );
  const prior = await observeAuthenticatedV2Funding({
    environment: input.environment,
    nodeUrl: 'http://127.0.0.1:9052',
    trackerFundingBoxId: input.trackerFundingBox.boxId,
    dupVaultFundingBoxId: input.dupVaultFundingBox.boxId,
  }, {
    fetch: priorFetch.fetchFn,
    now: () => new Date(PRIOR_OBSERVED_AT),
  });
  input.provenance.fundingObservation = {
    reportDigestHex: prior.reportDigestHex,
    snapshotDigestHex: prior.node.snapshotDigestHex,
    observedAt: prior.observedAt,
    nodeNetwork: prior.node.network,
    tipHeight: prior.node.tipHeight,
    tipIdHex: prior.node.tipIdHex,
  };
  const plan = await buildAuthenticatedV2ProvisioningPlan(input);
  const freshFetch = await fundingObservationFetch(
    input.trackerFundingBox,
    input.dupVaultFundingBox,
    { tipHeight: 121, tipIdHex: FRESH_TIP_ID },
  );
  return { input, prior, plan, freshFetch };
}

function setupCheckHeaders(
  tipHeight = 121,
  tipIdHex = FRESH_TIP_ID,
): Array<{ id: string; parentId: string; height: number }> {
  const idAt = (height: number) => height === tipHeight
    ? tipIdHex
    : createHash('sha256').update(`setup-check-header:${height}`, 'utf8').digest('hex');
  return Array.from({ length: 10 }, (_, index) => {
    const height = tipHeight - index;
    return { id: idAt(height), parentId: idAt(height - 1), height };
  });
}

function setupSourceConformanceReport(
  plan: AuthenticatedV2ProvisioningPlan,
): AuthenticatedV2SourceTreeConformanceReport {
  const boundaries = {
    sourceToTreeVerified: true,
    retainedReportSufficientForSetup: false,
    independentAttestation: false,
    verifierRerunRequired: true,
    setupAuthorized: false,
    signingPerformed: false,
    jvmTransactionCheckPerformed: false,
    submissionPerformed: false,
    deploymentPerformed: false,
    broadcastPerformed: false,
    sidechainFinalityVerifiedOnErgo: false,
    gate5Closed: false,
    productionReady: false,
    trustedHostRequired: true,
    concurrentSameUserTamperingOutOfScope: true,
  } as const;
  const contractResult = (role: 'tracker' | 'unlock' | 'duplicatePrevention') => ({
    templateSha256Hex: '01'.repeat(32),
    resolvedSourceSha256Hex: '02'.repeat(32),
    expectedErgoTreeHex: plan.contracts[role].ergoTreeHex,
    expectedErgoTreeSha256Hex: plan.contracts[role].ergoTreeSha256Hex,
    compiledResolvedSourceSha256Hex: '02'.repeat(32),
    compiledErgoTreeHex: plan.contracts[role].ergoTreeHex,
    compiledErgoTreeSha256Hex: plan.contracts[role].ergoTreeSha256Hex,
    exactByteMatch: true,
  });
  const withoutDigest = {
    schema: AUTHENTICATED_V2_SOURCE_TREE_CONFORMANCE_SCHEMA,
    status: 'PASS' as const,
    provisioning: {
      schema: AUTHENTICATED_V2_PROVISIONING_SCHEMA,
      packageDigestHex: plan.packageDigestHex,
      environment: plan.environment,
      trackerNftId: plan.identities.trackerNftId,
      duplicatePreventionNftId: plan.identities.duplicatePreventionNftId,
    },
    compiler: {
      execution: 'pinned-resolver-free-jvm' as const,
      executionAuthority: 'local-reproducible-run' as const,
      sourceBaselineStatus: 'PASS' as const,
      sourceLockBindingsValidated: true,
      ergoCheckoutValidated: true,
      parentRuntimeValidated: true,
      nodeVersion: '24.14.0',
      nodeExecutableSha256: '03'.repeat(32),
      gitVersion: '2.54.0.windows.1',
      gitExecutableSha256: '04'.repeat(32),
      gitDistributionUrl: 'https://example.invalid/git.zip',
      gitDistributionSha256: '05'.repeat(32),
      relayerPackageLockSha256: '06'.repeat(32),
      parentRuntimePackagesValidated: true,
      loaderInvocationValidated: true,
      gitEnvironmentSanitized: true,
      ergoNodeBaseCommit: '07'.repeat(20),
      consensusSourceLockSha256: '08'.repeat(32),
      ergoPatchSha256: '09'.repeat(32),
      ergoPatchedBlobIds: ['0a'.repeat(20), '0b'.repeat(20)] as [string, string],
      sigmaStateVersion: '6.0.2',
      sigmaStateArtifactSha256: '0c'.repeat(32),
      runtimeBundleSha256: '0d'.repeat(32),
      runtimeClasspathEntries: ['pinned-runtime.jar'],
      runtimeClasspathSha256: '0e'.repeat(32),
      scalaVersion: '2.12.20',
      sbtVersion: '1.11.1',
      javaMajorVersion: 17,
      javaDistribution: 'Microsoft OpenJDK 17',
      javaHomeSha256: '0f'.repeat(32),
      networkPrefix: 16,
      scriptVersion: 3,
      treeVersion: 0,
      buildSha256: '10'.repeat(32),
      sbtPropertiesSha256: '11'.repeat(32),
      toolSha256: '12'.repeat(32),
      compiledToolClassesSha256: '13'.repeat(32),
      compilerProjectFileSetValidated: true,
      forbiddenEnvironmentOverridesExcluded: true,
      runtimeSnapshotsValidated: true,
      runtimeSnapshotsReadOnly: true,
      observedMetadata: {
        networkPrefix: 16,
        scriptVersion: 3,
        treeVersion: 0,
        scalaVersion: '2.12.20',
        javaMajorVersion: '17',
        sigmaStateArtifactSha256: '0c'.repeat(32),
        runtimeClasspathSha256: '0e'.repeat(32),
        javaHomeSha256: '0f'.repeat(32),
        roles: ['tracker', 'unlock', 'duplicatePrevention'],
      },
    },
    contracts: {
      tracker: contractResult('tracker'),
      unlock: contractResult('unlock'),
      duplicatePrevention: contractResult('duplicatePrevention'),
    },
    errors: [],
    boundaries,
  };
  return {
    ...withoutDigest,
    reportDigestHex: sha256Canonical(withoutDigest),
  } as AuthenticatedV2SourceTreeConformanceReport;
}

function redigestReport<T extends { reportDigestHex: string }>(report: T): T {
  const { reportDigestHex: _discarded, ...withoutDigest } = report;
  return {
    ...withoutDigest,
    reportDigestHex: sha256Canonical(withoutDigest),
  } as T;
}

async function setupJvmCheckFixture() {
  const { input, prior, plan, freshFetch } = await preSetupFixture();
  const funding = await revalidateAuthenticatedV2PreSetupFunding({
    provisioningInput: input,
    priorFundingObservationReport: prior,
    expectedProvisioningPackageDigestHex: plan.packageDigestHex,
    nodeUrl: 'http://127.0.0.1:9052',
  }, {
    fetch: freshFetch.fetchFn,
    now: () => new Date(FRESH_OBSERVED_AT),
  });
  const state = {
    conformance: setupSourceConformanceReport(plan),
    funding,
    headers: setupCheckHeaders(),
    acceptanceMutation: undefined as ((
      value: LocalWasmCheckAcceptance[],
    ) => LocalWasmCheckAcceptance[]) | undefined,
  };
  const trace: string[] = [];
  const signer: PreparedLocalWasmCheckSigner = {
    pubKeyHex: COMMITTEE_PUBKEY,
    ergoTreeHex: FUNDING_TREE,
    stateContextTipHeight: 121,
    stateContextTipIdHex: FRESH_TIP_ID,
    async checkTransactions(candidates, checkNode) {
      for (const candidate of candidates) trace.push(`sign:${candidate.role}`);
      const accepted: LocalWasmCheckAcceptance[] = [];
      for (const candidate of candidates) {
        const nodeTxId = String(await checkNode({ id: candidate.expectedTxId }));
        accepted.push({
          role: candidate.role,
          expectedTxId: candidate.expectedTxId,
          signedTxId: candidate.expectedTxId,
          nodeTxId,
          checkResponseSha256Hex: sha256Utf8(JSON.stringify(nodeTxId)),
        });
      }
      return state.acceptanceMutation?.(accepted) ?? accepted;
    },
  };
  const request: AuthenticatedV2SetupJvmCheckRequest = {
    provisioningInput: input,
    priorFundingObservationReport: prior,
    expectedProvisioningPackageDigestHex: plan.packageDigestHex,
    nodeUrl: 'http://127.0.0.1:9052',
    checkEnabled: true,
    broadcastEnabled: false,
    bridgeRoot: 'C:\\bridge',
    worktreeRoot: 'C:\\worktree',
    ergoSourcePath: 'C:\\ergo',
  };
  const dependencies: AuthenticatedV2SetupJvmCheckDependencies = {
    async runSourceTreeConformance() {
      trace.push('conformance');
      return state.conformance;
    },
    async observeStateContextHeaders() {
      trace.push('headers');
      return state.headers;
    },
    async revalidateFunding() {
      trace.push('funding');
      return state.funding;
    },
    async loadSigner(headers) {
      trace.push('load-signer');
      expect(headers).toBe(state.headers);
      return signer;
    },
    async deriveUnsignedTransactionId(transaction) {
      trace.push('derive');
      return deriveUnsignedTransactionId(transaction);
    },
    async checkSignedTransaction(transaction) {
      trace.push(`check:${String((transaction as { id?: unknown }).id ?? '')}`);
      return (transaction as { id: string }).id;
    },
  };
  return { request, dependencies, state, signer, trace, plan };
}

function headerIdForHeight(height: number): string {
  return createHash('sha256').update(`header:${height}`, 'utf8').digest('hex');
}

function extensionRootForHeight(height: number): string {
  return createHash('sha256').update(`extension:${height}`, 'utf8').digest('hex');
}

function freshHeaderContext(
  input: AuthenticatedV2ProvisioningInput,
  tipHeight: number,
): AuthenticatedV2FreshHeaderContext {
  const anchor = input.checkpoint.anchorHeader;
  const idAt = (height: number) => height === anchor.height
    ? anchor.idHex
    : headerIdForHeight(height);
  const preHeader = {
    parentIdHex: idAt(tipHeight),
    height: tipHeight + 1,
    derivation: 'node-simplified-upcoming' as const,
  };
  const headers = Array.from({ length: 10 }, (_, index) => {
    const height = tipHeight - index;
    return {
      idHex: idAt(height),
      parentIdHex: idAt(height - 1),
      height,
      extensionRootHex: height === anchor.height
        ? anchor.extensionRootHex
        : extensionRootForHeight(height),
    };
  });
  return {
    snapshot: {
      network: input.environment,
      tipIdHex: headers[0].idHex,
      tipHeight,
    },
    preHeader,
    headers,
  };
}

function headerIdAt(context: AuthenticatedV2FreshHeaderContext, height: number): string {
  const header = context.headers.find(candidate => candidate.height === height);
  if (!header) throw new Error(`test header context does not contain height ${height}`);
  return header.idHex;
}

function confirmedObservation(
  box: Eip12Box,
  snapshot: AuthenticatedV2ChainSnapshot,
  inclusionHeight: number,
  inclusionBlockIdHex: string,
): AuthenticatedV2ConfirmedBoxObservation {
  return {
    box: structuredClone(box),
    inclusionBlockIdHex,
    inclusionHeight,
    observedCanonicalAtHeight: true,
    observedUnspent: true,
    snapshot: structuredClone(snapshot),
  };
}

async function rematerializeWithRegister(
  box: Eip12Box,
  register: string,
  value: string,
): Promise<Eip12Box> {
  const materialized = await materializeUnsignedTransaction({
    inputs: [{ ...box, extension: {} }],
    dataInputs: [],
    outputs: [{
      value: box.value,
      ergoTree: box.ergoTree,
      assets: structuredClone(box.assets),
      additionalRegisters: {
        ...structuredClone(box.additionalRegisters),
        [register]: value,
      },
      creationHeight: box.creationHeight,
    }],
  }, 'authority-drift box fixture');
  return materialized.outputs[0];
}

async function admissionFixture(tipHeight = 122) {
  const input = await validInput();
  const baseline = await buildAuthenticatedV2ProvisioningPlan(input);
  const stateContext = freshHeaderContext(input, tipHeight);
  const inclusionBlockIdHex = headerIdAt(stateContext, 121);
  const trackerSetupObservation = confirmedObservation(
    baseline.operations.trackerSetupCandidate.outputs[0],
    stateContext.snapshot,
    121,
    inclusionBlockIdHex,
  );
  const admissionFeeObservation = confirmedObservation(
    baseline.operations.trackerSetupCandidate.outputs[1],
    stateContext.snapshot,
    121,
    inclusionBlockIdHex,
  );
  const admission = await buildAuthenticatedV2AdmissionStagePlan({
    provisioning: input,
    expectedProvisioningPackageDigestHex: baseline.packageDigestHex,
    trackerSetupObservation,
    admissionFeeObservation,
    stateContext,
  });
  return {
    input,
    baseline,
    stateContext,
    trackerSetupObservation,
    admissionFeeObservation,
    admission,
  };
}

describe('authenticated V2 deterministic provisioning plan', () => {
  it('uses one exact funding equation for assessment and setup construction', async () => {
    const input = await validInput();
    const assessment = assessAuthenticatedV2ProvisioningFunding({
      trackerFundingNanoErg: input.trackerFundingBox.value,
      dupVaultFundingNanoErg: input.dupVaultFundingBox.value,
      values: input.values,
    });
    expect(assessment.tracker).toMatchObject({
      requiredNanoErg: '8200000',
      sufficient: true,
      shortfallNanoErg: '0',
    });
    expect(assessment.duplicatePreventionAndVault).toMatchObject({
      requiredNanoErg: '57100000',
      sufficient: true,
      shortfallNanoErg: '0',
    });
    expect(assessAuthenticatedV2ProvisioningFunding({
      trackerFundingNanoErg: '8199999',
      dupVaultFundingNanoErg: '57100000',
      values: input.values,
    })).toMatchObject({
      tracker: { sufficient: false, surplusNanoErg: '0', shortfallNanoErg: '1' },
      duplicatePreventionAndVault: { sufficient: true },
      allSufficient: false,
    });
    expect(assessAuthenticatedV2ProvisioningFunding({
      trackerFundingNanoErg: '8200000',
      dupVaultFundingNanoErg: '57099999',
      values: input.values,
    })).toMatchObject({
      tracker: { sufficient: true },
      duplicatePreventionAndVault: {
        sufficient: false,
        surplusNanoErg: '0',
        shortfallNanoErg: '1',
      },
      allSufficient: false,
    });

    const trackerBoundary = await validInput();
    [trackerBoundary.trackerFundingBox, trackerBoundary.dupVaultFundingBox] =
      await fundingBoxes({ trackerValue: '8200000' });
    expect((await buildAuthenticatedV2ProvisioningPlan(trackerBoundary))
      .operations.trackerSetupCandidate.eip12Tx.inputs[0].value).toBe('8200000');

    const trackerShort = await validInput();
    [trackerShort.trackerFundingBox, trackerShort.dupVaultFundingBox] =
      await fundingBoxes({ trackerValue: '8199999' });
    await expect(buildAuthenticatedV2ProvisioningPlan(trackerShort))
      .rejects.toThrow(/tracker funding box.*valid admission fee\/change/i);

    const dupBoundary = await validInput();
    [dupBoundary.trackerFundingBox, dupBoundary.dupVaultFundingBox] =
      await fundingBoxes({ trackerValue: '242900000' });
    expect((await buildAuthenticatedV2ProvisioningPlan(dupBoundary))
      .operations.duplicatePreventionAndVaultSetupCandidate.eip12Tx.inputs[0].value)
      .toBe('57100000');

    const dupShort = await validInput();
    [dupShort.trackerFundingBox, dupShort.dupVaultFundingBox] =
      await fundingBoxes({ trackerValue: '242900001' });
    await expect(buildAuthenticatedV2ProvisioningPlan(dupShort))
      .rejects.toThrow(/DUP\/vault funding box.*valid change/i);
  });

  it('chains setup, admission, and settlement preview without an execution route', async () => {
    const input = await validInput();
    const first = await buildAuthenticatedV2ProvisioningPlan(input);
    const second = await buildAuthenticatedV2ProvisioningPlan(input);

    expect(second).toEqual(first);
    expect(first.schema).toBe(AUTHENTICATED_V2_PROVISIONING_SCHEMA);
    expect(first.packageDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(first.provenance).toEqual(input.provenance);
    expect(first.authorization).toEqual({
      execute: false,
      sign: false,
      check: false,
      submit: false,
      broadcast: false,
      deploy: false,
      gate5Closed: false,
      trustModel: 'proof-bound-attestor-authorized-finality',
    });
    expect(first.identities.trackerNftId).toBe(input.trackerFundingBox.boxId);
    expect(first.identities.trackerGenesisBoxId)
      .toBe(first.operations.trackerSetupCandidate.outputs[0].boxId);
    expect(first.identities.trackerGenesisBoxId)
      .not.toBe(first.predictedBoxes.populatedTracker.boxId);
    expect(first.identities.duplicatePreventionNftId).toBe(input.dupVaultFundingBox.boxId);
    expect(first.authorities).toEqual({
      bridgeCommitteePubKeyHex: COMMITTEE_PUBKEY,
      trackerFinalityAttestorPubKeyHex: FINALITY_ATTESTOR_PUBKEY,
      exactSigmaPropositionsSeparated: true,
      organizationalIndependenceVerified: false,
    });
    expect(Object.keys(first.admissionPreview.contextExtension)).toEqual(['0', '1', '2', '3']);
    expect(first.contractVerification).toEqual({
      sourceToTree: 'unverified',
      requiredBeforeExecution: true,
    });
    expect(first.stages.admission).toMatchObject({
      status: 'tip-bound-preview',
      stateContextHeight: input.provisioningCreationHeight + 1,
      expiresAfterHeight: input.provisioningCreationHeight,
      rebuildRequired: true,
    });
    expect(first.stages.settlement).toMatchObject({
      status: 'predicted-descendant-preview',
      rebuildRequired: true,
    });

    const trackerSetup = first.operations.trackerSetupCandidate;
    const dupSetup = first.operations.duplicatePreventionAndVaultSetupCandidate;
    const admission = first.operations.trackerAdmissionTipBoundPreview;
    const settlement = first.operations.settlementPredictedPreview;
    expect(trackerSetup.outputs[0].additionalRegisters.R9).toBe(
      encodeSigmaPropRegister(FINALITY_ATTESTOR_PUBKEY),
    );
    expect(dupSetup.outputs[0].additionalRegisters.R6).toBe(
      encodeSigmaPropRegister(COMMITTEE_PUBKEY),
    );
    expect(trackerSetup.outputs[0].additionalRegisters.R9)
      .not.toBe(dupSetup.outputs[0].additionalRegisters.R6);
    expect(admission.eip12Tx.inputs.map(box => box.boxId)).toEqual([
      trackerSetup.outputs[0].boxId,
      trackerSetup.outputs[1].boxId,
    ]);
    expect(settlement.eip12Tx.dataInputs[0].boxId).toBe(admission.outputs[0].boxId);
    expect(settlement.eip12Tx.inputs.map(box => box.boxId)).toEqual([
      dupSetup.outputs[0].boxId,
      dupSetup.outputs[1].boxId,
    ]);
    expect(first.settlement.predictedTxId).toBe(settlement.txId);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);

    const droppedTracker = structuredClone(admission.eip12Tx);
    droppedTracker.outputs[0].assets = [];
    await expect(materializeUnsignedTransaction(droppedTracker, 'dropped tracker NFT'))
      .rejects.toThrow(/must preserve existing token/i);

    const droppedDup = structuredClone(settlement.eip12Tx);
    droppedDup.outputs[0].assets = [];
    await expect(materializeUnsignedTransaction(droppedDup, 'dropped DUP NFT'))
      .rejects.toThrow(/must preserve existing token/i);
  });

  it('rejects a tracker finality attestor key reused by the bridge committee', async () => {
    const input = await validInput();
    input.trackerFinalityAttestorPubKeyHex = input.committeePubKeyHex;

    await expect(buildAuthenticatedV2ProvisioningPlan(input))
      .rejects.toThrow(/finality attestor key must be distinct from the bridge committee key/i);
  });

  it('reconstructs the identical settlement transaction through the canonical service', async () => {
    const input = await validInput();
    const provisioned = await buildAuthenticatedV2ProvisioningPlan(input);
    const deployed = {
      network: 'patched-devnet',
      spvTrackerAuthenticated: {
        nftId: provisioned.identities.trackerNftId,
        boxId: provisioned.predictedBoxes.populatedTracker.boxId,
        address: 'offline-plan',
        ergoTreeHex: provisioned.contracts.tracker.ergoTreeHex,
      },
      doubleUnlockPreventionAuthenticated: {
        nftId: provisioned.identities.duplicatePreventionNftId,
        boxId: provisioned.predictedBoxes.duplicatePrevention.boxId,
        address: 'offline-plan',
        ergoTreeHex: provisioned.contracts.duplicatePrevention.ergoTreeHex,
      },
      mainChainAggregateUnlockAuthenticated: {
        address: 'offline-plan',
        ergoTreeHex: provisioned.contracts.unlock.ergoTreeHex,
      },
    };
    const service = new AggregateSettlementService({
      deployed: deployed as any,
      sidechainIdHex: SIDECHAIN_ID,
      ergo: {
        getCurrentHeight: async () => input.settlementCreationHeight,
        addressToTree: async () => RECIPIENT_TREE,
        findSingletonBox: async (nftId: string) => nftId === provisioned.identities.trackerNftId
          ? provisioned.predictedBoxes.populatedTracker
          : provisioned.predictedBoxes.duplicatePrevention,
        getUnspentBoxesByAddress: async () => [provisioned.predictedBoxes.settlementVault],
        getTransaction: async () => null,
      },
      state: {
        getAllAvlKeys: () => { throw new Error('legacy DUP history must not feed authenticated V2'); },
        getAuthenticatedV2DupHistory: () => [],
        getAuthenticatedSpvTrackerHistory: () => [{
          key: provisioned.settlement.trackerKeyHex,
          value: provisioned.settlement.trackerValueHex,
        }],
      },
      verifySidechainBurn: async () => 'confirmed',
    } as any);
    const prepared = await service.prepareAuthenticatedSettlementUnsignedTx({
      pegOut: input.settlement.pegOut as any,
      trackerIdentity: {
        sidechainIdHex: SIDECHAIN_ID,
        sidechainHeight: 1024,
        executionBlockHashHex: EXECUTION_HASH,
      },
      settlementIdentity: input.settlement.settlementIdentity,
      creationHeight: input.settlementCreationHeight,
      unlockBoxId: provisioned.predictedBoxes.settlementVault.boxId,
    });
    const canonicalPreparedEip12 = JSON.parse(JSON.stringify(
      prepared.eip12Tx,
      (_key, value) => typeof value === 'bigint' ? value.toString() : value,
    )) as typeof provisioned.operations.settlementPredictedPreview.eip12Tx;
    const rematerialized = await materializeUnsignedTransaction(
      canonicalPreparedEip12,
      'service preview',
    );
    expect(rematerialized.txId).toBe(provisioned.settlement.predictedTxId);
    expect(rematerialized.outputs.map(box => box.boxId)).toEqual(
      provisioned.operations.settlementPredictedPreview.outputs.map(box => box.boxId),
    );
  });

  it('rejects funding, pin, binding, and recipient drift before producing a package', async () => {
    const duplicateFunding = await validInput();
    duplicateFunding.dupVaultFundingBox = duplicateFunding.trackerFundingBox;
    await expect(buildAuthenticatedV2ProvisioningPlan(duplicateFunding))
      .rejects.toThrow(/funding boxes must be distinct/i);

    const [tokenFunding] = await fundingBoxes({
      trackerAssets: [{ tokenId: BASE_INPUT.boxId, amount: '1' }],
    });
    const tokenInput = await validInput();
    tokenInput.trackerFundingBox = tokenFunding;
    await expect(buildAuthenticatedV2ProvisioningPlan(tokenInput))
      .rejects.toThrow(/pure-ERG/i);

    const pinDrift = await validInput();
    pinDrift.contracts.unlock.ergoTreeSha256Hex = 'ff'.repeat(32);
    await expect(buildAuthenticatedV2ProvisioningPlan(pinDrift))
      .rejects.toThrow(/ErgoTree does not match its SHA-256 pin/i);

    const recipientDrift = await validInput();
    recipientDrift.settlement.recipientErgoTreeHex = `0008cd02${'12'.repeat(32)}`;
    await expect(buildAuthenticatedV2ProvisioningPlan(recipientDrift))
      .rejects.toThrow(/proved recipient hash/i);

    const proofFieldInjection = await validInput();
    proofFieldInjection.settlement.settlementIdentity.trustlessBurnProof = [{
      side: 'left',
      hashHex: '00'.repeat(32),
      localSecret: 'must-not-survive',
    } as any];
    await expect(buildAuthenticatedV2ProvisioningPlan(proofFieldInjection))
      .rejects.toThrow(/exactly side and hashHex/i);

    const shallowAnchor = await validInput();
    shallowAnchor.settlementCreationHeight = 128;
    await expect(buildAuthenticatedV2ProvisioningPlan(shallowAnchor))
      .rejects.toThrow(/requires 10 anchor confirmations/i);

    const overflowingUpcomingContext = await validInput();
    overflowingUpcomingContext.provisioningCreationHeight = Number.MAX_SAFE_INTEGER;
    overflowingUpcomingContext.settlementCreationHeight = Number.MAX_SAFE_INTEGER;
    await expect(buildAuthenticatedV2ProvisioningPlan(overflowingUpcomingContext))
      .rejects.toThrow(/cannot derive an exact H\+1 admission context/i);

    const underfunded = await validInput();
    const [smallFunding] = await fundingBoxes({ trackerValue: '6000000' });
    underfunded.trackerFundingBox = smallFunding;
    await expect(buildAuthenticatedV2ProvisioningPlan(underfunded))
      .rejects.toThrow(/valid admission fee\/change input/i);

    const relaxedRevalidation = await validInput();
    relaxedRevalidation.provenance.revalidationRequiredBeforeSetup = false as true;
    await expect(buildAuthenticatedV2ProvisioningPlan(relaxedRevalidation))
      .rejects.toThrow(/require funding revalidation/i);
  });

  it('binds funding and initial-binding provenance into the package digest', async () => {
    const baselineInput = await validInput();
    const baseline = await buildAuthenticatedV2ProvisioningPlan(baselineInput);
    const mutations: Array<[string, (input: AuthenticatedV2ProvisioningInput) => void]> = [
      ['funding report digest', input => {
        input.provenance.fundingObservation.reportDigestHex = 'c1'.repeat(32);
      }],
      ['funding snapshot digest', input => {
        input.provenance.fundingObservation.snapshotDigestHex = 'c2'.repeat(32);
      }],
      ['initial-binding report digest', input => {
        input.provenance.initialBinding.reportDigestHex = 'c3'.repeat(32);
      }],
      ['initial-binding input digest', input => {
        input.provenance.initialBinding.inputDigestHex = 'c4'.repeat(32);
      }],
    ];
    for (const [label, mutate] of mutations) {
      const changedInput = await validInput();
      mutate(changedInput);
      const changed = await buildAuthenticatedV2ProvisioningPlan(changedInput);
      expect(changed.operations, label).toEqual(baseline.operations);
      expect(changed.packageDigestHex, label).not.toBe(baseline.packageDigestHex);
    }
  });
});

describe('authenticated V2 pre-setup funding revalidation', () => {
  it('reobserves unchanged funding, proves exact sufficiency, and rebuilds one package', async () => {
    const fixture = await preSetupFixture();
    const report = await revalidateAuthenticatedV2PreSetupFunding({
      provisioningInput: fixture.input,
      priorFundingObservationReport: fixture.prior,
      expectedProvisioningPackageDigestHex: fixture.plan.packageDigestHex,
      nodeUrl: 'http://127.0.0.1:9052',
    }, {
      fetch: fixture.freshFetch.fetchFn,
      now: () => new Date(FRESH_OBSERVED_AT),
    });

    expect(report.schema).toBe(AUTHENTICATED_V2_PRE_SETUP_FUNDING_REVALIDATION_SCHEMA);
    expect(report.status).toBe('PASS');
    expect(report.packageDigests).toEqual({
      expectedHex: fixture.plan.packageDigestHex,
      priorRebuildHex: fixture.plan.packageDigestHex,
      freshRebuildHex: fixture.plan.packageDigestHex,
    });
    expect(report.packageProvenance).toEqual(fixture.input.provenance);
    expect(report.observations.prior.reportDigestHex).toBe(fixture.prior.reportDigestHex);
    expect(report.observations.fresh.node).toMatchObject({
      network: 'testnet',
      tipHeight: 121,
      tipIdHex: FRESH_TIP_ID,
    });
    expect(Object.values(report.exactBindings).every(value => value === true
      || typeof value === 'string')).toBe(true);
    expect(report.funding.tracker).toMatchObject({
      availableNanoErg: '100000000',
      requiredNanoErg: '8200000',
      surplusNanoErg: '91800000',
      shortfallNanoErg: '0',
      sufficient: true,
    });
    expect(report.funding.duplicatePreventionAndVault).toMatchObject({
      availableNanoErg: '200000000',
      requiredNanoErg: '57100000',
      surplusNanoErg: '142900000',
      shortfallNanoErg: '0',
      sufficient: true,
    });
    expect(report.boundary).toMatchObject({
      tipUtxoAtomicityProved: false,
      globalCanonicalityProved: false,
      continuedUnspentnessProved: false,
      fundingSufficiencyVerified: true,
      signerControlVerified: false,
      ergoVerifiableFinalityProved: false,
      sameInputsMustBeRevalidatedAtExecution: true,
    });
    expect(Object.values(report.authorization).every(value => value === false)).toBe(true);
    expect(report.reportDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(fixture.freshFetch.calls).toHaveLength(8);
    await expect(validateAuthenticatedV2PreSetupFundingRevalidationReport(
      report,
      fixture.input,
      fixture.plan.packageDigestHex,
      report.observations.fresh.reportDigestHex,
    )).resolves.toEqual(report);
  });

  it('rejects package drift before network access and fails closed on observation drift', async () => {
    const fixture = await preSetupFixture();
    let unexpectedFetches = 0;
    const neverFetch: AuthenticatedV2FundingObservationFetch = async () => {
      unexpectedFetches += 1;
      throw new Error('network must not be reached');
    };
    await expect(revalidateAuthenticatedV2PreSetupFunding({
      provisioningInput: fixture.input,
      priorFundingObservationReport: fixture.prior,
      expectedProvisioningPackageDigestHex: 'ff'.repeat(32),
      nodeUrl: 'http://127.0.0.1:9052',
    }, { fetch: neverFetch })).rejects.toThrow(/expected provisioning package digest/i);
    expect(unexpectedFetches).toBe(0);

    const networkDrift = await fundingObservationFetch(
      fixture.input.trackerFundingBox,
      fixture.input.dupVaultFundingBox,
      { network: 'devnet', tipHeight: 121, tipIdHex: FRESH_TIP_ID },
    );
    await expect(revalidateAuthenticatedV2PreSetupFunding({
      provisioningInput: fixture.input,
      priorFundingObservationReport: fixture.prior,
      expectedProvisioningPackageDigestHex: fixture.plan.packageDigestHex,
      nodeUrl: 'http://127.0.0.1:9052',
    }, { fetch: networkDrift.fetchFn })).rejects.toThrow(/network does not match/i);

    for (const network of ['mainnet', 'private-chain']) {
      const rejectedNetwork = await fundingObservationFetch(
        fixture.input.trackerFundingBox,
        fixture.input.dupVaultFundingBox,
        { network, tipHeight: 121, tipIdHex: FRESH_TIP_ID },
      );
      await expect(revalidateAuthenticatedV2PreSetupFunding({
        provisioningInput: fixture.input,
        priorFundingObservationReport: fixture.prior,
        expectedProvisioningPackageDigestHex: fixture.plan.packageDigestHex,
        nodeUrl: 'http://127.0.0.1:9052',
      }, { fetch: rejectedNetwork.fetchFn })).rejects.toThrow(/non-mainnet|mainnet/i);
    }

    for (const missing of ['tracker', 'dupVault'] as const) {
      const missingUtxo = await fundingObservationFetch(
        fixture.input.trackerFundingBox,
        fixture.input.dupVaultFundingBox,
        {
          tipHeight: 121,
          tipIdHex: FRESH_TIP_ID,
          ...(missing === 'tracker' ? { trackerStatus: 404 } : { dupVaultStatus: 404 }),
        },
      );
      await expect(revalidateAuthenticatedV2PreSetupFunding({
        provisioningInput: fixture.input,
        priorFundingObservationReport: fixture.prior,
        expectedProvisioningPackageDigestHex: fixture.plan.packageDigestHex,
        nodeUrl: 'http://127.0.0.1:9052',
      }, { fetch: missingUtxo.fetchFn })).rejects.toThrow(/not present in the current UTXO view/i);
    }

    const changedTip = await fundingObservationFetch(
      fixture.input.trackerFundingBox,
      fixture.input.dupVaultFundingBox,
      {
        tipHeight: 121,
        tipIdHex: FRESH_TIP_ID,
        postTipIdHex: 'fe'.repeat(32),
      },
    );
    await expect(revalidateAuthenticatedV2PreSetupFunding({
      provisioningInput: fixture.input,
      priorFundingObservationReport: fixture.prior,
      expectedProvisioningPackageDigestHex: fixture.plan.packageDigestHex,
      nodeUrl: 'http://127.0.0.1:9052',
    }, { fetch: changedTip.fetchFn })).rejects.toThrow(/tip changed/i);

    for (const nodeUrl of [
      'http://user:pass@127.0.0.1:9052',
      'http://127.0.0.1:9052/api',
      'http://127.0.0.1:9052?token=secret',
    ]) {
      await expect(revalidateAuthenticatedV2PreSetupFunding({
        provisioningInput: fixture.input,
        priorFundingObservationReport: fixture.prior,
        expectedProvisioningPackageDigestHex: fixture.plan.packageDigestHex,
        nodeUrl,
      }, { fetch: neverFetch })).rejects.toThrow();
    }
    expect(unexpectedFetches).toBe(0);
  });

  it('rejects rehashed report drift across funding, bindings, boundaries, and authority', async () => {
    const fixture = await preSetupFixture();
    const report = await revalidateAuthenticatedV2PreSetupFunding({
      provisioningInput: fixture.input,
      priorFundingObservationReport: fixture.prior,
      expectedProvisioningPackageDigestHex: fixture.plan.packageDigestHex,
      nodeUrl: 'http://127.0.0.1:9052',
    }, {
      fetch: fixture.freshFetch.fetchFn,
      now: () => new Date(FRESH_OBSERVED_AT),
    });
    const rehash = (candidate: AuthenticatedV2PreSetupFundingRevalidationReport) => {
      const { reportDigestHex: _discarded, ...withoutDigest } = candidate;
      candidate.reportDigestHex = sha256Canonical(withoutDigest);
      return candidate;
    };
    const externallyCapturedFreshDigestHex = report.observations.fresh.reportDigestHex;
    const validateReport = (candidate: AuthenticatedV2PreSetupFundingRevalidationReport) => (
      validateAuthenticatedV2PreSetupFundingRevalidationReport(
        candidate,
        fixture.input,
        fixture.plan.packageDigestHex,
        externallyCapturedFreshDigestHex,
      )
    );

    const staleDigest = structuredClone(report);
    staleDigest.funding.tracker.requiredNanoErg = '1';
    await expect(validateReport(staleDigest)).rejects.toThrow(/report digest/i);

    const fundingDrift = rehash(structuredClone(report));
    fundingDrift.funding.tracker.requiredNanoErg = '1';
    rehash(fundingDrift);
    await expect(validateReport(fundingDrift)).rejects.toThrow(/funding assessment/i);

    const provenanceDrift = structuredClone(report);
    provenanceDrift.packageProvenance.initialBinding.inputDigestHex = 'dd'.repeat(32);
    rehash(provenanceDrift);
    await expect(validateReport(provenanceDrift)).rejects.toThrow(/package provenance/i);

    for (const key of Object.keys(report.packageDigests) as Array<
      keyof typeof report.packageDigests
    >) {
      const drift = structuredClone(report);
      drift.packageDigests[key] = 'dc'.repeat(32);
      rehash(drift);
      await expect(validateReport(drift)).rejects.toThrow(/package digest/i);
    }

    const freshEnvironmentDrift = structuredClone(report);
    freshEnvironmentDrift.observations.fresh.environment = 'devnet';
    freshEnvironmentDrift.observations.fresh.downstream.initialBindingInput.environment = 'devnet';
    const {
      reportDigestHex: _freshObservationDigest,
      ...freshObservationWithoutDigest
    } = freshEnvironmentDrift.observations.fresh;
    freshEnvironmentDrift.observations.fresh.reportDigestHex =
      sha256Canonical(freshObservationWithoutDigest);
    rehash(freshEnvironmentDrift);
    await expect(validateReport(freshEnvironmentDrift))
      .rejects.toThrow(/fresh funding observation report digest/i);
    await expect(validateAuthenticatedV2PreSetupFundingRevalidationReport(
      freshEnvironmentDrift,
      fixture.input,
      fixture.plan.packageDigestHex,
      freshEnvironmentDrift.observations.fresh.reportDigestHex,
    )).rejects.toThrow(/fresh funding observation environment/i);

    const nestedFreshnessDrift = structuredClone(report);
    nestedFreshnessDrift.observations.fresh.observedAt = '2026-07-12T12:10:00.000Z';
    const {
      reportDigestHex: _nestedFreshDigest,
      ...nestedFreshWithoutDigest
    } = nestedFreshnessDrift.observations.fresh;
    nestedFreshnessDrift.observations.fresh.reportDigestHex =
      sha256Canonical(nestedFreshWithoutDigest);
    rehash(nestedFreshnessDrift);
    await expect(validateReport(nestedFreshnessDrift))
      .rejects.toThrow(/fresh funding observation report digest/i);

    const unauthenticatedMalformedFresh = structuredClone(report);
    unauthenticatedMalformedFresh.observations.fresh.reportDigestHex = 'de'.repeat(32);
    unauthenticatedMalformedFresh.observations.fresh.boxes.tracker.sigmaSerializedHex = '00';
    rehash(unauthenticatedMalformedFresh);
    await expect(validateReport(unauthenticatedMalformedFresh))
      .rejects.toThrow(/fresh funding observation report digest/i);

    for (const [key, expectedError] of [
      ['trackerFundingBoxId', /tracker funding box ID/i],
      ['dupVaultFundingBoxId', /DUP\/vault funding box ID/i],
    ] as const) {
      const drift = structuredClone(report);
      drift.exactBindings[key] = 'ef'.repeat(32);
      rehash(drift);
      await expect(validateReport(drift)).rejects.toThrow(expectedError);
    }

    for (const key of Object.keys(report.exactBindings).filter(key => (
      typeof report.exactBindings[key as keyof typeof report.exactBindings] === 'boolean'
    )) as Array<keyof typeof report.exactBindings>) {
      const drift = structuredClone(report);
      (drift.exactBindings as any)[key] = false;
      rehash(drift);
      await expect(validateReport(drift)).rejects.toThrow(new RegExp(String(key), 'i'));
    }

    for (const key of Object.keys(report.boundary) as Array<keyof typeof report.boundary>) {
      const drift = structuredClone(report);
      (drift.boundary as any)[key] = !drift.boundary[key];
      rehash(drift);
      await expect(validateReport(drift)).rejects.toThrow(new RegExp(String(key), 'i'));
    }

    for (const key of Object.keys(report.authorization) as Array<keyof typeof report.authorization>) {
      const drift = structuredClone(report);
      (drift.authorization as any)[key] = true;
      rehash(drift);
      await expect(validateReport(drift)).rejects.toThrow(new RegExp(String(key), 'i'));
    }
  });
});

describe('authenticated V2 confirmed-stage rebuilds', () => {
  it('rebuilds tip-bound admission and first settlement from exact confirmed parent boxes', async () => {
    const fixture = await admissionFixture();
    const { input, baseline, stateContext, admission } = fixture;

    expect(admission.schema).toBe(AUTHENTICATED_V2_ADMISSION_STAGE_SCHEMA);
    expect(admission.provisioningPackageDigestHex).toBe(baseline.packageDigestHex);
    expect(admission.admission.anchorHeader.contextIndex).toBe(3);
    expect(admission.validity).toEqual({
      stateContextHeight: 123,
      expiresAfterHeight: 122,
      rebuildAfterTipChange: true,
    });
    expect(admission.observations.trackerSetup.confirmations).toBe(2);
    expect(admission.snapshotDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(admission.stateContextDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(admission.operation.eip12Tx.inputs.map(box => box.boxId)).toEqual([
      baseline.operations.trackerSetupCandidate.outputs[0].boxId,
      baseline.operations.trackerSetupCandidate.outputs[1].boxId,
    ]);
    expect(admission.predictedPopulatedTracker.additionalRegisters.R9).toBe(
      encodeSigmaPropRegister(FINALITY_ATTESTOR_PUBKEY),
    );
    expect(baseline.predictedBoxes.duplicatePrevention.additionalRegisters.R6).toBe(
      encodeSigmaPropRegister(COMMITTEE_PUBKEY),
    );
    expect(admission.predictedPopulatedTracker.additionalRegisters.R9)
      .not.toBe(baseline.predictedBoxes.duplicatePrevention.additionalRegisters.R6);
    expect(admission.operation.txId).not.toBe(
      baseline.operations.trackerAdmissionTipBoundPreview.txId,
    );

    const settlementContext = freshHeaderContext(input, 130);
    const settlementSnapshot = settlementContext.snapshot;
    const populatedTrackerObservation = confirmedObservation(
      admission.predictedPopulatedTracker,
      settlementSnapshot,
      123,
      headerIdAt(settlementContext, 123),
    );
    const duplicatePreventionObservation = confirmedObservation(
      baseline.predictedBoxes.duplicatePrevention,
      settlementSnapshot,
      121,
      headerIdAt(settlementContext, 121),
    );
    const settlementVaultObservation = confirmedObservation(
      baseline.predictedBoxes.settlementVault,
      settlementSnapshot,
      121,
      headerIdAt(settlementContext, 121),
    );
    const settlement = await buildAuthenticatedV2SettlementStagePlan({
      provisioning: input,
      expectedProvisioningPackageDigestHex: baseline.packageDigestHex,
      admissionStage: admission,
      populatedTrackerObservation,
      duplicatePreventionObservation,
      settlementVaultObservation,
      stateContext: settlementContext,
      anchorObservation: {
        idHex: input.checkpoint.anchorHeader.idHex,
        height: input.checkpoint.anchorHeader.height,
        extensionRootHex: input.checkpoint.anchorHeader.extensionRootHex,
        observedCanonicalAtHeight: true,
        snapshot: settlementSnapshot,
      },
    });

    expect(settlement.schema).toBe(AUTHENTICATED_V2_SETTLEMENT_STAGE_SCHEMA);
    expect(settlement.admissionStageDigestHex).toBe(admission.stageDigestHex);
    expect(settlement.anchor).toEqual({
      headerIdHex: input.checkpoint.anchorHeader.idHex,
      height: 119,
      depth: 11,
      extensionRootHex: input.checkpoint.anchorHeader.extensionRootHex,
    });
    expect(settlement.operation.eip12Tx.inputs.map(box => box.boxId)).toEqual([
      baseline.predictedBoxes.duplicatePrevention.boxId,
      baseline.predictedBoxes.settlementVault.boxId,
    ]);
    expect(settlement.operation.eip12Tx.dataInputs.map(box => box.boxId)).toEqual([
      admission.predictedPopulatedTracker.boxId,
    ]);
    expect(settlement.operation.outputs.slice(0, 3).map(box => box.ergoTree)).toEqual([
      baseline.contracts.duplicatePrevention.ergoTreeHex,
      input.settlement.recipientErgoTreeHex,
      baseline.contracts.unlock.ergoTreeHex,
    ]);
    expect(settlement.predictedBoxes.duplicatePreventionSuccessor.boxId)
      .toBe(settlement.operation.outputs[0].boxId);
    expect(settlement.predictedBoxes.settlementVaultSuccessor).not.toBeNull();
    expect(settlement.authorization).toEqual({
      execute: false,
      sign: false,
      check: false,
      submit: false,
      broadcast: false,
      deploy: false,
      gate5Closed: false,
      trustModel: 'proof-bound-attestor-authorized-finality',
    });
    expect(stateContext.preHeader.parentIdHex).toBe(stateContext.snapshot.tipIdHex);
    expect(stateContext.preHeader.height).toBe(stateContext.snapshot.tipHeight + 1);

    const laterContext = freshHeaderContext(input, 131);
    const laterSnapshot = laterContext.snapshot;
    const laterSettlement = await buildAuthenticatedV2SettlementStagePlan({
      provisioning: input,
      expectedProvisioningPackageDigestHex: baseline.packageDigestHex,
      admissionStage: admission,
      populatedTrackerObservation: confirmedObservation(
        admission.predictedPopulatedTracker,
        laterSnapshot,
        123,
        headerIdAt(laterContext, 123),
      ),
      duplicatePreventionObservation: confirmedObservation(
        baseline.predictedBoxes.duplicatePrevention,
        laterSnapshot,
        121,
        headerIdForHeight(121),
      ),
      settlementVaultObservation: confirmedObservation(
        baseline.predictedBoxes.settlementVault,
        laterSnapshot,
        121,
        headerIdForHeight(121),
      ),
      stateContext: laterContext,
      anchorObservation: {
        idHex: input.checkpoint.anchorHeader.idHex,
        height: input.checkpoint.anchorHeader.height,
        extensionRootHex: input.checkpoint.anchorHeader.extensionRootHex,
        observedCanonicalAtHeight: true,
        snapshot: laterSnapshot,
      },
    });
    expect(laterSettlement.anchor.depth).toBe(12);
    expect(laterSettlement.operation.txId).not.toBe(settlement.operation.txId);
  });

  it('rejects setup lineage drift and malformed or stale ten-header contexts', async () => {
    const fixture = await admissionFixture();
    const baseInput = {
      provisioning: fixture.input,
      expectedProvisioningPackageDigestHex: fixture.baseline.packageDigestHex,
      trackerSetupObservation: fixture.trackerSetupObservation,
      admissionFeeObservation: fixture.admissionFeeObservation,
      stateContext: fixture.stateContext,
    };

    await expect(buildAuthenticatedV2AdmissionStagePlan({
      ...baseInput,
      expectedProvisioningPackageDigestHex: '00'.repeat(32),
    })).rejects.toThrow(/digest does not match rebuilt baseline/i);

    await expect(buildAuthenticatedV2AdmissionStagePlan({
      ...baseInput,
      trackerSetupObservation: {
        ...fixture.trackerSetupObservation,
        box: fixture.baseline.operations.trackerSetupCandidate.outputs[1],
      },
    })).rejects.toThrow(/expected boxId/i);

    const reordered = structuredClone(fixture.stateContext);
    [reordered.headers[0], reordered.headers[1]] = [reordered.headers[1], reordered.headers[0]];
    await expect(buildAuthenticatedV2AdmissionStagePlan({
      ...baseInput,
      stateContext: reordered,
    })).rejects.toThrow(/ordered newest-first with contiguous heights/i);

    const shortContext = structuredClone(fixture.stateContext);
    shortContext.headers.pop();
    await expect(buildAuthenticatedV2AdmissionStagePlan({
      ...baseInput,
      stateContext: shortContext,
    })).rejects.toThrow(/exactly 10 headers/i);

    const wrongTip = structuredClone(fixture.stateContext);
    wrongTip.snapshot.tipIdHex = 'fe'.repeat(32);
    await expect(buildAuthenticatedV2AdmissionStagePlan({
      ...baseInput,
      stateContext: wrongTip,
    })).rejects.toThrow(/preHeader must be the node upcoming context/i);

    const brokenParent = structuredClone(fixture.stateContext);
    brokenParent.headers[0].parentIdHex = 'ff'.repeat(32);
    await expect(buildAuthenticatedV2AdmissionStagePlan({
      ...baseInput,
      stateContext: brokenParent,
    })).rejects.toThrow(/parent-linked newest-first/i);

    const duplicateHeader = structuredClone(fixture.stateContext);
    duplicateHeader.headers[1].idHex = duplicateHeader.headers[0].idHex;
    await expect(buildAuthenticatedV2AdmissionStagePlan({
      ...baseInput,
      stateContext: duplicateHeader,
    })).rejects.toThrow(/duplicate header IDs/i);

    const wrongAnchorRoot = structuredClone(fixture.stateContext);
    wrongAnchorRoot.headers[3].extensionRootHex = 'ff'.repeat(32);
    await expect(buildAuthenticatedV2AdmissionStagePlan({
      ...baseInput,
      stateContext: wrongAnchorRoot,
    })).rejects.toThrow(/extension root does not match/i);

    const mixedTipObservation = structuredClone(fixture.admissionFeeObservation);
    mixedTipObservation.snapshot.tipIdHex = 'ee'.repeat(32);
    await expect(buildAuthenticatedV2AdmissionStagePlan({
      ...baseInput,
      admissionFeeObservation: mixedTipObservation,
    })).rejects.toThrow(/required canonical snapshot/i);

    const differentBlock = structuredClone(fixture.admissionFeeObservation);
    differentBlock.inclusionBlockIdHex = 'dd'.repeat(32);
    await expect(buildAuthenticatedV2AdmissionStagePlan({
      ...baseInput,
      admissionFeeObservation: differentBlock,
    })).rejects.toThrow(/one confirmed source transaction and block/i);

    const wrongCanonicalTracker = {
      ...fixture.trackerSetupObservation,
      inclusionBlockIdHex: 'dd'.repeat(32),
    };
    const wrongCanonicalFee = {
      ...fixture.admissionFeeObservation,
      inclusionBlockIdHex: 'dd'.repeat(32),
    };
    await expect(buildAuthenticatedV2AdmissionStagePlan({
      ...baseInput,
      trackerSetupObservation: wrongCanonicalTracker,
      admissionFeeObservation: wrongCanonicalFee,
    })).rejects.toThrow(/inclusion block does not match the canonical header context/i);

    await expect(buildAuthenticatedV2AdmissionStagePlan({
      ...baseInput,
      trackerSetupObservation: {
        ...fixture.trackerSetupObservation,
        inclusionHeight: 119,
      },
    })).rejects.toThrow(/cannot precede the box creationHeight/i);

    const anchorExpiredContext = freshHeaderContext(fixture.input, 130);
    const expiredTracker = confirmedObservation(
      fixture.baseline.operations.trackerSetupCandidate.outputs[0],
      anchorExpiredContext.snapshot,
      121,
      headerIdAt(anchorExpiredContext, 121),
    );
    const expiredFee = confirmedObservation(
      fixture.baseline.operations.trackerSetupCandidate.outputs[1],
      anchorExpiredContext.snapshot,
      121,
      headerIdAt(anchorExpiredContext, 121),
    );
    await expect(buildAuthenticatedV2AdmissionStagePlan({
      provisioning: fixture.input,
      expectedProvisioningPackageDigestHex: fixture.baseline.packageDigestHex,
      trackerSetupObservation: expiredTracker,
      admissionFeeObservation: expiredFee,
      stateContext: anchorExpiredContext,
    })).rejects.toThrow(/anchor header is absent/i);

    await expect(buildAuthenticatedV2AdmissionStagePlan({
      ...baseInput,
      trackerSetupObservation: {
        ...fixture.trackerSetupObservation,
        observedUnspent: false,
      } as any,
    })).rejects.toThrow(/must be observed unspent/i);

    await expect(buildAuthenticatedV2AdmissionStagePlan({
      ...baseInput,
      trackerSetupObservation: {
        ...fixture.trackerSetupObservation,
        observedCanonicalAtHeight: false,
      } as any,
    })).rejects.toThrow(/must be observed canonical at its exact height/i);
  });

  it('rejects forged admission descendants, mixed snapshots, shallow anchors, and anchor reorgs', async () => {
    const fixture = await admissionFixture();
    const settlementContext = freshHeaderContext(fixture.input, 130);
    const settlementSnapshot = settlementContext.snapshot;
    const populatedTrackerObservation = confirmedObservation(
      fixture.admission.predictedPopulatedTracker,
      settlementSnapshot,
      123,
      headerIdAt(settlementContext, 123),
    );
    const duplicatePreventionObservation = confirmedObservation(
      fixture.baseline.predictedBoxes.duplicatePrevention,
      settlementSnapshot,
      121,
      headerIdAt(settlementContext, 121),
    );
    const settlementVaultObservation = confirmedObservation(
      fixture.baseline.predictedBoxes.settlementVault,
      settlementSnapshot,
      121,
      headerIdAt(settlementContext, 121),
    );
    const anchorObservation = {
      idHex: fixture.input.checkpoint.anchorHeader.idHex,
      height: fixture.input.checkpoint.anchorHeader.height,
      extensionRootHex: fixture.input.checkpoint.anchorHeader.extensionRootHex,
      observedCanonicalAtHeight: true as const,
      snapshot: settlementSnapshot,
    };
    const baseInput = {
      provisioning: fixture.input,
      expectedProvisioningPackageDigestHex: fixture.baseline.packageDigestHex,
      admissionStage: fixture.admission,
      populatedTrackerObservation,
      duplicatePreventionObservation,
      settlementVaultObservation,
      stateContext: settlementContext,
      anchorObservation,
    };

    const tamperedAdmission = structuredClone(fixture.admission);
    tamperedAdmission.operation.outputs[0].value = '1234567';
    await expect(buildAuthenticatedV2SettlementStagePlan({
      ...baseInput,
      admissionStage: tamperedAdmission,
    })).rejects.toThrow(/content does not match its digest/i);

    await expect(buildAuthenticatedV2SettlementStagePlan({
      ...baseInput,
      populatedTrackerObservation: confirmedObservation(
        fixture.baseline.predictedBoxes.populatedTracker,
        settlementSnapshot,
        123,
        headerIdAt(settlementContext, 123),
      ),
    })).rejects.toThrow(/expected boxId/i);

    const trackerAuthorityDrift = confirmedObservation(
      await rematerializeWithRegister(
        populatedTrackerObservation.box,
        'R9',
        encodeSigmaPropRegister(COMMITTEE_PUBKEY),
      ),
      settlementSnapshot,
      123,
      headerIdAt(settlementContext, 123),
    );
    await expect(buildAuthenticatedV2SettlementStagePlan({
      ...baseInput,
      populatedTrackerObservation: trackerAuthorityDrift,
    })).rejects.toThrow(/expected boxId/i);

    const dupAuthorityDrift = confirmedObservation(
      await rematerializeWithRegister(
        duplicatePreventionObservation.box,
        'R6',
        encodeSigmaPropRegister(FINALITY_ATTESTOR_PUBKEY),
      ),
      settlementSnapshot,
      121,
      headerIdAt(settlementContext, 121),
    );
    await expect(buildAuthenticatedV2SettlementStagePlan({
      ...baseInput,
      duplicatePreventionObservation: dupAuthorityDrift,
    })).rejects.toThrow(/expected boxId/i);

    const shallowContext = freshHeaderContext(fixture.input, 128);
    const shallowSnapshot = shallowContext.snapshot;
    await expect(buildAuthenticatedV2SettlementStagePlan({
      ...baseInput,
      populatedTrackerObservation: confirmedObservation(
        fixture.admission.predictedPopulatedTracker,
        shallowSnapshot,
        123,
        headerIdAt(shallowContext, 123),
      ),
      duplicatePreventionObservation: confirmedObservation(
        fixture.baseline.predictedBoxes.duplicatePrevention,
        shallowSnapshot,
        121,
        headerIdAt(shallowContext, 121),
      ),
      settlementVaultObservation: confirmedObservation(
        fixture.baseline.predictedBoxes.settlementVault,
        shallowSnapshot,
        121,
        headerIdAt(shallowContext, 121),
      ),
      stateContext: shallowContext,
      anchorObservation: { ...anchorObservation, snapshot: shallowSnapshot },
    })).rejects.toThrow(/requires 10 Ergo anchor confirmations/i);

    await expect(buildAuthenticatedV2SettlementStagePlan({
      ...baseInput,
      anchorObservation: { ...anchorObservation, idHex: 'ff'.repeat(32) },
    })).rejects.toThrow(/does not match the admitted tracker anchor/i);

    await expect(buildAuthenticatedV2SettlementStagePlan({
      ...baseInput,
      anchorObservation: { ...anchorObservation, extensionRootHex: 'ff'.repeat(32) },
    })).rejects.toThrow(/does not match the admitted tracker anchor/i);

    await expect(buildAuthenticatedV2SettlementStagePlan({
      ...baseInput,
      anchorObservation: {
        ...anchorObservation,
        observedCanonicalAtHeight: false,
      } as any,
    })).rejects.toThrow(/must be observed at its exact height/i);

    const mixedSnapshot = structuredClone(settlementVaultObservation);
    mixedSnapshot.snapshot.tipIdHex = 'ee'.repeat(32);
    await expect(buildAuthenticatedV2SettlementStagePlan({
      ...baseInput,
      settlementVaultObservation: mixedSnapshot,
    })).rejects.toThrow(/required canonical snapshot/i);

    await expect(buildAuthenticatedV2SettlementStagePlan({
      ...baseInput,
      settlementVaultObservation: {
        ...settlementVaultObservation,
        inclusionBlockIdHex: 'dd'.repeat(32),
      },
    })).rejects.toThrow(/one confirmed source transaction and block/i);

    await expect(buildAuthenticatedV2SettlementStagePlan({
      ...baseInput,
      duplicatePreventionObservation: {
        ...duplicatePreventionObservation,
        inclusionBlockIdHex: 'dd'.repeat(32),
      },
      settlementVaultObservation: {
        ...settlementVaultObservation,
        inclusionBlockIdHex: 'dd'.repeat(32),
      },
    })).rejects.toThrow(/inclusion block does not match the canonical header context/i);

    await expect(buildAuthenticatedV2SettlementStagePlan({
      ...baseInput,
      duplicatePreventionObservation: {
        ...duplicatePreventionObservation,
        box: fixture.baseline.predictedBoxes.settlementVault,
      },
      settlementVaultObservation: {
        ...settlementVaultObservation,
        box: fixture.baseline.predictedBoxes.duplicatePrevention,
      },
    })).rejects.toThrow(/expected boxId/i);
  });
});

describe('authenticated V2 setup JVM check', () => {
  it('reruns exact-package prerequisites before signing every candidate and checking either', async () => {
    const fixture = await setupJvmCheckFixture();
    const report = await runAuthenticatedV2SetupJvmCheck(
      fixture.request,
      fixture.dependencies,
    );

    expect(report.schema).toBe(AUTHENTICATED_V2_SETUP_JVM_CHECK_SCHEMA);
    expect(report.status).toBe('PASS');
    expect(report.provisioningPackageDigestHex).toBe(fixture.plan.packageDigestHex);
    expect(report.checks.map(check => check.role)).toEqual([
      'tracker-setup',
      'duplicate-prevention-vault-setup',
    ]);
    expect(report.checks.every(check => (
      check.packageTxId === check.independentlyDerivedUnsignedTxId
      && check.packageTxId === check.signedTxId
      && check.packageTxId === check.nodeTxId
    ))).toBe(true);
    expect(report.boundary).toMatchObject({
      signedBytesProducedInMemory: true,
      signedBytesPersisted: false,
      signedBytesBroadcastableIfCaptured: true,
      checkOnly: true,
      trackerAndDupVaultSetupAtomicTogether: false,
      duplicatePreventionAndVaultAtomicWithinSecondTransaction: true,
      setupAuthorized: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      gate5Closed: false,
      productionReady: false,
    });
    expect(report.signerControl).toMatchObject({
      bridgeCommitteeBootstrapKeyControlled: true,
      trackerFinalityAttestorControlVerified: false,
      exactSigmaPropositionsSeparated: true,
      organizationalIndependenceVerified: false,
    });
    expect(fixture.trace.slice(0, 6)).toEqual([
      'conformance',
      'headers',
      'funding',
      'load-signer',
      'derive',
      'derive',
    ]);
    const firstCheck = fixture.trace.findIndex(entry => entry.startsWith('check:'));
    const lastSign = fixture.trace.reduce(
      (latest, entry, index) => entry.startsWith('sign:') ? index : latest,
      -1,
    );
    expect(lastSign).toBeGreaterThan(0);
    expect(firstCheck).toBeGreaterThan(lastSign);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/"(?:mnemonic|privatekey|signedtx|signedtransaction|ergoSourcePath|bridgeRoot|worktreeRoot)"/i);
    const { reportDigestHex, ...withoutDigest } = report;
    expect(reportDigestHex).toBe(sha256Canonical(withoutDigest));
  });

  it('fails before expensive or secret-bearing work when policy or package binding is invalid', async () => {
    const policyFixture = await setupJvmCheckFixture();
    await expect(runAuthenticatedV2SetupJvmCheck({
      ...policyFixture.request,
      broadcastEnabled: true,
    }, policyFixture.dependencies)).rejects.toThrow(/broadcast_enabled.*false/i);
    expect(policyFixture.trace).toEqual([]);

    const digestFixture = await setupJvmCheckFixture();
    await expect(runAuthenticatedV2SetupJvmCheck({
      ...digestFixture.request,
      expectedProvisioningPackageDigestHex: 'ff'.repeat(32),
    }, digestFixture.dependencies)).rejects.toThrow(/does not match the rebuilt V2 package/i);
    expect(digestFixture.trace).toEqual([]);
  });

  it('rejects source-tree, header-chain, funding-tip, and signer-control drift', async () => {
    const sourceFixture = await setupJvmCheckFixture();
    sourceFixture.state.conformance.contracts.tracker.compiledErgoTreeHex = 'ff';
    sourceFixture.state.conformance = redigestReport(sourceFixture.state.conformance);
    await expect(runAuthenticatedV2SetupJvmCheck(
      sourceFixture.request,
      sourceFixture.dependencies,
    )).rejects.toThrow(/tracker contract does not match the package/i);
    expect(sourceFixture.trace).toEqual(['conformance']);

    const headerFixture = await setupJvmCheckFixture();
    headerFixture.state.headers[0].parentId = 'ff'.repeat(32);
    await expect(runAuthenticatedV2SetupJvmCheck(
      headerFixture.request,
      headerFixture.dependencies,
    )).rejects.toThrow(/contiguous parent-linked chain/i);
    expect(headerFixture.trace).toEqual(['conformance', 'headers']);

    const fundingFixture = await setupJvmCheckFixture();
    fundingFixture.state.headers = setupCheckHeaders(121, 'b6'.repeat(32));
    await expect(runAuthenticatedV2SetupJvmCheck(
      fundingFixture.request,
      fundingFixture.dependencies,
    )).rejects.toThrow(/funding observation tip does not match/i);
    expect(fundingFixture.trace).toEqual(['conformance', 'headers', 'funding']);

    const signerFixture = await setupJvmCheckFixture();
    const otherPubKey = `03${'42'.repeat(32)}`;
    signerFixture.signer.pubKeyHex = otherPubKey;
    signerFixture.signer.ergoTreeHex = `0008cd${otherPubKey}`;
    await expect(runAuthenticatedV2SetupJvmCheck(
      signerFixture.request,
      signerFixture.dependencies,
    )).rejects.toThrow(/does not control the bootstrap bridge committee key/i);
    expect(signerFixture.trace).toEqual([
      'conformance',
      'headers',
      'funding',
      'load-signer',
    ]);
  });

  it('rejects authority-boundary, header-cardinality, and prepared-context drift', async () => {
    const conformanceBoundaryFixture = await setupJvmCheckFixture();
    conformanceBoundaryFixture.state.conformance.boundaries.setupAuthorized = true as false;
    conformanceBoundaryFixture.state.conformance = redigestReport(
      conformanceBoundaryFixture.state.conformance,
    );
    await expect(runAuthenticatedV2SetupJvmCheck(
      conformanceBoundaryFixture.request,
      conformanceBoundaryFixture.dependencies,
    )).rejects.toThrow(/conformance boundaries are invalid/i);

    const fundingBoundaryFixture = await setupJvmCheckFixture();
    const fundingBoundary = structuredClone(fundingBoundaryFixture.state.funding);
    fundingBoundary.boundary.signerControlVerified = true as false;
    fundingBoundaryFixture.state.funding = redigestReport(fundingBoundary);
    await expect(runAuthenticatedV2SetupJvmCheck(
      fundingBoundaryFixture.request,
      fundingBoundaryFixture.dependencies,
    )).rejects.toThrow(/boundary\.signerControlVerified must be false/i);

    const countFixture = await setupJvmCheckFixture();
    countFixture.state.headers.pop();
    await expect(runAuthenticatedV2SetupJvmCheck(
      countFixture.request,
      countFixture.dependencies,
    )).rejects.toThrow(/exactly 10 mined state-context headers/i);

    const duplicateFixture = await setupJvmCheckFixture();
    duplicateFixture.state.headers[1].id = duplicateFixture.state.headers[0].id;
    await expect(runAuthenticatedV2SetupJvmCheck(
      duplicateFixture.request,
      duplicateFixture.dependencies,
    )).rejects.toThrow(/header IDs must be distinct/i);

    const treeFixture = await setupJvmCheckFixture();
    treeFixture.signer.ergoTreeHex = '00';
    await expect(runAuthenticatedV2SetupJvmCheck(
      treeFixture.request,
      treeFixture.dependencies,
    )).rejects.toThrow(/not the exact canonical P2PK tree/i);

    const contextFixture = await setupJvmCheckFixture();
    contextFixture.signer.stateContextTipIdHex = 'ff'.repeat(32);
    await expect(runAuthenticatedV2SetupJvmCheck(
      contextFixture.request,
      contextFixture.dependencies,
    )).rejects.toThrow(/signer context does not match/i);
  });

  it('rejects derived, signed, or node-echoed transaction identity drift', async () => {
    const derivedFixture = await setupJvmCheckFixture();
    derivedFixture.dependencies.deriveUnsignedTransactionId = async () => 'ff'.repeat(32);
    await expect(runAuthenticatedV2SetupJvmCheck(
      derivedFixture.request,
      derivedFixture.dependencies,
    )).rejects.toThrow(/package and independently derived transaction IDs differ/i);

    const signedFixture = await setupJvmCheckFixture();
    signedFixture.state.acceptanceMutation = accepted => accepted.map((entry, index) => (
      index === 0 ? { ...entry, signedTxId: 'ff'.repeat(32) } : entry
    ));
    await expect(runAuthenticatedV2SetupJvmCheck(
      signedFixture.request,
      signedFixture.dependencies,
    )).rejects.toThrow(/package, derived, signed, and node transaction IDs differ/i);

    const nodeFixture = await setupJvmCheckFixture();
    nodeFixture.state.acceptanceMutation = accepted => accepted.map((entry, index) => (
      index === 1 ? { ...entry, nodeTxId: 'ee'.repeat(32) } : entry
    ));
    await expect(runAuthenticatedV2SetupJvmCheck(
      nodeFixture.request,
      nodeFixture.dependencies,
    )).rejects.toThrow(/package, derived, signed, and node transaction IDs differ/i);
  });

  it('rejects acceptance cardinality, order, expected ID, and response-digest drift', async () => {
    const countFixture = await setupJvmCheckFixture();
    countFixture.state.acceptanceMutation = accepted => accepted.slice(0, 1);
    await expect(runAuthenticatedV2SetupJvmCheck(
      countFixture.request,
      countFixture.dependencies,
    )).rejects.toThrow(/exactly two check acceptances/i);

    const orderFixture = await setupJvmCheckFixture();
    orderFixture.state.acceptanceMutation = accepted => [...accepted].reverse();
    await expect(runAuthenticatedV2SetupJvmCheck(
      orderFixture.request,
      orderFixture.dependencies,
    )).rejects.toThrow(/roles or order changed/i);

    const expectedFixture = await setupJvmCheckFixture();
    expectedFixture.state.acceptanceMutation = accepted => accepted.map((entry, index) => (
      index === 0 ? { ...entry, expectedTxId: 'dd'.repeat(32) } : entry
    ));
    await expect(runAuthenticatedV2SetupJvmCheck(
      expectedFixture.request,
      expectedFixture.dependencies,
    )).rejects.toThrow(/package, derived, signed, and node transaction IDs differ/i);

    const digestFixture = await setupJvmCheckFixture();
    digestFixture.state.acceptanceMutation = accepted => accepted.map((entry, index) => (
      index === 1 ? { ...entry, checkResponseSha256Hex: 'INVALID' } : entry
    ));
    await expect(runAuthenticatedV2SetupJvmCheck(
      digestFixture.request,
      digestFixture.dependencies,
    )).rejects.toThrow(/check response digest must be canonical lowercase/i);
  });
});
