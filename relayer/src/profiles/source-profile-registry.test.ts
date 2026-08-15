import { describe, expect, it } from 'vitest';

import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
} from './substrate-grandpa-v1/asset-profile.js';
import {
  AGGREGATE_FINALITY_PROOF_SYSTEM_ACTIVATED_STARK_RESERVED,
  AGGREGATE_FINALITY_PROOF_SYSTEM_NATIVE_GRANDPA,
  BRIDGE_FINALITY_STATEMENT_V1_DOMAIN,
  BRIDGE_FINALITY_STATEMENT_VERSION,
} from './substrate-grandpa-v1/bridge-finality-proof.js';
import {
  selectBridgeSourceProfile,
  SUBSTRATE_GRANDPA_V1_SETTLEMENT_PROFILE_ID,
  SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE,
  SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_ID,
  SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_SELECTION,
  SUBSTRATE_GRANDPA_V1_STATEMENT_PROFILE_ID,
} from './index.js';

function exactSelection() {
  return { ...SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_SELECTION };
}

describe('static bridge source-profile registry', () => {
  it('selects the exact frozen V1 compatibility semantics off wire', () => {
    const profile = selectBridgeSourceProfile(exactSelection());

    expect(profile).toBe(SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(profile).toEqual({
      ...exactSelection(),
      sourceExecution: 'substrate-frontier',
      sourceFinality: 'grandpa',
      statementVersion: BRIDGE_FINALITY_STATEMENT_VERSION,
      statementDomain: BRIDGE_FINALITY_STATEMENT_V1_DOMAIN,
      assetProfile: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
    });
  });

  it.each([
    ['sourceProfileId', 'e2s.source-profile.unknown.v1', /source profile/],
    ['statementProfileId', 'e2s.statement-profile.unknown.v1', /statement profile/],
    ['proofSystemId', 99, /proof system/],
    ['settlementProfileId', 'e2s.settlement-profile.unknown.v1', /settlement profile/],
    ['assetProfileId', 'e2s.asset-profile.unknown.v1', /asset profile/],
  ] as const)(
    'rejects an unknown %s before returning any profile',
    (field, value, message) => {
      expect(() =>
        selectBridgeSourceProfile({
          ...exactSelection(),
          [field]: value,
        })
      ).toThrow(message);
    },
  );

  it('keeps the reserved STARK proof-system identifier fail closed', () => {
    expect(() =>
      selectBridgeSourceProfile({
        ...exactSelection(),
        proofSystemId:
          AGGREGATE_FINALITY_PROOF_SYSTEM_ACTIVATED_STARK_RESERVED,
      })
    ).toThrow('reserved bridge proof system is not activated');
  });

  it('rejects malformed, missing, and additional selection fields', () => {
    expect(() => selectBridgeSourceProfile(null)).toThrow(
      'selection must be an object',
    );
    const { assetProfileId: _omitted, ...missing } = exactSelection();
    expect(() => selectBridgeSourceProfile(missing)).toThrow(
      'selection fields are not exact',
    );
    expect(() =>
      selectBridgeSourceProfile({
        ...exactSelection(),
        dynamicPlugin: 'fixture',
      })
    ).toThrow('selection fields are not exact');
    expect(() =>
      selectBridgeSourceProfile({
        ...exactSelection(),
        proofSystemId: 1.5,
      })
    ).toThrow('selection fields are invalid');
  });
});
