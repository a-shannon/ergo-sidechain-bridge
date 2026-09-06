# Bridge Execution Plan

Updated: 2026-09-06

This is the single active continuation queue for the Ergo sidechain bridge.
The deliverable is a reproducible open-source reference that an institution
can use as the engineering base for its own Ergo-settled sidechain.

Apply the [development process](../docs/development-process.md) on every
continuation. Judge progress by executable consumers and confirmed lifecycle
milestones, not the number of intermediate versions.

The [execution history](bridge-execution-history-2026-09-05.md) retains the
previous package specifications, decisions and checkpoint records. Its old
"next" actions are historical, not a second queue. Use those specifications
when their exact boundary is reached; do not discard their safety obligations.

## Delivery Contract

| Track | Deliverable | Deciding trust model | State |
|---|---|---|---|
| **WP-06-FED** | A complete, reproducible two-way federated reference | A versioned source-attestation Ed25519 quorum and a separately bound Ergo-admission SigmaProp quorum; roles, thresholds and federation epoch are explicit | Active. Local component and campaign evidence exists; the full tracker-to-payout lifecycle is not closed |
| **WP-06-STARK / Gate 5** | An Ergo-verifiable trustless upgrade | An activated verifier checks the separately versioned statement and finality semantics before value release | Frozen pending a compatible activated target. Not a prerequisite for the federated reference |

Neither track currently supports a production-ready or mainnet-ready claim.
Public research-alpha availability, local simulations and green CI do not
establish deployment safety or independent operator custody.

## Verified Baseline

- Integration source baseline: `907e8c8deca5ed51e2c647d9d0b75a3c7e36beb9`.
  Its tree is identical to the preceding green integration
  `8bf745d0922eed301102207d3329902ca6e2194b`; the correction changed Git
  identity metadata, not source behavior. Consult the
  [exact-head CI](https://github.com/a-shannon/ergo-sidechain-bridge/actions/runs/33926887851)
  for promotion status, not for runtime acceptance.
- Local campaign evidence covers setup, a committed reserve, packet-bound
  mint, burn and application checkpoint production. The mint consumer used
  a source-locked TestClient. This does not establish an enabled operational
  mint route, canonical tracker admission or a completed withdrawal.
- The ordinary daemon cannot initiate new owner minting or legacy payout
  transport. Deposits on that route remain refundable while the selected
  authenticated mint route is unavailable. Preserve these holds.
- The source-locked foundations, full-transaction VM matrices, layered
  extraction and recovery containment are reusable within their verified
  scopes. Their local completion does not close the composed FED lifecycle.
- Source identity and locked offline relayer artifact production have passed
  their bounded checks. V145 is terminal at the application-checkpoint phase;
  its hint does not identify an authoritative root cause. Do not retry or read
  its mutable state. V134 was abandoned; terminal attempts are not
  predecessors that must be replayed.
- The V11 fresh-owner application route is now composed at source level.
  Same-process request creation retains synthetic custody; the campaign claims
  it before building and keeps it with the actual packet. Proof-bound signing
  produces three inspected calls, disposes that custody, and passes the calls
  and actual source proof to runner V3 and overlay 0003. The Ergo recipient is
  the campaign setup signer's exact compressed key, also bound to the packet's
  Ergo-admission keys. Legacy runner V2 remains a separate reference route,
  never a fallback. A fresh composed campaign now reaches one local tracker
  transport attempt. The node returned HTTP 400; the transaction was not found
  in 85 observations over its 120-second confirmation budget. No acceptance
  of that submission or canonical tracker admission was established.

## Critical Path

Choose **greenfield or migration** for one exact target before provisioning.
Both require authenticated history and exact authority/replay lineage. A
greenfield launch needs the reviewed non-instantiation baseline and derived
empty replay root; a migration needs paid-burn import and closure of every
legacy authority. Neither a fresh DB nor an empty UTXO view proves greenfield.

```text
frozen foundations + selected launch mode + fresh-owner application execution
  -> exact tracker transport and canonical admission
  -> burn/checkpoint binding + global DUP insertion + external-fee payout
  -> composed two-way recovery and operational integration
  -> exact target/custody activation and operational rehearsal
  -> profile-correct evidence + final independent assurance
  -> FED-7 federated reference package

separate upgrade: activated Ergo verifier -> WP-06-STARK -> Gate 5
```

| Order | Boundary | Next concrete action | Completion evidence / blocker |
|---|---|---|---|
| **Now** | FED-6-LAB funded V2 tracker -> canonical admission | Connect the session-owned external-fee V2 check to exact reservation, authorization, fixed transport and confirmation; exercise funding and admission in one fresh owned-target campaign | V168 checks fee funding on the real node without submission. V169 supplies its component-tested transport lifecycle. V170 connects the genuine tracker-protocol V2 transaction to the retained signer and frozen-target checker. Actual fee-box confirmation, tracker admission and the operational V3 caller remain open. Do not reopen disposed custody, relabel V1 receipts, retry terminal campaigns or mutate signed bytes |
| 2 | Checkpoint -> complete withdrawal | Compose the observed checkpoint with its burn, global replay insertion, reserve successor and externally funded miner fee | One full positive transaction and isolated negative cases; exact JVM/node acceptance and, under separate authorization, canonical confirmation. Reserve decrease equals burned liability, not liability plus miner fee |
| 3 | Both value paths -> recovery | Exercise the selected FED identities through restart, DB loss/rollback, divergent RPC, out-of-order events and reorgs; integrate the operational application root | Recovery holds remain non-authorizing; no repeated mint/payout, no reconstructed funds authority and no restoration of retired legacy paths |
| 4 | Local reference -> target operation | Complete exact non-mainnet target, role custody, approval, key-loss/rotation and alert/recovery rehearsal | Local actor simulation remains useful but does not prove independent custody. A missing external participant blocks only that operational claim, not local engineering |
| 5 | Working FED profile -> FED-7 | Bind the completed lifecycle to its own evidence producer/validator, clean checkout and final independent review | No relabelling of legacy `authenticated-external-fee-v1` evidence as FED. Close every claim-relevant blocker before supported release |

## Next Executable Batches

| Batch | Owner / dependency | Completion contract |
|---|---|---|
| V2 admission lifecycle | Main owner; consumes the V170 session-owned check | Exact two-input candidate, checkpoint, target and successor -> explicit authorization -> durable reservation -> fixed transport -> canonical/ambiguous outcome handling. Implement this join together; preserve each separate capability. No V1/V7 receipt relabelling |
| Actual campaign caller | Main owner; depends on the admission lifecycle | Select the retained V3 route in the real application root. Confirm external-fee funding before freezing the anchor; preserve application/checkpoint provenance. One fresh authorized owned-node campaign reaches canonical tracker admission. No standalone funding/check replay |
| V2 withdrawal acceptance | Depends on canonical tracker admission and exact reserve/DUP/fee inputs | Feed the V2 constructor with the admitted checkpoint and current predecessor state, then check the complete transaction on the exact target. Synthetic construction is available; it neither proves canonical input history nor authorizes signing or transport |

Then connect exact withdrawal transport and the operational mint caller, exercise
both directions through recovery, and finish target/custody rehearsal and FED-7.
A source-locked TestClient mint is not the operational mint route. Synthetic
withdrawal construction is not a completed exit. Do not omit either consumer
from the final delivery contract.

## Reference Checkpoints

Scoped test preparation is complete. The selected fresh-custody V2 positive
uses no unrelated static compiler pair; all 114 ordinary provisioning cases
pass with unchanged case bodies, negative tables and timeouts. The two optional
node cases were not re-executed. Fresh signer-bound compilation remains fresh;
see the [measured preparation scope](../docs/development-process.md#september-2026-audit-baseline).
This improves focused iteration, not the bridge's runtime acceptance status.

The V2 withdrawal constructor connects genuine V2 tracker and settlement-family
compiler receipts to a complete unsigned reserve/DUP/payout transaction. The
reserve value and liability decrease by the burn amount; a separate input pays
the miner fee. Isolated negatives cover compiler provenance, source/profile
bindings, payout substitution, replay and conservation. The V1 golden fixture
and transaction identity are unchanged. These checks establish synthetic
construction, not canonical tracker admission, full-transaction V2 VM/node
acceptance, signing authority or a completed exit.

V150-V170 specifications and validation limits are retained in the
[checkpoint archive](bridge-execution-checkpoints-2026-09-06.md). Consult the
relevant boundary before changing its inputs; archived next actions are not
an execution queue. The versioned source, authority and replay obligations
remain binding. V149 remains terminal and must not be retried or inspected.

## Continue Protocol

1. Read this queue, Git status and the current task-owned handoff. Preserve
   unrelated changes; do not restart discovery from the full history.
2. Select one independently testable producer-to-consumer boundary, normally
   one to four source files plus direct tests. Name the invariant, expected
   discriminator, owned paths and validation closure before editing.
3. Use the cheapest decisive check first. For the current tracker boundary,
   reuse the frozen V2 WASM/JVM/node-code checks while their inputs match. Close
   the distinct V2 setup/operational identity join before provisioning fresh
   boxes and checking the exact candidate on the selected node.
   Raw error strings, RPC payloads, logs, journals and local statuses never
   become evidence authority.
4. A complete bounded diagnostic may identify the first failing field, but
   must not weaken predicates, mutate accepted bytes/digests, retry transport,
   expose arbitrary data or acquire a signing/submission capability.
5. Start a fresh synthetic campaign only after a changed hypothesis or source
   input can produce a distinguishing result. Keep unique identity, request,
   ports, processes, storage and authorization lineage. Reuse verified
   immutable build inputs only; never reuse terminal mutable state.
6. At a coherent green boundary, obtain the due independent review, inspect
   the diff, run publication guards and commit locally. Update this queue only
   when the next action or deliverable state changes. Keep detailed attempt
   history and validation receipts in the task handoff or evidence record.

## Validation Dependency Map

Select risk (`light`, `standard`, `strict`, `critical`) separately from phase
(`iteration`, `checkpoint`, `closeout`, `promotion`). Strictness does not turn
every edit into a full closeout.

| Changed input closure | Due verification | Reuse / limit |
|---|---|---|
| Roadmap or README | Link/claim checks and direct documentation consumers; independent review of changed public claims | No code, WASM, JVM or node replay solely for prose. A changed claim or command invalidates only its deciding evidence |
| Observation or diagnostic mapping | Focused producer/direct-consumer tests, isolated negatives, TypeScript; architecture check if imports/capabilities change | Preserve RPC calls/order, acceptance, accepted fields and digests. No full campaign merely to discover another phase label |
| Consensus source, patch, lock, build command or toolchain | Rebuild the changed locked closure and relevant Rust/Scala differentials | Reuse only matching content/toolchain/generated-byte identities; a mutable cache is not evidence |
| Contract, codec, statement, profile, transaction or ContextExtension | Affected VM, cross-language, serialization and isolated-negative matrices | Bind exact trees, ordered bytes, verifier/runtime pins and target policy; unchanged unrelated matrices stay reusable |
| Lifecycle, journal, reorg policy or a funds consumer | Affected recovery/containment matrix and composed profile tests | DB loss reconstructs cache, never receipts, history or funds authority |
| Exact target check or transport | Fresh relevant chain state, candidate bytes, target identity, authorization and outcome handling | Old JVM/no-submit receipts do not authorize a new target, changed transaction or later broadcast |
| Stable strict/critical milestone | Complete applicable closure and fresh independent review | The reviewer states what was inspected versus replayed. A changed reviewed input invalidates its affected verdict |
| Publication | Exact promoted commit/tree, current required CI and publication guard | Reuse unchanged closeout evidence; neither publication nor CI upgrades runtime or trust claims |

The task handoff records checks run, checks reused with their input closure,
invalidated results and remaining blockers. Do not create another tracking
framework. Full clean-checkout verification (`npm.cmd run check:clean-checkout`
from `relayer`) belongs at its due milestone, not the ordinary edit loop.

Hosted CI currently runs the audit and pinned-source rebuild jobs broadly.
Until a separately reviewed change implements dependency-aware selection,
every required hosted job still must pass at publication. The bounded CI
improvement must test its path-selection rules, invalidate on source/lock/tool
changes, fail closed on unknown impact, and retain a complete milestone run.
Do not silently skip jobs or promote an unverified cache result.

## Publication Cadence

Local diagnosis and authorized local synthetic execution do **not** require a
preceding GitHub push, PR merge or new hosted run. They require their own exact
local source identity, applicable checks, independent review when due and
operation-specific authority. An unrelated pending hosted job is not a local
experiment dependency; a known relevant failure is.

Publish completed work-package milestones, substantive funds/consensus fixes,
frozen formats, target acceptance and reproducible lifecycle/recovery results.
Diagnostic-only changes, terminal attempts and partial refactors stay local
until part of such a milestone. Batch documentation corrections with the next
useful promotion; do not add a publication round between diagnostic edits.

At promotion: freeze the candidate, review the exact diff, run or reuse its due
closure, run staged/range publication guards, push through the guarded wrapper,
and wait for the required checks on that exact head. Respect branch protection
and the authorized merge policy. Verify canonical author/committer identity
before a local merge; do not repeat the corrected account-email publication.
Publication is not deployment, broadcast, a supported release or activation.

## Parallel Work And Deferrals

Keep one critical-path owner and at most two bounded subagents. Shared daemon,
state schema, contracts, signing policy, final integration and commit decisions
stay with the main agent. Close a worker once its deliverable is returned.

Useful disjoint work: target/custody preparation; operator runbook and reviewer
onboarding; dependency-aware CI selection; independent review of a frozen
batch. A worker must name owned files, output and stopping condition. Do not
duplicate the same exploration, test run or review.

Defer full governance expansion, extra AVL lanes/showcase work, new abstraction
layers, raw EVM receipt-proof machinery and release-polish packets that do not
serve the selected boundary. Governance drills remain due for the chosen
federated trust model. Gate 6 is not the Chain zeta / Phantom Burn fix;
Phase 011 / Gate 5 is the separate cryptographic closure path.

## Architecture And Claim Boundaries

The [layered architecture](../docs/layered-reference-architecture.md) remains
normative. Source-neutral Ergo settlement primitives and relayer orchestration
stay in their cores; concrete Substrate/GRANDPA V1 semantics stay in a static
profile; adapters implement capabilities; the composition root assembles them.
No core imports an adapter, settlement core imports no relayer/profile,
profiles import no relayer/adapter, and dependencies remain acyclic.

Substrate/Frontier supplies EVM execution and commitments, not the final trust
layer. The versioned `bridge_event_root` / `burn_root` direction under Ergo
`0x0401` remains; an anchor proves committed bytes, not source finality.
V1 bytes, domains, IDs, digests, vectors and ErgoTrees remain unchanged. A
`proofSystemId` cannot reinterpret statement semantics; reserved STARK ID `2`
stays fail-closed until the separate activated consumer exists.

The ERG lane remains unchanged. Tokens, alternative source consensus, privacy
and aggregate STARK settlement require their own reviewed profiles. SQLite is
a reconstructible cache. No adapter, boolean, journal row or receipt alone
authorizes mint or payout. Observe, construct, check, sign, authorize,
transport and confirm remain distinct.

## Definition Of Institutional Quality

FED-7 requires both directions under the disclosed enforced trust model, exact
global replay and conservation, bounded finality/reorg policy, recoverable
operations, tested dependency boundaries, reproducible source/VM/system
checks, independent review and profile-correct evidence. No critical/high
finding may be hidden or unowned. Historical authorities must be accounted for
under the selected launch mode before new funds authority exists.

A locally simulated operator is not independent custody; local vectors are
not target acceptance; target acceptance is not canonical confirmation.
A federated reference can be useful without being trustless. Neither a
federated nor a trustless reference becomes production-ready through naming,
test counts or a green CI run.
