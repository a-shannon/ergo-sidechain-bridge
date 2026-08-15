# Ergo-Substrate Bridge — PoC → Tier-1 Gap Analysis

> **Date**: 2026-05-05
> **Status**: Living document — updated as gaps are closed
> **Current Assessment**: ~25-35% of the path to a reviewable institutional candidate; no production-readiness claim

## Executive Summary

The bridge PoC has a useful core: eUTXO↔EVM semantic translation, AVL+ proof
machinery, and a demonstrated asynchronous round-trip. A current-code re-audit
identified two critical fail-open timeout paths, so the earlier 9/10 security
assessment is withdrawn. Current source now requires the refundable peg-in box
to be consumed into an exact committed vault before mint and disables new
legacy MCU creation/spend. Manifest-bound read-only tools can classify both
routes, but reviewed manifests, real observations, authenticated activation,
and immutable legacy inventory closure remain open.

After that P0 containment, the highest-leverage path is not more release polish
or governance R&D. It is Phase 011 / Gate 5 trustless burn verification, built
on verifiable sidechain consensus, `0x04` extension commitments, and a
bridge-native burn proof format.

This document maps every gap and the architectural path to close it.
Active status and package selection live in the
[Bridge Execution Plan](../phases/bridge-execution-plan.md); this gap analysis
does not maintain a competing execution queue.

### Completed Prerequisites

| Phase | Name | Date | Impact |
|-------|------|------|--------|
| **006** | WASM Hybrid Signer | 2026-05-05 | ✅ Node-wallet signing is removed. `fleet-signer.ts` retains local sign-only and check-only capabilities, while generic combined signer/submission APIs are physically absent. Submission is operation-scoped, explicitly authorized, revalidated, and durably journaled. Fleet SDK Prover is not used for register-based proveDlog paths. |
| **010-R** | Multisig Architecture Research | 2026-05-05 | ✅ Full architecture document. Key findings: (1) sign equation is ADDITION (compatible with FROST), (2) Fiat-Shamir uses full Sigma tree serialization (blocks custom ciphersuite), (3) sigma-rust HintsBag API available in WASM, (4) Rosen Bridge uses on-chain `atLeast()` multisig (Option D selected). **DECISION LOCKED: `atLeast(m, Coll(pk1..pkN))` for Phase 010a. FROST deferred to Phase 015.** See `docs/frost-architecture.md` (archived research). |

---

## Gap Registry

### Gap 1 — Trust: Single Dictator vs. Cryptographic Verification

**Current**: Single relayer owns the private key. Compromise = 100% TVL drain. The SCS oracle
accepts whatever height the relayer submits — no cryptographic verification.

**SOTA**: Rollups verify ZK-SNARK proofs (validity) or fraud proofs (optimistic). No trust
in any single operator.

**Route to Tier-1**:
- **Phase 010a**: On-chain `atLeast(m, Coll(pk1..pkN))` multisig (Rosen Bridge pattern). Each committee member signs independently; the ErgoScript verifier checks the threshold on-chain. Requires contract redeployment (new ErgoTrees with embedded committee keys).
- **Phase 011 / Gate 5**: Trustless burn verification. Instead of trusting the relayer's
  burn interpretation, Ergo verifies a sidechain commitment, finality rule, burn inclusion
  proof, payout binding, and DUP replay binding. NiPoPoW remains a bootstrapping or
  fallback option, but the preferred current direction is a bridge-native
  `bridge_event_root` / `burn_root` under `0x04`.

**Complexity**: LOW for the remaining Phase 010a minimum hardening + HIGH for
Phase 008/009/011 cryptographic proof work.

---

### Gap 2 — Consensus: Isolated Security vs. Inherited Security

**Current**: Substrate sidechain has its own consensus. A 51% attack on the L2 costs virtually
nothing — there's no economic security backing it.

**SOTA**: Rollups inherit L1 security by posting state roots (and optionally full DA) to L1.
Attacking the L2 requires attacking the L1.

**Route to Tier-1**:
- **Phase 009**: Merged mining / extension commitments. Ergo miners or an approved
  candidate-generation path include sidechain block commitments under the reserved
  sidechain extension prefix `0x04`.
  Attacking the sidechain requires majority Ergo hashrate.
- **Dependency**: Requires `pallet-braid` on Substrate + Ergo mining proxy modifications.

**Complexity**: HIGH (mining infrastructure changes)

---

### Gap 3 — Data Availability: Local SQLite vs. Replicated DA

**Current**: AVL tree history and bridge state live in a single `bridge-state.sqlite` file.
If the disk dies, the AVL tree is irrecoverable → DUP proofs fail → bridge is permanently dead.

**SOTA**: Rollups publish compressed transaction data via EIP-4844 blobs to L1 or to dedicated
DA layers (Celestia, EigenDA). Anyone can reconstruct L2 state from L1 data alone.

**Route to Tier-1**:
- **Option A**: Data Availability Committee (DAC). Replicate SQLite across 5+ geographically
  distributed nodes. Each node attests to data availability by signing a root hash. The bridge
  contract requires K-of-N DAC signatures before accepting state updates.
  - Pro: Simple to implement, proven pattern (Polygon Validium uses this).
  - Con: Introduces a new trust assumption (DAC honesty).
- **Option B**: Anchor AVL digests in Ergo Extension Blocks. The SCS oracle already posts
  the UTXO digest (R6) — extend it to include the full AVL tree root. Recovery: rebuild
  tree from on-chain history of all DUP insertions (each peg-out's burnTxHash is on-chain).
  - Pro: No new trust assumption. Fully reconstructible from L1.
  - Con: Recovery is O(N) in peg-out history. Requires scanning all DUP TXs.
- **Option C**: IPFS/Arweave anchoring with on-chain CID. After each DUP update, pin the
  serialized tree to IPFS and store the CID in an Ergo register.
  - Pro: Cheap, simple.
  - Con: IPFS is not guaranteed available. Arweave adds cost.

**Recommended**: Option B (on-chain reconstructibility) as primary + Option A (DAC) as hot backup.

**Complexity**: MEDIUM (B) to HIGH (A)

---

### Gap 4 — Deposit Safety: Source Implemented; Activation Critical Open

**Current source implementation only**: MCL v3 keeps the source refundable
until committee consumption into the canonical V2 vault. The consume transaction
puts the full deposit value in `OUTPUTS(0)` and uses a separate fee input; vault
`R4`-`R7` bind source box ID, H160, amount, and depositor tree. The relayer
progresses `detected -> consume_submitted -> consume_confirmed -> minting -> minted`.
It cannot mint from a refundable source.

Valid attack trace:

`deposit ERG -> mint sERG -> wait 10,000 Ergo blocks -> refund ERG -> retain sERG`

Increasing the timeout cannot close this trace. Time does not prove that mint
did not happen. The required state machine is:

`refundable deposit -> consume_submitted -> consume_confirmed -> minting -> minted`

Before mint, source code verifies the canonical commit transaction and inclusion
block, exact vault output, source absence, and vault unspent status. Mint failure
is retried from committed state; a pre-mint reorg returns to non-mintable state;
a deep post-mint commit reorg opens the circuit. Legacy refundable boxes are
classified and never auto-minted; minted-plus-refundable legacy state is an
incident. The expected commit txId is persisted before submission, unresolved
incidents reopen the circuit after restart, and a durable cursor ensures older
minted rows are eventually revalidated rather than starved by the newest batch.

The confirmation model still has an unavoidable point-in-time boundary between
the last Ergo observation and EVM inclusion. Eliminating that residual reorg
window requires the stronger Phase 011 finality/proof path, not another local
status check.

**Status**: source and manifest-bound route-observation tooling are present in
the current branch. The observer binds the exact MCL source/profile and vault,
classifies complete active MCL/vault history across two stable origins, and
rejects unresolved spends or any current legacy MCL UTXO. It cannot authorize
mint, routing, deployment, or cutover. Independent manifest review,
deployment/activation, and real observations remain open. Until they close, the
active flow must not be used with live funds; the MCL escape is only a
pre-commit refund path, not a Gate 5 safety mechanism.

---

### Gap 5 — Operational Resilience: Monolith vs. Industrial

**Current**: Single TypeScript process. 1 peg-out = 1 L1 TX. DUP singleton creates a
sequential bottleneck (1 peg-out per L1 block). No horizontal scaling.

**SOTA**: Kubernetes clusters, batched proofs (1000 TXs → 1 L1 proof), redundant sequencers
with leader election, rate-limited circuit breakers.

**Route to Tier-1**:
- **Batched AVL proofs**: Accumulate N peg-out requests, generate a single batch AVL insertion
  proof, submit one DUP update TX. The WASM `bridge_avl` already supports `rebuild_and_insert_batch()`.
  Throughput: N peg-outs per L1 block instead of 1.
- **Redundant RPC**: Round-robin across multiple Ergo node endpoints. Failover on timeout.
- **Rate-limited circuit breaker**: If >10% TVL exits in <1 hour, auto-pause peg-outs and
  alert operator. Prevents catastrophic drain during an exploit.
- **Health monitoring**: `bridge-status.ts` already provides storage rent, solvency, and
  defense status. Add Telegram/webhook alerting for production.

**Complexity**: MEDIUM (batching already supported in WASM)

---

### Gap 6 — Upgrade Governance: `onlyOwner` vs. Timelocked Multisig

**Current**: ErgoBridge.sol uses `Ownable` — single EOA controls all admin functions.
The owner can:
- Pause/unpause the bridge
- Mint arbitrary sERG (via `mintSERG`)
- Withdraw all accumulated fees
- Deploy a new contract and redirect deposits

No timelock, no multisig, no on-chain governance.

**SOTA**: Tier-1 L2s use:
- `TimelockController` (48-72h delay on all admin actions)
- Security Council multisig (Gnosis Safe, 6-of-9)
- Upgrade transparency (all pending upgrades visible on-chain before execution)
- Emergency fast-path (requires supermajority, e.g., 9-of-9)

**Route to Tier-1**:
- Deploy OpenZeppelin `TimelockController` as owner of ErgoBridge
- Transfer ownership to a Gnosis Safe multisig
- Minimum 48h delay on all non-emergency actions
- Emergency path: direct multisig call with 100% signer threshold
- Ergo side: contracts are immutable by design (ErgoTree is fixed at box creation).
  The "upgrade" path is deploying new contracts + migrating the singleton NFT.
  This is inherently safe (old contracts continue to work until NFT moves).

**Complexity**: LOW (OpenZeppelin has all the primitives)

**Roadmap priority**: LOW / secondary unless a release validator explicitly requires
fresh governance evidence. Governance/key rotation improves operator readiness and release
claims, but it does not make a burn cryptographically verifiable on Ergo and does not close
Chain ζ / Phantom Burn.

---

### Gap 7 — MEV / Transaction Ordering: FIFO Trust vs. Commit-Reveal

**Current**: Relayer processes peg-outs in FIFO order from SQLite. But nothing prevents
a malicious relayer from:
- Reordering withdrawals to front-run large peg-outs
- Delaying specific addresses (targeted censorship)
- Sandwich-attacking: process own peg-out first, then user's, then another own
- Artificially maintaining high TVL by delaying large withdrawals

**SOTA**:
- Chainlink Fair Sequencing Services (FSS)
- Encrypted mempools (user encrypts TX, sequencer commits to order, then decrypts)
- Inclusion lists (L1 forces L2 to include specific TXs)

**Route to Tier-1**:
- **Phase 1 (Simple)**: On-chain FIFO commitment. When a PegOut event is emitted, its
  position in the queue is determined by block number + log index. The relayer MUST process
  in this exact order. A monitor contract verifies ordering compliance.
- **Phase 2 (Advanced)**: Commit-reveal ordering. Users submit encrypted peg-out requests.
  Relayer commits to processing order. Reveal phase decrypts. This prevents front-running
  but requires 2-phase user interaction (worse UX).

**Recommended**: Phase 1 (on-chain FIFO enforcement). Simple, effective, verifiable.

**Complexity**: LOW-MEDIUM

---

### Gap 8 — Reverse Escape Hatch: Withdrawal Censorship Recovery

#### Immutable V1 MCU Timeout Is Fail-Open After Burn Reorg

The old v1 daemon revalidated only receipt presence and recorded
`burn_reverted` when the receipt disappeared. That local state could not stop a
third party from spending an existing v1 MCU. Its immutable ErgoTree still
allows beneficiary payout from stale SCS height or after 10,000 Ergo blocks
without an Ergo-verifiable proof that the burn remains canonical.

Valid attack trace:

`burn sERG -> create MCU -> reorg burn -> restore sERG -> wait -> payout ERG`

WP-02 removes the active fallback: the daemon no longer creates or spends legacy
MCUs, the compatibility builder and direct legacy scripts stop before node or
signer access, and the replacement source requires transitional committee
authorization with no timeout branch. A read-only inventory command keeps every
discovered old box quarantined and reports its timeout exposure. That explicit-
address command remains diagnostic. A separate non-authorizing observation
assessment now binds an
exact manifest to coherent network/checkpoint identity, a bounded depth/age
window, two distinct-origin synchronized-index observations, complete
pagination, exact observation agreement, and zero remaining UTXOs. The actual
reviewed manifest, authenticated review decision, independently operated source
provenance, and real observations remain open. Origin agreement is not a
consensus proof, and the tool cannot prove the human coverage claim by itself.
Because an old v1 script forces payment to its beneficiary, a reverted or
unverifiable box cannot be migrated safely; a manifest-bound zero-unsafe-UTXO
observation is only a cutover prerequisite, not the cutover boundary.

This source containment does not close Phase 011. Waiting for confirmations
after an Ergo anchor proves anchor age on Ergo, not sidechain finality.

**The Problem**: User burns sERG → relayer dead → Phase 1 never created → user loses BOTH sERG and ERG. The current MCL timeout is itself unsafe under Gap #4 and does not provide a model that can be copied to withdrawals.

**SOTA**: Ethereum L2s use "Forced Withdrawal" where L1 can execute the L2 state transition
and verify fraud proofs. The L1 has **arbitration capability**.

#### ❌ DEAD END: Optimistic Collateralized Claims (WithdrawalClaim.es)

An optimistic claim system (user posts bond, waits for challenge window, then unilaterally
unlocks ERG) was designed and **REJECTED** due to 3 fatal, unfixable security flaws:

**Flaw 1 — Proof of Inexistence Paradox (Fake Hash)**:
DUP tree proves inclusion (key exists), NOT non-membership. An attacker uses an invented
burn TX hash (`0xdeadbeef...`). The relayer CANNOT provide a DUP inclusion proof for
something that was never inserted. Challenge fails. Timeout executes. Attacker drains TVL.
Cost of attack: 10% bond. Reward: 100% of TVL.

**Flaw 2 — Veto Catch-22 (Honeypot)**:
If the relayer gets unconditional veto power (to block fake hashes), a MALICIOUS relayer
vetoes ALL legitimate claims too. The escape hatch becomes a honeypot: user loses sERG
(burned) + ERG (locked) + bond (seized by relayer). Worse than no escape hatch at all.

**Flaw 3 — Dead Relayer = Fail Open (Piñata)**:
The whole purpose is to handle dead relayer scenarios. But if the relayer is dead, nobody
executes challenges → ANY claim succeeds after timeout → 100% TVL legally drained.
This converts the bridge from "Fail Closed" (funds locked but safe) to "Fail Open"
(funds accessible but stealable). **Security guarantee is inverted.**

#### The Impossibility Theorem

> **You cannot build a trustless withdrawal escape on a trusted bridge
> without L1-verifiable cross-chain proofs.**

In an optimistic model, L1 MUST be able to arbitrate disputes — it must verify whether
a burn actually happened. Ergo L1 cannot execute EVM state transitions or verify Substrate
state proofs (JIT cost prohibitive). Without L1 arbitration, optimistic models degenerate
to "whoever waits longest wins."

This is why Ethereum Optimistic Rollups work: L1 Ethereum CAN re-execute L2 state
transitions. Ergo L1 cannot. The bridge cannot exceed the security of its weakest proof.

#### ✅ CORRECT FIX: Phase 010a Minimum + Phase 011 / Gate 5

1. **Phase 010a (atLeast() On-Chain Multisig)**: Replace single relayer key with `atLeast(m, Coll(pk1..pkN))` on-chain multisig (Rosen Bridge pattern).
   Liveness failure requires (n-m+1) simultaneous node failures. Makes Gap #8 practically
   irrelevant — the "dead relayer" scenario becomes astronomically unlikely.

2. **Phase 011 / Gate 5 (Trustless Burn Verification)**: User or relayer supplies a proof
   object that binds the sidechain block/checkpoint identity, `bridge_event_root` or
   `burn_root`, `0x04` Ergo extension anchor, sidechain finality rule, burn inclusion proof,
   recipient, amount, sidechain ID, burn ID, and DUP replay update. Ergo verifies the proof
   before payout. This enables a real trustless reverse escape hatch because L1 can verify
   that a burn happened without trusting the transitional SCS oracle.

**Why this order matters**:
- Phase 010a FIRST: Makes Gap #8 practically irrelevant (near-zero liveness failure)
- Phase 011 NEXT: Closes the cryptographic burn-proof gap once consensus, commitment,
  finality, proof acceptance, and DUP binding are implemented.
- No optimistic claims, bonds, or challenge windows needed

**Complexity**: LOW for the remaining Phase 010a minimum hardening + HIGH for
verifiable consensus, extension commitments, on-chain proof acceptance, and review.

---

## Implementation Roadmap

| Phase | Gap(s) | Deliverable | Dependency | Priority |
|-------|--------|-------------|------------|----------|
| **010a-P0** | 4, 8 | Consume refundable deposits before mint; remove fail-open legacy MCU payout paths | Existing prototype | CRITICAL |
| **010a** | 1, 8 | Remaining minimum non-throwaway multisig and safety hardening | P0 containment | HIGH |
| **008** | 2 | Verifiable sidechain consensus/finality basis | Substrate runtime | HIGH |
| **009** | 2 | `0x04` extension commitments and sidechain commitment format | Phase 008 direction | HIGH |
| **011** | 1, 8 | Gate 5 SPV relay / `0x04` commitments / `bridge_event_root` or `burn_root` / STARK-ready proof path with on-chain proof acceptance | Phase 008 + Phase 009 + Phase 010a minimum | CRITICAL |
| **Governance** | 6 | Timelock/multisig/admin hardening and key-rotation evidence | Release validator need | LOW / secondary |
| **012** | 3 | DAC + on-chain reconstructibility | Phase 010a | MEDIUM |
| **013** | 5 | Batched proofs + circuit breaker | WASM AVL | MEDIUM |
| **014** | 7 | On-chain FIFO enforcement | Phase 010b | LOW |

---

## References

1. L2Beat Risk Framework: https://l2beat.com/scaling/risk
2. Vitalik "Stages" framework for L2 maturity
3. Optimism Bedrock forced inclusion: `OptimismPortal.depositTransaction()`
4. Arbitrum forced inclusion: `SequencerInbox.forceInclusion()`
5. Polygon Validium DAC architecture
6. kushti, soysor — "Two-Way Pegged Sidechains On Ergo"
7. Bridge Impossibility Theorem — archived in `implementation_plan.md`

