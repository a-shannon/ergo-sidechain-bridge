# Federated Genesis Runtime

## Scope

The dedicated `frontier-template-v4-fed-genesis-runtime` initializes a fresh
V4 mint-reservation profile at genesis without Sudo or post-genesis Root
activation. Its source-attestation authority is the federation compiled into
that runtime, not a profile identifier supplied by a caller.

The dedicated node selects this runtime and accepts typed genesis through its
compiled WASM. The provisioning producer now connects actual JVM tracker and
family compilation to that loader. Its synthetic configuration passes
`build-spec` and starts two isolated nodes with matching genesis storage.
Fresh usable federation custody, observed Ergo family inputs, transaction-pool
admission and operational reservation-to-mint remain open.
The existing main runtime stays inert; LAB/TestClient remains a separate route.

## Source Closure

Apply these inputs to a separate checkout in this order:

1. Frontier commit `75329a2df49e2cc7981485392c31160929d1bd48` from the
   [consensus source lock](../sources/consensus-source-lock.json).
2. [Base patch 0001](../sources/frontier/0001-bridge-runtime-commitment.patch),
   SHA-256 `bd8500696af4dd7b67dd99c9446f5ef2f23803e58f6669a5e80d8548124d7634`.
3. [Genesis overlay 0004](../sources/frontier/0004-federated-genesis-initialization.patch),
   SHA-256 `b3688c77c1a6a2b85b95367057572f053056fa11ee31ac291373571717dd7331`.
4. For the node, [selection overlay 0005](../sources/frontier/0005-federated-genesis-node.patch),
   SHA-256 `ff24b3ca5063371462c8257cfd9018e586824f33b0965a4a5025b41dd84c61ce`.

Overlay 0004 changes eleven source files. It adds one non-publishable runtime
crate and its integration tests, separates execution permission from public
activation permission, and extends the typed genesis consumer. Its Cargo lock
change adds only the local package entry. It does not replace the source lock,
enable the existing node, or require LAB application overlays 0002/0003 for
these native tests. Historical build and campaign pins still identify their
original source closure.

Overlay 0005 changes only the node manifest, its local lock dependency,
runtime/CLI selection and the typed loader with direct tests. It introduces
no runtime, proof, contract or application-byte changes.

V4 profile bytes remain exactly 349 bytes. Existing proof formats, domains,
verifier IDs, contracts and ErgoTrees are unchanged. A new target must derive
its own complete height-zero profile identities; an older activation packet
cannot be relabelled.

## Initialization Contract

| Producer and fields | Deciding consumer | Required property | Failure prevented |
|---|---|---|---|
| Build inputs: complete V1 public federation and derived profile ID | Package-specific build parser and runtime profile provider | Exact canonical verifier ID; valid threshold, ordered key set and matching derived ID; no static reference member | A caller-selected ID or mixed reference federation substituting for runtime authority |
| Typed genesis: operator and canonical V4 profile | Bridge pallet genesis builder | Field required only by the dedicated runtime; exact decode, height zero and complete existing profile validation | Missing, unknown, truncated or reinterpreted initialization |
| System and Sudo state | Genesis builder | Actual height zero, absent raw Sudo key and empty bridge storage namespace | Reinitialization over legacy, replay or partially installed state |
| Genesis EVM code and quarantine address | Genesis builder after EVM genesis | Exact profile-declared bridge/token code hashes and lengths; matching bridge address | Application bytes differing from the selected profile |
| Bridge and token constructor storage | Genesis builder | Nonzero distinct operator; bridge owner and token binding; token owner, name and symbol; exact storage maps | Paused state, hidden balances, allowances, outstanding supply, fee claims or replay records at launch |
| Validated profile | Three bridge authority writes | Install bridge address, profile and sticky enforcement only after all checks | Partial installation of mint authority on an invalid genesis |
| Profile and enforcement state | Pre-block and non-genesis post-block callbacks | Both remain present; existing profile and mint predicates still execute | Missing state silently falling back to a legacy route |
| Public Root call or repeated typed initialization | Activation gate and empty-namespace check | Reject replacement; preserve storage | A second initialization or administrative authority switch |

The EVM code hashes are declared by the genesis profile. Matching those hashes
does not establish that the code was independently reviewed. Target
provisioning must bind the exact reviewed application, storage layout,
federation and chain identity before granting an operational claim. The
initializer proves a fresh bridge namespace in the supplied genesis, not the
absence of historical liabilities on some other chain or profile.

The runtime permissions are separate:

| Runtime | Public V4 activation | V4 execution | Typed V4 genesis required |
|---|---|---|---|
| Main | Disabled | Disabled | No; supplied V4 genesis rejected |
| LAB and V4 test | Existing permission retained | Existing permission retained | No; supplied V4 genesis rejected |
| FED genesis | Disabled | Enabled for its compiled profile | Yes |

Ethereum's height-zero genesis callback precedes bridge initialization. The
mandatory-state post-block check therefore starts at nonzero native height;
the first ordinary block already requires the installed profile before EVM
execution. This exception is not a post-genesis activation path.

## Native Verification

Use the locked Rust 1.82.0 toolchain and dependencies from the source closure.
The following public bytecode fixtures must be available at their source-lock
paths under `template/node/src/tests/res/bridge-atomicity/`:
`ErgoBridge.bin`, `ErgoBridge.runtime.bin`, `SERG.bin`, and `SERG.runtime.bin`.
Use the exact lock entries, not newly compiled substitutes.

Set `BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_SCALE_HEX` to the existing V1
encoding of the selected public federation and
`BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_ID_HEX` to its derived identifier.
These shared input names do not enable the LAB runtime. Native component
tests used epoch 7, threshold 2, ordered public keys `0x41` repeated 32 times
and `0x42` repeated 32 times, validity bound 64 and canonical verifier ID
`0be2efc7e753d2ac3d93a6c3968164568fa1053a47524b475728a56a1f4c813d`.
The derived profile ID is
`3e7d46eec3650d7c19f1712323bb08b0f8df19e79fb617efab20244c765585c5`.
These bytes test configuration, not usable signer custody or quorum signing.

From the patched Frontier checkout, with those public inputs set:

```powershell
$env:SKIP_WASM_BUILD = '1'
cargo test --offline --locked -p frontier-template-v4-fed-genesis-runtime -- --test-threads=1
cargo test --offline --locked -p frontier-template-runtime -- --test-threads=1
cargo test --offline --locked -p frontier-template-v4-lab-runtime genesis -- --test-threads=1
```

The FED crate is tested through its normal library, not a `cfg(test)` runtime
with fixture-only proof bypasses. Results: eight runtime integration tests,
three build-profile tests, all 114 main runtime tests and the LAB default
genesis test passed. The negative matrix isolates malformed profile fields,
application/code/owner/pause mismatches, Sudo, height, existing state,
reference-member substitution and unknown verifier identity. Missing-profile
and missing-enforcement cases assert the exact pre-block and post-block error
and unchanged storage. A valid full `RuntimeGenesisConfig` builds and
`Executive` executes and finalizes its first block.

The shared build script is also an integration-test target; Cargo reports a
duplicate-target-path warning. Native builds additionally report unused
imports and generated constants. These warnings are retained, not suppressed
or treated as acceptance evidence.

## Typed Provisioning

The [runtime genesis producer](../relayer/src/substrate-federated-runtime-genesis-v1.ts)
constructs application, family and height-zero profile identities in this order:

```text
public federation -> compiled runtime
pre-genesis domain + application + runtime pins -> application identity
application identity + tracker/family compilation -> family ID
family + application + proof profile + finality -> height-zero V4 profile
typed genesis -> actual genesis/spec identity -> separate target binding
```

`prepareSubstrateFederatedGenesisV1` takes an explicit launch domain, EVM chain
ID, application/operator addresses, pinned WASM bytes, public federation
profiles and native endowments. It loads the tracked Solidity artifacts and
storage layouts, rejects application precompile addresses and derives new
pre-genesis identity domains. The checkpoint and mint profiles must use the
same source members, threshold and epoch; neither may substitute reference
source keys for the selected federation.

Use its application and checkpoint profile with the existing V2 tracker and
family JVM compilers. `buildSubstrateFederatedGenesisV1` requires their actual
same-process family receipt and an exact captured compiler input. It emits
the existing 349-byte V4 profile with the compiled family ID as lineage,
activation height zero and a 64-block pending window. It cannot install a
profile from a copied receipt or from a different application/federation.

The JSON is the full FRAME configuration, including typed byte arrays for
EVM code and the selected runtime's payment/base-fee defaults. The isolated
manual-seal node uses the SDK's public Alice Aura/GRANDPA identities, serialized
as SS58 strings. The GRANDPA client initializes its authority set even when
voting is disabled; an empty set accepts offline genesis but prevents startup.
These development block-authoring keys are not bridge source-attestation or
Ergo-admission keys and establish no independent consensus authority. Native funding
uses exact integers and rejects individual or total issuance overflow. Bridge
and token constructor storage start with no token balances, supply or replay
entries; native fees are endowed separately. The result is a candidate, not
an observed target, signer capability or mint authorization.

The direct test uses one real JVM tracker/family pair for its positive and
negative joins. A separate run with the compiled WASM passed the built node:

```powershell
frontier-template-node build-spec --chain fed-genesis:typed-genesis.json --disable-default-bootnode --raw
```

The output's exact runtime code, V4 profile, sticky enforcement, bridge
address and absent Sudo key were checked. Synthetic input IDs selected the
Ergo family; this does not establish actual singleton issuance or custody.
The tested genesis JSON SHA-256 is
`262af44a977f93f9cde6b36ecc7a81f8763583089e1237688a70c7f40e933b5d`;
the raw spec SHA-256 is
`a0ca5d99860d7e0036b59990e7e0a47669a8b387c230fff12fec8b46372a2c26`.

## Isolated Node Startup

`withOwnedFederatedGenesisDevnetProcessesV1` in the
[process owner](../relayer/src/substrate-federated-authority-safe-devnet-process-v1.ts)
passes the original pinned typed bytes to `fed-genesis:<path>` with manual
sealing and GRANDPA voting disabled. It retains the existing executable,
listener, peer, file-identity and cleanup checks. Its receipt is separate from
the legacy acceptance and recovery receipts; `chainSpecSha256Hex` identifies
the supplied typed configuration, not the generated raw spec or genesis hash.

The exact node binary listed below started two fresh loopback-only processes.
Both reported genesis
`704ea6168382f946a08468333b12c41e39f3283f22b67d968b2b8d7e77185e7e`
at height zero and runtime `frontier-template-v4-fed-genesis` version 1.
All 51 expected raw storage entries matched on both nodes, including the exact
runtime bytes, V4 profile, sticky enforcement and application state. Sudo was
absent, both transaction pools were empty, and cleanup released both processes
and their listeners. No transaction was submitted.

This configuration still uses synthetic Ergo input IDs and configuration-only
source-attestation keys. It is a running-loader check, not a provisioned
two-way bridge or reusable custody. The next target must use fresh retained
signers and observed Ergo inputs, and bind its own genesis identity.

## Observed Input Compilation

`compileObservedSubstrateFederatedGenesisV1` in the
[observed-input compiler](../relayer/src/substrate-federated-observed-genesis-v1.ts)
connects an owned Ergo reward observation to the typed producer. It consumes
the exact active target, setup signer and unbound source-attestation session,
then derives federation profiles from that session. The history receipt must
match the discovery digest, Ergo genesis, anchor height/hash and all three
issuance-input IDs. The setup key must also be the selected Ergo-admission key.

Both pinned JVM compilers consume these identities. Custody and the owned
target are rechecked after each compiler returns. A disposed session or one
already bound to another launch cannot supply a new genesis configuration.
The caller keeps the sessions and target alive through later consumers.

Component coverage uses fresh custody and real JVM compilation, with stubbed
observation boundaries. This is not a fresh-node campaign. Observed reward
inputs identify future singleton issuance; they do not prove that those
singletons have been issued. The candidate also does not prove EVM operator
custody, a runtime compiled with those fresh attestors, target-node acceptance
or mint authorization.

## Fresh Federation Build

The [FED build owner](../relayer/src/substrate-federated-genesis-node-build-v1.ts)
accepts an open, unbound source-attestation session and derives the public
profile bytes and ID used by Cargo. It reconstructs the three-patch source
tree through a separate Git index and exports it to a fresh build directory.
Every exported file is checked against its exact Git blob before and after
compilation; the original checkout and historical outputs are not rewritten.

The fixed offline command selects only `bridge-federated-v4-genesis-node`.
The existing toolchain verifier and Cargo environment builder supply the
locked tools, workspace hint and path-remapping policy. The owner returns the
selected node/WASM paths, sizes and hashes while leaving custody with its
caller. A disposed or launch-bound session cannot complete the build.

Both Cargo configuration filenames are refused in the explicit Cargo home,
source/member directories and their ancestors through the filesystem root,
and the selected WASM build path. These checks run immediately before and
after Cargo, without reading configuration contents. The WASM toolchain probe
uses a fresh build-owned temporary directory. Build directories and dependency
caches must remain exclusively controlled during compilation: before/after
checks do not attest transient concurrent changes or the full dependency/tool
closure. See [Cargo configuration lookup](https://doc.rust-lang.org/cargo/reference/config.html#hierarchical-structure)
and the [pinned WASM probe](https://github.com/paritytech/polkadot-sdk/blob/bbc435c7667d3283ba280a8fec44676357392753/substrate/utils/wasm-builder/src/prerequisites.rs).

Orchestration tests use stubbed subprocesses. A separate real Git export
matched all 563 source files. The complete fresh-federation Rust build and
running target remain to be exercised together. A fresh export has a new
workspace path; its resulting artifact hashes must not inherit the older
build's pins or imply cross-root reproducibility.

## Fresh Target Composition

[`runSubstrateFederatedGenesisTargetRootV1`](../relayer/src/apps/bridge-daemon/substrate-federated-genesis-target-root-v1.ts)
connects the fresh federation build, owned Ergo observations, JVM family
compilation and the two fixed local FED nodes. Builds finish before the managed
Ergo mining lifetime starts. The EVM operator adapter creates fresh custody
and a launch domain without signing; its public address binds the genesis owner
and simulated native-fee endowment.

The root checks the materialized runtime code, exact V4 profile, enforcement,
bridge address, retained operator funding and absence of Sudo before starting
FED nodes. The read-only
adapter then checks every materialized top-storage entry on both targets at
the same height-zero genesis, with empty pools and a final height/hash check.
These observations do not authenticate an arbitrary RPC or establish source
consensus. Both process owners retain their existing containment and cleanup.

The operator's funding expectation is specific to the pinned Frontier runtime:
`System.Account`, `Blake2_128Concat` over `AccountId20`, and the 80-byte
`AccountInfo<u32, AccountData<u128>>` layout. It requires zero nonce, consumers,
sufficients, reserved and frozen balance, one provider, the SDK new-logic flag
and exactly 100,000,000,000,000,000,000 raw native units. The layout follows
the pinned SDK's [account storage](https://github.com/paritytech/polkadot-sdk/blob/bbc435c7667d3283ba280a8fec44676357392753/substrate/frame/system/src/lib.rs)
and [balance data](https://github.com/paritytech/polkadot-sdk/blob/bbc435c7667d3283ba280a8fec44676357392753/substrate/frame/balances/src/types.rs).
A different source runtime requires a separately reviewed funding layout.

Component tests keep real setup, federation and EVM key custody, SQLite and
box codecs, but stub builds, JVM compilation, checking, transport, process
launch and RPC responses. They cover input capture, matching custody/profile
inputs, materialization drift, disagreement, stale targets, bounded response
decoding, issuance ordering, exact outputs and cleanup failures. The earlier real
JVM and configuration-only node checks retain their separate scopes; this
fresh composed campaign has not run yet.

Inside the owned target lifetime, the root calls the native setup checker and
ordered issuance consumer. It checks canonical inclusion before and after
observing the consumed funding inputs and exact singleton outputs on both Ergo
nodes, within one stable tip. Ordinary tip advancement permits at most three
observation windows, each rereading confirmations and outputs. Issuance is
never retried; malformed state or changed inclusion still rejects. FED genesis
is reobserved before returning.
Its fresh journal remains closed beside the build artifacts, including after
an unresolved attempt; it is not deleted or reused as funds authority.
These local UTXO reads do not prove an atomic header/state snapshot or
independent consensus. A later value-moving step requires fresh revalidation.

The root returns terminal public observations and issuance transaction
receipts after stopping the nodes and disposing custody. A successful runtime
result records local singleton issuance, not mint authority or a resumable
session. Disposal releases retained references; memory zeroization is not
established. Committed-reserve and operational mint consumers must still be
connected inside that lifetime before running the fresh composed campaign.

The native setup batch can now construct the existing V2 deposit packet from
its retained compiler and exact reserve predecessor, without a historical V3
setup plan. Separate native session states check source-lock creation before
the same packet's reserve transition. Session validity is checked around
asynchronous signing/checking and retained on promoted submission handles;
disposing either session invalidates later use. The deposit format, contracts
and historical V3 sequence are unchanged. Component tests exercise canonical
transaction materialization and actual WASM signatures with simulated
compiler/deposit provenance and node responses. Checking alone establishes
neither deposit confirmation nor mint eligibility.

`executeSubstrateFederatedNativeGenesisPegInSourceLockV1` now connects that
packet to retained checking, two owned funding observations, native-scoped
authorization, durable reservation and the fixed checked transport. It requires
canonical confirmation and exact unspent source-lock/transition-fee outputs on
both local nodes. Observation permits at most three read-only windows while
mining advances; changed inclusion, tip regression and same-height replacement
reject without another submission. Custody is checked through transport and
observation consumption. The deposit remains refundable and supplies no mint
authority. Composed tests retain actual WASM signatures, SQLite lifecycle and
HTTP decoding, with simulated compiler/deposit provenance and target responses.
`executeSubstrateFederatedNativeGenesisPegInCommittedVaultV1` then consumes that
same packet and source-lock observation. It checks the reserve transition,
reobserves all three unspent inputs around a fresh check of the exact signed
transaction, reserves the attempt durably and uses the separately authorized
checked transport. Canonical confirmation, spent inputs, the exact reserve
successor and its observed ancestry are required before returning. Fees remain
external to the reserve deposit. A disposed session cannot continue polling,
start another phase or consume the returned observation. The result establishes
component-level reserve lineage, not source consensus or mint authority.
Operational mint and the full target-root callback still need composition
before a fresh node campaign. These component tests use simulated node responses.

The native reserve observation now feeds a separate mint-reservation draft and
evidence collector. The draft uses the unchanged V4 statement encoding and
binds the original native packet, setup request, compiler and confirmed reserve.
The collector encodes the source lock, reserve transaction, exact successor,
inclusion observation and checkpoint ancestry for the existing FED proof format.
Collection and one-time consumption both require the original draft and active
custody. Native identities cannot pass as historical LAB drafts or evidence.

The composed fixture covers deposit execution through evidence consumption
with real WASM signing, journal and observation decoding, but simulated node
responses and compiler/deposit provenance. The evidence describes a federated
depth policy, not independently verified Ergo PoW. No source attestation,
runtime reservation or mint is produced here. The next consumer must bind the
retained attestors to the exact height-zero FED profile before signing; the
old block-4 LAB launch cannot supply that binding.

## Ergo Issuance Materialization

The observed-input compiler also produces the three unsigned Ergo transactions
for tracker, duplicate-prevention and reserve issuance, in that order. Each
uses its exact observed funding box as the singleton token ID, the compiled
ErgoTree, 10,000,000 nanoERG of initial state value, canonical registers, the
fixed miner-fee output and change returned to the funding script. Transaction
and predicted output IDs are derived from the serialized bodies, not supplied
by the caller. Input bodies are reparsed before compilation; mismatched IDs,
non-ERG assets, registers, insufficient maturity and duplicate inputs reject.

The three proposed states use empty tracker, replay and deposit trees, with
zero reserve liability. This constructs greenfield candidates; it does not
prove historical non-instantiation or authorize an empty replay baseline.
The compiler tests exercise real JVM compilation and WASM transaction
materialization for both supported reward delays. They do not sign, evaluate
the full issuance transaction in the JVM, or call a node transaction checker.
Unsigned transaction and predicted singleton IDs remain planning data. The
root's completed issuance result additionally requires the separate checked,
submitted, confirmed and output-observed lifecycle described above.

The existing executable V3 setup request requires a G1dA history/compiler
closure whose historical source identity does not describe FED genesis.
The FED-native checker entry must bind the original compiler and observed
input material under its own request identity, retaining fresh reobservation,
one-shot custody and exact signed-byte checking. It must not fabricate a
historical receipt or remove the V3 history checks. The existing operational
lifecycle and journals remain responsible for authorization, reservation,
transport and canonical confirmation.

## Native Setup Checker

The native genesis request has a separate schema and digest domain. Its
producer consumes the original observed compiler result, retained target and
fresh paired Ergo observations. It binds the compiled family, height-zero
configuration and exact unsigned issuance bytes without importing G1dA
history. Copied compiler results and expired or foreign custody are rejected.

The existing checking engine has a closed native binding alongside V2/V3.
It retains exact unsigned identities, WASM signing, same-origin checks,
reobservation before signing, before checks and after checks, and one-time
extraction of checked transaction material. Native receipts cannot supply
V2/V3 execution material. A serialized receipt remains data, not custody or
broadcast authorization.

The retained native session is checked again immediately before each signing
or HTTP-check operation, including after asynchronous preparation. Closing it
prevents the next operation and invalidates any response still in flight.

Component tests exercise actual WASM signing with simulated observations and
HTTP check responses. These are not full-transaction JVM acceptance or a live
target campaign. The next connection is the managed one-shot native setup
session inside the target root, retaining custody for authorized issuance and
committed-reserve confirmation. The ordinary daemon's owner-mint hold stays on.

## Next Boundary

The historical packet derives its domain from observed genesis/spec identities,
and its source-attestation route fixes activation at block 4. Neither can be
reused unchanged for genesis initialization. Preserve the authority-safe V1
schema, which accepts quarantine only. Family runtime/application profile ID,
V4 lineage/family ID and V4 profile ID remain distinct.

Complete singleton issuance and the committed-reserve consumer in the fresh
target root, then connect height-zero source-proof binding, native reservation,
its confirmed parent-state observation and the matching Ethereum mint. Run the
fresh build/target campaign when those consumers can use its retained custody;
a build followed by immediate disposal cannot supply them. Keep pool rejection
separate from whole-block rejection and preserve the ordinary daemon's mint hold.

Only after that join should a fresh operational two-way campaign reuse the
verified withdrawal consumer. This checkpoint establishes neither that
campaign nor independent custody, consensus trustlessness, Gate 5 closure or
production readiness. See the [execution plan](../phases/bridge-execution-plan.md).

## Selected Node And WASM Verification

The node feature `bridge-federated-v4-genesis-node` selects only the dedicated
runtime. Main, LAB and FED selections are mutually exclusive at compilation;
the default node remains main. The FED CLI accepts only
`fed-genesis:<typed-genesis.json>`. It rejects implicit development/local
selectors, the LAB selector and ordinary raw chain-spec files.

The file contains a full `RuntimeGenesisConfig`, not raw storage or runtime
code. The loader accepts at most 4 MiB of JSON and executes the compiled WASM
genesis builder before returning the spec. Running-node mode must match the
CLI sealing selection. Offline `build-spec` has no sealing option or block
producer, so it retains the mode declared in the typed configuration; the
startup mismatch check remains required. Node runtime code, chain-spec type,
boot nodes and telemetry are not
caller-selected fields. The resulting development spec has no boot nodes or
telemetry. This does not attest the caller's application or federation choices;
that remains the reviewed provisioning producer's responsibility.

With the public build profile above and the same source closure:

```powershell
Remove-Item Env:SKIP_WASM_BUILD -ErrorAction SilentlyContinue
$env:WASM_BUILD_WORKSPACE_HINT = (Get-Location).Path
$env:CARGO_PROFILE_DEV_DEBUG = '0'
$env:CARGO_PROFILE_DEV_CODEGEN_UNITS = '1'
$env:CARGO_INCREMENTAL = '0'
cargo test --offline --locked -p frontier-template-node --no-default-features --features bridge-federated-v4-genesis-node federated_genesis -- --test-threads=1
cargo build --offline --locked -p frontier-template-node --no-default-features --features bridge-federated-v4-genesis-node
```

The workspace hint lets the nested WASM builder find the exact Cargo.lock when
build outputs are outside the source tree. An initial missing-lock failure was
resolved with this hint; dependency pins and offline resolution were retained.

Three node tests pass. The positive writes a synthetic typed configuration,
parses both the running-node selector and `build-spec` CLI and compares all
resulting WASM genesis storage with native storage, with the compiled code
checked separately. A running-node CLI without the required sealing selection
still rejects the same configuration. Single-fault
negatives cover unknown/raw/code fields, input size, sealing mismatch, absent
profile, wrong proof profile, nonzero activation, Sudo, quarantine, application
code, operator and pre-existing token supply. The built executable also rejects
the ordinary `dev` selector.

The Rust 1.82.0 Windows debug build produced:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| FED runtime WASM | 2,103,533 | `b4219a6ef4d6e3f94d50ecb55faae6887341980775e584d04195ed3ed06ae625` |
| Selected node executable | 96,507,904 | `28581cdb1158dc9ed58efdecc7cc94178ff077109c6a5b341673363f4abb0298` |

These identify the tested build with the synthetic public configuration above,
not usable custody or a running operational target. The typed producer-to-node
join passes with those inputs; cross-root reproducibility and operational
target binding remain unestablished.
