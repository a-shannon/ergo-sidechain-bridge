import { createHash } from 'node:crypto';

import { Interface, SigningKey, Wallet } from 'ethers';

import { assertNoDuplicateJsonKeys, canonicalJson } from '../ergo-settlement-core/strict-json.js';

export interface FrontierLabApplicationOwnerV1 {
  readonly ownerAddressHex: string;
  readonly signedLegacyOwnerMintTransactionHex: string;
}

interface OwnerMaterial {
  wallet: ReturnType<typeof Wallet.createRandom> | undefined;
  readonly bridgeAddressHex: string;
  requestSha256Hex: string | undefined;
  bindingAttempted: boolean;
  requestClaimed: boolean;
  tokenAddressHex: string | undefined;
  signingAttempted: boolean;
}

const OWNERS = new WeakMap<object, OwnerMaterial>();
// Pending requests own custody until the campaign claims it or the creator disposes it.
const REQUEST_OWNERS = new Map<string, Readonly<FrontierLabApplicationOwnerV1>>();
const mint = new Interface([
  'function mintSERG(address recipient,uint256 amount,bytes32 mintIdentity)',
  'function approve(address spender,uint256 amount)',
  'function pegOut(uint256 amount,bytes recipientPublicKey)',
]);

const CALL_ROLES = ['mint', 'approval', 'pegOut'] as const;
export type FrontierLabApplicationCallsV1 = Readonly<Record<typeof CALL_ROLES[number], Readonly<{
  type: 0; chainId: 42; nonce: number; gasPrice: '1000000000';
  gasLimit: '5000000'; value: '0'; to: string; data: string;
}>>>;

/** Synthetic LAB custody only. No key import, persistence, provider or transport. */
export async function createFrontierLabApplicationOwnerV1(
  bridgeAddressHex: string,
): Promise<Readonly<FrontierLabApplicationOwnerV1>> {
  if (typeof bridgeAddressHex !== 'string' || !/^0x[0-9a-f]{40}$/u.test(bridgeAddressHex)
    || /^0x0{40}$/u.test(bridgeAddressHex)) {
    throw new Error('LAB application bridge address must be canonical and nonzero');
  }
  let wallet: ReturnType<typeof Wallet.createRandom> | undefined = Wallet.createRandom();
  try {
    const ownerAddressHex = wallet.address.toLowerCase();
    const probeIdentity = `0x${createHash('sha256')
      .update('E2S_FRONTIER_LAB_UNRESERVED_OWNER_PROBE_V1\0', 'ascii')
      .update(ownerAddressHex, 'ascii').digest('hex')}`;
    const signedLegacyOwnerMintTransactionHex = await wallet.signTransaction({
      type: 0,
      chainId: 42,
      nonce: 0,
      gasPrice: 1_000_000_000n,
      gasLimit: 5_000_000n,
      value: 0n,
      to: bridgeAddressHex,
      data: mint.encodeFunctionData('mintSERG', [ownerAddressHex, 15_000_000n, probeIdentity]),
    });
    const owner = Object.freeze({ ownerAddressHex, signedLegacyOwnerMintTransactionHex });
    OWNERS.set(owner, {
      wallet, bridgeAddressHex, requestSha256Hex: undefined, bindingAttempted: false,
      requestClaimed: false,
      tokenAddressHex: undefined, signingAttempted: false,
    });
    return owner;
  } finally {
    // Dropping a JS reference does not promise memory erasure; process exit is the boundary.
    wallet = undefined;
  }
}

/** Called after canonical staging validation, before the request is published. */
export function bindFrontierLabApplicationOwnerRequestV1(
  owner: Readonly<FrontierLabApplicationOwnerV1>,
  canonicalRequestBytes: Uint8Array,
  expectedRequestSha256Hex: string,
): void {
  const material = requireLiveOwner(owner);
  if (material.bindingAttempted) throw new Error('LAB application owner request is already bound');
  material.bindingAttempted = true;
  try {
    if (!(canonicalRequestBytes instanceof Uint8Array)
      || canonicalRequestBytes.byteLength > 1024 * 1024
      || typeof expectedRequestSha256Hex !== 'string'
      || !/^[0-9a-f]{64}$/u.test(expectedRequestSha256Hex)) {
      throw new Error('LAB application request bytes or digest are invalid');
    }
    const bytes = Buffer.from(canonicalRequestBytes);
    if (createHash('sha256').update(bytes).digest('hex') !== expectedRequestSha256Hex) {
      throw new Error('LAB application request canonical bytes changed');
    }
    const canonicalRequest = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assertNoDuplicateJsonKeys(canonicalRequest);
    const request: unknown = JSON.parse(canonicalRequest);
    if (!bytes.equals(Buffer.from(`${canonicalJson(request)}\n`, 'utf8'))) {
      throw new Error('LAB application request canonical bytes changed');
    }
    const record = recordValue(request);
    const source = recordValue(record.sourceTarget);
    if (record.schema !== 'e2s.substrate-federated-isolated-devnet-bootstrap-command-request.v1'
      || record.version !== 1
      || source.expectedChainId !== '42'
      || source.bridgeAddress !== material.bridgeAddressHex
      || source.bridgeOwnerAddress !== owner.ownerAddressHex
      || source.signedLegacyOwnerMintTransactionHex !== owner.signedLegacyOwnerMintTransactionHex) {
      throw new Error('LAB application request differs from its retained owner and probe');
    }
    if (REQUEST_OWNERS.has(expectedRequestSha256Hex)) {
      throw new Error('LAB application request already has retained custody');
    }
    material.requestSha256Hex = expectedRequestSha256Hex;
    material.tokenAddressHex = typeof source.tokenAddress === 'string' ? source.tokenAddress : undefined;
    REQUEST_OWNERS.set(expectedRequestSha256Hex, owner);
  } catch (error) {
    material.wallet = undefined;
    throw error;
  }
}

export function assertFrontierLabApplicationOwnerRequestV1(
  owner: Readonly<FrontierLabApplicationOwnerV1>,
  expectedRequestSha256Hex: string,
): void {
  const material = requireLiveOwner(owner);
  if (typeof expectedRequestSha256Hex !== 'string' || !/^[0-9a-f]{64}$/u.test(expectedRequestSha256Hex)
    || material.requestSha256Hex !== expectedRequestSha256Hex) {
    throw new Error('LAB application owner is not bound to the exact request');
  }
}

export function disposeFrontierLabApplicationOwnerV1(
  owner: Readonly<FrontierLabApplicationOwnerV1>,
): void {
  const material = OWNERS.get(owner);
  if (material === undefined) throw new Error('LAB application owner lacks process custody');
  material.wallet = undefined;
  if (material.requestSha256Hex !== undefined
    && REQUEST_OWNERS.get(material.requestSha256Hex) === owner) {
    REQUEST_OWNERS.delete(material.requestSha256Hex);
  }
}

/** Claim existing process custody; a request digest cannot recreate a key. */
export function claimFrontierLabApplicationOwnerRequestV1(
  requestSha256Hex: string,
): Readonly<FrontierLabApplicationOwnerV1> {
  if (typeof requestSha256Hex !== 'string' || !/^[0-9a-f]{64}$/u.test(requestSha256Hex)) {
    throw new Error('LAB application owner request claim digest is invalid');
  }
  const owner = REQUEST_OWNERS.get(requestSha256Hex);
  if (owner === undefined) {
    throw new Error('LAB application request has no unclaimed live owner custody');
  }
  assertFrontierLabApplicationOwnerRequestV1(owner, requestSha256Hex);
  const material = requireLiveOwner(owner);
  if (material.requestClaimed) throw new Error('LAB application request owner is already claimed');
  material.requestClaimed = true;
  REQUEST_OWNERS.delete(requestSha256Hex);
  return owner;
}

export function assertFrontierLabApplicationOwnerClaimV1(
  owner: Readonly<FrontierLabApplicationOwnerV1>, requestSha256Hex: string,
): void {
  assertFrontierLabApplicationOwnerRequestV1(owner, requestSha256Hex);
  if (!requireLiveOwner(owner).requestClaimed) {
    throw new Error('LAB application request owner is not claimed by its campaign');
  }
}

/** The composition root decides proof eligibility; this adapter only signs the bounded LAB calls. */
export async function signFrontierLabApplicationCallsOnceV1(
  owner: Readonly<FrontierLabApplicationOwnerV1>,
  requestSha256Hex: string,
  calls: FrontierLabApplicationCallsV1,
): Promise<Readonly<Record<typeof CALL_ROLES[number], string>>> {
  const material = requireLiveOwner(owner);
  if (material.signingAttempted) throw new Error('LAB application signing is already consumed');
  material.signingAttempted = true;
  try {
    assertFrontierLabApplicationOwnerClaimV1(owner, requestSha256Hex);
    const token = material.tokenAddressHex;
    if (token === undefined || !/^0x[0-9a-f]{40}$/u.test(token)
      || /^0x0{40}$/u.test(token) || token === material.bridgeAddressHex || token === owner.ownerAddressHex) {
      throw new Error('LAB application token is not bound to the canonical request');
    }
    const snapshot = snapshotApplicationCalls(calls);
    for (const [nonce, role] of CALL_ROLES.entries()) {
      const call = snapshot[role];
      if (call.type !== 0 || call.chainId !== 42 || call.nonce !== nonce
        || call.gasPrice !== '1000000000' || call.gasLimit !== '5000000' || call.value !== '0'
        || call.to !== (role === 'approval' ? token : material.bridgeAddressHex)) {
        throw new Error('LAB application call policy changed');
      }
      const name = role === 'mint' ? 'mintSERG' : role === 'approval' ? 'approve' : 'pegOut';
      const args = mint.decodeFunctionData(name, call.data);
      if (mint.encodeFunctionData(name, args) !== call.data) throw new Error('LAB application calldata is not canonical');
      if (role === 'mint') {
        if (String(args[0]).toLowerCase() !== owner.ownerAddressHex || args[1] !== 15_000_000n
          || /^0x0{64}$/u.test(String(args[2]))) throw new Error('LAB application mint scope changed');
      } else if (role === 'approval') {
        if (String(args[0]).toLowerCase() !== material.bridgeAddressHex || args[1] !== 15_000_000n) {
          throw new Error('LAB application approval scope changed');
        }
      } else if (args[0] !== 15_000_000n || !/^0x(?:02|03)[0-9a-f]{64}$/u.test(String(args[1]))
        || SigningKey.computePublicKey(String(args[1]), true) !== args[1]) {
        throw new Error('LAB application peg-out scope changed');
      }
    }
    const result = {} as Record<typeof CALL_ROLES[number], string>;
    for (const role of CALL_ROLES) {
      assertFrontierLabApplicationOwnerClaimV1(owner, requestSha256Hex);
      result[role] = await requireLiveOwner(owner).wallet!.signTransaction(snapshot[role]);
    }
    assertFrontierLabApplicationOwnerClaimV1(owner, requestSha256Hex);
    return Object.freeze(result);
  } finally {
    disposeFrontierLabApplicationOwnerV1(owner);
  }
}

function snapshotApplicationCalls(calls: FrontierLabApplicationCallsV1): FrontierLabApplicationCallsV1 {
  const fields = ['type', 'chainId', 'nonce', 'gasPrice', 'gasLimit', 'value', 'to', 'data'];
  const exact = (value: unknown, names: readonly string[]) => {
    if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length || names.some(name => {
        const field = Object.getOwnPropertyDescriptor(value, name);
        return field === undefined || !field.enumerable || !('value' in field);
      })) throw new Error('LAB application calls require exact own data fields');
  };
  exact(calls, CALL_ROLES);
  const result = {} as Record<typeof CALL_ROLES[number], FrontierLabApplicationCallsV1['mint']>;
  for (const role of CALL_ROLES) {
    const call = calls[role];
    exact(call, fields);
    if (typeof call.data !== 'string' || !/^0x(?:[0-9a-f]{2})+$/u.test(call.data)
      || call.data.length > 1026) throw new Error('LAB application calldata must be bounded lowercase hex');
    result[role] = Object.freeze({ ...call });
  }
  return Object.freeze(result);
}

function requireLiveOwner(owner: Readonly<FrontierLabApplicationOwnerV1>): OwnerMaterial {
  const material = OWNERS.get(owner);
  if (material === undefined || material.wallet === undefined) {
    throw new Error('LAB application owner lacks live process custody');
  }
  return material;
}

function recordValue(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('LAB application request must contain its source record');
  }
  return value as Record<string, unknown>;
}
