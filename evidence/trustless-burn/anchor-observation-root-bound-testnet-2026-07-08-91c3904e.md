# Gate 5 Trustless Anchor Observation Report

This report records a read-only 0x0401 extension observation for one expected bridge event root.
It is prerequisite evidence only. It does not prove full burn inclusion, SPV relay operation,
on-chain proof acceptance, Gate 5 closure, settlement readiness, broadcast authorization,
or production-ready, mainnet, or testnet production-candidate claims.

## Command Result

| Field | Value |
| --- | --- |
| Result | BLOCKED |
| Reason | no matching 0x0401 bridgeEventRoot observed in readable extension observations |
| Observed at | 2026-07-08T21:26:13.869Z |
| Command | npm run trustless:anchor-observe -- --bridge-event-root 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9 --observations-json ../evidence/trustless-burn/anchor-observations-root-bound-testnet-2026-07-08-91c3904e.json --min-height 434649 --max-height 435368 --observed-at 2026-07-08T21:26:13.869Z --out ../evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-08-91c3904e.md --json-out ../evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-08-91c3904e.json |
| Working directory | ergo-sidechain-bridge/relayer |

## Observation Scope

| Field | Value |
| --- | --- |
| Source | demo:anchor:preflight read-only Ergo extension scan |
| Network | testnet |
| Node endpoint | http://213.239.193.208:9052/ |
| Extension key | 0x0401 |
| Expected bridgeEventRoot | 701fbd1ae0ca10d0687281f2b5a136e4f784dd96a87814f44a092b0c4eb6ffc9 |
| Min height | 434649 |
| Max height | 435368 |
| Heights scanned | 720 |
| Extension reads succeeded | 720 |
| Extension reads failed | 0 |

## Anchor Observation

| Field | Value |
| --- | --- |
| 0x0401 bridgeEventRoot observed | no |
| Blocker | no matching 0x0401 bridgeEventRoot observed in readable extension observations |

## Read Failures

| Height | Detail |
| --- | --- |
| none | none |

## Boundary

| Boundary | Value |
| --- | --- |
| 0x0401 extension observation checked | yes |
| Runtime database opened | no |
| Deployment state opened | no |
| Secret or environment file read | no |
| Signing key or wallet material read | no |
| Transaction broadcast, submit, deploy, or state mutation performed | no |
| Burn inclusion proof completed | no |
| SPV relay or tracker evidence completed | no |
| On-chain proof acceptance evidence completed | no |
| Gate 5 closure allowed | no |
| Production-ready claim allowed | no |
| Mainnet deployment claim allowed | no |
| Testnet production-candidate claim allowed | no |
