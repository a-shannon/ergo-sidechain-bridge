# Phase 011c -- Anchor Persistence and ContextExtension Guard PR Notes

Status: local readiness-hardening branch prepared, no push.

Branch: `codex/bridge-prod-readiness`

## Proposed PR Title

Persist aggregate anchor height and guard ContextExtension signing

## Proposed PR Body

### Summary

This patch hardens aggregate settlement around two separate failure modes found during patched-devnet validation:

1. **Anchor-height drift**: devnet miners can include the same `0401` extension field in every block. Selecting the latest matching block changes `ergoAnchorHeight` across retries, which changes SPV tracker AVL values and can make otherwise valid settlement TXs fail script validation.
2. **ContextExtension serialization divergence**: current `ergo-lib-wasm-nodejs` and the JVM node disagree on `bytesToSign` ordering for inputs with more than 4 ContextExtension vars. The bridge now fails closed in default mode and only relaxes the guard for explicitly patched loopback devnet runs.

### Changes

- Add stable anchor lookup that chooses the first matching anchor in the search window.
- Persist `ergo_anchor_height` per peg-out and reuse it across retries.
- Clear persisted anchor only when the Ergo-side extension field is positively absent; preserve it on transient RPC/provider failures.
- Add a ContextExtension guard before WASM signing.
- Return `null` when node submission rejects a locally signed TX instead of reporting a fake local tx id.
- Add settlement readiness preflights that reflect the effective guard limit and configured batch max.
- Keep readiness/preflight console output ASCII-safe for Windows shells.
- Keep devnet signer/mining-target diagnostics useful even when the local node config is unavailable.
- Redact signer/mining identifiers in diagnostic output while keeping exact internal comparisons.
- Add devnet-safe repair for stale detected peg-out metadata imported from a deterministic Frontier receipt.
- Redact long sidechain transaction hashes in peg-out import logs.
- Ignore local diagnostics, debug scripts, and SQLite runtime artifacts.
- Make the relayer build reproducible from a clean checkout: track the relayer lockfile, build the AVL WASM crate from the published `ergo_avltree_rust` crate, and add a GitHub Actions CI gate.
- Sanitize legacy local filesystem paths in tracked handoff/walkthrough docs.
- Document the default-mode signing gate vs patched local devnet mode.

### Validation

- `npx.cmd tsc --noEmit`: pass
- `npx.cmd vitest run`: pass, `395/395`
- Clean-checkout gate: `npm.cmd ci --no-audit --no-fund`: pass
- Clean-checkout gate: `npm.cmd run wasm:test`: pass, `12/12`
- Clean-checkout gate: `npm.cmd run check`: pass, builds WASM, TypeScript, and `395/395` relayer tests
- Default-mode `npm.cmd run demo:readiness`: expected fail, signing blocked at 4-Var policy
- Default-mode historical batch preflight: expected fail, signing blocked at 4-Var policy
- `npm.cmd run demo:readiness` with patched loopback env: pass, batch N=10 signing PASS, `READINESS: ALL PASS (2 WARN)` for unset daemon flags
- Historical batch preflight with patched loopback env: pass, batch N=10 signing PASS and batch UTXOs/liquidity confirmed
- Historical patched-loopback N=50 preflight: expected fail, batch unlock would need 152 vars and exceed 128-var patched guard
- Patched local devnet `/transactions/check`: pass, no settlement broadcast
  - Fresh run on 2026-05-14: burn `0x3ca7c0b2e7...fe718e`, anchor height `53980`, TX id `8aa69be55c2026d84aedc79560c4dfb0d6ac71b79945b53c11729423bc205491`
- Script reference audit: 36 package/docs `src/scripts/*.ts` references checked, none missing
- Git authorship: anonymized local identity
- Secrets/dox scan over committed diffs and tracked local paths: no personal path, mnemonic value, signing secret, or local secret

### Upstream Dependency

Default production/testnet mode still waits for upstream sigma-rust ContextExtension serialization conformance. Re-check the upstream PR status before publishing:

- `ergoplatform/sigma-rust#843`: ContextExtension serialization conformance PR
- `Luivatra/sigma-rust#1`: golden-vector follow-up

Checked on 2026-05-13: both PRs are still open, so do not relax the production guard yet.

Until an upstream release is available, the production guard stays at 4 vars. Patched local devnet mode requires all of:

- `PATCHED_STACK_MODE=true`
- `ERGO_NODE` and `ERGO_NODE_URL` set
- both URLs loopback
- both URLs same origin

### Non-goals

- No broadcast behavior change.
- No production use of `/wallet/transaction/sign`.
- No local runtime state committed.
- No dependency bump to an unreleased sigma-rust package.

## Local Commit Context

Local `master` currently ends at `82c3fe1` (`Guard context extension signing`).

Branch delta from local `master` contains:

- Peg-out metadata repair/import handling.
- Settlement readiness and batch signing preflights.
- ContextExtension signing gate documentation and local diagnostics ignore rules.
- Devnet signer/mining-target diagnostics with redacted local path output.
- PR hygiene updates for anonymized local notes and synthetic path fixtures.

Run `git log --oneline master..HEAD -- ergo-sidechain-bridge` for current hashes.

The squashed PR branch is already reduced to topical commits rather than
preserving every hygiene micro-commit:

1. Peg-out import/repair and SQLite state safeguards.
2. Readiness/preflight ContextExtension guard behavior.
3. Devnet signer/mining-target diagnostics and tests.
4. Documentation, `.gitignore`, and PR hygiene notes.

Earlier Phase 5 commits already present in local `master`:

- `149744e` -- Persist aggregate anchor height
- `82c3fe1` -- Guard context extension signing

## PR Hygiene Checklist

- Keep `contracts/deployed_state.json`, SQLite databases, devnet data, and diagnostics unstaged.
- `contracts/deployed_state.json` and `relayer/bridge-state.sqlite` are already tracked; `.gitignore` will not protect them from `git add -u`.
- Stage explicit file paths only. Do not use `git add -u` or `git add -A` while local runtime files are dirty.
- `relayer/src/scripts/e2e-pegin-test.ts` and `relayer/src/scripts/verify-avl-state.ts` are currently treated as local diagnostics and ignored, not PR candidates.
- Do not include untracked walkthroughs with local file paths unless sanitized first.
- Treat these untracked docs as unsafe to stage without cleanup: `phase011-spv-relay-gemini-brief.md`, `phase011a-claude46-spike11-recovery-handoff.md`, and `walkthrough021.md` contain local Windows paths.
- Treat the remaining untracked `walkthrough005.md` through `walkthrough020.md` plus `walkthrough029.md` as archive-only unless reviewed for historical secrets, raw tx ids, and stale signing instructions.
- Confirm upstream #843 status before changing guard defaults.
- Fresh patched-devnet `/transactions/check` passed locally on 2026-05-14; re-run before publishing only if devnet state changes again.
