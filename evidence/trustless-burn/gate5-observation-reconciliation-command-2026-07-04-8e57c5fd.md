# Gate 5 Observation Reconciliation Report

This report reconciles read-only anchor and SPV tracker observation reports for one Gate 5 bridge event root.
It is prerequisite evidence only. It does not prove full burn inclusion, on-chain proof acceptance,
Gate 5 closure, settlement readiness, broadcast authorization, or production-ready, mainnet,
or testnet production-candidate claims.

## Command Result

| Field | Value |
| --- | --- |
| Result | BLOCKED |
| Reason | anchor report status must be LINKED; observed BLOCKED |
| Observed at | 2026-07-04T09:42:27.544Z |
| Command | npm run trustless:observation-reconcile -- --anchor-report-json ../evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-04-8e57c5fd.json --spv-tracker-report-json ../evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-02-634b78eb.json --observed-at 2026-07-04T09:42:27.544Z --out ../evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-04-8e57c5fd.md --json-out ../evidence/trustless-burn/gate5-observation-reconciliation-command-2026-07-04-8e57c5fd.json |
| Working directory | ergo-sidechain-bridge/relayer |

## Reconciled Inputs

| Field | Value |
| --- | --- |
| Anchor observation report | ../evidence/trustless-burn/anchor-observation-root-bound-testnet-2026-07-04-8e57c5fd.json |
| SPV tracker observation report | ../evidence/trustless-burn/artifacts/completed-local-spv-tracker-observation-report-2026-07-02-634b78eb.json |
| Anchor status | BLOCKED |
| SPV tracker status | LINKED |
| Anchor bridgeEventRoot | 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb |
| SPV bridgeEventRoot | 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb |
| Reconciled bridgeEventRoot | <blocked> |
| Anchor Ergo height | <not linked> |
| SPV Ergo height | 987654 |
| Reconciled Ergo height | <blocked> |

## Checks

| Check | Result | Detail |
| --- | --- | --- |
| Target separation | PASS | anchor and SPV tracker observation reports use distinct evidence targets |
| Anchor observation report command | PASS | anchor report was produced by trustless:anchor-observe |
| SPV tracker observation report command | PASS | SPV tracker report was produced by trustless:spv-tracker-observe |
| Anchor observation linked | BLOCKED | anchor report status must be LINKED; observed BLOCKED |
| SPV tracker observation linked | PASS | SPV tracker report linked the expected key/value proof |
| Bridge event root identity | BLOCKED | anchor bridgeEventRoot, linkedAnchor.bridgeEventRootHex, SPV expectedEntry.bridgeEventRootHex, and SPV decodedValue.bridgeEventRootHex must all be present and equal |
| Ergo anchor height identity | BLOCKED | anchor linkedAnchor.ergoAnchorHeight, SPV expectedEntry.ergoAnchorHeight, and SPV decodedValue.ergoAnchorHeight must all be present and equal |
| Anchor observation boundary | PASS | anchor report preserves read-only public observation boundaries |
| SPV tracker observation boundary | PASS | SPV tracker report preserves read-only public observation boundaries |

## Boundary

| Boundary | Value |
| --- | --- |
| Planning or prerequisite output only | yes |
| Anchor observation JSON reused | yes |
| SPV tracker observation JSON reused | yes |
| Node, RPC, or explorer request performed | no |
| Runtime database opened | no |
| Deployment state opened | no |
| Secret or environment file read | no |
| Signing key or wallet material read | no |
| Transaction broadcast, submit, deploy, or state mutation performed | no |
| Gate 5 closure allowed | no |
| Settlement readiness allowed | no |
| Production-ready claim allowed | no |
| Mainnet deployment claim allowed | no |
| Testnet production-candidate claim allowed | no |
