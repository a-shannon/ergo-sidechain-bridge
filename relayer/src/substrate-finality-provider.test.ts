import { describe, expect, it, vi } from 'vitest';
import {
  BoundedHttpSubstrateRpcTransport,
  BRIDGE_COMMITMENT_STORAGE_KEY_HEX,
  BRIDGE_EVENT_COMMITMENT_V1_SCALE_BYTES,
  ReadOnlySubstrateFinalityRpc,
  MAX_BRIDGE_COMMITMENT_PROOF_BYTES,
  MAX_BRIDGE_COMMITMENT_PROOF_NODES,
  MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES,
  MAX_GRANDPA_AUTHORITY_TRANSITION_PROOF_BYTES,
  MAX_GRANDPA_FINALITY_PROOF_BYTES,
  MAX_SUBSTRATE_HEADER_DIGEST_LOGS,
  MAX_SUBSTRATE_READ_PROOF_RPC_RESPONSE_BYTES,
  MAX_SUBSTRATE_RPC_RESPONSE_BYTES,
  SUBSTRATE_FINALITY_READ_METHODS,
  decodeCanonicalGrandpaAuthorityListScaleHex,
  requestBridgeCommitmentReadProof,
  requestGrandpaAuthorityTransitionProofScaleHex,
  requestGrandpaFinalityProofScaleHex,
  requestPegInRuntimeStateReadProof,
  requestSubstrateBlockHashAt,
  requestSubstrateFinalizedHeadHash,
  requestSubstrateHeaderObservation,
  type SubstrateRpcTransport,
} from './substrate-finality-provider.js';
import {
  PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
} from './peg-in-runtime-state.js';

const authorityOne = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0')).join('');
const authorityTwo = Array.from({ length: 32 }, (_, index) => (index + 32).toString(16).padStart(2, '0')).join('');
const weightOne = '0100000000000000';
const weightTwo = '0200000000000000';
const frozenAuthorityVector = `0x08${authorityOne}${weightOne}${authorityTwo}${weightTwo}`;
const targetHash = `0x${'21'.repeat(32)}`;
const bridgeStorageValue = `01${'11'.repeat(32)}0004000000000000${'22'.repeat(32)}${'33'.repeat(32)}03000000`;

describe('ReadOnlySubstrateFinalityRpc', () => {
  it('exposes the exact finality read allowlist', () => {
    expect(SUBSTRATE_FINALITY_READ_METHODS).toEqual([
      'chain_getFinalizedHead',
      'chain_getHeader',
      'chain_getBlockHash',
      'grandpa_proveFinality',
      'bridge_grandpaWarpProof',
      'state_getStorage',
      'state_getReadProof',
      'state_call',
    ]);
  });

  it('collects a bounded canonical GRANDPA finality proof for one exact height', async () => {
    const request = vi.fn().mockResolvedValue('0xAABB00');
    const rpc = new ReadOnlySubstrateFinalityRpc({ request });

    await expect(requestGrandpaFinalityProofScaleHex(rpc, 1024)).resolves.toBe('aabb00');
    expect(request).toHaveBeenCalledWith('grandpa_proveFinality', [1024]);
  });

  it('collects exact finalized, block-hash, and header observations', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(targetHash.toUpperCase().replace('0X', '0x'))
      .mockResolvedValueOnce(`0x${'31'.repeat(32)}`)
      .mockResolvedValueOnce({
        parentHash: `0x${'11'.repeat(32)}`,
        number: '0X00000400'.replace('0X', '0x'),
        stateRoot: `0x${'12'.repeat(32)}`,
        extrinsicsRoot: `0x${'13'.repeat(32)}`,
        digest: { logs: ['0x04010203', '0xAABB'] },
      });
    const rpc = new ReadOnlySubstrateFinalityRpc({ request });

    await expect(requestSubstrateFinalizedHeadHash(rpc)).resolves.toBe(targetHash);
    await expect(requestSubstrateBlockHashAt(rpc, 1024)).resolves.toBe(`0x${'31'.repeat(32)}`);
    await expect(requestSubstrateHeaderObservation(rpc, targetHash)).resolves.toEqual({
      parentHash: `0x${'11'.repeat(32)}`,
      number: '0x400',
      stateRoot: `0x${'12'.repeat(32)}`,
      extrinsicsRoot: `0x${'13'.repeat(32)}`,
      digest: { logs: ['0x04010203', '0xaabb'] },
    });
    expect(request).toHaveBeenNthCalledWith(1, 'chain_getFinalizedHead', []);
    expect(request).toHaveBeenNthCalledWith(2, 'chain_getBlockHash', [1024]);
    expect(request).toHaveBeenNthCalledWith(3, 'chain_getHeader', [targetHash]);
  });

  it('rejects absent, unknown, unbounded, and invalid header observations', async () => {
    const absent = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn().mockResolvedValue(null),
    });
    await expect(requestSubstrateHeaderObservation(absent, targetHash)).rejects.toThrow(
      /unavailable/,
    );

    const unknown = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn().mockResolvedValue({
        parentHash: `0x${'11'.repeat(32)}`,
        number: '0x1',
        stateRoot: `0x${'12'.repeat(32)}`,
        extrinsicsRoot: `0x${'13'.repeat(32)}`,
        digest: { logs: [] },
        extra: true,
      }),
    });
    await expect(requestSubstrateHeaderObservation(unknown, targetHash)).rejects.toThrow(
      /unknown fields/,
    );

    const tooManyLogs = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn().mockResolvedValue({
        parentHash: `0x${'11'.repeat(32)}`,
        number: '0x1',
        stateRoot: `0x${'12'.repeat(32)}`,
        extrinsicsRoot: `0x${'13'.repeat(32)}`,
        digest: { logs: Array(MAX_SUBSTRATE_HEADER_DIGEST_LOGS + 1).fill('0x00') },
      }),
    });
    await expect(requestSubstrateHeaderObservation(tooManyLogs, targetHash)).rejects.toThrow(
      /logs/,
    );

    const overflow = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn().mockResolvedValue({
        parentHash: `0x${'11'.repeat(32)}`,
        number: '0x100000000',
        stateRoot: `0x${'12'.repeat(32)}`,
        extrinsicsRoot: `0x${'13'.repeat(32)}`,
        digest: { logs: [] },
      }),
    });
    await expect(requestSubstrateHeaderObservation(overflow, targetHash)).rejects.toThrow(
      /uint32/,
    );
  });

  it.each([
    [-1],
    [1.5],
    [0x1_0000_0000],
  ])('rejects invalid GRANDPA proof block number %s before RPC', async (height) => {
    const request = vi.fn();
    const rpc = new ReadOnlySubstrateFinalityRpc({ request });

    await expect(requestGrandpaFinalityProofScaleHex(rpc, height)).rejects.toThrow(/uint32/);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    [null, /unavailable/],
    ['', /0x-prefixed hex/],
    ['0x0', /whole bytes/],
    ['0xzz', /0x-prefixed hex/],
  ])('rejects malformed or unavailable GRANDPA proof response %s', async (response, error) => {
    const rpc = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn().mockResolvedValue(response),
    });

    await expect(requestGrandpaFinalityProofScaleHex(rpc, 3)).rejects.toThrow(error);
  });

  it('rejects an oversized GRANDPA proof response', async () => {
    const rpc = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn().mockResolvedValue(`0x${'00'.repeat(MAX_GRANDPA_FINALITY_PROOF_BYTES + 1)}`),
    });

    await expect(requestGrandpaFinalityProofScaleHex(rpc, 3)).rejects.toThrow(/exceeds/);
  });

  it('collects one bounded canonical GRANDPA authority-transition proof chunk', async () => {
    const request = vi.fn().mockResolvedValue({
      encoding: 'base64',
      proof: Buffer.from('aabb00', 'hex').toString('base64'),
    });
    const rpc = new ReadOnlySubstrateFinalityRpc({ request });
    const startHash = `0x${'11'.repeat(32)}`;

    await expect(requestGrandpaAuthorityTransitionProofScaleHex(rpc, startHash)).resolves.toBe(
      'aabb00',
    );
    expect(request).toHaveBeenCalledWith('bridge_grandpaWarpProof', [startHash]);
  });

  it.each([
    ['', /0x-prefixed/],
    ['0x11', /32-byte/],
    [`${'11'.repeat(32)}`, /0x-prefixed/],
    [`0x${'zz'.repeat(32)}`, /hex/],
  ])('rejects invalid GRANDPA transition start hash %s before RPC', async (startHash, error) => {
    const request = vi.fn();
    const rpc = new ReadOnlySubstrateFinalityRpc({ request });

    await expect(requestGrandpaAuthorityTransitionProofScaleHex(rpc, startHash)).rejects.toThrow(
      error,
    );
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    [null, /unavailable/],
    ['', /must be an object/],
    [{}, /missing or unknown fields/],
    [{ encoding: 'hex', proof: 'qrs=' }, /base64 encoding/],
    [{ encoding: 'base64', proof: '' }, /canonical base64/],
    [{ encoding: 'base64', proof: 'YQ' }, /canonical base64/],
    [{ encoding: 'base64', proof: '@@==' }, /canonical base64/],
    [{ encoding: 'base64', proof: 'Zh==' }, /canonical base64/],
    [{ encoding: 'base64', proof: 'YQ==', extra: true }, /unknown fields/],
  ])('rejects malformed or unavailable GRANDPA transition response %#', async (response, error) => {
    const rpc = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn().mockResolvedValue(response),
    });

    await expect(
      requestGrandpaAuthorityTransitionProofScaleHex(rpc, `0x${'11'.repeat(32)}`),
    ).rejects.toThrow(error);
  });

  it('rejects an oversized GRANDPA authority-transition proof response', async () => {
    const rpc = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn().mockResolvedValue({
        encoding: 'base64',
        proof: Buffer.alloc(MAX_GRANDPA_AUTHORITY_TRANSITION_PROOF_BYTES + 1).toString('base64'),
      }),
    });

    await expect(
      requestGrandpaAuthorityTransitionProofScaleHex(rpc, `0x${'11'.repeat(32)}`),
    ).rejects.toThrow(/exceeds/);
  });

  it('collects the exact bridge commitment value and bounded trie proof at one block', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(`0x${bridgeStorageValue.toUpperCase()}`)
      .mockResolvedValueOnce({
        at: targetHash.toUpperCase().replace('0X', '0x'),
        proof: ['0x010203', '0xAABBCC'],
      });
    const rpc = new ReadOnlySubstrateFinalityRpc({ request });

    await expect(requestBridgeCommitmentReadProof(rpc, targetHash)).resolves.toEqual({
      atNativeBlockHashHex: targetHash.slice(2),
      storageKeysHex: [BRIDGE_COMMITMENT_STORAGE_KEY_HEX],
      storageValueScaleHex: bridgeStorageValue,
      proofNodesHex: ['010203', 'aabbcc'],
    });
    expect(request).toHaveBeenNthCalledWith(1, 'state_getStorage', [
      `0x${BRIDGE_COMMITMENT_STORAGE_KEY_HEX}`,
      targetHash,
    ]);
    expect(request).toHaveBeenNthCalledWith(2, 'state_getReadProof', [
      [`0x${BRIDGE_COMMITMENT_STORAGE_KEY_HEX}`],
      targetHash,
    ]);
    expect(Buffer.from(bridgeStorageValue, 'hex')).toHaveLength(
      BRIDGE_EVENT_COMMITMENT_V1_SCALE_BYTES,
    );
  });

  it('requests only the peg-in record key for membership in one bounded proof call', async () => {
    const request = vi.fn().mockResolvedValue({
      at: targetHash,
      proof: ['0x010203', '0xAABBCC'],
    });
    const rpc = new ReadOnlySubstrateFinalityRpc({ request });
    const sidechainIdHex = `0x${'44'.repeat(32)}`;
    const ergoBoxIdHex = `0x${'55'.repeat(32)}`;
    const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
      sidechainIdHex,
      ergoBoxIdHex,
    });

    await expect(requestPegInRuntimeStateReadProof(rpc, {
      nativeBlockHashHex: targetHash,
      sidechainIdHex,
      ergoBoxIdHex,
      outcome: 'membership',
    })).resolves.toEqual({
      atNativeBlockHashHex: targetHash.slice(2),
      outcome: 'membership',
      storageKeysHex: [recordKey],
      proofNodesHex: ['010203', 'aabbcc'],
    });
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('state_getReadProof', [[recordKey], targetHash]);
  });

  it('requests current profile then record for non-membership without reading storage values', async () => {
    const request = vi.fn().mockResolvedValue({
      at: targetHash,
      proof: ['0x010203'],
    });
    const rpc = new ReadOnlySubstrateFinalityRpc({ request });
    const sidechainIdHex = `0x${'44'.repeat(32)}`;
    const ergoBoxIdHex = `0x${'55'.repeat(32)}`;
    const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
      sidechainIdHex,
      ergoBoxIdHex,
    });

    const result = await requestPegInRuntimeStateReadProof(rpc, {
      nativeBlockHashHex: targetHash,
      sidechainIdHex,
      ergoBoxIdHex,
      outcome: 'nonMembership',
    });
    expect(result.storageKeysHex).toEqual([
      PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
      recordKey,
    ]);
    expect(request).toHaveBeenCalledWith('state_getReadProof', [[
      PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
      recordKey,
    ], targetHash]);
    expect(request.mock.calls.map(call => call[0])).not.toContain('state_getStorage');
  });

  it('rejects peg-in read-proof drift, duplicate nodes, unknown fields, and empty proofs', async () => {
    const base = {
      nativeBlockHashHex: targetHash,
      sidechainIdHex: `0x${'44'.repeat(32)}`,
      ergoBoxIdHex: `0x${'55'.repeat(32)}`,
      outcome: 'membership' as const,
    };
    for (const [response, error] of [
      [{ at: `0x${'22'.repeat(32)}`, proof: ['0x01'] }, /not bound/],
      [{ at: targetHash, proof: ['0x0102', '0x0102'] }, /duplicate/],
      [{ at: targetHash, proof: ['0x01'], extra: true }, /unknown fields/],
      [{ at: targetHash, proof: [] }, /contain trie nodes/],
    ] as const) {
      const rpc = new ReadOnlySubstrateFinalityRpc({
        request: vi.fn().mockResolvedValue(response),
      });
      await expect(requestPegInRuntimeStateReadProof(rpc, base)).rejects.toThrow(error);
    }
  });

  it('rejects peg-in read proofs that exceed node-count, node-size, or aggregate bounds', async () => {
    const base = {
      nativeBlockHashHex: targetHash,
      sidechainIdHex: `0x${'44'.repeat(32)}`,
      ergoBoxIdHex: `0x${'55'.repeat(32)}`,
      outcome: 'membership' as const,
    };
    const oversizedNodeCount = Array.from(
      { length: MAX_BRIDGE_COMMITMENT_PROOF_NODES + 1 },
      (_, index) => `0x${index.toString(16).padStart(4, '0')}`,
    );
    const oversizedNode = `0x${'aa'.repeat(MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES + 1)}`;
    const aggregateNodes = Array.from(
      { length: Math.ceil(
        MAX_BRIDGE_COMMITMENT_PROOF_BYTES / MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES,
      ) + 1 },
      (_, index) =>
        `0x${index.toString(16).padStart(2, '0')}${
          'aa'.repeat(MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES - 1)
        }`,
    );

    for (const [proof, error] of [
      [oversizedNodeCount, /exceeds 256 nodes/],
      [[oversizedNode], /exceeds 65536 bytes/],
      [aggregateNodes, /exceeds 262144 bytes/],
    ] as const) {
      const rpc = new ReadOnlySubstrateFinalityRpc({
        request: vi.fn().mockResolvedValue({ at: targetHash, proof }),
      });
      await expect(requestPegInRuntimeStateReadProof(rpc, base)).rejects.toThrow(error);
    }
  });

  it.each([
    ['', /0x-prefixed/],
    ['0x11', /exactly 32 bytes/],
    [`0x${'zz'.repeat(32)}`, /hexadecimal/],
  ])('rejects invalid bridge commitment block hash %s before RPC', async (hash, error) => {
    const request = vi.fn();
    const rpc = new ReadOnlySubstrateFinalityRpc({ request });

    await expect(requestBridgeCommitmentReadProof(rpc, hash)).rejects.toThrow(error);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects an absent or malformed bridge commitment storage value', async () => {
    const absent = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn().mockResolvedValue(null),
    });
    await expect(requestBridgeCommitmentReadProof(absent, targetHash)).rejects.toThrow(/absent/);

    const malformed = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn().mockResolvedValue('0x01'),
    });
    await expect(requestBridgeCommitmentReadProof(malformed, targetHash)).rejects.toThrow(
      /exactly 109 bytes/,
    );
  });

  it('rejects read-proof target drift, duplicate nodes, and unbounded proof material', async () => {
    const drift = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn()
        .mockResolvedValueOnce(`0x${bridgeStorageValue}`)
        .mockResolvedValueOnce({ at: `0x${'22'.repeat(32)}`, proof: ['0x01'] }),
    });
    await expect(requestBridgeCommitmentReadProof(drift, targetHash)).rejects.toThrow(/not bound/);

    const duplicate = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn()
        .mockResolvedValueOnce(`0x${bridgeStorageValue}`)
        .mockResolvedValueOnce({ at: targetHash, proof: ['0x0102', '0x0102'] }),
    });
    await expect(requestBridgeCommitmentReadProof(duplicate, targetHash)).rejects.toThrow(
      /duplicate/,
    );

    const unknown = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn()
        .mockResolvedValueOnce(`0x${bridgeStorageValue}`)
        .mockResolvedValueOnce({ at: targetHash, proof: ['0x01'], extra: true }),
    });
    await expect(requestBridgeCommitmentReadProof(unknown, targetHash)).rejects.toThrow(
      /unknown fields/,
    );

    const tooMany = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn()
        .mockResolvedValueOnce(`0x${bridgeStorageValue}`)
        .mockResolvedValueOnce({
          at: targetHash,
          proof: Array.from({ length: MAX_BRIDGE_COMMITMENT_PROOF_NODES + 1 }, () => '0x01'),
        }),
    });
    await expect(requestBridgeCommitmentReadProof(tooMany, targetHash)).rejects.toThrow(/nodes/);

    const oversizedNode = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn()
        .mockResolvedValueOnce(`0x${bridgeStorageValue}`)
        .mockResolvedValueOnce({
          at: targetHash,
          proof: [`0x${'00'.repeat(MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES + 1)}`],
        }),
    });
    await expect(requestBridgeCommitmentReadProof(oversizedNode, targetHash)).rejects.toThrow(
      /exceeds/,
    );

    const oversizedAggregate = new ReadOnlySubstrateFinalityRpc({
      request: vi.fn()
        .mockResolvedValueOnce(`0x${bridgeStorageValue}`)
        .mockResolvedValueOnce({
          at: targetHash,
          proof: Array.from(
            { length: MAX_BRIDGE_COMMITMENT_PROOF_BYTES / MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES + 1 },
            (_, index) => `0x${index.toString(16).padStart(2, '0')}${'00'.repeat(MAX_BRIDGE_COMMITMENT_PROOF_NODE_BYTES - 1)}`,
          ),
        }),
    });
    await expect(requestBridgeCommitmentReadProof(oversizedAggregate, targetHash)).rejects.toThrow(
      /bytes/,
    );
  });

  it.each(SUBSTRATE_FINALITY_READ_METHODS)('forwards %s and its exact parameter object', async (method) => {
    const params = [{ block: '0x1234' }, 7] as const;
    const request = vi.fn().mockResolvedValue({ ok: method });
    const transport: SubstrateRpcTransport = { request };
    const rpc = new ReadOnlySubstrateFinalityRpc(transport);

    await expect(rpc.request(method, params)).resolves.toEqual({ ok: method });
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(method, params);
  });

  it.each([
    'author_submitExtrinsic',
    'author_insertKey',
    'chain_submitExtrinsic',
    'offchain_localStorageSet',
    'system_addReservedPeer',
    'wallet_sign',
  ])('blocks %s before invoking the transport', async (method) => {
    const request = vi.fn();
    const rpc = new ReadOnlySubstrateFinalityRpc({ request });

    await expect(rpc.request(method, ['payload'])).rejects.toThrow(/not allowed/i);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('BoundedHttpSubstrateRpcTransport', () => {
  it('covers the maximum hex-encoded state proof with bounded JSON overhead', () => {
    expect(MAX_SUBSTRATE_READ_PROOF_RPC_RESPONSE_BYTES)
      .toBeGreaterThan(2 * 12 * 1024 * 1024);
    expect(MAX_SUBSTRATE_RPC_RESPONSE_BYTES)
      .toBe(MAX_SUBSTRATE_READ_PROOF_RPC_RESPONSE_BYTES);
    expect(MAX_SUBSTRATE_RPC_RESPONSE_BYTES).toBeLessThan(26 * 1024 * 1024);
  });

  it('sends one JSON-RPC request and returns the matching bounded result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: '0xaabb',
    }), { status: 200 }));
    const transport = new BoundedHttpSubstrateRpcTransport('http://127.0.0.1:9944', {
      fetchImpl,
    });

    await expect(transport.request('grandpa_proveFinality', [3])).resolves.toBe('0xaabb');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:9944/');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(JSON.parse(String(init?.body))).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'grandpa_proveFinality',
      params: [3],
    });
  });

  it('accepts the maximum declared read-proof response bound', async () => {
    const response = new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: { at: `0x${'11'.repeat(32)}`, proof: ['0x00'] },
    }), {
      status: 200,
      headers: {
        'content-length': String(MAX_SUBSTRATE_READ_PROOF_RPC_RESPONSE_BYTES),
      },
    });
    const transport = new BoundedHttpSubstrateRpcTransport('https://rpc.invalid', {
      fetchImpl: vi.fn().mockResolvedValue(response),
    });

    await expect(transport.request('state_getReadProof', [[], `0x${'11'.repeat(32)}`]))
      .resolves.toMatchObject({ proof: ['0x00'] });
  });

  it('rejects declared oversized bodies before reading them', async () => {
    const response = new Response('{}', {
      status: 200,
      headers: { 'content-length': String(MAX_SUBSTRATE_RPC_RESPONSE_BYTES + 1) },
    });
    const transport = new BoundedHttpSubstrateRpcTransport('https://rpc.invalid', {
      fetchImpl: vi.fn().mockResolvedValue(response),
    });

    await expect(transport.request('grandpa_proveFinality', [3])).rejects.toThrow(/exceeds/);
  });

  it('cancels a streamed body as soon as the byte limit is crossed', async () => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(8));
      },
      cancel: cancelled,
    });
    const transport = new BoundedHttpSubstrateRpcTransport('https://rpc.invalid', {
      maxResponseBytes: 10,
      fetchImpl: vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    });

    await expect(transport.request('grandpa_proveFinality', [3])).rejects.toThrow(/exceeds 10/);
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it.each([
    ['not a URL'],
    ['file:///tmp/node'],
    ['https://user:password@rpc.invalid'],
  ])('rejects unsafe endpoint %s', endpoint => {
    expect(() => new BoundedHttpSubstrateRpcTransport(endpoint)).toThrow(/HTTP\(S\)/);
  });

  it('rejects response identity drift and JSON-RPC errors without echoing remote messages', async () => {
    const identityDrift = new BoundedHttpSubstrateRpcTransport('https://rpc.invalid', {
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: null,
      }))),
    });
    await expect(identityDrift.request('grandpa_proveFinality', [3])).rejects.toThrow(/identity/);

    const rpcError = new BoundedHttpSubstrateRpcTransport('https://rpc.invalid', {
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32000, message: 'private upstream detail' },
      }))),
    });
    const error = await rpcError.request('grandpa_proveFinality', [3]).then(
      () => undefined,
      reason => reason as Error,
    );
    expect(error?.message).toBe('Substrate RPC returned error code -32000');
    expect(error?.message).not.toContain('private upstream detail');
  });
});

describe('decodeCanonicalGrandpaAuthorityListScaleHex', () => {
  it('decodes the frozen two-authority vector in order', () => {
    expect(decodeCanonicalGrandpaAuthorityListScaleHex(frozenAuthorityVector)).toEqual([
      { authorityIdHex: authorityOne, weight: '1' },
      { authorityIdHex: authorityTwo, weight: '2' },
    ]);
  });

  it.each([
    ['truncated mode 1', '0x01'],
    ['truncated mode 2', '0x02ffff'],
    ['truncated mode 3', '0x03ffffff'],
  ])('rejects a malformed compact length in %s', (_name, hex) => {
    expect(() => decodeCanonicalGrandpaAuthorityListScaleHex(hex)).toThrow(/compact/i);
  });

  it.each([
    ['mode 1', '0x0900'],
    ['mode 2', '0x0a000000'],
    ['mode 3', '0x0302000000'],
  ])('rejects a noncanonical compact length encoded in %s', (_name, prefix) => {
    expect(() => decodeCanonicalGrandpaAuthorityListScaleHex(`${prefix}${authorityOne}${weightOne}${authorityTwo}${weightTwo}`)).toThrow(/noncanonical/i);
  });

  it('rejects an empty authority list', () => {
    expect(() => decodeCanonicalGrandpaAuthorityListScaleHex('0x00')).toThrow(/at least one/i);
  });

  it('rejects duplicate authority IDs', () => {
    expect(() => decodeCanonicalGrandpaAuthorityListScaleHex(`0x08${authorityOne}${weightOne}${authorityOne}${weightTwo}`)).toThrow(/duplicate/i);
  });

  it('rejects zero authority weights', () => {
    expect(() => decodeCanonicalGrandpaAuthorityListScaleHex(`0x04${authorityOne}0000000000000000`)).toThrow(/positive/i);
  });

  it('rejects a truncated authority entry', () => {
    expect(() => decodeCanonicalGrandpaAuthorityListScaleHex(`0x04${authorityOne}`)).toThrow(/truncated/i);
  });

  it('rejects trailing bytes', () => {
    expect(() => decodeCanonicalGrandpaAuthorityListScaleHex(`${frozenAuthorityVector}00`)).toThrow(/trailing/i);
  });
});
