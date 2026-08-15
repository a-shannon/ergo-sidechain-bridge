/**
 * Whole-profile SHA-256 digests admitted by the daemon environment loader.
 *
 * A deployment profile becomes eligible for authority binding only through a
 * reviewed source change to this registry. It still requires the separately
 * branded, source-refreshed execution authority; runtime JSON cannot approve
 * its own trust roots, authority identity/policy/epoch bindings, executable
 * pins, or direct-process fallback.
 */
export const REVIEWED_NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_SHA256_HEXES:
readonly string[] = Object.freeze([
  // Inert cross-platform conformance profile: localhost discard port and
  // nonexistent pinned executables. No live deployment profile is approved.
  '0x6f26a5329d9d09f517c450528a24c07573f9f44dfe3caaa7574809ddba853098',
]);

/**
 * Exact reviewed native profiles allowed to support authenticated-V2 replay
 * import into a V4 cutover candidate.
 *
 * This is intentionally empty until a non-inert, non-mainnet profile and its
 * deployment lineage have received a source review for this specific use.
 */
export const
REVIEWED_AUTHENTICATED_V2_REPLAY_IMPORT_PROFILE_SHA256_HEXES:
readonly string[] = Object.freeze([]);
