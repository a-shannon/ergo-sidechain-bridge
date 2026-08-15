# EIP-0045 Consumer Conformance

This directory contains the bridge-owned SigmaState consumer fixture for the
preactivation validity proof. It exercises the exact four-child `VerifyStark`
expression under the public SigmaState draft at commit
`f78deadd668f801e7fae3bc884283f79c6f484fa`.

The frozen version-4, constant-segregated proposition is 85 bytes:

```text
1c53020e205b46bf0ef2ff959327bfb39c6ac4dae48d509a0fcf91f89dcf84b26f442039340e2023c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383d1b9e4e3001ae4e3010e73007301
```

Its Blake2b-256 contract identity is:

```text
9d0ac3c2c7889ef4bfa53c31903f5e11012f20b24156cbcf82b3435d95a290fc
```

Context variable `0` carries `Coll[Coll[Byte]]` proof chunks and context
variable `1` carries the application payload. The program and profile IDs are
constant-segregated children. The fixture reconstructs the transaction
containing `SELF`, preserves ERG value into one output, and runs ordinary input
script verification with the authenticated stock profile runtime.

## Reproduction

First generate an empty-directory candidate with the exact command documented
in [`../zkvm/README.md`](../zkvm/README.md). The candidate must contain:

- `statement.bin`;
- `program-id.bin`;
- `profile-id.bin`;
- `terminal-control-id.bin`;
- `proof-chunk-0.bin` through `proof-chunk-3.bin`;
- `candidate-manifest-v1.txt`, written last after all host assertions and
  binding the exact file order, lengths and Blake2b-256 digests.

The relayer must ingest that same transient candidate before the JVM check:

```powershell
Push-Location relayer
$env:BRIDGE_EIP0045_CANDIDATE_DIR = $candidateDir
npm.cmd test -- --run src/bridge-validity-proof-envelope-v1.candidate.test.ts
Remove-Item Env:BRIDGE_EIP0045_CANDIDATE_DIR
Pop-Location
```

Check out the exact SigmaState commit, copy the fixture into its test tree, and
run only the consumer suite:

```powershell
git clone https://github.com/ScorexFoundation/sigmastate-interpreter.git sigma-eip0045-consumer
git -C sigma-eip0045-consumer checkout f78deadd668f801e7fae3bc884283f79c6f484fa

$destination = 'sigma-eip0045-consumer/sc/shared/src/test/scala/sigma/bridge'
New-Item -ItemType Directory -Path $destination | Out-Null
Copy-Item 'validity-proof/consumer-jvm/BridgeValidityConsumerSpec.scala' $destination

Push-Location sigma-eip0045-consumer
sbt.bat "-Dbridge.eip0045.candidate.dir=$candidateDir" `
  "scJVM/Test/testOnly sigma.bridge.BridgeValidityConsumerSpec"
Pop-Location
```

The suite requires the completion manifest, deserializes and executes the
frozen proposition bytes, accepts the exact proof, and rejects isolated changes
to proof bytes, chunk order and length, payload, program, chain domain, `SELF`
proposition, profile lifecycle, context-variable type or presence, and
ErgoTree version. Cryptographic mutations must complete as `false`; unexpected
interpreter errors do not count as rejection evidence.

This is a pinned JVM input-script conformance test. It is not opcode
activation, node-level transaction acceptance, proof-system ID `2` activation,
tracker admission, payout authorization, Gate 5 closure, or a trustless or
production-readiness claim. It constructs `ContextExtension` values directly
inside the JVM, so the separate cross-runtime fixture below is required.

## Exact ContextExtension Conformance

Generate a transient fixture from the same complete candidate. The command
builds the exact two-variable EIP-12 object, reparses it through
`ergo-lib-wasm-nodejs` 0.28.0, and exports the Sigma bytes extracted from that
parsed input:

```powershell
$contextDir = Join-Path ([System.IO.Path]::GetTempPath()) `
  'bridge-eip0045-context-conformance'
New-Item -ItemType Directory -Path $contextDir | Out-Null
$contextFixture = Join-Path $contextDir 'context-extension-v1.json'

Push-Location relayer
npm.cmd run proof:context-extension:fixture -- `
  --candidate-dir $candidateDir `
  --out $contextFixture
Pop-Location
```

Copy the separate parser fixture into the exact pinned SigmaState checkout and
run only that suite:

```powershell
$destination = 'sigma-eip0045-consumer/sc/shared/src/test/scala/sigma/bridge'
Copy-Item `
  'validity-proof/consumer-jvm/BridgeContextExtensionConformanceSpec.scala' `
  $destination

Push-Location sigma-eip0045-consumer
sbt.bat "-Dbridge.eip0045.context.extension.fixture=$contextFixture" `
  "scJVM/Test/testOnly sigma.bridge.BridgeContextExtensionConformanceSpec"
Pop-Location
```

The JVM must consume every byte, recover exactly variable `0` as
`Coll[Coll[Byte]]` and variable `1` as `Coll[Byte]`, match all proof chunks and
the application payload, and emit byte-identical serialization. Missing,
extra, wrong-typed, reordered, mutated, truncated and trailing variants reject.

This result applies only to the exact two-variable preactivation fixture. It
does not establish canonical ordering for arbitrary or larger maps, relax the
four-Var bridge guard, sign or check a transaction, activate EIP-0045, close
Gate 5, or authorize funds.

## Exact Proofless Transaction Conformance

Generate the complete proofless transaction fixture from the same completed
candidate:

```powershell
$transactionDir = Join-Path ([System.IO.Path]::GetTempPath()) `
  'bridge-eip0045-proofless-transaction'
New-Item -ItemType Directory -Path $transactionDir | Out-Null
$transactionFixture = Join-Path $transactionDir 'proofless-transaction-v1.json'

Push-Location relayer
npm.cmd run proof:proofless-transaction:fixture -- `
  --candidate-dir $candidateDir `
  --out $transactionFixture
Pop-Location
```

Copy the transaction conformance spec into the pinned SigmaState checkout and
run only that suite:

```powershell
$destination = 'sigma-eip0045-consumer/sc/shared/src/test/scala/sigma/bridge'
Copy-Item `
  'validity-proof/consumer-jvm/BridgeProoflessTransactionConformanceSpec.scala' `
  $destination

Push-Location sigma-eip0045-consumer
sbt.bat "-Dbridge.eip0045.proofless.transaction.fixture=$transactionFixture" `
  "scJVM/Test/testOnly sigma.bridge.BridgeProoflessTransactionConformanceSpec"
Pop-Location
```

The fixture starts with the parsed WP-06Y EIP-12 unsigned transaction, converts
it to a transaction with one empty spending proof, and exports the exact
sigma-rust bytes-to-sign. The JVM independently constructs the typed
transaction, requires byte equality, strictly parses the producer bytes, and
reserializes them byte-identically. For the complete candidate, all three
identities agree:

```text
bytes-to-sign length: 223421
bytes-to-sign Blake2b-256: 89e8063760f991b17cfb9fe685adc11d4f0dab38e6222a12181518468fa9037e
transaction ID: 89e8063760f991b17cfb9fe685adc11d4f0dab38e6222a12181518468fa9037e
```

The matrix changes the input ID, STARK-proof chunk, payload, output value,
output tree and creation height, and rejects a non-empty spending proof or
added data inputs, assets, registers, inputs or outputs. The spending-proof
case deliberately preserves bytes-to-sign and transaction ID while changing
the complete serialized transaction. Truncated and trailing transaction bytes
also reject.

This is proofless whole-transaction serialization conformance for one exact
preactivation fixture. It performs no signing, node check, submission or
broadcast; it does not activate EIP-0045, close Gate 5, establish source
finality or authorize funds.

## Exact Validity Settlement Conjunction

WP-06AB adds a separately versioned settlement consumer for the exact
`SPVTrackerValidityV1` successor produced by WP-06AA. The complete transaction
spends a committee-free DUP singleton, a causal settlement vault, and one
separate fee-funding input. It reads the validity tracker as its only data
input, pays the authenticated burn recipient, preserves the remaining vault
value, and advances the replay digest atomically.

Start from an already generated and verified WP-06AA tracker context plus the
public Frontier bridge-event-root vector. Copy both WP-06AB suites into the
same pinned SigmaState checkout:

```powershell
$bridgeRoot = (Resolve-Path '.').Path
$trackerContext = '<absolute path to a new verified WP-06AA context>'
$destination = 'sigma-eip0045-consumer/sc/shared/src/test/scala/sigma/bridge'
Copy-Item `
  'validity-proof/consumer-jvm/BridgeValiditySettlementContractSpec.scala' `
  $destination
Copy-Item `
  'validity-proof/consumer-jvm/BridgeValiditySettlementAcceptanceSpec.scala' `
  $destination

$identityDir = Join-Path ([System.IO.Path]::GetTempPath()) `
  'bridge-validity-settlement-identity'
New-Item -ItemType Directory -Path $identityDir | Out-Null
$contractIdentity = Join-Path $identityDir 'contracts-v1.json'

Push-Location sigma-eip0045-consumer
sbt.bat "-Dbridge.validity.settlement.root=$bridgeRoot" `
  "-Dbridge.eip0045.validity.settlement.identity.out=$contractIdentity" `
  "scJVM/Test/testOnly sigma.bridge.BridgeValiditySettlementContractSpec"
Pop-Location
```

The identity output must not already exist. Generate one new complete
transaction fixture through the installed `ergo-lib-wasm-nodejs` parser:

```powershell
$settlementDir = Join-Path ([System.IO.Path]::GetTempPath()) `
  'bridge-validity-settlement-context'
New-Item -ItemType Directory -Path $settlementDir | Out-Null
$settlementFixture = Join-Path $settlementDir 'context-v1.json'
$frontierVector = Resolve-Path `
  'relayer/test-vectors/frontier-bridge-event-root-v1.json'

Push-Location relayer
npm.cmd run proof:validity-settlement:fixture -- `
  --tracker-context $trackerContext `
  --contract-identity $contractIdentity `
  --frontier-vector $frontierVector `
  --out $settlementFixture
Pop-Location
```

Run the full three-input transaction and the two protected-predicate
conjunction in the pinned JVM:

```powershell
Push-Location sigma-eip0045-consumer
sbt.bat `
  "-Dbridge.eip0045.validity.settlement.context.fixture=$settlementFixture" `
  "scJVM/Test/testOnly sigma.bridge.BridgeValiditySettlementAcceptanceSpec"
Pop-Location
```

The contract suite freezes both compiled ErgoTrees. The acceptance suite
checks partial and terminal payout branches and rejects isolated changes to
the tracker identity, trust root, anchor age, burn leaf/path, recipient,
amount, asset, source intent, DUP profile/proofs/successor, vault successor,
state-successor creation-height aging/future bounds, fee input/output,
input/data-input/output ordering and transaction shape. The fixture builder
strictly parses the exact raw tracker context, contract-identity receipt and
Frontier vector bytes, rejects duplicate JSON keys and non-ASCII input, and
retains one SHA-256 binding for each source. The JVM pins those three source
bindings plus the SigmaState commit and the template, resolved-source and
proposition identities emitted by the contract suite. The
third input is retained in the exact transaction and context, but its synthetic
true proposition is not evidence of fee-funding authorization. The first
Merkle level deliberately mutates sibling bytes rather than its side bit
because the odd-width fixture duplicates that sibling and makes the side label
semantically neutral at that level.

The JSON fixture does not claim that it reduced itself; the pinned-JVM suite is
the deciding reduction authority. The setup boxes are synthetic and no
singleton genesis lineage is established. The V1 compatibility proof does not
establish that its burn root is a member of finalized Frontier application
state. No signing, node check, submission, broadcast, profile activation,
Gate 5 closure, trustless claim or funds authority follows.

## Application-Bound V2 Settlement Conjunction

WP-06AE adds a non-cross-compatible settlement consumer for the exact
`SPVTrackerValidityApplicationV2` successor. A separate real RISC Zero
candidate binds the application vector's execution-block hash,
`bridgeEventRoot`, and three-burn count into the authenticated application
statement. The tracker context then carries that result into a distinct
three-input, one-data-input payout/DUP transaction.

Use `BridgeValidityApplicationSettlementContractSpec` to regenerate and freeze
the two contract identities. Build the unsigned fixture with:

```powershell
npm run proof:validity-application-settlement:fixture -- `
  --tracker-context <absolute-application-tracker-context.json> `
  --contract-identity <absolute-contract-identity.json> `
  --frontier-vector <absolute-application-vector.json> `
  --out <absolute-new-settlement-context.json>
```

Run the complete protected-predicate matrix in the pinned checkout:

```powershell
sbt.bat `
  "-Dbridge.eip0045.validity.application.settlement.context.fixture=<absolute-settlement-context.json>" `
  "scJVM/Test/testOnly sigma.bridge.BridgeValidityApplicationSettlementAcceptanceSpec"
```

The suite byte-matches the transaction and both compiled predicates, accepts
partial and terminal payout branches plus the integrated three-leaf path. A
separate synthetic tracker AVL state exercises the settlement predicate's
one-leaf branch; it is not a separately proved application/tracker-admission
chain. The suite rejects isolated tracker, V1, checkpoint, burn, payout, DUP,
proof-length, counter, source, fee, ordering, normalized-LF provenance,
duplicate fixture keys, and required-context mutations. Extra ContextExtension
exclusion is an exact serializer guard because ErgoScript cannot enumerate
supplied keys.

The canonical formats, identities, reproduction sequence, and claim boundary
are documented in
[`bridge-validity-application-settlement-v2.md`](../../docs/bridge-validity-application-settlement-v2.md).
This remains local preactivation conformance. It does not establish target-node
acceptance, singleton lineage, signing, broadcast, Gate 5, or funds authority.

## V3 Application Lineage Instance

WP-06AF-2 resolves a new application instance from two validated genesis-box
IDs and the non-circular V3 lineage profile. The frozen V2 tracker, vault and
DUP identities remain compatibility fixtures. The V3 tracker template binds
the exact application binding, program and verifier profile; the vault then
binds that tracker, the DUP binds the vault contract ID, and the source lock
binds the same vault contract ID, all six source-intent identity fields and the
exact committee activation policy.

Start from a clean checkout at the exact SigmaState commit named in
`validity-application-lineage-compiler-lock-v1.json`. Run the guarded launcher
from the bridge root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/run-validity-application-lineage-compiler.ps1 `
  -SigmaStateCheckout <absolute-clean-sigmastate-checkout> `
  -BridgeRoot (Resolve-Path '.').Path `
  -JavaHome <absolute-reviewed-java-home> `
  -SbtLaunchJar <absolute-reviewed-sbt-launch.jar> `
  -OutputPath <absolute-new-receipt.json>
```

The launcher rejects a dirty or wrong-commit SigmaState checkout, checks the
locked Java executable/runtime image, sbt launcher JAR, build files, compiler
spec and four bridge templates, and refuses inherited Java/sbt/coursier option
overrides. It creates a fresh detached compiler worktree and removes it after
the run. The output is create-only and must match the reviewed batch SHA-256,
not merely its JSON metadata. The tracker uses the EIP-0045 STARK ErgoTree
version; the vault, DUP and source lock retain the standard version. Repeated
compilation must be byte-identical.

The canonical 19,352-byte receipt has SHA-256
`280081d89ad8303506b3890559bef047cf6ac1bb2a23b729a7e9903e77cf3132`.
It records these exact proposition identities:

| Role | Bytes | Blake2b-256 contract ID |
|---|---:|---|
| Tracker | 2,424 | `e0770da9d4be80c9cb5270401346189f2a28b1c8afc301948d14c7e838d4da42` |
| Causal vault | 3,562 | `402eed06957dfa7cbdcd817c6e8e99498b2b2857a22e9af4edc8e5c8f8c78831` |
| DUP | 701 | `8e616c52d62bc99fb8efcbd3ea63df858b938cf0e81c6286bc0db628452894fb` |
| Source lock | 867 | `d32271c7e408b69d57e8ce56aa161b8d30c7d960180233d6376c0078b73ef675` |

The TypeScript lineage compiler accepts only the exact reviewed receipt bytes.
It does not accept a caller-supplied compiler callback. It re-derives the
profile from the complete EIP-12 genesis boxes and verifies every
resolved-source hash, proposition hash and contract ID.

An initial full-ErgoTree source-lock binding exceeded Sigma's 4,096-byte reader
limit. `MainChainLockCausalLineageV3` therefore commits to
`Blake2b-256(vault.propositionBytes)` instead. It also compares the staged
intent's source network, sidechain, bridge, token, settlement profile and
causal profile to the compiled instance. The frozen V2 source remains
unchanged.

This compiler receipt establishes deterministic local proposition identity
only. Source-lock transition acceptance belongs to WP-06AF-3. The receipt does
not construct setup transactions, prove singleton lineage, perform a node
check, sign, submit, broadcast, authorize funds or close Gate 5.

## Substrate Federated V1 Tracker Admission

FED-2B adds an EIP-independent, VM-v3 tracker consumer for the exact
`substrate-federated-v1` statement. The ErgoTree authenticates
`0x0401 = bridge_event_root || statement_id`, enforces the statically compiled
Ergo-admission threshold proposition, and binds the exact append-only tracker
successor. Source Ed25519 attestations remain an off-chain precondition; the
on-chain deciding authority is the disclosed Ergo SigmaProp key set.

Run the guarded fixture generator and pinned-JVM matrix from the bridge root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File validity-proof\consumer-jvm\run-substrate-federated-tracker-v1.ps1 `
  -SigmaStateRoot <clean-pinned-sigmastate-checkout> `
  -NodePath <node-24-executable> `
  -JavaPath <jdk-17-java-executable> `
  -SbtLauncherPath <sbt-launch.jar>
```

The runner checks exact input hashes, regenerates the deterministic fixture,
recompiles the contract in the pinned checkout, verifies the exact transaction
and protected-input reduction, and rejects structural statement, proof,
anchor-selector and successor mutations. It also confirms that an empty
spending proof does not authorize the input.

This is local VM-v3 transaction conformance under a disclosed 2-of-3
federation authority. It performs no signing, node check, submission or
broadcast and establishes neither activated funds authority, Gate 5 closure,
trustless status nor production readiness.
