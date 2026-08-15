import { createHash } from 'crypto';

import {
  initialBindingRequestFromFundingObservation,
  observeAuthenticatedV2Funding,
  type AuthenticatedV2FundingObservationFetch,
  type AuthenticatedV2FundingObservationReport,
} from './authenticated-v2-funding-observation.js';
import {
  assessAuthenticatedV2ProvisioningFunding,
  buildAuthenticatedV2ProvisioningPlan,
  type AuthenticatedV2ProvisioningFundingAssessment,
  type AuthenticatedV2ProvisioningInput,
  type AuthenticatedV2ProvisioningProvenance,
} from './authenticated-v2-provisioning-plan.js';

export const AUTHENTICATED_V2_PRE_SETUP_FUNDING_REVALIDATION_SCHEMA =
  'e2s.authenticated-v2-pre-setup-funding-revalidation.v1';

export interface AuthenticatedV2PreSetupFundingRevalidationRequest {
  provisioningInput: AuthenticatedV2ProvisioningInput;
  priorFundingObservationReport: unknown;
  expectedProvisioningPackageDigestHex: string;
  nodeUrl: string;
}

export interface AuthenticatedV2PreSetupFundingRevalidationReport {
  schema: typeof AUTHENTICATED_V2_PRE_SETUP_FUNDING_REVALIDATION_SCHEMA;
  reportDigestHex: string;
  status: 'PASS';
  environment: string;
  packageDigests: {
    expectedHex: string;
    priorRebuildHex: string;
    freshRebuildHex: string;
  };
  packageProvenance: AuthenticatedV2ProvisioningProvenance;
  observations: {
    prior: AuthenticatedV2FundingObservationReport;
    fresh: AuthenticatedV2FundingObservationReport;
  };
  exactBindings: {
    trackerFundingBoxId: string;
    dupVaultFundingBoxId: string;
    trackerBoxUnchanged: true;
    dupVaultBoxUnchanged: true;
    trackerSigmaBytesUnchanged: true;
    dupVaultSigmaBytesUnchanged: true;
    nodeNetworkUnchanged: true;
    provisioningPackageRebuilt: true;
  };
  funding: AuthenticatedV2ProvisioningFundingAssessment;
  boundary: {
    nodeReadOnlyRequestsPerformed: true;
    currentUtxoViewObserved: true;
    stableTipWindow: true;
    tipUtxoAtomicityProved: false;
    globalCanonicalityProved: false;
    continuedUnspentnessProved: false;
    fundingSufficiencyVerified: true;
    signerControlVerified: false;
    ergoVerifiableFinalityProved: false;
    sameInputsMustBeRevalidatedAtExecution: true;
    separateApprovalRequired: true;
  };
  authorization: {
    execute: false;
    sign: false;
    check: false;
    submit: false;
    broadcast: false;
    deploy: false;
    setup: false;
    gate5Closed: false;
    productionReady: false;
  };
}

interface RevalidationOptions {
  fetch?: AuthenticatedV2FundingObservationFetch;
  now?: () => Date;
}

const EXPECTED_BOUNDARY = {
  nodeReadOnlyRequestsPerformed: true,
  currentUtxoViewObserved: true,
  stableTipWindow: true,
  tipUtxoAtomicityProved: false,
  globalCanonicalityProved: false,
  continuedUnspentnessProved: false,
  fundingSufficiencyVerified: true,
  signerControlVerified: false,
  ergoVerifiableFinalityProved: false,
  sameInputsMustBeRevalidatedAtExecution: true,
  separateApprovalRequired: true,
} as const;

const EXPECTED_AUTHORIZATION = {
  execute: false,
  sign: false,
  check: false,
  submit: false,
  broadcast: false,
  deploy: false,
  setup: false,
  gate5Closed: false,
  productionReady: false,
} as const;

export async function revalidateAuthenticatedV2PreSetupFunding(
  request: AuthenticatedV2PreSetupFundingRevalidationRequest,
  options: RevalidationOptions = {},
): Promise<AuthenticatedV2PreSetupFundingRevalidationReport> {
  const expectedPackageDigestHex = canonicalFixedHex(
    request.expectedProvisioningPackageDigestHex,
    32,
    'expected provisioning package digest',
  );
  const baseline = await buildAuthenticatedV2ProvisioningPlan(request.provisioningInput);
  if (baseline.packageDigestHex !== expectedPackageDigestHex) {
    throw new Error('expected provisioning package digest does not match the rebuilt V2 package');
  }
  const prior = await initialBindingRequestFromFundingObservation(
    request.priorFundingObservationReport,
  );
  if (prior.request.environment !== request.provisioningInput.environment) {
    throw new Error('prior funding observation environment does not match the provisioning input');
  }
  if (canonicalJson(prior.binding)
    !== canonicalJson(request.provisioningInput.provenance.fundingObservation)) {
    throw new Error('prior funding observation does not match the provisioning package provenance');
  }
  assertSameBox(
    prior.provisioningFundingBoxes.trackerFundingBox,
    request.provisioningInput.trackerFundingBox,
    'prior tracker funding box',
  );
  assertSameBox(
    prior.provisioningFundingBoxes.dupVaultFundingBox,
    request.provisioningInput.dupVaultFundingBox,
    'prior DUP/vault funding box',
  );

  const freshObservation = await observeAuthenticatedV2Funding({
    environment: request.provisioningInput.environment,
    nodeUrl: request.nodeUrl,
    trackerFundingBoxId: baseline.identities.trackerNftId,
    dupVaultFundingBoxId: baseline.identities.duplicatePreventionNftId,
  }, options);
  const fresh = await initialBindingRequestFromFundingObservation(freshObservation);
  if (fresh.binding.nodeNetwork !== prior.binding.nodeNetwork) {
    throw new Error('fresh funding observation network does not match the prior observation');
  }
  assertSameBox(
    fresh.provisioningFundingBoxes.trackerFundingBox,
    request.provisioningInput.trackerFundingBox,
    'fresh tracker funding box',
  );
  assertSameBox(
    fresh.provisioningFundingBoxes.dupVaultFundingBox,
    request.provisioningInput.dupVaultFundingBox,
    'fresh DUP/vault funding box',
  );
  assertSameSigmaObservation(fresh.observations.tracker, prior.observations.tracker, 'tracker');
  assertSameSigmaObservation(
    fresh.observations.duplicatePreventionVault,
    prior.observations.duplicatePreventionVault,
    'DUP/vault',
  );

  const funding = assessAuthenticatedV2ProvisioningFunding({
    trackerFundingNanoErg: fresh.provisioningFundingBoxes.trackerFundingBox.value,
    dupVaultFundingNanoErg: fresh.provisioningFundingBoxes.dupVaultFundingBox.value,
    values: request.provisioningInput.values,
  });
  if (!funding.tracker.sufficient) {
    throw new Error('fresh tracker funding box is insufficient for the exact provisioning package');
  }
  if (!funding.duplicatePreventionAndVault.sufficient) {
    throw new Error('fresh DUP/vault funding box is insufficient for the exact provisioning package');
  }

  const freshPackage = await buildAuthenticatedV2ProvisioningPlan({
    ...request.provisioningInput,
    trackerFundingBox: fresh.provisioningFundingBoxes.trackerFundingBox,
    dupVaultFundingBox: fresh.provisioningFundingBoxes.dupVaultFundingBox,
  });
  if (freshPackage.packageDigestHex !== expectedPackageDigestHex) {
    throw new Error('fresh funding boxes do not rebuild the expected provisioning package');
  }

  const withoutDigest: Omit<
    AuthenticatedV2PreSetupFundingRevalidationReport,
    'reportDigestHex'
  > = {
    schema: AUTHENTICATED_V2_PRE_SETUP_FUNDING_REVALIDATION_SCHEMA,
    status: 'PASS',
    environment: request.provisioningInput.environment,
    packageDigests: {
      expectedHex: expectedPackageDigestHex,
      priorRebuildHex: baseline.packageDigestHex,
      freshRebuildHex: freshPackage.packageDigestHex,
    },
    packageProvenance: structuredClone(request.provisioningInput.provenance),
    observations: {
      prior: prior.report,
      fresh: freshObservation,
    },
    exactBindings: {
      trackerFundingBoxId: baseline.identities.trackerNftId,
      dupVaultFundingBoxId: baseline.identities.duplicatePreventionNftId,
      trackerBoxUnchanged: true,
      dupVaultBoxUnchanged: true,
      trackerSigmaBytesUnchanged: true,
      dupVaultSigmaBytesUnchanged: true,
      nodeNetworkUnchanged: true,
      provisioningPackageRebuilt: true,
    },
    funding,
    boundary: EXPECTED_BOUNDARY,
    authorization: EXPECTED_AUTHORIZATION,
  };
  const report = {
    ...withoutDigest,
    reportDigestHex: sha256Canonical(withoutDigest),
  };
  return validateAuthenticatedV2PreSetupFundingRevalidationReport(
    report,
    request.provisioningInput,
    expectedPackageDigestHex,
    freshObservation.reportDigestHex,
  );
}

export async function validateAuthenticatedV2PreSetupFundingRevalidationReport(
  value: unknown,
  provisioningInput: AuthenticatedV2ProvisioningInput,
  expectedProvisioningPackageDigestHex: string,
  expectedFreshObservationReportDigestHex: string,
): Promise<AuthenticatedV2PreSetupFundingRevalidationReport> {
  const report = requireRecord(value, 'pre-setup funding revalidation report');
  assertExactKeys(report, [
    'schema',
    'reportDigestHex',
    'status',
    'environment',
    'packageDigests',
    'packageProvenance',
    'observations',
    'exactBindings',
    'funding',
    'boundary',
    'authorization',
  ], 'pre-setup funding revalidation report');
  if (report.schema !== AUTHENTICATED_V2_PRE_SETUP_FUNDING_REVALIDATION_SCHEMA) {
    throw new Error(
      `pre-setup funding revalidation schema must be ${AUTHENTICATED_V2_PRE_SETUP_FUNDING_REVALIDATION_SCHEMA}`,
    );
  }
  if (report.status !== 'PASS') {
    throw new Error('pre-setup funding revalidation status must be PASS');
  }
  const reportDigestHex = canonicalFixedHex(
    report.reportDigestHex,
    32,
    'pre-setup funding revalidation report digest',
  );
  const { reportDigestHex: _discardedDigest, ...withoutDigest } = report;
  if (sha256Canonical(withoutDigest) !== reportDigestHex) {
    throw new Error('pre-setup funding revalidation content does not match its report digest');
  }

  const expectedPackageDigestHex = canonicalFixedHex(
    expectedProvisioningPackageDigestHex,
    32,
    'expected provisioning package digest',
  );
  const packageDigests = requireRecord(report.packageDigests, 'revalidation package digests');
  assertExactKeys(
    packageDigests,
    ['expectedHex', 'priorRebuildHex', 'freshRebuildHex'],
    'revalidation package digests',
  );
  for (const [key, label] of [
    ['expectedHex', 'expected'],
    ['priorRebuildHex', 'prior rebuild'],
    ['freshRebuildHex', 'fresh rebuild'],
  ] as const) {
    if (canonicalFixedHex(packageDigests[key], 32, `${label} provisioning package digest`)
      !== expectedPackageDigestHex) {
      throw new Error(`revalidation ${label} package digest does not match the expected package`);
    }
  }
  const baseline = await buildAuthenticatedV2ProvisioningPlan(provisioningInput);
  if (baseline.packageDigestHex !== expectedPackageDigestHex) {
    throw new Error('expected provisioning package digest does not match the rebuilt V2 package');
  }
  if (report.environment !== provisioningInput.environment) {
    throw new Error('revalidation report environment does not match the provisioning input');
  }
  if (canonicalJson(report.packageProvenance) !== canonicalJson(provisioningInput.provenance)) {
    throw new Error('revalidation package provenance does not match the provisioning input');
  }

  const observations = requireRecord(report.observations, 'revalidation observations');
  assertExactKeys(observations, ['prior', 'fresh'], 'revalidation observations');
  const prior = await initialBindingRequestFromFundingObservation(observations.prior);
  if (prior.request.environment !== provisioningInput.environment) {
    throw new Error('prior funding observation environment does not match the provisioning input');
  }
  if (canonicalJson(prior.binding)
    !== canonicalJson(provisioningInput.provenance.fundingObservation)) {
    throw new Error('prior funding observation does not match the provisioning package provenance');
  }
  const expectedFreshObservationDigestHex = canonicalFixedHex(
    expectedFreshObservationReportDigestHex,
    32,
    'externally captured fresh funding observation report digest',
  );
  const rawFreshObservation = requireRecord(
    observations.fresh,
    'fresh funding observation report',
  );
  const rawFreshObservationDigestHex = canonicalFixedHex(
    rawFreshObservation.reportDigestHex,
    32,
    'fresh funding observation report digest',
  );
  if (rawFreshObservationDigestHex !== expectedFreshObservationDigestHex) {
    throw new Error(
      'fresh funding observation report digest does not match the externally captured digest',
    );
  }
  const fresh = await initialBindingRequestFromFundingObservation(observations.fresh);
  if (fresh.request.environment !== provisioningInput.environment) {
    throw new Error('fresh funding observation environment does not match the provisioning input');
  }
  if (fresh.binding.nodeNetwork !== prior.binding.nodeNetwork) {
    throw new Error('fresh funding observation network does not match the prior observation');
  }
  assertSameBox(
    prior.provisioningFundingBoxes.trackerFundingBox,
    provisioningInput.trackerFundingBox,
    'prior tracker funding box',
  );
  assertSameBox(
    prior.provisioningFundingBoxes.dupVaultFundingBox,
    provisioningInput.dupVaultFundingBox,
    'prior DUP/vault funding box',
  );
  assertSameBox(
    fresh.provisioningFundingBoxes.trackerFundingBox,
    provisioningInput.trackerFundingBox,
    'fresh tracker funding box',
  );
  assertSameBox(
    fresh.provisioningFundingBoxes.dupVaultFundingBox,
    provisioningInput.dupVaultFundingBox,
    'fresh DUP/vault funding box',
  );
  assertSameSigmaObservation(fresh.observations.tracker, prior.observations.tracker, 'tracker');
  assertSameSigmaObservation(
    fresh.observations.duplicatePreventionVault,
    prior.observations.duplicatePreventionVault,
    'DUP/vault',
  );

  const bindings = requireRecord(report.exactBindings, 'revalidation exact bindings');
  assertExactKeys(bindings, [
    'trackerFundingBoxId',
    'dupVaultFundingBoxId',
    'trackerBoxUnchanged',
    'dupVaultBoxUnchanged',
    'trackerSigmaBytesUnchanged',
    'dupVaultSigmaBytesUnchanged',
    'nodeNetworkUnchanged',
    'provisioningPackageRebuilt',
  ], 'revalidation exact bindings');
  if (canonicalFixedHex(bindings.trackerFundingBoxId, 32, 'tracker funding box ID')
    !== baseline.identities.trackerNftId) {
    throw new Error('revalidation tracker funding box ID does not match the package');
  }
  if (canonicalFixedHex(bindings.dupVaultFundingBoxId, 32, 'DUP/vault funding box ID')
    !== baseline.identities.duplicatePreventionNftId) {
    throw new Error('revalidation DUP/vault funding box ID does not match the package');
  }
  for (const key of [
    'trackerBoxUnchanged',
    'dupVaultBoxUnchanged',
    'trackerSigmaBytesUnchanged',
    'dupVaultSigmaBytesUnchanged',
    'nodeNetworkUnchanged',
    'provisioningPackageRebuilt',
  ] as const) {
    if (bindings[key] !== true) throw new Error(`revalidation ${key} must be true`);
  }

  const expectedFunding = assessAuthenticatedV2ProvisioningFunding({
    trackerFundingNanoErg: fresh.provisioningFundingBoxes.trackerFundingBox.value,
    dupVaultFundingNanoErg: fresh.provisioningFundingBoxes.dupVaultFundingBox.value,
    values: provisioningInput.values,
  });
  if (!expectedFunding.allSufficient) {
    throw new Error('revalidation funding is insufficient for the exact provisioning package');
  }
  if (canonicalJson(report.funding) !== canonicalJson(expectedFunding)) {
    throw new Error('revalidation funding assessment does not match the exact package values');
  }

  assertExpectedBooleanRecord(report.boundary, EXPECTED_BOUNDARY, 'revalidation boundary');
  assertExpectedBooleanRecord(
    report.authorization,
    EXPECTED_AUTHORIZATION,
    'revalidation authorization',
  );
  const freshPackage = await buildAuthenticatedV2ProvisioningPlan({
    ...provisioningInput,
    trackerFundingBox: fresh.provisioningFundingBoxes.trackerFundingBox,
    dupVaultFundingBox: fresh.provisioningFundingBoxes.dupVaultFundingBox,
  });
  if (freshPackage.packageDigestHex !== expectedPackageDigestHex) {
    throw new Error('fresh funding boxes do not rebuild the expected provisioning package');
  }
  return deepFreeze(
    structuredClone(report) as unknown as AuthenticatedV2PreSetupFundingRevalidationReport,
  );
}

function assertSameBox(actual: unknown, expected: unknown, label: string): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} does not match the provisioning package`);
  }
}

function assertSameSigmaObservation(
  actual: { sigmaSerializedHex: string; sigmaSerializedSha256Hex: string },
  expected: { sigmaSerializedHex: string; sigmaSerializedSha256Hex: string },
  label: string,
): void {
  if (actual.sigmaSerializedHex !== expected.sigmaSerializedHex) {
    throw new Error(`fresh ${label} funding box Sigma bytes do not match the prior observation`);
  }
  if (actual.sigmaSerializedSha256Hex !== expected.sigmaSerializedSha256Hex) {
    throw new Error(`fresh ${label} funding box Sigma digest does not match the prior observation`);
  }
}

function assertExpectedBooleanRecord(
  value: unknown,
  expected: Record<string, boolean>,
  label: string,
): void {
  const record = requireRecord(value, label);
  assertExactKeys(record, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (record[key] !== expectedValue) throw new Error(`${label}.${key} must be ${expectedValue}`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function assertExactKeys(value: Record<string, any>, expected: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exactly: ${wanted.join(', ')}`);
  }
}

function canonicalFixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be canonical lowercase ${bytes}-byte hex`);
  }
  return value;
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
    if (!Number.isFinite(value)) throw new Error('revalidation report cannot contain non-finite numbers');
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
  throw new Error(`revalidation report cannot serialize ${typeof value}`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
