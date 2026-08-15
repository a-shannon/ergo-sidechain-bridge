# Ergo-Substrate Sidechain Bridge

Reference implementation for settling an EVM-compatible Substrate/Frontier
sidechain on Ergo.

> **Status:** local research/reference candidate. Peg-in and peg-out containment,
> deterministic transaction construction, restart/reorg handling, and explicit
> transport authorization are implemented locally. Gate 5 remains open because
> an activated Ergo-verifiable sidechain-finality profile and exact target-node
> acceptance do not yet exist. Public source availability does not support
> trustless, production-readiness, or mainnet-readiness claims.

## Audit First

Start with the [Public Research Alpha](docs/public-audit-alpha.md) and its
[machine-readable manifest](docs/public-audit-alpha-manifest.json). Policy
permits public source review only after exact candidate-promotion checks pass;
supported release status remains blocked. The manifest inventories the
implemented WP-08 surfaces and assigns every remaining critical/high gap to an
owner role and claim impact.

Populate the bridge-owned Frontier submodule before running the audit. In the
current superproject layout, initialize only that path so unrelated sibling
gitlinks cannot affect the bridge checkout:

```powershell
git submodule sync -- ergo-sidechain-bridge/substrate-node
git submodule update --init --recursive -- ergo-sidechain-bridge/substrate-node
Set-Location ergo-sidechain-bridge/relayer
```

In a future standalone bridge repository, clone recursively and enter
`relayer`. Then run:

```powershell
npm.cmd ci
npm.cmd run audit:alpha
```

For a private reviewer handoff from a clean committed candidate, create the
standalone Git bundle outside the source repository:

```powershell
npm.cmd run audit:alpha:bundle -- --out <outside-repository>\ergo-sidechain-bridge-alpha.bundle
```

The bundle contains only the exact tracked bridge tree and its Frontier
gitlink. Its JSON sidecar binds the source commit, bridge tree, standalone
commit, gitlink, and bundle SHA-256. This is a local review artifact, not a
publication or release; use the [audit guide](docs/public-audit-alpha.md) to
clone and validate it.

The audit command binds the repository index, verifies the pinned
source identity and release-evidence structure, rebuilds the local development
closure, runs the complete bounded test gate, and executes the two config-free
no-external-transport operator drills. It does not contact
chain RPCs, load deployment state, use operator or persistent signing keys,
submit or broadcast externally, deploy, or move funds. Bounded tests do use
ephemeral test keys and in-memory or mock transports. Package installation may
contact the configured npm registry.

The exact consensus-source rebuild remains separately exercised by the active
superproject workflow described in the
[Consensus Source Baseline](docs/consensus-source-baseline.md). Porting that
hosted build workflow into a standalone publication repository is still an
explicit blocker, not an implied result of `audit:alpha`.

## Current Architecture

Substrate/Frontier is the EVM execution and bridge-commitment producer. It is
not the final trust layer. Ergo settlement must authenticate the exact source
statement, commitment admission, inclusion, finality policy, payout, and replay
transition before value can be released.

The reusable architecture has four parts:

- `ergo-settlement-core`: pure Ergo/eUTXO settlement identities, invariants,
  codecs, transaction plans, and versioned profiles;
- `relayer-core`: source-neutral lifecycle orchestration for an Ergo settlement
  chain, including retry, restart, reorg, breakers, and fee policy;
- statically registered adapters: Frontier/GRANDPA observations and proofs,
  Ergo RPC, JVM checker, signer, submitter, and persistence;
- `apps/bridge-daemon`: the composition root that assembles those capabilities.

See [Layered Reference Architecture](docs/layered-reference-architecture.md)
for producer/consumer authority boundaries and dependency rules.

## Value Paths

### Peg-In

1. A canonical Ergo deposit is observed.
2. Its refundable source box must be consumed into the exact non-refundable
   committed vault.
3. The commitment receipt binds source, vault, amount, asset, recipient, and
   mint identity.
4. The daemon may prepare one exact EVM mint only after confirmation and fresh
   dual-chain revalidation.
5. Exact signed-envelope reservation and explicit transport authorization are
   required before one raw-byte send.

The Solidity owner entrypoint and deployment lineage remain separate funds-
authority concerns. Daemon containment does not make owner authority
trustless.

### Peg-Out

1. The sidechain burns sERG and commits a versioned burn leaf under
   `bridge_event_root`.
2. Candidate construction binds the burn, recipient, amount, asset, checkpoint,
   anchor, vault, and DUP state.
3. The Ergo transaction must satisfy tracker admission, burn inclusion, payout,
   external-fee conservation, and replay insertion as one conjunction.
4. Signing, JVM checking, authorization, transport, confirmation, and reorg
   reconciliation remain separate capabilities.

The current authenticated V1 path still depends on federated finality authority.
Local Merkle/AVL correctness and Ergo anchor age do not prove sidechain finality.

## Evidence And Review Map

- [Canonical execution plan](phases/bridge-execution-plan.md)
- [Consensus source baseline](docs/consensus-source-baseline.md)
- [Aggregate settlement threat model](docs/aggregate-settlement-threat-model.md)
- [Tier-1 gap analysis](docs/tier1-gap-analysis.md)
- [Trustless burn verification plan](docs/trustless-burn-verification-plan.md)
- [Operator runbooks](docs/operator-runbooks.md)
- [Institutional release checklist](docs/release-checklist.md)
- [Contract and relayer API reference](docs/contract-relayer-api-reference.md)

## Repository Map

```text
contracts/          ErgoScript source and versioned settlement profiles
solidity/           sERG and Frontier bridge contracts plus reproducible artifacts
relayer/            lifecycle cores, adapters, composition roots, tests, and tools
wasm-avl/           deterministic AVL proof support
substrate-node/     pinned Frontier gitlink
sources/            immutable source locks and reviewed patch series
validity-proof/     preactivation validity-proof consumer work
docs/               architecture, threat model, runbooks, and audit material
phases/             canonical implementation and execution plans
```

Runtime deployment output, databases, logs, keys, mnemonics, and local node data
are not source artifacts and must remain outside Git.

## Operations Boundary

Deployment, signing, node checking, submission, broadcast, and live rehearsal
are not part of the audit-first workflow. They require the exact non-mainnet
runbook, fresh target bindings, reviewer approval, and explicit user authority.
No command in this README enables those capabilities.

Fresh testnet checkpoint collection is the read-only exception to the offline
audit boundary. It uses a no-auth client and remains separate evidence. Its
singleton checkpoint `observedAt` timestamp must be ISO UTC and no older than
15 minutes, and generated reports include computed freshness age evidence.

## Open Blockers

The canonical manifest currently blocks supported release and readiness claims
for:

- Gate 5 native-profile activation and target-node acceptance;
- complete historical authority and replay-lineage cutover;
- cross-surface key rotation and member-loss rehearsal;
- current-HEAD recovery and clean-checkout evidence;
- independent security review;
- standalone consensus-source build CI;
- alert delivery and reviewed recovery actions.

These blockers cap claims; they do not invalidate the local engineering results
that `audit:alpha` reproduces.

## Origins

- Whitepaper: *Two-Way Pegged Sidechains On Ergo* (kushti/soysor, ErgoHack VII)
- Early reference implementation:
  [ross-weir/ergohack-sidechain](https://github.com/ross-weir/ergohack-sidechain)

The present architecture substantially extends that prototype with explicit
commitment, finality, replay, lifecycle, and funds-authority boundaries.

## License

Repository-owned content is licensed under the
[Apache License 2.0](LICENSE), except where a file or component declares
different terms. The Solidity package and contracts remain MIT-licensed, and pinned
upstream sources and patches retain their applicable upstream terms. See
[Third-Party Notices](THIRD_PARTY_NOTICES.md) for the component boundaries.
