# Bridge Validity zkVM

This isolated workspace carries four preactivation bridge-validity method
families against the exact RISC Zero source commit selected by the EIP-0045
RISC Zero v3 succinct profile: `8eb06ab020a92dc5b63ba6dd0836d432aba6d890`.
That source identifies `risc0-zkvm` 3.0.5, `risc0-zkp` 3.0.4, and the recursion
circuit 4.0.4.

- V1 remains the immutable Substrate/GRANDPA compatibility method. Its exact
  769,516-byte `ProgramBinary` and
  `5b46bf0ef2ff959327bfb39c6ac4dae48d509a0fcf91f89dcf84b26f44203934`
  image ID are frozen under
  `methods/artifacts/`; the manifest binds their digest to source commit
  `614611cae5b670f56d7d1ea9e7821b9ee280a836`. Recompiling the historical
  entrypoint against evolving current crates is not a V1 reproduction.
- V2 is a distinct frozen application-bound method. Its exact 799,732-byte
  `ProgramBinary`, source lineage, SHA-256, and
  `230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c`
  image ID are frozen under `methods/artifacts/`. It verifies the finalized
  bridge commitment, active causal application profile, and sticky enforcement
  from one state root, then commits exactly one 1,132-byte statement.
- V4 is a distinct pooled-reserve burn method. It verifies the V4 statement,
  reviewed GRANDPA finality and exact bridge commitment, runtime profile,
  sticky enforcement, commitment-producing `BridgeAddress`, and native runtime
  `:code` under one finalized state root, then commits exactly one 1,139-byte
  statement. Its corrected 805,528-byte `ProgramBinary`, source lineage,
  SHA-256
  `f521d2df0d53b5d7be9146ccfe2548295b97069385fb7eef3b4ba3adafd75e77`,
  and image ID
  `ad8ad97a4a060059e70e793fc10a311d1e16fbe05b7cdcbeb58aa597a60b3fe4`
  are frozen under `methods/artifacts/`. Two clean builds from source commit
  `f90205c1a0c7f414bcaeee7077c60b3e97f01010` and tree
  `431df2c8dc097de2fcf4c1c0b355b7887d0d8782`, using separate fresh target
  volumes, produced byte-identical binaries. The corrected method reuses exact
  EIP-0045 profile ID
  `23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383`
  while application semantics remain in the distinct V4 `programId`, statement
  family, domains, and consumer identity. The superseded 806,048-byte draft and
  its program ID remain historical Git evidence only and must not be activated.
  A fresh real non-dev succinct receipt now binds the corrected method and
  reusable profile to integrated preactivation tracker contract ID
  `bfba2ed2dabca6a843b3acf996029cb3ed5578eda512043cb5e1a7217624e594`.
  The earlier receipt for standalone tracker ID
  `dff42d1bb808fc30e87011c493b5eef0bb257acc9c35940b112b14bf455e92cd`
  remains historical standalone conformance evidence only. Neither receipt is
  profile activation, target-node acceptance, tracker admission, or funds
  authority.
- V5 is a distinct Sudo-absent successor family. It preserves the exact V4
  runtime profile semantics while proving that `pallet_sudo::Key` is absent
  under the same finalized state root as the bridge commitment, profile,
  enforcement state, `BridgeAddress`, and runtime `:code`. Two clean builds
  from source commit `36f990f6a1fc207e90570a726b38a5168651e31e` and tree
  `5ff2b8baeac6232904e7357edb41e117a396ce02`, using separate fresh target
  volumes, produced the same 805,024-byte `ProgramBinary`, SHA-256
  `ada19a67444b6808fa8d3c9e4f6ea4ceca7c5fa168ba26f93f6f31684efe215c`,
  and image ID
  `bd72f52090ed45f2803767f64cde4d4314b7735f27e8d4596c4db37f1dc52a31`.
  The frozen artifact and manifest establish a reproducible local method
  identity. A separate portable verification-only host surface binds a supplied
  receipt to this exact V5 program, the exact existing EIP-0045 profile, exact
  V5 journal bytes, one explicit expected consumer contract ID, and the same
  canonical succinct-seal grammar as V4. One local non-dev receipt now binds
  the bytes-backed synthetic runtime fixture to integrated preactivation
  tracker contract ID
  `c9f54f6e60bcad8a135df23e92c69a5134144c2cebc7091566f6da490b7cff08`.
  This is not runtime provenance, activation, target-node acceptance, tracker
  admission, or funds authority.

The V1/V2/V4/V5 profile-level portable host surfaces verify a receipt against
the selected frozen method image ID, require exact journal equality, and
require the statement `programId` and `profileId` to equal the selected method
and frozen profile. V1 retains its pre-existing lower-level receipt verifier as
a compatibility API. V2, V4 and V5 also require an explicit expected consumer
contract ID; no activated V2, V4 or V5 settlement consumer is claimed. The
V4/V5 APIs do not accept a caller-selected profile ID: they require the exact
reusable EIP-0045 profile above and return proof chunks only after the receipt
also satisfies the same succinct kind, Poseidon2 hash suite, terminal control,
outer exponent, raw seal length, and canonical partition checks as V2. V5 is
verification-only in the production host API. Its opt-in local test harness can
generate and transiently export a candidate for conformance; it is not a
runtime proving or funds capability.
The opt-in V1/V2/V4 local prover requests a non-dev Poseidon2
succinct receipt, rejects a work receipt, requires outer `po2 = 18` and the
exact terminal `join` control ID, and exposes proof material only as the
222,668-byte raw seal in four canonical EIP-0045 chunks. The optional transient
candidate accompanies those chunks with the exact statement, program, profile
and terminal bindings plus a create-last manifest; it never exports a wrapper
receipt.

The V4 local execution test runs the corrected guest under the reusable profile
and checks its journal without generating a proof. The separate ignored test
generates a real succinct receipt, verifies it against the exact method,
profile, statement and consumer, rejects isolated image, journal, consumer and
seal mutations, and exports the four raw proof chunks only after those checks.
The V4 methods test recomputes the frozen binary's size, SHA-256 and image ID.
The V5 methods test additionally requires exact byte equality between the
checked-in artifact and the method generated from current V5 source, and proves
that its identity differs from V1, V2 and V4. None of these checks demonstrates
activation or acceptance by an Ergo node.

### Generate the integrated pooled-reserve V4 receipt

Use a new empty output directory for every candidate. The source mount is
read-only, every payload is created once, and the manifest is written last.

```powershell
$bridgeRoot = (Resolve-Path ..\..).Path
$runId = [guid]::NewGuid().ToString("N")
$candidateDir = Join-Path $env:TEMP "bridge-eip0045-pooled-reserve-burn-v4-integrated-$runId"
New-Item -ItemType Directory -Path $candidateDir | Out-Null

docker run --rm `
  --mount "type=bind,source=$bridgeRoot,target=/workspace,readonly" `
  --mount "type=bind,source=$candidateDir,target=/proof-output" `
  --mount "type=volume,source=bridge-validity-zkvm-target,target=/target" `
  --mount "type=volume,source=bridge-validity-cargo-registry,target=/root/.cargo/registry" `
  --mount "type=volume,source=bridge-validity-cargo-git,target=/root/.cargo/git" `
  --env CARGO_TARGET_DIR=/target `
  --env RISC0_PROVER=local `
  --env BRIDGE_EIP0045_POOLED_RESERVE_BURN_V4_EXPORT_DIR=/proof-output `
  --workdir /workspace/validity-proof/zkvm `
  bridge-validity-eip0045-risc0-v3:local `
  cargo test -p bridge-validity-zkvm-host --features local-prove --locked `
    --test pooled_reserve_execution_v4 `
    proves_and_rejects_mutated_pooled_reserve_burn_v4_receipt_bindings `
    -- --ignored --nocapture
```

The integrated reference run on 2026-08-02 completed in 1,401.13 seconds. It exported the
exact 1,139-byte statement and `65,535 / 65,535 / 65,535 / 26,063` proof chunks
from local image
`sha256:cdcb2e536a2a77b19d73cf1fd25635eac4a298e0598ba8c1b2479d297a7f7fd7`.
The statement Blake2b-256 is
`dea00c2ed8f7ac669d86999293de1d088a83ef0725897977cde5b94d3275bee0`.
It binds program ID
`ad8ad97a4a060059e70e793fc10a311d1e16fbe05b7cdcbeb58aa597a60b3fe4`,
the reusable profile above, consumer contract ID
`bfba2ed2dabca6a843b3acf996029cb3ed5578eda512043cb5e1a7217624e594`, and
terminal control ID
`7a8f24092c34ed3eb81b3d0a0b796c588c615d3488ef9e61c21dbd1e4b83ea6e`.
The transient create-last manifest binds each file by length and Blake2b-256.

This candidate targets the exact integrated tracker identity reproduced by the
frozen four-contract compiler batch. The earlier standalone candidate remains
bound to its distinct contract ID and must not be relabelled or reused as
integrated application evidence. The integrated receipt still proves only
local proof-engine conformance; it does not establish compiler provenance,
profile activation, target-node acceptance, source governance containment, or
funds authority.

### Generate the integrated pooled-reserve V5 receipt

The V5 compiler fixture must bind runtime bytes that the private witness can
actually provide. The former all-`dd` digest and 8,192-byte size had no backing
bytes and therefore could not produce a statement accepted by the V5 state
verifier. The current fixture hashes 4,096 bytes of `0x61`, then rederives the
compiler family and integrated consumer from that exact identity. These remain
synthetic fixture bytes, not an observed or deployed runtime.

Use a new empty output directory for every candidate:

```powershell
$bridgeRoot = (Resolve-Path ..\..).Path
$runId = [guid]::NewGuid().ToString("N")
$candidateDir = Join-Path $env:TEMP "bridge-eip0045-pooled-reserve-burn-v5-integrated-$runId"
New-Item -ItemType Directory -Path $candidateDir | Out-Null

docker run --rm `
  --mount "type=bind,source=$bridgeRoot,target=/workspace,readonly" `
  --mount "type=bind,source=$candidateDir,target=/proof-output" `
  --mount "type=volume,source=bridge-validity-zkvm-target,target=/target" `
  --mount "type=volume,source=bridge-validity-cargo-registry,target=/root/.cargo/registry" `
  --mount "type=volume,source=bridge-validity-cargo-git,target=/root/.cargo/git" `
  --env CARGO_TARGET_DIR=/target `
  --env RISC0_PROVER=local `
  --env BRIDGE_EIP0045_POOLED_RESERVE_BURN_V5_EXPORT_DIR=/proof-output `
  --workdir /workspace/validity-proof/zkvm `
  bridge-validity-eip0045-risc0-v3:local `
  cargo test -p bridge-validity-zkvm-host --features local-prove --locked `
    --test pooled_reserve_execution_v5 `
    proves_and_rejects_mutated_pooled_reserve_burn_v5_receipt_bindings `
    -- --ignored --nocapture
```

The 2026-08-02 reference run completed in 1,029.19 seconds using local image
`sha256:cdcb2e536a2a77b19d73cf1fd25635eac4a298e0598ba8c1b2479d297a7f7fd7`.
It encoded a 7,125-byte private witness, used 11,534,336 total cycles, and
exported a 1,140-byte statement with Blake2b-256
`c7ea7fd082f809aab84344fa666dfd001bd6bbe7953ae98ca6051cd9f746e1e3`.
The receipt binds program ID
`bd72f52090ed45f2803767f64cde4d4314b7735f27e8d4596c4db37f1dc52a31`,
profile ID
`23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383`,
consumer ID
`c9f54f6e60bcad8a135df23e92c69a5134144c2cebc7091566f6da490b7cff08`,
and terminal control ID
`7a8f24092c34ed3eb81b3d0a0b796c588c615d3488ef9e61c21dbd1e4b83ea6e`.
The canonical seal partition is
`65,535 / 65,535 / 65,535 / 26,063` bytes. The host accepted the exact receipt
and rejected isolated image, journal, expected-consumer, coordinated-journal,
and seal mutations before writing the create-last manifest.

This closes the local integrated V5 proof-engine path only. The fixture does
not establish deployment lineage, canonical source state, EIP-0045 activation,
Ergo target-node acceptance, global replay cutover, legacy-route retirement,
or funds authority.

The checked-in reproduction Dockerfile combines an exact Rust 1.89 host image
with the exact `r0.1.88.0` guest-builder image. Both bases are pinned by digest.
The guest and host compile inside Linux; native Windows proving is not a
supported path. These image pins do not yet make the workflow hermetic: an
initial build fetches Rust components and Cargo sources, and the named cache
volumes are mutable local acceleration. EIP-0045 B7 therefore remains open.

Build the local environment from this directory:

```powershell
docker build --platform linux/amd64 `
  --file Dockerfile.reproduction `
  --tag bridge-validity-eip0045-risc0-v3:local `
  .
```

### Reproduce the frozen V1 compatibility binary

The V1 artifact is reproduced from the exact repository commit and tree named
in its manifest, not from the evolving current crates. From the repository
root, use a detached worktree, a fresh target volume, and the historical pinned
Dockerfile:

```powershell
$sourceCommit = "614611cae5b670f56d7d1ea9e7821b9ee280a836"
$sourceTree = "9b2727892c28bdb7c42b237185dcc590a85de5e4"
$runId = [guid]::NewGuid().ToString("N")
$scratch = Join-Path ([IO.Path]::GetTempPath()) "bridge-v1-source-$runId"
$output = Join-Path ([IO.Path]::GetTempPath()) "bridge-v1-output-$runId"
$targetVolume = "bridge-validity-v1-repro-$runId"
$image = "bridge-validity-eip0045-risc0-v1-repro:$runId"

git worktree add --detach $scratch $sourceCommit
if ((git -C $scratch rev-parse HEAD) -ne $sourceCommit) { throw "source commit mismatch" }
if ((git -C $scratch rev-parse "HEAD^{tree}") -ne $sourceTree) { throw "source tree mismatch" }

$historicalRoot = Join-Path $scratch "ergo-sidechain-bridge"
$historicalZkvm = Join-Path $historicalRoot "validity-proof\zkvm"
docker build --platform linux/amd64 `
  --file (Join-Path $historicalZkvm "Dockerfile.reproduction") `
  --tag $image `
  $historicalZkvm
docker volume create $targetVolume | Out-Null
docker run --rm `
  --mount "type=bind,source=$historicalRoot,target=/workspace,readonly" `
  --mount "type=volume,source=$targetVolume,target=/target" `
  --env CARGO_TARGET_DIR=/target `
  --workdir /workspace/validity-proof/zkvm `
  $image `
  cargo test --workspace --locked

New-Item -ItemType Directory -Path $output | Out-Null
docker run --rm `
  --mount "type=volume,source=$targetVolume,target=/target,readonly" `
  --mount "type=bind,source=$output,target=/output" `
  $image `
  cp /target/riscv-guest/bridge-validity-zkvm-methods/bridge-validity-guest/riscv32im-risc0-zkvm-elf/release/bridge-validity-guest.bin /output/bridge-validity-guest-v1.bin

$binary = Join-Path $output "bridge-validity-guest-v1.bin"
if ((Get-Item $binary).Length -ne 769516) { throw "V1 binary length mismatch" }
if ((Get-FileHash $binary -Algorithm SHA256).Hash.ToLowerInvariant() -ne
    "17a1cdf1884e3518dbdf860ebd39134a2498d86cdc695cff43e73544b2eac89d") {
  throw "V1 binary digest mismatch"
}
```

The historical workspace test also recomputes the exact V1 image ID. Remove
the detached worktree, output directory, target volume, and local image after
review; none of them is a source artifact.

### Reproduce the frozen V2 application binary

V2 follows the same detached-worktree and fresh-volume procedure as V1. Its
manifest selects source commit
`20e7e8dfeac235ebd468a07b8b3695a21cdcbbd6`, tree
`8cc95cc1f97efab3a790b608094e52d9f3ff9864`, and the same pinned RISC Zero
source and guest toolchain. The generated file is
`bridge-validity-guest-v2.bin`; a valid reproduction is exactly 799,732 bytes,
has SHA-256
`ebebb29eb24847bb481cb159b1ab29219a503ad62104c5fc41816084db762a39`,
and recomputes to the V2 image ID above. The current workspace intentionally
does not rebuild V2 from evolving crates; doing so is a new method identity,
not a compatibility reproduction.

### Reproduce the corrected V4 pooled-reserve binary

The V4 manifest selects source commit
`f90205c1a0c7f414bcaeee7077c60b3e97f01010`, tree
`431df2c8dc097de2fcf4c1c0b355b7887d0d8782`, and the same pinned RISC Zero
source and guest toolchain. Two builds from that exact clean source, each with
a separate fresh target volume, produced byte-identical binaries. A valid V4
reproduction is exactly 805,528 bytes, has SHA-256
`f521d2df0d53b5d7be9146ccfe2548295b97069385fb7eef3b4ba3adafd75e77`,
and recomputes to image ID
`ad8ad97a4a060059e70e793fc10a311d1e16fbe05b7cdcbeb58aa597a60b3fe4`.

Like V1 and V2, V4 is now excluded from the evolving methods build. Rebuilding
its entrypoint against later shared crates changes the `ProgramBinary` even when
the accepted V4 semantics are unchanged. The methods test therefore verifies
the frozen V4 manifest, digest, size, and image ID directly, while only the new
V5 entrypoint is built from current source. Historical V4 reproduction remains
bound to the exact commit and tree above. The frozen identity does not authorize
proof acceptance or settlement.

### Reproduce the frozen V5 Sudo-absent binary

The V5 manifest selects source commit
`36f990f6a1fc207e90570a726b38a5168651e31e`, tree
`5ff2b8baeac6232904e7357edb41e117a396ce02`, and the same pinned RISC Zero
source and guest toolchain. Two builds from that exact clean source, each with
a separate fresh target volume, produced byte-identical binaries. A valid V5
reproduction is exactly 805,024 bytes, has SHA-256
`ada19a67444b6808fa8d3c9e4f6ea4ceca7c5fa168ba26f93f6f31684efe215c`,
and recomputes to image ID
`bd72f52090ed45f2803767f64cde4d4314b7735f27e8d4596c4db37f1dc52a31`.
The current methods build compiles only the V5 entrypoint and requires that
generated output to equal the frozen artifact. Any later change to the guest's
transitive source closure must use a new version and identity rather than
silently replacing this artifact.

Then check the workspace without writing build artifacts into the repository:

```powershell
$bridgeRoot = (Resolve-Path ..\..).Path
docker run --rm `
  --mount "type=bind,source=$bridgeRoot,target=/workspace,readonly" `
  --mount "type=volume,source=bridge-validity-zkvm-target,target=/target" `
  --mount "type=volume,source=bridge-validity-cargo-registry,target=/root/.cargo/registry" `
  --mount "type=volume,source=bridge-validity-cargo-git,target=/root/.cargo/git" `
  --env CARGO_TARGET_DIR=/target `
  --workdir /workspace/validity-proof/zkvm `
  bridge-validity-eip0045-risc0-v3:local `
  cargo test --workspace --locked
```

Execute the application-bound V2 guest without generating a proof:

```powershell
$bridgeRoot = (Resolve-Path ..\..).Path
docker run --rm `
  --mount "type=bind,source=$bridgeRoot,target=/workspace,readonly" `
  --mount "type=volume,source=bridge-validity-zkvm-target,target=/target" `
  --mount "type=volume,source=bridge-validity-cargo-registry,target=/root/.cargo/registry" `
  --mount "type=volume,source=bridge-validity-cargo-git,target=/root/.cargo/git" `
  --env CARGO_TARGET_DIR=/target `
  --env RISC0_EXECUTOR=local `
  --workdir /workspace/validity-proof/zkvm `
  bridge-validity-eip0045-risc0-v3:local `
  cargo test -p bridge-validity-zkvm-host --features local-prove --locked `
    --test application_execution_v2 -- --nocapture
```

Execute the pooled-reserve V4 guest without generating a proof:

```powershell
$bridgeRoot = (Resolve-Path ..\..).Path
docker run --rm `
  --mount "type=bind,source=$bridgeRoot,target=/workspace,readonly" `
  --mount "type=volume,source=bridge-validity-zkvm-target,target=/target" `
  --mount "type=volume,source=bridge-validity-cargo-registry,target=/root/.cargo/registry" `
  --mount "type=volume,source=bridge-validity-cargo-git,target=/root/.cargo/git" `
  --env CARGO_TARGET_DIR=/target `
  --env RISC0_EXECUTOR=local `
  --workdir /workspace/validity-proof/zkvm `
  bridge-validity-eip0045-risc0-v3:local `
  cargo test -p bridge-validity-zkvm-host --features local-prove --locked `
    --test pooled_reserve_execution_v4 -- --nocapture
```

This command executes the corrected guest under the exact reusable profile and
checks its journal. It does not generate or accept a receipt, exercise an Ergo
consumer, or authorize settlement.

The ignored application test can generate one real succinct candidate for an
exact application-tracker contract ID. The output directory must be new and
empty; all payload files are create-only and
`candidate-manifest-v2.txt` is written last:

```powershell
$bridgeRoot = (Resolve-Path ..\..).Path
$candidateDir = Join-Path $env:TEMP "bridge-eip0045-application-candidate"
New-Item -ItemType Directory -Path $candidateDir | Out-Null

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

The exact proposition, consumer ABI, candidate loader, JVM matrix, and
non-authority boundaries are recorded in
[Bridge Validity Application Tracker V2](../../docs/bridge-validity-application-tracker-v2.md).

The pinned container completed that V2 execution on 2026-07-27 and committed
the exact 1,132-byte statement. This is execution evidence, not a succinct
proof, EIP-0045 activation, Ergo consumer acceptance, settlement authorization,
or Gate 5 closure.

The same pinned container also completed a real succinct proof for application
tracker contract ID
`adfd2c0f9dcbcc48bda315f6ea4018ccad838907866f80046b3e97b931f5663b`.
The host verified the receipt and its negative mutation matrix before exporting
the 1,132-byte statement and `65,535 / 65,535 / 65,535 / 26,063` proof chunks.
The exported bytes are transient conformance inputs, not repository evidence
or funds authority.

The separate ignored rejection test generates another valid receipt after
changing exactly the first authenticated bridge-runtime hash byte from `0xbb`
to `0xba`. It recomputes every downstream statement field and writes a
different create-last manifest:

```powershell
$rejectionDir = Join-Path $env:TEMP "bridge-eip0045-application-binding-rejection"
New-Item -ItemType Directory -Path $rejectionDir | Out-Null

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

The pinned proof runtime accepts that receipt, while the frozen tracker
proposition rejects its alternate application binding. The distinct
`application-binding-rejection-manifest-v2.txt` prevents the canonical loader
from accepting it accidentally.

The real-proof case opts into the native Linux prover. An optional empty
directory receives transient statement and chunk bytes for an external
consumer check. The host runs every receipt mutation assertion before export,
writes each file create-only, and writes `candidate-manifest-v1.txt` last with
the exact file order, lengths and Blake2b-256 digests:

```powershell
$bridgeRoot = (Resolve-Path ..\..).Path
$candidateDir = Join-Path $env:TEMP "bridge-eip0045-candidate"
New-Item -ItemType Directory -Path $candidateDir | Out-Null
docker run --rm `
  --mount "type=bind,source=$bridgeRoot,target=/workspace,readonly" `
  --mount "type=bind,source=$candidateDir,target=/proof-output" `
  --mount "type=volume,source=bridge-validity-zkvm-target,target=/target" `
  --mount "type=volume,source=bridge-validity-cargo-registry,target=/root/.cargo/registry" `
  --mount "type=volume,source=bridge-validity-cargo-git,target=/root/.cargo/git" `
  --env CARGO_TARGET_DIR=/target `
  --env RISC0_PROVER=local `
  --env BRIDGE_EIP0045_EXPORT_DIR=/proof-output `
  --workdir /workspace/validity-proof/zkvm `
  bridge-validity-eip0045-risc0-v3:local `
  cargo test -p bridge-validity-zkvm-host --features local-prove --locked `
    --test native_receipt -- --ignored --nocapture
```

The ignored host test targets the original 85-byte consumer when no override is
present. To generate a distinct proof for `SPVTrackerValidityV1`, use a new
empty candidate directory and add the exact contract binding:

```powershell
  --env BRIDGE_EIP0045_CONSUMER_CONTRACT_ID_HEX=c22f8d631e99022bd4bad5ce84ee9d7da30bf51684977c8bad28d8200f8cff5b `
```

The override changes only the statement's consumer contract ID. The create-last
manifest, exact statement checks, receipt mutations, profile/program identity,
and raw-seal export rules remain unchanged. A candidate directory must never be
reused or partially overwritten. Proof generation does not approve the
payload's GRANDPA trust anchor: the tracker fixture command must separately
supply the reviewed digest through `--trusted-anchor-digest`, and the contract
requires it to equal the lineage-preserved R9 bytes.

## Reference conformance run

The pinned container completed the real non-dev succinct proof test on
2026-07-26 against the executable bridge consumer identity. The host verified
the receipt and exact profile bindings and completed every negative assertion
before exporting the raw seal and completion manifest. The real-proof test
rejects a wrong image, altered journal, wrong expected statement, coordinated
journal-and-expectation mutation, and altered seal. Checked-in Rust unit tests
independently freeze the program/profile IDs, consumer contract ID, terminal
control, outer exponent, raw-seal length, and canonical chunk lengths, and
reject non-succinct, non-Poseidon2, wrong-terminal, wrong-outer-exponent,
wrong-program, wrong-profile, and wrong-size cases. The chunk-partition
mutation is exercised by the JVM consumer check below.

| Measurement | Observed value |
|---|---:|
| RISC Zero source | `8eb06ab020a92dc5b63ba6dd0836d432aba6d890` |
| EIP-0045 profile ID | `23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383` |
| Method image ID | `5b46bf0ef2ff959327bfb39c6ac4dae48d509a0fcf91f89dcf84b26f44203934` |
| Consumer proposition | 85-byte version-4 constant-segregated ErgoTree |
| Consumer contract ID | `9d0ac3c2c7889ef4bfa53c31903f5e11012f20b24156cbcf82b3435d95a290fc` |
| Guest `ProgramBinary` | 769,516 bytes |
| Private witness | 9,057 bytes |
| Public journal | 813 bytes |
| Public journal digest | `e8aa9bc3671f75779cec78c91194ff33c56e7035a4100c6ee9ee644db564dd8c` |
| Raw succinct seal | 222,668 bytes |
| Proof chunks | `65,535 / 65,535 / 65,535 / 26,063` bytes |
| Terminal control | `join` / `7a8f24092c34ed3eb81b3d0a0b796c588c615d3488ef9e61c21dbd1e4b83ea6e` |
| Segments | 21 |
| User cycles | 20,258,174 |
| Total cycles | 22,020,096 |
| Paging cycles | 746,502 |
| Reserved cycles | 1,015,420 |
| Local proof test time | 1,864.50 seconds |

These measurements describe one local conformance fixture and are not a
throughput, proving-time, fee, or production-capacity guarantee.

The same pinned container also completed a separate real proof on 2026-07-26
with the R9 trust-root-bound validity tracker contract-ID override. That run
retained the same method/profile, 21 segments, 20,258,174 user cycles,
22,020,096 total cycles, 222,668-byte raw seal, and canonical four-chunk
partition. It completed in 1,848.41 seconds and produced a distinct statement
and manifest bound to `SPVTrackerValidityV1`. The subsequent fixture required
the explicit reviewed trust-anchor digest before the pinned JVM accepted the
tracker input. These values are local reproduction observations, not
activation, node acceptance, proving-performance, settlement, or readiness
evidence.

## JVM consumer check

The exact exported statement and four raw-seal chunks from the reference run
first pass the public direct verifier at SigmaState draft commit
`f78deadd668f801e7fae3bc884283f79c6f484fa`. Its authenticated profile-package
loader selects the exact profile above, its public claim builder reconstructs
the 813-byte statement, and `Risc0RawSealVerifier` reaches terminal `join` with
parameter `0`.

The bridge-owned consumer fixture then deserializes the exact frozen 85-byte
proposition, verifies byte-exact reserialization and AST identity, and uses
that parsed tree as the sole input script of a value-preserving transaction.
The exact proof succeeds. Single-fault checks change proof bytes, chunk order
or length, `programId`, `chainDomainId`, `SELF`, application payload,
`profileId`, profile lifecycle, context-variable shape and ErgoTree version.
Cryptographic mutations must reduce to `false`; unexpected interpreter errors
cannot count as proof rejection. The relayer independently ingests the same
manifest-bound transient candidate through the strict WP-06W envelope.

This is Rust-producer/TypeScript-envelope/JVM-input-script preactivation
conformance. The generated proof files are transient run output and are not a
canonical or checked-in proof vector.

This is preactivation engineering evidence. It does not activate proof-system
ID `2`, close EIP-0045 B4-B8, prove WASM/JVM `ContextExtension`
serialization, establish target-node transaction acceptance, authorize a
payout, close Gate 5, or establish production readiness.
