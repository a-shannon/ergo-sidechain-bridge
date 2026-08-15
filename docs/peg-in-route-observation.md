# Peg-In Route Observation V1

This document defines the non-authorizing observation surface for the
`committed-vault-v3` peg-in route. Its purpose is to prove, under an explicit
review manifest, that refundable MainChainLock deposits have actually been
consumed into the exact configured settlement vault before mint eligibility.

It is not a deployment or mint command.

## Route Invariant

The accepted progression is:

`refundable MCL deposit -> confirmed MCL spend -> exact vault output 0 -> mint eligibility`

For every accepted commit transition, the spending transaction must:

- consume the indexed MCL box;
- identify exactly one canonical header at the inclusion height and match it;
- carry the exact inclusive confirmation count derived from the stable snapshot;
- create output 0 at the exact manifest-bound vault ErgoTree;
- preserve the full pure-ERG deposit value;
- bind vault `R4` to the source box ID;
- bind vault `R5` to the deposit H160;
- bind vault `R6` to the actual source value;
- bind vault `R7` to the depositor ErgoTree;
- appear in the complete indexed history of the exact vault address.

A current unspent legacy MCL box blocks the observation condition. Historical
legacy identities remain explicit because old refundable boxes do not inherit
the v3 contract automatically.

## Manifest

The strict JSON manifest uses schema
`ergo.bridge.peg-in-route-manifest.v1`. It binds:

- one Ergo network and a recent canonical anchor;
- the declared complete active and historical MCL route set;
- a source-revision cutoff and reviewed basis digests;
- the ordered committee keys and threshold embedded in MCL v3;
- the exact checked-in and resolved `MainChainLock.es` source digests;
- the active MCL address, ErgoTree, and raw-tree digest;
- the exact checked-in and resolved
  `MainChainAggregateUnlockTrustless.es` source digests and its tracker/DUP NFT
  bindings;
- the exact vault address, ErgoTree, raw-tree digest, and implementation profile;
- the minimum inclusive commit-confirmation policy.

The current vault implementation profile is
`main-chain-aggregate-unlock-trustless-v1-compatibility`. This is an exact
compatibility identifier, not a claim that the complete settlement transaction
is trustless. Gate 5 remains open until the checkpoint/finality and all-input
authority path are Ergo-verifiable.

The caller-supplied manifest digest detects accidental substitution. The tool
does not authenticate who reviewed or approved the manifest.

## Observation Command

From `relayer/`:

```bash
npm run pegin:route-observe -- \
  --manifest <reviewed-route-manifest.json> \
  --expected-manifest-sha256 <64-lowercase-hex> \
  --main-chain-lock-source ../contracts/MainChainLock.es \
  --settlement-vault-source ../contracts/MainChainAggregateUnlockTrustless.es \
  --primary-node-url <explicit-root-origin> \
  --witness-node-url <distinct-root-origin> \
  --json-out <new-report.json>
```

The command requires two distinct credential-free node origins, synchronized
extra indexes, one stable before/after snapshot, exact source agreement, a
fresh manifest anchor, bounded complete pagination, and deterministic P2S
compilation of both exact resolved contract sources.

The report passes only when:

- at least one active MCL deposit exists in indexed history;
- at least one spent deposit has an exact MCL-to-vault commit transition;
- every spent active deposit is an exact commit or valid timeout refund;
- indexed histories and current UTXO sets agree;
- no current UTXO exists at any declared legacy MCL route;
- both origins produce the same normalized observation.

An empty route or a compilation-only match does not pass.

## Classifications

Active deposits are classified as:

- `refundable`: the v3 MCL box is still unspent;
- `commit_pending`: an exact canonical MCL-to-vault transition exists but has
  not reached the manifest-bound confirmation depth;
- `committed`: the box was consumed into the exact output-zero vault state;
- `refunded`: the timeout path returned value to the bound depositor tree;
- `unresolved`: the recorded spend is not an exact commit or refund.

Malformed boxes, incomplete queries, stale anchors, index drift, source
disagreement, unresolved spends, missing committed transitions, and remaining
legacy UTXOs fail closed.

## Reconstructible Route Cache

The WP-07A recovery boundary can rebuild this complete Ergo-side route view
from the same stable two-source observation and atomically replace dedicated
SQLite cache tables. The cache records the manifest, source identities, stable
snapshot, canonical inclusion block and depth, all active-route deposits, vault
history, current UTXOs, and declared legacy routes.

Reads of the multi-table cache execute under one SQLite snapshot. On restart,
the complete normalized cache semantics are revalidated and the reconstruction
digest is recomputed; a mixed generation or stale digest fails closed.

The replacement transaction compares `peg_in_events` before and after the
write and aborts if any lifecycle row changes. After complete database loss it
therefore restores route inventory only: it does not recreate `detected`,
`consume_confirmed`, `minting`, or `minted` state. A restart can read the cache,
and a later canonical reorg can replace it with a shorter or refundable view,
but neither operation creates mint eligibility.

This cache is the Ergo half of peg-in recovery. It is joined to the Frontier
half by a separate provenance-bound reconstruction; neither half grants mint
authority.

## Frontier Mint Reconstruction

WP-07A now reconstructs the complete configured Frontier `PegIn` history from
two distinct, credential-free RPC origins. Each source must expose one stable
tip before and after the read and the exact same normalized view. The concrete
adapter disables ethers request caching and batching so each ordered stability
check reaches the configured origin. The observer:

- scans only the configured bridge address from its explicit deployment block;
- decodes the exact indexed
  `PegIn(address indexed to, uint256 amount, bytes32 ergoBoxId)` ABI;
- requires a successful receipt containing exactly the observed canonical log;
- resolves the event block again and matches its canonical hash;
- queries `processedPegIns` with an EIP-1898
  `{ blockHash, requireCanonical: true }` selector for the exact observed tip;
  the pinned Frontier resolves that hash only through its canonical native
  block mapping, rather than reading an unbound height or latest state;
- joins `ergoBoxId`, recipient, and nanoERG amount to the manifest-bound Ergo
  deposit and committed vault;
- rejects a mint for a refundable, shallow `commit_pending`, refunded,
  unresolved, unknown, or semantically mismatched route;
- rejects event/mapping disagreement, duplicate events, same-height tip drift,
  source disagreement, reverted receipts, and noncanonical event blocks;
- rechecks every event block, receipt, and mapping after the first stable tip;
- reconstructs the Ergo route again after Frontier observation, requires the
  exact same route digest from a new provenance-marked object, and then rechecks
  both Frontier tips to bracket the cross-chain observation window;
- leaves legacy mint history blocked when its original recipient and amount
  bindings cannot be reconstructed.

The output is schema- and digest-bound and can only be created from a genuine
provenance-marked Ergo route reconstruction. Its `confirmed_by_depth` label is
deliberately limited: EVM confirmation depth does not prove GRANDPA finality.
Distinct origins detect disagreement but do not prove independent operation or
canonical consensus.

The complete joined view is now persisted as a replaceable SQLite cache. One
immediate transaction replaces the Ergo route and the Frontier state, entries,
and issues; the persisted route digest must match the digest bound by the
Frontier reconstruction. An independent Ergo route replacement invalidates the
joined cache. Restart reads every table under one SQLite snapshot, reruns the
strict structural checks, and recomputes the complete reconstruction digest.
The restored object deliberately does not regain live-observation provenance.

Replacement compares the peg-in lifecycle, aggregate settlement attempts,
authenticated settlement candidates, and execution reservations before and
after the write. A mismatch aborts the transaction. Tests cover idempotent
restart, complete database loss, route invalidation, forced late-write rollback,
mixed-generation reads, tampered semantics, cloned provenance, read-only
inspection, and preservation of an existing minted lifecycle. Database loss
restores inventory only and does not create even a `detected` peg-in row.

The joined cache can now feed one bounded reconciliation mutation for an
existing lifecycle row. The caller supplies the exact current lifecycle digest
and joined reconstruction digest; one immediate transaction rechecks both,
derives either `deferred` or `quarantined`, appends a versioned digest-bound
journal entry, and advances a monotone hold. The journal cannot be updated or
deleted, including through SQLite conflict replacement. A held row is excluded
from the mint queue, and a database trigger
rejects status or binding changes that could advance authority. Terminal
incident handling remains possible. There is no hold-release path in this
milestone.

The daemon now invokes a bounded runtime reconciliation pass after discovering
deposit inventory and before its first lifecycle selection. The pass is
statically absent unless `PEG_IN_RUNTIME_RECONCILIATION_ENABLED=true` and all
of the following are explicit:

- reviewed route manifest path and expected digest;
- checked-in MCL and settlement-vault source paths;
- distinct primary and witness Ergo origins;
- distinct primary and witness Frontier origins;
- sidechain ID, canonical EVM chain ID, bridge H160, deployment block,
  confirmation count, and event bound;
- an optional lifecycle-row bound, capped at 1,000 and defaulting to 50.

The manifest and profile must also match the daemon's active MCL and vault,
operational sidechain ID and primary Frontier RPC, deployment-recorded EVM
chain ID, bridge H160 and deployment block, Ergo commit-confirmation policy,
and Frontier confirmation policy. Legacy deployment records without the EVM
chain ID and bridge deployment block cannot activate this runtime path. The pass recollects one complete joined view
and applies exact lifecycle/cache CAS holds to one deterministic bounded page.
Rows without a hold for that generation are processed first across successive
ticks. A later joined generation makes held rows eligible for a newer journal
observation, while the existing hold remains in force. Missing configuration,
deployment mismatch, recollection failure, source disagreement, lifecycle
drift, or cache drift returns to the daemon without any transition selection. Successful
recollection also leaves `lifecycleSelectionAuthorized = false`; this milestone
does not submit a commitment, promote, retry, mint, or release a hold. The
retained transition code is unreachable through this boundary until a separate
native Substrate/GRANDPA finality admission and reviewed hold-release policy are
implemented.

The runtime pass does not turn two-origin agreement or EVM confirmation depth
into finality. Native finality binding and a concrete approved dual-node
exercise remain open. The cache cannot create, promote, retry, or mint a
lifecycle row.

## Joined Cache Closeout Matrix

| Invariant | Producer / enforcement | Consumer | Failure if relaxed | Isolated negative |
|---|---|---|---|---|
| Live provenance is required to write | Both route and joined reconstructions carry process-local provenance checked by `StateTracker` | Joined cache replacement | Parsed or caller-forged JSON could become accepted chain history | Cloned route and joined objects reject before persistence |
| The Frontier view binds the exact Ergo route | The joined digest includes `ergoRouteReconstructionDigestHex`; replacement checks it against the route written in the same transaction | Restart cache and future reconciliation | A mint could be associated with a stale or refundable deposit generation | Route mismatch rejects; independent route replacement invalidates the join |
| Persisted semantics are canonical and digest-complete | Strict profile, source, tip, entry, event, issue, decision, and boundary validation recomputes the reconstruction digest | Restart reader | Edited SQLite fields could silently alter observed mint history | Mutated Frontier digest rejects |
| Replacement is atomic | One immediate SQLite transaction writes route, joined state, entries, and issues | Restart and retry | A crash could expose a new route with old mint history or the inverse | Forced entry-insert failure restores the prior joined generation |
| Reads use one generation | One SQLite read transaction covers joined state, entries, issues, and route | Reconciliation input | Concurrent replacement could combine old state with new entries | A concurrent writer still yields one complete old reader snapshot |
| Local authority is unchanged | Replacement compares lifecycle and settlement-authority tables before and after | Peg-in transition, settlement journal, execution reservation | Cache recovery could create or promote funds authority | Existing minted lifecycle remains byte-identical; database loss restores no lifecycle rows |
| Restart does not recreate provenance | The structural reader returns a frozen but unbranded object | Any future runtime consumer | SQLite alone could masquerade as a fresh dual-source observation | Restarted object fails the live-provenance assertion |
| Depth is not finality | The persisted boundary retains `confirmationDepthDoesNotProveGrandpaFinality`; the runtime pass always denies lifecycle selection | Reconciliation hold policy | EVM depth or node agreement could be treated as canonical consensus | Every structurally valid row remains deferred; the daemon records holds but cannot promote |
| Reconciliation is append-only and versioned | Exact lifecycle/cache CAS derives a V1 observation digest; recursive SQL triggers forbid journal update/delete and conflict replacement | Current local hold and audit history | A later process could rewrite why a row was blocked | Update/delete/replace attempts reject; exact replay is idempotent |
| Cache evidence can only reduce authority | An explicit lifecycle/source/route compatibility matrix derives the current hold, excludes the row from the mint queue, and blocks non-terminal lifecycle binding changes | Peg-in coordinator and direct `StateTracker` callers | A local observation could misclassify a contradiction or promote, retry, or mint | Every decision reason is isolated; direct mint promotion rejects; trigger-induced authority mutation rolls back |
| Holds have no implicit release | Hold state advances only to a later journal row and cannot be deleted | Future native-finality reconciliation | Restart or a newer depth-only observation could silently restore mint authority | Defer-to-quarantine history remains complete; hold deletion rejects |
| Runtime wiring is explicit, static, and deployment-bound | Exact enable token, reviewed manifest/digest, contract sources, four origins, complete sidechain profile, and active deployment equality are required before the pass exists | Joined-cache collector | A convenient RPC, late deployment block, or valid but wrong chain/profile could silently omit or misclassify history | Disabled and malformed switches reject; missing metadata and aliased origins reject; RPC, sidechain, chain-ID, bridge, deployment-block, confirmation, MCL, and vault mismatches are isolated |
| Work is bounded and drainable | SQLite returns one deterministic page plus a `remainingCandidates` flag for the current joined digest | Runtime pass | A hard global cap could permanently strand a backlog, while an unreported partial page could look complete | Three rows under a two-row page return IDs 1-2 with remaining work; terminal rows are excluded; later ticks select rows without a current-generation hold |
| Runtime input has live process provenance | The pass calls the joined-recovery provenance assertion before reading its digest | Lifecycle/cache CAS journal | Parsed or restarted cache JSON could masquerade as a fresh dual-source observation | The runtime test pins the provenance call; cloned/restarted reconstruction negatives remain in the joined-cache suite |
| Recollection precedes selection and CAS binds the selected snapshot | The daemon hook follows both deposit scans; the page is selected only after recollection and its row digest is retained without another await | Retained legacy and committed-vault transition code | A concurrent transition could be accepted under a newer digest after external work already began | Source-order test requires the hook before lifecycle selection; a real SQLite mutation after page selection causes stale-digest rejection and no journal entry |
| Success is still non-authorizing | Runtime report fixes lifecycle selection and native-finality acceptance to `false` | Daemon transition gate | Two-origin agreement or EVM depth could reactivate commit/mint authority | Empty and populated passes both deny selection; an unsafe recovery boundary rejects before journal mutation |

## Authority Boundary

The observer has no wallet, checker, signer, submitter, broadcaster, runtime
database, or deployment-state capability. Its POST requests are limited to
bounded address-index reads and deterministic P2S compilation.

Even a passing report does not prove:

- that clients are being routed to the declared address;
- that the two origins are independently operated;
- canonical consensus beyond the observed node agreement and anchor;
- EVM mint timing or absence of an out-of-band mint;
- manifest approval, route activation, deployment cutover, or funds authority;
- production readiness or complete Gate 5 trustlessness.

## Tracked Producer Closure

The tracked source now preserves the same boundary:

- the historical `trigger-peg-in.ts` deposit broadcaster is physically absent,
  so the relayer cannot originate a new user deposit through that helper;
- `e2e-aggregate-settlement.ts` no longer seeds sERG by minting directly from a
  refundable MCL box;
- `refund-lock.ts` is fail-closed and cannot create empty-register MCL boxes.

This removes a local deposit-construction capability. It does not retire an
already deployed `MainChainLock` route, make its commit/refund branches
disjoint, or establish mint authority. Any future reviewed source-lock profile
needs a separate wallet-facing unsigned-plan interface and exact on-chain
acceptance before activation.
