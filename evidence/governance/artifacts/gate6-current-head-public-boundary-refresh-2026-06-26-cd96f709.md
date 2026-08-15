# Gate 6 Current-HEAD Public Boundary Refresh - 2026-06-26 - cd96f709

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
| npm run governance:validate -- ../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-25-3e1a6811.md --report-out ../evidence/governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-26-cd96f709.md | BLOCKED | 1 | Expected blocker report; 45 structural issues remain |

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

## Current Gate 6 Validation Result

| Field | Value |
|---|---|
| Validated target | ../evidence/governance/phase010a-committee-governance-blocker-map-2026-06-25-3e1a6811.md |
| Validator report | artifact://governance/artifacts/governance-validate-phase010a-blocker-map-blocked-2026-06-26-cd96f709.md |
| Result | BLOCKED |
| Exit code | 1 |
| Structural issues | 45 |
| Expected outcome | yes |

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
