import blakejs from 'blakejs';

import {
  PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
} from './peg-in-runtime-state.js';
import {
  SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
} from './peg-in-runtime-identity-v2.js';
import {
  SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
} from './peg-in-frontier-execution-identity-v1.js';
import {
  SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
  SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
} from './peg-in-frontier-event-v1.js';
import {
  derivePegInFrontierContractStateStorageKeysV1,
} from './peg-in-frontier-contract-state-v1.js';
import {
  derivePegInFrontierMintTransitionStatementV1,
} from './peg-in-frontier-mint-transition-v1.js';
import {
  MAX_PEG_IN_CAUSAL_PENDING_KEYS_SCALE_BYTES_V2,
  decodePegInCausalPendingRecordKeysScaleV2,
  derivePegInCausalPendingAdmissionStorageKeyV2,
  derivePegInCausalRuntimeStorageKeysV2,
  type PegInCausalRuntimeStorageKeysV2,
} from './peg-in-causal-runtime-state-v2.js';
import {
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES,
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODE_BYTES,
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES,
} from './native-finalized-peg-in-frontier-execution-identity-v1.js';
import {
  derivePooledReserveMintReservationRuntimeStorageKeysV4,
  type PooledReserveMintReservationRuntimeStorageKeysV4,
} from './pooled-reserve-mint-reservation-runtime-state-v4.js';

export const SUBSTRATE_FINALITY_READ_METHODS = Object.freeze([
  'chain_getFinalizedHead',
  'chain_getHeader',
  'chain_getBlockHash',
  'grandpa_proveFinality',
  'bridge_grandpaWarpProof',
  'state_getStorage',
  'state_getReadProof',
  'state_call',
] as const);

export interface SubstrateRpcTransport {
  readonly canonicalOrigin?: string;
  request<T = unknown>(method: string, params: readonly unknown[]): Promise<T>;
}

const allowedReadMethods = new Set<string>(SUBSTRATE_FINALITY_READ_METHODS);

export const MAX_GRANDPA_FINALITY_PROOF_BYTES = 4 * 1024 * 1024;
export const MAX_GRANDPA_AUTHORITY_TRANSITION_PROOF_BYTES = 8 * 1024 * 1024;
export const BRIDGE_COMMITMENT_STORAGE_KEY_HEX =
  'af86fef4216ac2bcd1c592b204011ad00d2d4fb825af1fcd4c2be9f955a780c5';
export const BRIDGE_EVENT_COMMITMENT_V1_SCALE_BYTES = 109;
export const MAX_BRIDGE_COMMITMENT_PROOF_NODES = 256;
export const MAX_BRIDGE_COMMITMENT_PROOF_BYTES = 256 * 1024;
export const MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES = 64 * 1024;
export const MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_NODES = 512;
export const MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_BYTES = 8 * 1024 * 1024;
export const MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_NODE_BYTES = 4 * 1024 * 1024;
export const MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODES =
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES;
export const MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODE_BYTES =
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODE_BYTES;
export const MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES =
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES;
export const PEG_IN_CAUSAL_ADMISSION_RECEIPT_MAP_PREFIX_V1_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad0c5d5743b9bfbc7f464d6e5b131fc9189';
export const PEG_IN_CAUSAL_INVALIDATION_TOMBSTONE_MAP_PREFIX_V1_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad088e09c10f6fc5df59926d19ca684fcb3';
export const MAX_SUBSTRATE_NATIVE_HEADER_BYTES = 64 * 1024;
export const MAX_SUBSTRATE_HEADER_DIGEST_LOGS = 256;
const MAX_GRANDPA_AUTHORITY_TRANSITION_PROOF_BASE64_CHARS =
  Math.ceil(MAX_GRANDPA_AUTHORITY_TRANSITION_PROOF_BYTES / 3) * 4;
const MAX_SUBSTRATE_READ_PROOF_JSON_OVERHEAD_BYTES = 64 * 1024;
export const MAX_SUBSTRATE_READ_PROOF_RPC_RESPONSE_BYTES =
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES * 2
  + MAX_SUBSTRATE_READ_PROOF_JSON_OVERHEAD_BYTES;
export const MAX_SUBSTRATE_RPC_RESPONSE_BYTES =
  Math.max(
    MAX_GRANDPA_AUTHORITY_TRANSITION_PROOF_BASE64_CHARS + 1024,
    MAX_SUBSTRATE_READ_PROOF_RPC_RESPONSE_BYTES,
  );

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface BoundedHttpSubstrateRpcTransportOptions {
  maxResponseBytes?: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export class BoundedHttpSubstrateRpcTransport implements SubstrateRpcTransport {
  readonly canonicalOrigin: string;
  private readonly endpoint: string;
  private readonly maxResponseBytes: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private nextRequestId = 1;

  constructor(endpoint: string, options: BoundedHttpSubstrateRpcTransportOptions = {}) {
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      throw new Error('Substrate RPC endpoint must be an absolute HTTP(S) URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('Substrate RPC endpoint must be an absolute HTTP(S) URL without credentials');
    }

    this.canonicalOrigin = canonicalSubstrateRpcOrigin(
      parsed.origin,
      'Substrate RPC endpoint origin',
    );
    this.endpoint = parsed.toString();
    this.maxResponseBytes = requirePositiveSafeInteger(
      options.maxResponseBytes ?? MAX_SUBSTRATE_RPC_RESPONSE_BYTES,
      'Substrate RPC response byte limit',
    );
    this.timeoutMs = requirePositiveSafeInteger(
      options.timeoutMs ?? 10_000,
      'Substrate RPC timeout',
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async request<T = unknown>(method: string, params: readonly unknown[]): Promise<T> {
    const requestId = this.nextRequestId;
    this.nextRequestId = requestId === Number.MAX_SAFE_INTEGER ? 1 : requestId + 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref();

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }),
        redirect: 'error',
        signal: controller.signal,
      });

      const declaredLength = response.headers.get('content-length');
      if (declaredLength !== null) {
        const parsedLength = Number(declaredLength);
        if (Number.isSafeInteger(parsedLength) && parsedLength > this.maxResponseBytes) {
          await response.body?.cancel().catch(() => undefined);
          controller.abort();
          throw new Error(`Substrate RPC response exceeds ${this.maxResponseBytes} bytes`);
        }
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        controller.abort();
        throw new Error(`Substrate RPC request failed with HTTP status ${response.status}`);
      }
      if (!response.body) {
        throw new Error('Substrate RPC response body is missing');
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > this.maxResponseBytes) {
          await reader.cancel().catch(() => undefined);
          controller.abort();
          throw new Error(`Substrate RPC response exceeds ${this.maxResponseBytes} bytes`);
        }
        chunks.push(value);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), totalBytes).toString('utf8'));
      } catch {
        throw new Error('Substrate RPC response is not valid JSON');
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Substrate RPC response must be a JSON-RPC object');
      }
      const record = payload as Record<string, unknown>;
      if (record.jsonrpc !== '2.0' || record.id !== requestId) {
        throw new Error('Substrate RPC response identity does not match the request');
      }
      if (record.error !== undefined) {
        const error = record.error;
        const code = error && typeof error === 'object' && !Array.isArray(error)
          ? (error as Record<string, unknown>).code
          : undefined;
        throw new Error(
          typeof code === 'number' && Number.isSafeInteger(code)
            ? `Substrate RPC returned error code ${String(code)}`
            : 'Substrate RPC returned an error',
        );
      }
      if (!Object.prototype.hasOwnProperty.call(record, 'result')) {
        throw new Error('Substrate RPC response is missing its result');
      }

      return record.result as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class ReadOnlySubstrateFinalityRpc {
  private readonly canonicalOrigin: string | null;

  constructor(private readonly transport: SubstrateRpcTransport) {
    this.canonicalOrigin = transport.canonicalOrigin === undefined
      ? null
      : canonicalSubstrateRpcOrigin(
        transport.canonicalOrigin,
        'Substrate RPC transport origin',
      );
  }

  getCanonicalOrigin(): string | null {
    return this.canonicalOrigin;
  }

  sharesTransportWith(other: ReadOnlySubstrateFinalityRpc): boolean {
    return this.transport === other.transport;
  }

  request<T = unknown>(method: string, params: readonly unknown[] = []): Promise<T> {
    if (!allowedReadMethods.has(method)) {
      return Promise.reject(new Error(`Substrate RPC method is not allowed: ${method}`));
    }

    return this.transport.request<T>(method, params);
  }
}

export interface SubstrateRpcHeaderObservation {
  parentHash: string;
  number: string;
  stateRoot: string;
  extrinsicsRoot: string;
  digest: {
    logs: string[];
  };
}

export async function requestSubstrateFinalizedHeadHash(
  rpc: ReadOnlySubstrateFinalityRpc,
): Promise<string> {
  const response = await rpc.request<unknown>('chain_getFinalizedHead', []);
  return `0x${normalizeBoundedRpcHex(response, 'finalized head hash', 32, 32)}`;
}

export async function requestSubstrateBlockHashAt(
  rpc: ReadOnlySubstrateFinalityRpc,
  blockNumber: number,
): Promise<string> {
  requireUint32(blockNumber, 'Substrate block-hash height');
  const response = await rpc.request<unknown>('chain_getBlockHash', [blockNumber]);
  if (response === null) {
    throw new Error('Substrate block hash is unavailable at the requested height');
  }
  return `0x${normalizeBoundedRpcHex(response, 'Substrate block hash', 32, 32)}`;
}

export async function requestSubstrateHeaderObservation(
  rpc: ReadOnlySubstrateFinalityRpc,
  nativeBlockHash: string,
): Promise<SubstrateRpcHeaderObservation> {
  const hash = `0x${normalizeBoundedRpcHex(nativeBlockHash, 'Substrate header hash', 32, 32)}`;
  const response = await rpc.request<unknown>('chain_getHeader', [hash]);
  if (response === null) {
    throw new Error('Substrate header is unavailable at the requested hash');
  }
  const record = exactRpcRecord(response, [
    'parentHash',
    'number',
    'stateRoot',
    'extrinsicsRoot',
    'digest',
  ], 'Substrate header');
  const digest = exactRpcRecord(record.digest, ['logs'], 'Substrate header digest');
  if (!Array.isArray(digest.logs)) {
    throw new Error('Substrate header digest logs must be an array');
  }
  if (digest.logs.length > MAX_SUBSTRATE_HEADER_DIGEST_LOGS) {
    throw new Error(
      `Substrate header digest exceeds ${MAX_SUBSTRATE_HEADER_DIGEST_LOGS} logs`,
    );
  }

  let digestBytes = 0;
  const logs = digest.logs.map((log, index) => {
    const normalized = normalizeBoundedRpcHex(
      log,
      `Substrate header digest log ${index}`,
      MAX_SUBSTRATE_NATIVE_HEADER_BYTES,
    );
    digestBytes += normalized.length / 2;
    if (digestBytes > MAX_SUBSTRATE_NATIVE_HEADER_BYTES) {
      throw new Error(
        `Substrate header digest exceeds ${MAX_SUBSTRATE_NATIVE_HEADER_BYTES} bytes`,
      );
    }
    return `0x${normalized}`;
  });

  return {
    parentHash: `0x${normalizeBoundedRpcHex(record.parentHash, 'Substrate header parent hash', 32, 32)}`,
    number: normalizeRpcUint32Hex(record.number, 'Substrate header number'),
    stateRoot: `0x${normalizeBoundedRpcHex(record.stateRoot, 'Substrate header state root', 32, 32)}`,
    extrinsicsRoot: `0x${normalizeBoundedRpcHex(
      record.extrinsicsRoot,
      'Substrate header extrinsics root',
      32,
      32,
    )}`,
    digest: { logs },
  };
}

export async function requestGrandpaFinalityProofScaleHex(
  rpc: ReadOnlySubstrateFinalityRpc,
  blockNumber: number,
): Promise<string> {
  requireUint32(blockNumber, 'GRANDPA finality proof block number');

  const response = await rpc.request<unknown>('grandpa_proveFinality', [blockNumber]);
  if (response === null) {
    throw new Error('GRANDPA finality proof is unavailable for the requested block');
  }
  if (typeof response !== 'string' || !/^0x[0-9a-fA-F]+$/.test(response)) {
    throw new Error('GRANDPA finality proof RPC response must be non-empty 0x-prefixed hex');
  }
  const proofHex = response.slice(2);
  if (proofHex.length % 2 !== 0) {
    throw new Error('GRANDPA finality proof RPC response must contain whole bytes');
  }
  if (proofHex.length / 2 > MAX_GRANDPA_FINALITY_PROOF_BYTES) {
    throw new Error(
      `GRANDPA finality proof exceeds ${MAX_GRANDPA_FINALITY_PROOF_BYTES} bytes`,
    );
  }

  return proofHex.toLowerCase();
}

export async function requestGrandpaAuthorityTransitionProofScaleHex(
  rpc: ReadOnlySubstrateFinalityRpc,
  startBlockHash: string,
): Promise<string> {
  if (!startBlockHash.startsWith('0x')) {
    throw new Error('GRANDPA transition start hash must be 0x-prefixed');
  }
  if (startBlockHash.length !== 66) {
    throw new Error('GRANDPA transition start hash must be a 32-byte value');
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(startBlockHash)) {
    throw new Error('GRANDPA transition start hash must contain hexadecimal bytes');
  }

  const response = await rpc.request<unknown>('bridge_grandpaWarpProof', [
    startBlockHash.toLowerCase(),
  ]);
  if (response === null) {
    throw new Error('GRANDPA authority-transition proof is unavailable for the requested start');
  }
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('GRANDPA authority-transition proof RPC response must be an object');
  }
  const record = response as Record<string, unknown>;
  requireExactRpcKeys(record, ['encoding', 'proof'], 'GRANDPA authority-transition proof');
  if (record.encoding !== 'base64' || typeof record.proof !== 'string') {
    throw new Error('GRANDPA authority-transition proof RPC response must use base64 encoding');
  }
  const proofBase64 = record.proof;
  if (proofBase64.length > MAX_GRANDPA_AUTHORITY_TRANSITION_PROOF_BASE64_CHARS) {
    throw new Error(
      `GRANDPA authority-transition proof exceeds ${MAX_GRANDPA_AUTHORITY_TRANSITION_PROOF_BYTES} bytes`,
    );
  }
  if (proofBase64.length === 0 || proofBase64.length % 4 !== 0) {
    throw new Error('GRANDPA authority-transition proof must be canonical base64');
  }
  const padding = proofBase64.endsWith('==') ? 2 : proofBase64.endsWith('=') ? 1 : 0;
  const contentLength = proofBase64.length - padding;
  const expectedRemainder = padding === 0 ? 0 : 4 - padding;
  if (contentLength % 4 !== expectedRemainder) {
    throw new Error('GRANDPA authority-transition proof must be canonical base64');
  }
  const decodedLength = (proofBase64.length / 4) * 3 - padding;
  if (decodedLength > MAX_GRANDPA_AUTHORITY_TRANSITION_PROOF_BYTES) {
    throw new Error(
      `GRANDPA authority-transition proof exceeds ${MAX_GRANDPA_AUTHORITY_TRANSITION_PROOF_BYTES} bytes`,
    );
  }
  for (let index = 0; index < contentLength; index += 1) {
    const code = proofBase64.charCodeAt(index);
    const valid =
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      (code >= 0x30 && code <= 0x39) ||
      code === 0x2b ||
      code === 0x2f;
    if (!valid) {
      throw new Error('GRANDPA authority-transition proof must be canonical base64');
    }
  }
  const proof = Buffer.from(proofBase64, 'base64');
  if (proof.toString('base64') !== proofBase64) {
    throw new Error('GRANDPA authority-transition proof must be canonical base64');
  }
  if (proof.length > MAX_GRANDPA_AUTHORITY_TRANSITION_PROOF_BYTES) {
    throw new Error(
      `GRANDPA authority-transition proof exceeds ${MAX_GRANDPA_AUTHORITY_TRANSITION_PROOF_BYTES} bytes`,
    );
  }

  return proof.toString('hex');
}

export interface BridgeCommitmentReadProofObservation {
  atNativeBlockHashHex: string;
  storageKeysHex: [string];
  storageValueScaleHex: string;
  proofNodesHex: string[];
}

export interface PegInRuntimeStateReadProofObservation {
  atNativeBlockHashHex: string;
  outcome: 'membership' | 'nonMembership';
  storageKeysHex: string[];
  proofNodesHex: string[];
}

export interface PegInRuntimeIdentityReadProofObservation {
  atNativeBlockHashHex: string;
  outcome: 'membership' | 'nonMembership';
  storageKeysHex: string[];
  proofNodesHex: string[];
  proofBytes: number;
}

export interface PegInFrontierExecutionIdentityReadProofObservation {
  readonly atNativeBlockHashHex: string;
  readonly storageKeysHex: readonly [string, string, string];
  readonly proofNodesHex: readonly string[];
  readonly proofBytes: number;
}

export interface PegInFrontierEventReadProofObservation {
  readonly atNativeBlockHashHex: string;
  readonly storageKeysHex: readonly [string, string, string, string, string];
  readonly proofNodesHex: readonly string[];
  readonly proofBytes: number;
}

export interface PegInFrontierContractStateReadProofObservation {
  readonly atNativeBlockHashHex: string;
  readonly storageKeysHex: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  readonly proofNodesHex: readonly string[];
  readonly proofBytes: number;
}

export interface PegInFrontierMintTransitionPostStateReadProofObservation {
  readonly atNativeBlockHashHex: string;
  readonly storageKeysHex: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  readonly proofNodesHex: readonly string[];
  readonly proofBytes: number;
}

export interface PegInFrontierMintTransitionParentStateReadProofObservation {
  readonly atNativeBlockHashHex: string;
  readonly storageKeysHex: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  readonly proofNodesHex: readonly string[];
  readonly proofBytes: number;
}

export interface PegInCausalMintTransitionPostStateReadProofObservation {
  readonly atNativeBlockHashHex: string;
  readonly pendingKeysScaleHex: string;
  readonly discoveredPendingRecordKeysHex: readonly string[];
  readonly storageKeysHex: readonly string[];
  readonly causalStorageKeys: PegInCausalRuntimeStorageKeysV2;
  readonly proofNodesHex: readonly string[];
  readonly proofBytes: number;
}

export interface PegInCausalMintTransitionParentStateReadProofObservation {
  readonly atNativeBlockHashHex: string;
  readonly pendingKeysScaleHex: string;
  readonly discoveredPendingRecordKeysHex: readonly string[];
  readonly storageKeysHex: readonly string[];
  readonly causalStorageKeys: PegInCausalRuntimeStorageKeysV2;
  readonly proofNodesHex: readonly string[];
  readonly proofBytes: number;
}

function canonicalSubstrateRpcOrigin(raw: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(
      `${label} must be a credential-free HTTP(S) origin`,
    );
  }
  const port = parsed.port || (parsed.protocol === 'http:' ? '80' : '443');
  return `${parsed.protocol}//${parsed.hostname.toLowerCase()}:${port}`;
}

export interface PegInCausalRuntimeStorageKeysV3
  extends PegInCausalRuntimeStorageKeysV2 {
  readonly admissionReceiptStorageKeyHex: string;
  readonly invalidationTombstoneStorageKeyHex: string;
}

export interface PegInCausalMintTransitionPostStateReadProofObservationV3 {
  readonly atNativeBlockHashHex: string;
  readonly pendingKeysScaleHex: string;
  readonly discoveredPendingRecordKeysHex: readonly string[];
  readonly storageKeysHex: readonly string[];
  readonly causalStorageKeys: PegInCausalRuntimeStorageKeysV3;
  readonly proofNodesHex: readonly string[];
  readonly proofBytes: number;
}

export interface PegInCausalMintTransitionParentStateReadProofObservationV3
  extends PegInCausalMintTransitionPostStateReadProofObservationV3 {}

export interface PooledReserveMintReservationStateReadProofObservationV4 {
  readonly atNativeBlockHashHex: string;
  readonly storageKeysHex: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  readonly reservationStorageKeys:
    Readonly<PooledReserveMintReservationRuntimeStorageKeysV4>;
  readonly proofNodesHex: readonly string[];
  readonly proofBytes: number;
}

export function derivePegInCausalAdmissionReceiptStorageKeyV1(
  recordKeyHex: string,
): string {
  const recordKey = Buffer.from(normalizeBoundedRpcHex(
    recordKeyHex,
    'causal peg-in receipt record key',
    32,
    32,
  ), 'hex');
  const prefix = Buffer.from(
    PEG_IN_CAUSAL_ADMISSION_RECEIPT_MAP_PREFIX_V1_HEX.slice(2),
    'hex',
  );
  return `0x${Buffer.concat([
    prefix,
    Buffer.from(blakejs.blake2b(recordKey, undefined, 16)),
    recordKey,
  ]).toString('hex')}`;
}

export function derivePegInCausalInvalidationTombstoneStorageKeyV1(
  recordKeyHex: string,
): string {
  const recordKey = Buffer.from(normalizeBoundedRpcHex(
    recordKeyHex,
    'causal peg-in invalidation tombstone record key',
    32,
    32,
  ), 'hex');
  const prefix = Buffer.from(
    PEG_IN_CAUSAL_INVALIDATION_TOMBSTONE_MAP_PREFIX_V1_HEX.slice(2),
    'hex',
  );
  return `0x${Buffer.concat([
    prefix,
    Buffer.from(blakejs.blake2b(recordKey, undefined, 16)),
    recordKey,
  ]).toString('hex')}`;
}

export async function requestPegInRuntimeStateReadProof(
  rpc: ReadOnlySubstrateFinalityRpc,
  input: {
    nativeBlockHashHex: string;
    sidechainIdHex: string;
    ergoBoxIdHex: string;
    outcome: 'membership' | 'nonMembership';
  },
): Promise<PegInRuntimeStateReadProofObservation> {
  const at = normalizeBoundedRpcHex(
    input?.nativeBlockHashHex,
    'peg-in runtime state block hash',
    32,
    32,
  );
  const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const outcome = input?.outcome;
  if (outcome !== 'membership' && outcome !== 'nonMembership') {
    throw new Error('peg-in runtime state proof outcome is unsupported');
  }
  const storageKeysHex = outcome === 'membership'
    ? [recordKey]
    : [PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX, recordKey];
  const response = await rpc.request<unknown>('state_getReadProof', [
    storageKeysHex,
    `0x${at}`,
  ]);
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('peg-in runtime state read-proof response must be an object');
  }
  const record = response as Record<string, unknown>;
  requireExactRpcKeys(record, ['at', 'proof'], 'peg-in runtime state read proof');
  const proofAt = normalizeBoundedRpcHex(
    record.at,
    'peg-in runtime state read-proof block hash',
    32,
    32,
  );
  if (proofAt !== at) {
    throw new Error('peg-in runtime state read proof is not bound to the requested native block');
  }
  if (!Array.isArray(record.proof) || record.proof.length === 0) {
    throw new Error('peg-in runtime state read proof must contain trie nodes');
  }
  if (record.proof.length > MAX_BRIDGE_COMMITMENT_PROOF_NODES) {
    throw new Error(
      `peg-in runtime state read proof exceeds ${MAX_BRIDGE_COMMITMENT_PROOF_NODES} nodes`,
    );
  }

  let proofBytes = 0;
  const proofNodesHex = record.proof.map((node, index) => {
    const normalized = normalizeBoundedRpcHex(
      node,
      `peg-in runtime state read-proof node ${index}`,
      MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES,
    );
    proofBytes += normalized.length / 2;
    if (proofBytes > MAX_BRIDGE_COMMITMENT_PROOF_BYTES) {
      throw new Error(
        `peg-in runtime state read proof exceeds ${MAX_BRIDGE_COMMITMENT_PROOF_BYTES} bytes`,
      );
    }
    return normalized;
  });
  if (new Set(proofNodesHex).size !== proofNodesHex.length) {
    throw new Error('peg-in runtime state read proof contains duplicate trie nodes');
  }

  return {
    atNativeBlockHashHex: at,
    outcome,
    storageKeysHex,
    proofNodesHex,
  };
}

/**
 * Request one exact proof for raw `:code` plus the branch-specific V1 peg-in state.
 *
 * The returned proof is candidate material only. This function does not execute the native
 * verifier, authenticate a build attestation, or authorize mint selection.
 */
export async function requestPegInRuntimeIdentityReadProofV2(
  rpc: ReadOnlySubstrateFinalityRpc,
  input: {
    nativeBlockHashHex: string;
    sidechainIdHex: string;
    ergoBoxIdHex: string;
    outcome: 'membership' | 'nonMembership';
  },
): Promise<PegInRuntimeIdentityReadProofObservation> {
  const at = normalizeBoundedRpcHex(
    input?.nativeBlockHashHex,
    'peg-in runtime identity block hash',
    32,
    32,
  );
  const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const outcome = input?.outcome;
  if (outcome !== 'membership' && outcome !== 'nonMembership') {
    throw new Error('peg-in runtime identity proof outcome is unsupported');
  }
  const storageKeysHex = outcome === 'membership'
    ? [SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX, recordKey]
    : [
      SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
      PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
      recordKey,
    ];
  const response = await rpc.request<unknown>('state_getReadProof', [
    storageKeysHex,
    `0x${at}`,
  ]);
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('peg-in runtime identity read-proof response must be an object');
  }
  const record = response as Record<string, unknown>;
  requireExactRpcKeys(record, ['at', 'proof'], 'peg-in runtime identity read proof');
  const proofAt = normalizeBoundedRpcHex(
    record.at,
    'peg-in runtime identity read-proof block hash',
    32,
    32,
  );
  if (proofAt !== at) {
    throw new Error(
      'peg-in runtime identity read proof is not bound to the requested native block',
    );
  }
  if (!Array.isArray(record.proof) || record.proof.length === 0) {
    throw new Error('peg-in runtime identity read proof must contain trie nodes');
  }
  if (record.proof.length > MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_NODES) {
    throw new Error(
      `peg-in runtime identity read proof exceeds ${MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_NODES} nodes`,
    );
  }

  let proofBytes = 0;
  const proofNodesHex = record.proof.map((node, index) => {
    const normalized = normalizeBoundedRpcHex(
      node,
      `peg-in runtime identity read-proof node ${index}`,
      MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_NODE_BYTES,
    );
    proofBytes += normalized.length / 2;
    if (proofBytes > MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_BYTES) {
      throw new Error(
        `peg-in runtime identity read proof exceeds ${MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_BYTES} bytes`,
      );
    }
    return normalized;
  });
  if (new Set(proofNodesHex).size !== proofNodesHex.length) {
    throw new Error('peg-in runtime identity read proof contains duplicate trie nodes');
  }

  return {
    atNativeBlockHashHex: at,
    outcome,
    storageKeysHex,
    proofNodesHex,
    proofBytes,
  };
}

/**
 * Request one exact proof for raw `:code`, `Ethereum::CurrentBlock`, and one processed peg-in.
 *
 * The returned proof is immutable candidate material only. This function performs no storage
 * reads, verifier execution, lifecycle mutation, mint selection, signing, submission, or broadcast.
 */
export async function requestPegInFrontierExecutionIdentityReadProofV1(
  rpc: ReadOnlySubstrateFinalityRpc,
  input: {
    nativeBlockHashHex: string;
    sidechainIdHex: string;
    ergoBoxIdHex: string;
  },
): Promise<PegInFrontierExecutionIdentityReadProofObservation> {
  const at = normalizeBoundedRpcHex(
    input?.nativeBlockHashHex,
    'peg-in Frontier execution identity block hash',
    32,
    32,
  );
  const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const storageKeysHex = Object.freeze([
    SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
    recordKey,
  ]) as readonly [string, string, string];
  const response = await rpc.request<unknown>('state_getReadProof', [
    storageKeysHex,
    `0x${at}`,
  ]);
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('peg-in Frontier execution identity read-proof response must be an object');
  }
  const record = response as Record<string, unknown>;
  requireExactRpcKeys(
    record,
    ['at', 'proof'],
    'peg-in Frontier execution identity read proof',
  );
  const proofAt = normalizeBoundedRpcHex(
    record.at,
    'peg-in Frontier execution identity read-proof block hash',
    32,
    32,
  );
  if (proofAt !== at) {
    throw new Error(
      'peg-in Frontier execution identity read proof is not bound to the requested native block',
    );
  }
  if (!Array.isArray(record.proof) || record.proof.length === 0) {
    throw new Error('peg-in Frontier execution identity read proof must contain trie nodes');
  }
  if (record.proof.length > MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODES) {
    throw new Error(
      `peg-in Frontier execution identity read proof exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODES} nodes`,
    );
  }

  let proofBytes = 0;
  const proofNodesHex = record.proof.map((node, index) => {
    const normalized = normalizeBoundedRpcHex(
      node,
      `peg-in Frontier execution identity read-proof node ${index}`,
      MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODE_BYTES,
    );
    proofBytes += normalized.length / 2;
    if (proofBytes > MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES) {
      throw new Error(
        `peg-in Frontier execution identity read proof exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES} bytes`,
      );
    }
    return normalized;
  });
  if (new Set(proofNodesHex).size !== proofNodesHex.length) {
    throw new Error('peg-in Frontier execution identity read proof contains duplicate trie nodes');
  }

  return Object.freeze({
    atNativeBlockHashHex: at,
    storageKeysHex,
    proofNodesHex: Object.freeze(proofNodesHex),
    proofBytes,
  });
}

/**
 * Request one exact shared proof for runtime, block, receipts, statuses, and processed peg-in.
 *
 * The returned immutable material is candidate-only. This function performs no storage reads,
 * verifier execution, lifecycle mutation, mint selection, signing, submission, or broadcast.
 */
export async function requestPegInFrontierEventReadProofV1(
  rpc: ReadOnlySubstrateFinalityRpc,
  input: {
    nativeBlockHashHex: string;
    sidechainIdHex: string;
    ergoBoxIdHex: string;
  },
): Promise<PegInFrontierEventReadProofObservation> {
  const at = normalizeBoundedRpcHex(
    input?.nativeBlockHashHex,
    'peg-in Frontier event block hash',
    32,
    32,
  );
  const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const storageKeysHex = Object.freeze([
    SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
    recordKey,
  ]) as readonly [string, string, string, string, string];
  const response = await rpc.request<unknown>('state_getReadProof', [
    storageKeysHex,
    `0x${at}`,
  ]);
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('peg-in Frontier event read-proof response must be an object');
  }
  const record = response as Record<string, unknown>;
  requireExactRpcKeys(record, ['at', 'proof'], 'peg-in Frontier event read proof');
  const proofAt = normalizeBoundedRpcHex(
    record.at,
    'peg-in Frontier event read-proof block hash',
    32,
    32,
  );
  if (proofAt !== at) {
    throw new Error('peg-in Frontier event read proof is not bound to the requested native block');
  }
  if (!Array.isArray(record.proof) || record.proof.length === 0) {
    throw new Error('peg-in Frontier event read proof must contain trie nodes');
  }
  if (record.proof.length > MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODES) {
    throw new Error(
      `peg-in Frontier event read proof exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODES} nodes`,
    );
  }

  let proofBytes = 0;
  const proofNodesHex = record.proof.map((node, index) => {
    const normalized = normalizeBoundedRpcHex(
      node,
      `peg-in Frontier event read-proof node ${index}`,
      MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODE_BYTES,
    );
    proofBytes += normalized.length / 2;
    if (proofBytes > MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES) {
      throw new Error(
        `peg-in Frontier event read proof exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES} bytes`,
      );
    }
    return normalized;
  });
  if (new Set(proofNodesHex).size !== proofNodesHex.length) {
    throw new Error('peg-in Frontier event read proof contains duplicate trie nodes');
  }

  return Object.freeze({
    atNativeBlockHashHex: at,
    storageKeysHex,
    proofNodesHex: Object.freeze(proofNodesHex),
    proofBytes,
  });
}

/**
 * Request the exact shared twelve-key proof for one Frontier peg-in and its EVM post-state.
 *
 * This is read-only proof collection. The returned material does not execute a verifier,
 * authenticate the supplied trust root, authorize mint, mutate lifecycle state, sign, submit, or
 * broadcast.
 */
export async function requestPegInFrontierContractStateReadProofV1(
  rpc: ReadOnlySubstrateFinalityRpc,
  input: {
    nativeBlockHashHex: string;
    sidechainIdHex: string;
    ergoBoxIdHex: string;
    bridgeAddressHex: string;
    tokenAddressHex: string;
  },
): Promise<PegInFrontierContractStateReadProofObservation> {
  const at = normalizeBoundedRpcHex(
    input?.nativeBlockHashHex,
    'peg-in Frontier contract-state block hash',
    32,
    32,
  );
  const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const contractKeys = derivePegInFrontierContractStateStorageKeysV1({
    bridgeAddressHex: input?.bridgeAddressHex,
    tokenAddressHex: input?.tokenAddressHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const storageKeysHex = Object.freeze([
    SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
    recordKey,
    contractKeys.bridgeAccountCodeStorageKeyHex,
    contractKeys.tokenAccountCodeStorageKeyHex,
    contractKeys.bridgeOwnerStorageKeyHex,
    contractKeys.bridgeConfigurationStorageKeyHex,
    contractKeys.processedPegInStorageKeyHex,
    contractKeys.tokenTotalSupplyStorageKeyHex,
    contractKeys.tokenOwnerStorageKeyHex,
  ]) as PegInFrontierContractStateReadProofObservation['storageKeysHex'];
  const response = await rpc.request<unknown>('state_getReadProof', [
    storageKeysHex,
    `0x${at}`,
  ]);
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('peg-in Frontier contract-state read-proof response must be an object');
  }
  const record = response as Record<string, unknown>;
  requireExactRpcKeys(record, ['at', 'proof'], 'peg-in Frontier contract-state read proof');
  const proofAt = normalizeBoundedRpcHex(
    record.at,
    'peg-in Frontier contract-state read-proof block hash',
    32,
    32,
  );
  if (proofAt !== at) {
    throw new Error(
      'peg-in Frontier contract-state read proof is not bound to the requested native block',
    );
  }
  if (!Array.isArray(record.proof) || record.proof.length === 0) {
    throw new Error('peg-in Frontier contract-state read proof must contain trie nodes');
  }
  if (record.proof.length > MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODES) {
    throw new Error(
      `peg-in Frontier contract-state read proof exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODES} nodes`,
    );
  }

  let proofBytes = 0;
  const proofNodesHex = record.proof.map((node, index) => {
    const normalized = normalizeBoundedRpcHex(
      node,
      `peg-in Frontier contract-state read-proof node ${index}`,
      MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODE_BYTES,
    );
    proofBytes += normalized.length / 2;
    if (proofBytes > MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES) {
      throw new Error(
        `peg-in Frontier contract-state read proof exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES} bytes`,
      );
    }
    return normalized;
  });
  if (new Set(proofNodesHex).size !== proofNodesHex.length) {
    throw new Error('peg-in Frontier contract-state read proof contains duplicate trie nodes');
  }

  return Object.freeze({
    atNativeBlockHashHex: at,
    storageKeysHex,
    proofNodesHex: Object.freeze(proofNodesHex),
    proofBytes,
  });
}

/** Request the exact thirteen-key event-block proof used by the T20C transition profile. */
export async function requestPegInFrontierMintTransitionPostStateReadProofV1(
  rpc: ReadOnlySubstrateFinalityRpc,
  input: {
    nativeBlockHashHex: string;
    sidechainIdHex: string;
    ergoBoxIdHex: string;
    bridgeAddressHex: string;
    tokenAddressHex: string;
    recipientHex: string;
  },
): Promise<PegInFrontierMintTransitionPostStateReadProofObservation> {
  const at = normalizeBoundedRpcHex(
    input?.nativeBlockHashHex,
    'peg-in Frontier mint-transition post-state block hash',
    32,
    32,
  );
  const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const contractKeys = derivePegInFrontierContractStateStorageKeysV1({
    bridgeAddressHex: input?.bridgeAddressHex,
    tokenAddressHex: input?.tokenAddressHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const transitionKeys = derivePegInFrontierMintTransitionStatementV1({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
    tokenAddressHex: input?.tokenAddressHex,
    recipientHex: input?.recipientHex,
  });
  const storageKeysHex = Object.freeze([
    SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
    recordKey,
    contractKeys.bridgeAccountCodeStorageKeyHex,
    contractKeys.tokenAccountCodeStorageKeyHex,
    contractKeys.bridgeOwnerStorageKeyHex,
    contractKeys.bridgeConfigurationStorageKeyHex,
    contractKeys.processedPegInStorageKeyHex,
    contractKeys.tokenTotalSupplyStorageKeyHex,
    contractKeys.tokenOwnerStorageKeyHex,
    transitionKeys.recipientBalanceStorageKeyHex,
  ]) as PegInFrontierMintTransitionPostStateReadProofObservation['storageKeysHex'];
  const proof = await requestBoundedPegInFrontierReadProofV1(
    rpc,
    at,
    storageKeysHex,
    'peg-in Frontier mint-transition post-state',
  );
  return Object.freeze({
    atNativeBlockHashHex: at,
    storageKeysHex,
    ...proof,
  });
}

/** Request the exact ten-key direct-parent proof used by the T20C transition profile. */
export async function requestPegInFrontierMintTransitionParentStateReadProofV1(
  rpc: ReadOnlySubstrateFinalityRpc,
  input: {
    nativeBlockHashHex: string;
    sidechainIdHex: string;
    ergoBoxIdHex: string;
    bridgeAddressHex: string;
    tokenAddressHex: string;
    recipientHex: string;
  },
): Promise<PegInFrontierMintTransitionParentStateReadProofObservation> {
  const at = normalizeBoundedRpcHex(
    input?.nativeBlockHashHex,
    'peg-in Frontier mint-transition parent-state block hash',
    32,
    32,
  );
  const contractKeys = derivePegInFrontierContractStateStorageKeysV1({
    bridgeAddressHex: input?.bridgeAddressHex,
    tokenAddressHex: input?.tokenAddressHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const transitionKeys = derivePegInFrontierMintTransitionStatementV1({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
    tokenAddressHex: input?.tokenAddressHex,
    recipientHex: input?.recipientHex,
  });
  const storageKeysHex = Object.freeze([
    SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    transitionKeys.parentNativeProcessedRecordStorageKeyHex,
    contractKeys.bridgeAccountCodeStorageKeyHex,
    contractKeys.tokenAccountCodeStorageKeyHex,
    contractKeys.bridgeOwnerStorageKeyHex,
    contractKeys.bridgeConfigurationStorageKeyHex,
    contractKeys.processedPegInStorageKeyHex,
    contractKeys.tokenTotalSupplyStorageKeyHex,
    contractKeys.tokenOwnerStorageKeyHex,
    transitionKeys.recipientBalanceStorageKeyHex,
  ]) as PegInFrontierMintTransitionParentStateReadProofObservation['storageKeysHex'];
  const proof = await requestBoundedPegInFrontierReadProofV1(
    rpc,
    at,
    storageKeysHex,
    'peg-in Frontier mint-transition parent-state',
  );
  return Object.freeze({
    atNativeBlockHashHex: at,
    storageKeysHex,
    ...proof,
  });
}

/** Request the exact T20C child proof plus the causal V2 state transition keys. */
export async function requestPegInCausalMintTransitionPostStateReadProofV2(
  rpc: ReadOnlySubstrateFinalityRpc,
  input: {
    nativeBlockHashHex: string;
    sidechainIdHex: string;
    ergoBoxIdHex: string;
    bridgeAddressHex: string;
    tokenAddressHex: string;
    recipientHex: string;
  },
): Promise<PegInCausalMintTransitionPostStateReadProofObservation> {
  const at = normalizeBoundedRpcHex(
    input?.nativeBlockHashHex,
    'peg-in causal mint-transition child-state block hash',
    32,
    32,
  );
  const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const contractKeys = derivePegInFrontierContractStateStorageKeysV1({
    bridgeAddressHex: input?.bridgeAddressHex,
    tokenAddressHex: input?.tokenAddressHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const transitionKeys = derivePegInFrontierMintTransitionStatementV1({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
    tokenAddressHex: input?.tokenAddressHex,
    recipientHex: input?.recipientHex,
  });
  const causalStorageKeys = derivePegInCausalRuntimeStorageKeysV2({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  if (causalStorageKeys.processedRecordStorageKeyHex !== recordKey) {
    throw new Error('causal child proof record key differs from the T20C replay key');
  }
  const pendingKeys = await requestPegInCausalPendingKeysV2(
    rpc,
    at,
    causalStorageKeys.pendingKeysStorageKeyHex,
    'peg-in causal mint-transition child-state',
  );
  const storageKeysHex = freezeUniqueStorageKeys([
    SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
    recordKey,
    contractKeys.bridgeAccountCodeStorageKeyHex,
    contractKeys.tokenAccountCodeStorageKeyHex,
    contractKeys.bridgeOwnerStorageKeyHex,
    contractKeys.bridgeConfigurationStorageKeyHex,
    contractKeys.processedPegInStorageKeyHex,
    contractKeys.tokenTotalSupplyStorageKeyHex,
    contractKeys.tokenOwnerStorageKeyHex,
    transitionKeys.recipientBalanceStorageKeyHex,
    causalStorageKeys.currentPegInProfileStorageKeyHex,
    causalStorageKeys.currentCausalProfileStorageKeyHex,
    causalStorageKeys.causalEnforcementStorageKeyHex,
    causalStorageKeys.pendingKeysStorageKeyHex,
    causalStorageKeys.pendingAdmissionStorageKeyHex,
    causalStorageKeys.consumedAdmissionStorageKeyHex,
    ...pendingKeys.recordKeysHex.map(derivePegInCausalPendingAdmissionStorageKeyV2),
  ]);
  const proof = await requestBoundedPegInFrontierReadProofV1(
    rpc,
    at,
    storageKeysHex,
    'peg-in causal mint-transition child-state',
  );
  return Object.freeze({
    atNativeBlockHashHex: at,
    pendingKeysScaleHex: pendingKeys.scaleHex,
    discoveredPendingRecordKeysHex: pendingKeys.recordKeysHex,
    storageKeysHex,
    causalStorageKeys,
    ...proof,
  });
}

/** Request the exact T20C direct-parent proof plus the causal V2 state keys. */
export async function requestPegInCausalMintTransitionParentStateReadProofV2(
  rpc: ReadOnlySubstrateFinalityRpc,
  input: {
    nativeBlockHashHex: string;
    sidechainIdHex: string;
    ergoBoxIdHex: string;
    bridgeAddressHex: string;
    tokenAddressHex: string;
    recipientHex: string;
  },
): Promise<PegInCausalMintTransitionParentStateReadProofObservation> {
  const at = normalizeBoundedRpcHex(
    input?.nativeBlockHashHex,
    'peg-in causal mint-transition parent-state block hash',
    32,
    32,
  );
  const contractKeys = derivePegInFrontierContractStateStorageKeysV1({
    bridgeAddressHex: input?.bridgeAddressHex,
    tokenAddressHex: input?.tokenAddressHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const transitionKeys = derivePegInFrontierMintTransitionStatementV1({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
    tokenAddressHex: input?.tokenAddressHex,
    recipientHex: input?.recipientHex,
  });
  const causalStorageKeys = derivePegInCausalRuntimeStorageKeysV2({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  if (
    causalStorageKeys.processedRecordStorageKeyHex
      !== transitionKeys.parentNativeProcessedRecordStorageKeyHex
  ) {
    throw new Error('causal parent proof record key differs from the T20C replay key');
  }
  const pendingKeys = await requestPegInCausalPendingKeysV2(
    rpc,
    at,
    causalStorageKeys.pendingKeysStorageKeyHex,
    'peg-in causal mint-transition parent-state',
  );
  const storageKeysHex = freezeUniqueStorageKeys([
    SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    transitionKeys.parentNativeProcessedRecordStorageKeyHex,
    contractKeys.bridgeAccountCodeStorageKeyHex,
    contractKeys.tokenAccountCodeStorageKeyHex,
    contractKeys.bridgeOwnerStorageKeyHex,
    contractKeys.bridgeConfigurationStorageKeyHex,
    contractKeys.processedPegInStorageKeyHex,
    contractKeys.tokenTotalSupplyStorageKeyHex,
    contractKeys.tokenOwnerStorageKeyHex,
    transitionKeys.recipientBalanceStorageKeyHex,
    causalStorageKeys.currentPegInProfileStorageKeyHex,
    causalStorageKeys.currentCausalProfileStorageKeyHex,
    causalStorageKeys.causalEnforcementStorageKeyHex,
    causalStorageKeys.pendingKeysStorageKeyHex,
    causalStorageKeys.pendingAdmissionStorageKeyHex,
    causalStorageKeys.consumedAdmissionStorageKeyHex,
    ...pendingKeys.recordKeysHex.map(derivePegInCausalPendingAdmissionStorageKeyV2),
  ]);
  const proof = await requestBoundedPegInFrontierReadProofV1(
    rpc,
    at,
    storageKeysHex,
    'peg-in causal mint-transition parent-state',
  );
  return Object.freeze({
    atNativeBlockHashHex: at,
    pendingKeysScaleHex: pendingKeys.scaleHex,
    discoveredPendingRecordKeysHex: pendingKeys.recordKeysHex,
    storageKeysHex,
    causalStorageKeys,
    ...proof,
  });
}

/** Request the exact V3 child proof, including target and remaining source-proof receipts. */
export async function requestPegInCausalMintTransitionPostStateReadProofV3(
  rpc: ReadOnlySubstrateFinalityRpc,
  input: {
    nativeBlockHashHex: string;
    sidechainIdHex: string;
    ergoBoxIdHex: string;
    bridgeAddressHex: string;
    tokenAddressHex: string;
    recipientHex: string;
  },
): Promise<PegInCausalMintTransitionPostStateReadProofObservationV3> {
  const at = normalizeBoundedRpcHex(
    input?.nativeBlockHashHex,
    'peg-in causal mint-transition V3 child-state block hash',
    32,
    32,
  );
  const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const contractKeys = derivePegInFrontierContractStateStorageKeysV1({
    bridgeAddressHex: input?.bridgeAddressHex,
    tokenAddressHex: input?.tokenAddressHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const transitionKeys = derivePegInFrontierMintTransitionStatementV1({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
    tokenAddressHex: input?.tokenAddressHex,
    recipientHex: input?.recipientHex,
  });
  const v2Keys = derivePegInCausalRuntimeStorageKeysV2({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  if (v2Keys.processedRecordStorageKeyHex !== recordKey) {
    throw new Error('causal V3 child proof record key differs from the T20C replay key');
  }
  const causalStorageKeys = Object.freeze({
    ...v2Keys,
    admissionReceiptStorageKeyHex:
      derivePegInCausalAdmissionReceiptStorageKeyV1(v2Keys.recordKeyHex),
    invalidationTombstoneStorageKeyHex:
      derivePegInCausalInvalidationTombstoneStorageKeyV1(v2Keys.recordKeyHex),
  });
  const pendingKeys = await requestPegInCausalPendingKeysV2(
    rpc,
    at,
    causalStorageKeys.pendingKeysStorageKeyHex,
    'peg-in causal mint-transition V3 child-state',
  );
  const storageKeysHex = freezeUniqueStorageKeys([
    SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
    SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
    recordKey,
    contractKeys.bridgeAccountCodeStorageKeyHex,
    contractKeys.tokenAccountCodeStorageKeyHex,
    contractKeys.bridgeOwnerStorageKeyHex,
    contractKeys.bridgeConfigurationStorageKeyHex,
    contractKeys.processedPegInStorageKeyHex,
    contractKeys.tokenTotalSupplyStorageKeyHex,
    contractKeys.tokenOwnerStorageKeyHex,
    transitionKeys.recipientBalanceStorageKeyHex,
    causalStorageKeys.currentPegInProfileStorageKeyHex,
    causalStorageKeys.currentCausalProfileStorageKeyHex,
    causalStorageKeys.causalEnforcementStorageKeyHex,
    causalStorageKeys.pendingKeysStorageKeyHex,
    causalStorageKeys.pendingAdmissionStorageKeyHex,
    causalStorageKeys.admissionReceiptStorageKeyHex,
    causalStorageKeys.invalidationTombstoneStorageKeyHex,
    causalStorageKeys.consumedAdmissionStorageKeyHex,
    ...pendingKeys.recordKeysHex.map(derivePegInCausalPendingAdmissionStorageKeyV2),
    ...pendingKeys.recordKeysHex.map(derivePegInCausalAdmissionReceiptStorageKeyV1),
  ]);
  const proof = await requestBoundedPegInFrontierReadProofV1(
    rpc,
    at,
    storageKeysHex,
    'peg-in causal mint-transition V3 child-state',
  );
  return Object.freeze({
    atNativeBlockHashHex: at,
    pendingKeysScaleHex: pendingKeys.scaleHex,
    discoveredPendingRecordKeysHex: pendingKeys.recordKeysHex,
    storageKeysHex,
    causalStorageKeys,
    ...proof,
  });
}

/** Request the exact V3 direct-parent proof, including target and remaining receipts. */
export async function requestPegInCausalMintTransitionParentStateReadProofV3(
  rpc: ReadOnlySubstrateFinalityRpc,
  input: {
    nativeBlockHashHex: string;
    sidechainIdHex: string;
    ergoBoxIdHex: string;
    bridgeAddressHex: string;
    tokenAddressHex: string;
    recipientHex: string;
  },
): Promise<PegInCausalMintTransitionParentStateReadProofObservationV3> {
  const at = normalizeBoundedRpcHex(
    input?.nativeBlockHashHex,
    'peg-in causal mint-transition V3 parent-state block hash',
    32,
    32,
  );
  const contractKeys = derivePegInFrontierContractStateStorageKeysV1({
    bridgeAddressHex: input?.bridgeAddressHex,
    tokenAddressHex: input?.tokenAddressHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  const transitionKeys = derivePegInFrontierMintTransitionStatementV1({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
    tokenAddressHex: input?.tokenAddressHex,
    recipientHex: input?.recipientHex,
  });
  const v2Keys = derivePegInCausalRuntimeStorageKeysV2({
    sidechainIdHex: input?.sidechainIdHex,
    ergoBoxIdHex: input?.ergoBoxIdHex,
  });
  if (v2Keys.processedRecordStorageKeyHex
    !== transitionKeys.parentNativeProcessedRecordStorageKeyHex) {
    throw new Error('causal V3 parent proof record key differs from the T20C replay key');
  }
  const causalStorageKeys = Object.freeze({
    ...v2Keys,
    admissionReceiptStorageKeyHex:
      derivePegInCausalAdmissionReceiptStorageKeyV1(v2Keys.recordKeyHex),
    invalidationTombstoneStorageKeyHex:
      derivePegInCausalInvalidationTombstoneStorageKeyV1(v2Keys.recordKeyHex),
  });
  const pendingKeys = await requestPegInCausalPendingKeysV2(
    rpc,
    at,
    causalStorageKeys.pendingKeysStorageKeyHex,
    'peg-in causal mint-transition V3 parent-state',
  );
  const storageKeysHex = freezeUniqueStorageKeys([
    SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    transitionKeys.parentNativeProcessedRecordStorageKeyHex,
    contractKeys.bridgeAccountCodeStorageKeyHex,
    contractKeys.tokenAccountCodeStorageKeyHex,
    contractKeys.bridgeOwnerStorageKeyHex,
    contractKeys.bridgeConfigurationStorageKeyHex,
    contractKeys.processedPegInStorageKeyHex,
    contractKeys.tokenTotalSupplyStorageKeyHex,
    contractKeys.tokenOwnerStorageKeyHex,
    transitionKeys.recipientBalanceStorageKeyHex,
    causalStorageKeys.currentPegInProfileStorageKeyHex,
    causalStorageKeys.currentCausalProfileStorageKeyHex,
    causalStorageKeys.causalEnforcementStorageKeyHex,
    causalStorageKeys.pendingKeysStorageKeyHex,
    causalStorageKeys.pendingAdmissionStorageKeyHex,
    causalStorageKeys.admissionReceiptStorageKeyHex,
    causalStorageKeys.invalidationTombstoneStorageKeyHex,
    causalStorageKeys.consumedAdmissionStorageKeyHex,
    ...pendingKeys.recordKeysHex.map(derivePegInCausalPendingAdmissionStorageKeyV2),
    ...pendingKeys.recordKeysHex.map(derivePegInCausalAdmissionReceiptStorageKeyV1),
  ]);
  const proof = await requestBoundedPegInFrontierReadProofV1(
    rpc,
    at,
    storageKeysHex,
    'peg-in causal mint-transition V3 parent-state',
  );
  return Object.freeze({
    atNativeBlockHashHex: at,
    pendingKeysScaleHex: pendingKeys.scaleHex,
    discoveredPendingRecordKeysHex: pendingKeys.recordKeysHex,
    storageKeysHex,
    causalStorageKeys,
    ...proof,
  });
}

/**
 * Request one bounded proof over the complete V4 target-reservation state.
 *
 * The proof includes `:code`; a consumer must verify its exact digest and byte
 * length before assigning semantics to the remaining storage values.
 */
export async function requestPooledReserveMintReservationStateReadProofV4(
  rpc: ReadOnlySubstrateFinalityRpc,
  input: {
    readonly nativeBlockHashHex: string;
    readonly reservationKeyHex: string;
  },
): Promise<PooledReserveMintReservationStateReadProofObservationV4> {
  const at = normalizeBoundedRpcHex(
    input?.nativeBlockHashHex,
    'pooled-reserve mint-reservation state block hash',
    32,
    32,
  );
  const reservationStorageKeys =
    derivePooledReserveMintReservationRuntimeStorageKeysV4(
      input?.reservationKeyHex,
    );
  const storageKeysHex = Object.freeze([
    reservationStorageKeys.runtimeCodeStorageKeyHex,
    reservationStorageKeys.currentProfileStorageKeyHex,
    reservationStorageKeys.enforcementStorageKeyHex,
    reservationStorageKeys.pendingKeysStorageKeyHex,
    reservationStorageKeys.pendingReservationStorageKeyHex,
    reservationStorageKeys.consumedReservationStorageKeyHex,
    reservationStorageKeys.invalidatedReservationStorageKeyHex,
  ] as const);
  const proof = await requestBoundedPegInFrontierReadProofV1(
    rpc,
    at,
    storageKeysHex,
    'pooled-reserve mint-reservation V4 state',
  );
  return Object.freeze({
    atNativeBlockHashHex: at,
    storageKeysHex,
    reservationStorageKeys,
    ...proof,
  });
}

async function requestPegInCausalPendingKeysV2(
  rpc: ReadOnlySubstrateFinalityRpc,
  at: string,
  pendingKeysStorageKeyHex: string,
  label: string,
): Promise<Readonly<{ scaleHex: string; recordKeysHex: readonly string[] }>> {
  const raw = await rpc.request<unknown>('state_getStorage', [
    pendingKeysStorageKeyHex,
    `0x${at}`,
  ]);
  if (raw === null) {
    throw new Error(`${label} pending-key list is absent`);
  }
  const scaleHex = `0x${normalizeBoundedRpcHex(
    raw,
    `${label} pending-key list`,
    MAX_PEG_IN_CAUSAL_PENDING_KEYS_SCALE_BYTES_V2,
  )}`;
  return Object.freeze({
    scaleHex,
    recordKeysHex: decodePegInCausalPendingRecordKeysScaleV2(scaleHex),
  });
}

function freezeUniqueStorageKeys(keys: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(keys)]);
}

async function requestBoundedPegInFrontierReadProofV1(
  rpc: ReadOnlySubstrateFinalityRpc,
  at: string,
  storageKeysHex: readonly string[],
  label: string,
): Promise<Readonly<{ proofNodesHex: readonly string[]; proofBytes: number }>> {
  const response = await rpc.request<unknown>('state_getReadProof', [
    storageKeysHex,
    `0x${at}`,
  ]);
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error(`${label} read-proof response must be an object`);
  }
  const record = response as Record<string, unknown>;
  requireExactRpcKeys(record, ['at', 'proof'], `${label} read proof`);
  const proofAt = normalizeBoundedRpcHex(
    record.at,
    `${label} read-proof block hash`,
    32,
    32,
  );
  if (proofAt !== at) {
    throw new Error(`${label} read proof is not bound to the requested native block`);
  }
  if (!Array.isArray(record.proof) || record.proof.length === 0) {
    throw new Error(`${label} read proof must contain trie nodes`);
  }
  if (record.proof.length > MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODES) {
    throw new Error(
      `${label} read proof exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODES} nodes`,
    );
  }

  let proofBytes = 0;
  const proofNodesHex = record.proof.map((node, index) => {
    const normalized = normalizeBoundedRpcHex(
      node,
      `${label} read-proof node ${index}`,
      MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODE_BYTES,
    );
    proofBytes += normalized.length / 2;
    if (proofBytes > MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES) {
      throw new Error(
        `${label} read proof exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES} bytes`,
      );
    }
    return normalized;
  });
  if (new Set(proofNodesHex).size !== proofNodesHex.length) {
    throw new Error(`${label} read proof contains duplicate trie nodes`);
  }
  return Object.freeze({
    proofNodesHex: Object.freeze(proofNodesHex),
    proofBytes,
  });
}

export async function requestBridgeCommitmentReadProof(
  rpc: ReadOnlySubstrateFinalityRpc,
  nativeBlockHash: string,
): Promise<BridgeCommitmentReadProofObservation> {
  const at = normalizeBoundedRpcHex(nativeBlockHash, 'bridge commitment block hash', 32, 32);
  const prefixedAt = `0x${at}`;
  const prefixedKey = `0x${BRIDGE_COMMITMENT_STORAGE_KEY_HEX}`;
  const storage = await rpc.request<unknown>('state_getStorage', [prefixedKey, prefixedAt]);
  if (storage === null) {
    throw new Error('bridge commitment is absent at the requested native block');
  }
  const storageValueScaleHex = normalizeBoundedRpcHex(
    storage,
    'bridge commitment SCALE value',
    BRIDGE_EVENT_COMMITMENT_V1_SCALE_BYTES,
    BRIDGE_EVENT_COMMITMENT_V1_SCALE_BYTES,
  );

  const response = await rpc.request<unknown>('state_getReadProof', [[prefixedKey], prefixedAt]);
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('bridge commitment read-proof response must be an object');
  }
  const record = response as Record<string, unknown>;
  requireExactRpcKeys(record, ['at', 'proof'], 'bridge commitment read proof');
  const proofAt = normalizeBoundedRpcHex(record.at, 'bridge commitment read-proof block hash', 32, 32);
  if (proofAt !== at) {
    throw new Error('bridge commitment read proof is not bound to the requested native block');
  }
  if (!Array.isArray(record.proof) || record.proof.length === 0) {
    throw new Error('bridge commitment read proof must contain trie nodes');
  }
  if (record.proof.length > MAX_BRIDGE_COMMITMENT_PROOF_NODES) {
    throw new Error(
      `bridge commitment read proof exceeds ${MAX_BRIDGE_COMMITMENT_PROOF_NODES} nodes`,
    );
  }

  let proofBytes = 0;
  const proofNodesHex = record.proof.map((node, index) => {
    const normalized = normalizeBoundedRpcHex(
      node,
      `bridge commitment read-proof node ${index}`,
      MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES,
    );
    proofBytes += normalized.length / 2;
    if (proofBytes > MAX_BRIDGE_COMMITMENT_PROOF_BYTES) {
      throw new Error(
        `bridge commitment read proof exceeds ${MAX_BRIDGE_COMMITMENT_PROOF_BYTES} bytes`,
      );
    }
    return normalized;
  });
  if (new Set(proofNodesHex).size !== proofNodesHex.length) {
    throw new Error('bridge commitment read proof contains duplicate trie nodes');
  }

  return {
    atNativeBlockHashHex: at,
    storageKeysHex: [BRIDGE_COMMITMENT_STORAGE_KEY_HEX],
    storageValueScaleHex,
    proofNodesHex,
  };
}

export interface GrandpaAuthority {
  authorityIdHex: string;
  weight: string;
}

const AUTHORITY_ID_BYTES = 32;
const AUTHORITY_WEIGHT_BYTES = 8;
const AUTHORITY_ENTRY_BYTES = AUTHORITY_ID_BYTES + AUTHORITY_WEIGHT_BYTES;

interface CompactInteger {
  value: bigint;
  bytesRead: number;
}

function decodeCanonicalCompactInteger(bytes: Buffer): CompactInteger {
  if (bytes.length === 0) {
    throw new Error('Malformed SCALE compact length: missing prefix');
  }

  const first = bytes[0];
  const mode = first & 0b11;

  if (mode === 0) {
    return { value: BigInt(first >>> 2), bytesRead: 1 };
  }

  if (mode === 1) {
    if (bytes.length < 2) {
      throw new Error('Malformed SCALE compact length in mode 1');
    }
    const value = BigInt(bytes.readUInt16LE(0) >>> 2);
    if (value < 1n << 6n) {
      throw new Error('Noncanonical SCALE compact length in mode 1');
    }
    return { value, bytesRead: 2 };
  }

  if (mode === 2) {
    if (bytes.length < 4) {
      throw new Error('Malformed SCALE compact length in mode 2');
    }
    const value = BigInt(bytes.readUInt32LE(0) >>> 2);
    if (value < 1n << 14n) {
      throw new Error('Noncanonical SCALE compact length in mode 2');
    }
    return { value, bytesRead: 4 };
  }

  const valueBytes = (first >>> 2) + 4;
  if (bytes.length < 1 + valueBytes) {
    throw new Error('Malformed SCALE compact length in mode 3');
  }

  let value = 0n;
  for (let index = 0; index < valueBytes; index += 1) {
    value |= BigInt(bytes[1 + index]) << BigInt(index * 8);
  }

  if (value < 1n << 30n || bytes[valueBytes] === 0) {
    throw new Error('Noncanonical SCALE compact length in mode 3');
  }

  return { value, bytesRead: 1 + valueBytes };
}

function decodeScaleHex(hex: string): Buffer {
  if (typeof hex !== 'string' || !/^(?:0x)?[0-9a-fA-F]*$/.test(hex)) {
    throw new Error('SCALE value must be a hexadecimal string');
  }

  const normalized = hex.replace(/^0x/i, '');
  if (normalized.length % 2 !== 0) {
    throw new Error('SCALE hexadecimal string must contain whole bytes');
  }

  return Buffer.from(normalized, 'hex');
}

function readUint64LittleEndian(bytes: Buffer, offset: number): bigint {
  let value = 0n;
  for (let index = 0; index < AUTHORITY_WEIGHT_BYTES; index += 1) {
    value |= BigInt(bytes[offset + index]) << BigInt(index * 8);
  }
  return value;
}

function requirePositiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function requireUint32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`${label} must be a uint32`);
  }
  return value;
}

function normalizeRpcUint32Hex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`${label} must be 0x-prefixed hexadecimal`);
  }
  const parsed = BigInt(value);
  if (parsed > 0xffff_ffffn) {
    throw new Error(`${label} exceeds uint32`);
  }
  return `0x${parsed.toString(16)}`;
}

function exactRpcRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  requireExactRpcKeys(record, keys, label);
  return record;
}

function requireExactRpcKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} contains missing or unknown fields`);
  }
}

function normalizeBoundedRpcHex(
  value: unknown,
  label: string,
  maxBytes: number,
  exactBytes?: number,
): string {
  if (typeof value !== 'string' || !value.startsWith('0x')) {
    throw new Error(`${label} must be 0x-prefixed hex`);
  }
  const clean = value.slice(2);
  if (clean.length === 0 || clean.length % 2 !== 0) {
    throw new Error(`${label} must contain non-empty whole bytes`);
  }
  const bytes = clean.length / 2;
  if (exactBytes !== undefined && bytes !== exactBytes) {
    throw new Error(`${label} must be exactly ${exactBytes} bytes`);
  }
  if (bytes > maxBytes) {
    throw new Error(`${label} exceeds ${maxBytes} bytes`);
  }
  for (let index = 0; index < clean.length; index += 1) {
    const code = clean.charCodeAt(index);
    const valid =
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x46) ||
      (code >= 0x61 && code <= 0x66);
    if (!valid) throw new Error(`${label} must contain hexadecimal bytes`);
  }
  return clean.toLowerCase();
}

export function decodeCanonicalGrandpaAuthorityListScaleHex(hex: string): GrandpaAuthority[] {
  const bytes = decodeScaleHex(hex);
  const compact = decodeCanonicalCompactInteger(bytes);

  if (compact.value === 0n) {
    throw new Error('GRANDPA authority list must contain at least one entry');
  }

  const availableEntryCount = BigInt(Math.floor((bytes.length - compact.bytesRead) / AUTHORITY_ENTRY_BYTES));
  if (compact.value > availableEntryCount) {
    throw new Error('Truncated GRANDPA authority entry');
  }

  const authorityCount = Number(compact.value);
  const authorities: GrandpaAuthority[] = [];
  const authorityIds = new Set<string>();
  let offset = compact.bytesRead;

  for (let index = 0; index < authorityCount; index += 1) {
    const authorityIdHex = bytes.subarray(offset, offset + AUTHORITY_ID_BYTES).toString('hex');
    offset += AUTHORITY_ID_BYTES;

    if (authorityIds.has(authorityIdHex)) {
      throw new Error(`Duplicate GRANDPA authority ID: ${authorityIdHex}`);
    }
    authorityIds.add(authorityIdHex);

    const weight = readUint64LittleEndian(bytes, offset);
    offset += AUTHORITY_WEIGHT_BYTES;
    if (weight === 0n) {
      throw new Error(`GRANDPA authority weight must be positive: ${authorityIdHex}`);
    }

    authorities.push({ authorityIdHex, weight: weight.toString() });
  }

  if (offset !== bytes.length) {
    throw new Error('Trailing bytes after GRANDPA authority list');
  }

  return authorities;
}
