# Layered Reference Architecture

## Status And Scope

This document records the target module boundaries for a reusable Ergo-settled
sidechain bridge. WP-08A-T1 through T8C2B now implement physical core, concrete
profile, recovery, authenticated-candidate reconciliation, database-loss
package recovery, check-to-reservation, durable late-stage lifecycle, adapter,
and composition boundaries plus executable import rules. Closeout C1 adds
static profile dispatch, an explicit fixture-only domain, and cross-boundary
WP-07 behavioral replay. Later closeout work completed local legacy-capability
separation plus a frozen clean-checkout and independent-review checkpoint. A
future source publication must repeat the promotion gates against its exact
candidate; that is a promotion obligation, not unfinished module extraction.

The protocol critical path remains WP-06 and Gate 5: authenticate a source
checkpoint, prove source-chain finality, prove withdrawal inclusion, bind the
payout and replay update, and obtain full Ergo transaction acceptance. The
current packaging gate is the bounded WP-08A closeout; it must preserve those
semantics and must not activate an unreviewed funds route.

Architecture-only review and controlled private CI may proceed earlier. No
bridge source tree, public repository, public branch, tag, source snapshot, or
release archive may be published under any label until WP-08A satisfies its
Definition of Done. This is a first-public-source-release gate, not merely a
restriction on release wording.

Substrate/Frontier is the current EVM-compatible execution and commitment
production layer. It is not the final trust layer. Ergo contracts decide value
release from authenticated, versioned settlement inputs.

## Authority Model

The bridge separates evidence production from authority over funds:

- An adapter may produce observations, canonical bytes, proof material, and
  provenance. It cannot make a mint or payout eligible by itself.
- A local status, a `verified=true` field, or a SQLite row is never a funds
  authority.
- Construction, JVM checking, signing, submission, broadcast authorization,
  and post-submit reconciliation are distinct capabilities.
- A submitter cannot bypass explicit broadcast authorization or the immediate
  pre-submit revalidations selected by the active settlement profile.
- Security-sensitive adapters are statically registered, versioned, and
  explicitly enabled. Dynamic plugins cannot authorize a mint or payout.

## Logical Layers

### `ergo-settlement-core`

This layer is specific to Ergo and the eUTXO settlement model, but independent
of the source chain. It owns:

- canonical Ergo-side deposit, vault, payout, and replay identities, plus
  source-neutral settlement identity types and profile ports;
- domain, chain, event, asset, amount, recipient, and replay binding
  abstractions without assigning source-specific wire meanings;
- branch-specific Ergo conservation, payout, fee, and successor rules;
- pure canonical codecs and hashes only when they do not encode a concrete
  source profile;
- deterministic transaction plans, without SDK execution;
- source-neutral Ergo contract primitives and sources, approved ErgoTree
  identities, golden vectors, and VM matrices;
- fail-closed profile/version identifiers and selection interfaces, but not
  concrete source-profile implementations.

It performs no network access, persistence, signing, submission, or broadcast.
Pure serialization belongs here only when its bytes are independent of a
concrete SDK. SDK-specific EIP-12 conversion, context construction, reduction,
or serialization belongs in an adapter.

A leaf, checkpoint, finality codec, source-finality rule, cross-chain liability
equation, or profile-specific ErgoTree does not enter this core merely because
it ultimately settles on Ergo. Those concrete meanings belong to a statically
selected source-profile module.

### `relayer-core`

This layer is source-chain independent but intentionally remains specific to
Ergo as the settlement chain. It is not a universal relayer for arbitrary
settlement chains. It owns:

- lifecycle state machines and candidate transitions;
- stable operation identities, idempotence, retry, restart, and rollback;
- reorg and out-of-order event handling;
- circuit breakers;
- orchestration and operational fee policy;
- abstract ports for observations, proofs, persistence, checking, signing,
  submission, and confirmation.

SQLite is a reconstructible cache behind a persistence port. Ergo-side branch
conservation belongs to `ergo-settlement-core`; concrete cross-chain liability
equations and source-finality/reorg rules belong to the selected profile. Fee
estimation, funding selection, scheduling, and retry policy belong to
`relayer-core`.

### `adapters`

Adapters implement external capabilities, including:

- Substrate/Frontier observation and EVM receipt/withdrawal extraction;
- GRANDPA proof collection and native proof execution;
- Ergo RPC and extension/header observation;
- JVM checking;
- sigma-rust signing;
- submission and broadcast transport;
- SQLite persistence;
- configuration and source-chain asset/address decoding.

Adapters return typed observations, exact bytes, proof results, and provenance
through ports. An adapter result alone never authorizes funds.

### Concrete Source-Profile Modules

A concrete source profile is a statically selected pure vertical binding, not a
fourth authority layer or a dynamic plugin. `profiles/substrate-grandpa-v1`
implements profile ports defined by `ergo-settlement-core` and owns the frozen
V1 H160 peg-in target/mint and committed-vault bindings, EVM burn-leaf/root
semantics, checkpoint/finality statement, proof and commitment codecs, domains,
IDs, digests, vectors, source-finality/reorg rules, ERG asset-lane semantics,
candidate identities, and exact profile-specific tracker and ErgoTree bindings.

A profile performs no network access, persistence, signing, submission, or
broadcast. Frontier/GRANDPA adapters collect and execute external evidence; the
profile defines its canonical meaning; Ergo settlement predicates remain the
deciding authority. Future source/proof families require separate statically
registered modules and cannot reinterpret V1 identifiers or bytes.

### Composition Root

An application such as `apps/bridge-daemon` assembles the cores, statically
selected profiles, and adapters. The current `relayer/src/relayer-daemon.ts` is
the practical composition root, but it also contains orchestration and
infrastructure details that WP-08A must separate semantically.

Allowed dependencies are:

```text
relayer-core         -> ergo-settlement-core
profiles/*           -> ergo-settlement-core
adapters             -> relayer-core
adapters             -> ergo-settlement-core  # public settlement types/ports only
source adapters      -> selected profile      # public types/codecs only, when required
composition root     -> cores + selected profiles + adapters
```

The following are forbidden:

- either core importing an adapter;
- `ergo-settlement-core` importing `relayer-core`;
- `ergo-settlement-core` importing a concrete profile;
- a profile importing `relayer-core` or an adapter;
- cyclic dependencies;
- bypassing proof, checker, signer, submitter, or broadcast-authorization ports.

Interface names remain provisional until the inventory below is converted into
tested package boundaries.

### Current Physical Boundaries

WP-08A-T1 places three existing network-free surfaces under
`relayer/src/ergo-settlement-core`:

- source-neutral Sigma/Ergo register and ErgoTree codecs;
- Ergo extension-tree codecs and membership verification;
- deterministic ERG change and miner-fee conservation planning.

Legacy module paths re-export those implementations so downstream behavior,
bytes, and vectors remain unchanged. The current empty DUP digest, miner-fee
policy and canonical proveDlog key validation are not source-neutral core
primitives. WP-08A-T5 places them in the concrete V1 profile while retaining
their legacy exports.

WP-08A-T2 adds the pure
`relayer/src/profiles/substrate-grandpa-v1` burn, checkpoint and finality
compatibility family. Existing top-level modules are exact re-export shims.
Frontier extraction, GRANDPA collection, native execution, tracker admission,
persistence, signing, submission and broadcast remain outside the profile.
The shared native request limit remains infrastructure-owned; the V1 envelope
retains a separately frozen equal ceiling checked by compatibility tests.

WP-08A-T3 adds the first physical `relayer-core` lifecycle under
`relayer/src/relayer-core`. It runs aggregate-settlement recovery through two
narrow ports: one returns typed Ergo observations plus opaque consensus
evidence, and one exposes only exact journal listing, CAS-bound recovery
mutation and confirmed-reorg quarantine operations.

The recoverable-attempt phase completes all observations before its first local
mutation. Confirmed attempts are listed afterward so they see completed
recoverable mutations; confirmed quarantines remain individually atomic rather
than pretending that the complete pass is one transaction. An empty journal is
a no-op after database loss, not authority to reconstruct candidates. The core
accepts no generic `save`, boolean verification, signer, submitter or broadcast
capability.

WP-08A-T4 adds the first physical adapters and application composition. The
Ergo finality-record, stable/matching observation and endpoint-alignment
implementations now live under `relayer/src/adapters`; their previous paths are
exact compatibility re-exports. The recovery-specific Ergo adapter statically
binds one primary client and optional provenance-bound witness pair. The
recovery journal adapter accepts the four exact `StateTracker` operations,
copies ordered burn identities at the mutation boundary, and rejects an
impossible status classification rather than casting it into authority.

`relayer/src/apps/bridge-daemon/aggregate-settlement-recovery.ts` constructs
those two concrete adapters and invokes the network-free lifecycle. It accepts
the narrowed concrete client and journal capabilities, not caller-selected
generic ports. The existing `recoverAggregateSettlementAttempts` export,
daemon call site, CLI, result shape, observation bytes and runtime identities
remain unchanged. A capability-denial test scans the complete recovery runtime
closure and rejects checker, signer, approval, submitter, transport and
broadcast routes.

WP-08A-T5 adds the complete current authenticated unsigned-candidate vertical
under `relayer/src/profiles/substrate-grandpa-v1`: authenticated tracker
history and value semantics, single-key DUP reconstruction, the fixed
ten-confirmation anchor policy, exact burn/root/payout/replay plan, tracker and
contract identity checks, ERG conservation, and deterministic unsigned
transaction construction. `BoxLike` and the network-free unsigned transaction
shape move to `ergo-settlement-core`; they carry no profile authority.

The legacy tracker, AVL, policy, limit, builder and transaction entry points
retain their runtime bindings. `aggregate-settlement-service.ts` still owns
box observation, EIP-12 materialization, ContextExtension reporting and the
process-local provenance brand. An offline profile result remains unbranded
and cannot satisfy the live candidate, JVM-check, journal or broadcast
admissions. Exact file-and-symbol-scoped allowlists permit only the profile
policy's secp256k1 public-key validation binding and only the reviewed AVL
operations required by the two profile modules.

WP-08A-T6 moves the current V1 peg-in commitment planner, exact
committed-vault bindings, EVM replay identity, native runtime-record codec and
domain-separated native replay identity into the same concrete profile. The
legacy commitment and runtime-state paths are exact re-export shims.

Raw Ergo RPC responses do not enter the profile. `peg-in-transition.ts`
canonicalizes transaction, inclusion, input, box and register fields first and
rejects contradictory SDK aliases. It retains canonical-chain observation,
confirmation depth, source/vault UTXO checks, lifecycle persistence, EVM
deduplication and mint execution. The profile returns normalized bindings, not
an eligibility or authorization capability. Its replay object names the raw
EVM `processedPegIns` key separately from the sidechain-domain-separated native
runtime key.

WP-08A-T7 adds one static off-wire asset-profile selector to the concrete
profile. Its only registered identity binds burn-leaf version `1`, domain
`E2S_TRUSTLESS_BURN_LEAF_V1`, the all-zero native-ERG asset ID and positive
Ergo-Long nanoERG amounts. Burn leaves encode the amount as u64 big-endian,
peg-in runtime records use u64 little-endian, and committed vaults bind box
value plus the Ergo Long R6. Peg-in commitment and
committed-vault inputs require the exact profile ID; Frontier root production,
native checkpoint admission and authenticated settlement consume the same
descriptor. Unknown profile IDs reject before funds evaluation. No wire,
candidate, checkpoint, contract or runtime identity includes this new
selection ID, so frozen V1 bytes remain unchanged.
Verified-PegOut leaf and proof production also requires that exact off-wire
profile ID and always emits the profile's zero asset bytes. Native checkpoint
admission, candidate binding, unsigned-package validation, contract-acceptance
mirroring and the committed-vault mint-eligibility candidate consume the same
descriptor rather than defining another asset constant.

WP-08A-T8A extracts authenticated settlement candidate reconciliation into a
second network-free `relayer-core` lifecycle. It consumes only an exact
candidate journal, typed burn and Ergo-input observations, a proof-recollection
operation, and a process-local revalidation cache. The core prunes stale cache
entries, treats a missing peg-out as invalid, handles a canonical burn
reversion through the journal's atomic burn/candidate transition, defers
unknown or unavailable observations, rejects replaced anchors and spent
tracker/DUP/vault inputs, and reconstructs only an exact non-authorizing
process-local revalidation after restart.

The concrete journal and observation adapters live under
`relayer/src/adapters`; the static application root lives under
`relayer/src/apps/bridge-daemon`. The daemon retains the concrete native proof
recollection and profile prerequisites behind the supplied operation. The new
runtime closure imports no legacy state tracker, concrete RPC client, checker,
signer, approval, submitter, transport, or broadcast route. An empty journal
performs no external observation and creates no candidate authority.

T8A covers restart cache rebuilding, canonical burn reversion, unknown or
unavailable RPC views, stale Ergo inputs, and empty-journal behavior.
Database-loss package reconstruction and out-of-order cache-snapshot handling
were deferred to WP-08A-T8B. Out-of-order replay across the remaining
check/sign/authorization/submit/confirmation lifecycle stays explicitly in
WP-08A-T8C.

WP-08A-T8B extracts the authenticated V2 prepared-candidate package-recovery
sequence into a third network-free `relayer-core` lifecycle. The core orders
one exact package/candidate reconstruction, one matching source-observation
port, one deterministic recovery-binding port, and one exact journal mutation.
It rejects source-tip drift and any candidate, burn, chain, transaction, block,
event, amount, or recipient mismatch before journal access, brands the admission
only in the live process, and verifies every persisted checker/finality
authority field remains null with status exactly `prepared`.

The Substrate/GRANDPA V1 compatibility facade retains concrete unsigned-package
validation, native candidate provenance, dual Frontier RPC observation, and the
SHA-256 cache-recovery binding. The exact adapter owns the recovery-admission
SHA-256 binding. `StateTracker` independently reasserts cache, native-candidate,
and matching-source provenance, repeats the exact source-to-candidate binding,
and recomputes the canonical recovery digest before its immediate SQLite
transaction. That transaction retains current tracker, DUP, and vault rechecks,
replay rejection, peg-out insert and prepared-candidate persistence, and rejects
authority-bearing output before commit. The core postcondition is defense in
depth rather than a substitute for that transaction.
Cache replacement and recovered candidate persistence remain two separately
atomic operations; this slice does not claim one transaction spans both.
Existing complete-database-loss, duplicate recovery, out-of-order cache
snapshot, divergent RPC, deep-reorg, tip-drift, current-cache drift, write-lock
and rollback matrices remain the behavioral baseline.

The new core, three exact adapters and statically imported application
composition module contain no concrete RPC, SQLite, checker, signer, approval,
submitter, transport, or broadcast capability. The compatibility facade is the
only runtime importer of that composition module; the composition function and
an arbitrary port implementation are not funds authority. Remaining checker,
signer, authorization, submitter, confirmation and full WP-07 replay
boundaries remain WP-08A-T8C.

WP-08A-T8C1 extracts check-to-reservation into a fourth network-free lifecycle.
Eleven exact adapters and one static application root order revalidation,
package binding, local signing, JVM checking, stable Ergo and source
observations, check admission, execution authorization, and durable execution
reservation. Signed bytes remain behind a process-local material registry;
only an opaque handle crosses the signer/checker boundary. The existing
non-mainnet check command consumes this composition, but the resulting handoff
contains no submitter or transport authority.

WP-08A-T8C2A and T8C2B add the durable late-stage lifecycle, nine exact
adapters, and a non-default composition root. One process-branded fixed
submitter is bound to an opaque, one-shot authorization. Durable attempt state
precedes approval freshness, immediate authority revalidation, and the fixed
callback. Accepted, rejected, ambiguous, thrown, confirmed, stale, and reorged
outcomes remain distinct. Restart is observation-only and cannot resubmit. The
facade is inactive: no daemon, CLI, npm route, or concrete node transport
imports it.

Closeout C1 adds `relayer/src/profiles/source-profile-registry.ts`. This static,
off-wire registry binds the current source, statement, proof-system,
Ergo-settlement, and native-ERG asset profile identities. The concrete
check-to-reservation facade selects it before any lifecycle capability can run.
Unknown identifiers and the reserved STARK proof-system ID reject fail-closed.
Selection changes no V1 bytes, domains, proofs, candidates, transactions,
ErgoTrees, digests, or vectors.

WP-06 source fixtures now live only under `relayer/src/test-fixtures`. A static
dependency-graph scan fixes the complete evidence-only transitive closure that
may reach them and rejects any reachability from the daemon, operational
entrypoints, application roots, adapters, profiles, or either core. They are
test evidence, not registered runtime adapters.

The closeout behavioral matrix drives the public application and compatibility
roots through deterministic ports. It covers aggregate rollback and confirmed
reorg quarantine, candidate burn reversion/source outage/stale inputs,
out-of-order package recovery before journal mutation, and restart source
disagreement without transport or restored authority. Narrow concrete
RPC/SQLite suites remain responsible for their adapter mechanics.

`npm run architecture:check` is the executable boundary. It parses imports with
the TypeScript compiler API, rejects dependencies outside the allowed graph,
rejects any new layered module that reaches back into an unclassified legacy
module, restricts settlement-core, relayer-core and profile external
dependencies to reviewed layer/file allowlists, rejects direct and statically recognized
indirect access to unbound environment, network, crypto, dynamic-code and
runtime-loader capabilities, and detects cycles among layered runtime modules.
The initial relayer-core allowlist is empty. The canonical `npm run check`
includes this boundary.

The local architecture closeout is complete at its frozen checkpoint. The
three former fixed daemon operations are separated and retired from new
submission; historical attempts retain observation and reconciliation only.
That checkpoint passed its documented clean-checkout gate and independent
review. A future public-source candidate must repeat the promotion checks on
its exact commit. No future token asset-profile family is implemented.

## Current Producer-To-Consumer Inventory

Classification tags:

- **GEN**: genuinely generic algorithm or lifecycle concept;
- **ERGO**: Ergo/eUTXO-specific;
- **EVM**: Frontier/EVM-specific;
- **GRANDPA**: Substrate/GRANDPA-specific;
- **INFRA**: persistence, transport, SDK, or runtime infrastructure;
- **COMPAT**: current compatibility or legacy profile.

The deciding-authority column identifies the boundary that can authorize the
next state. An observation-only row deliberately says that it has no authority.

| Producer | Exact bytes / fields | Consumer | Deciding authority | Failure if relaxed | Current module | Classification and target layer/profile |
|---|---|---|---|---|---|---|
| Deposit observation | Ergo box ID, proposition/address, value in nanoERG, creation height, transaction ID, R4 target H160, R7 depositor ErgoTree; R5/R6 presence is structural but mint amount is `SELF.value` | Peg-in lifecycle | None at observation; canonical Ergo history and the MCL spend predicate decide whether the box can transition | A malformed or refundable box could enter mint processing, or user-declared R5 could inflate supply | `relayer/src/ergo-client.ts`, `relayer/src/relayer-daemon.ts` | ERGO + INFRA + COMPAT; Ergo observation adapter returns raw fields, `profiles/substrate-grandpa-v1` defines the H160/depositor meaning, `relayer-core` owns lifecycle |
| Committed-vault transition | Consumed deposit box ID; exact vault ErgoTree; pure ERG value; R4 source box ID, R5 target H160, R6 exact value, R7 depositor tree; every consensus-serialized header field and recomputed Blake2b-256 header ID; transaction-section header ID/version; every canonical transaction ID and post-V1 witness ID; exact target signed bytes; immutable per-source root/index/count/digest receipts; confirmation policy | Mint-eligibility state machine | `MainChainLock.es` plus the confirmed Ergo transaction whose complete Scorex root matches a header with a recomputed canonical ID; SQLite records only the observation. Header identity and root matching do not independently establish PoW, canonical consensus, or source independence | Deposit could remain refundable after mint, value could move to the wrong script, recipient/amount provenance could drift, an RPC could pair an expected ID with fabricated header/block contents, or a later revalidation could silently switch evidence | `contracts/MainChainLock.es`, `relayer/src/ergo-settlement-core/ergo-{header-id,block-transactions-root}.ts`, `relayer/src/adapters/ergo-block-transaction-commitment.ts`, `relayer/src/profiles/substrate-grandpa-v1/peg-in-{commitment,committed-vault}.ts`, compatibility entry point `relayer/src/peg-in-commitment.ts`, orchestration in `relayer/src/peg-in-transition.ts`, composition in `relayer/src/relayer-daemon.ts` | ERGO + COMPAT; pure header/Scorex codecs and source-neutral box/encoding/balance primitives in `ergo-settlement-core`, exact MCL/vault/H160 bindings in `profiles/substrate-grandpa-v1`, SDK/RPC parsing and block verification in a static adapter injected through an explicit lifecycle port; malformed or inconsistent RPC evidence holds without terminal state mutation |
| Mint eligibility and mint identity | Canonical source box ID, committed vault box ID, target H160, amount from deposit value, depositor provenance, commit transaction/inclusion identity; raw EVM dedup key is the source Ergo box ID, while the native runtime record key is separately domain-bound to sidechain ID | Peg-in reconciliation and a future authenticated V4 mint-admission consumer | No active relayer mint execution consumer exists. Current profile bindings and reconciliation are non-authorizing; the historical EVM contract still defines owner authority and `processedPegIns[boxId]` dedup, but `SidechainClient` exposes observation/confirmation only | Observation-only minting reopens deposit -> mint -> refund; conflating the native and EVM replay namespaces or changing either key permits replay or inflation | `relayer/src/profiles/substrate-grandpa-v1/peg-in-{mint-identity,runtime-state}.ts`, compatibility path `relayer/src/peg-in-runtime-state.ts`, observation/reconciliation in `relayer/src/{peg-in-transition,sidechain-client}.ts`, historical predicate in `solidity/ErgoBridge.sol` | GEN lifecycle + ERGO + EVM + COMPAT; exact V1 replay identities in the selected profile, lifecycle outside the profile, no active EVM execution adapter |
| Withdrawal observation | Bridge contract address, successful receipt, event signature, user H160, net `uint256` amount, 33-byte key or 36-byte P2PK ErgoTree, transaction hash, block number/hash, global log index | Burn extraction and candidate lifecycle | None at log-query time; canonical receipt, source finality policy, and later proof acceptance decide eligibility | Reverted, wrong-contract, wrong-log, ambiguous multi-event, stale-block, recipient, or amount data could release ERG | `solidity/ErgoBridge.sol`, `relayer/src/sidechain-client.ts`, `relayer/src/peg-out-burn-verifier.ts` | EVM + INFRA + COMPAT; Frontier observation adapter extracts evidence using public event/address semantics from `profiles/substrate-grandpa-v1`, then returns it to `relayer-core` |
| Burn leaf and `bridge_event_root` | V1 205-byte leaf: version, sidechain ID, execution block hash, derived burn ID, transaction hash, u32be log index, recipient ErgoTree hash, u64be positive-Ergo-Long nanoERG amount, all-zero native-ERG asset ID; domain-separated Blake2b leaf/node hashes and ordered odd-width Merkle tree | Runtime checkpoint, tracker value, inclusion verifier, payout and DUP binding | Pure codec establishes identity/inclusion only; the static native-ERG profile decides current asset semantics; runtime consensus and later settlement proof establish authenticity | Event coordinates, chain, recipient, amount, asset, or replay key could be substituted; a nonzero negative-fixture asset could be mistaken for a supported token lane; a locally computed root could be mistaken for a consensus root | `relayer/src/profiles/substrate-grandpa-v1/{asset-profile,trustless-burn-proof}.ts` (canonical), `relayer/src/trustless-burn-proof.ts` (compatibility), `relayer/src/frontier-bridge-event-root.ts`, `sources/frontier/0001-bridge-runtime-commitment.patch` | EVM + COMPAT; static native-ERG selection in the concrete profile and Frontier extraction adapter; only source-neutral encoding/hash primitives remain in `ergo-settlement-core` |
| Checkpoint and finality evidence | V1 216-byte checkpoint; 64-byte `0x0401` value; 356-byte `BridgeFinalityStatementV1`; `AggregateFinalityProofV1` 464-byte fixed prefix plus bounded payload; trust-anchor digest, finality horizon height/hash, program ID, verifier profile ID, statement/payload/proof digests | Tracker admission and candidate provenance | Native verifier establishes these semantics only relative to its reviewed GRANDPA trust root off chain; no activated Ergo-verifiable consumer currently establishes the bound finality semantics | Proof identity could be mistaken for proof validity, anchor age for source finality, or another proof system for V1 semantics | `relayer/src/profiles/substrate-grandpa-v1/bridge-checkpoint-commitment.ts`, `relayer/src/profiles/substrate-grandpa-v1/bridge-finality-proof.ts`, compatibility re-exports at the prior top-level paths, `relayer/src/native-checkpoint-proof-collector.ts`, `relayer/src/native-finalized-bridge-checkpoint.ts` | GRANDPA + COMPAT + INFRA; GRANDPA collection/execution adapter plus concrete `profiles/substrate-grandpa-v1` |
| Tracker admission | Exact `0x0401 = bridge_event_root[32] || checkpoint_commitment[32]`, 496-byte finality commitment, extension membership proof, anchor header index, AVL insert proof, and 264-byte tracker value | Authenticated payout transaction as read-only data input | Current script proves extension membership and exact proof identity, while R9 still authorizes finality semantics; this is federated, not trustless | An invented checkpoint or semantically false proof identity could be admitted and later authorize a payout | `contracts/SPVTrackerAuthenticated.es`, `relayer/src/profiles/substrate-grandpa-v1/spv-tracker-authenticated.ts`, compatibility re-export at `relayer/src/spv-tracker-authenticated.ts`, `relayer/src/native-checkpoint-settlement-admission.ts` | ERGO + GRANDPA + COMPAT; source-neutral settlement primitives in `ergo-settlement-core`, exact V1 finality/tracker bindings in `profiles/substrate-grandpa-v1`, external work in adapters |
| Candidate construction | Burn ID; tx/block/log coordinates; tracker key/value and box; anchor header ID/height; DUP input box/digest; vault box; exact output creation height; observed tips; canonical EIP-12 digest; native statement/program/verifier/payload/proof identities | JVM check, journal, and guarded submission path | Deterministic plan is non-authoritative; only the active settlement predicate, fresh observations, JVM acceptance, and broadcast policy can advance it | A stale or differently serialized candidate could inherit a previous approval or settle another burn | `relayer/src/profiles/substrate-grandpa-v1/authenticated-settlement-{plan,transaction,candidate}.ts`, compatibility entry points in `relayer/src/aggregate-settlement-{builder,tx,service}.ts`, lifecycle binding in `relayer/src/authenticated-settlement-candidate.ts` | ERGO + GRANDPA + COMPAT; source-neutral box/unsigned-transaction types and balance planning in `ergo-settlement-core`, exact V1 planning and transaction bindings in the profile, EIP-12/provenance and lifecycle outside the profile |
| Journal | Candidate schema/version, operation ID, expected and submitted tx IDs, burn/tracker/finality identities, transport reservation, terminal abandonment reason, status, check digests, and rollback/invalidated state | Restart, retry, reconciliation, and operator diagnostics | No funds authority; chain-visible state and active profile revalidation decide. An ambiguous pending transport reservation is retired only after two matching absences separated by the recovery window, with both sources retaining the first tip as canonical. A persisted terminal reason makes committed retirement idempotently observable after response loss. Database-loss package recovery may restore only the exact peg-out plus an unchecked `prepared` candidate after current cache rechecks | Restored local state could authorize a phantom mint/payout, while an unreconciled reservation or lost retirement response could permit duplicate transport or block a valid replacement indefinitely | `relayer/src/relayer-core/{aggregate-settlement-recovery,authenticated-settlement-candidate-reconciliation,authenticated-v2-prepared-candidate-recovery}.ts`, exact journal adapters under `relayer/src/adapters`, static roots under `relayer/src/apps/bridge-daemon`, persistence in `relayer/src/state-tracker.ts`, and compatibility facades in the daemon/top-level modules | GEN lifecycle in `relayer-core`; SQLite remains INFRA behind exact static journal adapters |
| JVM check | Exact EIP-12 candidate, context/header identity, expected unsigned tx ID, signed tx ID, node-returned tx ID, check response digest, contract-tree identity, revalidation provenance, and schema-version-2 checker identity: profile, source adapter, canonical node origin, endpoint, method, and transport policy | Broadcast authorization and candidate journal | Pinned JVM `/transactions/check` establishes bounded node acceptance only; it does not grant operator approval or prove source finality. A validated-file approval additionally requires the evidence checker origin to equal its declared `ergoNodeUrl`; older schema-version-1 evidence cannot mint submission provenance | A different transaction, tree, context, stale check, or response from another node could be submitted under a prior acceptance | `relayer/src/authenticated-settlement-jvm-check.ts`, `relayer/src/authenticated-v2-setup-jvm-check.ts`, `relayer/src/aggregate-settlement-evidence.ts`, `relayer/src/aggregate-settlement-approvals.ts`, `relayer/src/fleet-signer.ts` | ERGO + INFRA; JVM checker adapter through `relayer-core` port |
| Signer | Frozen unsigned bytes and digest, context extensions, expected tx ID, state context, selected key capability, signed transaction and signed tx ID | Checker or explicitly authorized operational route | Signer proves key authorization for exact bytes; it does not decide settlement eligibility or broadcast. Legacy aggregate payout, owner-mint, and committed-vault initiation have no daemon signer consumer | A signer could silently rebuild, mutate, or authorize a transaction outside the checked candidate | `relayer/src/fleet-signer.ts`; bounded devnet reward maintenance is isolated under `relayer/src/scripts` | ERGO + INFRA; statically registered sign-only/check-only adapter, absent from retired value-initiation routes |
| Submitter | Frozen signed transaction and digest, expected tx ID, exact node origin, single-use authorization, transport result | Post-submit reconciliation | Transport has no policy authority. The fixed committed-vault compatibility submitter, legacy aggregate execution module, and every new V1 payout transport entrypoint are absent. Historical confirmation/recovery observes already-existing attempts and cannot submit | A direct submit call could bypass candidate checks or circuit breakers; treating an uncertain historical response as rejected could permit unsafe replacement | Network-free lifecycle ports under `relayer/src/{relayer-core,apps/bridge-daemon,adapters}`; bounded devnet reward maintenance under `relayer/src/scripts`; historical conservation guard in `relayer/src/legacy-aggregate-settlement-conservation.ts` | ERGO + INFRA + COMPAT; no active daemon fixed operational submitter |
| Broadcast authorization | Explicit broadcast-enabled policy, target origin, exact transaction identity, current candidate/revalidation identity, and circuit-breaker state | Exact signed-candidate submitter invocation for retained operational routes | Legacy V1 approval files are historical evidence inputs only. The execution module, daemon composition, CLI commands, and service transport APIs that could consume them are absent. A future external-fee profile requires a new reviewed and activated authority path rather than reinterpretation of V1 | A default, plugin, local status, stale approval, or reintroduced legacy command could turn preparation into a value-bearing action | `relayer/src/broadcast-policy.ts`, `relayer/src/legacy-aggregate-settlement-conservation.ts`, `relayer/src/live-settlement-readiness.ts`, `relayer/src/aggregate-settlement-approvals.ts`, `relayer/src/relayer-daemon.ts`, `relayer/src/frontier-relayer-compatibility-authority-inventory-v4.ts` | GEN policy + INFRA + COMPAT; legacy relayer funds release physically retired, on-chain cutover still open |
| Confirmation and reconciliation | Canonical transaction ID and inclusion, exact output tokens/scripts/registers/value, current UTXO existence, fresh burn status, tracker/DUP/vault lineage, rollback observations, and a versioned source-authority profile binding distinct node and administration identity pins | Lifecycle state and reconstructible cache | Chain-visible state and profile predicates decide; the journal records the result. Authenticated candidate restart reconciliation discards process-local revalidation on unknown/reverted burns or unavailable/stale Ergo inputs and can rebuild it only from fresh proof and input recollection. Database-loss package recovery must re-observe matching source views and persists only unchecked `prepared` state. Legacy aggregate confirmation and recovery apply only to already-existing attempts; they cannot create a new reservation or transport. An existing uncertain historical result remains reserved until a two-source canonical-descendant absence window proves that retirement is safe. URL inequality alone cannot satisfy the two-source boundary | Mempool presence, missing boxes, a post-sign source reorg, endpoint aliases, an uncertain transport response, or a local submitted flag could be mistaken for canonical settlement or definite rejection | `relayer/src/relayer-core/{aggregate-settlement-recovery,authenticated-settlement-candidate-reconciliation,authenticated-v2-prepared-candidate-recovery}.ts`, corresponding adapters and static roots under `relayer/src/{adapters,apps/bridge-daemon}`, `relayer/src/aggregate-settlement-service.ts`, `relayer/src/state-tracker.ts`, compatibility facades, and `relayer/src/relayer-daemon.ts` | GEN lifecycle + ERGO/EVM adapters + INFRA + COMPAT; `relayer-core` orchestrates typed ports while adapters and selected profile predicates retain authority |
| Asset conservation | Exact ERG values, token IDs/amounts, vault and payout scripts, miner-fee output, vault successor, EVM mint/burn/fee supply changes, and profile-specific liability equation | Contract predicates, mint/payout eligibility, and monitoring | On-chain contracts enforce branch-local conservation; protocol equations belong to the settlement profile. The legacy V1 equation is known deficient and every new relayer submission entrypoint is physically absent. The inactive external-fee profile preserves `backing - supply` by funding the miner fee externally. Cross-chain monitoring is alarm-only | Refundable staging, fees, pending exits, rent, or another asset could be counted as backing; token substitution, a fee-from-backing payout, or unbacked supply could be hidden | `contracts/MainChainLock.es`, `contracts/MainChainAggregateUnlockAuthenticated.es`, `contracts/MainChainAggregateUnlockAuthenticatedExternalFeeV1.es`, `solidity/ErgoBridge.sol`, `relayer/src/legacy-aggregate-settlement-conservation.ts`, `relayer/src/relayer-daemon.ts` | ERGO + EVM; Ergo-side branch conservation in `ergo-settlement-core`, concrete cross-chain liability equation in the selected profile, observations in adapters |
| Reorg policy | Source block ID/hash and ancestry/finality evidence, Ergo inclusion block ID/height, observed tips, policy version/depth, stale-anchor state, rollback and replacement events | Candidate invalidation, retry, circuit breakers, and reconstruction | Versioned source and settlement policies over canonical chain observations; local status is never sufficient | A height-only or timeout-only rule could retain a reverted burn, remint a phantom deposit, or pay from a stale anchor | `relayer/src/peg-in-transition.ts`, `relayer/src/peg-out-burn-verifier.ts`, `relayer/src/sidechain-rollback-guard.ts`, `relayer/src/trustless-observation-reconciliation.ts`, `relayer/src/relayer-core/{authenticated-settlement-candidate-reconciliation,authenticated-v2-prepared-candidate-recovery}.ts`, their adapters/static roots, and `relayer/src/relayer-daemon.ts` | GEN lifecycle plus source-specific adapter/profile; generic orchestration in `relayer-core`, source finality/reorg rules in the selected profile |

## Versioned Settlement And Proof Profiles

### Current `substrate-grandpa-v1` Compatibility Profile

`BridgeFinalityStatementV1`, `AggregateFinalityProofV1`,
`AggregateFinalityCommitmentV1`, and the associated authenticated tracker are
the current compatibility family. Their semantics are tied to the existing
Substrate/GRANDPA checkpoint and proof path. They are not generic proof
containers.

The physical `profiles/substrate-grandpa-v1` module now owns the pure V1 burn,
checkpoint, finality-statement/proof and proof-identity commitment meanings,
plus the current H160 peg-in commitment, exact committed-vault and distinct
EVM/native replay identities.
The legacy paths re-export those exact bindings, so this extraction changes no
runtime byte, identifier, contract tree, vector, or deciding authority.
The profile also owns the current authenticated ERG settlement-candidate,
tracker, runtime-record and static native-ERG asset semantics described above.
Unknown asset-profile selection rejects fail closed. No token profile is
registered or implied.

WP-08A must preserve their exact:

- bytes and domain separators;
- versions, IDs, digests, and golden vectors;
- candidate identities and tracker values;
- ErgoTree bytes and positive/negative VM semantics.

A `proofSystemId` selects a proof system and format. It never changes the
meaning of the statement it carries. A future validity/STARK path requires a
new reviewed statement family or version, new domains, and explicit public
inputs. Reserved proof-system ID `2` remains rejected until that complete path
is activated.

### Non-Normative `aux-pow-source` Profile

A future auxiliary-proof-of-work source profile would need to verify or
constrain:

- proof of work and fork choice;
- checkpoint canonicality;
- withdrawal inclusion;
- a versioned confirmation-depth and reorg policy;
- payout and replay bindings.

Depth is a probabilistic policy for a PoW chain, not automatic deterministic
finality. The profile cannot reuse GRANDPA rule ID `1` or silently reinterpret
the V1 statement.

### Non-Normative `validity-settled-source` Profile

A future validity profile could bind:

- previous and next state roots;
- consumed deposits and withdrawals;
- asset identity, conservation, supply, and liability;
- chain and domain identity;
- the exact program, verifier, and verification key/profile;
- an explicit data-availability commitment and policy when required.

A valid STARK or a data-availability commitment does not automatically prove
data availability, canonical ordering, liveness, censorship resistance, or a
reorg policy. A privacy state machine remains outside the bridge. The bridge
may settle its authenticated state transition without implementing its privacy
engine.

## Peg-In Boundary

No source adapter or journal row can authorize a mint from a deposit
observation. Mint eligibility is the conjunction of:

1. a canonical deposit identity;
2. a confirmed Ergo transaction that consumes that deposit;
3. the exact non-refundable vault successor;
4. exact asset, amount, recipient, and source-chain bindings;
5. a stable idempotent mint identity.

The current ERG path uses the source Ergo box ID as the EVM dedup identity.
Future profiles must define an equally explicit domain-separated identity
rather than inheriting a database primary key.

## Settlement And Broadcast Boundary

The required capability sequence is:

```text
observe -> prove -> plan -> revalidate -> JVM check -> authorize broadcast
        -> sign exact bytes -> submit exact signed transaction -> reconcile
```

No step implies the next. In particular, a JVM check is not a broadcast
approval, a signature is not a submission decision, and a submitter is not an
authorization service.

## Asset Lanes

The ERG V1 lane remains unchanged.

The public V1 specification currently defines the leaf amount as **nanoERG**
and defines an all-zero 32-byte `assetId` as the ERG lane. Although the wire
format has a 32-byte asset field and a u64 amount field, the published semantics
do not yet establish that nonzero IDs mean token IDs or that the amount means
raw token units. Therefore this document does not approve reuse of the V1 leaf
for tokens.

WP-08A-T7 records that conclusion as the statically selected
`e2s.substrate-grandpa-v1.asset.native-erg.v1` profile. Current producers write
the zero ID, peg-in accepts only pure ERG, and current settlement consumers
reject nonzero IDs. The codec may still encode a nonzero ID to construct an
isolated rejection vector, but the verified-PegOut leaf/proof builders cannot
select it. Codec expressiveness is not asset support.

A future token settlement profile requires an independently reviewed contract
and profile with:

- exact token ID and raw-unit conservation;
- no asset substitution;
- exact vault and payout successors;
- separate ERG funding for miner fees, minimum box value, and storage rent;
- reserve/liability accounting when supply can change.

Decimals are display metadata, never an on-chain conservation invariant. A
future byte-reuse decision must first specify the public semantics of
`assetId` and `amount`. If those semantics cannot cover raw token units without
ambiguity, the token lane must use a new leaf version and domain.

## Current Incompatibilities And Extraction Constraints

WP-08A is extracting one behavior-preserving lifecycle at a time. The
aggregate-recovery path now has concrete adapters and an application root, but
the following broader boundary mismatches remain:

1. Outside aggregate recovery, `relayer/src/relayer-daemon.ts` still constructs
   RPC clients, loads runtime configuration, orchestrates lifecycles, invokes
   signing/submission, and writes persistence. It remains both composition root
   and application logic for those paths.
2. `relayer/src/aggregate-settlement-service.ts` combines deterministic
   planning with Ergo box selection, state reads/writes, fresh burn checks, and
   process-provenance admission, revalidation, reservation, and finalization.
   It has no signer, submitter, broadcast, or configurable execution capability;
   separating its planning and persistence ports remains WP-08A work.
3. `relayer/src/fleet-signer.ts` exposes sign-only and check-only capabilities;
   its generic combined sign-and-submit wrappers are physically absent. No
   fixed operational submission facade remains in the daemon, and the peg-in
   coordinator exposes no injectable submission entrypoint. New committed-vault
   deposits stay refundable until an authenticated V4 mint authority is active,
   while already-recorded attempts retain observation and fail-closed
   reconciliation. This separation does not repair the historical
   `MainChainLock` contract or authorize a future source-lock profile.
4. `relayer/src/state-tracker.ts` contains valuable lifecycle and identity
   semantics beside SQLite-specific schema and mutations. Aggregate recovery
   now reaches only its four exact operations through a static adapter; moving
   the complete file without separating the remaining semantics would still
   not satisfy WP-08A.
5. The current solvency monitor aggregates active refundable staging and the
   committed vault. It is explicitly alarm-only and cannot become the canonical
   backing equation because refundable, unminted deposits are not settled
   collateral.
6. Current V1 checkpoint, statement, finality, tracker, and ERG asset semantics
   are source/profile-specific. Renaming them as generic would create silent
   compatibility risk.
7. The current broadcast switch covers both Ergo submission and EVM minting.
   Future composition must use operation-scoped, chain-specific capabilities so
   an observer-only process does not inherit value-bearing authority.
8. Generic `ErgoClient` and signer submission methods are physically absent.
   New submission authority may enter only through an exact, statically
   registered operation capability with immediate revalidation and explicit
   broadcast authorization; the inactive authenticated-settlement path must
   not be invented or activated by architecture extraction.
9. Global sidechain rollback handling is height-oriented, while proof collection
   performs stronger block-hash stability checks locally. The versioned source
   profile must unify same-height replacement, advancing-tip replacement,
   ancestry, and finalized-history policy through one port.

These are extraction constraints, not reasons to delay WP-06. No new seam is
permitted during WP-06 unless Gate 5 already requires it, it preserves all
observable behavior and bytes, and it does not delay the critical path.

WP-07 records its recovery and adversarial behavior baseline against the
current authoritative seams; it does not depend on public package ports that
WP-08A has not yet implemented. WP-08A must then replay the same matrix through
the extracted ports without changing any security-relevant outcome.

## Claim Boundary

This architecture supports future reuse by source chains with different
consensus and execution models. It does not claim that such adapters exist,
that any external sidechain is supported, or that the bridge is trustless or
production-ready. Those claims remain blocked until the active settlement
profile closes its complete proof-to-release chain and independent review.
