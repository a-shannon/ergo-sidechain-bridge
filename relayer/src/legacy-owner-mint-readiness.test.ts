import { describe, expect, it } from 'vitest';

import { hasFailure } from './batch-demo-preflight.js';
import {
  classifyLegacyOwnerMintDeploymentMetadata,
  classifyLegacyOwnerMintRuntimeCode,
} from './legacy-owner-mint-readiness.js';

describe('legacy owner-mint readiness quarantine', () => {
  it.each([
    undefined,
    {},
    { sergAddress: '0xserg' },
    { bridgeAddress: '0xbridge' },
    { sergAddress: '0xserg', bridgeAddress: '0xbridge' },
  ])('never treats historical deployment metadata as ready: %j', solidity => {
    const check = classifyLegacyOwnerMintDeploymentMetadata(solidity);

    expect(check.status).toBe('FAIL');
    expect(check.message).toMatch(/legacy|historical|reviewed activated profile/i);
  });

  it.each(['0x', '', undefined])(
    'fails closed when historical runtime code is absent: %s',
    code => {
      expect(classifyLegacyOwnerMintRuntimeCode({
        label: 'ErgoBridge contract',
        address: '0xbridge',
        code,
      })).toMatchObject({ status: 'FAIL' });
    },
  );

  it('rejects observed historical runtime code rather than calling it ready', () => {
    const check = classifyLegacyOwnerMintRuntimeCode({
      label: 'ErgoBridge contract',
      address: '0x1234567890123456789012345678901234567890',
      code: '0x6001600055',
    });

    expect(check.status).toBe('FAIL');
    expect(check.message).toContain('historical owner-mint code observed');
  });

  it('keeps a complete historical deployment and matching code at exit 1', () => {
    const checks = [
      classifyLegacyOwnerMintDeploymentMetadata({
        sergAddress: '0xserg',
        bridgeAddress: '0xbridge',
      }),
      classifyLegacyOwnerMintRuntimeCode({
        label: 'SERG contract',
        address: '0xserg',
        code: '0x6001600055',
      }),
      classifyLegacyOwnerMintRuntimeCode({
        label: 'ErgoBridge contract',
        address: '0xbridge',
        code: '0x6002600055',
      }),
    ];

    expect(hasFailure(checks)).toBe(true);
    expect(hasFailure(checks) ? 1 : 0).toBe(1);
  });
});
