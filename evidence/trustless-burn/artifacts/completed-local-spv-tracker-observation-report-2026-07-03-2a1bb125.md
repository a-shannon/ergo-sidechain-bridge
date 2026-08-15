# Gate 5 SPV Tracker Observation Report

This report records a read-only SPV tracker key/value observation from sanitized public JSON.
It is prerequisite evidence only. It does not prove full burn inclusion, on-chain proof
acceptance, Gate 5 closure, settlement readiness, broadcast authorization, or
production-ready, mainnet, or testnet production-candidate claims.

## Command Result

| Field | Value |
| --- | --- |
| Result | LINKED |
| Reason | SPV tracker history contains expected sidechain commitment entry |
| Observed at | 2026-07-03T11:49:31.329Z |
| Command | npm run trustless:spv-tracker-observe -- --observation-json ../evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-input-2026-07-03-2a1bb125.json --observed-at 2026-07-03T11:49:31.329Z --out ../evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-03-2a1bb125.md --json-out ../evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-03-2a1bb125.json |
| Working directory | ergo-sidechain-bridge/relayer |

## Observation Scope

| Field | Value |
| --- | --- |
| Source | local public Gate 5 SPV tracker observation input |
| Network | local offline |
| Node endpoint | <not recorded> |
| History entries | 1 |
| Tracker box | 4444444444444444444444444444444444444444444444444444444444444444 |
| Tracker NFT | 5555555555555555555555555555555555555555555555555555555555555555 |

## Sidechain Finality

| Field | Value |
| --- | --- |
| Finality rule | local offline rule: observedSidechainHeight - sidechainBlockHeight >= requiredConfirmations |
| Sidechain block height | 12345 |
| Observed sidechain height | 12357 |
| Required confirmations | 12 |
| Observed confirmations | 12 |
| Finality status | FINALIZED |

## Tracker Observation

| Field | Value |
| --- | --- |
| SPV tracker key/value linked | yes |
| Expected tracker key | 46bfd6977e3c170fa567da9fd95d79d3e0232c3da99a4dc4194910328789dbdb |
| Expected tracker value | 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb000f1206 |
| Observed tracker value | 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb000f1206 |
| Tracker digest | abc64a32910eb985c7ca95eefc6088c5ae841b74a892beffc9e190db42bae0e301 |

## Boundary

| Boundary | Value |
| --- | --- |
| SPV tracker key/value proof checked | yes |
| Runtime database opened | no |
| Deployment state opened | no |
| Secret or environment file read | no |
| Signing key or wallet material read | no |
| Node, RPC, or explorer request performed | no |
| Transaction broadcast, submit, deploy, or state mutation performed | no |
| Burn inclusion proof completed | no |
| Sidechain finality binding checked | yes |
| On-chain proof acceptance evidence completed | no |
| Gate 5 closure allowed | no |
| Production-ready claim allowed | no |
| Mainnet deployment claim allowed | no |
| Testnet production-candidate claim allowed | no |
