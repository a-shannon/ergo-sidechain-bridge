# Bridge Checkpoint Commitment V1

This specification freezes the WP-05 byte format shared by the sidechain
runtime, relayer, Ergo extension producer, and future Ergo-side verifier. It is
a format and golden-vector contract, not evidence that sidechain finality or
Gate 5 is complete.

## Design

Substrate/Frontier remains the EVM-compatible execution and commitment
production layer. Ergo remains the settlement trust boundary: a future
Ergo-side verifier must authenticate the checkpoint and finality proof before a
burn root can authorize payout.

Raw EVM receipt RLP, Merkle-Patricia proofs, and Keccak are deliberately outside
the ErgoScript path. Successful bridge burns are converted into the existing
fixed-width Blake2b V1 burn leaves and ordered by canonical EVM execution order:
transaction index first, then log index. Reverted receipts and logs from any
other contract or event signature are excluded. The producer must reject
duplicate burn IDs and leaves whose sidechain ID or block hash differs from the
checkpoint.

The V1 extension value uses the full 64-byte extension-value budget:

```text
0x0401 value = bridge_event_root[32] || checkpoint_commitment[32]
```

The root remains directly available for burn inclusion checks. The checkpoint
commitment prevents that root from being paired with a different sidechain,
execution block, consensus block, burn count, GRANDPA authority set, or finality
proof.

## Burn Tree

V1 keeps the burn proof format already consumed by
`MainChainAggregateUnlockTrustless.es`:

```text
burn_id = Blake2b256(
  ASCII("E2S_TRUSTLESS_BURN_ID_V1") ||
  sidechain_id[32] || sidechain_tx_hash[32] || event_index_u32be
)

leaf_hash = Blake2b256(
  ASCII("E2S_TRUSTLESS_BURN_LEAF_V1") || encoded_leaf[205]
)

node_hash = Blake2b256(
  ASCII("E2S_TRUSTLESS_BURN_NODE_V1") || left[32] || right[32]
)
```

At every tree level, hashes are paired from left to right. When a level has an
odd number of hashes, its final hash is duplicated as both `left` and `right`.
A single-leaf root is that leaf hash. Empty trees are invalid in V1.

`encoded_leaf[205]` is:

| Offset | Bytes | Field |
|---:|---:|---|
| 0 | 1 | leaf version, `0x01` |
| 1 | 32 | sidechain ID |
| 33 | 32 | Frontier execution block hash |
| 65 | 32 | derived burn ID |
| 97 | 32 | sidechain transaction hash |
| 129 | 4 | event/log index, unsigned big-endian |
| 133 | 32 | Blake2b256 of recipient ErgoTree |
| 165 | 8 | amount in nanoERG, unsigned big-endian |
| 173 | 32 | asset ID; all zero bytes for the ERG lane |

V1 checkpoints are burn-bearing checkpoints and require at least one successful
canonical burn. Empty-block commitment semantics require a later reviewed
version rather than an implicit special root.

## Checkpoint Preimage

The fixed-width checkpoint preimage is 216 bytes:

| Offset | Bytes | Field | V1 value |
|---:|---:|---|---|
| 0 | 1 | checkpoint version | `0x01` |
| 1 | 1 | hash algorithm ID | `0x01` = Blake2b-256 |
| 2 | 1 | finality rule ID | `0x01` = GRANDPA justification V1 |
| 3 | 1 | flags | `0x00` |
| 4 | 32 | sidechain ID | raw Substrate genesis block hash |
| 36 | 8 | sidechain block height | unsigned big-endian |
| 44 | 32 | sidechain consensus block hash | native Substrate hash finalized by GRANDPA |
| 76 | 32 | execution block hash | Frontier/Ethereum block hash carried by burn leaves |
| 108 | 32 | bridge event root | V1 burn-tree root |
| 140 | 4 | burn leaf count | unsigned big-endian, greater than zero |
| 144 | 8 | GRANDPA authority-set ID | unsigned big-endian |
| 152 | 32 | GRANDPA authority-set hash | defined below |
| 184 | 32 | finality proof hash | defined below |

The authority-set, proof, and checkpoint commitments are:

```text
finality_authority_set_hash = Blake2b256(
  ASCII("E2S_GRANDPA_AUTHORITY_SET_V1") ||
  canonical_scale_encoded_grandpa_authority_list
)

finality_proof_hash = Blake2b256(
  ASCII("E2S_GRANDPA_JUSTIFICATION_V1") ||
  canonical_scale_encoded_grandpa_justification
)

checkpoint_commitment = Blake2b256(
  ASCII("E2S_BRIDGE_CHECKPOINT_V1") || checkpoint_preimage[216]
)
```

The canonical authority list is the SCALE encoding of GRANDPA's ordered
`AuthorityList` (`Vec<(AuthorityId, AuthorityWeight)>`): SCALE compact vector
length followed by each 32-byte authority ID and its `u64` little-endian weight.
The canonical justification bytes are the SCALE encoding of the pinned
sidechain runtime's `GrandpaJustification<Block>` value; another envelope,
field order, or JSON/RPC representation is not interchangeable.
The authority-set ID, authority-set hash, and proof hash are commitments, not
proof of finality by themselves. Acceptance requires the authority set to be
authenticated from the sidechain genesis/finality state, including verified
authority-set transitions, and the canonical GRANDPA justification to finalize
the exact checkpoint height and native consensus block hash under that set.

The execution block hash is intentionally separate. Frontier RPC burn logs bind
to the Ethereum-compatible block hash, while GRANDPA finalizes the native
Substrate block hash. A finalized checkpoint assembler must pair them only after
the block exists, and acceptance must verify an authenticated runtime-state or
aggregate-proof binding from the finalized consensus block to the execution
block hash, event root, and burn count. Equal heights alone do not prove that
mapping. Ergo anchor depth is checked separately and cannot substitute for
either sidechain finality or execution/consensus mapping verification.

The tracked Frontier runtime patch now runs after Frontier has assembled the
execution block and persists `(format_version, sidechain_id, height,
execution_block_hash, bridge_event_root, burn_leaf_count)` plus the bounded
leaf hashes into native runtime state before the native block header is
finalized. It does not attempt to embed the current native block hash in that
same state transition. The checkpoint assembler must add the native consensus
block hash only after GRANDPA reports that block finalized.

The checked-in `finalized-bridge-checkpoint` assembler now exercises that
pairing against an offline observation vector. Every runtime, authority-set,
and optional read-proof lookup is scoped to one exact native block hash. The
assembler requires that hash to be canonical at its observed height, no higher
than the node's observed finalized head, and consistent with the runtime
genesis ID, height, execution hash, event root, and burn count. It also parses
the ordered GRANDPA authority list as canonical SCALE before producing the V1
checkpoint and `0x0401` candidate. A supplied runtime proof must target exactly
`Twox128("BridgeCommitment") || Twox128("CurrentCommitment")`, whose frozen key
is `af86fef4216ac2bcd1c592b204011ad00d2d4fb825af1fcd4c2be9f955a780c5`.
Its accompanying storage value must be the exact 109-byte SCALE encoding of the
runtime fields used to build the checkpoint; a second arbitrary key or a value
that differs from those fields is rejected.

Those legacy assembler checks remain node-observed candidate assembly, not
finality verification. Its justification remains opaque input and its boundary
continues to mark every cryptographic statement false.

The pinned native `bridge-finality-proof` crate verifies exact GRANDPA finality
and zero-delay scheduled authority handoffs. Because compact warp proofs omit
intervening headers, the bridge additionally requires every contiguous header
from a reviewed checkpoint. Every header parent and number is checked, every
signed fragment must occur on that chain, omitted scheduled changes and all
forced changes fail closed, and the chain must end on the signed fragment.

The sibling `bridge-state-proof` crate binds a versioned public trust-anchor
digest to the sidechain ID, checkpoint hash and height, initial set ID, and
authority list. The approved digest is a separate verifier input; it is not a
self-asserted field inside the proof-serving JSON. Linked handoff ancestry plus
the checkpoint tail form one chain from that anchor through the requested block
to the signed finality horizon. The requested header must occur exactly on the
chain, and the suffix after it must equal the finality proof's
`unknown_headers` byte-for-byte. A handoff strictly below the horizon is applied
before finality; a zero-delay handoff at the horizon is verified by the outgoing
set and applied only afterward. The verifier then checks a bounded single-key
Substrate trie proof against the requested block's `state_root`. It decodes the V1
commitment and checks sidechain ID, height, independent execution identity, and
the `1..256` burn bound.

`bridge-checkpoint-verifier` exposes this composition as a strict offline JSON
CLI requiring `--trusted-anchor-digest`. The checked-in fixture co-locates its
test-only digest solely for deterministic conformance; deployment tooling must
source that digest from separately reviewed configuration.

`relayer/src/native-finalized-bridge-checkpoint.ts` runs the CLI without a
shell, requires the exact verifier binary and argv to match reviewed SHA-256
pins, rehashes the executable before and after the process, validates and
freezes every result field, and builds the V1 checkpoint
and `0x0401` candidate from the extracted canonical GRANDPA justification
rather than from the outer `grandpa_proveFinality` envelope. The reproducible
real-crypto vector is
`relayer/test-vectors/native-finalized-bridge-checkpoint-v2.json`.

The same adapter now derives the canonical 356-byte
`BridgeFinalityStatementV1`. The statement embeds the exact 216-byte checkpoint
and recomputed checkpoint commitment, then binds the independently supplied
trust-anchor digest, verified finality-horizon height and hash, and a fixed
semantic program ID. `AggregateFinalityProofV1` carries that statement plus the
exact bounded native-verifier request under a verifier-executable SHA-256
profile. The complete envelope receives a separate domain-separated digest
that is carried through settlement candidate and recheck identity. See
[Bridge Finality Proof V1](bridge-finality-proof-v1.md). This is a
portable proof-package interface and off-chain verification artifact. It is not
an Ergo-side proof acceptance result.

`relayer/src/native-checkpoint-proof-collector.ts` now constructs the same
request from exact read-only RPC responses. The separate
`bridge-rpc-proof-codec` binary canonically encodes JSON headers and inspects
the outer warp/finality envelopes without making a cryptographic claim. The
collector obtains the target finality horizon first, selects only handoffs
strictly before it, and reconstructs the remaining canonical checkpoint tail.
It discards a full attempt on canonical hash, ancestry, terminal, or
finality-horizon drift. The codec binary and each exact mode invocation are
SHA-256 pinned and still report `cryptographicallyVerified = false`; the
existing verifier remains the only
path to a result marked
`NATIVE_CHECKPOINT_VERIFIED_RELATIVE_TO_REVIEWED_TRUST_ROOT`. The generated
real-crypto vector places the requested target before a later authority
rotation and includes exact synthetic RPC responses, so collection and
verification share one cross-language regression.
Operational inputs and boundaries are documented in
[Native Checkpoint Proof Collection](native-checkpoint-proof-collection.md).

This verifies sidechain finality for the supplied reviewed trust anchor. It does
not authenticate that candidate under Ergo extension prefix `0x04`, prove
ErgoScript acceptance, settle a burn, or close Gate 5.

Finality rule IDs are versioned protocol identifiers. Another sidechain or a
future PoW/STARK finality rule must receive a new reviewed identifier or format
version; it must not reinterpret ID `0x01`.

## Compatibility

The prior local patched-miner path placed only the raw 32-byte event root under
`0x0401`. That is a legacy development encoding. V1 consumers require exactly
64 bytes and reject the 32-byte form, preventing silent downgrade to an anchor
that does not bind checkpoint identity and finality inputs.

The fixed-width checkpoint and the canonical finality statement are the
intended STARK public-input surface. A future EIP-0045 aggregate proof can prove
canonical EVM burn extraction, burn-root construction, and sidechain finality
while preserving this root, checkpoint identity, trust anchor, and finality
horizon. Proof-system ID `2` is reserved for that path and rejected today; it
cannot be enabled by configuration or interpreted as native evidence. Until an
activated proof or equivalent Ergo-verifiable finality path exists, these
formats do not make settlement trustless.

## Golden Vector

The canonical format vector is
`relayer/test-vectors/bridge-checkpoint-commitment-v1.json`; the native finalized
checkpoint vector is
`relayer/test-vectors/native-finalized-bridge-checkpoint-v2.json`; and the
canonical finality statement/envelope vector is
`relayer/test-vectors/bridge-finality-proof-v1.json`. The
TypeScript reference implementation and tests are:

- `relayer/src/profiles/substrate-grandpa-v1/bridge-checkpoint-commitment.ts`
- `relayer/src/bridge-checkpoint-commitment.test.ts`
- `relayer/src/profiles/substrate-grandpa-v1/bridge-finality-proof.ts`
- `relayer/src/bridge-finality-proof.test.ts`
- `relayer/src/native-finalized-bridge-checkpoint.ts`
- `relayer/src/native-finalized-bridge-checkpoint.test.ts`
- `relayer/src/native-checkpoint-proof-collector.ts`
- `relayer/src/native-checkpoint-proof-collector.test.ts`
- `relayer/src/native-substrate-rpc-proof-codec.ts`
- `relayer/src/native-substrate-rpc-proof-codec.test.ts`

The prior top-level checkpoint and finality module paths remain compatibility
re-exports of the concrete profile implementation.

The format vector contains three burns to exercise odd-width tree handling and
synthetic finality inputs. The native finalized-checkpoint vector contains real
deterministic GRANDPA signatures, one scheduled authority handoff after the
requested burn-bearing target, a descendant finality horizon signed by the
incoming set, a real trie proof, and matching synthetic read-only RPC responses.
Its runtime commitment now uses the exact sidechain ID, execution block,
three-leaf root, and burn count reconstructed from the Frontier receipt vector
at `relayer/test-vectors/frontier-bridge-event-root-v1.json`.

`relayer/src/native-frontier-checkpoint-join.ts` checks that shared identity,
constructs one target burn inclusion proof, and exposes the exact 216-byte
checkpoint commitment and 64-byte `0x0401` candidate. A generic auto-pinned
executable can produce only a non-admissible conformance candidate. The
source-bound join requires the verifier binaries to be rebuilt between two exact
validations of the canonical locked Frontier source checkout. The local build
uses a new empty Cargo target plus exact platform Cargo, rustc, and Git identities
from `sources/native-verifier-toolchain-lock.json`, then binds the checkpoint to
that process-local capability.

This proves only pinned local conformance under an exclusive same-user host
assumption. Inherited build helpers and the mutable Cargo registry/Git caches are
not content-attested, complete build-tool closure is not established, and no
independent build attestation exists. The result is therefore explicitly
admission-ineligible and is not a hermetic, reproducible, remote, or independent
build attestation.

This join is not yet consumed by the authenticated V2 provisioning or confirmed
stage-rebuild builders. Those raw preview paths remain non-executable and must
be migrated before native provenance can be claimed at tracker admission. Even
after an independently attested build profile and that migration exist, tracker
R9 remains a finality authority until a distinct attestor or direct Ergo proof is
enforced.
