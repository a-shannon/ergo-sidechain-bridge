# Aggregate Finality Commitment V1

`AggregateFinalityCommitmentV1` is the fixed-width identity carried into
authenticated tracker admission. It binds an R9 authorization to one canonical
finality statement and one complete aggregate proof without placing the
variable native GRANDPA payload in Ergo ContextExtension or AVL state.

This format proves identity, not proof validity. The current tracker validates
the statement structure, checkpoint commitment, semantic program ID, and
statement digest, then requires R9. It does not verify the payload digest from
payload bytes, recompute the full proof digest, or execute GRANDPA semantics.
Gate 5 therefore remains open.

## Encoding

The commitment is exactly 496 bytes. Bytes `0..463` are the exact fixed prefix
of a canonically decoded `AggregateFinalityProofV1`. Bytes `464..495` contain
the domain-separated digest of that complete proof.

| Offset | Bytes | Field | V1 rule |
|---:|---:|---|---|
| 0 | 1 | version | `1` |
| 1 | 1 | proof system ID | `1` = native GRANDPA package |
| 2 | 1 | hash algorithm ID | `1` = Blake2b-256 |
| 3 | 1 | flags | `0` |
| 4 | 4 | statement length | `u32be(356)` |
| 8 | 4 | payload length | positive `u32be`, bounded by the native request limit |
| 12 | 32 | verifier profile ID | exact pinned native verifier identity |
| 44 | 32 | statement digest | digest of the embedded statement |
| 76 | 32 | payload digest | digest declared by the fully decoded source proof |
| 108 | 356 | finality statement | canonical `BridgeFinalityStatementV1` |
| 464 | 32 | proof digest | digest of the complete source proof, including payload |

The optional commitment digest used by off-chain packages is:

```text
commitment_digest = Blake2b256(
  ASCII("E2S_AGGREGATE_FINALITY_COMMITMENT_V1") || commitment[496]
)
```

Builders accept only a complete `AggregateFinalityProofV1` that has already
passed canonical decoding, including payload length and payload digest checks.
A decoder receiving only the fixed commitment can validate the statement and
its digest, but cannot independently validate the absent payload or recompute
the complete proof digest.

Proof-system ID `2` remains reserved and is rejected. Activating a STARK proof
requires a separately versioned format and an activated Ergo verifier.

## Tracker Value

Authenticated tracker V2 values are exactly 264 bytes:

| Offset | Bytes | Field |
|---:|---:|---|
| 0 | 32 | bridge event root |
| 32 | 32 | checkpoint commitment |
| 64 | 32 | Ergo anchor header ID |
| 96 | 4 | Ergo anchor height, `u32be` |
| 100 | 4 | proof system ID, `u32be(1)` |
| 104 | 32 | finality statement digest |
| 136 | 32 | finality semantic program ID |
| 168 | 32 | verifier profile ID |
| 200 | 32 | proof payload digest |
| 232 | 32 | aggregate proof digest |

The tracker input script requires every proof-identity field to equal the
corresponding commitment field. It recomputes the checkpoint commitment and
statement digest and requires the fixed
`E2S_GRANDPA_STATE_AND_FINALITY_PROGRAM_V1` program ID. Settlement reads the
same 264-byte value from the authenticated AVL tree.

## Trust Boundary

The resulting status is `proof-bound-attestor-authorized-finality`:

- the exact `0x0401` checkpoint is authenticated to an Ergo header;
- the exact finality statement and proof identities are persisted on Ergo;
- native admission must reproduce those identities from a provenance-checked
  off-chain verifier result;
- R9 still authorizes admission and remains a fund-security authority;
- Ergo does not yet verify the GRANDPA/native payload or a STARK proof;
- no trustless, Gate 5, deployment, or production-readiness claim follows.
