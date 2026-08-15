# Independent Security Review Scope

Use this document to brief an external reviewer before any public release or
production deployment candidate release-level evaluation.

This is not an audit report. It defines the required review scope, evidence
package, finding format, and exit criteria.

Do not provide `.env` files, mnemonics, signing secret material, SQLite runtime
databases, local deployment state, diagnostic dumps, or local user paths to the
reviewer unless a separate redacted evidence package explicitly requires them.

## Review Objective

The reviewer must decide whether the current release level is supportable by
the linked evidence and whether any critical or high-severity issue blocks
publication.

Required release levels:

| Release level | Reviewer question |
|---|---|
| Validated PoC | Do the documented local/testnet flows match the implementation and fail closed when assumptions are not met? |
| Institutional reference | Can an external team reproduce, operate, and adapt the bridge without private maintainer context? |
| Production deployment candidate | Are trust assumptions, signer controls, recovery, governance, and monitoring strong enough for high-value operation? |

## Required Scope

| Area | Required review questions | Required evidence |
|---|---|---|
| ErgoScript contracts | Do singleton continuity, payout binding, `HEIGHT` checks, signer gates, and emergency paths preserve bridge safety? | `contracts/*.es`, `relayer/src/contract-invariants.test.ts` |
| Relayer signing | Can any production path use node-wallet signing, unsafe ContextExtension signing, or hidden broadcast? | `relayer/src/fleet-signer.ts`, `relayer/src/context-extension-guard.ts`, `relayer/src/broadcast-policy.ts`, signing/broadcast tests |
| AVL proof generation | Are DUP and SPV tracker proofs generated from the correct histories and proof shapes, including batch proofs? | `wasm-avl/src/lib.rs`, `relayer/src/avl-bridge.ts`, `relayer/src/spv-tracker.ts`, `npm run wasm:test` |
| Settlement reconciliation | Are DUP keys and local lifecycle rows committed only after confirmed canonical settlement evidence? | `relayer/src/aggregate-settlement-service.ts`, `relayer/src/state-tracker.ts`, reconciliation tests |
| Sidechain finality and burn validity | Are trusted-oracle limitations, anchor persistence, SPV tracker assumptions, and burn proof gaps explicit? | `docs/aggregate-settlement-threat-model.md`, `docs/ultimate-bridge-roadmap.md` |
| Operator recovery | Can an operator pause, triage, restore SQLite/AVL state, recover from reorgs, and avoid duplicate payouts? | `docs/operator-runbooks.md`, `docs/live-rehearsal-template.md` |
| Dependency risk | Are signer, Fleet SDK, AVL, SQLite, EVM RPC, and toolchain risks documented with publication blockers? | `docs/dependency-risk-register.md`, lockfiles, CI evidence |

## Required Evidence Package

Provide links or artifacts for each row. Mark unavailable artifacts as blockers,
not omissions.

Capture the final report in
[Independent Security Review Evidence Template](independent-security-review-evidence-template.md)
and validate it before linking it as Gate 4 evidence:

```powershell
cd relayer
npm run security:validate -- ../evidence/security/<completed-independent-security-review>.md
```

| Evidence | Status | Link or artifact | Reviewer note |
|---|---|---|---|
| Clean checkout CI run | pending / linked / blocker | | |
| `npm run check` output | pending / linked / blocker | | |
| `npm run wasm:test` output | pending / linked / blocker | | |
| Fresh local devnet rehearsal | pending / linked / blocker | | |
| Fresh testnet rehearsal | pending / linked / blocker | | |
| Failed broadcast / phantom AVL drill | pending / linked / blocker | | |
| SQLite/AVL backup-restore drill | pending / linked / blocker | | |
| Batch settlement check/submit/confirm rehearsal | pending / linked / blocker | | |
| Release notes draft | pending / linked / blocker | | |

## Finding Format

Every finding must use this structure.

| Field | Required content |
|---|---|
| ID | Stable identifier, e.g. `EXT-001` |
| Severity | Critical / High / Medium / Low / Informational |
| Area | Contract / Relayer / Signer / AVL / Sidechain / Ops / Docs |
| Status | Open / Fixed / Accepted risk / Not reproducible |
| Impact | What can go wrong and which asset is affected |
| Evidence | File, test, transaction, or rehearsal artifact |
| Required fix | Minimal acceptance criteria for closure |
| Regression test | Test or rehearsal that must pass before closure |

Critical or high findings must be closed or explicitly listed as publication
blockers in [Institutional Release Checklist](release-checklist.md).

## Required Negative Review Checks

The reviewer must explicitly answer each question.

- Can a production path sign through the Ergo node wallet?
- Can default production/testnet mode sign a ContextExtension shape above the
  current safe threshold?
- Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?
- Can a failed broadcast or reorg insert a phantom DUP key into local AVL
  history?
- Can a batch settlement accept a wrong-recipient, low-value, or reused payout?
- Can a same-recipient batch collision pay fewer outputs than expected?
- Can stale SPV tracker or DUP history build a transaction against the wrong
  singleton digest?
- Can a trusted burn interpretation be mistaken for trustless burn verification
  in release notes or integration docs?
- Can an operator recover from SQLite loss without private maintainer context?

## Exit Criteria

A review is usable as release evidence only when:

1. The report identifies the reviewed commit.
2. Every required scope area is explicitly covered or marked out of scope.
3. Every critical or high finding has a status and closure evidence.
4. Every accepted risk is reflected in release notes and the release checklist.
5. The reviewer confirms which release level, if any, is supportable.
6. The final report passes `npm run security:validate` and is linked from
   [Institutional Release Checklist](release-checklist.md).

Until those conditions are met, the independent review remains pending evidence.
