/**
 * Aggregate settlement transaction assembly helpers.
 *
 * This module turns the proof plan from aggregate-settlement-builder.ts into
 * an EIP-12-like unsigned transaction shape. It is intentionally single-claim
 * for V1. MainChainAggregateUnlock.es selects trackerIn.R5 for already-ingested
 * claims and trackerOut.R5 for claims inserted by SPVTracker.es in the same TX.
 */

import type { DeployedState } from './config.js';
import blakejs from 'blakejs';
import {
  decodeCanonicalDlogSigmaPropRegister,
  decodeCollByteRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import type {
  AggregateSettlementUnsignedTx,
  BoxLike,
} from './ergo-settlement-core/settlement-transaction.js';
import { encodeAuthenticatedSpvTrackerAvlRegister } from './spv-tracker-authenticated.js';
import {
  buildAuthenticatedSettlementTx as profileBuildAuthenticatedSettlementTx,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-transaction.js';
import { encodeSpvTrackerAvlRegister } from './spv-tracker.js';
import {
  decodePegInSourceIntentV2Hex,
  PEG_IN_SOURCE_INTENT_V2_BYTES,
} from './peg-in-causal-admission-v2.js';
import {
  buildTrustlessSingleLeafAggregateUnlockExtension,
  type AggregateSettlementPlan,
  type AuthenticatedSettlementPlan,
  type BatchSettlementPlan,
  type PlannedPegOutClaim,
} from './aggregate-settlement-builder.js';
import { planChangeOrFee, planChangeOrFeeBigInt, safeNanoErgNumber } from './tx-balance.js';

export type {
  AggregateSettlementUnsignedTx,
  BoxLike,
} from './ergo-settlement-core/settlement-transaction.js';

export interface BuildAggregateSettlementTxInput {
  deployed: Pick<
    DeployedState,
    'spvTracker' | 'doubleUnlockPreventionAggregate' | 'mainChainAggregateUnlock'
  >;
  plan: AggregateSettlementPlan;
  trackerBox: BoxLike;
  aggregateDupBox: BoxLike;
  unlockBox: BoxLike;
  recipientErgoTreeHex: string;
  creationHeight: number;
  minerFee?: number;
}

export interface BuildTrustlessSingleLeafAggregateSettlementTxInput {
  deployed: Pick<
    DeployedState,
    'spvTracker' | 'doubleUnlockPreventionAggregate' | 'mainChainAggregateUnlockTrustless'
  >;
  plan: AggregateSettlementPlan;
  trackerBox: BoxLike;
  aggregateDupBox: BoxLike;
  unlockBox: BoxLike;
  recipientErgoTreeHex: string;
  creationHeight: number;
  minerFee?: number;
}

type AuthenticatedTrackerDeploymentIdentity = Pick<
  NonNullable<DeployedState['spvTrackerAuthenticated']>,
  'nftId' | 'ergoTreeHex'
> & Partial<NonNullable<DeployedState['spvTrackerAuthenticated']>>;

type AuthenticatedDupDeploymentIdentity = Pick<
  NonNullable<DeployedState['doubleUnlockPreventionAuthenticated']>,
  'nftId' | 'ergoTreeHex'
> & Partial<NonNullable<DeployedState['doubleUnlockPreventionAuthenticated']>>;

type AuthenticatedVaultDeploymentIdentity = Pick<
  NonNullable<DeployedState['mainChainAggregateUnlockAuthenticated']>,
  'ergoTreeHex'
> & Partial<NonNullable<DeployedState['mainChainAggregateUnlockAuthenticated']>>;

export interface AuthenticatedSettlementDeploymentIdentity {
  spvTrackerAuthenticated?: AuthenticatedTrackerDeploymentIdentity;
  doubleUnlockPreventionAuthenticated?: AuthenticatedDupDeploymentIdentity;
  mainChainAggregateUnlockAuthenticated?: AuthenticatedVaultDeploymentIdentity;
}

export interface BuildAuthenticatedSettlementTxInput {
  deployed: AuthenticatedSettlementDeploymentIdentity;
  plan: AuthenticatedSettlementPlan;
  trackerBox: BoxLike;
  duplicatePreventionBox: BoxLike;
  unlockBox: BoxLike;
  recipientErgoTreeHex: string;
  creationHeight: number;
  minerFee?: number;
}

export interface CausalAuthenticatedSettlementDeploymentIdentity {
  spvTrackerAuthenticated?: AuthenticatedTrackerDeploymentIdentity;
  doubleUnlockPreventionCausalV2?: AuthenticatedDupDeploymentIdentity;
  mainChainCausalVaultV2?: AuthenticatedVaultDeploymentIdentity;
}

export interface BuildCausalAuthenticatedSettlementTxInput {
  deployed: CausalAuthenticatedSettlementDeploymentIdentity;
  plan: AuthenticatedSettlementPlan;
  trackerBox: BoxLike;
  duplicatePreventionBox: BoxLike;
  unlockBox: BoxLike;
  recipientErgoTreeHex: string;
  expectedSourceNetworkIdHex: string;
  expectedAdmissionProfileIdHex: string;
  creationHeight: number;
  minerFee?: number | string | bigint;
}

const BURN_DOMAIN = Buffer.from('E2S_BURN_V1', 'ascii');
const MIN_BOX_VALUE = 1_000_000;
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;

function normalizeHex(hex: string, expectedBytes: number, label: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be hex`);
  }
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${clean.length / 2}`);
  }
  return clean.toLowerCase();
}

function decodeLongRegister(hex: string | undefined, label: string): number {
  if (!hex || !hex.startsWith('05')) return 0;
  const bytes = Buffer.from(hex.slice(2), 'hex');
  let result = 0n;
  let shift = 0n;
  for (const byte of bytes) {
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
  }
  const zigzag = (result >> 1n) ^ -(result & 1n);
  return safeNanoErgNumber(zigzag, label);
}

function amountToBytes(amount: bigint): Buffer {
  if (amount < 0n || amount > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`amount is outside u64 range: ${amount}`);
  }
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(amount);
  return out;
}

function blake2b256(data: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(data, undefined, 32));
}

export function deriveAggregateBurnEventRoot(
  burnTxIdHex: string,
  recipientErgoTreeHex: string,
  amount: bigint,
): string {
  const burnTxId = Buffer.from(normalizeHex(burnTxIdHex, 32, 'burnTxId'), 'hex');
  const recipientTree = Buffer.from(normalizeHex(recipientErgoTreeHex, 36, 'recipientErgoTree'), 'hex');
  const amountBytes = amountToBytes(amount);
  return blake2b256(Buffer.concat([BURN_DOMAIN, burnTxId, recipientTree, amountBytes])).toString('hex');
}

function getFirstTokenId(box: BoxLike, label: string): string {
  const tokenId = box.assets?.[0]?.tokenId;
  if (!tokenId) throw new Error(`${label} is missing singleton token`);
  return tokenId;
}

function getRegister(box: BoxLike, register: string, label: string): string {
  const value = box.additionalRegisters?.[register];
  if (!value) throw new Error(`${label} missing ${register}`);
  return value;
}

function buildUnlockExtension(
  claim: PlannedPegOutClaim,
  recipientErgoTreeHex: string,
  amount: bigint,
  insertProofHex: string,
): Record<string, string> {
  const amountBytes = amountToBytes(amount);
  return {
    '0': encodeCollByteRegister(Buffer.from(claim.trackerKeyHex, 'hex')),
    '1': encodeCollByteRegister(Buffer.from(claim.trackerProofHex, 'hex')),
    '2': encodeCollByteRegister(Buffer.from(claim.burnTxIdHex, 'hex')),
    '3': encodeCollByteRegister(amountBytes),
    '4': encodeCollByteRegister(Buffer.from(recipientErgoTreeHex, 'hex')),
    '5': encodeCollByteRegister(Buffer.from(claim.dupLookupProofHex, 'hex')),
    '6': encodeCollByteRegister(Buffer.from(insertProofHex, 'hex')),
    '7': encodeIntRegister(claim.trackerTree === 'output' ? 1 : 0),
  };
}

function assertLegacyAggregateContractCompatible(plan: AggregateSettlementPlan): void {
  if (plan.contractCompatibility !== 'legacy-aggregate-v1') {
    throw new Error(
      'aggregate TX assembly requires legacy-aggregate-v1 plan; trustless settlement candidates need V2 contracts',
    );
  }
}

function assertSingletonToken(box: BoxLike, expectedTokenId: string, label: string): void {
  if ((box.assets?.length ?? 0) !== 1) {
    throw new Error(`${label} must contain exactly one singleton token`);
  }
  const token = box.assets![0];
  if (normalizeHex(token.tokenId, 32, `${label} token ID`) !== normalizeHex(expectedTokenId, 32, `${label} expected token ID`)) {
    throw new Error(`${label} singleton token ID does not match deployed contract`);
  }
  if (BigInt(token.amount) !== 1n) {
    throw new Error(`${label} singleton token amount must be 1`);
  }
}

function decodeCanonicalDupAvlRegister(registerHex: string, label: string): {
  digestHex: string;
  flags: number;
} {
  const clean = registerHex.startsWith('0x') ? registerHex.slice(2) : registerHex;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length !== 76 || clean.slice(0, 2).toLowerCase() !== '64') {
    throw new Error(`${label} must be a canonical AvlTree register`);
  }
  if (clean.slice(70, 72).toLowerCase() !== '20' || clean.slice(72).toLowerCase() !== '0101') {
    throw new Error(`${label} must use 32-byte keys and one-byte values`);
  }
  const flags = Number.parseInt(clean.slice(68, 70), 16);
  if ((flags & 0x01) === 0) {
    throw new Error(`${label} must permit append-only inserts`);
  }
  return {
    digestHex: clean.slice(2, 68).toLowerCase(),
    flags,
  };
}

function getSettlementVaultRegisters(box: BoxLike): Record<string, string> {
  if ((box.assets?.length ?? 0) !== 0) {
    throw new Error('trustless settlement vault input must be pure ERG');
  }
  return {
    R4: getRegister(box, 'R4', 'trustless settlement vault input'),
    R5: getRegister(box, 'R5', 'trustless settlement vault input'),
    R6: getRegister(box, 'R6', 'trustless settlement vault input'),
    R7: getRegister(box, 'R7', 'trustless settlement vault input'),
  };
}

function getCausalSettlementVaultRegisters(
  box: BoxLike,
  expectedSourceNetworkIdHex: string,
  expectedSidechainIdHex: string,
  expectedAdmissionProfileIdHex: string,
): Record<string, string> {
  if ((box.assets?.length ?? 0) !== 0) {
    throw new Error('causal settlement vault input must be pure ERG');
  }
  const intentRegister = getRegister(box, 'R4', 'causal settlement vault input');
  const sourceBoxIdRegister = getRegister(box, 'R5', 'causal settlement vault input');
  const intentHex = decodeCollByteRegister(intentRegister, 'causal settlement vault R4');
  if (Buffer.from(intentHex, 'hex').length !== PEG_IN_SOURCE_INTENT_V2_BYTES) {
    throw new Error(`causal settlement vault R4 must contain ${PEG_IN_SOURCE_INTENT_V2_BYTES} bytes`);
  }
  if (encodeCollByteRegister(Buffer.from(intentHex, 'hex')) !== intentRegister.toLowerCase()) {
    throw new Error('causal settlement vault R4 must use canonical Coll[Byte] serialization');
  }
  const intent = decodePegInSourceIntentV2Hex(`0x${intentHex}`);
  if (
    intent.sourceNetworkIdHex
    !== `0x${normalizeHex(expectedSourceNetworkIdHex, 32, 'expectedSourceNetworkId')}`
  ) {
    throw new Error('causal settlement vault source network does not match the active profile');
  }
  if (
    intent.sidechainIdHex
    !== `0x${normalizeHex(expectedSidechainIdHex, 32, 'expectedSidechainId')}`
  ) {
    throw new Error('causal settlement vault sidechain does not match the burn claim');
  }
  if (
    intent.admissionProfileIdHex
    !== `0x${normalizeHex(expectedAdmissionProfileIdHex, 32, 'expectedAdmissionProfileId')}`
  ) {
    throw new Error('causal settlement vault admission profile does not match the active profile');
  }
  if (intent.sourceAssetIdHex !== `0x${'00'.repeat(32)}`) {
    throw new Error('causal settlement vault source asset must be the native ERG zero asset ID');
  }
  const sourceAmount = positiveErgoLong(
    intent.amountNanoErg,
    'causal source intent amount',
  );
  const vaultValue = positiveErgoLong(box.value, 'causal settlement vault value');
  if (vaultValue > sourceAmount) {
    throw new Error('causal settlement vault value must be positive and no greater than source intent amount');
  }
  const sourceBoxIdHex = decodeCollByteRegister(
    sourceBoxIdRegister,
    'causal settlement vault R5',
  );
  if (sourceBoxIdHex === '00'.repeat(32)) {
    throw new Error('causal settlement vault source box ID must be nonzero');
  }
  normalizeHex(sourceBoxIdHex, 32, 'causal settlement vault source box ID');
  if (
    encodeCollByteRegister(Buffer.from(sourceBoxIdHex, 'hex'))
    !== sourceBoxIdRegister.toLowerCase()
  ) {
    throw new Error('causal settlement vault R5 must use canonical Coll[Byte] serialization');
  }
  return { R4: intentRegister.toLowerCase(), R5: sourceBoxIdRegister.toLowerCase() };
}

function positiveErgoLong(value: number | string | bigint, label: string): bigint {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be supplied as an exact integer`);
  }
  if (typeof value === 'string' && !/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be an unsigned decimal integer`);
  }
  const amount = BigInt(value);
  if (amount <= 0n) throw new Error(`${label} must be positive`);
  if (amount > ERGO_POSITIVE_LONG_MAX) {
    throw new Error(`${label} exceeds the positive Ergo Long range`);
  }
  return amount;
}

function assertTrustlessSingleLeafContractCompatible(plan: AggregateSettlementPlan): void {
  if (plan.contractCompatibility !== 'candidate-only-trustless-v2-required') {
    throw new Error(
      'trustless single-leaf aggregate TX assembly requires candidate-only-trustless-v2-required plan',
    );
  }
}

export function buildSingleClaimAggregateSettlementTx(
  input: BuildAggregateSettlementTxInput,
): AggregateSettlementUnsignedTx {
  const deployed = input.deployed;
  if (!deployed.spvTracker) throw new Error('deployed.spvTracker is required');
  if (!deployed.doubleUnlockPreventionAggregate) {
    throw new Error('deployed.doubleUnlockPreventionAggregate is required');
  }
  if (!deployed.mainChainAggregateUnlock) {
    throw new Error('deployed.mainChainAggregateUnlock is required');
  }
  if (input.plan.claims.length !== 1) {
    throw new Error(`V1 aggregate settlement TX builder requires exactly one claim, got ${input.plan.claims.length}`);
  }
  if (!input.plan.dupV1Extension) {
    throw new Error('V1 aggregate settlement requires dupV1Extension');
  }
  assertLegacyAggregateContractCompatible(input.plan);

  const claim = input.plan.claims[0];
  const amount = BigInt(claim.claim.pegOut.amount);
  const expectedEventRoot = deriveAggregateBurnEventRoot(
    claim.burnTxIdHex,
    input.recipientErgoTreeHex,
    amount,
  );
  if (expectedEventRoot !== claim.bridgeEventRootHex) {
    throw new Error(
      `claim bridgeEventRoot does not match V1 burn root preimage: expected ${expectedEventRoot}, got ${claim.bridgeEventRootHex}`,
    );
  }

  const minerFee = safeNanoErgNumber(input.minerFee ?? MINER_FEE, 'miner fee');
  const payoutValue = safeNanoErgNumber(amount, 'payout amount');
  const trackerValue = safeNanoErgNumber(input.trackerBox.value, 'trackerBox value');
  const dupValue = safeNanoErgNumber(input.aggregateDupBox.value, 'aggregateDupBox value');
  const unlockValue = safeNanoErgNumber(input.unlockBox.value, 'unlockBox value');
  const feeValue = minerFee;

  if (unlockValue < payoutValue + feeValue) {
    throw new Error(`unlockBox value ${unlockValue} does not cover payout ${payoutValue} + fee ${feeValue}`);
  }
  const unlockChange = unlockValue - payoutValue - feeValue;
  const unlockChangePlan = planChangeOrFee(unlockChange, feeValue, MIN_BOX_VALUE);

  const trackerCounter = decodeLongRegister(input.trackerBox.additionalRegisters?.R4, 'tracker counter');
  const trackerLatestSidechainHeight = decodeLongRegister(
    input.trackerBox.additionalRegisters?.R7,
    'tracker latest sidechain height',
  );
  const trackerOutputLatestSidechainHeight = input.plan.trackerIngests[0]
    ? safeNanoErgNumber(input.plan.trackerIngests[0].entry.sidechainHeight, 'tracker ingest sidechainHeight')
    : trackerLatestSidechainHeight;
  const trackerCommittee = getRegister(input.trackerBox, 'R6', 'trackerBox');

  const dupCounter = decodeLongRegister(input.aggregateDupBox.additionalRegisters?.R4, 'DUP counter');
  const dupRelayerPk = getRegister(input.aggregateDupBox, 'R6', 'aggregateDupBox');
  const dupFlagsHex = input.aggregateDupBox.additionalRegisters?.R5?.slice(68, 70) ?? '0b';
  const dupFlags = parseInt(dupFlagsHex, 16);

  const outputs: any[] = [
    {
      value: trackerValue,
      ergoTree: deployed.spvTracker.ergoTreeHex,
      assets: [{ tokenId: getFirstTokenId(input.trackerBox, 'trackerBox'), amount: 1 }],
      additionalRegisters: {
        R4: encodeLongRegister(trackerCounter + 1),
        R5: encodeSpvTrackerAvlRegister(input.plan.trackerOutputDigestHex),
        R6: trackerCommittee,
        R7: encodeLongRegister(trackerOutputLatestSidechainHeight),
        R8: encodeIntRegister(input.creationHeight),
      },
      creationHeight: input.creationHeight,
    },
    {
      value: dupValue,
      ergoTree: deployed.doubleUnlockPreventionAggregate.ergoTreeHex,
      assets: [{ tokenId: getFirstTokenId(input.aggregateDupBox, 'aggregateDupBox'), amount: 1 }],
      additionalRegisters: {
        R4: encodeLongRegister(dupCounter + 1),
        R5: encodeAvlTreeRegister(Buffer.from(input.plan.dupOutputDigestHex, 'hex'), dupFlags, 1),
        R6: dupRelayerPk,
      },
      creationHeight: input.creationHeight,
    },
    {
      value: payoutValue,
      ergoTree: input.recipientErgoTreeHex,
      assets: [],
      additionalRegisters: {},
      creationHeight: input.creationHeight,
    },
  ];

  if (unlockChangePlan.changeOutputValue > 0) {
    outputs.push({
      value: unlockChangePlan.changeOutputValue,
      ergoTree: deployed.mainChainAggregateUnlock.ergoTreeHex,
      assets: [],
      additionalRegisters: {},
      creationHeight: input.creationHeight,
    });
  }

  outputs.push({
    value: unlockChangePlan.minerFeeValue,
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: input.creationHeight,
  });

  return {
    inputs: [
      {
        boxId: input.trackerBox.boxId,
        extension: input.plan.trackerIngests[0]?.trackerExtension ?? {},
      },
      {
        boxId: input.aggregateDupBox.boxId,
        extension: input.plan.dupV1Extension,
      },
      {
        boxId: input.unlockBox.boxId,
        extension: buildUnlockExtension(
          claim,
          input.recipientErgoTreeHex,
          amount,
          input.plan.dupProofs.insert_proof_hex,
        ),
      },
    ],
    dataInputs: [],
    outputs,
  };
}

// -- V2 trustless single-leaf aggregate settlement TX assembly --

export function buildTrustlessSingleLeafAggregateSettlementTx(
  input: BuildTrustlessSingleLeafAggregateSettlementTxInput,
): AggregateSettlementUnsignedTx {
  const deployed = input.deployed;
  if (!deployed.spvTracker) throw new Error('deployed.spvTracker is required');
  if (!deployed.doubleUnlockPreventionAggregate) {
    throw new Error('deployed.doubleUnlockPreventionAggregate is required');
  }
  if (!deployed.mainChainAggregateUnlockTrustless) {
    throw new Error('deployed.mainChainAggregateUnlockTrustless is required');
  }
  if (input.plan.claims.length !== 1) {
    throw new Error(
      `V2 trustless single-leaf aggregate settlement TX builder requires exactly one claim, got ${input.plan.claims.length}`,
    );
  }
  if (!input.plan.dupV1Extension) {
    throw new Error('V2 trustless single-leaf aggregate settlement requires dupV1Extension');
  }
  assertTrustlessSingleLeafContractCompatible(input.plan);

  const claim = input.plan.claims[0];
  const amount = BigInt(claim.claim.pegOut.amount);
  const minerFee = safeNanoErgNumber(input.minerFee ?? MINER_FEE, 'miner fee');
  const payoutValue = safeNanoErgNumber(amount, 'payout amount');
  const trackerValue = safeNanoErgNumber(input.trackerBox.value, 'trackerBox value');
  const dupValue = safeNanoErgNumber(input.aggregateDupBox.value, 'aggregateDupBox value');
  const unlockValue = safeNanoErgNumber(input.unlockBox.value, 'unlockBox value');
  const feeValue = minerFee;
  const vaultRegisters = getSettlementVaultRegisters(input.unlockBox);

  if (unlockValue < payoutValue + feeValue) {
    throw new Error(`unlockBox value ${unlockValue} does not cover payout ${payoutValue} + fee ${feeValue}`);
  }
  const unlockChange = unlockValue - payoutValue - feeValue;
  const unlockChangePlan = planChangeOrFee(unlockChange, feeValue, MIN_BOX_VALUE);

  const trackerCounter = decodeLongRegister(input.trackerBox.additionalRegisters?.R4, 'tracker counter');
  const trackerLatestSidechainHeight = decodeLongRegister(
    input.trackerBox.additionalRegisters?.R7,
    'tracker latest sidechain height',
  );
  const trackerOutputLatestSidechainHeight = input.plan.trackerIngests[0]
    ? safeNanoErgNumber(input.plan.trackerIngests[0].entry.sidechainHeight, 'tracker ingest sidechainHeight')
    : trackerLatestSidechainHeight;
  const trackerCommittee = getRegister(input.trackerBox, 'R6', 'trackerBox');

  const dupCounter = decodeLongRegister(input.aggregateDupBox.additionalRegisters?.R4, 'DUP counter');
  const dupRelayerPk = getRegister(input.aggregateDupBox, 'R6', 'aggregateDupBox');
  const dupFlagsHex = input.aggregateDupBox.additionalRegisters?.R5?.slice(68, 70) ?? '0b';
  const dupFlags = parseInt(dupFlagsHex, 16);

  const outputs: any[] = [
    {
      value: trackerValue,
      ergoTree: deployed.spvTracker.ergoTreeHex,
      assets: [{ tokenId: getFirstTokenId(input.trackerBox, 'trackerBox'), amount: 1 }],
      additionalRegisters: {
        R4: encodeLongRegister(trackerCounter + 1),
        R5: encodeSpvTrackerAvlRegister(input.plan.trackerOutputDigestHex),
        R6: trackerCommittee,
        R7: encodeLongRegister(trackerOutputLatestSidechainHeight),
        R8: encodeIntRegister(input.creationHeight),
      },
      creationHeight: input.creationHeight,
    },
    {
      value: dupValue,
      ergoTree: deployed.doubleUnlockPreventionAggregate.ergoTreeHex,
      assets: [{ tokenId: getFirstTokenId(input.aggregateDupBox, 'aggregateDupBox'), amount: 1 }],
      additionalRegisters: {
        R4: encodeLongRegister(dupCounter + 1),
        R5: encodeAvlTreeRegister(Buffer.from(input.plan.dupOutputDigestHex, 'hex'), dupFlags, 1),
        R6: dupRelayerPk,
      },
      creationHeight: input.creationHeight,
    },
    {
      value: payoutValue,
      ergoTree: input.recipientErgoTreeHex,
      assets: [],
      additionalRegisters: {},
      creationHeight: input.creationHeight,
    },
  ];

  if (unlockChangePlan.changeOutputValue > 0) {
    outputs.push({
      value: unlockChangePlan.changeOutputValue,
      ergoTree: deployed.mainChainAggregateUnlockTrustless.ergoTreeHex,
      assets: [],
      additionalRegisters: vaultRegisters,
      creationHeight: input.creationHeight,
    });
  }

  outputs.push({
    value: unlockChangePlan.minerFeeValue,
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: input.creationHeight,
  });

  return {
    inputs: [
      {
        boxId: input.trackerBox.boxId,
        extension: input.plan.trackerIngests[0]?.trackerExtension ?? {},
      },
      {
        boxId: input.aggregateDupBox.boxId,
        extension: input.plan.dupV1Extension,
      },
      {
        boxId: input.unlockBox.boxId,
        extension: buildTrustlessSingleLeafAggregateUnlockExtension({
          claim,
          recipientErgoTreeHex: input.recipientErgoTreeHex,
          insertProofHex: input.plan.dupProofs.insert_proof_hex,
        }),
      },
    ],
    dataInputs: [],
    outputs,
  };
}

// -- Authenticated V2 single-leaf settlement TX assembly --

export const buildAuthenticatedSettlementTx =
  profileBuildAuthenticatedSettlementTx as (
    input: BuildAuthenticatedSettlementTxInput,
  ) => AggregateSettlementUnsignedTx;

/**
 * Builds the authenticated settlement shape for MainChainCausalVaultV2. This
 * keeps the existing tracker, burn-proof and DUP semantics while preserving
 * only the causal V2 vault registers (intent plus consumed source box ID).
 */
export function buildCausalAuthenticatedSettlementTx(
  input: BuildCausalAuthenticatedSettlementTxInput,
): AggregateSettlementUnsignedTx {
  const deployed = input.deployed;
  if (!deployed.spvTrackerAuthenticated) {
    throw new Error('deployed.spvTrackerAuthenticated is required');
  }
  if (!deployed.doubleUnlockPreventionCausalV2) {
    throw new Error('deployed.doubleUnlockPreventionCausalV2 is required');
  }
  if (!deployed.mainChainCausalVaultV2) {
    throw new Error('deployed.mainChainCausalVaultV2 is required');
  }
  if (input.plan.contractCompatibility !== 'authenticated-v2') {
    throw new Error('causal settlement TX assembly requires an authenticated-v2 plan');
  }
  if (input.plan.claims.length !== 1 || !input.plan.dupV1Extension) {
    throw new Error('causal settlement TX assembly requires one claim and one DUP extension');
  }

  const trackerDeployment = deployed.spvTrackerAuthenticated;
  const dupDeployment = deployed.doubleUnlockPreventionCausalV2;
  const unlockDeployment = deployed.mainChainCausalVaultV2;
  if (input.trackerBox.ergoTree.toLowerCase() !== trackerDeployment.ergoTreeHex.toLowerCase()) {
    throw new Error('authenticated tracker box ErgoTree does not match deployed contract');
  }
  if (
    input.duplicatePreventionBox.ergoTree.toLowerCase()
    !== dupDeployment.ergoTreeHex.toLowerCase()
  ) {
    throw new Error('authenticated DUP box ErgoTree does not match deployed contract');
  }
  if (input.unlockBox.ergoTree.toLowerCase() !== unlockDeployment.ergoTreeHex.toLowerCase()) {
    throw new Error('causal settlement vault ErgoTree does not match deployed contract');
  }
  assertSingletonToken(input.trackerBox, trackerDeployment.nftId, 'authenticated tracker box');
  assertSingletonToken(
    input.duplicatePreventionBox,
    dupDeployment.nftId,
    'authenticated DUP box',
  );

  const claim = input.plan.claims[0];
  const trackerRegister = getRegister(input.trackerBox, 'R5', 'authenticated tracker box');
  const expectedTrackerRegister = encodeAuthenticatedSpvTrackerAvlRegister(
    input.plan.trackerInputDigestHex,
  );
  if (trackerRegister.toLowerCase() !== expectedTrackerRegister.toLowerCase()) {
    throw new Error('authenticated tracker box R5 does not match the plan input digest');
  }
  const trackerSidechainId = decodeCollByteRegister(
    getRegister(input.trackerBox, 'R6', 'authenticated tracker box'),
    'authenticated tracker box R6',
  );
  if (trackerSidechainId !== claim.claim.trackerIdentity.sidechainIdHex.toLowerCase()) {
    throw new Error('authenticated tracker box R6 does not match the claim sidechain ID');
  }
  const trackerFinalityAttestorPubKeyHex = decodeCanonicalDlogSigmaPropRegister(
    getRegister(input.trackerBox, 'R9', 'authenticated tracker box'),
    'authenticated tracker box R9',
  );
  const bridgeCommitteePubKeyHex = decodeCanonicalDlogSigmaPropRegister(
    getRegister(input.duplicatePreventionBox, 'R6', 'authenticated DUP box'),
    'authenticated DUP box R6',
  );
  if (trackerFinalityAttestorPubKeyHex === bridgeCommitteePubKeyHex) {
    throw new Error(
      'causal settlement requires distinct tracker finality-attestor and bridge-committee Sigma propositions',
    );
  }

  const dupRegister = decodeCanonicalDupAvlRegister(
    getRegister(input.duplicatePreventionBox, 'R5', 'authenticated DUP box'),
    'authenticated DUP box R5',
  );
  if (dupRegister.digestHex !== input.plan.dupInputDigestHex) {
    throw new Error('authenticated DUP box R5 does not match the plan input digest');
  }

  const amount = BigInt(claim.claim.pegOut.amount);
  if (amount <= 0n || amount > 0x7fff_ffff_ffff_ffffn) {
    throw new Error('causal settlement payout must fit a positive signed Long');
  }
  const payoutValue = positiveErgoLong(amount, 'causal settlement payout');
  const minerFee = positiveErgoLong(input.minerFee ?? MINER_FEE, 'miner fee');
  if (minerFee < BigInt(MIN_BOX_VALUE) || minerFee > 2_100_000n) {
    throw new Error('causal settlement miner fee must be between 1000000 and 2100000 nanoERG');
  }
  const dupValue = positiveErgoLong(
    input.duplicatePreventionBox.value,
    'authenticated DUP box value',
  );
  const unlockValue = positiveErgoLong(
    input.unlockBox.value,
    'causal settlement vault value',
  );
  const vaultRegisters = getCausalSettlementVaultRegisters(
    input.unlockBox,
    input.expectedSourceNetworkIdHex,
    claim.claim.trackerIdentity.sidechainIdHex,
    input.expectedAdmissionProfileIdHex,
  );
  if (unlockValue < payoutValue + minerFee) {
    throw new Error(
      `causal settlement vault value ${unlockValue} does not cover payout ${payoutValue} + fee ${minerFee}`,
    );
  }
  const changePlan = planChangeOrFeeBigInt(
    unlockValue - payoutValue - minerFee,
    minerFee,
    BigInt(MIN_BOX_VALUE),
  );
  if (changePlan.minerFeeValue > 2_100_000n) {
    throw new Error(
      'causal settlement effective miner fee exceeds the on-chain 2100000 nanoERG cap',
    );
  }
  const dupCounter = decodeLongRegister(
    input.duplicatePreventionBox.additionalRegisters?.R4,
    'authenticated DUP counter',
  );
  const dupAuthMetadata = getRegister(
    input.duplicatePreventionBox,
    'R6',
    'authenticated DUP box',
  );

  const outputs: any[] = [
    {
      value: dupValue.toString(),
      ergoTree: dupDeployment.ergoTreeHex,
      assets: [{ tokenId: dupDeployment.nftId, amount: 1 }],
      additionalRegisters: {
        R4: encodeLongRegister(dupCounter + 1),
        R5: encodeAvlTreeRegister(
          Buffer.from(input.plan.dupOutputDigestHex, 'hex'),
          dupRegister.flags,
          1,
        ),
        R6: dupAuthMetadata,
      },
      creationHeight: input.creationHeight,
    },
    {
      value: payoutValue.toString(),
      ergoTree: normalizeHex(input.recipientErgoTreeHex, 36, 'recipientErgoTree'),
      assets: [],
      additionalRegisters: {},
      creationHeight: input.creationHeight,
    },
  ];

  if (changePlan.changeOutputValue > 0n) {
    outputs.push({
      value: changePlan.changeOutputValue.toString(),
      ergoTree: unlockDeployment.ergoTreeHex,
      assets: [],
      additionalRegisters: vaultRegisters,
      creationHeight: input.creationHeight,
    });
  }
  outputs.push({
    value: changePlan.minerFeeValue.toString(),
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: input.creationHeight,
  });

  return {
    inputs: [
      {
        boxId: input.duplicatePreventionBox.boxId,
        extension: input.plan.dupV1Extension,
      },
      {
        boxId: input.unlockBox.boxId,
        extension: buildTrustlessSingleLeafAggregateUnlockExtension({
          claim,
          recipientErgoTreeHex: input.recipientErgoTreeHex,
          insertProofHex: input.plan.dupProofs.insert_proof_hex,
        }),
      },
    ],
    dataInputs: [{ boxId: input.trackerBox.boxId }],
    outputs,
  };
}

// -- Batch multi-claim aggregate settlement TX assembly --

export interface BuildBatchAggregateSettlementTxInput {
  deployed: Pick<
    DeployedState,
    'spvTracker' | 'doubleUnlockPreventionAggregateBatch' | 'mainChainAggregateUnlockBatch'
  >;
  plan: BatchSettlementPlan;
  trackerBox: BoxLike;
  aggregateDupBox: BoxLike;
  unlockBox: BoxLike;
  creationHeight: number;
  minerFee?: number;
}

/**
 * Build a batch aggregate settlement TX for multiple claims.
 *
 * TX shape:
 *   INPUTS(0):  SPVTracker singleton
 *   INPUTS(1):  batch DUP singleton
 *   INPUTS(2):  single batch unlock liquidity box
 *   OUTPUTS(0): SPVTracker successor
 *   OUTPUTS(1): batch DUP successor
 *   OUTPUTS(2..count+1): N payout boxes
 *   OUTPUTS(count+2): change (optional)
 *   OUTPUTS(last): miner fee
 */
export function buildBatchAggregateSettlementTx(
  input: BuildBatchAggregateSettlementTxInput,
): AggregateSettlementUnsignedTx {
  const deployed = input.deployed;
  if (!deployed.spvTracker) throw new Error('deployed.spvTracker is required');
  if (!deployed.doubleUnlockPreventionAggregateBatch) {
    throw new Error('deployed.doubleUnlockPreventionAggregateBatch is required');
  }
  if (!deployed.mainChainAggregateUnlockBatch) {
    throw new Error('deployed.mainChainAggregateUnlockBatch is required');
  }
  const plan = input.plan;
  assertLegacyAggregateContractCompatible(plan);
  const claimCount = plan.claims.length;
  if (claimCount < 2) {
    throw new Error(`Batch TX assembly requires at least 2 claims, got ${claimCount}`);
  }

  // Validate total payout fits in safe integer range
  const minerFee = safeNanoErgNumber(input.minerFee ?? MINER_FEE, 'miner fee');
  let totalPayoutBigInt = 0n;
  for (const amount of plan.payoutAmounts) {
    totalPayoutBigInt += amount;
  }
  const totalPayout = safeNanoErgNumber(totalPayoutBigInt, 'total batch payout');

  const trackerValue = safeNanoErgNumber(input.trackerBox.value, 'trackerBox value');
  const dupValue = safeNanoErgNumber(input.aggregateDupBox.value, 'aggregateDupBox value');
  const unlockValue = safeNanoErgNumber(input.unlockBox.value, 'unlockBox value');

  if (unlockValue < totalPayout + minerFee) {
    throw new Error(
      `unlockBox value ${unlockValue} does not cover total payout ${totalPayout} + fee ${minerFee}`,
    );
  }
  const unlockChange = unlockValue - totalPayout - minerFee;
  const unlockChangePlan = planChangeOrFee(unlockChange, minerFee, MIN_BOX_VALUE);

  // Tracker successor registers
  const trackerCounter = decodeLongRegister(input.trackerBox.additionalRegisters?.R4, 'tracker counter');
  const trackerLatestSidechainHeight = decodeLongRegister(
    input.trackerBox.additionalRegisters?.R7,
    'tracker latest sidechain height',
  );
  const trackerOutputLatestSidechainHeight = plan.trackerIngests[0]
    ? safeNanoErgNumber(plan.trackerIngests[0].entry.sidechainHeight, 'tracker ingest sidechainHeight')
    : trackerLatestSidechainHeight;
  const trackerCommittee = getRegister(input.trackerBox, 'R6', 'trackerBox');

  // DUP successor registers
  const dupCounter = decodeLongRegister(input.aggregateDupBox.additionalRegisters?.R4, 'DUP counter');
  const dupRelayerPk = getRegister(input.aggregateDupBox, 'R6', 'aggregateDupBox');
  const dupFlagsHex = input.aggregateDupBox.additionalRegisters?.R5?.slice(68, 70) ?? '0b';
  const dupFlags = parseInt(dupFlagsHex, 16);

  // Build outputs
  const outputs: any[] = [
    // OUTPUTS(0): tracker successor
    {
      value: trackerValue,
      ergoTree: deployed.spvTracker.ergoTreeHex,
      assets: [{ tokenId: getFirstTokenId(input.trackerBox, 'trackerBox'), amount: 1 }],
      additionalRegisters: {
        R4: encodeLongRegister(trackerCounter + 1),
        R5: encodeSpvTrackerAvlRegister(plan.trackerOutputDigestHex),
        R6: trackerCommittee,
        R7: encodeLongRegister(trackerOutputLatestSidechainHeight),
        R8: encodeIntRegister(input.creationHeight),
      },
      creationHeight: input.creationHeight,
    },
    // OUTPUTS(1): batch DUP successor
    {
      value: dupValue,
      ergoTree: deployed.doubleUnlockPreventionAggregateBatch.ergoTreeHex,
      assets: [{ tokenId: getFirstTokenId(input.aggregateDupBox, 'aggregateDupBox'), amount: 1 }],
      additionalRegisters: {
        R4: encodeLongRegister(dupCounter + 1),
        R5: encodeAvlTreeRegister(Buffer.from(plan.dupOutputDigestHex, 'hex'), dupFlags, 1),
        R6: dupRelayerPk,
      },
      creationHeight: input.creationHeight,
    },
  ];

  // OUTPUTS(2..count+1): per-claim payouts
  for (let i = 0; i < claimCount; i++) {
    outputs.push({
      value: safeNanoErgNumber(plan.payoutAmounts[i], `payout[${i}]`),
      ergoTree: plan.recipientErgoTreeHexes[i],
      assets: [],
      additionalRegisters: {},
      creationHeight: input.creationHeight,
    });
  }

  // Optional change output
  if (unlockChangePlan.changeOutputValue > 0) {
    outputs.push({
      value: unlockChangePlan.changeOutputValue,
      ergoTree: deployed.mainChainAggregateUnlockBatch.ergoTreeHex,
      assets: [],
      additionalRegisters: {},
      creationHeight: input.creationHeight,
    });
  }

  // Miner fee
  outputs.push({
    value: unlockChangePlan.minerFeeValue,
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight: input.creationHeight,
  });

  return {
    inputs: [
      {
        boxId: input.trackerBox.boxId,
        extension: plan.trackerIngests[0]?.trackerExtension ?? {},
      },
      {
        boxId: input.aggregateDupBox.boxId,
        extension: plan.batchDupExtension,
      },
      {
        boxId: input.unlockBox.boxId,
        extension: plan.batchUnlockExtension,
      },
    ],
    dataInputs: [],
    outputs,
  };
}
