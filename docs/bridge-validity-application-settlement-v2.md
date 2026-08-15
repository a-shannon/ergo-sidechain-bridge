# Application-Bound Validity Settlement V2

## Status And Scope

Application-Bound Validity Settlement V2 is the WP-06AE preactivation payout
consumer for the exact `SPVTrackerValidityApplicationV2` value family produced
by WP-06AD.

It is a new settlement family. It does not reinterpret
`ValiditySettlementV1`, does not activate EIP-0045, and does not establish
target-node acceptance, signing authority, funds authority, Gate 5 closure, or
production readiness.

The protected transaction joins these facts as one conjunction:

1. the exact application-bound tracker proposition authenticates one 370-byte
   V2 value;
2. that value binds the selected Ergo anchor, source checkpoint, burn root,
   application identity, settlement profile, causal profile, guest program and
   verifier profile;
3. a canonical 205-byte burn leaf is included in that root at one exact leaf
   index and leaf count;
4. the proved recipient, amount and native ERG asset match the payout;
5. the same burn ID was absent from the DUP tree and is inserted atomically;
6. the causal vault conserves all remaining ERG under the same proposition;
7. the separate fee input funds only the exact bounded miner-fee output.

The application payload and STARK receipt are checked when the tracker entry is
admitted. They are not retransmitted through the payout input. Settlement
instead pins the exact tracker proposition and the authenticated payload
digest, application-binding digest, program ID and verifier profile carried by
its V2 value.

## Versioned Identities

The locally pinned SigmaState draft compiler emits:

| Role | Proposition bytes | Contract ID |
|---|---:|---|
| `MainChainCausalVaultValidityApplicationV2` | 3,562 | `a77327ce3bd279b725ea4dddbbbd78046ab744f3cb75ccf46d5147046fe77064` |
| `DoubleUnlockPreventionValidityApplicationV2` | 701 | `58d1e5b169a86e7906d4d87fe2a4214bd5327ff4053370c6a0fbe3b8e79939b9` |

The two proposition sources and the application vector are LF-pinned in
`.gitattributes`. Contract identities therefore remain byte-reproducible on
Windows checkouts, while vector provenance is compared through its explicit
normalized-LF SHA-256.

The consumer also pins:

- tracker contract ID
  `adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b`;
- tracker NFT `a1` repeated for 32 bytes;
- distinct duplicate-prevention NFT `a2` repeated for 32 bytes;
- approved trust-root digest
  `bb6a14b2c4a73c39dae8de6c2214c330858120232806c77110263b395e493abe`;
- application-binding digest
  `5feb8c9311afef7c729ef2df0c0648f87689b10f9e0b9f48637c15024f6b587a`;
- guest program ID
  `230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c`;
- verifier profile ID
  `23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383`;
- settlement profile `55` repeated for 32 bytes;
- causal profile
  `a0a5ba76f51548dfa7148b623cedcbb6205ce1f51428a508480ece5df66e73f5`.

Changing any of these identities requires a new reviewed profile. It must not
be represented as the same V2 settlement family.

`settlementProfileIdHex` is the application-level on-chain selector carried by
the tracker value, source intent and DUP register. The separately derived
`profileDescriptorDigestHex` commits to the complete 421-byte local descriptor,
including proposition, trust-root and NFT identities. It is configuration
integrity metadata, not a replacement on-chain profile selector or funds
authority.

## Application-Bound Frontier Vector

The settlement path uses
`relayer/test-vectors/frontier-bridge-event-root-application-v2.json`, not the
historical V1 compatibility vector. The two vectors have different sidechain
identities and must not be cross-wired.

The application vector freezes:

- schema `e2s.frontier-bridge-event-root-application.vector.v2`;
- sidechain ID and execution-block hash `22` repeated for 32 bytes;
- three canonical burns at event indexes `1`, `3`, and `5`;
- bridge event root
  `d5f26f1ddc319a969c8c3aea47fedd7d8e615c0746fdae84ac9984202aefe3b7`;
- normalized-LF SHA-256
  `15059f17a6c81b16ac4861431fe375fcb1f3bfe8ecdd3cbcac92e4b60ee1edc4`.

The Rust application fixture binds the execution-block hash, root, and burn
count into both the checkpoint and authenticated state commitment. Isolated
mutations of any of those three fields change the public statement. The frozen
WP-06AD compatibility fixture retains its original bytes.

The JSON vector proves deterministic receipt extraction only. The real local
RISC Zero receipt proves the synthetic application statement built from those
fields. Neither artifact is evidence of a deployed Frontier block, mined Ergo
anchor, activated verifier, or funds authority.

## Tracker Value Consumption

The only accepted tracker value has exactly 370 bytes:

| Offset | Bytes | Meaning |
|---:|---:|---|
| 0 | 38 | `E2S_SPV_VALIDITY_APPLICATION_VALUE_V2` plus NUL |
| 38 | 4 | version `2`, Blake2b-256 `1`, source-finality profile `1`, flags `0` |
| 42 | 32 | `bridgeEventRoot` |
| 74 | 32 | checkpoint commitment |
| 106 | 32 | selected Ergo anchor header ID |
| 138 | 4 | selected Ergo anchor height, unsigned big-endian |
| 142 | 32 | source consensus block hash |
| 174 | 4 | burn leaf count, unsigned big-endian |
| 178 | 32 | application-binding digest |
| 210 | 32 | settlement profile ID |
| 242 | 32 | causal profile ID |
| 274 | 32 | complete application-payload digest |
| 306 | 32 | guest program ID |
| 338 | 32 | verifier profile ID |

The key is:

```text
Blake2b256(
  "E2S_SPV_VALIDITY_APPLICATION_KEY_V2"
  || sidechainID
  || sidechainHeightU64BE
  || executionBlockHash
)
```

The proposition rejects the 264-byte V1 value family, V1 AVL proofs, the old
tracker proposition and every value with another domain or discriminator
before payout.

Ten Ergo confirmations constrain the age of the selected Ergo anchor. They do
not independently prove source-chain finality. Source finality is inherited
only from the application proof accepted by the exact tracker proposition.

## Burn And Replay Proof Bundle

Vault ContextExtension variables are:

| Variable | Type | Meaning |
|---|---|---|
| `0` | `Coll[Byte]` | exact V2 tracker key |
| `1` | `Coll[Byte]` | V2 tracker AVL membership proof |
| `2` | `Coll[Byte]` | canonical 205-byte burn leaf V1 |
| `3` | `Coll[Byte]` | Application Settlement Bundle V2 |

Variable `3` has this layout:

| Offset | Bytes | Meaning |
|---:|---:|---|
| 0 | 46 | `E2S_VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2` plus NUL |
| 46 | 4 | version `2`, hash `1`, proof family `1`, flags `0` |
| 50 | 8 | source sidechain height, unsigned big-endian |
| 58 | 8 | burn leaf index, unsigned big-endian |
| 66 | 8 | burn leaf count, unsigned big-endian |
| 74 | 8 | Merkle path node count, unsigned big-endian |
| 82 | 8 | DUP non-membership proof length, unsigned big-endian |
| 90 | `33*n` | Merkle path nodes: side byte plus 32-byte sibling |
| variable | variable | DUP non-membership proof |
| variable | remaining | DUP insertion proof |

`eventIndex` and `leafIndex` are separate domains. `eventIndex` identifies the
canonical EVM log used to derive the burn ID. `leafIndex` identifies the burn
inside the burn-only Merkle tree.

The consumer requires:

- `leafCount` to equal the tracker value's authenticated burn count;
- `0 <= leafIndex < leafCount <= 256`;
- path depth to equal `ceil(log2(leafCount))`;
- every direction byte to match the index at that level;
- an unpaired right sibling to be the current hash, matching canonical odd-leaf
  duplication;
- the resulting root to equal the tracker value's `bridgeEventRoot`;
- the DUP lookup length to be positive and strictly smaller than the proof bytes
  remaining after the Merkle path, before any conversion to a JVM/ErgoScript
  `Int`, leaving a non-empty insertion proof.

## Complete Transaction Conjunction

The required shape is:

| Position | Role | Required authority |
|---|---|---|
| data input `0` | application-bound tracker singleton | exact NFT, proposition, sidechain, trust-root digest and V2 AVL entry |
| input `0` | Application Settlement V2 DUP singleton | exact NFT/profile and append-only burn-ID insertion |
| input `1` | Application Settlement V2 causal vault | exact source intent, consumed source-box ID and vault proposition |
| input `2` | fee funding | token-free ERG box with value equal to the miner fee |
| output `0` | DUP successor | same proposition/NFT/value/profile, counter + 1, exact new AVL digest |
| output `1` | payout | exact recipient ErgoTree, proved amount, no token |
| output `2` | optional vault successor | exact remaining ERG and unchanged source registers |
| last output | miner fee | standard fee proposition and 1,000,000 to 2,100,000 nanoERG |

The terminal branch has no vault successor and requires an exact spend. The
partial branch requires a successor of at least 1,000,000 nanoERG. Dust,
overpayment, token substitution, value creation and value loss reject.
The DUP counter must remain in `0 <= counter < Long.MaxValue`; a wrapped
successor rejects in both the transaction builder and the JVM predicate.

The source intent must match the application-bound source network, sidechain,
bridge address, token address, settlement profile and causal profile. Its asset
ID is the all-zero native ERG ID and its amount is a raw nanoERG quantity.

## Producer-To-Consumer Matrix

| Producer | Exact bytes or fields | Consumer | Deciding authority | Failure if relaxed |
|---|---|---|---|---|
| WP-06AD application proof and tracker admission | Exact application payload, application-binding digest, checkpoint, anchor tuple, program/profile and 370-byte value | V2 tracker AVL state | Exact application tracker proposition | A caller could replace proof validity with a local boolean or payload summary |
| Tracker AVL state | V2 key, 370-byte value, digest and membership proof | settlement vault | Tracker data input plus vault predicate | A V1, fabricated or cross-profile checkpoint could authorize payout |
| Frontier burn extraction | Canonical 205-byte burn leaf, burn-only leaf index/count and Merkle path | settlement planner and vault | Root authenticated by the V2 tracker | Another log, recipient, amount, asset or block could be substituted |
| Causal vault admission | 229-byte source intent and consumed source-box ID | settlement vault | Exact non-refundable vault proposition | A refundable or unrelated deposit could fund payout |
| DUP history | burn ID, input digest, lookup proof, insert proof and successor digest | both protected spending predicates | Append-only DUP singleton transition | One burn could be paid twice |
| Offline transaction planner | Exact input/output order, registers, extensions and values | JVM predicate evaluation | Both protected ErgoTrees over one transaction | Individually valid facts could be assembled into different transactions |
| Pinned JVM compiler/evaluator | template, resolved source and proposition identities plus positive/negative reductions | review evidence | Exact local SigmaState draft | Source drift or an unavailable runtime could be mistaken for node acceptance |

## Acceptance Matrix

The local matrix must include:

- partial payout;
- terminal payout;
- exact V2 tracker value and membership;
- exact application/profile/program/verifier bindings;
- canonical single-leaf and multi-leaf inclusion;
- integrated JVM acceptance of the three-leaf source-bound transaction and an
  isolated single-leaf settlement-predicate branch built from a recomputed
  synthetic tracker AVL state;
- odd-leaf duplication;
- atomic DUP insertion;
- exact payout, vault conservation and fee output.

One-fault negatives must include:

- every V1 tracker value/key/tree/proposition path;
- each V2 domain, discriminator and pinned identity field;
- wrong checkpoint, anchor, source block, burn count or payload digest;
- stale and future anchors;
- leaf index/count/depth/direction/sibling changes;
- event-index and burn-ID changes;
- recipient, amount and asset changes;
- prior DUP membership and invalid lookup/insert proofs;
- a DUP lookup length above signed `Int` range or consuming the insertion proof;
- wrong DUP successor, profile, NFT or proposition binding;
- wrong source network, sidechain, bridge/token address, profile or asset;
- refundable or malformed vault state;
- wrong input, data-input or output order;
- underfunded, overfunded, token-bearing or nonstandard fee output;
- missing, reordered or mistyped required ContextExtension values;
- an exact-shape serializer guard that excludes extra ContextExtension values
  before JVM evaluation.

ErgoScript can request required ContextExtension variables but cannot enumerate
all supplied keys. Extra-key exclusion is therefore a transaction-construction
invariant, not an on-chain predicate claim.

The single-leaf JVM case isolates the settlement predicate's zero-depth Merkle
branch. It does not regenerate a one-leaf application payload, RISC Zero
receipt, or WP-06AD tracker-admission transaction and is not complete
single-leaf producer-to-consumer evidence. The integrated application proof and
tracker-admission fixture in this milestone remains the exact three-burn vector.

## Reproduction

Generate a distinct real candidate into a new empty directory:

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
  --env BRIDGE_EIP0045_APPLICATION_SETTLEMENT_EXPORT_DIR=/proof-output `
  --workdir /workspace/validity-proof/zkvm `
  bridge-validity-eip0045-risc0-v3:local `
  cargo test -p bridge-validity-zkvm-host --features local-prove --locked `
    --test application_execution_v2 `
    proves_and_exports_the_frontier_bound_application_settlement_candidate `
    -- --ignored --nocapture
```

The exporter writes eight binary files create-only and
`candidate-manifest-v2.txt` last. Build the exact tracker context:

```powershell
npm run proof:validity-application-tracker:fixture -- `
  --candidate-dir <absolute-candidate-dir> `
  --out <absolute-new-tracker-context.json> `
  --trusted-anchor-digest <reviewed-32-byte-lowercase-hex>
```

Generate a fresh contract-identity receipt with
`BridgeValidityApplicationSettlementContractSpec`, then assemble the complete
unsigned fixture:

```powershell
npm run proof:validity-application-settlement:fixture -- `
  --tracker-context <absolute-tracker-context.json> `
  --contract-identity <absolute-contract-identity.json> `
  --frontier-vector <absolute-application-vector.json> `
  --out <absolute-new-settlement-context.json>
```

Finally run
`BridgeValidityApplicationSettlementAcceptanceSpec` in the same pinned
SigmaState checkout. Its JVM result, not a boolean in the JSON fixture, is the
local deciding reduction authority. All outputs remain transient conformance
artifacts and no command signs or broadcasts.

## Remaining External Blockers

This local consumer does not by itself complete Gate 5. The remaining authority
boundary includes:

1. activated target-node support for the exact proof-system and proposition
   identities;
2. stateful target-node acceptance of the complete protected transaction;
3. deterministic singleton and vault genesis/lineage evidence;
4. measured rent reserve and monitored successor refresh/retirement policy;
5. restart/reorg reconciliation against chain-visible tracker and DUP state;
6. independent security review of the complete producer-to-consumer path.

No signer, submitter, broadcaster or live-funds route belongs in this
preactivation milestone.
