# Completed Gate 5 Reorg-Handling Component Evidence - 2026-06-29 - 5d075bd9

This artifact records local prerequisite evidence for the Gate 5 Required
Components row "Reorg handling". It binds already completed negative-test
artifacts into the component row. It does not close Gate 5, authorize
settlement, authorize broadcast, or support production-ready, mainnet, or
testnet production-candidate claims.

No wallet recovery material, signing credential material, deployment state,
private runtime database state, or live transaction evidence was read or used.

## Evidence Classification

| Field | Value |
|---|---|
| Evidence name | Gate 5 reorg-handling component evidence |
| Git commit | 5d075bd9 |
| Release level | institutional reference prerequisite only |
| Environment | local offline |
| Broadcast mode | disabled |
| Trust path | trustless burn proof path, local verifier and anchor validation only |
| Reviewer | A. Shannon |
| Date | 2026-06-29 |

## Source Evidence

| Source | Evidence |
|---|---|
| Reorged sidechain block rejection | artifact://trustless-burn/artifacts/completed-gate5-negative-reorged-sidechain-block-2026-06-26-247a84b1.md |
| Unfinalized sidechain block rejection | artifact://trustless-burn/artifacts/completed-local-sidechain-finality-rejection-2026-06-25-9dbeff16.md |
| Stale SPV tracker digest rejection | artifact://trustless-burn/artifacts/completed-gate5-negative-stale-spv-tracker-digest-2026-06-26-174d4cfb.md |
| Wrong Ergo anchor height rejection | artifact://trustless-burn/artifacts/completed-gate5-negative-wrong-ergo-anchor-height-2026-06-26-247a84b1.md |

## Component Binding

| Field | Value |
|---|---|
| Required component row | Reorg handling |
| Required property | Reorged sidechain commitments cannot release ERG |
| Local reorged-block result | rejected; observed verifier error `burn receipt block hash does not match canonical sidechain block` |
| Local unfinalized-block result | rejected; observed verifier error `burn receipt has 2 sidechain confirmation(s), requires 10` |
| Local stale-root result | rejected; observed proof-core error `burn inclusion proof must resolve to bridgeEventRoot` |
| Local wrong-anchor-height result | rejected; observed validation result invalid because the expected 0x0401 bridgeEventRoot was absent at the persisted Ergo anchor height |
| Component status supported | linked local prerequisite |

## Boundary

| Boundary | Value |
|---|---|
| Local verifier and anchor-validation evidence only | true |
| Gate 5 closure | false |
| Settlement readiness | false |
| Broadcast authorization | false |
| Production claim support | false |
| Testnet production-candidate claim support | false |
| On-chain Ergo proof acceptance proven | false |
| Live SPV relay operation proven | false |
