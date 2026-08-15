import { createHash } from 'crypto';

import {
  validateAuthenticatedV2PreSetupFundingRevalidationReport,
  type AuthenticatedV2PreSetupFundingRevalidationReport,
  type AuthenticatedV2PreSetupFundingRevalidationRequest,
} from './authenticated-v2-pre-setup-funding-revalidation.js';
import {
  buildAuthenticatedV2ProvisioningPlan,
  type AuthenticatedV2ProvisioningInput,
  type AuthenticatedV2ProvisioningPlan,
} from './authenticated-v2-provisioning-plan.js';
import {
  AUTHENTICATED_V2_SOURCE_TREE_CONFORMANCE_SCHEMA,
  type AuthenticatedV2SourceTreeConformanceReport,
  type RunAuthenticatedV2SourceTreeConformanceInput,
} from './authenticated-v2-source-tree-conformance.js';
import {
  assertAuthenticatedV2SetupCheckPolicy,
  type AuthenticatedV2SetupCheckPolicyInput,
} from './authenticated-v2-setup-check-policy.js';
import { encodeSigmaPropRegister } from './ergo-encoding.js';
import type {
  LocalWasmCheckAcceptance,
  PreparedLocalWasmCheckSigner,
} from './fleet-signer.js';

export const AUTHENTICATED_V2_SETUP_JVM_CHECK_SCHEMA =
  'e2s.authenticated-v2-setup-jvm-check.v2';

const SETUP_ROLES = ['tracker-setup', 'duplicate-prevention-vault-setup'] as const;
type SetupRole = typeof SETUP_ROLES[number];

export interface AuthenticatedV2SetupJvmCheckRequest
  extends AuthenticatedV2SetupCheckPolicyInput {
  provisioningInput: AuthenticatedV2ProvisioningInput;
  priorFundingObservationReport: unknown;
  expectedProvisioningPackageDigestHex: string;
  bridgeRoot: string;
  worktreeRoot: string;
  ergoSourcePath: string;
}

export interface AuthenticatedV2SetupJvmCheckDependencies {
  runSourceTreeConformance(
    input: RunAuthenticatedV2SourceTreeConformanceInput,
  ): Promise<AuthenticatedV2SourceTreeConformanceReport>;
  observeStateContextHeaders(): Promise<unknown>;
  revalidateFunding(
    input: AuthenticatedV2PreSetupFundingRevalidationRequest,
  ): Promise<AuthenticatedV2PreSetupFundingRevalidationReport>;
  loadSigner(headers: unknown): Promise<PreparedLocalWasmCheckSigner>;
  deriveUnsignedTransactionId(eip12Tx: unknown): Promise<string>;
  checkSignedTransaction(signedTransaction: unknown): Promise<unknown>;
}

export interface AuthenticatedV2SetupJvmCheckReport {
  schema: typeof AUTHENTICATED_V2_SETUP_JVM_CHECK_SCHEMA;
  reportDigestHex: string;
  status: 'PASS';
  environment: string;
  provisioningPackageDigestHex: string;
  sourceConformance: {
    reportDigestHex: string;
    execution: 'pinned-resolver-free-jvm';
    sourceToTreeVerified: true;
  };
  fundingRevalidation: {
    reportDigestHex: string;
    freshObservationDigestHex: string;
    observedAt: string;
    nodeNetwork: string;
    tipHeight: number;
    tipIdHex: string;
    allSufficient: true;
  };
  signerControl: {
    pubKeyHex: string;
    p2pkErgoTreeSha256Hex: string;
    fundingInputsControlled: true;
    bridgeCommitteeBootstrapKeyControlled: true;
    trackerFinalityAttestorControlVerified: false;
    exactSigmaPropositionsSeparated: true;
    organizationalIndependenceVerified: false;
    singleSignerBootstrapOnly: true;
    thresholdGovernanceVerified: false;
  };
  stateContext: {
    headerCount: 10;
    tipHeight: number;
    tipIdHex: string;
    matchesFundingObservationTip: true;
  };
  checks: Array<{
    role: SetupRole;
    packageTxId: string;
    independentlyDerivedUnsignedTxId: string;
    signedTxId: string;
    nodeTxId: string;
    checkResponseSha256Hex: string;
    status: 'PASS';
  }>;
  boundary: {
    trustedLoopbackNodeRequired: true;
    signedBytesProducedInMemory: true;
    signedBytesPersisted: false;
    signedBytesBroadcastableIfCaptured: true;
    checkOnly: true;
    nodeCheckDoesNotSpendInputs: true;
    trackerAndDupVaultSetupAtomicTogether: false;
    duplicatePreventionAndVaultAtomicWithinSecondTransaction: true;
    retainedReportsSufficientForSetup: false;
    setupAuthorized: false;
    submissionPerformed: false;
    deploymentPerformed: false;
    broadcastPerformed: false;
    sidechainFinalityVerifiedOnErgo: false;
    gate5Closed: false;
    productionReady: false;
  };
  authorization: {
    setup: false;
    submit: false;
    deploy: false;
    broadcast: false;
    gate5Closed: false;
    productionReady: false;
  };
}

const EXPECTED_CONFORMANCE_BOUNDARIES = {
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

export async function runAuthenticatedV2SetupJvmCheck(
  request: AuthenticatedV2SetupJvmCheckRequest,
  dependencies: AuthenticatedV2SetupJvmCheckDependencies,
): Promise<AuthenticatedV2SetupJvmCheckReport> {
  assertAuthenticatedV2SetupCheckPolicy(request);
  const expectedPackageDigestHex = fixedHex(
    request.expectedProvisioningPackageDigestHex,
    32,
    'expected provisioning package digest',
  );
  const plan = await buildAuthenticatedV2ProvisioningPlan(request.provisioningInput);
  if (plan.packageDigestHex !== expectedPackageDigestHex) {
    throw new Error('expected provisioning package digest does not match the rebuilt V2 package');
  }

  const conformance = await dependencies.runSourceTreeConformance({
    provisioningInput: request.provisioningInput,
    expectedProvisioningPackageDigestHex: expectedPackageDigestHex,
    bridgeRoot: request.bridgeRoot,
    worktreeRoot: request.worktreeRoot,
    ergoSourcePath: request.ergoSourcePath,
  });
  const conformanceDigestHex = assertFreshSourceTreeConformance(conformance, plan);

  const rawHeaders = await dependencies.observeStateContextHeaders();
  const stateContext = validateStateContextHeaders(rawHeaders);
  const fundingCandidate = await dependencies.revalidateFunding({
    provisioningInput: request.provisioningInput,
    priorFundingObservationReport: request.priorFundingObservationReport,
    expectedProvisioningPackageDigestHex: expectedPackageDigestHex,
    nodeUrl: request.nodeUrl,
  });
  const fundingObservations = requireRecord(
    requireRecord(fundingCandidate, 'fresh funding revalidation report').observations,
    'fresh funding revalidation observations',
  );
  const freshFundingObservation = requireRecord(
    fundingObservations.fresh,
    'fresh funding observation report',
  );
  const funding = await validateAuthenticatedV2PreSetupFundingRevalidationReport(
    fundingCandidate,
    request.provisioningInput,
    expectedPackageDigestHex,
    fixedHex(
      freshFundingObservation.reportDigestHex,
      32,
      'fresh funding observation report digest',
    ),
  );
  if (
    funding.observations.fresh.node.tipHeight !== stateContext.tipHeight
    || funding.observations.fresh.node.tipIdHex !== stateContext.tipIdHex
  ) {
    throw new Error('fresh funding observation tip does not match the prefetched signer context');
  }

  const signer = await dependencies.loadSigner(rawHeaders);
  assertSetupSignerControl(signer, request.provisioningInput, plan, stateContext);
  const candidates = setupCandidates(plan);
  const independentlyDerived = await Promise.all(candidates.map(async candidate => ({
    role: candidate.role,
    packageTxId: candidate.packageTxId,
    derivedTxId: fixedHex(
      await dependencies.deriveUnsignedTransactionId(candidate.eip12Tx),
      32,
      `${candidate.role} independently derived transaction ID`,
    ),
  })));
  for (const candidate of independentlyDerived) {
    if (candidate.packageTxId !== candidate.derivedTxId) {
      throw new Error(`${candidate.role} package and independently derived transaction IDs differ`);
    }
  }

  const accepted = await signer.checkTransactions(
    candidates.map(candidate => ({
      role: candidate.role,
      eip12Tx: candidate.eip12Tx,
      expectedTxId: candidate.packageTxId,
    })),
    dependencies.checkSignedTransaction,
  );
  const checks = validateCheckAcceptances(accepted, independentlyDerived);

  const withoutDigest: Omit<AuthenticatedV2SetupJvmCheckReport, 'reportDigestHex'> = {
    schema: AUTHENTICATED_V2_SETUP_JVM_CHECK_SCHEMA,
    status: 'PASS',
    environment: plan.environment,
    provisioningPackageDigestHex: expectedPackageDigestHex,
    sourceConformance: {
      reportDigestHex: conformanceDigestHex,
      execution: 'pinned-resolver-free-jvm',
      sourceToTreeVerified: true,
    },
    fundingRevalidation: {
      reportDigestHex: funding.reportDigestHex,
      freshObservationDigestHex: funding.observations.fresh.reportDigestHex,
      observedAt: funding.observations.fresh.observedAt,
      nodeNetwork: funding.observations.fresh.node.network,
      tipHeight: funding.observations.fresh.node.tipHeight,
      tipIdHex: funding.observations.fresh.node.tipIdHex,
      allSufficient: true,
    },
    signerControl: {
      pubKeyHex: signer.pubKeyHex,
      p2pkErgoTreeSha256Hex: sha256Hex(Buffer.from(signer.ergoTreeHex, 'hex')),
      fundingInputsControlled: true,
      bridgeCommitteeBootstrapKeyControlled: true,
      trackerFinalityAttestorControlVerified: false,
      exactSigmaPropositionsSeparated: true,
      organizationalIndependenceVerified: false,
      singleSignerBootstrapOnly: true,
      thresholdGovernanceVerified: false,
    },
    stateContext: {
      headerCount: 10,
      tipHeight: stateContext.tipHeight,
      tipIdHex: stateContext.tipIdHex,
      matchesFundingObservationTip: true,
    },
    checks,
    boundary: {
      trustedLoopbackNodeRequired: true,
      signedBytesProducedInMemory: true,
      signedBytesPersisted: false,
      signedBytesBroadcastableIfCaptured: true,
      checkOnly: true,
      nodeCheckDoesNotSpendInputs: true,
      trackerAndDupVaultSetupAtomicTogether: false,
      duplicatePreventionAndVaultAtomicWithinSecondTransaction: true,
      retainedReportsSufficientForSetup: false,
      setupAuthorized: false,
      submissionPerformed: false,
      deploymentPerformed: false,
      broadcastPerformed: false,
      sidechainFinalityVerifiedOnErgo: false,
      gate5Closed: false,
      productionReady: false,
    },
    authorization: {
      setup: false,
      submit: false,
      deploy: false,
      broadcast: false,
      gate5Closed: false,
      productionReady: false,
    },
  };
  return deepFreeze({
    ...withoutDigest,
    reportDigestHex: sha256Canonical(withoutDigest),
  });
}

function assertFreshSourceTreeConformance(
  value: AuthenticatedV2SourceTreeConformanceReport,
  plan: AuthenticatedV2ProvisioningPlan,
): string {
  const report = requireRecord(value, 'fresh source-to-tree conformance report');
  if (report.schema !== AUTHENTICATED_V2_SOURCE_TREE_CONFORMANCE_SCHEMA) {
    throw new Error('fresh source-to-tree conformance report schema is invalid');
  }
  const reportDigestHex = fixedHex(report.reportDigestHex, 32, 'source conformance report digest');
  const { reportDigestHex: _discarded, ...withoutDigest } = report;
  if (sha256Canonical(withoutDigest) !== reportDigestHex) {
    throw new Error('fresh source-to-tree conformance report digest does not match its content');
  }
  if (report.status !== 'PASS') throw new Error('fresh source-to-tree conformance did not PASS');
  const provisioning = requireRecord(report.provisioning, 'conformance provisioning binding');
  if (
    provisioning.packageDigestHex !== plan.packageDigestHex
    || provisioning.environment !== plan.environment
    || provisioning.trackerNftId !== plan.identities.trackerNftId
    || provisioning.duplicatePreventionNftId !== plan.identities.duplicatePreventionNftId
  ) {
    throw new Error('fresh source-to-tree conformance does not bind the exact package');
  }
  const compiler = requireRecord(report.compiler, 'conformance compiler identity');
  for (const [key, expected] of Object.entries({
    execution: 'pinned-resolver-free-jvm',
    executionAuthority: 'local-reproducible-run',
    sourceBaselineStatus: 'PASS',
    sourceLockBindingsValidated: true,
    ergoCheckoutValidated: true,
    parentRuntimeValidated: true,
    parentRuntimePackagesValidated: true,
    loaderInvocationValidated: true,
    gitEnvironmentSanitized: true,
    compilerProjectFileSetValidated: true,
    forbiddenEnvironmentOverridesExcluded: true,
    runtimeSnapshotsValidated: true,
    runtimeSnapshotsReadOnly: true,
  })) {
    if (compiler[key] !== expected) throw new Error(`fresh conformance compiler.${key} is invalid`);
  }
  if (!compiler.observedMetadata) {
    throw new Error('fresh conformance compiler metadata is missing');
  }
  if (!Array.isArray(report.errors) || report.errors.length !== 0) {
    throw new Error('fresh source-to-tree conformance contains errors');
  }
  const contracts = requireRecord(report.contracts, 'conformance contracts');
  for (const role of ['tracker', 'unlock', 'duplicatePrevention'] as const) {
    const contract = requireRecord(contracts[role], `conformance ${role} contract`);
    const expected = plan.contracts[role];
    if (
      contract.expectedErgoTreeHex !== expected.ergoTreeHex
      || contract.expectedErgoTreeSha256Hex !== expected.ergoTreeSha256Hex
      || contract.compiledErgoTreeHex !== expected.ergoTreeHex
      || contract.compiledErgoTreeSha256Hex !== expected.ergoTreeSha256Hex
      || contract.exactByteMatch !== true
    ) {
      throw new Error(`fresh conformance ${role} contract does not match the package`);
    }
  }
  if (canonicalJson(report.boundaries) !== canonicalJson(EXPECTED_CONFORMANCE_BOUNDARIES)) {
    throw new Error('fresh source-to-tree conformance boundaries are invalid');
  }
  return reportDigestHex;
}

function validateStateContextHeaders(value: unknown): {
  tipHeight: number;
  tipIdHex: string;
} {
  if (!Array.isArray(value) || value.length !== 10) {
    throw new Error('setup JVM check requires exactly 10 mined state-context headers');
  }
  const headers = value.map((item, index) => {
    const header = requireRecord(item, `state-context header ${index}`);
    return {
      id: fixedHex(header.id, 32, `state-context header ${index} ID`),
      parentId: fixedHex(header.parentId, 32, `state-context header ${index} parent ID`),
      height: positiveSafeInteger(header.height, `state-context header ${index} height`),
    };
  }).sort((left, right) => right.height - left.height);
  if (new Set(headers.map(header => header.id)).size !== headers.length) {
    throw new Error('state-context header IDs must be distinct');
  }
  if (new Set(headers.map(header => header.height)).size !== headers.length) {
    throw new Error('state-context header heights must be distinct');
  }
  for (let index = 0; index < headers.length - 1; index += 1) {
    if (
      headers[index].height !== headers[index + 1].height + 1
      || headers[index].parentId !== headers[index + 1].id
    ) {
      throw new Error('state-context headers must form one contiguous parent-linked chain');
    }
  }
  return { tipHeight: headers[0].height, tipIdHex: headers[0].id };
}

function assertSetupSignerControl(
  signer: PreparedLocalWasmCheckSigner,
  input: AuthenticatedV2ProvisioningInput,
  plan: AuthenticatedV2ProvisioningPlan,
  stateContext: { tipHeight: number; tipIdHex: string },
): void {
  const pubKeyHex = fixedHex(signer.pubKeyHex, 33, 'setup signer public key');
  const expectedP2pkTree = `0008cd${pubKeyHex}`;
  if (signer.ergoTreeHex !== expectedP2pkTree) {
    throw new Error('setup signer ErgoTree is not the exact canonical P2PK tree');
  }
  const bridgeCommitteePubKeyHex = fixedHex(
    input.committeePubKeyHex,
    33,
    'bootstrap bridge committee public key',
  );
  const trackerFinalityAttestorPubKeyHex = fixedHex(
    input.trackerFinalityAttestorPubKeyHex,
    33,
    'tracker finality attestor public key',
  );
  if (bridgeCommitteePubKeyHex !== pubKeyHex) {
    throw new Error('setup signer does not control the bootstrap bridge committee key');
  }
  if (trackerFinalityAttestorPubKeyHex === bridgeCommitteePubKeyHex) {
    throw new Error('tracker finality attestor key must remain distinct from the bridge committee key');
  }
  for (const [label, operation] of [
    ['tracker', plan.operations.trackerSetupCandidate],
    ['DUP/vault', plan.operations.duplicatePreventionAndVaultSetupCandidate],
  ] as const) {
    if (operation.eip12Tx.inputs.length !== 1 || operation.eip12Tx.inputs[0].ergoTree !== expectedP2pkTree) {
      throw new Error(`setup signer does not control the exact ${label} funding input`);
    }
  }
  const committeeRegister = encodeSigmaPropRegister(bridgeCommitteePubKeyHex);
  const finalityAttestorRegister = encodeSigmaPropRegister(
    trackerFinalityAttestorPubKeyHex,
  );
  if (
    plan.operations.trackerSetupCandidate.outputs[0].additionalRegisters.R9
    !== finalityAttestorRegister
  ) {
    throw new Error('tracker setup output does not bind the distinct finality attestor key');
  }
  if (
    plan.operations.duplicatePreventionAndVaultSetupCandidate
      .outputs[0].additionalRegisters.R6 !== committeeRegister
  ) {
    throw new Error('DUP setup output does not bind the controlled bootstrap committee key');
  }
  if (
    signer.stateContextTipHeight !== stateContext.tipHeight
    || signer.stateContextTipIdHex !== stateContext.tipIdHex
  ) {
    throw new Error('prepared signer context does not match the prefetched header tip');
  }
}

function setupCandidates(plan: AuthenticatedV2ProvisioningPlan): Array<{
  role: SetupRole;
  packageTxId: string;
  eip12Tx: unknown;
}> {
  const candidates = [
    {
      role: SETUP_ROLES[0],
      operation: plan.operations.trackerSetupCandidate,
    },
    {
      role: SETUP_ROLES[1],
      operation: plan.operations.duplicatePreventionAndVaultSetupCandidate,
    },
  ] as const;
  return candidates.map(({ role, operation }) => {
    for (const input of operation.eip12Tx.inputs) {
      if (canonicalJson(input.extension ?? {}) !== '{}') {
        throw new Error(`${role} ContextExtension must be exactly empty`);
      }
    }
    return {
      role,
      packageTxId: fixedHex(operation.txId, 32, `${role} package transaction ID`),
      eip12Tx: operation.eip12Tx,
    };
  });
}

function validateCheckAcceptances(
  accepted: LocalWasmCheckAcceptance[],
  expected: Array<{ role: SetupRole; packageTxId: string; derivedTxId: string }>,
): AuthenticatedV2SetupJvmCheckReport['checks'] {
  if (!Array.isArray(accepted) || accepted.length !== expected.length) {
    throw new Error('setup JVM check must return exactly two check acceptances');
  }
  return expected.map((candidate, index) => {
    const actual = accepted[index];
    if (actual?.role !== candidate.role) {
      throw new Error('setup JVM check acceptance roles or order changed');
    }
    const expectedTxId = fixedHex(actual.expectedTxId, 32, `${candidate.role} expected ID`);
    const signedTxId = fixedHex(actual.signedTxId, 32, `${candidate.role} signed ID`);
    const nodeTxId = fixedHex(actual.nodeTxId, 32, `${candidate.role} node ID`);
    if (
      expectedTxId !== candidate.packageTxId
      || signedTxId !== candidate.packageTxId
      || nodeTxId !== candidate.packageTxId
    ) {
      throw new Error(`${candidate.role} package, derived, signed, and node transaction IDs differ`);
    }
    return {
      role: candidate.role,
      packageTxId: candidate.packageTxId,
      independentlyDerivedUnsignedTxId: candidate.derivedTxId,
      signedTxId,
      nodeTxId,
      checkResponseSha256Hex: fixedHex(
        actual.checkResponseSha256Hex,
        32,
        `${candidate.role} check response digest`,
      ),
      status: 'PASS' as const,
    };
  });
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be canonical lowercase ${bytes}-byte hex`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function requireRecord(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('setup JVM check report contains a non-finite number');
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => (
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    )).join(',')}}`;
  }
  throw new Error(`setup JVM check report cannot serialize ${typeof value}`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
