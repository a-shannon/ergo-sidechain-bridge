# Bridge Execution Plan

Updated: 2026-09-06

This is the single active continuation queue for the Ergo sidechain bridge.
The deliverable is a reproducible open-source reference that an institution
can use as the engineering base for its own Ergo-settled sidechain.

The [execution history](bridge-execution-history-2026-09-05.md) retains the
previous package specifications, decisions and checkpoint records. Its old
"next" actions are historical, not a second queue. Use those specifications
when their exact boundary is reached; do not discard their safety obligations.

## Delivery Contract

| Track | Deliverable | Deciding trust model | State |
|---|---|---|---|
| **WP-06-FED** | A complete, reproducible two-way federated reference | A versioned source-attestation Ed25519 quorum and a separately bound Ergo-admission SigmaProp quorum; roles, thresholds and federation epoch are explicit | Active. Local component and campaign evidence exists; the full tracker-to-payout lifecycle is not closed |
| **WP-06-STARK / Gate 5** | An Ergo-verifiable trustless upgrade | An activated verifier checks the separately versioned statement and finality semantics before value release | Frozen pending a compatible activated target. Not a prerequisite for the federated reference |

Neither track currently supports a production-ready or mainnet-ready claim.
Public research-alpha availability, local simulations and green CI do not
establish deployment safety or independent operator custody.

## Verified Baseline

- Integration source baseline: `907e8c8deca5ed51e2c647d9d0b75a3c7e36beb9`.
  Its tree is identical to the preceding green integration
  `8bf745d0922eed301102207d3329902ca6e2194b`; the correction changed Git
  identity metadata, not source behavior. Consult the
  [exact-head CI](https://github.com/a-shannon/ergo-sidechain-bridge/actions/runs/33926887851)
  for promotion status, not for runtime acceptance.
- Local campaign evidence covers setup, a committed reserve, packet-bound
  mint, burn and application checkpoint production. The mint consumer used
  a source-locked TestClient. This does not establish an enabled operational
  mint route, canonical tracker admission or a completed withdrawal.
- The ordinary daemon cannot initiate new owner minting or legacy payout
  transport. Deposits on that route remain refundable while the selected
  authenticated mint route is unavailable. Preserve these holds.
- The source-locked foundations, full-transaction VM matrices, layered
  extraction and recovery containment are reusable within their verified
  scopes. Their local completion does not close the composed FED lifecycle.
- Source identity and locked offline relayer artifact production have passed
  their bounded checks. V145 is terminal at the application-checkpoint phase;
  its hint does not identify an authoritative root cause. Do not retry or read
  its mutable state. V134 was abandoned; terminal attempts are not
  predecessors that must be replayed.
- The V11 fresh-owner application route is now composed at source level.
  Same-process request creation retains synthetic custody; the campaign claims
  it before building and keeps it with the actual packet. Proof-bound signing
  produces three inspected calls, disposes that custody, and passes the calls
  and actual source proof to runner V3 and overlay 0003. The Ergo recipient is
  the campaign setup signer's exact compressed key, also bound to the packet's
  Ergo-admission keys. Legacy runner V2 remains a separate reference route,
  never a fallback. A fresh composed campaign now reaches one local tracker
  transport attempt. The node returned HTTP 400; the transaction was not found
  in 85 observations over its 120-second confirmation budget. No acceptance
  of that submission or canonical tracker admission was established.

## Critical Path

Choose **greenfield or migration** for one exact target before provisioning.
Both require authenticated history and exact authority/replay lineage. A
greenfield launch needs the reviewed non-instantiation baseline and derived
empty replay root; a migration needs paid-burn import and closure of every
legacy authority. Neither a fresh DB nor an empty UTXO view proves greenfield.

```text
frozen foundations + selected launch mode + fresh-owner application execution
  -> exact tracker transport and canonical admission
  -> burn/checkpoint binding + global DUP insertion + external-fee payout
  -> composed two-way recovery and operational integration
  -> exact target/custody activation and operational rehearsal
  -> profile-correct evidence + final independent assurance
  -> FED-7 federated reference package

separate upgrade: activated Ergo verifier -> WP-06-STARK -> Gate 5
```

| Order | Boundary | Next concrete action | Completion evidence / blocker |
|---|---|---|---|
| **Now** | FED-6-LAB checked tracker -> transport -> canonical admission | Wire the genuine V2 compiler family and V3 setup-check route into the operational setup root, then check fresh chain-resident boxes before transport | V159 connects the three V158 genesis issuances to real WASM signing, exact no-submit checks and a separate V3 receipt. The direct 41-case matrix uses a bounded HTTP parsing oracle, not target-node acceptance. V155 retains its pinned-node synthetic-state scope. Operational composition, real UTXO membership and canonical admission remain open. No V1 receipt relabelling, campaign retry or signed-byte mutation |
| 2 | Checkpoint -> complete withdrawal | Compose the observed checkpoint with its burn, global replay insertion, reserve successor and externally funded miner fee | One full positive transaction and isolated negative cases; exact JVM/node acceptance and, under separate authorization, canonical confirmation. Reserve decrease equals burned liability, not liability plus miner fee |
| 3 | Both value paths -> recovery | Exercise the selected FED identities through restart, DB loss/rollback, divergent RPC, out-of-order events and reorgs; integrate the operational application root | Recovery holds remain non-authorizing; no repeated mint/payout, no reconstructed funds authority and no restoration of retired legacy paths |
| 4 | Local reference -> target operation | Complete exact non-mainnet target, role custody, approval, key-loss/rotation and alert/recovery rehearsal | Local actor simulation remains useful but does not prove independent custody. A missing external participant blocks only that operational claim, not local engineering |
| 5 | Working FED profile -> FED-7 | Bind the completed lifecycle to its own evidence producer/validator, clean checkout and final independent review | No relabelling of legacy `authenticated-external-fee-v1` evidence as FED. Close every claim-relevant blocker before supported release |

The build investigation recovered the complete historical base spec from its
original source root. A different raw-LF root produces a different, internally
reproducible runtime. The nested build's absolute source-path identity is a
separate input from remapped source strings. Same-root reproduction is not
portable reproducibility or semantic equivalence between the two runtimes.

V149 selected the separately reproduced LF profile, with its own spec, runtime,
genesis and downstream proof identities. Independent review checked that join;
the campaign passed exact reconstruction and reached tracker transport. It did
not inherit historical runtime evidence. Keep raw source checks and exact
selected-profile reproduction. Portable build identity remains an institutional
delivery obligation, not a reason to repeat the resolved local build diagnosis.

The current blocker is tracker admission: HTTP 400 followed by
`not_found_at_deadline`. The stdout failure projection retains the response
digest, not a raw error body; no successful worker-receipt file was produced.
It does not decide whether request decoding, transaction validation or another
node policy caused the response. Do not retry V149,
inspect its terminal mutable state, infer a cause from the status alone, or
extend the confirmation timeout to turn absence into acceptance.

V150's reduced JVM matrix reproduces the temporal binding: context key `2`
selects a header by index, and that header's ID and height enter the AVL value.
With the transaction and input box unchanged, one descendant header causes
rejection even when the selected headers carry the same extension root. A
height-only control passes; reselecting the original anchor in an unsigned
diagnostic candidate restores reduction to the federation threshold. That
changes the transaction ID and is not a repair for an already signed candidate.
The current contract, profile and golden transaction bytes are unchanged.

The no-network test exercises the real check and checked-submit consumers
through Axios's actual request transforms. The synthetic bodies and headers
match; isolated body and content-type mutations are detected by the test oracle.
Signer provenance, authorization and journal operations are explicit doubles.
This establishes neither actual V149 wire bytes nor target-node acceptance.

The diagnostic checkpoint passes 11 pinned JVM tests and 34 focused TypeScript
tests plus type checking. Its matrix also corrects shared-header mutation in an
older negative fixture and distinguishes typed-register failures from Boolean
rejection. Only the test runner's exact input pins and required LF attributes
were refreshed; the fixture change is its synthetic provenance field, not
transaction, input, contract or commitment bytes. Do not shift signed context
bytes, weaken anchor checks or label an old check as fresh node admission.

### Stable Anchor Contract Prototype

V151 introduces an inactive `SPVTrackerSubstrateFederatedV2.es` candidate.
Context key `2` means an absolute anchor height only for this new contract;
V1 retains its indexed selector. Checkpoint statement V1 and the 370-byte AVL
value keep their existing meanings and domains. A different compiled tree is
not a V1 compiler receipt, activated profile or migration authorization.

| Invariant / consumer | Deciding prototype check | Limit |
|---|---|---|
| Absolute height -> current header -> tracker insertion | One frozen signed transaction across descendant windows; height, range and arithmetic-boundary negatives | Only headers supplied by the JVM context, not source finality |
| Selected header ID and extension root -> exact AVL successor | Same-height replacement with the same root; changed-root and missing-header cases with coordinated AVL values | Rebuilding an unsigned fixture for a negative is not a repair of signed bytes |
| Compiled federation -> signing and verification | Actual synthetic 2-of-3 proof, insufficient-witness rejection and message/signature mutations | Source attestations, independent custody and target-node admission remain separate |
| Admission horizon -> temporal rejection | Expiry and anchor eviction reject the frozen signed transaction | No extension of the validity window or transport retry |
| Versioned contract -> downstream construction | Distinct compiled identity; V1 comparison under the same synthetic profile | V151 has no operational compiler or builder; V152 adds only the compiler binding below |

The focused JVM matrix passes nine tests against the pinned Sigma interpreter.
It compiles the complete candidate, signs with synthetic actors and verifies
the same signed bytes at baseline and after each of eight descendants. Eviction,
same-height fork replacement, changed extension root, missing header, extreme
height, expiry, insufficient quorum and signature/message drift reject. A
selected-height guard mutant admits the otherwise coordinated negative,
isolating that predicate. Same-profile V1 signs at baseline but rejects after
one descendant.

This checks the input script, not a fee-funded, stateful node transaction.
V153 verifies the exact WASM/JVM signed bytes below; V154 adds external fees.
Node decoding, version reparse and admission remain due. Do not relabel a V1
receipt or activate V2 through the prototype fixture. Unchanged V1 runtime and
campaign evidence remain reusable only within their old scopes.

### V2 Compiler Binding

V152 connects the complete, unchanged V2 contract to a distinct compiler request
and process-owned receipt. Its request binds the absolute-height selector,
genesis-derived tracker identity, exact application fields and existing V1
federation profile. The compiler wire protocol and locked execution engine are
reused, but no V1 request or receipt is constructed as V2 authority.

| Producer -> consumer | Deciding check | Failure prevented |
|---|---|---|
| Template and configuration -> resolved source | Exact LF template hash, canonical profile, all application fields and genesis identity; isolated mutations and frozen caller-independent copies | Compiling a different predicate or binding a different federation/application under one request |
| Resolved source -> locked JVM compiler -> receipt | Owned process execution, source/request digests, exact runtime and tool pins, recomputed proposition identity and serialization round-trip | Accepting caller-supplied output as an executed compilation |
| Receipt -> V2 receipt consumer | Same-process provenance, exact request binding; copied, recomputed, wrong-genesis and authentic V1/V2 receipt substitutions reject | Reusing a valid compiler result for a different contract or target |
| Compiler ErgoTree -> independent JVM interpreter | Sigma 6.0.2 compiler output equals the separately resolved and compiled tree on the pinned interpreter; all nine signed-window tests execute that exact tree | Assuming compatibility between compiler and interpreter versions from labels alone |

The two focused TypeScript files pass 42 tests; type checking and import-boundary
checks pass. The updated JVM fixture is reproduced by the runner, including an
actual locked compilation, then passes the nine existing temporal, quorum and
mutation cases. The V1 control still reproduces its frozen compiled bytes.
The fixture's serialized receipt is observation data, not restored same-process
compiler provenance. These results do not establish a V2 WASM transaction,
target-node acceptance, activated profile, source finality or funds authority.
The unchanged campaign, Rust/WASM sources and release-evidence closure are not
replayed for this compiler-only integration.

### V2 WASM Transaction And Signature

V153 connects the genuine V2 compiler receipt to an exact genesis tracker box,
an observed-header context and the existing checkpoint statement. The builder
checks the compiled application, exact `0x0401` membership, 32/370 AVL insertion,
successor registers and three-variable ContextExtension. Context key `2` carries
the absolute anchor height; the V1 statement and profile formats are unchanged.
The input snapshot is frozen before awaiting, and the exact-input consumer
rejects a different valid genesis box as well as malformed substitutions.

The focused builder file passes 40 tests, including isolated box/register,
application, provenance, membership and admission-horizon negatives. The V1
builder and shared normalization checks bring the affected closure to 53 tests.
Normalization now releases its WASM box on success and conversion or identity
rejection without changing returned bytes. TypeScript and import checks pass.
The fixture producer uses the real builder and signs
with two synthetic actors through WASM; its deterministic unsigned fixture and
separate randomized signature packet are bound by exact hashes. JVM independently
reconstructs the transaction, compares its complete proofless bytes and ID,
then verifies the actual WASM signature across ten tests. Packet digest, fixture
link and transaction-link substitutions reject independently, with outer hashes
recomputed where needed. No re-signing repairs the frozen transaction as the
header window moves.

The transaction has one tracker input and successor and includes no miner fee.
It proves input-script interoperability, not stateful node admission, profile
activation, independent custody, source finality or funds authority. V154 below
adds external fee funding without reducing tracker value. V152 compiler checks remain reusable;
unchanged contracts, Rust/WASM sources, campaign and release evidence are not
replayed for this builder integration.

### V2 Externally Funded Tracker Transaction

V154 adds a distinct composer that consumes the genuine V2 context and its
exact tracker input. A separate canonical P2PK box supplies exactly 1,100,000
nanoERG for the miner. The tracker successor remains unchanged at 10,000,000
nanoERG; no reserve or tracker value pays the fee. There are exactly two inputs,
two outputs and no data inputs or change output. The fee payer is bound to an
exact compressed public key; tokens, registers, aliases, other keys and box
substitutions reject before construction. A construction result is not signing
or submission authority.

The focused composer passes 72 tests; TypeScript and import checks pass.
The JVM matrix retains the fee-free control and independently reconstructs
the funded transaction using its canonical miner-fee proposition. Thirteen
tests verify exact bytes, the real WASM tracker and fee-payer proofs, temporal
stability, isolated proof mutations and packet substitution. Moving value from
the tracker to the fee output rejects even when total ERG is conserved.
The same frozen transaction verifies through eight descendant windows; anchor
eviction rejects the tracker proof while the independent fee-payer proof remains
valid. This is transaction-script evidence, not node admission or consensus.

V155 below checks the node-code boundary. Unchanged V152/V153 source checks
remain reusable; the V154 JVM matrix was rerun because its transaction shape changed.

### V2 Pinned Node Validation

V155 carries the same frozen signed bytes through WASM's JSON exporter and
Ergo 6.0.2's actual API decoder, transaction serializer and stateless/stateful
validation. The test supplies exact synthetic input boxes and linked headers,
uses `simplifiedUpcoming`, and selects block-version 4 / interpreter-version 3
in its synthetic parameters. That selection is not evidence of target activation.

The 14-test node matrix accepts the 4,342-byte transaction at cost 17,478.
It compares size, cost and fee against the pinned source defaults: 98,304 bytes,
1,000,000 cost units and 1,000,000 nanoERG minimum fee. The HTTP route itself
is not executed. Decoder mutations, either changed spending proof, duplicate or
missing inputs, ERG or token inflation, insufficient cost and an evicted anchor reject. The frozen
transaction remains valid through eight synthetic descendant windows.

The node recomputes transaction identity rather than trusting a JSON `id`.
The fixture consumer therefore binds the supplied identity and complete signed
and proofless bytes to the frozen WASM candidate. A decoder success alone does
not establish that join. No signing, submission or broadcast occurs in this
matrix, and neither synthetic headers nor supplied input boxes prove consensus
or real UTXO membership.

Each run binds its randomized signed packet by an explicit SHA-256, rather
than requiring one historical signature. A fresh packet needs its own node
execution; it cannot inherit the frozen packet's result. The changed-context
case proves signed-message rejection; V154's reduction matrix separately
isolates the anchor predicate. The node conservation negatives fail at the
ERG and asset rules before spending-proof verification.

Next, connect the distinct V2 compiler and genesis/setup identities to the
fee-funded operational candidate and no-submit checker. Preserve V1 receipts,
contracts and selected runtime profile; a V2 tree must not be installed under
V1 provenance. Only a fresh selected target with the exact resident boxes can
close `/transactions/check` acceptance. Canonical confirmation and the complete
withdrawal remain downstream obligations. The earlier HTTP 400 is still not
attributed to a specific cause by these synthetic results.

### V2 Genesis Construction

V156 connects the observed genesis funding box to the actual V2 compiler
receipt and an unsigned tracker issuance. The NFT ID is the consumed funding
box ID; the issued tracker has the compiled V2 tree, 10,000,000 nanoERG and
the exact empty 370-byte-value AVL register layout required by the V2 consumer.
Its 1,100,000-nanoERG issuance fee comes from the funding input, with change
returned to that input's proposition. This does not reduce tracker value.

The target observation and compiler receipt keep their own identities and
same-process provenance. Rechecking the observation's JSON/Sigma bytes is not
a fresh chain read. The operational path must revalidate current UTXOs and
the selected target before signing or checking a live candidate.

This is tracker-only construction, not a new settlement-family registration,
greenfield authorization or migration. The V1 issuance primitive is reused
as a transaction constructor, not as V1 compiler or activation provenance.
Family compilation and setup orchestration must explicitly bind the V2 tree
before the full campaign can use it. Existing V1 receipts and runtime profiles
remain unchanged.

The focused 39-case matrix uses genuine V2 JVM compilation and canonical WASM
funding boxes observed through two synthetic read-only endpoints. It covers
exact issuance and downstream fee-funded composition, copied or mismatched
provenance, a genuine V1 receipt, funding and height boundaries, and caller
reference replacement across asynchronous construction. Simulated endpoint
agreement does not establish independent operators or canonical consensus.

### V2 Dependent Settlement Family

V157 connects a genuine V2 tracker compiler receipt to the duplicate-prevention,
source-lock and pooled-reserve compilers. It derives all tracker, application,
federation and singleton bindings internally. The reserve source binds the
actual compiled predecessor IDs, and tracker and family must use the same
pinned compiler lock.

The 596-byte native-ERG family layout already binds the exact tracker tree,
tracker template hash, application, quorums and dependent templates. Its format
does not change, but the V2 tracker produces a distinct family ID and distinct
dependent contract IDs. V1 receipts, golden trees and templates remain unchanged.
The new compiler request and receipt use V2 domains and explicitly identify
the absolute-height tracker. Shared compiler wire syntax is not shared receipt
provenance: neither version's process-owned guard accepts the other's receipt.

The 33-case matrix executes the pinned JVM compiler for V2 and reproduces the
V1 golden contracts. It checks the complete profile and resolved-source
bindings, cross-version and copied receipts, singleton and source drift,
compiler-lock mismatch and caller mutation during compilation. Node24
TypeScript and import checks pass; independent source review found no
actionable issue. Unchanged contract and node matrices retain their previous
scope; this compilation result does not replace a transaction acceptance test.

Compilation establishes source and contract identity, not profile activation,
genesis funding, target-node acceptance or funds authority. The next consumer
must bind these exact V2 identities to the observed genesis transactions and
the no-submit setup path. Signing, current UTXO revalidation, node acceptance
and transport remain separate obligations.

The immediate campaign remains isolated and synthetic. This plan does not
authorize public-network operations, real funds, existing secrets, a bypass of
ContextExtension guards, or node-wallet signing. Signing, checking, submission
and broadcast retain separate exact-candidate authorizations and revalidation.

### V2 Family To Local Genesis Transactions

V158 connects the genuine V2 tracker and dependent-family compiler receipts to
an explicit V3 local settlement target and three unsigned genesis issuances.
The target binds the source history, application, federation, compiled trees
and each observed funding-box identity. It does not manufacture a V1 compiler
receipt or route the V2 tracker through the V1 compatibility target.

The constructor reuses the existing pure register and transaction builders.
Each issued NFT is bound to its own consumed funding box, with exact compiled
tree, registers, value, miner fee and change. The V3 issuance height is the
fresh observed tip plus one, within the signed-Int range. V2 retains its
existing height rule and accepts only its original V1 compiler path.

| Producer -> consumer | Required evidence | Failure prevented |
|---|---|---|
| V2 compiler receipts and source history -> V3 target | Genuine compiler provenance; exact application, quorum, singleton and history bindings | Substituting a different contract family or source under the target identity |
| V3 target and fresh observation -> unsigned issuances | Revalidated canonical JSON/Sigma funding bytes; exact three roles, values, tokens and registers | Issuing unrelated singleton identities or using stale/mismatched funding |
| Retained target -> asynchronous construction and reobservation | Frozen references, separate V3 provenance and currentness bounds | Caller replacement during construction or cross-version receipt reuse |

This local lab intent retains empty replay initialization without claiming
authenticated predecessor non-instantiation. It is not the greenfield or
migration authorization required for institutional operation. Synthetic
endpoint agreement also does not establish canonical chain membership.

The direct 27-case matrix uses genuine V1/V2 JVM compiler receipts and canonical
WASM funding boxes observed through two read-only loopback endpoints. It checks
the three issuance bodies and round-trips, old V2 identity rules, cross-version
and copied provenance, source-history pin drift, each funding identity,
malformed/noncanonical Sigma and JSON/binary mismatch for each input,
freshness before and after construction, signed-Int limits and caller mutation.
The three affected regression files pass 222 tests; Node24 TypeScript and layer
import checks pass. Unchanged contract, Rust/WASM and node matrices retain
their previous scope. Release evidence and activation claims do not change.

V159 supplies the no-submit request and checker below. Setup-check V2 remains
on its original path; neither construction nor a local check receipt activates
a campaign or authorizes transport.

### V2 Genesis To No-Submit Setup Checks

V159 connects the genuine V3 provisioning plan to a distinct V3 request and
checker. The request preserves each unsigned transaction, its full serialized
identity and predicted singleton output. It binds the absolute-height V2
compiler profile without manufacturing a V1 compatibility receipt. Pure
transaction and observation digests retain their meanings; request, receipt
and process-provenance domains remain separate from setup-check V2.

| Producer -> consumer | Deciding check | Failure prevented |
|---|---|---|
| Genuine provisioning plan -> V3 request | Re-derive all issuance bindings; compare copied data without restoring runtime provenance; reject recomputed unsigned-body mutations for each role | Passing a self-consistent but unrelated transaction to the signer |
| Request and fresh observations -> WASM signer | Revalidate exact funding and header context; verify signer control, proofless bytes and transaction IDs | Signing against replaced inputs, a stale request or an unrelated tip |
| Signed candidates -> no-submit HTTP checks | Send the actual signed JSON to the selected origin and require its exact transaction ID for each of the three checks | Accepting another transaction's result or continuing after a failed check |
| Post-check observation -> retained receipt | Reobserve funding and continuity before issuing the receipt; reject input replacement for each role | Retaining usable check material after the observed input set changed |
| Receipt -> guarded execution-material take | Exact same-process request/receipt pair, selected owned target and one-shot retrieval; reject copies and cross-version use | Turning serialized evidence or a V2 receipt into V3 execution material |

The 41-case direct matrix uses genuine JVM compiler receipts, synthetic funding
boxes and real WASM signatures. Two bounded loopback endpoints supply the
observations. The check endpoint parses the signed bytes with WASM and returns
their computed ID; it does not execute ErgoScript or establish node acceptance.
The one-shot retrieval test explicitly substitutes the owned-process assertion
after checking that an unowned target is rejected. That test covers retained
material identity, not node custody. Rejected target substitutions and inverse
V2/V3 receipt use preserve the correct one-shot retrieval. A data-validation
return cannot restore runtime provenance or bind a request to another genuine
plan. No transaction is submitted.

The existing V2 setup route remains a separate compatibility path. The next
change belongs in the operational setup root: select genuine V2 compilation
and V3 provisioning/request/checking end to end, without a V1 fallback. Then
obtain fresh chain-resident funding and exact target-node checks. Canonical
admission, source finality and funds authority remain outside this local result.

### Fresh-Owner Application Join

| Batch | Deliverable | State and deciding check |
|---|---|---|
| 1. Exact calls | Build mint, bounded approval and peg-out from the canonical reservation statement and Ergo recipient; check canonical signed bytes, fresh signer, chain, nonce, fees, value and complete calldata | Implemented in `substrate-federated-isolated-devnet-frontier-application-transactions-v1.ts`, with focused signed-vector tests; runner V3 uses this pure inspector. The planner itself is not an execution capability |
| 2. Rust consumer | Execute those exact signed calls in the pinned TestClient, with fresh owner authority and gas funded by actual setup transactions; derive receipts, burn and commitment from execution | Implemented in [overlay 0003](../sources/frontier/0003-federated-lab-signed-application-calls.patch). Four signed-call checks and one fresh-owner execution pass under an ephemeral source-attestation profile; the separate reference-profile regression passes eight tests with the dynamic entry ignored. Independent source review is complete. Runner V3 selects this exact ignored test; V149 traversed this consumer before reaching tracker transport. Execution remains a source-locked TestClient result, not an operational mint route |
| 3. Request custody and signing | Retain synthetic signing custody from request creation, freeze calls after the exact mint proof exists, and deliver only the scoped signed bytes to the application consumer | Canonical request creation, one-shot V11 custody claiming and proof-bound signing are composed into the retained-packet root. Signing checks genuine packet/proof provenance, receipt/target bindings, statement and mint identity, and the retained owner; the existing proof validator checks runtime/profile bindings. It emits one complete, inspected triplet and disposes custody on success or failure. Private key material stays outside runner environment and receipts |
| 4. Signed runner | Carry the exact proof and signed triplet into Rust; bind the result and restore the temporary source changes before issuing a process receipt | Runner V3 and evidence V2 are implemented with separate identities. Calls, proof environment, exact test and all three patch pins enter the execution digest. Both temporary overlays are restored on success or failure; unexpected source changes are preserved and rejected. Component tests use explicit I/O doubles; V149 subsequently traversed the real runner before tracker transport, without establishing tracker admission |
| 5. Retained-packet composition | Connect batches 3 and 4 through the actual campaign packet, owner and Ergo recipient | Implemented with explicit runner-version provenance, setup-signer revalidation around signing, retained owner/recipient checks and one-use cleanup. V149 progressed through this route to tracker transport; HTTP 400 and absent confirmation leave tracker admission open. Preserve component negatives and diagnose that downstream boundary before another complete run |

Batches 1 and 2 close the local signed-call producer/consumer boundary, not the
composed campaign. The consumer executes the supplied bytes without re-signing
them and checks their transaction hashes, successful receipts, reservation
consumption, supply change and emitted burn commitment. Its setup transactions
establish ownership and the fresh owner's gas balance; mint and burn state are
not substituted in storage.

Signatures bind their EVM calls, not every field of the source statement,
Ergo consensus or the execution environment. Synthetic source attestations in
the component test are not source-chain evidence. The composed runner must
separately verify the exact source-proof object and its request/target/runtime
bindings. Calls use the reviewed LAB chain ID and gas policy, fresh-owner
nonces 0/1/2, zero native value and a 15,000,000 nanoERG mint/approval/gross burn.
The Rust setup establishes that owner prestate before executing those calls.

The request producer retains the synthetic key only in process memory; public
JSON contains the address and a fixed unreserved-mint rejection probe. A copied
object or reloaded request cannot restore custody. A failed initial binding
disposes the handle; rejected rebinding preserves its original request. This is
request provenance, not mint authority. The file-only CLI cannot reconstruct
that handle. The pending-request registry retains custody until claim or
explicit disposal; a garbage-collection cycle cannot silently lose the key.
The creator must dispose abandoned requests. V11 requires the creator and campaign to run in one process,
claims custody against the verified campaign request digest before building,
and retains the original handle in the packet continuation. Build, constructor,
packet and proof failures dispose it. Explicit V10 reference behavior is not
an error fallback for V11.
Binding occurs before create-only publication. If the subsequent file check
fails, no live handle is returned; a public file may remain. Recovery requires
a fresh owner and output path, not custody reconstruction or deletion of a
possibly replaced file.

The LAB chain's genesis includes the bridge owner's address in EVM storage.
Its hash therefore cannot be calibrated with one owner and then used with a
newly generated owner. The two-stage request session creates that identity
first and exposes only its public address and fixed rejection probe for
calibration. It then creates one canonical request with the same retained
owner and the calibrated genesis hash. Request preparation failures dispose
custody; a duplicate creation attempt cannot invalidate the first valid
request. The caller must dispose the session if calibration or campaign setup
fails. The session does not perform calibration or authenticate a caller's
genesis claim; the existing source-locked acceptance checks remain required.

The fresh-owner driver must invoke the exported V11 worker in that same
process after request-bound preflight. The file-based V11 command starts a
child process and cannot transfer the parent's retained custody; it is not a
usable fresh-owner entry point. Do not export a key to make it work. The
same-process route retains the worker/root checks and distinct Cargo caches,
and produces the existing worker receipt, not a command receipt claiming a
child has exited. Verify the selected entry point through the actual root's
one-shot custody claim before launching the composed campaign.

The bootstrap request SHA and source-proof request digest identify different
objects; they must not be compared as interchangeable identities. Their join
is the same-process campaign and retained packet, followed by exact proof
provenance and field checks. The signing component uses the existing pure
planner and signed-byte inspector. Its adapter accepts only the three fixed
LAB calls; it cannot choose proof eligibility or expose a general signer.
Static imports reserve the signer to proof composition and that composition to
the retained-packet application root. Tests use real synthetic keys and signed
transactions; mocked packet/proof provenance isolates the composition checks
and is not cross-chain proof acceptance evidence.

The root passes the campaign's exact Ergo recipient and source-proof object
alongside the signed calls into runner V3. It preserves bootstrap request,
packet, target and runtime lineage without reconstructing authority from
serialized receipts. Setup-signer provenance is checked before and after
signing; a revoked binding prevents either runner from starting. Signing
consumes owner custody, so later checkpoint attestation uses retained proof
and execution provenance, not a demand to recover the key. The outer root
receipt remains V3; its nested runner receipt explicitly identifies V2 or V3
and requires the corresponding provenance. Unknown versions fail closed.
Component checks do not establish successful campaign execution.

Do not run another full campaign between these batches. Run focused checks
while joining the producer and consumer; reuse the affected Rust matrix while
its source, profile and toolchain closure is unchanged. Reference-profile and
ephemeral-profile checks are separate configurations. A static V1 fixture pass
cannot close the fresh-owner join. Request custody, tracker admission and the
complete withdrawal still require their own execution evidence.

## Continue Protocol

1. Read this queue, Git status and the current task-owned handoff. Preserve
   unrelated changes; do not restart discovery from the full history.
2. Select one independently testable producer-to-consumer boundary, normally
   one to four source files plus direct tests. Name the invariant, expected
   discriminator, owned paths and validation closure before editing.
3. Use the cheapest decisive check first. For the current tracker boundary,
   reuse the frozen V2 WASM/JVM/node-code checks while their inputs match. Close
   the distinct V2 setup/operational identity join before provisioning fresh
   boxes and checking the exact candidate on the selected node.
   Raw error strings, RPC payloads, logs, journals and local statuses never
   become evidence authority.
4. A complete bounded diagnostic may identify the first failing field, but
   must not weaken predicates, mutate accepted bytes/digests, retry transport,
   expose arbitrary data or acquire a signing/submission capability.
5. Start a fresh synthetic campaign only after a changed hypothesis or source
   input can produce a distinguishing result. Keep unique identity, request,
   ports, processes, storage and authorization lineage. Reuse verified
   immutable build inputs only; never reuse terminal mutable state.
6. At a coherent green boundary, obtain the due independent review, inspect
   the diff, run publication guards and commit locally. Update this queue only
   when the next action or deliverable state changes. Keep detailed attempt
   history and validation receipts in the task handoff or evidence record.

## Validation Dependency Map

Select risk (`light`, `standard`, `strict`, `critical`) separately from phase
(`iteration`, `checkpoint`, `closeout`, `promotion`). Strictness does not turn
every edit into a full closeout.

| Changed input closure | Due verification | Reuse / limit |
|---|---|---|
| Roadmap or README | Link/claim checks and direct documentation consumers; independent review of changed public claims | No code, WASM, JVM or node replay solely for prose. A changed claim or command invalidates only its deciding evidence |
| Observation or diagnostic mapping | Focused producer/direct-consumer tests, isolated negatives, TypeScript; architecture check if imports/capabilities change | Preserve RPC calls/order, acceptance, accepted fields and digests. No full campaign merely to discover another phase label |
| Consensus source, patch, lock, build command or toolchain | Rebuild the changed locked closure and relevant Rust/Scala differentials | Reuse only matching content/toolchain/generated-byte identities; a mutable cache is not evidence |
| Contract, codec, statement, profile, transaction or ContextExtension | Affected VM, cross-language, serialization and isolated-negative matrices | Bind exact trees, ordered bytes, verifier/runtime pins and target policy; unchanged unrelated matrices stay reusable |
| Lifecycle, journal, reorg policy or a funds consumer | Affected recovery/containment matrix and composed profile tests | DB loss reconstructs cache, never receipts, history or funds authority |
| Exact target check or transport | Fresh relevant chain state, candidate bytes, target identity, authorization and outcome handling | Old JVM/no-submit receipts do not authorize a new target, changed transaction or later broadcast |
| Stable strict/critical milestone | Complete applicable closure and fresh independent review | The reviewer states what was inspected versus replayed. A changed reviewed input invalidates its affected verdict |
| Publication | Exact promoted commit/tree, current required CI and publication guard | Reuse unchanged closeout evidence; neither publication nor CI upgrades runtime or trust claims |

The task handoff records checks run, checks reused with their input closure,
invalidated results and remaining blockers. Do not create another tracking
framework. Full clean-checkout verification (`npm.cmd run check:clean-checkout`
from `relayer`) belongs at its due milestone, not the ordinary edit loop.

Hosted CI currently runs the audit and pinned-source rebuild jobs broadly.
Until a separately reviewed change implements dependency-aware selection,
every required hosted job still must pass at publication. The bounded CI
improvement must test its path-selection rules, invalidate on source/lock/tool
changes, fail closed on unknown impact, and retain a complete milestone run.
Do not silently skip jobs or promote an unverified cache result.

## Publication Cadence

Local diagnosis and authorized local synthetic execution do **not** require a
preceding GitHub push, PR merge or new hosted run. They require their own exact
local source identity, applicable checks, independent review when due and
operation-specific authority. An unrelated pending hosted job is not a local
experiment dependency; a known relevant failure is.

Publish completed work-package milestones, substantive funds/consensus fixes,
frozen formats, target acceptance and reproducible lifecycle/recovery results.
Diagnostic-only changes, terminal attempts and partial refactors stay local
until part of such a milestone. Batch documentation corrections with the next
useful promotion; do not add a publication round between diagnostic edits.

At promotion: freeze the candidate, review the exact diff, run or reuse its due
closure, run staged/range publication guards, push through the guarded wrapper,
and wait for the required checks on that exact head. Respect branch protection
and the authorized merge policy. Verify canonical author/committer identity
before a local merge; do not repeat the corrected account-email publication.
Publication is not deployment, broadcast, a supported release or activation.

## Parallel Work And Deferrals

Keep one critical-path owner and at most two bounded subagents. Shared daemon,
state schema, contracts, signing policy, final integration and commit decisions
stay with the main agent. Close a worker once its deliverable is returned.

Useful disjoint work: target/custody preparation; operator runbook and reviewer
onboarding; dependency-aware CI selection; independent review of a frozen
batch. A worker must name owned files, output and stopping condition. Do not
duplicate the same exploration, test run or review.

Defer full governance expansion, extra AVL lanes/showcase work, new abstraction
layers, raw EVM receipt-proof machinery and release-polish packets that do not
serve the selected boundary. Governance drills remain due for the chosen
federated trust model. Gate 6 is not the Chain zeta / Phantom Burn fix;
Phase 011 / Gate 5 is the separate cryptographic closure path.

## Architecture And Claim Boundaries

The [layered architecture](../docs/layered-reference-architecture.md) remains
normative. Source-neutral Ergo settlement primitives and relayer orchestration
stay in their cores; concrete Substrate/GRANDPA V1 semantics stay in a static
profile; adapters implement capabilities; the composition root assembles them.
No core imports an adapter, settlement core imports no relayer/profile,
profiles import no relayer/adapter, and dependencies remain acyclic.

Substrate/Frontier supplies EVM execution and commitments, not the final trust
layer. The versioned `bridge_event_root` / `burn_root` direction under Ergo
`0x0401` remains; an anchor proves committed bytes, not source finality.
V1 bytes, domains, IDs, digests, vectors and ErgoTrees remain unchanged. A
`proofSystemId` cannot reinterpret statement semantics; reserved STARK ID `2`
stays fail-closed until the separate activated consumer exists.

The ERG lane remains unchanged. Tokens, alternative source consensus, privacy
and aggregate STARK settlement require their own reviewed profiles. SQLite is
a reconstructible cache. No adapter, boolean, journal row or receipt alone
authorizes mint or payout. Observe, construct, check, sign, authorize,
transport and confirm remain distinct.

## Definition Of Institutional Quality

FED-7 requires both directions under the disclosed enforced trust model, exact
global replay and conservation, bounded finality/reorg policy, recoverable
operations, tested dependency boundaries, reproducible source/VM/system
checks, independent review and profile-correct evidence. No critical/high
finding may be hidden or unowned. Historical authorities must be accounted for
under the selected launch mode before new funds authority exists.

A locally simulated operator is not independent custody; local vectors are
not target acceptance; target acceptance is not canonical confirmation.
A federated reference can be useful without being trustless. Neither a
federated nor a trustless reference becomes production-ready through naming,
test counts or a green CI run.
