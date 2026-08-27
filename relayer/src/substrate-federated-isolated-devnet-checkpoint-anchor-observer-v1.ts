import axios from 'axios';
import type { AxiosResponse } from 'axios';

import {
  buildErgoExtensionMembershipProof,
} from './ergo-settlement-core/ergo-extension-membership.js';
import {
  computeErgoHeaderId,
  parseErgoHeaderIdentity,
} from './ergo-settlement-core/ergo-header-id.js';
import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  normalizeErgoNodeHeaderBytes,
} from './adapters/ergo-utxo-state-runtime-witness-capture-port-v1.js';
import { parseNodeJsonPreservingPowDistance } from './ergo-node-json.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2,
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointTargetV1,
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV1,
  SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2,
  SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1,
} from './substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_ANCHOR_OBSERVATION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-checkpoint-anchor-observation.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-checkpoint-bound-tracker-observation.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-checkpoint-bound-tracker-observation.v2' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_OBSERVATION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-reservation-freshness-observation.v1' as const;

const EXTENSION_KEY_HEX = '0401' as const;
const MAX_ANCESTRY_HEADER_COUNT = 256;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const OBSERVATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_ANCHOR_OBSERVATION_V1';
const CHECKPOINT_BOUND_TRACKER_OBSERVATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V1';
const CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2';
const TRACKER_RESERVATION_FRESHNESS_OBSERVATION_V1_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_OBSERVATION_V1';
const OBSERVATIONS = new WeakSet<object>();
const CHECKPOINT_BOUND_TRACKER_OBSERVATIONS = new WeakSet<object>();
const CHECKPOINT_BOUND_TRACKER_V2_OBSERVATIONS = new WeakSet<object>();
const TRACKER_RESERVATION_FRESHNESS_OBSERVATIONS_V1 = new WeakSet<object>();

export interface SubstrateFederatedIsolatedDevnetCheckpointAnchorHeaderV1 {
  readonly raw: Readonly<Record<string, unknown>>;
  readonly canonicalHeaderBytesHex: string;
  readonly canonicalHeaderDigestHex: string;
  readonly idHex: string;
  readonly parentIdHex: string;
  readonly height: number;
  readonly extensionRootHex: string;
}

export interface SubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_ANCHOR_OBSERVATION_V1_SCHEMA;
  readonly version: 1;
  readonly targetGenesisHeaderIdHex: string;
  readonly priorHeaderIdHex: string;
  readonly priorHeight: number;
  readonly extensionKeyHex: typeof EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeight: number;
  readonly anchorContextIndex: 0;
  readonly anchorExtensionRootHex: string;
  readonly extensionFields: readonly Readonly<{
    readonly keyHex: string;
    readonly valueHex: string;
  }>[];
  readonly extensionMembershipProofHex: string;
  readonly headers: readonly Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointAnchorHeaderV1
  >[];
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly observationDigestHex: string;
  readonly boundaries: Readonly<{
    readonly primaryAndWitnessAgreed: true;
    readonly miningStoppedDuringObservation: true;
    readonly priorSnapshotAncestryEstablished: true;
    readonly exactExtensionMembershipRecomputed: true;
    readonly ergoPowAuthenticated: false;
    readonly trackerAdmissionEstablished: false;
    readonly signingPerformed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V1_SCHEMA;
  readonly version: 1;
  readonly targetGenesisHeaderIdHex: string;
  readonly extensionKeyHex: typeof EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeight: number;
  readonly anchorContextIndex: number;
  readonly anchorExtensionRootHex: string;
  readonly extensionFields: readonly Readonly<{
    readonly keyHex: string;
    readonly valueHex: string;
  }>[];
  readonly extensionMembershipProofHex: string;
  readonly headers: readonly Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointAnchorHeaderV1
  >[];
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly observationDigestHex: string;
  readonly boundaries: Readonly<{
    readonly primaryAndWitnessAgreed: true;
    readonly primaryMiningDuringObservation: true;
    readonly checkpointBoundActiveTarget: true;
    readonly exactCheckpointRetainedInCurrentContext: true;
    readonly exactExtensionMembershipRecomputed: true;
    readonly ergoPowAuthenticated: false;
    readonly trackerAdmissionEstablished: false;
    readonly signingPerformed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA;
  readonly version: 2;
  readonly targetGenesisHeaderIdHex: string;
  readonly extensionKeyHex: typeof EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeight: number;
  readonly anchorContextIndex: number;
  readonly anchorExtensionRootHex: string;
  readonly extensionFields: readonly Readonly<{
    readonly keyHex: string;
    readonly valueHex: string;
  }>[];
  readonly extensionMembershipProofHex: string;
  readonly headers: readonly Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointAnchorHeaderV1
  >[];
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly observationDigestHex: string;
  readonly boundaries: Readonly<{
    readonly primaryAndWitnessAgreed: true;
    readonly miningStoppedDuringObservation: true;
    readonly checkpointBoundFrozenTarget: true;
    readonly exactCheckpointRetainedInCurrentContext: true;
    readonly exactExtensionMembershipRecomputed: true;
    readonly ergoPowAuthenticated: false;
    readonly trackerAdmissionEstablished: false;
    readonly signingPerformed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_OBSERVATION_V1_SCHEMA;
  readonly version: 1;
  readonly targetGenesisHeaderIdHex: string;
  readonly extensionKeyHex: typeof EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeight: number;
  readonly anchorContextIndex: number;
  readonly anchorExtensionRootHex: string;
  readonly extensionFields: readonly Readonly<{
    readonly keyHex: string;
    readonly valueHex: string;
  }>[];
  readonly extensionMembershipProofHex: string;
  readonly headers: readonly Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointAnchorHeaderV1
  >[];
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
  readonly observationDigestHex: string;
  readonly boundaries: Readonly<{
    readonly primaryAndWitnessAgreed: true;
    readonly miningStoppedDuringObservation: true;
    readonly checkpointBoundReservationFreshnessTarget: true;
    readonly exactCheckpointRetainedInCurrentContext: true;
    readonly exactExtensionMembershipRecomputed: true;
    readonly durableReservationBound: false;
    readonly trackerInputRevalidated: false;
    readonly jvmTransactionRechecked: false;
    readonly ergoPowAuthenticated: false;
    readonly signingPerformed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
  }>;
}

export async function observeSubstrateFederatedIsolatedDevnetCheckpointAnchorV1(
  input: Readonly<{
    readonly target:
      Readonly<SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1>;
    readonly targetGenesisHeaderIdHex: string;
    readonly expectedPriorHeaderIdHex: string;
    readonly expectedPriorHeight: number;
    readonly expectedExtensionValueHex: string;
  }>,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1
>> {
  const before =
    assertSubstrateFederatedIsolatedDevnetOwnedCheckpointTargetV1(input.target);
  const targetGenesisHeaderIdHex = fixedHex(
    input.targetGenesisHeaderIdHex,
    32,
    'checkpoint anchor target genesis header ID',
  );
  const extensionValueHex = fixedHex(
    input.expectedExtensionValueHex,
    64,
    'checkpoint anchor extension value',
  );
  const priorHeaderIdHex = fixedHex(
    input.expectedPriorHeaderIdHex,
    32,
    'checkpoint anchor prior header ID',
  );
  const priorHeight = positiveInteger(
    input.expectedPriorHeight,
    'checkpoint anchor prior height',
  );
  const [primary, witness] = await Promise.all([
    observeNode(
      input.target.primaryNodeOrigin,
      targetGenesisHeaderIdHex,
      priorHeight,
      'primary',
    ),
    observeNode(
      input.target.witnessNodeOrigin,
      targetGenesisHeaderIdHex,
      priorHeight,
      'witness',
    ),
  ]);
  if (
    primary.fullHeight !== witness.fullHeight
    || primary.headersDigestHex !== witness.headersDigestHex
    || primary.extensionFieldsDigestHex !== witness.extensionFieldsDigestHex
  ) {
    throw new Error('checkpoint anchor primary and witness observations disagree');
  }
  const anchor = primary.headers[0]!;
  const priorHeader = primary.headers.find(header =>
    header.height === priorHeight
  );
  if (
    anchor.height <= priorHeight
    || priorHeader === undefined
    || priorHeader.idHex !== priorHeaderIdHex
  ) {
    throw new Error(
      'checkpoint anchor does not extend the exact prior process snapshot',
    );
  }
  const extensionFields = primary.extensionFields;
  const matchingFields = extensionFields.filter(field =>
    field.keyHex === EXTENSION_KEY_HEX
  );
  if (
    matchingFields.length !== 1
    || matchingFields[0]!.valueHex !== extensionValueHex
  ) {
    throw new Error('checkpoint anchor does not contain the exact 0x0401 value');
  }
  const membership = buildErgoExtensionMembershipProof(
    extensionFields.map(field => ({
      key: Buffer.from(field.keyHex, 'hex'),
      value: Buffer.from(field.valueHex, 'hex'),
    })),
    Buffer.from(EXTENSION_KEY_HEX, 'hex'),
  );
  if (membership.root.toString('hex') !== anchor.extensionRootHex) {
    throw new Error('checkpoint anchor extension fields do not match the header root');
  }
  const after =
    assertSubstrateFederatedIsolatedDevnetOwnedCheckpointTargetV1(input.target);
  if (
    after.processBindingDigestHex !== before.processBindingDigestHex
    || after.executionTargetIdentityDigestHex
      !== before.executionTargetIdentityDigestHex
  ) {
    throw new Error('checkpoint anchor process binding changed during observation');
  }
  const observationDigestHex = sha256CanonicalJson({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_ANCHOR_OBSERVATION_V1_SCHEMA,
    targetGenesisHeaderIdHex,
    priorHeaderIdHex,
    priorHeight,
    extensionKeyHex: EXTENSION_KEY_HEX,
    extensionValueHex,
    headers: primary.headers.map(header => ({
      canonicalHeaderBytesHex: header.canonicalHeaderBytesHex,
      idHex: header.idHex,
      parentIdHex: header.parentIdHex,
      height: header.height,
      extensionRootHex: header.extensionRootHex,
    })),
    extensionFields,
    extensionMembershipProofHex: membership.proof.toString('hex'),
    processBindingDigestHex: before.processBindingDigestHex,
    executionTargetIdentityDigestHex: before.executionTargetIdentityDigestHex,
  }, OBSERVATION_DIGEST_DOMAIN);
  const observation = deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_ANCHOR_OBSERVATION_V1_SCHEMA,
    version: 1 as const,
    targetGenesisHeaderIdHex,
    priorHeaderIdHex,
    priorHeight,
    extensionKeyHex: EXTENSION_KEY_HEX,
    extensionValueHex,
    anchorHeaderIdHex: anchor.idHex,
    anchorHeight: anchor.height,
    anchorContextIndex: 0 as const,
    anchorExtensionRootHex: anchor.extensionRootHex,
    extensionFields,
    extensionMembershipProofHex: membership.proof.toString('hex'),
    headers: primary.headers,
    processBindingDigestHex: before.processBindingDigestHex,
    executionTargetIdentityDigestHex: before.executionTargetIdentityDigestHex,
    observationDigestHex,
    boundaries: {
      primaryAndWitnessAgreed: true as const,
      miningStoppedDuringObservation: true as const,
      priorSnapshotAncestryEstablished: true as const,
      exactExtensionMembershipRecomputed: true as const,
      ergoPowAuthenticated: false as const,
      trackerAdmissionEstablished: false as const,
      signingPerformed: false as const,
      submissionPerformed: false as const,
      broadcastPerformed: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
    },
  });
  OBSERVATIONS.add(observation);
  return observation;
}

export function assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1
> {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || !OBSERVATIONS.has(value)
    || !Object.isFrozen(value)
  ) {
    throw new Error('checkpoint anchor observation lacks exact process provenance');
  }
}

export async function observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV1(
  input: Readonly<{
    readonly target: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV1
    >;
    readonly targetGenesisHeaderIdHex: string;
    readonly expectedAnchorHeaderIdHex: string;
    readonly expectedAnchorHeight: number;
    readonly expectedAnchorExtensionRootHex: string;
    readonly expectedExtensionValueHex: string;
  }>,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1
>> {
  if (
    input.target.primaryMining !== true
    || input.target.witnessReadOnly !== true
    || input.target.checkpointBound !== true
  ) {
    throw new Error('checkpoint-bound tracker V1 requires the active mining target');
  }
  const before =
    assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV1(
      input.target,
    );
  const targetGenesisHeaderIdHex = fixedHex(
    input.targetGenesisHeaderIdHex,
    32,
    'checkpoint-bound tracker target genesis header ID',
  );
  const anchorHeaderIdHex = fixedHex(
    input.expectedAnchorHeaderIdHex,
    32,
    'checkpoint-bound tracker anchor header ID',
  );
  const anchorHeight = positiveInteger(
    input.expectedAnchorHeight,
    'checkpoint-bound tracker anchor height',
  );
  const anchorExtensionRootHex = fixedHex(
    input.expectedAnchorExtensionRootHex,
    32,
    'checkpoint-bound tracker anchor extension root',
  );
  const extensionValueHex = fixedHex(
    input.expectedExtensionValueHex,
    64,
    'checkpoint-bound tracker extension value',
  );
  const [primary, witness] = await Promise.all([
    observeCheckpointBoundNode(
      input.target.primaryNodeOrigin,
      targetGenesisHeaderIdHex,
      anchorHeaderIdHex,
      'primary',
    ),
    observeCheckpointBoundNode(
      input.target.witnessNodeOrigin,
      targetGenesisHeaderIdHex,
      anchorHeaderIdHex,
      'witness',
    ),
  ]);
  if (
    primary.fullHeight !== witness.fullHeight
    || primary.headersDigestHex !== witness.headersDigestHex
    || primary.extensionFieldsDigestHex !== witness.extensionFieldsDigestHex
  ) {
    throw new Error(
      'checkpoint-bound tracker primary and witness observations disagree',
    );
  }
  const anchorContextIndex = primary.headers.findIndex(
    header => header.idHex === anchorHeaderIdHex,
  );
  const anchor = primary.headers[anchorContextIndex];
  if (
    anchorContextIndex < 0
    || anchor === undefined
    || anchor.height !== anchorHeight
    || anchor.extensionRootHex !== anchorExtensionRootHex
  ) {
    throw new Error(
      'checkpoint-bound tracker anchor is absent or changed in the current context',
    );
  }
  const matchingFields = primary.extensionFields.filter(
    field => field.keyHex === EXTENSION_KEY_HEX,
  );
  if (
    matchingFields.length !== 1
    || matchingFields[0]!.valueHex !== extensionValueHex
  ) {
    throw new Error(
      'checkpoint-bound tracker anchor does not contain the exact 0x0401 value',
    );
  }
  const membership = buildErgoExtensionMembershipProof(
    primary.extensionFields.map(field => ({
      key: Buffer.from(field.keyHex, 'hex'),
      value: Buffer.from(field.valueHex, 'hex'),
    })),
    Buffer.from(EXTENSION_KEY_HEX, 'hex'),
  );
  if (membership.root.toString('hex') !== anchorExtensionRootHex) {
    throw new Error(
      'checkpoint-bound tracker extension fields do not match the anchor root',
    );
  }
  const after =
    assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV1(
      input.target,
    );
  if (
    after.processBindingDigestHex !== before.processBindingDigestHex
    || after.executionTargetIdentityDigestHex
      !== before.executionTargetIdentityDigestHex
  ) {
    throw new Error(
      'checkpoint-bound tracker process binding changed during observation',
    );
  }
  const observationDigestHex = sha256CanonicalJson({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V1_SCHEMA,
    targetGenesisHeaderIdHex,
    extensionKeyHex: EXTENSION_KEY_HEX,
    extensionValueHex,
    anchorHeaderIdHex,
    anchorHeight,
    anchorContextIndex,
    anchorExtensionRootHex,
    headers: primary.headers.map(header => ({
      canonicalHeaderBytesHex: header.canonicalHeaderBytesHex,
      idHex: header.idHex,
      parentIdHex: header.parentIdHex,
      height: header.height,
      extensionRootHex: header.extensionRootHex,
    })),
    extensionFields: primary.extensionFields,
    extensionMembershipProofHex: membership.proof.toString('hex'),
    processBindingDigestHex: before.processBindingDigestHex,
    executionTargetIdentityDigestHex: before.executionTargetIdentityDigestHex,
  }, CHECKPOINT_BOUND_TRACKER_OBSERVATION_DIGEST_DOMAIN);
  const observation = deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V1_SCHEMA,
    version: 1 as const,
    targetGenesisHeaderIdHex,
    extensionKeyHex: EXTENSION_KEY_HEX,
    extensionValueHex,
    anchorHeaderIdHex,
    anchorHeight,
    anchorContextIndex,
    anchorExtensionRootHex,
    extensionFields: primary.extensionFields,
    extensionMembershipProofHex: membership.proof.toString('hex'),
    headers: primary.headers,
    processBindingDigestHex: before.processBindingDigestHex,
    executionTargetIdentityDigestHex: before.executionTargetIdentityDigestHex,
    observationDigestHex,
    boundaries: {
      primaryAndWitnessAgreed: true as const,
      primaryMiningDuringObservation: true as const,
      checkpointBoundActiveTarget: true as const,
      exactCheckpointRetainedInCurrentContext: true as const,
      exactExtensionMembershipRecomputed: true as const,
      ergoPowAuthenticated: false as const,
      trackerAdmissionEstablished: false as const,
      signingPerformed: false as const,
      submissionPerformed: false as const,
      broadcastPerformed: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
    },
  });
  CHECKPOINT_BOUND_TRACKER_OBSERVATIONS.add(observation);
  return observation;
}

export function assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV1
> {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || !CHECKPOINT_BOUND_TRACKER_OBSERVATIONS.has(value)
    || !Object.isFrozen(value)
  ) {
    throw new Error(
      'checkpoint-bound tracker observation lacks exact process provenance',
    );
  }
}

export async function observeSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerV2(
  input: Readonly<{
    readonly target: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2
    >;
    readonly targetGenesisHeaderIdHex: string;
    readonly expectedAnchorHeaderIdHex: string;
    readonly expectedAnchorHeight: number;
    readonly expectedAnchorExtensionRootHex: string;
    readonly expectedExtensionValueHex: string;
  }>,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2
>> {
  if (
    input.target.primaryMining !== false
    || input.target.primaryReadOnly !== true
    || input.target.witnessReadOnly !== true
    || input.target.miningStopped !== true
    || input.target.checkpointBound !== true
  ) {
    throw new Error('checkpoint-bound tracker V2 requires the frozen read-only target');
  }
  const before =
    assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2(
      input.target,
    );
  const targetGenesisHeaderIdHex = fixedHex(
    input.targetGenesisHeaderIdHex,
    32,
    'checkpoint-bound tracker target genesis header ID',
  );
  const anchorHeaderIdHex = fixedHex(
    input.expectedAnchorHeaderIdHex,
    32,
    'checkpoint-bound tracker anchor header ID',
  );
  const anchorHeight = positiveInteger(
    input.expectedAnchorHeight,
    'checkpoint-bound tracker anchor height',
  );
  const anchorExtensionRootHex = fixedHex(
    input.expectedAnchorExtensionRootHex,
    32,
    'checkpoint-bound tracker anchor extension root',
  );
  const extensionValueHex = fixedHex(
    input.expectedExtensionValueHex,
    64,
    'checkpoint-bound tracker extension value',
  );
  const [primary, witness] = await Promise.all([
    observeCheckpointBoundNode(
      input.target.primaryNodeOrigin,
      targetGenesisHeaderIdHex,
      anchorHeaderIdHex,
      'primary',
    ),
    observeCheckpointBoundNode(
      input.target.witnessNodeOrigin,
      targetGenesisHeaderIdHex,
      anchorHeaderIdHex,
      'witness',
    ),
  ]);
  if (
    primary.fullHeight !== witness.fullHeight
    || primary.headersDigestHex !== witness.headersDigestHex
    || primary.extensionFieldsDigestHex !== witness.extensionFieldsDigestHex
  ) {
    throw new Error(
      'checkpoint-bound tracker primary and witness observations disagree',
    );
  }
  const anchorContextIndex = primary.headers.findIndex(
    header => header.idHex === anchorHeaderIdHex,
  );
  const anchor = primary.headers[anchorContextIndex];
  if (
    anchorContextIndex < 0
    || anchor === undefined
    || anchor.height !== anchorHeight
    || anchor.extensionRootHex !== anchorExtensionRootHex
  ) {
    throw new Error(
      'checkpoint-bound tracker anchor is absent or changed in the current context',
    );
  }
  const matchingFields = primary.extensionFields.filter(
    field => field.keyHex === EXTENSION_KEY_HEX,
  );
  if (
    matchingFields.length !== 1
    || matchingFields[0]!.valueHex !== extensionValueHex
  ) {
    throw new Error(
      'checkpoint-bound tracker anchor does not contain the exact 0x0401 value',
    );
  }
  const membership = buildErgoExtensionMembershipProof(
    primary.extensionFields.map(field => ({
      key: Buffer.from(field.keyHex, 'hex'),
      value: Buffer.from(field.valueHex, 'hex'),
    })),
    Buffer.from(EXTENSION_KEY_HEX, 'hex'),
  );
  if (membership.root.toString('hex') !== anchorExtensionRootHex) {
    throw new Error(
      'checkpoint-bound tracker extension fields do not match the anchor root',
    );
  }
  const after =
    assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2(
      input.target,
    );
  if (
    after.processBindingDigestHex !== before.processBindingDigestHex
    || after.executionTargetIdentityDigestHex
      !== before.executionTargetIdentityDigestHex
  ) {
    throw new Error(
      'checkpoint-bound tracker process binding changed during observation',
    );
  }
  const observationDigestHex = sha256CanonicalJson({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA,
    targetGenesisHeaderIdHex,
    extensionKeyHex: EXTENSION_KEY_HEX,
    extensionValueHex,
    anchorHeaderIdHex,
    anchorHeight,
    anchorContextIndex,
    anchorExtensionRootHex,
    headers: primary.headers.map(header => ({
      canonicalHeaderBytesHex: header.canonicalHeaderBytesHex,
      idHex: header.idHex,
      parentIdHex: header.parentIdHex,
      height: header.height,
      extensionRootHex: header.extensionRootHex,
    })),
    extensionFields: primary.extensionFields,
    extensionMembershipProofHex: membership.proof.toString('hex'),
    processBindingDigestHex: before.processBindingDigestHex,
    executionTargetIdentityDigestHex: before.executionTargetIdentityDigestHex,
  }, CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_DIGEST_DOMAIN);
  const observation = deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA,
    version: 2 as const,
    targetGenesisHeaderIdHex,
    extensionKeyHex: EXTENSION_KEY_HEX,
    extensionValueHex,
    anchorHeaderIdHex,
    anchorHeight,
    anchorContextIndex,
    anchorExtensionRootHex,
    extensionFields: primary.extensionFields,
    extensionMembershipProofHex: membership.proof.toString('hex'),
    headers: primary.headers,
    processBindingDigestHex: before.processBindingDigestHex,
    executionTargetIdentityDigestHex: before.executionTargetIdentityDigestHex,
    observationDigestHex,
    boundaries: {
      primaryAndWitnessAgreed: true as const,
      miningStoppedDuringObservation: true as const,
      checkpointBoundFrozenTarget: true as const,
      exactCheckpointRetainedInCurrentContext: true as const,
      exactExtensionMembershipRecomputed: true as const,
      ergoPowAuthenticated: false as const,
      trackerAdmissionEstablished: false as const,
      signingPerformed: false as const,
      submissionPerformed: false as const,
      broadcastPerformed: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
    },
  });
  CHECKPOINT_BOUND_TRACKER_V2_OBSERVATIONS.add(observation);
  return observation;
}

export function assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2
> {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || !CHECKPOINT_BOUND_TRACKER_V2_OBSERVATIONS.has(value)
    || !Object.isFrozen(value)
  ) {
    throw new Error(
      'frozen checkpoint-bound tracker observation lacks exact process provenance',
    );
  }
}

export async function observeSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessV1(
  input: Readonly<{
    readonly target: Readonly<
      SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1
    >;
    readonly targetGenesisHeaderIdHex: string;
    readonly expectedAnchorHeaderIdHex: string;
    readonly expectedAnchorHeight: number;
    readonly expectedAnchorExtensionRootHex: string;
    readonly expectedExtensionValueHex: string;
  }>,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1
>> {
  if (
    input.target.primaryMining !== false
    || input.target.primaryReadOnly !== true
    || input.target.witnessReadOnly !== true
    || input.target.miningStopped !== true
    || input.target.checkpointBound !== true
    || input.target.reservationFreshnessRevalidation !== true
  ) {
    throw new Error(
      'tracker reservation freshness observation requires the dedicated frozen read-only target',
    );
  }
  const before =
    assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1(
      input.target,
    );
  const targetGenesisHeaderIdHex = fixedHex(
    input.targetGenesisHeaderIdHex,
    32,
    'tracker reservation freshness target genesis header ID',
  );
  const anchorHeaderIdHex = fixedHex(
    input.expectedAnchorHeaderIdHex,
    32,
    'tracker reservation freshness anchor header ID',
  );
  const anchorHeight = positiveInteger(
    input.expectedAnchorHeight,
    'tracker reservation freshness anchor height',
  );
  const anchorExtensionRootHex = fixedHex(
    input.expectedAnchorExtensionRootHex,
    32,
    'tracker reservation freshness anchor extension root',
  );
  const extensionValueHex = fixedHex(
    input.expectedExtensionValueHex,
    64,
    'tracker reservation freshness extension value',
  );
  const [primary, witness] = await Promise.all([
    observeCheckpointBoundNode(
      input.target.primaryNodeOrigin,
      targetGenesisHeaderIdHex,
      anchorHeaderIdHex,
      'primary',
    ),
    observeCheckpointBoundNode(
      input.target.witnessNodeOrigin,
      targetGenesisHeaderIdHex,
      anchorHeaderIdHex,
      'witness',
    ),
  ]);
  if (
    primary.fullHeight !== witness.fullHeight
    || primary.headersDigestHex !== witness.headersDigestHex
    || primary.extensionFieldsDigestHex !== witness.extensionFieldsDigestHex
  ) {
    throw new Error(
      'tracker reservation freshness primary and witness observations disagree',
    );
  }
  const anchorContextIndex = primary.headers.findIndex(
    header => header.idHex === anchorHeaderIdHex,
  );
  const anchor = primary.headers[anchorContextIndex];
  if (
    anchorContextIndex < 0
    || anchor === undefined
    || anchor.height !== anchorHeight
    || anchor.extensionRootHex !== anchorExtensionRootHex
  ) {
    throw new Error(
      'tracker reservation freshness anchor is absent or changed in the current context',
    );
  }
  const matchingFields = primary.extensionFields.filter(
    field => field.keyHex === EXTENSION_KEY_HEX,
  );
  if (
    matchingFields.length !== 1
    || matchingFields[0]!.valueHex !== extensionValueHex
  ) {
    throw new Error(
      'tracker reservation freshness anchor does not contain the exact 0x0401 value',
    );
  }
  const membership = buildErgoExtensionMembershipProof(
    primary.extensionFields.map(field => ({
      key: Buffer.from(field.keyHex, 'hex'),
      value: Buffer.from(field.valueHex, 'hex'),
    })),
    Buffer.from(EXTENSION_KEY_HEX, 'hex'),
  );
  if (membership.root.toString('hex') !== anchorExtensionRootHex) {
    throw new Error(
      'tracker reservation freshness extension fields do not match the anchor root',
    );
  }
  const after =
    assertSubstrateFederatedIsolatedDevnetOwnedTrackerReservationFreshnessTargetV1(
      input.target,
    );
  if (
    after.processBindingDigestHex !== before.processBindingDigestHex
    || after.executionTargetIdentityDigestHex
      !== before.executionTargetIdentityDigestHex
  ) {
    throw new Error(
      'tracker reservation freshness process binding changed during observation',
    );
  }
  const observationDigestHex = sha256CanonicalJson({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_OBSERVATION_V1_SCHEMA,
    targetGenesisHeaderIdHex,
    extensionKeyHex: EXTENSION_KEY_HEX,
    extensionValueHex,
    anchorHeaderIdHex,
    anchorHeight,
    anchorContextIndex,
    anchorExtensionRootHex,
    headers: primary.headers.map(header => ({
      canonicalHeaderBytesHex: header.canonicalHeaderBytesHex,
      idHex: header.idHex,
      parentIdHex: header.parentIdHex,
      height: header.height,
      extensionRootHex: header.extensionRootHex,
    })),
    extensionFields: primary.extensionFields,
    extensionMembershipProofHex: membership.proof.toString('hex'),
    processBindingDigestHex: before.processBindingDigestHex,
    executionTargetIdentityDigestHex: before.executionTargetIdentityDigestHex,
  }, TRACKER_RESERVATION_FRESHNESS_OBSERVATION_V1_DIGEST_DOMAIN);
  const observation = deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_OBSERVATION_V1_SCHEMA,
    version: 1 as const,
    targetGenesisHeaderIdHex,
    extensionKeyHex: EXTENSION_KEY_HEX,
    extensionValueHex,
    anchorHeaderIdHex,
    anchorHeight,
    anchorContextIndex,
    anchorExtensionRootHex,
    extensionFields: primary.extensionFields,
    extensionMembershipProofHex: membership.proof.toString('hex'),
    headers: primary.headers,
    processBindingDigestHex: before.processBindingDigestHex,
    executionTargetIdentityDigestHex: before.executionTargetIdentityDigestHex,
    observationDigestHex,
    boundaries: {
      primaryAndWitnessAgreed: true as const,
      miningStoppedDuringObservation: true as const,
      checkpointBoundReservationFreshnessTarget: true as const,
      exactCheckpointRetainedInCurrentContext: true as const,
      exactExtensionMembershipRecomputed: true as const,
      durableReservationBound: false as const,
      trackerInputRevalidated: false as const,
      jvmTransactionRechecked: false as const,
      ergoPowAuthenticated: false as const,
      signingPerformed: false as const,
      submissionPerformed: false as const,
      broadcastPerformed: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
    },
  });
  TRACKER_RESERVATION_FRESHNESS_OBSERVATIONS_V1.add(observation);
  return observation;
}

export function assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessObservationV1
> {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || !TRACKER_RESERVATION_FRESHNESS_OBSERVATIONS_V1.has(value)
    || !Object.isFrozen(value)
  ) {
    throw new Error(
      'tracker reservation freshness observation lacks exact process provenance',
    );
  }
}

async function observeCheckpointBoundNode(
  origin: string,
  targetGenesisHeaderIdHex: string,
  expectedAnchorHeaderIdHex: string,
  role: 'primary' | 'witness',
): Promise<Readonly<ObservedNodeWindow>> {
  return await observeNodeWindow(
    origin,
    targetGenesisHeaderIdHex,
    role,
    Object.freeze({ expectedAnchorHeaderIdHex }),
  );
}

async function observeNode(
  origin: string,
  targetGenesisHeaderIdHex: string,
  expectedPriorHeight: number,
  role: 'primary' | 'witness',
): Promise<Readonly<ObservedNodeWindow>> {
  return await observeNodeWindow(
    origin,
    targetGenesisHeaderIdHex,
    role,
    Object.freeze({ expectedPriorHeight }),
  );
}

interface ObservedNodeWindow {
  readonly fullHeight: number;
  readonly headers: readonly Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointAnchorHeaderV1
  >[];
  readonly headersDigestHex: string;
  readonly extensionFields: readonly Readonly<{
    readonly keyHex: string;
    readonly valueHex: string;
  }>[];
  readonly extensionFieldsDigestHex: string;
}

async function observeNodeWindow(
  origin: string,
  targetGenesisHeaderIdHex: string,
  role: 'primary' | 'witness',
  policy: Readonly<
    | { readonly expectedPriorHeight: number }
    | { readonly expectedAnchorHeaderIdHex: string }
  >,
): Promise<Readonly<ObservedNodeWindow>> {
  const checkpointBound = 'expectedAnchorHeaderIdHex' in policy;
  const label = checkpointBound
    ? 'checkpoint-bound tracker'
    : 'checkpoint anchor';
  const client = axios.create({
    baseURL: origin,
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    proxy: false,
    maxContentLength: MAX_RESPONSE_BYTES,
    responseType: 'arraybuffer',
    decompress: false,
    transformResponse: [(value: unknown) => value],
    headers: Object.freeze({
      Accept: 'application/json',
      'Accept-Encoding': 'identity',
    }),
  });
  const [infoResponse, genesisResponse] = await Promise.all([
    client.get('/info'),
    client.get('/blocks/at/1'),
  ]);
  const info = requiredRecord(
    parseErgoNodeResponse(infoResponse, `${role} ${label} node info`),
    `${role} ${label} node info`,
  );
  if (String(info.network ?? info.networkType).trim().toLowerCase() !== 'devnet') {
    throw new Error(`${role} ${label} requires devnet identity`);
  }
  const fullHeight = positiveInteger(info.fullHeight, `${role} ${label} height`);
  const headerCount = checkpointBound
    ? 10
    : Math.max(10, fullHeight - policy.expectedPriorHeight + 1);
  if (!Number.isSafeInteger(headerCount) || headerCount < 2) {
    throw new Error(`${role} checkpoint anchor must follow the prior snapshot`);
  }
  if (headerCount > MAX_ANCESTRY_HEADER_COUNT) {
    throw new Error(
      `${role} checkpoint anchor ancestry exceeds the explicit header bound`,
    );
  }
  const genesis = parseErgoNodeResponse(
    genesisResponse,
    `${role} ${label} genesis response`,
  );
  if (
    !Array.isArray(genesis)
    || genesis.length !== 1
    || fixedHex(
      genesis[0],
      32,
      `${role} ${label} genesis header ID`,
    ) !== targetGenesisHeaderIdHex
  ) {
    throw new Error(`${role} ${label} target identity changed`);
  }
  const headersResponse = await client.get(
    `/blocks/lastHeaders/${headerCount}`,
  );
  const headerValues = parseErgoNodeResponse(
    headersResponse,
    `${role} ${label} header window`,
  );
  if (
    !Array.isArray(headerValues)
    || headerValues.length !== headerCount
  ) {
    throw new Error(`${role} ${label} header window is incomplete`);
  }
  const apiHeaders = headerValues.map((value, index) =>
    normalizeHeader(value, index, role)
  );
  const oldestHeight = fullHeight - headerCount + 1;
  apiHeaders.forEach((header, index) => {
    if (header.height !== oldestHeight + index) {
      throw new Error(
        `${role} ${label} headers are not contiguous oldest-to-newest`,
      );
    }
    if (
      index > 0
      && header.parentIdHex !== apiHeaders[index - 1]!.idHex
    ) {
      throw new Error(`${role} ${label} header lineage is broken`);
    }
  });
  // Ergo Node's lastHeaders endpoint is oldest-first. State-context consumers
  // require the mined tip first, so convert only after checking the API order.
  const headers = [...apiHeaders].reverse();
  if (headers[0]!.height !== fullHeight) {
    throw new Error(`${role} ${label} tip differs from node height`);
  }
  const anchorHeaderIdHex = checkpointBound
    ? policy.expectedAnchorHeaderIdHex
    : headers[0]!.idHex;
  const anchorHeader = headers.find(header => header.idHex === anchorHeaderIdHex);
  if (anchorHeader === undefined) {
    throw new Error(
      `${role} checkpoint-bound tracker current context does not retain the anchor`,
    );
  }
  const anchorBlockResponse = await client.get(`/blocks/${anchorHeaderIdHex}`);
  const anchorBlock = requiredRecord(
    parseErgoNodeResponse(
      anchorBlockResponse,
      `${role} ${label} anchor block`,
    ),
    `${role} ${label} anchor block`,
  );
  const blockHeader = requiredRecord(
    anchorBlock.header,
    `${role} ${label} anchor block header`,
  );
  const normalizedBlockHeader = normalizeHeader(blockHeader, 0, role);
  if (
    normalizedBlockHeader.canonicalHeaderBytesHex
      !== anchorHeader.canonicalHeaderBytesHex
  ) {
    throw new Error(`${role} ${label} anchor block changed header identity`);
  }
  const extension = requiredRecord(
    anchorBlock.extension,
    `${role} ${label} anchor extension`,
  );
  if (!Array.isArray(extension.fields) || extension.fields.length === 0) {
    throw new Error(`${role} ${label} anchor extension fields are absent`);
  }
  const extensionFields = extension.fields.map((field, index) =>
    normalizeExtensionField(field, index, role)
  );
  return deepFreeze({
    fullHeight,
    headers,
    headersDigestHex: sha256CanonicalJson(
      headers.map(header => ({
        canonicalHeaderBytesHex: header.canonicalHeaderBytesHex,
        idHex: header.idHex,
        parentIdHex: header.parentIdHex,
        height: header.height,
        extensionRootHex: header.extensionRootHex,
      })),
      checkpointBound
        ? 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_HEADERS_V1'
        : 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_HEADERS_V1',
    ),
    extensionFields,
    extensionFieldsDigestHex: sha256CanonicalJson(
      extensionFields,
      checkpointBound
        ? 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_EXTENSION_FIELDS_V1'
        : 'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_EXTENSION_FIELDS_V1',
    ),
  });
}

function parseErgoNodeResponse(
  response: AxiosResponse<unknown>,
  label: string,
): unknown {
  const rawBody = rawResponseBody(response.data, label);
  if (rawBody.length > MAX_RESPONSE_BYTES) {
    throw new Error(`${label} exceeds the response byte bound`);
  }
  const contentEncoding = response.headers?.['content-encoding'];
  if (
    contentEncoding !== undefined
    && String(contentEncoding).trim().toLowerCase() !== 'identity'
  ) {
    throw new Error(`${label} must use identity encoding`);
  }
  const status = response.status;
  if (!Number.isSafeInteger(status) || status < 200 || status >= 300) {
    throw new Error(`${label} failed with HTTP status ${String(status)}`);
  }
  const rawText = rawBody.toString('utf8');
  if (!Buffer.from(rawText, 'utf8').equals(rawBody)) {
    throw new Error(`${label} must use canonical UTF-8`);
  }
  return parseNodeJsonPreservingPowDistance(rawText);
}

function rawResponseBody(value: unknown, label: string): Buffer {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new Error(`${label} body must remain raw bytes`);
}

function normalizeHeader(
  value: unknown,
  index: number,
  role: 'primary' | 'witness',
): Readonly<SubstrateFederatedIsolatedDevnetCheckpointAnchorHeaderV1> {
  const raw = requiredRecord(value, `${role} checkpoint header ${index}`);
  const canonicalHeaderBytes = normalizeErgoNodeHeaderBytes(raw);
  const identity = parseErgoHeaderIdentity(canonicalHeaderBytes);
  const idHex = computeErgoHeaderId(identity).toString('hex');
  const claimedIdHex = fixedHex(
    raw.id ?? raw.headerId,
    32,
    `${role} checkpoint header ${index} ID`,
  );
  if (claimedIdHex !== idHex) {
    throw new Error(`${role} checkpoint header ${index} ID is not canonical`);
  }
  const canonicalHeaderBytesHex = canonicalHeaderBytes.toString('hex');
  return deepFreeze({
    raw,
    canonicalHeaderBytesHex,
    canonicalHeaderDigestHex: sha256CanonicalJson(
      canonicalHeaderBytesHex,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_HEADER_BYTES_V1',
    ),
    idHex,
    parentIdHex: Buffer.from(identity.parentId).toString('hex'),
    height: identity.height,
    extensionRootHex: Buffer.from(identity.extensionHash).toString('hex'),
  });
}

function normalizeExtensionField(
  value: unknown,
  index: number,
  role: 'primary' | 'witness',
): Readonly<{ readonly keyHex: string; readonly valueHex: string }> {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${role} checkpoint extension field ${index} is malformed`);
  }
  const keyHex = variableHex(value[0], `${role} checkpoint extension key ${index}`);
  const valueHex = variableHex(
    value[1],
    `${role} checkpoint extension value ${index}`,
  );
  if (Buffer.from(keyHex, 'hex').length !== 2) {
    throw new Error(`${role} checkpoint extension key ${index} must be two bytes`);
  }
  if (Buffer.from(valueHex, 'hex').length > 64) {
    throw new Error(`${role} checkpoint extension value ${index} exceeds 64 bytes`);
  }
  return Object.freeze({ keyHex, valueHex });
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const hex = variableHex(value, label);
  if (hex.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes}-byte lowercase hexadecimal`);
  }
  return hex;
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string' || value.length === 0
    || value.length % 2 !== 0 || !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new Error(`${label} must be nonempty lowercase hexadecimal`);
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
