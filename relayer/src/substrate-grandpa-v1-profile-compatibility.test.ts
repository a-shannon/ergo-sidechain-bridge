import { describe, expect, it } from 'vitest';

import * as legacyAvl from './avl-bridge.js';
import * as legacyBuilder from './aggregate-settlement-builder.js';
import * as legacyEncoding from './ergo-encoding.js';
import * as legacyLimits from './aggregate-settlement-limits.js';
import * as legacyPegInCommitment from './peg-in-commitment.js';
import * as legacyPegInRuntimeState from './peg-in-runtime-state.js';
import * as legacySettlementTx from './aggregate-settlement-tx.js';
import * as legacyCheckpoint from './bridge-checkpoint-commitment.js';
import * as legacyCommitment from './bridge-finality-commitment.js';
import * as legacyProof from './bridge-finality-proof.js';
import { MAX_NATIVE_VERIFIER_REQUEST_BYTES as infrastructureRequestLimit } from './native-verifier-limits.js';
import * as legacyTracker from './spv-tracker-authenticated.js';
import * as legacyBurn from './trustless-burn-proof.js';
import * as profileAsset from './profiles/substrate-grandpa-v1/asset-profile.js';
import * as profileCandidate from './profiles/substrate-grandpa-v1/authenticated-settlement-candidate.js';
import * as profilePlan from './profiles/substrate-grandpa-v1/authenticated-settlement-plan.js';
import * as profileSettlementTx from './profiles/substrate-grandpa-v1/authenticated-settlement-transaction.js';
import * as profileCheckpoint from './profiles/substrate-grandpa-v1/bridge-checkpoint-commitment.js';
import * as profileCommitment from './profiles/substrate-grandpa-v1/bridge-finality-commitment.js';
import * as profileDup from './profiles/substrate-grandpa-v1/duplicate-prevention.js';
import * as profilePolicy from './profiles/substrate-grandpa-v1/ergo-settlement-policy.js';
import * as profileProof from './profiles/substrate-grandpa-v1/bridge-finality-proof.js';
import * as profile from './profiles/substrate-grandpa-v1/index.js';
import * as profileLimits from './profiles/substrate-grandpa-v1/settlement-limits.js';
import * as profilePegInCommitment from './profiles/substrate-grandpa-v1/peg-in-commitment.js';
import * as profilePegInCommittedVault from './profiles/substrate-grandpa-v1/peg-in-committed-vault.js';
import * as profilePegInMintIdentity from './profiles/substrate-grandpa-v1/peg-in-mint-identity.js';
import * as profilePegInRuntimeState from './profiles/substrate-grandpa-v1/peg-in-runtime-state.js';
import * as profileTracker from './profiles/substrate-grandpa-v1/spv-tracker-authenticated.js';
import * as profileBurn from './profiles/substrate-grandpa-v1/trustless-burn-proof.js';

function expectExactReExport(
  legacy: object,
  implementation: object,
): void {
  const legacyExports = legacy as Record<string, unknown>;
  const implementationExports = implementation as Record<string, unknown>;
  expect(Object.keys(legacyExports).sort()).toEqual(Object.keys(implementationExports).sort());
  for (const [name, value] of Object.entries(implementationExports)) {
    expect(legacyExports[name]).toBe(value);
  }
}

describe('Substrate/GRANDPA V1 profile compatibility boundary', () => {
  it('preserves every legacy runtime export as the exact profile binding', () => {
    expectExactReExport(legacyBurn, profileBurn);
    expectExactReExport(legacyCheckpoint, profileCheckpoint);
    expectExactReExport(legacyProof, profileProof);
    expectExactReExport(legacyCommitment, profileCommitment);
    expectExactReExport(legacyTracker, profileTracker);
    expectExactReExport(legacyPegInCommitment, profilePegInCommitment);
    expectExactReExport(legacyPegInRuntimeState, profilePegInRuntimeState);
    expect(legacyAvl.getDupTreeDigest).toBe(profileDup.getDupTreeDigest);
    expect(legacyAvl.insertLockRecord).toBe(profileDup.insertLockRecord);
    expect(legacyBuilder.buildAuthenticatedSettlementPlan)
      .toBe(profilePlan.buildAuthenticatedSettlementPlan);
    expect(legacyBuilder.buildTrustlessSingleLeafAggregateUnlockExtension)
      .toBe(profilePlan.buildTrustlessSingleLeafAggregateUnlockExtension);
    expect(legacySettlementTx.buildAuthenticatedSettlementTx)
      .toBe(profileSettlementTx.buildAuthenticatedSettlementTx);
    for (const [name, value] of Object.entries(profilePolicy)) {
      expect((legacyEncoding as Record<string, unknown>)[name]).toBe(value);
    }
    for (const [name, value] of Object.entries(profileLimits)) {
      expect((legacyLimits as Record<string, unknown>)[name]).toBe(value);
    }
  });

  it('exposes the cohesive pure family through the static profile entry point', () => {
    const profileExports = profile as Record<string, unknown>;
    for (const module of [
      profileBurn,
      profileCheckpoint,
      profileProof,
      profileCommitment,
      profileTracker,
      profileDup,
      profilePolicy,
      profileLimits,
      profileAsset,
      profilePegInCommitment,
      profilePegInCommittedVault,
      profilePegInMintIdentity,
      profilePegInRuntimeState,
      profilePlan,
      profileSettlementTx,
      profileCandidate,
    ]) {
      for (const [name, value] of Object.entries(module)) {
        expect(profileExports[name]).toBe(value);
      }
    }
  });

  it('keeps the frozen V1 proof ceiling equal to the shared native request bound', () => {
    expect(profileProof.MAX_NATIVE_VERIFIER_REQUEST_BYTES)
      .toBe(infrastructureRequestLimit);
  });
});
