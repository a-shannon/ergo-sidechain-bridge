import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const signerMock = vi.hoisted(() => ({
  events: [] as string[],
  signedIds: [] as string[],
  failOnSignCall: 0,
  signCalls: 0,
  fleetDerivations: 0,
  rootDerivations: 0,
}));

const nodeMock = vi.hoisted(() => ({
  checkedIds: [] as string[],
  checkedByteDigests: [] as string[],
  headers: [] as Array<Record<string, unknown>>,
  ngetDirect: vi.fn(),
  ncheck: vi.fn(),
}));

const publicKeyBytes = Uint8Array.from([2, ...Array(32).fill(0x42)]);
const publicKeyHex = Buffer.from(publicKeyBytes).toString('hex');

vi.mock('@fleet-sdk/wallet', () => ({
  ErgoHDKey: {
    fromMnemonic: async () => {
      signerMock.fleetDerivations += 1;
      return ({
      deriveChild: () => ({
        address: { toString: () => 'synthetic-test-address' },
        publicKey: publicKeyBytes,
        privateKey: Uint8Array.from(Array(32).fill(0x24)),
      }),
      });
    },
  },
}));

vi.mock('@fleet-sdk/core', () => ({
  ErgoAddress: {
    fromBase58: () => ({ ergoTree: `0008cd${publicKeyHex}` }),
  },
}));

vi.mock('ergo-lib-wasm-nodejs', () => {
  class BlockHeaders {
    readonly values: unknown[];

    constructor(header: unknown) {
      this.values = [header];
    }

    add(header: unknown): void {
      this.values.push(header);
    }
  }

  class SecretKeys {
    add(): void {}
  }

  class ErgoStateContext {}

  return {
    default: {
      BlockHeader: { from_json: (source: string) => JSON.parse(source) },
      BlockHeaders,
      PreHeader: { from_block_header: (header: unknown) => header },
      Parameters: { default_parameters: () => ({}) },
      ErgoStateContext,
      Mnemonic: { to_seed: () => Uint8Array.from(Array(32).fill(0x31)) },
      ExtSecretKey: {
        derive_master: () => {
          signerMock.rootDerivations += 1;
          return {
            secret_key_bytes: () => Uint8Array.from(Array(32).fill(0x24)),
            public_key: () => ({
              pub_key_bytes: () => publicKeyBytes,
              free(): void {},
            }),
            free(): void {},
          };
        },
      },
      Address: {
        p2pk_from_pk_bytes: () => ({
          to_base58: () => 'synthetic-root-address',
          to_ergo_tree: () => ({
            sigma_serialize_bytes: () => Buffer.from(`0008cd${publicKeyHex}`, 'hex'),
            free(): void {},
          }),
          free(): void {},
        }),
      },
      SecretKey: { dlog_from_bytes: () => ({}) },
      SecretKeys,
      ErgoBoxes: {
        from_boxes_json: () => ({}),
        empty: () => ({ add(): void {} }),
      },
      UnsignedTransaction: { from_json: (source: string) => JSON.parse(source) },
      Transaction: {
        from_json: (source: string) => ({
          sigma_serialize_bytes: () => Buffer.from(source, 'utf8'),
          free(): void {},
        }),
      },
      Wallet: {
        from_secrets: () => ({
          sign_transaction: () => {
            signerMock.signCalls += 1;
            signerMock.events.push(`sign:${signerMock.signCalls}`);
            if (signerMock.signCalls === signerMock.failOnSignCall) {
              throw new Error('synthetic signing failure');
            }
            const id = signerMock.signedIds[signerMock.signCalls - 1];
            return { to_json: () => JSON.stringify({ id }) };
          },
        }),
      },
    },
  };
});

vi.mock('./ergo-helpers.js', () => ({
  NODE: 'http://127.0.0.1:9052',
  ngetDirect: nodeMock.ngetDirect,
  ncheck: nodeMock.ncheck,
}));

import {
  assertLocalWasmSignedCheckCandidateProvenance,
  checkSignedTransaction,
  prepareLocalWasmCheckSigner,
  prepareLocalWasmRootCheckCandidates,
  prepareLocalWasmRootCheckSigner,
  signTransactionForCheck,
} from './fleet-signer.js';

const firstTxId = 'aa'.repeat(32);
const secondTxId = 'bb'.repeat(32);

function headers(): Array<Record<string, unknown>> {
  const idAt = (height: number) => height.toString(16).padStart(64, '0');
  return Array.from({ length: 10 }, (_, index) => {
    const height = 100 - index;
    return {
      id: idAt(height),
      parentId: idAt(height - 1),
      height,
      version: 3,
      timestamp: 1_700_000_000_000 + height,
      nBits: 16_842_752,
      votes: '000000',
      powSolutions: {
        pk: `02${'11'.repeat(32)}`,
        w: `02${'22'.repeat(32)}`,
        n: '0000000000000000',
        d: '1',
      },
    };
  });
}

function candidate(role: string, expectedTxId: string, index: number) {
  return {
    role,
    expectedTxId,
    eip12Tx: {
      inputs: [{
        boxId: `${index}`.padStart(64, '0'),
        extension: {},
        value: '3000000',
        ergoTree: `0008cd${publicKeyHex}`,
        assets: [],
        additionalRegisters: {},
        transactionId: `${index + 10}`.padStart(64, '0'),
        index: 0,
        creationHeight: 90,
      }],
      dataInputs: [],
      outputs: [{
        value: '1900000',
        ergoTree: `0008cd${publicKeyHex}`,
        assets: [],
        additionalRegisters: {},
        creationHeight: 100,
      }],
    },
  };
}

beforeEach(() => {
  signerMock.events.length = 0;
  signerMock.signedIds = [firstTxId, secondTxId];
  signerMock.failOnSignCall = 0;
  signerMock.signCalls = 0;
  signerMock.fleetDerivations = 0;
  signerMock.rootDerivations = 0;
  nodeMock.checkedIds.length = 0;
  nodeMock.checkedByteDigests.length = 0;
  nodeMock.headers = headers();
  nodeMock.ngetDirect.mockReset();
  nodeMock.ngetDirect.mockImplementation(async (path: string) => {
    if (path !== '/blocks/lastHeaders/10') {
      throw new Error(`unexpected node GET ${path}`);
    }
    return nodeMock.headers;
  });
  nodeMock.ncheck.mockReset();
  nodeMock.ncheck.mockImplementation(async (
    path: string,
    signed: { id: string },
  ) => {
    if (path !== '/transactions/check') {
      throw new Error(`unexpected node check ${path}`);
    }
    nodeMock.checkedIds.push(signed.id);
    nodeMock.checkedByteDigests.push(
      createHash('sha256')
        .update(JSON.stringify(signed), 'utf8')
        .digest('hex'),
    );
    return signed.id;
  });
  process.env.WALLET_MNEMONIC = 'synthetic test signer input';
  process.env.ERGO_NETWORK_PREFIX = '16';
});

describe('prepared local WASM check signer', () => {
  it('signs every candidate before exposing either signed transaction to the check transport', async () => {
    const signer = await prepareLocalWasmCheckSigner({
      mnemonic: 'synthetic test signer input',
      networkPrefix: 16,
      headers: headers(),
    });
    const accepted = await signer.checkTransactions([
      candidate('tracker-setup', firstTxId, 1),
      candidate('duplicate-prevention-vault-setup', secondTxId, 2),
    ], async signed => {
      const id = String((signed as { id: string }).id);
      signerMock.events.push(`check:${id}`);
      return id;
    });

    expect(signerMock.events).toEqual([
      'sign:1',
      'sign:2',
      `check:${firstTxId}`,
      `check:${secondTxId}`,
    ]);
    expect(accepted.map(result => result.nodeTxId)).toEqual([firstTxId, secondTxId]);
    expect(JSON.stringify(accepted)).not.toMatch(/"(?:signedTx|signedTransaction|privateKey|mnemonic)"/i);
  });

  it('performs no node check when the second candidate cannot be signed', async () => {
    signerMock.failOnSignCall = 2;
    const signer = await prepareLocalWasmCheckSigner({
      mnemonic: 'synthetic test signer input',
      networkPrefix: 16,
      headers: headers(),
    });
    const checkNode = vi.fn(async () => firstTxId);

    await expect(signer.checkTransactions([
      candidate('tracker-setup', firstTxId, 1),
      candidate('duplicate-prevention-vault-setup', secondTxId, 2),
    ], checkNode)).rejects.toThrow(/local WASM signing failed/i);
    expect(signerMock.events).toEqual(['sign:1', 'sign:2']);
    expect(checkNode).not.toHaveBeenCalled();
  });

  it('derives the explicit root secret without changing the child-0 default', async () => {
    const rootSigner = await prepareLocalWasmRootCheckSigner({
      mnemonic: 'synthetic root signer input',
      networkPrefix: 16,
      headers: headers(),
    });

    expect(rootSigner).toMatchObject({
      pubKeyHex: publicKeyHex,
      ergoTreeHex: `0008cd${publicKeyHex}`,
    });
    expect(signerMock.rootDerivations).toBe(1);
    expect(signerMock.fleetDerivations).toBe(0);

    await prepareLocalWasmCheckSigner({
      mnemonic: 'synthetic child signer input',
      networkPrefix: 16,
      headers: headers(),
    });
    expect(signerMock.fleetDerivations).toBe(1);
  });

  it('root-signs a complete opaque batch before the checker sees signed bytes', async () => {
    const batch = await prepareLocalWasmRootCheckCandidates({
      mnemonic: 'synthetic root batch input',
      networkPrefix: 16,
      headers: headers(),
      nodeOrigin: 'http://127.0.0.1:9052',
      candidates: [
        candidate('tracker-setup', firstTxId, 1),
        candidate('duplicate-prevention-setup', secondTxId, 2),
      ],
    });

    expect(signerMock.events).toEqual(['sign:1', 'sign:2']);
    expect(batch).toMatchObject({
      derivation: 'wasm-root',
      pubKeyHex: publicKeyHex,
      candidates: [
        { role: 'tracker-setup', expectedTxId: firstTxId },
        { role: 'duplicate-prevention-setup', expectedTxId: secondTxId },
      ],
    });
    expect(JSON.stringify(batch)).not.toMatch(/signedTx|proofs|inputs|mnemonic|privateKey/i);
    for (const prepared of batch.candidates) {
      expect(() => assertLocalWasmSignedCheckCandidateProvenance(
        prepared.signedCandidate,
      )).not.toThrow();
      const checked = await checkSignedTransaction(
        prepared.signedCandidate,
        prepared.role,
        'http://127.0.0.1:9052',
      );
      expect(checked?.txId).toBe(prepared.expectedTxId);
      expect(checked?.signedTransactionDigestHex)
        .toBe(prepared.signedCandidate.signedTransactionDigestHex);
      expect(checked?.signedTransactionBytesSha256Hex)
        .toBe(prepared.signedCandidate.signedTransactionBytesSha256Hex);
      expect(checked?.signedTransactionBytesLength)
        .toBe(prepared.signedCandidate.signedTransactionBytesLength);
      expect(prepared.signedCandidate.signedTransactionBytesLength)
        .toBeGreaterThan(0);
    }
    expect(nodeMock.checkedIds).toEqual([firstTxId, secondTxId]);
    expect(nodeMock.checkedByteDigests).toEqual(
      batch.candidates.map(candidate =>
        candidate.signedCandidate.signedTransactionBytesSha256Hex),
    );
    expect(signerMock.rootDerivations).toBe(1);
    expect(signerMock.fleetDerivations).toBe(0);
  });
});

describe('separate authenticated check signer and checker capabilities', () => {
  it('retains one process-bound signed candidate until the checker consumes it', async () => {
    const input = candidate('authenticated-settlement', firstTxId, 1);
    const signed = await signTransactionForCheck(
      input.eip12Tx,
      'Authenticated settlement',
      firstTxId,
      'http://127.0.0.1:9052/',
    );

    expect(signed).not.toBeNull();
    expect(nodeMock.ncheck).not.toHaveBeenCalled();
    expect(() => assertLocalWasmSignedCheckCandidateProvenance(signed))
      .not.toThrow();

    const checked = await checkSignedTransaction(
      signed!,
      'Authenticated settlement',
      'http://127.0.0.1:9052',
    );

    expect(checked?.txId).toBe(firstTxId);
    expect(checked?.signedTransactionDigestHex)
      .toBe(signed!.signedTransactionDigestHex);
    expect(checked?.signerContext).toBe(signed!.signerContext);
    expect(checked?.checkerIdentity.nodeOrigin).toBe('http://127.0.0.1:9052');
    expect(JSON.stringify(signed)).not.toMatch(/signedTx|proofs|inputs/);
    expect(nodeMock.checkedIds).toEqual([firstTxId]);
  });

  it('keeps signed bytes opaque and immutable before the checker capability runs', async () => {
    const input = candidate('authenticated-settlement', firstTxId, 1);
    const signed = await signTransactionForCheck(
      input.eip12Tx,
      'Authenticated settlement',
      firstTxId,
      'http://127.0.0.1:9052',
    );
    expect(signed).not.toBeNull();

    expect(() => {
      (signed as any).signedTx = {
        id: firstTxId,
        proofs: ['mutated-bearer-proof'],
      };
    }).toThrow();
    expect(nodeMock.ncheck).not.toHaveBeenCalled();
    expect(() => assertLocalWasmSignedCheckCandidateProvenance(signed))
      .not.toThrow();
  });

  it('rejects cloned provenance and a checker origin different from the signing context', async () => {
    const input = candidate('authenticated-settlement', firstTxId, 1);
    const signed = await signTransactionForCheck(
      input.eip12Tx,
      'Authenticated settlement',
      firstTxId,
      'http://127.0.0.1:9052',
    );
    expect(signed).not.toBeNull();
    expect(() => assertLocalWasmSignedCheckCandidateProvenance({
      ...signed!,
    })).toThrow(/provenance is missing/);

    const checked = await checkSignedTransaction(
      signed!,
      'Authenticated settlement',
      'http://127.0.0.1:9053',
    );
    expect(checked).toBeNull();
    expect(nodeMock.ncheck).not.toHaveBeenCalled();
  });

  it('does not expose a signed candidate when signing fails', async () => {
    signerMock.failOnSignCall = 1;
    const input = candidate('authenticated-settlement', firstTxId, 1);

    const signed = await signTransactionForCheck(
      input.eip12Tx,
      'Authenticated settlement',
      firstTxId,
      'http://127.0.0.1:9052',
    );

    expect(signed).toBeNull();
    expect(nodeMock.ncheck).not.toHaveBeenCalled();
  });
});
