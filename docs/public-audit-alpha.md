# Public Research Alpha

This document is the entry point for public research and external review of the
Ergo sidechain bridge source package. Publication invites testing and audit; it
does not announce a supported release. The companion
[`public-audit-alpha-manifest.json`](public-audit-alpha-manifest.json) is the
machine-readable authority for package scope, the fixed validation sequence,
open critical/high gaps, owner roles, and claim impact.

## Candidate Boundary

| Question | Current answer |
|---|---|
| Local research/reference implementation available | Yes |
| Single config-free audit command available | Yes |
| Deterministic current-HEAD recovery matrix available | Yes; local synthetic rehearsal only |
| Deterministic alert-delivery lifecycle drill available | Yes; local sink and reconstructible delivery cache only |
| Bounded external alert worker and signed acknowledgement verifier available | Yes; local implementation only, with no reviewed target delivery or real operator acknowledgement evidence |
| Standalone pinned consensus-source build job available | Yes; hosted execution evidence pending |
| Open-source license and third-party boundaries packaged | Yes; Apache-2.0 for repository-owned content, with component-specific exceptions retained |
| Source publication for public research and external review | Conditionally permitted; the exact candidate must pass promotion checks |
| Supported release | No |
| Independent security review complete | No |
| Gate 5 closed | No |
| Activated Ergo-verifiable source-finality profile | No |
| Bundled relayer command for initiating a sidechain burn | No; the direct historical trigger is absent while payout authority remains inactive |
| Trustless bridge claim supported | No |
| Production or mainnet readiness supported | No |
| `audit:alpha` operator/persistent key use, external submission/broadcast, deployment, or funds movement | No |
| Tracked live-capable utility | `demo:devnet:consolidate-rewards` is separately invoked, restricted to the patched loopback devnet, outside daemon composition, and not run by `audit:alpha` |
| Ephemeral test signing and in-memory/mock transport | Yes; bounded test fixtures only |

Substrate/Frontier supplies EVM compatibility and produces bridge-specific
commitments. Ergo settlement is the value-release boundary. A correct local
burn leaf, Merkle path, AVL transition, or GRANDPA proof object cannot authorize
funds unless the complete proof-to-release chain is accepted by the deployed
Ergo predicates under a reviewed source-finality profile.

The audit bundle includes the root [`LICENSE`](../LICENSE),
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md), the Solidity
[`LICENSE`](../solidity/LICENSE), and the exact pinned
[OpenZeppelin 5.6.1 MIT notice](../solidity/THIRD_PARTY_LICENSES/OpenZeppelin-Contracts-5.6.1.txt).
Those files license repository-owned content and preserve the separate terms
of the Solidity package, Frontier, the Ergo node patch context, and third-party
dependencies. Licensing and source publication do not alter any technical
claim boundary.

The tracked reward-consolidation command is disclosed because it can derive a
configured devnet key, sign, and submit when an operator invokes it explicitly.
Its fixed loopback-devnet checks do not make it part of the daemon, the audit
command, a supported deployment path, or evidence of production capability.

## Checkout And Validation

Required toolchain:

- Git with recursive submodule support;
- Node.js 24.18.1 and npm 11.16.0 for the audit process and runtime-bundle
  build;
- a separate exact Node.js 24.14.0 executable for the pinned JVM compiler and
  bounded test closure;
- Rust 1.97.1 with `wasm32-unknown-unknown`;
- `wasm-pack` 0.14.x;
- Java 17 for the pinned JVM compiler bundle.

Before invoking `audit:alpha`, set `BRIDGE_COMPILER_NODE_EXECUTABLE` to the
absolute canonical path of the reviewed Node.js 24.14.0 executable. The
clean-checkout orchestrator verifies its version and SHA-256 against both the
authenticated V2 and federated tracker compiler locks before running any test.
It also requires npm 11.16.0 from the reviewed Node.js 24.18.1 distribution and
checks the CLI path, version, and complete package digest against
[`clean-checkout-npm-lock-v1.json`](../sources/clean-checkout-npm-lock-v1.json).
It then builds the runtime bundle under the Node.js 24.18.1 process and runs
the complete bounded TypeScript/test closure under the verified Node.js
24.14.0 process. Missing, aliased, mismatched, or divergent runtime components
fail closed.

In the current superproject, clone without recursively initializing unrelated
sibling gitlinks, then populate only the bridge-owned Frontier source:

```powershell
git clone <superproject-url> <checkout>
Set-Location <checkout>
git submodule sync -- ergo-sidechain-bridge/substrate-node
git submodule update --init --recursive -- ergo-sidechain-bridge/substrate-node
Set-Location ergo-sidechain-bridge\relayer
npm.cmd ci
npm.cmd run audit:alpha
```

In a standalone bridge repository, run:

```powershell
git clone --recurse-submodules <bridge-repository-url> <checkout>
Set-Location <checkout>\relayer
npm.cmd ci
npm.cmd run audit:alpha
```

### Standalone reviewer bundle

A clean committed package can be exported for its exact promotion audit or
handed directly to a reviewer without copying the surrounding superproject or
any untracked local state:

```powershell
Set-Location <bridge-root>\relayer
npm.cmd run audit:alpha:bundle -- --out <outside-repository>\ergo-sidechain-bridge-alpha.bundle

git clone --branch public-audit-alpha <outside-repository>\ergo-sidechain-bridge-alpha.bundle <review-checkout>
Set-Location <review-checkout>
git submodule update --init --recursive
Set-Location relayer
npm.cmd ci
npm.cmd run audit:alpha
```

The export command requires the tracked worktree and index to match `HEAD`,
runs the normal audit preflight before and after construction, and refuses to
write inside the source repository or overwrite an existing target. It creates
a deterministic root commit whose tree is exactly the tracked bridge subtree,
preserves the indexed Frontier gitlink, and writes a JSON sidecar containing the
source commit, source bridge tree, source index-inventory digest, standalone
commit, Frontier commit, byte length, and SHA-256 of the bundle. The sidecar
labels the raw bundle as `unverified`: construction and preflight do not replace
the separate exact-candidate promotion audit. Because the producer reads Git
objects rather than the filesystem, untracked `.env`, SQLite, log, cache, and
diagnostic files cannot enter the bundle.

The synthetic standalone commit is intentionally distinct from the enclosing
superproject commit; the sidecar binds both identities. The bundle does not
contain the Frontier object database, so the reviewer still initializes the
public pinned submodule before running `audit:alpha`. The relayer package is
marked private and its npm ignore policy excludes local runtime state, but
`npm pack` is not the review-transfer format. Bundle creation performs no chain
RPC, signing, submission, broadcast, deployment, publication, or funds action.

Both layouts initialize the same pinned Frontier gitlink and run the same
validation command. In the superproject layout, the exported tree remains
strictly bridge-scoped, but candidate provenance and cleanliness are
intentionally superproject-wide: the enclosing `HEAD`, complete index inventory
digest, and tracked worktree/index equality all participate in preflight.
Unrelated tracked sibling drift can therefore block construction or change the
source-inventory digest, even though sibling content cannot enter the bridge
bundle. A standalone bridge repository has no surrounding sibling provenance.

`audit:alpha` is fail-closed when the manifest drifts, a required package file
is untracked, tracked source differs from the Git index, non-ignored untracked
source exists, the recursive Frontier checkout is absent, dirty or differs from
the indexed gitlink, local deployment state is tracked, the broadcast
environment is enabled, the source lock differs, the standalone consensus job
fails YAML or exact command-graph validation, the build/test closure fails, or
any bounded operator drill fails. The preflight reports the HEAD commit and a
SHA-256 digest of the complete repository index inventory; because every tracked
worktree path must match that index, parent source metadata and all later
validation inputs begin from the same candidate. One orchestrator retains the
entry HEAD and index-inventory digest, then requires the final preflight to
match both values exactly. Persistent staged, committed, or worktree drift is
therefore rejected rather than accepted as a new candidate.
The command may install package dependencies, but it does not contact an
Ergo or sidechain RPC, read runtime deployment state, use operator or persistent
signing keys, submit or broadcast externally, deploy, or move funds. The bounded
test suite may use ephemeral test keys and in-memory or mock transports.

The command executes:

| Step | Purpose | Evidence ceiling |
|---|---|---|
| `audit:alpha:preflight` (entry and final) | Bind the index candidate, recursive gitlink checkout, manifest, tracked package, runtime-state exclusion, disabled broadcast, and absence of validation-time drift | Package structure and exact local candidate identity only |
| `sources:verify:lock` | Bind the Frontier gitlink, source URLs, patch hashes, and reproducible Solidity artifacts | Source identity; no source build or deployment identity |
| `sources:verify:workflow` | Parse the bridge-local GitHub Actions YAML and bind its exact standalone source-build command graph to the canonical source lock | Workflow syntax and command graph only; no hosted execution, profile activation, deployment identity, or publication authority |
| `check:clean-checkout` | Restore the Solidity/JVM development closure, build the pinned runtime bundle under Node.js 24.18.1, then run architecture, TypeScript, bounded Vitest, WASM build, and Rust tests with the compiler/test closure pinned to Node.js 24.14.0 | Local implementation and deterministic test evidence |
| `audit:alpha:release-structure` | Run the release gate with the fixed tracked evidence packet after the clean-checkout build has restored generated WASM dependencies, and accept only an exact PASS or expected BLOCKED summary with zero structural issues | Structural evidence consistency; pending rows remain blockers |
| `operator:drill:signer-unavailable` | Exercise fail-closed signer loss across active value routes | Local injected-failure behavior |
| `operator:drill:peg-in-mint-transport` | Verify that owner-mint initiation, reusable sidechain writes, supported owner-mint deployment, and the write-capable Frontier fixture are absent while exact historical confirmation remains available | Relayer capability retirement only. The sidechain client is observation-only and historical owner-mint deployments fail readiness preflight, but the historical Solidity owner entrypoint, deployment lineage, V4 activation, and EVM funds authority remain open |
| `operator:drill:recovery` | Exercise real ephemeral SQLite close/reopen and lifecycle-database deletion, an already recovery-required copy against a later dual-source route snapshot, source disagreement, exact source/mint/candidate/confirmation ordering rejection, source and burn reorgs, aggregate pre-finality rollback, and incident-port failure/retry through existing ports | Deterministic fixture-based containment and reached-stage evidence; clean-copy location binding remains in the StateTracker negative matrix; no child-process or live recovery, signer, submission, broadcast, or funds authority |
| `operator:drill:alerts` | Exercise stable condition identity, distinct occurrence identity, ordered incident-before-recovery delivery, deduplication, injected failure, retry, SQLite close/reopen, and stale/recovered health transitions through the bounded local ports | Local structured-log lifecycle and inert runbook-reference evidence only; no reviewed external target delivery, real operator acknowledgement, live recovery, hold clearing, or funds authority |

The exact storage-rent VM drill requires the separately reconstructed pinned
Ergo source checkout and is therefore not hidden inside this config-free gate.
Its local implementation and tests remain reviewable, while a fresh source-
bound execution belongs in the final evidence packet.

The following bounded commands are reviewable implementation surfaces but are
not executed by `audit:alpha` and are not external evidence:

| Command | Purpose | Evidence ceiling |
|---|---|---|
| `operator:alerts:worker -- --outbox <sqlite-path> --endpoint <credential-free-https-url>` | Claim the oldest non-delivered immutable alert and perform one endpoint-bound HTTPS delivery attempt with stable idempotency, bounded response handling, ordered retry, and no daemon or funds capability | Local implementation only. Optional authorization additionally requires the exact endpoint-identity digest. No reviewed target, credential custody, durable remote processing, real delivery or live recovery is established |
| `operator:alerts:acknowledge -- --outbox <sqlite-path> --acknowledgement <signed-json> --key-registry <reviewed-json>` | Verify one versioned Ed25519 acknowledgement against the exact delivered alert and endpoint-bound local receipt, then retain append-only audit metadata | Audit metadata only. It cannot clear holds, mark recovery complete, mutate lifecycle or authorize funds, and test signatures do not establish real operator custody or acknowledgement |

## Suggested Review Order

1. Read the [execution plan](../phases/bridge-execution-plan.md) for current
   package status and external blockers.
2. Review the [layered architecture](layered-reference-architecture.md),
   especially the producer-to-consumer authority matrix.
3. Review the [consensus source baseline](consensus-source-baseline.md) and
   `sources/consensus-source-lock.json` for exact source identity.
4. Review the [threat model](aggregate-settlement-threat-model.md) and
   [Tier-1 gap analysis](tier1-gap-analysis.md) before interpreting test names.
5. Trace peg-in from refundable source to committed vault and receipt, then
   verify the explicit V4-pending hold, absence of owner-mint initiation and
   supported owner-mint deployment, and separately bounded historical
   confirmation/reconciliation.
6. Trace peg-out from burn leaf/root through checkpoint admission, finality,
   payout conservation, DUP insertion, checker, signer, authorization,
   transport, and reorg reconciliation.
7. Trace the distinct V6 cutover chain from the static historical-route registry
   and raw DUP lineage through replay cutover, unsigned provisioning, blocked
   eligibility, target-check request, and the atomic authority-switch
   precondition. Verify that it retains the frozen V5 proof-statement semantics
   without reinterpreting V4/V5, and that no local object can activate the
   target or accept authority evidence.
8. Review [operator runbooks](operator-runbooks.md) only after the non-live
   audit path. Operational commands are separate authority surfaces.
9. Compare every conclusion to the manifest's open gaps and claim impact.

## Highest-Value Code Surfaces

| Surface | Primary locations | Audit question |
|---|---|---|
| Repository/source identity | `.gitmodules`, `.gitattributes`, `sources/`, `relayer/src/consensus-source-baseline.ts` | Can exact public inputs be reconstructed without private paths? |
| Layer boundaries | `relayer/src/{ergo-settlement-core,relayer-core,profiles,adapters,apps}` | Can an adapter or persistence row bypass a core invariant? |
| Peg-in exclusivity | `contracts/MainChainLockPooledReserveV4.es`, causal vault profiles, `relayer/src/peg-in-transition.ts` | Is mint possible only after confirmed source consumption into exact non-refundable backing? |
| Mint authority | `relayer/src/peg-in-transition.ts`, `relayer/src/adapters/peg-in-mint-confirmation.ts`, `relayer/src/sidechain-client.ts`, package scripts, daemon composition, and Solidity contracts | Are owner-mint initiation, reusable client writes, supported deployment, and write-capable fixtures absent while historical confirmation remains distinct from on-chain owner authority and historical deployments? |
| Burn initiation | package scripts, `relayer/src/scripts/`, daemon composition, and Solidity contracts | Is a turnkey relayer burn command absent while no activated proof-authorized Ergo payout route exists, without confusing source removal with retirement or inaccessibility of historical on-chain contracts? |
| Burn commitment/finality | Frontier patch, checkpoint/finality codecs, native verifier adapters | What exact source semantics are authenticated, and by whom? |
| Settlement conservation | pooled-reserve V4 contracts and transaction builders | Does backing and liability decrease by the same burned amount with miner fee external? |
| Replay/cutover | The frozen V4 route registry, `relayer/src/validity-application-pooled-reserve-legacy-route-requirements-v6.ts`, historical DUP lineage, and the V6 replay-cutover, provisioning, eligibility, target-check and funds-authority switch-precondition modules | Is one burn globally ineligible after payment across every retained profile, and can the distinct V6 target remain inactive until the four integrated V5 contracts and every earlier funds route are retired under one authenticated activation generation? |
| Recovery | relayer-core recovery/reconciliation ports and SQLite adapters | Can restart, DB loss, divergence, or reorg create authority? |
| Operator alerts | operator-health projection, alert-delivery core/root, immutable external outbox, bounded HTTPS adapter/worker, acknowledgement verifier/state, delivery-cache schema, and static runbook catalogue | Can delivery or acknowledgement state mutate incidents, clear holds, reorder dependent alerts, leak credentials, or enter a value-release path? |
| Broadcast | checker, signer, authorization, submitter, daemon composition | Can any route reach transport without exact fresh authorization? |

## Evidence Interpretation

The audit command can establish deterministic local behavior for the checked
source tree. It cannot establish:

- that a deployment uses those exact bytes or has retired historical authority;
- that frozen V5 proof semantics or local V6 compiler, settlement, replay,
  target-check, or switch-precondition fixtures establish real deployment
  lineage, replay migration, or atomic authority cutover;
- canonical Ergo consensus from one or two RPC URLs;
- sidechain finality merely from receipt depth or Ergo anchor age;
- native STARK/EIP-0045 activation or target-node transaction acceptance;
- independent node administration, key custody, operator competence, liveness,
  data availability, censorship resistance, or economic security;
- a completed independent security review;
- live recovery against current non-mainnet chain state or independent RPC operation;
- delivery to a reviewed external alert target, real authenticated operator
  acknowledgement, or execution of a reviewed recovery procedure against a
  current non-mainnet deployment;
- release or trustless status;
- production-readiness and mainnet-readiness claims, which remain blocked.

The first missing authority is recorded per gap in the manifest. A reviewer
should add findings rather than weaken, delete, or reclassify a blocker to make
the package pass.

## Separate Source-Build Evidence

The current superproject retains its recursive hosted reconstruction, and the
bridge-local workflow now includes a standalone `consensus-sources` job that
rebuilds the pinned Frontier and patched Ergo sources and reruns source identity
checks. The job uses the existing gitlink, `.gitmodules`, source lock, tracked
patches and Solidity identities; it does not introduce a second source
manifest. `sources:verify:workflow` validates its YAML and exact command graph
locally. The first hosted run for the exact promotion candidate remains a
separate high-severity evidence gap and must not be inferred from local
validation.

## Stop Conditions

Stop the audit and retain `BLOCKED` if:

- the recursive submodule cannot resolve the exact locked commit;
- source patches or reproducible Solidity artifacts drift;
- the standalone consensus workflow no longer matches the parser-validated locked command graph;
- deployment state, databases, logs, wallet material, or local paths enter the
  tracked package;
- a fixture becomes reachable from a runtime authority root;
- a value route reaches signing or transport from local status alone;
- any critical/high finding lacks an owner role and explicit claim impact;
- the candidate is described more strongly than the manifest permits.
