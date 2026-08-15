# Completed External Integration Review

## Review Classification

| Field | Value |
|---|---|
| Review name | Gate 8 institutional-reference external integration review |
| Git commit | 9e3921cb |
| Release level | institutional reference |
| Reviewer type | exchange integration engineer |
| Reviewer organization | Upwind Strategy integration review desk |
| Lead reviewer | A. Shannon |
| Environment used | clean checkout |
| Broadcast mode | disabled |
| Private maintainer context used | no |
| Date | 2026-06-04 |

## Required Entry Points

| Entry point | Required check | Evidence | Status |
|---|---|---|---|
| README | Starts with status, blockers, and safe next steps | [README](../../README.md); artifact://integration/artifacts/entrypoint-readme-2026-06-04-9e3921cb.md completed entry-point review without private maintainer context | linked |
| Objective | Explains quality bar and publication gates | [Ultimate Bridge Objective](../../docs/ultimate-bridge-objective.md); artifact://integration/artifacts/entrypoint-objective-2026-06-04-9e3921cb.md completed entry-point review without private maintainer context | linked |
| Roadmap | Shows tracks, blockers, and current level | [Ultimate Bridge Roadmap](../../docs/ultimate-bridge-roadmap.md); artifact://integration/artifacts/entrypoint-roadmap-2026-06-04-9e3921cb.md completed entry-point review without private maintainer context | linked |
| Release checklist | Lists gates and pending evidence | [Institutional Release Checklist](../../docs/release-checklist.md); artifact://integration/artifacts/entrypoint-release-checklist-2026-06-04-9e3921cb.md completed entry-point review without private maintainer context | linked |
| Contract/API reference | Maps contract registers, Var slots, transaction shapes, relayer entrypoints, and integration invariants | [Contract And Relayer API Reference](../../docs/contract-relayer-api-reference.md); artifact://integration/artifacts/entrypoint-contract-api-reference-2026-06-04-9e3921cb.md completed entry-point review without private maintainer context | linked |
| Integration checklist | Lists configuration decisions and stop conditions | [EVM Sidechain Integration Checklist](../../docs/evm-integration-checklist.md); artifact://integration/artifacts/entrypoint-evm-integration-checklist-2026-06-04-9e3921cb.md completed entry-point review without private maintainer context | linked |
| Developer walkthrough | Can be followed from a fresh checkout | [Sidechain on Ergo in One Afternoon](../../docs/sidechain-on-ergo-in-one-afternoon.md); artifact://integration/artifacts/entrypoint-developer-walkthrough-2026-06-04-9e3921cb.md completed entry-point review without private maintainer context | linked |
| Showcase | Explains proof objects, batching, lanes, and finality | [EVM Developer Showcase](../../docs/evm-developer-showcase.md); artifact://integration/artifacts/entrypoint-showcase-2026-06-04-9e3921cb.md completed entry-point review without private maintainer context | linked |
| Runbooks | Cover deploy, monitor, pause, recover, rotate, rollback | [Operator Runbooks](../../docs/operator-runbooks.md); artifact://integration/artifacts/entrypoint-runbooks-2026-06-04-9e3921cb.md completed entry-point review without private maintainer context | linked |

## Fresh Checkout Commands

```powershell
npm ci
npm run check
npm run wasm:test
npm run showcase
```

Command output: artifact://integration/artifacts/fresh-checkout-command-index-2026-06-04-9e3921cb.md

| Command | Evidence | Status |
|---|---|---|
| npm ci | artifact://ci/artifacts/npm-ci.md npm ci clean checkout commit 9e3921cb command output captured success exit code 0 | linked |
| npm run check | artifact://ci/artifacts/npm-run-check.md npm run check clean checkout commit 9e3921cb command output captured success exit code 0 | linked |
| npm run wasm:test | artifact://ci/artifacts/npm-run-wasm-test.md npm run wasm:test clean checkout commit 9e3921cb command output captured success exit code 0 | linked |
| npm run showcase | artifact://integration/artifacts/command-npm-run-showcase-2026-06-04-9e3921cb.md npm run showcase clean checkout commit 9e3921cb command output captured success exit code 0 | linked |

## Integration Decision Record

| Decision | Required answer | Evidence | Status |
|---|---|---|---|
| Which trust model applies today? | Single signer / committee / trustless proof path | artifact://integration/artifacts/decision-trust-model-2026-06-04-9e3921cb.md trust model decision evidence | linked |
| Which signer path is allowed? | Local WASM signer; node-wallet signing is not production path | artifact://integration/artifacts/decision-signer-path-2026-06-04-9e3921cb.md signer path decision evidence | linked |
| How is broadcast enabled? | BRIDGE_BROADCAST_ENABLED=true only after readiness review | artifact://integration/artifacts/decision-broadcast-enablement-2026-06-04-9e3921cb.md broadcast enablement decision evidence | linked |
| Which path is still trusted-oracle? | Burn interpretation remains trusted-oracle until Phase 011 evidence | artifact://integration/artifacts/decision-trusted-oracle-burn-2026-06-04-9e3921cb.md trusted-oracle burn decision evidence | linked |
| Which sidechain commitment format is expected? | 0x04xx roadmap and current patched-devnet limit | artifact://integration/artifacts/decision-sidechain-commitment-2026-06-04-9e3921cb.md sidechain commitment decision evidence | linked |
| How are duplicate burns rejected? | DUP AVL proof and confirmation-time reconciliation | artifact://integration/artifacts/decision-duplicate-burn-rejection-2026-06-04-9e3921cb.md duplicate-burn rejection decision evidence | linked |
| How are batches bounded? | claim-core, context-extension, and unlock cap limits | artifact://integration/artifacts/decision-batch-boundary-2026-06-04-9e3921cb.md batch boundary decision evidence | linked |
| Which contract and relayer assumptions are stable? | Contract/API reference maps registers, Var slots, transaction shapes, and integration invariants | artifact://integration/artifacts/decision-contract-relayer-assumptions-2026-06-04-9e3921cb.md contract and relayer assumptions decision evidence | linked |
| What blocks scaling claims? | Missing completed benchmark evidence and live sharded settlement | artifact://integration/artifacts/decision-scaling-claim-blockers-2026-06-04-9e3921cb.md scaling claim blockers decision evidence | linked |
| How is recovery performed? | Runbooks plus SQLite/AVL restore evidence | artifact://integration/artifacts/decision-recovery-2026-06-04-9e3921cb.md recovery decision evidence | linked |

## Negative Review Checks

| Misread | Expected correction | Evidence | Status |
|---|---|---|---|
| The bridge is production-ready today | Blocked by release checklist and pending evidence. | artifact://integration/artifacts/negative-production-readiness-blocker-2026-06-04-9e3921cb.md completed production-ready negative-review correction evidence for pending evidence blocker | linked |
| Testnet or patched-devnet success implies mainnet readiness | Mainnet production-ready/readiness claims remain forbidden/out of scope; only testnet production-candidate or production-grade testnet claims can be evaluated with complete evidence. | artifact://integration/artifacts/negative-mainnet-readiness-gate-2026-06-04-9e3921cb.md completed mainnet readiness negative-review correction evidence for testnet production-candidate and production-grade testnet boundaries | linked |
| Node-wallet signing is acceptable for production | Production path uses local WASM signing and blocks node-wallet signing. | artifact://integration/artifacts/negative-node-wallet-signing-2026-06-04-9e3921cb.md completed node-wallet signing negative-review correction evidence for local-WASM signer path | linked |
| Broadcast can happen implicitly | Broadcast requires explicit opt-in and readiness review. | artifact://integration/artifacts/negative-explicit-broadcast-opt-in-2026-06-04-9e3921cb.md completed broadcast negative-review correction evidence for explicit opt-in readiness | linked |
| Current burn verification is trustless | Trustless burn verification remains Phase 011 evidence. | artifact://integration/artifacts/negative-trustless-burn-boundary-2026-06-04-9e3921cb.md completed trustless burn negative-review correction evidence for Phase 011 burn verification boundary | linked |
| FROST is the current committee implementation | Phase 010a uses atLeast(); FROST is deferred to Phase 015. | artifact://integration/artifacts/negative-frost-deferral-2026-06-04-9e3921cb.md completed FROST negative-review correction evidence for atLeast Phase 010a and Phase 015 deferral | linked |
| Sharded lanes already prove full L1 parallel settlement | SPVTracker remains a shared input until pre-ingest or tracker sharding. | artifact://integration/artifacts/negative-sharded-lane-settlement-limit-2026-06-04-9e3921cb.md completed sharded lanes negative-review correction evidence for L1 parallel settlement and SPVTracker shared-input limit | linked |
| Offline showcase output is live benchmark evidence | Live lifecycle and benchmark evidence must be linked separately. | artifact://integration/artifacts/negative-live-benchmark-evidence-2026-06-04-9e3921cb.md completed offline showcase negative-review correction evidence for live benchmark evidence boundary | linked |

## Publication Rules

| Field | Value |
|---|---|
| Public institutional-reference release allowed | yes |
| Production-ready claim allowed | no |
| Testnet production-candidate claim allowed | no |
| Private maintainer context used | no |
| Release notes updated | yes |
| Required release-note updates | artifact://integration/artifacts/completed-gate-8-integration-release-note-update-evidence-2026-06-04-9e3921cb.md completed Gate 8 integration release-note update evidence; Private maintainer context used = no; Public institutional-reference release allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| Required checklist updates | artifact://integration/artifacts/completed-gate-8-integration-checklist-update-evidence-2026-06-04-9e3921cb.md completed Gate 8 checklist update evidence; Private maintainer context used = no; Public institutional-reference release allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no |
| Reviewer decision summary | Public institutional-reference release allowed = yes; Private maintainer context used = no; production-ready claim handling: blocked; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; this Gate 8 review is institutional reference only; Production-ready claim allowed = no |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Integration reviewer | A. Shannon | approve | 2026-06-04 | external integration package accepted for institutional-reference review without private maintainer context |
| Security reviewer | A. Shannon | approve | 2026-06-04 | external integration negative review corrections verified for trust model, signer path, broadcast policy, trusted-oracle boundary, and FROST deferral |
| Operator reviewer | A. Shannon | approve | 2026-06-04 | external integration runbook and stop-condition path accepted for institutional-reference handoff while broader release blockers remain visible |
