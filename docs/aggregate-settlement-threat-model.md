# Aggregate Settlement Threat Model Refresh

This document refreshes the current risk model after the Phase 011a aggregate
settlement work, anchor-height persistence, startup signing gates, and explicit
broadcast gate.

It is not a production security audit. It is the current engineering threat
model for the institutional-readiness branch. It cannot support mainnet
production-ready claims. The only future production-candidate claim boundary is
testnet-scoped and depends on completed lifecycle, recovery, signer
conformance, review, governance, benchmark, and CI evidence.

## Scope

Covered:

- V1 aggregate settlement: `SPVTracker + DUP Aggregate + MainChainAggregateUnlock`.
- Batch aggregate settlement: tracker plus batch DUP and batch unlock path.
- Relayer preparation, signing, broadcast, confirmation, and reconciliation.
- SQLite-backed local state used for AVL history and peg-out lifecycle.
- Patched-devnet ContextExtension validation path.
- Mempool-safe contract timestamp invariants that affect settlement mining.

Out of scope:

- A final trustless sidechain proof system.
- A production governance system.
- Independent audit results.
- Mainnet operational parameters.

## Core Assets

| Asset | Why it matters |
|---|---|
| Locked ERG liquidity | Direct monetary backing for exits. |
| sERG supply | Must stay backed by locked ERG and fees. |
| DUP AVL tree | Prevents replay/double-unlock of burn IDs. |
| SPV tracker AVL tree | Binds sidechain block/event roots to Ergo anchors. |
| Singleton NFTs | Identify mutable state boxes across box-ID rotation. |
| Relayer signing material | Can authorize signer-gated transitions. |
| SQLite state | Drives proof history and lifecycle decisions. |
| Deployment state | Defines which boxes/contracts are authoritative. |

## Trust Boundaries

| Boundary | Current assumption | Production target |
|---|---|---|
| Sidechain burn validity | Relayer/committee interpretation plus off-chain revalidation. | L1-verifiable burn inclusion proof. |
| Ergo anchor | Extension field read from Ergo node, persisted by first matching height. | Standardized sidechain commitment format plus SPV proof. |
| Signer | Local WASM signer with fail-closed guards. | Committee-controlled signing/governance; eventually minimized by proofs. |
| Broadcast | Disabled unless `BRIDGE_BROADCAST_ENABLED=true`. | Same, plus operational change management. |
| AVL history | SQLite plus confirmation-time reconciliation. | Reconstructible from on-chain history or replicated DA. |

## Current High-Risk Findings

### 1. Phantom Burn Remains Transitional

Risk:

- A burn can be interpreted off-chain before the bridge has a fully trustless
  on-chain proof of sidechain event inclusion.
- Immutable v1 MCU boxes remain permissionlessly spendable under their old
  script. New legacy MCU creation and daemon spend are disabled, while the
  source replacement requires transitional committee authorization. None of
  those controls is a cryptographic burn proof.

Current mitigations:

- Exact burn receipt revalidation before aggregate settlement submission and
  confirmation; the service fails closed when no verifier is injected, and the
  E2E runner routes submission through that service.
- Read-only legacy MCU inventory and daemon quarantine; immutable v1 exposure
  remains an incident until the inventory is empty.
- Aggregate settlement requires SPV tracker identity and bridge event root.
- DUP replay protection prevents the same burn ID from paying twice once
  committed.

Open blocker:

- Phase 011 trustless SPV relay / burn inclusion proof is required before even
  a testnet production-candidate claim. It is not sufficient for, and does not
  authorize, mainnet production-ready wording.

Publication status:

- Acceptable for controlled PoC only when documented as a trusted-oracle
  limitation.

### 2. ContextExtension Consensus Is Guarded, Not Released

Risk:

- Default sigma-rust 0.28.0 and JVM node serialization can diverge for
  ContextExtension maps above the safe threshold.
- A signed transaction can have a local TX ID different from the node TX ID.

Current mitigations:

- `context-extension-guard.ts` blocks unsafe var counts in default mode.
- Patched stack mode is restricted to loopback devnet conditions.
- Daemon startup fails if enabled live settlement paths exceed the active guard.
- Readiness scripts report live settlement signing status.

Open blocker:

- Upstream sigma-rust release containing the canonical serialization fix.

Publication status:

- Safe to publish only as a guarded limitation, not as unqualified production
  settlement readiness.

### 3. Broadcast Must Remain Explicit

Risk:

- Any hidden code path that signs and posts `/transactions` can move funds in
  the wrong environment.

Current mitigations:

- `fleet-signer.ts` exposes local sign-only and check-only capabilities; its
  generic combined sign-and-submit wrappers are physically absent.
- `ErgoClient` has no transaction-submission method.
- The active daemon's operation-specific submitter requires exact candidate
  identity, immediate revalidation, explicit broadcast authorization, and a
  durable attempt before fixed transport.
- The bounded devnet reward utility retains separate environment, broadcast,
  signed-transaction identity, and node-response checks.
- Daemon startup refuses to continue unless broadcast is explicitly enabled.
- New legacy aggregate payout submission is physically absent from the daemon,
  operator CLIs, aggregate service, signer/authorization adapters, and transport
  modules. Versioned approval files remain parseable only as historical
  non-broadcast evidence and cannot recreate a runtime capability.
- Static tests isolate production broadcast endpoints.
- Node-wallet signing endpoints are statically blocked outside diagnostics.

Open blocker:

- Operator runbooks must be rehearsed against a fresh staging deployment.

Publication status:

- Strong local mitigation. Keep fail-closed default.

### 4. Anchor Height Drift Can Break Tracker Proofs

Risk:

- If multiple Ergo blocks contain the same sidechain extension field, selecting
  the latest matching block causes the embedded `ergoAnchorHeight` value to
  drift between retries.
- The SPV tracker AVL value changes, so the proof/output digest can mismatch.

Current mitigations:

- Forward scan selects the first matching anchor in the window.
- Resolved anchor height is persisted per burn.
- Persisted anchor is cleared only when the extension field is read
  successfully and the expected root is absent.
- Transient RPC/provider failure preserves the anchor.

Open blocker:

- Full live rehearsal through submit and confirmation under the new gates.

Publication status:

- Fixed at relayer level; still needs fresh lifecycle validation.

### 5. Local SQLite Is Still Critical State

Risk:

- AVL history and lifecycle state live locally.
- Disk loss or manual corruption can block proof generation or cause wrong
  recovery decisions.

Current mitigations:

- Confirmation-time reconciliation inserts DUP keys only after confirmed
  settlement.
- Tests cover stale SPV tracker digest, stale DUP digest, missing SPV identity,
  low payout, and idempotent replay.
- Reorg handlers purge phantom local artifacts when canonicality proves the
  transaction disappeared.

Open blocker:

- Reconstructibility from on-chain history or replicated data availability.
- Operator runbooks must include backup, restore, and manual repair drills.

Publication status:

- Not production-grade until recovery is reproducible by an external operator.

### 6. Singleton NFT Loss Is Catastrophic

Risk:

- If SCS, DUP, aggregate DUP, or tracker singleton NFTs are lost, duplicated, or
  moved under the wrong script, the bridge can halt or become unsafe.

Current mitigations:

- Singleton lookup uses token IDs, not fixed box IDs.
- Contracts preserve singleton tokens across transitions.
- Storage-rent monitoring and DUP heartbeat reduce long-idle seizure risk.
- Status/preflight tooling reports missing singleton state.

Open blocker:

- Full storage-rent maintenance rehearsal.
- Migration runbook for singleton redeploy/upgrade paths.

Publication status:

- Needs more operator rehearsal before external publication.

### 7. Mempool Height Exactness Can Make Valid Transactions Unmineable

Risk:

- Contracts that require successor timestamps to equal `HEIGHT` can pass local
  construction checks but fail by the time miners include the transaction.
- This can turn an otherwise valid transition into a mempool-dependent liveness
  failure and create unsafe retry pressure around mutable singleton boxes.

Current mitigations:

- Contract invariant tests forbid exact `HEIGHT` equality patterns in
  ErgoScript.
- Mutable singleton transitions use mempool-safe `<= HEIGHT` plus monotonicity
  where the successor height must advance.
- Operator runbooks classify stuck settlement and singleton invariant breaks
  before retrying or editing local state.

Open blocker:

- Fresh staged lifecycle evidence must include transactions waiting through at
  least one block boundary before settlement checks and submit.

Publication status:

- Locally guarded, but final publication still needs live rehearsal evidence.

### 8. Batch Settlement Must Not Weaken Duplicate Prevention

Risk:

- Batch payout matching can accidentally accept one payout output for multiple
  same-recipient claims.
- Batch DUP proof must be one unified proof for the batch, not concatenated
  individual proofs.

Current mitigations:

- Batch confirmation checks expected payout output positions.
- Tests reject multiset collision.
- WASM AVL batch proof tests cover unified proof generation.
- ContextExtension readiness computes batch var counts before signing.

Open blocker:

- Live batch settlement check/submit/confirm under patched stack.
- Sharded lane tests before making scaling claims.

Publication status:

- Good PoC evidence; not enough for scale claims.

## Attack Chain Registry Update

| Chain | Status after aggregate work | Notes |
|---|---|---|
| Fee laundering | Mitigated | Escrow model remains required. |
| Phantom key / reorged AVL | Mitigated with caveats | Reorg purge and confirmation-time insertion are covered, but recovery drills still required. |
| Dead-zone orphan scan | Mitigated | First-boot scan remains relevant. |
| Gas drain / dust attacks | Mitigated | Minimum economics and safe integer guards remain required. |
| Phantom burn | Partially mitigated | Still the primary trust-minimization blocker. |
| Hostage asymmetry | Mitigated | MCL escape path remains part of legacy path. |
| Phantom mint | Mitigated | EVM revalidation/reconciliation remains required. |
| Sweep phantom | Mitigated | Structural filters and wallet routing remain required. |
| Storage-rent seizure | Mitigated with operations | Heartbeat exists; runbook rehearsal still required. |
| ContextExtension divergence | Guarded | Safe by fail-closed policy until upstream release. |
| Anchor drift | Mitigated | First-anchor persistence and strict invalidation policy. |
| Broadcast mistake | Mitigated | Explicit opt-in and static surface tests. |
| Mempool HEIGHT exactness | Mitigated locally | Contract invariants forbid exact `HEIGHT` successor stamps. |

## Required Evidence Before Publication

The following must be linked from release notes before any public "ready" claim:

1. Clean checkout CI: npm install, WASM build, Rust tests, TypeScript, relayer
   tests.
2. Fresh local devnet lifecycle: peg-in, peg-out, anchor, settlement check,
   broadcast, confirmation, reconciliation.
3. Fresh testnet lifecycle from clean deployment state.
4. ContextExtension upstream release validation or continued fail-closed guard.
5. Current threat model and runbooks.
6. Independent review of contracts, signer, AVL proofs, and sidechain finality.
7. Benchmarks for single, batch, and sharded-lane settlement.

## Next Security Work

1. Rehearse the runbooks against a clean staging deployment.
2. Add live lifecycle evidence under the explicit broadcast gate.
3. Build reconstructibility or backup/restore procedure for AVL/SQLite state.
4. Advance trustless burn verification: sidechain commitments, SPV relay, and
   burn inclusion proof format.
5. Add sharded lane executable tests before making parallelism claims.
