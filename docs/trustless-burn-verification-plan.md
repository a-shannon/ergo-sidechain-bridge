# Trustless Burn Verification Plan

This plan defines the production-grade target for proving sidechain burns to
Ergo. This plan states that it is not implemented yet and it is not an audit
report. This is not a production-ready claim.

Implementation order and active status are maintained in the
[Bridge Execution Plan](../phases/bridge-execution-plan.md). This document owns
the Gate 5 proof requirements, not day-to-day work selection.

The current aggregate settlement path is a transitional PoC path: relayer or
committee logic interprets sidechain burns, persists an anchor, and submits
Ergo settlement with DUP replay protection. That is useful engineering
evidence, but it is not a cryptographic L1 proof of burn inclusion.

Substrate/Frontier is the EVM-compatible execution layer and commitment
producer. It can expose Solidity contracts and successful burn events, but the
final trust layer must be an Ergo-verifiable commitment and proof path. Raw
Frontier/EVM receipt proofs are not the preferred final design because
RLP/Merkle-Patricia/Keccak verification is not ErgoScript-friendly. The
preferred direction is a versioned bridge-native `bridge_event_root` or
`burn_root`, using Blake2b-friendly encodings today and preserving a future
EIP-0045/STARK aggregate proof path.

## Goal

Replace trusted burn interpretation with a proof path where an Ergo settlement
transaction can verify that:

1. A sidechain block commitment was embedded into an Ergo extension section.
2. The committed sidechain block is part of the accepted sidechain header chain.
3. The bridge burn event is included in the committed sidechain block data.
4. The burn event maps to the exact recipient, amount, sidechain ID, and burn
   ID used by the Ergo payout and DUP update.
5. The DUP transition proves the burn ID was not settled before.

## P0 Safety Preconditions

Gate 5 work does not excuse known fail-open behavior in the transitional bridge.
Two P0 boundaries must be contained before this plan can advance:

1. **WP-01 source implementation:** MCL v3 consumes the refundable source into
   the canonical V2 vault before mint, preserving full value and `R4`-`R7`
   provenance. The relayer requires a canonical committed transaction/block,
   exact vault output, source absence, and unspent vault before mint; legacy
   refundable boxes are never auto-minted. Deployment activation and live
   evidence for this implementation remain open. Commit txIds, incidents, and
   bounded reconciliation progress are persisted before they become restart
   dependencies. A commit loss from `minting` onward is an incident because an
   uncertain EVM submission may still finalize.
2. **WP-02 source implementation:** the old v1 MainChainUnlock ErgoTree permits
   beneficiary payout from stale SCS height or elapsed Ergo time even after
   `burn_reverted`. The active daemon, compatibility builder, and direct legacy
   scripts no longer create or spend MCUs. The replacement source requires
   transitional committee authorization and has no timeout branch. Existing v1
   boxes cannot inherit that source and remain quarantined. The replacement's
   R4 burn hash is metadata, not predicate-enforced proof, and no v2 builder is
   active until exact receipt binding is reviewed. The current
   explicit-address inventory remains diagnostic only. A separate
   non-authorizing observation tool now binds an explicit V1 address/ErgoTree
   manifest to a caller-supplied
   expected digest, coherent network/checkpoint identity, bounded checkpoint
   depth and age, two distinct synchronized-index sources, complete pagination,
   exact observation agreement, and zero UTXOs. The actual reviewed manifest,
   authenticated approval, independently operated source provenance, and real
   observations remain open. Origin agreement is not a consensus proof, and the
   tool cannot prove the human coverage claim or authorize cutover by itself.

These are P0 solvency blockers. They must be covered by contract, builder, and
daemon regression tests before live or release-candidate work resumes.

## Whole-Transaction Trust Boundary

`MainChainAggregateUnlockTrustless.es` verifies a burn leaf, inclusion path,
payout binding, and DUP key, but that file name does not make the complete
transaction trustless. The current transaction also consumes an `SPVTracker`
input and a `DoubleUnlockPreventionAggregate` input whose scripts require
committee authorization. The current tracker is therefore a registry of
committee-accepted commitments, not yet an independently authenticated SPV
relay.

The current source also constrains V2 vault value, successor/change, and
`R4`-`R7` provenance. That prevents an unrestricted liquidity spend, but does
not prove sidechain finality or remove committee authority from tracker/DUP.
It also cannot eliminate the point-in-time reorg window between final Ergo
observation and EVM inclusion; Phase 011 must supply the stronger finality proof.

The target safety property applies to the conjunction of all input scripts:

- the tracker may accept a root only from an authenticated `0x04` extension
  commitment and a verified sidechain finality rule;
- the unlock must verify inclusion and exact payout bindings against that root;
- DUP must reject replay of the same proved burn ID;
- remaining committee signatures may provide transitional liveness control,
  but they must not allow fabricated roots or payouts.

An Ergo confirmation delay after observing an anchor proves only that the anchor
is old enough on Ergo. It does not prove that the referenced sidechain block is
final.

## Current Validity-Tracker Milestone

WP-06AA now supplies a separate preactivation tracker profile rather than
weakening the committee-authenticated compatibility tracker.
`SPVTrackerValidityV1.es` has no R9 `SigmaProp` or committee predicate. Its R9
is instead the lineage-preserved 32-byte digest of the approved GRANDPA trust
anchor.
A real non-dev RISC Zero receipt is bound to the exact proposition, and the
pinned JVM accepts the complete input only when the STARK proof, 654-byte
payload, approved trust-anchor digest, `0x0401` membership, checkpoint
allowlist, tracker NFT, AVL insertion, and successor registers agree. The
four-variable EIP-12 extension and complete proofless transaction round-trip
between sigma-rust and the JVM under a ten-header canonical synthetic context.

This closes an important local on-chain-predicate gap, but not Gate 5. EIP-0045
and its required transaction ingress/schedule are not active on the target
node, the fixture headers are not mined, and no value-release transaction
currently consumes this tracker. The next profile must read the exact tracker
NFT, proposition, reviewed chain domain, sidechain ID, and approved R9
trust-anchor digest as a data input, derive the validity tracker key, verify the
burn and payout against its 264-byte value and authenticated anchor height, and
atomically advance a hash-bound DUP singleton without committee authorization.
The mutable R8 stamp is not finality evidence. Only the conjunction of that
payout profile, the tracker admission history, activation, and the remaining
reorg/restart evidence can support a trustless claim.

## Trustless Burn Proof Object

Gate 5 closes only when the proof object is accepted by the Ergo-side verifier
and bound to the settlement transaction. At minimum, the proof object must
contain or derive:

| Item | Required binding |
|---|---|
| A. Versioned burn leaf format | Stable leaf version, field order, widths, hash function, and domain separation. |
| B. Sidechain block / checkpoint identity | Sidechain ID, block height or checkpoint height, block/header hash, and event index. |
| C. `bridge_event_root` or `burn_root` | Root of the bridge-native burn commitment tree, not a raw EVM receipt root. |
| D. `0x04` Ergo extension anchor | Extension key/value proof showing the root was anchored under the reserved sidechain prefix. |
| E. Sidechain finality rule | Ergo-verifiable finality rule or accepted relay rule for the committed sidechain block/checkpoint. |
| F. Burn inclusion proof | Merkle/STARK-ready path from the leaf to the committed root. |
| G. Recipient / amount / sidechainID / burnID binding | Exact payout recipient, amount, sidechain identity, and unique burn identifier. |
| H. DUP replay binding | The same burn ID is the DUP key inserted by settlement. |
| I. Stale-anchor and reorg rejection | Proof rejects stale anchors, reverted commitments, and mismatched finality depth. |
| J. Positive and negative on-chain tests | Valid proof acceptance plus rejection of wrong recipient, amount, sidechain ID, burn ID, root, path, stale anchor, and duplicate settlement. |

Local TypeScript proof vectors are useful groundwork because they fix the leaf,
root, and negative-case semantics. They do not close Gate 5 by themselves.
Gate 5 remains open until on-chain proof acceptance, extension commitment
anchoring, sidechain finality, DUP replay binding, reorg/stale-anchor rejection,
reviewer evidence, and release-claim boundaries all pass.

## WP-05 Canonical Commitment Freeze

The canonical byte format is now specified in
[Bridge Checkpoint Commitment V1](bridge-checkpoint-commitment-v1.md). Its
extension value is exactly 64 bytes:

```text
0x0401 = bridge_event_root[32] || checkpoint_commitment[32]
```

The checkpoint commitment binds the format/hash/finality identifiers,
sidechain ID, block height, native Substrate consensus block hash, Frontier
execution block hash, burn count, event root, GRANDPA authority set ID, a
domain-separated hash of the canonical SCALE authority list, and a
domain-separated hash of the canonical justification bytes. The sidechain ID is
the raw Substrate genesis block hash. The checked golden vector is
`relayer/test-vectors/bridge-checkpoint-commitment-v1.json`.

This freeze supersedes the old 32-byte raw-root development anchor for WP-05
implementation. It does not authenticate the authority set or its transitions,
verify the GRANDPA justification, prove the execution/consensus block mapping,
authenticate an Ergo extension proof, or close Gate 5. Runtime, Rust, and
Ergo-side consumers must reproduce the vector and then implement those
acceptance rules.

## Canonical Frontier Producer Status

The reproducible Frontier patch at
`sources/frontier/0001-bridge-runtime-commitment.patch` now implements the
runtime-local producer. It runs after Frontier block/receipt assembly, accepts
only successful `PegOut(address,uint256,bytes)` logs from the configured bridge
address, enforces the canonical ABI and recipient forms, derives the fixed-width
V1 leaves in global log order, and stores the format version, execution hash,
root, burn count, and bounded leaf hashes in native runtime state. Matching malformed logs,
duplicate burn IDs, status/receipt divergence, and burn-count overflow fail
closed.

`relayer/test-vectors/frontier-bridge-event-root-v1.json` is the shared
three-leaf receipt vector. Rust and TypeScript reproduce its odd-width Merkle
root while ignoring a wrong-address decoy and a status-0 matching log. This
closes deterministic runtime-local burn-root production only. It does not prove
GRANDPA finality, authenticate the authority set or execution/consensus mapping,
anchor `0x0401` on Ergo, prove on-chain acceptance, or close Gate 5.

`relayer/src/finalized-bridge-checkpoint.ts` now assembles a V1 checkpoint
candidate from an exact-hash-scoped offline observation bundle. It rejects
non-canonical target observations, runtime/genesis or height drift, malformed
authority-list SCALE, cross-block response drift, and runtime burn counts above
the producer's 256-leaf bound. A supplied read proof must use the one frozen
`BridgeCommitment::CurrentCommitment` key and its exact 109-byte SCALE value must
match the runtime fields used by the checkpoint. The candidate carries the
native state root and bounded proof nodes, but marks the node observations, justification,
authority set, state proof, sidechain finality, Ergo anchor, and on-chain
acceptance as unverified. This is a reproducible integration input, not Gate 5
evidence of cryptographic finality.

The reproducible Frontier patch also exposes upstream
`grandpa_proveFinality`, and `bridge/finality-proof` verifies canonical SCALE,
the signed GRANDPA commit, threshold, vote ancestry, and the exact
`(requested; finalized]` header span under an expected authority set and set
ID. The same node exposes its official warp provider through read-only
`bridge_grandpaWarpProof`; the native verifier authenticates zero-delay
scheduled handoffs from an explicitly trusted set and fails closed on forced,
mixed, delayed, invalid, stale, overflowing, or unbounded transition material.
The implementation caps authority sets at the runtime's 32-authority maximum,
requires continuation height to advance strictly, and bounds the operator RPC
to one in-flight blocking proof generation. Canonical base64 carries the full
upstream 8 MiB chunk below the pinned node's default response limit.

The compact warp proof is now supplemented with contiguous headers descending
from a reviewed checkpoint hash. The native verifier checks every parent and
height, rejects fork-spliced fragments and omitted scheduled changes, applies
authenticated handoffs strictly before the signed finality horizon, and joins
their ancestry to a bounded checkpoint tail. The concatenated chain must contain
the exact requested header, and its suffix after that target must equal the
finality proof's `unknown_headers` byte-for-byte. This keeps historical burn
targets verifiable after later authority rotations. A zero-delay change exactly
at the horizon remains signed by the outgoing set and is not applied before the
finality check. A versioned trust-anchor digest supplied independently from the
proof package binds sidechain ID, checkpoint identity, set ID, and authority
list. `bridge-state-proof` then verifies the target's exact commitment key/value
against its state root.

The offline `bridge-checkpoint-verifier` CLI and TypeScript adapter exercise the
full composition against a deterministic fixture with real signatures, a real
scheduled authority handoff after the requested target, and a real trie proof.
The resulting checkpoint
hashes the extracted canonical justification, not the outer finality-proof
envelope. The fixture's co-located digest is test-only; deployment verification
requires the trust digest through a separate CLI/adapter input. The read-only
collector now reconstructs the exact request from strict RPC responses, using
a native acquisition-only codec for header SCALE and warp/finality envelope
metadata. Both native executables and their exact argv must match reviewed
SHA-256 invocation pins, with the executable rehashed before and after each
process, while the codec continues to make no cryptographic claim. The deterministic
fixture proves the complete collection-to-verifier boundary without network
access. This implements sidechain finality
verification for a supplied reviewed trust anchor. A live/devnet capture and
independent review of the actual deployment anchor remain evidence work;
authenticated Ergo `0x0401` admission transaction acceptance, burn inclusion,
payout/DUP binding, and on-chain negative rejection remain protocol work. Gate
5 is not closed.

## WP-06A Authenticated Admission Status

The first authenticated-admission source milestone is implemented without
altering the deployed/federated V1 tracker schema:

- `relayer/src/ergo-extension-membership.ts` implements the production Scorex
  extension leaf, internal-node, empty-node, ordered-tree, and canonical
  33-byte proof rules with a maximum depth of 14;
- `contracts/SPVTrackerAuthenticated.es` authenticates the frozen 64-byte
  `0x0401` value against `CONTEXT.headers`, derives the checkpoint key itself,
  and admits only an append-only AVL entry;
- `relayer/src/spv-tracker-authenticated.ts` builds the exact four-slot
  ContextExtension and successor registers without signing or broadcast; and
- the Rust/WASM AVL crate exposes a separate fixed-width V2 API for 264-byte
  values, preserving the existing 36-byte V1 API.

The V2 tracker value is:

```text
bridge_event_root[32] || checkpoint_commitment[32] ||
ergo_anchor_header_id[32] || ergo_anchor_height[4BE] ||
proof_system_id[4BE] || finality_statement_digest[32] ||
finality_program_id[32] || verifier_profile_id[32] ||
proof_payload_digest[32] || aggregate_proof_digest[32]
```

This closes neither sidechain finality nor Gate 5. It proves that the exact
checkpoint bytes were committed by an authenticated Ergo header, but ErgoScript
still does not verify the GRANDPA proof or the native verifier result. A
finality-attestor-authorized checkpoint that was genuinely placed in `0x0401`
can therefore still be false about sidechain finality. Provisioning v5 requires
tracker R9 to differ from the bridge-committee proposition retained in DUP R6,
and settlement rejects equal propositions. That is exact on-chain role
separation only: it does not prove independent custody, and R9 remains a
disclosed federated finality authority.

The current 264-byte tree passes exact three-pass pinned JVM compilation and
sigma-rust execution against both a deterministic context and the isolated
patched devnet's node-compatible context: derived `simplifiedUpcoming`
preheader `H+1` plus ten freshly mined headers `H..H-9`. One valid
admission passes and thirteen bounded fail-closed mutations reject wrong
authorities, the embedded checkpoint, each proof-identity field, header index,
extension proof, required commitment, and successor AVL drift. The mined replay
authenticates the exact 64-byte `0x0401` field required by the current tree. The
harness uses exactly four ContextExtension Vars and runs the fail-closed signer
guard before every evaluation. Some cases mutate coupled checkpoint and
identity facts, so this matrix establishes fail-closed rejection rather than
independent fault localization for every binding.

This establishes current-tree sigma-rust VM acceptance against genuinely mined
header data. The exact positive signed transaction, bytes-to-sign identity, and
input proof also pass the pinned JVM interpreter when `--jvm-conformance` is
enabled. The retained JVM report is bound to the exact fixture/context,
preheader and header identities, input roles and ErgoTrees, singleton
identities, pinned compiler identity, and consensus-source baseline. The
compiler binding is derived internally and includes a digest over the fixture,
context, fixed-point tree hashes, and compiler authority; callers cannot supply
an alternate set of trees as report authority. Node
`/transactions/check` remains a separate stateful boundary and
requires chain-resident setup/admission UTXOs. The tracker input and keys are
ephemeral in memory; no submit, deployment, or broadcast occurs.

## WP-06B Authenticated Settlement Status

The V2 payout/DUP binding is now implemented as a separate non-deployed path:

- `MainChainAggregateUnlockAuthenticated.es` verifies the V2 tracker lookup,
  versioned burn inclusion, recipient, exact amount, ERG asset lane, Ergo
  anchor depth, and the complete DUP successor tree;
- `DoubleUnlockPreventionAuthenticated.es` is bound to the exact unlock
  ErgoTree hash and independently inserts the same burn ID without a separate
  payout committee signature;
- `buildAuthenticatedSettlementPlan()` and
  `buildAuthenticatedSettlementTx()` bind the live input digests and assemble
  the two-input transaction with the tracker at `dataInputs(0)`; and
- `npm run trustless:authenticated-settlement-vm` derives the exact current
  linked trees with the pinned JVM compiler and passes a full local sigma-rust
  transaction plus sixteen coherent wrong-root, payout, replay, proof,
  ordering, anchor-depth, contract, chain, block, and asset mutations against
  both deterministic and node-compatible `H+1` / `H..H-9` contexts. The exact
  mined positive transaction also passes pinned-JVM proof and bytes-to-sign
  conformance, with DUP/unlock/tracker role and ErgoTree bindings, when
  `--jvm-conformance` is enabled. This remains
  in-memory VM acceptance rather than node stateful acceptance.

WP-06C also adds the first bounded service integration. Authenticated tracker
history is persisted separately from legacy 36-byte history and partitioned by
sidechain ID. Inserts validate the derived key and every field of the 264-byte
proof-bound value, while conflicting key or same-sidechain-height rows fail closed.
`prepareAuthenticatedSettlementUnsignedTx()` rebuilds that history, requires a
fresh burn-verifier result, matches the selected tracker and DUP state, and
returns the unsigned transaction with signing and broadcast explicitly denied.
It does not expose a submit path.

WP-06D adds restart-safe proof recollection, exact candidate reconstruction,
and an explicit non-mainnet check-only boundary. WP-06E adds a deterministic
offline staged-provisioning package for tracker setup, atomic DUP/vault setup,
tip-bound admission preview, and predicted settlement preview. Complete box
authentication, ERG/token conservation, first-input NFT minting, and exact
header-index age binding are checked before IDs are derived.

This closes neither live provisioning nor node-stateful authenticated
settlement acceptance. Setup outputs are not confirmed; admission must be
rebuilt against ten current mined headers plus their derived `H+1` preheader;
and settlement must be rebuilt
from observed boxes after anchor-depth and burn revalidation. The package
builder itself has no execution route. See
`authenticated-v2-staged-provisioning-v1.md`.

The pinned compiler, deterministic three-pass initial binding, guarded funding
observer, provenance-bound provisioning V2 path, and exact-package pre-setup
funding revalidator now pass locally. The V2
input consumes the complete funding-observation and initial-binding reports;
funding boxes and contract pins are derived rather than copied, and the package
digest covers both report digests plus the funding snapshot and initial input
digests. Revalidation shares the setup builder's funding equations and binds
the prior/fresh complete boxes and Sigma bytes to one expected package digest.
Its offline validator also requires the fresh-observation digest from a
separately retained command transcript; the report's unkeyed hashes do not
attest freshness or continued unspentness.
WP-06K now provides local source/test coverage for
`npm run settle:authenticated:setup-check`. For one exact package digest it
reruns fresh pinned source-to-ErgoTree conformance, prefetches parent-linked
`lastHeaders/10` as `CONTEXT.headers`, derives the node-compatible
`simplifiedUpcoming` preheader, performs final fresh revalidation of both exact funding inputs
on that same tip, and verifies in-memory signer control of those inputs and the
single bootstrap committee key. Both empty-`ContextExtensions` candidates are
signed before either fixed `/transactions/check` POST; package, independently
derived unsigned, signed, and node-returned IDs must match. Tracker setup and
DUP/vault setup are independent transactions; only DUP plus vault are atomic
within the second transaction.

The command itself opens signer material only from non-interactive stdin; it
opens no signer file and reads no signer material from environment,
configuration, deployment, or runtime state. Because shell-pipe provenance
cannot be detected, approved in-memory delivery and the prohibition on file
redirection remain operator-enforced. Signed bytes are valid and broadcastable
if captured but are never persisted or printed, so only a trusted loopback
non-mainnet low-value node is permitted and only a sanitized report is retained.
This is not a real node run: target-runtime execution still requires an actual
approved sanitized package, pinned source, node, funding inputs, and signer. It
performs or authorizes no setup, submit, deploy, or broadcast and proves no
threshold governance or sidechain finality on Ergo. It closes neither Gate 5
nor Phase 011 and supports no target-runtime or production-readiness claim.
Those remain the critical path.

WP-06L removes one artificial separation between proof fixtures. The native
GRANDPA/state-proof fixture now commits the exact sidechain ID, execution block,
three-leaf root, and leaf count reconstructed from the canonical Frontier
receipt vector. `checkpoint:finalized:native:verify` verifies that native
package, re-extracts the Frontier burns, constructs a target inclusion proof,
and derives the corresponding `0x0401` candidate in one run. The source-bound
join can no longer come from an arbitrary self-pinned executable: it validates
the exact canonical source lock, verifies platform Cargo/rustc/Git identities,
builds into a new empty target, revalidates the Frontier checkout, and binds the
checkpoint to the exact resulting verifier. This is pinned local conformance
under an exclusive same-user host assumption, not a build attestation: inherited
build helpers and mutable Cargo caches are not fully attested, complete tool
closure is unproven, and there is no independent build reproduction. The result
is therefore admission-ineligible.

The existing authenticated V2 provisioning and confirmed stage-rebuild builders
still accept raw checkpoint preview fields and do not consume this source-bound
join. WP-06L therefore closes the cross-language proof join only, not tracker
admission integration. An institution-supplied or independently reproduced
verifier-binary profile whose source, dependency cache, complete build-tool
closure, outputs, and reviewer are attested outside this process remains a
prerequisite for fresh admission provenance. WP-06Q now separates tracker R9
from the bridge-committee proposition and adds the committee-only
invented-checkpoint negative. That separation remains a disclosed federated
transition, not direct GRANDPA verification in ErgoScript and not Gate 5 closure.

## WP-06R Canonical Finality Statement Status

`BridgeFinalityStatementV1` now freezes the exact public statement that an
Ergo-verifiable finality path must authenticate. Its 356 bytes bind the
canonical checkpoint and commitment, reviewed trust-anchor digest, verified
finality horizon, and semantic GRANDPA state/finality program ID. The existing
`0x0401` value remains unchanged:

```text
bridge_event_root[32] || checkpoint_commitment[32]
```

`AggregateFinalityProofV1` adds a versioned proof envelope. Proof-system ID `1`
carries the exact bounded native GRANDPA/state-proof request and pins the exact
native verifier executable by SHA-256. This supports deterministic off-chain
reverification and migration without putting proof bytes in the tracker AVL.
Proof-system ID `2` is reserved for a future activated STARK verifier and is
rejected by every V1 builder and decoder today.

The native verifier adapter derives both objects only from a provenance-branded
verification result and the exact request whose digest and trust anchor match
that result. The settlement source returns the checkpoint and a
checkpoint-bound proof object; structural clones or a proof issued for another
checkpoint are rejected. Settlement admission carries the statement/program,
proof-system, verifier-profile, payload-digest, and full-envelope identities
through candidate revalidation and the check journal. This closes the canonical proof-package
interface, not the Ergo trust boundary: no current ErgoScript input verifies
the native package, an activated STARK proof, or an equivalent finality proof.
R9 therefore remains a disclosed federated finality authority and Gate 5 stays
open.

## WP-06T1 Source-To-Tracker Conformance Status

`npm run trustless:wp06-source-to-tracker-vm` now exercises one retained local
identity chain rather than separate native, receipt, anchor, and tracker
fixtures. It performs these steps without chain RPC access or runtime-state
access. Cargo may fetch missing locked build dependencies; that dependency-fetch
and build-attestation boundary remains explicit.

1. validate and build the exact patched Frontier source with the locked Cargo,
   rustc, and Git identities;
2. replay the checked-in synthetic read-only Substrate RPC fixture through the
   native GRANDPA and runtime-state verifier;
3. require exact equality with the checked-in request and verified result;
4. extract the canonical three-burn set from the Frontier receipt vector and
   bind its third public burn (event index 5), whose recipient bytes parse as
   an executable ErgoTree, to the verified checkpoint;
5. derive the canonical aggregate-finality commitment and exact `0x0401`
   extension membership; and
6. execute the current tracker tree in sigma-rust with generated in-memory keys
   over the JVM-canonical T1 header window, run the thirteen fail-closed tracker
   mutations, replay the positive transaction in the pinned JVM over the
   wallet's exact signed bytes, and retain the admitted signed successor in an
   immutable source-specific handoff.

The security bindings exercised by this milestone are:

| Producer | Exact bytes or fields | Consumer | Failure if relaxed |
|---|---|---|---|
| Synthetic Substrate RPC fixture plus pinned native verifier | Finalized header, authority transition, runtime-state proof, checkpoint fields | Pinned checkpoint join | An unverified or source-drifted checkpoint could enter the chain. |
| Frontier receipt extractor | Sidechain ID, execution block hash, burn leaf set, `bridge_event_root` | Burn inclusion collector and checkpoint join | A receipt mutation or another canonical block could authorize the wrong burn. |
| Aggregate-finality proof builder | Statement, program, verifier profile, payload digest, complete proof digest | Tracker admission builder | A proof or statement for another checkpoint could be substituted. |
| Extension membership builder | Exact key `0x0401`, event root, checkpoint commitment, Scorex proof and root | `SPVTrackerAuthenticated.es` VM evaluation | A root absent from the selected Ergo header could be admitted. |
| Source-specific tracker VM handoff | Exact checkpoint, aggregate proof and commitment, canonical burn plus payout preimage, burn proof bundle, 0x0401 membership, pre/post-admission tracker history, AVL transition, signed successor box ID, and source-binding identity | Next WP-06 settlement-conformance slice | Settlement could consume an independently invented or post-admission-mutated tracker fixture, or reconstruct the payout recipient independently from the proved burn. |

The negative matrix covers rejection of receipt-root drift, same-height block
replacement, cloned proof/checkpoint provenance, missing target burn, wrong
extension key, wrong authority, embedded-checkpoint drift, every persisted
proof-identity field, wrong header index, forged extension proof, missing
commitment, and unchanged AVL state.

This is pinned local conformance over public synthetic vectors. Cargo may fetch
missing locked dependencies, and the VM uses generated in-memory signing while
remaining isolated from external wallet state and chain RPC. It does not prove
a live sidechain capture, dependency-fetch prevention, complete build
attestation, Ergo-side GRANDPA verification, node-stateful acceptance, or a
committee-free finality path. R9 remains authoritative and Gate 5 remains open.

## WP-06T2 Source-To-Settlement Conformance Status

`npm run trustless:wp06-source-to-settlement-vm` now continues the WP-06T1
pipeline in one process. The settlement consumer accepts only the immutable
source-to-tracker handoff capability. It consumes the exact signed tracker
successor rather than rebuilding a tracker fixture, verifies its complete box,
singleton, register, and history identity, recomposes the settlement identity
from the proved burn leaf, and derives the recipient, amount, asset, and DUP key
from that same object. The handoff also retains the exact ten-header T1 context.
The settlement context keeps its tip-to-anchor prefix, appends five parent-linked
synthetic descendants, and places that same anchor ID, raw header, height, and
extension root at index 9, the first height satisfying the ten-confirmation rule.

The linked positive payout and DUP insertion pass sigma-rust together with the
sixteen existing isolated payout, authority-separation, tracker, replay, proof,
ordering, anchor-depth, contract-binding, chain, block, and asset rejects. The
root, anchor, and leaf-mutation cases now preserve the consumed tracker value's
other finality fields so each negative changes only the deciding field. Separate
consumer tests isolate box ID, tree, value, creation height, history key, digest,
register, NFT, and retained-anchor drift. A deeply frozen copied handoff is also
rejected because serialization does not preserve process-local provenance.

The handoff's provenance is a process-local capability, not a serializable
authorization format. Restart requires source recollection and revalidation.
DUP state, liquidity vault, header context, boxes, and signing keys remain
synthetic and ephemeral. WP-06T3 now closes the source-bound positive pinned-JVM
replay described below. Chain-resident `/transactions/check`, live capture,
complete build attestation, Ergo-verifiable GRANDPA semantics, committee-bypass
prevention, and Gate 5 closure remain open. R9 remains the finality authority,
and no trustless or production-ready claim follows.

The WP-06T2 producer-to-consumer closeout is:

| Invariant | Producer | Settlement consumer check | Failure if relaxed | Isolated falsifier |
|---|---|---|---|---|
| Process-local provenance | WP-06T1 retained handoff capability | Validate the whole handoff immediately before planning and around signing; never accept separately supplied fragments | A copied or recombined object could inherit source authority it never earned | Generic deep-frozen clone is rejected; restart requires recollection |
| Exact tracker successor | Tracker-admission VM result | Consume the same box object and bind box ID, tree, value, creation height, singleton NFT, R4-R9, history key/value, and AVL digest | A locally reconstructed tracker could authorize a different checkpoint or authority | Box ID, tree, value, creation height, history key/digest, register, NFT, root, anchor, chain, block, and proof mutations reject |
| Proved settlement identity | Frontier burn leaf and inclusion proof | Recompose the identity from the proved leaf and compare it to the retained bundle | An amount, asset, recipient, transaction, index, or burn ID could drift after proof verification | Leaf, proof, amount, asset, recipient, chain, and block mutations reject |
| Exact payout preimage | Source burn, target burn, and peg-out record | Require recipient tree, recipient hash, amount, transaction, index, block, and sidechain identity to agree before construction | A valid burn proof could pay a substituted recipient or amount | Wrong recipient, payout amount, payout token, and output-order cases reject |
| Exact DUP transition | Proved burn ID and authenticated DUP history | Derive the DUP key from the same leaf, require non-membership, and bind the successor digest | A burn could be replayed or a different key could be consumed | Duplicate key, wrong key, malformed proof, stale root, and successor mutations reject |
| Exact anchor continuation and minimum depth | Retained T1 header window and tracker value | Preserve the exact T1 tip-to-anchor prefix, append parent-linked descendants, and place the same anchor at index 9 and `anchorHeight + 10` | Height arithmetic detached from the admitted header branch could masquerade as confirmation depth | Raw ID/height/root/parent drift and synthetic depths 9 or 11 reject; the contract rejects depth 9 and accepts exact depth 10 |

This matrix closes only the local producer-consumer proof chain. WP-06T3 adds
the exact positive JVM replay; neither matrix substitutes for stateful node
acceptance, live source capture, independent custody, or an Ergo-verifiable
finality rule.

## WP-06T3 Source-Bound Pinned-JVM Conformance Status

WP-06T3 replaces arbitrary supplied synthetic header IDs with one checked-in,
15-header JVM-canonical synthetic vector spanning `H99990..H100004`. The T1
tracker window is `H99999..H99990`, uses preheader `H100000`, and holds the
`H99995` anchor at index 4. The T2 settlement window is
`H100004..H99995`, uses preheader `H100005`, and holds the exact same anchor
object at index 9. Runtime validation binds the vector digest, JVM JSON digest,
JVM-recomputed header IDs, parent links, heights, extension roots, window
membership, and the exact source-derived `0x0401` root.

The root of the checked-in three-burn Frontier vector drives tracker admission;
its third burn (event index 5), whose recipient is an executable ErgoTree, is
retained in the handoff and drives the
linked settlement. T1 passes tracker admission in sigma-rust, the thirteen
bounded tracker rejects, and positive pinned-JVM input-proof verification. T2
consumes that exact tracker successor, passes linked settlement in sigma-rust,
the sixteen bounded settlement rejects, and positive pinned-JVM verification
for both spent inputs. For each positive, the JVM parses and
round-trips the wallet's exact signed serialization, recomputes the transaction
ID and bytes-to-sign identity, binds the exact input/data-input boxes and
contract roles, and evaluates the proofs against the same ten headers. Sigma-rust
uses the documented `BlockHeader` carrier for the upcoming preheader, while the
JVM receives the exact `simplifiedUpcoming` preheader with empty votes.
The pinned Scala verifier and compiler lock were not changed.

The WP-06T3 producer-to-consumer closeout is:

| Invariant | Producer | Consumer check | Failure if relaxed | Isolated falsifier |
|---|---|---|---|---|
| JVM-canonical header identity | Checked-in 15-header vector with IDs derived by `sigma.Header.id` | The loader pins the vector SHA, expected IDs, JVM JSON digests, links, and windows; the fixture must reproduce that exact JVM JSON, and the pinned JVM recomputes each ID | A caller-supplied ID could make sigma-rust and JVM evaluate different header identities | Vector SHA, JVM JSON, ID, height, parent, extension-root, and window mutations reject; an expected ID differing from the JVM-derived ID is also replayed and rejected in the pinned JVM |
| Exact anchor continuation | T1 window capability with the `H99995` anchor object at index 4 | T2 reuses that object at index 9 on the same parent-linked vector | A substituted branch could masquerade as ten confirmations | Anchor object/ID/raw/root/height drift and wrong window/index reject |
| Exact wallet transaction bytes | In-memory wallet signed serialization plus unsigned candidate and exact boxes | Pinned JVM byte-round-trips the serialization, recomputes ID/bytes-to-sign, checks role/tree bindings, and evaluates every input proof | The JVM could approve bytes, boxes, or scripts different from the sigma-rust positive | Signed-byte/JSON mismatch and transaction, box, tree, role, preheader, header, or context drift reject |
| One source burn through payout and DUP | Three-burn event root plus the third public burn whose recipient is an executable ErgoTree, inclusion proof, and immutable T1 handoff | Tracker value binds the event root; settlement payout preimage and DUP key derive from that burn | A proved root could pay or consume a substituted event | Burn/proof, recipient, amount, asset, chain, block, transaction, index, and DUP mutations reject |
| One compiler/source identity | Existing pinned compiler, Scala verifier, source baseline, and three linked tree hashes | T2 requires equality with the retained T1 JVM report | A changed verifier or tree set could manufacture a cross-stage PASS | Compiler identity, source baseline, and tracker/unlock/DUP tree mismatches reject |

This is synthetic conformance, not mined-header or PoW evidence. The checked-in
vector is revalidated by the unchanged pinned Scala verifier and lock. Each
secret-free JVM fixture is written to an isolated per-run directory and deleted
after execution. Cargo may still fetch missing locked dependencies. The path has no chain RPC, external wallet,
runtime database, chain-resident setup/admission UTXOs, stateful
`/transactions/check`, setup, submit, deployment, or broadcast capability. R9
remains the finality authority; Ergo does not verify GRANDPA semantics; Gate 5,
committee-bypass prevention, trustless operation, and production readiness
remain open.

## WP-06T4 Fixture-Backed Restart And Adversarial Lifecycle Status

`npm run trustless:wp06-fixture-lifecycle` executes the complete pinned-source
path in two fresh Node processes. Each worker recollects the checked-in native
and Frontier inputs, reconstructs the source-derived tracker admission, rejects
a serialized copy of the process-local handoff, consumes the exact admitted
successor in settlement, and reruns both pinned-JVM positives. The parent
requires distinct process IDs and exact equality of a bounded semantic summary
covering source and burn identity, `0x0401`, tracker key/value, payout, DUP,
canonical header vector, compiler baseline, linked tree hashes, raw verifier and
codec executable SHA-256 values, and the three stage-owned negative matrices.

Each worker builds only the verifier and codec binaries with Cargo's `dev`
profile under the locked, isolated `isolated-no-debuginfo` reproducibility mode.
Incremental compilation is disabled, codegen uses one unit, physical
source/target paths are remapped, and MSVC builds request `/Brepro`. Matching raw executable hashes across the two
fresh builds proves the exact local artifacts were reconstructed on this
machine. It does not attest the complete linker/native-compiler/SDK or dependency
cache closure and is not an independent reproducible-build attestation.

Each worker is bounded to 15 minutes and 32 MiB of combined output. On Windows,
the target is created suspended, assigned to a kill-on-close Job Object without
breakaway permission, and only then resumed. Closing the job terminates even an
orphaned grandchild whose intermediary already exited. A timeout or output
overflow closes that containment boundary, caps retained bytes, and fails;
success is returned only after the contained job has been closed.

The restart comparison intentionally excludes signed transaction IDs, box IDs,
keys, paths, and other ephemeral execution artifacts. A restarted process earns
authority only by recollecting and revalidating the source path; serialized
handoffs and prior local results remain non-authoritative. The source matrix
isolates receipt-root drift, a same-height canonical Frontier replacement,
missing target burn, wrong extension key, an unfinalized target, and an
above-head finality horizon.
The existing tracker and settlement matrices continue to own proof-identity,
anchor, duplicate, stale, payout, ordering, contract, chain, block, and asset
mutations.

The WP-06T4 producer-to-consumer closeout is:

| Invariant | Producer | Lifecycle consumer check | Failure if relaxed | Isolated falsifier |
|---|---|---|---|---|
| Fresh source authority after restart | Each child recollects and validates the pinned native and Frontier inputs before constructing T1 | Parent accepts only worker summaries produced by separate process IDs; T2 still requires the process-local T1 capability | A serialized handoff or stale local result could be treated as current source authority | Same-process worker IDs and copied handoff provenance reject |
| Stable semantic reconstruction | Source, burn, anchor, tracker, payout, DUP, compiler, tree, JVM, and exact raw verifier/codec executable digests from each worker | Parent deep-compares the bounded summaries while excluding ephemeral transaction and box identities | A restart could silently select a different burn, root, payout, contract, verifier, or codec while still printing PASS | One-field semantic or executable-identity drift between worker summaries rejects |
| Executed stage-owned adversarial coverage | Source collector, tracker VM, and settlement VM return their exact versioned case lists only after running the matrices | Worker summary requires exact equality with all three exported lists | A matrix could be skipped or shortened while the lifecycle still reports success | Missing, reordered, or changed source/tracker/settlement case arrays reject |
| Claim boundary preservation | T1/T2 JVM reports and explicit WP-06 boundary fields | Worker and parent require JVM acceptance true while node-stateful acceptance, exact chain-candidate reconstruction, Gate 5 closure, and submit/broadcast remain false; R9 remains authoritative | Local replay could be misreported as node, finality, or release evidence | Any flipped boundary field rejects |

This milestone is fixture-backed restart and adversarial evidence. It does not
create chain-resident tracker, DUP, or vault boxes and therefore does not perform
stateful node `/transactions/check`. It does not prove mined-header PoW,
canonicality, independent custody, or Ergo-side GRANDPA verification. An
anchored checkpoint invented by the current R9 authority remains an explicit
unresolved critical case. The report must keep node-stateful acceptance false,
R9 finality authority true, Gate 5 closed false, and submit/broadcast disabled.

## WP-06T5 Chain-Derived Tracker Reconstruction Status

The authenticated settlement daemon no longer relies on a pre-populated local
tracker history after startup. A read-only adapter retrieves every indexed box
carrying the tracker singleton NFT, with stable pagination bounded by the same
Ergo extra-index/full-block height and best-header identity before and after
reconstruction. The reconstructor
orders the lineage by spending-transaction links, requires one root and one
unspent tip, and replays each V2 admission from its confirmed spending context.

For every transition it binds the exact checkpoint/finality commitment,
tracker value, `0x0401` extension proof, ancestor header, sidechain ID, V2 AVL
history, and successor registers. Canonical scalar/register decoding prevents
alternate local interpretations. The current tip R5 must equal the digest
recomputed from all reconstructed key/value entries. The indexed tip must also
be the exact box returned by canonical `/utxo/byId`; after unsigned transaction
preparation, the daemon repeats a synchronized index/full-tip plus UTXO check
immediately before candidate journaling. Only the process-local
validated result can replace the SQLite cache; a changed lineage atomically
invalidates active candidates for the affected sidechain.

The WP-06T5 producer-to-consumer closeout is:

| Invariant | Producer | Consumer check | Failure if relaxed | Isolated falsifier |
|---|---|---|---|---|
| Complete singleton lineage | Ergo extra index pages for the exact tracker NFT | Stable-total pagination plus one-root/one-tip spending-link traversal | API order, truncation, a forked tip, or a disconnected box could become local history | Out-of-order positive, changed total, premature page end, multiple tips, missing successor, duplicate and disconnected lineage rejects |
| Exact admitted state | Confirmed input spending context and successor registers | Canonical commitment/value/proof-bundle framing and deterministic V2 admission replay from prior entries | A locally invented key, value, checkpoint, sidechain, anchor, or digest could enter the cache | Context value, register, sidechain, digest, extension-proof, and proof-bundle framing mutations reject |
| Anchor ancestry | Indexed spending transaction block plus parent headers | `contextIndex + 1` contiguous parent steps must reach the tracker value's exact anchor and extension root | A same-height or unrelated header could satisfy a local lookup | Parent ID, height, anchor ID, extension root, and context-index mutations reject |
| Replaceable local cache | Validated process-local reconstruction capability | One SQLite transaction replaces the sidechain partition and invalidates its active candidates | Arbitrary local rows or a stale rollback branch could authorize candidate preparation | Unproven caller rejects; empty-DB population, idempotent replay, rollback replacement, and candidate invalidation execute |
| Runtime freshness gate | Extra-index progress, full-block tip, and canonical UTXO | Require `indexedHeight == fullHeight == bestHeader.height`, an unchanged snapshot, and exact `/utxo/byId` tip identity; recheck after unsigned transaction preparation and immediately before candidate journaling | A lagging index or stale singleton projection could authorize cached history | Index lag, best/full mismatch, snapshot drift, missing canonical tip, and reconstruction failure leave authenticated settlement fail-closed |

WP-06T5 did not independently replay the historical AVL insert proof and used
one configured Ergo observation. Those two local reconstruction boundaries are
replaced by WP-06T6 below; the remaining finality and target-runtime boundaries
are not.

## WP-06T6 Exact AVL Replay And Independent Observation Status

The V2 reconstructor now starts from the exact empty 33-byte tracker digest and
advances one digest per confirmed singleton transition. For each transition it
passes the observed Var(2) AVL proof, current digest, derived 32-byte key, and
derived 264-byte value to the pinned `ergo_avltree_rust` verifier with one
insert and zero deletes. The verifier-produced digest must equal the complete
canonical successor R5; input R5, successor R5, and all four ContextExtension
variables are compared exactly. A proof replayed with a different value may
produce a different valid digest, so successor-R5 equality is the deciding
binding rather than an assumption that proof bytes uniquely encode a value.

A bounded structural preflight protects the pinned verifier's unchecked parser
indices. It deliberately accepts only canonical prover balance bytes
`{-1, 0, +1}` before entering WASM while retaining the pinned verifier's
trailing-direction consumption semantics. This is a stricter fail-closed local
admissibility policy, not a claim that every byte sequence accepted by the
pinned Rust or JVM parser is accepted. WP-06T7 now fixes that differential
boundary for the reviewed one-step corpus. Safety still depends on verifier acceptance
and exact successor-digest equality. Var(2), its decoded proof bundle, each
dedicated HTTP response, each indexed page, and the complete lineage are
bounded before replay or accumulation. The chain walk is a single rolling pass
over the lineage with at most ten bounded header-parent lookups per transition.
It no longer rebuilds every prior AVL prefix for every transition.

Authenticated daemon reconstruction now requires two distinct read-only Ergo
client instances configured on different canonical node origins. Both must
independently reproduce the exact deciding lineage fields, including every box
and transaction identity, inclusion height, register set, spending context,
derived entry, digest, canonical UTXO tip, and stable best/full/index snapshot.
Only that dual-source wrapper creates the process-local provenance accepted by
the cache replacement boundary; a valid single-source replay cannot. Missing
witness configuration or any disagreement invalidates active candidates and
leaves settlement fail-closed. This is disagreement detection, not a consensus
proof: two nodes can share the same faulty or adversarial view.

The clean-checkout-reproducible
`npm run benchmark:tracker-reconstruction -- --entries 1024` command first
builds the pinned WASM crate, then reconstructed 1,024 transitions and 645,881
AVL-proof bytes in 228.176 ms on the recorded Node v24.14.0/win32/x64 run, with
exact final-tip equality. Fixture generation took 6,188.963 ms and is reported
separately because it deliberately uses the legacy stateless proof generator.
The generated WASM SHA-256 was
`32be27f7819b6d353c41e46bd77e9ed48d6474ca7bc351764b049b196a7846ef`.
This synthetic no-network/no-DB benchmark is evidence of the rolling
reconstruction cost, not a production latency SLO.

The WP-06T6 closeout matrix is:

| Invariant | Producer / enforcement | Downstream consumer | Failure if relaxed | Isolated falsifier |
|---|---|---|---|---|
| Exact one-step AVL transition | Size-bounded confirmed Var(2), current R5, derived V2 key/value, canonical-subset preflight, bounded Rust verifier | Successor R5 equality and next rolling transition | An oversized, opaque, out-of-order, wrong-root, wrong-key, wrong-value, malformed, or parser-hostile proof could enter reconstructed history | Empty/non-empty positives; oversized Var(2)/bundle, noncanonical balance, wrong root/height/key/value, existing key, mutated/truncated proof, wrong successor R5, and 1,024-transition rotation-bearing lineage |
| Linear rolling state | Exact V2 empty digest followed by each verifier-produced successor | Final tip R5 and process-local reconstruction capability | Rebuilding prefixes is quadratic; starting from an invented non-empty root can omit history | Empty-root input-register equality, per-transition input/successor equality, exact 1,024-transition final digest, and genesis/digest drift rejects |
| Independent observation agreement | Two response-bounded read-only clients on different canonical origins, full deciding-lineage digest, dual-source-only provenance | Atomic cache replacement and pre-journal freshness gate | One configured RPC or a reduced final-tip comparison can unilaterally define local reconstructed authority | Same-source instance, single-source cache replacement, intermediate-lineage mutation, snapshot disagreement, missing witness UTXO, excessive total, and either-source reconstruction failure reject |
| Claim boundary | Local verifier and synthetic benchmark only | Gate 5 and candidate lifecycle | Local replay could be mislabeled as Ergo-verifiable finality or live readiness | No checker, signer, submitter, broadcast, stateful node, or R9-invented-checkpoint acceptance flag is enabled |

Evidence vector: implementation `matrix_covered`; independent review `complete`;
CI `not_run`; target runtime `not_run`; readiness `local_only`.

WP-06T6 has not yet been exercised against two concrete non-mainnet node
origins. It does not validate GRANDPA inside Ergo,
reject an R9-authorized invented checkpoint, perform stateful
`/transactions/check`, or add signing, submission, or broadcast. Gate 5 remains
open.

## WP-06T7 Pinned JVM AVL Differential Status

The offline `npm run trustless:tracker-avl-jvm-differential` command rebuilds the
WASM package and validates the exact Rust sources, generated JavaScript glue,
and WASM bytes against a reviewed lock before loading generated code. It derives
17 one-step cases from real authenticated V2 WASM prover output and runs the
exact same digest, key, value, and proof bytes through the pinned JVM
`BatchAVLVerifier`. The corpus covers empty/non-empty inserts, all four reviewed
rotation shapes, wrong digest/height/key/value, an existing key, truncation,
trailing direction bytes and an unused direction bit, and non-canonical balance
bytes. JVM failures retain bounded constructor, operation, and digest-stage
outcome classes. Accepted cases retain both complete successor digests and must
match exactly across WASM and JVM.

The reviewed JVM runtime accepts a falsified starting-height byte but produces a
different successor digest; the stricter WASM preflight rejects that case. Both
runtimes accept a wrong value as an operation and derive the same alternate
33-byte successor.
These cases make the security boundary explicit: verifier operation acceptance
is not enough. The complete expected 33-byte successor R5 must match exactly,
and the stricter WASM proof-shape policy remains unchanged.

The reviewed identities are canonical source/runtime lock SHA-256
`a1c52eef82974e8ca102b37ca84fe526ee464a623fb7583cf05cbd06a347f060`,
generated JavaScript glue SHA-256
`98dbefbf0150b477c7af22d5f9cdfaf925cfb464da08e787b284e17d1a1fd13c`,
WASM SHA-256
`e6fedc505a3904518ab2ff83a5ac6c4af72fb66fc163ff86768280d330a8d487`,
JVM verifier artifact SHA-256
`79838cdcedc62936acb11583946cad635b9f42fa967d39bb103742b9b6302944`,
and ordered JVM classpath SHA-256
`d156d66793cc88b78816c45f82429ed1052c67220133fba0783e38928396131a`.
Those reviewed identities remain frozen in
`sources/authenticated-spv-tracker-jvm-avl-wasm-lock-v1.json`. Current clean
checkouts use the separate V3 lock, which binds Rust 1.97.1 through
`wasm-avl/rust-toolchain.toml`, the current crate sources, the exact wasm-pack
0.14.0 probe and deterministic Cargo-home/workspace path-remapping recipe,
generated JavaScript glue SHA-256
`98dbefbf0150b477c7af22d5f9cdfaf925cfb464da08e787b284e17d1a1fd13c`,
and current WASM SHA-256
`be1134ff4052496eac6903dbc9a40bb6d164786de09e8c98488a81eedc151867`.
The real historical JVM differential executes only under its exact pinned
Windows, Node and relayer-package-lock closure. Other current hosts validate
the V3 source/runtime lock and generated artifact identity without relabelling
that result as a new JVM execution or superseding the V1 evidence.
This is local direct-verifier evidence only. It performs no stateful node check,
signature, submission, broadcast, or sidechain-finality verification and does
not close Gate 5.

## WP-06T8 Explicit Dual-Origin Observation Status

`npm run trustless:wp06-dual-observe` is the standalone operational entrypoint
for the concrete WP-06T6 observation. It takes two explicit, distinct root
origins, the exact provisioned tracker genesis box ID, and the remaining
non-mainnet V2 tracker identity. Its dedicated clients are
credential-free and GET-only; they use no bridge configuration, environment
credential, deployment state, runtime database, signer, wallet, transaction
builder, checker, submitter, or broadcaster. Redirects and proxies are disabled,
and per-response, page, lineage-count, accumulated raw response-body pagination byte,
page-count, and pagination-deadline bounds apply. One additional session spans
the complete reconstruction and bounds its request count, wall-clock elapsed time, and
exact raw response-body bytes across lineage, transaction, header, and UTXO
lookups. Transaction and header responses are cached only inside that session.
Indexed pages must contain only the canonical `items` and `total` fields and the
exact expected cardinality.
If either source fails, the dual wrapper still waits for both bounded sessions
to close before returning the fail-closed result.

The command requires both origins to retain one stable non-mainnet network
identity around complete reconstruction and requires that identity to match the
explicit environment (`patched-devnet` maps to node network `devnet`). The
singleton lineage must start at the exact provisioned genesis box. That binds
the initial registers and R9 proposition rather than accepting any otherwise
well-formed empty tracker. The daemon requires this immutable identity as
`spvTrackerAuthenticated.genesisBoxId`; the separate `boxId` identifies the
populated/current tracker and must never be substituted as the reconstruction
root. It emits a new JSON report only after
the two views agree on every deciding lineage field, exact rolling AVL replay,
unspent tracker tip, and stable full/index/header snapshot. The report binds its
decoded V2 entries, their complete encoded checkpoints and recomputed checkpoint
commitments, proof identities, genesis/R9/tracker/tree/tip/observation
identities, source origins, and explicit non-authorizing boundary with a
canonical SHA-256 self-consistency digest. The entries must reproduce the
reported tracker tip digest. The digest is unkeyed and does not authenticate a
source, while `observationDigestHex` is a source-produced diagnostic over raw
lineage and snapshot data that the compact report cannot independently
recompute.

The WP-06T8 producer-to-consumer closeout is:

| Producer | Exact bytes / fields | Consumer | Deciding authority | Failure if relaxed | Isolated rejection |
|---|---|---|---|---|---|
| Explicit CLI request | Environment, two root origins, tracker NFT, exact tracker genesis box ID, tracker ErgoTree, sidechain ID, new repository-local JSON target | Config-free node-client factory and report writer | Input validation only; never funds authority | Hidden defaults, credentials, substituted genesis/R9, runtime state, or overwrite could contaminate the observation | Missing/duplicate/unknown options, credentials, path/query targets, same canonical origin, unsafe output, and existing output reject |
| Each bounded node view | `/info`, full/index/header snapshot, complete singleton lineage, transactions, ancestor headers, and canonical UTXO tip | Exact WP-06T6 reconstructor | Each source must independently pass one complete request/byte/deadline-bounded reconstruction before comparison | A partial lineage, stale index, changed/wrong network, unbounded lookup sequence, or oversized response could be presented as agreement or stall cache admission | Mainnet, environment/network mismatch, network drift, exact page schema/cardinality, identity content encoding, response-body/lineage/page/complete-session request-byte-deadline bounds, truncated pagination, snapshot drift, missing objects, and either-source failure reject |
| Provisioned tracker root | Immutable `genesisBoxId` plus canonical initial R4-R9, empty R5, configured R6, zero R4/R7, and valid R9 proveDlog; populated/current `boxId` remains separate | Rolling reconstruction and report tracker identity | The explicit genesis box ID is the deciding deployment binding; R9 remains disclosed federated finality authority | Using the populated tip as genesis breaks every non-empty reconstruction; omitting the root could accept a substituted tracker, sidechain, initial history, or authority | Missing/wrong genesis ID, genesis equal to a distinct populated tip in provisioning, non-empty root, nonzero counter/sidechain height, wrong sidechain, malformed R9, or cross-source identity drift reject |
| Dual-origin reconstruction | Full observation identity, rolling AVL successors, complete encoded checkpoints, decoded V2 keys/values, proof identities, genesis/R9, tip and snapshot | Digest-bound JSON report | Process-local two-source provenance only | Final-tip-only comparison or shared source reuse could hide divergent deciding history | Reused source, intermediate-field mutation, best-header disagreement, wrong successor, and source-origin equality reject |
| Report validator | Exact schema, canonical fields, encoded-checkpoint/entry/key/value/derived-commitment coherence, entries reproducing the tracker tip digest, fixed false authority claims, report digest | Human review and future target-run evidence assembly | Schema and self-consistency only; the unkeyed digest never authenticates a source or grants mint, payout, tracker, or consensus authority | Well-formed JSON could disconnect entries from the tip, substitute another block/checkpoint, or be reworded into a Gate 5, finality, or broadcast claim | Unknown fields, disconnected entry history, checkpoint/identity mismatch, authority flip, premature Gate 5 claim, noncanonical network, and digest drift reject |

Distinct origins are disagreement detection, not proof of independent operation,
independent upstreams, or canonical Ergo consensus. No chain-resident V2 tracker
and matching pair of target nodes is available in this worktree, so target
runtime remains `not_run`; no fixture report is recorded as live evidence.
Stateful `/transactions/check` also remains open. R9 still authorizes the proof
identity, the current Ergo runtime does not verify GRANDPA semantics, and the
reserved validity/STARK proof-system ID remains rejected until an actual Ergo
verifier is activated. WP-06T8 therefore does not close Gate 5.

## Required Components

| Component | Required property | Evidence before production claims |
|---|---|---|
| Verifiable sidechain consensus | Ergo can validate the sidechain header or finality rule used by the bridge. | Phase 008 consensus proof design, tests, and review. |
| Extension-section commitment | Sidechain commitments are embedded under a stable `0x04xx` key format. | Phase 009 format spec, miner/node implementation, and live rehearsal. |
| SPV relay | Accepted sidechain commitments are tracked on Ergo with authenticated history. | Contract tests, relayer tests, and replay/reorg drills. |
| Burn commitment tree | Burn events are committed in an ErgoScript-friendly tree. | Cross-language vectors and negative tests. |
| Burn inclusion proof | Settlement verifies event inclusion and field binding on-chain. | Contract eval tests, live rehearsal, and independent review. |
| DUP settlement binding | The proved burn ID is the exact DUP key inserted by the settlement. | Existing DUP tests plus Phase 011 proof-binding tests. |

## Proof Shape

The target proof must avoid an Ethereum receipt/Keccak dependency in the Ergo
contract path. ErgoScript-friendly verification should use Blake2b-compatible hashing.
It should use fixed-width typed leaves produced by the sidechain runtime or a
dedicated pallet.

Minimum leaf fields:

| Field | Purpose |
|---|---|
| `sidechainId` | Prevents replay across sidechains or forks. |
| `sidechainBlockHash` | Binds the event to a committed block. |
| `burnId` | DUP key and unique replay-protection identifier. |
| `burnTxHash` | Operator/debug correlation only unless included in the proof format. |
| `logIndex` or `eventIndex` | Disambiguates multiple burns in one sidechain transaction/block. |
| `recipientErgoTreeHash` | Binds the payout recipient. |
| `amountNanoErg` | Binds the payout amount. |
| `assetId` | Binds ERG versus future asset lanes. |

Open design rule:

- If Frontier/EVM logs remain the user-facing event surface, the sidechain must
  also publish a bridge-native Blake2b burn tree or equivalent commitment that
  ErgoScript can verify without Keccak receipt proof parsing.
- If EIP-0045 native STARK verification becomes available, keep the same public
  `bridge_event_root` / `burn_root` semantics and move heavy inclusion/finality
  checks into a public aggregate proof rather than expanding per-exit
  ErgoScript logic indefinitely.

## Local Proof Core Status

`relayer/src/profiles/substrate-grandpa-v1/trustless-burn-proof.ts` now defines
the local bridge-native burn proof core for this target shape; the prior
top-level path remains an exact compatibility re-export. It provides stable
burn leaf encoding, a Blake2b Merkle `bridgeEventRoot`, inclusion proof
verification, and settlement binding checks for `burnId`,
`recipientErgoTreeHash`, `amountNanoErg`, `assetId`, and the DUP
duplicate-prevention key.
`relayer/src/trustless-burn-proof-vector.ts`,
`relayer/test-vectors/trustless-burn-proof-v1.json`, and
`relayer/test-vectors/trustless-burn-proof-v1-multi-leaf.json` keep that local
proof core reproducible with checked vectors. The single-leaf vector preserves
the baseline proof-core root behavior where `proof: []` is valid. The multi-leaf
vector exercises a non-empty structured inclusion proof node suitable for Gate 5
evidence rehearsal. `npm run trustless:proof-vector:validate -- <vector.json> --json-out <report.json>`
is the read-only CLI target validator for that evidence-ready local vector: it
recomputes the proof, confirms the DUP/recipient/amount settlement binding,
replays fail-closed negative cases, writes a bounded structured report when
requested, and blocks single-leaf `proof: []` inputs from being used as
evidence-ready local inclusion proof targets. Both vectors carry fail-closed
local negative cases for wrong sidechain ID, wrong burn ID, wrong event index,
wrong recipient, wrong amount, wrong DUP key, wrong `bridgeEventRoot`, and
malformed inclusion path. Each negative case is replayed through the same
proof-core settlement binding and must observe the expected rejection error.
Gate 5 evidence must link that JSON report with `Proof-vector validation report:
<report.json>`. `npm run trustless:validate` consumes the report and requires
the report boundary to remain read-only, local proof-core only, non-broadcast,
non-claiming, to contain exactly one proof-vector result, and to be bound to
the embedded proof vector, including a non-empty result `label` and `message`,
an explicit empty `errors` array, explicit `gate5Claim=false` and
`contractsChanged=false` markers, local proof-core-only scope, no Gate 5 closure,
no settlement readiness, no broadcast authorization, no production claim support,
and the canonical `leafHashHex`.

Current local proof-vector boundary evidence is captured in
`evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-25-a5462960.json`
and summarized by
`evidence/trustless-burn/artifacts/completed-local-proof-vector-validation-2026-06-25-a5462960.md`.
These artifacts document local proof-core validation only, including structured
`negativeCaseResults` for the required fail-closed local negative cases.

`relayer/src/peg-out-burn-verifier.ts` also supports an explicit local
sidechain receipt finality policy for burn extraction. When
`requiredSidechainConfirmations` is supplied, callers must supply
`currentSidechainHeight`; the verifier records the computed confirmation count
and rejects receipts that are not deep enough before a trustless burn leaf is
constructed. This is a local receipt-depth guard for evidence preparation, not
an Ergo-verifiable sidechain consensus proof. Current local rejection evidence
for this guard is captured in
`evidence/trustless-burn/artifacts/completed-local-sidechain-finality-rejection-2026-06-25-9dbeff16.md`.

This is necessary implementation groundwork, not completed Gate 5 evidence. It
does not verify sidechain consensus or Ergo-verifiable finality, does not prove
an Ergo extension-section anchor on its own, does not replace contract
evaluation, does not prove on-chain proof acceptance, and does not authorize any
trustless, production-ready, or mainnet claim.

`contracts/MainChainAggregateUnlockTrustless.es` adds the first V2 aggregate
settlement contract source surface for bridge-native burn leaves. The source
now folds the compact burn proof bundle over zero to fourteen 33-byte Merkle
nodes, using side byte `0` for sibling-left and `1` for sibling-right, and binds
the result to the SPV tracker `bridgeEventRoot`. It also binds the SPV tracker
key to the leaf sidechain ID, sidechain height, and sidechain block hash, plus
the canonical burn ID derivation, recipient ErgoTree hash, amount, ERG asset
lane, payout output, and DUP insertion to the same leaf. This narrows the next
contract milestone, but it is still a source-boundary prerequisite:
contract-evaluation evidence, signing/check/submission wiring, deployment,
live/non-mainnet rehearsal, independent review, and completed Gate 5 validation
remain open.

The current source must be described as a **proof-bound settlement candidate**,
not a globally trustless path. `SPVTracker.es` still admits commitments under a
committee signature and `DoubleUnlockPreventionAggregate.es` still requires the
committee. Gate 5 cannot close until root admission and finality are
cryptographically constrained at the full transaction boundary.

`relayer/src/aggregate-settlement-builder.ts` exposes
`buildTrustlessSingleLeafAggregateUnlockExtension` for the same V2
source-boundary surface. It builds the four-slot ContextExtension expected by
`MainChainAggregateUnlockTrustless.es`, recomputes the canonical burn leaf from
the planned claim, validates the supplied proof path against the planned
`bridgeEventRootHex`, and rejects recipient, amount, asset-lane, sidechain
index, root drift, or proof bundles deeper than the 14-node trustless contract
cap before encoding. This helper does not assemble, sign, check, submit, or
broadcast V2 settlement transactions and does not close Gate 5.

`relayer/src/aggregate-settlement-tx.ts` now exposes
`buildTrustlessSingleLeafAggregateSettlementTx` for the same V2 single-leaf
surface. It assembles an unsigned EIP-12-like transaction shape with SPV tracker
input, aggregate DUP input, trustless unlock input, tracker successor, DUP
successor, payout, optional change back to `mainChainAggregateUnlockTrustless`,
and miner fee output. The builder only accepts plans marked
`candidate-only-trustless-v2-required` and uses the compact 4-slot V2 trustless
unlock extension. This remains source-boundary groundwork: the compact shape can
pass the default context-extension guard, but the builder does not check, sign,
submit, broadcast, approve, or close Gate 5.

`relayer/src/aggregate-settlement-service.ts` exposes
`prepareTrustlessSingleLeafUnsignedTx` as the service-level preparation wrapper
for this V2 candidate. It selects the SPV tracker, aggregate DUP, and V2
trustless unlock boxes, verifies the local AVL digest bindings, assembles the
unsigned transaction, and returns a default context-extension guard report plus
structured `trustless-single-leaf-unsigned-tx` evidence. That evidence binds the
selected source boxes, prepared transaction shape, guard status, and explicit
no-check/no-sign/no-submit boundaries. The method remains non-broadcast
evidence plumbing: it does not call `/transactions/check`, does not derive an
expected transaction ID, does not sign or submit, and does not mark settlement
readiness even when the compact source-boundary context-extension guard passes.

`npm run trustless:unsigned-tx:validate` validates stored
`trustless-single-leaf-unsigned-tx` JSON evidence as a separate read-only
source-boundary check. It rejects aggregate pre-broadcast records and
candidate-only identity records as the wrong evidence kind, requires the
selected box IDs, unsigned transaction shape, context-extension guard, and
no-check/no-sign/no-submit boundaries, and does not close Gate 5 or authorize
claims.
Use `--report-out <report.md>` when recording a durable validation transcript;
the generated report preserves the same no-claim, no-check, no-sign, and
no-broadcast boundaries.

`npm run trustless:candidate` and `npm run trustless:candidate:validate` support
read-only trustless settlement identity evidence. Candidate evidence binds
bridge-native burn identity fields before V2 settlement contracts can consume
them. The generator can consume an evidence-ready local proof-vector target as
the source of truth for the burn hash, bridge event root, DUP key, recipient,
amount, asset, and sidechain ID. Proof-vector-derived candidate JSON records
also carry `sourceBindings.proofVector` provenance for the proof-vector target,
target burnId, bridge event root, leaf hash, leaf count, and proof-node count,
but this remains candidate-only evidence. It does not replace completed
`npm run trustless:validate` protocol evidence, Gate 5 reviewer sign-off,
sidechain finality evidence, or V2 contract verification.

`npm run trustless:anchor-observe` supports read-only 0x0401 anchor observation
evidence from a sanitized public extension-observation JSON target. The command
binds an expected `bridgeEventRoot` to observed Ergo extension fields across an
explicit height window, reports `LINKED`, `BLOCKED`, or `UNAVAILABLE`, can
write `--json-out <report.json>`, and keeps deployment-state, runtime database,
secret, signing, broadcast, and claim authorization boundaries closed.
`npm run trustless:validate` consumes that JSON when the extension anchoring
component is linked and requires the report to match the Commitment Format
`bridgeEventRoot` and `ergoAnchorHeight`. This is anchor-prerequisite evidence
only; it does not replace burn inclusion proofs, SPV relay/finality evidence,
on-chain proof acceptance, completed Gate 5 validation, or reviewer sign-off.

The separate V1 peg-in native-state path retains its exact proof-only execution
boundary. The new V2 runtime-identity proof core uses a separate request,
statement, result, fixture, and CLI family. It authenticates raw Substrate
`:code` bytes under the same finalized target state root as the processed
deposit predicate: `[:code, record]` for membership, or
`[:code, current profile, record]` for current non-membership. The native result
returns the authenticated code key, SHA-256, and byte length, not the raw Wasm.
The TypeScript boundary hashes the exact target SCALE header and derives its
canonical height and state root, so a caller-shaped hash/height/root tuple is
rejected before the proof-core result is exposed.
The finalized read-only collector creates that exact V2 request with one
`state_getReadProof`, records the ordered keys plus proof-node and byte counts,
performs no separate storage-value read, and leaves all proof and lifecycle
authority fields false until native execution occurs under the separately
reviewed V2 authority described below.

The V2 statement also binds a portable runtime-build attestation identity and
digest, but the proof core alone does not authenticate that external
attestation. WP-06T12 adds two separate signed families: one for the exact
Frontier runtime Wasm build and one for the distinct native V2 verifier. One
native-attested execution policy binds both reports and policy digests, requires
disjoint attestor keys and organizations, and fixes the runtime dependency
manifest, contained launcher, exact schemas and argv, validity window, and
resource limits. The dependency manifest rejects delay-loaded DLLs, non-system
dependencies, sidecars, and non-canonical system-DLL lists. The contained
authority reloads both source-owned trust registries before and after execution.

WP-06T13 replaces that mutable launcher path with a separate V2 installation
profile. The installer publishes the reviewed launcher under its flat SHA-256
under the actual 64-bit Program Files known folder, records its digest, size,
volume serial, and 128-bit file ID in the distinct 144-byte
`AuthorityRecordV2`, and writes that record only after the protected image has
been flushed and reopened. The broker independently resolves
`FOLDERID_ProgramFilesX64`, requires the retained handle's exact
digest-addressed final path, checks one hard link and no delete-pending state,
revalidates the complete V2 record, and holds the V2 update mutex through
target exit, cleanup, and the complete buffered-output write and flush.
Abandoned ownership is released before fail-closed rejection. The bounded
TypeScript caller requires the canonical digest-addressed V2 suffix and
explicitly selects V2; it does not decide the known-folder root.

This is local implementation evidence, not an accepted installation. The
elevated disposable-host crash, ACL, replacement, hard-link, coexistence,
rotation, race, and abandoned-mutex campaign has not run. Child output
therefore remains quarantined as a digest and size only; the candidate does not
expose its nested positive proof or finality fields. Its boundary preserves
`brokerSelfImageBoundToAuthorityRecordV2=true`,
`launcherInstallationActivationCampaignCompleted=false`,
`sidechainFinalityVerified=false`,
`statementRuntimeStateVerified=false`, `runtimeCodeStateProofVerified=false`,
`targetRuntimeBuildEvidenceMatched=false`,
`launcherAtomicBootstrapProven=false`, and
`targetRuntimeBuildIdentityVerified=false`. The self-image field records the
broker's retained-image/record check inside the declared Windows
administrator/kernel TCB. The legacy atomic-bootstrap field records only that
the Node parent did not independently observe the Windows loader binding; it is
not a request for another wrapper process. The read-only `InspectOnly` command
reuses the exact V2 image, ACL, registry and record checks without persistent
mutation, but inspection does not execute the broker or complete the campaign.
Only the two pre-launch attestation checks and the V2 installation/record
binding are positive. No child proof output or target execution identity is
authenticated.

That result is deliberately narrower than runtime-history verification. A block
that changes `:code` executes under the parent-state runtime while exposing the
next runtime in its post-state, so target post-state `:code` is not necessarily
the producer of a historical peg-in record. The separate lineage/cutover model
requires producer-parent code evidence, finalized ancestry, every runtime
transition including change-and-revert coverage, replay-key monotonicity and
non-deletion, native post-execution record semantics, the distinct EVM
write-before-token-mint guard, direct token-mint and ownership-control routes,
and a reviewed cutover bound to an explicit Ergo deposit-height range. These
shape inputs use claim-present markers, their normalizer remains private, and
the public report does not convert them into positive verified fields. The
model also keeps committed-vault identity and consumption as separate evidence.

Both canonical T12 attestor registries currently have no active external
profile, so the real source-owned composition rejects before execution; positive
composition is exercised only by synthetic fixtures. No daemon or
reconciliation path consumes the result. Runtime upgrade history, cutover
policy, historical mint absence, committed-vault transition, mint authority,
transaction mutation, and Gate 5 therefore remain false. V1 is not
reinterpreted and every peg-in hold remains. The next code step is an
authenticated complete-interval expectation history followed by reviewed
per-runtime invariant bindings; the V2 elevated installation campaign remains
a separate operational prerequisite.

WP-06T14 adds immediate parent/execution expectation pairing without promoting
the quarantined proof result. The collector binds one execution-block
membership request to one exact direct-parent non-membership request under the
same trust anchor and deposit. Canonical SCALE headers bind the requested
direct ancestry and consecutive heights structurally within the paired request
bytes; the expected peg-in record binds the execution hash, height, sidechain,
deposit, and profile generation. The expected runtime at block entry is
selected from the parent request's `:code`, while the execution block's
post-state `:code` expectation is retained separately to classify a declared
code change in that block. Neither runtime expectation is accepted as proved
state while the native child proof claims remain quarantined.

This pair alone is not a complete runtime history. It cannot detect an omitted
earlier change-and-revert interval, establish historical mint absence, approve
a cutover, authenticate committed-vault consumption, or authorize mint. Both
child outputs remain digest-only and their finality and state-proof claims are
unaccepted. No daemon or reconciliation consumer imports the lineage
candidate. WP-06T15 supplies bounded structural interval coverage, while
accepted `:code` history, reviewed per-runtime invariants, external attestor
custody, the elevated installation campaign, and the committed-vault join
remain open. Gate 5 remains open.

WP-06T15 adds the bounded complete-interval expectation history. Its explicit
`inclusive-post-state` interval starts at the exact reviewed checkpoint and
ends at the peg-in execution block. Before the first RPC, the collector
snapshots one expected height, target hash, V2 statement, and provenance-bound
evaluator for every state. Direct ancestry and consecutive heights then prevent
sampling gaps. Every pre-execution state requires record non-membership and the
final state requires exact membership; the final parent/execution pair is
rechecked through the T14 composer.

Each expected `:code` change must coincide with a canonical header
`RuntimeEnvironmentUpdated` marker. The marker can also describe an unchanged
code digest, so that case is retained without inventing a transition. The first
checkpoint state cannot carry the marker because its parent is outside the
declared interval. A post-state change in block `h` is recorded as active from
block entry `h + 1`; a return to any earlier code digest is classified as a
reversion. One code digest must retain one artifact size and one build
attestation identity across the interval.

The campaign is capped at 257 states, 64 MiB of aggregate serialized
collection material, and a bounded cooperative aggregate acceptance deadline.
Each child receives no more than the aggregate time remaining, and a late
child result is rejected before entering the history. The completed wrapper is
checked again before provenance and return; current RPC interfaces do not
promise forced cancellation of an in-flight transport call. Full child collections
are not returned; only request/output digests, block identities, heights, and
byte counts survive in the wrapper. No daemon or reconciliation consumer
imports this route.

T15 proves only that an explicit expected candidate interval has no structural
height gap. It does not accept the child finality or state-proof claims, prove a
stable collection snapshot, prove that the checkpoint predates deposit
eligibility, verify runtime history, establish historical mint absence, or
authorize mint. Source-owned independent review of every distinct runtime's
native replay key, EVM write-before-token-mint and rollback semantics, and
complete mint/ownership-control inventory is the T16 boundary below. External
attestor custody, the elevated launcher campaign, cutover, committed-vault
binding, Gate 5, and all readiness claims remain open.

WP-06T16 adds that exact semantic-review layer without accepting the T15 proof
claims. A versioned signed statement binds one runtime/build identity to the
Frontier source lock, patch and runtime-source manifest plus the exact
`ErgoBridge` and `SERG` source, ABI and compiled-bytecode hashes. It records
that native `ProcessedPegIns` is written after successful EVM execution and is
not the Solidity write-before-mint guard. The actual EVM ordering is the
`ErgoBridge.processedPegIns` write, external `SERG.mint`, then `PegIn` event in
one EVM transaction. The inventory includes direct `SERG.mint` and ownership
transfer/renounce entrypoints on both contracts.

The T16 composition layer requires one validated review packet per distinct T15
runtime and one reviewer-policy digest. It preserves contiguous ranges and
runtime re-entry, and rejects missing, extra, duplicate, mixed-policy,
reused-review or build-drifted profiles. Supplied-policy validation and
source-owned canonical validation have separate constructors, branded types,
and process provenance. A self-issued policy can therefore produce only the
synthetic quarantined candidate. The source-owned reviewer lock has no active
profile, so canonical composition is unavailable and fail-closed.

An accepted `PegIn` event still does not prove the deployed bridge/token code,
the bridge-to-token binding, current or historical token ownership, or the
expected supply delta. WP-06T17 adds pinned whole-block conformance using the
exact current `SERG` and `ErgoBridge` creation bytecode. It imports three valid
setup blocks, applies mint plus same-block profile activation in a fourth
candidate overlay, proves the bridge token binding and exact replay, supply,
and recipient-balance changes before callback finalization, and then proves
both authoring and `FrontierBlockImport` reject without changing the accepted
head, EVM nonce/supply/balance/replay state, native profile/address/record,
events, or Frontier block/receipt/status state. A valid runtime-built sibling
from the same parent imports after the rollback assertions. A second valid
sibling forms a mixed-header negative control. Its import rejection shares only
a shorter deterministic Wasm backtrace prefix with the direct callback failure,
whereas the mint candidate import shares the callback witness path. This
isolates the callback cause from the known root/digest mismatch without claiming
a valid rejected-candidate header. The source verifier binds the fixture Git
blobs to the checked-in Solidity artifacts. This is local pinned-source
behavior, not deployed identity or finality evidence. WP-06T18 now pins
`solc 0.8.35`, OpenZeppelin `5.6.1`, the complete npm lock, explicit `osaka`
settings, normalized source/import hashes, ABI, creation/runtime bytecode,
metadata, and storage layouts. Its non-writing compiler check reproduces the
exact creation bytes consumed by WP-06T17, while source lock v3 binds the build
manifest and rejects artifact drift. This proves only the local
source-to-artifact path. Deployed code/address identity, bridge-to-token
binding, current or historical ownership and mint/supply state,
finality/state-proof acceptance, historical absence, cutover, committed-vault
evidence, mint authority, Gate 5 and readiness remain false.

## Current Peg-In Collateral Closure

The V4 pooled-reserve path now has local executable evidence for the P0
deposit/refund invariant that Gate 5 depends on but does not itself close:

- the source-lock transaction creates an exact refundable deposit;
- the deposit transition consumes that source lock and the exact reserve
  predecessor atomically, with a separately funded fee;
- the reserve supports both its first deposit and later append-only 32/32 AVL
  commitment insertions while preserving the exact free-reserve seed;
- the pinned JVM evaluates the source-lock and reserve predicates together for
  two chained deposits and the exact timeout/refund boundary;
- a non-authorizing observation candidate requires two stable, agreeing views,
  direct ancestry from the inclusion header through the reported current tip,
  an independently observed canonical target at the profile-bound successor
  depth, consumed source and predecessor boxes, and an AVL membership proof
  retaining the deposit in the current reserve descendant;
- the stable mint identity is exactly
  `Blake2b256("E2S_PEG_IN_MINT_ID_V4" || profileId || sourceBoxId || depositCommitment)`.

This is local acceptance and fail-closed observation groundwork, not confirmed
lineage, Ergo finality, mint eligibility or mint authority. The next boundary
is a statically registered dual-RPC Ergo adapter, explicit
transaction-to-block inclusion binding, canonical target/tip evidence under
one stable snapshot, and immediate revalidation before a mint-admission
handoff. SQLite, a `verified` flag or a prior observation cannot substitute for
that read. No node check, signing, submission, broadcast, Gate 5 closure,
trustless status or production-readiness claim follows.

## Acceptance Gates

Phase 011 is not accepted until every item below has linked evidence:

- Header/finality verification rules are specified and tested.
- P0 peg-in tests prove mint cannot occur while the refundable deposit remains
  spendable, and P0 peg-out tests reject stale-SCS and timeout beneficiary
  payout after burn reorg.
- The sidechain commitment format is stable and versioned.
- `0x04xx` extension keys are collision-safe across sidechains.
- Burn tree leaf encoding has local and cross-language golden vectors.
- Local proof vector evidence recomputes `bridgeEventRoot`, inclusion proof, and
  settlement binding through `trustless-burn-proof.ts`; completed Gate 5
  evidence uses a non-empty inclusion proof path, such as the checked multi-leaf
  vector, rather than a single-leaf `proof: []` baseline.
- Local proof vector evidence includes structured fail-closed negative cases for
  the bridge-native proof-core fields before broader contract and finality
  evidence can close Gate 5.
- Local peg-out burn extraction rejects receipts that do not satisfy the
  declared `requiredSidechainConfirmations` policy before leaf construction.
- Positive contract tests accept a valid burn inclusion proof.
- Full-transaction evaluation proves every consumed input script accepts the
  same authenticated root, burn identity, payout, and DUP transition; testing
  the unlock script in isolation is insufficient.
- Positive proof acceptance evidence binds the same `bridgeEventRoot`, `burnId`,
  `recipientErgoTreeHash`, and `amountNanoErg` values declared in the commitment
  and burn-proof evidence rows.
- Negative contract tests reject wrong sidechain ID, recipient, amount, burn ID,
  event index, commitment root, and stale header/finality depth.
- Local proof-core negative-test rows cite the exact Local Proof Vector
  `negativeCase` name and observed proof-core rejection string for wrong
  sidechain ID, recipient, amount, and malformed inclusion path.
- Reorg drills show that reverted sidechain commitments cannot release ERG.
- Finality tests distinguish sidechain finality from Ergo anchor age.
- DUP reconciliation still commits local state only after canonical Ergo
  confirmation.
- Independent review covers the consensus, commitment, and proof format.

## Evidence Capture

Use [Trustless Burn Verification Evidence Template](trustless-burn-verification-evidence-template.md)
for completed Gate 5 evidence. This template is expected to fail validation
until every required component, commitment field, burn proof binding, negative
test, local proof vector, publication decision field, and reviewer sign-off is
linked.

Validate completed evidence before linking it from the release checklist:

```powershell
cd relayer
npm run trustless:validate -- ../evidence/trustless-burn/<completed-trustless-burn-evidence>.md
```

The validator is a claims-control guard only. Passing it cannot by itself make
the bridge production-ready; it only proves that Gate 5 evidence is structured
and linked.

## Publication Rules

- Until this plan is implemented and reviewed, release notes must classify burn
  interpretation as transitional and trusted.
- The V2 contract may be called proof-bound or trustless-target code, but the
  complete path must not be called trustless while tracker root admission and
  aggregate DUP remain committee-authorized.
- "Trustless bridge" and "production-ready bridge" claims remain blocked.
- A public institutional-reference release may mention this plan only as a
  roadmap item unless completed evidence is linked from the release checklist.
- Any benchmark or scaling claim must state whether it uses the transitional
  trusted burn path or the final trustless proof path.
- WP-02 source containment and manifest-bound non-authorizing observation tooling are
  implemented, but the reviewed historical manifest and real network evidence
  remain open. Gate 6 authority cannot remedy the Gate 5
  proof/finality boundary.

## Links

- [Ultimate Bridge Roadmap](ultimate-bridge-roadmap.md)
- [Aggregate Settlement Threat Model Refresh](aggregate-settlement-threat-model.md)
- [Security Evidence Matrix](security-evidence-matrix.md)
- [Institutional Release Checklist](release-checklist.md)
- [Trustless Burn Verification Evidence Template](trustless-burn-verification-evidence-template.md)
