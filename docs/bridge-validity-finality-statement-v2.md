# Bridge Validity Finality Statement V2

This document freezes the preactivation application payload that a future
validity proof must expose to Ergo. It is a new statement family. It does not
reinterpret `BridgeFinalityStatementV1`, activate aggregate proof-system ID
`2`, or make the existing tracker trustless.

The outer envelope follows `ErgoStatementV1` from the EIP-0045 draft at commit
`f32d4980053d110e6f2b7edf3b93288e75159706`. EIP-0045 and its first verifier
profile remain unactivated. The profile and guest `programId` are therefore
required inputs to the reference codec rather than built-in accepted values.

## Application Payload

`BridgeValidityFinalityPayloadV2` is exactly 654 bytes. Bridge integers remain
unsigned big-endian; this does not change the little-endian payload-length rule
of the outer EIP statement.

| Offset | Bytes | Field | Required value or meaning |
|---:|---:|---|---|
| 0 | 39 | domain | ASCII `E2S_BRIDGE_VALIDITY_FINALITY_PAYLOAD_V2` |
| 39 | 1 | domain terminator | `0x00` |
| 40 | 1 | version | `2` |
| 41 | 1 | hash algorithm | `1` = Blake2b-256 |
| 42 | 1 | source profile | `1` = Substrate/GRANDPA V1 compatibility semantics |
| 43 | 1 | flags | `0` |
| 44 | 32 | tracker NFT ID | exact singleton that owns checkpoint admission |
| 76 | 216 | checkpoint | canonical `BridgeCheckpointV1` bytes |
| 292 | 32 | checkpoint commitment | recomputed V1 checkpoint commitment |
| 324 | 32 | compatibility statement digest | exact domain-separated `BridgeFinalityStatementV1` digest |
| 356 | 32 | compatibility semantic program ID | exact V1 semantic program identity |
| 388 | 32 | compatibility verifier profile ID | exact pinned native verifier identity |
| 420 | 32 | compatibility payload digest | domain-separated digest stored by the V1 tracker |
| 452 | 32 | compatibility aggregate proof digest | digest of the complete canonical V1 proof |
| 484 | 32 | native verifier request digest | raw Blake2b-256 of the complete canonical private witness request |
| 516 | 32 | trusted anchor digest | reviewed GRANDPA trust-anchor identity |
| 548 | 8 | finality horizon height | `u64be` |
| 556 | 32 | finality horizon hash | finalized native consensus block hash |
| 588 | 2 | Ergo extension key | `0x0401` |
| 590 | 64 | Ergo extension value | `bridgeEventRoot || checkpointCommitment` |
| 654 | 0 | EOF | trailing bytes are invalid |

The codec decodes the complete canonical `AggregateFinalityProofV1`,
recomputes its checkpoint commitment, derives the `0x0401` value, and binds
every proof-identity field already persisted by the V1 tracker. The native
request is the V1 proof payload, remains bounded to 32 MiB, and uses checked
length arithmetic for a 32-bit guest. Its additional raw digest preserves the
existing verifier-request identity. The compatibility statement must carry the
fixed V1 semantic program ID derived from
`E2S_GRANDPA_STATE_AND_FINALITY_PROGRAM_V1`; changing both copies does not
create a new valid profile. The V2 source profile also retains the authenticated
tracker's `1..=256` burn-count bound even though the lower-level V1 checkpoint
codec can represent larger nonzero `u32` values. These are explicit
compatibility bindings only. They are not interpreted as validity proof
acceptance.

The tracker NFT prevents a proof prepared for another bridge instance from
being reused merely because both instances share an ErgoTree. Replay state and
the exact tracker successor remain separate contract obligations; the STARK
opcode does not infer either one.

## EIP-0045 Envelope

The outer statement is:

```text
ASCII("Ergo.VerifyStark.Statement") ||
0x01 ||
chainDomainId[32] ||
profileId[32] ||
programId[32] ||
BLAKE2b-256(SELF.propositionBytes)[32] ||
u32le(applicationPayload.length) ||
applicationPayload
```

Its fixed prefix is 159 bytes, making the current bridge vector 813 bytes in
total. `chainDomainId`, `profileId`, `programId`, and the exact contract bytes
are all mandatory caller inputs. The matching helper recomputes the complete
statement and rejects any changed field. The statement codec has no default
that can select an unactivated profile or guest. The separate preactivation
proof-envelope profile below pins one explicit profile/program pair for
transport conformance only; that pin is not activation authority.

## Preactivation Proof Envelope And Consumer ABI

`Eip0045BridgeValidityProofEnvelopeV1` is a strict, funds-neutral transport
object. It does not introduce another proof wire format. Its only opcode-facing
payload is the exact four-child EIP-0045 ABI, in this order:

```text
proofChunks: [Coll[Byte], Coll[Byte], Coll[Byte], Coll[Byte]]
applicationPayload: Coll[Byte]
programId: Coll[Byte]
profileId: Coll[Byte]
```

The profile is fixed to
`23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383`,
the guest program to
`5b46bf0ef2ff959327bfb39c6ac4dae48d509a0fcf91f89dcf84b26f44203934`,
and the chunk lengths to `65,535 / 65,535 / 65,535 / 26,063` bytes. The
concatenated raw seal is therefore exactly 222,668 bytes. The structured
envelope also records the reconstructed statement, statement digest, contract
ID, chain domain, raw-seal byte count, and raw-seal digest. Those fields are
transport evidence, not additional opcode children.

The chain domain and exact contract proposition bytes are external consumer
context. The parser requires both, reconstructs the complete 813-byte
statement, and matches an externally supplied raw-seal digest. It rejects
unknown fields, another schema/version, non-canonical hex, any chunk count or
length drift, another profile/program, another chain/contract/payload, and
derived-field or trust-boundary claims. Buffers and lowercase unprefixed hex
normalize to the same deeply frozen object. Contract proposition bytes are
bounded to 65,535 bytes by this transport profile before copying or hashing;
this is a local input bound, not an Ergo consensus-limit claim.

The `*Hex` fields are a JSON-safe transport projection. They are not executable
Sigma values. The next consumer fixture must decode them into the exact
`Coll[Byte]` children and prove their order and lengths at the expression
boundary.

A same-size seal mutation can remain structurally well formed. The transport
layer records its different digest but cannot determine whether the proof is
cryptographically valid. Only the exact RISC Zero/SigmaState verifier can make
that decision. The object therefore keeps proof validity, source finality,
profile activation, on-chain acceptance, and funds authority explicitly
false. It intentionally has no `proofSystemId`; reserved aggregate
proof-system ID `2` remains a separate fail-closed dispatcher concern.

## Portable State-Proof Core

`validity-proof/state` verifies the raw nodes returned by
`state_getReadProof`; it does not consume the distinct compact-proof format.
The private codec and layout reproduce the pinned Substrate V1 profile:
Blake2b-256, no extension nodes, empty tries allowed, and values of 33 bytes or
more stored as external value nodes. Production dependencies contain no
`sp-*` runtime or host crate.

The bridge profile accepts at most 256 nodes, 64 KiB per node, and 256 KiB in
aggregate. It rejects duplicate raw nodes before inserting them into a
hash-keyed `MemoryDB`, requires the declared root to be present, and reads only
the exact `BridgeCommitment::CurrentCommitment` storage key. Distinct extra
nodes remain accepted within the bounds because the pinned SDK oracle accepts
a proof superset; bounded, distinct nodes unreachable from the selected root
cannot change the lookup result.

The selected value must be exactly 109 SCALE bytes:

```text
version:u8 ||
sidechainId[32] ||
sidechainHeight:u64le ||
executionBlockHash[32] ||
bridgeEventRoot[32] ||
burnLeafCount:u32le
```

Version must be `1` and `burnLeafCount` must be in `1..=256`. Every field is
then compared with the expected checkpoint semantics. The existing native
checkpoint vector and sixteen generated V1 trie shapes are checked against
the pinned `sp_state_machine::read_proof_check` oracle. SDK crates remain
test-only. `trie-db 0.29.2` is pinned to the compatible patch that removes the
known Rust never-type fallback warning. The exact native fixture now also builds
and executes against RISC Zero source commit
`8eb06ab020a92dc5b63ba6dd0836d432aba6d890`, the exact source selected by the
EIP-0045 profile candidate, in the digest-pinned Linux environment documented
by `validity-proof/zkvm/README.md`.

## Guest Implementation

The preactivation guest independently implements and tests all of these steps:

1. Strictly decode the complete bounded private witness and reject trailing
   bytes.
2. Match its raw and V1 domain-separated digests to
   `nativeVerifierRequestDigest` and `compatibilityPayloadDigest`.
3. Reconstruct the complete compatibility proof identity and match its
   statement, semantic program, verifier profile, payload, and aggregate proof
   digests, then match the checkpoint, trust anchor, finality horizon, and
   extension commitment fields carried by V2.
4. Verify every GRANDPA authority transition from the reviewed anchor, the
   target justification, exact ancestry, and unused-header rejection.
5. Invoke the portable bounded state-proof core with the state root extracted
   from that exact finalized header, then match all five authenticated runtime
   commitment fields to the checkpoint.
6. Commit exactly the complete EIP-0045 statement bytes supplied by the host
   ABI, with no prefix, suffix, or alternate encoding.

Direct Ed25519 verification and deterministic trie hashing must be usable in
the guest without Substrate client, networking, database, host syscall, or
`sp_io` authority. The guest's actual RISC Zero image ID becomes `programId`;
a semantic domain hash is not a substitute.

## Ergo Consumer Obligation

An activated Ergo consumer must reconstruct or constrain every payload field
from authenticated transaction and tracker state, invoke the exact activated
profile and program, and then enforce the tracker singleton, successor, payout,
and replay predicates. A valid proof cannot by itself authorize mint, payout,
signature, submission, or broadcast.

The consumer must reject at least: another chain domain, profile, program,
contract, tracker NFT, checkpoint, root, source block, request, trust anchor,
horizon, extension key/value, payout binding, replay identity, stale anchor,
and reorged source history. Proof acceptance and the full transaction's VM
acceptance remain separate evidence levels.

## Preactivation Invariant Matrix

| Invariant | Producer / enforcement | Future consumer | Failure if relaxed | Current isolated evidence |
|---|---|---|---|---|
| Exact V2 payload bytes and source profile | TypeScript and Rust codecs | validity guest and Ergo consumer | Another tracker, source profile, or checkpoint could inherit the same proof meaning | golden-byte parity; discriminator, tracker, checkpoint, and extension mutations reject |
| Complete V1 compatibility identity | V1 decoder plus Rust compatibility validator | validity guest | A coordinated proof/statement rewrite could silently redefine the tracker-authorized semantics | fixed semantic program ID; paired program substitution and every digest/profile mutation reject |
| Bounded native request | V1 decoder, Rust compatibility validator, and guest input frame | validity guest | A different witness or 32-bit length overflow could be accepted or exhaust the guest | raw and domain-separated digests; 32 MiB cap; checked total length; exact 9,057-byte native witness executes in the guest |
| Canonical Frontier header and hash | sealed Rust compatibility types | GRANDPA and state-proof composition | Finality could authenticate bytes different from the state-root-bearing header | exact SCALE and Blake2b-256 differential tests against pinned Substrate |
| Canonical signed GRANDPA payload | Rust finality core | checkpoint finality verifier | Signatures could authorize another round, set, target, or encoding | justification/message/warp-proof byte parity and target/set mutations |
| Substrate ZIP-215 Ed25519 semantics | `ed25519-zebra` in the Rust core | GRANDPA justification verifier | A source-finalized checkpoint could become unprovable, or verifier semantics could drift | canonical, tampered, small-order, noncanonical-point, and noncanonical-scalar differential cases |
| Frontier authority profile | Rust finality and transition verifiers | finality horizon derivation | Duplicate, zero-weight, oversized, overflowing, forced, or delayed handoffs could change the deciding set | direct and transition negatives plus contiguous ancestry binding |
| Finalized runtime commitment | Portable raw V1 state-proof core plus exact 109-byte decoder | validity guest and checkpoint composition | An unauthenticated or differently encoded burn root could be attached to a finalized header | existing native vector plus 16 generated trie shapes match the pinned SDK; wrong root/key/value, missing external value, malformed node, duplicate and every field mutation reject |
| Tracker-compatible checkpoint | V2 codecs, portable state-proof core, and composed guest witness | tracker successor and Ergo consumer | An unsupported burn batch or unrelated root could reach settlement | `1..=256` burns, state value, checkpoint commitment, exact `0x0401` value, and complete guest composition are enforced separately |
| Exact EIP-0045 statement | TypeScript/Rust statement codecs plus RISC Zero journal | Ergo `verifyStark` consumer | A proof could be replayed across a chain, profile, program, or contract | exact offsets, `u32le` payload length, strict EOF, contract-ID mutations, exact 813-byte journal equality, and generated image-ID binding |
| Real succinct-proof integrity | RISC Zero 3.0.5 source-pinned guest and host | EIP-0045 raw-seal verifier and future Ergo consumer | A fake execution, another image/profile, composite receipt, or altered journal could inherit validity | non-dev Poseidon2 succinct receipt verifies under the exact method/profile; real-proof mutations reject wrong image, altered journal, coordinated journal/expectation rewrite, and altered seal; isolated Rust profile tests reject non-succinct, hash-suite, program, profile, terminal, outer-exponent, and size mutations |
| Direct JVM raw-seal interoperability | exact four bridge-produced proof chunks plus 813-byte statement | SigmaState draft `f78deadd668f801e7fae3bc884283f79c6f484fa` | Producer-only receipt success could hide a transport, claim, byte-order, or verifier mismatch | authenticated profile loader and public claim builder feed the exact raw seal to `Risc0RawSealVerifier`; seal, partition, program, chain domain, contract, payload, and profile mutations reject |
| Strict preactivation consumer ABI | TypeScript envelope builder, strict structured parser and manifest-bound real-candidate integration | pinned funds-neutral SigmaState input-script fixture | A fifth child, wrapper receipt, partial candidate, reordered/substituted transport or caller-selected profile could drift from the proof the verifier consumes | exact four-child order, fixed profile/program, fixed chunk sizes, external chain/contract/raw-seal identity, create-last candidate manifest, immutable output and isolated transport/context negatives |
| Exact executable consumer identity | pinned SigmaState v4 serializer plus independent TypeScript/Rust Blake2b-256 checks | parsed `SELF` used by JVM input verification | A proof could be bound to a synthetic contract ID or a tree different from the one executed | exact 85-byte segregated proposition, contract ID `9d0ac3c2c7889ef4bfa53c31903f5e11012f20b24156cbcf82b3435d95a290fc`, byte-exact deserialize/reserialize and AST comparison |
| Preactivation input-script acceptance | real statement/chunks ingested through WP-06W and exact parsed consumer tree | future activated whole transaction | Direct verifier success or an interpreter exception could be mistaken for executable acceptance | funds-neutral input script succeeds; proof, chunk order/length, payload, program, chain, `SELF`, profile, context and tree-version negatives reject without collapsing errors into `false` |
| Validity-authenticated tracker transition | Exact 1,784-byte `SPVTrackerValidityV1` proposition, real contract-bound receipt, explicit approved GRANDPA trust-anchor digest, four-variable WASM fixture, canonical synthetic headers, and JVM full input verification | future validity-settlement data input | Proof validity could be detached from the approved trust root, Ergo `0x0401` anchor, singleton, AVL entry, or exact successor | complete proof + trust root + anchor + tracker transition accepts; proof, unapproved or drifting trust root, membership, source, selector, height, tree, counter, stamp, proposition, NFT, token cardinality/value, and unavailable-profile mutations reject |
| Activation remains external | existing proof dispatcher and separately versioned tracker/settlement profiles | funds-authorizing transaction | Local receipt or input-script success could be mistaken for an activated verifier | proof-system ID `2` remains rejected; exact four-variable serialization and local JVM tracker acceptance are established, while target-runtime/node acceptance, mined header evidence, settlement composition, and funds authority remain open |

## Current Evidence Boundary

The TypeScript/Rust codecs, synthetic golden vector, portable proof cores, and
bounded composition establish canonical encoding, strict lengths, redundant
checkpoint/extension binding, and isolated binding negatives independently of
Substrate host dependencies. The exact RISC Zero 3.0.5 profile source now
executes that complete native witness and produces a real non-dev succinct
receipt. The host checks the generated image ID, exact profile ID, exact
813-byte journal, `programId`, Poseidon2 suite, terminal `join`, outer
`po2 = 18`, 222,668-byte raw seal, and canonical four-chunk partition. The
public SigmaState JVM verifier at the pinned draft commit accepts those same
raw chunks under the reconstructed claim and rejects the isolated identity and
transport mutations listed above.

The TypeScript preactivation envelope freezes the exact four-child ABI and
reconstructs the same statement from external chain and contract context. Its
small deterministic tests retain synthetic proof chunks for transport
cardinality, lengths, ordering, canonical hex, expected raw-seal identity,
immutability and every explicit non-authority field. A separate transient
integration test consumes the complete real Rust candidate only after its
create-last manifest validates every filename, length and Blake2b-256 digest.

The executable consumer is the exact 85-byte version-4 constant-segregated
proposition recorded in
`relayer/test-vectors/bridge-validity-eip0045-consumer-contract-v1.json`.
Its contract ID is
`9d0ac3c2c7889ef4bfa53c31903f5e11012f20b24156cbcf82b3435d95a290fc`.
The real native statement digest is
`e8aa9bc3671f75779cec78c91194ff33c56e7035a4100c6ee9ee644db564dd8c`;
the smaller envelope unit fixture has a different digest because it retains
the synthetic application payload. The pinned JVM deserializes the frozen
consumer bytes, reserializes them exactly, checks the AST, then accepts the
real proof through ordinary input-script verification in a funds-neutral
transaction. Cryptographic mutations reduce cleanly to `false`; unexpected
interpreter errors do not count as rejection evidence.

WP-06AA adds the separately versioned `SPVTrackerValidityV1` consumer. Its
exact 1,784-byte proposition has contract ID
`c22f8d631e99022bd4bad5ce84ee9d7da30bf51684977c8bad28d8200f8cff5b`.
A fresh real receipt targets that ID rather than the 85-byte funds-neutral
consumer. The bridge producer carries the receipt through the exact
four-variable EIP-12 extension and complete proofless transaction, while the
pinned JVM independently decodes ten parent-linked canonical synthetic
headers, uses the tip state root and extending preheader, and accepts the full
tracker input. The positive path jointly enforces `verifyStark`, the exact
approved GRANDPA trust-anchor digest in payload and R9, exact `0x0401`
membership, checkpoint/sidechain bindings, singleton identity, AVL insert, and
complete successor state. Single-fault proof, trust-root, extension, source,
selector, monotonicity, successor-register, proposition, NFT, token
cardinality/value, and profile-lifecycle cases reject.

This remains preactivation interoperability and local VM evidence. Exact
two-variable and four-variable WASM/JVM `ContextExtension` serialization and
proofless transaction identity are now established for their frozen shapes;
they are not a general map-serialization result. The work does not activate
EIP-0045 or proof-system ID `2`, close EIP-0045 B4-B8, establish mined-header
or target-node acceptance, compose a payout/DUP consumer, authorize mint or
payout, or close Gate 5.

The frozen vector is
`relayer/test-vectors/bridge-validity-finality-statement-v2.json`. It records
synthetic identifiers and explicit false readiness fields so it cannot be
mistaken for an activated profile or live proof. The separate consumer vector
freezes only the executable proposition identity and keeps every activation,
funds, Gate 5, trustless and readiness field false.
