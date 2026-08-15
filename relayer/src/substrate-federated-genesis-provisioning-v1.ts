/**
 * Deterministic, unsigned materialization for the federated V1 genesis family.
 * This module cannot check, sign, submit, broadcast, confirm, or activate it.
 */

import {
  getPooledReserveEmptyDigest,
} from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  MINER_FEE,
} from './ergo-encoding.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  getSubstrateFederatedTrackerDigestV1Hex,
} from './substrate-federated-burn-settlement-v1.js';
import {
  assertSubstrateFederatedCutoverGenerationV1Provenance,
  SUBSTRATE_FEDERATED_CUTOVER_GENERATION_V1_SCHEMA,
  type SubstrateFederatedCutoverGenerationV1Manifest,
} from './substrate-federated-cutover-generation-v1.js';
import {
  SUBSTRATE_FEDERATED_GREENFIELD_GENERATION_V1_SCHEMA,
  assertSubstrateFederatedGreenfieldGenerationV1Provenance,
  type SubstrateFederatedGreenfieldGenerationV1Manifest,
} from './substrate-federated-greenfield-launch-v1.js';
import {
  assertSubstrateFederatedGenesisObservationV1Provenance,
  type SubstrateFederatedGenesisObservationV1,
  type SubstrateFederatedGenesisTargetProfileV1,
} from './substrate-federated-genesis-observation-v1.js';
import {
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA,
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  type SubstrateFederatedSettlementFamilyV1DecodedProfile,
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
import {
  type Eip12Box,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';
import {
  materializeSubstrateFederatedSingletonIssuanceV1,
} from './substrate-federated-genesis-issuance-materialization-v1.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
} from './validity-application-pooled-reserve-instance-v4.js';

export const SUBSTRATE_FEDERATED_GENESIS_PROVISIONING_V1_SCHEMA =
  'e2s.substrate-federated-genesis-provisioning.v1' as const;
export const SUBSTRATE_FEDERATED_GREENFIELD_GENESIS_PROVISIONING_V1_SCHEMA =
  'e2s.substrate-federated-greenfield-genesis-provisioning.v1' as const;

const PLAN_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GENESIS_PROVISIONING_V1';
const TARGET_GENERATION_CANDIDATE_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_TARGET_GENERATION_CANDIDATE_V1';
const GREENFIELD_PLAN_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_GENESIS_PROVISIONING_V1';
const GREENFIELD_TARGET_GENERATION_CANDIDATE_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_TARGET_GENERATION_CANDIDATE_V1';
const MIN_BOX_VALUE = 1_000_000n;
const TRACKER_VALUE_BYTES = 370;
const DUP_VALUE_BYTES = 1;
const DEPOSIT_KEY_BYTES = 32;
const plans = new WeakSet<object>();
const greenfieldPlans = new WeakSet<object>();

type ProvisioningRole =
  | 'tracker'
  | 'duplicatePrevention'
  | 'pooledReserve';

type FamilyTemplates = Readonly<{
  readonly duplicatePrevention: SubstrateFederatedSettlementFamilyV1Template;
  readonly sourceLock: SubstrateFederatedSettlementFamilyV1Template;
  readonly pooledReserve: SubstrateFederatedSettlementFamilyV1Template;
}>;

export interface BuildSubstrateFederatedGenesisProvisioningV1Input {
  readonly targetProfile:
    Readonly<SubstrateFederatedGenesisTargetProfileV1>;
  readonly observation:
    Readonly<SubstrateFederatedGenesisObservationV1>;
  readonly trackerRequest:
    Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
  readonly trackerReceipt:
    Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;
  readonly familyTemplates: FamilyTemplates;
  readonly familyReceipt:
    Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1>;
  readonly generationManifest:
    Readonly<SubstrateFederatedCutoverGenerationV1Manifest>;
}

export interface BuildSubstrateFederatedGreenfieldGenesisProvisioningV1Input {
  readonly targetProfile:
    Readonly<SubstrateFederatedGenesisTargetProfileV1>;
  readonly observation:
    Readonly<SubstrateFederatedGenesisObservationV1>;
  readonly trackerRequest:
    Readonly<SubstrateFederatedTrackerCompilerRequestV1>;
  readonly trackerReceipt:
    Readonly<SubstrateFederatedTrackerJvmCompilerReceiptV1>;
  readonly familyTemplates: FamilyTemplates;
  readonly familyReceipt:
    Readonly<SubstrateFederatedSettlementFamilyJvmCompilerReceiptV1>;
  readonly generationManifest:
    Readonly<SubstrateFederatedGreenfieldGenerationV1Manifest>;
}

type BuildFederatedGenesisProvisioningV1Input =
  | BuildSubstrateFederatedGenesisProvisioningV1Input
  | BuildSubstrateFederatedGreenfieldGenesisProvisioningV1Input;

interface ProvisionedLineageV1 {
  readonly genesisInputBoxIdHex: string;
  readonly singletonTokenIdHex: string;
  readonly issuanceTransactionIdHex: string;
  readonly stateOutputBoxIdHex: string;
  readonly stateOutputIndex: 0;
  readonly creationHeight: number;
}

export interface SubstrateFederatedGenesisProvisioningV1Plan {
  readonly schema: typeof SUBSTRATE_FEDERATED_GENESIS_PROVISIONING_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'unsigned_non_authorizing_candidate';
  readonly planDigestHex: string;
  readonly targetGenerationCandidateIdHex: string;
  readonly sourceBindings: Readonly<{
    readonly targetProfileDigestHex: string;
    readonly genesisObservationReportDigestHex: string;
    readonly trackerCompilerRequestDigestHex: string;
    readonly trackerCompilerReceiptDigestHex: string;
    readonly familyCompilerRequestDigestHex: string;
    readonly familyCompilerReceiptDigestHex: string;
    readonly cutoverGenerationManifestDigestHex: string;
    readonly semanticBaselineGenerationIdHex: string;
  }>;
  readonly target: Readonly<{
    readonly environment: string;
    readonly network: 'testnet';
    readonly genesisHeaderIdHex: string;
    readonly observedTipHeight: number;
    readonly observedTipHeaderIdHex: string;
    readonly issuanceCreationHeight: number;
  }>;
  readonly profile: Readonly<{
    readonly federationProfileIdHex: string;
    readonly familyIdHex: string;
    readonly sourceNetworkIdHex: string;
    readonly sidechainIdHex: string;
    readonly runtimeProfileIdHex: string;
    readonly settlementProfileIdHex: string;
    readonly sourceAttestationKeySetDigestHex: string;
    readonly sourceAttestationThreshold: number;
    readonly ergoAdmissionKeySetDigestHex: string;
    readonly ergoAdmissionThreshold: number;
    readonly federationEpoch: string;
  }>;
  readonly contracts: Readonly<{
    readonly tracker: Readonly<ProvisionedContractV1>;
    readonly duplicatePrevention: Readonly<ProvisionedContractV1>;
    readonly sourceLock: Readonly<ProvisionedContractV1>;
    readonly pooledReserve: Readonly<ProvisionedContractV1>;
  }>;
  readonly replay: Readonly<{
    readonly sourcePacketDigestHex: string;
    readonly canonicalBurnIdsHex: readonly string[];
    readonly canonicalBurnIdCount: number;
    readonly importedDuplicatePreventionDigestHex: string;
    readonly emptyTrackerDigestHex: string;
    readonly emptyDepositDigestHex: string;
  }>;
  readonly transactions: Readonly<{
    readonly trackerIssuance: MaterializedUnsignedTransaction;
    readonly duplicatePreventionIssuance: MaterializedUnsignedTransaction;
    readonly pooledReserveIssuance: MaterializedUnsignedTransaction;
  }>;
  readonly boxes: Readonly<{
    readonly tracker: Eip12Box;
    readonly duplicatePrevention: Eip12Box;
    readonly pooledReserve: Eip12Box;
  }>;
  readonly lineages: Readonly<{
    readonly tracker: Readonly<ProvisionedLineageV1>;
    readonly duplicatePrevention: Readonly<ProvisionedLineageV1>;
    readonly pooledReserve: Readonly<ProvisionedLineageV1>;
  }>;
  readonly economics: Readonly<{
    readonly stateBoxValueNanoErg: string;
    readonly issuanceFeeNanoErg: string;
    readonly feesFundedOnlyByGenesisInputs: true;
  }>;
  readonly checks: Readonly<{
    readonly sameProcessGenesisObservationVerified: true;
    readonly sameProcessTrackerCompilationVerified: true;
    readonly sameProcessFamilyCompilationVerified: true;
    readonly sameProcessCutoverGenerationVerified: true;
    readonly stableCompilerSemanticsMatched: true;
    readonly stableManifestPayloadSemanticsMatched: true;
    readonly exactObservedGenesisInputsConsumed: true;
    readonly singletonIdsEqualGenesisInputIds: true;
    readonly globalReplayImportedIntoDuplicatePrevention: true;
    readonly exactCreationHeightsBound: true;
    readonly predictedTransactionAndOutputIdsBound: true;
    readonly unsignedConstructionOnly: true;
    readonly callerTargetApprovalAccepted: false;
  }>;
  readonly stages: Readonly<{
    readonly construction: 'unsigned-plan-complete';
    readonly setupCheckRequest: 'not-created';
    readonly jvmCheck: 'not-performed';
    readonly signing: 'not-authorized';
    readonly submission: 'not-authorized';
    readonly broadcastAuthorization: 'not-granted';
    readonly confirmation: 'not-established';
  }>;
  readonly boundaries: Readonly<{
    readonly sourceControlledTargetProfileApprovalAuthenticated: false;
    readonly declaredSourceCustodyAuthenticated: false;
    readonly targetNetworkConsensusAuthenticated: false;
    readonly tipUtxoAtomicityProved: false;
    readonly setupCheckRequestFrozen: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly nodeCheckPerformed: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly singletonLineagesEstablished: false;
    readonly legacyRoutesRetired: false;
    readonly profileActivated: false;
    readonly confirmationEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export interface SubstrateFederatedGreenfieldGenesisProvisioningV1Plan
  extends Omit<
    SubstrateFederatedGenesisProvisioningV1Plan,
    'schema' | 'sourceBindings' | 'checks' | 'boundaries'
  > {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_GREENFIELD_GENESIS_PROVISIONING_V1_SCHEMA;
  readonly sourceBindings: Readonly<
    Omit<
      SubstrateFederatedGenesisProvisioningV1Plan['sourceBindings'],
      'cutoverGenerationManifestDigestHex'
      | 'semanticBaselineGenerationIdHex'
    > & {
      readonly greenfieldGenerationManifestDigestHex: string;
      readonly activationGenerationIdHex: string;
      readonly greenfieldLaunchBaselineDigestHex: string;
      readonly greenfieldLaunchStatementDigestHex: string;
      readonly greenfieldLaunchAttestationDigestHex: string;
      readonly greenfieldLaunchSignatureSetDigestHex: string;
      readonly greenfieldSourceHistoryDigestHex: string;
      readonly greenfieldErgoHistoryDigestHex: string;
      readonly greenfieldRelayerClosureDigestHex: string;
      readonly signedErgoGenesisHeaderIdHex: string;
      readonly signedErgoGenesisHeight: number;
      readonly signedErgoSetupAnchorHeaderIdHex: string;
      readonly signedErgoSetupAnchorHeight: number;
    }
  >;
  readonly checks: Readonly<
    Omit<
      SubstrateFederatedGenesisProvisioningV1Plan['checks'],
      'sameProcessCutoverGenerationVerified'
      | 'globalReplayImportedIntoDuplicatePrevention'
    > & {
      readonly sameProcessGreenfieldGenerationVerified: true;
      readonly authenticatedGreenfieldLaunchBaselineConsumed: true;
      readonly allPredecessorRoutesNotInstantiatedUnderFederatedTrust: true;
      readonly emptyReplayDerivedFromQuorumAuthenticatedNonInstantiation: true;
      readonly exactSignedErgoHistoryMatchedObservation: true;
      readonly migrationCutoverArtifactConsumed: false;
    }
  >;
  readonly boundaries:
    SubstrateFederatedGenesisProvisioningV1Plan['boundaries'] & Readonly<{
      readonly greenfieldLaunchBaselineAuthenticated: true;
      readonly predecessorRouteNonInstantiationAcceptedUnderFederatedTrust: true;
    }>;
}

interface ProvisionedContractV1 {
  readonly propositionBytes: number;
  readonly propositionSha256Hex: string;
  readonly contractIdHex: string;
}

export async function buildSubstrateFederatedGenesisProvisioningV1(
  rawInput: Readonly<BuildSubstrateFederatedGenesisProvisioningV1Input>,
): Promise<Readonly<SubstrateFederatedGenesisProvisioningV1Plan>> {
  return buildFederatedGenesisProvisioningV1(
    rawInput,
    'migration',
  ) as Promise<Readonly<SubstrateFederatedGenesisProvisioningV1Plan>>;
}

export async function buildSubstrateFederatedGreenfieldGenesisProvisioningV1(
  rawInput:
    Readonly<BuildSubstrateFederatedGreenfieldGenesisProvisioningV1Input>,
): Promise<Readonly<SubstrateFederatedGreenfieldGenesisProvisioningV1Plan>> {
  return buildFederatedGenesisProvisioningV1(
    rawInput,
    'greenfield',
  ) as Promise<Readonly<SubstrateFederatedGreenfieldGenesisProvisioningV1Plan>>;
}

async function buildFederatedGenesisProvisioningV1(
  rawInput: Readonly<BuildFederatedGenesisProvisioningV1Input>,
  mode: 'migration' | 'greenfield',
): Promise<Readonly<
  | SubstrateFederatedGenesisProvisioningV1Plan
  | SubstrateFederatedGreenfieldGenesisProvisioningV1Plan
>> {
  const input = snapshotProvisioningInput(rawInput) as Readonly<
    BuildFederatedGenesisProvisioningV1Input
  >;

  assertSubstrateFederatedGenesisObservationV1Provenance(
    input.targetProfile,
    input.observation,
  );
  assertSubstrateFederatedTrackerJvmCompilerReceiptV1(
    input.trackerReceipt,
    input.trackerRequest,
  );
  const expectedFamilyInput = {
    trackerRequest: input.trackerRequest,
    trackerReceipt: input.trackerReceipt,
    templates: input.familyTemplates,
    duplicatePreventionGenesisInputBoxIdHex:
      input.observation.boxes.duplicatePrevention.box.boxId,
    pooledReserveGenesisInputBoxIdHex:
      input.observation.boxes.pooledReserve.box.boxId,
  };
  assertSubstrateFederatedSettlementFamilyJvmCompilerReceiptV1(
    input.familyReceipt,
    expectedFamilyInput,
  );
  const isGreenfieldManifest = input.generationManifest.schema
    === SUBSTRATE_FEDERATED_GREENFIELD_GENERATION_V1_SCHEMA;
  if (isGreenfieldManifest !== (mode === 'greenfield')) {
    throw new Error('federated provisioning mode does not match the generation schema');
  }
  if (
    input.generationManifest.schema
      === SUBSTRATE_FEDERATED_CUTOVER_GENERATION_V1_SCHEMA
  ) {
    assertSubstrateFederatedCutoverGenerationV1Provenance(
      input.generationManifest,
    );
  } else if (
    input.generationManifest.schema
      === SUBSTRATE_FEDERATED_GREENFIELD_GENERATION_V1_SCHEMA
  ) {
    assertSubstrateFederatedGreenfieldGenerationV1Provenance(
      input.generationManifest,
    );
  } else {
    throw new Error('federated provisioning generation schema is unsupported');
  }
  if (isGreenfieldManifest) {
    assertGreenfieldErgoHistoryObservationJoin(input);
  }

  const familyProfile =
    decodeSubstrateFederatedSettlementFamilyV1Profile(
      input.familyReceipt.profile,
    );
  const manifestProfile =
    decodeSubstrateFederatedSettlementFamilyV1Profile(
      {
        schema: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA,
        version: 1,
        encodedProfileHex:
          input.generationManifest.target.profile.encodedProfileHex,
        familyIdHex: input.generationManifest.target.profile.familyIdHex,
        duplicatePreventionNftIdHex:
          input.generationManifest.target.lineages.duplicatePrevention
            .singletonTokenIdHex,
        pooledReserveNftIdHex:
          input.generationManifest.target.lineages.pooledReserve
            .singletonTokenIdHex,
      },
    );
  assertObservationAndCompilerJoin(input, familyProfile);
  assertManifestSemanticBaseline(input, familyProfile, manifestProfile);

  const creationHeight = positiveHeight(
    input.observation.target.tipHeight,
    'federated issuance creation height',
  );
  const stateBoxValue = manifestStateBoxValue(input.generationManifest);
  const issuanceFee = BigInt(MINER_FEE);
  if (issuanceFee < MIN_BOX_VALUE) {
    throw new Error('federated issuance fee is below the minimum box value');
  }

  const replay = deepFreeze({
    sourcePacketDigestHex: fixedHex(
      input.generationManifest.globalReplay.sourcePacketDigestHex,
      32,
      'federated replay source packet digest',
    ),
    canonicalBurnIdsHex: input.generationManifest.globalReplay
      .canonicalBurnIdsHex.map((burnId, index) =>
        fixedHex(burnId, 32, `federated replay burn ID ${index}`)
      ),
    canonicalBurnIdCount:
      input.generationManifest.globalReplay.canonicalBurnIdCount,
    importedDuplicatePreventionDigestHex: fixedHex(
      input.generationManifest.globalReplay.duplicatePreventionDigestHex,
      33,
      'federated imported duplicate-prevention digest',
    ),
    emptyTrackerDigestHex: fixedHex(
      getSubstrateFederatedTrackerDigestV1Hex([]),
      33,
      'federated empty tracker digest',
    ),
    emptyDepositDigestHex: fixedHex(
      getPooledReserveEmptyDigest(),
      33,
      'federated empty deposit digest',
    ),
  });
  if (replay.canonicalBurnIdsHex.length !== replay.canonicalBurnIdCount) {
    throw new Error('federated replay burn count drifted');
  }

  const trackerRegisters = {
    R4: encodeCollByteRegister(Buffer.from(
      fixedHex(
        input.trackerRequest.profile.profileIdHex,
        32,
        'federated checkpoint profile ID',
      ),
      'hex',
    )),
    R5: encodeAvlTreeRegister(
      Buffer.from(replay.emptyTrackerDigestHex, 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
      TRACKER_VALUE_BYTES,
    ),
    R6: encodeCollByteRegister(Buffer.from(
      fixedHex(
        input.trackerRequest.application.sidechainIdHex,
        32,
        'federated sidechain ID',
      ),
      'hex',
    )),
    R7: encodeLongRegister(0n),
    R8: encodeIntRegister(0),
    R9: encodeCollByteRegister(Buffer.from(
      fixedHex(
        input.trackerRequest.profile.ergoAdmissionKeySetDigestHex,
        32,
        'federated Ergo-admission key-set digest',
      ),
      'hex',
    )),
  };
  const familyRegister = encodeCollByteRegister(Buffer.from(
    fixedHex(
      input.familyReceipt.profile.familyIdHex,
      32,
      'federated settlement-family ID',
    ),
    'hex',
  ));
  const duplicatePreventionRegisters = {
    R4: familyRegister,
    R5: encodeAvlTreeRegister(
      Buffer.from(replay.importedDuplicatePreventionDigestHex, 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
      DUP_VALUE_BYTES,
    ),
  };
  const pooledReserveRegisters = {
    R4: familyRegister,
    R5: encodeAvlTreeRegister(
      Buffer.from(replay.emptyDepositDigestHex, 'hex'),
      VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
      DEPOSIT_KEY_BYTES,
    ),
    R6: encodeLongRegister(0n),
  };

  const [trackerIssuance, duplicatePreventionIssuance, pooledReserveIssuance] =
    await Promise.all([
      materializeSubstrateFederatedSingletonIssuanceV1({
        label: 'federated tracker issuance',
        genesisInput: input.observation.boxes.tracker.box,
        expectedNftIdHex: familyProfile.trackerNftIdHex,
        propositionHex: input.trackerReceipt.contract.propositionHex,
        registers: trackerRegisters,
        singletonValue: stateBoxValue,
        fee: issuanceFee,
        creationHeight,
      }),
      materializeSubstrateFederatedSingletonIssuanceV1({
        label: 'federated duplicate-prevention issuance',
        genesisInput: input.observation.boxes.duplicatePrevention.box,
        expectedNftIdHex: familyProfile.duplicatePreventionNftIdHex,
        propositionHex:
          input.familyReceipt.contracts.duplicatePrevention.propositionHex,
        registers: duplicatePreventionRegisters,
        singletonValue: stateBoxValue,
        fee: issuanceFee,
        creationHeight,
      }),
      materializeSubstrateFederatedSingletonIssuanceV1({
        label: 'federated pooled-reserve issuance',
        genesisInput: input.observation.boxes.pooledReserve.box,
        expectedNftIdHex: familyProfile.pooledReserveNftIdHex,
        propositionHex: input.familyReceipt.contracts.pooledReserve.propositionHex,
        registers: pooledReserveRegisters,
        singletonValue: stateBoxValue,
        fee: issuanceFee,
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
  assertStableManifestPayloadJoin(input.generationManifest, boxes);
  const lineages = deepFreeze({
    tracker: lineage(
      input.observation.boxes.tracker.box,
      trackerIssuance,
      creationHeight,
    ),
    duplicatePrevention: lineage(
      input.observation.boxes.duplicatePrevention.box,
      duplicatePreventionIssuance,
      creationHeight,
    ),
    pooledReserve: lineage(
      input.observation.boxes.pooledReserve.box,
      pooledReserveIssuance,
      creationHeight,
    ),
  });

  const contracts = deepFreeze({
    tracker: contractBinding(input.trackerReceipt.contract),
    duplicatePrevention: contractBinding(
      input.familyReceipt.contracts.duplicatePrevention,
    ),
    sourceLock: contractBinding(input.familyReceipt.contracts.sourceLock),
    pooledReserve: contractBinding(
      input.familyReceipt.contracts.pooledReserve,
    ),
  });
  const commonSourceBindings = {
    targetProfileDigestHex: input.targetProfile.profileDigestHex,
    genesisObservationReportDigestHex: input.observation.reportDigestHex,
    trackerCompilerRequestDigestHex: input.trackerRequest.requestDigestHex,
    trackerCompilerReceiptDigestHex: input.trackerReceipt.receiptDigestHex,
    familyCompilerRequestDigestHex:
      input.familyReceipt.familyCompilerRequestDigestHex,
    familyCompilerReceiptDigestHex: input.familyReceipt.receiptDigestHex,
  };
  const sourceBindings = deepFreeze(!isGreenfieldManifest
    ? {
      ...commonSourceBindings,
      cutoverGenerationManifestDigestHex:
        input.generationManifest.manifestDigestHex,
      semanticBaselineGenerationIdHex:
        input.generationManifest.generation.generationIdHex,
    }
    : {
      ...commonSourceBindings,
      greenfieldGenerationManifestDigestHex:
        input.generationManifest.manifestDigestHex,
      activationGenerationIdHex:
        input.generationManifest.generation.generationIdHex,
      greenfieldLaunchBaselineDigestHex:
        input.generationManifest.launchBaseline.baselineDigestHex,
      greenfieldLaunchStatementDigestHex:
        input.generationManifest.launchBaseline.statementDigestHex,
      greenfieldLaunchAttestationDigestHex:
        input.generationManifest.launchBaseline.attestationDigestHex,
      greenfieldLaunchSignatureSetDigestHex:
        input.generationManifest.launchBaseline.signatureSetDigestHex,
      greenfieldSourceHistoryDigestHex:
        input.generationManifest.launchBaseline.sourceHistoryDigestHex,
      greenfieldErgoHistoryDigestHex:
        input.generationManifest.launchBaseline.ergoHistoryDigestHex,
      greenfieldRelayerClosureDigestHex:
        input.generationManifest.launchBaseline.relayerClosureDigestHex,
      signedErgoGenesisHeaderIdHex:
        input.generationManifest.launchBaseline.ergoGenesis.headerIdHex,
      signedErgoGenesisHeight:
        input.generationManifest.launchBaseline.ergoGenesis.height,
      signedErgoSetupAnchorHeaderIdHex:
        input.generationManifest.launchBaseline.ergoSetupAnchor.headerIdHex,
      signedErgoSetupAnchorHeight:
        input.generationManifest.launchBaseline.ergoSetupAnchor.height,
    });
  const target = deepFreeze({
    environment: input.observation.profile.environment,
    network: 'testnet' as const,
    genesisHeaderIdHex: input.observation.target.genesisHeaderIdHex,
    observedTipHeight: input.observation.target.tipHeight,
    observedTipHeaderIdHex: input.observation.target.tipHeaderIdHex,
    issuanceCreationHeight: creationHeight,
  });
  const profile = deepFreeze({
    federationProfileIdHex: familyProfile.federationProfileIdHex,
    familyIdHex: input.familyReceipt.profile.familyIdHex,
    sourceNetworkIdHex: familyProfile.sourceNetworkIdHex,
    sidechainIdHex: familyProfile.sidechainIdHex,
    runtimeProfileIdHex: familyProfile.runtimeProfileIdHex,
    settlementProfileIdHex: familyProfile.settlementProfileIdHex,
    sourceAttestationKeySetDigestHex:
      familyProfile.sourceAttestationKeySetDigestHex,
    sourceAttestationThreshold: familyProfile.sourceAttestationThreshold,
    ergoAdmissionKeySetDigestHex:
      familyProfile.ergoAdmissionKeySetDigestHex,
    ergoAdmissionThreshold: familyProfile.ergoAdmissionThreshold,
    federationEpoch: familyProfile.federationEpoch,
  });
  const schema = !isGreenfieldManifest
    ? SUBSTRATE_FEDERATED_GENESIS_PROVISIONING_V1_SCHEMA
    : SUBSTRATE_FEDERATED_GREENFIELD_GENESIS_PROVISIONING_V1_SCHEMA;
  const candidateDomain = !isGreenfieldManifest
    ? TARGET_GENERATION_CANDIDATE_ID_DOMAIN
    : GREENFIELD_TARGET_GENERATION_CANDIDATE_ID_DOMAIN;
  const targetGenerationCandidateIdHex = sha256CanonicalJson({
    schema,
    version: 1,
    sourceBindings,
    target,
    profile,
    contracts,
    replay,
    lineages,
  }, candidateDomain);
  const commonChecks = {
    sameProcessGenesisObservationVerified: true as const,
    sameProcessTrackerCompilationVerified: true as const,
    sameProcessFamilyCompilationVerified: true as const,
    stableCompilerSemanticsMatched: true as const,
    stableManifestPayloadSemanticsMatched: true as const,
    exactObservedGenesisInputsConsumed: true as const,
    singletonIdsEqualGenesisInputIds: true as const,
    exactCreationHeightsBound: true as const,
    predictedTransactionAndOutputIdsBound: true as const,
    unsignedConstructionOnly: true as const,
    callerTargetApprovalAccepted: false as const,
  };
  const checks = !isGreenfieldManifest
    ? {
      ...commonChecks,
      sameProcessCutoverGenerationVerified: true as const,
      globalReplayImportedIntoDuplicatePrevention: true as const,
    }
    : {
      ...commonChecks,
      sameProcessGreenfieldGenerationVerified: true as const,
      authenticatedGreenfieldLaunchBaselineConsumed: true as const,
      allPredecessorRoutesNotInstantiatedUnderFederatedTrust: true as const,
      emptyReplayDerivedFromQuorumAuthenticatedNonInstantiation: true as const,
      exactSignedErgoHistoryMatchedObservation: true as const,
      migrationCutoverArtifactConsumed: false as const,
    };
  const binding = {
    schema,
    version: 1 as const,
    status: 'unsigned_non_authorizing_candidate' as const,
    targetGenerationCandidateIdHex,
    sourceBindings,
    target,
    profile,
    contracts,
    replay,
    transactions,
    boxes,
    lineages,
    economics: {
      stateBoxValueNanoErg: stateBoxValue.toString(),
      issuanceFeeNanoErg: issuanceFee.toString(),
      feesFundedOnlyByGenesisInputs: true as const,
    },
    checks,
    stages: {
      construction: 'unsigned-plan-complete' as const,
      setupCheckRequest: 'not-created' as const,
      jvmCheck: 'not-performed' as const,
      signing: 'not-authorized' as const,
      submission: 'not-authorized' as const,
      broadcastAuthorization: 'not-granted' as const,
      confirmation: 'not-established' as const,
    },
    boundaries: {
      ...falseBoundaries(),
      ...(isGreenfieldManifest
        ? {
          greenfieldLaunchBaselineAuthenticated: true as const,
          predecessorRouteNonInstantiationAcceptedUnderFederatedTrust:
            true as const,
        }
        : {}),
    },
  };
  const planDomain = !isGreenfieldManifest
    ? PLAN_DIGEST_DOMAIN
    : GREENFIELD_PLAN_DIGEST_DOMAIN;
  const plan = deepFreeze({
    ...binding,
    planDigestHex: sha256CanonicalJson(binding, planDomain),
  });
  (!isGreenfieldManifest ? plans : greenfieldPlans).add(plan);
  return plan as Readonly<
    | SubstrateFederatedGenesisProvisioningV1Plan
    | SubstrateFederatedGreenfieldGenesisProvisioningV1Plan
  >;
}

export function assertSubstrateFederatedGenesisProvisioningV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedGenesisProvisioningV1Plan> {
  if (value === null || typeof value !== 'object' || !plans.has(value)) {
    throw new Error(
      'federated genesis provisioning plan was not built in this process',
    );
  }
  const candidate = value as SubstrateFederatedGenesisProvisioningV1Plan;
  const { planDigestHex, ...withoutDigest } = candidate;
  if (sha256CanonicalJson(withoutDigest, PLAN_DIGEST_DOMAIN) !== planDigestHex) {
    throw new Error('federated genesis provisioning plan digest drifted');
  }
}

export function assertSubstrateFederatedGreenfieldGenesisProvisioningV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedGreenfieldGenesisProvisioningV1Plan> {
  if (
    value === null
    || typeof value !== 'object'
    || !greenfieldPlans.has(value)
  ) {
    throw new Error(
      'federated greenfield genesis provisioning plan was not built in this process',
    );
  }
  const candidate = value as SubstrateFederatedGreenfieldGenesisProvisioningV1Plan;
  const { planDigestHex, ...withoutDigest } = candidate;
  if (
    sha256CanonicalJson(withoutDigest, GREENFIELD_PLAN_DIGEST_DOMAIN)
      !== planDigestHex
  ) {
    throw new Error('federated greenfield genesis provisioning digest drifted');
  }
}

function assertGreenfieldErgoHistoryObservationJoin(
  input: Readonly<BuildFederatedGenesisProvisioningV1Input>,
): void {
  const manifest = input.generationManifest;
  if (manifest.schema !== SUBSTRATE_FEDERATED_GREENFIELD_GENERATION_V1_SCHEMA) {
    throw new Error('greenfield history join requires a greenfield generation');
  }
  const genesis = manifest.launchBaseline.ergoGenesis;
  const setupAnchor = manifest.launchBaseline.ergoSetupAnchor;
  if (
    input.observation.target.genesisHeaderHeight !== genesis.height
    || input.observation.target.genesisHeaderIdHex !== genesis.headerIdHex
    || input.targetProfile.expectedGenesisHeaderIdHex !== genesis.headerIdHex
    || input.observation.target.tipHeight !== setupAnchor.height
    || input.observation.target.tipHeaderIdHex !== setupAnchor.headerIdHex
  ) {
    throw new Error(
      'greenfield signed Ergo genesis or setup anchor does not match the exact observation',
    );
  }
}

function assertObservationAndCompilerJoin(
  input: Readonly<BuildFederatedGenesisProvisioningV1Input>,
  family: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>,
): void {
  if (
    input.observation.target.network !== 'testnet'
    || input.targetProfile.expectedNetwork !== 'testnet'
    || input.generationManifest.generation.settlementNetworkId !== 'ergo-testnet'
    || input.generationManifest.generation.sourceNetworkScope !== 'public-testnet'
  ) {
    throw new Error(
      'federated provisioning requires the exact non-mainnet testnet scope',
    );
  }
  const observed = {
    tracker: input.observation.boxes.tracker.box.boxId,
    duplicatePrevention:
      input.observation.boxes.duplicatePrevention.box.boxId,
    pooledReserve: input.observation.boxes.pooledReserve.box.boxId,
  };
  if (
    input.trackerRequest.trackerNftIdHex !== observed.tracker
    || family.trackerNftIdHex !== observed.tracker
    || family.duplicatePreventionNftIdHex !== observed.duplicatePrevention
    || family.pooledReserveNftIdHex !== observed.pooledReserve
    || family.trackerContractIdHex
      !== input.trackerReceipt.contract.contractIdHex
    || family.trackerTemplateSourceSha256Hex
      !== input.trackerRequest.template.templateSourceSha256Hex
  ) {
    throw new Error(
      'federated compiler lineage does not match the observed genesis inputs',
    );
  }
  if (new Set(Object.values(observed)).size !== 3) {
    throw new Error('federated observed genesis inputs are not pairwise distinct');
  }
}

function assertManifestSemanticBaseline(
  input: Readonly<BuildFederatedGenesisProvisioningV1Input>,
  family: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>,
  manifestFamily: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>,
): void {
  const application = input.trackerRequest.application;
  const sourceRuntime = input.generationManifest.target.sourceRuntime;
  const applicationProjection = {
    sourceNetworkIdHex: application.sourceNetworkIdHex,
    sidechainIdHex: application.sidechainIdHex,
    bridgeAddressHex: application.bridgeAddressHex,
    tokenAddressHex: application.tokenAddressHex,
    bridgeRuntimeCodeSha256Hex: application.bridgeRuntimeCodeSha256Hex,
    bridgeRuntimeCodeBytes: application.bridgeRuntimeCodeBytes,
    tokenRuntimeCodeSha256Hex: application.tokenRuntimeCodeSha256Hex,
    tokenRuntimeCodeBytes: application.tokenRuntimeCodeBytes,
    sourceRuntimeCodeSha256Hex: application.sourceRuntimeCodeSha256Hex,
    sourceRuntimeCodeBytes: application.sourceRuntimeCodeBytes,
    runtimeProfileIdHex: application.runtimeProfileIdHex,
  };
  const manifestApplicationProjection = {
    sourceNetworkIdHex: sourceRuntime.sourceNetworkIdHex,
    sidechainIdHex: sourceRuntime.sidechainIdHex,
    bridgeAddressHex: sourceRuntime.bridgeAddressHex,
    tokenAddressHex: sourceRuntime.tokenAddressHex,
    bridgeRuntimeCodeSha256Hex: sourceRuntime.bridgeRuntimeCodeSha256Hex,
    bridgeRuntimeCodeBytes: sourceRuntime.bridgeRuntimeCodeBytes,
    tokenRuntimeCodeSha256Hex: sourceRuntime.tokenRuntimeCodeSha256Hex,
    tokenRuntimeCodeBytes: sourceRuntime.tokenRuntimeCodeBytes,
    sourceRuntimeCodeSha256Hex: sourceRuntime.sourceRuntimeCodeSha256Hex,
    sourceRuntimeCodeBytes: sourceRuntime.sourceRuntimeCodeBytes,
    runtimeProfileIdHex: sourceRuntime.runtimeProfileIdHex,
  };
  const trackerProfile = input.trackerRequest.profile;
  const federation = input.generationManifest.target.federation;
  const federationProjection = {
    federationProfileIdHex: trackerProfile.profileIdHex,
    federationEpoch: trackerProfile.federationEpoch,
    sourceAttestationKeySetDigestHex:
      trackerProfile.sourceAttestationKeySetDigestHex,
    sourceAttestationThreshold: trackerProfile.sourceAttestationThreshold,
    ergoAdmissionKeySetDigestHex: trackerProfile.ergoAdmissionKeySetDigestHex,
    ergoAdmissionThreshold: trackerProfile.ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex: trackerProfile.ergoAdmissionPublicKeysHex,
  };
  const manifestFederationProjection = {
    federationProfileIdHex: federation.federationProfileIdHex,
    federationEpoch: federation.federationEpoch,
    sourceAttestationKeySetDigestHex:
      federation.sourceAttestationKeySetDigestHex,
    sourceAttestationThreshold: federation.sourceAttestationThreshold,
    ergoAdmissionKeySetDigestHex: federation.ergoAdmissionKeySetDigestHex,
    ergoAdmissionThreshold: federation.ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex: federation.ergoAdmissionPublicKeysHex,
  };
  if (
    canonicalJson(applicationProjection)
      !== canonicalJson(manifestApplicationProjection)
    || canonicalJson(federationProjection)
      !== canonicalJson(manifestFederationProjection)
    || application.settlementProfileIdHex
      !== input.generationManifest.target.profile.settlementProfileIdHex
    || canonicalJson(stableFamilySemantics(family))
      !== canonicalJson(stableFamilySemantics(manifestFamily))
  ) {
    throw new Error(
      'federated compiler semantics do not match the FED-5A generation baseline',
    );
  }
  const payloads = input.generationManifest.target.genesisPayloads;
  if (
    payloads.importedReplayDigestHex
      !== input.generationManifest.globalReplay.duplicatePreventionDigestHex
    || payloads.emptyTrackerDigestHex
      !== getSubstrateFederatedTrackerDigestV1Hex([])
    || payloads.emptyDepositDigestHex !== getPooledReserveEmptyDigest()
  ) {
    throw new Error('federated generation digest semantics drifted');
  }
}

function stableFamilySemantics(
  profile: Readonly<SubstrateFederatedSettlementFamilyV1DecodedProfile>,
): Readonly<Record<string, string | number>> {
  const {
    trackerNftIdHex: _trackerNftIdHex,
    duplicatePreventionNftIdHex: _duplicatePreventionNftIdHex,
    pooledReserveNftIdHex: _pooledReserveNftIdHex,
    trackerContractIdHex: _trackerContractIdHex,
    ...stable
  } = profile;
  return stable;
}

function manifestStateBoxValue(
  manifest: Readonly<
    | SubstrateFederatedCutoverGenerationV1Manifest
    | SubstrateFederatedGreenfieldGenerationV1Manifest
  >,
): bigint {
  const payloads = manifest.target.genesisPayloads;
  const values = [
    payloads.tracker.valueNanoErg,
    payloads.duplicatePrevention.valueNanoErg,
    payloads.pooledReserve.valueNanoErg,
  ];
  if (new Set(values).size !== 1 || !/^[1-9][0-9]*$/.test(values[0]!)) {
    throw new Error('federated generation state-box values are inconsistent');
  }
  const value = BigInt(values[0]!);
  if (value < MIN_BOX_VALUE) {
    throw new Error('federated generation state-box value is below minimum');
  }
  return value;
}

function assertStableManifestPayloadJoin(
  manifest: Readonly<
    | SubstrateFederatedCutoverGenerationV1Manifest
    | SubstrateFederatedGreenfieldGenerationV1Manifest
  >,
  boxes: Readonly<{
    tracker: Eip12Box;
    duplicatePrevention: Eip12Box;
    pooledReserve: Eip12Box;
  }>,
): void {
  const payloads = manifest.target.genesisPayloads;
  const expected = {
    tracker: stableManifestPayloadProjection(
      payloads.tracker,
      'tracker',
      ['R4', 'R5', 'R6', 'R7', 'R8', 'R9'],
    ),
    duplicatePrevention: stableManifestPayloadProjection(
      payloads.duplicatePrevention,
      'duplicate-prevention',
      ['R5'],
    ),
    pooledReserve: stableManifestPayloadProjection(
      payloads.pooledReserve,
      'pooled-reserve',
      ['R5', 'R6'],
    ),
  };
  const actual = {
    tracker: stableBoxPayloadProjection(
      boxes.tracker,
      'tracker',
      ['R4', 'R5', 'R6', 'R7', 'R8', 'R9'],
    ),
    duplicatePrevention: stableBoxPayloadProjection(
      boxes.duplicatePrevention,
      'duplicate-prevention',
      ['R5'],
    ),
    pooledReserve: stableBoxPayloadProjection(
      boxes.pooledReserve,
      'pooled-reserve',
      ['R5', 'R6'],
    ),
  };
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(
      'federated materialized payloads do not match the stable FED-5A baseline',
    );
  }
}

function stableManifestPayloadProjection(
  payload: Readonly<{
    role: string;
    valueNanoErg: string;
    assets: readonly Readonly<{ amount: string }>[];
    additionalRegisters: Readonly<Record<string, string>>;
  }>,
  role: string,
  registerKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (payload.role !== role || payload.assets.length !== 1) {
    throw new Error(`federated ${role} baseline payload shape drifted`);
  }
  return {
    role,
    valueNanoErg: payload.valueNanoErg,
    singletonAmount: payload.assets[0]!.amount,
    stableRegisters: selectRegisters(
      payload.additionalRegisters,
      registerKeys,
      `federated ${role} baseline register`,
    ),
  };
}

function stableBoxPayloadProjection(
  box: Eip12Box,
  role: string,
  registerKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (box.assets.length !== 1) {
    throw new Error(`federated ${role} materialized asset shape drifted`);
  }
  return {
    role,
    valueNanoErg: box.value,
    singletonAmount: box.assets[0]!.amount,
    stableRegisters: selectRegisters(
      box.additionalRegisters,
      registerKeys,
      `federated ${role} materialized register`,
    ),
  };
}

function selectRegisters(
  registers: Readonly<Record<string, string>>,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(keys.map(key => {
    const value = registers[key];
    if (typeof value !== 'string') {
      throw new Error(`${label} ${key} is missing`);
    }
    return [key, value];
  })));
}

function lineage(
  genesisInput: Eip12Box,
  transaction: MaterializedUnsignedTransaction,
  creationHeight: number,
): Readonly<ProvisionedLineageV1> {
  return {
    genesisInputBoxIdHex: genesisInput.boxId,
    singletonTokenIdHex: genesisInput.boxId,
    issuanceTransactionIdHex: transaction.txId,
    stateOutputBoxIdHex: transaction.outputs[0]!.boxId,
    stateOutputIndex: 0 as const,
    creationHeight,
  };
}

function contractBinding(input: Readonly<{
  propositionBytes: number;
  propositionSha256Hex: string;
  contractIdHex: string;
}>): Readonly<ProvisionedContractV1> {
  if (!Number.isSafeInteger(input.propositionBytes) || input.propositionBytes <= 0) {
    throw new Error('federated proposition byte length is invalid');
  }
  return {
    propositionBytes: input.propositionBytes,
    propositionSha256Hex: fixedHex(
      input.propositionSha256Hex,
      32,
      'federated proposition SHA-256',
    ),
    contractIdHex: fixedHex(
      input.contractIdHex,
      32,
      'federated contract ID',
    ),
  };
}

function falseBoundaries(): SubstrateFederatedGenesisProvisioningV1Plan[
  'boundaries'
] {
  return Object.freeze({
    sourceControlledTargetProfileApprovalAuthenticated: false as const,
    declaredSourceCustodyAuthenticated: false as const,
    targetNetworkConsensusAuthenticated: false as const,
    tipUtxoAtomicityProved: false as const,
    setupCheckRequestFrozen: false as const,
    targetNodeAcceptanceEstablished: false as const,
    nodeCheckPerformed: false as const,
    signingAuthorityEstablished: false as const,
    submissionAuthorityEstablished: false as const,
    broadcastAuthorityEstablished: false as const,
    singletonLineagesEstablished: false as const,
    legacyRoutesRetired: false as const,
    profileActivated: false as const,
    confirmationEstablished: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function positiveHeight(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be canonical lowercase ${bytes}-byte hex`);
  }
  return value;
}

function snapshotProvisioningInput(
  rawInput: unknown,
): Readonly<BuildFederatedGenesisProvisioningV1Input> {
  const input = snapshotExactDataProperties(rawInput, [
    'targetProfile',
    'observation',
    'trackerRequest',
    'trackerReceipt',
    'familyTemplates',
    'familyReceipt',
    'generationManifest',
  ], 'substrate federated genesis provisioning input');
  const templates = snapshotExactDataProperties(input.familyTemplates, [
    'duplicatePrevention',
    'sourceLock',
    'pooledReserve',
  ], 'substrate federated genesis provisioning templates');
  const snapshotTemplate = (
    value: unknown,
    label: string,
  ): Readonly<SubstrateFederatedSettlementFamilyV1Template> =>
    snapshotExactDataProperties(value, [
      'relativePath',
      'source',
    ], label) as Readonly<SubstrateFederatedSettlementFamilyV1Template>;
  return Object.freeze({
    targetProfile: input.targetProfile,
    observation: input.observation,
    trackerRequest: input.trackerRequest,
    trackerReceipt: input.trackerReceipt,
    familyTemplates: Object.freeze({
      duplicatePrevention: snapshotTemplate(
        templates.duplicatePrevention,
        'substrate federated duplicate-prevention template',
      ),
      sourceLock: snapshotTemplate(
        templates.sourceLock,
        'substrate federated source-lock template',
      ),
      pooledReserve: snapshotTemplate(
        templates.pooledReserve,
        'substrate federated pooled-reserve template',
      ),
    }),
    familyReceipt: input.familyReceipt,
    generationManifest: input.generationManifest,
  }) as Readonly<BuildFederatedGenesisProvisioningV1Input>;
}

function snapshotExactDataProperties(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== 'string')) {
    throw new Error(`${label} keys are invalid`);
  }
  const actual = (ownKeys as string[]).sort();
  const expected = [...keys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} keys are invalid`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new Error(`${label} must use enumerable own data properties`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
