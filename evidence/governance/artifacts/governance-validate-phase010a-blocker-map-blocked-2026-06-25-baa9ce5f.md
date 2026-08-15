# Governance Validate Phase 010a Blocker Map - 2026-06-25 - baa9ce5f

This report records the current validator result for the structured Phase 010a
committee governance blocker map after the current Gate 7 benchmark blocker
baseline was recorded.

It is not completed Gate 6 committee governance evidence. It does not support
governance-ready, testnet production-candidate, mainnet, production-ready, or
completed key-rotation claims.

## Command Result

| Field | Value |
|---|---|
| Command | `npm run governance:validate -- ../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-25-3e1a6811.md` |
| Working directory | `ergo-sidechain-bridge/relayer` |
| Validated target | `../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-25-3e1a6811.md` |
| Validator commit | baa9ce5f |
| Result | BLOCKED |
| Exit code | 1 |
| Structural issues | 45 |
| Stack trace emitted | no |
| Local path emitted | no |

## Exact Remaining Validator Issues

| Issue | Evidence prerequisite |
|---|---|
| Scope: SideChainState successor authorization: status must be linked before committee governance evidence can pass | Completed row-specific governance scope evidence for SideChainState successor authorization. |
| Scope: DUP authorization: status must be linked before committee governance evidence can pass | Completed row-specific governance scope evidence for DUP authorization. |
| Scope: Aggregate DUP authorization: status must be linked before committee governance evidence can pass | Completed row-specific governance scope evidence for Aggregate DUP authorization. |
| Scope: Batch DUP authorization: status must be linked before committee governance evidence can pass | Completed row-specific governance scope evidence for Batch DUP authorization. |
| Scope: MainChainLock normal path: status must be linked before committee governance evidence can pass | Completed row-specific governance scope evidence for the MainChainLock normal path. |
| Scope: MainChainLock emergency escape path: status must be linked before committee governance evidence can pass | Completed emergency-escape continuity evidence proving the timeout path is not committee-gated. |
| Scope: SPVTracker ingest authorization: status must be linked before committee governance evidence can pass | Completed row-specific governance scope evidence for SPVTracker ingest authorization. |
| Scope: MCU Phase 2 path: status must be linked before committee governance evidence can pass | Completed continuity evidence proving MCU Phase 2 remains unchanged until Phase 011. |
| Required Commands: npm run contracts:check: status must be linked before committee governance evidence can pass | Command-specific completed governance command output evidence for `npm run contracts:check`. |
| Required Commands: npm run demo:readiness: status must be linked before committee governance evidence can pass | Command-specific completed governance command output evidence for `npm run demo:readiness`. |
| Required Commands: npm run status: status must be linked before committee governance evidence can pass | Command-specific completed governance command output evidence for `npm run status`. |
| Required Commands: spike010a-committee-guard-eval.ts: status must be linked before committee governance evidence can pass | Completed non-broadcast Phase 010a guard-evaluation output. |
| Rotation Plan: Identify old committee public keys: status must be linked before committee governance evidence can pass | Completed old-authority public key or hash evidence. |
| Rotation Plan: Identify old committee public keys: required evidence must include at least one concrete public key/hash identifier | At least one concrete old-authority public key or hash identifier. |
| Rotation Plan: Identify new committee public keys: status must be linked before committee governance evidence can pass | Completed new-committee public key or hash evidence. |
| Rotation Plan: Identify new committee public keys: required evidence must include at least 3 concrete public key/hash identifiers matching Committee member count | Three concrete new-committee public key or hash identifiers. |
| Rotation Plan: Validate threshold policy: status must be linked before committee governance evidence can pass | Completed 2-of-3 threshold policy evidence with quorum and lost-key rationale. |
| Rotation Plan: Simulate member loss or lost-key tolerance: status must be linked before committee governance evidence can pass | Completed member-loss or lost-key tolerance drill evidence. |
| Rotation Plan: Compile affected contracts: status must be linked before committee governance evidence can pass | Completed contract compilation evidence for the affected governance surfaces. |
| Rotation Plan: Evaluate old and new signer behavior: status must be linked before committee governance evidence can pass | Completed positive and negative old/new signer behavior evidence. |
| Rotation Plan: Preserve singleton continuity: status must be linked before committee governance evidence can pass | Completed singleton NFT, script, value, and register continuity evidence. |
| Rotation Plan: Reconcile deployment state: status must be linked before committee governance evidence can pass | Completed migration reconciliation evidence that is safe for publication. |
| Rotation Plan: Verify rollback plan: status must be linked before committee governance evidence can pass | Completed rollback and previous-authority recovery evidence. |
| Positive Checks: New committee executes signer-gated mutation after rotation: status must be linked before committee governance evidence can pass | Completed positive new-committee signer-gated mutation evidence. |
| Positive Checks: Threshold member-loss tolerance still executes signer-gated mutation: status must be linked before committee governance evidence can pass | Completed positive member-loss threshold execution evidence. |
| Negative Checks: Old single signer attempts signer-gated mutation after rotation: status must be linked before committee governance evidence can pass | Completed old-signer rejection evidence with rejected signer identifier. |
| Negative Checks: Non-committee signer attempts signer-gated mutation: status must be linked before committee governance evidence can pass | Completed non-committee signer rejection evidence with rejected signer identifier. |
| Negative Checks: Committee threshold below policy: status must be linked before committee governance evidence can pass | Completed below-policy threshold rejection evidence. |
| Negative Checks: MCU references stale SCS NFT after SCS redeploy: status must be linked before committee governance evidence can pass | Completed stale SCS NFT negative evidence. |
| Negative Checks: MCL emergency escape path is accidentally committee-gated: status must be linked before committee governance evidence can pass | Completed evidence proving accidental emergency escape committee-gating is blocked. |
| Negative Checks: Broadcast is enabled before readiness review: status must be linked before committee governance evidence can pass | Completed no-broadcast readiness-review negative evidence. |
| Negative Checks: Deployment state points to the wrong network: status must be linked before committee governance evidence can pass | Completed wrong-network deployment-state negative evidence safe for publication. |
| Publication Rules: Release supported must not be none before committee governance evidence can pass | Release support can only advance after all Gate 6 evidence rows are complete. |
| Publication Rules: Governance-ready claim allowed must be yes before committee governance evidence can pass | Governance-ready claim handling can only be allowed after blocker closure. |
| Publication Rules: Open governance blockers must be 0 before committee governance evidence can pass | Gate 6 publication decision can only close after all governance blockers are evidenced. |
| Publication Rules: Release notes updated must be yes before committee governance evidence can pass | Completed Gate 6 governance release-note update evidence. |
| Publication Rules: Reviewer decision summary must use exact Governance-ready claim allowed = yes | Reviewer summary must use the exact governance-ready binding only after blocker closure. |
| Publication Rules: Reviewer decision summary must use exact Open governance blockers = 0 | Reviewer summary must use the exact open-blocker binding only after blocker closure. |
| Publication Rules: Reviewer decision summary: open governance blockers must be 0 | Reviewer summary must not imply closure while blockers remain open. |
| Publication Rules: Required release-note updates must include a link, command, or artifact marker | Required release-note update evidence must cite a concrete completed artifact target. |
| Publication Rules: Required checklist updates must include a link, command, or artifact marker | Required checklist update evidence must cite a concrete completed artifact target. |
| Publication Rules: External review evidence must include a link, command, or artifact marker | External review evidence must cite a concrete completed artifact target. |
| Reviewer Sign-Off: Governance owner: decision must be approve before committee governance evidence can pass | Governance owner approval after completed evidence and blocker closure. |
| Reviewer Sign-Off: Security reviewer: decision must be approve before committee governance evidence can pass | Security reviewer approval after signer negative checks and no-broadcast boundaries are complete. |
| Reviewer Sign-Off: Operator reviewer: decision must be approve before committee governance evidence can pass | Operator reviewer approval after command evidence, rollback, and network reconciliation are complete. |

## Current Meaning

The Gate 6 blocker map remains structurally useful, but it is still a blocker
map. The current result confirms that Gate 6 cannot close without completed
row-specific authority-surface evidence, command outputs, rotation evidence,
positive and negative signer checks, publication-update artifacts, external
review, and reviewer approvals.

## Next Evidence Action

The next useful Gate 6 work is not to edit publication fields. It is to produce
safe, completed prerequisite evidence for one narrow row family:

- command-specific output for the non-broadcast Phase 010a guard evaluation,
  once a local node endpoint is available;
- public old/new committee key or hash identifiers, with no private material;
- member-loss threshold evidence for the 2-of-3 target committee;
- emergency escape continuity evidence proving the depositor timeout path stays
  permissionless.
