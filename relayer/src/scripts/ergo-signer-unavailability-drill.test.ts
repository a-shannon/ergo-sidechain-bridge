import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ERGO_SIGNER_UNAVAILABILITY_DRILL_SCHEMA,
  runErgoSignerUnavailabilityDrill,
} from './ergo-signer-unavailability-drill.js';

describe('Ergo signer unavailability operator drill', () => {
  it('proves terminal no-fallback containment without external capabilities', async () => {
    const report = await runErgoSignerUnavailabilityDrill();

    expect(report).toEqual({
      schema: ERGO_SIGNER_UNAVAILABILITY_DRILL_SCHEMA,
      result: 'PASS',
      signerAvailability: 'unavailable',
      processHoldOpen: true,
      valueCycleCapabilityRetained: false,
      fundsExecutionAuthorityRetained: false,
      loaderAttempts: 1,
      containmentAttempts: 1,
      fallbackAttempted: false,
      nodeWalletSigningUsed: false,
      capabilities: {
        checking: false,
        signing: false,
        authorization: false,
        submission: false,
        broadcast: false,
        fundsAuthority: false,
      },
    });
    expect(Object.values(report.capabilities)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('has no configuration, key-material, network, persistence, or wallet fallback surface', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'src',
        'scripts',
        'ergo-signer-unavailability-drill.ts',
      ),
      'utf8',
    );

    expect(source).not.toMatch(
      /process\.env|fleet-signer|WALLET_MNEMONIC|privateKey|mnemonic/i,
    );
    expect(source).not.toMatch(
      /\b(?:fetch|axios|WebSocket|Database|StateTracker)\b/,
    );
    expect(source).not.toMatch(
      /wallet\/transaction\/sign|wallet\/transaction\/generateCommitments/,
    );
  });
});
