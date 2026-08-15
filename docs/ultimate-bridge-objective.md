# Ultimate Bridge Objective

## North Star

Build an institutional-grade Ergo sidechain bridge and reference stack that is
strong enough for a major exchange, Base-class ecosystem team, or large
application chain operator to use as the foundation for its own Ergo-settled
sidechain.

The execution plan for this objective is maintained in
[Ultimate Bridge Roadmap](ultimate-bridge-roadmap.md).
The publication evidence checklist is maintained in
[Institutional Release Checklist](release-checklist.md).
The release claim template is maintained in
[Release Notes Template](release-notes-template.md).
The current aggregate settlement risk register is maintained in
[Aggregate Settlement Threat Model Refresh](aggregate-settlement-threat-model.md).

The goal is not to publish an interesting prototype. The goal is to prove, with
working software, reproducible validation, documentation, benchmarks, and
security analysis, that Ergo's eUTXO model is a superior settlement foundation
for sidechains.

This repository should eventually make the case that:

- eUTXO state boxes enable parallel settlement paths instead of one global
  account bottleneck.
- DataInputs and AVL proofs make compact, verifiable state transitions natural.
- Ergo contracts can hold replay protection, liquidity, tracker roots, and
  bridge state with deterministic on-chain checks.
- Batched exits, sharded lanes, and subblock-aware UX can provide a faster and
  clearer bridge experience than account-model settlement designs.
- The developer-facing kit can hide ErgoScript/eUTXO complexity behind audited
  contracts, builders, preflights, runbooks, and integration documentation.

## Quality Bar

The required standard is world-class. Public release is blocked until the system
is good enough that a serious external team could evaluate it without relying on
private context from the maintainers.

No publication should happen while any of these remain true:

- a critical or high-severity security issue is known and unresolved;
- the main settlement path depends on an unreleased local patch without a guard;
- a fresh checkout cannot reproduce the build and test pipeline;
- the bridge can silently sign or broadcast in an unsafe mode;
- runbooks are missing for setup, validation, recovery, rollback, and incident
  response;
- the trust model is ambiguous or oversold;
- local secrets, personal paths, private devnet state, or throwaway diagnostics
  are part of the publishable branch;
- performance and scaling claims are not backed by benchmarks or executable
  checks.

"Zero bug" and "zero hack" are treated as an engineering release target: no
known critical/high issues, explicit threat modeling, adversarial tests,
reproducible CI, and independent review before public claims. The repository
must not claim absolute security as a fact; it must earn confidence through
evidence.

## Non-Negotiable Product Properties

### Security

- All bridge state transitions are checked by contracts or by documented,
  auditable off-chain rules with a clear path to removal.
- Replay protection is mandatory and independently tested.
- Reorg handling is explicit and covered by tests.
- `HEIGHT` checks are mempool-safe and monotonic where state advances.
- AVL proofs use one proof per operation shape required by ErgoScript; no
  concatenated proof shortcuts.
- Production code never uses node-wallet signing endpoints.
- Default mode fails closed when upstream signer consensus is not guaranteed.
- Committee, key rotation, and governance paths are documented before any
  production deployment claim.

### Trust Minimization

- The current trusted-oracle assumptions are acceptable only as transitional
  PoC gates.
- The long-term target is verifiable sidechain commitments via merged mining,
  extension-section commitments, SPV relay, and burn inclusion proofs.
- Any remaining committee trust must be explicit, bounded, and operationally
  justified.

### Reproducibility

- A clean checkout can install dependencies, build WASM artifacts, compile
  TypeScript, and run tests from documented commands.
- CI runs the same gates expected from contributors.
- Runtime state, SQLite files, local devnet artifacts, mnemonics, and diagnostic
  scratch files are never required for source validation.

### Performance And Scale

- Single-claim settlement must remain correct and simple.
- Batch settlement must be benchmarked and guarded by preflight checks.
- Sharded eUTXO settlement lanes must demonstrate parallelism without weakening
  duplicate prevention.
- Throughput, latency, and cost claims must have scripts or benchmark artifacts.
- Optimization work must not bypass security gates.

### Documentation

- External teams should be able to understand the architecture from the repo.
- The docs must explain what is familiar to EVM/Substrate teams and what Ergo
  adds.
- The docs must be honest about remaining trust, upstream blockers, and
  deployment prerequisites.
- Every high-risk operation needs a runbook with stop conditions.

## Publication Gate

Do not publish or market the bridge as production-ready for mainnet. Mainnet
production-ready claims are out of scope for this repository. A testnet-only
`testnet production-candidate` or `production-grade testnet` claim may be
evaluated only when all gates below are green and the release notes link the
specific evidence for testnet lifecycle, recovery drills, signer conformance,
security review, governance/key rotation, benchmarks, and final CI, with the
corresponding publication blockers checked:

1. Clean checkout CI is green: WASM build, Rust tests, TypeScript build, and
   relayer tests.
2. The main bridge flow passes fresh local devnet validation without relying on
   untracked local state.
3. Testnet validation is repeated on a clean deployment state.
4. ContextExtension signing consensus is resolved upstream or guarded in a way
   that prevents unsafe production settlement.
5. All runtime secrets and local artifacts are excluded from the publishable
   branch.
6. Threat model and attack-chain registry are current.
7. Operator runbooks exist for deploy, monitor, pause, recover, rotate keys,
   and rollback.
8. Benchmarks exist for single settlement, batched settlement, and the intended
   sharded lane design.
9. At least one independent review pass has been performed on contracts,
   relayer signing, AVL proof generation, and sidechain finality assumptions.

## Current Position

The project has proven meaningful patched-devnet functionality, including
aggregate settlement validation and guarded ContextExtension signing. That is a
major milestone, but it is not the final target.

The next work should keep converting local proof into institutional confidence:

- make every validation reproducible from a clean checkout;
- remove reliance on trusted-oracle assumptions step by step;
- harden production gates and operator runbooks;
- benchmark and optimize the eUTXO parallel settlement path;
- document the system so an external exchange-grade engineering team can audit
  it without hand-holding.

This objective overrides short-term pressure to publish. The project should
advance step by step, but it does not stop until the bridge is a best-in-class
sidechain reference architecture for Ergo.
