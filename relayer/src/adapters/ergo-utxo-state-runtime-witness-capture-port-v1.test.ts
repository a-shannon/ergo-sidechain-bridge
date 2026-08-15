import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  replayErgoAutolykosV2RelayWitnessV1,
} from '../ergo-settlement-core/ergo-autolykos-v2-relay-witness-v1.js';
import {
  decodeErgoAutolykosV2RelayRuntimeWitnessV1,
} from '../ergo-settlement-core/ergo-autolykos-v2-relay-runtime-witness-v1.js';
import {
  computeErgoHeaderId,
  serializeErgoHeaderIdentity,
  type ErgoHeaderIdentityFields,
} from '../ergo-settlement-core/ergo-header-id.js';
import {
  buildFrontierErgoUtxoRuntimeStatementV3Fixture,
} from '../test-fixtures/frontier-ergo-utxo-runtime-statement-v3-fixture.js';
import {
  assertErgoUtxoStateRuntimeWitnessCapturePortV1Provenance,
  assertErgoUtxoStateRuntimeWitnessNodeCaptureV1Provenance,
  captureErgoUtxoStateRuntimeWitnessFromNodeV1,
  createErgoUtxoStateRuntimeWitnessCapturePortV1,
  normalizeErgoNodeHeaderBytes,
} from './ergo-utxo-state-runtime-witness-capture-port-v1.js';

const transport = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('axios', () => ({
  default: { create: transport.create },
}));

beforeEach(() => {
  vi.resetAllMocks();
  transport.create.mockReturnValue({
    get: transport.get,
    post: transport.post,
  });
});

describe('Ergo UTXO state runtime witness node port V1', () => {
  it('uses only fixed read routes and produces the golden stable capture', async () => {
    const fixture = buildFrontierErgoUtxoRuntimeStatementV3Fixture();
    const header = targetHeader(fixture);
    const calls: string[] = [];
    transport.get.mockImplementation(async () => {
      calls.push('header');
      return nodeResponse([nodeHeader(header)]);
    });
    transport.post.mockImplementation(async () => {
      calls.push('proof');
      return nodeResponse(fixture.utxoInput.proofHex);
    });
    const port = createErgoUtxoStateRuntimeWitnessCapturePortV1({
      nodeUrl: 'http://127.0.0.1:9053',
    });
    expect(() => assertErgoUtxoStateRuntimeWitnessCapturePortV1Provenance(port))
      .not.toThrow();
    expect(port).not.toHaveProperty('client');
    expect(port).not.toHaveProperty('submitTransaction');
    expect(port).not.toHaveProperty('requestRawJson');

    const targetHeaderBytes = normalizeErgoNodeHeaderBytes(nodeHeader(header));
    const capture = await captureErgoUtxoStateRuntimeWitnessFromNodeV1({
      port,
      targetHeaderBytes,
      transactionWitnessBytes: fixture.transactionWitnessBytes,
      expectedTransactionProfile: fixture.expectedTransactionProfile,
    });

    expect(calls).toEqual(['header', 'proof', 'header']);
    expect(transport.get).toHaveBeenCalledTimes(2);
    expect(transport.get).toHaveBeenNthCalledWith(
      1,
      '/blocks/lastHeaders/1',
      expect.objectContaining({
        timeout: 30_000,
        signal: expect.any(AbortSignal),
        responseType: 'arraybuffer',
        decompress: false,
      }),
    );
    expect(transport.post).toHaveBeenCalledWith(
      '/utxo/getBoxesBinaryProof',
      [
        fixture.utxoInput.vaultBoxIdHex,
        fixture.utxoInput.refundableSourceBoxIdHex,
      ],
      expect.objectContaining({
        timeout: 30_000,
        signal: expect.any(AbortSignal),
        responseType: 'arraybuffer',
        decompress: false,
      }),
    );
    expect(Buffer.from(capture.witness.bytesHex, 'hex')).toEqual(
      fixture.utxoWitnessBytes,
    );
    expect(() => assertErgoUtxoStateRuntimeWitnessNodeCaptureV1Provenance(capture))
      .not.toThrow();
  });

  it('rejects a false header ID, malformed fields, and duplicate node JSON keys', async () => {
    const fixture = buildFrontierErgoUtxoRuntimeStatementV3Fixture();
    const header = targetHeader(fixture);
    const legacyHeader: ErgoHeaderIdentityFields = {
      ...header,
      version: 1,
      powSolution: {
        ...header.powSolution,
        oneTimePublicKey: header.powSolution.publicKey,
        distance: 0n,
      },
    };
    expect(normalizeErgoNodeHeaderBytes(nodeHeader(legacyHeader)))
      .toEqual(serializeErgoHeaderIdentity(legacyHeader));
    expect(() => normalizeErgoNodeHeaderBytes({
      ...nodeHeader(header),
      id: '00'.repeat(32),
    })).toThrow(/claimed ID/);
    expect(() => normalizeErgoNodeHeaderBytes({
      ...nodeHeader(header),
      stateRoot: '00'.repeat(32),
    })).toThrow(/33-byte/);
    expect(() => normalizeErgoNodeHeaderBytes({
      ...nodeHeader(header),
      version: 0,
    })).toThrow(/supported range/);
    const incompleteLegacy = nodeHeader(legacyHeader);
    delete (incompleteLegacy.powSolutions as Record<string, unknown>).w;
    expect(() => normalizeErgoNodeHeaderBytes(incompleteLegacy))
      .toThrow(/one-time public key/);

    const port = createErgoUtxoStateRuntimeWitnessCapturePortV1({
      nodeUrl: 'http://127.0.0.1:9053',
    });
    await expect(captureErgoUtxoStateRuntimeWitnessFromNodeV1({
      port,
      targetHeaderBytes: serializeErgoHeaderIdentity(legacyHeader),
      transactionWitnessBytes: fixture.transactionWitnessBytes,
      expectedTransactionProfile: fixture.expectedTransactionProfile,
    })).rejects.toThrow(/version 2 to 4/);
    expect(transport.get).not.toHaveBeenCalled();
    expect(transport.post).not.toHaveBeenCalled();

    const headerJson = JSON.stringify(nodeHeader(header));
    const duplicateId = headerJson.replace(
      '"id":',
      `"id":"${computeErgoHeaderId(header).toString('hex')}","id":`,
    );
    transport.get.mockResolvedValueOnce(rawNodeResponse(`[${duplicateId}]`));
    await expect(port.readCurrentTipHeaderBytes()).rejects.toThrow(/duplicate JSON object key/);
  });

  it('rejects noncanonical, oversized, compressed, and non-success proof responses', async () => {
    const fixture = buildFrontierErgoUtxoRuntimeStatementV3Fixture();
    const port = createErgoUtxoStateRuntimeWitnessCapturePortV1({
      nodeUrl: 'http://127.0.0.1:9053',
    });
    for (const proof of [
      `0x${fixture.utxoInput.proofHex}`,
      fixture.utxoInput.proofHex.toUpperCase(),
      '',
      '00'.repeat(16 * 1024 + 1),
    ]) {
      transport.post.mockResolvedValueOnce(nodeResponse(proof));
      await expect(port.readBoxesBinaryProof([
        fixture.utxoInput.vaultBoxIdHex,
        fixture.utxoInput.refundableSourceBoxIdHex,
      ])).rejects.toThrow();
    }
    transport.post.mockResolvedValueOnce(nodeResponse(
      fixture.utxoInput.proofHex,
      { 'content-encoding': 'gzip' },
    ));
    await expect(port.readBoxesBinaryProof([
      fixture.utxoInput.vaultBoxIdHex,
      fixture.utxoInput.refundableSourceBoxIdHex,
    ])).rejects.toThrow(/identity encoding/);
    transport.post.mockResolvedValueOnce(nodeResponse(
      fixture.utxoInput.proofHex,
      {},
      500,
    ));
    await expect(port.readBoxesBinaryProof([
      fixture.utxoInput.vaultBoxIdHex,
      fixture.utxoInput.refundableSourceBoxIdHex,
    ])).rejects.toThrow(/HTTP status 500/);
  });

  it('rejects a different pre-proof tip without issuing the proof POST', async () => {
    const fixture = buildFrontierErgoUtxoRuntimeStatementV3Fixture();
    const header = targetHeader(fixture);
    const differentHeader = { ...header, height: header.height + 1 };
    transport.get.mockResolvedValueOnce(nodeResponse([nodeHeader(differentHeader)]));
    const port = createErgoUtxoStateRuntimeWitnessCapturePortV1({
      nodeUrl: 'http://127.0.0.1:9053',
    });
    await expect(captureErgoUtxoStateRuntimeWitnessFromNodeV1({
      port,
      targetHeaderBytes: normalizeErgoNodeHeaderBytes(nodeHeader(header)),
      transactionWitnessBytes: fixture.transactionWitnessBytes,
      expectedTransactionProfile: fixture.expectedTransactionProfile,
    })).rejects.toThrow(/before UTXO proof/);
    expect(transport.post).not.toHaveBeenCalled();
  });

  it('rejects unsafe URLs, forged ports, duplicate keys, and forged captures', async () => {
    const fixture = buildFrontierErgoUtxoRuntimeStatementV3Fixture();
    const header = targetHeader(fixture);
    for (const nodeUrl of [
      'http://user:password@127.0.0.1:9053',
      'http://127.0.0.1:9053/transactions',
      'http://127.0.0.1:9053?api_key=x',
    ]) {
      expect(() => createErgoUtxoStateRuntimeWitnessCapturePortV1({ nodeUrl }))
        .toThrow();
    }
    const accessorInput = {} as { nodeUrl: string };
    Object.defineProperty(accessorInput, 'nodeUrl', {
      enumerable: true,
      get: () => 'http://127.0.0.1:9053',
    });
    expect(() => createErgoUtxoStateRuntimeWitnessCapturePortV1(accessorInput))
      .toThrow(/data property/);
    const forgedPort = {
      async readCurrentTipHeaderBytes() {
        return normalizeErgoNodeHeaderBytes(nodeHeader(header));
      },
      async readBoxesBinaryProof() {
        return Buffer.from(fixture.utxoInput.proofHex, 'hex');
      },
    };
    await expect(captureErgoUtxoStateRuntimeWitnessFromNodeV1({
      port: forgedPort,
      targetHeaderBytes: normalizeErgoNodeHeaderBytes(nodeHeader(header)),
      transactionWitnessBytes: fixture.transactionWitnessBytes,
      expectedTransactionProfile: fixture.expectedTransactionProfile,
    })).rejects.toThrow(/static adapter/);

    const port = createErgoUtxoStateRuntimeWitnessCapturePortV1({
      nodeUrl: 'http://127.0.0.1:9053',
    });
    await expect(port.readBoxesBinaryProof([
      fixture.utxoInput.vaultBoxIdHex,
      fixture.utxoInput.vaultBoxIdHex,
    ])).rejects.toThrow(/distinct/);
    expect(() => assertErgoUtxoStateRuntimeWitnessCapturePortV1Provenance({}))
      .toThrow(/static adapter/);
    expect(() => assertErgoUtxoStateRuntimeWitnessNodeCaptureV1Provenance({}))
      .toThrow(/node-adapter provenance/);
  });
});

function targetHeader(fixture: ReturnType<
  typeof buildFrontierErgoUtxoRuntimeStatementV3Fixture
>): ErgoHeaderIdentityFields {
  const relay = decodeErgoAutolykosV2RelayRuntimeWitnessV1(
    fixture.relayWitnessBytes,
    fixture.expectedSpvProfileIdHex,
  );
  return replayErgoAutolykosV2RelayWitnessV1(relay).targetHeader;
}

function nodeHeader(header: ErgoHeaderIdentityFields): Record<string, unknown> {
  return {
    id: computeErgoHeaderId(header).toString('hex'),
    version: header.version,
    parentId: Buffer.from(header.parentId).toString('hex'),
    adProofsRoot: Buffer.from(header.adProofsRoot).toString('hex'),
    stateRoot: Buffer.from(header.stateRoot).toString('hex'),
    transactionsRoot: Buffer.from(header.transactionsRoot).toString('hex'),
    timestamp: Number(header.timestamp),
    nBits: header.nBits,
    height: header.height,
    extensionHash: Buffer.from(header.extensionHash).toString('hex'),
    votes: Buffer.from(header.votes).toString('hex'),
    powSolutions: {
      pk: Buffer.from(header.powSolution.publicKey).toString('hex'),
      n: Buffer.from(header.powSolution.nonce).toString('hex'),
      ...(header.version === 1
        ? {
          w: Buffer.from(header.powSolution.oneTimePublicKey!).toString('hex'),
          d: header.powSolution.distance!.toString(),
        }
        : {}),
    },
  };
}

function nodeResponse(
  value: unknown,
  headers: Record<string, string> = {},
  status = 200,
) {
  return {
    data: Buffer.from(JSON.stringify(value), 'utf8'),
    headers,
    status,
  };
}

function rawNodeResponse(source: string) {
  return {
    data: Buffer.from(source, 'utf8'),
    headers: {},
    status: 200,
  };
}
