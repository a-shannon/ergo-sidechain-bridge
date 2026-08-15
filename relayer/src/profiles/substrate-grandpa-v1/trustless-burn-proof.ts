import blakejs from 'blakejs';

import { deriveTrustlessBurnIdHex } from '../../ergo-settlement-core/trustless-burn-id.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
} from './asset-profile.js';

export { deriveTrustlessBurnIdHex };

export interface TrustlessBurnLeafInput {
  sidechainIdHex: string;
  sidechainBlockHashHex: string;
  burnIdHex: string;
  sidechainTxHashHex: string;
  eventIndex: string | number;
  recipientErgoTreeHashHex: string;
  amountNanoErg: string | number | bigint;
  assetIdHex?: string;
}

export interface TrustlessBurnLeaf {
  sidechainIdHex: string;
  sidechainBlockHashHex: string;
  burnIdHex: string;
  sidechainTxHashHex: string;
  eventIndex: number;
  recipientErgoTreeHashHex: string;
  amountNanoErg: string;
  assetIdHex: string;
  encodedLeafHex: string;
  leafHashHex: string;
}

export interface TrustlessBurnMerkleProofStep {
  side: 'left' | 'right';
  hashHex: string;
}

export interface TrustlessBurnCommitment {
  bridgeEventRootHex: string;
  leaves: TrustlessBurnLeaf[];
}

export interface TrustlessBurnInclusionProof {
  bridgeEventRootHex: string;
  leaf: TrustlessBurnLeaf;
  leafIndex: number;
  leafCount: number;
  proof: TrustlessBurnMerkleProofStep[];
}

export interface TrustlessBurnSettlementBindingInput {
  leaf: TrustlessBurnLeafInput;
  bridgeEventRootHex: string;
  proof: TrustlessBurnMerkleProofStep[];
  duplicatePreventionKeyHex: string;
  recipientErgoTreeHashHex: string;
  amountNanoErg: string | number | bigint;
  assetIdHex?: string;
}

export interface TrustlessBurnSettlementBindingResult {
  ok: boolean;
  errors: string[];
  burnIdHex: string;
  bridgeEventRootHex: string;
  leafHashHex: string;
}

export interface TrustlessBurnInclusionProofValidation {
  ok: boolean;
  errors: string[];
  bridgeEventRootHex: string;
  leafHashHex: string;
}

const LEAF_DOMAIN = Buffer.from(
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.burnLeafDomain,
  'ascii',
);
const NODE_DOMAIN = Buffer.from('E2S_TRUSTLESS_BURN_NODE_V1', 'ascii');

export function encodeTrustlessBurnLeaf(input: TrustlessBurnLeafInput): TrustlessBurnLeaf {
  const sidechainIdHex = normalizeHex(input.sidechainIdHex, 32, 'sidechainId');
  const sidechainBlockHashHex = normalizeHex(input.sidechainBlockHashHex, 32, 'sidechainBlockHash');
  const sidechainTxHashHex = normalizeHex(input.sidechainTxHashHex, 32, 'sidechainTxHash');
  const eventIndex = normalizeUint32(input.eventIndex, 'eventIndex');
  const burnIdHex = normalizeHex(input.burnIdHex, 32, 'burnId');
  const derivedBurnIdHex = deriveTrustlessBurnIdHex({ sidechainIdHex, sidechainTxHashHex, eventIndex });
  if (burnIdHex !== derivedBurnIdHex) {
    throw new Error('burnId must equal derived sidechain event identity');
  }
  const recipientErgoTreeHashHex = normalizeHex(input.recipientErgoTreeHashHex, 32, 'recipientErgoTreeHash');
  const amountNanoErg = normalizePositiveErgoLong(input.amountNanoErg, 'amountNanoErg');
  const assetIdHex = input.assetIdHex
    ? normalizeHex(input.assetIdHex, 32, 'assetId')
    : SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex;

  const encodedLeaf = Buffer.concat([
    Buffer.from([
      SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.burnLeafFormatVersion,
    ]),
    Buffer.from(sidechainIdHex, 'hex'),
    Buffer.from(sidechainBlockHashHex, 'hex'),
    Buffer.from(burnIdHex, 'hex'),
    Buffer.from(sidechainTxHashHex, 'hex'),
    uint32Be(eventIndex),
    Buffer.from(recipientErgoTreeHashHex, 'hex'),
    uint64Be(amountNanoErg),
    Buffer.from(assetIdHex, 'hex'),
  ]);
  const leafHashHex = blake2b256(Buffer.concat([LEAF_DOMAIN, encodedLeaf])).toString('hex');

  return {
    sidechainIdHex,
    sidechainBlockHashHex,
    burnIdHex,
    sidechainTxHashHex,
    eventIndex,
    recipientErgoTreeHashHex,
    amountNanoErg: amountNanoErg.toString(),
    assetIdHex,
    encodedLeafHex: encodedLeaf.toString('hex'),
    leafHashHex,
  };
}

export function buildTrustlessBurnCommitment(
  burnLeaves: TrustlessBurnLeafInput[],
): TrustlessBurnCommitment {
  if (burnLeaves.length === 0) {
    throw new Error('trustless burn commitment requires at least one burn leaf');
  }
  const leaves = burnLeaves.map(encodeTrustlessBurnLeaf);
  assertUniqueBurnIds(leaves);
  return {
    bridgeEventRootHex: merkleRoot(leaves.map(leaf => Buffer.from(leaf.leafHashHex, 'hex'))).toString('hex'),
    leaves,
  };
}

export function buildTrustlessBurnInclusionProof(
  burnLeaves: TrustlessBurnLeafInput[],
  burnIdHex: string,
): TrustlessBurnInclusionProof {
  const targetBurnIdHex = normalizeHex(burnIdHex, 32, 'burnId');
  const commitment = buildTrustlessBurnCommitment(burnLeaves);
  const leafIndex = commitment.leaves.findIndex(leaf => leaf.burnIdHex === targetBurnIdHex);
  if (leafIndex === -1) {
    throw new Error(`burnId ${targetBurnIdHex} is not present in the burn commitment`);
  }
  return {
    bridgeEventRootHex: commitment.bridgeEventRootHex,
    leaf: commitment.leaves[leafIndex],
    leafIndex,
    leafCount: commitment.leaves.length,
    proof: merkleProof(commitment.leaves.map(leaf => Buffer.from(leaf.leafHashHex, 'hex')), leafIndex),
  };
}

export function verifyTrustlessBurnInclusionProof(input: {
  leaf: TrustlessBurnLeafInput;
  bridgeEventRootHex: string;
  proof: TrustlessBurnMerkleProofStep[];
}): boolean {
  const leaf = encodeTrustlessBurnLeaf(input.leaf);
  const expectedRootHex = normalizeHex(input.bridgeEventRootHex, 32, 'bridgeEventRoot');
  let current: Buffer<ArrayBufferLike> = Buffer.from(leaf.leafHashHex, 'hex');
  for (const step of input.proof) {
    const sibling: Buffer<ArrayBufferLike> = Buffer.from(normalizeHex(step.hashHex, 32, 'proof hash'), 'hex');
    if (step.side === 'left') {
      current = hashParent(sibling, current);
    } else if (step.side === 'right') {
      current = hashParent(current, sibling);
    } else {
      throw new Error('proof step side must be left or right');
    }
  }
  return current.toString('hex') === expectedRootHex;
}

export function validateTrustlessBurnInclusionProofEnvelope(
  input: TrustlessBurnInclusionProof,
): TrustlessBurnInclusionProofValidation {
  const errors: string[] = [];
  let bridgeEventRootHex = '';
  let leafHashHex = '';
  let leaf: TrustlessBurnLeaf;

  try {
    bridgeEventRootHex = normalizeHex(input.bridgeEventRootHex, 32, 'bridgeEventRoot');
    leaf = encodeTrustlessBurnLeaf(input.leaf);
    leafHashHex = leaf.leafHashHex;
  } catch (err: any) {
    return proofValidationBlocked(errors.concat(err?.message ?? String(err)), bridgeEventRootHex, leafHashHex);
  }

  if (input.leaf.encodedLeafHex !== leaf.encodedLeafHex) {
    errors.push('proof leaf encodedLeafHex must match canonical leaf encoding');
  }
  if (input.leaf.leafHashHex !== leaf.leafHashHex) {
    errors.push('proof leaf leafHashHex must match canonical leaf hash');
  }

  const leafCount = parseProofIndex(input.leafCount, 'leafCount', errors);
  const leafIndex = parseProofIndex(input.leafIndex, 'leafIndex', errors);
  if (leafCount !== undefined && leafCount < 1) {
    errors.push('leafCount must be at least 1');
  }
  if (leafIndex !== undefined && leafCount !== undefined && leafIndex >= leafCount) {
    errors.push('leafIndex must be less than leafCount');
  }

  if (leafCount !== undefined) {
    const expectedDepth = expectedMerkleProofDepth(leafCount);
    if (input.proof.length !== expectedDepth) {
      errors.push(`proof length must match leafCount depth: expected ${expectedDepth}, got ${input.proof.length}`);
    }
  }
  if (leafIndex !== undefined && leafCount !== undefined) {
    validateProofDirections(
      errors,
      input.proof,
      leafIndex,
      leafCount,
      leaf.leafHashHex,
    );
  }

  try {
    if (!verifyTrustlessBurnInclusionProof({
      leaf,
      bridgeEventRootHex,
      proof: input.proof,
    })) {
      errors.push('burn inclusion proof must resolve to bridgeEventRoot');
    }
  } catch (err: any) {
    errors.push(err?.message ?? String(err));
  }

  return {
    ok: errors.length === 0,
    errors,
    bridgeEventRootHex,
    leafHashHex,
  };
}

export function verifyTrustlessBurnSettlementBinding(
  input: TrustlessBurnSettlementBindingInput,
): TrustlessBurnSettlementBindingResult {
  const errors: string[] = [];
  let leaf: TrustlessBurnLeaf;
  let bridgeEventRootHex = '';
  let duplicatePreventionKeyHex = '';
  let recipientErgoTreeHashHex = '';
  let amountNanoErg = '';
  let assetIdHex = '';

  try {
    leaf = encodeTrustlessBurnLeaf(input.leaf);
  } catch (err: any) {
    return blockedResult(errors.concat(err?.message ?? String(err)));
  }

  try {
    bridgeEventRootHex = normalizeHex(input.bridgeEventRootHex, 32, 'bridgeEventRoot');
    duplicatePreventionKeyHex = normalizeHex(input.duplicatePreventionKeyHex, 32, 'duplicatePreventionKey');
    recipientErgoTreeHashHex = normalizeHex(input.recipientErgoTreeHashHex, 32, 'recipientErgoTreeHash');
    amountNanoErg = normalizePositiveErgoLong(input.amountNanoErg, 'amountNanoErg').toString();
    assetIdHex = input.assetIdHex
      ? normalizeHex(input.assetIdHex, 32, 'assetId')
      : SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex;
  } catch (err: any) {
    errors.push(err?.message ?? String(err));
  }

  if (duplicatePreventionKeyHex && duplicatePreventionKeyHex !== leaf.burnIdHex) {
    errors.push('duplicatePreventionKey must equal burnId');
  }
  if (recipientErgoTreeHashHex && recipientErgoTreeHashHex !== leaf.recipientErgoTreeHashHex) {
    errors.push('settlement recipient must equal proved recipientErgoTreeHash');
  }
  if (amountNanoErg && amountNanoErg !== leaf.amountNanoErg) {
    errors.push('settlement amount must equal proved amountNanoErg');
  }
  if (assetIdHex && assetIdHex !== leaf.assetIdHex) {
    errors.push('settlement assetId must equal proved assetId');
  }
  try {
    if (bridgeEventRootHex && !verifyTrustlessBurnInclusionProof({
      leaf,
      bridgeEventRootHex,
      proof: input.proof,
    })) {
      errors.push('burn inclusion proof must resolve to bridgeEventRoot');
    }
  } catch (err: any) {
    errors.push(err?.message ?? String(err));
  }

  return {
    ok: errors.length === 0,
    errors,
    burnIdHex: leaf.burnIdHex,
    bridgeEventRootHex,
    leafHashHex: leaf.leafHashHex,
  };
}

function blockedResult(errors: string[]): TrustlessBurnSettlementBindingResult {
  return {
    ok: false,
    errors,
    burnIdHex: '',
    bridgeEventRootHex: '',
    leafHashHex: '',
  };
}

function proofValidationBlocked(
  errors: string[],
  bridgeEventRootHex: string,
  leafHashHex: string,
): TrustlessBurnInclusionProofValidation {
  return {
    ok: false,
    errors,
    bridgeEventRootHex,
    leafHashHex,
  };
}

function assertUniqueBurnIds(leaves: TrustlessBurnLeaf[]): void {
  const seen = new Set<string>();
  for (const leaf of leaves) {
    if (seen.has(leaf.burnIdHex)) {
      throw new Error(`duplicate burnId in trustless burn commitment: ${leaf.burnIdHex}`);
    }
    seen.add(leaf.burnIdHex);
  }
}

function merkleRoot(leaves: Buffer[]): Buffer {
  let level = leaves;
  while (level.length > 1) {
    level = nextMerkleLevel(level);
  }
  return level[0];
}

function merkleProof(leaves: Buffer[], targetIndex: number): TrustlessBurnMerkleProofStep[] {
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= leaves.length) {
    throw new Error(`targetIndex out of range: ${targetIndex}`);
  }
  const proof: TrustlessBurnMerkleProofStep[] = [];
  let index = targetIndex;
  let level = leaves;
  while (level.length > 1) {
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    const sibling = level[siblingIndex] ?? level[index];
    proof.push({
      side: isRight ? 'left' : 'right',
      hashHex: sibling.toString('hex'),
    });
    index = Math.floor(index / 2);
    level = nextMerkleLevel(level);
  }
  return proof;
}

function nextMerkleLevel(level: Buffer[]): Buffer[] {
  const next: Buffer[] = [];
  for (let index = 0; index < level.length; index += 2) {
    const left = level[index];
    const right = level[index + 1] ?? left;
    next.push(hashParent(left, right));
  }
  return next;
}

function expectedMerkleProofDepth(leafCount: number): number {
  let depth = 0;
  let levelWidth = leafCount;
  while (levelWidth > 1) {
    depth += 1;
    levelWidth = Math.ceil(levelWidth / 2);
  }
  return depth;
}

function validateProofDirections(
  errors: string[],
  proof: TrustlessBurnMerkleProofStep[],
  leafIndex: number,
  leafCount: number,
  leafHashHex: string,
): void {
  let index = leafIndex;
  let levelWidth = leafCount;
  let current: Buffer<ArrayBufferLike> = Buffer.from(leafHashHex, 'hex');
  for (let level = 0; level < proof.length && levelWidth > 1; level += 1) {
    const expectedSide = index % 2 === 1 ? 'left' : 'right';
    if (proof[level].side !== expectedSide) {
      errors.push(`proof step ${level} side must match leafIndex path`);
    }
    let sibling: Buffer;
    try {
      sibling = Buffer.from(
        normalizeHex(proof[level].hashHex, 32, `proof step ${level} hash`),
        'hex',
      );
    } catch {
      return;
    }
    if (
      expectedSide === 'right'
      && index + 1 >= levelWidth
      && !sibling.equals(current)
    ) {
      errors.push(
        `proof step ${level} unpaired right sibling must duplicate the current hash`,
      );
    }
    current = expectedSide === 'left'
      ? hashParent(sibling, current)
      : hashParent(current, sibling);
    index = Math.floor(index / 2);
    levelWidth = Math.ceil(levelWidth / 2);
  }
}

function hashParent(left: Buffer, right: Buffer): Buffer {
  return blake2b256(Buffer.concat([NODE_DOMAIN, left, right]));
}

function blake2b256(data: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(data, undefined, 32));
}

function normalizeHex(hex: string, expectedBytes: number, label: string): string {
  const clean = hex?.startsWith('0x') ? hex.slice(2) : hex;
  if (!clean || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be hex`);
  }
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${clean.length / 2}`);
  }
  return clean.toLowerCase();
}

function normalizeUint32(value: string | number, label: string): number {
  const raw = String(value);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed > 0xffff_ffff) {
    throw new Error(`${label} must fit in uint32`);
  }
  return parsed;
}

function normalizeUint64(value: string | number | bigint, label: string): bigint {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative integer`);
    }
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} number input must be a safe integer; use string or bigint for uint64 values above JavaScript safe integer range`);
    }
  }
  const raw = String(value);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  const parsed = BigInt(raw);
  if (parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit in uint64`);
  }
  return parsed;
}

function normalizePositiveErgoLong(value: string | number | bigint, label: string): bigint {
  const parsed = normalizeUint64(value, label);
  if (parsed === 0n || parsed > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit the positive Ergo Long range`);
  }
  return parsed;
}

function parseProofIndex(value: unknown, label: string, errors: string[]): number | undefined {
  if (!Number.isInteger(value) || !Number.isSafeInteger(value) || (value as number) < 0) {
    errors.push(`${label} must be a non-negative safe integer`);
    return undefined;
  }
  return value as number;
}

function uint32Be(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
}

function uint64Be(value: bigint): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(value);
  return out;
}
