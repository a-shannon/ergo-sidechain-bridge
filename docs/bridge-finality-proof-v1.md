# Bridge Finality Proof V1

This document freezes the byte formats for `BridgeFinalityStatementV1`,
`AggregateFinalityProofV1`, and its fixed on-chain identity commitment. The native envelope carries pinned off-chain
GRANDPA and state-finality evidence. It does not prove Ergo on-chain
acceptance, Gate 5 closure, trustlessness, or production readiness.

All integers are unsigned big-endian. All hashes and identifiers occupy their
raw 32-byte form in the wire encoding. Text hex accepted by the reference
codec is lowercase, even-length, and has no `0x` prefix.

## BridgeFinalityStatementV1

The statement is exactly 356 bytes:

| Offset | Bytes | Field | V1 value |
|---:|---:|---|---|
| 0 | 1 | version | `1` |
| 1 | 1 | hash algorithm ID | `1` = Blake2b-256 |
| 2 | 1 | finality rule ID | `1` = GRANDPA state finality |
| 3 | 1 | flags | `0` |
| 4 | 216 | encoded checkpoint | exact canonical `BridgeCheckpointV1` bytes |
| 220 | 32 | checkpoint commitment | recomputed from the encoded checkpoint |
| 252 | 32 | trusted anchor digest | reviewed public trust-anchor digest |
| 284 | 8 | finality horizon height | `u64be` |
| 292 | 32 | finality horizon hash | native consensus block hash |
| 324 | 32 | program ID | fixed derivation below |

The program and statement identifiers are:

```text
program_id = Blake2b256(
  ASCII("E2S_GRANDPA_STATE_AND_FINALITY_PROGRAM_V1")
)

statement_digest = Blake2b256(
  ASCII("E2S_BRIDGE_FINALITY_STATEMENT_V1") || statement[356]
)
```

The program ID identifies the reviewed statement semantics. It is not a digest
of a verifier executable, STARK circuit, verifying key, or activated runtime
opcode. Those implementation identities belong to the proof-system profile.

The encoded checkpoint is decoded with the existing
`bridge-checkpoint-commitment` V1 codec. The decoder therefore rejects any
unsupported checkpoint version, hash algorithm, finality rule, flags, or
noncanonical checkpoint length. It then recomputes:

```text
checkpoint_commitment = Blake2b256(
  ASCII("E2S_BRIDGE_CHECKPOINT_V1") || encoded_checkpoint[216]
)
```

The supplied commitment must equal that recomputed value. A statement cannot
substitute a different checkpoint or commitment while retaining validity.

## AggregateFinalityProofV1

The aggregate proof has a fixed 464-byte prefix followed by the native payload:

| Offset | Bytes | Field | V1 value |
|---:|---:|---|---|
| 0 | 1 | version | `1` |
| 1 | 1 | proof system ID | `1` = native GRANDPA package |
| 2 | 1 | hash algorithm ID | `1` = Blake2b-256 |
| 3 | 1 | flags | `0` |
| 4 | 4 | statement length | `u32be(356)` |
| 8 | 4 | payload length | `u32be`, at most `MAX_NATIVE_VERIFIER_REQUEST_BYTES` |
| 12 | 32 | verifier profile ID | SHA-256 digest of the exact pinned native verifier executable |
| 44 | 32 | statement digest | domain-separated digest above |
| 76 | 32 | payload digest | domain-separated digest below |
| 108 | 356 | statement | exact `BridgeFinalityStatementV1` bytes |
| 464 | variable | payload | exact native GRANDPA/state-proof package bytes |

The native payload digest is:

```text
payload_digest = Blake2b256(
  ASCII("E2S_NATIVE_GRANDPA_PROOF_PAYLOAD_V1") || payload[payload_length]
)

proof_digest = Blake2b256(
  ASCII("E2S_AGGREGATE_FINALITY_PROOF_V1") || complete_encoded_proof
)
```

The proof digest is not embedded in its own envelope. The native settlement
source derives it after canonical encoding. `AggregateFinalityCommitmentV1`
then combines the fixed 464-byte prefix with this digest, allowing tracker
admission to bind the exact statement and proof identity without storing the
variable native payload. Its complete layout and trust boundary are specified
in `bridge-finality-commitment-v1.md`.

Proof-system ID `2` is reserved for a future activated STARK format. V1
builders and decoders reject it. Activation requires a separately reviewed
format and verifier path; ID `2` cannot be interpreted as native evidence or
accepted speculatively.

The native payload is bounded by the existing relayer constant
`MAX_NATIVE_VERIFIER_REQUEST_BYTES` (32 MiB at the time this format was
frozen). The fixed statement length, bounded payload length, and exact total
envelope length prevent truncation, extension, and trailing-byte ambiguity.

## Canonical Validation

The reference codec rejects:

- unknown versions, proof systems, hash IDs, finality rules, or nonzero flags;
- reserved proof-system ID `2`;
- malformed, prefixed, uppercase, odd-length, or incorrectly sized text hex;
- noncanonical decimal integers, negative values, unsafe JavaScript numbers,
  and values outside `u64`;
- statement lengths other than 356 bytes;
- payload lengths above the native verifier request bound or inconsistent with
  the exact envelope size;
- checkpoint commitment, statement digest, payload digest, or program ID
  mismatch;
- truncated values, trailing bytes, and any nested invalid checkpoint.

Build and decode results contain lowercase hex and canonical decimal strings.
Fixed-width buffers and hex strings are size-checked before copying or decoding,
and decimal `u64` strings are length-bounded before scanning or parsing. The
returned object graph is frozen, and accepted byte inputs are copied before use.
The codec reads no environment, filesystem, network, signing, wallet, runtime,
or deployment state.

## Closeout Matrix

| Invariant | Producer / enforcement | Downstream consumer | Failure if relaxed | Isolated negative / status |
|---|---|---|---|---|
| Statement version, hash, rule, and flags are exact | Statement builder/decoder | Every native or future aggregate verifier | Another format or finality rule could be interpreted as V1 | One mutation per discriminator rejects; focused green |
| Checkpoint bytes and commitment correspond exactly | Checkpoint codec plus commitment recomputation | `0x0401`, settlement admission, finality program | A proof for one checkpoint could authorize another root or chain identity | Checkpoint-byte and commitment-only mutations reject; focused green |
| Trust anchor is part of the statement | Native verifier result plus statement codec | Candidate ID and future finality verifier | A valid proof could be replayed under another reviewed trust root | Anchor-only mutation changes statement digest; native request/statement mismatch rejects; focused green |
| Finality horizon height and hash are independent fields | Native GRANDPA verifier plus statement codec | Candidate revalidation and future finality verifier | Anchor age or another finalized block could substitute for the verified horizon | Height-only and hash-only mutations change statement digest; focused green |
| Semantic program ID is fixed | Domain-derived program ID plus decoder equality | Proof-system dispatcher | The same bytes could be reinterpreted under different verifier semantics | Program-ID-only mutation rejects; focused green |
| Statement digest is domain separated | Statement digest helper plus envelope decoder | Candidate ID, JVM-check journal, future proof verifier | A statement could be replaced without invalidating its outer reference | Digest-only mutation rejects; persisted identity conflicts reject; focused green |
| Native verifier profile is explicit | Provenance-branded executable SHA-256 | Native proof dispatcher, candidate identity, and reviewer | Proof bytes could silently move to another verifier binary | Profile-only mutation changes the envelope; source adapter derives rather than accepts it; focused green |
| Native payload bytes, digest, and length agree | Exact normalized verifier request plus envelope codec | Native GRANDPA/state verifier | Truncation, extension, or another proof request could inherit the statement | Payload, digest, declared length, truncation, and trailing-byte mutations reject; focused green |
| Reserved STARK mode cannot activate implicitly | Proof discriminator validator | Future Ergo/STARK adapter | Unimplemented proof bytes could be accepted as if verified | Mode `2` rejects in builder and decoder; focused green |
| Tracker admission records the exact proof identity | Fixed finality commitment, tracker contract, and 264-byte AVL value | Native admission, candidate derivation, revalidation wrapper, and journal | An R9-authorized checkpoint could later be paired with a different statement, verifier profile, payload, or envelope | Commitment/checkpoint mismatch and independent tracker identity-field mutations reject; focused and VM checks required |
| Candidate-ID schema is explicit across upgrades | Versioned candidate preimage plus journal migration | Restart/recheck and active-candidate conflict indexes | A pre-upgrade `prepared` row could fail revalidation forever while blocking its replacement | Pre-versioned active rows are invalidated before selection; prepared-row migration regression green |

The tracker input script now consumes the fixed commitment, validates the
statement and checkpoint binding, and persists the proof identity. It still
does not consume the variable payload or verify GRANDPA semantics. R9 therefore
authorizes the exact proof identity rather than proving it. The decisive
cryptographic consumer remains open, so the readiness claim stays `local_only`
and Gate 5 remains open.

## WP-06S Closeout Record

The reviewed change set is bound to tracker source SHA-256
`bd74c503fc615df49664fd8b9d9c76095b17d32c63be0b9903f6343f93c71558`
and pinned compiled tracker-tree SHA-256
`233f8a82afb0ee2b3e722a58d893b03e07d83ef571aa67779cb722f900406e3a`.
A fresh isolated review on 2026-07-13 found no critical or high implementation
defect. It identified one medium documentation issue: historical sigma-rust
results were still described as current-tree acceptance. Those claims were
removed, the VM rerun remains explicit, and legacy 100-byte history plus
version-1 candidate migrations gained isolated fail-closed regressions.

| Dimension | Status |
|---|---|
| Implementation | `matrix_covered` |
| Independent review | `complete` |
| CI | `not_run` |
| Target runtime | `not_run` for the current 264-byte sigma-rust transaction matrix |
| Readiness claim | `local_only` |

Local evidence includes focused codec/consumer tests, TypeScript compilation,
Rust/WASM tests, the full bounded Windows check, and exact pinned JVM source-to-
tree compilation. These dimensions do not substitute for CI or current-tree VM
execution and do not close Gate 5.

## Ergo Tracker Boundary

The Ergo extension format remains unchanged:

```text
0x0401 value = bridge_event_root[32] || checkpoint_commitment[32]
```

The bridge event root remains available for burn inclusion checks, while the
checkpoint commitment binds the complete 216-byte checkpoint. Tracker admission
receives the 496-byte fixed finality commitment in ContextExtension Var(0) and
stores a 264-byte AVL value containing the event root, checkpoint and Ergo
anchor identities, proof-system ID, statement digest, semantic program ID,
verifier profile ID, payload digest, and aggregate proof digest. Native GRANDPA
payload bytes, Substrate state-proof bytes, and authority-transition material
remain off-chain evidence until an activated Ergo-verifiable proof path checks
their semantics.

## Golden Vector

`relayer/test-vectors/bridge-finality-proof-v1.json` contains all domains,
input fields, encoded statement bytes, program ID, statement digest, payload
bytes, payload digest, verifier profile ID, and complete aggregate proof bytes
needed for cross-language reproduction. The fixed finality commitment is
derived deterministically from this vector. It reuses the deterministic public
checkpoint from `bridge-checkpoint-commitment-v1.json`, uses a synthetic
verifier-profile preimage, and contains no signing or deployment material.
