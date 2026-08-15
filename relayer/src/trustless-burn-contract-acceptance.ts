import blakejs from 'blakejs';
import {
  encodeTrustlessBurnLeaf,
  type TrustlessBurnLeafInput,
  type TrustlessBurnMerkleProofStep,
} from './trustless-burn-proof.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
} from './profiles/substrate-grandpa-v1/asset-profile.js';

const SPV_DOMAIN = Buffer.from('E2S_SPV_V1', 'ascii');
const NODE_DOMAIN = Buffer.from('E2S_TRUSTLESS_BURN_NODE_V1', 'ascii');
const MAX_BURN_PROOF_NODES = 14;
const MIN_CONFIRMATIONS = 10;

export interface TrustlessBurnProofBundleInput {
  sidechainHeight: string | number | bigint;
  proof: TrustlessBurnMerkleProofStep[];
  dupLookupProofHex?: string;
  dupInsertProofHex?: string;
}

export interface TrustlessBurnContractAcceptanceInput {
  leaf: TrustlessBurnLeafInput;
  bridgeEventRootHex: string;
  proofBundleHex: string;
  trackerKeyHex: string;
  trackerValueHex: string;
  recipientErgoTreeHex: string;
  payoutValueNanoErg: string | number | bigint;
  currentErgoHeight: number;
  trackerNftPreserved?: boolean;
  dupNftPreserved?: boolean;
  dupKeyAlreadySpent?: boolean;
  dupInsertProofAccepted?: boolean;
}

export interface TrustlessBurnContractAcceptanceResult {
  accepted: boolean;
  errors: string[];
  checks: {
    trackerNftOk: boolean;
    dupNftOk: boolean;
    trackerValueDefined: boolean;
    finalityOk: boolean;
    leafFieldsOk: boolean;
    eventRootOk: boolean;
    notSpent: boolean;
    dupUpdated: boolean;
    payoutOk: boolean;
    shapeOk: boolean;
  };
  derived: {
    trackerKeyHex: string;
    merkleRootHex: string;
    burnProofNodeCount: number;
    dupLookupProofLength: number;
    ergoAnchorHeight: number;
  };
}

interface ParsedProofBundle {
  ok: boolean;
  errors: string[];
  sidechainHeightBytes: Buffer;
  burnProofBytes: Buffer;
  burnProofNodeCount: number;
  dupLookupProofLength: number;
}

export function buildTrustlessBurnProofBundle(input: TrustlessBurnProofBundleInput): string {
  if (!Number.isInteger(input.proof.length) || input.proof.length > MAX_BURN_PROOF_NODES) {
    throw new Error(`burn proof node count must be <= ${MAX_BURN_PROOF_NODES}`);
  }

  const burnProofNodes = input.proof.map(step => {
    const side = step.side === 'left' ? 0 : step.side === 'right' ? 1 : undefined;
    if (side === undefined) throw new Error('proof step side must be left or right');
    return Buffer.concat([Buffer.from([side]), normalizeHexBuffer(step.hashHex, 32, 'proof hash')]);
  });
  const dupLookupProof = normalizeVariableHexBuffer(input.dupLookupProofHex ?? '', 'DUP lookup proof');
  const dupInsertProof = normalizeVariableHexBuffer(input.dupInsertProofHex ?? '', 'DUP insert proof');

  return Buffer.concat([
    uint64Be(input.sidechainHeight, 'sidechainHeight'),
    uint64Be(input.proof.length, 'burn proof node count'),
    uint64Be(dupLookupProof.length, 'DUP lookup proof length'),
    ...burnProofNodes,
    dupLookupProof,
    dupInsertProof,
  ]).toString('hex');
}

export function deriveTrustlessSpvTrackerKeyHex(input: {
  sidechainIdHex: string;
  sidechainHeight: string | number | bigint;
  sidechainBlockHashHex: string;
}): string {
  return blake2b256(Buffer.concat([
    SPV_DOMAIN,
    normalizeHexBuffer(input.sidechainIdHex, 32, 'sidechainId'),
    uint64Be(input.sidechainHeight, 'sidechainHeight'),
    normalizeHexBuffer(input.sidechainBlockHashHex, 32, 'sidechainBlockHash'),
  ])).toString('hex');
}

export function buildTrustlessTrackerValueHex(input: {
  bridgeEventRootHex: string;
  ergoAnchorHeight: number;
}): string {
  return Buffer.concat([
    normalizeHexBuffer(input.bridgeEventRootHex, 32, 'bridgeEventRoot'),
    uint32Be(input.ergoAnchorHeight, 'ergoAnchorHeight'),
  ]).toString('hex');
}

export function evaluateTrustlessBurnContractAcceptance(
  input: TrustlessBurnContractAcceptanceInput,
): TrustlessBurnContractAcceptanceResult {
  const errors: string[] = [];
  const proofBundle = parseProofBundle(input.proofBundleHex);
  errors.push(...proofBundle.errors);

  let encodedLeafHex = '';
  let leafHashHex = '';
  let sidechainIdHex = '';
  let sidechainBlockHashHex = '';
  let burnIdHex = '';
  let recipientErgoTreeHashHex = '';
  let amountNanoErg = '';
  let assetIdHex = '';

  try {
    const leaf = encodeTrustlessBurnLeaf(input.leaf);
    encodedLeafHex = leaf.encodedLeafHex;
    leafHashHex = leaf.leafHashHex;
    sidechainIdHex = leaf.sidechainIdHex;
    sidechainBlockHashHex = leaf.sidechainBlockHashHex;
    burnIdHex = leaf.burnIdHex;
    recipientErgoTreeHashHex = leaf.recipientErgoTreeHashHex;
    amountNanoErg = leaf.amountNanoErg;
    assetIdHex = leaf.assetIdHex;
  } catch (err: any) {
    errors.push(err?.message ?? String(err));
  }

  const bridgeEventRootHex = safeNormalizeHex(input.bridgeEventRootHex, 32, 'bridgeEventRoot', errors);
  const trackerKeyHex = safeNormalizeHex(input.trackerKeyHex, 32, 'trackerKey', errors);
  const trackerValueHex = safeNormalizeHex(input.trackerValueHex, 36, 'trackerValue', errors);
  const recipientErgoTreeHex = safeNormalizeHex(input.recipientErgoTreeHex, 36, 'recipientErgoTree', errors);
  const payoutValueNanoErg = safeNormalizeUint64(input.payoutValueNanoErg, 'payoutValueNanoErg', errors);
  const currentErgoHeight = safeNormalizeHeight(input.currentErgoHeight, 'currentErgoHeight', errors);

  const eventRootHex = trackerValueHex.length === 72 ? trackerValueHex.slice(0, 64) : '';
  const ergoAnchorHeight = trackerValueHex.length === 72
    ? Number.parseInt(trackerValueHex.slice(64, 72), 16)
    : -1;
  const expectedTrackerKeyHex = sidechainIdHex && sidechainBlockHashHex && proofBundle.sidechainHeightBytes.length === 8
    ? blake2b256(Buffer.concat([
      SPV_DOMAIN,
      Buffer.from(sidechainIdHex, 'hex'),
      proofBundle.sidechainHeightBytes,
      Buffer.from(sidechainBlockHashHex, 'hex'),
    ])).toString('hex')
    : '';
  const merkleRootHex = proofBundle.ok && leafHashHex
    ? computeContractMerkleRootHex(Buffer.from(leafHashHex, 'hex'), proofBundle.burnProofBytes, proofBundle.burnProofNodeCount)
    : '';
  const recipientHashHex = recipientErgoTreeHex
    ? blake2b256(Buffer.from(recipientErgoTreeHex, 'hex')).toString('hex')
    : '';

  const trackerNftOk = input.trackerNftPreserved ?? true;
  const dupNftOk = input.dupNftPreserved ?? true;
  const trackerValueDefined = trackerValueHex.length === 72;
  const finalityOk = currentErgoHeight >= 0 && ergoAnchorHeight >= 0 && currentErgoHeight - ergoAnchorHeight >= MIN_CONFIRMATIONS;
  const leafFieldsOk =
    encodedLeafHex.length === 410 &&
    encodedLeafHex.startsWith('01') &&
    expectedTrackerKeyHex !== '' &&
    expectedTrackerKeyHex === trackerKeyHex &&
    recipientHashHex !== '' &&
    recipientHashHex === recipientErgoTreeHashHex &&
    assetIdHex === SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex;
  const eventRootOk = eventRootHex !== '' && merkleRootHex !== '' && eventRootHex === merkleRootHex && eventRootHex === bridgeEventRootHex;
  const notSpent = !(input.dupKeyAlreadySpent ?? false);
  const dupUpdated = input.dupInsertProofAccepted ?? true;
  const payoutOk = payoutValueNanoErg !== '' && payoutValueNanoErg === amountNanoErg;
  const shapeOk =
    trackerKeyHex.length === 64 &&
    proofBundle.sidechainHeightBytes.length === 8 &&
    burnIdHex.length === 64 &&
    recipientErgoTreeHex.length === 72 &&
    trackerValueHex.length === 72 &&
    proofBundle.ok;

  pushCheckError(errors, trackerNftOk, 'tracker NFT must be preserved');
  pushCheckError(errors, dupNftOk, 'DUP NFT must be preserved');
  pushCheckError(errors, trackerValueDefined, 'SPV tracker value must be present');
  pushCheckError(errors, finalityOk, 'Ergo anchor height must satisfy minimum confirmations');
  pushCheckError(errors, leafFieldsOk, 'leaf fields must bind tracker key, burn id, recipient hash, amount, and ERG asset lane');
  pushCheckError(errors, eventRootOk, 'burn inclusion proof must resolve to bridgeEventRoot');
  pushCheckError(errors, notSpent, 'DUP key must not already be spent');
  pushCheckError(errors, dupUpdated, 'DUP insert proof must update the successor digest');
  pushCheckError(errors, payoutOk, 'payout value must equal proved amountNanoErg');
  pushCheckError(errors, shapeOk, 'contract input shape must match trustless proof bundle constraints');

  const checks = {
    trackerNftOk,
    dupNftOk,
    trackerValueDefined,
    finalityOk,
    leafFieldsOk,
    eventRootOk,
    notSpent,
    dupUpdated,
    payoutOk,
    shapeOk,
  };

  return {
    accepted: errors.length === 0 && Object.values(checks).every(Boolean),
    errors: Array.from(new Set(errors)),
    checks,
    derived: {
      trackerKeyHex: expectedTrackerKeyHex,
      merkleRootHex,
      burnProofNodeCount: proofBundle.burnProofNodeCount,
      dupLookupProofLength: proofBundle.dupLookupProofLength,
      ergoAnchorHeight,
    },
  };
}

function parseProofBundle(proofBundleHex: string): ParsedProofBundle {
  const errors: string[] = [];
  const proofBundle = safeBuffer(proofBundleHex, 'proofBundle', errors);
  const zero8 = Buffer.alloc(8);
  if (proofBundle.length < 24) {
    errors.push('proof bundle must include sidechain height, burn proof count, and DUP lookup length headers');
    return {
      ok: false,
      errors,
      sidechainHeightBytes: zero8,
      burnProofBytes: Buffer.alloc(0),
      burnProofNodeCount: 0,
      dupLookupProofLength: 0,
    };
  }

  const sidechainHeightBytes = proofBundle.subarray(0, 8);
  const burnProofNodeCountBytes = proofBundle.subarray(8, 16);
  const dupLookupProofLenBytes = proofBundle.subarray(16, 24);
  const burnProofNodeCountSmall = burnProofNodeCountBytes.subarray(0, 7).equals(Buffer.alloc(7));
  const burnProofNodeCount = burnProofNodeCountSmall ? burnProofNodeCountBytes[7] : 0;
  const dupLookupProofLenFitsInt = dupLookupProofLenBytes.subarray(0, 4).equals(Buffer.alloc(4));
  const dupLookupProofLength = dupLookupProofLenFitsInt ? Number(dupLookupProofLenBytes.readUInt32BE(4)) : 0;
  const burnProofLength = burnProofNodeCount * 33;
  const dupLookupProofStart = 24 + burnProofLength;
  const dupInsertProofStart = dupLookupProofStart + dupLookupProofLength;

  if (!burnProofNodeCountSmall) errors.push('burn proof node count must fit the contract small-count encoding');
  if (burnProofNodeCount > MAX_BURN_PROOF_NODES) errors.push(`burn proof node count must be <= ${MAX_BURN_PROOF_NODES}`);
  if (!dupLookupProofLenFitsInt) errors.push('DUP lookup proof length must fit Int');
  if (dupInsertProofStart > proofBundle.length) errors.push('proof bundle length must cover burn proof nodes and DUP lookup proof');

  const burnProofBytes = dupLookupProofStart <= proofBundle.length
    ? proofBundle.subarray(24, dupLookupProofStart)
    : Buffer.alloc(0);
  for (let index = 0; index < burnProofNodeCount && index * 33 < burnProofBytes.length; index++) {
    const side = burnProofBytes[index * 33];
    if (side !== 0 && side !== 1) errors.push('burn proof side bytes must be 0 or 1');
  }

  return {
    ok: errors.length === 0,
    errors,
    sidechainHeightBytes,
    burnProofBytes,
    burnProofNodeCount,
    dupLookupProofLength,
  };
}

function computeContractMerkleRootHex(leafHash: Buffer, burnProofBytes: Buffer, nodeCount: number): string {
  let current = leafHash;
  for (let index = 0; index < nodeCount; index++) {
    const offset = index * 33;
    const side = burnProofBytes[offset];
    const siblingHash = burnProofBytes.subarray(offset + 1, offset + 33);
    current = side === 0
      ? blake2b256(Buffer.concat([NODE_DOMAIN, siblingHash, current]))
      : blake2b256(Buffer.concat([NODE_DOMAIN, current, siblingHash]));
  }
  return current.toString('hex');
}

function blake2b256(data: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(data, undefined, 32));
}

function uint64Be(value: string | number | bigint, field: string): Buffer {
  const normalized = normalizeUint64(value, field);
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(normalized);
  return out;
}

function uint32Be(value: number, field: string): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`${field} must fit uint32`);
  }
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
}

function normalizeUint64(value: string | number | bigint, field: string): bigint {
  const normalized = typeof value === 'bigint'
    ? value
    : typeof value === 'number'
      ? BigInt(value)
      : BigInt(value);
  if (normalized < 0n || normalized > 0xffffffffffffffffn) {
    throw new Error(`${field} must fit uint64`);
  }
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(`${field} must be a safe integer`);
  }
  return normalized;
}

function safeNormalizeUint64(value: string | number | bigint, field: string, errors: string[]): string {
  try {
    return normalizeUint64(value, field).toString();
  } catch (err: any) {
    errors.push(err?.message ?? String(err));
    return '';
  }
}

function safeNormalizeHeight(value: number, field: string, errors: string[]): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    errors.push(`${field} must be a non-negative uint32`);
    return -1;
  }
  return value;
}

function normalizeHexBuffer(value: string, bytes: number, field: string): Buffer {
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]*$/.test(normalized) || normalized.length !== bytes * 2) {
    throw new Error(`${field} must be ${bytes} bytes of hex`);
  }
  return Buffer.from(normalized, 'hex');
}

function normalizeVariableHexBuffer(value: string, field: string): Buffer {
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]*$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${field} must be hex`);
  }
  return Buffer.from(normalized, 'hex');
}

function safeNormalizeHex(value: string, bytes: number, field: string, errors: string[]): string {
  try {
    return normalizeHexBuffer(value, bytes, field).toString('hex');
  } catch (err: any) {
    errors.push(err?.message ?? String(err));
    return '';
  }
}

function safeBuffer(value: string, field: string, errors: string[]): Buffer {
  try {
    return normalizeVariableHexBuffer(value, field);
  } catch (err: any) {
    errors.push(err?.message ?? String(err));
    return Buffer.alloc(0);
  }
}

function pushCheckError(errors: string[], ok: boolean, message: string): void {
  if (!ok) errors.push(message);
}
