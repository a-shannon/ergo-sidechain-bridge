import { createHash } from 'crypto';
import blakejs from 'blakejs';

import {
  resolveAuthenticatedV2ContractSources,
  type AuthenticatedV2ContractInputs,
  type ProvisioningContractBinding,
  type ResolvedAuthenticatedV2ContractSource,
} from './authenticated-v2-contract-sources.js';
import { AUTHENTICATED_V2_PROVISIONING_SCHEMA } from './authenticated-v2-provisioning-schema.js';
import {
  buildAuthenticatedSettlementPlan,
  type AggregateSettlementClaim,
  type SettlementIdentity,
} from './aggregate-settlement-builder.js';
import { buildAuthenticatedSettlementTx } from './aggregate-settlement-tx.js';
import { AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS } from './aggregate-settlement-limits.js';
import { getDupTreeDigest } from './avl-bridge.js';
import { decodeBridgeCheckpointV1 } from './bridge-checkpoint-commitment.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  encodeSigmaPropRegister,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  buildAuthenticatedSpvAdmission,
  type AuthenticatedSpvAnchorHeader,
  type AuthenticatedSpvAdmissionPlan,
} from './spv-tracker-authenticated.js';
import {
  materializeUnsignedTransaction,
  normalizeEip12Box,
  type Eip12Box,
  type Eip12UnsignedTransaction,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

export { AUTHENTICATED_V2_PROVISIONING_SCHEMA } from './authenticated-v2-provisioning-schema.js';
export const AUTHENTICATED_V2_PROVISIONING_MIN_BOX_VALUE = 1_000_000n;
export const AUTHENTICATED_V2_PROVISIONING_MIN_FEE = 1_000_000n;
export const AUTHENTICATED_V2_PROVISIONING_MAX_FEE = 2_100_000n;

const MAX_SIGNED_LONG = 0x7fff_ffff_ffff_ffffn;

export type {
  ProvisioningContractInput,
  ProvisioningContractBinding,
  ResolvedAuthenticatedV2ContractSource,
  ResolvedAuthenticatedV2ContractSources,
} from './authenticated-v2-contract-sources.js';

export interface AuthenticatedV2ProvisioningInput {
  environment: string;
  provenance: AuthenticatedV2ProvisioningProvenance;
  provisioningCreationHeight: number;
  settlementCreationHeight: number;
  sidechainIdHex: string;
  committeePubKeyHex: string;
  trackerFinalityAttestorPubKeyHex: string;
  trackerFundingBox: Eip12Box;
  dupVaultFundingBox: Eip12Box;
  contracts: AuthenticatedV2ContractInputs;
  values: {
    trackerSingletonNanoErg: string | number | bigint;
    duplicatePreventionSingletonNanoErg: string | number | bigint;
    vaultNanoErg: string | number | bigint;
    setupFeeNanoErg: string | number | bigint;
    admissionFeeNanoErg: string | number | bigint;
  };
  vault: {
    depositIdHex: string;
    depositorIdentityHex: string;
    provenanceHex: string;
  };
  checkpoint: {
    encodedCheckpointHex: string;
    aggregateFinalityCommitmentHex: string;
    extensionProofHex: string;
    anchorHeader: AuthenticatedSpvAnchorHeader;
  };
  settlement: {
    pegOut: AggregateSettlementClaim['pegOut'];
    settlementIdentity: SettlementIdentity;
    recipientErgoTreeHex: string;
  };
}

export interface AuthenticatedV2ProvisioningProvenance {
  fundingObservation: {
    reportDigestHex: string;
    snapshotDigestHex: string;
    observedAt: string;
    nodeNetwork: string;
    tipHeight: number;
    tipIdHex: string;
  };
  initialBinding: {
    reportDigestHex: string;
    inputDigestHex: string;
  };
  revalidationRequiredBeforeSetup: true;
}

export interface ProvisioningAuthorizationBoundary {
  execute: false;
  sign: false;
  check: false;
  submit: false;
  broadcast: false;
  deploy: false;
  gate5Closed: false;
  trustModel: 'proof-bound-attestor-authorized-finality';
}

export interface AuthenticatedV2ProvisioningPlan {
  schema: typeof AUTHENTICATED_V2_PROVISIONING_SCHEMA;
  packageDigestHex: string;
  environment: string;
  provenance: AuthenticatedV2ProvisioningProvenance;
  sidechainIdHex: string;
  creationHeights: {
    provisioning: number;
    settlementPreview: number;
  };
  identities: {
    trackerNftId: string;
    trackerGenesisBoxId: string;
    duplicatePreventionNftId: string;
    authenticatedUnlockErgoTreeHashHex: string;
  };
  authorities: {
    bridgeCommitteePubKeyHex: string;
    trackerFinalityAttestorPubKeyHex: string;
    exactSigmaPropositionsSeparated: true;
    organizationalIndependenceVerified: false;
  };
  contracts: {
    tracker: ProvisioningContractBinding;
    unlock: ProvisioningContractBinding;
    duplicatePrevention: ProvisioningContractBinding;
  };
  contractVerification: {
    sourceToTree: 'unverified';
    requiredBeforeExecution: true;
  };
  stages: {
    setup: {
      status: 'unsigned-candidates';
      rebuildRequired: false;
      prerequisites: string[];
    };
    admission: {
      status: 'tip-bound-preview';
      stateContextHeight: number;
      expiresAfterHeight: number;
      rebuildRequired: true;
      prerequisites: string[];
    };
    settlement: {
      status: 'predicted-descendant-preview';
      rebuildRequired: true;
      prerequisites: string[];
    };
  };
  admissionPreview: AuthenticatedSpvAdmissionPlan;
  operations: {
    trackerSetupCandidate: MaterializedUnsignedTransaction;
    duplicatePreventionAndVaultSetupCandidate: MaterializedUnsignedTransaction;
    trackerAdmissionTipBoundPreview: MaterializedUnsignedTransaction;
    settlementPredictedPreview: MaterializedUnsignedTransaction;
  };
  predictedBoxes: {
    populatedTracker: Eip12Box;
    duplicatePrevention: Eip12Box;
    settlementVault: Eip12Box;
  };
  settlement: {
    predictedTxId: string;
    duplicatePreventionKeyHex: string;
    trackerKeyHex: string;
    trackerValueHex: string;
  };
  authorization: ProvisioningAuthorizationBoundary;
  blockers: string[];
}

interface NormalizedValues {
  trackerSingleton: bigint;
  duplicatePreventionSingleton: bigint;
  vault: bigint;
  setupFee: bigint;
  admissionFee: bigint;
}

export interface AuthenticatedV2ProvisioningFundingAssessment {
  tracker: {
    components: {
      singletonNanoErg: string;
      setupFeeNanoErg: string;
      admissionFeeNanoErg: string;
      minimumChangeNanoErg: string;
    };
    availableNanoErg: string;
    requiredNanoErg: string;
    surplusNanoErg: string;
    shortfallNanoErg: string;
    sufficient: boolean;
  };
  duplicatePreventionAndVault: {
    components: {
      singletonNanoErg: string;
      vaultNanoErg: string;
      setupFeeNanoErg: string;
      minimumChangeNanoErg: string;
    };
    availableNanoErg: string;
    requiredNanoErg: string;
    surplusNanoErg: string;
    shortfallNanoErg: string;
    sufficient: boolean;
  };
  allSufficient: boolean;
}

export function assessAuthenticatedV2ProvisioningFunding(input: {
  trackerFundingNanoErg: string | number | bigint;
  dupVaultFundingNanoErg: string | number | bigint;
  values: AuthenticatedV2ProvisioningInput['values'];
}): AuthenticatedV2ProvisioningFundingAssessment {
  return assessProvisioningFundingFromNormalized(
    positiveLong(input.trackerFundingNanoErg, 'tracker funding nanoERG'),
    positiveLong(input.dupVaultFundingNanoErg, 'DUP/vault funding nanoERG'),
    normalizeValues(input.values),
  );
}

export async function buildAuthenticatedV2ProvisioningPlan(
  input: AuthenticatedV2ProvisioningInput,
): Promise<AuthenticatedV2ProvisioningPlan> {
  const environment = normalizeNonMainnetEnvironment(input.environment);
  const provenance = normalizeProvisioningProvenance(input.provenance);
  const provisioningCreationHeight = positiveSafeInteger(
    input.provisioningCreationHeight,
    'provisioningCreationHeight',
  );
  if (provisioningCreationHeight === Number.MAX_SAFE_INTEGER) {
    throw new Error('provisioningCreationHeight cannot derive an exact H+1 admission context');
  }
  const admissionStateContextHeight = provisioningCreationHeight + 1;
  const settlementCreationHeight = positiveSafeInteger(
    input.settlementCreationHeight,
    'settlementCreationHeight',
  );
  if (settlementCreationHeight < provisioningCreationHeight) {
    throw new Error('settlementCreationHeight cannot precede provisioningCreationHeight');
  }
  const sidechainIdHex = fixedHex(input.sidechainIdHex, 32, 'sidechainIdHex');
  const committeePubKeyHex = fixedHex(input.committeePubKeyHex, 33, 'committeePubKeyHex');
  const trackerFinalityAttestorPubKeyHex = fixedHex(
    input.trackerFinalityAttestorPubKeyHex,
    33,
    'trackerFinalityAttestorPubKeyHex',
  );
  if (trackerFinalityAttestorPubKeyHex === committeePubKeyHex) {
    throw new Error('tracker finality attestor key must be distinct from the bridge committee key');
  }
  const committeeSigmaPropRegisterHex = encodeSigmaPropRegister(committeePubKeyHex);
  const finalityAttestorSigmaPropRegisterHex = encodeSigmaPropRegister(
    trackerFinalityAttestorPubKeyHex,
  );
  const values = normalizeValues(input.values);

  const [trackerFundingBox, dupVaultFundingBox] = await Promise.all([
    normalizePureErgFundingBox(input.trackerFundingBox, 'tracker funding box'),
    normalizePureErgFundingBox(input.dupVaultFundingBox, 'DUP/vault funding box'),
  ]);
  if (trackerFundingBox.boxId === dupVaultFundingBox.boxId) {
    throw new Error('tracker and DUP/vault funding boxes must be distinct');
  }
  const fundingAssessment = assessProvisioningFundingFromNormalized(
    BigInt(trackerFundingBox.value),
    BigInt(dupVaultFundingBox.value),
    values,
  );
  if (!fundingAssessment.tracker.sufficient) {
    throw new Error('tracker funding box does not leave a valid admission fee/change input');
  }
  if (!fundingAssessment.duplicatePreventionAndVault.sufficient) {
    throw new Error('DUP/vault funding box does not leave a valid change output');
  }

  const trackerNftId = trackerFundingBox.boxId;
  const duplicatePreventionNftId = dupVaultFundingBox.boxId;
  const contracts = resolveContractBindings(
    input.contracts,
    trackerNftId,
    duplicatePreventionNftId,
  );
  const checkpoint = decodeBridgeCheckpointV1(
    Buffer.from(variableHex(input.checkpoint.encodedCheckpointHex, 'encodedCheckpointHex'), 'hex'),
  );
  if (checkpoint.sidechainIdHex !== sidechainIdHex) {
    throw new Error('checkpoint sidechain ID does not match the provisioning sidechain ID');
  }
  const admission = buildAuthenticatedSpvAdmission({
    encodedCheckpointHex: input.checkpoint.encodedCheckpointHex,
    aggregateFinalityCommitmentHex: input.checkpoint.aggregateFinalityCommitmentHex,
    extensionProofHex: input.checkpoint.extensionProofHex,
    anchorHeader: input.checkpoint.anchorHeader,
    approvedSidechainIdHex: sidechainIdHex,
    history: [],
    currentCounter: 0,
    currentLatestSidechainHeight: 0,
    currentStampHeight: 0,
    currentErgoHeight: provisioningCreationHeight,
    finalityAttestorSigmaPropRegisterHex,
  });

  const trackerSetup = await buildTrackerSetup({
    fundingBox: trackerFundingBox,
    trackerErgoTreeHex: contracts.tracker.ergoTreeHex,
    trackerNftId,
    registers: admission.inputRegisters,
    trackerValue: values.trackerSingleton,
    setupFee: values.setupFee,
    admissionFee: values.admissionFee,
    creationHeight: provisioningCreationHeight,
  });
  const trackerSetupBox = trackerSetup.outputs[0];
  const admissionFundingBox = trackerSetup.outputs[1];

  const duplicatePreventionAndVaultSetup = await buildDuplicatePreventionAndVaultSetup({
    fundingBox: dupVaultFundingBox,
    duplicatePreventionErgoTreeHex: contracts.duplicatePrevention.ergoTreeHex,
    unlockErgoTreeHex: contracts.unlock.ergoTreeHex,
    duplicatePreventionNftId,
    committeeSigmaPropRegisterHex,
    duplicatePreventionValue: values.duplicatePreventionSingleton,
    vaultValue: values.vault,
    setupFee: values.setupFee,
    creationHeight: provisioningCreationHeight,
    vault: input.vault,
  });
  const duplicatePreventionBox = duplicatePreventionAndVaultSetup.outputs[0];
  const settlementVault = duplicatePreventionAndVaultSetup.outputs[1];

  const trackerAdmission = await buildAuthenticatedV2TrackerAdmissionTransaction({
    trackerBox: trackerSetupBox,
    feeBox: admissionFundingBox,
    successorRegisters: admission.successorRegisters,
    contextExtension: admission.contextExtension,
    admissionFee: values.admissionFee,
    creationHeight: provisioningCreationHeight,
  });
  const populatedTracker = trackerAdmission.outputs[0];

  const settlementIdentity = normalizeSettlementIdentityInput(input.settlement.settlementIdentity);
  if (
    settlementCreationHeight - admission.anchorHeader.height
    < AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS
  ) {
    throw new Error(
      `authenticated V2 settlement preview requires ${AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS} anchor confirmations`,
    );
  }
  const recipientErgoTreeHex = fixedHex(
    input.settlement.recipientErgoTreeHex,
    36,
    'settlement recipient ErgoTree',
  );
  if (
    settlementIdentity.recipientErgoTreeHashHex
    !== blake2b256Hex(Buffer.from(recipientErgoTreeHex, 'hex'))
  ) {
    throw new Error('settlement recipient ErgoTree does not match the proved recipient hash');
  }
  const settlementClaim: AggregateSettlementClaim = {
    pegOut: normalizePegOut(input.settlement.pegOut),
    trackerIdentity: {
      sidechainIdHex,
      sidechainHeight: BigInt(admission.sidechainHeight),
      sidechainHeaderHashHex: checkpoint.executionBlockHashHex,
    },
    settlementIdentity,
  };
  const settlementPlan = buildAuthenticatedSettlementPlan({
    spvHistory: [{ key: admission.trackerKeyHex, value: admission.trackerValueHex }],
    dupHistoryKeys: [],
    claim: settlementClaim,
  });
  const settlementUnsigned = buildAuthenticatedSettlementTx({
    deployed: {
      spvTrackerAuthenticated: {
        nftId: trackerNftId,
        genesisBoxId: trackerSetupBox.boxId,
        boxId: populatedTracker.boxId,
        address: 'offline-plan',
        ergoTreeHex: contracts.tracker.ergoTreeHex,
      },
      doubleUnlockPreventionAuthenticated: {
        nftId: duplicatePreventionNftId,
        boxId: duplicatePreventionBox.boxId,
        address: 'offline-plan',
        ergoTreeHex: contracts.duplicatePrevention.ergoTreeHex,
      },
      mainChainAggregateUnlockAuthenticated: {
        address: 'offline-plan',
        ergoTreeHex: contracts.unlock.ergoTreeHex,
      },
    },
    plan: settlementPlan,
    trackerBox: populatedTracker,
    duplicatePreventionBox,
    unlockBox: settlementVault,
    recipientErgoTreeHex,
    creationHeight: settlementCreationHeight,
  });
  const settlementPreview = await materializeUnsignedTransaction({
    inputs: settlementUnsigned.inputs.map((unsignedInput, index) => ({
      ...(index === 0 ? duplicatePreventionBox : settlementVault),
      extension: unsignedInput.extension,
    })),
    dataInputs: [populatedTracker],
    outputs: settlementUnsigned.outputs,
  }, 'authenticated V2 settlement preview');

  const authorization: ProvisioningAuthorizationBoundary = {
    execute: false,
    sign: false,
    check: false,
    submit: false,
    broadcast: false,
    deploy: false,
    gate5Closed: false,
    trustModel: 'proof-bound-attestor-authorized-finality',
  };
  const withoutDigest = {
    schema: AUTHENTICATED_V2_PROVISIONING_SCHEMA,
    environment,
    provenance,
    sidechainIdHex,
    creationHeights: {
      provisioning: provisioningCreationHeight,
      settlementPreview: settlementCreationHeight,
    },
    identities: {
      trackerNftId,
      trackerGenesisBoxId: trackerSetupBox.boxId,
      duplicatePreventionNftId,
      authenticatedUnlockErgoTreeHashHex: contracts.unlockErgoTreeHashHex,
    },
    authorities: {
      bridgeCommitteePubKeyHex: committeePubKeyHex,
      trackerFinalityAttestorPubKeyHex,
      exactSigmaPropositionsSeparated: true as const,
      organizationalIndependenceVerified: false as const,
    },
    contracts: {
      tracker: contracts.tracker,
      unlock: contracts.unlock,
      duplicatePrevention: contracts.duplicatePrevention,
    },
    contractVerification: {
      sourceToTree: 'unverified' as const,
      requiredBeforeExecution: true as const,
    },
    stages: {
      setup: {
        status: 'unsigned-candidates' as const,
        rebuildRequired: false as const,
        prerequisites: [
          'independently verify resolved contract sources compile to the bound ErgoTrees',
          'revalidate both funding boxes against a fresh non-mainnet UTXO view',
          'review funding sufficiency and signer control under separate approval',
        ],
      },
      admission: {
        status: 'tip-bound-preview' as const,
        stateContextHeight: admissionStateContextHeight,
        expiresAfterHeight: provisioningCreationHeight,
        rebuildRequired: true as const,
        prerequisites: [
          'confirm and refetch the tracker setup outputs',
          'recollect the ordered ten mined headers from lastHeaders/10 and derive the node simplifiedUpcoming preheader',
          'rebuild the admission for the current tip and anchor context index',
          'authorize tracker admission with the distinct reviewed finality-attestor key',
        ],
      },
      settlement: {
        status: 'predicted-descendant-preview' as const,
        rebuildRequired: true as const,
        prerequisites: [
          'confirm and refetch the populated tracker, DUP singleton, and vault boxes',
          'revalidate the sidechain burn and canonical Ergo anchor',
          'rebuild the settlement candidate from observed boxes before any JVM check',
        ],
      },
    },
    admissionPreview: admission,
    operations: {
      trackerSetupCandidate: trackerSetup,
      duplicatePreventionAndVaultSetupCandidate: duplicatePreventionAndVaultSetup,
      trackerAdmissionTipBoundPreview: trackerAdmission,
      settlementPredictedPreview: settlementPreview,
    },
    predictedBoxes: {
      populatedTracker,
      duplicatePrevention: duplicatePreventionBox,
      settlementVault,
    },
    settlement: {
      predictedTxId: settlementPreview.txId,
      duplicatePreventionKeyHex: settlementPlan.claims[0].duplicatePreventionKeyHex,
      trackerKeyHex: admission.trackerKeyHex,
      trackerValueHex: admission.trackerValueHex,
    },
    authorization,
    blockers: [
      'resolved contract sources have not been independently compiled to the supplied ErgoTrees',
      'the provenance-bound funding observation is non-atomic and requires fresh revalidation',
      'setup funding boxes and every predicted descendant output are unconfirmed',
      'the admission preview expires after the exact state-context height in this package',
      'admission and settlement must be rebuilt in separate stages from observed boxes',
      'native checkpoint profile and trust anchor remain unapproved for a live instance',
      'the distinct R9 attestor remains a disclosed federated finality authority',
      'organizational independence and DLog-key mapping are not verified by key inequality',
      'no local signing or JVM transaction check was executed',
      'Ergo does not yet verify sidechain GRANDPA finality',
    ],
  };
  const packageDigestHex = sha256Canonical(withoutDigest);
  return deepFreeze({
    ...withoutDigest,
    packageDigestHex,
  }) as AuthenticatedV2ProvisioningPlan;
}

async function buildTrackerSetup(input: {
  fundingBox: Eip12Box;
  trackerErgoTreeHex: string;
  trackerNftId: string;
  registers: Record<string, string>;
  trackerValue: bigint;
  setupFee: bigint;
  admissionFee: bigint;
  creationHeight: number;
}): Promise<MaterializedUnsignedTransaction> {
  const fundingValue = BigInt(input.fundingBox.value);
  const admissionFundingValue = fundingValue - input.trackerValue - input.setupFee;
  if (admissionFundingValue < input.admissionFee + AUTHENTICATED_V2_PROVISIONING_MIN_BOX_VALUE) {
    throw new Error('tracker funding box does not leave a valid admission fee/change input');
  }
  return materializeUnsignedTransaction({
    inputs: [{ ...input.fundingBox, extension: {} }],
    dataInputs: [],
    outputs: [
      output(input.trackerValue, input.trackerErgoTreeHex, input.creationHeight, {
        assets: [{ tokenId: input.trackerNftId, amount: '1' }],
        additionalRegisters: input.registers,
      }),
      output(admissionFundingValue, input.fundingBox.ergoTree, input.creationHeight),
      feeOutput(input.setupFee, input.creationHeight),
    ],
  }, 'authenticated tracker setup');
}

async function buildDuplicatePreventionAndVaultSetup(input: {
  fundingBox: Eip12Box;
  duplicatePreventionErgoTreeHex: string;
  unlockErgoTreeHex: string;
  duplicatePreventionNftId: string;
  committeeSigmaPropRegisterHex: string;
  duplicatePreventionValue: bigint;
  vaultValue: bigint;
  setupFee: bigint;
  creationHeight: number;
  vault: AuthenticatedV2ProvisioningInput['vault'];
}): Promise<MaterializedUnsignedTransaction> {
  const fundingValue = BigInt(input.fundingBox.value);
  const changeValue = fundingValue
    - input.duplicatePreventionValue
    - input.vaultValue
    - input.setupFee;
  if (changeValue < AUTHENTICATED_V2_PROVISIONING_MIN_BOX_VALUE) {
    throw new Error('DUP/vault funding box does not leave a valid change output');
  }
  const dupRegisters = {
    R4: encodeLongRegister(0),
    R5: encodeAvlTreeRegister(Buffer.from(getDupTreeDigest([]), 'hex'), 0x0b, 1),
    R6: input.committeeSigmaPropRegisterHex,
  };
  const vaultRegisters = {
    R4: encodeCollByteRegister(Buffer.from(fixedHex(input.vault.depositIdHex, 32, 'vault depositIdHex'), 'hex')),
    R5: encodeCollByteRegister(Buffer.from(fixedHex(
      input.vault.depositorIdentityHex,
      20,
      'vault depositorIdentityHex',
    ), 'hex')),
    R6: encodeLongRegister(input.vaultValue),
    R7: encodeCollByteRegister(Buffer.from(variableHex(input.vault.provenanceHex, 'vault provenanceHex'), 'hex')),
  };
  return materializeUnsignedTransaction({
    inputs: [{ ...input.fundingBox, extension: {} }],
    dataInputs: [],
    outputs: [
      output(
        input.duplicatePreventionValue,
        input.duplicatePreventionErgoTreeHex,
        input.creationHeight,
        {
          assets: [{ tokenId: input.duplicatePreventionNftId, amount: '1' }],
          additionalRegisters: dupRegisters,
        },
      ),
      output(input.vaultValue, input.unlockErgoTreeHex, input.creationHeight, {
        additionalRegisters: vaultRegisters,
      }),
      output(changeValue, input.fundingBox.ergoTree, input.creationHeight),
      feeOutput(input.setupFee, input.creationHeight),
    ],
  }, 'authenticated DUP and vault setup');
}

export async function buildAuthenticatedV2TrackerAdmissionTransaction(input: {
  trackerBox: Eip12Box;
  feeBox: Eip12Box;
  successorRegisters: Record<string, string>;
  contextExtension: Record<string, string>;
  admissionFee: bigint;
  creationHeight: number;
}): Promise<MaterializedUnsignedTransaction> {
  if (input.trackerBox.transactionId !== input.feeBox.transactionId) {
    throw new Error('tracker and admission fee inputs must come from the same setup transaction');
  }
  const changeValue = BigInt(input.feeBox.value) - input.admissionFee;
  if (changeValue < AUTHENTICATED_V2_PROVISIONING_MIN_BOX_VALUE) {
    throw new Error('tracker admission funding input does not leave a valid change output');
  }
  return materializeUnsignedTransaction({
    inputs: [
      { ...input.trackerBox, extension: input.contextExtension },
      { ...input.feeBox, extension: {} },
    ],
    dataInputs: [],
    outputs: [
      output(
        BigInt(input.trackerBox.value),
        input.trackerBox.ergoTree,
        input.creationHeight,
        {
          assets: input.trackerBox.assets,
          additionalRegisters: input.successorRegisters,
        },
      ),
      output(changeValue, input.feeBox.ergoTree, input.creationHeight),
      feeOutput(input.admissionFee, input.creationHeight),
    ],
  }, 'authenticated tracker admission');
}

function resolveContractBindings(
  input: AuthenticatedV2ProvisioningInput['contracts'],
  trackerNftId: string,
  duplicatePreventionNftId: string,
): {
  tracker: ProvisioningContractBinding;
  unlock: ProvisioningContractBinding;
  duplicatePrevention: ProvisioningContractBinding;
  unlockErgoTreeHashHex: string;
} {
  const resolved = resolveAuthenticatedV2ContractSources(
    input,
    trackerNftId,
    duplicatePreventionNftId,
  );
  const binding = (
    contract: ResolvedAuthenticatedV2ContractSource,
  ): ProvisioningContractBinding => ({
    templateSha256Hex: contract.templateSha256Hex,
    resolvedSourceSha256Hex: contract.resolvedSourceSha256Hex,
    ergoTreeHex: contract.ergoTreeHex,
    ergoTreeSha256Hex: contract.ergoTreeSha256Hex,
  });
  return {
    tracker: binding(resolved.tracker),
    unlock: binding(resolved.unlock),
    duplicatePrevention: binding(resolved.duplicatePrevention),
    unlockErgoTreeHashHex: resolved.authenticatedUnlockErgoTreeHashHex,
  };
}

async function normalizePureErgFundingBox(box: Eip12Box, label: string): Promise<Eip12Box> {
  const normalized = await normalizeEip12Box(box, label);
  if (normalized.assets.length !== 0) {
    throw new Error(`${label} must be a pure-ERG box`);
  }
  return normalized;
}

function normalizeProvisioningProvenance(
  value: AuthenticatedV2ProvisioningProvenance,
): AuthenticatedV2ProvisioningProvenance {
  const provenance = requireRecord(value, 'provisioning provenance');
  assertExactKeys(provenance, [
    'fundingObservation',
    'initialBinding',
    'revalidationRequiredBeforeSetup',
  ], 'provisioning provenance');
  if (provenance.revalidationRequiredBeforeSetup !== true) {
    throw new Error('provisioning provenance must require funding revalidation before setup');
  }

  const funding = requireRecord(
    provenance.fundingObservation,
    'provisioning funding-observation provenance',
  );
  assertExactKeys(funding, [
    'reportDigestHex',
    'snapshotDigestHex',
    'observedAt',
    'nodeNetwork',
    'tipHeight',
    'tipIdHex',
  ], 'provisioning funding-observation provenance');
  if (typeof funding.observedAt !== 'string') {
    throw new Error('provisioning funding observation time must be canonical ISO-8601');
  }
  const observedAtDate = new Date(funding.observedAt);
  if (Number.isNaN(observedAtDate.getTime())
    || observedAtDate.toISOString() !== funding.observedAt) {
    throw new Error('provisioning funding observation time must be canonical ISO-8601');
  }
  if (typeof funding.nodeNetwork !== 'string'
    || !/^(?:testnet|devnet|local|development)$/.test(funding.nodeNetwork)) {
    throw new Error('provisioning funding observation network must be canonical non-mainnet');
  }
  if (!Number.isSafeInteger(funding.tipHeight) || Number(funding.tipHeight) < 0) {
    throw new Error('provisioning funding observation tip height must be non-negative');
  }

  const initial = requireRecord(
    provenance.initialBinding,
    'provisioning initial-binding provenance',
  );
  assertExactKeys(
    initial,
    ['reportDigestHex', 'inputDigestHex'],
    'provisioning initial-binding provenance',
  );
  return {
    fundingObservation: {
      reportDigestHex: fixedLowerHex(
        funding.reportDigestHex,
        32,
        'funding observation report digest',
      ),
      snapshotDigestHex: fixedLowerHex(
        funding.snapshotDigestHex,
        32,
        'funding observation snapshot digest',
      ),
      observedAt: funding.observedAt,
      nodeNetwork: funding.nodeNetwork,
      tipHeight: Number(funding.tipHeight),
      tipIdHex: fixedLowerHex(funding.tipIdHex, 32, 'funding observation tip ID'),
    },
    initialBinding: {
      reportDigestHex: fixedLowerHex(
        initial.reportDigestHex,
        32,
        'initial-binding report digest',
      ),
      inputDigestHex: fixedLowerHex(
        initial.inputDigestHex,
        32,
        'initial-binding input digest',
      ),
    },
    revalidationRequiredBeforeSetup: true,
  };
}

function normalizeValues(input: AuthenticatedV2ProvisioningInput['values']): NormalizedValues {
  const result = {
    trackerSingleton: positiveLong(input.trackerSingletonNanoErg, 'trackerSingletonNanoErg'),
    duplicatePreventionSingleton: positiveLong(
      input.duplicatePreventionSingletonNanoErg,
      'duplicatePreventionSingletonNanoErg',
    ),
    vault: positiveLong(input.vaultNanoErg, 'vaultNanoErg'),
    setupFee: positiveLong(input.setupFeeNanoErg, 'setupFeeNanoErg'),
    admissionFee: positiveLong(input.admissionFeeNanoErg, 'admissionFeeNanoErg'),
  };
  for (const [label, value] of [
    ['trackerSingletonNanoErg', result.trackerSingleton],
    ['duplicatePreventionSingletonNanoErg', result.duplicatePreventionSingleton],
    ['vaultNanoErg', result.vault],
  ] as Array<[string, bigint]>) {
    if (value < AUTHENTICATED_V2_PROVISIONING_MIN_BOX_VALUE) {
      throw new Error(`${label} must be at least ${AUTHENTICATED_V2_PROVISIONING_MIN_BOX_VALUE}`);
    }
  }
  for (const [label, value] of [
    ['setupFeeNanoErg', result.setupFee],
    ['admissionFeeNanoErg', result.admissionFee],
  ] as Array<[string, bigint]>) {
    if (value < AUTHENTICATED_V2_PROVISIONING_MIN_FEE
      || value > AUTHENTICATED_V2_PROVISIONING_MAX_FEE) {
      throw new Error(
        `${label} must be between ${AUTHENTICATED_V2_PROVISIONING_MIN_FEE} and ${AUTHENTICATED_V2_PROVISIONING_MAX_FEE}`,
      );
    }
  }
  return result;
}

function assessProvisioningFundingFromNormalized(
  trackerAvailable: bigint,
  dupVaultAvailable: bigint,
  values: NormalizedValues,
): AuthenticatedV2ProvisioningFundingAssessment {
  const trackerRequired = values.trackerSingleton
    + values.setupFee
    + values.admissionFee
    + AUTHENTICATED_V2_PROVISIONING_MIN_BOX_VALUE;
  const dupVaultRequired = values.duplicatePreventionSingleton
    + values.vault
    + values.setupFee
    + AUTHENTICATED_V2_PROVISIONING_MIN_BOX_VALUE;
  const lane = <T extends Record<string, string>>(
    components: T,
    available: bigint,
    required: bigint,
  ) => ({
    components,
    availableNanoErg: available.toString(),
    requiredNanoErg: required.toString(),
    surplusNanoErg: (available >= required ? available - required : 0n).toString(),
    shortfallNanoErg: (available < required ? required - available : 0n).toString(),
    sufficient: available >= required,
  });
  const tracker = lane({
    singletonNanoErg: values.trackerSingleton.toString(),
    setupFeeNanoErg: values.setupFee.toString(),
    admissionFeeNanoErg: values.admissionFee.toString(),
    minimumChangeNanoErg: AUTHENTICATED_V2_PROVISIONING_MIN_BOX_VALUE.toString(),
  }, trackerAvailable, trackerRequired);
  const duplicatePreventionAndVault = lane({
    singletonNanoErg: values.duplicatePreventionSingleton.toString(),
    vaultNanoErg: values.vault.toString(),
    setupFeeNanoErg: values.setupFee.toString(),
    minimumChangeNanoErg: AUTHENTICATED_V2_PROVISIONING_MIN_BOX_VALUE.toString(),
  }, dupVaultAvailable, dupVaultRequired);
  return deepFreeze({
    tracker,
    duplicatePreventionAndVault,
    allSufficient: tracker.sufficient && duplicatePreventionAndVault.sufficient,
  });
}

function normalizePegOut(pegOut: AggregateSettlementClaim['pegOut']): AggregateSettlementClaim['pegOut'] {
  return {
    user: typeof pegOut.user === 'string' ? pegOut.user : '',
    amount: positiveLong(pegOut.amount, 'settlement peg-out amount'),
    ergoRecipientAddress: nonemptyString(pegOut.ergoRecipientAddress, 'settlement Ergo recipient'),
    sidechainTxHash: fixedHex(pegOut.sidechainTxHash, 32, 'settlement sidechain transaction hash'),
    sidechainBlockNumber: positiveSafeInteger(
      pegOut.sidechainBlockNumber,
      'settlement sidechain block number',
    ),
    sidechainLogIndex: nonnegativeUint32(
      pegOut.sidechainLogIndex,
      'settlement sidechain log index',
    ),
  };
}

function normalizeSettlementIdentityInput(input: SettlementIdentity): SettlementIdentity {
  if (input.source !== 'trustless-burn-leaf') {
    throw new Error('provisioning settlement preview requires trustless-burn-leaf identity');
  }
  return {
    source: input.source,
    duplicatePreventionKeyHex: fixedHex(
      input.duplicatePreventionKeyHex,
      32,
      'settlement duplicate-prevention key',
    ),
    bridgeEventRootHex: fixedHex(input.bridgeEventRootHex, 32, 'settlement bridge event root'),
    recipientErgoTreeHashHex: fixedHex(
      input.recipientErgoTreeHashHex,
      32,
      'settlement recipient ErgoTree hash',
    ),
    amountNanoErg: positiveLong(input.amountNanoErg, 'settlement amount').toString(),
    assetIdHex: input.assetIdHex
      ? fixedHex(input.assetIdHex, 32, 'settlement asset ID')
      : '00'.repeat(32),
    trustlessBurnProof: normalizeTrustlessBurnProof(input.trustlessBurnProof),
  };
}

function normalizeTrustlessBurnProof(
  proof: SettlementIdentity['trustlessBurnProof'],
): NonNullable<SettlementIdentity['trustlessBurnProof']> {
  if (proof === undefined) return [];
  if (!Array.isArray(proof)) {
    throw new Error('settlement trustless burn proof must be an array');
  }
  return proof.map((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new Error(`settlement trustless burn proof[${index}] must be an object`);
    }
    const keys = Object.keys(step).sort();
    if (keys.length !== 2 || keys[0] !== 'hashHex' || keys[1] !== 'side') {
      throw new Error(
        `settlement trustless burn proof[${index}] must contain exactly side and hashHex`,
      );
    }
    if (step.side !== 'left' && step.side !== 'right') {
      throw new Error(`settlement trustless burn proof[${index}].side must be left or right`);
    }
    return {
      side: step.side,
      hashHex: fixedHex(
        step.hashHex,
        32,
        `settlement trustless burn proof[${index}].hashHex`,
      ),
    };
  });
}

function output(
  value: bigint,
  ergoTree: string,
  creationHeight: number,
  options: {
    assets?: Eip12Box['assets'];
    additionalRegisters?: Record<string, string>;
  } = {},
) {
  return {
    value: value.toString(),
    ergoTree,
    assets: options.assets ?? [],
    additionalRegisters: options.additionalRegisters ?? {},
    creationHeight,
  };
}

function feeOutput(value: bigint, creationHeight: number) {
  return output(value, MINER_FEE_TREE, creationHeight);
}

function normalizeNonMainnetEnvironment(value: unknown): string {
  const environment = nonemptyString(value, 'environment').toLowerCase();
  if (!/^(?:local|development|devnet|patched-devnet|testnet)$/.test(environment)) {
    throw new Error('authenticated V2 provisioning requires an explicit non-mainnet environment');
  }
  return environment;
}

function positiveLong(value: unknown, label: string): bigint {
  const raw = typeof value === 'bigint' ? value.toString() : String(value ?? '');
  if (!/^[1-9][0-9]*$/.test(raw)) throw new Error(`${label} must be a positive integer`);
  const parsed = BigInt(raw);
  if (parsed > MAX_SIGNED_LONG) throw new Error(`${label} must fit a positive signed 64-bit integer`);
  return parsed;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function nonnegativeUint32(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 0xffff_ffff) {
    throw new Error(`${label} must be an unsigned 32-bit integer`);
  }
  return Number(value);
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be non-empty`);
  }
  return value.trim();
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  const clean = typeof value === 'string' && value.startsWith('0x') ? value.slice(2) : value;
  if (typeof clean !== 'string' || !/^[0-9a-fA-F]+$/.test(clean) || clean.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return clean.toLowerCase();
}

function fixedLowerHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be canonical lowercase ${bytes}-byte hex`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  const clean = typeof value === 'string' && value.startsWith('0x') ? value.slice(2) : value;
  if (
    typeof clean !== 'string'
    || clean.length === 0
    || clean.length % 2 !== 0
    || !/^[0-9a-fA-F]+$/.test(clean)
  ) {
    throw new Error(`${label} must be non-empty even-length hex`);
  }
  return clean.toLowerCase();
}

function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Bytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}

function sha256Canonical(value: unknown): string {
  return sha256Utf8(canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('provisioning package cannot contain non-finite numbers');
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
  throw new Error(`provisioning package cannot serialize ${typeof value}`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function assertExactKeys(
  value: Record<string, any>,
  expected: string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exactly: ${wanted.join(', ')}`);
  }
}
