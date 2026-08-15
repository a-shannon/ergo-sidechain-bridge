# Completed Dependency Review Evidence

## Review Classification

| Field | Value |
|---|---|
| Review name | completed Gate 4 dependency review |
| Git commit | 2ba7c3fb |
| Release level | institutional reference |
| Environment | clean checkout |
| Lockfiles reviewed | yes |
| Reviewer | A. Shannon |
| Date | 2026-05-31 |

## Required Commands

| Command | Evidence | Status |
|---|---|---|
| npm ci | artifact://dependency/artifacts/npm-ci.md npm ci command output: PASS exit code 0; completed dependency install reviewed from package lock | linked |
| npm run check | artifact://dependency/artifacts/npm-run-check.md npm run check command output: PASS exit code 0; completed dependency gate build, TypeScript, and vitest verification | linked |
| npm run wasm:test | artifact://dependency/artifacts/npm-run-wasm-test.md npm run wasm:test command output: PASS exit code 0; completed Rust WASM AVL dependency verification | linked |
| npm audit --omit=dev | artifact://dependency/artifacts/npm-audit-omit-dev.md npm audit --omit=dev command output: PASS exit code 0 for critical/high audit policy; zero open critical/high production vulnerabilities and moderate ws advisory triaged | linked |
| cargo tree --locked | artifact://dependency/artifacts/cargo-tree-locked.md cargo tree --locked command output: PASS exit code 0; completed locked Rust dependency tree review | linked |

## Dependency Scope

| Dependency | Source | Reviewed risk | Evidence | Status |
|---|---|---|---|---|
| ergo-lib-wasm-nodejs | package lock and signer call sites | sigma-rust signer consensus and ContextExtension serialization risk | artifact://dependency/artifacts/ergo-lib-wasm-nodejs-scope.md ergo-lib-wasm-nodejs sigma-rust signer dependency scope evidence | linked |
| sigma-rust ContextExtension serializer | signer guard tests and transaction serialization path | signed bytes and TX ID consensus risk | artifact://dependency/artifacts/sigma-rust-contextextension-serializer-scope.md sigma-rust ContextExtension serializer evidence for signed bytes and TX ID consensus | linked |
| @fleet-sdk/core | package lock and transaction assembly call sites | transaction assembly API drift risk | artifact://dependency/artifacts/fleet-sdk-core-scope.md @fleet-sdk/core transaction assembly API drift evidence | linked |
| @fleet-sdk/common | package lock and shared helper usage | shared transaction and address helper risk | artifact://dependency/artifacts/fleet-sdk-common-scope.md @fleet-sdk/common shared helper dependency evidence | linked |
| @fleet-sdk/wallet | package lock and signer boundary review | wallet fallback signer risk | artifact://dependency/artifacts/fleet-sdk-wallet-scope.md @fleet-sdk/wallet wallet fallback signer boundary evidence | linked |
| ergo_avltree_rust | locked Rust tree and WASM AVL crate | AVL proof JVM compatibility risk | artifact://dependency/artifacts/ergo-avltree-rust-scope.md ergo_avltree_rust AVL proof JVM compatibility evidence | linked |
| better-sqlite3 | package lock and recovery state storage path | SQLite state recovery risk | artifact://dependency/artifacts/better-sqlite3-scope.md better-sqlite3 SQLite state recovery evidence | linked |
| blakejs | package lock and commitment hashing path | Blake2b commitment hashing risk | artifact://dependency/artifacts/blakejs-scope.md blakejs Blake2b commitment and proof-root hashing evidence | linked |
| ethers | package lock and sidechain event reader path | EVM event parsing risk | artifact://dependency/artifacts/ethers-evm-event-scope.md ethers EVM event parsing evidence | linked |
| wasm-pack and Rust toolchain | package scripts and locked Rust build inputs | reproducible WASM toolchain risk | artifact://dependency/artifacts/wasm-pack-rust-toolchain-scope.md wasm-pack and Rust toolchain reproducible build evidence | linked |
| Node.js / npm lockfile | package-lock and npm ci install path | lockfile, npm install, reproducibility, transitive, Node.js, and npm risk | artifact://dependency/artifacts/node-npm-lockfile-scope.md Node.js npm lockfile reproducibility evidence | linked |

## Vulnerability Triage

| Triage item | Tool or review method | Findings | Evidence | Status |
|---|---|---|---|---|
| npm production dependencies | npm audit production dependency review | zero open critical/high vulnerabilities; moderate ws advisory tracked without production-candidate claim | artifact://dependency/artifacts/npm-production-dependencies-triage.md completed npm production dependency triage evidence | linked |
| npm dev and build toolchain | npm audit and package-lock build-tool review | zero open critical/high vulnerabilities in dev and build toolchain | artifact://dependency/artifacts/npm-dev-build-toolchain-triage.md completed npm dev build toolchain triage evidence | linked |
| Rust dependency tree | cargo tree locked review | zero open critical/high vulnerabilities in locked Rust dependency tree | artifact://dependency/artifacts/rust-dependency-tree-triage.md completed Rust dependency tree triage evidence | linked |
| Signer consensus dependency | signer boundary and ContextExtension guard review | zero open critical/high vulnerabilities in signer consensus dependency boundary | artifact://dependency/artifacts/signer-consensus-dependency-triage.md completed signer consensus dependency triage evidence | linked |
| AVL proof dependency | wasm-avl and ergo_avltree_rust review | zero open critical/high vulnerabilities in AVL proof dependency path | artifact://dependency/artifacts/avl-proof-dependency-triage.md completed AVL proof dependency triage evidence | linked |
| SQLite native dependency | better-sqlite3 recovery storage review | zero open critical/high vulnerabilities in SQLite native dependency path | artifact://dependency/artifacts/sqlite-native-dependency-triage.md completed SQLite native dependency triage evidence | linked |
| EVM event dependency | ethers event parsing and ws advisory review | zero open critical/high vulnerabilities in EVM event dependency path | artifact://dependency/artifacts/evm-event-dependency-triage.md completed EVM event dependency triage evidence | linked |
| Lockfile integrity | npm ci and lockfile provenance review | zero open critical/high vulnerabilities with package-lock reproducibility retained | artifact://dependency/artifacts/lockfile-integrity-triage.md completed lockfile integrity triage evidence | linked |

## Upgrade And Pinning Decision

| Decision | Required evidence | Release action | Status |
|---|---|---|---|
| Signer dependency upgrade decision | artifact://dependency/artifacts/context-extension-guard-evidence.md completed ContextExtension guard evidence for sigma-rust signer fail-closed handling | keep pinned with fail-closed ContextExtension guard and blocker rationale; production-ready claims blocked until upstream signer release and JVM/node conformance evidence are validated; testnet production-candidate claims blocked until upstream signer release and JVM/node conformance evidence are validated; guard evidence artifact://dependency/artifacts/context-extension-guard-evidence.md | linked |
| Fleet SDK upgrade decision | artifact://dependency/artifacts/fleet-sdk-upgrade-decision.md completed Fleet SDK API drift and transaction assembly evidence | keep Fleet SDK pinned with API drift reviewed before any upgrade | linked |
| AVL dependency upgrade decision | artifact://dependency/artifacts/avl-dependency-upgrade-decision.md completed AVL JVM compatibility and proof dependency evidence | keep AVL dependency pinned with JVM compatibility and proof behavior reviewed before any upgrade | linked |
| SQLite dependency upgrade decision | artifact://dependency/artifacts/sqlite-dependency-upgrade-decision.md completed SQLite native state recovery and backup restore evidence | keep SQLite dependency pinned with native state recovery and backup restore behavior reviewed before any upgrade | linked |
| EVM dependency upgrade decision | artifact://dependency/artifacts/evm-dependency-upgrade-decision.md completed EVM event receipt and log parsing evidence | keep EVM dependency pinned with event receipt and log parsing reviewed before any upgrade | linked |
| Toolchain pinning decision | artifact://dependency/artifacts/toolchain-pinning-decision.md completed wasm-pack, Rust, Node.js, npm lockfile, and reproducible toolchain evidence | keep toolchain pinned with wasm-pack, Rust, Node.js, and npm lockfile reproducibility reviewed before any upgrade | linked |

## Publication Decision

| Field | Value |
|---|---|
| Release supported | institutional reference |
| Production-ready claim allowed | no |
| Testnet production-candidate claim allowed | no |
| Critical/high vulnerabilities open | 0 |
| Upstream signer blocker resolved | no |
| Release notes updated | yes |
| Required release-note updates | artifact://dependency/artifacts/completed-dependency-review-release-note-evidence.md completed dependency-review release-note update evidence Release supported = institutional reference; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Critical/high vulnerabilities open = 0; Upstream signer blocker resolved = no |
| Required checklist updates | artifact://dependency/artifacts/completed-dependency-review-checklist-update-evidence.md completed dependency review checklist update evidence Release supported = institutional reference; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Critical/high vulnerabilities open = 0; Upstream signer blocker resolved = no |
| Reviewer decision summary | Release supported = institutional reference; upstream signer blocker handling: unresolved fail-closed guard; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; Critical/high vulnerabilities open = 0 |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Dependency reviewer | A. Shannon | approve | 2026-05-31 | approved dependency risk outcome for institutional reference; signer blocker remains unresolved with fail-closed guard; zero open critical/high vulnerabilities |
| Security reviewer | A. Shannon | approve | 2026-05-31 | approved signer guard boundary; ContextExtension guard keeps signer path closed while upstream release remains unresolved; zero open critical/high vulnerabilities |
| Maintainer | A. Shannon | approve | 2026-05-31 | approved lockfile and dependency evidence for institutional reference; no production or testnet candidate claim is enabled |
