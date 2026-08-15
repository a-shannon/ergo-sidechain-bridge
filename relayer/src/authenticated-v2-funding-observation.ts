import { createHash } from 'crypto';

import {
  AUTHENTICATED_V2_INITIAL_BINDING_INPUT_SCHEMA,
} from './authenticated-v2-initial-binding-schema.js';
import type {
  AuthenticatedV2FundingObservationBinding,
  AuthenticatedV2InitialBindingRequest,
} from './authenticated-v2-initial-binding.js';
import { validateReadOnlyNodeUrl } from './read-only-node-url.js';
import {
  normalizeEip12Box,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

export const AUTHENTICATED_V2_FUNDING_OBSERVATION_SCHEMA =
  'e2s.authenticated-v2-funding-observation.v1';

export type AuthenticatedV2FundingObservationFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface AuthenticatedV2FundingObservationRequest {
  environment: string;
  nodeUrl: string;
  trackerFundingBoxId: string;
  dupVaultFundingBoxId: string;
}

export interface AuthenticatedV2FundingBoxObservation {
  role: 'tracker' | 'duplicate-prevention-vault';
  box: Eip12Box;
  sigmaSerializedHex: string;
  sigmaSerializedSha256Hex: string;
  checks: {
    requestedBoxIdMatched: true;
    boxIdRecomputedFromJson: true;
    sigmaBytesCanonical: true;
    jsonBinaryMatched: true;
    pureErg: true;
    presentInCurrentUtxoView: true;
  };
}

export interface AuthenticatedV2FundingObservationReport {
  schema: typeof AUTHENTICATED_V2_FUNDING_OBSERVATION_SCHEMA;
  reportDigestHex: string;
  status: 'OBSERVED';
  observedAt: string;
  environment: string;
  node: {
    endpointOrigin: string;
    network: string;
    tipHeight: number;
    tipIdHex: string;
    snapshotDigestHex: string;
  };
  requestedBoxIds: {
    trackerFundingBoxId: string;
    dupVaultFundingBoxId: string;
  };
  boxes: {
    tracker: AuthenticatedV2FundingBoxObservation;
    duplicatePreventionVault: AuthenticatedV2FundingBoxObservation;
  };
  downstream: {
    initialBindingInput: {
      schema: typeof AUTHENTICATED_V2_INITIAL_BINDING_INPUT_SCHEMA;
      environment: string;
      trackerFundingBoxId: string;
      dupVaultFundingBoxId: string;
    };
    provisioningFundingBoxes: {
      trackerFundingBox: Eip12Box;
      dupVaultFundingBox: Eip12Box;
    };
  };
  boundary: {
    nodeReadOnlyRequestsPerformed: true;
    apiKeyOrEnvironmentCredentialRead: false;
    authHeaderSent: false;
    runtimeDatabaseOpened: false;
    deploymentStateOpened: false;
    currentUtxoViewObserved: true;
    stableTipWindow: true;
    tipUtxoAtomicityProved: false;
    globalCanonicalityProved: false;
    fundingSufficiencyVerified: false;
    signerControlVerified: false;
    revalidationRequiredBeforeSetup: true;
  };
  authorization: {
    execute: false;
    sign: false;
    check: false;
    submit: false;
    broadcast: false;
    deploy: false;
    gate5Closed: false;
    productionReady: false;
  };
}

interface FundingObservationOptions {
  fetch?: AuthenticatedV2FundingObservationFetch;
  now?: () => Date;
}

export interface ValidatedAuthenticatedV2FundingObservation {
  report: AuthenticatedV2FundingObservationReport;
  request: AuthenticatedV2InitialBindingRequest;
  binding: AuthenticatedV2FundingObservationBinding;
  provisioningFundingBoxes: {
    trackerFundingBox: Eip12Box;
    dupVaultFundingBox: Eip12Box;
  };
  observations: {
    tracker: {
      box: Eip12Box;
      sigmaSerializedHex: string;
      sigmaSerializedSha256Hex: string;
    };
    duplicatePreventionVault: {
      box: Eip12Box;
      sigmaSerializedHex: string;
      sigmaSerializedSha256Hex: string;
    };
  };
}

interface NodeSnapshot {
  network: string;
  tipHeight: number;
  tipIdHex: string;
}

const NON_MAINNET_NODE_NETWORKS = new Set(['testnet', 'devnet', 'local', 'development']);
const MAX_NODE_RESPONSE_BYTES = 2 * 1024 * 1024;
const NODE_REQUEST_TIMEOUT_MS = 30_000;
const NON_MAINNET_ENVIRONMENTS = new Set([
  'local',
  'development',
  'devnet',
  'patched-devnet',
  'testnet',
]);

export async function observeAuthenticatedV2Funding(
  request: AuthenticatedV2FundingObservationRequest,
  options: FundingObservationOptions = {},
): Promise<AuthenticatedV2FundingObservationReport> {
  const environment = normalizeEnvironment(request.environment);
  const endpointOrigin = normalizeRootNodeEndpoint(request.nodeUrl);
  const trackerFundingBoxId = canonicalBoxId(
    request.trackerFundingBoxId,
    'tracker funding box ID',
  );
  const dupVaultFundingBoxId = canonicalBoxId(
    request.dupVaultFundingBoxId,
    'DUP/vault funding box ID',
  );
  if (trackerFundingBoxId === dupVaultFundingBoxId) {
    throw new Error('tracker and DUP/vault funding box IDs must be distinct');
  }

  const fetchFn = options.fetch ?? fetch;
  const before = await observeNodeSnapshot(fetchFn, endpointOrigin);
  const tracker = await observeFundingBox(
    fetchFn,
    endpointOrigin,
    trackerFundingBoxId,
    'tracker funding box',
    'tracker',
    before.tipHeight,
  );
  const duplicatePreventionVault = await observeFundingBox(
    fetchFn,
    endpointOrigin,
    dupVaultFundingBoxId,
    'DUP/vault funding box',
    'duplicate-prevention-vault',
    before.tipHeight,
  );
  const after = await observeNodeSnapshot(fetchFn, endpointOrigin);
  if (canonicalJson(before) !== canonicalJson(after)) {
    throw new Error('Ergo node tip changed during funding-box observation; retry against one stable tip');
  }

  const observedAt = normalizeObservedAt((options.now ?? (() => new Date()))());
  const snapshotDigestHex = sha256Canonical(before);
  const withoutDigest: Omit<AuthenticatedV2FundingObservationReport, 'reportDigestHex'> = {
    schema: AUTHENTICATED_V2_FUNDING_OBSERVATION_SCHEMA,
    status: 'OBSERVED',
    observedAt,
    environment,
    node: {
      endpointOrigin,
      network: before.network,
      tipHeight: before.tipHeight,
      tipIdHex: before.tipIdHex,
      snapshotDigestHex,
    },
    requestedBoxIds: { trackerFundingBoxId, dupVaultFundingBoxId },
    boxes: { tracker, duplicatePreventionVault },
    downstream: {
      initialBindingInput: {
        schema: AUTHENTICATED_V2_INITIAL_BINDING_INPUT_SCHEMA,
        environment,
        trackerFundingBoxId,
        dupVaultFundingBoxId,
      },
      provisioningFundingBoxes: {
        trackerFundingBox: tracker.box,
        dupVaultFundingBox: duplicatePreventionVault.box,
      },
    },
    boundary: {
      nodeReadOnlyRequestsPerformed: true,
      apiKeyOrEnvironmentCredentialRead: false,
      authHeaderSent: false,
      runtimeDatabaseOpened: false,
      deploymentStateOpened: false,
      currentUtxoViewObserved: true,
      stableTipWindow: true,
      tipUtxoAtomicityProved: false,
      globalCanonicalityProved: false,
      fundingSufficiencyVerified: false,
      signerControlVerified: false,
      revalidationRequiredBeforeSetup: true,
    },
    authorization: {
      execute: false,
      sign: false,
      check: false,
      submit: false,
      broadcast: false,
      deploy: false,
      gate5Closed: false,
      productionReady: false,
    },
  };
  return deepFreeze({
    ...withoutDigest,
    reportDigestHex: sha256Canonical(withoutDigest),
  });
}

export async function initialBindingRequestFromFundingObservation(
  value: unknown,
): Promise<ValidatedAuthenticatedV2FundingObservation> {
  const report = requireRecord(value, 'funding observation report');
  assertExactKeys(report, [
    'schema',
    'reportDigestHex',
    'status',
    'observedAt',
    'environment',
    'node',
    'requestedBoxIds',
    'boxes',
    'downstream',
    'boundary',
    'authorization',
  ], 'funding observation report');
  if (report.schema !== AUTHENTICATED_V2_FUNDING_OBSERVATION_SCHEMA) {
    throw new Error(`funding observation schema must be ${AUTHENTICATED_V2_FUNDING_OBSERVATION_SCHEMA}`);
  }
  if (report.status !== 'OBSERVED') throw new Error('funding observation status must be OBSERVED');
  const reportDigestHex = canonicalFixedHex(
    report.reportDigestHex,
    32,
    'funding observation report digest',
  );
  const { reportDigestHex: _discardedDigest, ...withoutDigest } = report;
  if (sha256Canonical(withoutDigest) !== reportDigestHex) {
    throw new Error('funding observation content does not match its report digest');
  }

  const environment = normalizeEnvironment(report.environment);
  if (typeof report.observedAt !== 'string') {
    throw new Error('funding observation observedAt must be canonical ISO-8601');
  }
  const observedAtDate = new Date(report.observedAt);
  const observedAt = normalizeObservedAt(observedAtDate);
  if (observedAt !== report.observedAt) {
    throw new Error('funding observation observedAt must be canonical ISO-8601');
  }

  const node = requireRecord(report.node, 'funding observation node');
  assertExactKeys(node, [
    'endpointOrigin',
    'network',
    'tipHeight',
    'tipIdHex',
    'snapshotDigestHex',
  ], 'funding observation node');
  const endpointOrigin = normalizeRootNodeEndpoint(node.endpointOrigin);
  const nodeNetwork = normalizeNodeNetwork(node.network);
  const tipHeight = nonNegativeSafeInteger(node.tipHeight, 'funding observation tip height');
  const tipIdHex = canonicalFixedHex(node.tipIdHex, 32, 'funding observation tip ID');
  const snapshotDigestHex = canonicalFixedHex(
    node.snapshotDigestHex,
    32,
    'funding observation snapshot digest',
  );
  if (sha256Canonical({ network: nodeNetwork, tipHeight, tipIdHex }) !== snapshotDigestHex) {
    throw new Error('funding observation node snapshot does not match its digest');
  }
  if (endpointOrigin !== node.endpointOrigin) {
    throw new Error('funding observation node endpoint must be canonical');
  }

  const requested = requireRecord(report.requestedBoxIds, 'funding observation requested box IDs');
  assertExactKeys(
    requested,
    ['trackerFundingBoxId', 'dupVaultFundingBoxId'],
    'funding observation requested box IDs',
  );
  const trackerFundingBoxId = canonicalBoxId(
    requested.trackerFundingBoxId,
    'tracker funding box ID',
  );
  const dupVaultFundingBoxId = canonicalBoxId(
    requested.dupVaultFundingBoxId,
    'DUP/vault funding box ID',
  );
  if (trackerFundingBoxId === dupVaultFundingBoxId) {
    throw new Error('tracker and DUP/vault funding box IDs must be distinct');
  }

  const boxes = requireRecord(report.boxes, 'funding observation boxes');
  assertExactKeys(
    boxes,
    ['tracker', 'duplicatePreventionVault'],
    'funding observation boxes',
  );
  const trackerObservation = await assertObservedBoxBinding(
    boxes.tracker,
    'tracker',
    trackerFundingBoxId,
    'tracker funding observation',
  );
  const dupVaultObservation = await assertObservedBoxBinding(
    boxes.duplicatePreventionVault,
    'duplicate-prevention-vault',
    dupVaultFundingBoxId,
    'DUP/vault funding observation',
  );
  const trackerBox = trackerObservation.box;
  const dupVaultBox = dupVaultObservation.box;
  if (trackerBox.creationHeight > tipHeight || dupVaultBox.creationHeight > tipHeight) {
    throw new Error('funding observation contains a box created after the observed node tip');
  }

  const downstream = requireRecord(report.downstream, 'funding observation downstream');
  assertExactKeys(
    downstream,
    ['initialBindingInput', 'provisioningFundingBoxes'],
    'funding observation downstream',
  );
  const initial = requireRecord(
    downstream.initialBindingInput,
    'funding observation initial binding input',
  );
  assertExactKeys(initial, [
    'schema',
    'environment',
    'trackerFundingBoxId',
    'dupVaultFundingBoxId',
  ], 'funding observation initial binding input');
  if (initial.schema !== AUTHENTICATED_V2_INITIAL_BINDING_INPUT_SCHEMA) {
    throw new Error('funding observation initial binding input schema does not match');
  }
  if (initial.environment !== environment) {
    throw new Error('funding observation initial binding environment does not match');
  }
  if (initial.trackerFundingBoxId !== trackerFundingBoxId) {
    throw new Error('funding observation initial binding tracker ID does not match');
  }
  if (initial.dupVaultFundingBoxId !== dupVaultFundingBoxId) {
    throw new Error('funding observation initial binding DUP/vault ID does not match');
  }
  const provisioning = requireRecord(
    downstream.provisioningFundingBoxes,
    'funding observation provisioning boxes',
  );
  assertExactKeys(
    provisioning,
    ['trackerFundingBox', 'dupVaultFundingBox'],
    'funding observation provisioning boxes',
  );
  await assertProvisioningBoxBinding(
    provisioning.trackerFundingBox,
    trackerBox,
    'funding observation provisioning tracker box',
  );
  await assertProvisioningBoxBinding(
    provisioning.dupVaultFundingBox,
    dupVaultBox,
    'funding observation provisioning DUP/vault box',
  );

  assertExpectedBooleanRecord(report.boundary, {
    nodeReadOnlyRequestsPerformed: true,
    apiKeyOrEnvironmentCredentialRead: false,
    authHeaderSent: false,
    runtimeDatabaseOpened: false,
    deploymentStateOpened: false,
    currentUtxoViewObserved: true,
    stableTipWindow: true,
    tipUtxoAtomicityProved: false,
    globalCanonicalityProved: false,
    fundingSufficiencyVerified: false,
    signerControlVerified: false,
    revalidationRequiredBeforeSetup: true,
  }, 'funding observation boundary');
  assertExpectedBooleanRecord(report.authorization, {
    execute: false,
    sign: false,
    check: false,
    submit: false,
    broadcast: false,
    deploy: false,
    gate5Closed: false,
    productionReady: false,
  }, 'funding observation authorization');

  return {
    report: deepFreeze(
      structuredClone(report) as unknown as AuthenticatedV2FundingObservationReport,
    ),
    request: {
      environment,
      trackerFundingBoxId,
      dupVaultFundingBoxId,
    },
    binding: {
      reportDigestHex,
      snapshotDigestHex,
      observedAt,
      nodeNetwork,
      tipHeight,
      tipIdHex,
    },
    provisioningFundingBoxes: {
      trackerFundingBox: trackerBox,
      dupVaultFundingBox: dupVaultBox,
    },
    observations: {
      tracker: trackerObservation,
      duplicatePreventionVault: dupVaultObservation,
    },
  };
}

async function assertObservedBoxBinding(
  value: unknown,
  expectedRole: AuthenticatedV2FundingBoxObservation['role'],
  expectedBoxId: string,
  label: string,
): Promise<{
  box: Eip12Box;
  sigmaSerializedHex: string;
  sigmaSerializedSha256Hex: string;
}> {
  const observation = requireRecord(value, label);
  assertExactKeys(observation, [
    'role',
    'box',
    'sigmaSerializedHex',
    'sigmaSerializedSha256Hex',
    'checks',
  ], label);
  if (observation.role !== expectedRole) throw new Error(`${label} role does not match`);
  const box = await normalizeEip12Box(observation.box, `${label} box`);
  if (box.boxId !== expectedBoxId) throw new Error(`${label} box ID does not match`);
  if (box.assets.length !== 0) throw new Error(`${label} box must remain pure ERG`);
  const sigmaSerializedHex = canonicalVariableHex(
    observation.sigmaSerializedHex,
    `${label} Sigma bytes`,
  );
  const sigmaSerializedSha256Hex = canonicalFixedHex(
    observation.sigmaSerializedSha256Hex,
    32,
    `${label} Sigma SHA-256`,
  );
  if (sha256Bytes(Buffer.from(sigmaSerializedHex, 'hex')) !== sigmaSerializedSha256Hex) {
    throw new Error(`${label} Sigma bytes do not match their SHA-256`);
  }
  const binaryBox = await parseCanonicalSigmaBox(sigmaSerializedHex, `${label} Sigma bytes`);
  if (canonicalJson(binaryBox) !== canonicalJson(box)) {
    throw new Error(`${label} JSON and binary box observations do not match`);
  }
  assertExpectedBooleanRecord(observation.checks, {
    requestedBoxIdMatched: true,
    boxIdRecomputedFromJson: true,
    sigmaBytesCanonical: true,
    jsonBinaryMatched: true,
    pureErg: true,
    presentInCurrentUtxoView: true,
  }, `${label} checks`);
  return { box, sigmaSerializedHex, sigmaSerializedSha256Hex };
}

async function assertProvisioningBoxBinding(
  value: unknown,
  expectedBox: Eip12Box,
  label: string,
): Promise<void> {
  const box = await normalizeEip12Box(value, label);
  if (canonicalJson(box) !== canonicalJson(expectedBox)) {
    throw new Error(`${label} does not match the observed box`);
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
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function assertExactKeys(value: Record<string, any>, expected: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exactly: ${wanted.join(', ')}`);
  }
}

async function observeNodeSnapshot(
  fetchFn: AuthenticatedV2FundingObservationFetch,
  endpointOrigin: string,
): Promise<NodeSnapshot> {
  const info = await requestJson(fetchFn, endpointOrigin, '/info', 'node info');
  const network = normalizeNodeNetwork(info.network);
  const tipHeight = nonNegativeSafeInteger(info.fullHeight, 'node fullHeight');
  const lastHeaders = await requestJson(
    fetchFn,
    endpointOrigin,
    '/blocks/lastHeaders/1',
    'latest header',
  );
  if (!Array.isArray(lastHeaders) || lastHeaders.length !== 1 || !isRecord(lastHeaders[0])) {
    throw new Error('latest header response must contain exactly one header');
  }
  const header = lastHeaders[0];
  const headerHeight = nonNegativeSafeInteger(header.height, 'latest header height');
  const tipIdHex = canonicalFixedHex(header.id, 32, 'latest header ID');
  if (headerHeight !== tipHeight) {
    throw new Error('node info height and latest header height do not match');
  }
  return { network, tipHeight, tipIdHex };
}

async function observeFundingBox(
  fetchFn: AuthenticatedV2FundingObservationFetch,
  endpointOrigin: string,
  requestedBoxId: string,
  label: string,
  role: AuthenticatedV2FundingBoxObservation['role'],
  tipHeight: number,
): Promise<AuthenticatedV2FundingBoxObservation> {
  const jsonPath = `/utxo/byId/${requestedBoxId}`;
  const rawBox = await requestJson(fetchFn, endpointOrigin, jsonPath, label, true);
  const box = await normalizeEip12Box(rawBox, label);
  if (box.boxId !== requestedBoxId) {
    throw new Error(`${label} did not match the requested box ID`);
  }
  if (box.creationHeight > tipHeight) {
    throw new Error(`${label} creation height exceeds the observed node tip`);
  }
  if (box.assets.length !== 0) {
    throw new Error(`${label} must be a pure ERG box with no tokens`);
  }

  const binaryResponse = await requestJson(
    fetchFn,
    endpointOrigin,
    `/utxo/byIdBinary/${requestedBoxId}`,
    `${label} binary`,
    true,
  );
  if (!isRecord(binaryResponse)) throw new Error(`${label} binary response must be an object`);
  const sigmaSerializedHex = canonicalVariableHex(
    binaryResponse.bytes,
    `${label} binary bytes`,
  );
  const binaryBox = await parseCanonicalSigmaBox(sigmaSerializedHex, `${label} binary`);
  if (canonicalJson(binaryBox) !== canonicalJson(box)) {
    throw new Error(`${label} JSON and binary observations do not match`);
  }

  return {
    role,
    box,
    sigmaSerializedHex,
    sigmaSerializedSha256Hex: sha256Bytes(Buffer.from(sigmaSerializedHex, 'hex')),
    checks: {
      requestedBoxIdMatched: true,
      boxIdRecomputedFromJson: true,
      sigmaBytesCanonical: true,
      jsonBinaryMatched: true,
      pureErg: true,
      presentInCurrentUtxoView: true,
    },
  };
}

async function parseCanonicalSigmaBox(serializedHex: string, label: string): Promise<Eip12Box> {
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  let parsed: any;
  try {
    parsed = wasm.ErgoBox.sigma_parse_bytes(Buffer.from(serializedHex, 'hex'));
  } catch (error: any) {
    throw new Error(`${label} is not a valid Sigma-serialized Ergo box: ${error?.message ?? String(error)}`);
  }
  try {
    const roundTripHex = Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
    if (roundTripHex !== serializedHex) {
      throw new Error(`${label} is not canonical Sigma serialization`);
    }
    return await normalizeEip12Box(parsed.to_js_eip12(), label);
  } finally {
    parsed.free?.();
  }
}

async function requestJson(
  fetchFn: AuthenticatedV2FundingObservationFetch,
  endpointOrigin: string,
  path: string,
  label: string,
  classifyMissingUtxo = false,
): Promise<any> {
  const response = await fetchFn(new URL(path, `${endpointOrigin}/`), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(NODE_REQUEST_TIMEOUT_MS),
  });
  const text = await readBoundedResponseText(response, label);
  if (!response.ok) {
    if (classifyMissingUtxo && response.status === 404) {
      throw new Error(
        `${label} is not present in the current UTXO view (404); it may be unknown, spent, reorged, or unavailable from this node`,
      );
    }
    throw new Error(`${label} read failed with HTTP ${response.status}`);
  }
  if (text.trim().length === 0) throw new Error(`${label} response was empty`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} response was not JSON`);
  }
}

async function readBoundedResponseText(response: Response, label: string): Promise<string> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength)
    && Number(declaredLength) > MAX_NODE_RESPONSE_BYTES) {
    throw new Error(`${label} response exceeded ${MAX_NODE_RESPONSE_BYTES} bytes`);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_NODE_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`${label} response exceeded ${MAX_NODE_RESPONSE_BYTES} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8');
}

function normalizeRootNodeEndpoint(value: unknown): string {
  if (typeof value !== 'string') throw new Error('node URL must be an explicit http(s) URL');
  const errors = validateReadOnlyNodeUrl(value, 'node URL');
  if (errors.length > 0) throw new Error(errors[0]);
  const parsed = new URL(value);
  if ((parsed.pathname !== '' && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    throw new Error('node URL must identify an origin-only root endpoint without path, query, or fragment');
  }
  return parsed.origin;
}

function normalizeEnvironment(value: unknown): string {
  if (typeof value !== 'string' || !NON_MAINNET_ENVIRONMENTS.has(value)) {
    throw new Error('funding observation requires an explicit canonical non-mainnet environment');
  }
  return value;
}

function normalizeNodeNetwork(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('node did not identify a concrete non-mainnet network');
  }
  const network = value.trim().toLowerCase();
  if (network === 'mainnet') {
    throw new Error('mainnet node rejected for authenticated V2 funding observation');
  }
  if (!NON_MAINNET_NODE_NETWORKS.has(network)) {
    throw new Error('node network is not an approved non-mainnet Ergo network');
  }
  return network;
}

function normalizeObservedAt(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('observation clock returned an invalid date');
  }
  return value.toISOString();
}

function canonicalBoxId(value: unknown, label: string): string {
  return canonicalFixedHex(value, 32, label);
}

function canonicalFixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be canonical lowercase ${bytes}-byte hex`);
  }
  return value;
}

function canonicalVariableHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be non-empty canonical lowercase byte hex`);
  }
  return value;
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sha256Bytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('funding observation cannot serialize non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => (
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    )).join(',')}}`;
  }
  throw new Error(`funding observation cannot serialize ${typeof value}`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
