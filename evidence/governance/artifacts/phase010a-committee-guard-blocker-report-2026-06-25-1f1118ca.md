# Phase 010a Committee Guard Evaluation Report

## Command Result

| Field | Value |
|---|---|
| Command | node .\node_modules\tsx\dist\cli.mjs src\scripts\spikes\spike010a-committee-guard-eval.ts --out <report.md> |
| Result | BLOCKED |
| Exit code | 1 |
| Node endpoint | http://127.0.0.1:9052 |
| Reason | Local Ergo node was unavailable before contract compilation and header-context construction completed. |
| Observed error | fetch failed; connect ECONNREFUSED 127.0.0.1:9052 |

## Completed Checks

- None completed before the blocker.

## Boundary

| Boundary | Value |
|---|---|
| ErgoScript contracts compiled | no |
| Committee guard evaluated | no |
| Wrong-signer rejection evaluated | no |
| Private key material serialized | no |
| Node wallet used | no |
| Broadcast, submit, deploy, or state mutation performed | no |

This is not completed Gate 6 command evidence. It records the exact blocker that prevented the Phase 010a guard evaluation from completing.
