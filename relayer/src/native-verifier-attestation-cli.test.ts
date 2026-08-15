import { describe, expect, it, vi } from 'vitest';

import {
  parseNativeVerifierAttestationArgs,
  runNativeVerifierAttestationCli,
} from './scripts/validate-independently-attested-native-verifier-profile.js';

describe('native verifier attestation CLI boundary', () => {
  it('requires exact profile and binary paths for verification', () => {
    expect(parseNativeVerifierAttestationArgs([
      '--profile', 'C:\\reviewed\\profile.json',
      '--verifier', 'C:\\reviewed\\verifier.exe',
      '--codec', 'C:\\reviewed\\codec.exe',
    ])).toEqual({
      describeReviewedLock: false,
      profilePath: 'C:\\reviewed\\profile.json',
      verifierPath: 'C:\\reviewed\\verifier.exe',
      codecPath: 'C:\\reviewed\\codec.exe',
      help: false,
      errors: [],
    });

    expect(parseNativeVerifierAttestationArgs([]).errors).toEqual([
      '--profile is required',
      '--verifier is required',
      '--codec is required',
    ]);
  });

  it('does not allow a runtime profile to supply its own attestor lock', () => {
    const parsed = parseNativeVerifierAttestationArgs([
      '--attestor-lock', 'C:\\unreviewed\\lock.json',
      '--profile', 'C:\\reviewed\\profile.json',
      '--verifier', 'C:\\reviewed\\verifier.exe',
      '--codec', 'C:\\reviewed\\codec.exe',
    ]);
    expect(parsed.errors).toContain('unknown option: --attestor-lock');
    expect(parsed).not.toHaveProperty('attestorLockPath');
  });

  it('describes the inert reviewed registry without promoting it to admission evidence', async () => {
    const output: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
      output.push(String(message));
    });
    try {
      await runNativeVerifierAttestationCli(['--describe-reviewed-lock']);
    } finally {
      log.mockRestore();
    }
    expect(output).toContain('Reviewed native verifier attestor lock: PASS');
    expect(output).toContain('Active attestor profiles: 0');
    expect(output.join('\n')).toMatch(/profile validation unavailable/i);
    expect(output.join('\n')).toMatch(/admission.*false|not admission/i);
  });

  it('does not combine lock-description mode with profile verification inputs', () => {
    expect(parseNativeVerifierAttestationArgs([
      '--describe-reviewed-lock',
      '--profile', 'C:\\reviewed\\profile.json',
    ]).errors).toContain('--describe-reviewed-lock cannot be combined with verification options');
  });
});
