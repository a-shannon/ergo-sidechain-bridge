/**
 * Unsigned, offline assembly for ValiditySettlementV1.
 *
 * The builder intentionally has no signing, node check, submission, or
 * broadcast capability. The tracker is a data input, so every mutable box
 * identity required for payout is pinned explicitly here and again by the
 * future value-release contracts.
 */

import {
  decodeCanonicalLongRegister,
  decodeCollByteRegister,
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE,
  MINER_FEE_TREE,
} from './ergo-encoding.js';
import { decodePegInSourceIntentV2Hex, PEG_IN_SOURCE_INTENT_V2_BYTES } from './peg-in-causal-admission-v2.js';
import { encodeValiditySpvTrackerAvlRegister } from './spv-tracker-validity-v1.js';
import {
  VALIDITY_SETTLEMENT_V1_RECIPIENT_ERGOTREE_BYTES,
  VALIDITY_SETTLEMENT_V1_ZERO_SOURCE_ASSET_ID_HEX,
  type ValiditySettlementPlanV1,
} from './validity-settlement-v1.js';
import { deriveEip0045ContractIdHex } from './bridge-validity-finality-statement-v2.js';

export interface ValiditySettlementBoxV1 {
  readonly boxId: string;
  readonly value: number | string | bigint;
  readonly ergoTree: string;
  readonly assets?: readonly { readonly tokenId: string; readonly amount: number | string | bigint }[];
  readonly additionalRegisters?: Readonly<Record<string, string>>;
  readonly creationHeight: number;
}

export interface ValiditySettlementDeploymentV1 {
  readonly tracker: {
    readonly nftIdHex: string;
    readonly ergoTreeHex: string;
  };
  readonly duplicatePrevention: {
    readonly nftIdHex: string;
    readonly ergoTreeHex: string;
  };
  readonly causalVault: {
    readonly ergoTreeHex: string;
  };
}

export interface BuildValiditySettlementTxV1Input {
  readonly deployed: ValiditySettlementDeploymentV1;
  readonly plan: ValiditySettlementPlanV1;
  readonly trackerBox: ValiditySettlementBoxV1;
  readonly duplicatePreventionBox: ValiditySettlementBoxV1;
  readonly causalVaultBox: ValiditySettlementBoxV1;
  readonly feeFundingBox: ValiditySettlementBoxV1;
  readonly creationHeight: number;
  readonly minerFee?: number | string | bigint;
}

export interface ValiditySettlementUnsignedTxV1 {
  readonly inputs: readonly {
    readonly boxId: string;
    readonly extension: Readonly<Record<string, string>>;
  }[];
  readonly dataInputs: readonly { readonly boxId: string }[];
  readonly outputs: readonly {
    readonly value: string;
    readonly ergoTree: string;
    readonly assets: readonly { readonly tokenId: string; readonly amount: number }[];
    readonly additionalRegisters: Readonly<Record<string, string>>;
    readonly creationHeight: number;
  }[];
  readonly boundaries: {
    readonly unsignedOnly: true;
    readonly nodeCheckPerformed: false;
    readonly submitted: false;
    readonly broadcastAuthorized: false;
    readonly gate5Closed: false;
  };
}

const ERGO_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const MIN_BOX_VALUE = 1_000_000n;
const MAX_MINER_FEE = 2_100_000n;

export function buildValiditySettlementTxV1(
  input: BuildValiditySettlementTxV1Input,
): ValiditySettlementUnsignedTxV1 {
  const plan = input.plan;
  if (plan.contractCompatibility !== 'validity-settlement-v1') {
    throw new Error('validity settlement TX assembly requires a validity-settlement-v1 plan');
  }
  // The protected state successors also enforce this value against VM HEIGHT.
  const creationHeight = positiveInt(input.creationHeight, 'creationHeight');
  const deployed = normalizeDeployment(input.deployed);
  assertTrackerBox(input.trackerBox, deployed, plan);
  const dup = assertDuplicatePreventionBox(
    input.duplicatePreventionBox,
    deployed,
    plan,
  );
  const vaultRegisters = assertCausalVaultBox(
    input.causalVaultBox,
    deployed,
    plan,
  );
  const amount = positiveLong(plan.burnLeaf.amountNanoErg, 'validity settlement payout');
  const vaultValue = positiveLong(input.causalVaultBox.value, 'causal vault value');
  const requestedFee = positiveLong(input.minerFee ?? MINER_FEE, 'miner fee');
  if (requestedFee < MIN_BOX_VALUE || requestedFee > MAX_MINER_FEE) {
    throw new Error('validity settlement miner fee must be between 1000000 and 2100000 nanoERG');
  }
  if (vaultValue < amount) {
    throw new Error('causal validity vault does not cover payout');
  }
  const remainingVaultValue = vaultValue - amount;
  if (remainingVaultValue > 0n && remainingVaultValue < MIN_BOX_VALUE) {
    throw new Error('causal validity vault successor would be below minimum box value');
  }
  assertFeeFundingBox(input.feeFundingBox, requestedFee);
  const duplicatePreventionBoxId = fixedHex(
    input.duplicatePreventionBox.boxId,
    32,
    'validity DUP box ID',
  );
  const causalVaultBoxId = fixedHex(
    input.causalVaultBox.boxId,
    32,
    'causal validity vault box ID',
  );
  const feeFundingBoxId = fixedHex(
    input.feeFundingBox.boxId,
    32,
    'validity fee funding box ID',
  );
  if (
    new Set([
      duplicatePreventionBoxId,
      causalVaultBoxId,
      feeFundingBoxId,
    ]).size !== 3
  ) {
    throw new Error('validity settlement spending input box IDs must be distinct');
  }
  const dupValue = positiveLong(input.duplicatePreventionBox.value, 'validity DUP value');
  const outputs: ValiditySettlementUnsignedTxV1['outputs'][number][] = [
    {
      value: dupValue.toString(),
      ergoTree: deployed.duplicatePrevention.ergoTreeHex,
      assets: [{ tokenId: deployed.duplicatePrevention.nftIdHex, amount: 1 }],
      additionalRegisters: {
        R4: encodeLongRegister(dup.counter + 1n),
        R5: encodeAvlTreeRegister(
          Buffer.from(plan.dupOutputDigestHex, 'hex'),
          dup.flags,
          1,
        ),
        R6: encodeCollByteRegister(Buffer.from(plan.profileIdHex, 'hex')),
      },
      creationHeight,
    },
    {
      value: amount.toString(),
      ergoTree: plan.recipientErgoTreeHex,
      assets: [],
      additionalRegisters: {},
      creationHeight,
    },
  ];
  if (remainingVaultValue > 0n) {
    outputs.push({
      value: remainingVaultValue.toString(),
      ergoTree: deployed.causalVault.ergoTreeHex,
      assets: [],
      additionalRegisters: vaultRegisters,
      creationHeight,
    });
  }
  outputs.push({
    value: requestedFee.toString(),
    ergoTree: MINER_FEE_TREE,
    assets: [],
    additionalRegisters: {},
    creationHeight,
  });
  return Object.freeze({
    inputs: Object.freeze([
      Object.freeze({
        boxId: duplicatePreventionBoxId,
        extension: plan.dupExtension,
      }),
      Object.freeze({
        boxId: causalVaultBoxId,
        extension: plan.vaultExtension,
      }),
      Object.freeze({
        boxId: feeFundingBoxId,
        extension: Object.freeze({}),
      }),
    ]),
    dataInputs: Object.freeze([
      Object.freeze({
        boxId: fixedHex(input.trackerBox.boxId, 32, 'validity tracker box ID'),
      }),
    ]),
    outputs: Object.freeze(outputs),
    boundaries: Object.freeze({
      unsignedOnly: true as const,
      nodeCheckPerformed: false as const,
      submitted: false as const,
      broadcastAuthorized: false as const,
      gate5Closed: false as const,
    }),
  });
}

function assertFeeFundingBox(
  box: ValiditySettlementBoxV1,
  requestedFee: bigint,
): void {
  const value = positiveLong(box.value, 'validity fee funding box value');
  if (value !== requestedFee) {
    throw new Error('validity fee funding box must equal the exact miner fee');
  }
  if ((box.assets?.length ?? 0) !== 0) {
    throw new Error('validity fee funding box must contain only ERG');
  }
  fixedVariableHex(box.ergoTree, 'validity fee funding box ErgoTree');
}

function assertTrackerBox(
  box: ValiditySettlementBoxV1,
  deployed: Required<ValiditySettlementDeploymentV1>,
  plan: ValiditySettlementPlanV1,
): void {
  if (deployed.tracker.nftIdHex !== plan.profile.trackerNftIdHex) {
    throw new Error('validity tracker deployment NFT does not match settlement profile');
  }
  const ergoTree = fixedVariableHex(box.ergoTree, 'validity tracker ErgoTree');
  if (ergoTree !== deployed.tracker.ergoTreeHex) {
    throw new Error('validity tracker box ErgoTree does not match deployment');
  }
  if (deriveEip0045ContractIdHex(Buffer.from(ergoTree, 'hex')) !== plan.profile.trackerContractIdHex) {
    throw new Error('validity tracker proposition bytes do not match the profile contract ID');
  }
  assertSingletonToken(box, plan.profile.trackerNftIdHex, 'validity tracker box');
  const r5 = register(box, 'R5', 'validity tracker box');
  if (r5 !== encodeValiditySpvTrackerAvlRegister(plan.trackerInputDigestHex)) {
    throw new Error('validity tracker box R5 does not match the planned tracker digest');
  }
  assertCanonicalCollByte(
    register(box, 'R6', 'validity tracker box'),
    plan.profile.sidechainIdHex,
    'validity tracker box R6',
  );
  assertCanonicalCollByte(
    register(box, 'R9', 'validity tracker box'),
    plan.profile.approvedTrustRootDigestHex,
    'validity tracker box R9',
  );
  // R8 is deliberately not read: it is a mutable stamp, not a finality fact.
}

function assertDuplicatePreventionBox(
  box: ValiditySettlementBoxV1,
  deployed: Required<ValiditySettlementDeploymentV1>,
  plan: ValiditySettlementPlanV1,
): { readonly counter: bigint; readonly flags: number } {
  if (
    deployed.duplicatePrevention.nftIdHex
    !== plan.profile.duplicatePreventionNftIdHex
  ) {
    throw new Error('validity DUP deployment NFT does not match settlement profile');
  }
  if (fixedVariableHex(box.ergoTree, 'validity DUP ErgoTree') !== deployed.duplicatePrevention.ergoTreeHex) {
    throw new Error('validity DUP box ErgoTree does not match deployment');
  }
  assertSingletonToken(box, plan.profile.duplicatePreventionNftIdHex, 'validity DUP box');
  const avl = decodeCanonicalDupAvlRegister(register(box, 'R5', 'validity DUP box'));
  if (avl.digestHex !== plan.dupInputDigestHex) {
    throw new Error('validity DUP box R5 does not match the planned DUP digest');
  }
  assertCanonicalCollByte(
    register(box, 'R6', 'validity DUP box'),
    plan.profileIdHex,
    'validity DUP box R6',
  );
  const counter = decodeCanonicalLongRegister(
    register(box, 'R4', 'validity DUP box'),
    'validity DUP box R4',
  );
  if (counter < 0n || counter === ERGO_LONG_MAX) {
    throw new Error('validity DUP counter must be nonnegative and incrementable');
  }
  return { counter, flags: avl.flags };
}

function assertCausalVaultBox(
  box: ValiditySettlementBoxV1,
  deployed: Required<ValiditySettlementDeploymentV1>,
  plan: ValiditySettlementPlanV1,
): Readonly<Record<'R4' | 'R5', string>> {
  if (fixedVariableHex(box.ergoTree, 'causal validity vault ErgoTree') !== deployed.causalVault.ergoTreeHex) {
    throw new Error('causal validity vault ErgoTree does not match deployment');
  }
  if ((box.assets?.length ?? 0) !== 0) {
    throw new Error('causal validity vault must be a pure ERG box');
  }
  const r4 = register(box, 'R4', 'causal validity vault');
  const r5 = register(box, 'R5', 'causal validity vault');
  const intentHex = decodeCollByteRegister(r4, 'causal validity vault R4');
  if (Buffer.from(intentHex, 'hex').length !== PEG_IN_SOURCE_INTENT_V2_BYTES) {
    throw new Error('causal validity vault R4 must contain the exact 229-byte source intent');
  }
  if (encodeCollByteRegister(Buffer.from(intentHex, 'hex')) !== r4) {
    throw new Error('causal validity vault R4 must use canonical Coll[Byte] encoding');
  }
  const intent = decodePegInSourceIntentV2Hex(`0x${intentHex}`);
  if (strip0x(intent.sourceNetworkIdHex) !== plan.profile.sourceNetworkIdHex) {
    throw new Error('causal validity vault source network does not match settlement profile');
  }
  if (strip0x(intent.sidechainIdHex) !== plan.profile.sidechainIdHex) {
    throw new Error('causal validity vault sidechain does not match settlement profile');
  }
  if (strip0x(intent.settlementProfileIdHex) !== plan.profileIdHex) {
    throw new Error('causal validity vault settlement profile does not match plan');
  }
  if (strip0x(intent.admissionProfileIdHex) !== plan.profile.admissionProfileIdHex) {
    throw new Error('causal validity vault admission profile does not match settlement profile');
  }
  if (strip0x(intent.sourceAssetIdHex) !== VALIDITY_SETTLEMENT_V1_ZERO_SOURCE_ASSET_ID_HEX) {
    throw new Error('causal validity vault source asset must be the zero native ERG asset ID');
  }
  const sourceAmount = positiveLong(intent.amountNanoErg, 'causal validity source amount');
  const vaultValue = positiveLong(box.value, 'causal validity vault value');
  if (vaultValue > sourceAmount) {
    throw new Error('causal validity vault value cannot exceed its source intent amount');
  }
  const sourceBoxId = decodeCollByteRegister(r5, 'causal validity vault R5');
  if (sourceBoxId === '00'.repeat(32)) {
    throw new Error('causal validity vault consumed source box ID must be nonzero');
  }
  if (fixedHex(sourceBoxId, 32, 'causal validity vault consumed source box ID') !== sourceBoxId) {
    throw new Error('causal validity vault consumed source box ID is invalid');
  }
  if (encodeCollByteRegister(Buffer.from(sourceBoxId, 'hex')) !== r5) {
    throw new Error('causal validity vault R5 must use canonical Coll[Byte] encoding');
  }
  return Object.freeze({ R4: r4, R5: r5 });
}

function normalizeDeployment(
  deployment: ValiditySettlementDeploymentV1,
): Required<ValiditySettlementDeploymentV1> {
  return Object.freeze({
    tracker: Object.freeze({
      nftIdHex: fixedHex(deployment.tracker.nftIdHex, 32, 'validity tracker deployment NFT'),
      ergoTreeHex: fixedVariableHex(deployment.tracker.ergoTreeHex, 'validity tracker deployment ErgoTree'),
    }),
    duplicatePrevention: Object.freeze({
      nftIdHex: fixedHex(deployment.duplicatePrevention.nftIdHex, 32, 'validity DUP deployment NFT'),
      ergoTreeHex: fixedVariableHex(deployment.duplicatePrevention.ergoTreeHex, 'validity DUP deployment ErgoTree'),
    }),
    causalVault: Object.freeze({
      ergoTreeHex: fixedVariableHex(deployment.causalVault.ergoTreeHex, 'causal validity vault deployment ErgoTree'),
    }),
  });
}

function assertSingletonToken(
  box: ValiditySettlementBoxV1,
  expectedTokenIdHex: string,
  label: string,
): void {
  if ((box.assets?.length ?? 0) !== 1) {
    throw new Error(`${label} must contain exactly one singleton token`);
  }
  const token = box.assets![0];
  if (fixedHex(token.tokenId, 32, `${label} token ID`) !== expectedTokenIdHex) {
    throw new Error(`${label} singleton token ID does not match profile`);
  }
  if (BigInt(token.amount) !== 1n) {
    throw new Error(`${label} singleton token amount must equal one`);
  }
}

function assertCanonicalCollByte(
  registerHex: string,
  expectedPayloadHex: string,
  label: string,
): void {
  const decoded = decodeCollByteRegister(registerHex, label);
  if (decoded !== expectedPayloadHex) {
    throw new Error(`${label} does not match the active validity settlement profile`);
  }
  if (encodeCollByteRegister(Buffer.from(decoded, 'hex')) !== registerHex) {
    throw new Error(`${label} must use canonical Coll[Byte] encoding`);
  }
}

function decodeCanonicalDupAvlRegister(registerHex: string): {
  readonly digestHex: string;
  readonly flags: number;
} {
  if (
    !/^[0-9a-f]+$/.test(registerHex)
    || registerHex.length !== 76
    || !registerHex.startsWith('64')
    || registerHex.slice(70, 72) !== '20'
    || registerHex.slice(72) !== '0101'
  ) {
    throw new Error('validity DUP box R5 must be a canonical 32-byte-key, one-byte-value AVL register');
  }
  const flags = Number.parseInt(registerHex.slice(68, 70), 16);
  if ((flags & 0x01) === 0) {
    throw new Error('validity DUP box R5 must permit append-only inserts');
  }
  return Object.freeze({ digestHex: registerHex.slice(2, 68), flags });
}

function register(box: ValiditySettlementBoxV1, name: string, label: string): string {
  const value = box.additionalRegisters?.[name];
  if (!value) throw new Error(`${label} is missing ${name}`);
  if (!/^[0-9a-f]+$/.test(value)) throw new Error(`${label} ${name} must be lowercase canonical hex`);
  return value;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || value.length !== bytes * 2 || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be exactly ${bytes} lowercase hex bytes`);
  }
  return value;
}

function fixedVariableHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be non-empty lowercase hex`);
  }
  return value;
}

function positiveLong(value: string | number | bigint, label: string): bigint {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be an exact integer`);
  }
  if (typeof value === 'string' && !/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be an unsigned decimal integer`);
  }
  const normalized = BigInt(value);
  if (normalized <= 0n || normalized > ERGO_LONG_MAX) {
    throw new Error(`${label} must fit a positive signed Long`);
  }
  return normalized;
}

function positiveInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 0x7fff_ffff) {
    throw new Error(`${label} must fit a positive Int`);
  }
  return value;
}

function strip0x(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}
