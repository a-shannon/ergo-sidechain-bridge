# Testnet Production-Candidate Architecture Manual Template

This template is Phase 007 gated technical-addendum evidence. It is not a
release note, public claim, deployment approval, or transaction-broadcast
approval. The blank template is expected to fail validation.

Validate a completed copy before linking it as Phase 007 evidence:

```bash
cd relayer
npm run addendum:validate -- ../evidence/addendum/<completed-technical-addendum-evidence>.md
npm run release:gate -- --technical-addendum-evidence ../evidence/addendum/<completed-technical-addendum-evidence>.md
```

`npm run addendum:validate` checks the manual structure and claim boundary.
`npm run release:gate -- --technical-addendum-evidence` remains the source of
truth for whether the completed addendum is linked to the broader evidence set
before controlled testnet production-candidate or production-grade testnet
wording can be used. The release gate consumes the structured gate-map,
architecture-decision, reviewer rows, and publication-decision update fields
returned by `addendum:validate`; a PASS summary, target, classification, or
publication decision without those rows and update fields cannot close Gate 2.
Gate 2 also consumes the structured Manual Classification fields. For testnet
production-candidate evaluation, the completed validation must expose a
non-empty Manual name, a 7-40 character Git commit matching the final
clean-checkout Run Classification `Git commit`, `Environment = testnet`,
controlled testnet claim wording, non-empty Architecture owner and Reviewer,
ISO Date, Architecture owner sign-off matching that owner, Security reviewer
sign-off matching that reviewer, and reviewer sign-off dates that do not
predate the classification Date. Gate 2 also checks that linked/passed gate rows carry
gate-specific required evidence, completed artifact evidence, and a bounded
claim boundary; that decision rows carry decision-specific positions and
completed evidence; and that reviewer notes state a concrete technical-addendum
outcome while preserving claim, signer, and broadcast boundaries. Reviewer
notes must be internally non-contradictory; they must not approve
production-ready wording, mainnet deployment wording, node-wallet production
signing, unscoped broadcast enablement, or failed validator/command markers.
Generic row
payloads such as `PASS`, `reviewed`, or `approved` remain
blocked, and row-named non-concrete artifact targets such as `generic-*`,
`placeholder-*`, `todo-*`, `tbd-*`, `fixture-*`, `mock-*`, `dummy-*`,
`fake-*`, `stub-*`, `testdata-*`, `sample-evidence-*`, and
`example-evidence-*` are placeholders rather than completed gate-map,
decision, or publication-update evidence. Rows and publication-update fields that mix
pass-like command or validation notes with `FAIL`, `BLOCKED`, `ERROR`, non-zero
`exit code`, non-zero `errors`, or non-zero `structural issues` remain blocked
even when they cite concrete architecture-manual artifacts. Gate 2 also
requires the completed addendum document target to be
linked as completed technical-addendum evidence outside the validator output segment;
a validation log that only names the completed document as its validated target
is not enough. `technical addendum validation target`, `addendum validate target`,
`addendum validation target`, `validated target`, and `validated input` bindings
are validator provenance only; they cannot close gate-map, architecture-decision,
release-note, or checklist update evidence rows.
Linked or passed gate-map rows and linked architecture-decision rows must also
use distinct completed evidence targets across row groups; one shared
architecture-manual artifact cannot close multiple Gate 2 facts.
The Publication Decision release-note and checklist update fields must also use
distinct completed Phase 007 evidence targets; one combined publication-update
artifact cannot close both fields.

## Manual Classification

| Field | Value |
|---|---|
| Manual name | |
| Git commit | |
| Release level | |
| Environment | |
| Claim wording | |
| Architecture owner | |
| Reviewer | |
| Date | |

## Architecture Scope

Describe the current non-mainnet bridge architecture, including SCS, MCL, DUP,
SPVTracker, aggregate settlement, and the relayer. Cite completed evidence for
each architectural claim rather than using narrative confidence.

## Claim Boundary

`release:gate -- --technical-addendum-evidence` consumes these fields as
structured validator output. A `PASS` summary, publication decision, or
gate-map row is not enough if the Claim Boundary fields are omitted or if they
do not preserve the gated testnet-only scope below.

| Field | Value |
|---|---|
| Production-ready claims allowed | no |
| Mainnet deployment claims allowed | no |
| Testnet production-candidate wording allowed | yes-after-release-gate-pass |
| Production-grade testnet wording allowed | yes-after-release-gate-pass |
| Release gate required before public claim | yes |
| Evidence completeness required | yes |

## Evidence Gate Map

| Gate | Required evidence | Artifact | Status | Claim boundary |
|---|---|---|---|---|
| Clean checkout CI | final branch reproducibility | | | |
| Fresh testnet lifecycle | completed live rehearsal evidence | | | |
| Upstream signer conformance | released sigma-rust/JVM-node ContextExtension evidence or explicit fail-closed institutional-reference blocker | | | |
| Trustless burn verification | completed trustless burn evidence | | | |
| Committee governance | completed committee/key-rotation evidence | | | |
| Operator readiness | completed operator readiness evidence | | | |
| Benchmark and scaling evidence | completed benchmark evidence | | | |
| Independent security review | completed independent security review evidence | | | |
| External integration review | completed external integration review evidence | | | |
| Release notes | completed production deployment candidate release notes | | | |

## Architecture Decision Record

| Decision | Required position | Evidence | Status |
|---|---|---|---|
| What release level does this manual describe? | | | |
| Which signer path is allowed? | | | |
| What blocks mainnet production-ready claims? | | | |
| What must pass before testnet production-candidate wording? | | | |
| Which trustless-burn limitation remains? | | | |
| How is live broadcast authorized? | | | |
| How are recovery and rollback evidenced? | | | |
| How are benchmark and scaling claims bounded? | | | |

For `What must pass before testnet production-candidate wording?`, the
`Evidence` cell must include concrete `release:gate PASS` output with
`Structural issues = 0`, not only a decision artifact or `addendum:validate`
output.

## Security Boundary

Document that production settlement signing is restricted to
`ergo-lib-wasm-nodejs` / sigma-rust, that the ContextExtension guard remains
fail-closed, and that node-wallet signing is not the production path. State
which trustless-burn, multisig, benchmark, and review blockers remain.

## Operational Boundary

Document that this manual performs no transaction broadcast. Live broadcast
requires explicit approval, scoped `BRIDGE_BROADCAST_ENABLED=true`, a passing
readiness check, and the executable `release:gate` decision. A completed manual
does not replace operator runbooks, recovery drills, or live rehearsal evidence.

## Publication Decision

| Field | Value |
|---|---|
| Manual use status | |
| Release supported | |
| Release gate status | |
| Production-ready claim allowed | no |
| Mainnet deployment claim allowed | no |
| Testnet production-candidate claim allowed | no |
| Release notes updated | no |
| Required release-note updates | |
| Required checklist updates | |
| Reviewer decision summary | |

`Manual use status` must be `candidate claim support` before this manual can
support testnet production-candidate wording. `draft` and
`validated internal reference` are valid internal states, but they cannot support
that release-level claim.

`Reviewer decision summary` must mention release support, architecture manual
evidence, production-ready claim handling, and testnet production-candidate
claim handling; a generic note such as `approved` is not enough. When
`Release supported = production deployment candidate`, the summary must use
the exact `Release supported = production deployment candidate` binding.

`Required release-note updates` must link completed Phase 007 release-note
update evidence. `Required checklist updates` must link completed Phase 007
checklist update evidence. These two fields must use distinct completed Phase
007 evidence targets; template links, validator command names, generic
release-note/checklist artifacts, targetless command-output notes, or a reused
target cannot close Phase 007 publication-update evidence.
Publication-update rows that mention release-gate pass/status must use the exact
field `Release gate status = pass`; prose-only release-gate pass wording does
not close that boundary. Publication-update rows that mention testnet
production-candidate claim allowance must use the exact field `Testnet
production-candidate claim allowed = yes-after-release-gate-pass`; prose-only
testnet production-candidate claim wording does not close that boundary.

## Reviewer Sign-Off

Reviewer notes must name the concrete architecture-manual outcome being
approved or blocked. They must also keep the Gate 2 boundary: production-ready
and mainnet deployment wording remain blocked, node-wallet is not approved as a
production signing path, and `BRIDGE_BROADCAST_ENABLED=true` remains scoped to
explicit approval before any live broadcast. Internally contradictory notes
that combine approval with failed validator/command markers, `ERROR`, non-zero
`exit code`, non-zero `errors`, or non-zero `structural issues` cannot close
Gate 2.

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Architecture owner | | approve / block | | |
| Security reviewer | | approve / block | | |
| Operator reviewer | | approve / block | | |
