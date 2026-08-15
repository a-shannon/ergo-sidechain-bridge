# Authenticated V2 Staged Provisioning

## Purpose

The authenticated V2 contracts cannot be provisioned as one stable chain of
precomputed transactions. Tracker admission reads an Ergo header by position
from `CONTEXT.headers`; a new tip changes that position and invalidates the
candidate. Settlement must also consume confirmed, observed tracker, DUP, and
vault boxes rather than treating predicted descendants as chain state.

`npm run settle:authenticated:provision-plan` therefore builds a deterministic
offline package with three explicitly different stages:

| Stage | Package output | Execution status |
|---|---|---|
| Setup | Unsigned tracker setup and atomic DUP/vault setup candidates. | Candidate only. Contract source-to-tree verification and separate operator approval remain required. |
| Admission | A four-Var tracker admission preview bound to one exact Ergo state context. | It must be rebuilt after setup confirmation from the ordered ten mined headers `H..H-9` and the node-compatible `simplifiedUpcoming` preheader at `H+1`. |
| Settlement | A predicted authenticated payout/DUP descendant. | Preview only. It must be rebuilt from confirmed tracker, DUP, and vault boxes after anchor-depth and burn revalidation. |

The package exposes no execution, signing, JVM check, submit, deployment, or
broadcast route.

`npm run settle:authenticated:stage-plan` now implements the two required
post-confirmation rebuilds. It consumes sanitized operator-supplied node
observations; it does not contact a node itself and therefore does not promote
those observations into cryptographic evidence.

## Input Contract

The input is an explicit sanitized JSON document with schema:

```text
e2s.authenticated-v2-staged-provisioning-input.v5
```

It must contain exactly these top-level fields:

| Field | Required binding |
|---|---|
| `schema` | Exact `e2s.authenticated-v2-staged-provisioning-input.v5`. Earlier schemas are rejected. |
| `fundingObservation` | Complete `e2s.authenticated-v2-funding-observation.v1` report. The CLI validates its digest, boxes, Sigma bytes, boundary, and all-false authorization. |
| `initialBinding` | Complete bound `e2s.authenticated-v2-initial-binding-report.v1` report. ID-only/unobserved reports are rejected. |
| `provisioningCreationHeight` | Height of the state context used only for the admission preview. |
| `settlementCreationHeight` | Later height used for the settlement preview; normal anchor-depth rules still apply. |
| `sidechainIdHex` | Exact 32-byte sidechain identity. |
| `committeePubKeyHex` | Compressed bridge-committee key retained only as DUP authorization metadata and controlled by the setup funding signer. |
| `trackerFinalityAttestorPubKeyHex` | Distinct compressed DLog key placed in tracker R9. Equality with `committeePubKeyHex` is rejected. Key inequality does not prove organizational independence. |
| `values` | Tracker, DUP, vault, setup-fee, and admission-fee values. |
| `vault` | Deposit ID, depositor identity, and provenance register bytes. |
| `checkpoint` | Frozen checkpoint bytes, canonical 496-byte aggregate-finality commitment, extension proof, and exact anchor header identity/index. |
| `settlement` | Burn-bound peg-out, trustless-burn leaf identity/proof, and recipient ErgoTree. |

The JSON input cannot independently supply `environment`, `trackerFundingBox`,
`dupVaultFundingBox`, or `contracts`. The CLI derives those values from the two
validated reports, injects the checked-in source templates, recomputes the
initial-binding input digest and compiler identity digest, and checks every
resolved source/tree relation. This removes the previous manual copy boundary.
Legacy V1 provisioning input is rejected rather than silently upgraded.

The emitted package uses schema
`e2s.authenticated-v2-staged-provisioning-plan.v5`. Its own digest covers the
funding-observation report and snapshot digests plus the initial-binding report
and input digests, both authority keys, and the exact separation boundary. The
complete reports remain required review sidecars; their
unkeyed hashes are bindings, not attestations or execution authority.

## Deterministic Initial Binding

The tracker and DUP singleton IDs are the first-input box IDs of their setup
transactions. Those IDs must therefore be selected before the final contract
trees can be compiled. The ID-only input schema is:

```text
e2s.authenticated-v2-initial-binding-input.v1
```

It contains exactly `schema`, `environment`, `trackerFundingBoxId`, and
`dupVaultFundingBoxId`. Both IDs must be distinct canonical lowercase 32-byte
hex values and the environment must be explicitly non-mainnet. Source text and
caller-selected ErgoTrees are not accepted.

`npm run contracts:authenticated-v2:derive-initial-binding` resolves and
compiles the three checked-in templates through a three-pass fixed point:

1. Compile from internal seed trees to derive the tracker and unlock trees.
2. Re-resolve the DUP source against the Blake2b-256 hash of that unlock tree.
3. Compile the resulting graph again and require all source hashes and all
   three ErgoTrees to remain byte-for-byte stable.

The report exposes `provisioningContracts`, which has the exact shape required
by the full provisioning input. It also records the pinned compiler identity,
resolved-source hashes, both singleton IDs, and an all-false authorization
boundary. When its input is only the ID schema, it does not establish that
either funding box exists, belongs to the named non-mainnet network, is pure
ERG, remains canonical, or is unspent. The CLI also accepts the funding
observation report described below and then binds the observation digest and
exact tip into the initial-binding result. That binding still requires fresh
revalidation before setup.

## Guarded Funding Observation

The concrete WP-06H source milestone adds a bounded read-only command:

```powershell
npm run contracts:authenticated-v2:observe-funding -- --environment <non-mainnet> --node-url <origin> --tracker-funding-box-id <64hex> --dup-vault-funding-box-id <64hex> --out <new-report.json>
```

It uses only `GET /info`, `GET /blocks/lastHeaders/1`, `GET /utxo/byId/<id>`,
and `GET /utxo/byIdBinary/<id>`. The observer requires the same visible tip
before and after both box reads, an explicitly non-mainnet Ergo network, and
two distinct canonical box IDs. For each box it recomputes the EIP-12 `boxId`, requires the
canonical Sigma bytes returned by `byIdBinary` to agree with the JSON box, and
rejects every token-bearing box so that both inputs are pure ERG.

The report emits `initialBindingInput` plus `provisioningFundingBoxes`.
`contracts:authenticated-v2:derive-initial-binding` accepts that report as its
input and carries the report digest and observed tip into its output, so the
selected compiler binding and provisioning boxes refer to one observation.

This is one-node point-in-time UTXO-view evidence, not an atomic header/state
snapshot or a global chain proof. The node routes acquire their readers
independently, so matching tips around the reads detect visible tip drift but do
not prove that each UTXO response was served from the exact reported header
state. The report therefore records `tipUtxoAtomicityProved = false`. It does
not establish funding sufficiency, signer control, continued canonicality or
unspentness, and it authorizes no transaction, signing, check, submit, deploy,
or broadcast action. Both boxes must be revalidated immediately before setup.
Only local fixtures and tests validate this path so far; real observation is
pending an explicit non-mainnet endpoint and two explicit funding-box IDs.
Gate 5 remains open.

## Pre-Setup Funding Revalidation

WP-06J adds one bounded command for the last read-only funding check before a
separately approved setup procedure:

```powershell
npm run settle:authenticated:pre-setup-revalidate -- --input <provisioning-v5.json> --expected-package-digest <64hex> --node-url <non-mainnet-origin> --out <new-report.json>
```

Before contacting the node, the command validates the complete V2 input,
rebuilds the deterministic package, and requires its digest to equal the
explicit expected digest. It derives the environment and both funding-box IDs
from that input; callers cannot override them. It then performs the same eight
bounded GET requests as the guarded observer and requires the fresh report to
match the prior report's network, complete EIP-12 boxes, canonical Sigma bytes,
and Sigma-byte digests.

Funding sufficiency uses the same helper as setup construction:

```text
tracker required = tracker singleton + setup fee + admission fee + 1,000,000 nanoERG change
DUP/vault required = DUP singleton + vault + setup fee + 1,000,000 nanoERG change
```

The report retains each component, available amount, required amount, surplus,
shortfall, both complete observations, all four package-provenance digests, and
the rebuilt package digest. Exact equality is sufficient; one nanoERG below
either requirement is rejected.

The command prints the fresh observation digest separately from the JSON
report. Retain that value in an independent command transcript or another
reviewed capture, then validate a retained report offline with:

```powershell
npm run settle:authenticated:pre-setup-validate -- --input <provisioning-v5.json> --report <pre-setup-report.json> --expected-package-digest <64hex> --expected-fresh-observation-digest <64hex>
```

The expected fresh-observation digest must not be read back from the report
being validated. Doing so would allow a modified nested observation and a
recomputed outer digest to validate together. The report digests are unkeyed
content bindings, not signatures, freshness attestations, or proof that the
observed boxes remain unspent.

This does not eliminate the final time-of-check/time-of-use race. Header and
UTXO reads are not atomic, a node can be stale or dishonest, and either box can
be spent immediately after the last GET. The report therefore keeps atomicity,
global canonicality, continued unspentness, signer control, Ergo-verifiable
finality, setup authorization, and Gate 5 closure false. The same inputs must be
revalidated again at any later execution boundary. Signer-control evidence is a
separate key/signing work package and is not inferred here.

### Initial-Binding Closeout Matrix

| Invariant | Producer / enforcement | Downstream consumer | Failure if relaxed | Positive / isolated negative |
|---|---|---|---|---|
| The observer reaches an explicit credential-free root endpoint, identifies an approved non-mainnet Ergo network, and sees the same visible tip before and after both box reads without claiming atomic header/UTXO state. | Funding-observation URL/network normalizer, paired `/info` and `lastHeaders/1` snapshots, and explicit `tipUtxoAtomicityProved = false`. | Point-in-time funding report and its initial-binding provenance. | A redirect, credential-bearing target, mainnet node, visible reorg, or independently acquired header/UTXO readers could be presented as one atomic observation. | Stable testnet tip; credential, path/query, mainnet/unknown-network, height mismatch, and changed-tip rejections; atomicity remains explicitly unproved. |
| Each requested ID is present in the node's current UTXO view and is rederived from both EIP-12 JSON and canonical Sigma bytes. | `/utxo/byId`, `/utxo/byIdBinary`, `ergo-lib-wasm` JSON parsing, binary round-trip, and byte-for-byte canonical box comparison. | `initialBindingInput` identities and `provisioningFundingBoxes`. | An unknown/spent/reorged box, forged JSON identity, alternate serialization, or mismatched binary body could feed provisioning. | Two linked boxes; 404 remains explicitly ambiguous, while JSON-ID, JSON/binary, future-height, and provisioning-fragment mutations are rejected independently. |
| Both observed boxes are distinct and pure ERG. | ID cardinality and empty-asset checks in the observer. | Tracker-NFT and DUP-NFT first-input minting candidates. | One input could be reused twice or an existing token could be silently consumed by setup. | Two distinct empty-asset boxes; duplicate-ID and token-bearing-box negatives. |
| The observation's report digest, snapshot digest, cross-field IDs, downstream fragments, boundary, and all-false authorization agree. | Observation-report parser used by the initial-binding CLI. | Initial-binding input digest and provenance record. | A modified report, mismatched box fragment, or re-enabled authority bit could be rebound to compiler output. | Untampered report; stale digest, recomputed cross-field mismatch, and recomputed `execute = true` negatives. |
| The provisioning package derives boxes and contracts from the complete validated reports, and its digest covers all four provenance digests. | V2 provisioning-input hydrator plus strict initial-binding report validation. | Setup candidates, package-bound conformance, and both confirmed-stage rebuilds. | A caller could substitute a box/tree or detach retained evidence from an otherwise identical transaction package. | Cross-bound reports produce one package; V1 input, duplicate caller fragments, stale outer digest, recomputed input drift, contract drift, funding-binding drift, and enabled authorization are rejected. |
| Environment is explicitly non-mainnet; funding IDs are canonical, 32-byte, and distinct. | Initial-binding request normalizer. | Singleton IDs in provisioning source resolution. | Ambiguous IDs or an unsupported network label could be bound into a deployment candidate. | Deterministic derivation; mainnet, uppercase, short, and duplicate-ID rejections. |
| All three templates are the checked-in bytes under exact SHA-256 pins. | Canonical template loader plus resolver pin checks. | Pinned JVM compiler and provisioning hydrator. | An alternate source could be paired with an apparently valid tree. | Canonical production sources; one-template hash drift. |
| Every compiler record has the expected role, resolved-source hash, complete tree bytes, and matching tree hash. | Per-pass compiler observation validation. | The following dependency pass and final report. | Reordered or substituted compiler output could become a binding. | Three valid records; source-hash, role, and tree-hash mutations. |
| Tracker and unlock trees are independent of the provisional seed/DUP tree. | Pass-one to pass-two equality. | DUP source resolution against the exact unlock-tree hash. | A cyclic or unstable dependency could produce a non-reproducible deployment graph. | Stable production graph; isolated tracker and unlock drift. |
| Pass two and pass three are a full source/tree fixed point. | Equality for all three resolved-source hashes and ErgoTrees. | `provisioningContracts` and later package-bound conformance. | A provisional DUP or changed final tree could be published as deployable. | Three-pass fixed point; isolated pass-three drift. |
| Compiler/toolchain identity is unchanged across all passes. | Canonical complete compiler-lock and source-baseline digests plus parent-runtime and observed compiler identities. | Reproducible report and later conformance review. | Different binaries, lock fields, or source baselines could contribute different stages of one report. | Stable pinned identity; one-pass runtime-bundle identity drift. |
| Derivation grants no transaction or release authority. | ID-only self-check or digest-bound observation input plus an all-false authorization object. | Operator handoff and provisioning procedure. | A source/tree result could be mistaken for setup, finality, or Gate 5 approval. | Offline compiler derivation and static observer surface test; transaction construction, signer, check, submit, deploy, and broadcast routes remain absent. |
| A successful one-node observation is not promoted to atomic tip binding, global canonicality, or future UTXO availability. | Explicit false boundary fields and mandatory pre-setup revalidation. | Full provisioning review and any later approved setup procedure. | A point-in-time node response could be mistaken for consensus proof or durable spending authority. | Report records the visible surrounding tip while `tipUtxoAtomicityProved`, `globalCanonicalityProved`, signer control, and funding sufficiency remain false. |
| Revalidation applies to the exact reviewed package before network access. | V2 hydrator, deterministic package rebuild, and explicit expected package digest. | Pre-setup funding report and later approval handoff. | Valid boxes could be checked for a different package, value allocation, checkpoint, or contract graph. | Matching package passes; a one-byte expected digest change is rejected before the first GET. |
| Fresh funding identity includes complete boxes and canonical Sigma bytes on the same non-mainnet network as the prior report. | Prior/fresh observation validators plus exact box, Sigma-byte, Sigma-digest, and network comparisons. | First-input singleton mint candidates. | A stale, substituted, differently serialized, or wrong-network observation could be presented as the reviewed inputs. | Unchanged observations pass; network drift, either 404, unstable tip, credential/path/query URL, JSON-ID drift, and JSON/binary drift fail closed. |
| A retained fresh observation remains bound to the separately captured command result. | Offline validator requires the fresh-observation digest as an external argument rather than trusting the nested report field. | Review handoff for the exact pre-setup point-in-time observation. | An editor could change nested observation metadata and recompute both unkeyed report digests. | Original external digest passes; coordinated nested-observation and outer-digest recomputation fails. |
| Funding requirements are identical in assessment and setup construction. | Shared funding-assessment helper consumed by the provisioning builder and revalidator. | Tracker setup, admission-fee change, DUP singleton, and vault setup. | A reporting-only formula could approve inputs that the actual builder cannot conserve. | Both exact boundaries pass; each lane at one nanoERG short is rejected by the helper and builder. |
| A PASS report grants no durable spending or setup authority. | Explicit TOCTOU boundary and all-false authorization record. | Any future signer/check procedure. | Point-in-time availability could be mistaken for signer control, finality, continued unspentness, or approval. | Every boundary and authorization bit has an isolated rehashed negative; execution must revalidate again. |

### WP-06H Evidence Vector

| Dimension | Status |
|---|---|
| Implementation | `matrix_covered` |
| Independent review | `complete` — the first pass found four issues; the corrected exact diff received a second pass with no findings. |
| CI | `not_run` — local checks are not presented as CI evidence. |
| Target runtime | `not_run` — no real non-mainnet endpoint or funding boxes were supplied. |
| Readiness claim | `local_only` |

### WP-06I Evidence Vector

| Dimension | Status |
|---|---|
| Implementation | `matrix_covered` |
| Independent review | `complete` — no implementation finding; two isolated-test gaps were corrected and the delta rereview found no remaining issue. |
| CI | `not_run` — local checks are not presented as CI evidence. |
| Target runtime | `not_run` — no real non-mainnet observation/package pair was supplied. |
| Readiness claim | `local_only` |

### WP-06J Evidence Vector

| Dimension | Status |
|---|---|
| Implementation | `matrix_covered` |
| Independent review | `complete` - one report-binding issue and two low-severity closeout gaps were corrected; the final delta rereview found no remaining issue. |
| CI | `not_run` - local checks are not presented as CI evidence. |
| Target runtime | `not_run` - no real non-mainnet endpoint, funding boxes, or retained command transcript were supplied. |
| Readiness claim | `local_only` |

### WP-06K Evidence Vector

| Dimension | Status |
|---|---|
| Implementation | `matrix_covered` - the local source path and isolated invariant tests are implemented. |
| Independent review | `complete` - three findings from the first pass were corrected; the isolated delta rereview found no remaining issue. |
| CI | `not_run` - local tests are source/test coverage, not evidence of a real node run. |
| Target runtime | `not_run` - no approved sanitized package, pinned source checkout, loopback non-mainnet node, funding inputs, or signer were supplied. |
| Readiness claim | `local_only` - Gate 5 and Phase 011 remain on the critical path. |

The provisioning package itself keeps `contractVerification.sourceToTree` set
to `unverified`: package construction cannot certify its own caller-supplied
trees. The separate pinned conformance command described below must rebuild the
same package digest, resolve the same sources, compile them independently, and
match every ErgoTree byte before any execution workflow may consume the setup
candidates.

## Pinned Resolver-Free Source-To-Tree Conformance

`npm run contracts:authenticated-v2:conformance` provides the compiler check for
one exact provisioning package without contacting a node. It runs a small
source-controlled JVM compiler project bound to:

- Ergo node source base `v6.0.2` at commit
  `2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1`;
- `sigma-state` 6.0.2 plus the reviewed SHA-256 of the loaded compiler JAR;
- Scala 2.12.20 and sbt 1.11.1 for construction of one deterministic,
  content-addressed runtime bundle whose numbered entries preserve the complete
  classpath order, plus independently re-hashed compiled tool classes;
- the complete reviewed Microsoft OpenJDK 17.0.19+10-LTS distribution tree,
  not only its launcher or modules file;
- the Windows x64 parent runtime: Node 24.14.0 and Git 2.54.0 executable
  identities, relayer package-lock digest, and the exact tsx/esbuild loader
  package trees;
- testnet network prefix 16, script version 3, and ErgoTree version 0;
- SHA-256 locks for the standalone build, sbt properties, and compiler source.

Sbt is a bundle-construction tool, not part of the authoritative execution
path. `runtimeBundle` copies the compiled classes and every resolved dependency
into numbered entries. The verifier requires the exact locked bundle digest,
entry order, classpath digest, compiled-class digest, and `sigma-state` JAR
digest before invoking Java directly. A mutable sbt, Ivy, or Coursier cache can
therefore only produce a bundle that is rejected unless every locked byte is
unchanged. Bundle construction may populate missing dependencies from configured
repositories; it is not itself described as offline.

For each run, the verifier copies that bundle and the complete locked JDK into
a fresh private directory. It checks both source and private copies before the
run, makes snapshot files read-only, and re-hashes them afterward. The original build definition, sbt
properties, compiler source, and exact project file set are also checked before
and after execution, so inserting a global or project plugin cannot affect the
direct-Java run or survive validation. The child receives private HOME,
USERPROFILE, application-data, temporary, PATH, and JAVA_HOME values;
`CLASSPATH`, JVM option variables, sbt overrides, `SIGMASTATE_VERSION`, and
unrelated process variables are not inherited.

The parent rejects Node/tsx loader overrides, validates the pinned Node and
loader package identities, resolves Git only by its locked version and
executable digest, and gives every Git subprocess a reconstructed environment
without inherited `GIT_*` state. These controls assume an exclusive trusted
host: a malicious process already running as the same OS user during the
verification window is outside this verifier's authority and must be excluded
by the operator or CI runner isolation policy.

The command first binds the exact consensus-source-lock digest, Ergo patch
digest, patched blob IDs, and exact patched Ergo
checkout. It then recomputes each resolved-source SHA-256, compiles all three
contracts, and compares complete lowercase ErgoTree bytes and SHA-256 values.
`PASS` requires all of those checks. A mocked compiler, a version-only node
claim, or matching caller-supplied tree/hash pairs are not sufficient.

The report is deterministically digest-bound to the provisioning package and
records the observed compiler metadata. It remains a reproducible local result,
not an execution attestation: a downstream consumer must rerun the verifier and
must not accept retained JSON alone as setup approval. Its
authorization boundary remains all false: source-to-tree `PASS` does not sign,
check, submit, deploy, close Gate 5, prove sidechain finality on Ergo, or make a
production-readiness claim.

## Authenticated V2 Setup JVM Check

WP-06K adds the explicit check-only command:

```powershell
npm run settle:authenticated:setup-check -- --input <provisioning-v5.json> --expected-package-digest <64hex> --node-url <loopback-non-mainnet-origin> --ergo-source <pinned-ergo-checkout> --mnemonic-stdin --out <new-report.json>
```

The command requires `AUTHENTICATED_V2_SETUP_CHECK_ENABLED=true` while
`BRIDGE_BROADCAST_ENABLED` remains false. It rebuilds and binds the exact
package digest, reruns fresh pinned resolver-free source-to-ErgoTree conformance
for that package, and prefetches exactly ten distinct, contiguous,
parent-linked mined headers from `lastHeaders/10`. The newest mined header `H`
is the snapshot tip and `CONTEXT.headers(0)`; the signer derives the node's
`simplifiedUpcoming` preheader at `H+1`. It then performs the final fresh
funding revalidation for both exact funding inputs and requires its observed
tip to equal `H`.

The signer exists only in memory. It must control both exact P2PK funding inputs
and the bridge-committee key retained in DUP R6. Tracker R9 instead binds the
separate `trackerFinalityAttestorPubKeyHex`; the setup signer does not prove
control of that key. The setup report records that limitation and does not infer
organizational independence from unequal public keys. Both setup candidates must have empty
`ContextExtensions`. Their unsigned transaction IDs are derived independently
and compared with the package IDs before signing. Both candidates are signed
before either of the two fixed `POST /transactions/check` calls, and each
package, independently derived unsigned, signed, and node-returned transaction
ID must be equal.

The tracker setup and DUP/vault setup are two independent transactions; they are
not atomic together. The DUP singleton and vault outputs are atomic only within
the second transaction.

The command opens signer material only through non-interactive stdin. It does
not itself open a signer file or read signer material from environment
variables, dotenv, configuration, deployment state, or runtime state. The
upstream origin of a shell pipe cannot be detected: an approved operator must
supply stdin through the approved in-memory provider, and file redirection is
prohibited by procedure rather than attested by the report. Signed transaction
bytes are valid and broadcastable if captured, so this command is restricted to
a trusted loopback non-mainnet low-value node. Signed bytes are never persisted
or printed. The only retained output is a sanitized digest-bound report
containing public identities, bindings, ID equality, check-response digests,
and all-false authorization boundaries.

A `PASS` is not setup, submission, deployment, broadcast, Gate 5 closure,
production readiness, threshold governance, sidechain finality on Ergo, or a
target-runtime claim. WP-06K is local implementation/source coverage only. A
real target-runtime run remains pending and requires an actual approved
sanitized package and source checkout plus an approved node, funding inputs,
and signer. Gate 5 and Phase 011 remain the critical path.

## State-Context Binding

The tracker builder enforces:

```text
currentErgoHeight - anchorHeader.height == anchorHeader.contextIndex + 1
```

This matches the node's transaction-check context: `simplifiedUpcoming` at
`H+1` supplies `HEIGHT`, while `CONTEXT.headers(0)` is the latest mined header
`H`. The ten mined context headers are ordered `H..H-9`. A one-block tip
advance makes the preview stale. The package records `stateContextHeight =
H+1`, sets `expiresAfterHeight = H`, and requires rebuilding admission after
the setup outputs are confirmed and refetched.

The admission-stage rebuild strengthens that preview rule. Its input contains
one explicit chain snapshot, one derived `simplifiedUpcoming` preheader, and
exactly ten mined header summaries. The preheader must extend the snapshot tip
at height `H+1`; the ten mined headers must be newest-first, height-contiguous,
parent-linked, uniquely identified, and start at that tip `H`. The builder finds
the anchored mined header by ID, rechecks its height and extension root,
and derives `contextIndex`; callers cannot supply the index separately. Both setup boxes must match setup outputs
0 and 1 byte-for-byte, share the exact transaction and inclusion block, and be
reported unspent against that same snapshot. Their inclusion block ID must also
equal the header at the claimed inclusion height inside the supplied context.

## Confirmed-State Rebuilds

The stage command accepts schema:

```text
e2s.authenticated-v2-stage-rebuild-input.v2
```

For `stage = admission`, the input carries the original sanitized provisioning
input, its expected package digest, exact tracker/fee observations, and the
derived `simplifiedUpcoming` preheader plus ten mined context headers. The output schema is:

```text
e2s.authenticated-v2-confirmed-admission-plan.v3
```

It materializes a new unsigned tracker transaction and binds its digest to the
setup parents and exact tip. Any tip change requires another rebuild.

For `stage = settlement`, the input carries that complete admission plan, the
observed populated tracker, initial DUP singleton, and settlement vault, one
shared derived preheader plus ten parent-linked mined context headers, and a separate canonical observation
of the admitted anchor at its exact height. The builder first reconstructs the
admission plan from its original observations instead of trusting serialized descendants. It
then requires exact parent-box equality. Each parent must be reported canonical
at its inclusion height; when that height remains in the mined context,
the reported block ID must also equal the corresponding context header. Older
setup parents do not create a one-block settlement window. Anchor depth is:

```text
snapshot.tipHeight - admittedAnchor.height
```

Depth below 10 is rejected. The settlement output schema is:

```text
e2s.authenticated-v2-confirmed-settlement-plan.v3
```

This first-settlement builder intentionally consumes the initial empty DUP
singleton created by setup. Later DUP-history reconstruction belongs to the
reconstructible lifecycle package, not to this provisioning shortcut.

## Offline Transaction Checks

Every complete input and data-input box is parsed through `ergo-lib-wasm` and
its box ID is rederived. Before deriving transaction and output IDs, the
materializer rejects:

- duplicate spend inputs;
- duplicate data inputs;
- a box used as both a spend input and data input;
- ERG value creation or loss;
- token creation outside the first-input minting rule or destruction of an
  existing token;
- invalid creation heights, register encodings, or unsafe ContextExtension
  shapes.

The resulting IDs are deterministic identifiers for the stated candidates and
previews. They are not node acceptance evidence.

## Security Closeout Matrix

| Invariant | Producer / enforcement | Downstream consumer | Failure if relaxed | Isolated negative |
|---|---|---|---|---|
| Every input and data input is a complete canonical EIP-12 box whose ID matches its bytes. | `normalizeEip12Box()` through `ergo-lib-wasm`. | Transaction-ID derivation and every predicted output box ID. | A forged box body could be assigned an apparently valid descendant chain. | Forged box ID is rejected. |
| Spend inputs are unique and disjoint from data inputs. | `assertDistinctBoxReferences()`. | Ergo input set and tracker data-input ordering. | One box could be counted twice or both spent and observed. | Duplicate spend and spend/data overlap are rejected independently. |
| Total input and output ERG values are equal. | `assertErgConservation()`. | Setup, admission, and settlement candidate economics. | The planner could assign IDs to inflationary or value-losing transactions. | Two-times-output inflation is rejected. |
| New token IDs are limited to the first-input box ID; every existing token amount is preserved exactly. | `assertTokenConservation()`. | Tracker and DUP singleton identity. | A candidate could mint an unrelated authority token or silently destroy a singleton. | Foreign-token mint and independent tracker/DUP NFT removal are rejected while first-input singleton mint passes. |
| Contract templates are the exact tracked source bytes. | CLI code pins plus input source-hash equality. | Placeholder resolution and external compilation review. | A caller could replace source and source hash together. | The test recomputes all three tracked hashes; drift fails. |
| Initial singleton IDs reach one exact contract fixed point. | Three pinned compiler passes bind tracker and DUP IDs, then bind the DUP source to the compiled unlock-tree hash. | Pre-provisioning contract derivation only. | A caller-supplied unlock tree or a provisional DUP tree could be mistaken for the final deployment graph. | Identity drift, compiler identity drift, source-hash drift, tracker/unlock drift, and pass-three tree/source drift are rejected. |
| Compiler execution uses the reviewed dependency graph and parameters. | Exact build/tool locks construct a content-addressed numbered runtime bundle; direct Java execution uses read-only private copies of that bundle and the complete JDK; source and private copies are re-hashed after execution; pinned Node/tsx/Git identities, raw patched-Ergo checkout validation, and private child/Git environments complete the trusted-host boundary. | Reproducible source-to-tree verifier run on an exclusive trusted host. | A wrapper/global plugin, mutable cache, reordered classpath, partial Java replacement, mutable source, dependency override, parent loader override, or unsupported script/tree version could silently produce different bytes. | Lock field drift, unsafe/extra project file, bundle/classpath/classes/Java/JAR/parent-runtime drift, before/after source or private-copy drift, version drift, raw checkout/index drift, and inherited JVM/Node/Git/build/secret variables are rejected independently. |
| Resolved source compiles byte-for-byte to each supplied ErgoTree. | Separate locked resolver-free JVM compiler, exact patched-Ergo checkout validation, loaded `sigma-state` JAR hash, resolved-source hash, and complete ErgoTree comparison. The provisioning plan itself remains `unverified`. | Any future signing, check, or deployment procedure must rerun this verifier and obtain `PASS` for the same package digest. | A malicious tree could be paired with honest source text or a different compiler binary. | Source drift, placeholder drift, role reordering, compiler/JAR/version drift, checkout drift, source-hash drift, and one-byte tree drift are rejected independently. |
| A conformance result applies to one exact provisioning package without becoming an attestation. | Rebuilt package digest, deterministic conformance-report digest, exact singleton IDs, and `retainedReportSufficientForSetup = false`. | Future setup approval must rerun the verifier. | A retained or fabricated JSON result from one identity pair could be replayed or mistaken for execution provenance. | Expected-package digest mismatch aborts before compilation; injected observations remain `BLOCKED`; every report requires verifier rerun and keeps setup authorization false. |
| The setup check binds one fresh package, source build, header context, funding view, and signer before either node check. | WP-06K exact-package rebuild, fresh pinned source-to-ErgoTree run, ten parent-linked mined headers from `lastHeaders/10`, derived node `simplifiedUpcoming` preheader, same-tip final funding revalidation, exact signer-control checks, independent unsigned IDs, sign-all-before-check ordering, and four-way ID equality. | Two fixed check-only setup candidates and the sanitized report. | A stale report, mixed tip, substituted input/key, partial check sequence, or transaction-ID drift could be presented as acceptance of the reviewed package. | Package, source/tree, parent link, funding tip, signer/input/key, ContextExtension, derived ID, signed ID, and node ID mutations fail closed. |
| Tracker finality authority is distinct from bridge-committee metadata. | Provisioning v5 rejects equal compressed keys; tracker setup/admission preserve the attestor in R9; DUP setup preserves the committee in R6; the settlement builder requires fully consumed canonical proveDlog constants; the authenticated unlock requires the two Sigma propositions to differ. | Tracker admission signature and authenticated settlement builder/contract. | The bridge committee could reuse its own proposition to admit an invented anchored checkpoint and later settle it, or malformed register bytes could pass preflight and fail only during VM evaluation. | Equal input keys, equal tracker/DUP registers, trailing bytes, wrong types, malformed or missing authority registers, committee-only tracker signature, same-proposition settlement, and restart/rebuild authority drift are rejected. This proves exact-key separation only, not independent custody. |
| Setup checking does not create execution or readiness authority. | Loopback non-mainnet policy, broadcast-disabled guard, non-interactive stdin, in-memory signing, sanitized report schema, and all-false authorization. | Operator review only. | Broadcastable signed bytes or a local PASS could be mistaken for deployment, governance, finality, Gate 5, or production evidence. | The command opens no environment/file/config/runtime signer source and prints or persists no signed bytes; upstream stdin provenance remains operator-enforced and local tests are not described as a real node run. |
| Anchor header position matches the exact current state context. | `currentErgoHeight - anchorHeight == contextIndex + 1`. | `SPVTrackerAuthenticated.es` access to `CONTEXT.headers(Var(3))`. | A stale or wrong index would select another header or fail at evaluation. | A one-block tip advance is rejected. |
| Header position is derived from one exact state context. | One node-compatible preheader at `H+1` plus ten unique, contiguous, parent-linked mined headers `H..H-9`; anchor ID, height, and root are matched before deriving the index. | Confirmed-state admission builder and the four-Var tracker transaction. | A caller-created anchor/index pair could refer to a different header than the signer context. | Reordered headers, broken parents, mixed tips, absent anchors, and root drift are rejected. |
| Confirmed setup lineage is exact. | Canonical box equality with setup outputs 0/1 plus one transaction, unspent flag, shared chain snapshot, and inclusion block ID equal to the context header at the claimed height. | Tracker admission inputs. | Same-transaction lookalikes, noncanonical inclusion blocks, or predicted descendants could be promoted as state. | Swapped output, mixed block, noncanonical block, mixed snapshot, impossible inclusion height, and non-unspent observations are rejected. |
| Settlement has the minimum Ergo anchor depth. | Shared authenticated-settlement confirmation limit. | Authenticated vault time/depth predicate and service preparation. | A shallow preview could be mistaken for an acceptable payout candidate. | Nine confirmations are rejected. |
| Settlement parents are observed descendants of the exact prior stages. | Admission is deterministically rebuilt; tracker, DUP, and vault boxes must equal its output or setup outputs byte-for-byte against one snapshot. Every parent requires canonical-at-height and unspent observations; in-window inclusion IDs also match the parent-linked context. | Authenticated settlement materialization. | A forged serialized plan, forked inclusion block, or unrelated singleton could authorize a different candidate. | Tampered admission content, predicted old tracker, swapped parents, noncanonical inclusion block, mixed snapshot, and mismatched setup block are rejected; a depth-11 positive proves older setup parents do not expire the stage. |
| A stored anchor has not been silently replaced at its height. | Separate canonical anchor observation must match admitted ID, height, extension root, and settlement snapshot. | Anchor-depth calculation and settlement output. | Tip depth could be counted over an anchor removed by an Ergo reorg. | Wrong anchor ID/root and shallow depth are rejected. |
| Burn proof nodes contain only canonical side and 32-byte hash fields. | Exact proof-step normalization. | Burn-root reconstruction and package serialization. | Foreign input fields could leak into the package or create ambiguous proof semantics. | An extra proof field is rejected. |
| Admission and settlement descendants are not treated as observed state. | Stage status, expiry height, rebuild flags, and all-false authorization. | Future operator handoff. | A predicted box or stale context could be reused after confirmation or tip drift. | Stage-shape and authorization tests require preview-only/rebuild semantics. |
| The CLI cannot silently read local runtime/configuration defaults or expose an execution route. | Explicit sanitized input/output paths and static broadcast-surface guard. | Offline package generation only. | Private state could leak or a planning command could become an execution shortcut. | Sensitive paths, repository escape, duplicate args, network/signer imports, and broadcast calls are rejected. |

## Command

Run from `ergo-sidechain-bridge/relayer`:

```powershell
npm.cmd run compiler:runtime-bundle
npm.cmd run contracts:authenticated-v2:compiler-selfcheck -- --ergo-source ../.source-cache/ergo-node
npm.cmd run contracts:authenticated-v2:observe-funding -- --environment <non-mainnet> --node-url <origin> --tracker-funding-box-id <64hex> --dup-vault-funding-box-id <64hex> --out <new-funding-observation-report.json>
npm.cmd run contracts:authenticated-v2:derive-initial-binding -- --input <new-funding-observation-report.json> --ergo-source ../.source-cache/ergo-node --out <new-initial-binding-report.json>
npm.cmd run settle:authenticated:provision-plan -- --input <sanitized-input.json> --out <new-plan.json>
npm.cmd run contracts:authenticated-v2:conformance -- --input <sanitized-input.json> --expected-package-digest <plan-sha256> --ergo-source ../.source-cache/ergo-node --out <new-conformance-report.json>
npm.cmd run settle:authenticated:setup-check -- --input <sanitized-input.json> --expected-package-digest <plan-sha256> --node-url <loopback-non-mainnet-origin> --ergo-source ../.source-cache/ergo-node --mnemonic-stdin --out <new-setup-check-report.json>
npm.cmd run settle:authenticated:stage-plan -- --input <sanitized-stage-input.json> --out <new-stage-plan.json>
```

Each output path must be a new JSON file inside the bridge repository. Known
environment, secret, wallet, deployment-state, and runtime-database targets are
rejected. The observation command makes eight GET requests across only the four
documented read-only endpoint types; the planning commands read no default configuration or deployment
state and make no network request. Bundle construction may resolve missing
dependencies; the authoritative direct-Java conformance phase invokes no
dependency resolver or application-level network client. This local report does
not attest operating-system-level network isolation.

## Required Follow-On Sequence

1. Supply an explicit non-mainnet node endpoint and two explicit, distinct
   funding-box IDs, then run the guarded funding observation. Real execution of
   this step remains pending those operator inputs; local fixtures are not
   target-runtime evidence.
2. Derive the initial binding from that exact observation report. Embed both
   complete reports in the V2 sanitized provisioning input; do not copy boxes,
   environment, contract pins, or digest strings into independent fields.
3. Build the exact provenance-bound provisioning package, retain both reports
   beside it for review, then rerun pinned source-to-tree
   conformance for that package digest. Retain the result for review, but do not
   treat retained JSON as execution authority.
4. With separate approval for check-only signing, run
   `settle:authenticated:setup-check`. It reruns fresh conformance, prefetches
   ten mined headers from parent-linked `lastHeaders/10`, derives the node `simplifiedUpcoming` preheader, revalidates both exact funding inputs on that
    same tip, proves in-memory control of both inputs and the bridge-committee
    funding key, verifies the distinct attestor binding, signs both candidates, then checks both without retaining
   signed bytes. A PASS still does not authorize setup or submission.
5. After setup confirmation, refetch the tracker and admission-funding boxes,
   capture one parent-linked `lastHeaders/10` snapshot, derive its `H+1`
   preheader, and run the admission
   stage rebuild while the anchor remains in that context.
6. After admission confirmation, refetch the populated tracker plus initial DUP
   and vault boxes against one new ten-header mined snapshot plus its derived preheader, re-observe
   the admitted anchor at its exact height, and run the settlement stage rebuild
   after depth reaches 10.
7. Recollect and reverify the native/Frontier proof and refetch all three boxes
   as unspent immediately before any JVM check.
8. Only then may the existing explicit non-mainnet check-only boundary be used,
   with separate local-signing approval and no submit route.

This staged package and local source/test coverage do not prove a real
node run, sidechain GRANDPA finality on Ergo, mined admission, target-runtime
JVM acceptance, Gate 5 closure, global trustlessness, or production readiness.
