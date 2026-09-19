# Bridge Execution Plan

Updated: 2026-09-19

This is the single active continuation queue for the Ergo sidechain bridge.
The deliverable is a reproducible open-source reference that an institution
can use as the engineering base for its own Ergo-settled sidechain.

Apply the [development process](../docs/development-process.md) on every
continuation. Judge progress by executable consumers and confirmed lifecycle
milestones, not the number of intermediate versions.

The first delivery targets a **new greenfield sidechain**. Read Current Focus,
Delivery Contract, Critical Path and Next Executable Batches for current work; the
completed implementation and reference checkpoints below retain scoped
historical evidence. The [September 15 plan review](../docs/plan-review-2026-09-15.md)
and its September 19 follow-up explain the revised sequence and are not a
second execution queue.

The [execution history](bridge-execution-history-2026-09-05.md) retains the
previous package specifications, decisions and checkpoint records. Its old
"next" actions are historical, not a second queue. Use those specifications
when their exact boundary is reached; do not discard their safety obligations.

## Current Focus

Use the [adaptive planning rule](../docs/development-process.md#keep-the-queue-small):
the delivery obligations remain binding, while future batch order and
implementation choices are provisional. Only the current result is detailed.

**Now:** connect the native operator's next reservation/mint/approve/burn
operation to observed nonce and parent state. Start with
`federated-genesis-operator-v1.ts`, `federated-native-reservation-execution-v1.ts`
and their proof-bound caller. Preserve the existing one-shot APIs and durable
ambiguous-attempt holds. The deciding component checks must accept a later
operation on the retained chain and reject stale parents, wrong nonces, mixed
operation receipts, duplicates and disposed custody before further signing or
transport. Stop at that independently reviewed producer-consumer join; the
setup signer's lifetime and reserve/DUP/tracker successor construction remain
separate dependencies before a full two-cycle campaign.

The source-quorum join is implemented: individual mint/checkpoint operations
share retained federation custody and keep the original live target, genesis
and application. The actual caller/root uses exact operation provenance and
checks its lifetime through later tracker/payout waits. Legacy APIs stay
one-shot. Source-level sequential operation tests use explicit boundary
doubles with real codecs and signatures; the composed native tests exercise
one original operation through checkpoint. This is not evidence of a second
complete chain cycle. Exact closeout evidence is in the active task handoff.

The two prerequisite selection decisions are closed below. Compatibility and
release obligations that require new evidence remain open; they do not block
this component join.

### Selected Environment

Use the existing native FED profile on isolated Windows x64 local nodes with
synthetic funds. Frontier is pinned to
`75329a2df49e2cc7981485392c31160929d1bd48`, with patches 0001, 0004, 0005
and 0006 and reconstructed source tree
`8dca3c37da8e24cb37d40c8121465e5d14e8a58c` in
`substrate-federated-genesis-node-build-v1.ts`. Keep the exact Rust 1.82.0
tool identities in `sources/native-verifier-toolchain-lock.json` and the
offline locked `bridge-federated-v4-genesis-node` build recipe.

The local Ergo settlement nodes use base
`2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1` (v6.0.2) and the candidate-recovery
extension-producer patch from `sources/consensus-source-lock.json`; Java,
SBT and process-owner pins remain in
`sources/substrate-federated-isolated-devnet-node-build-lock-v1.json`.
This is a new sidechain against a controlled local Ergo settlement network.
Its miner produces the required extension fields; ordinary Ergo validator
compatibility is a separate property. Campaign 23 demonstrates one roundtrip
with these components, with source quorum 2-of-3 and a separate local admission
signer. It does not demonstrate independent operator custody.

Before claiming unmodified Ergo-node compatibility, test the exact emitted
extension-bearing candidate against the selected unmodified validator; one
rejection stops that claim and identifies the required integration. Before
claiming portable builds, compare a separately built clean-root artifact with
the expected runtime identity; one mismatch stops that claim. Public-network
miner participation, non-Windows support, complete hermetic tool closure and
independent custody are unestablished. No public-network rehearsal is selected.

### FED Evidence Consumers

| Intended claim | Producer and accepting consumer | Reuse / smallest required adaptation | Due |
|---|---|---|---|
| Public research alpha | `audit:alpha` manifest -> `validatePublicAuditReleaseGateProcess` | Keep `public-research-alpha`, supported release blocked, and zero-structural-issue `EXPECTED_BLOCKED`; this does not establish FED release support | Exact source promotion |
| Local FED lifecycle | `runSubstrateFederatedGenesisTargetRootV1` -> direct lifecycle tests | Reuse exact pins, transaction identities, custody receipts and false finality/trustless fields. A durable versioned report must bind the clean candidate and selected environment; direct assertions are not a release consumer | Stable lifecycle and operator entry point |
| Supported FED reference | FED report -> dedicated release-gate profile branch | Gate 3 currently accepts only `authenticated-external-fee-v1 / ACTIVATED / gate3-lifecycle-closure`. Register a separate FED discriminator/schema, validator, release input and checklist binding; preserve the existing branch. Never relabel FED evidence | FED-7 candidate evidence capture |
| Independent FED assurance | Exact-candidate review, recovery, external integration and custody evidence -> applicable Gate 4/6/8 validators | Reuse hygiene, identity joins and reviewer structure. Historical integration evidence and simulated actors cannot establish current external reproduction or independent custody | Final FED-7 promotion |

The final FED discriminator and report schema are selected with their actual
consumer; a gate-wide refactor is not a prerequisite for successor work.

**Next candidate:** consume the first cycle's reserve/DUP/tracker successors
in a second normal cycle. A focused component join can use the pinned local
profile while unrelated release mapping remains open. Reassess the smallest
useful join as the deciding evidence arrives; prepare the invocation where the
work is independent and serves the same delivery result.

The source-quorum operation boundary is now connected. The setup
signer still closes after the withdrawal check, and the operator binds the first
approval/burn nonces and parents. A second cycle needs separately scoped
operation authority under the selected federation/profile as well as observed
successor state. Do not clear consumed flags, reopen a closed signer, recreate
destroyed keys or broaden an old receipt. Preserve the old one-shot APIs;
validate the new operation boundary with focused duplicate, disposed-custody,
foreign-operation and wrong-parent negatives before composing another cycle.

**Replan when:** a batch closes, a deciding assumption fails, or a dependency
changes. Record what was learned and why the next result changed. Preserve the
greenfield choice, evidence limits and safety obligations below; a future
change of approach does not close an unmet obligation.

## Delivery Contract

| Track | Deliverable | Deciding trust model | State |
|---|---|---|---|
| **WP-06-FED** | A complete, reproducible two-way federated reference | A versioned source-attestation Ed25519 quorum and a separately bound Ergo-admission SigmaProp quorum; roles, thresholds and federation epoch are explicit | Active. One fresh local campaign completed the composed native deposit, mint, burn, checkpoint, tracker and Ergo payout lifecycle. Reproducible operator packaging and recovery evidence remain open |
| **WP-06-STARK / Gate 5** | An Ergo-verifiable trustless upgrade | An activated verifier checks the separately versioned statement and finality semantics before value release | Frozen pending a compatible activated target. Not a prerequisite for the federated reference |

Both tracks remain research work; neither supports production use or
deployment with real funds.
Public research-alpha availability, local simulations and green CI do not
establish deployment safety or independent operator custody.

## Verified Baseline

The entries retain their original evidence scope. Campaign 23 is the latest
complete local lifecycle below; older statements about missing mint or payout
describe their respective checkpoints, not the current implementation.

- Integration source baseline: `907e8c8deca5ed51e2c647d9d0b75a3c7e36beb9`.
  Its tree is identical to the preceding green integration
  `8bf745d0922eed301102207d3329902ca6e2194b`; the correction changed Git
  identity metadata, not source behavior. Consult the
  [exact-head CI](https://github.com/a-shannon/ergo-sidechain-bridge/actions/runs/33926887851)
  for promotion status, not for runtime acceptance.
- Local campaign evidence covers setup, a committed reserve, packet-bound
  mint, burn, application checkpoint production and funded V2 tracker admission.
  The mint consumer used a source-locked TestClient. This does not establish
  an enabled operational mint route. The separate completed withdrawal
  campaign is recorded below.
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
- The complete withdrawal campaign at
  `1f2e138fe89233e48bdd58aa5cc7c4cd5816698a` passed with
  `local_withdrawal_v2_canonically_confirmed`. Withdrawal transaction
  `281ac86bf491141cb16aca62145cee14b8eaa6af9428c1214c8578162247092d`
  was accepted and confirmed at height 251. The terminal receipt digest is
  `0a44a96fff4b732dc414b21a29e322135fb74e6f24553daec5e825b0d0f57f85`.
  Payout, reserve and DUP successors were checked on both local nodes.
  The 10,000,000-nanoERG payout reduced reserve value from 25,000,000 to
  15,000,000 and liability from 15,000,000 to 5,000,000; miner fees were
  funded separately. Owned processes and listeners stopped after completion.
  This closes the fresh local withdrawal milestone, not operational mint,
  cross-profile replay cutover, independent custody or Gate 5.
  The campaign reused its raw-verified original Frontier source checkout
  after an offline build reproduced the pinned runtime exactly. Moving the
  same source to another root had changed its WASM bytes; cross-root build
  reproducibility remains unestablished. No artifact pin or guard was relaxed.
- Campaign 23 at `1ca6c3155e43fb0bad2481fb0b37027a2bafa6db`
  completed with `fresh-federated-round-trip-confirmed`. It observed a native
  burn in block 4 with a distinct Ethereum execution hash, then attested the
  matching one-leaf bridge-event root. Distinct withdrawal and tracker fee
  inputs confirmed at Ergo heights 384 and 401 before the anchor at height 464.
  The exact tracker transaction bound into candidate mining confirmed at height
  467, and the 10,000,000-nanoERG payout confirmed at height 488 with checked
  reserve and duplicate-prevention successors. Its owned Frontier processes
  stopped and released their listeners. The terminal local receipt is 58,388 bytes,
  SHA-256 `3d9e4fed79a929727e1a01026b648de280f88f9fe1ebc29568c41c031d4e1456`.
  This establishes one fresh federated local round trip with simulated funds
  and disposable custody. Source finality and trustless verification remain
  false; it is not production or public-network evidence.
- The [dedicated FED genesis runtime](../docs/federated-genesis-runtime.md)
  now passes native full-genesis and first-block integration. Overlay 0004
  installs the exact height-zero V4 profile only after validating its compiled
  federation and fresh application state; public Root activation stays off.
  Eight runtime integration tests, three build-profile tests, all 114 main
  runtime tests and the LAB default genesis test pass. Overlay 0005 now adds
  exclusive node selection and a typed genesis loader that executes the
  compiled FED WASM. Three node tests pass, including the CLI/file path, full
  native/WASM storage comparison and isolated rejection cases. Exact local
  WASM/node build hashes are recorded in that document. The typed provisioning
  producer now derives non-circular identities from pinned application/runtime
  bytes, consumes actual JVM family compilation and emits a height-zero V4
  profile. The built node accepts its full configuration through `build-spec`;
  exact runtime/profile storage and Sudo absence were checked. This uses
  synthetic family inputs, not observed Ergo singleton issuance or usable
  custody. The configured target now also starts two isolated nodes: all 51
  expected raw storage entries match at the same genesis, with V4 enforcement
  and no Sudo. Actual startup required nonempty SDK development consensus
  authorities in SS58 format; these are separate from bridge attestors. The
  process owner preserves exact pins and cleanup under a distinct FED mode.
  Fresh custody/observed-family target binding and operational mint were still
  open at that component checkpoint; the native campaign below now covers them locally.
  The observed-input compiler now connects active setup/source custody and
  owned Ergo observation/history to both pinned JVM compilers and the typed
  candidate. Component tests use real custody/JVMs with stubbed observations;
  those component checks alone did not demonstrate fresh-target composition or issuance.
  The fresh-federation build owner now derives Cargo's public profile inputs
  from retained custody and exports the exact three-patch source tree without
  rewriting historical checkouts or binaries. Its orchestration tests pass;
  a real export matches all 563 source files. The native campaign below also
  runs the fresh Rust build inside the composed target lifetime so custody
  survives into its consumer. The build-only join itself did not establish acceptance.
  A static target root now composes that build, owned Ergo observations, JVM
  family compilation and paired FED genesis checks with retained synthetic
  custody. Component coverage uses real keys with stubbed builds/processes;
  the native campaign below supplies the separate fresh-target execution evidence.
  The root's result is terminal public data, not resumable custody. Extend its
  managed lifetime through native burn and the existing withdrawal consumers before
  spending another fresh build on a campaign that ends too early.
  The observed-input compiler now materializes all three unsigned Ergo
  singleton transactions from canonical funding boxes and the actual JVM
  contracts. Their predicted IDs are not confirmed issuance. The native setup
  uses a separately identified FED-native setup request/checker entry; the old
  V3 G1dA history closure is not interchangeable with height-zero FED identity.
  The managed native session now takes the original compiled family through
  three exact WASM signatures and check results, retaining the synthetic
  signer and a distinct target-bound native batch. Compiler receipts remain
  tied to that session; disposal or concurrent misuse prevents the next
  signature/check and invalidates retained batch access. Component tests use
  the real JVM compilers and WASM signer with simulated observations/HTTP,
  not target-node acceptance. V2/V3 material stays separate. The native batch
  now enters its own fixed revalidation, authorization and transport profiles,
  with durable reservation before transport and canonical confirmation before
  each successor. The composed test uses real WASM custody, byte checks,
  lifecycle and SQLite, with simulated node observations and HTTP. Disposal
  stops subsequent actions; an interrupted transport retains its journal entry
  without authorizing the next role. Request age does not invalidate retained
  custody, but every action still requires fresh observations and active custody.
  The native target root now calls that issuance consumer while both node
  pairs and synthetic custody remain owned. It retains a fresh local journal,
  checks the consumed funding inputs and exact singleton outputs on both Ergo
  nodes, rechecks canonical inclusion around the output reads, and reobserves
  FED genesis before returning. Component tests cover this caller with real
  custody, SQLite and box codecs; builds, checking and transport are doubled.
  The native batch also feeds the existing V2 deposit format and a separate
  retained source-lock/reserve-transition checker sequence. Compiler identity,
  reserve predecessor and packet identity remain bound through both checks;
  native custody invalidation reaches the nested submission handles. These
  component tests use actual transaction codecs and WASM signatures with
  simulated deposit/compiler provenance and node checks. They do not establish
  confirmed deposits or reserve transitions. The native source-lock consumer
  now joins the retained check, exact owned funding observations, a distinct
  source-lock authorization scope, durable reservation, fixed transport and
  canonical confirmation with exact dual-node output observation. Its composed
  tests use real WASM signing, custody, journal and HTTP decoding with simulated
  target responses. The resulting deposit remains refundable and cannot
  authorize minting. No fresh target run is established by that composition.
  The native reserve consumer now joins the same packet/source-lock observation
  to retained checking, fresh three-input/JVM revalidation, durable transport,
  canonical confirmation and exact reserve successor/ancestry observation.
  Composed tests cover both steps with simulated node responses; reserve lineage
  is not mint authority. That observation now feeds a native mint draft and
  one-time evidence collector/consumer. They retain exact packet, setup and
  observation custody while using the unchanged V4 statement and FED evidence
  formats. The retained source session now consumes that exact native receipt
  and signs the unchanged FED proof for the compiled height-zero runtime profile.
  Draft, batch, packet, observation, target and federation stay bound to their
  original custody; LAB launch and native mint signing cannot share a session.
  Component coverage uses real evidence collection, codecs and threshold
  signatures with simulated compiler and node observations. This does not
  establish Ergo PoW, native reservation acceptance or operational mint.
  Local native reservation signing now connects the original
  proof, draft and compiled genesis to retained operator custody. It encodes
  only pallet 12 call 6 using the pinned AccountId20/EthereumSignature layout;
  one-shot signing does not authorize transport. Its closed import list keeps
  additional signing or transport capabilities out of the composition.
  Component tests cover rejection before signing and custody disposal during
  signing. This remains local signature evidence, not Rust/node acceptance.
  The native signer now observes both owned Frontier processes before using
  its one-shot budget. The original callback-scoped target binds the exact
  typed genesis; clones, expired custody, changed spec bytes, exited processes
  and listener drift reject. Both nodes must retain the selected genesis,
  exact compiled runtime/profile, enforcement, funded operator account and
  empty pools. The nonce comes from that observed account, not a caller field.
  Component tests cover changes during observation and disposal before or
  during signing. These nodes use manual sealing without GRANDPA; their
  agreement is local state observation, not cryptographic finality. Revalidate
  those bindings immediately before transport; a returned transaction hash
  does not establish inclusion or a pending reservation. A proof-bound native
  execution entry now connects signing to an exclusive durable attempt,
  explicit local broadcast scope, one submission and manual sealing of the
  first block without GRANDPA finalization. It checks the exact signed call,
  original proof's complete 918-byte pending record, reservation index,
  terminal-state absence, operator nonce and unchanged runtime/profile on both
  local nodes. Ambiguous submissions retain their hold without retry.
  Component tests use actual synthetic signatures and journal storage with
  simulated node responses; the native campaign below separately demonstrates
  the reservation on fresh nodes.
  The combined proof-bound reservation/mint consumer now retains that exact
  parent and custody through a chain-4242, nonce-one Ethereum call. It rechecks
  both parent views before transport, holds ambiguous attempts, and verifies
  the exact native child call, Ethereum receipt/events, supply and recipient
  balance, processed mint identity and complete consumed V4 record. Native and
  Ethereum block hashes remain distinct. Component tests use real signatures
  and durable journals with simulated RPC. The fixed target root now calls
  the complete deposit-to-mint path inside the same managed lifetime: new
  owned Ergo funding, canonical deposit, confirmed reserve transition, original
  draft/evidence/federation proof, native reservation and parent-state mint.
  The root preserves unresolved journals, closes owned nodes and custody on
  failure, and returns terminal transaction identities rather than authority
  handles. Root component checks alone do not establish fresh-node acceptance.
  On 2026-09-10, an owned isolated campaign at `486d8107` completed singleton
  issuance, a 20,000,000-nanoERG deposit, its confirmed non-refundable reserve
  transition, federation proof, native reservation and chain-4242 mint. Both
  native/EVM views, exact token deltas and the consumed V4 record passed the
  fixed caller's checks; owned nodes and custody were closed successfully.
  The first-parent fee correction passed its focused negative matrix before
  this run. This establishes local FED deposit-to-mint execution, not source
  consensus, independent custody, a composed withdrawal or Gate 5 closure.
  An issuance receipt is not mint authority.
  The old source locks and withdrawal campaign retain their original scope.

## Critical Path

The selected first delivery is **greenfield**. It requires authenticated
history, the reviewed non-instantiation baseline, exact authority lineage and
the derived empty replay root. Account for every legacy-route requirement as
not instantiated; neither a fresh DB nor an empty UTXO view proves greenfield.
Migration import and retirement execution are deferred until an existing
target is explicitly selected. Their formats and safety obligations remain
binding on that route. Cross-profile rejection, durable input holds and global
replay isolation remain required for greenfield operation.

Campaign 23 supplies the first local roundtrip baseline. Resolve environment
compatibility before claiming it or relying on it in a target rehearsal; map
FED evidence consumers before producing their final release evidence. These
decisions do not block independent component work against the pinned local
profile. Connect normal successor use, then exercise recovery on accumulated
state. Operator packaging
and reviewer preparation can proceed alongside independent implementation.
Adapt the batch sequence when evidence changes that hypothesis. FED-7 still
requires all applicable lifecycle, recovery, reproducibility, custody and
independent-assurance obligations; STARK/Gate 5 remains a separate upgrade.

| Horizon | Boundary | Candidate action | Completion evidence / blocker |
|---|---|---|---|
| **Now** | Observed native successor -> next operator sequence | Replace first-cycle nonce/parent assumptions with operation-bound observed state through the native execution caller | Reject stale parent, wrong nonce, foreign operation and replay before new signing/transport; preserve durable ambiguous holds and old one-shot APIs |
| Next candidate | First-cycle successors -> another normal operation | Connect observed reserve, DUP and tracker successors to the next deposit, mint, burn, checkpoint and payout on the same greenfield chain | Preserve the first replay key, insert the new key, check cumulative value/liability conservation, reject stale predecessors and either burn's replay. Do not reset genesis or substitute historical custody |
| Later candidate | Accumulated state -> recovery | Exercise restart, DB loss/rollback, divergent RPC, out-of-order events, reorgs and cross-profile collisions on the selected FED consumer | Recover observations and safe progress only from the required authority. Holds remain non-authorizing; ambiguity never permits resend, mint/payout duplication or reconstructed key/receipt authority |
| Alongside when independent | Working consumer -> reproducible operator package | Provide one documented entry point, reproduce in a separate clean root, and complete the exact non-mainnet target, role-custody, key-loss/rotation and alert/recovery rehearsal | Reuse source-locked components. Cross-root build independence, fresh external integration and actual independent custody need their own evidence; a simulated actor or hosted reviewer does not supply operator custody |
| Final delivery obligation | Completed FED obligations -> FED-7 | Bind exact profile evidence, affected validation, independent assurance and the external integration decision to the final candidate | Close every claim-relevant blocker before supported release. Missing external participation caps the corresponding claim without stopping independent local engineering. Gate 5 remains separate |

Campaigns through 23 are terminal. The next full local campaign must exercise
the changed successor consumer through a minimal documented and reproducible
invocation. A finished operator package is not a prerequisite for this
deciding run; private historical campaign scripts or custody are not reusable
inputs. Add ready
recovery cases when they share that evidence closure; do not wait for the
entire recovery matrix when a live second-cycle result decides further work.
Create a fresh chain and custody, perform both cycles there, and never resume
Campaign 23. Prepare the two external fee inputs before each corresponding
frozen anchor. Preserve all formats, domains, quorum thresholds and
key-destruction rules.

## Next Executable Batches

These are candidate outcomes with acceptance criteria, not a fixed schedule or
precommitted file list. Select and detail one at a deciding checkpoint. A new
result may change the approach or order; it cannot remove a delivery obligation
or its required evidence. Keep batch decisions in Current Focus and the
existing task handoff.

| Batch | Completion contract | Cheapest deciding check |
|---|---|---|
| FED acceptance and environment | One supported greenfield profile, role/epoch model and claim-to-validator map, including explicit legacy-schema incompatibilities and target integration dependencies | Inspect existing consumers and exact pinned artifacts first. Distinguish miner candidate production from unmodified-node validation; resolve compatibility only against the claimed target |
| Successor continuation | An independently testable join from observed first-cycle reserve/DUP/tracker state to a second successful operation, with separately scoped operation authority, custody lifetime, nonce and parent binding | Focused composed positives and isolated replay, disposed-handle, foreign-operation/profile, wrong-parent, stale-state and conservation negatives before a new full campaign. Exercise nonempty replay state; nonzero burn-leaf indices are separately due when supported by the selected checkpoint shape |
| FED recovery | The same selected consumer survives the declared interruption matrix or retains a precise non-authorizing hold | Begin with bounded fault injection against the accumulated state. No reconstruction of disposed custody, authorization receipts or ambiguous transport outcomes |
| Reproducible operator delivery | A fresh external context can use repository instructions and the packaged entry point without campaign-specific maintainer scripts | Separate-root exact source/tool/runtime checks, then one distinguishing packaged lifecycle/recovery rehearsal. Reuse the historical campaign only as evidence, never as an execution session |
| FED-7 decision | Exact evidence reaches the proper release consumer, with due independent review and current promotion checks | Reuse unchanged gates. Keep public research availability, reference support, independent custody and production claims distinct |

Prepare the operator entry point and reviewer onboarding alongside successor
work where file ownership is disjoint. Packaging is complete only after it
consumes the working lifecycle and recovery path. External acceptance must name
an integrator using only repository instructions and declared public
prerequisites, a fresh greenfield setup, two confirmed cycles from successor
state, one declared recovery exercise and complete teardown. Record actual
assistance and results; required undocumented maintainer steps leave repository-
only reproduction open. Local actors still do not establish independent custody.
Measure the selected path's
transaction sizes, fees, confirmation latency and resource requirements for
its documented limits. Broader batching, sharded lanes and comparative scaling
remain later milestones of the ultimate objective, reopened after the
reproducible single-lane lifecycle is closed or a measured limit requires them.

## Completed Implementation Batches

The following rows and detailed narratives retain the original checkpoint
scope. Their historical "next" statements are not executable instructions.

| Batch | Owner / dependency | Completion contract |
|---|---|---|
| FED native runtime initialization | Native checkpoint complete; source overlay 0004 | Full typed genesis and first-block execution pass in the dedicated runtime with isolated invalid-profile/state negatives. Federation configuration, exact application storage, immutable profile and no-Sudo/Root rules are checked. Reuse this native evidence while its input closure is unchanged |
| FED node selection and typed loader | Local checkpoint complete; overlays 0004/0005 | The dedicated node builds with the compiled federation. Its CLI reads typed genesis and executes that WASM before accepting a spec; all resulting state matches native genesis. Existing runtime predicates are unchanged. This is not a running target or a reviewed provisioning packet |
| FED typed provisioning producer | Local materialization checkpoint; native initialization and selected node | Derive the pre-genesis application identity, compile the actual JVM tracker/family, then emit the canonical height-zero V4 profile and full typed config. The selected node accepts it and its raw storage binds the expected runtime/profile. Existing formats and LAB route are unchanged |
| FED running-target binding | Local native campaign passed at `486d8107` | Actual root joined fresh builds/custody, observed Ergo issuance, deposit, confirmed reserve, proof and mint on both owned targets. Keep request freshness at checking separate from later action freshness. Historical V3/LAB identities cannot replace native provenance; retain unresolved-attempt holds |
| Native reservation and mint caller | Local native campaign passed at `486d8107` | Reservation block one and chain-4242 nonce-one mint in block two passed exact RPC/token/consumed-record checks. Preserve broadcast authorization and duplicate, absent-commitment, wrong-binding, unreserved-sibling and fee negatives. Pool admission remains distinct from execution and final state |
| Native burn commitment producer | Local source/build checkpoint; paired public burn observation at `7e0265329` | Active-profile selection passes 11 native integration tests, 71 historical pallet tests and 48 export-owner tests. Campaign 14 produced a successful block-four burn whose receipt, commitment storage and runtime events agree on both nodes. This observation does not authenticate an original execution handle or attest a checkpoint |
| Native burn and retained withdrawal continuation | Fresh composed local campaign passed at `1ca6c315` | Campaign 23 bound paired native storage, runtime events and global burn index to the retained source quorum. Both distinct external fee inputs confirmed before checkpoint attestation and the frozen anchor; the exact tracker then confirmed before the canonical payout in the same custody session. Preserve the exact formats, domains, quorum and destruction rules |
| Native validation traversal | Local affected checks and independent review complete | Native batch and original output-observation assertions each use one complete target traversal; revalidation artifacts and source-proof assertions each use two. Initial rejection order and every post-await custody check remain enforced. Keep exact process/artifact checks, failure holds and the existing duration bounds |
| Native request and managed promotion | Local affected checks and independent review complete | Synchronous WASM derivation preserves full checks before and after serialization/cleanup. Native checker entry and material consumption use the immediately enclosing full validation; legacy checks remain. The composed fixture includes construction age, three RPC costs and actual managed promotion within the unchanged request window |
| Native tracker mempool and candidate oracle | Fresh target inclusion passed at `1ca6c315` | Candidate mining was bound to the exact expected tracker transaction. Campaign 23 confirmed that same transaction at height 467 and the confirmation consumer retained the transport identity. Preserve the missing, malformed, foreign and absent-in-pool negatives and the ordinary post-confirmation payout mining path |
| Isolated Ergo resolver boundary | Local locked-build checkpoint; Campaign 23 reused the pinned build | The launcher bootstrap is restricted by a generated repository file to the file-backed Maven Central cache plus an empty `bootOnly` sentinel; project dependency resolution retains that cache through `COURSIER_MODE=offline`. Campaign 23 used the pinned resulting build, while cross-root build reproducibility remains unestablished. The existing SBT boot and Coursier caches are mutable and unattested. This is resolver confinement, not an operating-system egress sandbox |
| Original confirmation progress -> native failure export | Local affected checks and independent review complete | Only the native tracker opts into bounded paired index-height and exact-transaction pool reads. A private snapshot is published after required observation checks succeed and binds the latest sequence, transaction, live observer and target. The original error projects this separate diagnostic through the existing cleanup chain; it supplies no authority and cannot alter confirmation or initiate another request |
| Observed anchor -> next-block script context | Local affected checks and independent review complete | With identical signed tracker and input bytes, native upcoming and processed contexts both execute at anchor index eight. At index nine, upcoming execution passes and processed execution rejects the tracker input. Active, frozen and reservation-freshness observations now reject that index while preserving the ten-header observation format. All 30 observer and 15 native cases pass, as do TypeScript and the corrected contained cleanup. This does not guarantee later inclusion or repair a miner stalled after semantic block rejection |
| Candidate selection -> semantic block result | Local native and locked-build checkpoint; cumulative Ergo overlay 0002 | Actual candidate execution retains at most nine predecessor headers, matching full-block script execution while preserving the other context fields. A semantic rejection clears solved state only for the matching full-block type and ID. Fresh post-genesis actors reject a wrong declared root, regenerate the original parent/root and apply a valid successor; unrelated IDs/types preserve solved state. A stale solution receives an error without crashing the actor or emitting a modifier. All 20 public JVM and 14 native CandidateGenerator cases pass; the current source and build locks produce a bounded local node assembly. Historical compiler locks retain unchanged overlay 0001. Recovery after rejection of the initial full block remains outside this overlay because of the upstream pre-genesis history state |
| Fresh operational two-way campaign | Campaign 23 passed locally; promotion evidence frozen | One fresh isolated campaign completed deposit, mint, native burn, checkpoint attestation, exact tracker inclusion and canonical Ergo payout in the same disposable-custody session. The two fee inputs confirmed before the anchor and the tracker confirmed before payout. Independent result-to-claim review passed after two documentation P2 corrections. The result remains federated local simulated-funds evidence; source finality, trustless verification, production readiness and public-network operation are not established. Next prepare the operator package and recovery/replay evidence; do not run another equivalent campaign |

The native execution consumer now retains the confirmed mint through one
approval in block three and one matching burn in block four. It validates the
withdrawal request before minting, rechecks both parent views before each
transport, and reserves each attempt durably. Native extrinsic bytes must match
the signed Ethereum call before the hold is written. Receipt events, supply,
recipient and fee balances, allowance and the consumed mint record are checked
on both nodes. The fixed fee ceilings apply only to parents two and three;
a higher observed requirement rejects without increasing the bid.

The native burn now feeds a collector that reobserves both nodes at its exact
native block hash. It checks CurrentCommitment, CurrentLeafHashes and the full
System.Events encoding, including BridgeEventRootStored. The single burn has
global event index two and leaf index zero. Native and Ethereum hashes remain
distinct. A separate original-object continuation binds that collection to the
same source session's one-shot checkpoint signature. The statement and signature
domains are unchanged; a native receipt records native setup provenance and
uses the compiled application profile. It does not fabricate a LAB launch.

These component tests use real signatures and journals with simulated RPC
responses. Overlay 0006 supplies the application-domain producer semantics
required by the collector. The prior hook used the legacy bridge configuration
and native genesis identity, while the native setup binds a separate application
identity. Typed genesis initializes the legacy address too, but that does not
correct the wrong sidechain domain. Normal native callback tests now exercise
the selected profile and reject foreign emitters and malformed active state.
The target root now composes mint, approval, native burn and the Ergo return.
Campaign 14 at `7e02653294d496bcb6b86ae11d297d5fc72e1df2` reached block four.
A separate public observation checked both nodes' receipt, 109-byte
CurrentCommitment, CurrentLeafHashes and decoded BridgeEventRootStored:
10,000,000 nanoERG net burn, one leaf, leaf index zero and global event index
two, with distinct native and Ethereum hashes and the expected application
profile. Its observation digest is
`6ca04d489c421cca73e7644a00578970fde8abda421fa2226cb2d0a134b4c38f`.
This public snapshot does not authenticate the original execution handle,
produce a source quorum attestation or establish payout authority.

The first action had already exceeded its unchanged 78-minute completion
budget. After preserving the burn observation, the original Frontier witness
was stopped to unwind the root through its existing cleanup. The root failed
with witness exit; all owned processes and fixed listeners stopped. This was
a controlled termination, not a successful round trip or a natural timeout
exception. Checkpoint execution and Ergo payout remain unestablished on this
route. The native validation correction below addresses duplicate traversals;
terminal attempts remain held.

The native batch now uses the existing compiler validator's returned process
binding within the same synchronous assertion. The native draft relies on the
following observation's full original-packet validation. Counter regressions
failed on the previous implementation (batch two, proof seven) and pass with
one and three traversals respectively. The composed retained assertion adds
its unchanged direct compiler check. This reduces duplicate work without a
cached authority or a change to checking intervals.

At `9a5fd277`, all 353 native cases, 12 composed withdrawal cases, 235 architecture tests,
the static import guard and TypeScript pass. The withdrawal group prepares one
tracker/family JVM pair. Isolated negatives preserve target and process digests,
origins, mining roles, expiry, compiler/setup/source custody, packet provenance
and rejection before promotion after awaited checks. Existing Rust/WASM,
compiler, V3 lifecycle, wire-format and quorum evidence retains its unchanged
scope. These component results do not establish a new complete target run or
a measured campaign speedup.

Campaign 16 built both nodes from the pinned sources and started the paired
targets, then stopped at the native setup request's fixed 60-second freshness
guard before mint. All owned processes and listeners stopped. Its terminal
attempts cannot be resumed. The request is created after Frontier startup;
the build duration is not part of this request's age. The exact failing
assertion inside that campaign is not established by its bounded diagnostic.

The request producer now removes two synchronous assertions already performed
by their immediate caller or callee. Build validation traversals fall from
eight to seven; each reobservation falls from ten to eight. Runtime provenance
still performs three traversals. Every post-await custody and freshness check,
the original request identity, the inclusive 60-second limit and rejection of
expired handles remain required. A composed regression joins the actual native
request and observations to the existing checker and WASM signer, with explicit
compiler/process and HTTP doubles. Its deterministic traversal-cost model
exposes cumulative expiry without claiming measured node performance.

Campaign 17 at `413ed4d9603277f8e1367697c42896576ffcbd25` reached public
mint, approval and burn. Paired reads again matched the native commitment,
leaf hashes, runtime event and global burn index, keeping the Ethereum and
native block identities distinct. Its initial callback remained active past
the conservative latest deadline allowed by the unchanged 78-minute budget.
The budget is checked after callback return; this was a source-derived bound,
not an emitted timeout exception. Controlled witness termination unwound the
root with an action/cleanup error. A separate final inspection found all owned
processes and listeners absent. The public burn capture does not authenticate
the original execution handle or establish checkpoint attestation or payout.

The next correction removes repeated synchronous native validation at the
observation and revalidator joins. An original native observation first runs
its retained full packet assertion, requires the same packet, then consumes
the original batch binding that assertion just checked. Both binding digests
and the observation digest remain required. Copies, proxies, absent material,
foreign targets and legacy observations keep their target-first fallback.
The native revalidator consumes its batch assertion's complete target check;
both artifact checks remain around caller-supplied expectation getters.
The committed-vault root keeps its initial packet guard and every later
post-await check through the original source-lock observation.

Counter regressions distinguish native artifact validation (four to two
target traversals), each original output observation (two to one), later
committed-vault callbacks (three to one), and source-proof consumption (three
to two). All 410 direct revalidator/observer cases and 360 native composed
cases pass, as do 235 architecture cases, the static import guard and
TypeScript. Three guard-removal mutants fail at the intended initial,
caller-getter and post-await boundaries. These checks use declared process,
compiler and node doubles; they establish the validation reduction and
preserved custody vetoes, not a measured campaign speedup. Request, V3,
compiler, Rust/WASM, format and quorum evidence remains reusable only within
its unchanged operation and artifact closure. A fresh complete campaign is
still needed to establish the native checkpoint and Ergo return.

Campaign 18 at `9f2f0d91200d312fd74ec16cef3726e0dec6ef8a` stopped before
mint at the unchanged native request freshness guard. Its bounded error does
not identify the particular assertion. The root returned failure and normal
cleanup stopped all owned processes and listeners. The earlier traversal
fixture counted checker execution after request construction and did not reach
managed promotion, so its passing result did not cover the full request age.

The next request/checker correction imports the pinned WASM module before
request construction and derives issuance bytes synchronously. Full request
checks still bracket derivation, including WASM cleanup. The public runtime
validator still returns a Promise; reobservation invokes its private synchronous
implementation. Every remaining observation and RPC await retains its guard.
Native checker entry preserves cancellation and age checks before the runtime
validator performs the full request assertion. Native material consumption
uses the public wrapper's full original request/target check; exact private
binding selection keeps V2/V3 direct target checks intact. No request renewal,
authority cache, duration, signing format or quorum change is introduced.

Producer counts fall from seven to six at build, eight to six at reobservation
and three to two at runtime validation. The actual managed fixture starts its
cost model before building, charges one second per full target traversal and
per node check, and reaches promotion at a request age of 59 seconds after
three real WASM checked-transaction promotions. This is a deterministic
fixture with declared compiler/process and RPC doubles, not a node benchmark.
Single-fault negatives cover synchronous decode/serialization/cleanup, every
remaining await, custody and both bindings after checker return and promotion,
copies, cancellation and single-use material. Removing the post-derivation
runtime or build check makes the targeted negatives fail; both mutants were
restored exactly.

Strict closeout owns two runtime files, their three direct/composed test files
and this plan. Its deciding closure is request/composition, all native managed
cases, architecture, TypeScript, actual Node ESM loading and four V2/V3 checker
cases. All 80 request/composition, 379 native, 235 architecture and four legacy
cases pass, as do TypeScript, the static import guard and actual Node ESM
loading. Independent review found no actionable findings. Prior
withdrawal and V3 lifecycle evidence is reusable for unchanged downstream
operations; the four legacy cases cover the shared checker branches changed
here. Rust/WASM artifacts, JVM contracts, wire formats and quorum semantics
are unchanged. A fresh complete campaign follows only a coherent reviewed
commit; it must still establish the original checkpoint and Ergo return.

Native setup now retains its original batch and compiler through withdrawal-fee
and tracker-fee checks. Both fee consumers preserve exact authorization, durable
reservation and submission handles. After the initial target expires, a private
process-owned relation binds the current frozen tracker target to that same
setup; the expired target cannot become active again. Custody checks cover
internal signing/checking awaits and later admission or transport consumers.
Payout checking closes signer custody while its original checked result remains
usable by the established confirmation-target lifecycle. Composed tests use
genuine JVM compiler output, AVL proofs, WASM signatures and journals with
explicit source and process/RPC doubles. They do not establish a native two-way
campaign. The root retains the same journal and source/operator custody across
the owned anchor, frozen tracker, freshness, transport and confirmation phases.
Both external fee inputs are confirmed before the checkpoint window is chosen.
The burn claim preserves its native and Ethereum identities, exact root, count,
global event index, recipient and net amount. Its terminal result requires
canonical tracker and payout confirmations; every owned mining credential is
revoked during cleanup. Root tests use explicit process and consumer doubles.

Campaign 19 at `241d7db83e5e1b213a98b827a45a914c0ea2894d` reached native
burn and the tracker confirmation phase, then failed at its unchanged
120-second confirmation deadline. The public burn capture independently
matched both nodes' native commitment, leaf list and runtime event, with one
leaf at global event index two. All owned processes and listeners stopped.
No terminal success receipt was exported; canonical tracker admission and
payout remain unestablished. Its retained attempts cannot be retried.

The native root now retains the existing bounded transport and confirmation
diagnostics through the original thrown error and the existing bounded primary
cleanup-error chain. Transaction, durable attempt and
confirmation-target identities must match before projection. Missing, foreign
or throwing diagnostic producers preserve the original failure and cleanup;
they cannot initiate another transport or payout. The projection contains no
signed transaction, response body or resumable authority. Component tests use
explicit process and transport doubles; cleanup-wrapper tests exercise the
actual confirmation-diagnostic producer. A separate cleanup failure that
replaces the original error remains outside this projection's scope.
The separate progress projection observes both nodes' index heights and the
exact transaction's pool endpoint in the existing transaction-request wave.
Each optional read has a two-second bound; the required observation and
confirmation budgets are unchanged. Index heights must agree with the same
node's surrounding height observations. A pool 404 records that endpoint's
response, without proving global absence. Invalid or failed optional reads
produce fixed categories. Starting another observation clears the old snapshot;
only successful required checks may publish the latest sequence. Publication
after a rejected required check is covered by four isolated negatives and an
early-publication mutant. The observer/root closure passes 375 cases and the
architecture closure 240; type and capability checks pass. Independent source
review found and closed the premature-publication defect. These component
checks do not establish campaign 20's cause or actual target inclusion.
The exact native signed tracker
transaction also passes WASM proof and transaction validation in synthetic
first-block and following-block contexts. Separate anchor-retirement and
checkpoint-expiry cases reject the tracker input while its fee input remains
valid. These fixtures do not establish target-node inclusion or identify the
cause of campaign 19's failure. Diagnose that boundary before another fresh
complete campaign; recovery remains after canonical native payout.

The 4,173-byte tracker transaction exported by the composed test also reparses
under the codecs at Ergo source `2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1`.
Its two input boxes and ten headers round-trip byte for byte. A persisted
synthetic UTXO state retains the exact context and boxes, shared validation
reports cost 16,614, and the main-source mempool accepts the transaction. The
same mempool declines a duplicate, while a separate blacklist invalidates the
same transaction. Nine Scala tests pass through the Windows PowerShell 5.1
runner: the valid path plus isolated trailing-byte, transaction identity, input
identity/order, header identity/parent/height and missing-UTXO rejections. The
runner pins Node 24, the TypeScript process owner and the reviewed Windows Job
Object wrapper; it bounds the JVM to 300 seconds and 4 MiB of combined output,
then removes every LevelDB directory. No node service, wallet, actor, HTTP
submission or mining process runs in this oracle. It closes the main-source
parser and local mempool checks for this exported component fixture. No byte or
context identity to campaign 19 was retained, so that campaign's confirmation
failure remains undetermined.

The context-window differential derives synthetic descendants in memory while
retaining the original anchor and signed transaction. It compares the native
upcoming and processed contexts through `ErgoState.execTransactions`, matching
preheader, previous state digest, execution parameters and validation settings.
Index eight succeeds in both; index nine succeeds only in the upcoming context
and fails with tracker-input verification returning false in the processed
context. The observer's active, frozen and reservation-freshness consumers
reject index nine before publishing provenance. The API window remains ten
headers and no serialized contract, signature domain or quorum changes.
An index-eight observation is still subject to later chain movement; it does
not promise inclusion. Full-block application, miner recovery and the original
campaign's missing header provenance remain separate deciding boundaries.

Keep signing/execution, checkpoint attestation and Ergo continuation as
coherent implementation batches. Reuse unchanged compiler, runtime and prior
component evidence; run a fresh composed campaign only after the return path
is connected inside the original custody lifetime. Review each stable changed
boundary independently, not each forwarding step or test edit.

### Operational Mint Bootstrap Decision

The source audit at `f8f7c9f6d29f51ac293c777532b8f2cad33b0219` found a
missing runtime prerequisite, not a missing forwarding wrapper. In
`sources/frontier/0001-bridge-runtime-commitment.patch`, pallet 12 call 5
(`activate_pooled_reserve_mint_reservation_profile_v4`) requires Root and a
compile-time permission. The same permission also gates reservation and mint
execution. The main runtime disables it and selects fixed reference proof
keys. Its typed genesis config accepts only a quarantine address. The
authority-safe chain-spec producer removes Sudo. Consequently that target
cannot reach V4 activation through the existing calls.

The LAB runtime instead compiles supplied public federation keys and the
TestClient initializes the profile through a signed Sudo call before removing
Sudo. This is valid local component evidence, but not the initialization path
of the Sudo-free running target. Call 6 (`reserve_pooled_reserve_mint_v4`)
accepts a signed submitter and verifies the source proof; it writes a
reservation, not a mint. A later Ethereum transaction must match the unchanged
parent-state reservation, application code, token effects and replay identity.

The selected implementation direction is typed, greenfield genesis-bound
initialization. V4 already permits activation height zero; do not revise its
wire format, domains or statement meaning. A new target must derive its own
complete profile/family identities and cannot relabel an older nonzero-height
packet. Validate after EVM genesis accounts are initialized: exact bridge/token
code, token ownership, bridge configuration, unpaused state, quarantine
address, empty reservation/replay state and Sudo absence. Genesis failure must
prevent a usable target, not leave a partially initialized mint route.

Separate permission to execute a genesis-authorized profile from permission to
activate one through a public Root call. The operational variant must bind its
configured federation in the runtime build; a profile ID cannot replace its
compiled signer set. Retain the current default runtime and compatibility
fixtures unchanged. Unknown profiles, incomplete configuration and reference
authority in the operational variant fail closed. This is an implementation
direction, not an activation or runtime-acceptance claim.

Native initialization is implemented by the separate
[FED genesis overlay](../docs/federated-genesis-runtime.md). Its code-hash
checks bind profile-declared code, not an independent audited allowlist.
Reviewed application and chain identity therefore remain target-provisioning
obligations. Before operational promotion, close the remaining obligations:

| Boundary | Deciding evidence |
|---|---|
| Provisioning order | Exact build/profile/application/genesis dependency graph without a self-referential genesis-hash definition; chain domain and actual genesis identity are bound separately |
| Genesis to first block | Native closure passed; the selected node's typed loader now passes full WASM/native genesis comparison and isolated negatives. Reviewed target provisioning and running-node first-block execution remain required |
| Immutable initialization | No second initialization, replacement through Root, reference-key substitution, legacy reactivation or raw-storage initialization route |
| Reservation to mint | Existing source-proof predicates and parent-state atomicity, plus actual native/Ethereum dispatch; a rejected candidate block is not proof of safe transaction-pool admission |
| Reference delivery | Fresh-node two-way run with the configured operational runtime and retained negative matrices; LAB/TestClient results remain separately labelled |

Do not add a new post-genesis administrator merely to unlock the old target.
A migration target needs its own authenticated cutover and replay history;
greenfield initialization does not satisfy that obligation.

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
independent consensus proof. The retained withdrawal consumer now uses this
API; do not insert a funding-only campaign or recreate historical tracker
evidence.

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
These caller tests establish check-only orchestration; no fresh-node withdrawal
acceptance is claimed. The complete operation below has separate provenance.

The withdrawal lifecycle now retains the original check and target lineage
after signer disposal. Explicit authorization and a dedicated journal profile
bind reserve, DUP and fee inputs; every operational profile respects their
durable holds. Old schemas fail closed without automatic migration. Immediately
before its single transport, the component reobserves both nodes and canonical
predecessors, repeats the exact signed-transaction check, and revalidates again.
An ambiguous response cannot trigger a resend. Confirmation requires exact
reserve/DUP/payout outputs, the tracker data input, spent predecessors on both
nodes, and unchanged canonical transaction inclusion after those observations.

The composed cases exercise accepted and ambiguous transport, stale fee input,
and payout re-inclusion with real compiler/signing/journal implementations and
synthetic HTTP chain state. They do not prove independent consensus or
fresh-node acceptance.

The complete managed campaign now calls that lifecycle inside the still-owned
tracker-confirmation callback. Its fixed worker selects it only when the exact
final argument pair is `--operation withdrawal`; omitting the pair preserves
the tracker-only operation. The worker remains behind
`relayer/src/scripts/run-substrate-federated-isolated-devnet-tracker-v2-campaign.ts`
and same-process request creation with fresh synthetic custody.

The complete receipt uses `local_withdrawal_v2_canonically_confirmed` only after
canonical payout, reserve and DUP successor checks and successful owned-resource
cleanup. Check-only, tracker-only, copied and failed-campaign receipts cannot
acquire its process provenance. An ambiguous transport response never causes a
second submission. This command-level integration is covered by orchestration
and boundary tests, and the fresh-node withdrawal campaign recorded above.
Neither the command nor its receipt establishes operational mint, independent
custody, global replay cutover, Gate 5 closure or production readiness.

The native mint caller is now locally demonstrated. Extend its retained
lifetime through the native withdrawal, exercise both directions through
recovery, and finish target/custody rehearsal and FED-7.
A source-locked TestClient mint is not the operational mint route. The completed
local exit does not close operational integration or recovery. Reuse the
withdrawal evidence while its inputs remain unchanged; do not repeat it as an
intermediate milestone before connecting the two-way consumer.

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
2. Reassess Current Focus only at a deciding checkpoint, a refuted assumption
   or a changed dependency. Select one independently testable producer-to-consumer boundary, normally
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
