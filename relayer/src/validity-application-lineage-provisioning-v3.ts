import { getDupTreeDigest } from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import {
  PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
  decodePegInSourceIntentV2Hex,
  encodePegInSourceIntentV2Hex,
  type PegInSourceIntentV2,
} from './peg-in-causal-admission-v2.js';
import {
  buildPegInCausalCommitmentV2Tx,
  PEG_IN_CAUSAL_REFUND_TIMEOUT_BLOCKS,
} from './peg-in-causal-commitment-v2.js';
import {
  decodePegInCausalLineageProfileV3Hex,
} from './peg-in-causal-lineage-profile-v3.js';
import {
  encodeApplicationValiditySpvTrackerAvlRegister,
  getApplicationValiditySpvTrackerDigest,
} from './spv-tracker-validity-v2.js';
import {
  assertCompiledValidityApplicationLineageInstanceV3Candidate,
  type ValidityApplicationLineageInstanceV3Candidate,
} from './validity-application-lineage-instance-v3.js';
import {
  materializeUnsignedTransaction,
  normalizeEip12Box,
  normalizeErgoTreeHex,
  type Eip12Box,
  type Eip12OutputCandidate,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

export const VALIDITY_APPLICATION_LINEAGE_PROVISIONING_V3_SCHEMA =
  'e2s.validity-application-lineage-provisioning.v3' as const;

const MIN_BOX_VALUE = 1_000_000n;
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const ZERO_ASSET_ID_HEX = `0x${'00'.repeat(32)}`;
const provisioningPackets = new WeakSet<object>();

export interface ValidityApplicationLineageProvisioningValuesV3 {
  readonly trackerNanoErg: string | number | bigint;
  readonly duplicatePreventionNanoErg: string | number | bigint;
}

export interface ValidityApplicationLineageProvisioningFeesV3 {
  readonly trackerIssuanceNanoErg?: string | number | bigint;
  readonly duplicatePreventionIssuanceNanoErg?: string | number | bigint;
  readonly sourceLockCreationNanoErg?: string | number | bigint;
  readonly sourceCommitmentNanoErg?: string | number | bigint;
}

export interface ValidityApplicationLineageProvisioningHeightsV3 {
  readonly trackerIssuance: number;
  readonly duplicatePreventionIssuance: number;
  readonly sourceLockCreation: number;
  readonly sourceCommitment: number;
}

export interface BuildValidityApplicationLineageProvisioningV3Input {
  readonly compiledInstance:
    Readonly<ValidityApplicationLineageInstanceV3Candidate>;
  readonly trackerGenesisInputBox: Eip12Box;
  readonly duplicatePreventionGenesisInputBox: Eip12Box;
  readonly sourceFundingBox: Eip12Box;
  readonly sourceIntent: PegInSourceIntentV2;
  readonly depositorErgoTreeHex: string;
  readonly values: ValidityApplicationLineageProvisioningValuesV3;
  readonly fees?: ValidityApplicationLineageProvisioningFeesV3;
  readonly creationHeights: ValidityApplicationLineageProvisioningHeightsV3;
}

export interface ValidityApplicationLineageProvisioningV3Packet {
  readonly schema:
    typeof VALIDITY_APPLICATION_LINEAGE_PROVISIONING_V3_SCHEMA;
  readonly version: 3;
  readonly lineageProfileIdHex: string;
  readonly sourceIntentHex: string;
  readonly transactions: {
    readonly trackerIssuance: MaterializedUnsignedTransaction;
    readonly duplicatePreventionIssuance: MaterializedUnsignedTransaction;
    readonly sourceLockCreation: MaterializedUnsignedTransaction;
    readonly sourceCommitment: MaterializedUnsignedTransaction;
  };
  readonly boxes: {
    readonly tracker: Eip12Box;
    readonly duplicatePrevention: Eip12Box;
    readonly sourceLock: Eip12Box;
    readonly sourceCommitmentFee: Eip12Box;
    readonly causalVault: Eip12Box;
  };
  readonly invariants: {
    readonly separateSingletonIssuanceTransactions: true;
    readonly singletonIdsEqualFirstInputBoxIds: true;
    readonly sourceLockIsExactCreationOutput: true;
    readonly unsignedVaultReferencesExactSourceLockOutput: true;
    readonly sourceLockValueMovesInFull: true;
    readonly feesFundedOutsideProtectedValue: true;
  };
  readonly boundaries: {
    readonly singletonLineagesEstablished: false;
    readonly sourceLockConsumptionEstablished: false;
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

export async function buildValidityApplicationLineageProvisioningV3(
  input: BuildValidityApplicationLineageProvisioningV3Input,
): Promise<Readonly<ValidityApplicationLineageProvisioningV3Packet>> {
  assertExactKeys(input, [
    'compiledInstance',
    'trackerGenesisInputBox',
    'duplicatePreventionGenesisInputBox',
    'sourceFundingBox',
    'sourceIntent',
    'depositorErgoTreeHex',
    'values',
    'fees',
    'creationHeights',
  ], 'validity application lineage provisioning input', ['fees']);
  const {
    compiledInstance,
    trackerGenesisInputBox,
    duplicatePreventionGenesisInputBox,
    sourceFundingBox,
    sourceIntent: sourceIntentInput,
    depositorErgoTreeHex: depositorErgoTreeInput,
    values,
    fees,
    creationHeights,
  } = input;
  assertCompiledValidityApplicationLineageInstanceV3Candidate(
    compiledInstance,
  );
  const compiled = compiledInstance;
  const profile = decodePegInCausalLineageProfileV3Hex(
    compiled.encodedLineageProfileHex,
  );

  assertExactKeys(values, [
    'trackerNanoErg',
    'duplicatePreventionNanoErg',
  ], 'validity application lineage provisioning values');
  assertExactKeys(creationHeights, [
    'trackerIssuance',
    'duplicatePreventionIssuance',
    'sourceLockCreation',
    'sourceCommitment',
  ], 'validity application lineage provisioning heights');
  if (fees !== undefined) {
    assertExactKeys(fees, [
      'trackerIssuanceNanoErg',
      'duplicatePreventionIssuanceNanoErg',
      'sourceLockCreationNanoErg',
      'sourceCommitmentNanoErg',
    ], 'validity application lineage provisioning fees', [
      'trackerIssuanceNanoErg',
      'duplicatePreventionIssuanceNanoErg',
      'sourceLockCreationNanoErg',
      'sourceCommitmentNanoErg',
    ]);
  }

  const trackerGenesis = await normalizeEip12Box(
    trackerGenesisInputBox,
    'tracker genesis input',
  );
  const duplicatePreventionGenesis = await normalizeEip12Box(
    duplicatePreventionGenesisInputBox,
    'duplicate-prevention genesis input',
  );
  const sourceFunding = await normalizeEip12Box(
    sourceFundingBox,
    'source-lock funding input',
  );
  assertDistinctInputs(
    trackerGenesis,
    duplicatePreventionGenesis,
    sourceFunding,
  );
  assertExactGenesis(
    trackerGenesis,
    compiled.genesis.trackerInputBoxIdHex,
    'tracker',
  );
  assertExactGenesis(
    duplicatePreventionGenesis,
    compiled.genesis.duplicatePreventionInputBoxIdHex,
    'duplicate-prevention',
  );
  assertPureErg(trackerGenesis, 'tracker genesis input');
  assertPureErg(
    duplicatePreventionGenesis,
    'duplicate-prevention genesis input',
  );
  assertPureErg(sourceFunding, 'source-lock funding input');

  const trackerValue = atLeastMinBox(
    values.trackerNanoErg,
    'tracker singleton value',
  );
  const duplicatePreventionValue = atLeastMinBox(
    values.duplicatePreventionNanoErg,
    'duplicate-prevention singleton value',
  );
  const trackerFee = atLeastMinBox(
    fees?.trackerIssuanceNanoErg ?? MINER_FEE,
    'tracker issuance fee',
  );
  const duplicatePreventionFee = atLeastMinBox(
    fees?.duplicatePreventionIssuanceNanoErg ?? MINER_FEE,
    'duplicate-prevention issuance fee',
  );
  const sourceLockCreationFee = atLeastMinBox(
    fees?.sourceLockCreationNanoErg ?? MINER_FEE,
    'source-lock creation fee',
  );
  const sourceCommitmentFee = atLeastMinBox(
    fees?.sourceCommitmentNanoErg ?? MINER_FEE,
    'source commitment fee',
  );
  const heights = normalizeHeights(
    creationHeights,
    trackerGenesis,
    duplicatePreventionGenesis,
    sourceFunding,
  );

  const sourceIntentHex = validateSourceIntent(
    sourceIntentInput,
    profile,
    compiled.lineageProfileIdHex,
  );
  const sourceIntent = decodePegInSourceIntentV2Hex(sourceIntentHex);
  const sourceAmount = atLeastMinBox(
    sourceIntent.amountNanoErg,
    'source intent amount',
  );
  const depositorErgoTreeHex = await normalizeErgoTreeHex(
    depositorErgoTreeInput,
    'depositor ErgoTree',
  );

  const trackerRegisters = {
    R4: encodeLongRegister(0),
    R5: encodeApplicationValiditySpvTrackerAvlRegister(
      getApplicationValiditySpvTrackerDigest([]),
    ),
    R6: encodeCollByteRegister(
      Buffer.from(fixedHex(profile.sidechainIdHex, 32, 'sidechain ID'), 'hex'),
    ),
    R7: encodeLongRegister(0),
    R8: encodeIntRegister(0),
    R9: encodeCollByteRegister(Buffer.from(
      fixedHex(
        compiled.finalityPolicy.approvedTrustAnchorDigestHex,
        32,
        'approved trust-anchor digest',
      ),
      'hex',
    )),
  };
  const duplicatePreventionRegisters = {
    R4: encodeLongRegister(0),
    R5: encodeAvlTreeRegister(
      Buffer.from(getDupTreeDigest([]), 'hex'),
      // Sigma-rust canonicalizes insert + update permissions to 0x03.
      0x03,
      1,
    ),
    R6: encodeCollByteRegister(Buffer.from(
      fixedHex(
        profile.settlementProfileIdHex,
        32,
        'settlement profile ID',
      ),
      'hex',
    )),
  };

  const trackerIssuance = await buildSingletonIssuance({
    label: 'validity application tracker singleton issuance',
    genesisInput: trackerGenesis,
    expectedNftIdHex: compiled.genesis.trackerNftIdHex,
    propositionHex: compiled.contracts.tracker.receipt.propositionHex,
    registers: trackerRegisters,
    singletonValue: trackerValue,
    fee: trackerFee,
    creationHeight: heights.trackerIssuance,
  });
  const duplicatePreventionIssuance = await buildSingletonIssuance({
    label: 'validity application duplicate-prevention singleton issuance',
    genesisInput: duplicatePreventionGenesis,
    expectedNftIdHex: compiled.genesis.duplicatePreventionNftIdHex,
    propositionHex:
      compiled.contracts.duplicatePrevention.receipt.propositionHex,
    registers: duplicatePreventionRegisters,
    singletonValue: duplicatePreventionValue,
    fee: duplicatePreventionFee,
    creationHeight: heights.duplicatePreventionIssuance,
  });

  const sourceLockCreation = await buildSourceLockCreation({
    sourceFunding,
    sourceIntentHex,
    sourceAmount,
    sourceLockPropositionHex:
      compiled.contracts.sourceLock.receipt.propositionHex,
    depositorErgoTreeHex,
    creationFee: sourceLockCreationFee,
    commitmentFee: sourceCommitmentFee,
    creationHeight: heights.sourceLockCreation,
  });
  const sourceLock = sourceLockCreation.outputs[0];
  const sourceCommitmentFeeBox = sourceLockCreation.outputs[1];

  const commitmentPlan = buildPegInCausalCommitmentV2Tx({
    sourceLockBox: sourceLock,
    feeBox: sourceCommitmentFeeBox,
    expectedSourceLockErgoTreeHex:
      compiled.contracts.sourceLock.receipt.propositionHex,
    expectedSourceNetworkIdHex: profile.sourceNetworkIdHex,
    expectedAdmissionProfileIdHex: compiled.lineageProfileIdHex,
    causalVaultErgoTreeHex:
      compiled.contracts.causalVault.receipt.propositionHex,
    creationHeight: heights.sourceCommitment,
    minerFee: sourceCommitmentFee,
    minBoxValue: MIN_BOX_VALUE,
  });
  if (
    commitmentPlan.inputs.length !== 2
    || commitmentPlan.inputs[0].boxId !== sourceLock.boxId
    || commitmentPlan.inputs[1].boxId !== sourceCommitmentFeeBox.boxId
  ) {
    throw new Error(
      'source commitment plan does not consume the exact source-lock descendants',
    );
  }
  const sourceCommitment = await materializeUnsignedTransaction({
    inputs: [
      { ...sourceLock, extension: commitmentPlan.inputs[0].extension },
      {
        ...sourceCommitmentFeeBox,
        extension: commitmentPlan.inputs[1].extension,
      },
    ],
    dataInputs: [],
    outputs: commitmentPlan.outputs,
  }, 'validity application source-lock commitment');

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
  assertSourceLineage(
    sourceLockCreation,
    sourceCommitment,
    sourceIntentHex,
    depositorErgoTreeHex,
    compiled.contracts.sourceLock.receipt.propositionHex,
    compiled.contracts.causalVault.receipt.propositionHex,
    sourceAmount,
  );

  const result = deepFreeze({
    schema: VALIDITY_APPLICATION_LINEAGE_PROVISIONING_V3_SCHEMA,
    version: 3 as const,
    lineageProfileIdHex: compiled.lineageProfileIdHex,
    sourceIntentHex,
    transactions: Object.freeze({
      trackerIssuance,
      duplicatePreventionIssuance,
      sourceLockCreation,
      sourceCommitment,
    }),
    boxes: Object.freeze({
      tracker: trackerIssuance.outputs[0],
      duplicatePrevention: duplicatePreventionIssuance.outputs[0],
      sourceLock,
      sourceCommitmentFee: sourceCommitmentFeeBox,
      causalVault: sourceCommitment.outputs[0],
    }),
    invariants: Object.freeze({
      separateSingletonIssuanceTransactions: true as const,
      singletonIdsEqualFirstInputBoxIds: true as const,
      sourceLockIsExactCreationOutput: true as const,
      unsignedVaultReferencesExactSourceLockOutput: true as const,
      sourceLockValueMovesInFull: true as const,
      feesFundedOutsideProtectedValue: true as const,
    }),
    boundaries: Object.freeze({
      singletonLineagesEstablished: false as const,
      sourceLockConsumptionEstablished: false as const,
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
  provisioningPackets.add(result);
  return result;
}

export function assertValidityApplicationLineageProvisioningV3Packet(
  value: unknown,
): asserts value is Readonly<ValidityApplicationLineageProvisioningV3Packet> {
  if (
    value === null
    || typeof value !== 'object'
    || !provisioningPackets.has(value)
  ) {
    throw new Error(
      'validity application lineage provisioning V3 packet must be built in this process',
    );
  }
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
  outputs.push(feeOutput(input.fee, input.creationHeight));
  return materializeUnsignedTransaction({
    inputs: [{ ...input.genesisInput, extension: {} }],
    dataInputs: [],
    outputs,
  }, input.label);
}

async function buildSourceLockCreation(input: {
  sourceFunding: Eip12Box;
  sourceIntentHex: string;
  sourceAmount: bigint;
  sourceLockPropositionHex: string;
  depositorErgoTreeHex: string;
  creationFee: bigint;
  commitmentFee: bigint;
  creationHeight: number;
}): Promise<MaterializedUnsignedTransaction> {
  const outputs: Eip12OutputCandidate[] = [
    {
      value: input.sourceAmount,
      ergoTree: variableHex(
        input.sourceLockPropositionHex,
        'source-lock proposition',
      ),
      assets: [],
      additionalRegisters: {
        R4: encodeCollByteRegister(Buffer.from(
          fixedLengthHex(input.sourceIntentHex, 229, 'source intent'),
          'hex',
        )),
        R5: encodeCollByteRegister(Buffer.from(
          input.depositorErgoTreeHex,
          'hex',
        )),
      },
      creationHeight: input.creationHeight,
    },
    {
      value: input.commitmentFee,
      ergoTree: input.sourceFunding.ergoTree,
      assets: [],
      additionalRegisters: {},
      creationHeight: input.creationHeight,
    },
  ];
  appendChange(
    outputs,
    BigInt(input.sourceFunding.value)
      - input.sourceAmount
      - input.commitmentFee
      - input.creationFee,
    input.sourceFunding.ergoTree,
    input.creationHeight,
    'source-lock creation change',
  );
  outputs.push(feeOutput(input.creationFee, input.creationHeight));
  return materializeUnsignedTransaction({
    inputs: [{ ...input.sourceFunding, extension: {} }],
    dataInputs: [],
    outputs,
  }, 'validity application source-lock creation');
}

function validateSourceIntent(
  sourceIntent: PegInSourceIntentV2,
  profile: ReturnType<typeof decodePegInCausalLineageProfileV3Hex>,
  lineageProfileIdHex: string,
): string {
  assertExactKeys(sourceIntent, [
    'formatVersion',
    'sourceNetworkIdHex',
    'sidechainIdHex',
    'bridgeAddressHex',
    'tokenAddressHex',
    'settlementProfileIdHex',
    'admissionProfileIdHex',
    'sourceAssetIdHex',
    'amountNanoErg',
    'recipientAddressHex',
  ], 'peg-in source intent');
  const encoded = encodePegInSourceIntentV2Hex(sourceIntent);
  const decoded = decodePegInSourceIntentV2Hex(encoded);
  const exactBindings = [
    ['format version', decoded.formatVersion,
      PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION],
    ['source network', decoded.sourceNetworkIdHex, profile.sourceNetworkIdHex],
    ['sidechain', decoded.sidechainIdHex, profile.sidechainIdHex],
    ['bridge address', decoded.bridgeAddressHex, profile.bridgeAddressHex],
    ['token address', decoded.tokenAddressHex, profile.tokenAddressHex],
    [
      'settlement profile',
      decoded.settlementProfileIdHex,
      profile.settlementProfileIdHex,
    ],
    ['causal profile', decoded.admissionProfileIdHex, lineageProfileIdHex],
    ['source asset', decoded.sourceAssetIdHex, ZERO_ASSET_ID_HEX],
  ] as const;
  for (const [label, actual, expected] of exactBindings) {
    if (actual !== expected) {
      throw new Error(`source intent ${label} does not match the compiled lineage`);
    }
  }
  atLeastMinBox(decoded.amountNanoErg, 'source intent amount');
  if (decoded.recipientAddressHex === `0x${'00'.repeat(20)}`) {
    throw new Error('source intent recipient must not be the zero address');
  }
  return encoded;
}

function normalizeHeights(
  heights: ValidityApplicationLineageProvisioningHeightsV3,
  trackerGenesis: Eip12Box,
  duplicatePreventionGenesis: Eip12Box,
  sourceFunding: Eip12Box,
): ValidityApplicationLineageProvisioningHeightsV3 {
  const result = {
    trackerIssuance: positiveHeight(
      heights.trackerIssuance,
      'tracker issuance height',
    ),
    duplicatePreventionIssuance: positiveHeight(
      heights.duplicatePreventionIssuance,
      'duplicate-prevention issuance height',
    ),
    sourceLockCreation: positiveHeight(
      heights.sourceLockCreation,
      'source-lock creation height',
    ),
    sourceCommitment: positiveHeight(
      heights.sourceCommitment,
      'source commitment height',
    ),
  };
  if (result.trackerIssuance < trackerGenesis.creationHeight) {
    throw new Error('tracker issuance height predates its genesis input');
  }
  if (
    result.duplicatePreventionIssuance
    < duplicatePreventionGenesis.creationHeight
  ) {
    throw new Error(
      'duplicate-prevention issuance height predates its genesis input',
    );
  }
  if (result.sourceLockCreation < sourceFunding.creationHeight) {
    throw new Error('source-lock creation height predates its funding input');
  }
  if (result.sourceCommitment < result.sourceLockCreation) {
    throw new Error('source commitment height predates the source lock');
  }
  if (
    result.sourceCommitment
    >= result.sourceLockCreation + PEG_IN_CAUSAL_REFUND_TIMEOUT_BLOCKS
  ) {
    throw new Error('source commitment height is at or after the refund timeout');
  }
  return result;
}

function assertExactGenesis(
  box: Eip12Box,
  expectedBoxIdHex: string,
  label: string,
): void {
  if (box.boxId !== fixedHex(expectedBoxIdHex, 32, `${label} genesis ID`)) {
    throw new Error(`${label} genesis input does not match the compiled lineage`);
  }
}

function assertDistinctInputs(...boxes: Eip12Box[]): void {
  if (new Set(boxes.map(box => box.boxId)).size !== boxes.length) {
    throw new Error(
      'tracker, duplicate-prevention, and source funding inputs must be distinct',
    );
  }
}

function assertPureErg(box: Eip12Box, label: string): void {
  if (box.assets.length !== 0) {
    throw new Error(`${label} must be pure ERG`);
  }
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
  const changedRegisters = registerDrift(
    box.additionalRegisters,
    registers,
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

function assertSourceLineage(
  sourceLockCreation: MaterializedUnsignedTransaction,
  sourceCommitment: MaterializedUnsignedTransaction,
  sourceIntentHex: string,
  depositorErgoTreeHex: string,
  sourceLockPropositionHex: string,
  causalVaultPropositionHex: string,
  sourceAmount: bigint,
): void {
  const sourceLock = sourceLockCreation.outputs[0];
  const commitmentFee = sourceLockCreation.outputs[1];
  const causalVault = sourceCommitment.outputs[0];
  const expectedIntentRegister = encodeCollByteRegister(Buffer.from(
    fixedLengthHex(sourceIntentHex, 229, 'source intent'),
    'hex',
  ));
  if (
    sourceLock.ergoTree
      !== variableHex(sourceLockPropositionHex, 'source-lock proposition')
    || sourceLock.value !== sourceAmount.toString()
    || sourceLock.assets.length !== 0
    || sourceLock.additionalRegisters.R4 !== expectedIntentRegister
    || sourceLock.additionalRegisters.R5 !== encodeCollByteRegister(
      Buffer.from(depositorErgoTreeHex, 'hex'),
    )
  ) {
    throw new Error('source-lock output drifted from the exact source intent');
  }
  if (
    sourceCommitment.eip12Tx.inputs.length !== 2
    || sourceCommitment.eip12Tx.inputs[0].boxId !== sourceLock.boxId
    || sourceCommitment.eip12Tx.inputs[1].boxId !== commitmentFee.boxId
    || causalVault.ergoTree
      !== variableHex(causalVaultPropositionHex, 'causal-vault proposition')
    || causalVault.value !== sourceAmount.toString()
    || causalVault.assets.length !== 0
    || causalVault.additionalRegisters.R4 !== expectedIntentRegister
    || causalVault.additionalRegisters.R5 !== encodeCollByteRegister(
      Buffer.from(sourceLock.boxId, 'hex'),
    )
  ) {
    throw new Error(
      'causal vault is not the exact value-preserving source-lock descendant',
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

function feeOutput(
  value: bigint,
  creationHeight: number,
): Eip12OutputCandidate {
  return {
    value,
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight,
  };
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

function fixedLengthHex(value: string, bytes: number, label: string): string {
  const normalized = variableHex(value, label);
  if (normalized.length !== bytes * 2) {
    throw new Error(`${label} must be exactly ${bytes} bytes`);
  }
  return normalized;
}

function fixedHex(value: string, bytes: number, label: string): string {
  return fixedLengthHex(value, bytes, label);
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

function registerDrift(
  actual: Record<string, string>,
  expected: Record<string, string>,
): string[] {
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  return [...keys]
    .filter(key => actual[key] !== expected[key]);
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
  const keys = Object.keys(value as object);
  const allowedSet = new Set(allowed);
  for (const key of keys) {
    if (!allowedSet.has(key)) throw new Error(`${label} contains unknown ${key}`);
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
