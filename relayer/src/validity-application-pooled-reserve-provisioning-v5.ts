/**
 * Pure, source-only provisioning plan for the distinct V5 settlement lineage.
 * It constructs unsigned candidates and cannot check, sign, submit, broadcast,
 * confirm, activate, or authorize funds.
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
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V5_BYTES,
  getValidityApplicationPooledReserveTrackerDigestV5Hex,
} from './validity-application-pooled-reserve-burn-settlement-v5.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV5Candidate,
  type ValidityApplicationPooledReserveInstanceV5Candidate,
} from './validity-application-pooled-reserve-instance-v5.js';
import {
  assertValidityApplicationPooledReserveReplayCutoverV5Provenance,
  buildValidityApplicationPooledReserveReplayCutoverV5,
  type ValidityApplicationPooledReserveReplayCutoverV5Packet,
} from './validity-application-pooled-reserve-replay-cutover-v5.js';
import {
  sha256CanonicalJson,
} from './strict-json.js';
import {
  materializeUnsignedTransaction,
  normalizeEip12Box,
  type Eip12Box,
  type Eip12OutputCandidate,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';
import type {
  ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet,
} from './validity-application-pooled-reserve-historical-replay-genesis-v4.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V5_SCHEMA =
  'e2s.validity-application-pooled-reserve-provisioning.v5' as const;

const PLAN_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V5';
const MIN_BOX_VALUE = 1_000_000n;
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const INSERT_ONLY_AVL_FLAGS = 0x01;
const packets = new WeakSet<object>();

type ContractRole =
  | 'tracker'
  | 'duplicatePrevention'
  | 'sourceLock'
  | 'pooledReserve';

export interface ValidityApplicationPooledReserveProvisioningValuesV5 {
  readonly trackerNanoErg: string | number | bigint;
  readonly duplicatePreventionNanoErg: string | number | bigint;
  readonly pooledReserveNanoErg: string | number | bigint;
}

export interface ValidityApplicationPooledReserveProvisioningFeesV5 {
  readonly trackerIssuanceNanoErg?: string | number | bigint;
  readonly duplicatePreventionIssuanceNanoErg?: string | number | bigint;
  readonly pooledReserveIssuanceNanoErg?: string | number | bigint;
}

export interface ValidityApplicationPooledReserveProvisioningHeightsV5 {
  readonly trackerIssuance: number;
  readonly duplicatePreventionIssuance: number;
  readonly pooledReserveIssuance: number;
}

export interface BuildValidityApplicationPooledReserveProvisioningV5Input {
  readonly compiledInstance: Readonly<
    ValidityApplicationPooledReserveInstanceV5Candidate
  >;
  readonly historicalReplayGenesis: Readonly<
    ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet
  >;
  readonly targetNetwork: {
    readonly ergoNetworkId: 'ergo-testnet';
    readonly ergoAddressNetworkPrefix: 16;
    readonly ergoGenesisBlockIdHex: string;
    readonly sourceNetworkIdHex: string;
    readonly sidechainIdHex: string;
    readonly settlementProfileIdHex: string;
  };
  readonly trackerGenesisInputBox: Eip12Box;
  readonly duplicatePreventionGenesisInputBox: Eip12Box;
  readonly settlementVaultGenesisInputBox: Eip12Box;
  readonly values: ValidityApplicationPooledReserveProvisioningValuesV5;
  readonly fees?: ValidityApplicationPooledReserveProvisioningFeesV5;
  readonly creationHeights:
    ValidityApplicationPooledReserveProvisioningHeightsV5;
}

export interface ValidityApplicationPooledReserveProvisioningV5Plan {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V5_SCHEMA;
  readonly version: 5;
  readonly planDigestHex: string;
  readonly targetNetwork: Readonly<{
    readonly ergoNetworkId: 'ergo-testnet';
    readonly ergoAddressNetworkPrefix: 16;
    readonly p2sAddressHeader: 19;
    readonly ergoGenesisBlockIdHex: string;
    readonly sourceNetworkIdHex: string;
    readonly sidechainIdHex: string;
    readonly settlementProfileIdHex: string;
  }>;
  readonly profile: Readonly<{
    readonly targetLineageProfileIdHex: string;
    readonly sourceRuntimeLineageProfileIdHex: string;
    readonly sourceRuntimeProfileIdHex: string;
    readonly burnBindingDigestHex: string;
    readonly finalityPolicyIdHex: string;
    readonly proofSystemIdHex: string;
    readonly proofProfileIdHex: string;
    readonly approvedTrustAnchorDigestHex: string;
  }>;
  readonly contracts: Readonly<Record<ContractRole, Readonly<{
    readonly templateSha256Hex: string;
    readonly resolvedSourceSha256Hex: string;
    readonly propositionSha256Hex: string;
    readonly contractIdHex: string;
  }>>>;
  readonly lineage: Readonly<{
    readonly trackerGenesisInputBoxIdHex: string;
    readonly trackerNftIdHex: string;
    readonly duplicatePreventionGenesisInputBoxIdHex: string;
    readonly duplicatePreventionNftIdHex: string;
    readonly pooledReserveGenesisInputBoxIdHex: string;
    readonly pooledReserveNftIdHex: string;
    readonly historicalReplayGenesisPacketDigestHex: string;
    readonly cutoverObservationReportDigestHex: string;
    readonly replayCutoverPacketDigestHex: string;
    readonly plannedCanonicalBurnIdsHex: readonly string[];
    readonly plannedCanonicalBurnIdCount: number;
    readonly plannedReplayDigestHex: string;
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
  readonly pooledReserveGenesisSeedNanoErg: string;
  readonly invariants: Readonly<{
    readonly exactTargetNetworkBound: true;
    readonly exactCompiledV5ContractFamilyBound: true;
    readonly allGenesisInputsPairwiseDistinct: true;
    readonly singletonIdsEqualDesignatedGenesisInputs: true;
    readonly genesisInputsArePureErgAndRegisterFree: true;
    readonly globalV4ReplayStateBoundIntoV5Plan: true;
    readonly pooledReserveStartsWithZeroLiability: true;
    readonly unsignedConstructionOnly: true;
  }>;
  readonly stages: Readonly<{
    readonly construction: 'unsigned-plan-complete';
    readonly jvmCheck: 'not-performed';
    readonly signing: 'not-authorized';
    readonly submission: 'not-authorized';
    readonly broadcastAuthorization: 'not-granted';
    readonly confirmation: 'not-established';
  }>;
  readonly boundaries: Readonly<{
    readonly targetNetworkIdentityAuthenticated: false;
    readonly replayInventoryExhaustivenessAuthenticated: false;
    readonly legacyRoutesRetired: false;
    readonly singletonLineagesEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly nodeCheckPerformed: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly confirmationEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export async function buildValidityApplicationPooledReserveProvisioningV5(
  input: BuildValidityApplicationPooledReserveProvisioningV5Input,
): Promise<Readonly<ValidityApplicationPooledReserveProvisioningV5Plan>> {
  assertExactKeys(input, [
    'compiledInstance',
    'historicalReplayGenesis',
    'targetNetwork',
    'trackerGenesisInputBox',
    'duplicatePreventionGenesisInputBox',
    'settlementVaultGenesisInputBox',
    'values',
    'fees',
    'creationHeights',
  ], 'pooled-reserve V5 provisioning input', ['fees']);
  assertCompiledValidityApplicationPooledReserveInstanceV5Candidate(
    input.compiledInstance,
  );
  assertExactKeys(input.targetNetwork, [
    'ergoNetworkId',
    'ergoAddressNetworkPrefix',
    'ergoGenesisBlockIdHex',
    'sourceNetworkIdHex',
    'sidechainIdHex',
    'settlementProfileIdHex',
  ], 'pooled-reserve V5 target network');
  assertExactKeys(input.values, [
    'trackerNanoErg',
    'duplicatePreventionNanoErg',
    'pooledReserveNanoErg',
  ], 'pooled-reserve V5 provisioning values');
  assertExactKeys(input.creationHeights, [
    'trackerIssuance',
    'duplicatePreventionIssuance',
    'pooledReserveIssuance',
  ], 'pooled-reserve V5 provisioning heights');
  if (input.fees !== undefined) {
    assertExactKeys(input.fees, [
      'trackerIssuanceNanoErg',
      'duplicatePreventionIssuanceNanoErg',
      'pooledReserveIssuanceNanoErg',
    ], 'pooled-reserve V5 provisioning fees', [
      'trackerIssuanceNanoErg',
      'duplicatePreventionIssuanceNanoErg',
      'pooledReserveIssuanceNanoErg',
    ]);
  }

  const compiled = input.compiledInstance;
  const profile = decodePegInPooledReserveLineageProfileV4Hex(
    compiled.encodedLineageProfileHex,
  );
  const targetNetwork = bindTargetNetwork(input.targetNetwork, profile);
  const [trackerGenesis, duplicatePreventionGenesis, pooledReserveGenesis] =
    await Promise.all([
      normalizeGenesis(
        input.trackerGenesisInputBox,
        compiled.genesis.trackerInputBoxIdHex,
        'tracker',
      ),
      normalizeGenesis(
        input.duplicatePreventionGenesisInputBox,
        compiled.genesis.duplicatePreventionInputBoxIdHex,
        'duplicate-prevention',
      ),
      normalizeGenesis(
        input.settlementVaultGenesisInputBox,
        compiled.genesis.settlementVaultInputBoxIdHex,
        'pooled-reserve',
      ),
    ]);
  assertPairwiseDistinct([
    trackerGenesis.boxId,
    duplicatePreventionGenesis.boxId,
    pooledReserveGenesis.boxId,
  ]);

  const values = {
    tracker: atLeastMinBox(
      input.values.trackerNanoErg,
      'V5 tracker singleton value',
    ),
    duplicatePrevention: atLeastMinBox(
      input.values.duplicatePreventionNanoErg,
      'V5 duplicate-prevention singleton value',
    ),
    pooledReserve: atLeastMinBox(
      input.values.pooledReserveNanoErg,
      'V5 pooled-reserve singleton value',
    ),
  };
  const fees = {
    tracker: atLeastMinBox(
      input.fees?.trackerIssuanceNanoErg ?? MINER_FEE,
      'V5 tracker issuance fee',
    ),
    duplicatePrevention: atLeastMinBox(
      input.fees?.duplicatePreventionIssuanceNanoErg ?? MINER_FEE,
      'V5 duplicate-prevention issuance fee',
    ),
    pooledReserve: atLeastMinBox(
      input.fees?.pooledReserveIssuanceNanoErg ?? MINER_FEE,
      'V5 pooled-reserve issuance fee',
    ),
  };
  const heights = normalizeHeights(
    input.creationHeights,
    trackerGenesis,
    duplicatePreventionGenesis,
    pooledReserveGenesis,
  );
  const profileRegister = encodeCollByteRegister(Buffer.from(
    fixedHex(compiled.lineageProfileIdHex, 32, 'V5 lineage profile ID'),
    'hex',
  ));
  const trackerRegisters = {
    R4: profileRegister,
    R5: encodeAvlTreeRegister(
      Buffer.from(
        getValidityApplicationPooledReserveTrackerDigestV5Hex([]),
        'hex',
      ),
      INSERT_ONLY_AVL_FLAGS,
      VALIDITY_APPLICATION_POOLED_RESERVE_TRACKER_VALUE_V5_BYTES,
    ),
    R6: encodeCollByteRegister(Buffer.from(targetNetwork.sidechainIdHex, 'hex')),
    R7: encodeLongRegister(0),
    R8: encodeIntRegister(0),
    R9: encodeCollByteRegister(Buffer.from(
      fixedHex(
        compiled.sidechainFinalityPolicy.approvedTrustAnchorDigestHex,
        32,
        'V5 approved trust-anchor digest',
      ),
      'hex',
    )),
  };
  const pooledReserveRegisters = {
    R4: profileRegister,
    R5: encodeAvlTreeRegister(
      Buffer.from(getPooledReserveEmptyDigest(), 'hex'),
      INSERT_ONLY_AVL_FLAGS,
      32,
    ),
    R6: encodeLongRegister(0),
  };

  const [trackerIssuance, replayCutover, pooledReserveIssuance] =
    await Promise.all([
      buildSingletonIssuance({
        label: 'validity application pooled-reserve V5 tracker issuance',
        genesisInput: trackerGenesis,
        expectedNftIdHex: compiled.genesis.trackerNftIdHex,
        propositionHex: compiled.contracts.tracker.receipt.propositionHex,
        registers: trackerRegisters,
        singletonValue: values.tracker,
        fee: fees.tracker,
        creationHeight: heights.trackerIssuance,
      }),
      buildValidityApplicationPooledReserveReplayCutoverV5({
        compiledInstance: compiled,
        historicalReplayGenesis: input.historicalReplayGenesis,
        duplicatePreventionGenesisInputBox: duplicatePreventionGenesis,
        duplicatePreventionNanoErg: values.duplicatePrevention,
        creationHeight: heights.duplicatePreventionIssuance,
        feeNanoErg: fees.duplicatePrevention,
      }),
      buildSingletonIssuance({
        label: 'validity application pooled-reserve V5 reserve issuance',
        genesisInput: pooledReserveGenesis,
        expectedNftIdHex: compiled.genesis.settlementVaultNftIdHex,
        propositionHex: compiled.contracts.pooledReserve.receipt.propositionHex,
        registers: pooledReserveRegisters,
        singletonValue: values.pooledReserve,
        fee: fees.pooledReserve,
        creationHeight: heights.pooledReserveIssuance,
      }),
    ]);
  assertValidityApplicationPooledReserveReplayCutoverV5Provenance(
    replayCutover,
  );

  const contracts = bindContracts(compiled);
  const profileBinding = Object.freeze({
    targetLineageProfileIdHex: fixedHex(
      compiled.lineageProfileIdHex,
      32,
      'V5 target lineage profile ID',
    ),
    sourceRuntimeLineageProfileIdHex: fixedHex(
      compiled.sourceRuntimeLineageProfileIdHex,
      32,
      'V5 source runtime lineage profile ID',
    ),
    sourceRuntimeProfileIdHex: fixedHex(
      compiled.application.runtimeProfileIdHex,
      32,
      'V5 source runtime profile ID',
    ),
    burnBindingDigestHex: fixedHex(
      compiled.application.burnBindingDigestHex,
      32,
      'V5 burn binding digest',
    ),
    finalityPolicyIdHex: fixedHex(
      compiled.sidechainFinalityPolicy.policyIdHex,
      32,
      'V5 finality policy ID',
    ),
    proofSystemIdHex: fixedHex(
      compiled.sidechainFinalityPolicy.proofSystemIdHex,
      32,
      'V5 proof-system ID',
    ),
    proofProfileIdHex: fixedHex(
      compiled.sidechainFinalityPolicy.proofProfileIdHex,
      32,
      'V5 proof-profile ID',
    ),
    approvedTrustAnchorDigestHex: fixedHex(
      compiled.sidechainFinalityPolicy.approvedTrustAnchorDigestHex,
      32,
      'V5 approved trust-anchor digest',
    ),
  });
  const lineage = Object.freeze({
    trackerGenesisInputBoxIdHex: trackerGenesis.boxId,
    trackerNftIdHex: fixedHex(
      compiled.genesis.trackerNftIdHex,
      32,
      'V5 tracker NFT ID',
    ),
    duplicatePreventionGenesisInputBoxIdHex: duplicatePreventionGenesis.boxId,
    duplicatePreventionNftIdHex: fixedHex(
      compiled.genesis.duplicatePreventionNftIdHex,
      32,
      'V5 duplicate-prevention NFT ID',
    ),
    pooledReserveGenesisInputBoxIdHex: pooledReserveGenesis.boxId,
    pooledReserveNftIdHex: fixedHex(
      compiled.genesis.settlementVaultNftIdHex,
      32,
      'V5 pooled-reserve NFT ID',
    ),
    historicalReplayGenesisPacketDigestHex: fixedHex(
      replayCutover.sourceReplay.historicalReplayGenesisPacketDigestHex,
      32,
      'V5 historical replay-genesis packet digest',
    ),
    cutoverObservationReportDigestHex: fixedHex(
      replayCutover.sourceReplay.cutoverObservationReportDigestHex,
      32,
      'V5 cutover observation report digest',
    ),
    replayCutoverPacketDigestHex: fixedHex(
      replayCutover.packetDigestHex,
      32,
      'V5 replay-cutover packet digest',
    ),
    plannedCanonicalBurnIdsHex: Object.freeze([
      ...replayCutover.sourceReplay.canonicalBurnIdsHex,
    ]),
    plannedCanonicalBurnIdCount:
      replayCutover.sourceReplay.canonicalBurnIdCount,
    plannedReplayDigestHex: fixedHex(
      replayCutover.sourceReplay.duplicatePreventionDigestHex,
      33,
      'V5 planned replay digest',
    ),
  });
  const binding = {
    schema: VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V5_SCHEMA,
    version: 5 as const,
    targetNetwork,
    profile: profileBinding,
    contracts,
    lineage,
    transactions: Object.freeze({
      trackerIssuance,
      duplicatePreventionIssuance: replayCutover.transaction,
      pooledReserveIssuance,
    }),
    boxes: Object.freeze({
      tracker: trackerIssuance.outputs[0]!,
      duplicatePrevention: replayCutover.duplicatePreventionBox,
      pooledReserve: pooledReserveIssuance.outputs[0]!,
    }),
    pooledReserveGenesisSeedNanoErg: values.pooledReserve.toString(),
    invariants: Object.freeze({
      exactTargetNetworkBound: true as const,
      exactCompiledV5ContractFamilyBound: true as const,
      allGenesisInputsPairwiseDistinct: true as const,
      singletonIdsEqualDesignatedGenesisInputs: true as const,
      genesisInputsArePureErgAndRegisterFree: true as const,
      globalV4ReplayStateBoundIntoV5Plan: true as const,
      pooledReserveStartsWithZeroLiability: true as const,
      unsignedConstructionOnly: true as const,
    }),
    stages: Object.freeze({
      construction: 'unsigned-plan-complete' as const,
      jvmCheck: 'not-performed' as const,
      signing: 'not-authorized' as const,
      submission: 'not-authorized' as const,
      broadcastAuthorization: 'not-granted' as const,
      confirmation: 'not-established' as const,
    }),
    boundaries: Object.freeze({
      targetNetworkIdentityAuthenticated: false as const,
      replayInventoryExhaustivenessAuthenticated: false as const,
      legacyRoutesRetired: false as const,
      singletonLineagesEstablished: false as const,
      reserveLineageEstablished: false as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      confirmationEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  };
  const plan = deepFreeze({
    ...binding,
    planDigestHex: sha256CanonicalJson(binding, PLAN_DIGEST_DOMAIN),
  });
  packets.add(plan);
  return plan;
}

export function assertValidityApplicationPooledReserveProvisioningV5Provenance(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveProvisioningV5Plan
> {
  if (value === null || typeof value !== 'object' || !packets.has(value)) {
    throw new Error(
      'pooled-reserve V5 provisioning plan was not built in this process',
    );
  }
}

function bindTargetNetwork(
  input: BuildValidityApplicationPooledReserveProvisioningV5Input[
    'targetNetwork'
  ],
  profile: ReturnType<typeof decodePegInPooledReserveLineageProfileV4Hex>,
): ValidityApplicationPooledReserveProvisioningV5Plan['targetNetwork'] {
  if (
    input.ergoNetworkId !== 'ergo-testnet'
    || input.ergoAddressNetworkPrefix !== 16
  ) {
    throw new Error(
      'V5 provisioning is restricted to the exact Ergo testnet network prefix',
    );
  }
  const sourceNetworkIdHex = fixedHex(
    input.sourceNetworkIdHex,
    32,
    'V5 source network ID',
  );
  const sidechainIdHex = fixedHex(
    input.sidechainIdHex,
    32,
    'V5 sidechain ID',
  );
  const settlementProfileIdHex = fixedHex(
    input.settlementProfileIdHex,
    32,
    'V5 settlement profile ID',
  );
  if (
    sourceNetworkIdHex
      !== fixedHex(profile.sourceNetworkIdHex, 32, 'compiled source network ID')
    || sidechainIdHex
      !== fixedHex(profile.sidechainIdHex, 32, 'compiled sidechain ID')
    || settlementProfileIdHex
      !== fixedHex(
        profile.settlementProfileIdHex,
        32,
        'compiled settlement profile ID',
      )
  ) {
    throw new Error(
      'V5 target network does not match the compiled settlement profile',
    );
  }
  return Object.freeze({
    ergoNetworkId: 'ergo-testnet' as const,
    ergoAddressNetworkPrefix: 16 as const,
    p2sAddressHeader: 19 as const,
    ergoGenesisBlockIdHex: nonzeroFixedHex(
      input.ergoGenesisBlockIdHex,
      32,
      'V5 Ergo genesis block ID',
    ),
    sourceNetworkIdHex,
    sidechainIdHex,
    settlementProfileIdHex,
  });
}

function bindContracts(
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV5Candidate>,
): ValidityApplicationPooledReserveProvisioningV5Plan['contracts'] {
  const roles: readonly ContractRole[] = [
    'tracker',
    'duplicatePrevention',
    'sourceLock',
    'pooledReserve',
  ];
  return deepFreeze(Object.fromEntries(roles.map(role => {
    const contract = compiled.contracts[role];
    return [role, {
      templateSha256Hex: fixedHex(
        contract.templateSha256Hex,
        32,
        `${role} V5 contract template digest`,
      ),
      resolvedSourceSha256Hex: fixedHex(
        contract.resolvedSourceSha256Hex,
        32,
        `${role} V5 resolved-source digest`,
      ),
      propositionSha256Hex: fixedHex(
        contract.receipt.propositionSha256Hex,
        32,
        `${role} V5 proposition digest`,
      ),
      contractIdHex: fixedHex(
        contract.receipt.contractIdHex,
        32,
        `${role} V5 contract ID`,
      ),
    }];
  })) as Record<ContractRole, {
    templateSha256Hex: string;
    resolvedSourceSha256Hex: string;
    propositionSha256Hex: string;
    contractIdHex: string;
  }>);
}

async function normalizeGenesis(
  input: Eip12Box,
  expectedBoxIdHex: string,
  label: string,
): Promise<Eip12Box> {
  const box = await normalizeEip12Box(input, `V5 ${label} genesis input`);
  if (box.assets.length !== 0) {
    throw new Error(`V5 ${label} genesis input must be pure ERG`);
  }
  if (Object.keys(box.additionalRegisters).length !== 0) {
    throw new Error(`V5 ${label} genesis input must be register-free`);
  }
  if (
    box.boxId
      !== fixedHex(expectedBoxIdHex, 32, `V5 ${label} genesis input box ID`)
  ) {
    throw new Error(
      `V5 ${label} genesis input does not match the compiled lineage`,
    );
  }
  return box;
}

async function buildSingletonIssuance(input: {
  label: string;
  genesisInput: Eip12Box;
  expectedNftIdHex: string;
  propositionHex: string;
  registers: Record<string, string>;
  singletonValue: bigint;
  fee: bigint;
  creationHeight: number;
}): Promise<MaterializedUnsignedTransaction> {
  const nftIdHex = fixedHex(
    input.expectedNftIdHex,
    32,
    `${input.label} NFT ID`,
  );
  if (nftIdHex !== input.genesisInput.boxId) {
    throw new Error(`${input.label} NFT ID must equal its genesis input box ID`);
  }
  const propositionHex = variableHex(
    input.propositionHex,
    `${input.label} proposition`,
  );
  const outputs: Eip12OutputCandidate[] = [{
    value: input.singletonValue,
    ergoTree: propositionHex,
    assets: [{ tokenId: nftIdHex, amount: '1' }],
    additionalRegisters: input.registers,
    creationHeight: input.creationHeight,
  }];
  appendChange(
    outputs,
    BigInt(input.genesisInput.value) - input.singletonValue - input.fee,
    input.genesisInput.ergoTree,
    input.creationHeight,
    `${input.label} change`,
  );
  outputs.push({
    value: input.fee,
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: input.creationHeight,
  });
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...input.genesisInput, extension: {} }],
    dataInputs: [],
    outputs,
  }, input.label);
  assertExactSingletonOutput({
    box: transaction.outputs[0]!,
    value: input.singletonValue,
    propositionHex,
    nftIdHex,
    registers: input.registers,
  });
  return transaction;
}

function assertExactSingletonOutput(input: {
  box: Eip12Box;
  value: bigint;
  propositionHex: string;
  nftIdHex: string;
  registers: Record<string, string>;
}): void {
  const drift: string[] = [];
  if (input.box.value !== input.value.toString()) drift.push('value');
  if (input.box.ergoTree !== input.propositionHex) drift.push('proposition');
  if (
    input.box.assets.length !== 1
    || input.box.assets[0]!.tokenId !== input.nftIdHex
    || input.box.assets[0]!.amount !== '1'
  ) {
    drift.push('singleton token');
  }
  const registerKeys = new Set([
    ...Object.keys(input.box.additionalRegisters),
    ...Object.keys(input.registers),
  ]);
  if ([...registerKeys].some(key =>
    input.box.additionalRegisters[key] !== input.registers[key]
  )) {
    drift.push('registers');
  }
  if (drift.length > 0) {
    throw new Error(`V5 singleton output drifted: ${drift.join(', ')}`);
  }
}

function normalizeHeights(
  heights: ValidityApplicationPooledReserveProvisioningHeightsV5,
  trackerGenesis: Eip12Box,
  duplicatePreventionGenesis: Eip12Box,
  pooledReserveGenesis: Eip12Box,
): ValidityApplicationPooledReserveProvisioningHeightsV5 {
  const result = {
    trackerIssuance: positiveHeight(
      heights.trackerIssuance,
      'V5 tracker issuance height',
    ),
    duplicatePreventionIssuance: positiveHeight(
      heights.duplicatePreventionIssuance,
      'V5 duplicate-prevention issuance height',
    ),
    pooledReserveIssuance: positiveHeight(
      heights.pooledReserveIssuance,
      'V5 pooled-reserve issuance height',
    ),
  };
  const checks = [
    ['tracker', result.trackerIssuance, trackerGenesis.creationHeight],
    [
      'duplicate-prevention',
      result.duplicatePreventionIssuance,
      duplicatePreventionGenesis.creationHeight,
    ],
    [
      'pooled-reserve',
      result.pooledReserveIssuance,
      pooledReserveGenesis.creationHeight,
    ],
  ] as const;
  for (const [label, actual, minimum] of checks) {
    if (actual < minimum) {
      throw new Error(`V5 ${label} issuance predates its genesis input`);
    }
  }
  return result;
}

function assertPairwiseDistinct(ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      'V5 tracker, duplicate-prevention, and pooled-reserve genesis inputs must be pairwise distinct',
    );
  }
}

function appendChange(
  outputs: Eip12OutputCandidate[],
  value: bigint,
  ergoTree: string,
  creationHeight: number,
  label: string,
): void {
  if (value < 0n) throw new Error(`${label} is underfunded`);
  if (value === 0n) return;
  if (value < MIN_BOX_VALUE) {
    throw new Error(`${label} would create a dust output`);
  }
  outputs.push({
    value,
    ergoTree: variableHex(ergoTree, `${label} ErgoTree`),
    assets: [],
    additionalRegisters: {},
    creationHeight,
  });
}

function atLeastMinBox(
  value: string | number | bigint,
  label: string,
): bigint {
  const normalized = positiveLong(value, label);
  if (normalized < MIN_BOX_VALUE) {
    throw new Error(`${label} is below the minimum box value`);
  }
  return normalized;
}

function positiveLong(
  value: string | number | bigint,
  label: string,
): bigint {
  if (
    typeof value !== 'string'
    && typeof value !== 'number'
    && typeof value !== 'bigint'
  ) {
    throw new Error(`${label} must be an integer string, number, or bigint`);
  }
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be supplied as an exact integer`);
  }
  if (typeof value === 'string' && !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a positive decimal integer`);
  }
  const normalized = BigInt(value);
  if (normalized <= 0n || normalized > ERGO_POSITIVE_LONG_MAX) {
    throw new Error(`${label} must fit a positive Ergo Long`);
  }
  return normalized;
}

function positiveHeight(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonzeroFixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  const normalized = fixedHex(value, bytes, label);
  if (/^0+$/.test(normalized)) {
    throw new Error(`${label} must be nonzero`);
  }
  return normalized;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a ${bytes}-byte hex string`);
  }
  const normalized = value.toLowerCase().replace(/^0x/, '');
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(normalized)) {
    throw new Error(`${label} must be a ${bytes}-byte hex string`);
  }
  return normalized;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be non-empty even-length hex bytes`);
  }
  const normalized = value.toLowerCase().replace(/^0x/, '');
  if (!/^(?:[0-9a-f]{2})+$/.test(normalized)) {
    throw new Error(`${label} must be non-empty even-length hex bytes`);
  }
  return normalized;
}

function assertExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
  optionalKeys: readonly string[] = [],
): void {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain data object`);
  }
  const actual = Object.keys(value).sort();
  const required = expectedKeys.filter(key => !optionalKeys.includes(key));
  if (
    required.some(key => !actual.includes(key))
    || actual.some(key => !expectedKeys.includes(key))
  ) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (
    value === null
    || typeof value !== 'object'
    || seen.has(value as object)
  ) {
    return value as Readonly<T>;
  }
  seen.add(value as object);
  for (const child of Object.values(value as object)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
