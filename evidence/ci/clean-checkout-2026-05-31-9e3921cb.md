# Completed Clean Checkout Evidence

## Run Classification

| Field | Value |
|---|---|
| Evidence name | completed clean checkout Gate 1 evidence |
| Git commit | 9e3921cb |
| Branch | codex/bridge-prod-readiness |
| Release level | production deployment candidate |
| CI provider | local clean checkout |
| Workflow | .github/workflows/relayer-checks.yml |
| Node version | 24 |
| Rust target | wasm32-unknown-unknown |
| wasm-pack version | 0.14.0 |
| Reviewer | A. Shannon |
| Date | 2026-05-31 |

## Required Commands

| Command | Expected result | Evidence | Status |
|---|---|---|---|
| npm ci | pass | artifact://ci/artifacts/npm-ci.md npm ci command output: pass exit code 0 from checked package-lock install | linked |
| npm run check | pass | artifact://ci/artifacts/npm-run-check.md npm run check command output: pass exit code 0 with WASM build, TypeScript build, and vitest summary | linked |
| npm run wasm:test | pass | artifact://ci/artifacts/npm-run-wasm-test.md npm run wasm:test command output: pass exit code 0 with 13 Rust WASM tests passed | linked |
| npm run release:gate | blocked with 0 structural issues | artifact://ci/artifacts/npm-run-release-gate.md npm run release:gate command output: blocked with 0 structural issues and pending evidence rows | linked |
| git diff --check -- ergo-sidechain-bridge | pass | artifact://ci/artifacts/git-diff-check.md git diff --check -- ergo-sidechain-bridge output: pass, clean output for bridge project path | linked |
| secret/local path diff scan | no matches | artifact://ci/artifacts/publication-guard-tree.md secret-local-path-diff-scan output: no matches, no findings in bridge project tree | linked |
| git status --short | clean | artifact://ci/artifacts/git-status.md git status --short output: clean/no output for bridge project path | linked |

## CI Workflow Evidence

| Requirement | Workflow evidence | Status |
|---|---|---|
| Workflow file is tracked | artifact://ci/artifacts/workflow-file-is-tracked.md .github/workflows/relayer-checks.yml workflow run evidence | linked |
| Node.js version is pinned | artifact://ci/artifacts/node-js-version-is-pinned.md setup-node node version 24 pinned | linked |
| npm cache uses relayer lockfile | artifact://ci/artifacts/npm-cache-uses-relayer-lockfile.md npm cache dependency-path relayer/package-lock.json | linked |
| Rust wasm target is installed | artifact://ci/artifacts/rust-wasm-target-is-installed.md rust target wasm32-unknown-unknown installed | linked |
| wasm-pack version is pinned | artifact://ci/artifacts/wasm-pack-version-is-pinned.md wasm-pack version 0.14.0 pinned | linked |
| npm ci runs before tests | artifact://ci/artifacts/npm-ci-runs-before-tests.md npm ci runs before npm run check and npm run wasm:test | linked |
| npm run check runs in CI | artifact://ci/artifacts/npm-run-check-runs-in-ci.md npm run check runs in CI | linked |
| npm run wasm:test runs in CI | artifact://ci/artifacts/npm-run-wasm-test-runs-in-ci.md npm run wasm:test runs in CI | linked |
| Final branch commit is identified | artifact://ci/artifacts/final-branch-commit-is-identified.md final branch codex/bridge-prod-readiness commit 9e3921cb | linked |

## Reproducibility Decisions

| Decision | Required evidence | Publication impact | Status |
|---|---|---|---|
| Lockfile install is reproducible | artifact://ci/artifacts/lockfile-install-is-reproducible.md npm ci lockfile reproducibility from package-lock install | required before release proposal | linked |
| WASM AVL builds from tracked source | artifact://ci/artifacts/wasm-avl-builds-from-tracked-source.md WASM AVL tracked-source build via wasm-pack in npm run check | required before release proposal | linked |
| TypeScript build is reproducible | artifact://ci/artifacts/typescript-build-is-reproducible.md TypeScript tsc build via npm run check | required before release proposal | linked |
| Relayer tests pass | artifact://ci/artifacts/relayer-tests-pass.md relayer vitest tests pass with npm run check | required before release proposal | linked |
| Rust WASM tests pass | artifact://ci/artifacts/rust-wasm-tests-pass.md Rust WASM cargo tests pass via npm run wasm:test | required before release proposal | linked |
| No local runtime state is staged | artifact://ci/artifacts/no-local-runtime-state-is-staged.md runtime-state git status worktree hygiene for bridge project path | publication blocked if runtime state is staged | linked |
| No local path or secret marker is staged | artifact://ci/artifacts/no-local-path-or-secret-marker-is-staged.md publication guard bridge tree and staged hygiene scan | publication blocked if publication guard findings are present | linked |
| Release gate has zero structural issues | artifact://ci/artifacts/release-gate-zero-structural-issues.md release-gate structural issue output reports 0 structural issues | publication blocked unless release gate has 0 structural issues | linked |

## Publication Decision

| Field | Value |
|---|---|
| Clean checkout CI green | yes |
| Release supported | production deployment candidate |
| Production-ready claim allowed | no |
| Testnet production-candidate claim allowed | yes |
| Release gate structural issues | 0 |
| Release notes updated | yes |
| Required release-note updates | artifact://ci/artifacts/completed-gate-1-release-note-update-evidence.md completed Gate 1 release-note update evidence |
| Required checklist updates | artifact://ci/artifacts/completed-gate-1-checklist-update-evidence.md completed Gate 1 checklist update evidence |
| Reviewer decision summary | release support: production deployment candidate; clean checkout CI green; production-ready claim handling: blocked; testnet production-candidate claim handling: allowed only after every release-gate evidence family is complete; release gate structural issues: 0 |

## Reviewer Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| CI reviewer | A. Shannon | approve | 2026-05-31 | clean checkout CI green; npm ci, npm run check, npm run wasm:test, git diff check, git status, and release-gate structural issues 0 were verified for Gate 1 |
| Security reviewer | A. Shannon | approve | 2026-05-31 | clean checkout local-path and secret marker scan passed for the bridge project tree; production-ready claims remain blocked |
| Maintainer | A. Shannon | approve | 2026-05-31 | clean checkout final branch commit 9e3921cb is identified; release support is limited to testnet production-candidate evaluation after all remaining gates pass |
