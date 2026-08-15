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
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
  derivePegInPooledReserveLineageProfileV4IdHex,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  encodeApplicationValiditySpvTrackerAvlRegister,
  getApplicationValiditySpvTrackerDigest,
} from './spv-tracker-validity-v2.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance,
  type ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet,
} from './validity-application-pooled-reserve-historical-replay-genesis-v4.js';
import {
  materializeUnsignedTransaction,
  normalizeEip12Box,
  type Eip12Box,
  type Eip12OutputCandidate,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-provisioning.v4' as const;

const MIN_BOX_VALUE = 1_000_000n;
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const INSERT_ONLY_AVL_FLAGS = 0x01;
const packets = new WeakSet<object>();

export interface ValidityApplicationPooledReserveProvisioningValuesV4 {
  readonly trackerNanoErg: string | number | bigint;
  readonly duplicatePreventionNanoErg: string | number | bigint;
  readonly pooledReserveNanoErg: string | number | bigint;
}

export interface ValidityApplicationPooledReserveProvisioningFeesV4 {
  readonly trackerIssuanceNanoErg?: string | number | bigint;
  readonly duplicatePreventionIssuanceNanoErg?: string | number | bigint;
  readonly pooledReserveIssuanceNanoErg?: string | number | bigint;
}

export interface ValidityApplicationPooledReserveProvisioningHeightsV4 {
  readonly trackerIssuance: number;
  readonly duplicatePreventionIssuance: number;
  readonly pooledReserveIssuance: number;
}

export interface BuildValidityApplicationPooledReserveProvisioningV4Input {
  readonly compiledInstance:
    Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
  readonly trackerGenesisInputBox: Eip12Box;
  readonly duplicatePreventionGenesisInputBox: Eip12Box;
  readonly settlementVaultGenesisInputBox: Eip12Box;
  readonly values: ValidityApplicationPooledReserveProvisioningValuesV4;
  readonly fees?: ValidityApplicationPooledReserveProvisioningFeesV4;
  readonly creationHeights:
    ValidityApplicationPooledReserveProvisioningHeightsV4;
  readonly historicalReplayGenesis?: Readonly<
    ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet
  >;
}

export interface ValidityApplicationPooledReserveProvisioningV4Packet {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V4_SCHEMA;
  readonly version: 4;
  readonly lineageProfileIdHex: string;
  readonly transactions: {
    readonly trackerIssuance: MaterializedUnsignedTransaction;
    readonly duplicatePreventionIssuance: MaterializedUnsignedTransaction;
    readonly pooledReserveIssuance: MaterializedUnsignedTransaction;
  };
  readonly boxes: {
    readonly tracker: Eip12Box;
    readonly duplicatePrevention: Eip12Box;
    readonly pooledReserve: Eip12Box;
  };
  readonly pooledReserveGenesisSeedNanoErg: string;
  readonly duplicatePreventionGenesis: {
    readonly mode:
      | 'empty-v4-lineage'
      | 'historical-replay-genesis';
    readonly historicalReplayGenesisPacketDigestHex: string | null;
    readonly canonicalBurnIdCount: number;
    readonly digestHex: string;
  };
  readonly invariants: {
    readonly separateSingletonIssuanceTransactions: true;
    readonly singletonIdsEqualDesignatedGenesisInputBoxIds: true;
    readonly allGenesisInputsPairwiseDistinct: true;
    readonly genesisInputsArePureErgAndRegisterFree: true;
    readonly pooledReserveStartsWithZeroLiability: true;
    readonly pooledReserveGenesisSeedEqualsBoxValue: true;
    readonly duplicatePreventionGenesisStateBound: true;
    readonly unsignedSetupOnly: true;
  };
  readonly boundaries: {
    readonly setupTransactionsConstructed: true;
    readonly singletonLineagesEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly sourceLockConsumptionEstablished: false;
    readonly depositCommitmentStateEstablished: false;
    readonly mintEligibilityEstablished: false;
    readonly burnSettlementEstablished: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly nodeCheckPerformed: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

export async function buildValidityApplicationPooledReserveProvisioningV4(
  input: BuildValidityApplicationPooledReserveProvisioningV4Input,
): Promise<Readonly<ValidityApplicationPooledReserveProvisioningV4Packet>> {
  assertExactKeys(input, [
    'compiledInstance',
    'trackerGenesisInputBox',
    'duplicatePreventionGenesisInputBox',
    'settlementVaultGenesisInputBox',
    'values',
    'fees',
    'creationHeights',
    'historicalReplayGenesis',
  ], 'validity application pooled-reserve provisioning input', [
    'fees',
    'historicalReplayGenesis',
  ]);
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(
    input.compiledInstance,
  );
  assertExactKeys(input.values, [
    'trackerNanoErg',
    'duplicatePreventionNanoErg',
    'pooledReserveNanoErg',
  ], 'validity application pooled-reserve provisioning values');
  assertExactKeys(input.creationHeights, [
    'trackerIssuance',
    'duplicatePreventionIssuance',
    'pooledReserveIssuance',
  ], 'validity application pooled-reserve provisioning heights');
  if (input.fees !== undefined) {
    assertExactKeys(input.fees, [
      'trackerIssuanceNanoErg',
      'duplicatePreventionIssuanceNanoErg',
      'pooledReserveIssuanceNanoErg',
    ], 'validity application pooled-reserve provisioning fees', [
      'trackerIssuanceNanoErg',
      'duplicatePreventionIssuanceNanoErg',
      'pooledReserveIssuanceNanoErg',
    ]);
  }

  const compiled = input.compiledInstance;
  const profile = decodePegInPooledReserveLineageProfileV4Hex(
    compiled.encodedLineageProfileHex,
  );
  if (
    compiled.lineageProfileIdHex
    !== derivePegInPooledReserveLineageProfileV4IdHex(profile)
  ) {
    throw new Error(
      'compiled pooled-reserve profile ID does not match its canonical bytes',
    );
  }

  const trackerGenesis = await normalizeGenesis(
    input.trackerGenesisInputBox,
    compiled.genesis.trackerInputBoxIdHex,
    'tracker',
  );
  const duplicatePreventionGenesis = await normalizeGenesis(
    input.duplicatePreventionGenesisInputBox,
    compiled.genesis.duplicatePreventionInputBoxIdHex,
    'duplicate-prevention',
  );
  const pooledReserveGenesis = await normalizeGenesis(
    input.settlementVaultGenesisInputBox,
    compiled.genesis.settlementVaultInputBoxIdHex,
    'pooled-reserve',
  );
  assertPairwiseDistinct([
    trackerGenesis.boxId,
    duplicatePreventionGenesis.boxId,
    pooledReserveGenesis.boxId,
  ]);

  const trackerValue = atLeastMinBox(
    input.values.trackerNanoErg,
    'tracker singleton value',
  );
  const duplicatePreventionValue = atLeastMinBox(
    input.values.duplicatePreventionNanoErg,
    'duplicate-prevention singleton value',
  );
  const pooledReserveValue = atLeastMinBox(
    input.values.pooledReserveNanoErg,
    'pooled-reserve singleton value',
  );
  const trackerFee = atLeastMinBox(
    input.fees?.trackerIssuanceNanoErg ?? MINER_FEE,
    'tracker issuance fee',
  );
  const duplicatePreventionFee = atLeastMinBox(
    input.fees?.duplicatePreventionIssuanceNanoErg ?? MINER_FEE,
    'duplicate-prevention issuance fee',
  );
  const pooledReserveFee = atLeastMinBox(
    input.fees?.pooledReserveIssuanceNanoErg ?? MINER_FEE,
    'pooled-reserve issuance fee',
  );
  const heights = normalizeHeights(
    input.creationHeights,
    trackerGenesis,
    duplicatePreventionGenesis,
    pooledReserveGenesis,
  );

  const profileRegister = encodeCollByteRegister(Buffer.from(
    fixedHex(compiled.lineageProfileIdHex, 32, 'pooled-reserve profile ID'),
    'hex',
  ));
  const duplicatePreventionGenesisState = resolveDuplicatePreventionGenesis(
    compiled,
    profileRegister,
    input.historicalReplayGenesis,
  );
  const trackerRegisters = {
    R4: profileRegister,
    R5: encodeApplicationValiditySpvTrackerAvlRegister(
      getApplicationValiditySpvTrackerDigest([]),
    ),
    R6: encodeCollByteRegister(Buffer.from(
      fixedHex(profile.sidechainIdHex, 32, 'sidechain ID'),
      'hex',
    )),
    R7: encodeLongRegister(0),
    R8: encodeIntRegister(0),
    R9: encodeCollByteRegister(Buffer.from(
      fixedHex(
        compiled.sidechainFinalityPolicy.approvedTrustAnchorDigestHex,
        32,
        'approved trust-anchor digest',
      ),
      'hex',
    )),
  };
  const duplicatePreventionRegisters = {
    R4: profileRegister,
    R5: encodeAvlTreeRegister(
      Buffer.from(duplicatePreventionGenesisState.digestHex, 'hex'),
      INSERT_ONLY_AVL_FLAGS,
      1,
    ),
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

  const trackerIssuance = await buildSingletonIssuance({
    label: 'validity application pooled-reserve tracker singleton issuance',
    genesisInput: trackerGenesis,
    expectedNftIdHex: compiled.genesis.trackerNftIdHex,
    propositionHex: compiled.contracts.tracker.receipt.propositionHex,
    registers: trackerRegisters,
    singletonValue: trackerValue,
    fee: trackerFee,
    creationHeight: heights.trackerIssuance,
  });
  const duplicatePreventionIssuance = await buildSingletonIssuance({
    label:
      'validity application pooled-reserve duplicate-prevention singleton issuance',
    genesisInput: duplicatePreventionGenesis,
    expectedNftIdHex: compiled.genesis.duplicatePreventionNftIdHex,
    propositionHex:
      compiled.contracts.duplicatePrevention.receipt.propositionHex,
    registers: duplicatePreventionRegisters,
    singletonValue: duplicatePreventionValue,
    fee: duplicatePreventionFee,
    creationHeight: heights.duplicatePreventionIssuance,
  });
  const pooledReserveIssuance = await buildSingletonIssuance({
    label: 'validity application pooled-reserve singleton issuance',
    genesisInput: pooledReserveGenesis,
    expectedNftIdHex: compiled.genesis.settlementVaultNftIdHex,
    propositionHex: compiled.contracts.pooledReserve.receipt.propositionHex,
    registers: pooledReserveRegisters,
    singletonValue: pooledReserveValue,
    fee: pooledReserveFee,
    creationHeight: heights.pooledReserveIssuance,
  });

  assertExactSingletonOutput(
    trackerIssuance.outputs[0],
    compiled.genesis.trackerNftIdHex,
    compiled.contracts.tracker.receipt.propositionHex,
    trackerRegisters,
    trackerValue,
    'tracker',
  );
  assertExactSingletonOutput(
    duplicatePreventionIssuance.outputs[0],
    compiled.genesis.duplicatePreventionNftIdHex,
    compiled.contracts.duplicatePrevention.receipt.propositionHex,
    duplicatePreventionRegisters,
    duplicatePreventionValue,
    'duplicate-prevention',
  );
  assertExactSingletonOutput(
    pooledReserveIssuance.outputs[0],
    compiled.genesis.settlementVaultNftIdHex,
    compiled.contracts.pooledReserve.receipt.propositionHex,
    pooledReserveRegisters,
    pooledReserveValue,
    'pooled-reserve',
  );

  const result = deepFreeze({
    schema: VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V4_SCHEMA,
    version: 4 as const,
    lineageProfileIdHex: compiled.lineageProfileIdHex,
    transactions: Object.freeze({
      trackerIssuance,
      duplicatePreventionIssuance,
      pooledReserveIssuance,
    }),
    boxes: Object.freeze({
      tracker: trackerIssuance.outputs[0],
      duplicatePrevention: duplicatePreventionIssuance.outputs[0],
      pooledReserve: pooledReserveIssuance.outputs[0],
    }),
    pooledReserveGenesisSeedNanoErg: pooledReserveValue.toString(),
    duplicatePreventionGenesis: duplicatePreventionGenesisState,
    invariants: Object.freeze({
      separateSingletonIssuanceTransactions: true as const,
      singletonIdsEqualDesignatedGenesisInputBoxIds: true as const,
      allGenesisInputsPairwiseDistinct: true as const,
      genesisInputsArePureErgAndRegisterFree: true as const,
      pooledReserveStartsWithZeroLiability: true as const,
      pooledReserveGenesisSeedEqualsBoxValue: true as const,
      duplicatePreventionGenesisStateBound: true as const,
      unsignedSetupOnly: true as const,
    }),
    boundaries: Object.freeze({
      setupTransactionsConstructed: true as const,
      singletonLineagesEstablished: false as const,
      reserveLineageEstablished: false as const,
      sourceLockConsumptionEstablished: false as const,
      depositCommitmentStateEstablished: false as const,
      mintEligibilityEstablished: false as const,
      burnSettlementEstablished: false as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  packets.add(result);
  return result;
}

export function assertValidityApplicationPooledReserveProvisioningV4Packet(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveProvisioningV4Packet
> {
  if (
    value === null
    || typeof value !== 'object'
    || !packets.has(value)
  ) {
    throw new Error(
      'validity application pooled-reserve provisioning V4 packet must be built in this process',
    );
  }
}

function resolveDuplicatePreventionGenesis(
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
  profileRegister: string,
  historicalReplayGenesis:
    | Readonly<
      ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet
    >
    | undefined,
): Readonly<
  ValidityApplicationPooledReserveProvisioningV4Packet[
    'duplicatePreventionGenesis'
  ]
> {
  if (historicalReplayGenesis === undefined) {
    return Object.freeze({
      mode: 'empty-v4-lineage' as const,
      historicalReplayGenesisPacketDigestHex: null,
      canonicalBurnIdCount: 0,
      digestHex: fixedHex(
        getDupTreeDigest([]),
        33,
        'empty V4 duplicate-prevention digest',
      ),
    });
  }

  assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance(
    historicalReplayGenesis,
  );
  if (
    fixedHex(
      historicalReplayGenesis.lineage.lineageProfileIdHex,
      32,
      'historical replay-genesis lineage profile ID',
    )
      !== fixedHex(
        compiled.lineageProfileIdHex,
        32,
        'compiled pooled-reserve lineage profile ID',
      )
    || historicalReplayGenesis.lineage.encodedLineageProfileHex
      !== compiled.encodedLineageProfileHex
  ) {
    throw new Error(
      'historical replay genesis does not match the compiled V4 lineage',
    );
  }

  const canonicalBurnIdsHex =
    historicalReplayGenesis.duplicatePreventionGenesis.canonicalBurnIdsHex.map(
      (burnIdHex, index) =>
        fixedHex(
          burnIdHex,
          32,
          `historical replay-genesis canonical burn ID ${index}`,
        ),
    );
  if (new Set(canonicalBurnIdsHex).size !== canonicalBurnIdsHex.length) {
    throw new Error(
      'historical replay genesis contains duplicate canonical burn IDs',
    );
  }
  if (
    canonicalBurnIdsHex.some(
      (burnIdHex, index) =>
        index > 0 && canonicalBurnIdsHex[index - 1] >= burnIdHex,
    )
  ) {
    throw new Error(
      'historical replay genesis burn IDs must be strictly sorted',
    );
  }
  const digestHex = fixedHex(
    getDupTreeDigest([...canonicalBurnIdsHex]),
    33,
    'historical replay-genesis V4 duplicate-prevention digest',
  );
  const expectedRegisters = {
    R4: profileRegister,
    R5: encodeAvlTreeRegister(
      Buffer.from(digestHex, 'hex'),
      INSERT_ONLY_AVL_FLAGS,
      1,
    ),
  };
  if (
    historicalReplayGenesis.duplicatePreventionGenesis.digestHex !== digestHex
    || historicalReplayGenesis.duplicatePreventionGenesis.registers.R4
      !== expectedRegisters.R4
    || historicalReplayGenesis.duplicatePreventionGenesis.registers.R5
      !== expectedRegisters.R5
  ) {
    throw new Error(
      'historical replay genesis does not encode the exact V4 DUP genesis',
    );
  }

  return Object.freeze({
    mode: 'historical-replay-genesis' as const,
    historicalReplayGenesisPacketDigestHex: fixedHex(
      historicalReplayGenesis.packetDigestHex,
      32,
      'historical replay-genesis packet digest',
    ),
    canonicalBurnIdCount: canonicalBurnIdsHex.length,
    digestHex,
  });
}

async function normalizeGenesis(
  input: Eip12Box,
  expectedBoxIdHex: string,
  label: string,
): Promise<Eip12Box> {
  const box = await normalizeEip12Box(input, `${label} genesis input`);
  if (box.assets.length !== 0) {
    throw new Error(`${label} genesis input must be pure ERG`);
  }
  if (Object.keys(box.additionalRegisters).length !== 0) {
    throw new Error(`${label} genesis input must be register-free`);
  }
  if (box.boxId !== fixedHex(expectedBoxIdHex, 32, `${label} genesis ID`)) {
    throw new Error(
      `${label} genesis input does not match the compiled pooled-reserve lineage`,
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
  const expectedNftId = fixedHex(
    input.expectedNftIdHex,
    32,
    `${input.label} NFT ID`,
  );
  if (expectedNftId !== input.genesisInput.boxId) {
    throw new Error(`${input.label} NFT ID must equal the first input box ID`);
  }
  const outputs: Eip12OutputCandidate[] = [{
    value: input.singletonValue,
    ergoTree: variableHex(input.propositionHex, `${input.label} proposition`),
    assets: [{ tokenId: expectedNftId, amount: '1' }],
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
  return materializeUnsignedTransaction({
    inputs: [{ ...input.genesisInput, extension: {} }],
    dataInputs: [],
    outputs,
  }, input.label);
}

function assertExactSingletonOutput(
  box: Eip12Box,
  nftIdHex: string,
  propositionHex: string,
  registers: Record<string, string>,
  value: bigint,
  label: string,
): void {
  const nftId = fixedHex(nftIdHex, 32, `${label} NFT ID`);
  const drift: string[] = [];
  if (box.value !== value.toString()) drift.push('value');
  if (box.ergoTree !== variableHex(propositionHex, `${label} proposition`)) {
    drift.push('proposition');
  }
  if (
    box.assets.length !== 1
    || box.assets[0].tokenId !== nftId
    || box.assets[0].amount !== '1'
  ) {
    drift.push('singleton token');
  }
  const registerKeys = new Set([
    ...Object.keys(box.additionalRegisters),
    ...Object.keys(registers),
  ]);
  const changedRegisters = [...registerKeys].filter(
    key => box.additionalRegisters[key] !== registers[key],
  );
  if (changedRegisters.length > 0) {
    drift.push(`registers ${changedRegisters.join('/')}`);
  }
  if (drift.length > 0) {
    throw new Error(
      `${label} singleton output drifted from the exact lineage: ${drift.join(', ')}`,
    );
  }
}

function normalizeHeights(
  heights: ValidityApplicationPooledReserveProvisioningHeightsV4,
  trackerGenesis: Eip12Box,
  duplicatePreventionGenesis: Eip12Box,
  pooledReserveGenesis: Eip12Box,
): ValidityApplicationPooledReserveProvisioningHeightsV4 {
  const result = {
    trackerIssuance: positiveHeight(
      heights.trackerIssuance,
      'tracker issuance height',
    ),
    duplicatePreventionIssuance: positiveHeight(
      heights.duplicatePreventionIssuance,
      'duplicate-prevention issuance height',
    ),
    pooledReserveIssuance: positiveHeight(
      heights.pooledReserveIssuance,
      'pooled-reserve issuance height',
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
      throw new Error(`${label} issuance height predates its genesis input`);
    }
  }
  return result;
}

function assertPairwiseDistinct(ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      'tracker, duplicate-prevention, and pooled-reserve genesis inputs must be pairwise distinct',
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

function fixedHex(value: string, bytes: number, label: string): string {
  const normalized = variableHex(value, label);
  if (normalized.length !== bytes * 2) {
    throw new Error(`${label} must be exactly ${bytes} bytes`);
  }
  return normalized;
}

function variableHex(value: string, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hexadecimal`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (
    clean.length === 0
    || clean.length % 2 !== 0
    || !/^[0-9a-fA-F]+$/.test(clean)
  ) {
    throw new Error(`${label} must be non-empty even-length hexadecimal`);
  }
  return clean.toLowerCase();
}

function assertExactKeys(
  value: unknown,
  allowed: readonly string[],
  label: string,
  optional: readonly string[] = [],
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  const allowedSet = new Set(allowed);
  for (const key of keys) {
    if (!allowedSet.has(key)) throw new Error(`${label} contains unknown ${key}`);
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !('value' in descriptor)
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      throw new Error(`${label} fields must be own data properties`);
    }
  }
  const optionalSet = new Set(optional);
  for (const key of allowed) {
    if (!optionalSet.has(key) && !keys.includes(key)) {
      throw new Error(`${label} is missing ${key}`);
    }
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (
    value === null
    || typeof value !== 'object'
    || seen.has(value as object)
  ) {
    return value;
  }
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
