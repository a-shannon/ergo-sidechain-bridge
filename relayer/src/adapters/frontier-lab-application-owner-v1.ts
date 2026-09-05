import { createHash } from 'node:crypto';

import { Interface, Wallet } from 'ethers';

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
}

const OWNERS = new WeakMap<object, OwnerMaterial>();
const mint = new Interface([
  'function mintSERG(address recipient,uint256 amount,bytes32 mintIdentity)',
]);

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
    material.requestSha256Hex = expectedRequestSha256Hex;
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
