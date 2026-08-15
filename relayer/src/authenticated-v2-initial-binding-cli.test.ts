import { describe, expect, it } from 'vitest';

import { AUTHENTICATED_V2_INITIAL_BINDING_INPUT_SCHEMA } from './authenticated-v2-initial-binding.js';
import {
  hydrateAuthenticatedV2InitialBindingRequest,
  parseAuthenticatedV2InitialBindingArgs,
} from './scripts/derive-authenticated-v2-initial-binding.js';

describe('authenticated V2 initial binding CLI boundary', () => {
  it('requires one sanitized input, one pinned checkout, and one new output', () => {
    expect(parseAuthenticatedV2InitialBindingArgs([
      '--input',
      'identities.json',
      '--ergo-source',
      '../.source-cache/ergo-node',
      '--out',
      'reports/initial-binding.json',
    ])).toEqual({
      input: 'identities.json',
      ergoSource: '../.source-cache/ergo-node',
      out: 'reports/initial-binding.json',
      help: false,
      errors: [],
    });
    expect(parseAuthenticatedV2InitialBindingArgs([]).errors).toEqual([
      '--input is required',
      '--ergo-source is required',
      '--out is required',
    ]);
    expect(parseAuthenticatedV2InitialBindingArgs([
      '--input', 'one.json', '--input', 'two.json', '--ergo-source', 'ergo', '--out', 'report.json',
    ]).errors).toContain('--input may be provided only once');
    expect(parseAuthenticatedV2InitialBindingArgs(['--unknown']).errors)
      .toContain('unknown option: --unknown');
  });

  it('accepts only the exact ID-only input schema', () => {
    const value = {
      schema: AUTHENTICATED_V2_INITIAL_BINDING_INPUT_SCHEMA,
      environment: 'patched-devnet',
      trackerFundingBoxId: '11'.repeat(32),
      dupVaultFundingBoxId: '22'.repeat(32),
    };
    expect(hydrateAuthenticatedV2InitialBindingRequest(value)).toEqual({
      environment: value.environment,
      trackerFundingBoxId: value.trackerFundingBoxId,
      dupVaultFundingBoxId: value.dupVaultFundingBoxId,
    });
    expect(() => hydrateAuthenticatedV2InitialBindingRequest({
      ...value,
      fundingBox: {},
    })).toThrow(/contain exactly/i);
    expect(() => hydrateAuthenticatedV2InitialBindingRequest({
      ...value,
      schema: 'e2s.other.v1',
    })).toThrow(/input schema/i);
  });
});
