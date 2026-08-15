import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('axios', () => ({
  default: axiosMock,
}));

import { ncheck, nget, ngetDirect } from './ergo-helpers.js';

const DISTANCE = '1234567890123456789012345678901234567890';
const RAW_HEADERS = `[{"height":100,"powSolutions":{"d":${DISTANCE}}}]`;

beforeEach(() => {
  axiosMock.get.mockReset();
  axiosMock.post.mockReset();
});

describe('exact Ergo node header JSON transport', () => {
  it.each([
    ['authenticated node GET', nget],
    ['direct node GET', ngetDirect],
  ])('preserves lexical PoW distance for %s', async (_label, request) => {
    axiosMock.get.mockImplementation(async (_url, options) => {
      expect(options).toMatchObject({ responseType: 'text' });
      expect(options.transformResponse).toHaveLength(1);
      expect(options.transformResponse[0](RAW_HEADERS)).toBe(RAW_HEADERS);
      return { data: RAW_HEADERS };
    });

    const headers = await request('/blocks/lastHeaders/11') as Array<{
      powSolutions: { d: string };
    }>;

    expect(headers[0].powSolutions.d).toBe(DISTANCE);
  });

  it('leaves ordinary node JSON responses on the normal Axios path', async () => {
    const info = { fullHeight: 100 };
    axiosMock.get.mockResolvedValue({ data: info });

    await expect(nget('/info')).resolves.toBe(info);
    expect(axiosMock.get.mock.calls[0][1]).not.toHaveProperty('responseType');
    expect(axiosMock.get.mock.calls[0][1]).not.toHaveProperty('transformResponse');
  });

  it('fails closed if a header response was parsed before the exact decoder', async () => {
    axiosMock.get.mockResolvedValue({
      data: [{ height: 100, powSolutions: { d: Number(DISTANCE) } }],
    });

    await expect(ngetDirect('/blocks/lastHeaders/11')).resolves.toBeNull();
  });

  it('uses the supplied canonical origin for both signer-context and checker requests', async () => {
    const canonicalOrigin = new URL('http://127.0.0.1:9052/').origin;
    axiosMock.get.mockResolvedValue({ data: RAW_HEADERS });
    axiosMock.post.mockResolvedValue({ data: 'ab'.repeat(32) });

    await ngetDirect('/blocks/lastHeaders/10', canonicalOrigin);
    await ncheck('/transactions/check', { id: 'ab'.repeat(32) }, canonicalOrigin);

    expect(axiosMock.get.mock.calls[0][0])
      .toBe('http://127.0.0.1:9052/blocks/lastHeaders/10');
    expect(axiosMock.post.mock.calls[0][0])
      .toBe('http://127.0.0.1:9052/transactions/check');
  });

  it('redacts a checker response body when signed material is in scope', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    axiosMock.post.mockRejectedValue({
      response: {
        status: 400,
        data: { detail: 'synthetic echoed signed transaction proof bytes' },
      },
    });

    await expect(ncheck(
      '/transactions/check',
      { id: 'ab'.repeat(32) },
      'http://127.0.0.1:9052',
      { redactResponseBodyOnError: true },
    )).resolves.toBeNull();

    expect(errorSpy).toHaveBeenCalledWith(
      '  [node] ERROR CHECK /transactions/check (HTTP 400): <redacted>',
    );
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('proof bytes');
    errorSpy.mockRestore();
  });
});
