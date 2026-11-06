import { sha256CanonicalJson } from '../ergo-settlement-core/strict-json.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1' as const;

const CHECKPOINT_EXTENSION_KEY_HEX = '0401' as const;
const NODE_OBSERVATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_EXTENSION_NODE_OBSERVATION_V1';
const OBSERVATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_EXTENSION_OBSERVATION_V1';

export interface SubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionObservationV1 {
  readonly checkpoint: Readonly<{
    readonly network: 'devnet';
    readonly fullHeight: number;
    readonly indexedHeight: number;
    readonly headerIdHex: string;
  }>;
  readonly expectedExtensionValueHex: string;
  readonly canonicalHeaderBytesHex: string;
  readonly extensionRootHex: string;
  readonly extensionFields: readonly Readonly<{
    readonly keyHex: string;
    readonly valueHex: string;
  }>[];
  readonly extensionMembershipProofHex: string;
}

export interface SubstrateFederatedIsolatedDevnetCheckpointExtensionAnchorMaterialV1 {
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
  readonly headers: readonly Readonly<{
    readonly canonicalHeaderBytesHex: string;
    readonly idHex: string;
    readonly height: number;
    readonly extensionRootHex: string;
  }>[];
}

export function deriveSubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionNodeObservationDigestV1(
  input: Readonly<
    SubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionObservationV1
  >,
): string {
  const checkpoint = normalizeCheckpoint(input.checkpoint);
  const expectedExtensionValueHex = fixedHex(
    input.expectedExtensionValueHex,
    64,
    'isolated Ergo checkpoint extension value',
  );
  if (!Array.isArray(input.extensionFields) || input.extensionFields.length === 0) {
    throw new Error('isolated Ergo checkpoint extension fields are absent');
  }
  const fields = input.extensionFields.map((field, index) => {
    if (field === null || typeof field !== 'object' || Array.isArray(field)) {
      throw new Error(`isolated Ergo checkpoint extension field ${index} is malformed`);
    }
    const keyHex = fixedHex(
      field.keyHex,
      2,
      `isolated Ergo checkpoint extension key ${index}`,
    );
    const valueHex = variableHex(
      field.valueHex,
      `isolated Ergo checkpoint extension value ${index}`,
    );
    if (Buffer.from(valueHex, 'hex').length > 64) {
      throw new Error(
        `isolated Ergo checkpoint extension value ${index} exceeds 64 bytes`,
      );
    }
    return Object.freeze({ keyHex, valueHex });
  });
  const matching = fields.filter(field =>
    field.keyHex === CHECKPOINT_EXTENSION_KEY_HEX
  );
  if (
    matching.length !== 1
    || matching[0]!.valueHex !== expectedExtensionValueHex
  ) {
    throw new Error('isolated Ergo checkpoint does not contain the exact 0x0401 value');
  }
  return sha256CanonicalJson({
    headerIdHex: checkpoint.headerIdHex,
    height: checkpoint.fullHeight,
    canonicalHeaderBytesHex: variableHex(
      input.canonicalHeaderBytesHex,
      'isolated Ergo checkpoint canonical header bytes',
    ),
    extensionRootHex: fixedHex(
      input.extensionRootHex,
      32,
      'isolated Ergo checkpoint extension root',
    ),
    fields,
    extensionMembershipProofHex: variableHex(
      input.extensionMembershipProofHex,
      'isolated Ergo checkpoint extension membership proof',
    ),
  }, NODE_OBSERVATION_DIGEST_DOMAIN);
}

export function deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromNodeDigestsV1(
  checkpointValue: Readonly<{
    readonly network: 'devnet';
    readonly fullHeight: number;
    readonly indexedHeight: number;
    readonly headerIdHex: string;
  }>,
  expectedExtensionValueHexValue: string,
  primaryObservationDigestHexValue: string,
  witnessObservationDigestHexValue: string,
): string {
  const checkpoint = normalizeCheckpoint(checkpointValue);
  const expectedExtensionValueHex = fixedHex(
    expectedExtensionValueHexValue,
    64,
    'isolated Ergo checkpoint extension value',
  );
  const primaryObservationDigestHex = fixedHex(
    primaryObservationDigestHexValue,
    32,
    'isolated Ergo primary checkpoint extension observation digest',
  );
  const witnessObservationDigestHex = fixedHex(
    witnessObservationDigestHexValue,
    32,
    'isolated Ergo witness checkpoint extension observation digest',
  );
  if (primaryObservationDigestHex !== witnessObservationDigestHex) {
    throw new Error('isolated Ergo checkpoint extension observations disagree');
  }
  return sha256CanonicalJson({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA,
    checkpoint,
    extensionKeyHex: CHECKPOINT_EXTENSION_KEY_HEX,
    extensionValueHex: expectedExtensionValueHex,
    primaryObservationDigestHex,
    witnessObservationDigestHex,
  }, OBSERVATION_DIGEST_DOMAIN);
}

export function deriveSubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionObservationDigestV1(
  input: Readonly<
    SubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionObservationV1
  >,
): string {
  const nodeObservationDigestHex =
    deriveSubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionNodeObservationDigestV1(
      input,
    );
  return deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromNodeDigestsV1(
    input.checkpoint,
    input.expectedExtensionValueHex,
    nodeObservationDigestHex,
    nodeObservationDigestHex,
  );
}

export function deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1(
  anchor: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointExtensionAnchorMaterialV1
  >,
): string {
  const anchorContextIndex = nonnegativeInteger(
    anchor.anchorContextIndex,
    'isolated Ergo checkpoint anchor context index',
  );
  const header = anchor.headers[anchorContextIndex];
  if (header === undefined) {
    throw new Error('isolated Ergo checkpoint anchor header is absent');
  }
  const anchorHeaderIdHex = fixedHex(
    anchor.anchorHeaderIdHex,
    32,
    'isolated Ergo checkpoint anchor header ID',
  );
  const anchorHeight = nonnegativeInteger(
    anchor.anchorHeight,
    'isolated Ergo checkpoint anchor height',
  );
  const anchorExtensionRootHex = fixedHex(
    anchor.anchorExtensionRootHex,
    32,
    'isolated Ergo checkpoint anchor extension root',
  );
  if (
    fixedHex(header.idHex, 32, 'isolated Ergo checkpoint context header ID')
      !== anchorHeaderIdHex
    || nonnegativeInteger(
      header.height,
      'isolated Ergo checkpoint context header height',
    ) !== anchorHeight
    || fixedHex(
      header.extensionRootHex,
      32,
      'isolated Ergo checkpoint context extension root',
    ) !== anchorExtensionRootHex
  ) {
    throw new Error('isolated Ergo checkpoint anchor context binding changed');
  }
  return deriveSubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionObservationDigestV1({
    checkpoint: {
      network: 'devnet',
      fullHeight: anchorHeight,
      indexedHeight: anchorHeight,
      headerIdHex: anchorHeaderIdHex,
    },
    expectedExtensionValueHex: anchor.extensionValueHex,
    canonicalHeaderBytesHex: header.canonicalHeaderBytesHex,
    extensionRootHex: anchorExtensionRootHex,
    extensionFields: anchor.extensionFields,
    extensionMembershipProofHex: anchor.extensionMembershipProofHex,
  });
}

function normalizeCheckpoint(
  value: Readonly<{
    readonly network: 'devnet';
    readonly fullHeight: number;
    readonly indexedHeight: number;
    readonly headerIdHex: string;
  }>,
) {
  const checkpoint = Object.freeze({
    network: value.network,
    fullHeight: nonnegativeInteger(
      value.fullHeight,
      'isolated Ergo checkpoint full height',
    ),
    indexedHeight: nonnegativeInteger(
      value.indexedHeight,
      'isolated Ergo checkpoint indexed height',
    ),
    headerIdHex: fixedHex(
      value.headerIdHex,
      32,
      'isolated Ergo checkpoint header ID',
    ),
  });
  if (
    checkpoint.network !== 'devnet'
    || checkpoint.indexedHeight !== checkpoint.fullHeight
  ) {
    throw new Error('isolated Ergo checkpoint snapshot is not fully indexed devnet state');
  }
  return checkpoint;
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string' || value.length !== bytes * 2
    || !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new Error(`${label} must be ${bytes} lowercase hex bytes`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string' || value.length === 0
    || value.length % 2 !== 0 || !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase even-length hex`);
  }
  return value;
}
