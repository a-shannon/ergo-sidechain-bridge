import { describe, expect, it, vi } from 'vitest';

import {
  runAuthenticatedSettlementCheckReservationCompatibility,
  type AuthenticatedSettlementCheckReservationCompatibilityDeps,
  type AuthenticatedSettlementCheckReservationCompatibilityInput,
} from './authenticated-settlement-check-reservation-compatibility.js';
import {
  SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_SELECTION,
} from './profiles/index.js';

function rejectingDeps() {
  const invoked = vi.fn();
  const fail = async () => {
    invoked();
    throw new Error('profile rejection must precede lifecycle capabilities');
  };
  return {
    invoked,
    deps: {
      state: {
        getAuthenticatedSettlementCandidate: vi.fn(() => {
          invoked();
          throw new Error('profile rejection must precede journal reads');
        }),
        markAuthenticatedSettlementCandidateCheckPassed: vi.fn(() => {
          invoked();
          throw new Error('profile rejection must precede journal writes');
        }),
        reserveAuthenticatedSettlementExecution: vi.fn(() => {
          invoked();
          throw new Error('profile rejection must precede reservations');
        }),
      },
      revalidate: fail,
      bindPackage: fail,
      sign: fail,
      check: fail,
      observeStableErgo: fail,
      observeStableSidechain: fail,
    } as unknown as AuthenticatedSettlementCheckReservationCompatibilityDeps,
  };
}

describe('authenticated settlement source-profile dispatch', () => {
  it.each([
    ['sourceProfileId', 'e2s.source-profile.unknown.v1', /source profile/],
    ['statementProfileId', 'e2s.statement-profile.unknown.v1', /statement profile/],
    ['proofSystemId', 99, /proof system/],
    ['proofSystemId', 2, /reserved bridge proof system/],
    ['settlementProfileId', 'e2s.settlement-profile.unknown.v1', /settlement profile/],
    ['assetProfileId', 'e2s.asset-profile.unknown.v1', /asset profile/],
  ] as const)(
    'rejects an unknown %s before any lifecycle capability',
    async (field, value, message) => {
      const { deps, invoked } = rejectingDeps();
      const input = {
        sourceProfileSelection: {
          ...SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_SELECTION,
          [field]: value,
        },
      } as unknown as AuthenticatedSettlementCheckReservationCompatibilityInput;

      await expect(
        runAuthenticatedSettlementCheckReservationCompatibility(input, deps),
      ).rejects.toThrow(message);
      expect(invoked).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed profile selection before any lifecycle capability', async () => {
    const { deps, invoked } = rejectingDeps();
    const input = {
      sourceProfileSelection: {
        ...SUBSTRATE_GRANDPA_V1_SOURCE_PROFILE_SELECTION,
        dynamicPlugin: 'fixture',
      },
    } as unknown as AuthenticatedSettlementCheckReservationCompatibilityInput;

    await expect(
      runAuthenticatedSettlementCheckReservationCompatibility(input, deps),
    ).rejects.toThrow(/selection fields are not exact/);
    expect(invoked).not.toHaveBeenCalled();
  });
});
