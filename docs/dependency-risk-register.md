# Dependency Risk Register

This register tracks dependency assumptions that matter for institutional
readiness. It is not a vulnerability scan and it is not an audit report. It is
the minimum dependency evidence that must stay current before any public
institutional-reference claim or controlled testnet production-candidate claim.
Mainnet production-ready claims are forbidden. Testnet production-candidate
wording requires upstream signer conformance evidence, not only the current
fail-closed signer guard.

## Status Legend

| Status | Meaning |
|---|---|
| Covered locally | Local tests or CI currently exercise the dependency path. |
| Guarded | Unsafe use is blocked, but final publication still depends on upstream or operational evidence. |
| Pending review | Dependency is used in a relevant path and requires explicit review before publication. |
| Open blocker | Dependency state blocks testnet production-candidate / production-grade testnet claims. |

## Register

| Dependency | Current source | Bridge role | Main risk | Current guard | Status | Missing before publication |
|---|---|---|---|---|---|---|
| `ergo-lib-wasm-nodejs` | `relayer/package.json` | Transaction signing through sigma-rust WASM. | Published 0.28.0 ContextExtension serialization can diverge from the JVM node for >4 vars. | Default ContextExtension guard blocks unsafe settlement signing; patched mode is loopback-only. | Open blocker | Upstream release containing the canonical serialization fix, then clean node conformance validation. |
| sigma-rust ContextExtension serializer | Upstream transitive implementation behind `ergo-lib-wasm-nodejs`. | Defines signed TX bytes and TX ID. | Any serializer divergence creates invalid signed transactions. | Golden vectors, patched-devnet validation, and fail-closed signing threshold. | Open blocker | Released dependency validated against JVM golden vectors and live `/transactions/check`. |
| `@fleet-sdk/core`, `@fleet-sdk/common`, `@fleet-sdk/wallet` | `relayer/package.json` | Transaction assembly, address handling, and wallet helpers around the WASM signer. | API drift or accidental fallback to non-consensus signing paths. | Node-wallet isolation tests and broadcast surface tests. | Pending review | Dependency upgrade review plus signer-surface review. |
| `ergo_avltree_rust` | `wasm-avl/Cargo.toml` | Off-chain AVL proof generation for DUP and SPV tracker trees. | Proof format mismatch with JVM Scorex AVL verifier. | Rust WASM tests cover single, tracker, and unified batch proof behavior. | Guarded | Fresh JVM node check for live single and batch settlement after dependency changes. |
| `better-sqlite3` | `relayer/package.json` | Local lifecycle, AVL history, anchor persistence, and reconciliation state. | Local DB corruption or unrehearsed backup/restore can block proofs or recovery. | State-tracker tests, confirmation-time reconciliation tests, read-only `npm run backup:snapshot`, local `npm run backup:compare`, SQLite/AVL backup-restore runbook, and [Backup Restore Evidence Template](backup-restore-evidence-template.md). | Pending review | Live backup/restore rehearsal captured with `npm run backup:validate` evidence, local SQLite snapshots, and snapshot comparison. |
| `blakejs` | `relayer/package.json` | Blake2b-256 hashing for aggregate settlement TX IDs, SPV tracker commitments, and trustless burn proof commitments. | Hash implementation drift or production packaging that omits the runtime dependency can invalidate proof and commitment evidence. | Golden-vector tests cover aggregate, SPV, and trustless burn proof hashing paths; publication hygiene requires `blakejs` in runtime dependencies. | Pending review | Dependency review evidence for Blake2b hashing usage and lockfile/vulnerability triage on the exact release branch. |
| `ethers` | `relayer/package.json` | Sidechain EVM event and receipt access. | Event interpretation remains a trust-minimized-but-not-trustless path until SPV/commitment work is complete. | Burn revalidation and explicit trust-model documentation. | Open blocker | SPV relay / sidechain commitment path and burn inclusion proof. |
| `wasm-pack` and Rust toolchain | Clean-checkout CI / operator prerequisites. | Builds the WASM AVL package from tracked source. | Clean clone cannot reproduce proof generator if toolchain setup drifts. | CI runs WASM build and `npm run wasm:test`. | Guarded | Green CI on final branch and documented toolchain versions for release candidates. |
| Node.js / npm lockfile | `relayer/package-lock.json` | Installs TypeScript relayer dependencies. | Non-reproducible installs or unreviewed transitive upgrades. | Clean-checkout CI uses `npm ci`. | Pending review | Final dependency review and vulnerability triage on exact release branch. |

## Publication Rules

- Do not relax the ContextExtension guard because local patched-devnet validation
  passed. Relax it only after a released upstream dependency validates against
  the JVM golden vectors and a fresh node check.
- Do not update signing, transaction assembly, or AVL dependencies without
  running `npm run check` and `npm run wasm:test`.
- Do not claim mainnet production readiness from this repository.
- Do not use controlled testnet production-candidate / production-grade testnet
  wording while any row above remains `Guarded`, `Pending review`, or
  `Open blocker` for a production-relevant path.
- Do not reuse fail-closed signer evidence to support testnet
  production-candidate wording anywhere in Gate 4 or release checklist text;
  candidate wording requires a resolved upstream signer release and validated
  JVM/node conformance evidence.
- Any dependency upgrade touching signing, proof generation, or event parsing
  requires a release-note entry and a reviewer sign-off.

## Evidence Capture

Use [Dependency Review Evidence Template](dependency-review-evidence-template.md)
for completed dependency review and vulnerability triage evidence. The template
is expected to fail validation until every required command, dependency scope
row, vulnerability triage row, upgrade/pinning decision, publication decision,
and reviewer sign-off is linked.

The signer dependency decision must explicitly link either an upstream
release/conformance validation or a fail-closed guard/blocker rationale.
Upstream signer resolution must name a concrete release identifier and positive
JVM/node evidence such as golden vectors or live `/transactions/check`. A
generic pinning note does not resolve the sigma-rust signer risk.
Wording that says JVM/node conformance evidence is missing, unavailable,
unverified, not validated, not yet validated, not yet verified,
not fully validated, or partially validated is blocker evidence, not upstream
signer resolution evidence.
Linked vulnerability triage must state zero open critical/high findings without
positive critical/high finding counts in the same findings cell. Contradictory
triage wording remains blocker evidence even if it contains a zero/no-open
phrase.

Validate completed evidence before linking it from the release checklist:

```powershell
cd relayer
npm run dependency:validate -- ../evidence/dependencies/<completed-dependency-review-evidence>.md
```

The validator is a claims-control guard. Passing it does not remove upstream
signer, live rehearsal, or independent review blockers unless those blockers
are separately resolved and linked.
