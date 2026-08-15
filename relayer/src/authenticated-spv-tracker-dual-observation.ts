import { createHash } from 'crypto';

import {
  AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES,
  reconstructAuthenticatedSpvTrackerHistoryFromIndependentSources,
} from './authenticated-spv-tracker-reconstruction.js';
import {
  decodeBridgeCheckpointV1,
  deriveBridgeCheckpointCommitmentHex,
} from './bridge-checkpoint-commitment.js';
import { decodeCanonicalDlogSigmaPropRegister } from './ergo-encoding.js';
import {
  createBoundedAuthenticatedSpvTrackerReadOnlySource,
  normalizeAuthenticatedSpvTrackerNodeNetwork,
  normalizeRootReadOnlyNodeEndpoint,
  readMatchingAuthenticatedSpvTrackerNodeNetwork,
  type AuthenticatedSpvTrackerNodeSource,
} from './authenticated-spv-tracker-read-only-node-client.js';
import { canonicalNodeOrigin } from './ergo-node-endpoint-alignment.js';
import {
  decodeAuthenticatedSpvTrackerValue,
  deriveAuthenticatedSpvTrackerKey,
  getAuthenticatedSpvTrackerDigest,
} from './spv-tracker-authenticated.js';

export const AUTHENTICATED_SPV_TRACKER_DUAL_OBSERVATION_SCHEMA =
  'e2s.authenticated-spv-tracker-dual-observation.v2';

const NON_MAINNET_ENVIRONMENTS = new Set([
  'local',
  'development',
  'devnet',
  'patched-devnet',
  'testnet',
]);
const EXPECTED_NODE_NETWORK_BY_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({
  local: 'local',
  development: 'development',
  devnet: 'devnet',
  'patched-devnet': 'devnet',
  testnet: 'testnet',
});
const MAX_TRACKER_ERGO_TREE_BYTES = 32 * 1024;

export interface AuthenticatedSpvTrackerDualObservationRequest {
  environment: string;
  primaryNodeUrl: string;
  witnessNodeUrl: string;
  trackerNftIdHex: string;
  trackerGenesisBoxIdHex: string;
  trackerErgoTreeHex: string;
  sidechainIdHex: string;
}

export interface AuthenticatedSpvTrackerDualObservationEntry {
  keyHex: string;
  valueHex: string;
  encodedCheckpointHex: string;
  sidechainIdHex: string;
  sidechainHeight: string;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  checkpointCommitmentHex: string;
  anchorHeaderIdHex: string;
  anchorHeaderHeight: number;
  finality: {
    proofSystemId: 1;
    statementDigestHex: string;
    programIdHex: string;
    verifierProfileIdHex: string;
    proofPayloadDigestHex: string;
    proofDigestHex: string;
  };
}

export interface AuthenticatedSpvTrackerDualObservationReport {
  schema: typeof AUTHENTICATED_SPV_TRACKER_DUAL_OBSERVATION_SCHEMA;
  reportDigestHex: string;
  status: 'AGREED';
  observedAt: string;
  environment: string;
  sources: {
    primary: { role: 'primary'; endpointOrigin: string; network: string };
    witness: { role: 'witness'; endpointOrigin: string; network: string };
  };
  tracker: {
    nftIdHex: string;
    genesisBoxIdHex: string;
    finalityAttestorSigmaPropRegisterHex: string;
    ergoTreeSha256Hex: string;
    ergoTreeBytes: number;
    sidechainIdHex: string;
    tipBoxIdHex: string;
    tipDigestHex: string;
    observationDigestHex: string;
    observedTip: {
      idHex: string;
      parentIdHex: string;
      height: number;
      extensionRootHex: string;
    };
  };
  entries: readonly AuthenticatedSpvTrackerDualObservationEntry[];
  agreement: {
    distinctOrigins: true;
    sameNonMainnetNetwork: true;
    completeObservationIdentityMatched: true;
    exactLineageAndSnapshotMatched: true;
    exactRollingAvlReplayCompleted: true;
    sameUnspentTipObservedOnBothSources: true;
  };
  boundary: {
    readOnlyNodeRequestsOnly: true;
    apiKeyOrEnvironmentCredentialRead: false;
    runtimeDatabaseOpened: false;
    deploymentStateOpened: false;
    signerOrWalletMaterialRead: false;
    transactionCheckPerformed: false;
    transactionSubmitted: false;
    transactionBroadcast: false;
    independentNodeControlVerified: false;
    nodeAgreementProvesCanonicalConsensus: false;
    reportDigestAuthenticatesSource: false;
    observationDigestRecomputedFromReport: false;
    proofPayloadVerifiedByErgo: false;
    grandpaFinalityVerifiedByErgo: false;
    r9FinalityAuthority: true;
    gate5Closed: false;
    productionReady: false;
  };
  authorization: {
    build: false;
    check: false;
    sign: false;
    submit: false;
    broadcast: false;
    deploy: false;
  };
}

export type AuthenticatedSpvTrackerNodeSourceFactory = (
  nodeUrl: string,
) => AuthenticatedSpvTrackerNodeSource;

interface ObservationOptions {
  createSource?: AuthenticatedSpvTrackerNodeSourceFactory;
  now?: () => Date;
}

export async function observeAuthenticatedSpvTrackerFromDistinctNodeOrigins(
  request: AuthenticatedSpvTrackerDualObservationRequest,
  options: ObservationOptions = {},
): Promise<AuthenticatedSpvTrackerDualObservationReport> {
  const environment = normalizeEnvironment(request.environment);
  const primaryEndpoint = normalizeRootReadOnlyNodeEndpoint(
    request.primaryNodeUrl,
    'primary Ergo node URL',
  );
  const witnessEndpoint = normalizeRootReadOnlyNodeEndpoint(
    request.witnessNodeUrl,
    'witness Ergo node URL',
  );
  const primaryOrigin = canonicalNodeOrigin(primaryEndpoint, 'primary Ergo node URL');
  const witnessOrigin = canonicalNodeOrigin(witnessEndpoint, 'witness Ergo node URL');
  if (primaryOrigin === witnessOrigin) {
    throw new Error('primary and witness Ergo observations must use distinct node origins');
  }

  const trackerNftIdHex = fixedHex(request.trackerNftIdHex, 32, 'tracker NFT id');
  const trackerGenesisBoxIdHex = fixedHex(
    request.trackerGenesisBoxIdHex,
    32,
    'tracker genesis box id',
  );
  const sidechainIdHex = fixedHex(request.sidechainIdHex, 32, 'sidechain id');
  const trackerErgoTreeHex = variableHex(
    request.trackerErgoTreeHex,
    MAX_TRACKER_ERGO_TREE_BYTES,
    'tracker ErgoTree',
  );
  const createSource = options.createSource ?? createBoundedAuthenticatedSpvTrackerReadOnlySource;
  const primarySource = createSource(primaryEndpoint);
  const witnessSource = createSource(witnessEndpoint);
  if (primarySource === witnessSource) {
    throw new Error('primary and witness Ergo observations require distinct source instances');
  }

  const expectedNodeNetwork = EXPECTED_NODE_NETWORK_BY_ENVIRONMENT[environment];
  const networkBefore = await readMatchingAuthenticatedSpvTrackerNodeNetwork(
    primarySource,
    witnessSource,
    expectedNodeNetwork,
  );

  const reconstruction = await reconstructAuthenticatedSpvTrackerHistoryFromIndependentSources({
    primarySource,
    witnessSource,
    trackerNftIdHex,
    trackerErgoTreeHex,
    expectedSidechainIdHex: sidechainIdHex,
    expectedGenesisBoxIdHex: trackerGenesisBoxIdHex,
  });

  const networkAfter = await readMatchingAuthenticatedSpvTrackerNodeNetwork(
    primarySource,
    witnessSource,
    expectedNodeNetwork,
  );
  if (networkBefore !== networkAfter) {
    throw new Error('Ergo node network identity changed during dual-source reconstruction');
  }

  const entries = reconstruction.entries.map((entry) => {
    const decoded = decodeAuthenticatedSpvTrackerValue(entry.valueHex);
    if (decoded.finalityProofSystemId !== 1) {
      throw new Error('authenticated tracker observation requires native GRANDPA proof system 1');
    }
    return Object.freeze({
      keyHex: entry.keyHex,
      valueHex: entry.valueHex,
      encodedCheckpointHex: entry.encodedCheckpointHex,
      sidechainIdHex: entry.sidechainId,
      sidechainHeight: entry.sidechainHeight.toString(),
      executionBlockHashHex: entry.executionBlockHash,
      bridgeEventRootHex: entry.bridgeEventRoot,
      checkpointCommitmentHex: entry.checkpointCommitment,
      anchorHeaderIdHex: entry.anchorHeaderId,
      anchorHeaderHeight: entry.anchorHeaderHeight,
      finality: Object.freeze({
        proofSystemId: 1 as const,
        statementDigestHex: decoded.finalityStatementDigestHex,
        programIdHex: decoded.finalityProgramIdHex,
        verifierProfileIdHex: decoded.finalityVerifierProfileIdHex,
        proofPayloadDigestHex: decoded.finalityProofPayloadDigestHex,
        proofDigestHex: decoded.finalityProofDigestHex,
      }),
    });
  });
  const observedAt = normalizeObservedAt((options.now ?? (() => new Date()))());
  const withoutDigest: Omit<AuthenticatedSpvTrackerDualObservationReport, 'reportDigestHex'> = {
    schema: AUTHENTICATED_SPV_TRACKER_DUAL_OBSERVATION_SCHEMA,
    status: 'AGREED',
    observedAt,
    environment,
    sources: {
      primary: { role: 'primary', endpointOrigin: primaryOrigin, network: networkBefore },
      witness: { role: 'witness', endpointOrigin: witnessOrigin, network: networkBefore },
    },
    tracker: {
      nftIdHex: trackerNftIdHex,
      genesisBoxIdHex: reconstruction.genesisBoxId,
      finalityAttestorSigmaPropRegisterHex:
        reconstruction.finalityAttestorSigmaPropRegisterHex,
      ergoTreeSha256Hex: sha256Hex(Buffer.from(trackerErgoTreeHex, 'hex')),
      ergoTreeBytes: trackerErgoTreeHex.length / 2,
      sidechainIdHex,
      tipBoxIdHex: reconstruction.tipBoxId,
      tipDigestHex: reconstruction.tipDigestHex,
      observationDigestHex: reconstruction.observationDigestHex,
      observedTip: reconstruction.observedTip,
    },
    entries: Object.freeze(entries),
    agreement: {
      distinctOrigins: true,
      sameNonMainnetNetwork: true,
      completeObservationIdentityMatched: true,
      exactLineageAndSnapshotMatched: true,
      exactRollingAvlReplayCompleted: true,
      sameUnspentTipObservedOnBothSources: true,
    },
    boundary: {
      readOnlyNodeRequestsOnly: true,
      apiKeyOrEnvironmentCredentialRead: false,
      runtimeDatabaseOpened: false,
      deploymentStateOpened: false,
      signerOrWalletMaterialRead: false,
      transactionCheckPerformed: false,
      transactionSubmitted: false,
      transactionBroadcast: false,
      independentNodeControlVerified: false,
      nodeAgreementProvesCanonicalConsensus: false,
      reportDigestAuthenticatesSource: false,
      observationDigestRecomputedFromReport: false,
      proofPayloadVerifiedByErgo: false,
      grandpaFinalityVerifiedByErgo: false,
      r9FinalityAuthority: true,
      gate5Closed: false,
      productionReady: false,
    },
    authorization: {
      build: false,
      check: false,
      sign: false,
      submit: false,
      broadcast: false,
      deploy: false,
    },
  };
  return deepFreeze({
    ...withoutDigest,
    reportDigestHex: sha256Canonical(withoutDigest),
  });
}

export function validateAuthenticatedSpvTrackerDualObservationReport(
  value: unknown,
): AuthenticatedSpvTrackerDualObservationReport {
  const report = record(value, 'dual-source tracker observation report');
  exactKeys(report, [
    'schema',
    'reportDigestHex',
    'status',
    'observedAt',
    'environment',
    'sources',
    'tracker',
    'entries',
    'agreement',
    'boundary',
    'authorization',
  ], 'dual-source tracker observation report');
  if (report.schema !== AUTHENTICATED_SPV_TRACKER_DUAL_OBSERVATION_SCHEMA) {
    throw new Error(`dual-source tracker observation schema must be ${AUTHENTICATED_SPV_TRACKER_DUAL_OBSERVATION_SCHEMA}`);
  }
  if (report.status !== 'AGREED') {
    throw new Error('dual-source tracker observation status must be AGREED');
  }
  const reportDigestHex = fixedHex(report.reportDigestHex, 32, 'report digest');
  const observedAt = stringValue(report.observedAt, 'observedAt');
  if (normalizeObservedAt(new Date(observedAt)) !== observedAt) {
    throw new Error('observedAt must be canonical ISO-8601');
  }
  const environment = stringValue(report.environment, 'environment');
  if (normalizeEnvironment(environment) !== environment) {
    throw new Error('environment must use its canonical lowercase value');
  }

  const sources = record(report.sources, 'sources');
  exactKeys(sources, ['primary', 'witness'], 'sources');
  const primary = validateReportSource(sources.primary, 'primary');
  const witness = validateReportSource(sources.witness, 'witness');
  if (primary.endpointOrigin === witness.endpointOrigin) {
    throw new Error('report primary and witness origins must be distinct');
  }
  if (primary.network !== witness.network) {
    throw new Error('primary and witness Ergo nodes must report the same non-mainnet network');
  }
  assertEnvironmentNetwork(environment, primary.network);

  const tracker = record(report.tracker, 'tracker');
  exactKeys(tracker, [
    'nftIdHex',
    'genesisBoxIdHex',
    'finalityAttestorSigmaPropRegisterHex',
    'ergoTreeSha256Hex',
    'ergoTreeBytes',
    'sidechainIdHex',
    'tipBoxIdHex',
    'tipDigestHex',
    'observationDigestHex',
    'observedTip',
  ], 'tracker');
  fixedHex(tracker.nftIdHex, 32, 'tracker NFT id');
  fixedHex(tracker.genesisBoxIdHex, 32, 'tracker genesis box id');
  decodeCanonicalDlogSigmaPropRegister(
    stringValue(
      tracker.finalityAttestorSigmaPropRegisterHex,
      'tracker finality attestor SigmaProp register',
    ),
    'tracker finality attestor SigmaProp register',
  );
  fixedHex(tracker.ergoTreeSha256Hex, 32, 'tracker ErgoTree digest');
  const trackerErgoTreeBytes = positiveSafeInteger(
    tracker.ergoTreeBytes,
    'tracker ErgoTree byte length',
  );
  if (trackerErgoTreeBytes > MAX_TRACKER_ERGO_TREE_BYTES) {
    throw new Error(`tracker ErgoTree byte length must not exceed ${MAX_TRACKER_ERGO_TREE_BYTES}`);
  }
  fixedHex(tracker.sidechainIdHex, 32, 'tracker sidechain id');
  fixedHex(tracker.tipBoxIdHex, 32, 'tracker tip box id');
  const trackerTipDigestHex = fixedHex(tracker.tipDigestHex, 33, 'tracker tip digest');
  fixedHex(tracker.observationDigestHex, 32, 'tracker observation digest');
  const observedTip = record(tracker.observedTip, 'tracker observed tip');
  exactKeys(
    observedTip,
    ['idHex', 'parentIdHex', 'height', 'extensionRootHex'],
    'tracker observed tip',
  );
  fixedHex(observedTip.idHex, 32, 'observed tip id');
  fixedHex(observedTip.parentIdHex, 32, 'observed tip parent id');
  nonnegativeSafeInteger(observedTip.height, 'observed tip height');
  fixedHex(observedTip.extensionRootHex, 32, 'observed tip extension root');

  if (!Array.isArray(report.entries)) throw new Error('entries must be an array');
  if (report.entries.length > AUTHENTICATED_SPV_TRACKER_MAX_LINEAGE_BOXES - 1) {
    throw new Error('entries exceed the authenticated tracker lineage bound');
  }
  const validatedHistory = [];
  for (const [index, rawEntry] of report.entries.entries()) {
    validatedHistory.push(validateReportEntry(
      rawEntry,
      index,
      stringValue(tracker.sidechainIdHex, 'tracker sidechain id'),
    ));
  }
  if (getAuthenticatedSpvTrackerDigest(validatedHistory) !== trackerTipDigestHex) {
    throw new Error('reported tracker entries do not reproduce the tracker tip digest');
  }
  validateExactBooleanRecord(report.agreement, {
    distinctOrigins: true,
    sameNonMainnetNetwork: true,
    completeObservationIdentityMatched: true,
    exactLineageAndSnapshotMatched: true,
    exactRollingAvlReplayCompleted: true,
    sameUnspentTipObservedOnBothSources: true,
  }, 'agreement');
  validateExactBooleanRecord(report.boundary, {
    readOnlyNodeRequestsOnly: true,
    apiKeyOrEnvironmentCredentialRead: false,
    runtimeDatabaseOpened: false,
    deploymentStateOpened: false,
    signerOrWalletMaterialRead: false,
    transactionCheckPerformed: false,
    transactionSubmitted: false,
    transactionBroadcast: false,
    independentNodeControlVerified: false,
    nodeAgreementProvesCanonicalConsensus: false,
    reportDigestAuthenticatesSource: false,
    observationDigestRecomputedFromReport: false,
    proofPayloadVerifiedByErgo: false,
    grandpaFinalityVerifiedByErgo: false,
    r9FinalityAuthority: true,
    gate5Closed: false,
    productionReady: false,
  }, 'boundary');
  validateExactBooleanRecord(report.authorization, {
    build: false,
    check: false,
    sign: false,
    submit: false,
    broadcast: false,
    deploy: false,
  }, 'authorization');

  const { reportDigestHex: _discarded, ...withoutDigest } = report;
  if (sha256Canonical(withoutDigest) !== reportDigestHex) {
    throw new Error('dual-source tracker observation content does not match its report digest');
  }
  return deepFreeze(report as unknown as AuthenticatedSpvTrackerDualObservationReport);
}

function validateReportSource(value: unknown, role: 'primary' | 'witness') {
  const source = record(value, `${role} source`);
  exactKeys(source, ['role', 'endpointOrigin', 'network'], `${role} source`);
  if (source.role !== role) throw new Error(`${role} source role must be ${role}`);
  const endpointOrigin = stringValue(source.endpointOrigin, `${role} source endpoint origin`);
  if (canonicalNodeOrigin(endpointOrigin, `${role} source endpoint origin`) !== endpointOrigin) {
    throw new Error(`${role} source endpoint origin must be canonical`);
  }
  const rawNetwork = stringValue(source.network, `${role} source Ergo node network`);
  const network = normalizeAuthenticatedSpvTrackerNodeNetwork(
    rawNetwork,
    `${role} source Ergo node`,
  );
  if (rawNetwork !== network) {
    throw new Error(`${role} source Ergo node network must be canonical lowercase`);
  }
  return { endpointOrigin, network };
}

function validateReportEntry(
  value: unknown,
  index: number,
  sidechainIdHex: string,
): { key: string; value: string } {
  const label = `entry ${index}`;
  const entry = record(value, label);
  exactKeys(entry, [
    'keyHex',
    'valueHex',
    'encodedCheckpointHex',
    'sidechainIdHex',
    'sidechainHeight',
    'executionBlockHashHex',
    'bridgeEventRootHex',
    'checkpointCommitmentHex',
    'anchorHeaderIdHex',
    'anchorHeaderHeight',
    'finality',
  ], label);
  const keyHex = fixedHex(entry.keyHex, 32, `${label} key`);
  const valueHex = fixedHex(entry.valueHex, 264, `${label} value`);
  const encodedCheckpointHex = fixedHex(entry.encodedCheckpointHex, 216, `${label} checkpoint`);
  if (fixedHex(entry.sidechainIdHex, 32, `${label} sidechain id`) !== sidechainIdHex) {
    throw new Error(`${label} sidechain id does not match the tracker`);
  }
  const sidechainHeight = canonicalUint64String(
    entry.sidechainHeight,
    `${label} sidechain height`,
  );
  const executionBlockHashHex = fixedHex(
    entry.executionBlockHashHex,
    32,
    `${label} execution block hash`,
  );
  const bridgeEventRootHex = fixedHex(
    entry.bridgeEventRootHex,
    32,
    `${label} bridge event root`,
  );
  const checkpointCommitmentHex = fixedHex(
    entry.checkpointCommitmentHex,
    32,
    `${label} checkpoint commitment`,
  );
  fixedHex(entry.anchorHeaderIdHex, 32, `${label} anchor header id`);
  nonnegativeSafeInteger(entry.anchorHeaderHeight, `${label} anchor header height`);
  const finality = record(entry.finality, `${label} finality`);
  exactKeys(finality, [
    'proofSystemId',
    'statementDigestHex',
    'programIdHex',
    'verifierProfileIdHex',
    'proofPayloadDigestHex',
    'proofDigestHex',
  ], `${label} finality`);
  if (finality.proofSystemId !== 1) throw new Error(`${label} proofSystemId must be 1`);
  const decoded = decodeAuthenticatedSpvTrackerValue(valueHex);
  const expectedKeyHex = deriveAuthenticatedSpvTrackerKey({
    sidechainIdHex,
    sidechainHeight,
    executionBlockHashHex,
  });
  if (keyHex !== expectedKeyHex) {
    throw new Error(`${label} key does not match its sidechain identity`);
  }
  const checkpoint = decodeBridgeCheckpointV1(encodedCheckpointHex);
  const checkpointComparisons: Array<[unknown, unknown, string]> = [
    [checkpoint.sidechainIdHex, sidechainIdHex, 'checkpoint sidechain id'],
    [checkpoint.sidechainHeight, sidechainHeight, 'checkpoint sidechain height'],
    [checkpoint.executionBlockHashHex, executionBlockHashHex, 'checkpoint execution block hash'],
    [checkpoint.bridgeEventRootHex, bridgeEventRootHex, 'checkpoint bridge event root'],
    [deriveBridgeCheckpointCommitmentHex(encodedCheckpointHex), checkpointCommitmentHex,
      'derived checkpoint commitment'],
  ];
  for (const [actual, expected, field] of checkpointComparisons) {
    if (actual !== expected) throw new Error(`${label} ${field} does not match`);
  }
  const comparisons: Array<[unknown, unknown, string]> = [
    [entry.bridgeEventRootHex, decoded.bridgeEventRootHex, 'bridge event root'],
    [entry.checkpointCommitmentHex, decoded.checkpointCommitmentHex, 'checkpoint commitment'],
    [entry.anchorHeaderIdHex, decoded.anchorHeaderIdHex, 'anchor header id'],
    [entry.anchorHeaderHeight, decoded.anchorHeaderHeight, 'anchor header height'],
    [finality.proofSystemId, decoded.finalityProofSystemId, 'proof system id'],
    [finality.statementDigestHex, decoded.finalityStatementDigestHex, 'statement digest'],
    [finality.programIdHex, decoded.finalityProgramIdHex, 'program id'],
    [finality.verifierProfileIdHex, decoded.finalityVerifierProfileIdHex, 'verifier profile id'],
    [finality.proofPayloadDigestHex, decoded.finalityProofPayloadDigestHex, 'proof payload digest'],
    [finality.proofDigestHex, decoded.finalityProofDigestHex, 'proof digest'],
  ];
  for (const [actual, expected, field] of comparisons) {
    if (actual !== expected) throw new Error(`${label} ${field} does not match its tracker value`);
  }
  return { key: keyHex, value: valueHex };
}

function assertEnvironmentNetwork(environment: string, network: string): void {
  if (EXPECTED_NODE_NETWORK_BY_ENVIRONMENT[environment] !== network) {
    throw new Error(
      `environment ${environment} requires Ergo node network `
      + `${EXPECTED_NODE_NETWORK_BY_ENVIRONMENT[environment]}`,
    );
  }
}

function normalizeEnvironment(value: unknown): string {
  const environment = stringValue(value, 'environment').trim().toLowerCase();
  if (!NON_MAINNET_ENVIRONMENTS.has(environment)) {
    throw new Error('environment must be an explicit non-mainnet environment');
  }
  return environment;
}

function normalizeObservedAt(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('observedAt must be a valid date');
  }
  return value.toISOString();
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const normalized = stringValue(value, label);
  if (normalized.length !== bytes * 2 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`${label} must be ${bytes}-byte canonical lowercase hex`);
  }
  return normalized;
}

function variableHex(value: unknown, maxBytes: number, label: string): string {
  const normalized = stringValue(value, label);
  if (
    normalized.length === 0
    || normalized.length % 2 !== 0
    || normalized.length > maxBytes * 2
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be non-empty canonical lowercase hex within ${maxBytes} bytes`);
  }
  return normalized;
}

function canonicalUint64String(value: unknown, label: string): string {
  const normalized = stringValue(value, label);
  if (!/^(0|[1-9]\d*)$/.test(normalized) || BigInt(normalized) > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must be a canonical uint64 string`);
  }
  return normalized;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function exactKeys(value: Record<string, any>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fields do not match the canonical schema`);
  }
}

function validateExactBooleanRecord(
  value: unknown,
  expected: Readonly<Record<string, boolean>>,
  label: string,
): void {
  const actual = record(value, label);
  exactKeys(actual, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (actual[key] !== expectedValue) {
      throw new Error(`${label}.${key} must be ${expectedValue}`);
    }
  }
}

function sha256Canonical(value: unknown): string {
  return sha256Hex(Buffer.from(canonicalJson(value), 'utf8'));
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => (
    `${JSON.stringify(key)}:${canonicalJson(object[key])}`
  )).join(',')}}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
