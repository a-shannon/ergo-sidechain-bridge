# Peg-In Runtime State V1

## Status And Purpose

Peg-In Runtime State V1 is a versioned Frontier runtime profile for recording
successful canonical `PegIn` events from the configured bridge contract in
authenticated Substrate state. It does not prove that a mint was authorized or
executed. It is designed to
replace the relayer's current `processedPegIns(bytes32)` `eth_call` agreement
with a state value that can later be proven against a GRANDPA-finalized runtime
state root.

The profile is implemented in the pinned Frontier source patch and covered by
cross-language Rust/TypeScript vectors. It is not deployed or activated by this
repository state. No current hold release, mint decision, Gate 5 closure,
trustless claim, or production-readiness claim follows from it.

The existing burn commitment V1, `bridge_event_root`, `0x0401` payload,
domains, hashes, storage value, golden vectors, and settlement identities are
unchanged. Peg-In Runtime State V1 is a separate state family; it does not
reinterpret the burn-only V1 statement.

## Runtime Producer

The runtime observes the exact Solidity event:

```text
PegIn(address indexed to, uint256 amount, bytes32 ergoBoxId)
```

For every stored Frontier block with an active profile, the producer validates
the transaction, receipt, and status alignment below. Every matching `PegIn`
must additionally satisfy the profile and ABI constraints:

- one active nonzero bridge address and matching peg-in profile;
- profile activation in a strictly earlier block than every matching peg-in;
- equal Ethereum transaction, receipt, and transaction-status counts;
- canonical transaction indexes and byte-equivalent receipt/status logs;
- receipt status `0` or `1`, accepting only successful status `1` logs;
- the configured bridge address and exact event signature;
- canonical indexed-address padding and a nonzero recipient;
- exactly two ABI data words;
- a positive amount that fits unsigned 64-bit nanoERG;
- a nonzero Ergo box ID;
- a canonical global log index that fits unsigned 32-bit;
- no duplicate record key and no configured per-block bound overflow.

The callback completes peg-in collection, replay lookup, burn validation, and
bounded-value conversion before it writes any record, replaces any current burn
commitment, or emits any runtime event. A malformed mixed peg-in/peg-out block
therefore leaves all prior runtime state and events unchanged.

Peg-in records are stored independently of burn-root production. A block with a
valid peg-in and no `PegOut` still records the peg-in. Reverted transactions,
wrong-address logs, and unrelated topics do not create records. A malformed log
that otherwise targets the configured bridge and event fails closed.

A runtime upgraded from the burn-only profile can have `BridgeAddress` without
`CurrentPegInProfile`. That state deliberately retains the existing burn-only
producer and creates no peg-in records. A later root configuration call is the
explicit activation boundary for Peg-In Runtime State V1.

The separately versioned causal-admission profile narrows this legacy behavior.
While that profile is active, every matching V1 `PegIn` must atomically consume
an exact direct-parent pending admission and create the exact parent-bound V3
consumed record. Once any causal profile has been activated, a sticky migration
marker prevents admission-free V1 mint recording. The causal profile cannot be
disabled or replaced, the V1 profile can no longer be changed or removed, and
runtime upgrades remain forbidden. Activation validates any bounded preloaded
pending state and permanently removes the current runtime's `sudo` key, closing
its raw `System::set_storage` and `:code` replacement route. Future migration
requires a separately versioned, explicitly reviewed transition. The V1 profile/record
bytes and replay key remain unchanged; the additional V3 state is a distinct
proof obligation described in
`docs/peg-in-causal-admission-v2.md`.

## Profile Encoding

`CurrentPegInProfile` is a fixed 69-byte SCALE value in this order:

| Field | Encoding |
|---|---|
| `formatVersion` | `u8`, exactly `1` |
| `sidechainId` | 32 raw bytes, the native genesis block hash |
| `bridgeAddress` | 20 raw bytes, nonzero |
| `profileRevision` | `u64` little-endian, positive |
| `activationHeight` | `u64` little-endian |

Its fixed storage key is:

```text
0xaf86fef4216ac2bcd1c592b204011ad0d4e9ffac40246e76bb00b9031373d2c3
```

Before the first causal-profile activation, every root V1 configuration call
increments `profileRevision`, including disable. Reactivation therefore creates
a new profile generation and activation height. After causal activation the V1
profile is permanently frozen. The activation block itself cannot produce a
matching peg-in record. This prevents end-of-block runtime observation from
ambiguously accepting an event under a profile configured in the same block.

## Record Encoding

Each `ProcessedPegIns` value is a fixed 205-byte SCALE value in this order:

| Field | Encoding and binding |
|---|---|
| `formatVersion` | `u8`, exactly `1` |
| `sidechainId` | 32 raw bytes; source-domain binding |
| `bridgeAddress` | 20 raw bytes; contract binding |
| `profileRevision` | `u64` little-endian; configuration generation |
| `profileActivationHeight` | `u64` little-endian; activation boundary |
| `ergoBoxId` | 32 raw nonzero bytes; source-deposit identity |
| `recipient` | 20 raw nonzero bytes; mint recipient |
| `amount` | positive `u64` little-endian nanoERG, constrained to the positive signed-`Long` range for the active Ergo settlement profile |
| `sidechainHeight` | `u64` little-endian |
| `executionBlockHash` | 32 raw bytes |
| `transactionHash` | 32 raw bytes |
| `eventIndex` | `u32` little-endian global log index |

The replay identity is:

```text
Blake2b-256(
  ASCII("E2S_PEG_IN_RECORD_KEY_V1") ||
  sidechainId ||
  ergoBoxId
)
```

The profile revision and bridge address are deliberately absent from this key.
Disabling, reactivating, or migrating the bridge contract must not make an
already processed canonical Ergo deposit eligible for another record on the
same sidechain. The complete value still carries the exact contract address,
generation, and activation fields needed for provenance review.

`ProcessedPegIns` uses `Blake2_128Concat`. Its fixed pallet/storage prefix is:

```text
0xaf86fef4216ac2bcd1c592b204011ad0e683c528c6fc8006645fa5989173f2e0
```

The complete storage key is:

```text
prefix || Blake2b-128(recordKey) || recordKey
```

The canonical vector is
`relayer/test-vectors/peg-in-runtime-state-v1.json`. The Rust runtime and the
TypeScript codec freeze the same record key, SCALE lengths, encoding hashes,
profile storage key, and processed-record storage key.

## Historical Membership And Current Non-Membership

Positive membership and current non-membership have different profile rules.
A persisted record remains valid historical replay evidence after profile
disable or rotation. Its key excludes the profile revision by design, and a
positive membership consumer must not require the current profile to equal the
record's original generation. The record value carries its historical profile
generation explicitly. Runtime code and upgrade lineage remain separate proof
obligations before a consumer can rely on how that value was produced.

Current non-membership has no equivalent historical object. It is meaningful
only when the proof also contains the current active profile and that profile
was activated strictly before the finalized native target. A separate cutover
policy must bind the reviewed profile-activation checkpoint to the eligible
Ergo deposit range; native and Ergo heights are not directly comparable.

## Weight And Storage Economics

Pallet Ethereum reserves the bridge callback's declared maximum before normal
dispatch. The template currently reserves one quarter of the two-second block
reference-time budget and the five-MiB proof-size budget. This is a conservative
prototype limit, not a benchmark-backed production value. Runtime activation
requires target-hardware benchmarks at the configured maximum and an approved
block-capacity budget.

`ProcessedPegIns` is intentionally monotonic because deleting a processed
deposit would recreate replay eligibility. `MaxPegInsPerBlock` bounds writes in
one block; it does not bound lifetime trie growth. Activation therefore also
requires an explicit state-growth forecast and economic policy for that
permanent replay state. Pruning, rent-backed storage, or replacement by an
authenticated accumulator would require a separately versioned migration and
proof design. V1 records must never be deleted silently.

## EVM Mint Boundary

The native record and the EVM replay guard are different state machines.
`ProcessedPegIns` is produced by the post-execution Frontier callback after a
successful receipt and matching `PegIn` log. It does not run before the token
mint and must not be described as the write-before-mint guard.

The current Solidity ordering is:

1. `ErgoBridge.mintSERG` rejects an existing
   `processedPegIns[ergoBoxId]`;
2. it writes that mapping entry;
3. it calls direct `SERG.mint`;
4. it emits `PegIn`.

Those operations share one EVM transaction, so a revert from `SERG.mint`
reverts the Solidity replay write and prevents the event. Direct `SERG.mint`
remains a separate mint-capable entrypoint controlled by token ownership. The
deployment script transfers `SERG` ownership to `ErgoBridge`, but script intent
is not current or historical deployed-state evidence.

Consequently, a native `PegIn` record does not by itself prove the exact
deployed bridge code, token code, bridge-to-token binding, token owner, or
supply delta. Those bindings require independent observation immediately
before any future mint admission plus reviewed ownership and mint history. The
pinned Frontier source now includes a client-level whole-block conformance test:
after exact bridge/token deployment and ownership setup, a candidate executes
`mintSERG` and same-block profile activation, then fails at the post-block
callback. Direct reads from the populated candidate overlay prove the exact
bridge token address, replay bit, token supply delta, and recipient balance
before finalization. Both authoring and `FrontierBlockImport` reject it, and
exact parent snapshots prove no token supply/balance delta, Solidity replay
bit, native profile/address/record, event, Frontier state, or accepted candidate
survives. A runtime-built sibling from the same parent imports successfully
after the rollback checks. A second valid sibling supplies a mixed-header
negative control: combining its body with the first sibling's state root and
digest rejects along a shorter Wasm backtrace prefix, while the mint candidate
import shares the direct callback-failure witness path. This distinguishes the
callback rejection from the known header mismatch without claiming that the
rejected candidate header is valid. The source verifier also binds the fixture
Git blobs to the current checked-in Solidity creation bytes. WP-06T18 adds the
separate package-local build closure: exact compiler/dependency lock and
settings, normalized source/import hashes, ABI, creation/runtime bytecode,
metadata, and storage layouts. Its non-writing check reproduces the fixture
bytes, and source lock v3 binds the manifest. This remains local build
reproduction, not deployed-state, ownership-history, finality, or mint evidence.

## Invariant Matrix

| Producer | Exact field or bytes | Consumer | Deciding authority | Failure if relaxed | Negative coverage |
|---|---|---|---|---|---|
| Root configuration | V1 profile, genesis hash, bridge address, positive revision, activation height | Runtime peg-in collector and native finalized-state verifier | Authenticated runtime state under reviewed finality | Cross-chain, wrong-contract, stale-generation, same-block, or implicit-upgrade admission | Unsupported version, zero bridge, zero revision, future/equal activation; absent profile retains burn-only mode |
| Frontier block storage | Transaction hash, canonical transaction index, receipt status and exact logs | Runtime peg-in collector | Native block execution | A record can be attributed to a different transaction or reverted execution | Count, index, status, receipt/status-log, and transaction-hash mismatch |
| Matching `PegIn` log | Exact address/topic, ABI recipient, amount, Ergo box ID, global event index | Runtime record encoder | Native block execution; not proof of deployed code or token supply | Malformed or unrelated logs can become native records, while an event-only consumer can mistake a record for proof of the expected mint | Wrong address/topic ignored; malformed recipient/data, zero values, and bounds rejected |
| Runtime record encoder | Fixed 205-byte SCALE value | Native finalized-state verifier and non-authorizing reconciliation | Proven storage membership under reviewed finality | Field reinterpretation or truncation breaks deposit/mint identity | Cross-language exact-length, byte, hash, version, and range vectors |
| Replay-key derivation | Domain, sidechain ID, Ergo box ID | `ProcessedPegIns` map and native finalized-state verifier | Proven storage key/value | Profile or contract-address rotation can recreate eligibility | Profile and address migration stability plus isolated chain and box mutations |
| Solidity replay guard | `processedPegIns[ergoBoxId] = true` before external `SERG.mint`, followed by `PegIn` only after mint returns | EVM execution and native log collector | Exact reviewed and deployed bridge/token code plus EVM transaction semantics | Mint can precede replay protection, or failed mint can retain replay/event state | Source-ordering review and whole-block callback rollback conformance exist; an isolated token-mint-revert transaction case remains required |
| Token mint control | Direct `SERG.mint`, `SERG.owner`, bridge `sergToken`, exact bridge/token runtime code, ownership-changing entrypoints | Future historical-absence and mint-admission join | Independently observed deployed state and reviewed ownership/mint history | A direct token mint or owner change bypasses bridge replay identity while still changing supply | Wrong token/code/owner, ownership transfer/renounce, direct mint, proxy/delegate/fallback route, and event-without-supply-delta cases remain required |
| FRAME storage layout | Exact profile key; map prefix plus `Blake2_128Concat(recordKey)` | Native finalized-state proof profile | Proven runtime state root | A proof can target a lookalike key or storage family | Rust/TypeScript fixed-key and complete-key vectors |
| Callback mutation boundary | Pre-EVM parent snapshot plus fully validated peg-in records, causal consumption after one-way activation, replay reads, optional burn commitment, and bounded leaf vector | Runtime storage and events | Native block execution | Same-block admission or a later malformed mint/burn can retain EVM value changes, a partial native record, or erased prior state | Same-block causal cutover/mint and admission-free mint reject without state leak; valid-peg-in/malformed-peg-out leaves records, current commitment, leaves, and event count unchanged |
| Privileged cutover boundary | Exact causal activation validates all keyed pending values, stores the immutable profile and sticky marker, then removes the current runtime's `sudo` key atomically | Every later profile, storage and runtime-code transition | Native block execution | `sudo(System::set_storage)` or raw `:code` replacement could bypass nominal pallet guards after activation | Wasm block import proves the key is absent; signed attempts to replace the V1 profile and `:code` leave both bytes unchanged |
| Whole-block callback failure | Successful EVM mint path followed by same-height profile rejection | Runtime API overlay, block builder, `FrontierBlockImport`, and client state | Pinned Frontier conformance evidence | An EVM mint/replay bit can survive while the native record is rejected, or a generic header mismatch can masquerade as callback evidence | Exact bridge/token setup; overlay bridge/replay/supply/balance deltas; authoring/import rejection; callback-path Wasm witness distinguished from a mixed-header control; parent nonce, balance, supply, replay, profile, record, event, receipt/status, head, and candidate absence checks; valid sibling import |
| FRAME callback accounting | Declared maximum callback weight reserved during `on_initialize` | Block weight admission | FRAME block accounting | End-of-block scanning and writes execute outside the block budget | Pallet hook test proves the exact callback reservation is added; runtime test freezes the configured value |
| Runtime event encoding | Historical event variants remain SCALE indexes `0` and `1`; new variants append after them | Existing event consumers | Runtime metadata and SCALE bytes | An upgrade silently reinterprets existing event bytes | Exact legacy event byte vectors |
| Relayer codec | Exact profile/record value and storage key | Non-authorizing reconciliation only | No funds authority until finality and state proofs are admitted | RPC or local-cache agreement can be mistaken for proof | Profile drift and at/before-activation records rejected |
| Reviewed GRANDPA trust anchor | Sidechain ID, checkpoint hash/height, set ID, authority list, independently supplied digest | Native peg-in deployment-checkpoint verifier | Reviewed trust root plus verified transition, ancestry, and finality proofs | A self-consistent but unreviewed authority set can authenticate invented state | Wrong digest, target, authority set, transition, ancestry, horizon, and finality proof rejected |
| Finalized target header | Exact native hash, height, state root, bounded branch-specific trie proof, internally derived keys | Peg-In Runtime State V1 verifier | GRANDPA-finalized header and trie verification | Profile and record bytes can be mixed across roots or queried under lookalike keys | Membership after profile disable and rotation; mixed proof, wrong root/key/value/outcome, malformed node, duplicate node, and proof-bound cases rejected |
| Native verification payload | Exact verifier stdin bytes and their digest, independently supplied trust-anchor digest, target, authority path, finality horizon, branch-specific profile presence, statement-specific state outcome, proof accounting, and false claim boundaries | TypeScript payload binder; future versioned execution-policy broker | Structural binding only; executable and process provenance remain unproved | A self-selected trust root, fabricated payload, or branch-wide state claim can be mistaken for mint authority | Burn-schema reuse, exact-byte/digest drift, independent trust-root mismatch, forbidden membership profile, missing non-membership profile, request/value/key drift, non-membership value injection, and every claim escalation rejected |

## Finalized-State Proof V1

The separate `e2s.native-finalized-peg-in-state-request.v1` profile now binds
the producer state to one reviewed native block and one runtime state root. It
reuses the reviewed GRANDPA trust-anchor and authority-transition machinery,
but it does not extend or reinterpret the burn-only checkpoint V2 request. The
native verifier derives every requested storage key internally. The two
statement branches intentionally authenticate different key sets:

- membership authenticates only the exact `ProcessedPegIns` key derived from
  the trusted sidechain ID and canonical Ergo box ID, so a permanent record can
  still be proven after profile disable or rotation;
- non-membership authenticates that exact derived record key together with the
  exact fixed `CurrentPegInProfile` key in one proof.

The membership statement requires exact expected record bytes and forbids a
current-profile field. The non-membership statement requires exact expected
active-profile bytes. Unknown schemas, versions, outcomes, arbitrary keys,
mixed roots, malformed SCALE, missing members, present non-members, ambiguous
profile fields, duplicate proof nodes, and proof bounds fail closed. The
checked-in Rust-generated vector covers real membership after profile disable
and real current-profile non-membership; the TypeScript consumer reproduces
their request, storage-key, value, digest, and claim-boundary bindings.

The native finalized-state proof binds:

1. the reviewed GRANDPA trust-anchor identity and authority-set transition
   rules;
2. the finalized target header and its exact runtime state root;
3. membership of the exact `ProcessedPegIns` storage key without querying or
   depending on a later current profile, or current non-membership of that key
   together with the exact `CurrentPegInProfile` value;
4. the stricter active-profile timing rule only for non-membership;
5. the deposit identity, bridge address, sidechain ID, profile revision,
   activation height, recipient, amount, block, transaction, and event index.

A complete future admission must additionally bind the deployed runtime `:code`
to the reviewed source-lock identity, executable and process provenance, the
chain-derived Ergo committed-vault transition and mint identity, and restart and
reorg handling without granting authority to SQLite. Those are separate
consumers and are not properties of the native trie proof itself.

Non-membership proves only that the derived key is absent at one finalized
sidechain state under an active profile whose activation height precedes that
sidechain checkpoint. It cannot compare a native activation height with an Ergo
deposit height, and it does not prove that a legacy mint never occurred before
the profile was activated. A cutover consumer must separately bind the reviewed
runtime/profile activation checkpoint to the eligible Ergo deposit range. An
RPC `null`, a local boolean, two agreeing `eth_call` responses, or a missing
SQLite row is not a non-membership proof.

Membership proves that the exact record bytes are present under the derived key
in the finalized state, including after `CurrentPegInProfile` is absent or has
rotated. Until runtime `:code` and upgrade lineage are
authenticated, it does not prove which code inserted or migrated that value. It
also does not independently prove that the preceding Ergo deposit was consumed
into the exact non-refundable vault, that the mint was economically solvent, or
that a payout is authorized. Those remain separate settlement-core and
lifecycle obligations.

The current proof authenticates the target header state root but does not yet
prove the deployed runtime `:code` value against the pinned source-lock identity.
Every result therefore keeps `runtimeCodeIdentityVerified = false`, alongside
`historicalMintAbsenceVerified = false`,
`committedVaultTransitionVerified = false`, `mintAuthorized = false`, and
`gate5Closed = false`.

## Next Integration Boundary

The next implementation slice must statically register the new verifier mode
in a separately versioned native execution policy, collect both keys through
one bounded `state_getReadProof` call, and bind executable provenance before
the result reaches the existing non-authorizing peg-in reconciliation boundary.
The current policy V1 and `verify-checkpoint` operation remain burn-only and
must not be silently reused. The reconciliation result must retain all holds;
only after the complete proof admission and cutover semantics receive
independent review may a hold-release policy be designed.

Before runtime activation, the callback reservation must be replaced or
confirmed by benchmark-backed weights for the target hardware, and permanent
replay-state growth must have an approved capacity and economic policy. The
existing bound limits growth per block only; this document does not claim a
reviewed production weight or bounded lifetime state.
