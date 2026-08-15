# Completed Local Proof-Vector Validation Evidence - 2026-06-26 - fb542578

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 local proof-vector negative-case boundary evidence |
| Git commit | fb542578 |
| Release level | institutional reference prerequisite only |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, local proof-core only |
| Reviewer | A. Shannon |
| Date | 2026-06-26 |

## Command Evidence

| Command | Status | Evidence target | Notes |
|---|---|---|---|
| `npm run trustless:proof-vector:validate -- test-vectors/trustless-burn-proof-v1-multi-leaf.json --json-out ../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-fb542578.json` | PASS / exit code 0 | `artifact://trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-fb542578.json` | Read-only local proof-core validation for the multi-leaf proof vector, including structured fail-closed negative-case observations. |

Observed validator output:

```text
test-vectors/trustless-burn-proof-v1-multi-leaf.json: Trustless burn proof vector PASS: leafCount=2, proofNodes=1, gate5Claim=false, contractsChanged=false; local proof-core evidence only, not Gate 5 closure, settlement readiness, broadcast authorization, production claim support, or testnet production-candidate claim support.
- bridgeEventRootHex: 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb
- leafHashHex: 31c300fa370b8c9ff01a722eea2f590130fc2c5008249d861234a30d2df4ea6f
- leafCount: 2
- proofNodes: 1
- trustless burn proof-vector report written: ../evidence/trustless-burn/artifacts/completed-local-proof-vector-report-2026-06-26-fb542578.json
```

## Boundary Decision

| Boundary | Value |
|---|---|
| Read-only evidence | true |
| Local proof-core only | true |
| Gate 5 closure | false |
| Settlement readiness | false |
| Broadcast authorization | false |
| Production claim support | false |
| Testnet production-candidate claim support | false |
| Top-level errors | [] |

## Observed Proof-Core Values

| Field | Value |
|---|---|
| bridgeEventRootHex | 1db43125ab9e2f51bc27b988beb50d51f28e4801750b27e0cc7d80c840156acb |
| leafHashHex | 31c300fa370b8c9ff01a722eea2f590130fc2c5008249d861234a30d2df4ea6f |
| leafCount | 2 |
| proofNodes | 1 |

## Observed Local Negative Cases

| negativeCase | Status | Observed proof-core rejection |
|---|---|---|
| wrong-sidechain-id | REJECTED | burnId must equal derived sidechain event identity |
| wrong-burn-id | REJECTED | burnId must equal derived sidechain event identity |
| wrong-event-index | REJECTED | burnId must equal derived sidechain event identity |
| wrong-recipient | REJECTED | settlement recipient must equal proved recipientErgoTreeHash |
| wrong-amount | REJECTED | settlement amount must equal proved amountNanoErg |
| wrong-duplicate-prevention-key | REJECTED | duplicatePreventionKey must equal burnId |
| wrong-bridge-event-root | REJECTED | burn inclusion proof must resolve to bridgeEventRoot |
| malformed-inclusion-path | REJECTED | burn inclusion proof must resolve to bridgeEventRoot |

## Release Gate Treatment

This evidence records a completed current-head local proof-vector validation
report on the bridge readiness branch. It can serve as the proof-vector report
binding inside a future completed Trustless Burn Verification Evidence package
and gives that package exact local negative-case names plus observed proof-core
rejection strings.

It is not a completed Gate 5 evidence package. Gate 5 remains open until the
missing sidechain finality, SPV relay or tracker, on-chain proof acceptance, DUP
binding, reorg handling, independent review, publication-update, and
`npm run trustless:validate` evidence rows are completed.

No production-ready claim or testnet production-candidate claim is supported by
this local proof-vector evidence.
