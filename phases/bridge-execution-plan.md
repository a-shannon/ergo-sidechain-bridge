# Bridge Execution Plan

Updated: 2026-09-05

This is the single active continuation queue for the Ergo sidechain bridge.
The deliverable is a reproducible open-source reference that an institution
can use as the engineering base for its own Ergo-settled sidechain.

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
| **Now** | FED-6-LAB checked tracker -> transport -> canonical admission | Bind the inactive V2 stable-anchor contract to a distinct compiler identity and absolute-height transaction builder; reproduce its signed-window matrix through the exact WASM/JVM bytes before integrating target checks and transport | V151 passes nine pinned JVM prototype tests: one signed transaction survives eight descendants, then rejects anchor eviction; same-profile V1 fails after one descendant. This is input-script evidence, not V149's HTTP 400 diagnosis or node admission. Keep V1 bytes and semantics frozen; no V1 receipt relabelling, campaign retry or signed-byte mutation |
| 2 | Checkpoint -> complete withdrawal | Compose the observed checkpoint with its burn, global replay insertion, reserve successor and externally funded miner fee | One full positive transaction and isolated negative cases; exact JVM/node acceptance and, under separate authorization, canonical confirmation. Reserve decrease equals burned liability, not liability plus miner fee |
| 3 | Both value paths -> recovery | Exercise the selected FED identities through restart, DB loss/rollback, divergent RPC, out-of-order events and reorgs; integrate the operational application root | Recovery holds remain non-authorizing; no repeated mint/payout, no reconstructed funds authority and no restoration of retired legacy paths |
| 4 | Local reference -> target operation | Complete exact non-mainnet target, role custody, approval, key-loss/rotation and alert/recovery rehearsal | Local actor simulation remains useful but does not prove independent custody. A missing external participant blocks only that operational claim, not local engineering |
| 5 | Working FED profile -> FED-7 | Bind the completed lifecycle to its own evidence producer/validator, clean checkout and final independent review | No relabelling of legacy `authenticated-external-fee-v1` evidence as FED. Close every claim-relevant blocker before supported release |

The build investigation recovered the complete historical base spec from its
original source root. A different raw-LF root produces a different, internally
reproducible runtime. The nested build's absolute source-path identity is a
separate input from remapped source strings. Same-root reproduction is not
portable reproducibility or semantic equivalence between the two runtimes.

V149 selected the separately reproduced LF profile, with its own spec, runtime,
genesis and downstream proof identities. Independent review checked that join;
the campaign passed exact reconstruction and reached tracker transport. It did
not inherit historical runtime evidence. Keep raw source checks and exact
selected-profile reproduction. Portable build identity remains an institutional
delivery obligation, not a reason to repeat the resolved local build diagnosis.

The current blocker is tracker admission: HTTP 400 followed by
`not_found_at_deadline`. The stdout failure projection retains the response
digest, not a raw error body; no successful worker-receipt file was produced.
It does not decide whether request decoding, transaction validation or another
node policy caused the response. Do not retry V149,
inspect its terminal mutable state, infer a cause from the status alone, or
extend the confirmation timeout to turn absence into acceptance.

V150's reduced JVM matrix reproduces the temporal binding: context key `2`
selects a header by index, and that header's ID and height enter the AVL value.
With the transaction and input box unchanged, one descendant header causes
rejection even when the selected headers carry the same extension root. A
height-only control passes; reselecting the original anchor in an unsigned
diagnostic candidate restores reduction to the federation threshold. That
changes the transaction ID and is not a repair for an already signed candidate.
The current contract, profile and golden transaction bytes are unchanged.

The no-network test exercises the real check and checked-submit consumers
through Axios's actual request transforms. The synthetic bodies and headers
match; isolated body and content-type mutations are detected by the test oracle.
Signer provenance, authorization and journal operations are explicit doubles.
This establishes neither actual V149 wire bytes nor target-node acceptance.

The diagnostic checkpoint passes 11 pinned JVM tests and 34 focused TypeScript
tests plus type checking. Its matrix also corrects shared-header mutation in an
older negative fixture and distinguishes typed-register failures from Boolean
rejection. Only the test runner's exact input pins and required LF attributes
were refreshed; the fixture change is its synthetic provenance field, not
transaction, input, contract or commitment bytes. Do not shift signed context
bytes, weaken anchor checks or label an old check as fresh node admission.

### Stable Anchor Contract Prototype

V151 introduces an inactive `SPVTrackerSubstrateFederatedV2.es` candidate.
Context key `2` means an absolute anchor height only for this new contract;
V1 retains its indexed selector. Checkpoint statement V1 and the 370-byte AVL
value keep their existing meanings and domains. A different compiled tree is
not a V1 compiler receipt, activated profile or migration authorization.

| Invariant / consumer | Deciding prototype check | Limit |
|---|---|---|
| Absolute height -> current header -> tracker insertion | One frozen signed transaction across descendant windows; height, range and arithmetic-boundary negatives | Only headers supplied by the JVM context, not source finality |
| Selected header ID and extension root -> exact AVL successor | Same-height replacement with the same root; changed-root and missing-header cases with coordinated AVL values | Rebuilding an unsigned fixture for a negative is not a repair of signed bytes |
| Compiled federation -> signing and verification | Actual synthetic 2-of-3 proof, insufficient-witness rejection and message/signature mutations | Source attestations, independent custody and target-node admission remain separate |
| Admission horizon -> temporal rejection | Expiry and anchor eviction reject the frozen signed transaction | No extension of the validity window or transport retry |
| Versioned contract -> downstream construction | Distinct compiled identity; V1 comparison under the same synthetic profile | No operational compiler, builder, registry or transport accepts V2 in this batch |

The focused JVM matrix passes nine tests against the pinned Sigma interpreter.
It compiles the complete candidate, signs with synthetic actors and verifies
the same signed bytes at baseline and after each of eight descendants. Eviction,
same-height fork replacement, changed extension root, missing header, extreme
height, expiry, insufficient quorum and signature/message drift reject. A
selected-height guard mutant admits the otherwise coordinated negative,
isolating that predicate. Same-profile V1 signs at baseline but rejects after
one descendant.

This checks the input script, not a fee-funded, stateful node transaction.
The next integration must bind a distinct compiler identity and absolute-height
builder, prove the exact WASM/JVM signed bytes, then test node decoding, version
reparse and admission. Do not relabel a V1 receipt or activate V2 through the
prototype fixture. Type checking and import-boundary checks pass; unchanged
V1 runtime and campaign evidence remain reusable only within their old scopes.

The immediate campaign remains isolated and synthetic. This plan does not
authorize public-network operations, real funds, existing secrets, a bypass of
ContextExtension guards, or node-wallet signing. Signing, checking, submission
and broadcast retain separate exact-candidate authorizations and revalidation.

### Fresh-Owner Application Join

| Batch | Deliverable | State and deciding check |
|---|---|---|
| 1. Exact calls | Build mint, bounded approval and peg-out from the canonical reservation statement and Ergo recipient; check canonical signed bytes, fresh signer, chain, nonce, fees, value and complete calldata | Implemented in `substrate-federated-isolated-devnet-frontier-application-transactions-v1.ts`, with focused signed-vector tests; runner V3 uses this pure inspector. The planner itself is not an execution capability |
| 2. Rust consumer | Execute those exact signed calls in the pinned TestClient, with fresh owner authority and gas funded by actual setup transactions; derive receipts, burn and commitment from execution | Implemented in [overlay 0003](../sources/frontier/0003-federated-lab-signed-application-calls.patch). Four signed-call checks and one fresh-owner execution pass under an ephemeral source-attestation profile; the separate reference-profile regression passes eight tests with the dynamic entry ignored. Independent source review is complete. Runner V3 selects this exact ignored test; V149 traversed this consumer before reaching tracker transport. Execution remains a source-locked TestClient result, not an operational mint route |
| 3. Request custody and signing | Retain synthetic signing custody from request creation, freeze calls after the exact mint proof exists, and deliver only the scoped signed bytes to the application consumer | Canonical request creation, one-shot V11 custody claiming and proof-bound signing are composed into the retained-packet root. Signing checks genuine packet/proof provenance, receipt/target bindings, statement and mint identity, and the retained owner; the existing proof validator checks runtime/profile bindings. It emits one complete, inspected triplet and disposes custody on success or failure. Private key material stays outside runner environment and receipts |
| 4. Signed runner | Carry the exact proof and signed triplet into Rust; bind the result and restore the temporary source changes before issuing a process receipt | Runner V3 and evidence V2 are implemented with separate identities. Calls, proof environment, exact test and all three patch pins enter the execution digest. Both temporary overlays are restored on success or failure; unexpected source changes are preserved and rejected. Component tests use explicit I/O doubles; V149 subsequently traversed the real runner before tracker transport, without establishing tracker admission |
| 5. Retained-packet composition | Connect batches 3 and 4 through the actual campaign packet, owner and Ergo recipient | Implemented with explicit runner-version provenance, setup-signer revalidation around signing, retained owner/recipient checks and one-use cleanup. V149 progressed through this route to tracker transport; HTTP 400 and absent confirmation leave tracker admission open. Preserve component negatives and diagnose that downstream boundary before another complete run |

Batches 1 and 2 close the local signed-call producer/consumer boundary, not the
composed campaign. The consumer executes the supplied bytes without re-signing
them and checks their transaction hashes, successful receipts, reservation
consumption, supply change and emitted burn commitment. Its setup transactions
establish ownership and the fresh owner's gas balance; mint and burn state are
not substituted in storage.

Signatures bind their EVM calls, not every field of the source statement,
Ergo consensus or the execution environment. Synthetic source attestations in
the component test are not source-chain evidence. The composed runner must
separately verify the exact source-proof object and its request/target/runtime
bindings. Calls use the reviewed LAB chain ID and gas policy, fresh-owner
nonces 0/1/2, zero native value and a 15,000,000 nanoERG mint/approval/gross burn.
The Rust setup establishes that owner prestate before executing those calls.

The request producer retains the synthetic key only in process memory; public
JSON contains the address and a fixed unreserved-mint rejection probe. A copied
object or reloaded request cannot restore custody. A failed initial binding
disposes the handle; rejected rebinding preserves its original request. This is
request provenance, not mint authority. The file-only CLI cannot reconstruct
that handle. The pending-request registry retains custody until claim or
explicit disposal; a garbage-collection cycle cannot silently lose the key.
The creator must dispose abandoned requests. V11 requires the creator and campaign to run in one process,
claims custody against the verified campaign request digest before building,
and retains the original handle in the packet continuation. Build, constructor,
packet and proof failures dispose it. Explicit V10 reference behavior is not
an error fallback for V11.
Binding occurs before create-only publication. If the subsequent file check
fails, no live handle is returned; a public file may remain. Recovery requires
a fresh owner and output path, not custody reconstruction or deletion of a
possibly replaced file.

The LAB chain's genesis includes the bridge owner's address in EVM storage.
Its hash therefore cannot be calibrated with one owner and then used with a
newly generated owner. The two-stage request session creates that identity
first and exposes only its public address and fixed rejection probe for
calibration. It then creates one canonical request with the same retained
owner and the calibrated genesis hash. Request preparation failures dispose
custody; a duplicate creation attempt cannot invalidate the first valid
request. The caller must dispose the session if calibration or campaign setup
fails. The session does not perform calibration or authenticate a caller's
genesis claim; the existing source-locked acceptance checks remain required.

The fresh-owner driver must invoke the exported V11 worker in that same
process after request-bound preflight. The file-based V11 command starts a
child process and cannot transfer the parent's retained custody; it is not a
usable fresh-owner entry point. Do not export a key to make it work. The
same-process route retains the worker/root checks and distinct Cargo caches,
and produces the existing worker receipt, not a command receipt claiming a
child has exited. Verify the selected entry point through the actual root's
one-shot custody claim before launching the composed campaign.

The bootstrap request SHA and source-proof request digest identify different
objects; they must not be compared as interchangeable identities. Their join
is the same-process campaign and retained packet, followed by exact proof
provenance and field checks. The signing component uses the existing pure
planner and signed-byte inspector. Its adapter accepts only the three fixed
LAB calls; it cannot choose proof eligibility or expose a general signer.
Static imports reserve the signer to proof composition and that composition to
the retained-packet application root. Tests use real synthetic keys and signed
transactions; mocked packet/proof provenance isolates the composition checks
and is not cross-chain proof acceptance evidence.

The root passes the campaign's exact Ergo recipient and source-proof object
alongside the signed calls into runner V3. It preserves bootstrap request,
packet, target and runtime lineage without reconstructing authority from
serialized receipts. Setup-signer provenance is checked before and after
signing; a revoked binding prevents either runner from starting. Signing
consumes owner custody, so later checkpoint attestation uses retained proof
and execution provenance, not a demand to recover the key. The outer root
receipt remains V3; its nested runner receipt explicitly identifies V2 or V3
and requires the corresponding provenance. Unknown versions fail closed.
Component checks do not establish successful campaign execution.

Do not run another full campaign between these batches. Run focused checks
while joining the producer and consumer; reuse the affected Rust matrix while
its source, profile and toolchain closure is unchanged. Reference-profile and
ephemeral-profile checks are separate configurations. A static V1 fixture pass
cannot close the fresh-owner join. Request custody, tracker admission and the
complete withdrawal still require their own execution evidence.

## Continue Protocol

1. Read this queue, Git status and the current task-owned handoff. Preserve
   unrelated changes; do not restart discovery from the full history.
2. Select one independently testable producer-to-consumer boundary, normally
   one to four source files plus direct tests. Name the invariant, expected
   discriminator, owned paths and validation closure before editing.
3. Use the cheapest decisive check first. For the current tracker boundary,
   connect the distinct V2 compiler and builder to the signed-window matrix,
   then compare exact checked/transported bytes with the pinned node's decoding
   and admission rules before starting nodes.
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
