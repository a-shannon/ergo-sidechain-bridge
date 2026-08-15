import { getDupTreeDigest } from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  materializeUnsignedTransaction,
  normalizeEip12Box,
  type Eip12Box,
  type Eip12OutputCandidate,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';
import {
  assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance,
  type ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet,
} from './validity-application-pooled-reserve-historical-replay-genesis-v4.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV5Candidate,
  type ValidityApplicationPooledReserveInstanceV5Candidate,
} from './validity-application-pooled-reserve-instance-v5.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_REPLAY_CUTOVER_V5_SCHEMA =
  'e2s.validity-application-pooled-reserve-replay-cutover.v5' as const;

const PACKET_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_REPLAY_CUTOVER_V5';
const MIN_BOX_VALUE = 1_000_000n;
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const INSERT_ONLY_AVL_FLAGS = 0x01;
const packets = new WeakSet<object>();

export interface BuildValidityApplicationPooledReserveReplayCutoverV5Input {
  readonly compiledInstance:
    Readonly<ValidityApplicationPooledReserveInstanceV5Candidate>;
  readonly historicalReplayGenesis:
    Readonly<ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet>;
  readonly duplicatePreventionGenesisInputBox: Eip12Box;
  readonly duplicatePreventionNanoErg: string | number | bigint;
  readonly creationHeight: number;
  readonly feeNanoErg?: string | number | bigint;
}

export interface ValidityApplicationPooledReserveReplayCutoverV5Packet {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_REPLAY_CUTOVER_V5_SCHEMA;
  readonly version: 5;
  readonly packetDigestHex: string;
  readonly sourceReplay: {
    readonly historicalReplayGenesisPacketDigestHex: string;
    readonly cutoverObservationReportDigestHex: string;
    readonly sourceV4LineageProfileIdHex: string;
    readonly canonicalBurnIdsHex: readonly string[];
    readonly canonicalBurnIdCount: number;
    readonly duplicatePreventionDigestHex: string;
  };
  readonly targetLineage: {
    readonly lineageProfileIdHex: string;
    readonly duplicatePreventionGenesisInputBoxIdHex: string;
    readonly duplicatePreventionNftIdHex: string;
    readonly duplicatePreventionContractIdHex: string;
  };
  readonly registers: {
    readonly R4: string;
    readonly R5: string;
  };
  readonly transaction: MaterializedUnsignedTransaction;
  readonly duplicatePreventionBox: Eip12Box;
  readonly invariants: {
    readonly globalReplayPacketConsumed: true;
    readonly sourceV4LineageMatched: true;
    readonly targetV5LineageRebound: true;
    readonly replayDigestPreserved: true;
    readonly exactV5ContractAndSingletonBound: true;
    readonly unsignedIssuanceOnly: true;
  };
  readonly boundaries: {
    readonly inventoryExhaustivenessAuthenticated: false;
    readonly legacyRoutesRetired: false;
    readonly singletonLineageEstablished: false;
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

export async function buildValidityApplicationPooledReserveReplayCutoverV5(
  input: BuildValidityApplicationPooledReserveReplayCutoverV5Input,
): Promise<Readonly<ValidityApplicationPooledReserveReplayCutoverV5Packet>> {
  assertExactKeys(input, [
    'compiledInstance',
    'historicalReplayGenesis',
    'duplicatePreventionGenesisInputBox',
    'duplicatePreventionNanoErg',
    'creationHeight',
    'feeNanoErg',
  ], 'pooled-reserve V5 replay-cutover input', ['feeNanoErg']);
  assertCompiledValidityApplicationPooledReserveInstanceV5Candidate(
    input.compiledInstance,
  );
  assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance(
    input.historicalReplayGenesis,
  );

  const compiled = input.compiledInstance;
  const historical = input.historicalReplayGenesis;
  const sourceLineageProfileIdHex = fixedHex(
    historical.lineage.lineageProfileIdHex,
    32,
    'historical replay source V4 lineage profile ID',
  );
  if (
    sourceLineageProfileIdHex
      !== fixedHex(
        compiled.sourceRuntimeLineageProfileIdHex,
        32,
        'compiled V5 source runtime lineage profile ID',
      )
  ) {
    throw new Error(
      'historical replay genesis does not match the exact V4 source runtime lineage',
    );
  }
  const targetLineageProfileIdHex = fixedHex(
    compiled.lineageProfileIdHex,
    32,
    'compiled V5 target lineage profile ID',
  );
  if (targetLineageProfileIdHex === sourceLineageProfileIdHex) {
    throw new Error(
      'pooled-reserve V5 replay cutover requires a distinct target settlement lineage',
    );
  }

  const canonicalBurnIdsHex = normalizeCanonicalBurnIds(
    historical.duplicatePreventionGenesis.canonicalBurnIdsHex,
  );
  const duplicatePreventionDigestHex = fixedHex(
    getDupTreeDigest([...canonicalBurnIdsHex]),
    33,
    'recomputed global replay digest',
  );
  const sourceRegisters = {
    R4: encodeCollByteRegister(Buffer.from(sourceLineageProfileIdHex, 'hex')),
    R5: encodeAvlTreeRegister(
      Buffer.from(duplicatePreventionDigestHex, 'hex'),
      INSERT_ONLY_AVL_FLAGS,
      1,
    ),
  };
  if (
    fixedHex(
      historical.duplicatePreventionGenesis.digestHex,
      33,
      'historical replay duplicate-prevention digest',
    ) !== duplicatePreventionDigestHex
    || historical.duplicatePreventionGenesis.registers.R4
      !== sourceRegisters.R4
    || historical.duplicatePreventionGenesis.registers.R5
      !== sourceRegisters.R5
  ) {
    throw new Error(
      'historical replay genesis does not encode the exact global V4 replay state',
    );
  }

  const genesisInput = await normalizeGenesisInput(
    input.duplicatePreventionGenesisInputBox,
    compiled.genesis.duplicatePreventionInputBoxIdHex,
  );
  const singletonValue = atLeastMinBox(
    input.duplicatePreventionNanoErg,
    'V5 duplicate-prevention singleton value',
  );
  const fee = atLeastMinBox(
    input.feeNanoErg ?? MINER_FEE,
    'V5 duplicate-prevention issuance fee',
  );
  const creationHeight = validCreationHeight(
    input.creationHeight,
    genesisInput.creationHeight,
  );
  const nftIdHex = fixedHex(
    compiled.genesis.duplicatePreventionNftIdHex,
    32,
    'compiled V5 duplicate-prevention NFT ID',
  );
  if (nftIdHex !== genesisInput.boxId) {
    throw new Error(
      'V5 duplicate-prevention NFT ID must equal its exact genesis input box ID',
    );
  }
  const propositionHex = variableHex(
    compiled.contracts.duplicatePrevention.receipt.propositionHex,
    'compiled V5 duplicate-prevention proposition',
  );
  const registers = Object.freeze({
    R4: encodeCollByteRegister(Buffer.from(targetLineageProfileIdHex, 'hex')),
    R5: sourceRegisters.R5,
  });
  const outputs: Eip12OutputCandidate[] = [{
    value: singletonValue,
    ergoTree: propositionHex,
    assets: [{ tokenId: nftIdHex, amount: '1' }],
    additionalRegisters: registers,
    creationHeight,
  }];
  appendChange(
    outputs,
    BigInt(genesisInput.value) - singletonValue - fee,
    genesisInput.ergoTree,
    creationHeight,
  );
  outputs.push({
    value: fee,
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight,
  });
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...genesisInput, extension: {} }],
    dataInputs: [],
    outputs,
  }, 'validity application pooled-reserve replay cutover V5');
  const duplicatePreventionBox = transaction.outputs[0]!;
  assertExactSingletonOutput({
    box: duplicatePreventionBox,
    value: singletonValue,
    propositionHex,
    nftIdHex,
    registers,
  });

  const sourceReplay = Object.freeze({
    historicalReplayGenesisPacketDigestHex: fixedHex(
      historical.packetDigestHex,
      32,
      'historical replay-genesis packet digest',
    ),
    cutoverObservationReportDigestHex: fixedHex(
      historical.observation.cutoverObservationReportDigestHex,
      32,
      'cutover observation report digest',
    ),
    sourceV4LineageProfileIdHex: sourceLineageProfileIdHex,
    canonicalBurnIdsHex: Object.freeze([...canonicalBurnIdsHex]),
    canonicalBurnIdCount: canonicalBurnIdsHex.length,
    duplicatePreventionDigestHex,
  });
  const targetLineage = Object.freeze({
    lineageProfileIdHex: targetLineageProfileIdHex,
    duplicatePreventionGenesisInputBoxIdHex: genesisInput.boxId,
    duplicatePreventionNftIdHex: nftIdHex,
    duplicatePreventionContractIdHex: fixedHex(
      compiled.contracts.duplicatePrevention.receipt.contractIdHex,
      32,
      'compiled V5 duplicate-prevention contract ID',
    ),
  });
  const binding = {
    schema: VALIDITY_APPLICATION_POOLED_RESERVE_REPLAY_CUTOVER_V5_SCHEMA,
    version: 5 as const,
    sourceReplay,
    targetLineage,
    registers,
    transaction,
    duplicatePreventionBox,
    invariants: Object.freeze({
      globalReplayPacketConsumed: true as const,
      sourceV4LineageMatched: true as const,
      targetV5LineageRebound: true as const,
      replayDigestPreserved: true as const,
      exactV5ContractAndSingletonBound: true as const,
      unsignedIssuanceOnly: true as const,
    }),
    boundaries: Object.freeze({
      inventoryExhaustivenessAuthenticated: false as const,
      legacyRoutesRetired: false as const,
      singletonLineageEstablished: false as const,
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
  };
  const packet = deepFreeze({
    ...binding,
    packetDigestHex: sha256CanonicalJson(binding, PACKET_DIGEST_DOMAIN),
  });
  packets.add(packet);
  return packet;
}

export function assertValidityApplicationPooledReserveReplayCutoverV5Provenance(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveReplayCutoverV5Packet
> {
  if (value === null || typeof value !== 'object' || !packets.has(value)) {
    throw new Error(
      'pooled-reserve V5 replay-cutover packet was not built in this process',
    );
  }
}

function normalizeCanonicalBurnIds(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error('historical replay canonical burn IDs must be an array');
  }
  const normalized = value.map((burnIdHex, index) => fixedHex(
    burnIdHex,
    32,
    `historical replay canonical burn ID ${index}`,
  ));
  if (
    normalized.some((burnIdHex, index) =>
      index > 0 && normalized[index - 1]! >= burnIdHex
    )
  ) {
    throw new Error(
      'historical replay canonical burn IDs must be strictly sorted and unique',
    );
  }
  return Object.freeze(normalized);
}

async function normalizeGenesisInput(
  value: Eip12Box,
  expectedBoxIdHex: string,
): Promise<Eip12Box> {
  const box = await normalizeEip12Box(
    value,
    'V5 duplicate-prevention genesis input',
  );
  if (box.boxId !== fixedHex(
    expectedBoxIdHex,
    32,
    'compiled V5 duplicate-prevention genesis input box ID',
  )) {
    throw new Error(
      'V5 duplicate-prevention genesis input does not match the compiled lineage',
    );
  }
  if (box.assets.length !== 0) {
    throw new Error('V5 duplicate-prevention genesis input must be pure ERG');
  }
  if (Object.keys(box.additionalRegisters).length !== 0) {
    throw new Error(
      'V5 duplicate-prevention genesis input must be register-free',
    );
  }
  return box;
}

function appendChange(
  outputs: Eip12OutputCandidate[],
  value: bigint,
  ergoTree: string,
  creationHeight: number,
): void {
  if (value < 0n) {
    throw new Error('V5 duplicate-prevention genesis input is underfunded');
  }
  if (value === 0n) return;
  if (value < MIN_BOX_VALUE) {
    throw new Error('V5 duplicate-prevention issuance change would be dust');
  }
  outputs.push({
    value,
    ergoTree: variableHex(ergoTree, 'V5 replay-cutover change ErgoTree'),
    assets: [],
    additionalRegisters: {},
    creationHeight,
  });
}

function assertExactSingletonOutput(input: {
  box: Eip12Box;
  value: bigint;
  propositionHex: string;
  nftIdHex: string;
  registers: Readonly<Record<string, string>>;
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
    throw new Error(
      `V5 duplicate-prevention singleton output drifted: ${drift.join(', ')}`,
    );
  }
}

function validCreationHeight(value: number, minimum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('V5 duplicate-prevention creation height must be positive');
  }
  if (value < minimum) {
    throw new Error(
      'V5 duplicate-prevention issuance predates its genesis input',
    );
  }
  return value;
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
    throw new Error(`${label} must be an even-length hex string`);
  }
  const normalized = value.toLowerCase().replace(/^0x/, '');
  if (!/^(?:[0-9a-f]{2})+$/.test(normalized)) {
    throw new Error(`${label} must be an even-length hex string`);
  }
  return normalized;
}

function assertExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
  optionalKeys: readonly string[] = [],
): asserts value is Record<string, unknown> {
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
