import { createHash } from 'crypto';

import {
  buildAuthenticatedSettlementPlan,
  type AggregateSettlementClaim,
} from './aggregate-settlement-builder.js';
import { buildAuthenticatedSettlementTx } from './aggregate-settlement-tx.js';
import { AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS } from './aggregate-settlement-limits.js';
import { encodeSigmaPropRegister, MINER_FEE_TREE } from './ergo-encoding.js';
import {
  AUTHENTICATED_V2_PROVISIONING_SCHEMA,
  buildAuthenticatedV2ProvisioningPlan,
  buildAuthenticatedV2TrackerAdmissionTransaction,
  type AuthenticatedV2ProvisioningInput,
  type AuthenticatedV2ProvisioningPlan,
  type ProvisioningAuthorizationBoundary,
} from './authenticated-v2-provisioning-plan.js';
import {
  buildAuthenticatedSpvAdmission,
  type AuthenticatedSpvAdmissionPlan,
} from './spv-tracker-authenticated.js';
import {
  materializeUnsignedTransaction,
  normalizeEip12Box,
  type Eip12Box,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

export const AUTHENTICATED_V2_ADMISSION_STAGE_SCHEMA =
  'e2s.authenticated-v2-confirmed-admission-plan.v3';
export const AUTHENTICATED_V2_SETTLEMENT_STAGE_SCHEMA =
  'e2s.authenticated-v2-confirmed-settlement-plan.v3';
export const AUTHENTICATED_V2_STATE_CONTEXT_HEADER_COUNT = 10;

const BOX_KEYS = [
  'boxId',
  'value',
  'ergoTree',
  'assets',
  'additionalRegisters',
  'creationHeight',
  'transactionId',
  'index',
];

export interface AuthenticatedV2HeaderSummary {
  idHex: string;
  parentIdHex: string;
  height: number;
  extensionRootHex: string;
}

export interface AuthenticatedV2ChainSnapshot {
  network: string;
  tipIdHex: string;
  tipHeight: number;
}

export interface AuthenticatedV2PredictedPreHeaderSummary {
  parentIdHex: string;
  height: number;
  derivation: 'node-simplified-upcoming';
}

export interface AuthenticatedV2FreshHeaderContext {
  snapshot: AuthenticatedV2ChainSnapshot;
  preHeader: AuthenticatedV2PredictedPreHeaderSummary;
  headers: AuthenticatedV2HeaderSummary[];
}

export interface AuthenticatedV2ConfirmedBoxObservation {
  box: Eip12Box;
  inclusionBlockIdHex: string;
  inclusionHeight: number;
  observedCanonicalAtHeight: true;
  observedUnspent: true;
  snapshot: AuthenticatedV2ChainSnapshot;
}

export interface AuthenticatedV2CanonicalAnchorObservation {
  idHex: string;
  height: number;
  extensionRootHex: string;
  observedCanonicalAtHeight: true;
  snapshot: AuthenticatedV2ChainSnapshot;
}

export interface NormalizedAuthenticatedV2ConfirmedBoxObservation
  extends AuthenticatedV2ConfirmedBoxObservation {
  transactionIdHex: string;
  confirmations: number;
  authority: 'operator-supplied-read-only-node-observation';
}

export interface BuildAuthenticatedV2AdmissionStageInput {
  provisioning: AuthenticatedV2ProvisioningInput;
  expectedProvisioningPackageDigestHex: string;
  trackerSetupObservation: AuthenticatedV2ConfirmedBoxObservation;
  admissionFeeObservation: AuthenticatedV2ConfirmedBoxObservation;
  stateContext: AuthenticatedV2FreshHeaderContext;
}

export interface AuthenticatedV2AdmissionStagePlan {
  schema: typeof AUTHENTICATED_V2_ADMISSION_STAGE_SCHEMA;
  stageDigestHex: string;
  provisioningSchema: typeof AUTHENTICATED_V2_PROVISIONING_SCHEMA;
  provisioningPackageDigestHex: string;
  environment: string;
  sidechainIdHex: string;
  stateContext: AuthenticatedV2FreshHeaderContext;
  snapshotDigestHex: string;
  stateContextDigestHex: string;
  observations: {
    trackerSetup: NormalizedAuthenticatedV2ConfirmedBoxObservation;
    admissionFee: NormalizedAuthenticatedV2ConfirmedBoxObservation;
  };
  admission: AuthenticatedSpvAdmissionPlan;
  operation: MaterializedUnsignedTransaction;
  predictedPopulatedTracker: Eip12Box;
  validity: {
    stateContextHeight: number;
    expiresAfterHeight: number;
    rebuildAfterTipChange: true;
  };
  authorization: ProvisioningAuthorizationBoundary;
  blockers: string[];
}

export interface BuildAuthenticatedV2SettlementStageInput {
  provisioning: AuthenticatedV2ProvisioningInput;
  expectedProvisioningPackageDigestHex: string;
  admissionStage: AuthenticatedV2AdmissionStagePlan;
  populatedTrackerObservation: AuthenticatedV2ConfirmedBoxObservation;
  duplicatePreventionObservation: AuthenticatedV2ConfirmedBoxObservation;
  settlementVaultObservation: AuthenticatedV2ConfirmedBoxObservation;
  stateContext: AuthenticatedV2FreshHeaderContext;
  anchorObservation: AuthenticatedV2CanonicalAnchorObservation;
}

export interface AuthenticatedV2SettlementStagePlan {
  schema: typeof AUTHENTICATED_V2_SETTLEMENT_STAGE_SCHEMA;
  stageDigestHex: string;
  provisioningSchema: typeof AUTHENTICATED_V2_PROVISIONING_SCHEMA;
  provisioningPackageDigestHex: string;
  admissionStageDigestHex: string;
  environment: string;
  sidechainIdHex: string;
  stateContext: AuthenticatedV2FreshHeaderContext;
  stateContextDigestHex: string;
  snapshot: AuthenticatedV2ChainSnapshot;
  snapshotDigestHex: string;
  anchor: {
    headerIdHex: string;
    height: number;
    depth: number;
    extensionRootHex: string;
  };
  observations: {
    populatedTracker: NormalizedAuthenticatedV2ConfirmedBoxObservation;
    duplicatePrevention: NormalizedAuthenticatedV2ConfirmedBoxObservation;
    settlementVault: NormalizedAuthenticatedV2ConfirmedBoxObservation;
  };
  operation: MaterializedUnsignedTransaction;
  predictedBoxes: {
    duplicatePreventionSuccessor: Eip12Box;
    settlementVaultSuccessor: Eip12Box | null;
  };
  settlement: {
    duplicatePreventionKeyHex: string;
    trackerKeyHex: string;
    trackerValueHex: string;
  };
  authorization: ProvisioningAuthorizationBoundary;
  blockers: string[];
}

export async function buildAuthenticatedV2AdmissionStagePlan(
  input: BuildAuthenticatedV2AdmissionStageInput,
): Promise<AuthenticatedV2AdmissionStagePlan> {
  assertExactKeys(input, [
    'provisioning',
    'expectedProvisioningPackageDigestHex',
    'trackerSetupObservation',
    'admissionFeeObservation',
    'stateContext',
  ], 'authenticated V2 admission stage input');
  const baseline = await rebuildProvisioningBaseline(
    input.provisioning,
    input.expectedProvisioningPackageDigestHex,
  );
  const stateContext = normalizeFreshHeaderContext(input.stateContext, baseline.environment);
  const snapshot = stateContext.snapshot;
  const expectedTrackerBox = baseline.operations.trackerSetupCandidate.outputs[0];
  const expectedAdmissionFeeBox = baseline.operations.trackerSetupCandidate.outputs[1];
  const trackerSetup = await normalizeConfirmedObservation(
    input.trackerSetupObservation,
    expectedTrackerBox,
    snapshot,
    'tracker setup observation',
  );
  const admissionFee = await normalizeConfirmedObservation(
    input.admissionFeeObservation,
    expectedAdmissionFeeBox,
    snapshot,
    'admission fee observation',
  );
  assertSameInclusion(trackerSetup, admissionFee, 'tracker setup observations');
  assertObservationInHeaderContext(trackerSetup, stateContext, 'tracker setup observation', true);
  assertObservationInHeaderContext(admissionFee, stateContext, 'admission fee observation', true);

  const anchorIdentity = input.provisioning.checkpoint.anchorHeader;
  const contextIndex = stateContext.headers.findIndex(header =>
    header.idHex === normalizeFixedHex(anchorIdentity.idHex, 32, 'anchor header id'),
  );
  if (contextIndex < 0) {
    throw new Error('authenticated V2 anchor header is absent from the fresh node-check header context');
  }
  const anchorHeader = stateContext.headers[contextIndex];
  if (anchorHeader.height !== anchorIdentity.height) {
    throw new Error('fresh header context anchor height does not match the provisioning anchor');
  }
  if (
    anchorHeader.extensionRootHex
    !== normalizeFixedHex(anchorIdentity.extensionRootHex, 32, 'anchor extension root')
  ) {
    throw new Error('fresh header context anchor extension root does not match the provisioning anchor');
  }

  const admission = buildAuthenticatedSpvAdmission({
    encodedCheckpointHex: input.provisioning.checkpoint.encodedCheckpointHex,
    aggregateFinalityCommitmentHex:
      input.provisioning.checkpoint.aggregateFinalityCommitmentHex,
    extensionProofHex: input.provisioning.checkpoint.extensionProofHex,
    anchorHeader: {
      ...anchorHeader,
      idHex: anchorHeader.idHex,
      contextIndex,
    },
    approvedSidechainIdHex: baseline.sidechainIdHex,
    history: [],
    currentCounter: 0,
    currentLatestSidechainHeight: 0,
    currentStampHeight: 0,
    currentErgoHeight: stateContext.preHeader.height,
    finalityAttestorSigmaPropRegisterHex: encodeSigmaPropRegister(
      normalizeFixedHex(
        input.provisioning.trackerFinalityAttestorPubKeyHex,
        33,
        'tracker finality attestor public key',
      ),
    ),
  });
  const operation = await buildAuthenticatedV2TrackerAdmissionTransaction({
    trackerBox: trackerSetup.box,
    feeBox: admissionFee.box,
    successorRegisters: admission.successorRegisters,
    contextExtension: admission.contextExtension,
    admissionFee: BigInt(String(input.provisioning.values.admissionFeeNanoErg)),
    creationHeight: snapshot.tipHeight,
  });
  const authorization = authorizationBoundary();
  const withoutDigest = {
    schema: AUTHENTICATED_V2_ADMISSION_STAGE_SCHEMA,
    provisioningSchema: AUTHENTICATED_V2_PROVISIONING_SCHEMA,
    provisioningPackageDigestHex: baseline.packageDigestHex,
    environment: baseline.environment,
    sidechainIdHex: baseline.sidechainIdHex,
    stateContext,
    snapshotDigestHex: sha256Canonical(snapshot),
    stateContextDigestHex: sha256Canonical(stateContext),
    observations: { trackerSetup, admissionFee },
    admission,
    operation,
    predictedPopulatedTracker: operation.outputs[0],
    validity: {
      stateContextHeight: stateContext.preHeader.height,
      expiresAfterHeight: snapshot.tipHeight,
      rebuildAfterTipChange: true as const,
    },
    authorization,
    blockers: [
      'box inclusion metadata is an operator-supplied read-only node observation, not a cryptographic proof',
      'resolved contract sources still require independent source-to-ErgoTree conformance',
      'the candidate expires when the mined tip or derived upcoming preheader changes',
      'no signing, JVM transaction check, submission, deployment, or broadcast occurred',
      'Ergo does not yet verify sidechain GRANDPA finality',
    ],
  };
  return deepFreeze({
    ...withoutDigest,
    stageDigestHex: sha256Canonical(withoutDigest),
  }) as AuthenticatedV2AdmissionStagePlan;
}

export async function buildAuthenticatedV2SettlementStagePlan(
  input: BuildAuthenticatedV2SettlementStageInput,
): Promise<AuthenticatedV2SettlementStagePlan> {
  assertExactKeys(input, [
    'provisioning',
    'expectedProvisioningPackageDigestHex',
    'admissionStage',
    'populatedTrackerObservation',
    'duplicatePreventionObservation',
    'settlementVaultObservation',
    'stateContext',
    'anchorObservation',
  ], 'authenticated V2 settlement stage input');
  const baseline = await rebuildProvisioningBaseline(
    input.provisioning,
    input.expectedProvisioningPackageDigestHex,
  );
  const stateContext = normalizeFreshHeaderContext(input.stateContext, baseline.environment);
  const snapshot = stateContext.snapshot;
  const rebuiltAdmission = await rebuildAdmissionStage(input.provisioning, baseline, input.admissionStage);
  const populatedTracker = await normalizeConfirmedObservation(
    input.populatedTrackerObservation,
    rebuiltAdmission.predictedPopulatedTracker,
    snapshot,
    'populated tracker observation',
  );
  const duplicatePrevention = await normalizeConfirmedObservation(
    input.duplicatePreventionObservation,
    baseline.predictedBoxes.duplicatePrevention,
    snapshot,
    'duplicate-prevention observation',
  );
  const settlementVault = await normalizeConfirmedObservation(
    input.settlementVaultObservation,
    baseline.predictedBoxes.settlementVault,
    snapshot,
    'settlement vault observation',
  );
  assertSameInclusion(
    duplicatePrevention,
    settlementVault,
    'DUP and settlement-vault setup observations',
  );
  assertDistinctBoxes([
    populatedTracker.box,
    duplicatePrevention.box,
    settlementVault.box,
  ], 'authenticated V2 settlement observations');
  assertObservationInHeaderContext(
    populatedTracker,
    stateContext,
    'populated tracker observation',
    false,
  );
  assertObservationInHeaderContext(
    duplicatePrevention,
    stateContext,
    'duplicate-prevention observation',
    false,
  );
  assertObservationInHeaderContext(
    settlementVault,
    stateContext,
    'settlement vault observation',
    false,
  );

  const anchorObservation = normalizeAnchorObservation(
    input.anchorObservation,
    snapshot,
    rebuiltAdmission.admission.anchorHeader,
  );
  const anchorHeight = anchorObservation.height;
  const anchorDepth = snapshot.tipHeight - anchorHeight;
  if (anchorDepth < AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS) {
    throw new Error(
      `authenticated V2 settlement requires ${AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS} Ergo anchor confirmations`,
    );
  }

  const settlementClaim: AggregateSettlementClaim = {
    pegOut: structuredClone(input.provisioning.settlement.pegOut),
    trackerIdentity: {
      sidechainIdHex: baseline.sidechainIdHex,
      sidechainHeight: BigInt(rebuiltAdmission.admission.sidechainHeight),
      sidechainHeaderHashHex: decodeExecutionHash(input.provisioning),
    },
    settlementIdentity: structuredClone(input.provisioning.settlement.settlementIdentity),
  };
  const settlementPlan = buildAuthenticatedSettlementPlan({
    spvHistory: [{
      key: rebuiltAdmission.admission.trackerKeyHex,
      value: rebuiltAdmission.admission.trackerValueHex,
    }],
    dupHistoryKeys: [],
    claim: settlementClaim,
  });
  const unsigned = buildAuthenticatedSettlementTx({
    deployed: {
      spvTrackerAuthenticated: {
        nftId: baseline.identities.trackerNftId,
        genesisBoxId: baseline.identities.trackerGenesisBoxId,
        boxId: populatedTracker.box.boxId,
        address: 'offline-stage-plan',
        ergoTreeHex: baseline.contracts.tracker.ergoTreeHex,
      },
      doubleUnlockPreventionAuthenticated: {
        nftId: baseline.identities.duplicatePreventionNftId,
        boxId: duplicatePrevention.box.boxId,
        address: 'offline-stage-plan',
        ergoTreeHex: baseline.contracts.duplicatePrevention.ergoTreeHex,
      },
      mainChainAggregateUnlockAuthenticated: {
        address: 'offline-stage-plan',
        ergoTreeHex: baseline.contracts.unlock.ergoTreeHex,
      },
    },
    plan: settlementPlan,
    trackerBox: populatedTracker.box,
    duplicatePreventionBox: duplicatePrevention.box,
    unlockBox: settlementVault.box,
    recipientErgoTreeHex: input.provisioning.settlement.recipientErgoTreeHex,
    creationHeight: snapshot.tipHeight,
  });
  const operation = await materializeUnsignedTransaction({
    inputs: unsigned.inputs.map((entry, index) => ({
      ...(index === 0 ? duplicatePrevention.box : settlementVault.box),
      extension: entry.extension,
    })),
    dataInputs: [populatedTracker.box],
    outputs: unsigned.outputs,
  }, 'authenticated V2 confirmed-state settlement');
  if (operation.outputs.length !== 3 && operation.outputs.length !== 4) {
    throw new Error('authenticated V2 settlement must contain payout, DUP successor, fee, and optional vault successor');
  }
  if (operation.outputs[0].ergoTree !== baseline.contracts.duplicatePrevention.ergoTreeHex) {
    throw new Error('authenticated V2 settlement output 0 must be the DUP successor');
  }
  if (
    operation.outputs[1].ergoTree
    !== normalizeFixedHex(
      input.provisioning.settlement.recipientErgoTreeHex,
      36,
      'settlement recipient ErgoTree',
    )
  ) {
    throw new Error('authenticated V2 settlement output 1 must be the proved recipient payout');
  }
  if (operation.outputs.at(-1)?.ergoTree !== MINER_FEE_TREE) {
    throw new Error('authenticated V2 settlement final output must be the miner fee');
  }
  const vaultSuccessor = operation.outputs.length === 4 ? operation.outputs[2] : null;
  if (vaultSuccessor && vaultSuccessor.ergoTree !== baseline.contracts.unlock.ergoTreeHex) {
    throw new Error('authenticated V2 settlement output 2 must be the settlement-vault successor');
  }
  const authorization = authorizationBoundary();
  const withoutDigest = {
    schema: AUTHENTICATED_V2_SETTLEMENT_STAGE_SCHEMA,
    provisioningSchema: AUTHENTICATED_V2_PROVISIONING_SCHEMA,
    provisioningPackageDigestHex: baseline.packageDigestHex,
    admissionStageDigestHex: rebuiltAdmission.stageDigestHex,
    environment: baseline.environment,
    sidechainIdHex: baseline.sidechainIdHex,
    stateContext,
    stateContextDigestHex: sha256Canonical(stateContext),
    snapshot,
    snapshotDigestHex: sha256Canonical(snapshot),
    anchor: {
      headerIdHex: anchorObservation.idHex,
      height: anchorHeight,
      depth: anchorDepth,
      extensionRootHex: anchorObservation.extensionRootHex,
    },
    observations: { populatedTracker, duplicatePrevention, settlementVault },
    operation,
    predictedBoxes: {
      duplicatePreventionSuccessor: operation.outputs[0],
      settlementVaultSuccessor: vaultSuccessor,
    },
    settlement: {
      duplicatePreventionKeyHex: settlementPlan.claims[0].duplicatePreventionKeyHex,
      trackerKeyHex: rebuiltAdmission.admission.trackerKeyHex,
      trackerValueHex: rebuiltAdmission.admission.trackerValueHex,
    },
    authorization,
    blockers: [
      'box inclusion metadata is an operator-supplied read-only node observation, not a cryptographic proof',
      'the native checkpoint and Frontier burn proof must be recollected and reverified before any JVM check',
      'the exact boxes must be refetched as unspent immediately before any JVM check',
      'no signing, JVM transaction check, submission, deployment, or broadcast occurred',
      'Ergo does not yet verify sidechain GRANDPA finality',
    ],
  };
  return deepFreeze({
    ...withoutDigest,
    stageDigestHex: sha256Canonical(withoutDigest),
  }) as AuthenticatedV2SettlementStagePlan;
}

async function rebuildProvisioningBaseline(
  provisioning: AuthenticatedV2ProvisioningInput,
  expectedDigestHex: string,
): Promise<AuthenticatedV2ProvisioningPlan> {
  const expected = normalizeFixedHex(
    expectedDigestHex,
    32,
    'expected provisioning package digest',
  );
  const baseline = await buildAuthenticatedV2ProvisioningPlan(provisioning);
  if (baseline.packageDigestHex !== expected) {
    throw new Error('authenticated V2 provisioning package digest does not match rebuilt baseline');
  }
  return baseline;
}

async function rebuildAdmissionStage(
  provisioning: AuthenticatedV2ProvisioningInput,
  baseline: AuthenticatedV2ProvisioningPlan,
  supplied: AuthenticatedV2AdmissionStagePlan,
): Promise<AuthenticatedV2AdmissionStagePlan> {
  if (!supplied || supplied.schema !== AUTHENTICATED_V2_ADMISSION_STAGE_SCHEMA) {
    throw new Error(`admission stage schema must be ${AUTHENTICATED_V2_ADMISSION_STAGE_SCHEMA}`);
  }
  if (!supplied.observations || !supplied.stateContext) {
    throw new Error('admission stage is missing deterministic rebuild inputs');
  }
  const { stageDigestHex, ...suppliedWithoutDigest } = supplied;
  const normalizedSuppliedDigest = normalizeFixedHex(
    stageDigestHex,
    32,
    'admission stage digest',
  );
  if (sha256Canonical(suppliedWithoutDigest) !== normalizedSuppliedDigest) {
    throw new Error('authenticated V2 admission stage content does not match its digest');
  }
  const rebuilt = await buildAuthenticatedV2AdmissionStagePlan({
    provisioning,
    expectedProvisioningPackageDigestHex: baseline.packageDigestHex,
    trackerSetupObservation: toConfirmedObservation(supplied.observations.trackerSetup),
    admissionFeeObservation: toConfirmedObservation(supplied.observations.admissionFee),
    stateContext: supplied.stateContext,
  });
  if (normalizedSuppliedDigest !== rebuilt.stageDigestHex) {
    throw new Error('authenticated V2 admission stage digest does not match deterministic rebuild');
  }
  return rebuilt;
}

function toConfirmedObservation(
  value: NormalizedAuthenticatedV2ConfirmedBoxObservation,
): AuthenticatedV2ConfirmedBoxObservation {
  return {
    box: value.box,
    inclusionBlockIdHex: value.inclusionBlockIdHex,
    inclusionHeight: value.inclusionHeight,
    observedCanonicalAtHeight: value.observedCanonicalAtHeight,
    observedUnspent: value.observedUnspent,
    snapshot: value.snapshot,
  };
}

async function normalizeConfirmedObservation(
  observation: AuthenticatedV2ConfirmedBoxObservation,
  expectedBox: Eip12Box,
  requiredSnapshot: AuthenticatedV2ChainSnapshot,
  label: string,
): Promise<NormalizedAuthenticatedV2ConfirmedBoxObservation> {
  assertExactKeys(observation, [
    'box',
    'inclusionBlockIdHex',
    'inclusionHeight',
    'observedCanonicalAtHeight',
    'observedUnspent',
    'snapshot',
  ], label);
  if (observation.observedCanonicalAtHeight !== true) {
    throw new Error(`${label} inclusion block must be observed canonical at its exact height`);
  }
  if (observation.observedUnspent !== true) {
    throw new Error(`${label} must be observed unspent`);
  }
  assertExactKeys(observation.box, BOX_KEYS, `${label}.box`);
  const box = await normalizeEip12Box(observation.box, `${label}.box`);
  const expected = await normalizeEip12Box(expectedBox, `${label}.expectedBox`);
  assertExactBox(box, expected, label);
  const inclusionHeight = positiveSafeInteger(observation.inclusionHeight, `${label}.inclusionHeight`);
  const snapshot = normalizeSnapshot(observation.snapshot, requiredSnapshot.network, `${label}.snapshot`);
  if (canonicalJson(snapshot) !== canonicalJson(requiredSnapshot)) {
    throw new Error(`${label} was not observed against the required canonical snapshot`);
  }
  if (inclusionHeight > snapshot.tipHeight) {
    throw new Error(`${label} inclusion height cannot exceed its observation height`);
  }
  if (inclusionHeight < box.creationHeight) {
    throw new Error(`${label} inclusion height cannot precede the box creationHeight`);
  }
  if (box.creationHeight > snapshot.tipHeight) {
    throw new Error(`${label} box creationHeight cannot exceed the observation tip`);
  }
  return {
    box,
    inclusionBlockIdHex: normalizeFixedHex(
      observation.inclusionBlockIdHex,
      32,
      `${label}.inclusionBlockIdHex`,
    ),
    inclusionHeight,
    observedCanonicalAtHeight: true,
    observedUnspent: true,
    snapshot,
    transactionIdHex: box.transactionId,
    confirmations: snapshot.tipHeight - inclusionHeight + 1,
    authority: 'operator-supplied-read-only-node-observation',
  };
}

function normalizeFreshHeaderContext(
  context: AuthenticatedV2FreshHeaderContext,
  expectedNetwork: string,
): AuthenticatedV2FreshHeaderContext {
  assertExactKeys(context, ['snapshot', 'preHeader', 'headers'], 'fresh header context');
  const snapshot = normalizeSnapshot(context.snapshot, expectedNetwork, 'fresh header context snapshot');
  if (!Array.isArray(context.headers)
    || context.headers.length !== AUTHENTICATED_V2_STATE_CONTEXT_HEADER_COUNT) {
    throw new Error(
      `fresh header context must contain exactly ${AUTHENTICATED_V2_STATE_CONTEXT_HEADER_COUNT} headers`,
    );
  }
  assertExactKeys(
    context.preHeader,
    ['parentIdHex', 'height', 'derivation'],
    'fresh header context preHeader',
  );
  const preHeader = {
    parentIdHex: normalizeFixedHex(
      context.preHeader.parentIdHex,
      32,
      'fresh header context preHeader.parentIdHex',
    ),
    height: positiveSafeInteger(context.preHeader.height, 'fresh header context preHeader.height'),
    derivation: context.preHeader.derivation,
  };
  if (preHeader.derivation !== 'node-simplified-upcoming') {
    throw new Error('fresh header context preHeader derivation is unsupported');
  }
  if (preHeader.parentIdHex !== snapshot.tipIdHex || preHeader.height !== snapshot.tipHeight + 1) {
    throw new Error('fresh header context preHeader must be the node upcoming context above the snapshot tip');
  }
  const ids = new Set<string>();
  const headers = context.headers.map((header, index) => {
    assertExactKeys(
      header,
      ['idHex', 'parentIdHex', 'height', 'extensionRootHex'],
      `fresh header context headers[${index}]`,
    );
    const normalized = {
      idHex: normalizeFixedHex(header.idHex, 32, `fresh header context headers[${index}].idHex`),
      parentIdHex: normalizeFixedHex(
        header.parentIdHex,
        32,
        `fresh header context headers[${index}].parentIdHex`,
      ),
      height: positiveSafeInteger(header.height, `fresh header context headers[${index}].height`),
      extensionRootHex: normalizeFixedHex(
        header.extensionRootHex,
        32,
        `fresh header context headers[${index}].extensionRootHex`,
      ),
    };
    if (normalized.height !== snapshot.tipHeight - index) {
      throw new Error('fresh header context must be ordered newest-first with contiguous heights');
    }
    if (ids.has(normalized.idHex)) {
      throw new Error('fresh header context must not contain duplicate header IDs');
    }
    ids.add(normalized.idHex);
    return normalized;
  });
  if (headers[0].idHex !== snapshot.tipIdHex) {
    throw new Error('fresh header context newest header must equal the snapshot tip');
  }
  for (let index = 0; index < headers.length - 1; index += 1) {
    if (headers[index].parentIdHex !== headers[index + 1].idHex) {
      throw new Error('fresh header context must be parent-linked newest-first');
    }
  }
  return { snapshot, preHeader, headers };
}

function normalizeSnapshot(
  value: AuthenticatedV2ChainSnapshot,
  expectedNetwork: string,
  label: string,
): AuthenticatedV2ChainSnapshot {
  assertExactKeys(value, ['network', 'tipIdHex', 'tipHeight'], label);
  const network = typeof value.network === 'string' ? value.network.trim().toLowerCase() : '';
  if (network.length === 0 || network !== expectedNetwork.trim().toLowerCase()) {
    throw new Error(`${label} network must match the provisioning environment`);
  }
  if (network === 'mainnet') {
    throw new Error(`${label} must not target mainnet`);
  }
  return {
    network,
    tipIdHex: normalizeFixedHex(value.tipIdHex, 32, `${label}.tipIdHex`),
    tipHeight: positiveSafeInteger(value.tipHeight, `${label}.tipHeight`),
  };
}

function normalizeAnchorObservation(
  value: AuthenticatedV2CanonicalAnchorObservation,
  snapshot: AuthenticatedV2ChainSnapshot,
  expected: AuthenticatedSpvAdmissionPlan['anchorHeader'],
): AuthenticatedV2CanonicalAnchorObservation {
  assertExactKeys(value, [
    'idHex',
    'height',
    'extensionRootHex',
    'observedCanonicalAtHeight',
    'snapshot',
  ], 'canonical anchor observation');
  if (value.observedCanonicalAtHeight !== true) {
    throw new Error('canonical anchor observation must be observed at its exact height');
  }
  const normalizedSnapshot = normalizeSnapshot(
    value.snapshot,
    snapshot.network,
    'canonical anchor observation snapshot',
  );
  if (canonicalJson(normalizedSnapshot) !== canonicalJson(snapshot)) {
    throw new Error('canonical anchor observation must use the settlement snapshot');
  }
  const normalized = {
    idHex: normalizeFixedHex(value.idHex, 32, 'canonical anchor observation id'),
    height: positiveSafeInteger(value.height, 'canonical anchor observation height'),
    extensionRootHex: normalizeFixedHex(
      value.extensionRootHex,
      32,
      'canonical anchor observation extension root',
    ),
    observedCanonicalAtHeight: true as const,
    snapshot: normalizedSnapshot,
  };
  if (normalized.idHex !== expected.idHex
    || normalized.height !== expected.height
    || normalized.extensionRootHex !== expected.extensionRootHex) {
    throw new Error('canonical anchor observation does not match the admitted tracker anchor');
  }
  return normalized;
}

function assertSameInclusion(
  left: NormalizedAuthenticatedV2ConfirmedBoxObservation,
  right: NormalizedAuthenticatedV2ConfirmedBoxObservation,
  label: string,
): void {
  if (
    left.transactionIdHex !== right.transactionIdHex
    || left.inclusionBlockIdHex !== right.inclusionBlockIdHex
    || left.inclusionHeight !== right.inclusionHeight
    || canonicalJson(left.snapshot) !== canonicalJson(right.snapshot)
  ) {
    throw new Error(`${label} must identify one confirmed source transaction and block`);
  }
}

function assertObservationInHeaderContext(
  observation: NormalizedAuthenticatedV2ConfirmedBoxObservation,
  context: AuthenticatedV2FreshHeaderContext,
  label: string,
  requireInContext: boolean,
): void {
  const contextIndex = context.snapshot.tipHeight - observation.inclusionHeight;
  if (contextIndex < 0 || contextIndex >= context.headers.length) {
    if (requireInContext) {
      throw new Error(`${label} inclusion height is outside the supplied canonical header context`);
    }
    return;
  }
  const header = context.headers[contextIndex];
  if (header.height !== observation.inclusionHeight
    || header.idHex !== observation.inclusionBlockIdHex) {
    throw new Error(`${label} inclusion block does not match the canonical header context`);
  }
}

function assertDistinctBoxes(boxes: Eip12Box[], label: string): void {
  const ids = new Set<string>();
  for (const box of boxes) {
    if (ids.has(box.boxId)) throw new Error(`${label} must contain distinct box IDs`);
    ids.add(box.boxId);
  }
}

function assertExactBox(actual: Eip12Box, expected: Eip12Box, label: string): void {
  for (const field of BOX_KEYS as Array<keyof Eip12Box>) {
    if (canonicalJson(actual[field]) !== canonicalJson(expected[field])) {
      throw new Error(`${label} box does not match the expected ${field}`);
    }
  }
}

function decodeExecutionHash(input: AuthenticatedV2ProvisioningInput): string {
  const encoded = normalizeFixedHex(
    input.checkpoint.encodedCheckpointHex,
    216,
    'encoded checkpoint',
  );
  return encoded.slice(76 * 2, 108 * 2);
}

function authorizationBoundary(): ProvisioningAuthorizationBoundary {
  return {
    execute: false,
    sign: false,
    check: false,
    submit: false,
    broadcast: false,
    deploy: false,
    gate5Closed: false,
    trustModel: 'proof-bound-attestor-authorized-finality',
  };
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function normalizeFixedHex(value: unknown, bytes: number, label: string): string {
  const clean = typeof value === 'string' && value.startsWith('0x') ? value.slice(2) : value;
  if (typeof clean !== 'string' || !/^[0-9a-fA-F]+$/.test(clean) || clean.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return clean.toLowerCase();
}

function assertExactKeys(value: unknown, expected: string[], label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exactly: ${wanted.join(', ')}`);
  }
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('stage plan cannot contain non-finite numbers');
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`stage plan cannot serialize ${typeof value}`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
