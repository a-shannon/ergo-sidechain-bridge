import axios from 'axios';

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
import {
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointTargetV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetReadOnlyErgoTargetV1,
} from './substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_ANCHOR_OBSERVATION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-checkpoint-anchor-observation.v1' as const;

const EXTENSION_KEY_HEX = '0401' as const;
const MAX_ANCESTRY_HEADER_COUNT = 256;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const OBSERVATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_ANCHOR_OBSERVATION_V1';
const OBSERVATIONS = new WeakSet<object>();

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

async function observeNode(
  origin: string,
  targetGenesisHeaderIdHex: string,
  expectedPriorHeight: number,
  role: 'primary' | 'witness',
): Promise<Readonly<{
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
}>> {
  const client = axios.create({
    baseURL: origin,
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    proxy: false,
    maxContentLength: MAX_RESPONSE_BYTES,
    headers: Object.freeze({ Accept: 'application/json' }),
  });
  const [infoResponse, genesisResponse] = await Promise.all([
    client.get('/info'),
    client.get('/blocks/at/1'),
  ]);
  const info = requiredRecord(infoResponse.data, `${role} checkpoint node info`);
  if (String(info.network ?? info.networkType).trim().toLowerCase() !== 'devnet') {
    throw new Error(`${role} checkpoint anchor requires devnet identity`);
  }
  const fullHeight = positiveInteger(info.fullHeight, `${role} checkpoint height`);
  const headerCount = Math.max(10, fullHeight - expectedPriorHeight + 1);
  if (!Number.isSafeInteger(headerCount) || headerCount < 2) {
    throw new Error(`${role} checkpoint anchor must follow the prior snapshot`);
  }
  if (headerCount > MAX_ANCESTRY_HEADER_COUNT) {
    throw new Error(
      `${role} checkpoint anchor ancestry exceeds the explicit header bound`,
    );
  }
  if (
    !Array.isArray(genesisResponse.data)
    || genesisResponse.data.length !== 1
    || fixedHex(
      genesisResponse.data[0],
      32,
      `${role} checkpoint genesis header ID`,
    ) !== targetGenesisHeaderIdHex
  ) {
    throw new Error(`${role} checkpoint anchor target identity changed`);
  }
  const headersResponse = await client.get(
    `/blocks/lastHeaders/${headerCount}`,
  );
  if (
    !Array.isArray(headersResponse.data)
    || headersResponse.data.length !== headerCount
  ) {
    throw new Error(`${role} checkpoint anchor header window is incomplete`);
  }
  const headers = headersResponse.data.map((value, index) =>
    normalizeHeader(value, index, role)
  );
  if (headers[0]!.height !== fullHeight) {
    throw new Error(`${role} checkpoint anchor tip differs from node height`);
  }
  headers.forEach((header, index) => {
    if (header.height !== fullHeight - index) {
      throw new Error(`${role} checkpoint anchor header heights are not contiguous`);
    }
    if (
      index + 1 < headers.length
      && header.parentIdHex !== headers[index + 1]!.idHex
    ) {
      throw new Error(`${role} checkpoint anchor header lineage is broken`);
    }
  });
  const anchorBlockResponse = await client.get(`/blocks/${headers[0]!.idHex}`);
  const anchorBlock = requiredRecord(
    anchorBlockResponse.data,
    `${role} checkpoint anchor block`,
  );
  const blockHeader = requiredRecord(
    anchorBlock.header,
    `${role} checkpoint anchor block header`,
  );
  const normalizedBlockHeader = normalizeHeader(blockHeader, 0, role);
  if (
    normalizedBlockHeader.canonicalHeaderBytesHex
      !== headers[0]!.canonicalHeaderBytesHex
  ) {
    throw new Error(`${role} checkpoint anchor block changed header identity`);
  }
  const extension = requiredRecord(
    anchorBlock.extension,
    `${role} checkpoint anchor extension`,
  );
  if (!Array.isArray(extension.fields) || extension.fields.length === 0) {
    throw new Error(`${role} checkpoint anchor extension fields are absent`);
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
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_HEADERS_V1',
    ),
    extensionFields,
    extensionFieldsDigestHex: sha256CanonicalJson(
      extensionFields,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_EXTENSION_FIELDS_V1',
    ),
  });
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
