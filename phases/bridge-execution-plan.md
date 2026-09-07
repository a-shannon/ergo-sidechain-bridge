# Bridge Execution Plan

Updated: 2026-09-07

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
  mint, burn, application checkpoint production and funded V2 tracker admission.
  The mint consumer used a source-locked TestClient. This does not establish
  an enabled operational mint route or a completed withdrawal.
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
  never a fallback. An earlier composed campaign reached one local tracker
  transport attempt. The node returned HTTP 400; the transaction was not found
  in 85 observations over its 120-second confirmation budget. No acceptance
  of that submission or canonical tracker admission was established.
- A later fresh campaign stopped earlier because generated and node-accepted
  chain specs differed. An offline reproduction isolated a lost 81,920-byte
  output block to the Windows process wrapper, without Frontier execution or
  JSON parsing. Direct inherited output handles remove that intermediate
  forwarding step while preserving process containment and output limits.
  The exact-file replay passed 24 transfers and the retained Frontier binary
  passed 38 semantic chain-spec comparisons. This repairs a local execution
  prerequisite, not tracker admission. A fresh campaign using that runner
  reached confirmed external-fee funding and the frozen tracker check, then
  failed during admission authorization's header reobservation. The Ergo API
  returns oldest-first headers; that consumer passed them to a newest-first
  context builder without reversing the window. Its HTTP fixture had also
  used the wrong order. The correction reverses a copied API window before
  anchor selection and preserves canonical header, lineage, frozen-context and
  input checks on both nodes.
- A fresh campaign at `1e00dffd000d2dc1152c6135eb6c06a3306339e9`
  completed with `local_tracker_v2_canonically_confirmed`. External fee funding
  confirmed at height 197 before the admission window was fixed. Tracker
  transaction `98e12cdc5946ebae0a64b1fbcd6cb23f1e4a928ad20977cb4872522b389008d4`
  was accepted and confirmed at height 219; the confirmation phase finished at
  height 230. The terminal receipt digest is
  `2c53a381bc2e815caa9d7dd910c57e871ad1e230342d3e7d81cced22de93fc66`.
  Its request digest and source HEAD were checked, and all owned processes and
  target listeners stopped. This closes local funded tracker admission only.
  The campaign disposes its custody on return; its receipt cannot resume a
  withdrawal or authorize payout. The next fresh campaign must retain the
  required custody and live target through the withdrawal consumer.

## Critical Path

Choose **greenfield or migration** for one exact target before provisioning.
Both require authenticated history and exact authority/replay lineage. A
greenfield launch needs the reviewed non-instantiation baseline and derived
empty replay root; a migration needs paid-burn import and closure of every
legacy authority. Neither a fresh DB nor an empty UTXO view proves greenfield.

```text
frozen foundations + selected launch mode + fresh-owner application execution
  -> exact tracker transport and canonical admission [local campaign passed]
  -> burn/checkpoint binding + global DUP insertion + external-fee payout
  -> composed two-way recovery and operational integration
  -> exact target/custody activation and operational rehearsal
  -> profile-correct evidence + final independent assurance
  -> FED-7 federated reference package

separate upgrade: activated Ergo verifier -> WP-06-STARK -> Gate 5
```

| Order | Boundary | Next concrete action | Completion evidence / blocker |
|---|---|---|---|
| **Now** | Checked withdrawal -> canonical payout | Connect the complete withdrawal checker to explicit authorization, reservation of all three inputs, immediate revalidation and one-shot transport inside the owned campaign | Local funded tracker admission passed; the managed withdrawal-check caller is composed and tested. Fresh-node withdrawal acceptance and canonical payout remain open. Reserve decrease equals burned liability, not liability plus miner fee |
| 2 | Both value paths -> recovery | Exercise the selected FED identities through restart, DB loss/rollback, divergent RPC, out-of-order events and reorgs; integrate the operational application root | Recovery holds remain non-authorizing; no repeated mint/payout, no reconstructed funds authority and no restoration of retired legacy paths |
| 3 | Local reference -> target operation | Complete exact non-mainnet target, role custody, approval, key-loss/rotation and alert/recovery rehearsal | Local actor simulation remains useful but does not prove independent custody. A missing external participant blocks only that operational claim, not local engineering |
| 4 | Working FED profile -> FED-7 | Bind the completed lifecycle to its own evidence producer/validator, clean checkout and final independent review | No relabelling of legacy `authenticated-external-fee-v1` evidence as FED. Close every claim-relevant blocker before supported release |

## Next Executable Batches

| Batch | Owner / dependency | Completion contract |
|---|---|---|
| V2 withdrawal transport and confirmation | Depends on the checked withdrawal and its still-live custody/target | Bind explicit LAB authorization, all three input reservations, fresh revalidation and one-shot transport to the exact checked transaction. Confirm spent predecessors, reserve/DUP successors and payout against canonical history. Keep ambiguous transport outcomes non-retryable; a journal row or prior campaign receipt cannot restore authority |
| Fresh complete withdrawal campaign | Depends on the composed check/transport/confirmation path and its independent review | Use fresh synthetic ownership and the actual application burn. Fund both distinct fees before fixing the tracker window, admit the tracker, check and transport the withdrawal once, then verify canonical payout and reserve/DUP successors. Do not insert an intermediate funding-only or checker-only fresh-node campaign |

The dedicated withdrawal-fee funding API binds DUP-genesis operator change
output 1, separate authorization and response domains, and its own closed
durable operation discriminator. It composes checking, reservation, one-shot
transport and confirmation without spending reserve backing. Journal input
holds cover every other operational profile in both directions. Old database
schemas do not acquire withdrawal authority through automatic migration.
Fee confirmation reobserves canonical inclusion and depth after reading the
fee outputs, because re-inclusion can preserve their bytes.

This is a component boundary exercised with fresh local signatures, SQLite
and loopback HTTP fixtures, not a completed withdrawal or a fresh-node funding
campaign. Its confirmation API does not turn local RPC agreement into an
independent consensus proof. Wire this API into the retained withdrawal
consumer before the next fresh-node run; do not insert a funding-only campaign
or recreate historical tracker evidence.

The setup session now has an explicit retained-withdrawal route. It derives
the complete V2 transaction from the original compiler, deposit reserve
successor, exact DUP genesis, distinct fee output and admitted external-fee
tracker successor. All four boxes are observed on both nodes before and after
the check; the four creating transactions must remain canonically confirmed.
The signer closes after this one check, on failure or on invalid concurrent
use. The existing tracker-only route still closes immediately after its check.

This checker covers the fresh setup's exact empty DUP lineage, not arbitrary
migration history. Its composed tests use genuine compiler/signing/check
implementations against synthetic HTTP chain state; they do not establish a
fresh-node withdrawal. The returned check is not payout transport or broadcast
authorization.

The managed campaign now has an explicit withdrawal-check entrypoint. It
confirms the distinct withdrawal fee before tracker funding and window
selection, derives the leaf from the process-proven application burn, and
matches its root/count to both producer evidence and admitted statement. The
original session checks the full withdrawal inside the still-owned tracker
confirmation callback. The tracker-only entrypoint and receipt remain separate.
The new receipt records a checked transaction, not payout authorization or
confirmation, and gains process provenance only after owned-resource cleanup.
These caller tests establish orchestration; no fresh-node withdrawal acceptance
is claimed. Connect transport before the next fresh-node campaign.

Then connect the operational mint caller, exercise both directions through
recovery, and finish target/custody rehearsal and FED-7.
A source-locked TestClient mint is not the operational mint route. Synthetic
withdrawal construction is not a completed exit. Do not omit either consumer
from the final delivery contract.

## Reference Checkpoints

The fixed V2 command loads its worker inside the command error boundary and
returns the original process-provenant V2 campaign receipt, not a relabelled
V10/V11 envelope. The worker loads the exact canonical request, rejects journal
overlap with source/artifact paths, then executes request-bound preflight before
entering the V2 root. It checks disjoint external roots, explicit Cargo cache
selection and request/HEAD/peg-in equality. Same-process entry tests
exercise real owner claim and disposal through the root up to the build boundary;
external preflight/build effects are simulated. A standalone invocation without
creator custody remains fail-closed. No operational mint or payout is enabled.
The fresh campaign recorded above now supplies the local tracker acceptance
evidence. A changed campaign must regenerate artifact identities at its clean HEAD.
The source archive covers these scripts; the existing compiled runtime archive
does not include the campaign as an entrypoint. This remains source execution
on a trusted local host, not authenticated loader/dependency execution or
resistance to hostile same-user mutation. No artifact format or protocol pin
changes are required solely to add this caller.

The tracker V2 campaign composition now connects the existing components in one
owned lifecycle. It consumes the PacketV3 portable replay continuation, prepares
V3 genesis and the V2 deposit, runs the fresh-owner application and confirms
external-fee funding before attesting the checkpoint window. Original compiler
receipts are retained while the preparation target is alive. The later frozen
target owns tracker checking, authorization and reservation; distinct freshness,
transport and confirmation phases consume the corresponding V2 capabilities.
Failure at a phase stops its downstream actions. Cleanup attempts every acquired
resource and withholds successful receipt provenance if teardown fails.
The campaign uses a separate receipt schema and domain; historical V10/V11
bodies remain unchanged. Direct tests establish orchestration with simulated
external effects, not actual node execution. The fixed worker/CLI selects
this root, whose local canonical admission is now recorded above. Withdrawal
must consume the admitted state inside a fresh campaign's live target lifetime.

The V2 launch join has passed its affected checks and independent review.
Genuine V2 compiler receipts and source history produce an explicit
`ergo-local-devnet` descriptor, a separately domain-separated launch statement,
one source-session quorum signature, its verified baseline and the three genesis
payloads. The retained target binds local mint-proof and checkpoint signatures;
foreign-family and copied evidence reject. These tests simulate upstream node
observations, not a canonical campaign. The session remains one-shot across
launch versions. Six complete historical V1 artifacts remain byte-identical.
The new PacketV3/SessionV4 route now selects the actual V2 contracts, compilers
and launch family. Portable replay V2 reconstructs the source-quorum-signed
statement and all three unsigned genesis transaction identities. Its continuation
is process-owned and single-use. Cross-version, copied, modified-artifact and
invalid-signature inputs reject. Packet-bound mint/checkpoint continuation uses
the retained source session; old PacketV2/SessionV3 remains the V1 tracker route.
The composed positive runs the real JVM compiler pair with synthetic upstream
observations and archive production. Session lifecycle tests use compiler-family
mocks. Complete V1 provisioning and replay outputs are byte-identical to the
preceding commit. No target admission, activation or funds authority is established.
Application continuation V4 now selects PacketV3/SessionV4 and requires fresh
application-owner custody. The proof-bound signer V2 preserves the exact
packet, source proof, mint identity, owner and Ergo recipient through the three
signed calls. Runner V3 receives those inspected calls and the same source
proof; its burn supplies the checkpoint fields. The root receipt has a separate
V4 schema, digest domain and process provenance. The old V3 root and V1 signer
remain the PacketV2 route; there is no automatic fallback. Component tests
exercise both routes, real synthetic application signing and lifecycle
rejection. Packet/compiler/runner observations in the root tests are bounded
fixtures, not a Rust execution or target-node campaign. The fresh campaign
recorded above used the managed caller's selected V4 route.
The confirmed-deposit chain now has a V2 mint draft with all five compiler
bindings, derived from the exact setup-bound candidate and reserve observation.
Its collector retains that draft, candidate, observation, target and deposit
packet, revalidates their lineage and permits one consumption. PacketV3 and its
signed V2 target require the V2 draft; the old route requires V1. The
source-proof consumer compares each compiler binding with that signed target
before consuming evidence. The canonical V4 mint statement and source-proof
wire formats are unchanged. The new draft
has its own schema and digest domain; generic evidence and outer mint-proof
receipts keep their existing byte-collection and attestation semantics. These
receipts do not activate a runtime profile, authorize an operational mint or
prove Ergo consensus.

The V3 setup now retains its exact V2 compiler provenance for deposit
construction. Its caller can construct the source-lock and reserve-transition
transactions from the setup's own reserve output, with matched family, asset,
amount, deposit insertion and external fees. V2 deposits have a separate packet
identity; V1 receipts and packet provenance remain unchanged. Construction does
not prove canonical consumption or authorize minting. The V3 setup now retains
one synthetic signer through the V2 source-lock and reserve-transition checks,
then external-fee funding and tracker checking. The same deposit packet must
match the setup's compiler lineage and exact reserve predecessor at both checks.
Idle disposal, concurrent use, failed checks and changed targets close the
session; each inactive state uses the same idempotent cleanup routine. As on
the historical route, disposal during a running operation throws without
invalidating that operation. The composed test
uses genuine V2 compilers, WASM signing and a bounded loopback check oracle,
then traverses tracker admission against simulated state. It is not node/JVM
acceptance or canonical confirmation. Existing generic check-receipt schemas
remain byte/target/signer-bound checks, not V2 lifecycle or transport authority.
The historical campaign caller retains its old packet, deposit authorization,
observation and tracker paths. The separate V2 composition selects the new
consumers; its fixed worker/CLI completed the local tracker campaign recorded
above. Fresh execution is next due for the changed withdrawal consumer.

The managed setup session now exposes that V3/V2 execution sequence through
its existing signer and mining-credential ownership boundary. Separate phase
states prevent old and new checks from being interleaved. The wrapper retains
the exact arguments and results through deposit and external-fee checking,
then closes signer custody after the tracker V2 check. Disposal or a failed
transition revokes unclaimed capabilities; already claimed node credentials
keep their existing process-owned lifetime. This session connection does not
switch the campaign root, confirm fee funding or admit a tracker by itself.

The deposit authorization and output observers now accept genuine V2 candidates
through explicit V2 entrypoints. Source-lock creation retains its exact checked
bytes and funding observations. Its output observer refreshes confirmation
before and after box reads and requires one unchanged dual-node tip; re-inclusion
during the read or a moving/replaced tip rejects without issuing an observation.
Reserve transition additionally requires the
same candidate/setup/packet as the source-lock observation, fresh signed-byte
checking and exact unspent inputs. After confirmation, the observer requires
spent transition inputs, the exact reserve successor and the existing ancestry
depth policy. Private provenance and target bindings are rechecked after async
operations. Generic observation, authorization and journal formats retain their
existing transaction-bound semantics; they do not become V2 mint authority.
The V1 candidate entrypoints remain separate. Component fixtures exercise these
joins with synthetic custody and bounded node oracles, not a canonical campaign
or independently verified Ergo consensus.

The V2 admission lifecycle now connects a genuine session-owned two-input check
to explicit isolated-devnet authorization, durable reservation, revalidation,
fixed transport and confirmation. Private process lineage binds each phase to
its predecessor. The journal cannot recreate authorization or a transport
outcome; confirmation rechecks exact successor bytes and fresh canonical
inclusion/depth after observation. Component tests use real WASM signing and
SQLite with bounded loopback HTTP fixtures. A separate fresh-node test covers
managed process lineage, without submitting the tracker transaction. These
component results do not establish canonical tracker admission. The completed
fresh campaign above supplies that separate local execution evidence.

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
construction, not canonical tracker admission, operational signing authority
or a completed exit.

The separate offline V2 JVM matrix verifies the reserve, DUP and synthetic
fee signature against the same full transaction. Its positive and seven
isolated negatives cover payout substitution, replay, liability drift, fee
redirection, missing context and absent/stale fee proofs. The fixture consumes
genuine V2 compiler receipts and pins its serialized bytes and JVM dependencies.
This is synthetic VM acceptance, not canonical state or target-node acceptance.

The ordinary fixture tests run without a JVM. To reproduce the opt-in matrix,
use Node 24.14.0, set `JAVA_HOME` to the pinned Microsoft JDK 17.0.19+10 and
`BRIDGE_V2_JVM_SCALA_COMPILER` to an existing Scala 2.12.20 compiler JAR, then
run from `relayer`:

```powershell
$env:BRIDGE_V2_WITHDRAWAL_JVM = '1'
npm.cmd test -- --run src/substrate-federated-burn-settlement-v2-acceptance-fixture.test.ts
```

The test rejects mismatched executable/compiler/dependency hashes. The opt-in
matrix is not part of default CI coverage; no resolver or node is started.

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
3. Use the cheapest decisive check first. For the withdrawal boundary,
   reuse the frozen V2 constructor and JVM matrices while their inputs match.
   Exercise retained custody, distinct external fees and exact predecessor
   reobservation before the next complete fresh-node campaign. Its new inputs
   still require fresh checks; historical admission cannot authorize payout.
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
