import {
  AuthenticatedSpvTrackerReadOnlyNodeClient,
  normalizeAuthenticatedSpvTrackerNodeNetwork,
} from './authenticated-spv-tracker-read-only-node-client.js';
import {
  normalizeErgoNodeHeaderBytes,
} from './adapters/ergo-utxo-state-runtime-witness-capture-port-v1.js';
import {
  computeErgoHeaderId,
  parseErgoHeaderIdentity,
} from './ergo-settlement-core/ergo-header-id.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  deriveDevnetRewardErgoTreeHexForDelay,
} from './relayer-core/devnet-reward-consolidation.js';
import {
  MINER_FEE,
} from './ergo-encoding.js';
import {
  isSubstrateFederatedSingletonIssuanceFundingUsableV1,
} from './substrate-federated-genesis-issuance-materialization-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SINGLETON_VALUE_NANOERG,
} from './substrate-federated-isolated-devnet-generation-v1.js';
import {
  normalizeEip12Box,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_REWARD_INPUT_DISCOVERY_V1_SCHEMA =
  'e2s.substrate-federated-reward-input-discovery.v1' as const;
export const SUBSTRATE_FEDERATED_REWARD_INPUT_DISCOVERY_V2_SCHEMA =
  'e2s.substrate-federated-reward-input-discovery.v2' as const;
export const SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN =
  'http://127.0.0.1:9051' as const;
export const SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN =
  'http://127.0.0.1:9052' as const;

const GENESIS_HEADER_HEIGHT = 1;
const ADDRESS_BOX_PAGE_SIZE = 128;
const MAX_ADDRESS_BOX_COUNT = 4_096;
const REWARD_MATURITY_SAFETY_BLOCKS = 1;
const GENESIS_SINGLETON_VALUE = BigInt(
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SINGLETON_VALUE_NANOERG,
);
const GENESIS_ISSUANCE_FEE = BigInt(MINER_FEE);
const REPORT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_REWARD_INPUT_DISCOVERY_V1';
const REPORT_V2_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_REWARD_INPUT_DISCOVERY_V2';
const MAX_CANONICAL_EXTENSION_HEADERS = 4_096;
const REWARD_DELAYS = [1, 720] as const;
const DISCOVERIES = new WeakSet<object>();
const DISCOVERIES_V2 = new WeakSet<object>();

type RewardDelay = (typeof REWARD_DELAYS)[number];

export interface SubstrateFederatedRewardSignerBindingV1 {
  readonly publicKeyHex: string;
  readonly p2pkErgoTreeHex: string;
  readonly rewardInputErgoTrees: Readonly<{
    readonly delay1: string;
    readonly delay720: string;
  }>;
  readonly networkPrefix: 16;
}

export interface SubstrateFederatedRewardInputDiscoveryV1 {
  readonly schema: typeof SUBSTRATE_FEDERATED_REWARD_INPUT_DISCOVERY_V1_SCHEMA;
  readonly status: 'agreed_non_authorizing_reward_inputs';
  readonly reportDigestHex: string;
  readonly observedAt: string;
  readonly sources: Readonly<{
    readonly primaryNodeOrigin:
      typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
    readonly witnessNodeOrigin:
      typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  }>;
  readonly target: Readonly<{
    readonly network: 'devnet';
    readonly genesisHeaderHeight: 1;
    readonly genesisHeaderIdHex: string;
    readonly tipHeight: number;
    readonly tipHeaderIdHex: string;
  }>;
  readonly signer: Readonly<{
    readonly publicKeyHex: string;
    readonly p2pkErgoTreeHex: string;
    readonly rewardDelayBlocks: RewardDelay;
    readonly rewardInputErgoTreeHex: string;
    readonly rewardAddress: string;
  }>;
  readonly inventory: Readonly<{
    readonly observedRewardBoxCount: number;
    readonly matureRewardBoxCount: number;
    readonly usableRewardBoxCount: number;
    readonly requiredAgeBlocks: number;
  }>;
  readonly genesisBoxIds: Readonly<{
    readonly tracker: string;
    readonly duplicatePrevention: string;
    readonly pooledReserve: string;
  }>;
  readonly genesisInputs: Readonly<{
    readonly tracker: Readonly<Eip12Box>;
    readonly duplicatePrevention: Readonly<Eip12Box>;
    readonly pooledReserve: Readonly<Eip12Box>;
  }>;
  readonly boundary: Readonly<{
    readonly fixedDualLoopbackOrigins: true;
    readonly getOnlyNodeRequests: true;
    readonly exactPublicSignerBinding: true;
    readonly stableMatchingTargetSnapshot: true;
    readonly exactCanonicalBoxIdsRecomputed: true;
    readonly exactRewardTreeMatched: true;
    readonly pairwiseDistinctPureErgRegisterFreeInputs: true;
    readonly targetBinaryRevalidationRequired: true;
    readonly signerOrWalletMaterialRead: false;
    readonly sessionSignerProvenanceAuthenticated: false;
    readonly tipAndUtxoObservedAtomically: false;
    readonly nodeExecutableIdentityAuthenticated: false;
    readonly independentNodeControlVerified: false;
    readonly canonicalConsensusEstablished: false;
  }>;
  readonly authorization: Readonly<{
    readonly constructSetup: false;
    readonly check: false;
    readonly sign: false;
    readonly submit: false;
    readonly broadcast: false;
    readonly deploy: false;
    readonly activate: false;
    readonly fundsAuthority: false;
    readonly gate5Closed: false;
    readonly productionReady: false;
  }>;
}

export interface SubstrateFederatedRewardInputDiscoveryV2 {
  readonly schema: typeof SUBSTRATE_FEDERATED_REWARD_INPUT_DISCOVERY_V2_SCHEMA;
  readonly status: 'agreed_non_authorizing_snapshot_anchored_reward_inputs';
  readonly reportDigestHex: string;
  readonly observedAt: string;
  readonly sources: Readonly<{
    readonly primaryNodeOrigin:
      typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
    readonly witnessNodeOrigin:
      typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
  }>;
  readonly target: Readonly<{
    readonly network: 'devnet';
    readonly genesisHeaderHeight: 1;
    readonly genesisHeaderIdHex: string;
    readonly tipHeight: number;
    readonly tipHeaderIdHex: string;
  }>;
  readonly signer: SubstrateFederatedRewardInputDiscoveryV1['signer'];
  readonly inventory: Readonly<{
    readonly anchorRewardBoxCount: number;
    readonly matureRewardBoxCount: number;
    readonly usableRewardBoxCount: number;
    readonly requiredAgeBlocks: number;
  }>;
  readonly genesisBoxIds: SubstrateFederatedRewardInputDiscoveryV1['genesisBoxIds'];
  readonly genesisInputs: SubstrateFederatedRewardInputDiscoveryV1['genesisInputs'];
  readonly boundary: Readonly<{
    readonly fixedDualLoopbackOrigins: true;
    readonly getOnlyNodeRequests: true;
    readonly exactPublicSignerBinding: true;
    readonly matchingSnapshotAnchor: true;
    readonly canonicalExtensionBeyondAnchorAllowed: true;
    readonly discoveryAnchorRetained: true;
    readonly postAnchorRewardBoxesExcluded: true;
    readonly exactCanonicalBoxIdsRecomputed: true;
    readonly exactRewardTreeMatched: true;
    readonly pairwiseDistinctPureErgRegisterFreeInputs: true;
    readonly targetBinaryRevalidationRequired: true;
    readonly signerOrWalletMaterialRead: false;
    readonly sessionSignerProvenanceAuthenticated: false;
    readonly tipAndUtxoObservedAtomically: false;
    readonly nodeExecutableIdentityAuthenticated: false;
    readonly independentNodeControlVerified: false;
    readonly canonicalConsensusEstablished: false;
  }>;
  readonly authorization: SubstrateFederatedRewardInputDiscoveryV1['authorization'];
}

interface TargetSnapshot {
  readonly network: 'devnet';
  readonly genesisHeaderIdHex: string;
  readonly tipHeight: number;
  readonly tipHeaderIdHex: string;
}

interface RewardProfileObservation {
  readonly rewardDelayBlocks: RewardDelay;
  readonly rewardInputErgoTreeHex: string;
  readonly rewardAddress: string;
  readonly boxes: readonly Readonly<Eip12Box>[];
}

interface SnapshotBoundRewardBoxSet {
  readonly boxes: readonly Readonly<Eip12Box>[];
  readonly maxObservedCreationHeight: number;
}

interface SourceObservation {
  readonly snapshot: TargetSnapshot;
  readonly profiles: readonly RewardProfileObservation[];
}

/**
 * Selects three mature signer-owned reward inputs from one stopped, stable,
 * dual-loopback devnet. The result is packet-construction input, not authority.
 */
export async function discoverSubstrateFederatedRewardInputsV1(
  signerInput: Readonly<SubstrateFederatedRewardSignerBindingV1>,
): Promise<Readonly<SubstrateFederatedRewardInputDiscoveryV1>> {
  const signer = normalizeSigner(signerInput);
  const primary = new AuthenticatedSpvTrackerReadOnlyNodeClient(
    SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  );
  const witness = new AuthenticatedSpvTrackerReadOnlyNodeClient(
    SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  );
  const [primaryObservation, witnessObservation] = await Promise.all([
    observeSource(primary, signer),
    observeSource(witness, signer),
  ]);
  if (
    canonicalJson(primaryObservation)
    !== canonicalJson(witnessObservation)
  ) {
    throw new Error('fixed dual-loopback reward-input observations disagree');
  }

  const qualifying = primaryObservation.profiles.map(profile => {
    const requiredAgeBlocks = profile.rewardDelayBlocks
      + REWARD_MATURITY_SAFETY_BLOCKS;
    const mature = profile.boxes.filter(box =>
      box.creationHeight <= primaryObservation.snapshot.tipHeight
        - requiredAgeBlocks
    );
    const usable = mature.filter(box =>
      isSubstrateFederatedSingletonIssuanceFundingUsableV1(
        BigInt(box.value),
        GENESIS_SINGLETON_VALUE,
        GENESIS_ISSUANCE_FEE,
      ));
    return { profile, mature, usable, requiredAgeBlocks };
  }).filter(candidate => candidate.usable.length >= 3);
  if (qualifying.length !== 1) {
    throw new Error(
      qualifying.length === 0
        ? 'fixed dual-loopback target does not expose three usable mature signer reward inputs'
        : 'fixed dual-loopback target exposes ambiguous reward-delay input profiles',
    );
  }
  const selectedProfile = qualifying[0]!;
  const selected = [...selectedProfile.usable]
    .sort((left, right) => left.creationHeight - right.creationHeight
      || left.boxId.localeCompare(right.boxId))
    .slice(0, 3);
  if (new Set(selected.map(box => box.boxId)).size !== 3) {
    throw new Error('fixed dual-loopback reward input selection is not pairwise distinct');
  }
  const [tracker, duplicatePrevention, pooledReserve] = selected;
  const withoutDigest = {
    schema: SUBSTRATE_FEDERATED_REWARD_INPUT_DISCOVERY_V1_SCHEMA,
    status: 'agreed_non_authorizing_reward_inputs' as const,
    observedAt: new Date().toISOString(),
    sources: {
      primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
      witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
    },
    target: {
      ...primaryObservation.snapshot,
      genesisHeaderHeight: GENESIS_HEADER_HEIGHT as 1,
    },
    signer: {
      publicKeyHex: signer.publicKeyHex,
      p2pkErgoTreeHex: signer.p2pkErgoTreeHex,
      rewardDelayBlocks: selectedProfile.profile.rewardDelayBlocks,
      rewardInputErgoTreeHex:
        selectedProfile.profile.rewardInputErgoTreeHex,
      rewardAddress: selectedProfile.profile.rewardAddress,
    },
    inventory: {
      observedRewardBoxCount: selectedProfile.profile.boxes.length,
      matureRewardBoxCount: selectedProfile.mature.length,
      usableRewardBoxCount: selectedProfile.usable.length,
      requiredAgeBlocks: selectedProfile.requiredAgeBlocks,
    },
    genesisBoxIds: {
      tracker: tracker!.boxId,
      duplicatePrevention: duplicatePrevention!.boxId,
      pooledReserve: pooledReserve!.boxId,
    },
    genesisInputs: { tracker, duplicatePrevention, pooledReserve },
    boundary: {
      fixedDualLoopbackOrigins: true as const,
      getOnlyNodeRequests: true as const,
      exactPublicSignerBinding: true as const,
      stableMatchingTargetSnapshot: true as const,
      exactCanonicalBoxIdsRecomputed: true as const,
      exactRewardTreeMatched: true as const,
      pairwiseDistinctPureErgRegisterFreeInputs: true as const,
      targetBinaryRevalidationRequired: true as const,
      signerOrWalletMaterialRead: false as const,
      sessionSignerProvenanceAuthenticated: false as const,
      tipAndUtxoObservedAtomically: false as const,
      nodeExecutableIdentityAuthenticated: false as const,
      independentNodeControlVerified: false as const,
      canonicalConsensusEstablished: false as const,
    },
    authorization: {
      constructSetup: false as const,
      check: false as const,
      sign: false as const,
      submit: false as const,
      broadcast: false as const,
      deploy: false as const,
      activate: false as const,
      fundsAuthority: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  };
  const report = deepFreeze({
    ...withoutDigest,
    reportDigestHex: sha256CanonicalJson(withoutDigest, REPORT_DIGEST_DOMAIN),
  });
  DISCOVERIES.add(report);
  return report;
}

export function assertSubstrateFederatedRewardInputDiscoveryV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedRewardInputDiscoveryV1> {
  if (
    value === null
    || typeof value !== 'object'
    || !DISCOVERIES.has(value)
  ) {
    throw new Error(
      'reward-input discovery was not produced in this process',
    );
  }
  const report = value as SubstrateFederatedRewardInputDiscoveryV1;
  const { reportDigestHex, ...withoutDigest } = report;
  if (
    report.schema !== SUBSTRATE_FEDERATED_REWARD_INPUT_DISCOVERY_V1_SCHEMA
    || report.status !== 'agreed_non_authorizing_reward_inputs'
    || sha256CanonicalJson(withoutDigest, REPORT_DIGEST_DOMAIN)
      !== reportDigestHex
  ) {
    throw new Error('reward-input discovery content drifted');
  }
}

/**
 * Selects the same setup inputs as V1 while pinning one exact discovery
 * snapshot. Later blocks may extend that snapshot, but cannot replace it or
 * contribute reward boxes to the selected inventory.
 */
export async function discoverSubstrateFederatedRewardInputsV2(
  signerInput: Readonly<SubstrateFederatedRewardSignerBindingV1>,
): Promise<Readonly<SubstrateFederatedRewardInputDiscoveryV2>> {
  const signer = normalizeSigner(signerInput);
  const primary = new AuthenticatedSpvTrackerReadOnlyNodeClient(
    SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  );
  const witness = new AuthenticatedSpvTrackerReadOnlyNodeClient(
    SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  );
  const [primaryObservation, witnessObservation] = await Promise.all([
    observeSourceV2(primary, signer),
    observeSourceV2(witness, signer),
  ]);
  if (canonicalJson(primaryObservation) !== canonicalJson(witnessObservation)) {
    throw new Error(
      'fixed dual-loopback snapshot-anchored reward observations disagree',
    );
  }

  const qualifying = primaryObservation.profiles.map(profile => {
    const requiredAgeBlocks = profile.rewardDelayBlocks
      + REWARD_MATURITY_SAFETY_BLOCKS;
    const mature = profile.boxes.filter(box =>
      box.creationHeight <= primaryObservation.snapshot.tipHeight
        - requiredAgeBlocks
    );
    const usable = mature.filter(box =>
      isSubstrateFederatedSingletonIssuanceFundingUsableV1(
        BigInt(box.value),
        GENESIS_SINGLETON_VALUE,
        GENESIS_ISSUANCE_FEE,
      ));
    return { profile, mature, usable, requiredAgeBlocks };
  }).filter(candidate => candidate.usable.length >= 3);
  if (qualifying.length !== 1) {
    throw new Error(
      qualifying.length === 0
        ? 'snapshot anchor does not expose three usable mature signer reward inputs'
        : 'snapshot anchor exposes ambiguous reward-delay input profiles',
    );
  }
  const selectedProfile = qualifying[0]!;
  const selected = [...selectedProfile.usable]
    .sort((left, right) => left.creationHeight - right.creationHeight
      || left.boxId.localeCompare(right.boxId))
    .slice(0, 3);
  if (new Set(selected.map(box => box.boxId)).size !== 3) {
    throw new Error('snapshot-anchored reward input selection is not pairwise distinct');
  }
  const [tracker, duplicatePrevention, pooledReserve] = selected;
  const withoutDigest = {
    schema: SUBSTRATE_FEDERATED_REWARD_INPUT_DISCOVERY_V2_SCHEMA,
    status: 'agreed_non_authorizing_snapshot_anchored_reward_inputs' as const,
    observedAt: new Date().toISOString(),
    sources: {
      primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
      witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
    },
    target: {
      ...primaryObservation.snapshot,
      genesisHeaderHeight: GENESIS_HEADER_HEIGHT as 1,
    },
    signer: {
      publicKeyHex: signer.publicKeyHex,
      p2pkErgoTreeHex: signer.p2pkErgoTreeHex,
      rewardDelayBlocks: selectedProfile.profile.rewardDelayBlocks,
      rewardInputErgoTreeHex: selectedProfile.profile.rewardInputErgoTreeHex,
      rewardAddress: selectedProfile.profile.rewardAddress,
    },
    inventory: {
      anchorRewardBoxCount: selectedProfile.profile.boxes.length,
      matureRewardBoxCount: selectedProfile.mature.length,
      usableRewardBoxCount: selectedProfile.usable.length,
      requiredAgeBlocks: selectedProfile.requiredAgeBlocks,
    },
    genesisBoxIds: {
      tracker: tracker!.boxId,
      duplicatePrevention: duplicatePrevention!.boxId,
      pooledReserve: pooledReserve!.boxId,
    },
    genesisInputs: { tracker, duplicatePrevention, pooledReserve },
    boundary: {
      fixedDualLoopbackOrigins: true as const,
      getOnlyNodeRequests: true as const,
      exactPublicSignerBinding: true as const,
      matchingSnapshotAnchor: true as const,
      canonicalExtensionBeyondAnchorAllowed: true as const,
      discoveryAnchorRetained: true as const,
      postAnchorRewardBoxesExcluded: true as const,
      exactCanonicalBoxIdsRecomputed: true as const,
      exactRewardTreeMatched: true as const,
      pairwiseDistinctPureErgRegisterFreeInputs: true as const,
      targetBinaryRevalidationRequired: true as const,
      signerOrWalletMaterialRead: false as const,
      sessionSignerProvenanceAuthenticated: false as const,
      tipAndUtxoObservedAtomically: false as const,
      nodeExecutableIdentityAuthenticated: false as const,
      independentNodeControlVerified: false as const,
      canonicalConsensusEstablished: false as const,
    },
    authorization: {
      constructSetup: false as const,
      check: false as const,
      sign: false as const,
      submit: false as const,
      broadcast: false as const,
      deploy: false as const,
      activate: false as const,
      fundsAuthority: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  };
  const report = deepFreeze({
    ...withoutDigest,
    reportDigestHex: sha256CanonicalJson(
      withoutDigest,
      REPORT_V2_DIGEST_DOMAIN,
    ),
  });
  DISCOVERIES_V2.add(report);
  return report;
}

export function assertSubstrateFederatedRewardInputDiscoveryV2Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedRewardInputDiscoveryV2> {
  if (
    value === null
    || typeof value !== 'object'
    || !DISCOVERIES_V2.has(value)
  ) {
    throw new Error(
      'snapshot-anchored reward-input discovery was not produced in this process',
    );
  }
  const report = value as SubstrateFederatedRewardInputDiscoveryV2;
  const { reportDigestHex, ...withoutDigest } = report;
  if (
    report.schema !== SUBSTRATE_FEDERATED_REWARD_INPUT_DISCOVERY_V2_SCHEMA
    || report.status !== 'agreed_non_authorizing_snapshot_anchored_reward_inputs'
    || sha256CanonicalJson(withoutDigest, REPORT_V2_DIGEST_DOMAIN)
      !== reportDigestHex
  ) {
    throw new Error('snapshot-anchored reward-input discovery content drifted');
  }
}

async function observeSource(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  signer: Readonly<SubstrateFederatedRewardSignerBindingV1>,
): Promise<Readonly<SourceObservation>> {
  client.beginAuthenticatedTrackerReconstruction();
  try {
    return await observeSourceWithinBudget(client, signer);
  } finally {
    client.endAuthenticatedTrackerReconstruction();
  }
}

async function observeSourceWithinBudget(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  signer: Readonly<SubstrateFederatedRewardSignerBindingV1>,
): Promise<Readonly<SourceObservation>> {
  const before = await observeSnapshot(client);
  const profiles = await Promise.all(REWARD_DELAYS.map(async rewardDelayBlocks => {
    const rewardInputErgoTreeHex = rewardDelayBlocks === 1
      ? signer.rewardInputErgoTrees.delay1
      : signer.rewardInputErgoTrees.delay720;
    const rewardAddress = await client.getAddressForErgoTree(
      rewardInputErgoTreeHex,
    );
    const boxes = await readNormalizedRewardBoxSet(
      client,
      rewardAddress,
      rewardInputErgoTreeHex,
      before.tipHeight,
      rewardDelayBlocks,
    );
    const repeatedBoxes = await readNormalizedRewardBoxSet(
      client,
      rewardAddress,
      rewardInputErgoTreeHex,
      before.tipHeight,
      rewardDelayBlocks,
    );
    if (canonicalJson(boxes) !== canonicalJson(repeatedBoxes)) {
      throw new Error(
        `${rewardDelayBlocks}-block reward inventory changed during discovery`,
      );
    }
    if (new Set(boxes.map(box => box.boxId)).size !== boxes.length) {
      throw new Error(`${rewardDelayBlocks}-block reward box set contains duplicate IDs`);
    }
    return deepFreeze({
      rewardDelayBlocks,
      rewardInputErgoTreeHex,
      rewardAddress,
      boxes,
    });
  }));
  if (profiles[0]!.rewardAddress === profiles[1]!.rewardAddress) {
    throw new Error('reward-delay profiles resolved to the same address');
  }
  const after = await observeSnapshot(client);
  if (canonicalJson(before) !== canonicalJson(after)) {
    throw new Error('fixed reward-input target changed during discovery');
  }
  return deepFreeze({ snapshot: before, profiles });
}

async function readNormalizedRewardBoxSet(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  rewardAddress: string,
  rewardInputErgoTreeHex: string,
  tipHeight: number,
  rewardDelayBlocks: RewardDelay,
): Promise<Readonly<Eip12Box>[]> {
  const rawBoxes = await readCompleteAddressBoxSet(client, rewardAddress);
  const boxes = await Promise.all(rawBoxes.map((box, index) =>
    normalizeRewardBox(
      box,
      rewardInputErgoTreeHex,
      tipHeight,
      `${rewardDelayBlocks}-block reward box ${index}`,
    )));
  boxes.sort((left, right) => left.creationHeight - right.creationHeight
    || left.boxId.localeCompare(right.boxId));
  return boxes;
}

async function observeSourceV2(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  signer: Readonly<SubstrateFederatedRewardSignerBindingV1>,
): Promise<Readonly<SourceObservation>> {
  client.beginAuthenticatedTrackerReconstruction();
  try {
    return await observeSourceWithinBudgetV2(client, signer);
  } finally {
    client.endAuthenticatedTrackerReconstruction();
  }
}

async function observeSourceWithinBudgetV2(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  signer: Readonly<SubstrateFederatedRewardSignerBindingV1>,
): Promise<Readonly<SourceObservation>> {
  const before = await observeSnapshot(client);
  const sampledProfiles = await Promise.all(REWARD_DELAYS.map(async rewardDelayBlocks => {
    const rewardInputErgoTreeHex = rewardDelayBlocks === 1
      ? signer.rewardInputErgoTrees.delay1
      : signer.rewardInputErgoTrees.delay720;
    const rewardAddress = await client.getAddressForErgoTree(
      rewardInputErgoTreeHex,
    );
    const boxes = await readSnapshotBoundRewardBoxSet(
      client,
      rewardAddress,
      rewardInputErgoTreeHex,
      before.tipHeight,
      rewardDelayBlocks,
    );
    const repeatedBoxes = await readSnapshotBoundRewardBoxSet(
      client,
      rewardAddress,
      rewardInputErgoTreeHex,
      before.tipHeight,
      rewardDelayBlocks,
    );
    if (canonicalJson(boxes.boxes) !== canonicalJson(repeatedBoxes.boxes)) {
      throw new Error(
        `${rewardDelayBlocks}-block anchored reward inventory changed during discovery`,
      );
    }
    if (new Set(boxes.boxes.map(box => box.boxId)).size !== boxes.boxes.length) {
      throw new Error(`${rewardDelayBlocks}-block anchored reward set contains duplicate IDs`);
    }
    return deepFreeze({
      rewardDelayBlocks,
      rewardInputErgoTreeHex,
      rewardAddress,
      boxes: boxes.boxes,
      maxObservedCreationHeight: Math.max(
        boxes.maxObservedCreationHeight,
        repeatedBoxes.maxObservedCreationHeight,
      ),
    });
  }));
  const after = await observeSnapshot(client);
  for (const profile of sampledProfiles) {
    if (profile.maxObservedCreationHeight > after.tipHeight) {
      throw new Error(
        `${profile.rewardDelayBlocks}-block reward box creation height exceeds the observed target tip`,
      );
    }
  }
  await assertCanonicalSnapshotExtension(client, before, after);
  const profiles: readonly Readonly<RewardProfileObservation>[] =
    sampledProfiles.map(({ maxObservedCreationHeight: _, ...profile }) =>
      deepFreeze(profile));
  if (profiles[0]!.rewardAddress === profiles[1]!.rewardAddress) {
    throw new Error('reward-delay profiles resolved to the same address');
  }
  return deepFreeze({ snapshot: before, profiles });
}

async function readSnapshotBoundRewardBoxSet(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  rewardAddress: string,
  rewardInputErgoTreeHex: string,
  anchorHeight: number,
  rewardDelayBlocks: RewardDelay,
): Promise<Readonly<SnapshotBoundRewardBoxSet>> {
  const rawBoxes = await readCompleteAddressBoxSet(client, rewardAddress);
  const observedBoxes = await Promise.all(rawBoxes.map((box, index) =>
    normalizeRewardBox(
      box,
      rewardInputErgoTreeHex,
      undefined,
      `${rewardDelayBlocks}-block reward box ${index}`,
    )));
  const boxes = observedBoxes.filter(box => box.creationHeight <= anchorHeight);
  boxes.sort((left, right) => left.creationHeight - right.creationHeight
    || left.boxId.localeCompare(right.boxId));
  return deepFreeze({
    boxes,
    maxObservedCreationHeight: observedBoxes.reduce(
      (maximum, box) => Math.max(maximum, box.creationHeight),
      0,
    ),
  });
}

async function observeSnapshot(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
): Promise<TargetSnapshot> {
  const info = plainRecord(await client.getInfo(), 'fixed Ergo node info');
  const network = normalizeAuthenticatedSpvTrackerNodeNetwork(
    info.network ?? info.networkType,
    'fixed Ergo node',
  );
  if (network !== 'devnet') {
    throw new Error('fixed reward-input discovery requires the devnet network');
  }
  const tipHeight = nonnegativeSafeInteger(
    info.fullHeight,
    'fixed Ergo node full height',
  );
  const bestHeader = plainRecord(
    await client.getBestHeader(),
    'fixed Ergo best header',
  );
  if (
    nonnegativeSafeInteger(bestHeader.height, 'fixed Ergo best-header height')
    !== tipHeight
  ) {
    throw new Error('fixed Ergo node info and best-header heights disagree');
  }
  const tipHeaderIdHex = fixedHex32(
    bestHeader.id,
    'fixed Ergo best-header ID',
  );
  const genesisHeaderIds = await client.getBlockHeaderIdsAtHeight(
    GENESIS_HEADER_HEIGHT,
  );
  if (genesisHeaderIds.length !== 1) {
    throw new Error('fixed Ergo target must expose exactly one height-1 header');
  }
  return Object.freeze({
    network,
    genesisHeaderIdHex: fixedHex32(
      genesisHeaderIds[0],
      'fixed Ergo genesis header ID',
    ),
    tipHeight,
    tipHeaderIdHex,
  });
}

async function assertCanonicalSnapshotExtension(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  before: Readonly<TargetSnapshot>,
  after: Readonly<TargetSnapshot>,
): Promise<void> {
  if (
    after.network !== before.network
    || after.genesisHeaderIdHex !== before.genesisHeaderIdHex
    || after.tipHeight < before.tipHeight
  ) {
    throw new Error('fixed reward-input target changed during discovery');
  }
  if (after.tipHeight === before.tipHeight) {
    if (after.tipHeaderIdHex !== before.tipHeaderIdHex) {
      throw new Error('fixed reward-input target changed during discovery');
    }
    return;
  }
  const extensionLength = after.tipHeight - before.tipHeight;
  if (extensionLength > MAX_CANONICAL_EXTENSION_HEADERS) {
    throw new Error('reward-input canonical extension exceeds the header bound');
  }
  let expectedIdHex = after.tipHeaderIdHex;
  let expectedHeight = after.tipHeight;
  while (expectedHeight > before.tipHeight) {
    const raw = await client.getBlockHeaderById(expectedIdHex);
    if (raw === null) {
      throw new Error('reward-input canonical extension header is unavailable');
    }
    const canonicalBytes = normalizeErgoNodeHeaderBytes(raw);
    const header = parseErgoHeaderIdentity(canonicalBytes);
    const headerIdHex = computeErgoHeaderId(header).toString('hex');
    if (headerIdHex !== expectedIdHex || header.height !== expectedHeight) {
      throw new Error(
        'reward-input canonical extension header identity or height drifted',
      );
    }
    expectedIdHex = Buffer.from(header.parentId).toString('hex');
    expectedHeight -= 1;
  }
  if (expectedIdHex !== before.tipHeaderIdHex) {
    throw new Error('fixed reward-input target changed during discovery');
  }
}

async function readCompleteAddressBoxSet(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  address: string,
): Promise<readonly unknown[]> {
  const boxes: unknown[] = [];
  for (;;) {
    const remaining = MAX_ADDRESS_BOX_COUNT - boxes.length;
    if (remaining === 0) {
      const overflow = await client.getUnspentBoxesByAddressPage(address, {
        offset: boxes.length,
        limit: 1,
      });
      if (overflow.length !== 0) {
        throw new Error(
          `reward address exceeds the ${MAX_ADDRESS_BOX_COUNT}-box bound`,
        );
      }
      return boxes;
    }
    const limit = Math.min(ADDRESS_BOX_PAGE_SIZE, remaining);
    const page = await client.getUnspentBoxesByAddressPage(address, {
      offset: boxes.length,
      limit,
    });
    boxes.push(...page);
    if (page.length < limit) return boxes;
  }
}

async function normalizeRewardBox(
  value: unknown,
  expectedErgoTreeHex: string,
  maximumCreationHeight: number | undefined,
  label: string,
): Promise<Readonly<Eip12Box>> {
  const box = await normalizeEip12Box(value, label);
  if (box.ergoTree !== expectedErgoTreeHex) {
    throw new Error(`${label} does not use the exact signer reward ErgoTree`);
  }
  if (box.assets.length !== 0) {
    throw new Error(`${label} must contain pure ERG only`);
  }
  if (Object.keys(box.additionalRegisters).length !== 0) {
    throw new Error(`${label} must not contain additional registers`);
  }
  if (
    maximumCreationHeight !== undefined
    && box.creationHeight > maximumCreationHeight
  ) {
    throw new Error(`${label} creation height exceeds the stable target tip`);
  }
  if (BigInt(box.value) <= 0n) {
    throw new Error(`${label} value must be positive`);
  }
  return deepFreeze(box);
}

function normalizeSigner(
  value: Readonly<SubstrateFederatedRewardSignerBindingV1>,
): Readonly<SubstrateFederatedRewardSignerBindingV1> {
  const record = exactDataRecord(value, [
    'publicKeyHex',
    'p2pkErgoTreeHex',
    'rewardInputErgoTrees',
    'networkPrefix',
  ], 'reward-input signer binding');
  const rewardTrees = exactDataRecord(record.rewardInputErgoTrees, [
    'delay1',
    'delay720',
  ], 'reward-input signer trees');
  const publicKeyHex = fixedPublicKey(record.publicKeyHex);
  const p2pkErgoTreeHex = canonicalVariableHex(
    record.p2pkErgoTreeHex,
    'reward-input signer P2PK ErgoTree',
  );
  if (p2pkErgoTreeHex !== `0008cd${publicKeyHex}`) {
    throw new Error('reward-input signer P2PK ErgoTree does not match its public key');
  }
  const delay1 = canonicalVariableHex(
    rewardTrees.delay1,
    'one-block reward ErgoTree',
  );
  const delay720 = canonicalVariableHex(
    rewardTrees.delay720,
    '720-block reward ErgoTree',
  );
  if (
    delay1 !== deriveDevnetRewardErgoTreeHexForDelay(publicKeyHex, 1)
    || delay720 !== deriveDevnetRewardErgoTreeHexForDelay(publicKeyHex, 720)
  ) {
    throw new Error('reward-input signer trees do not match the public key');
  }
  if (record.networkPrefix !== 16) {
    throw new Error('reward-input signer network prefix must be devnet/testnet 16');
  }
  return deepFreeze({
    publicKeyHex,
    p2pkErgoTreeHex,
    rewardInputErgoTrees: { delay1, delay720 },
    networkPrefix: 16 as const,
  });
}

function exactDataRecord<K extends string>(
  value: unknown,
  keys: readonly K[],
  label: string,
): Readonly<Record<K, unknown>> {
  const record = plainRecord(value, label);
  const descriptors = Object.getOwnPropertyDescriptors(record);
  if (Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0')) {
    throw new Error(`${label} fields are invalid`);
  }
  const captured: Partial<Record<K, unknown>> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !('value' in descriptor)
    ) {
      throw new Error(`${label} ${key} must be an enumerable data property`);
    }
    captured[key] = descriptor.value;
  }
  return captured as Readonly<Record<K, unknown>>;
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function fixedPublicKey(value: unknown): string {
  if (typeof value !== 'string' || !/^(02|03)[0-9a-f]{64}$/.test(value)) {
    throw new Error('reward-input signer public key must be compressed lowercase hex');
  }
  return value;
}

function fixedHex32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be 32-byte lowercase hex`);
  }
  return value;
}

function canonicalVariableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be canonical lowercase hex`);
  }
  return value;
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
