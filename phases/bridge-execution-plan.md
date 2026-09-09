# Bridge Execution Plan

Updated: 2026-09-09

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
| **WP-06-FED** | A complete, reproducible two-way federated reference | A versioned source-attestation Ed25519 quorum and a separately bound Ergo-admission SigmaProp quorum; roles, thresholds and federation epoch are explicit | Active. The local tracker-to-payout campaign passed; operational mint integration and composed two-way recovery remain open |
| **WP-06-STARK / Gate 5** | An Ergo-verifiable trustless upgrade | An activated verifier checks the separately versioned statement and finality semantics before value release | Frozen pending a compatible activated target. Not a prerequisite for the federated reference |

Both tracks remain research work; neither supports production use or
deployment with real funds.
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
  Fresh custody/observed-family target binding and operational mint remain open.
  The observed-input compiler now connects active setup/source custody and
  owned Ergo observation/history to both pinned JVM compilers and the typed
  candidate. Component tests use real custody/JVMs with stubbed observations;
  fresh-target composition and singleton issuance are not yet demonstrated.
  The fresh-federation build owner now derives Cargo's public profile inputs
  from retained custody and exports the exact three-patch source tree without
  rewriting historical checkouts or binaries. Its orchestration tests pass;
  a real export matches all 563 source files. The fresh Rust build still needs
  to run inside the composed target campaign so custody survives into its
  consumer. No new node/WASM acceptance is claimed by this build-only join.
  A static target root now composes that build, owned Ergo observations, JVM
  family compilation and paired FED genesis checks with retained synthetic
  custody. Component coverage uses real keys with stubbed builds/processes;
  no fresh composed target run or singleton issuance is established yet.
  The root's result is terminal public data, not resumable custody. Add the
  issuance and operational mint consumers inside its managed lifetime before
  spending another fresh build on a campaign that ends too early.
  The observed-input compiler now materializes all three unsigned Ergo
  singleton transactions from canonical funding boxes and the actual JVM
  contracts. Their predicted IDs are not confirmed issuance. The next join
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
  simulated node responses; a fresh-node reservation is not yet demonstrated.
  The combined proof-bound reservation/mint consumer now retains that exact
  parent and custody through a chain-4242, nonce-one Ethereum call. It rechecks
  both parent views before transport, holds ambiguous attempts, and verifies
  the exact native child call, Ethereum receipt/events, supply and recipient
  balance, processed mint identity and complete consumed V4 record. Native and
  Ethereum block hashes remain distinct. Component tests use real signatures
  and durable journals with simulated RPC; the root caller and fresh-node run
  remain open. Connect this consumer inside the same managed lifetime before
  running the fresh campaign. An issuance receipt is not mint authority.
  The old source locks and withdrawal campaign retain their original scope.

## Critical Path

Choose **greenfield or migration** for one exact target before provisioning.
Both require authenticated history and exact authority/replay lineage. A
greenfield launch needs the reviewed non-instantiation baseline and derived
empty replay root; a migration needs paid-burn import and closure of every
legacy authority. Neither a fresh DB nor an empty UTXO view proves greenfield.

```text
frozen foundations + selected launch mode + fresh-owner application execution
  -> exact tracker transport and canonical admission [local campaign passed]
  -> burn/checkpoint binding + profile-bound DUP insertion + external-fee payout [local campaign passed]
  -> typed FED genesis + compiled federation [native first-block checks passed]
  -> exact WASM/node selection + typed loader [local node tests passed]
  -> typed chain-spec producer + real node materialization [local check passed]
  -> typed FED process owner + matching genesis storage [configured nodes passed]
  -> fresh custody + observed Ergo family + exact running-target binding
  -> operational FED mint caller through the selected runtime admission consumer
  -> composed two-way recovery and cross-profile replay cutover
  -> exact target/custody activation and operational rehearsal
  -> profile-correct evidence + final independent assurance
  -> FED-7 federated reference package

separate upgrade: activated Ergo verifier -> WP-06-STARK -> Gate 5
```

| Order | Boundary | Next concrete action | Completion evidence / blocker |
|---|---|---|---|
| **Now** | Configured FED nodes -> usable target custody and Ergo family | Use fresh retained synthetic custody and observed Ergo genesis inputs, compile the matching federation, bind its own genesis/spec identity and verify the isolated target | Two configured nodes now start and agree on genesis storage. Configuration-only attestor keys and synthetic Ergo IDs are not usable custody or observed issuance. Operational mint remains open. The old genesis-derived domain and block-4 LAB packet remain separate |
| 2 | Initialized target -> operational mint caller | Submit the exact proof-bound reservation through native dispatch, then mint from its parent-state reservation on the running isolated target | No receipt, observer or unrestricted owner-mint call substitutes for the deciding runtime consumer |
| 3 | Both value paths -> recovery | Exercise the selected FED identities through restart, DB loss/rollback, divergent RPC, out-of-order events and reorgs; close the exact target's replay cutover | Recovery holds remain non-authorizing; no repeated mint/payout, no reconstructed funds authority and no restoration of retired legacy paths |
| 4 | Local reference -> target operation | Complete exact non-mainnet target, role custody, approval, key-loss/rotation and alert/recovery rehearsal | Local actor simulation remains useful but does not prove independent custody. A missing external participant blocks only that operational claim, not local engineering |
| 5 | Working FED profile -> FED-7 | Bind the completed lifecycle to its own evidence producer/validator, clean checkout and final independent review | No relabelling of legacy `authenticated-external-fee-v1` evidence as FED. Close every claim-relevant blocker before supported release |

## Next Executable Batches

| Batch | Owner / dependency | Completion contract |
|---|---|---|
| FED native runtime initialization | Native checkpoint complete; source overlay 0004 | Full typed genesis and first-block execution pass in the dedicated runtime with isolated invalid-profile/state negatives. Federation configuration, exact application storage, immutable profile and no-Sudo/Root rules are checked. Reuse this native evidence while its input closure is unchanged |
| FED node selection and typed loader | Local checkpoint complete; overlays 0004/0005 | The dedicated node builds with the compiled federation. Its CLI reads typed genesis and executes that WASM before accepting a spec; all resulting state matches native genesis. Existing runtime predicates are unchanged. This is not a running target or a reviewed provisioning packet |
| FED typed provisioning producer | Local materialization checkpoint; native initialization and selected node | Derive the pre-genesis application identity, compile the actual JVM tracker/family, then emit the canonical height-zero V4 profile and full typed config. The selected node accepts it and its raw storage binds the expected runtime/profile. Existing formats and LAB route are unchanged |
| FED running-target binding | Active; native issuance, deposit-to-reserve evidence and height-zero source attestation are component-composed | Connect the native proof to reservation and operational mint inside the target root's retained lifetime. Keep request freshness at checking separate from each later action's fresh observation, and reject disposed or cross-profile custody. Neither the historical V3 G1dA request nor the block-4 LAB launch supplies native identity. The target owner retains the closed journal with its build artifacts, including unresolved attempts. Run the fresh campaign only once these consumers are connected |
| Native reservation and mint caller | Combined reservation and parent-state mint are component-composed; target root and fresh-node execution remain open | Call the combined consumer from retained target custody. Verify the first native reservation and chain-4242 nonce-one mint with actual RPC, exact token deltas and consumed V4 state. Preserve separate broadcast authorization and unresolved-attempt holds. Retain duplicate, absent-commitment, wrong-binding and unreserved-sibling runtime negatives. Keep transaction-pool rejection separate from whole-block rejection |
| Fresh operational two-way campaign | Depends on both previous batches; completed withdrawal components remain reusable | Use fresh target/custody and actual RPC calls for both source reservation/mint and burn, followed by the established Ergo withdrawal consumer. Prove the composed run before claiming operational mint or reusing it for recovery tests |

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

Then connect the operational mint caller, exercise both directions through
recovery, and finish target/custody rehearsal and FED-7.
A source-locked TestClient mint is not the operational mint route. The completed
local exit does not close operational integration or recovery. Reuse the
withdrawal evidence while its inputs remain unchanged; do not repeat it as an
intermediate milestone before connecting the mint consumer.

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
