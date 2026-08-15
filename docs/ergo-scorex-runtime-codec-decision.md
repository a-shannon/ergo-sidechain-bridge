# Ergo Scorex Runtime Codec Decision

Status: accepted; bounded TypeScript and source-locked Rust witness,
runtime-derived statement, and deterministic JVM/Rust UTXO lookup
differential implemented for WP-01D

This decision defines the source-proof boundary implemented for the current
Substrate/Frontier compatibility profile. It does not authenticate a supplied
UTXO root as current or canonical, activate minting, close Gate 5, or make a
trustless or production readiness claim.

## Decision

WP-01D uses small, profile-specific, in-tree `no_std` Scorex and UTXO-proof
codecs in the source-locked Frontier runtime. It does not import the complete
`ergo-lib` transaction, interpreter, or wallet graph.

The existing `E2SARW01` relay witness and 1,065-byte V1 statement remain
byte-for-byte immutable. Exact transaction, source-box, vault, and supplied
UTXO-proof bytes use distinct witness families and new runtime-derived
statement versions. No consumer may reinterpret V1 fields or silently change
their domains.

The first transaction profile is deliberately limited to the native-ERG V1
committed-vault route:

- block versions 2 through 4;
- a token-free source box and output-zero vault candidate, plus an empty
  transaction distinct-token table;
- empty input `ContextExtension` values;
- one exact refundable source referenced exactly once as a spending input and
  never as a data input;
- output zero as the exact non-refundable committed-vault candidate;
- bounded additional fee inputs and outputs;
- statically registered source-lock and vault ErgoTree identities.

Another asset lane, non-empty extension shape, serializer generation, or route
requires a new parser profile and reviewed statement/witness version.

## Why The Full Dependency Is Rejected

The bridge currently consumes `ergo-lib-wasm-nodejs` 0.28.0 off-chain. Its
corresponding sigma-rust release source is pinned at
`635bbaca55a27d6dd6b2c0ee2479b6ed60117780`.

That exact release is not an acceptable Frontier runtime dependency:

- `ergo-lib` 0.28.0 does not declare `#![no_std]` or a `std` feature;
- its transaction path imports `std` and the interpreter/wallet graph;
- the release source has no committed Cargo lockfile;
- the 2026-08-04 audit found that resolving `ergo-lib = 0.28.0` with the
  source-locked Cargo/Rust 1.82 toolchain reached transitive packages requiring
  edition-2024 Cargo support;
- later sigma-rust source contains `no_std` work but is a different,
  unreleased source boundary and cannot silently stand in for 0.28.0;
- importing the complete graph would add a large second protocol stack to the
  runtime when this profile needs only bounded framing, hashing, and four
  simple register encodings.

The dependency may be reconsidered only as a separately pinned and reviewed
runtime profile with a reproducible lock, WASM size/cost evidence, and exact
cross-language vectors. It is not part of the current critical path.

## V1 Statement Limitation

The current 1,065-byte statement is a compatibility statement produced from
process-owned evidence. Several of its fields are not derivable from the exact
Scorex transaction and box bytes:

- `wp01cVerificationDigestHex`;
- `transactionSemanticsDigestHex`;
- `sourceBoxContentDigestHex`, which hashes canonical local JSON;
- `currentStateObservationDigestHex`, which describes local RPC observation.

The relay consumer may bind the relay-derived V1 fields and still reject, as it
does today. A runtime transaction verifier must not mark those local digests as
cryptographically established. In particular, a current-state observation
digest is not a UTXO membership proof.

The transaction work therefore requires a new statement family/version whose
deciding fields are all derived from exact runtime bytes. V1 remains a
non-authorizing compatibility profile.

## Required Runtime-Derived Statement

The next statement version must bind at least:

| Surface | Runtime-derived binding |
|---|---|
| Parser | Exact parser-profile ID and statement version/domain |
| Relay | Existing SPV profile, source network, checkpoint, selected branch, target header, target transactions root, depth policy |
| Transaction | Block version, transaction index/count, exact `Blake2b-256(bytes-to-sign)` transaction ID, byte length and SHA-256 of complete signed Scorex bytes |
| Witness leaf | Exact trailing 31 bytes of `Blake2b-256(concat(ordered proof payloads))` |
| Inclusion | Separate Scorex Merkle paths for the transaction-ID leaf and witness-ID leaf against the target transactions root |
| Source | Exact source-box bytes and byte length, computed box ID, source input index and uniqueness, source-lock ErgoTree digest |
| Vault | Exact output-zero candidate bytes, computed vault box ID, vault ErgoTree digest |
| Settlement | Native-ERG asset profile, amount, recipient H160, depositor ErgoTree digest |
| Authority | Explicitly false current-state membership, runtime admission, mint, funds authority, Gate 5, and readiness fields |

Current UTXO membership, transaction execution, and any future mint authority
remain separate proof obligations. They cannot be inferred from local
persistence, an RPC observation digest, or successful parsing.

## Companion Transaction Witness

The companion family uses the distinct magic and domain
`E2STXW01` / `E2S_ERGO_SCOREX_TRANSACTION_RUNTIME_WITNESS_FAMILY_V1`. The
TypeScript implementation freezes exact offsets and a golden vector before the
Rust consumer is added.

It carries four bounded sections for:

1. parser and route profile identities;
2. exact signed-transaction framing, including ordered input box IDs, proof
   payloads, empty extensions, zero data-input and token-table counts, and both
   fully parsed output bodies;
3. transaction-ID and witness-ID Scorex Merkle inclusion paths;
4. the exact full refundable-source box bytes.

The envelope prefix is fixed as follows: magic at bytes `0..7`, format at byte
`8`, zero flags at byte `9`, section count at bytes `10..11`, total length at
bytes `12..15`, family ID at bytes `16..47`, four ordered six-byte directory
entries at bytes `48..71`, and section payloads beginning at byte `72`. Every
directory entry contains one section ID, zero flags, and a big-endian `u32`
section length. These envelope integers are not Scorex integers; reconstructed
transaction and box integers use canonical unsigned VLQ.

The codec reconstructs both complete signed bytes and bytes-to-sign from the
same components. It computes the transaction ID from bytes-to-sign, computes
the signed-byte SHA-256, derives the witness ID from only the ordered proof
payloads, and verifies both Merkle leaves at their exact positions. For block
versions 2 through 4, the Scorex leaf sequence is every 32-byte transaction ID
in block order followed by every corresponding 31-byte witness ID in the same
order. Leaf and internal hashing use the pinned Scorex `0x00` and `0x01`
prefixes, including its single-child rule for an odd final node.

The first profile does not carry an opaque output body because raw Scorex output
bodies are not length-prefixed. It fully reconstructs both the registered vault
output and the registered token-free, register-free change output. No semantic
claim is made about transaction execution. The witness cannot replace exact
Scorex bytes with semantic JSON.

### Frozen TypeScript Vector

The first vector uses two inputs, zero data inputs, zero token IDs, two outputs,
empty proofs, and empty context extensions. Empty proofs make it a byte/parser
vector, not script-execution or target-node acceptance evidence.

| Identity | Value |
|---|---|
| Family ID | `06325e42b321c589ac598d19852cb9d4de7e11260b89c2316c2102a6ac5259b4` |
| Parser-profile ID | `99d4a695c08e3c4a1730f0563fda7ec07c43a218f09e54fe1e5cfef42ffab4bb` |
| Envelope length | `826` bytes |
| Envelope SHA-256 | `4ae6cd56915f0c23d3e1394c2d391d23f9b97a3318621e156a43945f8ec2e0d3` |
| Envelope witness ID | `b4a285454e8d0595c2e7e2986c7d8a9abe9e61707a5153940491a765036195f4` |
| Signed transaction length | `257` bytes |
| Transaction ID | `f4540c518ecba96efa9fb2aa658381ea01c865a13cfb94bb667c10c1cc6d1562` |
| Scorex witness-leaf ID | `5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8` |
| Transactions root | `60de6bd37e625419e282a58b95d82a2103aa460422a4f9be38f93ca706fbd045` |
| Output-zero box ID | `4f78935151aad7a1a99af76b60a984ce11d3c2cc76a083cbdf64e5c479323bf6` |

## Frozen Runtime-Derived Statement V2

The TypeScript composition boundary now reparses both canonical witness
envelopes and emits one fixed 978-byte V2 statement. It accepts exactly the
four data properties `relayWitnessBytes`, `expectedSpvProfileIdHex`,
`transactionWitnessBytes`, and `expectedTransactionProfile`. In particular,
it rejects the V1 process-owned fields `sourceConsensusCandidateDigestHex`,
`committedVaultCandidateDigestHex`, `wp01cVerificationDigestHex`,
`transactionSemanticsDigestHex`, `sourceBoxContentDigestHex`, and
`currentStateObservationDigestHex` rather than reinterpreting them as runtime
evidence.

The statement joins the relay target to the transaction witness through both
the exact transactions root and block version. It binds the supplied branch
section rather than claiming complete branch knowledge, and it keeps every
authority/reserved flag bit zero.

| Identity | Value |
|---|---|
| Statement length | `978` bytes |
| Statement SHA-256 | `6023edf6fb08fd01c48e9a5f57c128e321a06ae41213cd95152b26dcc4b2b991` |
| Statement ID | `4e2dbf7d271c4ab1e8ffc0229c79b127f36ab70adfa0bdaf75321dfd093f93d0` |
| Proof-system ID | `ca246e127abd78a5ec82d430a7c653c29bb6674aebacdd5065de337589aefca4` |
| Statement-profile ID | `faf3547fb14aa43abb4f7e6a0bd11d56de4a8a8f46eb16b437df4b9aa3de0fa4` |
| Supplied-branch policy ID | `874cfca9f96f1f7578dbcd697ef6c5f60664a74e4f92d9e5ee072e8234b46e24` |
| Verifier-profile ID | `62b4f1f892d9ae47ffcb284e791ebc412491dcee7ff434f62dba01ea3de9633c` |

The fixed big-endian field order is:

1. format plus proof-system, statement-profile, supplied-branch-policy, and
   verifier-profile IDs;
2. relay and transaction family, parser, witness, SPV, and source-network IDs;
3. checkpoint, supplied-branch digest/count, selected tip, height, and
   cumulative work;
4. target header ID/height/version, transactions root, canonical-header
   SHA-256/length, and confirmation policy;
5. transaction position, transaction ID, signed-byte SHA-256/length, and the
   31-byte Scorex witness leaf;
6. route and asset profiles, source box ID/length/input position/uniqueness,
   amount, source-lock identity, recipient and depositor identity;
7. vault ID/output index/tree identity and the final zero authority flags.

The source-locked normal and V4 Frontier runtimes now reparse the exact same
relay and transaction vectors and reproduce the 978-byte statement. The Rust
transaction codec reconstructs the signed transaction, bytes-to-sign, Scorex
transaction and witness leaves, source box, output-zero vault and every V2
settlement binding. The relay verifier retains two statically distinct entry
points: V1 accepts only profile `222a7764..df5c3e`, while the V2 statement path
accepts only profile `dea036a2..f4be65`; neither profile can select the other
entry point. Both runtime variants configure compile-time activation false and
an unconditionally rejecting production consumer. Only tests expose a positive
receipt, and its runtime-state, mint and funds-authority flags are false.

The V2 boundary still does not establish transaction execution, authenticated
current UTXO membership, an externally authenticated checkpoint, complete
competing-branch knowledge, globally canonical Ergo consensus, deterministic
finality, runtime admission, mint, funds authority, Gate 5 closure, or
readiness. The separate state-proof differential below establishes the next
proof-format primitive without changing those authority boundaries.

## Frozen Ergo UTXO State Lookup Differential V1

The deterministic vector at
`wasm-avl/test-vectors/ergo-utxo-state-lookup-v1.json` pins the Ergo node
v6.0.2 source at `2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1`. The node build requests
scrypto 2.3.0 and resolves scrypto 3.0.0; the exact resolved JVM artifact and
the `ergo_avltree_rust` 0.1.1 crate are hash-bound in the vector.

Reproduce the source-locked JVM side of the differential with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  scripts/run-ergo-utxo-state-proof-jvm-differential.ps1 `
  -ErgoCheckout <pinned-ergo-checkout> `
  -GitExecutable <pinned-git.exe> `
  -JavaHome <microsoft-openjdk-17-home> `
  -SbtLaunchJar <sbt-1.11.1-launch.jar>
```

The runner creates a detached clone at the exact node commit, uses fresh sbt,
Ivy and Coursier state, verifies the copied Scala producer and resolved scrypto
artifact hashes, and removes the temporary checkout after the result.

The pinned JVM prover creates one deterministic post-transition dictionary and
emits one 280-byte batch proof for these ordered operations:

1. membership of the exact 32-byte committed-vault box ID with the complete
   175-byte canonical box serialization as its value;
2. non-membership of the exact 32-byte refundable-source box ID.

The resulting 33-byte post-transition root is
`840d866bfe5cc593b4ad92f3091041914686eb20c7329abccd0e70727a2a56dd01`.
The Rust verifier reproduces both lookups, requires the vault value bytes to
derive the supplied box ID under Blake2b-256, limits the proof and value sizes,
limits replay to exactly two lookups and zero deletes, and requires the
post-replay digest to remain unchanged. Root-label/proof mismatch, role, value,
proof-kind, duplicate-role, truncated-proof and mutated-proof faults reject
independently.

The dictionary digest has a 32-byte authenticated root label followed by one
AVL-height byte. The pinned Rust verifier uses and returns that height byte but
does not recompute it from a partial proof. Likewise, an absence proof may
cover more than one absent key. The verifier therefore returns the complete
supplied root and exact requested keys: the runtime statement consumer must
bind all 33 root bytes to the target header and both lookup keys to the exact
source/vault identities. Neither value may be selected by an adapter or local
journal.

The upstream Rust proof parser also contains unchecked indexed accesses for
malformed serialized proofs. The local `std` wrapper converts such panics into
rejections, but a source-locked `no_std` runtime must not rely on panic catching
as a security boundary. That port requires bounded, panic-free framing before
the upstream operation replay, with the malformed-proof matrix rerun against
the runtime implementation.

The pinned node exposes `POST /utxo/getBoxesBinaryProof`, but that endpoint
serves the current full-state proof and does not provide an atomic
`(header identity, state root, ordered keys, proof)` envelope. A production
collector must obtain a stable exact tuple or retry; runtime proof verification
then binds the tuple to the target header. RPC provenance, two agreeing URLs,
or SQLite persistence cannot replace that proof or authenticate the header's
consensus status.

## Stable Current-Tip Capture

The first bounded collector implements that tuple without changing any frozen
witness or statement bytes. A dedicated static adapter keeps its HTTP client in
a closure and exposes only a fixed best-header GET plus the exact ordered vault
and refundable-source POST to `/utxo/getBoxesBinaryProof`. It canonicalizes the
complete v2-v4 header, recomputes its ID, limits the hexadecimal proof to the
existing 16 KiB witness bound, and exposes only the two fixed read methods.
There is no caller-selected method or path and no accessible generic client.

The adapter snapshots the exact inputs and derives the two request keys from
`E2STXW01`; relayer-core independently rederives those keys and the complete
expected vault value. It accepts the supplied tuple only when both header reads
equal the exact V3 target header and the generated `E2UTXW01` verifies against
that header's complete 33-byte state root. Pure composition provenance and
static node-adapter provenance are separate process-local brands. A structural
port, caller boolean or persisted row cannot acquire the latter or convert the
capture into mint eligibility, and the serializable authority fields remain
false in both cases.

This is a stable observation of one supplied current tip, not an atomic node
snapshot, authenticated checkpoint, proof of complete competing-branch
knowledge, or global Ergo consensus decision. Because the endpoint cannot
serve a historical state proof, collection must occur while the transition
header is the exact tip; the verified capture is then retained while policy
depth accrues. A later authority composition must bind that retained capture to
independently authenticated checkpoint and admitted branch-view evidence. It
must not recollect a proof for a later root and relabel it as the transition
state.

Retention now has a canonical non-authorizing representation. The
`e2s.ergo-utxo-state-runtime-witness-retained-packet.v1` packet stores the exact
target header bytes, canonical transaction parser profile, `E2STXW01` bytes,
`E2UTXW01` bytes, source-capture digest and an all-false authority map under a
domain-separated packet digest. Its normalizer recomputes header, parser,
transaction and UTXO identities and replays the transition and lookup. A JSON
round trip can therefore reconstruct the same capture after restart without
persisting the static node adapter's process-local provenance. This is byte
retention and replay, not a journal or node observation becoming authoritative.

The separate
`e2s.ergo-utxo-state-runtime-branch-composition.v1` operation then accepts a
later exact `E2SARW01`, replays all supplied branches, enforces deterministic
greatest-work selection among them and target policy depth, and rebuilds the
exact V3 statement from retained bytes. It records both limitations directly:
the checkpoint comes from the supplied SPV profile rather than external
authentication, and the supplied branch set is not proof of every branch that
may exist on the Ergo network.

This differential verifies only membership and non-membership against a
caller-supplied state commitment. It does not establish checkpoint trust,
complete branch knowledge, canonical Ergo consensus, transaction execution,
mint authority, Gate 5 closure, or readiness.

A stale but internally consistent root/proof pair is not distinguishable at
this layer. The implemented V3 statement rejects rebinding by requiring the
full root to equal the state commitment in the exact selected target header;
checkpoint trust and complete branch authority remain separate obligations.

## Source-Locked UTXO Runtime Witness And Statement V3

The distinct `E2UTXW01` witness preserves V1, `E2SARW01`, `E2STXW01`, and V2
bytes. Its canonical vector is 652 bytes and carries the exact static verifier
profile, all 33 state-root bytes, the ordered vault and refundable-source keys,
the complete 175-byte vault value, and the 280-byte proof. TypeScript validates
the bounded framing and lookup semantics independently. The source-locked
`no_std` Rust runtimes validate the same framing before replaying the two
operations through `ergo_avltree_rust`. Malformed proof tags, node stacks,
balance values, lengths, truncation, trailing bytes, root drift, key drift,
value drift, membership/non-membership role drift, and unused proof directions
reject without a panic-catching security boundary.

| Witness identity | Value |
|---|---|
| Family ID | `2d7b1929093f488d83a1a25b4ada38c40237920cb88908f6aa5976b677a43a26` |
| Verifier-profile ID | `9e90fc9e2e50e3adbfddc89177277406a5ef3a70b062214b9f958960ea309050` |
| Witness ID | `e7c82bef7d520d0f30d1122221f97f41ae1d275d495a5e5e41df517367fdebf5` |
| Envelope length | `652` bytes |
| Envelope SHA-256 | `1dacdf4bf5b1aecbb9d4cf04a1dc58a18b8a41ad1434a65ddf226a3fe2ffc900` |

The separate 588-byte V3 statement reparses `E2SARW01`, `E2STXW01`, and
`E2UTXW01`, recomposes the complete V2 statement ID, requires the UTXO root to
equal the selected target header's state root, and binds both lookup keys plus
the complete vault bytes to the transaction witness. It also binds the exact
vault-value and proof lengths and SHA-256 digests. TypeScript and both
source-locked Frontier test runtimes reproduce the same bytes and ID.

| Statement identity | Value |
|---|---|
| Proof-system ID | `f17ea590526aaac8afb7624ccffb1d4a3b74fd185345540162831b70a9af42e2` |
| Statement-profile ID | `10fdf44b01fc0fd2b9e3e58d60ea59150320bdc10c9a00016fb4c666d4b1726b` |
| Verifier-profile ID | `a64dadeff38b2d85e791539b61e217d10f77bb51ccb6154d82248285370726a1` |
| Statement ID | `c79f76fa360e7a798e9f8cbadded9d58dedab39bd1a55003e4a79f39f7de7100` |
| Statement length | `588` bytes |
| Statement SHA-256 | `f056021a81aea62331615de8e8b84aed2c6590bad29a73c9c3d083ee0d18aec6` |

The exact source lock uses `ergo_avltree_rust` 0.1.1. Locked WASM builds also
retain `blake2b_simd` 1.0.2 and set `WASM_BUILD_WORKSPACE_HINT` to the workspace
root so the pinned Cargo 1.82 build uses the committed lockfile rather than a
new dependency resolution.

The normal production runtime and V4 non-publishable test runtime validate the
complete V3 candidate and then reject unconditionally under a dedicated
compile-time false activation flag. Test-only consumption records supplied-root
lookup verification while
checkpoint authentication, complete competing-branch knowledge, globally
canonical consensus, current UTXO authority, runtime mutation, mint, funds
authority, Gate 5, and readiness remain false.

## Parser Scope And Bounds

The first parser implementation is intentionally narrower than the outer
format bounds. It accepts exactly two spending inputs, zero data inputs, zero
distinct token IDs, and exactly two outputs. A later profile/version may widen
that shape only with its own vectors and review. The format must enforce
explicit constants no larger than:

- 16 spending inputs across any future profile in this family;
- 16 data inputs across any future profile in this family;
- 16 outputs across any future profile in this family;
- 64 KiB complete signed transaction;
- 64 KiB total proof payloads;
- 4 KiB per Ergo box, output body, or ErgoTree;
- exactly zero transaction distinct-token IDs and exactly zero tokens in the
  source box and output zero;
- exactly zero context-extension entries;
- exactly R4-R7 for the source and vault profile-owned register sets.

All VLQ values must be minimally encoded. Lengths are checked before
allocation, additions use checked arithmetic, every deciding slice is consumed
exactly once, and trailing bytes reject.

The source parser accepts only the route's exact source-lock ErgoTree and:

- positive native-ERG value;
- no tokens;
- R4 as a 20-byte recipient;
- R5 as the same canonical Long value;
- R6 as one compressed secp256k1 public key;
- R7 as a non-empty depositor ErgoTree;
- a computed box ID matching the statement.

The vault parser accepts only output zero with the exact vault ErgoTree and:

- the exact source value;
- no tokens;
- R4 equal to the source box ID;
- R5 equal to the recipient H160;
- R6 equal to the amount;
- R7 equal to the depositor ErgoTree;
- a computed box ID equal to `Blake2b-256` of the canonical standalone Scorex
  box serialization: the complete output candidate with full token IDs,
  followed by the transaction ID and the canonical unsigned-VLQ `u16` output
  index zero.

## Required Negative Matrix

The TypeScript and Rust implementations must independently reject:

- unsupported witness, statement, parser, route, network, or asset profile;
- non-canonical or overflowing VLQ, count, length, or index;
- truncation, trailing bytes, directory overlap, or reordered sections;
- non-empty context extension, transaction distinct-token table, source token,
  or output-zero token;
- transaction-ID or signed-byte digest drift;
- proof-payload order/count drift and witness-ID drift;
- transaction or witness Merkle path sibling, side, index, count, odd-node, or
  root drift;
- missing, duplicate, or data-input-only source reference;
- source box ID, tree, value, token, R4, R5, R6, R7, transaction reference, or
  output-index drift;
- vault output index, ID, tree, value, token, R4, R5, R6, R7, or body-boundary
  drift;
- relay-to-transaction target root, block version, index, count, or statement
  rebinding;
- use of V1 local observation/JSON digests as runtime or funds authority.

## Authority Boundary

The normal production runtime and V4 non-publishable test runtime parse, verify,
join, and then reject unconditionally. No dispatchable, storage transition, EVM call, daemon route,
mint path, signer, submitter, or broadcast capability consumes a positive
result.

The next authority boundary is a statically versioned externally authenticated
checkpoint plus an explicit bounded source-set and branch-admission policy for
the exact retained target header. That policy must bind source network,
checkpoint/profile identity and admitted independent origins, and reject
missing, duplicated, same-origin, stale, divergent or wrong-checkpoint
observations. A finite RPC set must not be presented as deterministic finality
or proof of globally complete branch knowledge. Activation remains blocked on
that consensus authority, complete current-state and deployment lineage,
global replay cutover, target-runtime acceptance, permanent legacy-route
retirement, and independent Gate 5 closeout.
