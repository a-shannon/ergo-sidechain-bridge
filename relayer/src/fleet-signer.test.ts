import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  assertEip12CreationHeights,
  assertSignedTransactionIdMatchesExpected,
  deriveUnsignedTransactionId,
  interpretCheckResult,
  normalizeNodeOrigin,
  sanitizeSignerErrorText,
  selectLatestHeader,
} from './fleet-signer.js';
import { MINER_FEE_TREE } from './ergo-helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('selectLatestHeader', () => {
  it('selects header with max height from ascending order', () => {
    const headers = [
      { height: 100, id: 'a' },
      { height: 101, id: 'b' },
      { height: 102, id: 'c' },
    ];
    const result = selectLatestHeader(headers);
    expect(result.index).toBe(2);
    expect(result.header.height).toBe(102);
  });

  it('selects header with max height from descending order', () => {
    const headers = [
      { height: 102, id: 'c' },
      { height: 101, id: 'b' },
      { height: 100, id: 'a' },
    ];
    const result = selectLatestHeader(headers);
    expect(result.index).toBe(0);
    expect(result.header.height).toBe(102);
  });

  it('selects header with max height from shuffled order', () => {
    const headers = [
      { height: 101, id: 'b' },
      { height: 103, id: 'd' },
      { height: 100, id: 'a' },
      { height: 102, id: 'c' },
    ];
    const result = selectLatestHeader(headers);
    expect(result.index).toBe(1);
    expect(result.header.height).toBe(103);
  });

  it('works with a single header', () => {
    const headers = [{ height: 50, id: 'only' }];
    const result = selectLatestHeader(headers);
    expect(result.index).toBe(0);
    expect(result.header.height).toBe(50);
  });

  it('throws on empty array', () => {
    expect(() => selectLatestHeader([])).toThrow('empty headers array');
  });
});

describe('assertSignedTransactionIdMatchesExpected', () => {
  it('accepts matching signed and expected transaction IDs with optional 0x prefix', () => {
    const txId = 'a'.repeat(64);

    expect(() =>
      assertSignedTransactionIdMatchesExpected('Aggregate settlement V1', { id: txId }, `0x${txId.toUpperCase()}`),
    ).not.toThrow();
  });

  it('fails closed before broadcast when the signed transaction differs from approved evidence', () => {
    const signedTxId = 'a'.repeat(64);
    const expectedTxId = 'b'.repeat(64);

    expect(() =>
      assertSignedTransactionIdMatchesExpected('Aggregate settlement V1', { id: signedTxId }, expectedTxId),
    ).toThrow(
      `Aggregate settlement V1: signed transaction ID ${signedTxId} does not match approved expectedTxId ${expectedTxId}`,
    );
  });
});

describe('normalizeNodeOrigin', () => {
  it('removes a trailing slash before the origin is bound and used for transport', () => {
    expect(normalizeNodeOrigin('http://127.0.0.1:9052/'))
      .toBe('http://127.0.0.1:9052');
  });
});

describe('deriveUnsignedTransactionId', () => {
  it('derives a deterministic proof-independent ID without signer or node access', async () => {
    const tx = {
      inputs: [{
        boxId: '11'.repeat(32),
        extension: {},
        value: 2_100_000,
        ergoTree: MINER_FEE_TREE,
        assets: [],
        additionalRegisters: {},
        transactionId: '22'.repeat(32),
        index: 0,
        creationHeight: 100,
      }],
      dataInputs: [],
      outputs: [{
        value: 2_100_000,
        ergoTree: MINER_FEE_TREE,
        assets: [],
        additionalRegisters: {},
        creationHeight: 101,
      }],
    };

    const first = await deriveUnsignedTransactionId(tx);
    const second = await deriveUnsignedTransactionId(tx);
    const changed = await deriveUnsignedTransactionId({
      ...tx,
      outputs: [{ ...tx.outputs[0], value: 2_000_000 }],
    });

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
    expect(changed).not.toBe(first);
  });
});

describe('assertEip12CreationHeights', () => {
  const validBox = {
    boxId: 'box',
    value: 1n,
    ergoTree: '0008cd',
    assets: [],
    additionalRegisters: {},
    transactionId: 'tx',
    index: 0,
    creationHeight: 100,
  };

  it('accepts EIP-12 transactions with explicit creation heights on all boxes', () => {
    expect(() => assertEip12CreationHeights('Aggregate settlement V1', {
      inputs: [{ ...validBox, boxId: 'input' }],
      dataInputs: [{ ...validBox, boxId: 'data-input' }],
      outputs: [{ value: 1n, ergoTree: '0008cd', assets: [], additionalRegisters: {}, creationHeight: 101 }],
    })).not.toThrow();
  });

  it('fails closed when any input, data input, or output lacks creationHeight', () => {
    expect(() => assertEip12CreationHeights('Aggregate settlement V1', {
      inputs: [{ ...validBox, creationHeight: undefined }],
      dataInputs: [{ ...validBox }],
      outputs: [{ value: 1n, ergoTree: '0008cd', assets: [], additionalRegisters: {}, creationHeight: 101 }],
    })).toThrow('Aggregate settlement V1: inputs[0] must have a positive safe integer creationHeight');

    expect(() => assertEip12CreationHeights('Aggregate settlement V1', {
      inputs: [{ ...validBox }],
      dataInputs: [{ ...validBox, creationHeight: null }],
      outputs: [{ value: 1n, ergoTree: '0008cd', assets: [], additionalRegisters: {}, creationHeight: 101 }],
    })).toThrow('Aggregate settlement V1: dataInputs[0] must have a positive safe integer creationHeight');

    expect(() => assertEip12CreationHeights('Aggregate settlement V1', {
      inputs: [{ ...validBox }],
      dataInputs: [],
      outputs: [{ value: 1n, ergoTree: '0008cd', assets: [], additionalRegisters: {}, creationHeight: -1 }],
    })).toThrow('Aggregate settlement V1: outputs[0] must have a positive safe integer creationHeight');
  });

  it('rejects synthetic, unsafe, or non-numeric creation heights', () => {
    for (const creationHeight of [0, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, '100']) {
      expect(() => assertEip12CreationHeights('Aggregate settlement V1', {
        inputs: [{ ...validBox, creationHeight }],
        dataInputs: [],
        outputs: [{ value: 1n, ergoTree: '0008cd', assets: [], additionalRegisters: {}, creationHeight: 101 }],
      })).toThrow('Aggregate settlement V1: inputs[0] must have a positive safe integer creationHeight');
    }

    expect(() => assertEip12CreationHeights('Aggregate settlement V1', {
      inputs: [{ ...validBox }],
      dataInputs: [],
      outputs: [{ value: 1n, ergoTree: '0008cd', assets: [], additionalRegisters: {} }],
    })).toThrow('Aggregate settlement V1: outputs[0] must have a positive safe integer creationHeight');
  });
});

describe('interpretCheckResult', () => {
  it('returns the exact signed transaction id when the node echoes it', () => {
    const txId = 'ab'.repeat(32);
    const signed = { id: txId };

    expect(interpretCheckResult('test', signed, `0x${txId}`)).toEqual({
      txId,
      signedTx: signed,
      checkResult: `0x${txId}`,
    });
  });

  it('rejects a mismatched or non-ID /transactions/check response', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const signed = { id: 'ab'.repeat(32) };

    expect(interpretCheckResult('test', signed, 'cd'.repeat(32))).toBeNull();
    expect(interpretCheckResult('test', signed, { accepted: true })).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('does not match'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('non-transaction-ID'));
  });

  it('returns null when /transactions/check rejects the signed transaction', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(interpretCheckResult('test-label', { id: 'local-tx-id' }, null)).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('REJECTED by /transactions/check'));
  });
});

describe('sanitizeSignerErrorText', () => {
  it('redacts local Windows user paths from signer errors', () => {
    const raw = `Error at ${['C:', 'Users', 'alice', 'private', 'bridge', 'relayer', 'src', 'fleet-signer.ts:306:9'].join('\\')}`;
    expect(sanitizeSignerErrorText(raw)).toBe('Error at <local-path>');
  });

  it('redacts common signer secret fields from arbitrary error text', () => {
    const diagnosticDlogField = ['secrets', 'dlog'].join('.');
    const mnemonicField = 'mnemonic';
    const keyHexField = ['private', 'Key', 'Hex'].join('');
    const walletMnemonicField = ['WALLET', 'MNEMONIC'].join('_');
    const raw = [
      `${mnemonicField}=abandon abandon abandon`,
      `${keyHexField}=0123456789abcdef`,
      `${walletMnemonicField}:seed`,
      `${diagnosticDlogField}=deadbeef`,
    ].join(' ');

    const sanitized = sanitizeSignerErrorText(raw);
    expect(sanitized).toContain(`${mnemonicField}=<redacted>`);
    expect(sanitized).toContain(`${keyHexField}=<redacted>`);
    expect(sanitized).toContain(`${walletMnemonicField}=<redacted>`);
    expect(sanitized).toContain(`${diagnosticDlogField}=<redacted>`);
    expect(sanitized).not.toContain('0123456789abcdef');
    expect(sanitized).not.toContain('deadbeef');
  });
});
