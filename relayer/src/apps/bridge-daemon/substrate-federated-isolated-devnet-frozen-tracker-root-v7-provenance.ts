import {
  sha256CanonicalJson,
} from '../../ergo-settlement-core/strict-json.js';
import {
  assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1,
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2,
  type SubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1,
  type SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2,
} from '../../substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2,
  type SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt,
} from '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance,
  type SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3,
} from './substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-root.v7' as const;

export const PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7';

interface FrozenObservedAnchorTrackerCheckCampaignRootV7TrackerMaterial {
  readonly execution: Readonly<{
    readonly buildIdentityDigestHex: string;
    readonly executableIdentityDigestHex: string;
    readonly processBindingDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
    readonly checkpointExtensionObservationDigestHex: string;
    readonly extensionKeyHex: string;
    readonly extensionValueHex: string;
    readonly actionStartSnapshot: Readonly<{
      readonly fullHeight: number;
      readonly indexedHeight: number;
      readonly headerIdHex: string;
    }>;
    readonly actionEndSnapshot: Readonly<{
      readonly fullHeight: number;
      readonly indexedHeight: number;
      readonly headerIdHex: string;
    }>;
  }>;
  readonly observation: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2
  >;
  readonly trackerSetup: Readonly<{
    readonly expectedTxId: string;
    readonly outputBoxIdHex: string;
    readonly outputIndex: number;
    readonly outputCreationHeight: number;
    readonly confirmationDigestHex: string;
    readonly confirmationHeight: number;
    readonly confirmationHeaderIdHex: string;
    readonly observedAtHeight: number;
  }>;
  readonly candidate: Readonly<{
    readonly trustModel: 'federated_non_trustless';
    readonly contractIdHex: string;
    readonly trackerNftIdHex: string;
    readonly statementIdHex: string;
    readonly inputBoxIdHex: string;
    readonly trackerKeyHex: string;
    readonly trackerValueHex: string;
    readonly inputDigestHex: string;
    readonly successorDigestHex: string;
    readonly currentErgoHeight: number;
    readonly anchorContextIndex: number;
    readonly contextExtensionSerializedHex: string;
    readonly prooflessTransactionBytes: number;
    readonly unsignedTransactionIdHex: string;
  }>;
  readonly check: Readonly<
    SubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2Receipt
  >;
}

export interface FrozenObservedAnchorTrackerCheckCampaignRootV7ProvenanceMaterial {
  readonly staticExecutionManifestDigestHex: string;
  readonly applicationCheckpoint: Readonly<
    SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3
  >;
  readonly checkpointAnchorObservation: Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1
  >;
  readonly tracker: Readonly<
    FrozenObservedAnchorTrackerCheckCampaignRootV7TrackerMaterial
  >;
}

export interface FrozenObservedAnchorTrackerCheckCampaignRootV7ProvenanceReceipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7_SCHEMA;
  readonly version: 7;
  readonly status:
    'observed_anchor_tracker_candidate_accepted_by_frozen_local_node_check';
  readonly staticExecutionManifestDigestHex: string;
  readonly application: Readonly<{
    readonly applicationCheckpoint: Readonly<
      SubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3
    >;
  }>;
  readonly checkpointAnchor: Readonly<{
    readonly observation: Readonly<
      SubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1
    >;
  }>;
  readonly tracker: Readonly<
    FrozenObservedAnchorTrackerCheckCampaignRootV7TrackerMaterial
  >;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly signedTrackerBytesPersisted: false;
    readonly deterministicSourceFinalityEstablished: false;
    readonly ergoPowAuthenticated: false;
    readonly profileActivated: false;
    readonly mintAuthorized: false;
    readonly trackerAdmissionEstablished: false;
    readonly globalReplayInsertionEstablished: false;
    readonly payoutAuthorized: false;
    readonly trackerSubmissionPerformed: false;
    readonly trackerBroadcastPerformed: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
  }>;
  readonly receiptDigestHex: string;
}

const RECEIPTS = new WeakMap<
  object,
  Readonly<FrozenObservedAnchorTrackerCheckCampaignRootV7ProvenanceMaterial>
>();

export function registerSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance(
  receipt: Readonly<
    FrozenObservedAnchorTrackerCheckCampaignRootV7ProvenanceReceipt
  >,
  material: Readonly<
    FrozenObservedAnchorTrackerCheckCampaignRootV7ProvenanceMaterial
  >,
): void {
  if (
    !Object.isFrozen(receipt)
    || !Object.isFrozen(material)
    || RECEIPTS.has(receipt)
  ) {
    throw new Error(
      'isolated devnet frozen tracker-check root V7 provenance registration is invalid',
    );
  }
  RECEIPTS.set(receipt, material);
}

export function assertSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance(
  value: unknown,
): asserts value is Readonly<
  FrozenObservedAnchorTrackerCheckCampaignRootV7ProvenanceReceipt
> {
  if (
    value === null
    || typeof value !== 'object'
    || !Object.isFrozen(value)
  ) {
    throw new Error(
      'isolated devnet frozen tracker-check root V7 lacks exact runtime provenance',
    );
  }
  const material = RECEIPTS.get(value);
  if (material === undefined) {
    throw new Error(
      'isolated devnet frozen tracker-check root V7 lacks exact runtime provenance',
    );
  }
  const receipt = value as Readonly<
    FrozenObservedAnchorTrackerCheckCampaignRootV7ProvenanceReceipt
  >;
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7_SCHEMA
    || receipt.version !== 7
    || receipt.status
      !== 'observed_anchor_tracker_candidate_accepted_by_frozen_local_node_check'
    || receipt.staticExecutionManifestDigestHex
      !== material.staticExecutionManifestDigestHex
    || receipt.application.applicationCheckpoint
      !== material.applicationCheckpoint
    || receipt.checkpointAnchor.observation
      !== material.checkpointAnchorObservation
    || receipt.tracker !== material.tracker
  ) {
    throw new Error(
      'isolated devnet frozen tracker-check root V7 binding changed',
    );
  }
  assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance(
    material.applicationCheckpoint,
  );
  assertSubstrateFederatedIsolatedDevnetCheckpointAnchorObservationV1(
    material.checkpointAnchorObservation,
  );
  assertSubstrateFederatedIsolatedDevnetCheckpointBoundTrackerObservationV2(
    material.tracker.observation,
  );
  assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2(
    material.tracker.check,
  );
  const { receiptDigestHex, ...body } = receipt;
  if (
    sha256CanonicalJson(
      body,
      PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_RECEIPT_DIGEST_DOMAIN,
    ) !== receiptDigestHex
  ) {
    throw new Error(
      'isolated devnet frozen tracker-check root V7 receipt changed',
    );
  }
}
