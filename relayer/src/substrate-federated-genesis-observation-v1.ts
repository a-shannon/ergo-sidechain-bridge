import { createHash } from 'crypto';

import {
  createBoundedAuthenticatedSpvTrackerReadOnlySource,
  normalizeAuthenticatedSpvTrackerNodeNetwork,
  normalizeRootReadOnlyNodeEndpoint,
  type AuthenticatedSpvTrackerNodeSource,
} from './authenticated-spv-tracker-read-only-node-client.js';
import { canonicalNodeOrigin } from './ergo-node-endpoint-alignment.js';
import { canonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  normalizeEip12Box,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_GENESIS_TARGET_PROFILE_V1_SCHEMA =
  'e2s.substrate-federated-genesis-target-profile.v1' as const;
export const SUBSTRATE_FEDERATED_GENESIS_OBSERVATION_V1_SCHEMA =
  'e2s.substrate-federated-genesis-observation.v1' as const;

const GENESIS_HEADER_HEIGHT = 1;
const MAX_SIGMA_BOX_BYTES = 1024 * 1024;
const MAX_STABLE_NODE_SNAPSHOT_ATTEMPTS = 3;
const ENVIRONMENT_NETWORKS: Readonly<Record<string, string>> = Object.freeze({
  local: 'local',
  development: 'development',
  devnet: 'devnet',
  'patched-devnet': 'devnet',
  testnet: 'testnet',
});

export type SubstrateFederatedGenesisRole =
  | 'tracker'
  | 'duplicate-prevention'
  | 'pooled-reserve';

export interface BuildSubstrateFederatedGenesisTargetProfileV1Input {
  readonly profileIdHex: string;
  readonly environment: string;
  readonly expectedNetwork: string;
  readonly expectedGenesisHeaderIdHex: string;
  readonly primaryNodeOrigin: string;
  readonly primaryNodeIdentityDigestHex: string;
  readonly primaryAdministrationIdentityDigestHex: string;
  readonly witnessNodeOrigin: string;
  readonly witnessNodeIdentityDigestHex: string;
  readonly witnessAdministrationIdentityDigestHex: string;
  readonly trackerGenesisBoxIdHex: string;
  readonly duplicatePreventionGenesisBoxIdHex: string;
  readonly pooledReserveGenesisBoxIdHex: string;
}

export interface SubstrateFederatedGenesisTargetProfileV1 {
  readonly schema: typeof SUBSTRATE_FEDERATED_GENESIS_TARGET_PROFILE_V1_SCHEMA;
  readonly profileDigestHex: string;
  readonly profileIdHex: string;
  readonly environment: string;
  readonly expectedNetwork: string;
  readonly expectedGenesisHeaderIdHex: string;
  readonly sources: Readonly<{
    primary: SubstrateFederatedGenesisProfileSourceV1;
    witness: SubstrateFederatedGenesisProfileSourceV1;
  }>;
  readonly genesisBoxIds: Readonly<{
    tracker: string;
    duplicatePrevention: string;
    pooledReserve: string;
  }>;
}

export interface SubstrateFederatedGenesisProfileSourceV1 {
  readonly endpointOrigin: string;
  readonly declaredNodeIdentityDigestHex: string;
  readonly declaredAdministrationIdentityDigestHex: string;
  readonly sourceIdHex: string;
}

export interface SubstrateFederatedGenesisNodeSource
extends AuthenticatedSpvTrackerNodeSource {
  getBlockHeaderIdsAtHeight(height: number): Promise<string[]>;
}

export interface SubstrateFederatedGenesisBoxObservationV1 {
  readonly role: SubstrateFederatedGenesisRole;
  readonly box: Eip12Box;
  readonly sigmaSerializedHex: string;
  readonly sigmaSerializedSha256Hex: string;
  readonly checks: Readonly<{
    requestedBoxIdMatched: true;
    boxIdRecomputedFromJson: true;
    sigmaBytesCanonical: true;
    jsonBinaryMatched: true;
    pureErg: true;
    registerFree: true;
    presentInCurrentUtxoView: true;
    creationHeightNotAfterTip: true;
  }>;
}

export interface SubstrateFederatedGenesisObservationV1 {
  readonly schema: typeof SUBSTRATE_FEDERATED_GENESIS_OBSERVATION_V1_SCHEMA;
  readonly reportDigestHex: string;
  readonly status: 'AGREED';
  readonly observedAt: string;
  readonly profile: Readonly<{
    profileIdHex: string;
    profileDigestHex: string;
    environment: string;
    expectedNetwork: string;
    expectedGenesisHeaderIdHex: string;
  }>;
  readonly sources: Readonly<{
    primary: Readonly<{
      role: 'primary';
      endpointOrigin: string;
      sourceIdHex: string;
    }>;
    witness: Readonly<{
      role: 'witness';
      endpointOrigin: string;
      sourceIdHex: string;
    }>;
  }>;
  readonly target: Readonly<{
    network: string;
    genesisHeaderHeight: 1;
    genesisHeaderIdHex: string;
    tipHeight: number;
    tipHeaderIdHex: string;
  }>;
  readonly boxes: Readonly<{
    tracker: SubstrateFederatedGenesisBoxObservationV1;
    duplicatePrevention: SubstrateFederatedGenesisBoxObservationV1;
    pooledReserve: SubstrateFederatedGenesisBoxObservationV1;
  }>;
  readonly agreement: Readonly<{
    distinctOrigins: true;
    distinctDeclaredNodeIdentities: true;
    distinctDeclaredAdministrationIdentities: true;
    sameExpectedNonMainnetNetwork: true;
    exactExpectedGenesisHeaderMatched: true;
    stableMatchingTip: true;
    exactJsonAndSigmaBoxesMatched: true;
    pairwiseDistinctPureErgRegisterFreeBoxes: true;
  }>;
  readonly boundary: Readonly<{
    readOnlyNodeRequestsOnly: true;
    apiKeyOrEnvironmentCredentialRead: false;
    runtimeDatabaseOpened: false;
    deploymentStateOpened: false;
    signerOrWalletMaterialRead: false;
    sourceControlledProfileApprovalAuthenticated: false;
    declaredSourceIdentitiesObservedFromNodes: false;
    independentNodeControlVerified: false;
    nodeAgreementProvesCanonicalConsensus: false;
    tipUtxoAtomicityProved: false;
    targetAcceptanceEstablished: false;
    revalidationRequiredBeforeMaterialization: true;
  }>;
  readonly authorization: Readonly<{
    materialize: false;
    check: false;
    sign: false;
    submit: false;
    broadcast: false;
    deploy: false;
    activate: false;
    fundsAuthority: false;
    gate5Closed: false;
    productionReady: false;
  }>;
}

interface ObservationOptions {
  readonly now?: () => Date;
}

interface NodeSnapshot {
  readonly network: string;
  readonly genesisHeaderIdHex: string;
  readonly tipHeight: number;
  readonly tipHeaderIdHex: string;
}

interface SourceObservation {
  readonly snapshot: NodeSnapshot;
  readonly boxes: Readonly<{
    tracker: SubstrateFederatedGenesisBoxObservationV1;
    duplicatePrevention: SubstrateFederatedGenesisBoxObservationV1;
    pooledReserve: SubstrateFederatedGenesisBoxObservationV1;
  }>;
}

const TARGET_PROFILES = new WeakSet<object>();
const OBSERVATION_PROVENANCE = new WeakMap<
  object,
  SubstrateFederatedGenesisTargetProfileV1
>();

export function buildSubstrateFederatedGenesisTargetProfileV1(
  input: BuildSubstrateFederatedGenesisTargetProfileV1Input,
): SubstrateFederatedGenesisTargetProfileV1 {
  const environment = normalizeEnvironment(input.environment);
  const expectedNetwork = normalizeAuthenticatedSpvTrackerNodeNetwork(
    input.expectedNetwork,
    'federated target profile',
  );
  if (ENVIRONMENT_NETWORKS[environment] !== expectedNetwork) {
    throw new Error('federated target environment does not match its expected Ergo network');
  }
  const primary = buildProfileSource(
    input.primaryNodeOrigin,
    input.primaryNodeIdentityDigestHex,
    input.primaryAdministrationIdentityDigestHex,
    'primary',
  );
  const witness = buildProfileSource(
    input.witnessNodeOrigin,
    input.witnessNodeIdentityDigestHex,
    input.witnessAdministrationIdentityDigestHex,
    'witness',
  );
  if (primary.endpointOrigin === witness.endpointOrigin) {
    throw new Error('federated target profile requires distinct node origins');
  }
  if (
    primary.declaredNodeIdentityDigestHex
    === witness.declaredNodeIdentityDigestHex
  ) {
    throw new Error('federated target profile requires distinct declared node identities');
  }
  if (
    primary.declaredAdministrationIdentityDigestHex
    === witness.declaredAdministrationIdentityDigestHex
  ) {
    throw new Error(
      'federated target profile requires distinct declared administration identities',
    );
  }
  const genesisBoxIds = Object.freeze({
    tracker: fixedHex(input.trackerGenesisBoxIdHex, 32, 'tracker genesis box ID'),
    duplicatePrevention: fixedHex(
      input.duplicatePreventionGenesisBoxIdHex,
      32,
      'duplicate-prevention genesis box ID',
    ),
    pooledReserve: fixedHex(
      input.pooledReserveGenesisBoxIdHex,
      32,
      'pooled-reserve genesis box ID',
    ),
  });
  if (new Set(Object.values(genesisBoxIds)).size !== 3) {
    throw new Error('federated target profile requires three distinct genesis box IDs');
  }
  const withoutDigest = {
    schema: SUBSTRATE_FEDERATED_GENESIS_TARGET_PROFILE_V1_SCHEMA,
    profileIdHex: fixedHex(input.profileIdHex, 32, 'target profile ID'),
    environment,
    expectedNetwork,
    expectedGenesisHeaderIdHex: fixedHex(
      input.expectedGenesisHeaderIdHex,
      32,
      'expected genesis header ID',
    ),
    sources: { primary, witness },
    genesisBoxIds,
  };
  const profile = deepFreeze({
    ...withoutDigest,
    profileDigestHex: sha256Canonical(withoutDigest),
  });
  TARGET_PROFILES.add(profile);
  return profile;
}

export async function observeSubstrateFederatedGenesisV1(
  profile: SubstrateFederatedGenesisTargetProfileV1,
  options: ObservationOptions = {},
): Promise<SubstrateFederatedGenesisObservationV1> {
  assertTargetProfileProvenance(profile);
  const primarySource = createBoundedAuthenticatedSpvTrackerReadOnlySource(
    profile.sources.primary.endpointOrigin,
  ) as SubstrateFederatedGenesisNodeSource;
  const witnessSource = createBoundedAuthenticatedSpvTrackerReadOnlySource(
    profile.sources.witness.endpointOrigin,
  ) as SubstrateFederatedGenesisNodeSource;
  if (primarySource === witnessSource) {
    throw new Error('federated target observation requires distinct node source instances');
  }

  const settled = await Promise.allSettled([
    observeSource(primarySource, profile),
    observeSource(witnessSource, profile),
  ]);
  const primary = settledSourceObservation(settled[0]);
  const witness = settledSourceObservation(settled[1]);
  if (canonicalJson(primary.snapshot) !== canonicalJson(witness.snapshot)) {
    throw new Error('primary and witness Ergo target snapshots disagree');
  }
  if (canonicalJson(primary.boxes) !== canonicalJson(witness.boxes)) {
    throw new Error('primary and witness Ergo genesis-box observations disagree');
  }

  const observedAt = normalizeObservedAt((options.now ?? (() => new Date()))());
  const withoutDigest: Omit<
    SubstrateFederatedGenesisObservationV1,
    'reportDigestHex'
  > = {
    schema: SUBSTRATE_FEDERATED_GENESIS_OBSERVATION_V1_SCHEMA,
    status: 'AGREED',
    observedAt,
    profile: {
      profileIdHex: profile.profileIdHex,
      profileDigestHex: profile.profileDigestHex,
      environment: profile.environment,
      expectedNetwork: profile.expectedNetwork,
      expectedGenesisHeaderIdHex: profile.expectedGenesisHeaderIdHex,
    },
    sources: {
      primary: {
        role: 'primary',
        endpointOrigin: profile.sources.primary.endpointOrigin,
        sourceIdHex: profile.sources.primary.sourceIdHex,
      },
      witness: {
        role: 'witness',
        endpointOrigin: profile.sources.witness.endpointOrigin,
        sourceIdHex: profile.sources.witness.sourceIdHex,
      },
    },
    target: {
      network: primary.snapshot.network,
      genesisHeaderHeight: GENESIS_HEADER_HEIGHT,
      genesisHeaderIdHex: primary.snapshot.genesisHeaderIdHex,
      tipHeight: primary.snapshot.tipHeight,
      tipHeaderIdHex: primary.snapshot.tipHeaderIdHex,
    },
    boxes: primary.boxes,
    agreement: {
      distinctOrigins: true,
      distinctDeclaredNodeIdentities: true,
      distinctDeclaredAdministrationIdentities: true,
      sameExpectedNonMainnetNetwork: true,
      exactExpectedGenesisHeaderMatched: true,
      stableMatchingTip: true,
      exactJsonAndSigmaBoxesMatched: true,
      pairwiseDistinctPureErgRegisterFreeBoxes: true,
    },
    boundary: {
      readOnlyNodeRequestsOnly: true,
      apiKeyOrEnvironmentCredentialRead: false,
      runtimeDatabaseOpened: false,
      deploymentStateOpened: false,
      signerOrWalletMaterialRead: false,
      sourceControlledProfileApprovalAuthenticated: false,
      declaredSourceIdentitiesObservedFromNodes: false,
      independentNodeControlVerified: false,
      nodeAgreementProvesCanonicalConsensus: false,
      tipUtxoAtomicityProved: false,
      targetAcceptanceEstablished: false,
      revalidationRequiredBeforeMaterialization: true,
    },
    authorization: {
      materialize: false,
      check: false,
      sign: false,
      submit: false,
      broadcast: false,
      deploy: false,
      activate: false,
      fundsAuthority: false,
      gate5Closed: false,
      productionReady: false,
    },
  };
  const report = deepFreeze({
    ...withoutDigest,
    reportDigestHex: sha256Canonical(withoutDigest),
  });
  OBSERVATION_PROVENANCE.set(report, profile);
  return report;
}

export function assertSubstrateFederatedGenesisObservationV1Provenance(
  profile: SubstrateFederatedGenesisTargetProfileV1,
  report: unknown,
): asserts report is SubstrateFederatedGenesisObservationV1 {
  assertTargetProfileProvenance(profile);
  if (
    !report
    || typeof report !== 'object'
    || OBSERVATION_PROVENANCE.get(report) !== profile
  ) {
    throw new Error('federated genesis observation lacks same-process provenance');
  }
  const candidate = report as SubstrateFederatedGenesisObservationV1;
  const { reportDigestHex, ...withoutDigest } = candidate;
  if (sha256Canonical(withoutDigest) !== reportDigestHex) {
    throw new Error('federated genesis observation content does not match its digest');
  }
  if (
    candidate.schema !== SUBSTRATE_FEDERATED_GENESIS_OBSERVATION_V1_SCHEMA
    || candidate.status !== 'AGREED'
    || candidate.profile.profileDigestHex !== profile.profileDigestHex
    || candidate.profile.profileIdHex !== profile.profileIdHex
    || candidate.target.network !== profile.expectedNetwork
    || candidate.target.genesisHeaderIdHex !== profile.expectedGenesisHeaderIdHex
  ) {
    throw new Error('federated genesis observation does not match its target profile');
  }
}

export async function revalidateSubstrateFederatedGenesisBoxObservationV1(
  observation: Readonly<SubstrateFederatedGenesisBoxObservationV1>,
  expectedBoxIdHex: string,
  expectedRole: SubstrateFederatedGenesisRole,
  tipHeight: number,
): Promise<Readonly<SubstrateFederatedGenesisBoxObservationV1>> {
  const exactSigmaSerializedHex = variableHex(
    observation.sigmaSerializedHex,
    MAX_SIGMA_BOX_BYTES,
    `${expectedRole} genesis box Sigma bytes`,
  );
  const exactTipHeight = nonnegativeSafeInteger(
    tipHeight,
    `${expectedRole} observed tip height`,
  );
  if (
    observation.role !== expectedRole
    || !Object.values(observation.checks).every(value => value === true)
    || observation.sigmaSerializedSha256Hex
      !== sha256Bytes(Buffer.from(exactSigmaSerializedHex, 'hex'))
  ) {
    throw new Error(
      `${expectedRole} genesis observation does not preserve exact validated evidence`,
    );
  }
  const revalidated = await validateGenesisBoxPair(
    observation.box,
    exactSigmaSerializedHex,
    fixedHex(expectedBoxIdHex, 32, `${expectedRole} expected genesis box ID`),
    expectedRole,
    exactTipHeight,
  );
  if (canonicalJson(revalidated) !== canonicalJson(observation)) {
    throw new Error(
      `${expectedRole} genesis observation differs from canonical revalidation`,
    );
  }
  return revalidated;
}

export async function validateSubstrateFederatedGenesisBoxPairV1(
  rawBox: unknown,
  rawSigmaSerializedHex: unknown,
  expectedBoxIdHex: string,
  expectedRole: SubstrateFederatedGenesisRole,
  tipHeight: number,
): Promise<Readonly<SubstrateFederatedGenesisBoxObservationV1>> {
  return validateGenesisBoxPair(
    rawBox,
    rawSigmaSerializedHex,
    fixedHex(expectedBoxIdHex, 32, `${expectedRole} expected genesis box ID`),
    expectedRole,
    nonnegativeSafeInteger(
      tipHeight,
      `${expectedRole} observed tip height`,
    ),
  );
}

function settledSourceObservation(
  result: PromiseSettledResult<SourceObservation>,
): SourceObservation {
  if (result.status === 'fulfilled') return result.value;
  throw result.reason;
}

async function observeSource(
  source: SubstrateFederatedGenesisNodeSource,
  profile: SubstrateFederatedGenesisTargetProfileV1,
): Promise<SourceObservation> {
  if (
    !source
    || typeof source !== 'object'
    || typeof source.getInfo !== 'function'
    || typeof source.getBestHeader !== 'function'
    || typeof source.getBlockHeaderIdsAtHeight !== 'function'
    || typeof source.getBoxByIdOrNull !== 'function'
    || typeof source.getBoxBinaryByIdOrNull !== 'function'
  ) {
    throw new Error('federated target observation requires a complete read-only node source');
  }
  source.beginAuthenticatedTrackerReconstruction?.();
  try {
    const before = await observeNodeSnapshot(source, profile);
    const tracker = await observeBox(
      source,
      profile.genesisBoxIds.tracker,
      'tracker',
      before.tipHeight,
    );
    const duplicatePrevention = await observeBox(
      source,
      profile.genesisBoxIds.duplicatePrevention,
      'duplicate-prevention',
      before.tipHeight,
    );
    const pooledReserve = await observeBox(
      source,
      profile.genesisBoxIds.pooledReserve,
      'pooled-reserve',
      before.tipHeight,
    );
    const after = await observeNodeSnapshot(source, profile);
    if (canonicalJson(before) !== canonicalJson(after)) {
      throw new Error('Ergo target node changed during genesis-box observation');
    }
    return deepFreeze({
      snapshot: before,
      boxes: { tracker, duplicatePrevention, pooledReserve },
    });
  } finally {
    source.endAuthenticatedTrackerReconstruction?.();
  }
}

async function observeNodeSnapshot(
  source: SubstrateFederatedGenesisNodeSource,
  profile: SubstrateFederatedGenesisTargetProfileV1,
): Promise<NodeSnapshot> {
  for (
    let attempt = 1;
    attempt <= MAX_STABLE_NODE_SNAPSHOT_ATTEMPTS;
    attempt += 1
  ) {
    const info = record(await source.getInfo(), 'Ergo node info');
    const network = normalizeAuthenticatedSpvTrackerNodeNetwork(
      info.network ?? info.networkType,
      'observed Ergo node',
    );
    if (network !== profile.expectedNetwork) {
      throw new Error('observed Ergo node network does not match the federated target profile');
    }
    const tipHeight = nonnegativeSafeInteger(info.fullHeight, 'Ergo node full height');
    const bestHeader = record(await source.getBestHeader(), 'Ergo best header');
    const bestHeaderHeight = nonnegativeSafeInteger(
      bestHeader.height,
      'Ergo best-header height',
    );
    if (bestHeaderHeight !== tipHeight) {
      if (attempt < MAX_STABLE_NODE_SNAPSHOT_ATTEMPTS) continue;
      throw new Error(
        'Ergo node info and best-header heights do not match after '
        + `${MAX_STABLE_NODE_SNAPSHOT_ATTEMPTS} bounded attempts`,
      );
    }
    const tipHeaderIdHex = fixedHex(bestHeader.id, 32, 'Ergo best-header ID');
    const genesisIds = await source.getBlockHeaderIdsAtHeight(GENESIS_HEADER_HEIGHT);
    if (!Array.isArray(genesisIds) || genesisIds.length !== 1) {
      throw new Error('Ergo target must expose exactly one height-1 genesis header');
    }
    const genesisHeaderIdHex = fixedHex(
      genesisIds[0],
      32,
      'observed genesis header ID',
    );
    if (genesisHeaderIdHex !== profile.expectedGenesisHeaderIdHex) {
      throw new Error('observed genesis header does not match the federated target profile');
    }
    return Object.freeze({ network, genesisHeaderIdHex, tipHeight, tipHeaderIdHex });
  }
  throw new Error('Ergo node snapshot attempt bound is unreachable');
}

async function observeBox(
  source: SubstrateFederatedGenesisNodeSource,
  expectedBoxIdHex: string,
  role: SubstrateFederatedGenesisRole,
  tipHeight: number,
): Promise<SubstrateFederatedGenesisBoxObservationV1> {
  const rawBox = await source.getBoxByIdOrNull(expectedBoxIdHex);
  if (rawBox === null) {
    throw new Error(`${role} genesis box is not present in the current UTXO view`);
  }
  const box = await validateGenesisBoxJson(
    rawBox,
    expectedBoxIdHex,
    role,
    tipHeight,
  );
  const binaryResponse = await source.getBoxBinaryByIdOrNull?.(expectedBoxIdHex);
  if (binaryResponse === null || binaryResponse === undefined) {
    throw new Error(`${role} genesis box binary is unavailable`);
  }
  const binaryRecord = record(binaryResponse, `${role} genesis box binary response`);
  return validateGenesisBoxSerialization(
    box,
    binaryRecord.bytes,
    role,
  );
}

async function validateGenesisBoxPair(
  rawBox: unknown,
  rawSigmaSerializedHex: unknown,
  expectedBoxIdHex: string,
  role: SubstrateFederatedGenesisRole,
  tipHeight: number,
): Promise<Readonly<SubstrateFederatedGenesisBoxObservationV1>> {
  const box = await validateGenesisBoxJson(
    rawBox,
    expectedBoxIdHex,
    role,
    tipHeight,
  );
  return validateGenesisBoxSerialization(box, rawSigmaSerializedHex, role);
}

async function validateGenesisBoxJson(
  rawBox: unknown,
  expectedBoxIdHex: string,
  role: SubstrateFederatedGenesisRole,
  tipHeight: number,
): Promise<Readonly<Eip12Box>> {
  const box = await normalizeEip12Box(rawBox, `${role} genesis box`);
  if (box.boxId !== expectedBoxIdHex) {
    throw new Error(`${role} genesis box does not match the requested box ID`);
  }
  if (box.assets.length !== 0) {
    throw new Error(`${role} genesis box must contain pure ERG only`);
  }
  if (Object.keys(box.additionalRegisters).length !== 0) {
    throw new Error(`${role} genesis box must not contain additional registers`);
  }
  if (box.creationHeight > tipHeight) {
    throw new Error(`${role} genesis box creation height exceeds the observed tip`);
  }
  return box;
}

async function validateGenesisBoxSerialization(
  box: Readonly<Eip12Box>,
  rawSigmaSerializedHex: unknown,
  role: SubstrateFederatedGenesisRole,
): Promise<Readonly<SubstrateFederatedGenesisBoxObservationV1>> {
  const sigmaSerializedHex = variableHex(
    rawSigmaSerializedHex,
    MAX_SIGMA_BOX_BYTES,
    `${role} genesis box Sigma bytes`,
  );
  const binaryBox = await parseCanonicalSigmaBox(
    sigmaSerializedHex,
    `${role} genesis box Sigma bytes`,
  );
  if (canonicalJson(binaryBox) !== canonicalJson(box)) {
    throw new Error(`${role} genesis box JSON and binary observations do not match`);
  }
  return deepFreeze({
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
      registerFree: true,
      presentInCurrentUtxoView: true,
      creationHeightNotAfterTip: true,
    },
  });
}

async function parseCanonicalSigmaBox(
  serializedHex: string,
  label: string,
): Promise<Eip12Box> {
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  let parsed: any;
  try {
    parsed = wasm.ErgoBox.sigma_parse_bytes(Buffer.from(serializedHex, 'hex'));
    const roundTripHex = Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
    if (roundTripHex !== serializedHex) {
      throw new Error(`${label} is not canonical Sigma serialization`);
    }
    return await normalizeEip12Box(parsed.to_js_eip12(), label);
  } catch (error: any) {
    if (error instanceof Error && error.message.endsWith('canonical Sigma serialization')) {
      throw error;
    }
    throw new Error(`${label} is not a valid Sigma-serialized Ergo box: ${error?.message ?? String(error)}`);
  } finally {
    parsed?.free?.();
  }
}

function buildProfileSource(
  nodeOrigin: unknown,
  nodeIdentityDigestHex: unknown,
  administrationIdentityDigestHex: unknown,
  label: string,
): SubstrateFederatedGenesisProfileSourceV1 {
  const endpoint = normalizeRootReadOnlyNodeEndpoint(nodeOrigin, `${label} Ergo node URL`);
  const endpointOrigin = canonicalNodeOrigin(endpoint, `${label} Ergo node URL`);
  const declaredNodeIdentityDigestHex = fixedHex(
    nodeIdentityDigestHex,
    32,
    `${label} declared node identity digest`,
  );
  const declaredAdministrationIdentityDigestHex = fixedHex(
    administrationIdentityDigestHex,
    32,
    `${label} declared administration identity digest`,
  );
  return Object.freeze({
    endpointOrigin,
    declaredNodeIdentityDigestHex,
    declaredAdministrationIdentityDigestHex,
    sourceIdHex: sha256Canonical({
      endpointOrigin,
      declaredNodeIdentityDigestHex,
      declaredAdministrationIdentityDigestHex,
    }),
  });
}

function assertTargetProfileProvenance(
  profile: SubstrateFederatedGenesisTargetProfileV1,
): void {
  if (!profile || typeof profile !== 'object' || !TARGET_PROFILES.has(profile)) {
    throw new Error('federated target profile lacks same-process provenance');
  }
  const { profileDigestHex, ...withoutDigest } = profile;
  if (sha256Canonical(withoutDigest) !== profileDigestHex) {
    throw new Error('federated target profile content does not match its digest');
  }
}

function normalizeEnvironment(value: unknown): string {
  if (typeof value !== 'string' || ENVIRONMENT_NETWORKS[value] === undefined) {
    throw new Error('federated target profile requires a canonical non-mainnet environment');
  }
  return value;
}

function normalizeObservedAt(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('federated target observation clock returned an invalid date');
  }
  return value.toISOString();
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be canonical lowercase ${bytes}-byte hex`);
  }
  return value;
}

function variableHex(
  value: unknown,
  maxBytes: number,
  label: string,
): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
    || value.length / 2 > maxBytes
  ) {
    throw new Error(`${label} must be bounded canonical lowercase byte hex`);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function sha256Bytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
