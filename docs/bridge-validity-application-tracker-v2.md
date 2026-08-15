# Bridge Validity Application Tracker V2

## Status

This document freezes one **local preactivation conformance profile** for an
application-bound validity tracker. It does not activate EIP-0045, identify a
production source chain, authorize deployed funds, close Gate 5, or establish
mainnet readiness.

The profile proves a narrower claim: one real RISC Zero succinct receipt can be
transported through the exact four-variable ContextExtension, checked by the
pinned SigmaState JVM implementation, bound to one selected Ergo header's ID,
height, and extension root, and reduced together with one exact 370-byte AVL
tracker insertion and successor.

## Frozen Identity

| Item | Value |
| --- | --- |
| Contract source | `contracts/SPVTrackerValidityApplicationV2.es` |
| Contract source SHA-256 | `58ca1aa1558adcef5e5997c34df8cdd699effd2f00f8a5ccac5982cbd290f96f` |
| SigmaState source | `f78deadd668f801e7fae3bc884283f79c6f484fa` |
| Proposition version | `4` |
| Proposition bytes | `2,424` |
| Proposition SHA-256 | `992f8431d12630c76d9f8414c6f9984ac0bcaf76bee991fddcea4fefa766fb0d` |
| Contract ID | `adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b` |
| Guest program ID | `230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c` |
| Verifier profile ID | `23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383` |
| Terminal control ID | `7a8f24092c34ed3eb81b3d0a0b796c588c615d3488ef9e61c21dbd1e4b83ea6e` |

Changing any source byte, compiled proposition byte, statement identity,
program, profile, or contract ID creates a different profile. V1 is not
reinterpreted.

## Pinned Application Profile

The contract contains one explicit synthetic profile:

| Field | Conformance value |
| --- | --- |
| Source network ID | `0x11` repeated 32 bytes |
| Sidechain ID | `0x22` repeated 32 bytes |
| Bridge address | `0x33` repeated 20 bytes |
| Token address | `0x44` repeated 20 bytes |
| Settlement profile ID | `0x55` repeated 32 bytes |
| Causal profile ID | `a0a5ba76f51548dfa7148b623cedcbb6205ce1f51428a508480ece5df66e73f5` |
| Bridge runtime code SHA-256 | `0xbb` repeated 32 bytes |
| Bridge runtime code size | `4,096` bytes |
| Token runtime code SHA-256 | `0xcc` repeated 32 bytes |
| Token runtime code size | `2,048` bytes |

These values are test identities, not deployment defaults. A real source
application needs a new reviewed profile, proposition, contract ID, proof
statement, and acceptance packet.

## Consumer ABI

The contract requires variables `0` through `3`:

| Variable | Sigma type | Exact role |
| --- | --- | --- |
| `Var(0)` | `Coll[Coll[Byte]]` | Four proof chunks of `65,535 / 65,535 / 65,535 / 26,063` bytes |
| `Var(1)` | `Coll[Byte]` | Exact 973-byte application payload V3 |
| `Var(2)` | `Coll[Byte]` | `u64BE(extensionProofLength) || extensionProof || AVL insert proof` |
| `Var(3)` | `Int` | Index of the selected object in `CONTEXT.headers` |

The canonical transport builder permits exactly these four variables. The
ErgoScript API cannot enumerate and reject unrelated extra variables, so
exact-four is a transport policy rather than a separate on-chain invariant.
Extra variables do not replace or relax any required variable.

The real conformance fixture measured:

| Item | Bytes / identity |
| --- | --- |
| Encoded statement | `1,132` bytes |
| Application payload | `973` bytes |
| Raw succinct seal | `222,668` bytes |
| Serialized ContextExtension | `224,178` bytes |
| ContextExtension Blake2b-256 | `3b610ce8276eb4be623add280dc6e9da9da6b3d2439d832ef3743efdc32c5e48` |
| Proofless transaction | `226,795` bytes |
| Proofless transaction ID | `72353d8aaaa61625ec5e9080019775650d0d736d1bb7710d95bf11173225de81` |

The fixture includes two lower-key decoy extension leaves. The selected
`0x0401` proof therefore exercises both a canonical empty branch and a sibling
branch.

## Admission Transition

The complete predicate requires all of the following:

1. The 973-byte payload has the exact V3 and embedded finality V2
   discriminators.
2. The embedded tracker NFT equals the singleton carried by `SELF`.
3. The checkpoint sidechain and trust-anchor digest equal lineage-preserved R6
   and R9.
4. The checkpoint commitment, `0x0401` value, application binding, and
   application-binding digest recompute exactly.
5. The selected `CONTEXT.headers(Var(3))` object supplies the ID, height, and
   extension root used by both membership and the tracker value.
6. The extension membership proof is canonical and verifies under that exact
   header extension root.
7. The V2 key and exact 370-byte V2 value insert into the R5 AVL tree.
8. The successor preserves the proposition, singleton NFT, sidechain, and
   trust anchor; increments R4; advances R7; installs the exact R5 successor;
   advances R8 without requiring `R8 == HEIGHT`; constrains the real box
   creation height to be nondecreasing, nonfuture, and within 100 blocks of
   `HEIGHT`; and does not reduce value.
9. `verifyStark` accepts the proof chunks, payload, program, and profile.

The local planner and candidate loader validate structure, provenance, and
caller-supplied expectations. They are not proof or funds authorities.

## Reproduction

Generate a real candidate into a new empty directory:

```powershell
$bridgeRoot = (Resolve-Path <bridge-root>).Path
$candidateDir = (Resolve-Path <new-empty-candidate-dir>).Path

docker run --rm `
  --mount "type=bind,source=$bridgeRoot,target=/workspace,readonly" `
  --mount "type=bind,source=$candidateDir,target=/proof-output" `
  --mount "type=volume,source=bridge-validity-zkvm-target,target=/target" `
  --mount "type=volume,source=bridge-validity-cargo-registry,target=/root/.cargo/registry" `
  --mount "type=volume,source=bridge-validity-cargo-git,target=/root/.cargo/git" `
  --env CARGO_TARGET_DIR=/target `
  --env RISC0_PROVER=local `
  --env BRIDGE_EIP0045_APPLICATION_CONSUMER_CONTRACT_ID_HEX=adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b `
  --env BRIDGE_EIP0045_APPLICATION_EXPORT_DIR=/proof-output `
  --workdir /workspace/validity-proof/zkvm `
  bridge-validity-eip0045-risc0-v3:local `
  cargo test -p bridge-validity-zkvm-host --features local-prove --locked `
    --test application_execution_v2 -- --ignored --nocapture
```

Build the non-broadcast JVM fixture. The trust-anchor digest must come from an
independent reviewed authority and must match the completed candidate:

```powershell
npm run proof:validity-application-tracker:fixture -- `
  --candidate-dir <absolute-candidate-dir> `
  --out <absolute-new-fixture.json> `
  --trusted-anchor-digest <reviewed-32-byte-lowercase-hex>
```

The candidate exporter writes all binary files create-only and writes
`candidate-manifest-v2.txt` last. The loader rejects missing, reordered,
renamed, symlinked, length-mismatched, or digest-mismatched files.

Generate the coordinated rejection candidate in a different new directory:

```powershell
$rejectionDir = (Resolve-Path <new-empty-rejection-candidate-dir>).Path

docker run --rm `
  --mount "type=bind,source=$bridgeRoot,target=/workspace,readonly" `
  --mount "type=bind,source=$rejectionDir,target=/proof-output" `
  --mount "type=volume,source=bridge-validity-zkvm-target,target=/target" `
  --mount "type=volume,source=bridge-validity-cargo-registry,target=/root/.cargo/registry" `
  --mount "type=volume,source=bridge-validity-cargo-git,target=/root/.cargo/git" `
  --env CARGO_TARGET_DIR=/target `
  --env RISC0_PROVER=local `
  --env BRIDGE_EIP0045_APPLICATION_CONSUMER_CONTRACT_ID_HEX=adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b `
  --env BRIDGE_EIP0045_APPLICATION_BINDING_REJECTION_EXPORT_DIR=/proof-output `
  --workdir /workspace/validity-proof/zkvm `
  bridge-validity-eip0045-risc0-v3:local `
  cargo test -p bridge-validity-zkvm-host --features local-prove --locked `
    --test application_execution_v2 `
    proves_valid_alternate_bridge_runtime_profile_for_contract_rejection `
    -- --ignored --nocapture
```

That candidate changes only the first bridge-runtime SHA-256 byte from `0xbb`
to `0xba`, recomputes every authenticated downstream identity, and writes the
distinct `application-binding-rejection-manifest-v2.txt` last. Build its
non-broadcast JVM fixture with:

```powershell
npm run proof:validity-application-tracker:binding-rejection-fixture -- `
  --candidate-dir <absolute-rejection-candidate-dir> `
  --out <absolute-new-rejection-fixture.json> `
  --trusted-anchor-digest <reviewed-32-byte-lowercase-hex>
```

The pinned proof runtime accepts this alternate receipt. The frozen tracker
proposition then rejects it on the application binding. Both candidates and
fixtures are transient conformance inputs, not release evidence or authority.

## Closeout Matrix

| Invariant | Producer / enforcement | Downstream consumer | Failure if relaxed | Positive and isolated negative evidence | Authority / status |
| --- | --- | --- | --- | --- | --- |
| Proposition identity | Pinned SigmaState compiler spec and TypeScript SHA/ID check | Statement builder, candidate loader, JVM evaluator | A proof could be replayed under a different script identity | Exact source/proposition/contract checks | Local conformance |
| Statement and proof identity | RISC Zero host, create-last manifest, strict V2 envelope | Context builder and JVM profile runtime | A proof, program, profile, statement, or contract substitution could enter the tracker | Real proof positive; wrong image, journal, contract, seal, file, and digest negatives | Proof verified locally |
| Application profile | Guest composition plus exact contract binding | Tracker value and future V2 settlement consumer | A proof for another bridge, token, runtime, or settlement profile could be admitted | A second real proof with one authenticated bridge-runtime hash byte changed verifies under the pinned runtime, then the frozen proposition rejects it | Local strict isolation |
| One-header tuple | `CONTEXT.headers(Var(3))` | Extension membership and tracker value | Caller-selected ID, height, and root could refer to different headers | Positive selected header; index, ID, height, and root mismatch negatives | JVM-local |
| `0x0401` membership | Extension producer and ErgoScript canonical proof reducer | Tracker admission | An unanchored event root could enter settlement state | Real sibling/empty proof; length, sibling, side, and padding negatives | JVM-local |
| V2 key and value | TypeScript planner, WASM AVL, ErgoScript recomputation | R5 state and future V2 settlement consumer | Schema confusion or unbound fields could authorize another event | Independent JVM decode; key/value/digest matrices; V1 proof substitution; populated-tree duplicate-key rejection | JVM-local |
| Tracker singleton | Setup lineage and exact input/output token checks | Every later tracker transition | A parallel or duplicated tracker lineage could be accepted | Wrong ID, amount, extra-token, and successor-token negatives | Canonical deployment lineage not established |
| Sidechain and trust root | R6/R9 lineage plus exact payload equality | Finality admission and successor | Local configuration or SQLite state could replace settlement authority | Independent SELF and successor R6/R9 negatives | Values are synthetic |
| Successor state | ErgoScript exact R4-R9, proposition, token, value, and creation-height checks | Next tracker transition | Replay state, rollback, materially aged continuation, or script substitution could persist | Per-register, proposition, value, token, application-stamp, and isolated nondecreasing/nonfuture/bounded-lag creation-height negatives | JVM-local |
| ContextExtension shape | Guard, strict envelope, WASM round trip, JVM parser | Signer/checker boundary | Missing or retyped proof inputs could be interpreted inconsistently | Each missing and wrong-typed variable fails closed | No signing performed |
| Proof capability lifecycle | Pinned active JVM capability | `verifyStark` | Local reduction could be confused with target-node activation | Active positive and unavailable-capability rejection | Target node not verified |

## Evidence Vector

| Dimension | Status |
| --- | --- |
| Implementation | `matrix_covered` for the complete local strict preactivation matrix |
| Independent review | `complete` for the exact local diff |
| CI | `not_run` for this local slice |
| Target runtime | `not_run` on an activated target node |
| Readiness claim | `local_only` |

## Known Blockers

- EIP-0045 and the exact verifier profile are not activated on a target node.
- The 226,795-byte proofless transaction requires an explicitly reviewed target
  transaction-ingress policy.
- The selected header is context-sensitive. A tip change can move the anchor to
  another index, so a future signer path must rebuild and recheck immediately
  before signing. No node-wallet or serialization workaround is approved.
- The synthetic tracker NFT and trust anchor do not establish canonical
  deployment lineage.
- Successor freshness does not protect an inactive, underfunded singleton after
  the storage-rent period. Canonical setup must measure the serialized tracker
  box, fund a reviewed rent reserve, and define monitored refresh/retirement
  behavior before activation.
- A V2 settlement consumer must reject every V1 entry before any payout path is
  connected.
- No signer, submitter, broadcast authorization, transaction submission, or
  live-funds route exists in this profile.
