# Consensus Source Baseline

WP-03 makes the code used for the sidechain execution layer and the Ergo
extension producer reconstructible from public immutable inputs. The canonical
machine-readable identity is `sources/consensus-source-lock.json`.

## Locked Sources

| Component | Public source | Immutable identity | Bridge-owned material | Current role |
|---|---|---|---|---|
| Substrate/Frontier | `https://github.com/polkadot-evm/frontier.git` | Base `75329a2df49e2cc7981485392c31160929d1bd48` | Superproject gitlink plus `sources/frontier/0001-bridge-runtime-commitment.patch` | EVM execution, bridge-native burn commitment production, GRANDPA proof serving, and native finalized-state verification |
| Ergo node | `https://github.com/ergoplatform/ergo.git` | Base `2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1` (`v6.0.2`) | Versioned patch `sources/ergo-node/0001-sidechain-extension-fields.patch` | Devnet `0x04xx` extension producer from operator-provided bytes |
| Solidity bridge/token | npm-locked `solc 0.8.35` and OpenZeppelin `5.6.1` | Package lock, exact compiler/settings, normalized source closure, and artifact manifest | `solidity/compile.js`, sources, settings, and generated identities | Reproducible local ABI, creation/runtime bytecode, metadata, and storage-layout closure |

The source lock v3 binds the Solidity build manifest. A clean local check is:

```bash
npm --prefix solidity ci --ignore-scripts --include=dev
npm --prefix solidity run check
```

The tracked Frontier patch adds a post-assembly callback to `pallet_ethereum`
and a bounded runtime producer. The producer accepts only successful canonical
`PegOut(address,uint256,bytes)` logs from the configured bridge address, derives
the V1 Blake2b burn leaves in transaction/log order, and stores the format
version, execution block hash, `bridge_event_root`, burn count, and leaf hashes
in runtime state.
Malformed matching logs and burn-count overflow invalidate block execution
rather than silently omitting exits. The same patch exposes the upstream
`grandpa_proveFinality` RPC with the voter state and authority set used by the
running service. Its bridge-owned `bridge-finality-proof` crate strictly decodes
that proof, checks signatures, threshold, vote ancestry, and the exact ordered
header span, and rejects oversized input. The same patch exposes its official
warp provider as the read-only `bridge_grandpaWarpProof` method. The crate
authenticates zero-delay scheduled authority handoffs from an explicitly
trusted set and rejects forced or mixed changes, nonzero delays, invalid sets,
set-ID overflow, stale ordering, non-canonical SCALE, and unbounded input.

The patch also carries a template-node whole-block atomicity test. It deploys
the exact checked-in `SERG` and `ErgoBridge` creation bytecode in three accepted
blocks, transfers token ownership to the bridge, and submits a fourth candidate
whose exact pre-finalization overlay proves the bridge/token binding, Solidity
replay write, token supply increase, and recipient balance increase before the
native callback rejects same-block profile activation. The block builder and
`FrontierBlockImport` both reject the candidate; the accepted head and exact
EVM/native/event/receipt snapshots remain unchanged, and no candidate header or
body is retained. Because the rejected candidate reuses a valid sibling's
runtime-produced state root and digest, the test also imports a separate mixed
header/body control assembled from two otherwise valid siblings. Deterministic
Wasm backtrace frames distinguish that generic mismatch from the candidate,
whose import shares the direct callback-failure witness path. The original
valid sibling imports after every rollback assertion. This prevents a broken
importer or an unrelated header mismatch from making the rollback result
vacuous without claiming that the rejected candidate has a valid header. The
source verifier binds each Frontier fixture Git blob to the exact checked-in
Solidity creation bytecode. The package-local compiler check independently
recreates those bytes and the ABI, runtime bytecode, metadata, and storage
layout from the locked dependency/source/settings closure. Together they prove
the local source-to-fixture build path, not any deployed contract address,
runtime code, ownership history, sidechain finality, or Gate 5 status.

The same patch now carries a second whole-block atomicity replay for the V4
reservation path. The normal `frontier-template-runtime` contains only the
rejected source-proof verifier and disabled V4 profile activation. A separate
`frontier-template-v4-test-runtime` package is marked `publish = false`, is
excluded from the workspace default members, and is linked into the node only
through the non-default `bridge-atomicity-v4-test-runtime` feature. The node's
normal chain specifications and default dependency graph continue to select
the fail-closed runtime. The test runtime uses distinct
`frontier-template-v4-test` specification and implementation names. The
integration client replaces only its synthetic genesis `:code` with the test
runtime WASM. After an exact reservation is stored in the direct parent, one
candidate executes both the reserved owner mint and a second unreserved owner
mint. Runtime API reads
prove that both EVM calls changed replay, supply, and recipient state in the
candidate overlay before the V4 post-block callback rejects the unreserved
mint. Authoring and `FrontierBlockImport` reject that candidate, retain the
parent head, retain the exact pending reservation, and leave no EVM, native,
event, receipt, status, header, or body residue. A corrected sibling containing
only the reserved mint then imports, increments the sender nonce once, and
moves that exact reservation from pending to one terminal consumed record.
This proves the combined local V4 import rollback and recovery path. The
import-level accepting fixture verifier exists only in the explicitly named
non-publishable test runtime and is absent from the normal non-test build/WASM
and default node graph. Unit-test-only fixture helpers in the normal source
remain confined under `cfg(test)` and are not runtime artifacts. No deployed
profile, finality authority, mint authority, or Gate 5 status follows.

The normal and V4 test runtimes also statically register the distinct
`ErgoAutolykosCommittedVaultSourceProofV1` compatibility family. Its fixed
1,065-byte statement ports the exact WP-01D branch, header, signed-transaction,
refundable-source, committed-vault, native-ERG amount, recipient, and current-
state public inputs under new proof-system, proof-profile, finality-policy, and
verifier-profile domains. TypeScript and Rust reproduce the same statement
bytes, SHA-256, and domain-separated statement ID. The production consumer now
parses that statement, verifies the exact `E2SARW01` branch witness described
below, checks their complete semantic join, and then rejects the result.
Compile-time activation is false and no dispatchable, storage transition,
reservation, EVM call, mint, or funds route consumes it. Transaction,
source-box, and vault witness bytes remain absent from the runtime consumer.

A separate bounded TypeScript recovery packet now carries replayable
profile/checkpoint data, raw branch suffixes, block and signed-transaction JSON,
the refundable source box, route, and the four ordered source/vault reads. Its
SQLite lineage stores only canonical raw packet bytes and digest links. Restart
validates every historical packet and transition before replaying every verifier
and rebuilding the same non-authorizing statement. Profile, checkpoint, route,
commitment transaction, and refundable-source bindings cannot drift between
generations. Selected work cannot regress, and an equal-work packet cannot
replace the selected tip; only a strictly heavier supplied branch can do so.
Special JSON keys remain digest-distinct, packet and generation bounds apply
before parsing or insertion, and source restoration, vault replacement,
generation/order drift, historical or latest stored-byte corruption, and
complete database loss fail closed. An older copied database can still
replay its older valid generation because local storage cannot prove that a
later generation existed; an external monotonic anchor is required before any
future authority use. This JSON packet is an off-chain recovery format, not the
future canonical binary runtime witness. Neither local replay nor the fixed
statement proves complete branch knowledge, canonical Ergo consensus,
deterministic finality, transaction execution, Gate 5 closure, or readiness.

The proof core now also defines a distinct bounded binary relay-runtime
witness. It starts with the eight-byte `E2SARW01` magic, format and zero flags,
an exact total length, a domain-separated format-family ID, and a fixed
four-entry section directory. The ordered sections encode the exact SPV
profile ID and profile, pinned
checkpoint plus EIP-37 context, current and supplied competing branch headers,
and target header. Every header is the canonical Ergo wire encoding, length
bounded to 4,096 bytes, reparsed without aliases, and required to reproduce its
input bytes exactly. The decoder then reruns the existing Autolykos V2, EIP-37,
ancestry, checked-`UInt256` work, time and checkpoint checks. It rejects
duplicate branch tips, requires deterministic competing-tip order, retains the
current branch only when no supplied branch has greater work, and requires the
target at policy depth in that branch. The decoder also requires the embedded
SPV profile ID to match a statically supplied expected profile. The pinned
historical differential window encodes to 3,135 bytes with SHA-256
`bc8587464125825f6c6f95c375141c6c68db8f7fed993717167cbf4b4d339ffc`
and domain-separated witness ID
`a0667c06a13c0a29dc11a59b1cc2f0ce7dc302bfec342036adf885f8a3d0488a`.
This envelope deliberately excludes transaction, source-box and vault bytes;
it is the relay portion of the eventual runtime witness, not a complete source
proof. The source-locked normal and V4 test runtimes now parse the same bytes,
recompute the static profile, rerun the bounded Autolykos V2, EIP-37, branch,
work and target-depth checks, and join every relay-derived statement field
before the production consumer rejects. The shared golden vector and isolated
profile, branch, target, duplicate-tip and statement-rebinding negatives pass
in both runtimes. Verification therefore closes the byte-identical relay
consumer boundary only; the consumer remains non-authorizing.

The transaction and UTXO codec decision is frozen in
[`ergo-scorex-runtime-codec-decision.md`](ergo-scorex-runtime-codec-decision.md).
The exact sigma-rust 0.28.0 release is not a reproducible `no_std` Frontier
dependency, so this profile uses bounded in-tree Scorex and UTXO-proof codecs.
It keeps `E2SARW01` and the current 1,065-byte statement immutable: V1 contains
process-owned JSON and RPC-observation digests that cannot be established from
runtime bytes.

The distinct `E2STXW01` transaction witness and 978-byte V2 statement now bind
the exact signed transaction, both transaction-root leaves, the refundable
source and output-zero vault. The distinct 652-byte `E2UTXW01` witness then
binds all 33 supplied state-root bytes, ordered vault membership and refundable-
source non-membership, the complete vault value, and the bounded proof. The
588-byte V3 statement reparses all three witnesses, recomposes V2, requires the
UTXO root to equal the selected target header's state root, and binds both keys
plus the complete vault bytes to the transaction transition.

A dedicated fixed-route node adapter and pure relayer-core composer now close
the stable current-tip capture step. The adapter keeps its HTTP client closure-
private, derives the exact two-key request from a snapshotted `E2STXW01`, and
reads the complete transition header before and after the bounded proof POST.
The core independently rederives the keys and vault value and verifies the
resulting `E2UTXW01` against that exact header. Static node-adapter provenance
is a separate process-local brand from pure tuple-composition provenance; both
remain non-authorizing. The capture must occur while the transition header is
the exact tip and be retained while confirmation depth accrues; it is not
historical-proof support, checkpoint authentication or complete-branch
authority.

The retained form is now concrete. A strict canonical packet stores and
domain-separates the exact target header, transaction parser profile,
`E2STXW01`, `E2UTXW01`, source-capture digest and an explicitly false authority
map. Normalization recomputes every derived identifier and replays the exact
transaction and UTXO witnesses. Supplying the packet after a JSON round trip or
restart therefore reproduces the same cryptographic capture, but intentionally
does not persist the static adapter's process-local node provenance. The packet
and any journal carrying it remain evidence transport, never mint or funds
authority.

A separate non-authorizing composition accepts that retained packet plus a
later `E2SARW01`. It replays the checkpoint/profile, PoW, EIP-37 transitions and
all supplied branches, requires deterministic greatest-work selection among
those branches and the retained target at policy depth, then rebuilds the exact
V3 statement. This proves consistency relative to a profile-supplied checkpoint
and the supplied branch set only. It does not authenticate the checkpoint or
prove that every branch on the Ergo network was observed.

TypeScript, the source-locked normal production runtime, and the V4
non-publishable test runtime reproduce the same V3 bytes and domain-separated
ID. Both runtime registrations remain compile-time disabled and reject after
validation. This closes only the supplied-root lookup, semantic join, retained
witness replay and supplied-branch composition boundary. External checkpoint
authentication, a reviewed bounded source-set and branch-admission policy,
globally canonical Ergo consensus, transaction execution, runtime admission,
mint and funds authority, Gate 5, and readiness remain open.

All envelope integers are unsigned big-endian; each `u256` is exactly 32 bytes.
The fixed 72-byte header is `magic[8] || format[u8] || flags[u8] ||
sectionCount[u16] || totalLength[u32] || familyId[32]`, followed by four
`sectionId[u8] || sectionFlags[u8] || sectionLength[u32]` entries. IDs are
exactly `1=profile`, `2=checkpoint`, `3=branches`, `4=target`, in that order,
with zero section flags. Payloads concatenate in directory order:

The format-family ID is Blake2b-256 over ASCII
`E2S_ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_FAMILY_V1`, yielding
`a874c8b8b84d3bb619839d2105daea6e24b97f7fb2df352954f1935d7e7cc1ab`.
It identifies only this byte family and cannot select security policy. The
canonical fixture's exact SPV profile ID is
`222a776449ba3424f62222f99646aa900fd8f02d988c957f411e7e1ce8df5c3e`.

| Section | Canonical payload |
|---|---|
| Profile | Exact SPV profile ID, source network, checkpoint header and context IDs, checkpoint work, expected version, EIP-37 parameters, confirmation/header bounds and future-drift bound; fixed 225 bytes |
| Checkpoint | Source network ID, `u16`-framed canonical header, context count, then `height[u32] || timestamp[u64] || nBits[u32]` entries |
| Branches | Branch count, then role, observation time, header count and `u16`-framed canonical headers for each current/competing branch |
| Target | One `u16`-framed canonical header that must occur at required depth in the retained current branch |

The V4 activation transition now requires the independently stored
`BridgeAddress` to equal the reviewed profile bridge address before any
mutation. The same successful transition removes the `pallet_sudo` key before
installing the exact profile and sticky-enforcement state. Runtime negatives
prove that an absent or mismatched address leaves the profile, enforcement,
and Sudo key unchanged and emits no V4 activation event. A runtime positive
proves that the former Sudo holder can no longer retarget the bridge, write raw
storage, or replace runtime code after activation. The node-level positive executes the real nested
Sudo-to-Root activation, observes the Sudo key absent, and then admits the
direct signed reservation. This is locked local source conformance, not
evidence that a chain activated these bytes or that a finalized state proof
authenticates Sudo absence.

The normal runtime now also quarantines the exact bridge address inherited from
its parent state. Its compile-time legacy-mint policy is false in native tests
and WASM alike; compatibility fixtures require a separate test-only storage
marker. The direct-parent address snapshot is joined with current and
parent-profile addresses and remains protected across inactive, causal, and V4
modes, except where the exact active address is governed by the stronger
admission or reservation checks. Public bridge disable or retarget calls are
blocked. An absent inherited address means no legacy bridge can be registered
through that call.

The Ethereum transaction filter now rejects a direct top-level
`mintSERG(address,uint256,bytes32)` call to a quarantined inherited address in
pool validation, authored/imported block validation, and Frontier PreLog
execution before the EVM mutates state. Legacy, EIP-2930, and EIP-1559
envelopes share that path. Selector-only, trailing, malformed, and nonzero-value
calls remain rejected when they target a quarantined address. Parent snapshots
prevent a same-block retarget or stronger-profile activation from exempting an
inherited address. The declared and post-dispatch weight retains eight bounded
storage reads plus a reproducible 4,908-byte MaxEncodedLen proof estimate.
Native `pallet_evm` call/create/create2 extrinsics are disabled so they cannot
bypass Ethereum receipt and filter processing.

The node-level regression proves that a rejected direct call leaves the prefix
finalizable and importable without EVM, native, event, receipt, status, header,
or body residue. A separate forwarding contract proves the remaining internal
call surface: the top-level unrelated target passes the selector filter, but
the address-scoped post-block callback rejects the internal owner mint and
rolls back the complete candidate. A mixed-header control distinguishes that
callback witness from generic import failure. A real unrelated contract using
the same selector and emitting the same `PegIn` topic imports successfully, so
neither the selector nor the event ABI is globally reserved.

This closes the local owner-key-only mint bypass for a known inherited bridge
address. Before exact V4 activation, Root/Sudo can still mutate storage or
replace runtime code; the reviewed transition contains that authority only when
the exact activation call succeeds. It does not prove that the inherited
address covers every historical minter, that a deployed chain ran the reviewed
transition, that the deciding finalized snapshot has no Sudo key, that every
other Root producer is absent, or that a historical runtime has retired. An
internal/proxy call, or a direct call to the exact address governed by an active
stronger profile, still reaches EVM execution before the callback can reject it
and can therefore waste an authoring attempt; no mint state is imported.
Source-chain consensus, finality, funds authority, Gate 5 closure, trustless
status, and readiness remain unproved.

The source lock remains unactivated and therefore does not claim a runtime
upgrade version. Introducing these consensus-validity rules over an existing
chain requires a reviewed migration and a `spec_version` increment.

The patch also contains `bridge-state-proof`. It verifies the single fixed
`BridgeCommitment::CurrentCommitment` key against the `state_root` of the full
requested header, decodes the exact 109-byte V1 SCALE value, and composes that
state statement with the exact GRANDPA finality proof. Proof input is bounded to
256 nodes, 256 KiB total, and 64 KiB per node; duplicate nodes, missing values,
wrong roots, malformed values, wrong chain identity or height, and unsupported
burn counts fail closed. Since the runtime clears `CurrentCommitment` every
block, proof acquisition must use the burn-bearing block hash itself, not a
later finalized head.

The compact warp format omits ancestry from a trusted block hash. The bridge
therefore supplies every contiguous omitted header, checks exact parent/height
links from a reviewed checkpoint, rejects hidden scheduled or forced changes,
and joins the resulting authority path to a checkpoint tail ending at the exact
target finality horizon. The requested header must occur on that concatenated
chain, and the suffix after it must equal the finality proof's
`unknown_headers` byte-for-byte. Handoffs strictly before the horizon determine
the signing set; a zero-delay handoff at the horizon is still signed by the
outgoing set. This allows historical targets to remain verifiable after later
rotations. A versioned digest, supplied outside the proof-serving request,
binds the reviewed sidechain ID, checkpoint identity, set ID, and authority
list. An unavailable, self-selected, or incomplete trust root is rejected
rather than treated as finality.

`bridge-checkpoint-verifier` composes that path with the requested header's
runtime trie proof through one strict offline JSON interface plus a separate
`--trusted-anchor-digest` argument. The checked-in fixture includes a real
authority transition, GRANDPA signatures, descendant
finality proof, and trie proof; its co-located trust digest is explicitly only a
conformance input. The TypeScript adapter reproduces the native result, freezes
it against post-verification mutation, pins the verifier executable and exact
argv by reviewed SHA-256 digests, rehashes before and after execution, and
derives the V1 checkpoint candidate.
The sibling `bridge-rpc-proof-codec` performs bounded structural normalization
of exact `chain_getHeader`, warp-proof, and finality-proof responses. It emits
only acquisition metadata with `cryptographicallyVerified = false`; the
TypeScript collector pins that codec and each exact mode invocation by reviewed
SHA-256 digests and must pass the assembled package to
`bridge-checkpoint-verifier` before sidechain finality is reported. The
generated fixture places the target before a later authority rotation and
exercises this complete read-only collection path.
The Ergo patch inserts configured `0x04xx` bytes into candidate extensions; it
authenticates those
bytes once mined but still does not prove their derivation or acceptance by the
bridge contracts.

The bridge RPC preserves the upstream 8 MiB chunk limit and returns canonical
base64 rather than hex, keeping a maximum proof below the pinned node's default
15 MiB response limit without creating an unrecoverable 7-to-8 MiB gap. Native
validation also caps authority lists at the runtime's `MaxAuthorities = 32`
and requires every continuation fragment to be strictly newer than the last
accepted target. Generation runs on a blocking worker with a single in-flight
permit. Operators must still expose this historical proof method only on a
loopback or authenticated relayer endpoint and configure the node's RPC rate
limit; the method is read-only but database- and encoding-intensive.

## Fresh Checkout

Populate the exact Frontier gitlink before validation. The source lock supports
two repository layouts without changing any locked source bytes:

- the current superproject, where the bridge is under
  `ergo-sidechain-bridge/` and the parent `.gitmodules` owns that path;
- a future standalone bridge repository, where `.gitmodules` owns the local
  `substrate-node` gitlink.

For the current superproject, clone without recursive initialization and update
only the bridge-owned submodule path. This keeps unrelated sibling gitlinks out
of the bridge audit boundary:

```bash
git clone <superproject-url>
cd <superproject-root>
git submodule sync -- ergo-sidechain-bridge/substrate-node
git submodule update --init --recursive -- ergo-sidechain-bridge/substrate-node
cd ergo-sidechain-bridge
```

For a future standalone bridge checkout, initialize its complete submodule set:

```bash
git clone --recurse-submodules <bridge-repository-url>
cd <bridge-repository-root>
git submodule sync --recursive
git submodule update --init --recursive
```

Then create a dedicated LF-only Frontier worktree from the locked commit. The
patch uses zero-context hunks, so both `--unidiff-zero` and the raw-byte checkout
policy are required:

```bash
mkdir -p .source-cache
git -c core.autocrlf=false -C substrate-node worktree add ../.source-cache/frontier-patched 75329a2df49e2cc7981485392c31160929d1bd48
git -c core.autocrlf=false -C .source-cache/frontier-patched apply --check --unidiff-zero --whitespace=error-all ../../sources/frontier/0001-bridge-runtime-commitment.patch
git -c core.autocrlf=false -C .source-cache/frontier-patched apply --unidiff-zero --whitespace=error-all ../../sources/frontier/0001-bridge-runtime-commitment.patch
```

Prepare the Ergo source from the locked public base. The cache directory is
ignored by Git and can be deleted and recreated at any time.

```bash
mkdir -p .source-cache/ergo-node
git -C .source-cache/ergo-node init
git -C .source-cache/ergo-node remote add origin https://github.com/ergoplatform/ergo.git
git -C .source-cache/ergo-node fetch --depth=1 origin refs/tags/v6.0.2
git -C .source-cache/ergo-node checkout --detach 2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1
git -C .source-cache/ergo-node apply --unidiff-zero ../../sources/ergo-node/0001-sidechain-extension-fields.patch
```

Validate the tracked identities first, then the complete source checkouts:

```bash
cd relayer
npm ci
npm run sources:verify:lock
npm run sources:verify:workflow
npm run sources:verify -- --frontier-source ../.source-cache/frontier-patched --ergo-source ../.source-cache/ergo-node
```

`sources:verify:lock` discovers the repository root and validates the exact
gitlink and public submodule path for either supported layout, plus manifests
and both patch SHA-256 values. It deliberately reports that neither source
checkout was validated. `sources:verify` additionally requires the pinned
Frontier base with exactly the declared modified/added patch files and an Ergo
checkout whose only changes are the two declared patch files. Every declared
result must match its exact Git blob identity.

`sources:verify:workflow` parses the bridge-local GitHub Actions YAML and
validates the exact ordered standalone `consensus-sources` job. It derives the
source URL, commit, tag, patch path and build-command expectations from
`sources/consensus-source-lock.json`, requires recursive gitlink checkout,
accepts only the two locked patches, requires both builds before the final
source-identity recheck, and rejects superproject-relative, secret-consuming,
deployment, submission, broadcast, wallet and runtime-state commands. This is
local workflow syntax and command-graph validation. It does not execute the
hosted job.

An isolated Ergo-node task that does not build or execute Frontier may validate
only the patched Ergo checkout:

```bash
npm run sources:verify -- --ergo-only --ergo-source ../.source-cache/ergo-node
```

This mode does not validate or imply a Frontier build. The patched-devnet
launcher uses it before starting the pinned Ergo source in a fresh loopback-only
runtime directory with no known peers and UPnP disabled.

## Pinned Local Build Conformance

Build the Frontier template node with its committed Rust toolchain and lockfile:
The native build also requires a C++ toolchain, CMake, and LLVM `libclang`.

```bash
cd ../.source-cache/frontier-patched
export WASM_BUILD_WORKSPACE_HINT="$PWD"
cargo test --locked -p frontier-template-runtime bridge_commitment
cargo test --locked -p frontier-template-node rejected_post_block_callback_does_not_import_evm_or_native_state
cargo test --locked -p frontier-template-node --features bridge-atomicity-v4-test-runtime rejected_v4_mint_candidate_rolls_back_before_corrected_sibling_consumes_reservation
cargo test --locked -p bridge-finality-proof
cargo test --locked -p bridge-state-proof
cargo test --locked -p bridge-checkpoint-verifier
cargo build --locked --release -p frontier-template-node
```

After the native package is built, reproduce the Rust/TypeScript boundary from
the relayer directory:

```bash
cd ../../relayer
npm run checkpoint:finalized:native:verify -- \
  --frontier-source <absolute-patched-checkout> \
  --cargo <absolute-pinned-cargo-path> \
  --rustc <absolute-pinned-rustc-path> \
  --git <absolute-pinned-git-path>
```

The last command validates the exact locked Frontier checkout, rebuilds the
verifier binaries into a newly created isolated Cargo target using the exact
platform tool identities in `sources/native-verifier-toolchain-lock.json`,
validates the source checkout again, verifies both the checked-in request and its
reconstruction from exact synthetic read-only RPC responses, then joins the
finalized runtime commitment to the canonical Frontier receipt vector and one
target burn proof. Use `--frontier-source <absolute-patched-checkout>` when the
locked patch is applied in a separate worktree; arbitrary verifier paths are
not accepted by this command. Unsupported or drifted tool identities fail
closed, and pre-existing build outputs are never reused. This is local
conformance only: inherited build helpers and mutable Cargo dependency caches
are not fully content-attested, so the command does not produce a hermetic or
independently attested build and its result is not admission-eligible.
Build-target cleanup is also fail-closed: timeout or output-limit termination
may target only the still-live parent process tree. After the parent exits,
Windows process inspection is read-only; any surviving descendant or inspection
failure preserves the target for exit cleanup and fails the conformance run.
The Windows profile does not yet place the build in a kill-on-close Job Object;
it relies on bounded CIM absence checks after parent exit. Verified OS-level
process containment remains a prerequisite for an independently attested,
admission-eligible profile.
The current pinned tool profile is `win32-x64`; another platform must add and
review its own hash-pinned profile before this local capability can run there.
Live/devnet acquisition uses the same native collector through
`npm run checkpoint:finalized:native:collect`; see
[Native Checkpoint Proof Collection](native-checkpoint-proof-collection.md).

## Independently Attested Binary Profile

The local build above is not an institutional artifact attestation. The next
profile boundary is implemented by
`relayer/src/independently-attested-native-verifier-profile.ts`. It accepts a
domain-separated Ed25519 statement only when two distinct roles sign the exact
same canonical content:

- a builder key and an independent-reviewer key approved in the tracked
  `sources/native-verifier-attestor-lock.json`;
- distinct declared organizations and no reuse of a forbidden authority key;
- the exact consensus source-lock digest, Frontier commit and patch,
  `Cargo.lock` Git blob, and complete patched-source manifest;
- a vendored content-addressed dependency manifest with locked, offline,
  frozen Cargo resolution and no shared mutable cache;
- a complete build-tool manifest including compiler driver, linker, Windows
  SDK, and every invoked helper;
- a fresh release build target, exact reviewed Cargo arguments, environment
  allowlist, and source validation before and after the build;
- kill-on-close Windows Job Object evidence covering descendants, inherited
  handles, timeout termination, and output-limit termination;
- exact verifier/codec roles, byte sizes, SHA-256 digests, one unified execution
  policy digest, conformance input vectors, and conformance output manifest.

Private attestor keys, independent reproduction, and containment measurement
must remain outside the relayer process. The supplied profile cannot introduce
its own trust roots. The canonical registry is intentionally empty until real
external builder and reviewer keys are approved by source review, so the
institutional profile path currently fails closed.

Inspect that source-owned boundary with:

```bash
cd <bridge-root>/relayer
npm run checkpoint:finalized:native:attestation:verify -- --describe-reviewed-lock
```

After approved external keys and a signed packet exist, verify exact binary
bytes offline with:

```bash
cd <bridge-root>/relayer
npm run checkpoint:finalized:native:attestation:verify -- \
  --profile <absolute-signed-profile.json> \
  --verifier <absolute-bridge-checkpoint-verifier> \
  --codec <absolute-bridge-rpc-proof-codec>
```

Successful signature and byte validation still proves only that the artifacts
match the reviewed attestation policy. Cryptography does not prove
organizational independence. Supporting dependency, tool, containment, and
conformance manifests remain separately reviewable evidence whose signed
digests are bound by the statement; the validator does not infer semantic
completeness from a digest alone.

The v2 statement replaces opaque per-artifact invocation hashes with one
`executionPolicySha256` binding. Construction is acyclic: the policy binds a
domain-separated digest of the attestation core with that policy field omitted,
then the final signed statement binds the policy digest. The corresponding
`e2s.native-verifier-execution-policy.v1` object also binds the build dependency
digest, broker identity, validity interval and positive epoch,
exact target bytes, exact operation argv and request/result schemas, fixed I/O
limits, target environment, and separate runtime-dependency manifests. Those
manifests are semantically validated and bounded to at most 128 sorted system
DLL basenames. The WP-06P authority route now uses those declarations as a
broker allowlist: every retained direct PE import must be in the list, non-empty
delay-import descriptor sets are rejected, and normal root-process loader events
must remain within the same canonical System32 allowlist through exit. This is
measured Windows loader enforcement, not cryptographic exclusion of manual
mapping or injected executable memory.

The validator deliberately issues no executable capability and returns no
binary path. Re-hashing a mutable path immediately before returning it would
leave a replacement window before process creation. The policy-bound codec
route below uses the contained target-byte primitive and revalidates policy
freshness before every operation. The WP-06P execution authority additionally
reloads the canonical source-owned attestor registry before every launch and
again after broker execution before result provenance is issued, requires
reviewed-profile provenance, and supplies the signed profile digest, policy
digest, positive epoch, and runtime DLL allowlist to broker authority mode.
Authority stdout is exposed as a fresh copy of a private digest-bound snapshot.
Generic supplied-policy reports cannot mint this process capability.
Real externally signed artifacts and an installed epoch floor remain absent.
The source contract now separates tracker R9 from DUP R6 by exact Sigma
proposition, but an independently controlled operational attestor, Ergo
anchoring, on-chain finality-proof acceptance, Gate 5, and any trustless or
production claim remain open.

## Contained Native Process Primitive

`relayer/native-contained-launcher` is a dependency-free Rust/Win32 broker for
the target EXE byte boundary. It opens the source without write/delete sharing,
hashes the retained handle with CNG SHA-256, copies those exact bytes into a
cryptographically unique directory created relative to a retained root handle,
and flushes and rechecks staged file identity/size/digest. Launch uses final
volume-GUID paths while every namespace ancestor, the stage directory, and the
staged file remain retained without delete sharing. Protected DACLs grant stage
access only to the object owner, SYSTEM, and Administrators. It creates only
three inheritable pipe ends, uses `PROC_THREAD_ATTRIBUTE_HANDLE_LIST`, creates
the target suspended, assigns it to an unnamed kill-on-close Job Object before
resuming, and fails closed on timeout, output overflow, surviving descendants,
inspection failure, or unverifiable cleanup. Child stderr is discarded.

Authority mode defaults to the fixed-size V1 compatibility record. V1 binds the
profile digest, exact policy digest, and minimum policy epoch under its fixed
64-bit HKLM profile key, and holds the V1 installer mutex across final record
and policy-window validation plus `ResumeThread`. WP-06T13 adds an explicitly
selected V2 profile without reinterpreting V1. The V2 installer publishes the
reviewed broker at
the actual 64-bit Program Files known folder at
`E2SBridge\NativeExecution\v2\Images\<launcherSha256>`, protects the managed
filesystem and registry surfaces, and writes one exact 144-byte
`AuthorityRecordV2` only after final image verification. That record also binds
launcher SHA-256, size, volume serial, and 128-bit file ID. The broker retains
its own V2 image handle, resolves `FOLDERID_ProgramFilesX64`, requires the
handle's exact digest-addressed final path, one hard link, and no pending
deletion, then holds the distinct V2 mutex through child exit, cleanup, and the
complete buffered stdout write and flush. A missing, malformed, mismatched,
zero, rollback, contended, or abandoned authority state rejects; abandoned
ownership is released before that rejection.

For either profile, the broker validates retained PE32+ AMD64 structure and
imports, rejects
non-empty delay-import descriptor sets, starts the root under
`DEBUG_ONLY_THIS_PROCESS`, observes the initial loader
breakpoint and every normal DLL load through exit, terminates the job before
continuing any rejected loader event, and sets a kernel active-process limit of
one so direct descendants cannot execute before polling detects them. The
explicit V1 installer switch preserves its record-before-replacement ordering
and fail-closed legacy epoch-only migration. No installer, registry, or Program
Files mutation is performed by the relayer runtime.

`relayer/src/native-contained-process.ts` is the bounded Node adapter. It pins
the broker digest before and after a successful invocation, emits the exact
reviewed CLI contract, and does not return an admission capability. The V2
runtime-identity caller additionally accepts only a canonical
launcher-digest-addressed V2 suffix and selects `AuthorityRecordV2`; the broker
alone verifies the exact 64-bit Program Files known-folder root. The broker remains
part of the trusted relayer installation boundary. The V2 record closes the
managed mutable-path substitution seam at the local implementation level; it
does not turn that boundary into a universal atomic execution or sandbox
claim.

Run the pinned local checks with:

```bash
cd <bridge-root>/relayer
npm run native:contained:check
npm run native:contained:build
npm run check:windows
```

The policy-bound codec factory now connects all three acquisition-only codec
operations to this broker. Every call requires a process-provenance attestation
report, validates the unified execution policy immediately before invocation,
checks its binding to that report and the runtime manifests, permits only the
three fixed codec argv values, and applies the common 30-second, 32 MiB request,
16 MiB stdout, and 64 KiB stderr limits. The broker independently enforces the
same `[notBefore, expiresAt)` window against local system time before staging
and immediately before process resume. Codec output remains explicitly
`cryptographicallyVerified: false`.

WP-06P adds a stricter source-refreshed authority factory for the codec and
checkpoint verifier. The native proof collector can consume that verifier, and
the reviewed settlement-source factory now requires the exact same authority
for both artifacts. The reviewed v2 profile binds authority profile, attestation,
and policy IDs, the exact policy digest, a minimum policy epoch, the canonical
Program Files broker path, executable and invocation pins, and checkpoint
process-local authority provenance before
minting reviewed settlement-source provenance. The former direct-process
reviewed factory now fails closed, and daemon/check-only startup requires both
the public execution package and settlement profile. The direct codec and
verifier remain available only for bounded local candidate/conformance work and
cannot cross this settlement boundary.

V2 now proves the running broker's installation identity relative to the exact
installer-owned record while retaining the image handle. The required elevated
disposable-host crash/race/ACL campaign has not run, so operational activation
remains false. This still does not authenticate system time, exclude
administrator/kernel compromise or manual mapping, supply a real external
attestor packet, or establish an accepted installer-owned floor on this
machine. The signed policy deliberately retains
`executionAdmissionGranted = false`, and the new authority result retains
`settlementAuthorityGranted = false`. It is not a malicious-code sandbox:
the child retains the broker's user token, same-token compromise remains inside
the TCB, and service-mediated process creation is outside direct Job Object
ancestry. The attestor registry is still empty, so operational authority
execution remains unavailable. No admission, authenticated V2 provisioning,
Ergo acceptance, Gate 5, trustless, deployment, broadcast, or production
conclusion follows.

WP-06T14 uses two of these V2 candidate requests to preserve Substrate's
runtime-at-block-entry semantics. The execution request binds an expected peg-in
record shape for the execution block's post-state, while a separately collected
direct-parent request binds record non-membership and that parent state's
expected `:code`. Canonical SCALE headers must form one direct, consecutive pair
under the same trust anchor and deposit; the expected record must bind the
execution hash, height, sidechain, and profile generation. The expected producer
runtime is selected from the parent request's code, and the execution post-state
code expectation is recorded separately. Neither expectation is accepted as
proved state while the native child proof claims remain quarantined.

This is a quarantined immediate-pair candidate, not accepted finality or state
proof. It does not enumerate the complete finalized runtime history, detect an
omitted change-and-revert interval, prove historical mint absence, approve a
cutover, or authorize mint. Both native child outputs remain digest-only, no
daemon or reconciliation path consumes the pair, and all authority fields stay
false. Complete upgrade-history acceptance and reviewed per-runtime invariants
remain outside this immediate-pair object.

WP-06T15 replaces sparse parent/execution sampling with an explicit bounded
candidate interval. The caller must declare inclusive checkpoint and execution
endpoints plus one expected height, target hash, V2 statement, and
provenance-bound evaluator for every state. The collector snapshots that plan
before the first RPC. The composer then requires direct ancestry and consecutive
heights from the exact reviewed checkpoint post-state through the exact
execution block. Every pre-execution state expects record non-membership and
the final state expects exact membership.

The header parser now retains `RuntimeEnvironmentUpdated`. A changed expected
`:code` digest must carry the marker, while a marker with unchanged code is
retained as a non-transition because it can describe another runtime
environment update. The checkpoint baseline cannot carry the marker because
its parent is outside the interval. A code change in block `h` becomes active
at block entry `h + 1`; reappearance of an earlier digest is classified as a
reversion. The interval is capped at 257 states, 64 MiB of aggregate serialized
collection material, and a bounded cooperative aggregate acceptance deadline.
Each child receives no more than the aggregate time remaining, and a late
child result is rejected before entering the history. The completed wrapper is
checked again before provenance and return; current RPC interfaces do not
promise forced cancellation of an in-flight transport call. Returned collection
evidence is digest-only.

This is complete structural coverage of an expected candidate interval, not an
accepted finalized runtime history. Native child outputs remain quarantined;
stable-snapshot acceptance, state-proof acceptance, external custody, the
elevated launcher campaign, proof that the checkpoint predates deposit
eligibility, per-runtime invariant review, historical mint absence, cutover,
vault eligibility, and mint authority remain false. No daemon or reconciliation
path imports the T15 composer or collector.

In PowerShell, set the same workspace binding with
`$env:WASM_BUILD_WORKSPACE_HINT = (Get-Location).Path` before running Cargo.
This prevents the runtime WASM builder from resolving a fresh dependency graph
outside the committed `Cargo.lock`.

Test and build the patched Ergo node with Java 17 and the sbt version selected
by the Ergo source tree:

```bash
cd <bridge-root>
cd .source-cache/ergo-node
sbt "testOnly org.ergoplatform.mining.CandidateGeneratorSpec"
sbt assembly
```

Authenticated V2 contract compilation uses a separate minimal compiler project
at `relayer/tools/authenticated-v2-compiler`. Its source, build definition, sbt
properties, compiler parameters, and loaded `sigma-state` JAR SHA-256 are
locked by `sources/authenticated-v2-compiler-lock.json`. Build and validate the
deterministic runtime bundle once at a clean-checkout boundary:

```powershell
cd <bridge-root>
cd relayer
npm.cmd run compiler:runtime-bundle
```

The command validates the locked parent runtime and complete Java distribution,
downloads the fixed sbt 1.11.1 launcher from Maven Central and verifies its
source-controlled SHA-256 before direct Java execution, then builds with
disposable sbt, boot, Ivy, local-cache, home, temp, and Coursier directories.
Inherited JVM options and resolver credentials are excluded; the launcher and
exact generated bundle are re-hashed before success. It is a clean-checkout
gate, not an edit-loop prerequisite.

Sbt and its caches are not part of the authoritative execution path. The lock
binds the complete numbered bundle, ordered runtime classpath, compiled tool
classes, complete Microsoft OpenJDK 17.0.19+10-LTS distribution, exact
consensus-source-lock digest, Ergo patch digest, and patched blob IDs. The
conformance command validates this consensus source baseline and the exact
patched Ergo checkout, copies the bundle and JDK into a fresh private runtime,
invokes Java directly, and re-hashes the source and private copies afterward:

```bash
cd <bridge-root>
cd relayer
npm run contracts:authenticated-v2:compiler-selfcheck -- --ergo-source ../.source-cache/ergo-node
npm run contracts:authenticated-v2:derive-initial-binding -- --input <sanitized-identities.json> --ergo-source ../.source-cache/ergo-node --out <new-initial-binding-report.json>
npm run contracts:authenticated-v2:conformance -- --input <sanitized-input.json> --expected-package-digest <sha256> --ergo-source ../.source-cache/ergo-node --out <new-report.json>
```

Bundle construction may resolve missing artifacts from configured repositories.
The self-check proves that a clean rebuild has the locked bundle/classes and
reproduces the golden three-pass fixed-point tracker, unlock, and DUP tree
hashes. The authoritative conformance run itself has no dependency resolver and does not
invoke sbt. Its source resolver and provisioning-schema import are isolated from
the transaction planner, so this compiler check does not require generated AVL
WASM artifacts.

Its reviewed compiler has no network route and its child HOME, application-data,
temporary, PATH, JAVA_HOME, and override environment are isolated. This remains
a deterministic local execution boundary, not an operating-system
network-isolation attestation, and retained report JSON is never sufficient to
authorize setup.

The parent Node, tsx/esbuild loader packages, package lock, and Git executable
are identity-checked; Git receives a reconstructed environment without inherited
`GIT_*` variables. Bundle and JDK snapshot files are made read-only and checked
again after execution. The remaining threat boundary is explicit: the run
requires an exclusive trusted OS user/session and does not defend against a
malicious concurrent process already executing as that same user.

Source validation reconstructs status from the raw `HEAD` tree, index tree,
untracked paths, and working-file bytes. A reviewed text path may differ solely
by CRLF insertion. Neither `git status` nor path-aware `git hash-object` is used,
so clean filters cannot conceal content drift. Real byte changes, index drift,
untracked files, and the two declared patch files retain their normal strict
treatment.

The active-root workflow `.github/workflows/bridge-consensus-sources.yml`
retains the current superproject reconstruction. The bridge-local
`.github/workflows/relayer-checks.yml` now carries the standalone
`consensus-sources` job with the same source reconstruction and build closure in
standalone-relative paths. It performs recursive checkout, both locked patch
applications, the Frontier verifier/runtime tests and node build, the targeted
Ergo patch test and node assembly, and source identity validation before and
after the builds. A local `sources:verify:workflow` pass proves only YAML and
command-graph conformance. A hosted run bound to the exact candidate commit is
separate promotion evidence.

## Ownership And Next Step

| Surface | Owner in this baseline | Next implementation owner |
|---|---|---|
| Frontier source identity and build | Pinned base plus bridge-owned patch | Upstreamable patch maintenance and runtime upgrade review |
| `bridge_event_root` derivation | Implemented for successful canonical `PegOut` logs, with a native exact-key state-proof verifier | Integrate the verified value and authenticated authority root into exact checkpoint admission |
| Ergo `0x04xx` insertion | Versioned devnet patch, operator-provided input | WP-05 reviewed producer integration |
| Sidechain finality proof | Exact GRANDPA proof verification from a reviewed domain/checkpoint/set anchor, including historical targets across zero-delay handoffs and exact runtime-state inclusion | Reproduce or aggregate the authenticated checkpoint rule for Ergo `0x0401` admission and on-chain acceptance |
| Peg-in producer runtime | Explicit checkpoint-to-execution V2 expectation interval plus source-locked `E2SARW01`, `E2STXW01`, `E2UTXW01`, V2 and V3 composition; stable exact-current-tip proof capture, canonical retained-packet replay and later supplied-branch depth composition are implemented but non-authorizing | Authenticate the checkpoint through a reviewed static profile, define the bounded independent source-set and branch-admission policy, compose that result with the retained capture, then close runtime-history, custody, deployment-lineage and mint-authority prerequisites separately |
| Trustless burn acceptance | Not implemented | Phase 011 / Gate 5 on-chain acceptance |

This baseline now closes source reachability, patch provenance, and runtime-local
burn-root production, exact GRANDPA proof verification under an expected set,
compact zero-delay scheduled handoff verification from a trusted set, and
native binding of the burn commitment to the requested header state root. It
also binds that trust root to the sidechain domain and checkpoint, reconstructs
compact-proof ancestry through the finality horizon, and verifies the exact
checkpoint package offline. It does not authenticate the resulting candidate
under Ergo `0x04`, prove ErgoScript acceptance, close Gate 5, or support a
trustless or production-ready claim.
