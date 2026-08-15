# Gate 6 Current-HEAD Public Boundary Refresh - 2026-06-26 - 1131a993

This artifact records current-HEAD public-boundary command output for Gate 6
committee governance prerequisites.

It is not completed Gate 6 committee governance evidence. It does not support
governance-ready, key-rotation completion, testnet production-candidate,
production-ready, mainnet, deployment, settlement, signing, or broadcast claims.

## Command Results

| Command | Result | Exit code | Boundary |
|---|---|---:|---|
| npm run status -- --public-boundary | BOUNDARY_ONLY | 0 | No runtime database opened; no deployment state opened; no dotenv loaded |
| npm run demo:readiness -- --public-boundary | BOUNDARY_ONLY | 0 | No runtime database opened; no deployment state opened; no dotenv loaded; no Ergo node or sidechain RPC request performed |
| node .\node_modules\tsx\dist\cli.mjs src\scripts\spikes\spike010a-committee-guard-eval.ts --public-boundary --out <report.md> | BOUNDARY_ONLY | 0 | No node request, ERGO_API_KEY read, contract compilation, key generation, signing, broadcast, deploy, or mutation |
| npm run governance:validate -- ../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-26-1131a993.md --report-out ../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-26-1131a993.md | BLOCKED | 1 | Expected blocker report; 44 structural issues remain |

## status Public Boundary Output

```text
# Bridge Status Public Boundary Report

| Field | Value |
|---|---|
| Command | npm run status -- --public-boundary |
| Result | BOUNDARY_ONLY |
| Exit code | 0 |
| Runtime database opened | no |
| Deployment state opened | no |
| Dotenv loaded | no |
| Public claim authorization granted | no |
| Release gate PASS claimed | no |
| Transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed | no |

This report is not completed Gate 6 status evidence.
```

## demo:readiness Public Boundary Output

```text
# Bridge Demo Readiness Public Boundary Report

| Field | Value |
|---|---|
| Command | npm run demo:readiness -- --public-boundary |
| Result | BOUNDARY_ONLY |
| Exit code | 0 |
| Runtime database opened | no |
| Deployment state opened | no |
| Dotenv loaded | no |
| Ergo node or sidechain RPC request performed | no |
| Public claim authorization granted | no |
| Release gate PASS claimed | no |
| Transaction broadcast, submit, deploy, signing, reconcile, or state mutation performed | no |

This report is not completed demo readiness evidence.
```

## Committee Guard Public Boundary Output

```text
# Phase 010a Committee Guard Evaluation Report

## Command Result

| Field | Value |
|---|---|
| Command | node .\node_modules\tsx\dist\cli.mjs src\scripts\spikes\spike010a-committee-guard-eval.ts --public-boundary --out <report.md> |
| Result | BOUNDARY_ONLY |
| Exit code | 0 |
| Node endpoint | not used (--public-boundary) |
| Reason | Public-boundary mode completed without reading node credentials, contacting an Ergo node, compiling contracts, generating ephemeral committee keys, signing, or broadcasting. |

## Completed Checks

- Phase 010a guard evaluation boundary printed before node-backed contract compilation, header-context construction, key generation, signing, or broadcast paths.

## Boundary

| Boundary | Value |
|---|---|
| ErgoScript contracts compiled | no |
| Committee guard evaluated | no |
| Wrong-signer rejection evaluated | no |
| Ergo node request performed | no |
| ERGO_API_KEY read | no |
| Header context constructed | no |
| Ephemeral committee key generated | no |
| Private key material serialized | no |
| Node wallet used | no |
| Key rotation authorization granted | no |
| Gate 6 committee governance closure claimed | no |
| Transaction broadcast, submit, deploy, or state mutation performed | no |

This is public-boundary prerequisite output only. It is not completed Gate 6 command evidence, key-rotation completion, release authorization, deployment approval, or transaction broadcast approval.
```

## Current Gate 6 Validation Result

| Field | Value |
|---|---|
| Validated target | ../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-26-1131a993.md |
| Validator report | artifact://governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-26-1131a993.md |
| Result | BLOCKED |
| Exit code | 1 |
| Structural issues | 44 |
| Expected outcome | yes |

## Remaining Issue Groups

| Issue group | Count | Operator meaning |
|---|---:|---|
| Scope | 8 | Governed surfaces still lack completed authority-transition evidence |
| Required commands | 6 | Governance/check commands still lack command-specific completed output evidence |
| Rotation plan | 11 | Key-rotation steps still lack linked identifiers, stop conditions, or disjoint old/new committee bindings |
| Positive checks | 2 | New-committee acceptance checks still lack completed evidence |
| Negative checks | 7 | Rejection, broadcast-disabled, or wrong-network negative checks still lack completed evidence |
| Publication rules | 7 | Governance-ready, release support, blocker, or external-review fields remain incomplete |
| Reviewer sign-off | 3 | Governance owner, security reviewer, and operator reviewer approvals remain incomplete |

## Boundary

| Boundary | Value |
|---|---|
| Runtime database opened | no |
| Deployment state opened | no |
| Dotenv loaded | no |
| Ergo node or sidechain RPC request performed | no |
| Signing performed | no |
| Transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed | no |
| Gate 6 status evidence completed | no |
| Gate 6 demo readiness evidence completed | no |
| Gate 6 committee governance evidence completed | no |
| Key rotation authorized or performed | no |
| Public claim authorization granted | no |
| Release gate PASS claimed | no |
