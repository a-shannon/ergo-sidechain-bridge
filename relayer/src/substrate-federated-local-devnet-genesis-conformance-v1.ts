import { createHash } from 'node:crypto';

import {
  getDupTreeDigest,
  getPooledReserveEmptyDigest,
} from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  MINER_FEE,
} from './ergo-encoding.js';
import { deriveUnsignedTransactionId } from './ergo-unsigned-transaction.js';
import {
  checkSignedTransaction,
  prepareLocalWasmRootCheckCandidates,
} from './fleet-signer.js';
import { ngetDirect } from './ergo-helpers.js';
import {
  deriveDevnetRewardErgoTreeHexForDelay,
} from './relayer-core/devnet-reward-consolidation.js';
import {
  getSubstrateFederatedTrackerDigestV1Hex,
} from './substrate-federated-burn-settlement-v1.js';
import {
  assertSubstrateFederatedGenesisObservationV1Provenance,
  observeSubstrateFederatedGenesisV1,
  type SubstrateFederatedGenesisObservationV1,
  type SubstrateFederatedGenesisTargetProfileV1,
} from './substrate-federated-genesis-observation-v1.js';
import {
  materializeSubstrateFederatedSingletonIssuanceV1,
} from './substrate-federated-genesis-issuance-materialization-v1.js';
import {
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  type SubstrateFederatedSettlementFamilyV1Template,
} from './substrate-federated-settlement-family-v1.js';
import {
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1,
  type SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1,
} from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import {
  assertSubstrateFederatedTrackerJvmCompilerReceiptV1,
  type SubstrateFederatedTrackerJvmCompilerReceiptV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import type {
  SubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import type {
  Eip12Box,
  MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
} from './validity-application-pooled-reserve-instance-v4.js';

export const SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFORMANCE_V1_SCHEMA =
  'e2s.substrate-federated-local-devnet-genesis-conformance.v1' as const;
export const SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CHECK_V1_SCHEMA =
  'e2s.substrate-federated-local-devnet-genesis-check.v1' as const;

const PLAN_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFORMANCE_V1';
const REPORT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CHECK_V1';
const STATE_BOX_VALUE = 10_000_000n;
const TRACKER_VALUE_BYTES = 370;
const DUP_VALUE_BYTES = 1;
const DEPOSIT_KEY_BYTES = 32;
const OBSERVATION_ATTEMPTS = 40;
const OBSERVATION_RETRY_MS = 250;
const ROLES = ['tracker', 'duplicatePrevention', 'pooledReserve'] as const;

type Role = typeof ROLES[number];
export type SubstrateFederatedLocalDevnetRewardDelayV1 = 1 | 720;
type TransactionRole =
  | 'trackerIssuance'
  | 'duplicatePreventionIssuance'
  | 'pooledReserveIssuance';

interface FamilyTemplates {
  readonly duplicatePrevention: SubstrateFederatedSettlementFamilyV1Template;
  readonly sourceLock: SubstrateFederatedSettlementFamilyV1Template;
  readonly pooledReserve: SubstrateFederatedSettlementFamilyV1Template;
}

export interface BuildSubstrateFederatedLocalDevnetGenesisConformanceV1Input {
  readonly rewardDelay: SubstrateFederatedLocalDevnetRewardDelayV1;
  readonly targetProfile: Readonly<SubstrateFederatedGenesisTargetProfileV1>;
  readonly observation: Readonly<SubstrateFederatedGenesisObservationV1>;
  readonly trackerRequest: Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
  readonly trackerReceipt: Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;
  readonly familyTemplates: Readonly<FamilyTemplates>;
  readonly familyReceipt:
    Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1>;
}

export interface SubstrateFederatedLocalDevnetGenesisConformanceV1Plan {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFORMANCE_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'local_devnet_unsigned_non_authorizing_candidate';
  readonly planDigestHex: string;
  readonly target: Readonly<{
    readonly environment: 'devnet' | 'patched-devnet';
    readonly network: 'devnet';
    readonly genesisHeaderIdHex: string;
    readonly observedTipHeight: number;
    readonly observedTipHeaderIdHex: string;
    readonly rewardDelay: SubstrateFederatedLocalDevnetRewardDelayV1;
  }>;
  readonly sourceBindings: Readonly<{
    readonly targetProfileDigestHex: string;
    readonly genesisObservationReportDigestHex: string;
    readonly trackerCompilerRequestDigestHex: string;
    readonly trackerCompilerReceiptDigestHex: string;
    readonly familyCompilerRequestDigestHex: string;
    readonly familyCompilerReceiptDigestHex: string;
  }>;
  readonly replay: Readonly<{
    readonly fixturePolicy: 'fresh-isolated-devnet-empty-history';
    readonly canonicalBurnIdCount: 0;
    readonly duplicatePreventionDigestHex: string;
    readonly trackerDigestHex: string;
    readonly depositDigestHex: string;
  }>;
  readonly transactions: Readonly<Record<TransactionRole, MaterializedUnsignedTransaction>>;
  readonly boxes: Readonly<Record<Role, Eip12Box>>;
  readonly checks: Readonly<{
    readonly exactDualOriginGenesisObservation: true;
    readonly pinnedTrackerJvmCompilation: true;
    readonly pinnedFamilyJvmCompilation: true;
    readonly exactObservedInputsConsumed: true;
    readonly singletonIdsEqualInputBoxIds: true;
    readonly emptyFixtureReplayOnly: true;
    readonly rewardDelayDigestBound: true;
    readonly unsignedConstructionOnly: true;
  }>;
  readonly boundaries: ReturnType<typeof falseBoundaries>;
}

export interface RunSubstrateFederatedLocalDevnetGenesisCheckV1Input {
  readonly mnemonic: string;
}

export interface SubstrateFederatedLocalDevnetGenesisCheckV1Report {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CHECK_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'PASS';
  readonly reportDigestHex: string;
  readonly planDigestHex: string;
  readonly signer: Readonly<{
    readonly derivation: 'wasm-root';
    readonly publicKeyHex: string;
    readonly rewardErgoTreeSha256Hex: string;
    readonly allGenesisInputsControlled: true;
  }>;
  readonly rewardDelay: SubstrateFederatedLocalDevnetRewardDelayV1;
  readonly checker: Readonly<{
    readonly nodeOrigin: string;
    readonly path: '/transactions/check';
    readonly method: 'POST';
    readonly transportPolicy: 'no-redirect-no-proxy';
  }>;
  readonly freshObservation: Readonly<{
    readonly reportDigestHex: string;
    readonly tipHeight: number;
    readonly tipHeaderIdHex: string;
    readonly exactGenesisInputsStillUnspent: true;
  }>;
  readonly stateContext: Readonly<{
    readonly tipHeight: number;
    readonly tipIdHex: string;
    readonly notOlderThanFreshObservation: true;
  }>;
  readonly postCheckObservation: Readonly<{
    readonly reportDigestHex: string;
    readonly tipHeight: number;
    readonly tipHeaderIdHex: string;
    readonly exactGenesisInputsStillUnspent: true;
    readonly tipDidNotRegress: true;
  }>;
  readonly checks: readonly Readonly<{
    readonly role: Role;
    readonly expectedUnsignedTransactionIdHex: string;
    readonly independentlyDerivedUnsignedTransactionIdHex: string;
    readonly signedTransactionIdHex: string;
    readonly signedTransactionCanonicalJsonSha256Hex: string;
    readonly nodeTransactionIdHex: string;
    readonly checkResponseSha256Hex: string;
    readonly status: 'PASS';
  }>[];
  readonly boundaries: Readonly<{
    readonly isolatedLoopbackDevnetOnly: true;
    readonly pinnedJvmCompilationReplayed: true;
    readonly signedBytesProducedInMemory: true;
    readonly signedBytesPersisted: false;
    readonly nodeCheckPerformed: true;
    readonly nodeCheckDoesNotSpendInputs: true;
    readonly publicTestnetFed6Closed: false;
    readonly registrationCandidateProduced: false;
    readonly singletonLineagesEstablished: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly profileActivated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

const plans = new WeakSet<object>();
const planSources = new WeakMap<object, Readonly<{
  targetProfile: Readonly<SubstrateFederatedGenesisTargetProfileV1>;
  observation: Readonly<SubstrateFederatedGenesisObservationV1>;
}>>();

export async function buildSubstrateFederatedLocalDevnetGenesisConformanceV1(
  input: Readonly<BuildSubstrateFederatedLocalDevnetGenesisConformanceV1Input>,
): Promise<Readonly<SubstrateFederatedLocalDevnetGenesisConformanceV1Plan>> {
  assertSubstrateFederatedGenesisObservationV1Provenance(
    input.targetProfile,
    input.observation,
  );
  assertSubstrateFederatedTrackerJvmCompilerReceiptV1(
    input.trackerReceipt,
    input.trackerRequest,
  );
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(
    input.familyReceipt,
    {
      trackerRequest: input.trackerRequest,
      trackerReceipt: input.trackerReceipt,
      templates: input.familyTemplates,
      duplicatePreventionGenesisInputBoxIdHex:
        input.observation.boxes.duplicatePrevention.box.boxId,
      pooledReserveGenesisInputBoxIdHex:
        input.observation.boxes.pooledReserve.box.boxId,
    },
  );
  assertDevnetScope(input.targetProfile, input.observation);
  const rewardDelay = localDevnetRewardDelay(input.rewardDelay);

  const family = decodeSubstrateFederatedSettlementFamilyV1Profile(
    input.familyReceipt.profile,
  );
  const genesisInputs = {
    tracker: input.observation.boxes.tracker.box,
    duplicatePrevention: input.observation.boxes.duplicatePrevention.box,
    pooledReserve: input.observation.boxes.pooledReserve.box,
  } as const;
  if (
    input.trackerRequest.trackerNftIdHex !== genesisInputs.tracker.boxId
    || family.trackerNftIdHex !== genesisInputs.tracker.boxId
    || family.duplicatePreventionNftIdHex !== genesisInputs.duplicatePrevention.boxId
    || family.pooledReserveNftIdHex !== genesisInputs.pooledReserve.boxId
    || family.trackerContractIdHex !== input.trackerReceipt.contract.contractIdHex
    || new Set(Object.values(genesisInputs).map(box => box.boxId)).size !== 3
  ) {
    throw new Error('local devnet compiler lineage does not match the observed genesis inputs');
  }

  const replay = deepFreeze({
    fixturePolicy: 'fresh-isolated-devnet-empty-history' as const,
    canonicalBurnIdCount: 0 as const,
    duplicatePreventionDigestHex: getDupTreeDigest([]),
    trackerDigestHex: getSubstrateFederatedTrackerDigestV1Hex([]),
    depositDigestHex: getPooledReserveEmptyDigest(),
  });
  const familyRegister = encodeCollByteRegister(
    Buffer.from(input.familyReceipt.profile.familyIdHex, 'hex'),
  );
  const creationHeight = input.observation.target.tipHeight;
  const trackerRegisters = {
    R4: encodeCollByteRegister(Buffer.from(input.trackerRequest.profile.profileIdHex, 'hex')),
    R5: encodeAvlTreeRegister(
      Buffer.from(replay.trackerDigestHex, 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
      TRACKER_VALUE_BYTES,
    ),
    R6: encodeCollByteRegister(Buffer.from(input.trackerRequest.application.sidechainIdHex, 'hex')),
    R7: encodeLongRegister(0n),
    R8: encodeIntRegister(0),
    R9: encodeCollByteRegister(
      Buffer.from(input.trackerRequest.profile.ergoAdmissionKeySetDigestHex, 'hex'),
    ),
  };
  const duplicatePreventionRegisters = {
    R4: familyRegister,
    R5: encodeAvlTreeRegister(
      Buffer.from(replay.duplicatePreventionDigestHex, 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
      DUP_VALUE_BYTES,
    ),
  };
  const pooledReserveRegisters = {
    R4: familyRegister,
    R5: encodeAvlTreeRegister(
      Buffer.from(replay.depositDigestHex, 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
      DEPOSIT_KEY_BYTES,
    ),
    R6: encodeLongRegister(0n),
  };
  const [trackerIssuance, duplicatePreventionIssuance, pooledReserveIssuance] =
    await Promise.all([
      materializeSubstrateFederatedSingletonIssuanceV1({
        label: 'local devnet federated tracker issuance',
        genesisInput: genesisInputs.tracker,
        expectedNftIdHex: family.trackerNftIdHex,
        propositionHex: input.trackerReceipt.contract.propositionHex,
        registers: trackerRegisters,
        singletonValue: STATE_BOX_VALUE,
        fee: BigInt(MINER_FEE),
        creationHeight,
      }),
      materializeSubstrateFederatedSingletonIssuanceV1({
        label: 'local devnet federated duplicate-prevention issuance',
        genesisInput: genesisInputs.duplicatePrevention,
        expectedNftIdHex: family.duplicatePreventionNftIdHex,
        propositionHex: input.familyReceipt.contracts.duplicatePrevention.propositionHex,
        registers: duplicatePreventionRegisters,
        singletonValue: STATE_BOX_VALUE,
        fee: BigInt(MINER_FEE),
        creationHeight,
      }),
      materializeSubstrateFederatedSingletonIssuanceV1({
        label: 'local devnet federated pooled-reserve issuance',
        genesisInput: genesisInputs.pooledReserve,
        expectedNftIdHex: family.pooledReserveNftIdHex,
        propositionHex: input.familyReceipt.contracts.pooledReserve.propositionHex,
        registers: pooledReserveRegisters,
        singletonValue: STATE_BOX_VALUE,
        fee: BigInt(MINER_FEE),
        creationHeight,
      }),
    ]);
  const transactions = deepFreeze({
    trackerIssuance,
    duplicatePreventionIssuance,
    pooledReserveIssuance,
  });
  const boxes = deepFreeze({
    tracker: trackerIssuance.outputs[0]!,
    duplicatePrevention: duplicatePreventionIssuance.outputs[0]!,
    pooledReserve: pooledReserveIssuance.outputs[0]!,
  });
  const binding = {
    schema: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFORMANCE_V1_SCHEMA,
    version: 1 as const,
    status: 'local_devnet_unsigned_non_authorizing_candidate' as const,
    target: {
      environment: input.targetProfile.environment as 'devnet' | 'patched-devnet',
      network: 'devnet' as const,
      genesisHeaderIdHex: input.observation.target.genesisHeaderIdHex,
      observedTipHeight: input.observation.target.tipHeight,
      observedTipHeaderIdHex: input.observation.target.tipHeaderIdHex,
      rewardDelay,
    },
    sourceBindings: {
      targetProfileDigestHex: input.targetProfile.profileDigestHex,
      genesisObservationReportDigestHex: input.observation.reportDigestHex,
      trackerCompilerRequestDigestHex: input.trackerRequest.requestDigestHex,
      trackerCompilerReceiptDigestHex: input.trackerReceipt.receiptDigestHex,
      familyCompilerRequestDigestHex: input.familyReceipt.familyCompilerRequestDigestHex,
      familyCompilerReceiptDigestHex: input.familyReceipt.receiptDigestHex,
    },
    replay,
    transactions,
    boxes,
    checks: {
      exactDualOriginGenesisObservation: true as const,
      pinnedTrackerJvmCompilation: true as const,
      pinnedFamilyJvmCompilation: true as const,
      exactObservedInputsConsumed: true as const,
      singletonIdsEqualInputBoxIds: true as const,
      emptyFixtureReplayOnly: true as const,
      rewardDelayDigestBound: true as const,
      unsignedConstructionOnly: true as const,
    },
    boundaries: falseBoundaries(),
  };
  const plan = deepFreeze({
    ...binding,
    planDigestHex: sha256CanonicalJson(binding, PLAN_DIGEST_DOMAIN),
  });
  plans.add(plan);
  planSources.set(plan, {
    targetProfile: input.targetProfile,
    observation: input.observation,
  });
  return plan;
}

export async function runSubstrateFederatedLocalDevnetGenesisCheckV1(
  plan: Readonly<SubstrateFederatedLocalDevnetGenesisConformanceV1Plan>,
  input: Readonly<RunSubstrateFederatedLocalDevnetGenesisCheckV1Input>,
): Promise<Readonly<SubstrateFederatedLocalDevnetGenesisCheckV1Report>> {
  assertPlanProvenance(plan);
  const mnemonic = input.mnemonic.trim();
  if (!mnemonic) {
    throw new Error('local devnet root signer mnemonic must not be empty');
  }
  const source = planSources.get(plan)!;
  const fresh = await observeWithRetry(source.targetProfile);
  assertSubstrateFederatedGenesisObservationV1Provenance(source.targetProfile, fresh);
  assertDevnetScope(source.targetProfile, fresh);
  assertSameGenesisBoxes(source.observation, fresh);

  const primaryOrigin = source.targetProfile.sources.primary.endpointOrigin;
  const headers = await ngetDirect('/blocks/lastHeaders/10', primaryOrigin);
  if (headers === null) {
    throw new Error('local devnet state-context header observation failed');
  }
  const candidates = transactionEntries(plan);
  const signer = await prepareLocalWasmRootCheckCandidates({
    mnemonic,
    networkPrefix: 16,
    headers,
    nodeOrigin: primaryOrigin,
    candidates: candidates.map(candidate => ({
      role: candidate.role,
      eip12Tx: candidate.transaction.eip12Tx,
      expectedTxId: candidate.transaction.txId,
    })),
  });
  const signerPublicKeyHex = normalizePublicKey(signer.pubKeyHex);
  const signerStateContextTipIdHex = normalizeId(
    signer.stateContextTipIdHex,
    'local devnet signer state-context tip ID',
  );
  const signerStateContextTipHeight = normalizeHeight(
    signer.stateContextTipHeight,
    'local devnet signer state-context tip height',
  );
  const rewardErgoTreeHex = deriveDevnetRewardErgoTreeHexForDelay(
    signerPublicKeyHex,
    plan.target.rewardDelay,
  );
  for (const role of ROLES) {
    if (fresh.boxes[role].box.ergoTree !== rewardErgoTreeHex) {
      throw new Error(`local devnet ${role} genesis input is not controlled by the root signer`);
    }
  }
  if (signerStateContextTipHeight < fresh.target.tipHeight) {
    throw new Error('local devnet signer context is older than the fresh genesis observation');
  }

  const independent = await Promise.all(candidates.map(async candidate => ({
    ...candidate,
    derivedId: normalizeId(
      await deriveUnsignedTransactionId(candidate.transaction.eip12Tx),
      `${candidate.role} independently derived transaction ID`,
    ),
  })));
  for (const candidate of independent) {
    if (candidate.derivedId !== candidate.transaction.txId) {
      throw new Error(`${candidate.role} independently derived transaction ID drifted`);
    }
  }
  if (signer.candidates.length !== independent.length) {
    throw new Error('local devnet signed-candidate cardinality drifted');
  }
  const accepted: Array<
    SubstrateFederatedLocalDevnetGenesisCheckV1Report['checks'][number]
  > = [];
  for (let index = 0; index < independent.length; index += 1) {
    const candidate = independent[index]!;
    const prepared = signer.candidates[index]!;
    if (
      prepared.role !== candidate.role
      || prepared.expectedTxId !== candidate.transaction.txId
    ) {
      throw new Error(`${candidate.role} local devnet signed-candidate identity drifted`);
    }
    const checked = await checkSignedTransaction(
      prepared.signedCandidate,
      `local devnet ${candidate.role} issuance`,
      primaryOrigin,
    );
    if (checked === null) {
      throw new Error(`${candidate.role} local devnet /transactions/check failed`);
    }
    if (
      checked.txId !== candidate.transaction.txId
      || checked.signedTransactionDigestHex
        !== prepared.signedCandidate.signedTransactionDigestHex
      || checked.checkerIdentity.nodeOrigin !== primaryOrigin
      || checked.checkerIdentity.path !== '/transactions/check'
      || checked.checkerIdentity.method !== 'POST'
      || checked.checkerIdentity.transportPolicy !== 'no-redirect-no-proxy'
    ) {
      throw new Error(`${candidate.role} local devnet node-check identity drifted`);
    }
    accepted.push({
      role: candidate.role,
      expectedUnsignedTransactionIdHex: candidate.transaction.txId,
      independentlyDerivedUnsignedTransactionIdHex: candidate.derivedId,
      signedTransactionIdHex: checked.txId,
      signedTransactionCanonicalJsonSha256Hex: normalizeId(
        checked.signedTransactionDigestHex,
        `${candidate.role} signed transaction canonical JSON digest`,
      ),
      nodeTransactionIdHex: checked.txId,
      checkResponseSha256Hex: sha256CanonicalJson(
        checked.checkResult,
        'E2S_LOCAL_DEVNET_NODE_CHECK_RESPONSE_V1',
      ),
      status: 'PASS' as const,
    });
  }
  const postCheck = await observeWithRetry(source.targetProfile);
  assertSubstrateFederatedGenesisObservationV1Provenance(
    source.targetProfile,
    postCheck,
  );
  assertDevnetScope(source.targetProfile, postCheck);
  assertSameGenesisBoxes(source.observation, postCheck);
  if (postCheck.target.tipHeight < fresh.target.tipHeight) {
    throw new Error('local devnet tip regressed during no-submit node checks');
  }
  const withoutDigest = {
    schema: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CHECK_V1_SCHEMA,
    version: 1 as const,
    status: 'PASS' as const,
    planDigestHex: plan.planDigestHex,
    signer: {
      derivation: 'wasm-root' as const,
      publicKeyHex: signerPublicKeyHex,
      rewardErgoTreeSha256Hex: sha256Hex(Buffer.from(rewardErgoTreeHex, 'hex')),
      allGenesisInputsControlled: true as const,
    },
    rewardDelay: plan.target.rewardDelay,
    checker: {
      nodeOrigin: primaryOrigin,
      path: '/transactions/check' as const,
      method: 'POST' as const,
      transportPolicy: 'no-redirect-no-proxy' as const,
    },
    freshObservation: {
      reportDigestHex: fresh.reportDigestHex,
      tipHeight: fresh.target.tipHeight,
      tipHeaderIdHex: fresh.target.tipHeaderIdHex,
      exactGenesisInputsStillUnspent: true as const,
    },
    stateContext: {
      tipHeight: signerStateContextTipHeight,
      tipIdHex: signerStateContextTipIdHex,
      notOlderThanFreshObservation: true as const,
    },
    postCheckObservation: {
      reportDigestHex: postCheck.reportDigestHex,
      tipHeight: postCheck.target.tipHeight,
      tipHeaderIdHex: postCheck.target.tipHeaderIdHex,
      exactGenesisInputsStillUnspent: true as const,
      tipDidNotRegress: true as const,
    },
    checks: accepted,
    boundaries: {
      isolatedLoopbackDevnetOnly: true as const,
      pinnedJvmCompilationReplayed: true as const,
      signedBytesProducedInMemory: true as const,
      signedBytesPersisted: false as const,
      nodeCheckPerformed: true as const,
      nodeCheckDoesNotSpendInputs: true as const,
      publicTestnetFed6Closed: false as const,
      registrationCandidateProduced: false as const,
      singletonLineagesEstablished: false as const,
      submissionPerformed: false as const,
      broadcastPerformed: false as const,
      profileActivated: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  return deepFreeze({
    ...withoutDigest,
    reportDigestHex: sha256CanonicalJson(withoutDigest, REPORT_DIGEST_DOMAIN),
  });
}

function transactionEntries(
  plan: Readonly<SubstrateFederatedLocalDevnetGenesisConformanceV1Plan>,
): readonly Readonly<{ role: Role; transaction: MaterializedUnsignedTransaction }>[] {
  return [
    { role: 'tracker', transaction: plan.transactions.trackerIssuance },
    {
      role: 'duplicatePrevention',
      transaction: plan.transactions.duplicatePreventionIssuance,
    },
    { role: 'pooledReserve', transaction: plan.transactions.pooledReserveIssuance },
  ];
}

async function observeWithRetry(
  profile: Readonly<SubstrateFederatedGenesisTargetProfileV1>,
): Promise<Readonly<SubstrateFederatedGenesisObservationV1>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= OBSERVATION_ATTEMPTS; attempt += 1) {
    try {
      return await observeSubstrateFederatedGenesisV1(profile);
    } catch (error) {
      lastError = error;
      if (attempt < OBSERVATION_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, OBSERVATION_RETRY_MS));
      }
    }
  }
  throw new Error(
    `dual-origin local devnet observation did not stabilize: ${String(lastError)}`,
  );
}

function assertPlanProvenance(
  plan: Readonly<SubstrateFederatedLocalDevnetGenesisConformanceV1Plan>,
): void {
  if (!plans.has(plan) || planSources.get(plan) === undefined) {
    throw new Error('local devnet genesis conformance plan lacks same-process provenance');
  }
  const { planDigestHex, ...withoutDigest } = plan;
  if (sha256CanonicalJson(withoutDigest, PLAN_DIGEST_DOMAIN) !== planDigestHex) {
    throw new Error('local devnet genesis conformance plan digest drifted');
  }
}

function assertDevnetScope(
  profile: Readonly<SubstrateFederatedGenesisTargetProfileV1>,
  observation: Readonly<SubstrateFederatedGenesisObservationV1>,
): void {
  if (
    !['devnet', 'patched-devnet'].includes(profile.environment)
    || profile.expectedNetwork !== 'devnet'
    || observation.target.network !== 'devnet'
    || observation.profile.environment !== profile.environment
  ) {
    throw new Error('local conformance requires the exact isolated devnet scope');
  }
  for (const origin of [profile.sources.primary.endpointOrigin, profile.sources.witness.endpointOrigin]) {
    const parsed = new URL(origin);
    if (
      parsed.protocol !== 'http:'
      || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname.toLowerCase())
      || parsed.username
      || parsed.password
    ) {
      throw new Error('local conformance requires credential-free loopback node origins');
    }
  }
}

function assertSameGenesisBoxes(
  first: Readonly<SubstrateFederatedGenesisObservationV1>,
  fresh: Readonly<SubstrateFederatedGenesisObservationV1>,
): void {
  for (const role of ROLES) {
    if (canonicalJson(first.boxes[role].box) !== canonicalJson(fresh.boxes[role].box)) {
      throw new Error(`local devnet ${role} genesis input changed before signing`);
    }
  }
}

function falseBoundaries() {
  return deepFreeze({
    publicTestnetScopeEstablished: false as const,
    sourceControlledTargetProfileApprovalAuthenticated: false as const,
    independentNodeAdministrationAuthenticated: false as const,
    targetNetworkConsensusAuthenticated: false as const,
    registrationCandidateProduced: false as const,
    nodeCheckPerformed: false as const,
    targetNodeAcceptanceEstablished: false as const,
    signingAuthorityEstablished: false as const,
    submissionAuthorityEstablished: false as const,
    broadcastAuthorityEstablished: false as const,
    singletonLineagesEstablished: false as const,
    profileActivated: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function localDevnetRewardDelay(
  value: unknown,
): SubstrateFederatedLocalDevnetRewardDelayV1 {
  if (value !== 1 && value !== 720) {
    throw new Error('local devnet reward delay must be exactly 1 or 720');
  }
  return value;
}

function normalizeId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be canonical lowercase 32-byte hex`);
  }
  return value;
}

function normalizePublicKey(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:02|03)[0-9a-f]{64}$/.test(value)) {
    throw new Error('local devnet signer public key must be canonical compressed secp256k1 hex');
  }
  return value;
}

function normalizeHeight(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
