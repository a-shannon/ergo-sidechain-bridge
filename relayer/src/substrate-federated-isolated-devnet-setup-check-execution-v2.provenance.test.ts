import { describe, expect, it } from 'vitest';

import {
  assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2,
  assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1_SCHEMA,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';

describe('isolated tracker freshness execution provenance', () => {
  it('rejects structural forgeries and cross-phase receipt substitution', () => {
    const frozenForgery = Object.freeze({
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA,
      version: 2,
      status: 'PASS',
    });
    const freshnessForgery = Object.freeze({
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_RESERVATION_FRESHNESS_CHECK_V1_SCHEMA,
      version: 1,
      status: 'PASS',
      boundaries: Object.freeze({ durableReservationBound: false }),
    });

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
        freshnessForgery,
      )
    ).toThrow(/lacks exact runtime provenance/);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetTrackerReservationFreshnessCheckV1(
        frozenForgery,
      )
    ).toThrow(/lacks exact runtime provenance/);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetObservedAnchorTrackerCheckV2(
        freshnessForgery,
      )
    ).toThrow(/lacks exact runtime provenance/);
  });
});
