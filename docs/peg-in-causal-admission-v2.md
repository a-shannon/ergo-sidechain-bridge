# Peg-In Causal Admission V2

## Status And Security Purpose

Peg-In Causal Admission V2 defines the first canonical object that can make an
Ergo deposit-to-vault transition a prerequisite of a sidechain mint. The
TypeScript codecs, binding checks, pure parent-to-child transition relation,
deterministic vectors, distinct Ergo-side source-lock and committed-vault
ErgoTrees, pure transaction planners, and a synthetic Sigma VM matrix are
implemented. The V2 admission objects remain unchanged, while the runtime-
producible consumed record is versioned separately as V3 for the reason below.
The pinned Frontier patch now reproduces those formats and implements an exact
one-way root-activated causal profile, bounded pending-V2 and consumed-V3 state,
a pre-EVM direct-parent snapshot, and atomic post-EVM consumption with the exact
reviewed bridge/token mint transition. T20E-E adds the first runtime admission
producer: one source-owned static 2-of-3 Ed25519 compatibility profile validates
the unchanged V2 intent and statement plus a bounded proof envelope before one
atomic call writes the pending object, ordered sole-index entry and exact
source-proof receipt. Threshold invalidation removes all three together and
writes a permanent same-record tombstone, while objective expiry removes the
three live surfaces without a tombstone. The pre-EVM block-start hook performs
that expiry at the exact bound before the admission can enter the mint snapshot.
The mint callback requires the receipt in the direct parent and removes it
atomically with pending consumption and V1/V3 replay writes.

The checked-in runtime compiles execution of its deterministic fixture-key
profile as false. The same immutable gate is checked by the public activation
call and every profile-consumption path, so raw privileged storage injection
cannot turn the fixture profile into pending-admission, expiry, invalidation or
mint authority. Only the private `cfg(test)` harness can exercise that profile;
a downstream runtime must replace the keys and explicitly enable its reviewed
profile in the same build.

The T20E-D proof core authenticates the causal parent/child transition and
actual child-header identity relative to the supplied trust-root digest. The
T20E-E V3 proof additionally authenticates source-proof receipt membership in
the parent and absence in the child, proves the target invalidation tombstone
absent in both states, and preserves every non-target receipt named by the
authenticated index. The pure lifecycle projection accepts only a fresh
same-process reference derived from the static source-proof result and may clear
only its mandatory initial restart hold. It does not grant daemon or funds
authority.

This first profile is deliberately federated. The runtime verifies threshold
attestations over exact byte digests; it does not independently execute an Ergo
consensus proof or prove that supplied source objects are canonical. The
TypeScript result also retains source-proof executable authentication as false.
Contained execution, source canonicality beyond the federation, callback
benchmarks, runtime profile activation, daemon integration and funds authority
remain unimplemented.

The format closes one design ambiguity exposed by WP-06T20D. Matching a mint
to a vault observed later proves correlation, not causality. The pinned runtime
now enforces this local state relation:

```text
direct parent:
  pendingAdmission[V1 replay identity] = exact admitted V2 object
  ProcessedPegIns[V1 replay identity] = absent
  ConsumedAdmissionsV3[V1 replay identity] = absent

mint child:
  exact PegIn(sourceBoxId, recipient, amount)

post state, atomically with the mint:
  pendingAdmission[V1 replay identity] = absent
  ProcessedPegIns[V1 replay identity] = unchanged-format V1 record
  ConsumedAdmissionsV3[V1 replay identity] = exact V3 consumed record
```

A block that does not satisfy the complete relation must fail as a whole. A
daemon row, RPC response, journal status, or `verified=true` flag cannot create
or consume this admission.

The T20E-A/B/C/D/E result remains local conformance evidence. It now writes and
cryptographically authenticates one federated source-proof receipt in runtime
state, but it still does not make Ergo validate source inclusion or canonicality,
authenticate the claimed source-proof executable in TypeScript, activate the
runtime, close Gate 5, establish trustlessness, or support production readiness.

## Compatibility Boundary

The following V1 artifacts are unchanged:

- `PegIn(address,uint256,bytes32)`;
- `E2S_PEG_IN_RECORD_KEY_V1` and its replay identity;
- the 69-byte runtime profile and 205-byte processed record;
- `ProcessedPegIns` keys, values, and storage layout;
- all existing vectors, candidate identities, and deployed-code observations.

V2 references the existing V1 replay identity. It does not replace it with a
second replay domain. Profile rotation can change a V2 source-intent ID and
admission ID, but it must not make the same `(sidechainId, sourceBoxId)` mintable
again.

The 249-byte consumed-admission V2 remains frozen as compatibility material but
must never be activated. It attempted to place the mint child's final native
block hash inside state committed by that same block hash. Because the native
header hash commits to the post-state root, that creates a cryptographic fixed-
point requirement with no canonical FRAME construction. V3 changes only this
consumption record: it stores the direct-parent native hash and leaves the
child hash to the authenticated child header whose state root contains V3.

The current `MainChainLock` V3 and current aggregate settlement vault are not a
V2 source profile. They do not preserve the 229-byte source intent, and the
current aggregate unlock authenticates only its existing R4-R7 layout. T20E-B
therefore introduces `MainChainLockCausalV2` and
`MainChainCausalVaultV2` as distinct, non-deployed ErgoTrees. It does not
reinterpret, migrate, or activate the V1 route. Adding an unchecked R8/R9 value
to an existing box remains insufficient.

## Ergo Source Contracts (T20E-B)

`MainChainLockCausalV2` is the refundable staging state. Its registers are:

| Register | Exact value |
|---|---|
| R4 | canonical 229-byte Peg-In Source Intent V2 |
| R5 | depositor ErgoTree bytes |

The source lock accepts only the compiled source-network identity, the native
ERG lane, a positive amount equal to the complete box value, nonzero
destination/profile fields, and a token-free box. Before the refund timeout,
its normal branch requires a 2-of-N transitional committee authorization and
consumes the complete value into output zero under the exact compiled
causal-vault ErgoTree. The successor copies R4 byte-for-byte and sets R5 to the
consumed source box ID. A separate input must fund the miner fee.

The wire amount remains an unsigned 64-bit field, but these ErgoTrees decode it
as an Ergo `Long`; this concrete contract profile therefore accepts only the
positive signed-`Long` range. Transaction planners retain monetary values as
exact `bigint` values and emit decimal strings, including above JavaScript's
safe-integer range. They reject a numeric input that cannot represent the exact
integer and reject any amount outside the active Ergo profile before assembly.
Both commit and refund planning additionally require the observed source box to
use the exact active source-lock ErgoTree.

The timeout branch is permissionless only while the source lock remains
unspent. At or after 10,000 blocks it returns the complete source value to the
exact R5 depositor ErgoTree, with no token output, and requires refund-output
R4 to equal the consumed source box ID. That identity prevents two equal-value
source locks from satisfying their predicates with one shared refund output; a
separate input again funds the fee. Commitment is rejected once this refund
window opens. Once the normal branch confirms, the refundable UTXO no longer
exists.
Mint eligibility must be derived only from that confirmed consumption and the
resulting non-refundable vault, never from observing the original deposit.

The committee signature is a transitional source-profile activation guard. It
is not mint authority and cannot replace the causal admission proof. The
ErgoTree cannot self-embed the final admission-profile ID because that profile
already commits to the exact source-lock and vault hashes. Static runtime
registration and T20E-C proof admission must decide which derived profile ID is
active.

`MainChainCausalVaultV2` is the committed state. Its registers are:

| Register | Exact value |
|---|---|
| R4 | the same canonical 229-byte source intent |
| R5 | the nonzero 32-byte consumed source-lock box ID |

It has no depositor or timeout refund branch. The current bounded settlement
path retains the authenticated V1 tracker, burn-leaf, payout, and DUP semantics
while requiring the burn leaf, authenticated tracker R6, and source intent to
name the same sidechain. A partial payout must recreate the exact causal-vault
ErgoTree and preserve R4 and R5 byte-for-byte. The source intent and burn leaf
both remain restricted to the zero asset ID for the ERG lane.

Replay protection uses a distinct `DoubleUnlockPreventionCausalV2` singleton.
Its ErgoTree is bound to the Blake2b-256 hash of the exact causal-vault
ErgoTree. The existing authenticated DUP profile is bound to a different unlock
hash and cannot be relabelled or reused for this path.

This settlement path retains the current V1 trust boundary: tracker admission
still depends on the disclosed R9 finality authority, and Ergo anchor age does
not prove sidechain finality. T20E-B therefore establishes source-state
exclusivity and local contract acceptance only. It does not make the bridge
trustless or authorize Gate 5 closure.

Admission-profile ErgoTree hashes are defined as Blake2b-256 of the exact
compiled ErgoTree bytes used as `propositionBytes`. Source text, addresses, and
unlinked placeholder compilations are not profile identities. Compiling with a
different committee, network identity, tracker/DUP singleton, linked vault, or
contract body creates different bytes and requires a newly derived profile.

The checked-in compiler treats all three causal contracts as check-only,
non-deployed candidates. It compiles the vault first, derives the DUP vault
hash and source-lock vault bytes from that same in-memory result, and then
compiles the dependent trees without writing files. Non-check compilation
refuses these candidates, so no external override can emit an incoherent trio.

## Canonical Encoding Rules

All V2 wire objects below use fixed-width, lowercase `0x`-prefixed bytes.
Integers are unsigned big-endian. This proof-neutral wire encoding is intended
for ErgoScript and future validity-proof consumers and is deliberately
different from the little-endian SCALE fields in Peg-In Runtime State V1.

Identifiers are Blake2b-256 with exact ASCII domains. No length prefix or
terminator is inserted because every following object has one fixed length.

## Admission Profile

The 313-byte profile selects one exact source, destination, settlement,
finality, and proof-verifier configuration:

| Offset | Size | Field |
|---:|---:|---|
| 0 | 1 | `formatVersion = 2` |
| 1 | 32 | source Ergo network/genesis identity |
| 33 | 32 | destination sidechain identity |
| 65 | 20 | destination bridge H160 |
| 85 | 20 | destination token H160 |
| 105 | 32 | settlement profile ID |
| 137 | 32 | exact source-lock ErgoTree hash |
| 169 | 32 | exact vault ErgoTree hash |
| 201 | 32 | source-finality policy ID |
| 233 | 32 | proof-system ID |
| 265 | 32 | exact proof/verifier profile ID |
| 297 | 8 | positive profile revision |
| 305 | 8 | sidechain activation height |

Its ID is:

```text
Blake2b-256(
  ASCII("E2S_PEG_IN_CAUSAL_PROFILE_V2") ||
  encodedProfile
)
```

Security-sensitive proof adapters must be statically registered by both
`proofSystemId` and `proofProfileId`. A proof-system ID selects a proof format;
it never changes the meaning of the admission statement. A future proof whose
public statement differs requires a new statement version and domain.

The two ErgoTree hashes are part of the profile identity. A coordinated source
lock or vault script rotation therefore requires a new active profile ID and a
new source-intent ID; retaining only the opaque settlement-profile label is not
enough. Static runtime registration must decide which profile IDs are active.

## Ergo Source Intent

The 229-byte source intent is the exact payload that a future V2 source lock
must authenticate and an exact V2 vault successor must preserve:

| Offset | Size | Field |
|---:|---:|---|
| 0 | 1 | `formatVersion = 2` |
| 1 | 32 | source Ergo network identity |
| 33 | 32 | destination sidechain identity |
| 65 | 20 | destination bridge H160 |
| 85 | 20 | destination token H160 |
| 105 | 32 | settlement profile ID |
| 137 | 32 | admission profile ID |
| 169 | 32 | source asset ID |
| 201 | 8 | positive raw amount (`u64` wire; positive signed `Long` in the current Ergo contract profile) |
| 209 | 20 | destination recipient H160 |

Its ID is:

```text
Blake2b-256(
  ASCII("E2S_PEG_IN_SOURCE_INTENT_V2") ||
  encodedSourceIntent
)
```

This profile supports only the native ERG lane: `sourceAssetId` is exactly 32
zero bytes and `amount` is raw nanoERG. A token lane needs a distinct audited
settlement profile and cannot acquire support merely by putting a token ID into
this V2 object.

The source box ID is intentionally absent because it is not known until the
Ergo transaction creates the box. The causal statement binds the resulting box
ID to the intent ID.

## Causal Admission Statement

The 381-byte statement binds the source intent and unchanged V1 replay identity
to one exact confirmed source-box consumption and vault successor:

| Offset | Size | Field |
|---:|---:|---|
| 0 | 1 | `formatVersion = 2` |
| 1 | 32 | source-intent ID |
| 33 | 32 | V1 mint/replay identity |
| 65 | 32 | source deposit box ID |
| 97 | 32 | source creation transaction ID |
| 129 | 4 | source output index |
| 133 | 32 | source-lock ErgoTree hash |
| 165 | 32 | commitment transaction ID |
| 197 | 4 | vault output index |
| 201 | 32 | vault box ID |
| 233 | 32 | vault ErgoTree hash |
| 265 | 32 | commitment inclusion block ID |
| 297 | 8 | commitment inclusion height |
| 305 | 32 | acceptance checkpoint block ID |
| 337 | 8 | acceptance checkpoint height |
| 345 | 32 | finality policy ID |
| 377 | 4 | required confirmations |

Its ID is:

```text
Blake2b-256(
  ASCII("E2S_PEG_IN_CAUSAL_ADMISSION_V2") ||
  encodedStatement
)
```

The statement requires distinct source-creation and commitment transactions,
distinct source and vault boxes, nonzero identities, a checkpoint not below the
inclusion height, and an inclusive observed depth satisfying the bound policy.
These structural checks do not prove ancestry or canonicality. The selected
proof adapter must establish the exact source box bytes, source-intent payload,
spend transaction, vault output bytes, inclusion block, checkpoint ancestry,
and policy result.

## Proof Envelope And Admission Authority

Proof bytes and provenance are not part of the statement. The T20E-E
compatibility admission call carries an envelope bound to:

- the exact statement bytes and admission ID;
- the active profile ID, proof-system ID, and proof-profile ID;
- the exact proof bytes and their digest;
- the verifier implementation and runtime profile;
- the source checkpoint and its policy decision.

The only registered profile is a fixed 2-of-3 Ed25519 federation with ten source
confirmations and a maximum validity window of 64 native blocks. It binds exact
proof-system, proof-profile, finality-policy and verifier-profile identities.
The TypeScript producer hashes the supplied canonical source box, commitment
transaction, vault successor, inclusion proof, checkpoint ancestry and finality
proof; verifies the ordered threshold signature set; and reproduces the exact
498-byte SCALE envelope consumed by Rust. It validates their bindings to the V2
statement but does not independently parse those source objects or authenticate
execution of the claimed verifier binary.

The runtime persists a pending admission only after this static profile accepts
the exact envelope at a fresh native height. It simultaneously stores a
241-byte receipt containing the request, result, proof, executable and verifier
identities plus admission and expiry heights. The profile remains federated:
its signers decide the truth of the source evidence. A validity/STARK adapter
could reduce that trust only after its exact verifier, public inputs,
canonical-history assumptions, and data-availability model are activated and
reviewed under a new proof family or version. It may not reinterpret V1 or V2
statement bytes.

## Mint Transition

The implemented pure transition checker requires:

1. the exact pending admission exists in the direct native parent state;
2. its admission height is at or after profile activation and no later than the
   parent;
3. neither the V1 processed record nor V3 consumed record exists in the parent;
4. an exact source-proof receipt exists in the direct parent, has not expired,
   binds the active proof profile and pending admission, and remains unchanged
   through the mint callback;
5. the pending key, receipt key, V1 processed key, and V3 consumed key all equal the
   unchanged V1 replay identity;
6. source intent, statement, active admission profile, proof identities, V1
   runtime profile, and mint event agree exactly, including the token address;
7. the event block is the consecutive native child of the supplied parent;
8. the post state deletes the pending admission and its receipt;
9. the post V1 record is byte-for-byte the existing 205-byte format;
10. the post V3 consumed record binds the admission, source intent, V1 identity,
   native parent, mint height, execution block, transaction, indexes, and V1
   record digest.

The pinned Frontier runtime implements this relation around EVM execution. An
immutable execution gate is checked before admission, invalidation, activation,
block-start profile validation and post-EVM consumption. In the checked-in
reference runtime it is false, so even a pre-cutover
`Sudo(System::set_storage)` injection of the exact fixture profile and
enforcement marker cannot make that profile executable. The one-way activation
additionally validates every keyed pending object against the exact V2 profile
and live bridge/token state before storing the profile, then removes the
runtime's `sudo` key in the same dispatch. A downstream activation build must
replace the fixture authority, enable the reviewed profile, and retain this
cutover discipline. A future migration requires a new reviewed runtime and
transition before the cutover is used. This is a conformance cutover, not a
proof-admission mechanism.

A fallible start hook runs before Frontier changes EVM state and snapshots the
bounded direct-parent pending set, V1/V3 replay absence, exact runtime profiles,
reviewed bridge/token code, bridge configuration and owner, token owner,
Solidity replay word, supply, and recipient balance. The post hook accepts
exactly one causal mint only when the successful `PegIn` is preceded by one
exact `Transfer(0, recipient, amount)`, no other nonzero token effect changes
supply or that recipient, the replay word becomes canonical true, code and
configuration remain exact, and supply plus recipient balance each increase by
the admitted amount.

Every fallible check completes before native state changes. Acceptance removes
the pending value and receipt, writes the unchanged V1 record and exact V3
record under the same key, updates the bounded key list, and emits the events
atomically with the block. Same-block admission plus mint therefore rejects: the pre-EVM
snapshot cannot observe storage inserted by an extrinsic in that mint block.
Once a causal profile has been activated, it cannot be disabled or replaced.
The V1 bridge profile can no longer be changed or removed, and runtime upgrades
remain forbidden. Node-level Wasm evidence verifies both boundaries: attempted
raw `set_storage` replacement of the V1 profile and `:code` after cutover leaves
both values unchanged, while pre-cutover injection of the exact fixture causal
profile and enforcement marker is rejected during block execution and leaves
the accepted head and causal storage unchanged. Runtime/profile/code/owner
drift, replay appearance, duplicate or malformed pending state, wrong mint
ordering, and wrong supply/balance deltas reject the whole block. Duplicate
detection uses bounded ordered sets rather than quadratic scans.

The current callback reservation is a conservative prototype value, not a
target-hardware benchmark. Runtime activation remains blocked until the maximum
path is benchmarked and assigned an approved block-capacity budget.

The unactivated 249-byte V2 consumed record remains reproducible so historical
or incompatible bytes can be identified, but it is not a runtime profile:

| Offset | Size | Field |
|---:|---:|---|
| 0 | 1 | `formatVersion = 2` |
| 1 | 32 | admission ID |
| 33 | 32 | source-intent ID |
| 65 | 32 | V1 replay identity |
| 97 | 32 | native mint block hash |
| 129 | 8 | native mint height |
| 137 | 32 | Frontier execution block hash |
| 169 | 8 | Frontier execution height |
| 177 | 32 | mint transaction hash |
| 209 | 4 | transaction index |
| 213 | 4 | event index |
| 217 | 32 | Blake2b-256 of the exact V1 processed record |

The runtime-producible 249-byte V3 consumed record is:

| Offset | Size | Field |
|---:|---:|---|
| 0 | 1 | `formatVersion = 3` |
| 1 | 32 | admission ID |
| 33 | 32 | source-intent ID |
| 65 | 32 | V1 replay identity |
| 97 | 32 | direct-parent native block hash |
| 129 | 8 | native mint height |
| 137 | 32 | Frontier execution block hash |
| 169 | 8 | Frontier execution height |
| 177 | 32 | mint transaction hash |
| 209 | 4 | transaction index |
| 213 | 4 | event index |
| 217 | 32 | Blake2b-256 of the exact V1 processed record |

The V3 record does not claim to know the native mint-child hash during runtime
execution. T20E-D proves V3 membership under the child state root, binds that
root to the actual child header, and verifies the header's parent hash and
height.

The pure checker accepts supplied bytes only. The pinned runtime additionally
composes those bytes with the live T20C bridge/token/mint predicates described
above. T20E-D authenticates the exact direct-parent and child states and the
actual child header in a separate bounded proof core. Its TypeScript candidate
remains execution-unauthenticated until a contained registered verifier route
is composed.

## Reorg And Stale-Anchor Requirements

An accepted policy depth is not deterministic Ergo finality. Before mint, a
source reorg or checkpoint disagreement must invalidate the pending admission
or hold minting fail-closed. The runtime lifecycle must define a versioned
invalidation transition and reject:

- a commitment block no longer ancestral to the selected checkpoint;
- a replaced commitment transaction or vault output;
- a checkpoint below the policy depth;
- conflicting source views without convergence;
- an invalidation arriving out of order after admission but before mint;
- restart or database loss that attempts to reconstruct authority from local
  state alone.

The policy for a source reorg discovered after an already accepted mint remains
an explicit economic and governance decision. This format does not make a
probabilistic source chain irreversible.

## Deterministic Vector And Negative Surface

`relayer/test-vectors/peg-in-causal-admission-v2.json` preserves the original V2
admission objects and unactivated V2 consumed bytes unchanged.
`relayer/test-vectors/peg-in-consumed-admission-v3.json` freezes the corrected
parent-bound consumption record. The tests show that every profile,
source-intent, statement, parent, mint, and transaction field changes the
relevant bytes or identity. They separately reject structurally invalid or
inconsistently bound objects and cover:

- unsupported versions, malformed hex, zero identities, and integer overflow;
- wrong source/destination/profile/asset/amount/recipient bindings;
- exact `N` versus insufficient `N-1` checkpoint depth and wrong finality policy;
- source/vault or creation/commit identity aliasing;
- tree rotation without a new active profile identity;
- absent, already processed, already consumed, same-block, or retained
  admissions;
- wrong parent linkage, token/event, runtime profile, proof profile, storage key,
  V1 record, or V3 consumed record.

Both vectors are reproduced by the TypeScript implementation and the pinned
Rust runtime module. The Rust path also rejects source amounts above Ergo's
positive signed-`Long` range and treats consumed-admission V2 as incompatible.
The active Frontier event verifier, runtime peg-out producer, authenticated
peg-in state proof, TypeScript bridge-event-root extractor, V1 burn-leaf
encoder, native checkpoint admission and both aggregate payout builders enforce
the same positive signed-`Long` domain while preserving their existing unsigned
wire fields. This cross-language parity does
not authorize creation of a pending admission.

## T20E-B Verification Boundary

The checked-in `peg-in:causal-contract-vm` runner uses a loopback node only for
ErgoScript compilation, then uses `ergo-lib-wasm-nodejs` with synthetic boxes,
headers, keys, and transactions. It covers successful source commitment,
exact-boundary refund, and authenticated committed-vault payout. Isolated
rejection cases cover insufficient commitment quorum, exact-boundary late
commitment, shared commitment output, wrong vault tree/value/source ID, wrong,
shared, or premature refund, a DUP compiled for another vault hash,
source-intent and tracker sidechain drift,
successor R4/R5 drift, non-ERG intent, zero source identity, and input-order
drift. Every run also requires the serialized source and vault boxes to remain
below the 4,096-byte box limit.

Focused planner coverage additionally proves exact decimal output above
`Number.MAX_SAFE_INTEGER` and rejection above the positive Ergo `Long` range.

The runner neither calls node transaction check nor signs with an operator or
node wallet. It does not submit or broadcast. Compilation and synthetic Sigma
reduction do not establish canonical source inclusion, active-profile
registration, finality-proof execution, live node acceptance, mint authority,
Gate 5 closure, deployment readiness, or production readiness.

## Authenticated Parent/Child Proof Core (T20E-D)

The T20E-D native verifier composes the unchanged T20C mint-transition proof
with the causal state in the same exact parent and child tries. It verifies:

1. the actual finalized child header and its direct-parent hash and consecutive
   height;
2. identical active V1 and causal profiles plus the active enforcement marker
   in both states;
3. one canonical bounded pending-key list in each state and authenticated map
   membership for every listed pending entry;
4. the target pending admission in the parent and its absence in the child;
5. parent non-membership and child exact membership for the unchanged V1 record
   and parent-bound V3 consumed record;
6. exact ordered deletion of only the target key, with every non-target pending
   entry preserved byte-for-byte;
7. exact composition with the T20C event, replay, token, supply, recipient and
   execution identities.

The provider must discover the bounded pending-key surface before requesting a
proof. It reads the SCALE key list with `state_getStorage` at each exact block,
rejects malformed, noncanonical, zero, duplicate or more than 256 keys, derives
every pending map key named by that list and includes the indexed surface in one bounded
`state_getReadProof`. The Rust verifier independently decodes the key list from
the authenticated trie and requests every derived value. Discovery therefore
selects bytes to acquire but cannot decide their authenticity or semantics.
Parent and child canonical hashes are rechecked after proof acquisition.

This proves preservation of the authenticated indexed entries. It does not
prove that an unindexed raw map entry is absent. The T20E-E runtime writer and
migration rules must preserve the pending-key list as the sole admission index.

The strict TypeScript projector binds the exact request bytes, request digest,
independently supplied trust-anchor digest, nested T20C result, parent/child
headers, V1 record, V3 record and proof accounting. It strips caller claim
booleans and returns a process-branded candidate whose verifier-execution,
finality, state-transition, vault, mint, daemon, hold-release, signer,
submitter, broadcast, Gate 5 and readiness fields remain false.

The deterministic causal vector is tracked at
`relayer/test-vectors/native-finalized-peg-in-causal-mint-transition-v2.json`.
Its canonical SHA-256 is
`0482cb066869afc0d21ac2cc171d42eb21e52e7e6e0dc4caddd779d9de3c64ca`.
The pinned V4 isolated build compiles six runtime binaries and four fixture
generators, regenerates all four native vectors and requires byte identity.

## Lifecycle Projection (T20E-D)

The separate lifecycle V1 module is a pure bounded append-only projection with
`pending`, `admitted`, `invalidated` and `consumed` state definitions. T20E-E
activates exactly one admission profile in its immutable source-owned registry:
the static federated compatibility profile. Caller-constructed registries and
proof references still reject. The only accepted reference is derived from a
genuine same-process source-proof result and carries the exact request, result,
proof, executable, validation-height and expiry identities.

RPC, SQLite and reconstruction events are observation-only. `stale_anchor`,
`source_reorg`, `checkpoint_conflict` and `rpc_disagreement` impose a deny-only
hold. Duplicate event IDs are idempotent only when their full contents match.
The same-process journal binds the candidate, contiguous sequence and current
event chain. Initial creation is unique per candidate and includes an
authenticated `restart_reproof_required` observation, so neither repeated
initialization nor a new process can create a hold-free empty journal.
Appending atomically supersedes the prior branded head, so a retained ancestor
or competing successor rejects. A cloned, serialized,
truncated, reordered or caller-mutated journal also rejects; restart or complete
database loss returns only `pending` with reproof required, never authority.

Projection of any proof event requires an explicit current native height at or
after validation and strictly before expiry. A fresh admission reference may
clear only the initial `restart_reproof_required` hold. It cannot clear any
stale, reorg, checkpoint-conflict or RPC-disagreement hold. No TypeScript
invalidation or consumption profile is active yet.

This module has no network, persistence, daemon, mint, reconciliation, signing,
submission or broadcast capability. It does not persist a runtime pending
admission or prove the source transition.

## T20E-D Invariant Matrix

| Producer | Exact bytes or fields | Consumer | Deciding authority | Failure if relaxed | Negative coverage |
|---|---|---|---|---|---|
| Finalized T20C header composition | Parent/child hashes, heights and state roots | Causal state verifier and V3 binding | Native proof core relative to supplied trust-root digest | A valid transition could be replayed under another child or fork | Header hash/root/height/parent mutations |
| Parent and child trie proofs | Profiles, enforcement, authenticated pending list and every indexed value, target pending/V1/V3 keys and values | Causal transition report | Authenticated state roots after native verifier execution | Indexed pending state, pre-existing replay or a successor could be omitted or substituted | Missing/retained target, wrong replay membership, malformed list/value, changed indexed non-target, wrong V1/V3 successor; unindexed raw-entry absence remains a writer invariant |
| Read-only proof collector | Exact blocks, raw bounded list, all list-derived keys, bounded proof nodes/bytes | Native request | No authority; raw RPC discovery is reverified inside the trie proof | A provider could truncate indexed key coverage or mix parent/child state | Null/truncated/noncanonical/zero/duplicate/oversized list, wrong target, drift and proof overflow |
| TypeScript projector | Exact request/trust digests, nested result and child successor | Future contained execution join | Structural candidate only | Caller JSON could be laundered into a verified result | Unknown fields, digest/root/header/record/count drift, boundary promotion and cloned candidate |
| Lifecycle journal | Candidate/event IDs, authenticated initial reproof hold, observation hold/reason, contiguous sequence, digest chain and latest-head capability | Future T20E-E source-proof admission and reconciliation composition | Deny-only lifecycle; zero active proof profiles | Reinitialization, a retained pre-hold ancestor, competing successor, SQLite/RPC status, partial persistence or DB recovery could recreate mint eligibility | Duplicate initialization, caller proof/registry, superseded ancestor, second fork, conflicting duplicate, wrong candidate, clone, truncation, reorder, mutation and restart reproof |

## Federated Admission And Receipt Proof (T20E-E)

The first concrete source-proof profile is compatibility machinery, not the
long-term trust layer. It fixes:

- proof system `0x36c06f93b9cf9a7f80c59f5bfb8b7790c7f355933cd001fffccc9110f9f95069`;
- proof profile `0x65ca4632abc4db51255e42e83a9aee8a72b19d41921d45824ce847cd696e9537`;
- verifier profile `0xe1c2db0d496efae61a16d7791456ae44c3927b3b8d0d9f029d8a9fe100e215ea`;
- finality policy `0x25b6e4d9beac8863882fc8f8c43ced66f2d087b3fba128112014b3fb8fd22ff6`;
- an ordered 2-of-3 Ed25519 signer set, ten source confirmations, and a
  64-native-block maximum validity window.

The runtime admission call accepts any signed origin because the static proof
profile, rather than the caller account, decides admission. It rejects before
mutation unless the active causal profile selects the exact proof and finality
identities, the complete V2 object validates, the proof window is fresh, the
ordered threshold signatures verify, the replay and invalidation-tombstone
surfaces are empty, and the ordered key index is consistent. Success writes one
pending object, one receipt and one ordered index entry in the same dispatch.
Threshold invalidation removes all three live surfaces and writes a permanent
V1 tombstone binding the profile, admission, source-proof result, reason,
invalidation/proof digests and native invalidation height. The original proof
cannot recreate the same record in the invalidation block or a later block;
recovery requires a new canonical source deposit and candidate identity. At the
exact expiry height, the block-start hook validates the complete indexed object
before atomically removing its pending value, receipt and index entry; the
expired object never enters the parent mint snapshot, and the next block
initializes normally. Objective expiry writes no tombstone, so the same still-
valid source deposit may be reconsidered only through a newly issued proof with
a fresh validity window.

The checked-in reference runtime statically contains public deterministic
fixture keys, so its immutable fixture-profile execution gate is compiled as
false. The gate is enforced at activation and again at every admission,
invalidation, public or hook-driven expiry/snapshot and post-EVM consumption
boundary. Public expiry additionally revalidates the active runtime profile,
pending object and receipt before deleting anything. Tests can activate the
same profile only through a private `cfg(test)` marker while still running
complete internal profile validation. A downstream runtime must replace the
keys and deliberately enable its reviewed profile in the same build; neither a
public runtime call nor privileged raw-storage mutation can activate or clean
up the checked-in fixture as if it were authoritative.

The receipt is a 241-byte SCALE object bound to the admission profile and ID,
source-proof request/result/proof digests, claimed verifier executable,
verifier profile, admission height and expiry. It is not proof that the claimed
executable ran. Its role is to make the federation's exact admission provenance
part of authenticated runtime state and therefore part of the mint transition.

The V3 native verifier authenticates the receipt alongside the T20E-D pending
surface. The parent contains the exact target receipt; the child does not. The
exact `InvalidatedCausalPegInsV1` map key for that replay identity must be absent
from both states. Every non-target pending object and receipt named by the
authenticated ordered index must remain byte-identical. The provider and
collector derive both target keys, include them in both bounded read proofs, and
recheck canonical block hashes after collection. The TypeScript projector
strictly revalidates the Rust report but keeps verifier execution, finality and
funds claims false.

The T20E-E invariant matrix is:

| Producer | Exact bytes or fields | Consumer | Deciding authority | Failure if relaxed | Negative coverage |
|---|---|---|---|---|---|
| Static source-proof registry | Profile/system/verifier/finality IDs, ordered keys, threshold, confirmations and window | TypeScript producer, runtime call and lifecycle | Fixed federated compatibility profile; fixture execution is compile-time blocked at activation and every consumer | Runtime input, raw storage, public fixture keys or a future proof family could silently select weaker semantics | Unknown profile, reordered/duplicate signer, weak policy, invalid window, public activation attempt, raw profile/enforcement injection and validity/STARK reinterpretation |
| Source-proof result and envelope | V2 request, six canonical-object digests, executable identity, issue/expiry heights, result/attestation/signature-set/proof identities and 498-byte SCALE | Runtime admission | Threshold signers; source canonicality is attested, not proved on Ergo | Arbitrary source bytes or caller claims could become admission | Every request/result/signature/window field, extra nested fields and cross-language byte drift |
| Runtime admission writer | Pending object, ordered sole index, 241-byte receipt and absence of a same-record invalidation tombstone | Parent snapshot and V3 proof | Runtime transition after complete envelope validation | Observation, SQLite status, an invalidated proof or an unindexed map write could authorize mint | Duplicate/replay, permanent tombstone, stale, weak-policy, bad-signature, malformed-object and index inconsistency with no partial mutation |
| Threshold invalidation | Pending, receipt and index removal plus terminal V1 tombstone containing exact admission/result/reason/invalidation identities | Admission replay and parent snapshot | Static threshold authority after complete invalidation verification | The still-fresh original envelope could recreate mint eligibility after a source reorg or conflict | Exact tombstone fields, repeated invalidation and original-proof replay in the same and later native heights |
| Objective expiry | Immutable execution gate, active runtime profile, exact pending/receipt/index and native expiry height; no tombstone | Mint exclusion and possible fresh re-admission | Runtime profile and deterministic native height, without source authority | Raw fixture state could be deleted as if accepted, malformed state could emit an accepted cleanup event, or expiry could halt block initialization | Guard-disabled and malformed-profile/receipt calls preserve state; valid public expiry and real hook ordering at expiry minus one, expiry and expiry plus one remove only live surfaces |
| Receipt-bound mint callback | Exact direct-parent pending and receipt, absent invalidation tombstone and T20C EVM transition | V1/V3 successor | Whole-block runtime callback | Proof provenance could be replaced, invalidated or removed before mint | Missing/changed receipt, tombstone after snapshot, same-block admission, expired admission, replay and successor drift |
| V3 parent/child proof | Receipt membership/absence, target tombstone non-membership in both states, complete indexed pending/receipt surface, consecutive headers and trust digest | Future contained execution join | Rust trie/finality verifier relative to supplied trust root | RPC could hide invalidation, receipt or index changes or bind them to another child | Parent tombstone, child tombstone, key/list/value/header/root/count/profile/result and report-boundary mutations |
| Lifecycle admission reference | Same-process result provenance, all proof identities and fresh native height | Deny-only lifecycle projection | Static admission profile only | Restart, clone, expired result or SQLite/RPC agreement could clear a hold | Missing/current-height drift, pre-validation, expiry, clone, profile/result substitution and every non-restart hold |

The source-proof vector is
`relayer/test-vectors/peg-in-causal-source-proof-admission-v1.json` with
canonical SHA-256
`19a01558fd8483c2b77cf8c789aa09dcc6a4c5ac4d0badcfe27951071c830efb`.
The receipt-authenticated transition vector is
`relayer/test-vectors/native-finalized-peg-in-causal-mint-transition-v3.json`
with canonical SHA-256
`7f4c429573ea3530f744869cdfbaf829dd970a566d09d6e14e7d179927b1a3be`.
The pinned V5 build reconstructs seven verifier/runtime binaries and five
fixture generators, regenerates all five native vectors and requires byte
identity.

WP-06T20E-F2b adds the separately versioned contained result producer without
changing the V2 admission, proof or receipt bytes. Its generated vector is
`relayer/test-vectors/peg-in-causal-source-proof-result-producer-v1.json` with
canonical SHA-256
`bb4cfd5c5f896532818cb78d81dd55938cea952b2b8562d8cf4e219a63c293b1`.
The pinned V6 build reconstructs eight runtime binaries and six fixture
generators and requires byte identity for all six native vectors. The producer
only derives and validates deterministic result fields; it does not establish
source canonicality, authenticate proof execution, produce signatures or admit
runtime state. Its TypeScript evaluator discards those fields and exposes only
a quarantined stdout digest and size with every lifecycle and funds authority
false.

## F2c Exact Identity Composition

T20E-F2c now joins only genuine F1 and F2b evaluator candidates to one exact
process-provenant signed federated result, the normalized V3 runtime record, the
reported runtime receipt identity and the current admission-only lifecycle
head. F1 keeps receipt bytes and child stdout private; its projection exposes
only a digest and bounded identity metadata after the expected admission,
profile, proof, verifier, expiry and V3 transition identities match. F2b keeps
the deterministic result fields private and exposes only a same-process
assertion over their exact result ID.

The composer binds:

1. sidechain, bridge, token, source box, recipient and raw ERG amount;
2. profile revision/activation and the preserved V1 runtime-record identity;
3. admission profile, source intent and admission identities;
4. source-proof request, result, proof and verifier identities;
5. the reported receipt digest, admitted/expiry heights and V3 parent/child
   identities;
6. the current lifecycle head and its exact non-authorizing proof reference.

The output contains only those identities, execution-policy digests and the two
quarantined child-output digests. It exposes no stdout, receipt bytes, proof
nodes or signatures. Native verifier execution, reported receipt
authentication, source canonicality/finality, runtime admission, lifecycle
funds authority, committed-vault authority, mint, daemon admission, hold
release, signing, submission, broadcast, Gate 5 and readiness all remain false.

The focused matrix covers 28 cases: each runtime binding, admission/profile/
intent drift, proof request/result/digest/executable/expiry drift, F2b result
window drift, four lifecycle security holds, cloned candidates/results,
foreign/serialized journals, the explicit no-journal restart projection,
receipt admission before the signed proof issuance, fresh envelope revalidation
after historical receipt admission, expiry and a current height before the
reported transition. SQLite, RPC agreement and old serialized objects cannot
reconstruct process provenance. An accepted reconstruction in a second fresh
process is not part of this local matrix.

## F2d Dual-Origin Protected-Host Campaign

The repository now exposes one bridge-config-free campaign command:

```text
npm run peg-in:causal-f2d:campaign -- --help
```

Its two modes are intentionally separate:

1. `--mode describe` performs the pinned source build and derives the exact
   role-distinct V2 installer declarations used by the F1 verifier and F2b
   source-result producer. Each declaration binds the immutable installed
   launcher path, `BrokerSha256`, `ProfileDigest`, `PolicyDigestSha256` and
   `MinimumPolicyEpoch`. Its legacy `BrokerPath` projection names that installed
   path and is not, by itself, an installation command: installation needs the
   separately reviewed source executable, while inspection needs the managed
   installed path. The F2e handoff below makes that distinction explicit. The
   mode writes a new digest-bound JSON artifact and does not invoke the
   installer, inspect, activate or execute either profile.
2. `--mode execute` accepts one strict
   `e2s.native-peg-in-causal-f2d-campaign-input.v1` proof manifest and two
   distinct credential-free HTTP(S) RPC origins with no path, query or
   fragment. The default runner snapshots both complete requests before its
   first asynchronous boundary, then starts one fresh worker process per
   origin. Each worker privately copies the regular-file Cargo cache, builds
   the pinned native tools with Cargo offline, reruns F1 and F2b, and performs
   exactly one F2d recollection before returning a bounded
   `e2s.native-peg-in-causal-f2d-single-run.v1` report. Missing cached
   dependencies or link-like cache entries fail closed. Cargo offline mode
   prevents Cargo dependency resolution and fetching at that boundary; it is
   not an OS network sandbox for dependency build scripts, so the approved
   protected host remains part of the campaign boundary.

The input manifest contains only the reviewed public proof objects and bounded
execution parameters: target native block, trust anchor, execution/event/state
statements, trusted-anchor digest, signed source-proof request/envelope, RPC and
native timeouts, collection deadline, concurrency and retry count. It must not
contain private keys, wallet material, environment configuration, a database,
deployment state or a previously serialized candidate/journal.

The parent validates both reports, binds each report to the SHA-256 digest of
its complete canonical request as well as the exact requested RPC origin and
launcher digest, then compares the complete serialized F2c candidate payloads.
It writes the dual-origin artifact only when they match exactly. Each default
worker receives one create-only bounded request file plus an allowlisted tool
environment; stdout, stderr and the execution timeout are bounded. On Windows
the shared runner uses a kill-on-close Job Object and does not return cleanup
authority after timeout or overflow unless process-tree termination is
verified. Expiry of the termination grace enters a fail-stop host quarantine:
the campaign remains pending, returns no cleanup authority over its request or
build directories, emits no artifact and keeps retrying while the parent is
live. If closure is later verified, the original timeout or overflow failure is
returned and cleanup may continue; if verification remains impossible,
operator quarantine is deliberately unbounded. Direct codec execution remains
acquisition-only.

The serialized reports deliberately say only that separate worker requests are
required. Constructors and stored JSON cannot attest that a fresh process ran;
that fact belongs to the live parent/worker execution and host evidence. A
request digest proves report-to-request binding, not execution provenance.

Two-origin agreement is corroboration, not source independence, consensus or
sidechain finality. The command has not been run on the approved protected host.
The reports keep protected-launcher activation, native
proof authentication, source canonicality, runtime admission, committed-vault
authority, mint, daemon admission, signing, submission, broadcast, Gate 5 and
readiness false. The existing V2 installer/inspector and the elevated
disposable-host ACL/crash/race campaign remain separate steps.

## F2e Operator Handoff

The protected-host campaign has a separate non-authorizing handoff command:

```text
npm run peg-in:causal-f2e:handoff -- --help
```

`--mode validate-input` parses the strict public proof manifest and writes only
its canonical digest, target native block and reviewed trust-anchor digest. It
does not build or execute native code and deliberately does not promote syntax
validation into signature, canonicality or finality evidence.

`--mode host-preflight` reruns the source-bound declaration derivation, requires
a 64-bit Windows x64 process, checks the reviewed launcher source, installer,
tool executables and patched Frontier directory as regular local prerequisites,
and requires the launcher source SHA-256 to match both authority profiles. It
also requires the canonical repository installer bytes to match the recorded
HEAD commit, then emits non-executable parameter objects for two distinct
operations:

- installation uses the reviewed source `bridge-contained-launcher.exe` as
  `BrokerPath`;
- inspection uses the exact digest-addressed launcher path under 64-bit Program
  Files as `BrokerPath`.

The same handoff binds the exact dual-origin execute arguments, including the
public manifest digest, distinct RPC origins, source/tool identities, installed
launcher path, policy window and DLL allowlist. The F2d command independently
requires the expected manifest digest and rejects replacement before execution.
The handoff never invokes the installer, inspector or F2d campaign. Its report
is written only below the ignored `.operator-campaign/` directory because it
contains absolute operational paths; it is not a public proof packet or funds
authority. The installer script and broker source must be rehashed immediately
before any separately approved elevated step.

No public proof-input manifest or protected-host report is checked in. Those
artifacts must come from the reviewed non-mainnet campaign. Until that happens,
the real dual-origin execution and the separate elevated ACL/crash/race/
abandoned-mutex activation campaign remain `not_run`.

## Next Implementation Boundary

After restart or complete database loss, a new process must recollect the exact
source request and V3 parent/child evidence, re-run both protected native
evaluators, validate the signed envelope again and create a fresh lifecycle
journal under `restart_reproof_required`. Only then may it derive another
non-authorizing F2c candidate. Missing launcher availability, partial
recollection, stale/reorg/conflicting evidence, receipt/tombstone drift or RPC
disagreement must remain held. An accepted fresh-process reconstruction is not
claimed on this host because the protected V2 launcher installation and its
elevated disposable-host campaign remain unavailable.

The maximum admission plus pre/post callback path also still requires target-
hardware benchmarking before any runtime activation decision.

Only the conjunction of source proof admission, authenticated parent/child
consumption and reviewed runtime execution can establish consumption-before-
mint. T20E-E implements that relation under a federated compatibility source
profile in local conformance, while F1, F2b and F2c only contain and correlate
the local native executions and identities. None establishes trustless source
finality. T20E-E, F1, F2b and F2c do not close Gate 5 or establish production
readiness by themselves.
