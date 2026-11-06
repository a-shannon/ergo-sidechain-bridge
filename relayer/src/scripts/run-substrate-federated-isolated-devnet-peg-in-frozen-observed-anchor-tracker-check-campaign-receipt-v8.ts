import {
  type SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Receipt,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  buildErgoExtensionMembershipProof,
} from '../ergo-settlement-core/ergo-extension-membership.js';
import {
  computeErgoHeaderId,
  parseErgoHeaderIdentity,
} from '../ergo-settlement-core/ergo-header-id.js';
import {
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1,
} from '../relayer-core/substrate-federated-isolated-devnet-receipt-data-safety-v1.js';
import {
  deriveSubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionObservationDigestV1,
} from '../relayer-core/substrate-federated-isolated-devnet-checkpoint-extension-observation-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInPlanV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-receipt-v1.js';
import {
  assertNoLocalPathValue,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V7_SCHEMA,
  WORKER_RECEIPT_DIGEST_DOMAIN_V7,
  buildSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7,
  parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7,
  type SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7,
} from './run-substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-receipt-v7.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V8_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-worker-receipt.v8' as const;
export const WORKER_RECEIPT_DIGEST_DOMAIN_V8 =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V8';

type WorkerReceiptV7 =
  SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7;

export interface SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8
  extends Omit<WorkerReceiptV7, 'anchor' | 'receiptDigestHex' | 'schema' | 'version'> {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V8_SCHEMA;
  readonly version: 8;
  readonly anchor: Readonly<WorkerReceiptV7['anchor'] & {
    readonly canonicalHeaderBytesHex: string;
    readonly extensionFields: readonly Readonly<{
      readonly keyHex: string;
      readonly valueHex: string;
    }>[];
    readonly extensionMembershipProofHex: string;
    readonly canonicalCheckpointExtensionObservationDigestHex: string;
  }>;
  readonly receiptDigestHex: string;
}

export function buildSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8(
  root: Readonly<
    SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Receipt
  >,
  commandRequestSha256Hex: string,
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8
> {
  const v7 =
    buildSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7(
      root,
      commandRequestSha256Hex,
      pegIn,
    );
  const observation = root.checkpointAnchor.observation;
  const header = observation.headers[observation.anchorContextIndex];
  if (header === undefined) {
    throw new Error('checkpoint extension anchor header is absent');
  }
  const canonicalCheckpointExtensionObservationDigestHex =
    validateCanonicalAnchorMaterial({
      anchorHeaderIdHex: observation.anchorHeaderIdHex,
      anchorHeight: observation.anchorHeight,
      anchorExtensionRootHex: observation.anchorExtensionRootHex,
      extensionValueHex: observation.extensionValueHex,
      canonicalHeaderBytesHex: header.canonicalHeaderBytesHex,
      extensionFields: observation.extensionFields,
      extensionMembershipProofHex: observation.extensionMembershipProofHex,
    });
  if (
    v7.trackerExecution.checkpointExtensionObservationDigestHex
      !== canonicalCheckpointExtensionObservationDigestHex
  ) {
    throw new Error(
      'checkpoint extension canonical observation binding changed',
    );
  }
  const { receiptDigestHex: _v7Digest, ...v7Body } = v7;
  const body = {
    ...v7Body,
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V8_SCHEMA,
    version: 8 as const,
    anchor: {
      ...v7.anchor,
      canonicalHeaderBytesHex: header.canonicalHeaderBytesHex,
      extensionFields: observation.extensionFields.map(field => ({
        keyHex: field.keyHex,
        valueHex: field.valueHex,
      })),
      extensionMembershipProofHex: observation.extensionMembershipProofHex,
      canonicalCheckpointExtensionObservationDigestHex,
    },
  };
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN_V8),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(
    receipt,
    'frozen-observed-anchor-tracker-check campaign worker receipt V8',
  );
  return receipt;
}

export function parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8(
  stdout: string,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8
> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign worker V8 output is not JSON',
    );
  }
  if (`${canonicalJson(parsed)}\n` !== stdout) {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign worker V8 output is not canonical JSON',
    );
  }
  const receipt = exactRecord(parsed, [
    'anchor',
    'application',
    'boundaries',
    'checkpoint',
    'checks',
    'commandRequestSha256Hex',
    'execution',
    'pegIn',
    'proof',
    'receiptDigestHex',
    'rootReceiptDigestHex',
    'schema',
    'status',
    'trackerCandidate',
    'trackerCheck',
    'trackerExecution',
    'trackerObservation',
    'trackerSetup',
    'version',
  ], 'frozen-observed-anchor-tracker-check campaign worker V8 receipt');
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V8_SCHEMA
    || receipt.version !== 8
  ) {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign worker V8 identity changed',
    );
  }
  const anchor = exactRecord(receipt.anchor, [
    'anchorExtensionRootHex',
    'anchorHeaderIdHex',
    'anchorHeight',
    'canonicalCheckpointExtensionObservationDigestHex',
    'canonicalHeaderBytesHex',
    'executionTargetIdentityDigestHex',
    'extensionFields',
    'extensionKeyHex',
    'extensionMembershipProofHex',
    'extensionValueHex',
    'observationDigestHex',
    'processBindingDigestHex',
  ], 'frozen-observed-anchor-tracker-check campaign worker V8 anchor');
  const extensionFields = validateExtensionFields(anchor.extensionFields);
  const canonicalCheckpointExtensionObservationDigestHex =
    validateCanonicalAnchorMaterial({
      anchorHeaderIdHex: anchor.anchorHeaderIdHex,
      anchorHeight: anchor.anchorHeight,
      anchorExtensionRootHex: anchor.anchorExtensionRootHex,
      extensionValueHex: anchor.extensionValueHex,
      canonicalHeaderBytesHex: anchor.canonicalHeaderBytesHex,
      extensionFields,
      extensionMembershipProofHex: anchor.extensionMembershipProofHex,
    });
  if (
    anchor.extensionKeyHex !== '0401'
    || fixedHex(
      anchor.canonicalCheckpointExtensionObservationDigestHex,
      32,
      'worker V8 canonical checkpoint extension observation digest',
    ) !== canonicalCheckpointExtensionObservationDigestHex
  ) {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign worker V8 canonical anchor binding changed',
    );
  }
  const trackerExecution = plainRecord(
    receipt.trackerExecution,
    'frozen-observed-anchor-tracker-check campaign worker V8 tracker execution',
  );
  if (
    trackerExecution.checkpointExtensionObservationDigestHex
      !== canonicalCheckpointExtensionObservationDigestHex
  ) {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign worker V8 canonical observation binding changed',
    );
  }

  const validatedV7 =
    parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7(
      `${canonicalJson(toV7Receipt(receipt, anchor))}\n`,
      expectedRequestSha256Hex,
      expectedPegIn,
      canonicalCheckpointExtensionObservationDigestHex,
    );
  const { receiptDigestHex, ...body } = receipt;
  const normalizedReceiptDigestHex = fixedHex(
    receiptDigestHex,
    32,
    'worker V8 receipt digest',
  );
  if (
    normalizedReceiptDigestHex
      !== sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN_V8)
  ) {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign worker V8 digest changed',
    );
  }
  const validated = deepFreeze({
    ...validatedV7,
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V8_SCHEMA,
    version: 8 as const,
    anchor: {
      ...validatedV7.anchor,
      canonicalHeaderBytesHex: anchor.canonicalHeaderBytesHex as string,
      extensionFields,
      extensionMembershipProofHex: anchor.extensionMembershipProofHex as string,
      canonicalCheckpointExtensionObservationDigestHex,
    },
    receiptDigestHex: normalizedReceiptDigestHex,
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(validated);
  assertNoLocalPathValue(
    validated,
    'frozen-observed-anchor-tracker-check campaign worker receipt V8',
  );
  return validated;
}

function toV7Receipt(
  receipt: Record<string, unknown>,
  anchor: Record<string, unknown>,
): Record<string, unknown> {
  const {
    canonicalCheckpointExtensionObservationDigestHex: _canonicalDigest,
    canonicalHeaderBytesHex: _canonicalHeaderBytes,
    extensionFields: _extensionFields,
    extensionMembershipProofHex: _membershipProof,
    ...v7Anchor
  } = anchor;
  const {
    receiptDigestHex: _v8Digest,
    schema: _v8Schema,
    version: _v8Version,
    ...rest
  } = receipt;
  const body = {
    ...rest,
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V7_SCHEMA,
    version: 7 as const,
    anchor: v7Anchor,
  };
  return {
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, WORKER_RECEIPT_DIGEST_DOMAIN_V7),
  };
}

function validateExtensionFields(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('worker V8 extension fields are absent');
  }
  return value.map((field, index) => {
    const record = exactRecord(
      field,
      ['keyHex', 'valueHex'],
      `worker V8 extension field ${index}`,
    );
    return Object.freeze({
      keyHex: fixedHex(record.keyHex, 2, `worker V8 extension key ${index}`),
      valueHex: evenLowerHex(
        record.valueHex,
        `worker V8 extension value ${index}`,
      ),
    });
  });
}

function validateCanonicalAnchorMaterial(input: Readonly<{
  readonly anchorHeaderIdHex: unknown;
  readonly anchorHeight: unknown;
  readonly anchorExtensionRootHex: unknown;
  readonly extensionValueHex: unknown;
  readonly canonicalHeaderBytesHex: unknown;
  readonly extensionFields: readonly Readonly<{
    readonly keyHex: string;
    readonly valueHex: string;
  }>[];
  readonly extensionMembershipProofHex: unknown;
}>): string {
  const anchorHeaderIdHex = fixedHex(
    input.anchorHeaderIdHex,
    32,
    'worker V8 anchor header ID',
  );
  const anchorHeight = nonNegativeSafeInteger(
    input.anchorHeight,
    'worker V8 anchor height',
  );
  const anchorExtensionRootHex = fixedHex(
    input.anchorExtensionRootHex,
    32,
    'worker V8 anchor extension root',
  );
  const extensionValueHex = fixedHex(
    input.extensionValueHex,
    64,
    'worker V8 extension value',
  );
  const canonicalHeaderBytesHex = evenLowerHex(
    input.canonicalHeaderBytesHex,
    'worker V8 canonical header bytes',
  );
  const extensionMembershipProofHex = evenLowerHex(
    input.extensionMembershipProofHex,
    'worker V8 extension membership proof',
  );
  const canonicalHeaderBytes = Buffer.from(canonicalHeaderBytesHex, 'hex');
  let headerIdentity: ReturnType<typeof parseErgoHeaderIdentity>;
  try {
    headerIdentity = parseErgoHeaderIdentity(canonicalHeaderBytes);
  } catch {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign worker V8 canonical anchor header binding changed',
    );
  }
  if (
    computeErgoHeaderId(headerIdentity).toString('hex') !== anchorHeaderIdHex
    || headerIdentity.height !== anchorHeight
    || Buffer.from(headerIdentity.extensionHash).toString('hex')
      !== anchorExtensionRootHex
  ) {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign worker V8 canonical anchor header binding changed',
    );
  }
  let membership: ReturnType<typeof buildErgoExtensionMembershipProof>;
  try {
    membership = buildErgoExtensionMembershipProof(
      input.extensionFields.map(field => ({
        key: Buffer.from(field.keyHex, 'hex'),
        value: Buffer.from(field.valueHex, 'hex'),
      })),
      Buffer.from('0401', 'hex'),
    );
  } catch {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign worker V8 canonical anchor extension binding changed',
    );
  }
  if (
    membership.root.toString('hex') !== anchorExtensionRootHex
    || membership.proof.toString('hex') !== extensionMembershipProofHex
  ) {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign worker V8 canonical anchor extension binding changed',
    );
  }
  return deriveSubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionObservationDigestV1({
    checkpoint: {
      network: 'devnet',
      fullHeight: anchorHeight,
      indexedHeight: anchorHeight,
      headerIdHex: anchorHeaderIdHex,
    },
    expectedExtensionValueHex: extensionValueHex,
    canonicalHeaderBytesHex,
    extensionRootHex: anchorExtensionRootHex,
    extensionFields: input.extensionFields,
    extensionMembershipProofHex,
  });
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = plainRecord(value, label);
  if (
    JSON.stringify(Object.keys(record).sort())
      !== JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} fields changed`);
  }
  return record;
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} is malformed`);
  }
  return value as Record<string, unknown>;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) {
    throw new Error(`${label} must be canonical fixed-width hex`);
  }
  return value;
}

function evenLowerHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/u.test(value)
  ) {
    throw new Error(`${label} must be canonical even-length hex`);
  }
  return value;
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}
