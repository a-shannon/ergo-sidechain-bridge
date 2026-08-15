# Governance Validate Phase 010a Blocker Map - 2026-06-25 - 3e1a6811

This report records the validator result for the current structured Phase 010a
committee governance blocker map.

It is not completed Gate 6 committee governance evidence. It does not support
governance-ready, testnet production-candidate, mainnet, or completed
key-rotation claims.

## Command Result

| Field | Value |
|---|---|
| Command | `npm run governance:validate -- ../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-25-3e1a6811.md` |
| Working directory | `ergo-sidechain-bridge/relayer` |
| Validated target | `../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-25-3e1a6811.md` |
| Result | BLOCKED |
| Exit code | 1 |
| Structural issues | 54 |
| Stack trace emitted | no |
| Local path emitted | no |

## Issue Groups

| Issue group | Count | Operator meaning |
|---|---:|---|
| Scope rows not linked | 8 | Every authority surface still needs completed row-specific evidence |
| Required command rows not linked | 6 | Gate 6 command output evidence has not been captured as completed evidence |
| Rotation plan blockers | 11 | Old/new public-key identifiers, rotation steps, and member-loss evidence are incomplete |
| Positive check rows not linked | 2 | New committee signer-gated mutation and member-loss tolerance are not proven |
| Negative check rows not linked | 7 | Old signer, non-committee signer, stale NFT, broadcast, and network mismatch checks are not proven |
| Publication-rule blockers | 17 | Release support, governance-ready claim handling, updates, and external review are not complete |
| Reviewer sign-off blockers | 3 | Governance, security, and operator reviewer approvals are not complete |

## Boundary

The structured blocker map removes the earlier missing-section failure mode from
the narrative prep packet. The remaining validator issues are expected blockers:
completed row evidence, public-key identifiers, positive and negative signer
checks, command outputs, publication updates, external review, and reviewer
approvals are still absent.

The current Phase 010a spike remains blocked before contract compilation because
the local node endpoint refused the connection. See
artifact://governance/artifacts/phase010a-committee-guard-node-unavailable-2026-06-25-3e1a6811.md.
