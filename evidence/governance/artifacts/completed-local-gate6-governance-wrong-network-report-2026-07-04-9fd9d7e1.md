# Gate 6 Deployment-State Reconciliation Report

This report validates sanitized public JSON for Gate 6 committee governance prerequisites.
It does not open private deployment state, rotate keys, mutate runtime state, authorize
broadcast, close Gate 6, or support public release claims.

## Command Result

| Field | Value |
| --- | --- |
| Result | LINKED |
| Reason | Wrong-network negative evidence blocks committee governance rotation when network binding mismatches. |
| Kind | wrong-network-negative |
| Command | npm run governance:reconcile:validate -- --reconciliation-json ../evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-input-2026-07-04-9fd9d7e1.json --observed-at 2026-07-04T12:39:07Z --out ../evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-report-2026-07-04-9fd9d7e1.md --json-out ../evidence/governance/artifacts/completed-local-gate6-governance-wrong-network-report-2026-07-04-9fd9d7e1.json |
| Working directory | ergo-sidechain-bridge/relayer |
| Structural issues | 0 |

## Issues

- None.

## Packet Scope

| Field | Value |
| --- | --- |
| Source | local public Gate 6 wrong-network negative input |
| Target label | sanitized non-mainnet wrong-network packet |
| Observed at | 2026-07-04T12:39:07.000Z |
| Deployment-state digest | 3131313131313131313131313131313131313131313131313131313131313131 |

## Network Binding

| Field | Value |
| --- | --- |
| Expected network | testnet |
| Observed network | patched-devnet |
| Network binding matched | no |

## Governance Evidence Binding

| Field | Value |
| --- | --- |
| Wrong-network rejection linked | yes |
| Stop condition | Governance rotation blocked because the deployment-state network does not match the intended testnet target. |

## Boundary

| Boundary | Value |
| --- | --- |
| Read-only validator | yes |
| Sanitized public input only | yes |
| Private deployment state included | no |
| Deployment state opened | no |
| Runtime database opened | no |
| Secret or environment file read | no |
| Signing key or wallet material read | no |
| Node, RPC, or explorer request performed | no |
| Key rotation authorized | no |
| Transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed | no |
| Gate 6 committee governance closure claimed | no |
| Governance-ready claim supported | no |
| Production-ready claim supported | no |
| Testnet production-candidate claim supported | no |
