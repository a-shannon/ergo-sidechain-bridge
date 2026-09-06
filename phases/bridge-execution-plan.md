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
- A later fresh campaign stopped earlier because generated and node-accepted
  chain specs differed. An offline reproduction isolated a lost 81,920-byte
  output block to the Windows process wrapper, without Frontier execution or
  JSON parsing. Direct inherited output handles remove that intermediate
  forwarding step while preserving process containment and output limits.
  The exact-file replay passed 24 transfers and the retained Frontier binary
  passed 38 semantic chain-spec comparisons. This repairs a local execution
  prerequisite, not tracker admission. The next fresh campaign must regenerate
  the request and node-build identities against the updated runner pin; old
  campaign custody and receipts remain terminal.

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
| **Now** | FED-6-LAB funded V2 tracker -> canonical admission | Freeze the integrated V2 command at a clean HEAD, regenerate the request-bound artifacts and run one fresh owned-target campaign | The fixed in-process worker selects V4 application/V3 setup/V2 deposits and funded V2 admission. Real fee-box confirmation and canonical tracker admission remain open. Retain fresh request-owner custody in the command process; a public request file cannot restore it. Do not reopen disposed custody, relabel V1 receipts, retry terminal campaigns or mutate signed bytes |
| 2 | Checkpoint -> complete withdrawal | Compose the observed checkpoint with its burn, global replay insertion, reserve successor and externally funded miner fee | One full positive transaction and isolated negative cases; exact JVM/node acceptance and, under separate authorization, canonical confirmation. Reserve decrease equals burned liability, not liability plus miner fee |
| 3 | Both value paths -> recovery | Exercise the selected FED identities through restart, DB loss/rollback, divergent RPC, out-of-order events and reorgs; integrate the operational application root | Recovery holds remain non-authorizing; no repeated mint/payout, no reconstructed funds authority and no restoration of retired legacy paths |
| 4 | Local reference -> target operation | Complete exact non-mainnet target, role custody, approval, key-loss/rotation and alert/recovery rehearsal | Local actor simulation remains useful but does not prove independent custody. A missing external participant blocks only that operational claim, not local engineering |
| 5 | Working FED profile -> FED-7 | Bind the completed lifecycle to its own evidence producer/validator, clean checkout and final independent review | No relabelling of legacy `authenticated-external-fee-v1` evidence as FED. Close every claim-relevant blocker before supported release |

## Next Executable Batches

| Batch | Owner / dependency | Completion contract |
|---|---|---|
| V2 campaign promotion and execution | Main owner; consumes the fixed in-process V2 command, campaign root and managed setup helper | Bind a fresh request to the clean integrated HEAD and regenerate its source/build artifact identities. The request creator invokes `runSubstrateFederatedIsolatedDevnetTrackerV2CampaignFromArguments` in the same process while retaining synthetic custody through owner-dependent genesis calibration; do not spawn a child with only the request file. Confirm fee funding before fixing the checkpoint admission window and freezing the anchor; require the V2 reservation, revalidation, fixed transport and canonical-confirmation consumers. Preserve the old V10/V11 command and receipt identities. No standalone funding/check replay |
| V2 withdrawal target acceptance | Depends on canonical tracker admission and exact reserve/DUP/fee inputs | Feed the V2 constructor with the admitted checkpoint and current predecessor state, then check the complete transaction on the exact target. Synthetic construction and the offline three-input JVM matrix are available; neither proves canonical input history nor authorizes operational signing or transport |

Then connect exact withdrawal transport and the operational mint caller, exercise
both directions through recovery, and finish target/custody rehearsal and FED-7.
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
Promotion must regenerate the artifact identities at the integrated clean HEAD.
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
external effects, not actual node execution. The fixed worker/CLI now selects
this root; a fresh campaign must establish canonical admission before withdrawal.

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
fixtures, not a Rust execution or target-node campaign. The managed caller
still needs to select the new route.
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
prove Ergo consensus. The managed caller still needs to select the new route
before a fresh campaign.

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
consumers; its fixed worker/CLI now requires fresh campaign promotion and execution.

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
results do not establish canonical tracker admission; the real V3 campaign
caller is the next consumer.

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
