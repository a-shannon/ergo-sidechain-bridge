# Bridge delivery plan review

Reviewed baseline: `29ec91ead68ab6d2353851169080ab772e9b4f6f`.
Scope: delivery strategy, source-level consumer boundaries and recorded
evidence. This review did not replay a node campaign or re-audit the protocol.
The [execution plan](../phases/bridge-execution-plan.md) remains the only queue.

The architecture is a credible basis for the selected federated reference.
The remaining sequence needed correction: one successful fresh round trip
does not yet demonstrate repeated operation, recovery or use by an unrelated
team. Those are the next delivery obligations.

## Objective and retained direction

The [ultimate objective](ultimate-bridge-objective.md) has two horizons. First,
an external engineering team must be able to reproduce, audit, operate and
adapt an Ergo-settled sidechain from the repository. Later, measured batching,
parallel settlement and developer integration must substantiate the proposed
advantages of eUTXO settlement. FED-7 closes the first federated reference
milestone; it does not establish every long-term scaling or trustless claim.

The first delivery is a new greenfield sidechain. Existing-chain migration is
not its prerequisite. Its authenticated non-instantiation history, empty replay
derivation and accounting for every legacy authority remain mandatory.

Keep the FED/STARK separation. The two explicit federation roles make the
current trust boundary reviewable without depending on an activated STARK
consumer. Commitment inclusion does not establish source finality. STARK/Gate 5
remains a separate blocked upgrade, reopened only on its exact dependencies.

The completed work is useful: non-refundable backing before mint, exact native
burn/checkpoint binding, separate external fees, replay-state transitions,
bounded transport authority and contained ambiguous outcomes all serve the
actual value paths. Pinned builds, isolated negative tests and independent
reviews support those boundaries. Their unchanged evidence should be reused.

## Findings affecting the remaining path

1. **The native root demonstrates first-cycle behavior.** Its
   [return consumer](../relayer/src/apps/bridge-daemon/substrate-federated-genesis-target-root-v1.ts)
   requires one leaf, leaf index zero and event index two, takes the tracker
   predecessor from genesis issuance, and returns reserve/DUP successor IDs
   without consuming them in another cycle. Campaign 23 therefore does not
   close repeated operation. The next runtime join must process another
   deposit/mint/burn/payout from live successor state on the same fresh chain,
   preserve previous replay keys and check cumulative conservation. This is a
   missing delivery proof, not a demonstrated theft or replay vulnerability.

2. **Evidence consumers must be specified before final evidence is produced.**
   The existing [release gate](../relayer/src/release-gate.ts) includes a Gate 3
   live-preflight contract naming `authenticated-external-fee-v1`. The plan
   already prohibits relabelling that evidence as FED, but previously placed
   the producer/validator join last. Identify compatible consumers and required
   separately versioned FED handling first. This does not authorize weakening
   the gate, changing statement semantics or declaring an existing gate closed.

3. **The external entry point still serves source audit.** The README documents
   `audit:alpha`; the ordinary daemon remains contained. The native target root
   is a TypeScript composition API, while the successful campaign used a
   separately prepared invocation. An operator package must supply a documented
   invocation and prerequisites, consume the selected lifecycle and recovery
   path, and work without private campaign scripts or historical custody. A
   fresh external reproduction is the deciding usability evidence.

4. **Environment assumptions can cause late rework.** The
   [source baseline](consensus-source-baseline.md) explicitly records unresolved
   cross-root build independence. The local Ergo path uses a tracked mining
   overlay; it does not demonstrate operation with unmodified nodes, miners or
   a public network. Pin the supported environment and separate candidate
   production from validator compatibility. Use the smallest exact-artifact
   check to resolve any compatibility claim before a long target rehearsal.
   A build mismatch must not be fixed by silently accepting different pins.

5. **Status documents were directing readers back to completed work.** The
   README still described LAB/TestClient mint and native mint integration as
   pending. It now reflects Campaign 23. The plan's historical narratives
   retain their evidence boundaries but are separated from the executable
   queue. Broader objective and release documents contain older status and
   legacy evidence contracts; reconcile those in the FED acceptance batch,
   without treating historical prose as current implementation authority.

## Delivery sequence and stopping conditions

The revised queue first fixes the FED acceptance consumers and supported
greenfield environment. It then closes successor-based normal operation,
followed by recovery on that accumulated state. Prepare the operator entry
point in parallel and use it for the next distinguishing full rehearsal after
its changed consumer boundaries pass focused checks.

The second cycle must occur within a wholly fresh campaign, never by reopening
Campaign 23. Each action retains its own current target, custody and transport
authorization. No retry may reuse an ambiguous attempt. Restart recovery may
reconstruct observations and cache state, never destroyed keys or authority.

Required recovery cases include restart, DB loss/rollback, divergent RPC,
out-of-order observations, reorgs, stale successors and cross-profile input or
replay collisions. Greenfield selection defers migration import; it does not
remove these rejection obligations. Operational federation role-loss,
rotation and alert/recovery drills remain due for their applicable claims.

The package needs a separate-root build/runtime check and a fresh external
integration review. Hosted independent code review and simulated local actors
do not prove organizational custody. Missing participants block the relevant
external acceptance claim while local engineering can continue.

Measure costs and limits for the selected single-lane path. Defer generalized
migration, extra profiles, broad abstraction changes and scale demonstrations
until a chosen consumer or measured limit needs them. Preserve batching and
sharded-lane benchmarks as later obligations before comparative performance
claims; the ultimate objective's proposed superiority remains to be tested.

## Review and validation scope

Two bounded independent reviews examined plan sequencing and public consumer
entry points. The successor constraint was checked directly in the native root;
the legacy evidence discriminator and cross-root limitation were checked in
their owning source and documentation. Recommendations are scoped to those
inspections and the recorded Campaign 23 evidence, not fresh runtime execution.

This documentation batch changes no contracts, runtime code, formats, domains,
quorums or authorization rules. Its due closure is the documentation claim/link
checks, exact diff review and publication guards. Existing runtime, build and
CI evidence keeps its original input scope; a documentation review does not
justify replaying those expensive gates.
