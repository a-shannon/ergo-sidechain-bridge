# Phase 010a Committee Guard Evaluation Report

## Command Result

| Field | Value |
|---|---|
| Command | node .\node_modules\tsx\dist\cli.mjs src\scripts\spikes\spike010a-committee-guard-eval.ts --out <report.md> |
| Result | PASS |
| Exit code | 0 |
| Node endpoint | http://127.0.0.1:9052 |
| Reason | Committee guard evaluation completed on testnet height 355287. |

## Completed Checks

- SCS 2-of-3 committee quorum accepted, member-loss quorum accepted, single signer rejected, old single signer rejected after rotation, and non-committee signer rejected
- DUP 2-of-3 committee quorum accepted, member-loss quorum accepted, single signer rejected, old single signer rejected after rotation, and non-committee signer rejected
- Aggregate DUP 2-of-3 committee quorum accepted, member-loss quorum accepted, single signer rejected, old single signer rejected after rotation, and non-committee signer rejected
- MCL 2-of-3 committee quorum accepted, member-loss quorum accepted, single signer rejected, old single signer rejected after rotation, and non-committee signer rejected

## Public Signer Identifiers

| Role | Public key/hash identifier |
|---|---|
| New committee member 1 | 039afa1f00610cd4789e2fb86f43d0b3738456a2bf5b8d5e353d645b8f86997148 |
| New committee member 2 | 020f770d2aaabebde1b605c50e316411ae2c0df8a688b0f1a53d67f07ce4130e1f |
| New committee member 3 | 02a1f16e9759100e893f8594f8ed895fed584b4dcbb7569b42fa678f0fa5276881 |
| Old single signer | 02759c8f961953ef1c294198b7d6edee2c99b71b7c6a028b109558b513ca9df290 |
| Non-committee signer | 03ea41cba462303dc55c9e337558755799d33cfafc7a682e992e9385af6d97fb57 |

## Boundary

| Boundary | Value |
|---|---|
| ErgoScript contracts compiled | yes |
| Committee guard evaluated | yes |
| Committee threshold signer quorum evaluated | yes |
| Member-loss tolerance evaluated | yes |
| Below-threshold rejection evaluated | yes |
| Old single signer rejection evaluated | yes |
| Non-committee rejection evaluated | yes |
| Wrong-signer rejection evaluated | yes |
| ERGO_API_KEY read | no |
| Private key material serialized | no |
| Node wallet used | no |
| Broadcast, submit, deploy, or state mutation performed | no |

This is command-output evidence for the Phase 010a guard evaluation only. It is not release authorization, key-rotation completion, public-claim approval, deployment approval, or transaction broadcast approval.
