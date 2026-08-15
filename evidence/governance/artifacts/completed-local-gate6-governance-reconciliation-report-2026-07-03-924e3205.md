# Gate 6 Deployment-State Reconciliation Report

This report validates sanitized public JSON for Gate 6 committee governance prerequisites.
It does not open private deployment state, rotate keys, mutate runtime state, authorize
broadcast, close Gate 6, or support public release claims.

## Command Result

| Field | Value |
| --- | --- |
| Result | LINKED |
| Reason | Sanitized deployment-state reconciliation binds network, singleton identity, old authority, new committee authority, and rollback state. |
| Kind | deployment-state-reconciliation |
| Command | npm run governance:reconcile:validate -- --reconciliation-json ../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-input-2026-07-03-924e3205.json --observed-at 2026-07-03T08:30:00.000Z --out ../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-report-2026-07-03-924e3205.md --json-out ../evidence/governance/artifacts/completed-local-gate6-governance-reconciliation-report-2026-07-03-924e3205.json |
| Working directory | ergo-sidechain-bridge/relayer |
| Structural issues | 0 |

## Issues

- None.

## Packet Scope

| Field | Value |
| --- | --- |
| Source | local public Gate 6 governance reconciliation input |
| Target label | sanitized non-mainnet committee reconciliation packet |
| Observed at | 2026-07-03T08:30:00.000Z |
| Deployment-state digest | 3131313131313131313131313131313131313131313131313131313131313131 |

## Network Binding

| Field | Value |
| --- | --- |
| Expected network | testnet |
| Observed network | testnet |
| Network binding matched | yes |

## Governance Evidence Binding

| Field | Value |
| --- | --- |
| Deployment-state reconciliation linked | yes |
| Sidechain ID | 3232323232323232323232323232323232323232323232323232323232323232 |
| SCS NFT ID | 3333333333333333333333333333333333333333333333333333333333333333 |
| Singleton identity count | 6 |
| Old authority identifiers | 1 |
| New committee threshold | 2/3 |
| Rollback binding linked | yes |

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
